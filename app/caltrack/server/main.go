// caltrack — a tiny, mobile-first calorie & exercise tracker backend.
//
// Serves the static SPA (index.html / app.css / app.js) plus a small JSON API
// backed by SQLite (pure-Go modernc driver, so the binary builds with
// CGO_ENABLED=0). Passwords are bcrypt-hashed. Sessions are random opaque
// tokens stored server-side and handed to the browser as an httpOnly cookie.
//
// Env:
//
//	CALTRACK_ADDR    listen address           (default 127.0.0.1:8003)
//	CALTRACK_DB      sqlite file path         (default ./caltrack.db)
//	CALTRACK_STATIC  static SPA directory     (default ./static)
package main

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
	_ "modernc.org/sqlite"
)

var db *sql.DB

type ctxKey string

const userKey ctxKey = "uid"

func main() {
	addr := env("CALTRACK_ADDR", "127.0.0.1:8003")
	dbPath := env("CALTRACK_DB", "./caltrack.db")
	staticDir := env("CALTRACK_STATIC", "./static")

	var err error
	dsn := "file:" + dbPath + "?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(on)"
	db, err = sql.Open("sqlite", dsn)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	db.SetMaxOpenConns(1) // sqlite: serialize writers, avoids "database is locked"
	if err := migrate(); err != nil {
		log.Fatalf("migrate: %v", err)
	}
	seedGlobals()

	mux := http.NewServeMux()

	// --- API ---
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]any{"ok": true, "mode": "server"})
	})
	mux.HandleFunc("POST /api/register", hRegister)
	mux.HandleFunc("POST /api/login", hLogin)
	mux.HandleFunc("POST /api/logout", hLogout)
	mux.HandleFunc("GET /api/me", auth(hMe))
	mux.HandleFunc("PUT /api/settings", auth(hSettings))
	mux.HandleFunc("GET /api/entries", auth(hListEntries))
	mux.HandleFunc("POST /api/entries", auth(hAddEntry))
	mux.HandleFunc("DELETE /api/entries/{id}", auth(hDeleteEntry))
	mux.HandleFunc("GET /api/suggestions", auth(hSuggestions))
	mux.HandleFunc("DELETE /api/suggestions/{id}", auth(hDeleteSuggestion))

	// --- static SPA (fallback to index.html for the root) ---
	fs := http.FileServer(http.Dir(staticDir))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}
		// serve real files; otherwise hand back the SPA shell
		if r.URL.Path != "/" {
			if _, err := os.Stat(filepath.Join(staticDir, filepath.Clean(r.URL.Path))); err == nil {
				fs.ServeHTTP(w, r)
				return
			}
		}
		http.ServeFile(w, r, filepath.Join(staticDir, "index.html"))
	})

	log.Printf("caltrack listening on %s (db=%s static=%s)", addr, dbPath, staticDir)
	srv := &http.Server{
		Addr:              addr,
		Handler:           logReq(mux),
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Fatal(srv.ListenAndServe())
}

// ---------------------------------------------------------------- schema -----

func migrate() error {
	_, err := db.Exec(`
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  username        TEXT UNIQUE NOT NULL COLLATE NOCASE,
  pass_hash       TEXT NOT NULL,
  daily_burn      INTEGER NOT NULL DEFAULT 0,
  target_loss_kg  REAL    NOT NULL DEFAULT 0,
  start_weight_kg REAL    NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS entries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  kind       TEXT NOT NULL,            -- 'food' | 'exercise'
  label      TEXT NOT NULL,
  calories   INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entries_user_time ON entries(user_id, created_at);

-- A suggestion is a remembered label+calories. user_id 0 == global (everyone).
CREATE TABLE IF NOT EXISTS suggestions (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   INTEGER NOT NULL,
  kind      TEXT NOT NULL,
  label     TEXT NOT NULL,
  calories  INTEGER NOT NULL,
  use_count INTEGER NOT NULL DEFAULT 1,
  hour_sum  INTEGER NOT NULL DEFAULT 0,  -- sum of hour-of-day, for avg time matching
  last_used INTEGER NOT NULL,
  UNIQUE(user_id, kind, label)
);

-- Lets a user hide a *global* suggestion without affecting anyone else.
CREATE TABLE IF NOT EXISTS hidden (
  user_id INTEGER NOT NULL,
  sugg_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, sugg_id)
);
`)
	return err
}

func seedGlobals() {
	var n int
	db.QueryRow(`SELECT COUNT(*) FROM suggestions WHERE user_id=0`).Scan(&n)
	if n > 0 {
		return
	}
	type s struct {
		kind  string
		label string
		cal   int
		hour  int
	}
	seed := []s{
		{"food", "Banana", 105, 8}, {"food", "Apple", 95, 10}, {"food", "Coffee with milk", 40, 8},
		{"food", "Porridge / oats", 220, 8}, {"food", "Eggs (2)", 140, 8}, {"food", "Toast (2 slices)", 160, 8},
		{"food", "Chicken breast", 250, 13}, {"food", "Salad", 150, 13}, {"food", "Sandwich", 350, 13},
		{"food", "Rice (1 cup)", 200, 19}, {"food", "Pasta bowl", 450, 19}, {"food", "Pizza slice", 285, 19},
		{"food", "Protein shake", 180, 16}, {"food", "Chocolate bar", 230, 15}, {"food", "Beer (pint)", 215, 21},
		{"food", "Glass of wine", 125, 21}, {"food", "Yoghurt", 120, 8}, {"food", "Nuts (handful)", 180, 16},
		{"exercise", "Walk (30 min)", 150, 12}, {"exercise", "Run (30 min)", 320, 7}, {"exercise", "Cycling (30 min)", 280, 17},
		{"exercise", "Gym session", 400, 18}, {"exercise", "Swimming (30 min)", 300, 18}, {"exercise", "Yoga (30 min)", 120, 7},
		{"exercise", "HIIT (20 min)", 250, 18}, {"exercise", "Weights (45 min)", 220, 18}, {"exercise", "Football", 500, 18},
	}
	now := time.Now().Unix()
	for _, e := range seed {
		db.Exec(`INSERT OR IGNORE INTO suggestions(user_id,kind,label,calories,use_count,hour_sum,last_used)
		         VALUES(0,?,?,?,1,?,?)`, e.kind, e.label, e.cal, e.hour, now)
	}
	log.Printf("seeded %d global suggestions", len(seed))
}

// -------------------------------------------------------------- handlers -----

type credentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func hRegister(w http.ResponseWriter, r *http.Request) {
	var c credentials
	if !readJSON(w, r, &c) {
		return
	}
	c.Username = strings.TrimSpace(c.Username)
	if len(c.Username) < 2 || len(c.Password) < 4 {
		writeErr(w, 400, "username (2+) and password (4+) required")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(c.Password), 12)
	if err != nil {
		writeErr(w, 500, "hash error")
		return
	}
	res, err := db.Exec(`INSERT INTO users(username,pass_hash,created_at) VALUES(?,?,?)`,
		c.Username, string(hash), time.Now().Unix())
	if err != nil {
		writeErr(w, 409, "that username is already taken")
		return
	}
	uid, _ := res.LastInsertId()
	issueSession(w, r, uid)
	writeJSON(w, 200, mePayload(uid))
}

func hLogin(w http.ResponseWriter, r *http.Request) {
	var c credentials
	if !readJSON(w, r, &c) {
		return
	}
	var uid int64
	var hash string
	err := db.QueryRow(`SELECT id,pass_hash FROM users WHERE username=?`,
		strings.TrimSpace(c.Username)).Scan(&uid, &hash)
	if err != nil || bcrypt.CompareHashAndPassword([]byte(hash), []byte(c.Password)) != nil {
		writeErr(w, 401, "wrong username or password")
		return
	}
	issueSession(w, r, uid)
	writeJSON(w, 200, mePayload(uid))
}

func hLogout(w http.ResponseWriter, r *http.Request) {
	if ck, err := r.Cookie("ct_session"); err == nil {
		db.Exec(`DELETE FROM sessions WHERE token=?`, ck.Value)
	}
	clearCookie(w, r)
	writeJSON(w, 200, map[string]any{"ok": true})
}

func hMe(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, mePayload(uid(r)))
}

func hSettings(w http.ResponseWriter, r *http.Request) {
	var s struct {
		DailyBurn     *int     `json:"daily_burn"`
		TargetLossKg  *float64 `json:"target_loss_kg"`
		StartWeightKg *float64 `json:"start_weight_kg"`
	}
	if !readJSON(w, r, &s) {
		return
	}
	if s.DailyBurn != nil {
		db.Exec(`UPDATE users SET daily_burn=? WHERE id=?`, clampInt(*s.DailyBurn, 0, 20000), uid(r))
	}
	if s.TargetLossKg != nil {
		db.Exec(`UPDATE users SET target_loss_kg=? WHERE id=?`, *s.TargetLossKg, uid(r))
	}
	if s.StartWeightKg != nil {
		db.Exec(`UPDATE users SET start_weight_kg=? WHERE id=?`, *s.StartWeightKg, uid(r))
	}
	writeJSON(w, 200, mePayload(uid(r)))
}

type entry struct {
	ID        int64  `json:"id"`
	Kind      string `json:"kind"`
	Label     string `json:"label"`
	Calories  int    `json:"calories"`
	CreatedAt int64  `json:"created_at"`
}

func hListEntries(w http.ResponseWriter, r *http.Request) {
	from := atoi(r.URL.Query().Get("from"), 0)
	to := atoi(r.URL.Query().Get("to"), time.Now().Unix()+86400)
	rows, err := db.Query(`SELECT id,kind,label,calories,created_at FROM entries
	    WHERE user_id=? AND created_at>=? AND created_at<? ORDER BY created_at DESC`,
		uid(r), from, to)
	if err != nil {
		writeErr(w, 500, "query")
		return
	}
	defer rows.Close()
	out := []entry{}
	for rows.Next() {
		var e entry
		rows.Scan(&e.ID, &e.Kind, &e.Label, &e.Calories, &e.CreatedAt)
		out = append(out, e)
	}
	writeJSON(w, 200, out)
}

func hAddEntry(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Kind     string `json:"kind"`
		Label    string `json:"label"`
		Calories int    `json:"calories"`
		When     int64  `json:"when"` // optional unix seconds
	}
	if !readJSON(w, r, &in) {
		return
	}
	in.Label = strings.TrimSpace(in.Label)
	if in.Kind != "food" && in.Kind != "exercise" {
		writeErr(w, 400, "kind must be food or exercise")
		return
	}
	if in.Label == "" || in.Calories <= 0 {
		writeErr(w, 400, "label and a positive calorie amount are required")
		return
	}
	when := in.When
	if when == 0 {
		when = time.Now().Unix()
	}
	res, err := db.Exec(`INSERT INTO entries(user_id,kind,label,calories,created_at) VALUES(?,?,?,?,?)`,
		uid(r), in.Kind, in.Label, in.Calories, when)
	if err != nil {
		writeErr(w, 500, "insert")
		return
	}
	// Remember it as a suggestion (upsert): bump count, track time-of-day, keep latest calories.
	hour := time.Unix(when, 0).Hour()
	db.Exec(`INSERT INTO suggestions(user_id,kind,label,calories,use_count,hour_sum,last_used)
	         VALUES(?,?,?,?,1,?,?)
	         ON CONFLICT(user_id,kind,label) DO UPDATE SET
	           use_count=use_count+1, hour_sum=hour_sum+?, calories=?, last_used=?`,
		uid(r), in.Kind, in.Label, in.Calories, hour, when, hour, in.Calories, when)
	id, _ := res.LastInsertId()
	writeJSON(w, 200, entry{ID: id, Kind: in.Kind, Label: in.Label, Calories: in.Calories, CreatedAt: when})
}

func hDeleteEntry(w http.ResponseWriter, r *http.Request) {
	id := atoi(r.PathValue("id"), 0)
	db.Exec(`DELETE FROM entries WHERE id=? AND user_id=?`, id, uid(r))
	writeJSON(w, 200, map[string]any{"ok": true})
}

type suggestion struct {
	ID       int64   `json:"id"`
	Kind     string  `json:"kind"`
	Label    string  `json:"label"`
	Calories int     `json:"calories"`
	Count    int     `json:"count"`
	AvgHour  float64 `json:"avg_hour"`
	Global   bool    `json:"global"`
}

func hSuggestions(w http.ResponseWriter, r *http.Request) {
	kind := r.URL.Query().Get("kind")
	rows, err := db.Query(`
	    SELECT id,kind,label,calories,use_count,hour_sum,user_id FROM suggestions s
	    WHERE (user_id=? OR user_id=0)
	      AND (?='' OR kind=?)
	      AND id NOT IN (SELECT sugg_id FROM hidden WHERE user_id=?)
	    ORDER BY use_count DESC, last_used DESC`, uid(r), kind, kind, uid(r))
	if err != nil {
		writeErr(w, 500, "query")
		return
	}
	defer rows.Close()
	// De-dup: a user's own override of a label wins over the global one.
	seen := map[string]bool{}
	out := []suggestion{}
	for rows.Next() {
		var s suggestion
		var hourSum, ownerID int64
		var cnt int
		rows.Scan(&s.ID, &s.Kind, &s.Label, &s.Calories, &cnt, &hourSum, &ownerID)
		key := s.Kind + "|" + strings.ToLower(s.Label)
		if seen[key] {
			continue
		}
		seen[key] = true
		s.Count = cnt
		s.Global = ownerID == 0
		if cnt > 0 {
			s.AvgHour = float64(hourSum) / float64(cnt)
		}
		out = append(out, s)
	}
	writeJSON(w, 200, out)
}

func hDeleteSuggestion(w http.ResponseWriter, r *http.Request) {
	id := atoi(r.PathValue("id"), 0)
	var ownerID int64 = -1
	db.QueryRow(`SELECT user_id FROM suggestions WHERE id=?`, id).Scan(&ownerID)
	switch ownerID {
	case int64(uid(r)): // user's own → delete outright
		db.Exec(`DELETE FROM suggestions WHERE id=? AND user_id=?`, id, uid(r))
	case 0: // global → just hide it for this user
		db.Exec(`INSERT OR IGNORE INTO hidden(user_id,sugg_id) VALUES(?,?)`, uid(r), id)
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

// --------------------------------------------------------------- helpers -----

func mePayload(uid int64) map[string]any {
	var u struct {
		Username                       string
		DailyBurn                      int
		TargetLossKg, StartWeightKg    float64
	}
	db.QueryRow(`SELECT username,daily_burn,target_loss_kg,start_weight_kg FROM users WHERE id=?`, uid).
		Scan(&u.Username, &u.DailyBurn, &u.TargetLossKg, &u.StartWeightKg)
	return map[string]any{
		"username":        u.Username,
		"daily_burn":      u.DailyBurn,
		"target_loss_kg":  u.TargetLossKg,
		"start_weight_kg": u.StartWeightKg,
		"configured":      u.DailyBurn > 0,
	}
}

func issueSession(w http.ResponseWriter, r *http.Request, userID int64) {
	tok := randToken()
	db.Exec(`INSERT INTO sessions(token,user_id,created_at) VALUES(?,?,?)`, tok, userID, time.Now().Unix())
	http.SetCookie(w, &http.Cookie{
		Name:     "ct_session",
		Value:    tok,
		Path:     "/",
		HttpOnly: true,
		Secure:   isHTTPS(r),
		SameSite: http.SameSiteLaxMode,
		MaxAge:   60 * 60 * 24 * 365,
	})
}

func clearCookie(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{Name: "ct_session", Value: "", Path: "/", MaxAge: -1,
		HttpOnly: true, Secure: isHTTPS(r), SameSite: http.SameSiteLaxMode})
}

func auth(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ck, err := r.Cookie("ct_session")
		if err != nil {
			writeErr(w, 401, "not signed in")
			return
		}
		var userID int64
		if err := db.QueryRow(`SELECT user_id FROM sessions WHERE token=?`, ck.Value).Scan(&userID); err != nil {
			writeErr(w, 401, "session expired")
			return
		}
		r = r.WithContext(context.WithValue(r.Context(), userKey, userID))
		h(w, r)
	}
}

func uid(r *http.Request) int64 { v, _ := r.Context().Value(userKey).(int64); return v }

func isHTTPS(r *http.Request) bool {
	return r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}

func randToken() string {
	b := make([]byte, 24)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func readJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(v); err != nil {
		writeErr(w, 400, "bad request body")
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]any{"error": msg})
}

func logReq(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		next.ServeHTTP(w, r)
	})
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func atoi(s string, def int64) int64 {
	if n, err := strconv.ParseInt(s, 10, 64); err == nil {
		return n
	}
	return def
}

func clampInt(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}
