package main

import (
	"database/sql"
	"fmt"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"
)

type userRow struct {
	Username   string  `json:"username"`
	Display    string  `json:"display"`
	CreatedAt  int64   `json:"createdAt"`
	CreatedBy  string  `json:"createdBy"`
	AdminEmail *string `json:"adminEmail"`
	LastLogin  *int64  `json:"lastLogin"`
	Worlds     int     `json:"worlds"`
}

func cleanDisplay(s, fallback string) string {
	s = strings.Join(strings.Fields(s), " ")
	if s == "" {
		s = fallback
	}
	if utf8.RuneCountInString(s) > 32 {
		s = string([]rune(s)[:32])
	}
	return s
}

func handleListUsers(w http.ResponseWriter, r *http.Request, _ *User) {
	rows, err := db.Query(`SELECT u.username, u.display, u.created_at, u.created_by, u.admin_email, u.last_login,
	                              (SELECT COUNT(*) FROM worlds w WHERE w.owner_id=u.id)
	                         FROM users u WHERE u.removed_at IS NULL ORDER BY u.username`)
	if err != nil {
		writeErr(w, 500, "server", "query failed")
		return
	}
	defer rows.Close()
	out := []userRow{}
	for rows.Next() {
		var u userRow
		var email sql.NullString
		var last sql.NullInt64
		if rows.Scan(&u.Username, &u.Display, &u.CreatedAt, &u.CreatedBy, &email, &last, &u.Worlds) != nil {
			continue
		}
		if email.Valid {
			u.AdminEmail = &email.String
		}
		if last.Valid {
			ms := last.Int64 * 1000
			u.LastLogin = &ms
		}
		u.CreatedAt *= 1000
		out = append(out, u)
	}
	writeJSON(w, 200, map[string]any{"users": out})
}

// Re-adding a removed username makes a NEW account. The old row is renamed
// out of the way (name~id can never log in) and its worlds stay hidden.
func handleAddUser(w http.ResponseWriter, r *http.Request, admin *User) {
	var body struct {
		Username string `json:"username"`
		Display  string `json:"display"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	name := strings.ToLower(strings.TrimSpace(body.Username))
	if !usernameRe.MatchString(name) {
		writeErr(w, http.StatusBadRequest, "bad_request", "username must be 3-20 characters: a-z, 0-9 and _")
		return
	}
	display := cleanDisplay(body.Display, name)
	now := time.Now().Unix()
	tx, err := db.Begin()
	if err != nil {
		writeErr(w, 500, "server", "db error")
		return
	}
	defer tx.Rollback()
	var id int64
	var removed sql.NullInt64
	err = tx.QueryRow(`SELECT id, removed_at FROM users WHERE username=?`, name).Scan(&id, &removed)
	switch {
	case err == nil && !removed.Valid:
		writeErr(w, http.StatusConflict, "conflict", "that username is taken")
		return
	case err == nil:
		_, err = tx.Exec(`UPDATE users SET username=? WHERE id=?`, fmt.Sprintf("%s~%d", name, id), id)
	default:
		err = nil
	}
	if err == nil {
		_, err = tx.Exec(`INSERT INTO users(username,display,created_at,created_by) VALUES(?,?,?,?)`,
			name, display, now, admin.Username)
	}
	if err != nil || tx.Commit() != nil {
		writeErr(w, 500, "server", "could not add user")
		return
	}
	var u userRow
	db.QueryRow(`SELECT username, display, created_at, created_by FROM users WHERE username=?`, name).
		Scan(&u.Username, &u.Display, &u.CreatedAt, &u.CreatedBy)
	u.CreatedAt *= 1000
	writeJSON(w, http.StatusCreated, map[string]any{"user": u})
}

func handleRemoveUser(w http.ResponseWriter, r *http.Request, _ *User) {
	name := strings.ToLower(r.PathValue("username"))
	var id int64
	var email sql.NullString
	err := db.QueryRow(`SELECT id, admin_email FROM users WHERE username=? AND removed_at IS NULL`, name).Scan(&id, &email)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not_found", "no such user")
		return
	}
	if email.Valid {
		writeErr(w, http.StatusBadRequest, "bad_request", "admin player accounts can't be removed")
		return
	}
	tx, err := db.Begin()
	if err != nil {
		writeErr(w, 500, "server", "db error")
		return
	}
	defer tx.Rollback()
	tx.Exec(`UPDATE users SET removed_at=? WHERE id=?`, time.Now().Unix(), id)
	tx.Exec(`DELETE FROM sessions WHERE user_id=?`, id)
	if tx.Commit() != nil {
		writeErr(w, 500, "server", "db error")
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}
