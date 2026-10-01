package main

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"io"
	"mime"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unicode/utf8"
)

const (
	maxBlob       = 8 << 20
	maxThumb      = 100 << 10
	maxWorldsUser = 50
	maxNameRunes  = 48
	maxSeedLen    = 64
	worldColumns  = `w.id, u.username, u.display, w.owner_id, w.name, w.seed, w.mode, w.public, w.version, w.size, w.thumb_size, w.created_at, w.updated_at`
	worldFromJoin = ` FROM worlds w JOIN users u ON u.id = w.owner_id `
	visibleToUser = ` AND u.removed_at IS NULL AND (w.owner_id = ? OR w.public = 1) `
)

var worldIDRe = regexp.MustCompile(`^w_[0-9a-f]{16}$`)

var blobTypes = map[string]bool{"application/gzip": true, "application/json": true, "application/octet-stream": true}

type World struct {
	ID           string `json:"id"`
	Owner        string `json:"owner,omitempty"` // only ever sent to the owner: usernames are credentials
	OwnerDisplay string `json:"ownerDisplay"`
	Mine         bool   `json:"mine"`
	Name         string `json:"name"`
	Seed         string `json:"seed"`
	Mode         string `json:"mode"`
	Public       bool   `json:"public"`
	Version      int64  `json:"version"`
	Size         int64  `json:"size"`
	Thumb        bool   `json:"thumb"`
	CreatedAt    int64  `json:"createdAt"`
	UpdatedAt    int64  `json:"updatedAt"`
}

type scanner interface{ Scan(...any) error }

func scanWorld(s scanner, viewer int64) (*World, error) {
	var w World
	var owner, thumbSize int64
	var pub int
	if err := s.Scan(&w.ID, &w.Owner, &w.OwnerDisplay, &owner, &w.Name, &w.Seed, &w.Mode, &pub,
		&w.Version, &w.Size, &thumbSize, &w.CreatedAt, &w.UpdatedAt); err != nil {
		return nil, err
	}
	w.Mine = owner == viewer
	w.Public = pub == 1
	w.Thumb = thumbSize > 0
	if !w.Mine {
		w.OwnerDisplay = publicDisplay(w.Owner, w.OwnerDisplay, owner)
		w.Owner = ""
	}
	return &w, nil
}

// publicDisplay is what other players see. A display name that is just the
// username would hand out the login, so it is masked.
func publicDisplay(username, display string, id int64) string {
	norm := strings.ToLower(strings.Join(strings.Fields(display), "_"))
	if display == "" || norm == username || strings.Contains(norm, username) {
		h := sha256.Sum256([]byte(fmt.Sprintf("synthwild-player-%d", id)))
		return "Player " + strings.ToUpper(hex.EncodeToString(h[:2]))
	}
	return display
}

func worldByID(id string, viewer int64) (*World, error) {
	if !worldIDRe.MatchString(id) {
		return nil, sql.ErrNoRows
	}
	return scanWorld(db.QueryRow(`SELECT `+worldColumns+worldFromJoin+` WHERE w.id=? `+visibleToUser, id, viewer), viewer)
}

// ownedWorld writes the error response itself and returns nil when the caller
// may not modify the world. Non-owners of a public world get 403, everyone
// else 404, so private worlds don't leak their existence.
func ownedWorld(w http.ResponseWriter, r *http.Request, u *User) *World {
	wd, err := worldByID(r.PathValue("id"), u.ID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not_found", "no such world")
		return nil
	}
	if !wd.Mine {
		writeErr(w, http.StatusForbidden, "forbidden", "not your world")
		return nil
	}
	return wd
}

func newWorldID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return "w_" + hex.EncodeToString(b)
}

func cleanName(s string) (string, bool) {
	s = strings.Join(strings.Fields(s), " ")
	n := utf8.RuneCountInString(s)
	return s, n >= 1 && n <= maxNameRunes
}

func nowMs() int64 { return time.Now().UnixMilli() }

/* -------------------------------------------------------------- storage */

func diskFree() int64 {
	var st syscall.Statfs_t
	if err := syscall.Statfs(cfg.Data, &st); err != nil {
		return 1 << 62
	}
	return int64(st.Bavail) * int64(st.Bsize)
}

// roomForTx checks the global cap and the disk floor inside the write
// transaction, so concurrent writers can't both pass a stale check.
func roomForTx(tx *sql.Tx, delta int64) bool {
	if delta <= 0 {
		return true
	}
	var n int64
	tx.QueryRow(`SELECT COALESCE(SUM(size + thumb_size), 0) FROM worlds`).Scan(&n)
	return n+delta <= cfg.GlobalCap && diskFree()-delta >= cfg.DiskFloor
}

// quickRoom is the cheap pre-check done before a body is read.
func quickRoom(delta int64) bool {
	if delta <= 0 {
		return true
	}
	var n int64
	db.QueryRow(`SELECT COALESCE(SUM(size + thumb_size), 0) FROM worlds`).Scan(&n)
	return n+delta <= cfg.GlobalCap && diskFree()-delta >= cfg.DiskFloor
}

func noRoom(w http.ResponseWriter) {
	writeErr(w, http.StatusInsufficientStorage, "quota", "the server is out of world storage")
}

// readBody reads exactly the announced length (at most limit). Bodies without
// a Content-Length are refused so nothing is buffered before the checks.
func readBody(w http.ResponseWriter, r *http.Request, limit int64) ([]byte, bool) {
	defer r.Body.Close()
	if r.ContentLength > limit {
		writeErr(w, http.StatusRequestEntityTooLarge, "too_large", "too large")
		return nil, false
	}
	if r.ContentLength < 0 {
		writeErr(w, http.StatusLengthRequired, "bad_request", "Content-Length required")
		return nil, false
	}
	b := make([]byte, r.ContentLength)
	if _, err := io.ReadFull(r.Body, b); err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", "could not read body")
		return nil, false
	}
	return b, true
}

/* ------------------------------------------------------------- handlers */

func handleListWorlds(w http.ResponseWriter, r *http.Request, u *User) {
	var rows *sql.Rows
	var err error
	switch r.URL.Query().Get("scope") {
	case "", "mine":
		rows, err = db.Query(`SELECT `+worldColumns+worldFromJoin+` WHERE w.owner_id=? ORDER BY w.updated_at DESC`, u.ID)
	case "public":
		rows, err = db.Query(`SELECT ` + worldColumns + worldFromJoin +
			` WHERE w.public=1 AND u.removed_at IS NULL ORDER BY w.updated_at DESC LIMIT 500`)
	default:
		writeErr(w, http.StatusBadRequest, "bad_request", "scope must be mine or public")
		return
	}
	if err != nil {
		writeErr(w, 500, "server", "query failed")
		return
	}
	defer rows.Close()
	out := []*World{}
	for rows.Next() {
		if wd, err := scanWorld(rows, u.ID); err == nil {
			out = append(out, wd)
		}
	}
	writeJSON(w, 200, map[string]any{"worlds": out})
}

func handleCreateWorld(w http.ResponseWriter, r *http.Request, u *User) {
	var body struct {
		Name   string `json:"name"`
		Seed   any    `json:"seed"`
		Mode   string `json:"mode"`
		Public bool   `json:"public"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	name, ok := cleanName(body.Name)
	if !ok {
		writeErr(w, http.StatusBadRequest, "bad_request", "name must be 1-48 characters")
		return
	}
	var seed string
	switch v := body.Seed.(type) {
	case string:
		seed = v
	case float64:
		seed = strconv.FormatFloat(v, 'f', -1, 64)
	case nil:
	default:
		writeErr(w, http.StatusBadRequest, "bad_request", "seed must be a string or number")
		return
	}
	if len(seed) > maxSeedLen {
		writeErr(w, http.StatusBadRequest, "bad_request", "seed too long")
		return
	}
	if body.Mode == "" {
		body.Mode = "survival"
	}
	if body.Mode != "survival" && body.Mode != "build" {
		writeErr(w, http.StatusBadRequest, "bad_request", "mode must be survival or build")
		return
	}
	id, now := newWorldID(), nowMs()
	pub := 0
	if body.Public {
		pub = 1
	}
	tx, err := db.Begin()
	if err != nil {
		writeErr(w, 500, "server", "db error")
		return
	}
	defer tx.Rollback()
	var n int
	tx.QueryRow(`SELECT COUNT(*) FROM worlds WHERE owner_id=?`, u.ID).Scan(&n)
	if n >= maxWorldsUser {
		writeErr(w, http.StatusForbidden, "quota", "world limit reached (50); delete one first")
		return
	}
	if !roomForTx(tx, 1) {
		noRoom(w)
		return
	}
	_, err = tx.Exec(`INSERT INTO worlds(id,owner_id,name,seed,mode,public,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`,
		id, u.ID, name, seed, body.Mode, pub, now, now)
	if err == nil {
		_, err = tx.Exec(`INSERT INTO world_data(world_id) VALUES(?)`, id)
	}
	if err != nil || tx.Commit() != nil {
		writeErr(w, 500, "server", "could not create world")
		return
	}
	wd, _ := worldByID(id, u.ID)
	writeJSON(w, http.StatusCreated, map[string]any{"world": wd})
}

func handleGetWorld(w http.ResponseWriter, r *http.Request, u *User) {
	wd, err := worldByID(r.PathValue("id"), u.ID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not_found", "no such world")
		return
	}
	writeJSON(w, 200, map[string]any{"world": wd})
}

func handlePatchWorld(w http.ResponseWriter, r *http.Request, u *User) {
	wd := ownedWorld(w, r, u)
	if wd == nil {
		return
	}
	var body struct {
		Name   *string `json:"name"`
		Public *bool   `json:"public"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	if body.Name != nil {
		name, ok := cleanName(*body.Name)
		if !ok {
			writeErr(w, http.StatusBadRequest, "bad_request", "name must be 1-48 characters")
			return
		}
		db.Exec(`UPDATE worlds SET name=?, updated_at=? WHERE id=?`, name, nowMs(), wd.ID)
	}
	if body.Public != nil {
		pub := 0
		if *body.Public {
			pub = 1
		}
		db.Exec(`UPDATE worlds SET public=?, updated_at=? WHERE id=?`, pub, nowMs(), wd.ID)
	}
	wd, _ = worldByID(wd.ID, u.ID)
	writeJSON(w, 200, map[string]any{"world": wd})
}

func handleDeleteWorld(w http.ResponseWriter, r *http.Request, u *User) {
	wd := ownedWorld(w, r, u)
	if wd == nil {
		return
	}
	db.Exec(`DELETE FROM worlds WHERE id=? AND owner_id=?`, wd.ID, u.ID)
	writeJSON(w, 200, map[string]any{"ok": true})
}

func handleGetBlob(w http.ResponseWriter, r *http.Request, u *User) {
	wd, err := worldByID(r.PathValue("id"), u.ID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not_found", "no such world")
		return
	}
	if !acquire(r.Context(), readSlots, 15*time.Second) {
		busy(w)
		return
	}
	defer release(readSlots)
	var blob []byte
	var typ string
	if db.QueryRowContext(r.Context(), `SELECT blob, blob_type FROM world_data WHERE world_id=?`, wd.ID).Scan(&blob, &typ) != nil || blob == nil {
		w.Header().Set("X-World-Version", strconv.FormatInt(wd.Version, 10))
		w.WriteHeader(http.StatusNoContent)
		return
	}
	w.Header().Set("Content-Type", typ)
	w.Header().Set("X-World-Version", strconv.FormatInt(wd.Version, 10))
	w.Header().Set("Content-Length", strconv.Itoa(len(blob)))
	w.Write(blob)
}

// Every check that can fail runs before a byte of the body is read, and at most
// a few bodies (one per user) are in memory at once.
func handlePutBlob(w http.ResponseWriter, r *http.Request, u *User) {
	wd := ownedWorld(w, r, u)
	if wd == nil {
		return
	}
	expect, err := strconv.ParseInt(r.URL.Query().Get("version"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", "version query parameter required")
		return
	}
	if expect != wd.Version {
		writeJSON(w, http.StatusConflict, map[string]any{"error": "the world was saved somewhere else", "code": "conflict", "world": wd})
		return
	}
	typ, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if !blobTypes[typ] {
		writeErr(w, http.StatusUnsupportedMediaType, "bad_request", "blob must be application/gzip, application/json or application/octet-stream")
		return
	}
	switch {
	case r.ContentLength > maxBlob:
		writeErr(w, http.StatusRequestEntityTooLarge, "too_large", "too large")
		return
	case r.ContentLength < 0:
		writeErr(w, http.StatusLengthRequired, "bad_request", "Content-Length required")
		return
	case r.ContentLength == 0:
		writeErr(w, http.StatusBadRequest, "bad_request", "empty blob")
		return
	}
	if !quickRoom(r.ContentLength - wd.Size) {
		noRoom(w)
		return
	}
	if !userSlot(u.ID) {
		busy(w)
		return
	}
	defer releaseUser(u.ID)
	if !acquire(r.Context(), uploadSlots, 0) {
		busy(w)
		return
	}
	defer release(uploadSlots)
	blob, ok := readBody(w, r, maxBlob)
	if !ok {
		return
	}
	tx, err := db.Begin()
	if err != nil {
		writeErr(w, 500, "server", "db error")
		return
	}
	defer tx.Rollback()
	var size int64
	tx.QueryRow(`SELECT size FROM worlds WHERE id=?`, wd.ID).Scan(&size)
	if !roomForTx(tx, int64(len(blob))-size) {
		noRoom(w)
		return
	}
	res, err := tx.Exec(`UPDATE worlds SET version=version+1, size=?, updated_at=? WHERE id=? AND owner_id=? AND version=?`,
		len(blob), nowMs(), wd.ID, u.ID, expect)
	if err != nil {
		writeErr(w, 500, "server", "db error")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		tx.Rollback()
		cur, _ := worldByID(wd.ID, u.ID)
		writeJSON(w, http.StatusConflict, map[string]any{"error": "the world was saved somewhere else", "code": "conflict", "world": cur})
		return
	}
	if _, err := tx.Exec(`UPDATE world_data SET blob=?, blob_type=? WHERE world_id=?`, blob, typ, wd.ID); err != nil || tx.Commit() != nil {
		writeErr(w, 500, "server", "could not save")
		return
	}
	wd, _ = worldByID(wd.ID, u.ID)
	writeJSON(w, 200, map[string]any{"world": wd})
}

func handleGetThumb(w http.ResponseWriter, r *http.Request, u *User) {
	wd, err := worldByID(r.PathValue("id"), u.ID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not_found", "no such world")
		return
	}
	var thumb []byte
	if db.QueryRow(`SELECT thumb FROM world_data WHERE world_id=?`, wd.ID).Scan(&thumb) != nil || len(thumb) == 0 {
		writeErr(w, http.StatusNotFound, "not_found", "no thumbnail")
		return
	}
	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Cache-Control", "private, max-age=86400")
	w.Write(thumb)
}

func handlePutThumb(w http.ResponseWriter, r *http.Request, u *User) {
	wd := ownedWorld(w, r, u)
	if wd == nil {
		return
	}
	thumb, ok := readBody(w, r, maxThumb)
	if !ok {
		return
	}
	if !bytes.HasPrefix(thumb, []byte{0xFF, 0xD8, 0xFF}) {
		writeErr(w, http.StatusUnsupportedMediaType, "bad_request", "thumbnail must be a JPEG")
		return
	}
	tx, err := db.Begin()
	if err != nil {
		writeErr(w, 500, "server", "db error")
		return
	}
	defer tx.Rollback()
	var old int64
	tx.QueryRow(`SELECT thumb_size FROM worlds WHERE id=?`, wd.ID).Scan(&old)
	if !roomForTx(tx, int64(len(thumb))-old) {
		noRoom(w)
		return
	}
	tx.Exec(`UPDATE world_data SET thumb=? WHERE world_id=?`, thumb, wd.ID)
	tx.Exec(`UPDATE worlds SET thumb_size=?, updated_at=? WHERE id=?`, len(thumb), nowMs(), wd.ID)
	if tx.Commit() != nil {
		writeErr(w, 500, "server", "could not save thumbnail")
		return
	}
	wd, _ = worldByID(wd.ID, u.ID)
	writeJSON(w, 200, map[string]any{"world": wd})
}
