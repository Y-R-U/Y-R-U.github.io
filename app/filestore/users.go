package main

import (
	"net/http"
	"strings"
	"syscall"
	"time"
)

/* ------------------------------------------------------- who manages whom

   admin  creates and manages LEAD accounts only. It never creates projects or
          ordinary users, and it cannot see a lead's user list as an editable
          thing — it manages leads, quotas and the box.
   lead   creates and manages ORDINARY users, and grants them projects it owns.
   user   has no user-management rights at all.
*/

// manageableRole is the single role a given account is allowed to create.
func manageableRole(u *User) string {
	switch u.Role {
	case "admin":
		return "lead"
	case "lead":
		return "user"
	}
	return ""
}

// canManageUser reports whether actor may edit/disable/delete target.
func canManageUser(actor, target *User) bool {
	if actor.ID == target.ID {
		return false // no self-service disable/delete; avoids locking out the last admin
	}
	switch actor.Role {
	case "admin":
		return target.Role == "lead"
	case "lead":
		return target.Role == "user" && target.CreatedBy == actor.ID
	}
	return false
}

/* -------------------------------------------------------- /api/users */

func handleUsers(w http.ResponseWriter, r *http.Request, u *User) {
	switch r.Method {
	case http.MethodGet:
		listUsers(w, u)
	case http.MethodPost:
		createUser(w, r, u)
	default:
		writeErr(w, http.StatusMethodNotAllowed, "GET or POST")
	}
}

func listUsers(w http.ResponseWriter, u *User) {
	var (
		rows interface {
			Next() bool
			Scan(...any) error
			Close() error
		}
		err error
	)
	switch u.Role {
	case "admin":
		rows, err = db.Query(`SELECT ` + userCols + ` FROM users WHERE role='lead'
		                      ORDER BY username COLLATE NOCASE`)
	case "lead":
		// A lead only ever sees the users it created — never other leads' staff.
		rows, err = db.Query(`SELECT `+userCols+` FROM users
		                      WHERE role='user' AND created_by=?
		                      ORDER BY username COLLATE NOCASE`, u.ID)
	default:
		writeErr(w, http.StatusForbidden, "not allowed")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not list users")
		return
	}
	defer rows.Close()

	out := []*User{}
	for rows.Next() {
		usr, err := scanUser(rows)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "could not read users")
			return
		}
		out = append(out, usr)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"users": out, "creates": manageableRole(u),
	})
}

// createUser pre-creates an account with a password the creator hands over out
// of band. must_reset forces the new user to choose their own at first login,
// so the creator's copy stops being a valid credential immediately.
func createUser(w http.ResponseWriter, r *http.Request, actor *User) {
	role := manageableRole(actor)
	if role == "" {
		writeErr(w, http.StatusForbidden, "not allowed")
		return
	}
	var body struct {
		Username string `json:"username"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := readJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request")
		return
	}
	body.Username = strings.TrimSpace(body.Username)
	if msg := validUsername(body.Username); msg != "" {
		writeErr(w, http.StatusBadRequest, msg)
		return
	}
	// A blank password means "generate one for me" — the common path.
	pw := strings.TrimSpace(body.Password)
	if pw == "" {
		pw = randPassword()
	} else if msg := validPassword(pw); msg != "" {
		writeErr(w, http.StatusBadRequest, msg)
		return
	}
	hash, err := hashPassword(pw)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not create user")
		return
	}
	res, err := db.Exec(`INSERT INTO users(username,email,pass_hash,role,must_reset,created_by,created_at)
	                     VALUES(?,?,?,?,1,?,?)`,
		body.Username, strings.TrimSpace(body.Email), hash, role, actor.ID, time.Now().Unix())
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			writeErr(w, http.StatusConflict, "that username is already taken")
			return
		}
		writeErr(w, http.StatusInternalServerError, "could not create user")
		return
	}
	id, _ := res.LastInsertId()
	logAudit(actor, 0, "user_create", role+" "+body.Username)
	newUser, _ := userByID(id)
	// The only time the plaintext password is ever returned — the creator has
	// to be able to pass it on. It is never stored or shown again.
	writeJSON(w, http.StatusOK, map[string]any{"user": newUser, "password": pw})
}

/* ---------------------------------------------------- /api/users/<id>/... */

func handleUserSub(w http.ResponseWriter, r *http.Request, actor *User) {
	parts := pathParts(r, "/api/users/")
	if len(parts) == 0 {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	target, err := userByID(atoi64(parts[0]))
	if err != nil {
		writeErr(w, http.StatusNotFound, "no such user")
		return
	}
	if !canManageUser(actor, target) {
		writeErr(w, http.StatusForbidden, "not allowed")
		return
	}

	action := ""
	if len(parts) > 1 {
		action = parts[1]
	}
	switch {
	case action == "" && r.Method == http.MethodDelete:
		deleteUser(w, actor, target)
	case action == "" && r.Method == http.MethodPatch:
		patchUser(w, r, actor, target)
	case action == "reset" && r.Method == http.MethodPost:
		resetUserPassword(w, actor, target)
	case action == "projects" && r.Method == http.MethodGet:
		userProjects(w, actor, target)
	default:
		writeErr(w, http.StatusNotFound, "not found")
	}
}

// patchUser currently carries only the enable/disable switch. Disabling keeps
// the account and its audit trail but revokes every live session.
func patchUser(w http.ResponseWriter, r *http.Request, actor, target *User) {
	var body struct {
		Disabled *bool `json:"disabled"`
	}
	if err := readJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request")
		return
	}
	if body.Disabled != nil {
		v := 0
		if *body.Disabled {
			v = 1
		}
		if _, err := db.Exec(`UPDATE users SET disabled=? WHERE id=?`, v, target.ID); err != nil {
			writeErr(w, http.StatusInternalServerError, "could not update user")
			return
		}
		if *body.Disabled {
			killSessions(target.ID)
		}
		logAudit(actor, 0, "user_disable", target.Username+"="+boolStr(*body.Disabled))
	}
	nu, _ := userByID(target.ID)
	writeJSON(w, http.StatusOK, map[string]any{"user": nu})
}

func boolStr(b bool) string {
	if b {
		return "true"
	}
	return "false"
}

// deleteUser removes the account outright. A lead's projects are NOT deleted
// with them — that would destroy shared work as a side effect of an HR change,
// so the projects are left in place for an admin to reassign.
func deleteUser(w http.ResponseWriter, actor, target *User) {
	var owned int
	db.QueryRow(`SELECT COUNT(*) FROM projects WHERE owner_id=?`, target.ID).Scan(&owned)
	if owned > 0 {
		writeErr(w, http.StatusConflict,
			"this lead still owns projects — delete or reassign them first")
		return
	}
	if _, err := db.Exec(`DELETE FROM users WHERE id=?`, target.ID); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not delete user")
		return
	}
	db.Exec(`DELETE FROM project_members WHERE user_id=?`, target.ID)
	killSessions(target.ID)
	logAudit(actor, 0, "user_delete", target.Role+" "+target.Username)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// resetUserPassword issues a fresh one-time password and forces another reset.
func resetUserPassword(w http.ResponseWriter, actor, target *User) {
	pw := randPassword()
	hash, err := hashPassword(pw)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not reset password")
		return
	}
	if _, err := db.Exec(`UPDATE users SET pass_hash=?, must_reset=1 WHERE id=?`,
		hash, target.ID); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not reset password")
		return
	}
	killSessions(target.ID)
	logAudit(actor, 0, "user_reset", target.Username)
	writeJSON(w, http.StatusOK, map[string]any{"password": pw})
}

// userProjects lists the actor's own projects with a flag for whether the
// target user is granted each — the data behind the access checkboxes.
func userProjects(w http.ResponseWriter, actor, target *User) {
	rows, err := db.Query(`SELECT p.id, p.name,
	                         EXISTS(SELECT 1 FROM project_members m
	                                WHERE m.project_id=p.id AND m.user_id=?)
	                       FROM projects p WHERE p.owner_id=?
	                       ORDER BY p.name COLLATE NOCASE`, target.ID, actor.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not list projects")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id int64
		var name string
		var granted bool
		if rows.Scan(&id, &name, &granted) == nil {
			out = append(out, map[string]any{"id": id, "name": name, "granted": granted})
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"projects": out})
}

/* ------------------------------------------- /api/projects/<id>/members */

func handleMembers(w http.ResponseWriter, r *http.Request, u *User, p *Project) {
	// Membership is the lead's to control; ordinary users can't even read it,
	// which is the "only lead can see and manage users" rule.
	if !canManage(u, p) {
		writeErr(w, http.StatusForbidden, "only the lead who owns this project can manage access")
		return
	}
	switch r.Method {
	case http.MethodGet:
		rows, err := db.Query(`SELECT u.id, u.username, u.disabled,
		                         EXISTS(SELECT 1 FROM project_members m
		                                WHERE m.project_id=? AND m.user_id=u.id)
		                       FROM users u WHERE u.role='user' AND u.created_by=?
		                       ORDER BY u.username COLLATE NOCASE`, p.ID, u.ID)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "could not list members")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id int64
			var name string
			var disabled, granted bool
			if rows.Scan(&id, &name, &disabled, &granted) == nil {
				out = append(out, map[string]any{
					"id": id, "username": name, "disabled": disabled, "granted": granted,
				})
			}
		}
		writeJSON(w, http.StatusOK, map[string]any{"members": out})

	case http.MethodPost:
		var body struct {
			UserID  int64 `json:"userId"`
			Granted bool  `json:"granted"`
		}
		if err := readJSON(r, &body); err != nil {
			writeErr(w, http.StatusBadRequest, "bad request")
			return
		}
		target, err := userByID(body.UserID)
		// A lead may only grant access to users it created — not to arbitrary
		// account IDs guessed from the URL.
		if err != nil || target.Role != "user" || target.CreatedBy != u.ID {
			writeErr(w, http.StatusForbidden, "not one of your users")
			return
		}
		if body.Granted {
			_, err = db.Exec(`INSERT OR IGNORE INTO project_members(project_id,user_id,added_at)
			                  VALUES(?,?,?)`, p.ID, target.ID, time.Now().Unix())
		} else {
			_, err = db.Exec(`DELETE FROM project_members WHERE project_id=? AND user_id=?`,
				p.ID, target.ID)
		}
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "could not update access")
			return
		}
		logAudit(u, p.ID, "member_set", target.Username+"="+boolStr(body.Granted))
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})

	default:
		writeErr(w, http.StatusMethodNotAllowed, "GET or POST")
	}
}

/* ------------------------------------------------------------ admin API */

func handleSettings(w http.ResponseWriter, r *http.Request, u *User) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, map[string]any{
			"defaultQuota": defaultQuota(),
			"globalCap":    globalCap(),
			"maxUpload":    maxUpload(),
		})
	case http.MethodPost:
		var body struct {
			DefaultQuota *int64 `json:"defaultQuota"`
			GlobalCap    *int64 `json:"globalCap"`
			MaxUpload    *int64 `json:"maxUpload"`
		}
		if err := readJSON(r, &body); err != nil {
			writeErr(w, http.StatusBadRequest, "bad request")
			return
		}
		if body.DefaultQuota != nil {
			if *body.DefaultQuota < 1<<20 {
				writeErr(w, http.StatusBadRequest, "default limit must be at least 1 MB")
				return
			}
			setSetting("default_quota_bytes", *body.DefaultQuota)
		}
		if body.GlobalCap != nil {
			if *body.GlobalCap < 1<<20 {
				writeErr(w, http.StatusBadRequest, "global cap must be at least 1 MB")
				return
			}
			setSetting("global_cap_bytes", *body.GlobalCap)
		}
		if body.MaxUpload != nil {
			if *body.MaxUpload < 1<<20 {
				writeErr(w, http.StatusBadRequest, "upload limit must be at least 1 MB")
				return
			}
			setSetting("max_upload_bytes", *body.MaxUpload)
		}
		logAudit(u, 0, "settings_update", "")
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	default:
		writeErr(w, http.StatusMethodNotAllowed, "GET or POST")
	}
}

// handleStats backs the admin dashboard: per-project usage plus the real disk
// figures, so the global cap can be set against actual free space.
func handleStats(w http.ResponseWriter, r *http.Request, u *User) {
	rows, err := db.Query(projectSelect + ` ORDER BY 7 DESC`)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not read stats")
		return
	}
	defer rows.Close()
	projects := []*Project{}
	for rows.Next() {
		if p, err := scanProject(rows); err == nil {
			projects = append(projects, p)
		}
	}

	var diskFree, diskTotal int64
	var st syscall.Statfs_t
	if err := syscall.Statfs(filesRoot, &st); err == nil {
		diskFree = int64(st.Bavail) * int64(st.Bsize)
		diskTotal = int64(st.Blocks) * int64(st.Bsize)
	}

	var users, leads int64
	db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&users)
	db.QueryRow(`SELECT COUNT(*) FROM users WHERE role='lead'`).Scan(&leads)

	audit := []map[string]any{}
	arows, err := db.Query(`SELECT at, username, action, detail FROM audit
	                        ORDER BY at DESC LIMIT 100`)
	if err == nil {
		defer arows.Close()
		for arows.Next() {
			var at int64
			var name, action, detail string
			if arows.Scan(&at, &name, &action, &detail) == nil {
				audit = append(audit, map[string]any{
					"at": at, "username": name, "action": action, "detail": detail,
				})
			}
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"projects":  projects,
		"totalUsed": totalUsed(),
		"globalCap": globalCap(),
		"diskFree":  diskFree,
		"diskTotal": diskTotal,
		"users":     users,
		"leads":     leads,
		"audit":     audit,
	})
}
