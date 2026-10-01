package main

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
)

const (
	sessionCookie   = "sw_session"
	playerTTL       = 400 * 24 * time.Hour // Chrome caps cookie lifetime at 400 days
	adminTTL        = 30 * 24 * time.Hour
	adminLinkTTL    = 15 * time.Minute
	rateWindow      = time.Minute
	rateMaxAttempts = 10
)

type User struct {
	ID       int64   `json:"-"`
	Username string  `json:"username"`
	Display  string  `json:"display"`
	Admin    bool    `json:"admin"`
	Email    *string `json:"email"`
}

var usernameRe = regexp.MustCompile(`^[a-z0-9_]{3,20}$`)

func randToken() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		log.Fatalf("rand: %v", err)
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

func hashToken(t string) string {
	s := sha256.Sum256([]byte(t))
	return hex.EncodeToString(s[:])
}

/* ------------------------------------------------------------ sessions */

func newSession(w http.ResponseWriter, userID int64, admin bool) error {
	tok := randToken()
	ttl := playerTTL
	if admin {
		ttl = adminTTL
	}
	now := time.Now()
	a := 0
	if admin {
		a = 1
	}
	if _, err := db.Exec(`INSERT INTO sessions(token_hash,user_id,admin,created_at,expires_at) VALUES(?,?,?,?,?)`,
		hashToken(tok), userID, a, now.Unix(), now.Add(ttl).Unix()); err != nil {
		return err
	}
	db.Exec(`UPDATE users SET last_login=? WHERE id=?`, now.Unix(), userID)
	http.SetCookie(w, &http.Cookie{
		Name: sessionCookie, Value: tok, Path: cfg.CookiePath,
		HttpOnly: true, Secure: cfg.Secure, SameSite: http.SameSiteLaxMode,
		Expires: now.Add(ttl), MaxAge: int(ttl.Seconds()),
	})
	return nil
}

func dropSession(r *http.Request) {
	if c, err := r.Cookie(sessionCookie); err == nil {
		db.Exec(`DELETE FROM sessions WHERE token_hash=?`, hashToken(c.Value))
	}
}

func clearSession(w http.ResponseWriter, r *http.Request) {
	dropSession(r)
	http.SetCookie(w, &http.Cookie{
		Name: sessionCookie, Value: "", Path: cfg.CookiePath, HttpOnly: true,
		Secure: cfg.Secure, SameSite: http.SameSiteLaxMode, MaxAge: -1,
	})
}

func currentUser(r *http.Request) *User {
	c, err := r.Cookie(sessionCookie)
	if err != nil || c.Value == "" {
		return nil
	}
	var u User
	var adminSess int
	var exp int64
	var email sql.NullString
	err = db.QueryRow(`SELECT u.id, u.username, u.display, u.admin_email, s.admin, s.expires_at
	                     FROM sessions s JOIN users u ON u.id = s.user_id
	                    WHERE s.token_hash=? AND u.removed_at IS NULL`, hashToken(c.Value)).
		Scan(&u.ID, &u.Username, &u.Display, &email, &adminSess, &exp)
	if err != nil || time.Now().Unix() > exp {
		return nil
	}
	if email.Valid {
		e := email.String
		u.Email = &e
		// The allowlist is re-checked on every request so dropping an email from
		// SYNTHWILD_ADMINS takes effect at the next restart.
		u.Admin = adminSess == 1 && cfg.Admins[strings.ToLower(e)]
	}
	return &u
}

func requireUser(fn func(http.ResponseWriter, *http.Request, *User)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u := currentUser(r)
		if u == nil {
			writeErr(w, http.StatusUnauthorized, "unauthorized", "not signed in")
			return
		}
		fn(w, r, u)
	}
}

func requireAdmin(fn func(http.ResponseWriter, *http.Request, *User)) http.HandlerFunc {
	return requireUser(func(w http.ResponseWriter, r *http.Request, u *User) {
		if !u.Admin {
			writeErr(w, http.StatusForbidden, "forbidden", "admins only")
			return
		}
		fn(w, r, u)
	})
}

/* ---------------------------------------------------------- rate limit */

var (
	rlMu   sync.Mutex
	rlHits = map[string][]time.Time{}
)

// Caddy is the only thing in front of the app and it sets X-Forwarded-For; the
// header is trusted only from loopback so a direct caller can't spoof it.
func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	if ip := net.ParseIP(host); ip == nil || !ip.IsLoopback() {
		return host
	}
	xff := r.Header.Get("X-Forwarded-For")
	if i := strings.IndexByte(xff, ','); i >= 0 {
		xff = xff[:i]
	}
	if v := strings.TrimSpace(xff); v != "" {
		return v
	}
	return host
}

func rateAllowed(r *http.Request) bool {
	ip := clientIP(r)
	now := time.Now()
	rlMu.Lock()
	defer rlMu.Unlock()
	keep := rlHits[ip][:0]
	for _, t := range rlHits[ip] {
		if now.Sub(t) < rateWindow {
			keep = append(keep, t)
		}
	}
	if len(keep) >= rateMaxAttempts {
		rlHits[ip] = keep
		return false
	}
	rlHits[ip] = append(keep, now)
	if len(rlHits) > 2000 {
		for k, v := range rlHits {
			if len(v) == 0 || now.Sub(v[len(v)-1]) > rateWindow {
				delete(rlHits, k)
			}
		}
	}
	return true
}

func rateLimited(w http.ResponseWriter) {
	w.Header().Set("Retry-After", "60")
	writeErr(w, http.StatusTooManyRequests, "rate_limited", "too many attempts, wait a minute")
}

/* ------------------------------------------------------------ handlers */

func handleMe(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"user": currentUser(r)})
}

func handleLogin(w http.ResponseWriter, r *http.Request) {
	if !rateAllowed(r) {
		rateLimited(w)
		return
	}
	var body struct {
		Username string `json:"username"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	name := strings.ToLower(strings.TrimSpace(body.Username))
	if !usernameRe.MatchString(name) {
		writeErr(w, http.StatusNotFound, "not_found", "no such player")
		return
	}
	var id int64
	err := db.QueryRow(`SELECT id FROM users WHERE username=? AND removed_at IS NULL`, name).Scan(&id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not_found", "no such player")
		return
	}
	dropSession(r)
	if err := newSession(w, id, false); err != nil {
		writeErr(w, 500, "server", "could not sign in")
		return
	}
	writeJSON(w, 200, map[string]any{"user": userByID(id, false)})
}

func handleLogout(w http.ResponseWriter, r *http.Request) {
	clearSession(w, r)
	writeJSON(w, 200, map[string]any{"ok": true})
}

func userByID(id int64, admin bool) *User {
	var u User
	var email sql.NullString
	if db.QueryRow(`SELECT id, username, display, admin_email FROM users WHERE id=?`, id).
		Scan(&u.ID, &u.Username, &u.Display, &email) != nil {
		return nil
	}
	if email.Valid {
		e := email.String
		u.Email = &e
		u.Admin = admin && cfg.Admins[strings.ToLower(e)]
	}
	return &u
}

// ensureAdminUser returns the player account tied to an admin email, creating
// it (username = the email's local part, de-duplicated) on first sign-in.
func ensureAdminUser(email string) (int64, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if !cfg.Admins[email] {
		return 0, errors.New("not an admin")
	}
	var id int64
	err := db.QueryRow(`SELECT id FROM users WHERE admin_email=?`, email).Scan(&id)
	if err == nil {
		db.Exec(`UPDATE users SET removed_at=NULL WHERE id=?`, id)
		return id, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return 0, err
	}
	base := regexp.MustCompile(`[^a-z0-9_]`).ReplaceAllString(strings.SplitN(email, "@", 2)[0], "_")
	if len(base) > 16 {
		base = base[:16]
	}
	for len(base) < 3 {
		base += "_"
	}
	display := strings.ToUpper(base[:1]) + base[1:]
	for i := 0; i < 100; i++ {
		name := base
		if i > 0 {
			name = fmt.Sprintf("%s%d", base, i+1)
		}
		res, err := db.Exec(`INSERT INTO users(username,display,admin_email,created_at,created_by) VALUES(?,?,?,?,?)`,
			name, display, email, time.Now().Unix(), "google")
		if err == nil {
			return res.LastInsertId()
		}
		if !strings.Contains(err.Error(), "UNIQUE") {
			return 0, err
		}
	}
	return 0, errors.New("no free username")
}

func handleAdminGoogle(w http.ResponseWriter, r *http.Request) {
	if !rateAllowed(r) {
		rateLimited(w)
		return
	}
	var body struct {
		IDToken string `json:"idToken"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	email, err := verifyFirebaseToken(body.IDToken)
	if err != nil {
		log.Printf("admin google rejected: %v", err)
		writeErr(w, http.StatusUnauthorized, "unauthorized", "sign-in could not be verified")
		return
	}
	if !cfg.Admins[email] {
		log.Printf("admin google: %s is not on the allowlist", email)
		writeErr(w, http.StatusForbidden, "forbidden", "this Google account is not a SYNTHWILD admin")
		return
	}
	id, err := ensureAdminUser(email)
	if err != nil {
		writeErr(w, 500, "server", "could not create admin player")
		return
	}
	dropSession(r)
	if err := newSession(w, id, true); err != nil {
		writeErr(w, 500, "server", "could not sign in")
		return
	}
	writeJSON(w, 200, map[string]any{"user": userByID(id, true)})
}

/* -------------------------------------------------- one-time admin link */

func makeAdminLink(email string) (string, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if !cfg.Admins[email] {
		return "", fmt.Errorf("%s is not in the admin allowlist", email)
	}
	tok := randToken()
	if _, err := db.Exec(`INSERT INTO login_links(token_hash,email,expires_at) VALUES(?,?,?)`,
		hashToken(tok), email, time.Now().Add(adminLinkTTL).Unix()); err != nil {
		return "", err
	}
	return cfg.PublicURL + "/api/admin/link?t=" + tok, nil
}

func handleAdminLink(w http.ResponseWriter, r *http.Request) {
	if !rateAllowed(r) {
		rateLimited(w)
		return
	}
	h := hashToken(r.URL.Query().Get("t"))
	var email string
	var exp int64
	err := db.QueryRow(`DELETE FROM login_links WHERE token_hash=? RETURNING email, expires_at`, h).Scan(&email, &exp)
	if err != nil || time.Now().Unix() > exp || !cfg.Admins[email] {
		writeErr(w, http.StatusUnauthorized, "unauthorized", "link invalid, used or expired")
		return
	}
	id, err := ensureAdminUser(email)
	if err != nil {
		writeErr(w, 500, "server", "could not create admin player")
		return
	}
	dropSession(r)
	if err := newSession(w, id, true); err != nil {
		writeErr(w, 500, "server", "could not sign in")
		return
	}
	http.Redirect(w, r, cfg.CookiePath, http.StatusFound)
}
