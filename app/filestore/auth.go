package main

import (
	"crypto/rand"
	"encoding/base64"
	"log"
	"net/http"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

const (
	sessionCookie = "fs_session"
	sessionTTL    = 14 * 24 * time.Hour
	bcryptCost    = 11 // ~100ms on this box; deliberate, keeps login cheap enough on 1 vCPU
)

func hashPassword(pw string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(pw), bcryptCost)
	return string(b), err
}

func checkPassword(hash, pw string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(pw)) == nil
}

func randToken() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		log.Fatalf("rand: %v", err)
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

// A readable throwaway password for pre-created accounts. Avoids look-alike
// characters so it survives being read off a screen and typed by hand.
func randPassword() string {
	const alphabet = "abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789"
	b := make([]byte, 12)
	if _, err := rand.Read(b); err != nil {
		log.Fatalf("rand: %v", err)
	}
	out := make([]byte, len(b))
	for i, v := range b {
		out[i] = alphabet[int(v)%len(alphabet)]
	}
	return string(out)
}

/* -------------------------------------------------------------- sessions */

func newSession(w http.ResponseWriter, userID int64) error {
	tok := randToken()
	now := time.Now()
	_, err := db.Exec(`INSERT INTO sessions(token,user_id,created_at,expires_at) VALUES(?,?,?,?)`,
		tok, userID, now.Unix(), now.Add(sessionTTL).Unix())
	if err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    tok,
		Path:     "/",
		HttpOnly: true,
		Secure:   secureCookies,
		SameSite: http.SameSiteLaxMode,
		Expires:  now.Add(sessionTTL),
	})
	return nil
}

func clearSession(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(sessionCookie); err == nil {
		db.Exec(`DELETE FROM sessions WHERE token=?`, c.Value)
	}
	http.SetCookie(w, &http.Cookie{
		Name: sessionCookie, Value: "", Path: "/", HttpOnly: true,
		Secure: secureCookies, SameSite: http.SameSiteLaxMode, MaxAge: -1,
	})
}

// The signed-in user, or nil. Expired sessions are treated as absent and swept.
func currentUser(r *http.Request) *User {
	c, err := r.Cookie(sessionCookie)
	if err != nil || c.Value == "" {
		return nil
	}
	var uid, exp int64
	if err := db.QueryRow(`SELECT user_id, expires_at FROM sessions WHERE token=?`,
		c.Value).Scan(&uid, &exp); err != nil {
		return nil
	}
	if time.Now().Unix() > exp {
		db.Exec(`DELETE FROM sessions WHERE token=?`, c.Value)
		return nil
	}
	u, err := userByID(uid)
	if err != nil || u.Disabled {
		return nil
	}
	return u
}

// Drops every session belonging to a user — used when their password changes
// or their account is disabled, so a stolen cookie dies with the old password.
func killSessions(userID int64) {
	db.Exec(`DELETE FROM sessions WHERE user_id=?`, userID)
}

func sweepSessions() {
	db.Exec(`DELETE FROM sessions WHERE expires_at < ?`, time.Now().Unix())
}

/* ----------------------------------------------------------- middleware */

// requireUser wraps a handler so it only runs for a signed-in account.
//
// A user with must_reset set is deliberately allowed only as far as the
// password-change endpoint; everything else 403s with a code the front-end
// turns into the forced-reset screen.
func requireUser(fn func(http.ResponseWriter, *http.Request, *User)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u := currentUser(r)
		if u == nil {
			writeErr(w, http.StatusUnauthorized, "not signed in")
			return
		}
		if u.MustReset && !strings.HasSuffix(r.URL.Path, "/password") {
			writeJSON(w, http.StatusForbidden, map[string]any{
				"error": "password reset required", "code": "must_reset",
			})
			return
		}
		fn(w, r, u)
	}
}

func requireRole(roles string, fn func(http.ResponseWriter, *http.Request, *User)) http.HandlerFunc {
	allowed := strings.Split(roles, ",")
	return requireUser(func(w http.ResponseWriter, r *http.Request, u *User) {
		for _, role := range allowed {
			if u.Role == role {
				fn(w, r, u)
				return
			}
		}
		writeErr(w, http.StatusForbidden, "not allowed")
	})
}

/* ------------------------------------------------------ password policy */

func validPassword(pw string) string {
	if len(pw) < 8 {
		return "password must be at least 8 characters"
	}
	if len(pw) > 200 {
		return "password is too long"
	}
	return ""
}

func validUsername(name string) string {
	if len(name) < 3 || len(name) > 40 {
		return "username must be 3-40 characters"
	}
	for _, c := range name {
		ok := c == '.' || c == '_' || c == '-' || c == '@' ||
			(c >= '0' && c <= '9') || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
		if !ok {
			return "username may only contain letters, numbers and . _ - @"
		}
	}
	return ""
}
