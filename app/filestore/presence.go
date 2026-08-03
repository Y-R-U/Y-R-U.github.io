package main

// Who is where, and what a lead can do about it.
//
// Three things live here because they are the same idea from three angles:
//
//	presence   every client heartbeats where it is, so everyone else can see
//	           "Sam is editing manifest.json" and pick up saves as they land
//	orders     a lead can kick someone out of an area or move them to another;
//	           the order rides back on that person's next heartbeat
//	bans       the durable version of a kick, optionally with a time limit
//
// Presence and orders are in memory: they describe this moment, they are worth
// nothing after a restart, and a heartbeat every few seconds from every open
// tab is not something to write to SQLite on a 1 vCPU box. Bans are the
// opposite — they outlive the process, so they are a table.

import (
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	heartbeatSeconds = 8                // how often the client checks in
	presenceTTL      = 25 * time.Second // no heartbeat for this long: they're gone
	orderTTL         = 3 * time.Minute  // undelivered orders expire rather than ambush
)

/* -------------------------------------------------------------- presence */

// Where somebody is. Area is "" (the project list), "project", "file" or "page";
// Ref is the file path or page id that goes with it.
type spot struct {
	ProjectID int64  `json:"projectId"`
	Area      string `json:"area"`
	Ref       string `json:"ref"`
	Editing   bool   `json:"editing"`
}

type presenceEntry struct {
	UserID int64  `json:"userId"`
	Name   string `json:"name"`
	Role   string `json:"role"`
	spot
	Idle int64 `json:"idle"` // seconds since their last heartbeat
	seen time.Time
}

// An instruction from a lead, waiting for its target to check in.
type order struct {
	Type      string `json:"type"` // "kick" or "move"
	Reason    string `json:"reason"`
	From      string `json:"from"`
	ProjectID int64  `json:"projectId,omitempty"`
	Area      string `json:"area,omitempty"`
	Ref       string `json:"ref,omitempty"`
	issued    time.Time
}

var (
	presenceMu sync.Mutex
	// Keyed by session token, not user id: two tabs are two spots, and the
	// listing folds them back together per person.
	presenceAt = map[string]*presenceEntry{}
	orders     = map[int64][]*order{} // user id -> undelivered
)

func sessionToken(r *http.Request) string {
	c, err := r.Cookie(sessionCookie)
	if err != nil {
		return ""
	}
	return c.Value
}

// mark records where u is now and returns everyone else in the same project.
func mark(token string, u *User, s spot) []*presenceEntry {
	now := time.Now()
	presenceMu.Lock()
	defer presenceMu.Unlock()

	for k, e := range presenceAt {
		if now.Sub(e.seen) > presenceTTL {
			delete(presenceAt, k)
		}
	}
	if token != "" {
		presenceAt[token] = &presenceEntry{
			UserID: u.ID, Name: u.DisplayName, Role: u.Role, spot: s, seen: now,
		}
	}

	// One row per person, keeping the liveliest of their tabs — someone with the
	// file open in two windows is one person, and the editing one is the truth.
	best := map[int64]*presenceEntry{}
	for k, e := range presenceAt {
		if e.UserID == u.ID || k == token || e.ProjectID != s.ProjectID || s.ProjectID == 0 {
			continue
		}
		prev, ok := best[e.UserID]
		if !ok || (e.Editing && !prev.Editing) || e.seen.After(prev.seen) {
			best[e.UserID] = e
		}
	}
	out := []*presenceEntry{}
	for _, e := range best {
		c := *e
		c.Idle = int64(now.Sub(e.seen).Seconds())
		out = append(out, &c)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

// everyone returns a snapshot of all live spots, for the lead's people console.
func everyone() []*presenceEntry {
	now := time.Now()
	presenceMu.Lock()
	defer presenceMu.Unlock()
	best := map[int64]*presenceEntry{}
	for _, e := range presenceAt {
		if now.Sub(e.seen) > presenceTTL {
			continue
		}
		prev, ok := best[e.UserID]
		if !ok || (e.Editing && !prev.Editing) || e.seen.After(prev.seen) {
			best[e.UserID] = e
		}
	}
	out := []*presenceEntry{}
	for _, e := range best {
		c := *e
		c.Idle = int64(now.Sub(e.seen).Seconds())
		out = append(out, &c)
	}
	return out
}

func spotOf(userID int64) *presenceEntry {
	for _, e := range everyone() {
		if e.UserID == userID {
			return e
		}
	}
	return nil
}

func sendOrder(userID int64, o *order) {
	o.issued = time.Now()
	presenceMu.Lock()
	defer presenceMu.Unlock()
	orders[userID] = append(orders[userID], o)
}

// takeOrder hands over the oldest order still worth delivering.
func takeOrder(userID int64) *order {
	presenceMu.Lock()
	defer presenceMu.Unlock()
	q := orders[userID]
	for len(q) > 0 {
		o := q[0]
		q = q[1:]
		if time.Since(o.issued) < orderTTL {
			if len(q) == 0 {
				delete(orders, userID)
			} else {
				orders[userID] = q
			}
			return o
		}
	}
	delete(orders, userID)
	return nil
}

/* --------------------------------------------------------- /api/presence */

func handlePresence(w http.ResponseWriter, r *http.Request, u *User) {
	if r.Method != http.MethodPost {
		writeErr(w, http.StatusMethodNotAllowed, "POST only")
		return
	}
	var body struct {
		spot
		// The document this client has open, and the timestamp it loaded, so the
		// reply can say "someone else has saved since".
		Watch *struct {
			Kind string `json:"kind"`
			Ref  string `json:"ref"`
		} `json:"watch"`
	}
	if err := readJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request")
		return
	}
	// A spot in a project this account can't reach is not a spot.
	if body.ProjectID > 0 {
		p, err := projectByID(body.ProjectID)
		if err != nil || !canAccess(u, p) {
			body.spot = spot{}
		}
	}

	people := mark(sessionToken(r), u, body.spot)
	resp := map[string]any{"people": people, "interval": heartbeatSeconds}

	// A ban that lands while someone is already inside the area turns into a
	// kick on their next check-in, so they don't sit there until they reload.
	if body.ProjectID > 0 {
		if b := blockingBan(u, body.ProjectID, kindOf(body.Area), body.Ref); b != nil {
			sendOrder(u.ID, &order{Type: "kick", Reason: b.Reason, From: b.ByName,
				ProjectID: body.ProjectID, Area: b.Scope, Ref: b.Ref})
		}
	}
	if o := takeOrder(u.ID); o != nil {
		resp["order"] = o
	}
	if body.Watch != nil {
		if at, by := docStamp(body.ProjectID, body.Watch.Kind, body.Watch.Ref); at > 0 {
			resp["watch"] = map[string]any{
				"kind": body.Watch.Kind, "ref": body.Watch.Ref, "at": at, "by": by,
			}
		}
	}
	writeJSON(w, http.StatusOK, resp)
}

// kindOf maps a presence area onto the ban scope it would be caught by.
func kindOf(area string) string {
	switch area {
	case "file", "page":
		return area
	}
	return ""
}

// docStamp is when a document was last saved, and by whom.
func docStamp(projectID int64, kind, ref string) (int64, string) {
	var at int64
	var by string
	switch kind {
	case "file":
		db.QueryRow(`SELECT f.updated_at, `+displayNameExpr+`
		             FROM files f LEFT JOIN users u ON u.id=f.updated_by
		             WHERE f.project_id=? AND f.path=?`, projectID, ref).Scan(&at, &by)
	case "page":
		db.QueryRow(`SELECT g.updated_at, `+displayNameExpr+`
		             FROM pages g LEFT JOIN users u ON u.id=g.updated_by
		             WHERE g.project_id=? AND g.id=?`, projectID, atoi64(ref)).Scan(&at, &by)
	}
	return at, by
}

/* ------------------------------------------------------------------ bans */

type Ban struct {
	ID          int64  `json:"id"`
	UserID      int64  `json:"userId"`
	UserName    string `json:"userName"`
	ProjectID   int64  `json:"projectId"`
	ProjectName string `json:"projectName"`
	Scope       string `json:"scope"`
	Ref         string `json:"ref"`
	Reason      string `json:"reason"`
	Until       int64  `json:"until"`
	ByName      string `json:"byName"`
}

const banSelect = `
SELECT b.id, b.user_id, COALESCE(NULLIF(t.display_name,''), t.username, '?'),
       b.project_id, COALESCE(p.name,'?'), b.scope, b.ref, b.reason, b.until,
       COALESCE(NULLIF(u.display_name,''), u.username, '')
FROM bans b
LEFT JOIN users t    ON t.id = b.user_id
LEFT JOIN users u    ON u.id = b.created_by
LEFT JOIN projects p ON p.id = b.project_id`

func scanBan(row interface{ Scan(...any) error }) (*Ban, error) {
	var b Ban
	err := row.Scan(&b.ID, &b.UserID, &b.UserName, &b.ProjectID, &b.ProjectName,
		&b.Scope, &b.Ref, &b.Reason, &b.Until, &b.ByName)
	if err != nil {
		return nil, err
	}
	return &b, nil
}

// blockingBan reports the ban stopping u from touching (project, kind, ref), if
// any. Only ordinary users are ever subject to one — a lead can't be shut out
// of their own project, and admin isn't in the moderation picture at all.
func blockingBan(u *User, projectID int64, kind, ref string) *Ban {
	if u.Role != "user" || projectID == 0 {
		return nil
	}
	rows, err := db.Query(banSelect+`
		WHERE b.user_id=? AND b.project_id=? AND (b.until=0 OR b.until>?)`,
		u.ID, projectID, time.Now().Unix())
	if err != nil {
		return nil
	}
	defer rows.Close()
	for rows.Next() {
		b, err := scanBan(rows)
		if err != nil {
			continue
		}
		switch b.Scope {
		case "project":
			return b
		case "file":
			// A ban on a folder covers everything inside it.
			if kind == "file" && (ref == b.Ref || strings.HasPrefix(ref, b.Ref+"/")) {
				return b
			}
		case "page":
			if kind == "page" && ref == b.Ref {
				return b
			}
		}
	}
	return nil
}

// banBlocked writes the refusal and reports whether it did. The reason travels
// with it: being stopped without being told why is the thing that makes this
// feel arbitrary.
func banBlocked(w http.ResponseWriter, u *User, projectID int64, kind, ref string) bool {
	b := blockingBan(u, projectID, kind, ref)
	if b == nil {
		return false
	}
	msg := "your lead has blocked you from this " + map[string]string{
		"project": "project", "file": "file", "page": "page",
	}[b.Scope]
	if b.Reason != "" {
		msg += ": " + b.Reason
	}
	if b.Until > 0 {
		msg += " (until " + time.Unix(b.Until, 0).Format("15:04 on 2 Jan") + ")"
	}
	writeJSON(w, http.StatusForbidden, map[string]any{
		"error": msg, "code": "banned", "reason": b.Reason, "until": b.Until, "scope": b.Scope,
	})
	return true
}

/* ---------------------------------------------------------- /api/people */

// The lead's console: who is online in their projects, and the controls for
// moving people out of the way.

func handlePeople(w http.ResponseWriter, r *http.Request, u *User) {
	if r.Method != http.MethodGet {
		writeErr(w, http.StatusMethodNotAllowed, "GET only")
		return
	}
	// The lead's own projects, which is the whole extent of what they moderate.
	mine := map[int64]string{}
	rows, err := db.Query(`SELECT id, name FROM projects WHERE owner_id=? ORDER BY name COLLATE NOCASE`, u.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not read your projects")
		return
	}
	projects := []map[string]any{}
	for rows.Next() {
		var id int64
		var name string
		if rows.Scan(&id, &name) == nil {
			mine[id] = name
			projects = append(projects, map[string]any{"id": id, "name": name})
		}
	}
	rows.Close()

	// Everyone this lead created, online or not — you can't ban someone ahead of
	// time if they only appear on the list while they happen to be signed in.
	type person struct {
		UserID      int64  `json:"userId"`
		Name        string `json:"name"`
		Username    string `json:"username"`
		Online      bool   `json:"online"`
		Idle        int64  `json:"idle"`
		ProjectID   int64  `json:"projectId"`
		ProjectName string `json:"projectName"`
		Area        string `json:"area"`
		Ref         string `json:"ref"`
		Editing     bool   `json:"editing"`
		Elsewhere   bool   `json:"elsewhere"` // online, but not in a project of mine
	}
	live := map[int64]*presenceEntry{}
	for _, e := range everyone() {
		live[e.UserID] = e
	}

	out := []*person{}
	seen := map[int64]bool{}
	urows, err := db.Query(`SELECT `+userCols+` FROM users
	                        WHERE role='user' AND created_by=? ORDER BY username COLLATE NOCASE`, u.ID)
	if err == nil {
		for urows.Next() {
			t, err := scanUser(urows)
			if err != nil {
				continue
			}
			seen[t.ID] = true
			p := &person{UserID: t.ID, Name: t.DisplayName, Username: t.Username}
			if e, ok := live[t.ID]; ok {
				p.Online, p.Idle, p.Editing = true, e.Idle, e.Editing
				if name, ok := mine[e.ProjectID]; ok {
					p.ProjectID, p.ProjectName, p.Area, p.Ref = e.ProjectID, name, e.Area, e.Ref
				} else if e.ProjectID > 0 {
					p.Elsewhere = true
				}
			}
			out = append(out, p)
		}
		urows.Close()
	}
	// Somebody else's user, sitting in one of my projects because I granted them
	// access: they belong on this list too.
	for _, e := range live {
		if seen[e.UserID] || e.Role != "user" {
			continue
		}
		name, ok := mine[e.ProjectID]
		if !ok {
			continue
		}
		t, err := userByID(e.UserID)
		uname := ""
		if err == nil {
			uname = t.Username
		}
		out = append(out, &person{
			UserID: e.UserID, Name: e.Name, Username: uname, Online: true, Idle: e.Idle,
			ProjectID: e.ProjectID, ProjectName: name, Area: e.Area, Ref: e.Ref, Editing: e.Editing,
		})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Online != out[j].Online {
			return out[i].Online
		}
		return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name)
	})

	writeJSON(w, http.StatusOK, map[string]any{
		"people": out, "projects": projects, "bans": listBans(u), "interval": heartbeatSeconds,
	})
}

func listBans(u *User) []*Ban {
	out := []*Ban{}
	rows, err := db.Query(banSelect+`
		WHERE p.owner_id=? AND (b.until=0 OR b.until>?)
		ORDER BY b.created_at DESC`, u.ID, time.Now().Unix())
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		if b, err := scanBan(rows); err == nil {
			out = append(out, b)
		}
	}
	return out
}

// moderatable resolves the target of a moderation action and checks the lead is
// entitled to act on them: it has to be one of their own users, or someone
// sitting in a project they own.
func moderatable(w http.ResponseWriter, lead *User, userID, projectID int64) (*User, *Project) {
	t, err := userByID(userID)
	if err != nil || t.Role != "user" {
		writeErr(w, http.StatusForbidden, "you can only do that to an ordinary user")
		return nil, nil
	}
	var p *Project
	if projectID > 0 {
		p, err = projectByID(projectID)
		if err != nil || !canManage(lead, p) {
			writeErr(w, http.StatusForbidden, "that isn't one of your projects")
			return nil, nil
		}
	}
	if t.CreatedBy == lead.ID {
		return t, p
	}
	// Not their user — allowed only where they are standing in the lead's project.
	if p != nil {
		var n int
		db.QueryRow(`SELECT COUNT(*) FROM project_members WHERE project_id=? AND user_id=?`,
			p.ID, t.ID).Scan(&n)
		if n > 0 {
			return t, p
		}
	}
	writeErr(w, http.StatusForbidden, "that person isn't one of yours")
	return nil, nil
}

func handlePeopleAction(w http.ResponseWriter, r *http.Request, u *User) {
	if r.Method != http.MethodPost {
		writeErr(w, http.StatusMethodNotAllowed, "POST only")
		return
	}
	parts := pathParts(r, "/api/people/")
	action := ""
	if len(parts) > 0 {
		action = parts[0]
	}
	var body struct {
		UserID    int64  `json:"userId"`
		ProjectID int64  `json:"projectId"`
		Scope     string `json:"scope"` // kick/ban: "project", "file", "page"
		Ref       string `json:"ref"`
		Area      string `json:"area"` // move: where to put them
		Reason    string `json:"reason"`
		Minutes   int64  `json:"minutes"` // ban: 0 = no time limit
		BanID     int64  `json:"banId"`
	}
	if err := readJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request")
		return
	}
	body.Reason = strings.TrimSpace(body.Reason)
	if len(body.Reason) > 300 {
		body.Reason = body.Reason[:300]
	}

	switch action {
	case "kick":
		t, p := moderatable(w, u, body.UserID, body.ProjectID)
		if t == nil {
			return
		}
		scope := body.Scope
		if scope != "project" && scope != "file" && scope != "page" {
			scope = "project"
		}
		sendOrder(t.ID, &order{
			Type: "kick", Reason: body.Reason, From: u.DisplayName,
			ProjectID: body.ProjectID, Area: scope, Ref: body.Ref,
		})
		name := "?"
		if p != nil {
			name = p.Name
		}
		logAudit(u, body.ProjectID, "kick", t.Username+" from "+scope+" "+name+" "+body.Ref)
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})

	case "move":
		t, p := moderatable(w, u, body.UserID, body.ProjectID)
		if t == nil || p == nil {
			if t != nil {
				writeErr(w, http.StatusBadRequest, "pick a project to move them to")
			}
			return
		}
		// Moving someone somewhere they can't get into would bounce them straight
		// back out, so make sure they're actually a member first.
		if !canAccess(t, p) {
			writeErr(w, http.StatusBadRequest, "give them access to that project first")
			return
		}
		sendOrder(t.ID, &order{
			Type: "move", Reason: body.Reason, From: u.DisplayName,
			ProjectID: p.ID, Area: body.Area, Ref: body.Ref,
		})
		logAudit(u, p.ID, "move", t.Username+" to "+p.Name+" "+body.Area+" "+body.Ref)
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})

	case "ban":
		t, p := moderatable(w, u, body.UserID, body.ProjectID)
		if t == nil || p == nil {
			if t != nil {
				writeErr(w, http.StatusBadRequest, "pick a project to block them from")
			}
			return
		}
		scope := body.Scope
		if scope != "project" && scope != "file" && scope != "page" {
			scope = "project"
		}
		ref := body.Ref
		if scope == "project" {
			ref = ""
		}
		until := int64(0)
		if body.Minutes > 0 {
			until = time.Now().Add(time.Duration(body.Minutes) * time.Minute).Unix()
		}
		// One ban per person per thing: setting it again replaces the old one,
		// which is also how "change the time limit" works.
		db.Exec(`DELETE FROM bans WHERE user_id=? AND project_id=? AND scope=? AND ref=?`,
			t.ID, p.ID, scope, ref)
		_, err := db.Exec(`INSERT INTO bans(user_id,project_id,scope,ref,reason,until,created_by,created_at)
		                   VALUES(?,?,?,?,?,?,?,?)`,
			t.ID, p.ID, scope, ref, body.Reason, until, u.ID, time.Now().Unix())
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "could not save that block")
			return
		}
		// If they're in there right now, don't wait for them to walk into it.
		sendOrder(t.ID, &order{
			Type: "kick", Reason: body.Reason, From: u.DisplayName,
			ProjectID: p.ID, Area: scope, Ref: ref,
		})
		logAudit(u, p.ID, "ban", t.Username+" from "+scope+" "+ref)
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "bans": listBans(u)})

	case "unban", "bantime":
		var ownerID int64
		var targetID int64
		err := db.QueryRow(`SELECT p.owner_id, b.user_id FROM bans b
		                    JOIN projects p ON p.id=b.project_id WHERE b.id=?`,
			body.BanID).Scan(&ownerID, &targetID)
		if err != nil || ownerID != u.ID {
			writeErr(w, http.StatusForbidden, "that isn't one of your blocks")
			return
		}
		if action == "unban" {
			db.Exec(`DELETE FROM bans WHERE id=?`, body.BanID)
			logAudit(u, 0, "unban", "")
		} else {
			until := int64(0)
			if body.Minutes > 0 {
				until = time.Now().Add(time.Duration(body.Minutes) * time.Minute).Unix()
			}
			db.Exec(`UPDATE bans SET until=? WHERE id=?`, until, body.BanID)
			logAudit(u, 0, "ban_time", "")
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "bans": listBans(u)})

	default:
		writeErr(w, http.StatusNotFound, "not found")
	}
}
