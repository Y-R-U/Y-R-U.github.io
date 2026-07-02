package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// registerAPI wires up all /api/* routes on mux against the shared App.
func registerAPI(mux *http.ServeMux, app *App) {
	mux.HandleFunc("GET /api/ping", app.handlePing)

	mux.HandleFunc("GET /api/levels", app.handleListLevels)
	mux.HandleFunc("POST /api/levels", app.handleCreateLevel)
	mux.HandleFunc("GET /api/levels/{id}", app.handleGetLevel)
	mux.HandleFunc("PUT /api/levels/{id}", app.handlePutLevel)
	mux.HandleFunc("DELETE /api/levels/{id}", app.handleDeleteLevel)

	mux.HandleFunc("GET /api/levels/{id}/versions", app.handleListVersions)
	mux.HandleFunc("POST /api/levels/{id}/versions", app.handleCreateVersion)
	mux.HandleFunc("POST /api/levels/{id}/restore", app.handleRestore)

	mux.HandleFunc("GET /api/versions/{vid}", app.handleGetVersion)
	mux.HandleFunc("DELETE /api/versions/{vid}", app.handleDeleteVersion)

	mux.HandleFunc("GET /api/config/{key}", app.handleGetConfig)
	mux.HandleFunc("PUT /api/config/{key}", app.handlePutConfig)

	mux.HandleFunc("GET /api/saves/{slot}", app.handleGetSave)
	mux.HandleFunc("PUT /api/saves/{slot}", app.handlePutSave)
	mux.HandleFunc("DELETE /api/saves/{slot}", app.handleDeleteSave)

	mux.HandleFunc("POST /api/publish", app.handlePublish)

	// Catch-all for anything under /api/ that didn't match a specific route
	// above (so unknown API paths get a clean JSON 404 instead of falling
	// through to the static file handler).
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		writeJSONError(w, http.StatusNotFound, "not found")
	})
}

// ---- JSON helpers ----

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func decodeJSON(r *http.Request, v any) error {
	defer r.Body.Close()
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(v); err != nil {
		return fmt.Errorf("invalid JSON body: %w", err)
	}
	return nil
}

func isUniqueConstraintErr(err error) bool {
	return err != nil && strings.Contains(strings.ToUpper(err.Error()), "UNIQUE CONSTRAINT")
}

// parsePathInt validates a numeric path segment (vid) using the same
// id-charset rule as everywhere else, then parses it as an int64.
func parsePathInt(s string) (int64, bool) {
	if !validID(s) {
		return 0, false
	}
	n, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return 0, false
	}
	return n, true
}

// ---- ping ----

func (a *App) handlePing(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ---- levels ----

func (a *App) handleListLevels(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query("SELECT id, name, updated_at FROM levels ORDER BY name")
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	levels := []map[string]string{}
	for rows.Next() {
		var id, name, updatedAt string
		if err := rows.Scan(&id, &name, &updatedAt); err != nil {
			writeJSONError(w, http.StatusInternalServerError, err.Error())
			return
		}
		levels = append(levels, map[string]string{"id": id, "name": name, "updated_at": updatedAt})
	}
	if err := rows.Err(); err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"levels": levels})
}

func (a *App) handleCreateLevel(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ID   string          `json:"id"`
		Name string          `json:"name"`
		Data json.RawMessage `json:"data"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		writeJSONError(w, http.StatusBadRequest, "name is required")
		return
	}
	if len(body.Data) == 0 {
		writeJSONError(w, http.StatusBadRequest, "data is required")
		return
	}

	id := body.ID
	if id == "" {
		id = slugify(body.Name)
	} else if !validID(id) {
		writeJSONError(w, http.StatusBadRequest, "invalid id")
		return
	}

	_, err := a.db.Exec(
		"INSERT INTO levels (id, name, data, updated_at) VALUES (?, ?, ?, ?)",
		id, body.Name, string(body.Data), nowRFC3339(),
	)
	if err != nil {
		if isUniqueConstraintErr(err) {
			writeJSONError(w, http.StatusConflict, "level id already exists")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"id": id})
}

func (a *App) handleGetLevel(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !validID(id) {
		writeJSONError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var name, data, updatedAt string
	err := a.db.QueryRow("SELECT name, data, updated_at FROM levels WHERE id = ?", id).Scan(&name, &data, &updatedAt)
	if err == sql.ErrNoRows {
		writeJSONError(w, http.StatusNotFound, "level not found")
		return
	}
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"id": id, "name": name, "data": json.RawMessage(data), "updated_at": updatedAt,
	})
}

func (a *App) handlePutLevel(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !validID(id) {
		writeJSONError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var body struct {
		Name *string         `json:"name"`
		Data json.RawMessage `json:"data"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(body.Data) == 0 {
		writeJSONError(w, http.StatusBadRequest, "data is required")
		return
	}

	var existingName string
	err := a.db.QueryRow("SELECT name FROM levels WHERE id = ?", id).Scan(&existingName)
	exists := true
	if err == sql.ErrNoRows {
		exists = false
	} else if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	var name string
	switch {
	case body.Name != nil && strings.TrimSpace(*body.Name) != "":
		name = *body.Name
	case exists:
		name = existingName
	default:
		name = id
	}

	_, err = a.db.Exec(
		`INSERT INTO levels (id, name, data, updated_at) VALUES (?, ?, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET name = excluded.name, data = excluded.data, updated_at = excluded.updated_at`,
		id, name, string(body.Data), nowRFC3339(),
	)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *App) handleDeleteLevel(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !validID(id) {
		writeJSONError(w, http.StatusBadRequest, "invalid id")
		return
	}
	tx, err := a.db.Begin()
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if _, err := tx.Exec("DELETE FROM level_versions WHERE level_id = ?", id); err != nil {
		tx.Rollback()
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if _, err := tx.Exec("DELETE FROM levels WHERE id = ?", id); err != nil {
		tx.Rollback()
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ---- level versions ----

func (a *App) handleListVersions(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !validID(id) {
		writeJSONError(w, http.StatusBadRequest, "invalid id")
		return
	}
	rows, err := a.db.Query("SELECT vid, name, created_at FROM level_versions WHERE level_id = ? ORDER BY vid DESC", id)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	versions := []map[string]any{}
	for rows.Next() {
		var vid int64
		var name, createdAt string
		if err := rows.Scan(&vid, &name, &createdAt); err != nil {
			writeJSONError(w, http.StatusInternalServerError, err.Error())
			return
		}
		versions = append(versions, map[string]any{"vid": vid, "name": name, "created_at": createdAt})
	}
	if err := rows.Err(); err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"versions": versions})
}

func (a *App) handleCreateVersion(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !validID(id) {
		writeJSONError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		writeJSONError(w, http.StatusBadRequest, "name is required")
		return
	}

	var data string
	err := a.db.QueryRow("SELECT data FROM levels WHERE id = ?", id).Scan(&data)
	if err == sql.ErrNoRows {
		writeJSONError(w, http.StatusNotFound, "level not found")
		return
	}
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	res, err := a.db.Exec(
		"INSERT INTO level_versions (level_id, name, data, created_at) VALUES (?, ?, ?, ?)",
		id, body.Name, data, nowRFC3339(),
	)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	vid, err := res.LastInsertId()
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]int64{"vid": vid})
}

func (a *App) handleGetVersion(w http.ResponseWriter, r *http.Request) {
	vid, ok := parsePathInt(r.PathValue("vid"))
	if !ok {
		writeJSONError(w, http.StatusBadRequest, "invalid vid")
		return
	}
	var levelID, name, data, createdAt string
	err := a.db.QueryRow("SELECT level_id, name, data, created_at FROM level_versions WHERE vid = ?", vid).
		Scan(&levelID, &name, &data, &createdAt)
	if err == sql.ErrNoRows {
		writeJSONError(w, http.StatusNotFound, "version not found")
		return
	}
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"vid": vid, "level_id": levelID, "name": name, "data": json.RawMessage(data), "created_at": createdAt,
	})
}

func (a *App) handleDeleteVersion(w http.ResponseWriter, r *http.Request) {
	vid, ok := parsePathInt(r.PathValue("vid"))
	if !ok {
		writeJSONError(w, http.StatusBadRequest, "invalid vid")
		return
	}
	if _, err := a.db.Exec("DELETE FROM level_versions WHERE vid = ?", vid); err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *App) handleRestore(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !validID(id) {
		writeJSONError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var body struct {
		VID int64 `json:"vid"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	var currentData string
	err := a.db.QueryRow("SELECT data FROM levels WHERE id = ?", id).Scan(&currentData)
	if err == sql.ErrNoRows {
		writeJSONError(w, http.StatusNotFound, "level not found")
		return
	}
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	var versionLevelID, versionData string
	err = a.db.QueryRow("SELECT level_id, data FROM level_versions WHERE vid = ?", body.VID).Scan(&versionLevelID, &versionData)
	if err == sql.ErrNoRows {
		writeJSONError(w, http.StatusNotFound, "version not found")
		return
	}
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if versionLevelID != id {
		writeJSONError(w, http.StatusBadRequest, "version belongs to another level")
		return
	}

	now := nowRFC3339()
	tx, err := a.db.Begin()
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if _, err := tx.Exec(
		"INSERT INTO level_versions (level_id, name, data, created_at) VALUES (?, ?, ?, ?)",
		id, fmt.Sprintf("auto before restore %s", now), currentData, now,
	); err != nil {
		tx.Rollback()
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if _, err := tx.Exec("UPDATE levels SET data = ?, updated_at = ? WHERE id = ?", versionData, now, id); err != nil {
		tx.Rollback()
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := tx.Commit(); err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ---- config ----

func (a *App) handleGetConfig(w http.ResponseWriter, r *http.Request) {
	key := r.PathValue("key")
	if !validID(key) {
		writeJSONError(w, http.StatusBadRequest, "invalid key")
		return
	}
	var data string
	err := a.db.QueryRow("SELECT data FROM config WHERE key = ?", key).Scan(&data)
	if err == sql.ErrNoRows {
		writeJSONError(w, http.StatusNotFound, "config not found")
		return
	}
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"key": key, "data": json.RawMessage(data)})
}

func (a *App) handlePutConfig(w http.ResponseWriter, r *http.Request) {
	key := r.PathValue("key")
	if !validID(key) {
		writeJSONError(w, http.StatusBadRequest, "invalid key")
		return
	}
	var body struct {
		Data json.RawMessage `json:"data"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(body.Data) == 0 {
		writeJSONError(w, http.StatusBadRequest, "data is required")
		return
	}
	_, err := a.db.Exec(
		`INSERT INTO config (key, data, updated_at) VALUES (?, ?, ?)
		 ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
		key, string(body.Data), nowRFC3339(),
	)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ---- saves ----

func (a *App) handleGetSave(w http.ResponseWriter, r *http.Request) {
	slot := r.PathValue("slot")
	if !validID(slot) {
		writeJSONError(w, http.StatusBadRequest, "invalid slot")
		return
	}
	var data, updatedAt string
	err := a.db.QueryRow("SELECT data, updated_at FROM saves WHERE slot = ?", slot).Scan(&data, &updatedAt)
	if err == sql.ErrNoRows {
		writeJSONError(w, http.StatusNotFound, "save not found")
		return
	}
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"slot": slot, "data": json.RawMessage(data), "updated_at": updatedAt})
}

func (a *App) handlePutSave(w http.ResponseWriter, r *http.Request) {
	slot := r.PathValue("slot")
	if !validID(slot) {
		writeJSONError(w, http.StatusBadRequest, "invalid slot")
		return
	}
	var body struct {
		Data json.RawMessage `json:"data"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(body.Data) == 0 {
		writeJSONError(w, http.StatusBadRequest, "data is required")
		return
	}
	_, err := a.db.Exec(
		`INSERT INTO saves (slot, data, updated_at) VALUES (?, ?, ?)
		 ON CONFLICT(slot) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
		slot, string(body.Data), nowRFC3339(),
	)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *App) handleDeleteSave(w http.ResponseWriter, r *http.Request) {
	slot := r.PathValue("slot")
	if !validID(slot) {
		writeJSONError(w, http.StatusBadRequest, "invalid slot")
		return
	}
	if _, err := a.db.Exec("DELETE FROM saves WHERE slot = ?", slot); err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ---- publish ----

func (a *App) handlePublish(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query("SELECT id, data FROM levels")
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	levels := map[string]json.RawMessage{}
	for rows.Next() {
		var id, data string
		if err := rows.Scan(&id, &data); err != nil {
			rows.Close()
			writeJSONError(w, http.StatusInternalServerError, err.Error())
			return
		}
		levels[id] = json.RawMessage(data)
	}
	rowsErr := rows.Err()
	rows.Close()
	if rowsErr != nil {
		writeJSONError(w, http.StatusInternalServerError, rowsErr.Error())
		return
	}

	crows, err := a.db.Query("SELECT key, data FROM config")
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	config := map[string]json.RawMessage{}
	for crows.Next() {
		var key, data string
		if err := crows.Scan(&key, &data); err != nil {
			crows.Close()
			writeJSONError(w, http.StatusInternalServerError, err.Error())
			return
		}
		config[key] = json.RawMessage(data)
	}
	crowsErr := crows.Err()
	crows.Close()
	if crowsErr != nil {
		writeJSONError(w, http.StatusInternalServerError, crowsErr.Error())
		return
	}

	snapshot := map[string]any{
		"levels":       levels,
		"config":       config,
		"published_at": nowRFC3339(),
	}
	b, err := json.MarshalIndent(snapshot, "", "  ")
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	snapDir := filepath.Join(a.root, "data", "snapshot")
	if err := os.MkdirAll(snapDir, 0o755); err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	snapPath := filepath.Join(snapDir, "game.json")
	if err := os.WriteFile(snapPath, b, 0o644); err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "levels": len(levels)})
}
