// filestore — files.br8t.com, the shared project file store backing Addon Studio.
//
// Three roles:
//
//	admin  (bootstrapped, one account)  — creates leads, sets quotas, sees everything
//	lead   (created by admin)           — creates projects and users, grants project access
//	user   (created by a lead)          — reads/writes files in the projects they're granted
//
// Storage lives on disk under FILESTORE_DATA/files/p<id>/, indexed in SQLite so
// listings and quota sums are a query rather than a directory walk.
//
// Pure-Go deps only (modernc.org/sqlite, x/crypto/bcrypt); builds CGO_ENABLED=0.
//
// Env:
//
//	FILESTORE_ADDR            listen address        (default 127.0.0.1:8005)
//	FILESTORE_DATA            data directory        (default ./data)
//	FILESTORE_ADMIN_USER      bootstrap admin       (default aaron@br8t.com)
//	FILESTORE_ADMIN_PASSWORD  bootstrap password    (default: generated, logged once)
//	FILESTORE_INSECURE_COOKIE set to 1 for local http testing
package main

import (
	"embed"
	"encoding/json"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

//go:embed web
var webFS embed.FS

var secureCookies = true

func main() {
	addr := env("FILESTORE_ADDR", "127.0.0.1:8005")
	dataDir := env("FILESTORE_DATA", "./data")
	secureCookies = env("FILESTORE_INSECURE_COOKIE", "") != "1"

	filesRoot = filepath.Join(dataDir, "files")
	if err := os.MkdirAll(filesRoot, 0o755); err != nil {
		log.Fatalf("mkdir data: %v", err)
	}
	openDB(filepath.Join(dataDir, "filestore.db"))
	bootstrapAdmin()

	// Expired sessions are also checked on every request; this just keeps the
	// table from growing without bound.
	go func() {
		for {
			sweepSessions()
			time.Sleep(time.Hour)
		}
	}()

	mux := http.NewServeMux()

	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("ok"))
	})

	// --- session
	mux.HandleFunc("/api/login", handleLogin)
	mux.HandleFunc("/api/logout", handleLogout)
	mux.HandleFunc("/api/me", handleMe)
	mux.Handle("/api/password", requireUser(handlePassword))

	// --- projects
	mux.Handle("/api/projects", requireUser(handleProjects))
	mux.Handle("/api/projects/", requireUser(handleProjectSub))

	// --- users
	mux.Handle("/api/users", requireRole("admin,lead", handleUsers))
	mux.Handle("/api/users/", requireRole("admin,lead", handleUserSub))

	// --- admin
	mux.Handle("/api/admin/settings", requireRole("admin", handleSettings))
	mux.Handle("/api/admin/stats", requireRole("admin", handleStats))

	mux.HandleFunc("/", serveStatic)

	srv := &http.Server{
		Addr:    addr,
		Handler: logRequests(mux),
		// Uploads can be large and slow; the read timeout has to accommodate
		// the worst realistic case rather than a typical API call.
		ReadTimeout:       30 * time.Minute,
		WriteTimeout:      30 * time.Minute,
		ReadHeaderTimeout: 20 * time.Second,
		IdleTimeout:       2 * time.Minute,
	}
	log.Printf("filestore listening on %s (data %s)", addr, dataDir)
	log.Fatal(srv.ListenAndServe())
}

/* ------------------------------------------------------------ bootstrap */

// bootstrapAdmin makes sure exactly one admin account exists on first run.
// The password comes from the environment when set, otherwise one is generated
// and logged once — journalctl is the only place it ever appears.
func bootstrapAdmin() {
	name := env("FILESTORE_ADMIN_USER", "aaron@br8t.com")
	var n int
	db.QueryRow(`SELECT COUNT(*) FROM users WHERE role='admin'`).Scan(&n)
	if n > 0 {
		return
	}
	pw := env("FILESTORE_ADMIN_PASSWORD", "")
	generated := pw == ""
	if generated {
		pw = randPassword()
	}
	hash, err := hashPassword(pw)
	if err != nil {
		log.Fatalf("bootstrap hash: %v", err)
	}
	// must_reset is set either way: even a password you chose in the unit file
	// shouldn't stay as the live credential.
	_, err = db.Exec(`INSERT INTO users(username,email,pass_hash,role,must_reset,created_at)
	                  VALUES(?,?,?,'admin',1,?)`, name, name, hash, time.Now().Unix())
	if err != nil {
		log.Fatalf("bootstrap admin: %v", err)
	}
	log.Printf("=== bootstrapped admin %q ===", name)
	if generated {
		log.Printf("=== one-time password: %s  (you must change it at first login) ===", pw)
	} else {
		log.Printf("=== password taken from FILESTORE_ADMIN_PASSWORD; change it at first login ===")
	}
}

/* ------------------------------------------------------------- helpers */

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

func readJSON(r *http.Request, v any) error {
	defer r.Body.Close()
	return json.NewDecoder(http.MaxBytesReader(nil, r.Body, 1<<20)).Decode(v)
}

func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		if strings.HasPrefix(r.URL.Path, "/api/") {
			log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start).Round(time.Millisecond))
		}
	})
}

// pathParts splits the tail of an /api/<x>/... route into its segments.
func pathParts(r *http.Request, prefix string) []string {
	tail := strings.TrimPrefix(r.URL.Path, prefix)
	tail = strings.Trim(tail, "/")
	if tail == "" {
		return nil
	}
	return strings.Split(tail, "/")
}

func atoi64(s string) int64 {
	n, _ := strconv.ParseInt(s, 10, 64)
	return n
}

/* -------------------------------------------------------------- static */

func serveStatic(w http.ResponseWriter, r *http.Request) {
	sub, err := fs.Sub(webFS, "web")
	if err != nil {
		http.Error(w, "internal", 500)
		return
	}
	p := strings.TrimPrefix(r.URL.Path, "/")
	if p == "" {
		p = "index.html"
	}
	if _, err := fs.Stat(sub, p); err != nil {
		// Single-page app: unknown paths render the shell and let the client route.
		p = "index.html"
	}
	// The shell must never be cached — a stale one would point at old API shapes.
	if p == "index.html" {
		w.Header().Set("Cache-Control", "no-cache")
	}
	http.ServeFileFS(w, r, sub, p)
}

/* --------------------------------------------------------- session API */

func handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeErr(w, http.StatusMethodNotAllowed, "POST only")
		return
	}
	var body struct{ Username, Password string }
	if err := readJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request")
		return
	}
	body.Username = strings.TrimSpace(body.Username)

	if !loginAllowed(r) {
		writeErr(w, http.StatusTooManyRequests, "too many attempts — wait a minute and try again")
		return
	}

	u, err := userByName(body.Username)
	// Identical message and cost for "no such user" and "wrong password" so the
	// endpoint can't be used to enumerate accounts.
	if err != nil || u.Disabled {
		hashPassword(body.Password)
		writeErr(w, http.StatusUnauthorized, "incorrect username or password")
		return
	}
	var hash string
	db.QueryRow(`SELECT pass_hash FROM users WHERE id=?`, u.ID).Scan(&hash)
	if !checkPassword(hash, body.Password) {
		writeErr(w, http.StatusUnauthorized, "incorrect username or password")
		return
	}

	loginSucceeded(r)
	if err := newSession(w, u.ID); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not start a session")
		return
	}
	db.Exec(`UPDATE users SET last_login=? WHERE id=?`, time.Now().Unix(), u.ID)
	logAudit(u, 0, "login", "")
	writeJSON(w, http.StatusOK, map[string]any{"user": u})
}

func handleLogout(w http.ResponseWriter, r *http.Request) {
	clearSession(w, r)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func handleMe(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	if u == nil {
		writeJSON(w, http.StatusOK, map[string]any{"user": nil})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"user":    u,
		"limits":  map[string]int64{"defaultQuota": defaultQuota(), "maxUpload": maxUpload()},
		"version": buildVersion,
	})
}

// handlePassword changes the signed-in user's own password. It is the one
// endpoint reachable while must_reset is set.
func handlePassword(w http.ResponseWriter, r *http.Request, u *User) {
	if r.Method != http.MethodPost {
		writeErr(w, http.StatusMethodNotAllowed, "POST only")
		return
	}
	var body struct{ Current, New string }
	if err := readJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request")
		return
	}
	var hash string
	db.QueryRow(`SELECT pass_hash FROM users WHERE id=?`, u.ID).Scan(&hash)
	if !checkPassword(hash, body.Current) {
		writeErr(w, http.StatusUnauthorized, "current password is incorrect")
		return
	}
	if msg := validPassword(body.New); msg != "" {
		writeErr(w, http.StatusBadRequest, msg)
		return
	}
	if body.New == body.Current {
		writeErr(w, http.StatusBadRequest, "new password must be different")
		return
	}
	newHash, err := hashPassword(body.New)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not set password")
		return
	}
	if _, err := db.Exec(`UPDATE users SET pass_hash=?, must_reset=0 WHERE id=?`, newHash, u.ID); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not set password")
		return
	}
	// Every other device holding a cookie for the old password is signed out,
	// then this one is signed back in so the user isn't bounced to the login page.
	killSessions(u.ID)
	if err := newSession(w, u.ID); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not start a session")
		return
	}
	logAudit(u, 0, "password_change", "")
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
