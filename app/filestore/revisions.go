package main

// Document history — periodic snapshots of text files and pages.
//
// Every save offers a snapshot, but at most one a minute per document survives:
// within that minute the newest save replaces the pending one. That keeps a
// two-day window at a size the box can carry (a busy afternoon on one document
// is ~500 rows, not one per keystroke) while still being fine-grained enough to
// undo "I pasted over the whole thing".
//
// Only text is kept. A binary upload would put megabytes into SQLite for no
// gain, and the editor can't show it anyway.

import (
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	revisionWindow   = 48 * time.Hour // how far back history reaches
	maxRevisionBytes = 256 << 10
)

// Seconds within which two saves of the same document fold into one snapshot.
// A minute in production; the test suite turns it down so it doesn't have to
// wait one out.
var revisionEvery = int64(60)

func init() {
	if n := atoi64(env("FILESTORE_REVISION_SECONDS", "")); n > 0 {
		revisionEvery = n
	}
}

type Revision struct {
	ID      int64  `json:"id"`
	At      int64  `json:"at"`
	By      string `json:"by"`
	Size    int    `json:"size"`
	Content string `json:"content,omitempty"`
}

// recordRevision stores the state a document was just saved in. Failures are
// deliberately silent: history is a convenience, and losing a snapshot must
// never turn into a failed save.
func recordRevision(projectID int64, kind, ref, content string, u *User) {
	if len(content) > maxRevisionBytes {
		return
	}
	now := time.Now().Unix()
	name := ""
	var uid any
	if u != nil {
		name, uid = u.DisplayName, u.ID
	}
	var id, at int64
	err := db.QueryRow(`SELECT id, at FROM revisions
	                    WHERE project_id=? AND kind=? AND ref=? ORDER BY at DESC LIMIT 1`,
		projectID, kind, ref).Scan(&id, &at)
	if err == nil && now-at < revisionEvery {
		db.Exec(`UPDATE revisions SET content=?, at=?, user_id=?, username=? WHERE id=?`,
			content, now, uid, name, id)
		return
	}
	db.Exec(`INSERT INTO revisions(project_id,kind,ref,content,at,user_id,username)
	         VALUES(?,?,?,?,?,?,?)`, projectID, kind, ref, content, now, uid, name)
	db.Exec(`DELETE FROM revisions WHERE project_id=? AND kind=? AND ref=? AND at<?`,
		projectID, kind, ref, now-int64(revisionWindow.Seconds()))
}

// Housekeeping for documents nobody has saved lately, which the per-save prune
// above would never reach.
func sweepRevisions() {
	db.Exec(`DELETE FROM revisions WHERE at < ?`, time.Now().Add(-revisionWindow).Unix())
}

// renameRevisions keeps a file's history attached to it when it moves.
func renameRevisions(projectID int64, from, to string) {
	db.Exec(`UPDATE revisions SET ref=? WHERE project_id=? AND kind='file' AND ref=?`,
		to, projectID, from)
	// Descendants of a renamed folder, with the same escaping care the file
	// index needs (an underscore is a LIKE wildcard and a legal filename byte).
	db.Exec(`UPDATE revisions SET ref = ? || substr(ref, ?)
	         WHERE project_id=? AND kind='file' AND ref LIKE ? ESCAPE '\'`,
		to, len([]rune(from))+1, projectID, likeEscape(from)+"/%")
}

func dropRevisions(projectID int64, kind, ref string) {
	db.Exec(`DELETE FROM revisions WHERE project_id=? AND kind=? AND ref=?`, projectID, kind, ref)
}

/* -------------------------------------------- /api/projects/<id>/history */

// GET  ?kind=file&ref=manifest.json          the list of snapshots
// GET  ?kind=file&ref=manifest.json&rev=12   one snapshot's content
// POST {kind,ref,rev}                        put that snapshot back
func handleHistory(w http.ResponseWriter, r *http.Request, u *User, p *Project) {
	q := r.URL.Query()
	kind, ref := q.Get("kind"), q.Get("ref")
	if r.Method == http.MethodPost {
		var body struct {
			Kind string `json:"kind"`
			Ref  string `json:"ref"`
			Rev  int64  `json:"rev"`
		}
		if err := readJSON(r, &body); err != nil {
			writeErr(w, http.StatusBadRequest, "bad request")
			return
		}
		restoreRevision(w, u, p, body.Kind, body.Ref, body.Rev)
		return
	}
	if r.Method != http.MethodGet {
		writeErr(w, http.StatusMethodNotAllowed, "GET or POST")
		return
	}
	if !canReadDoc(w, u, p, kind, ref) {
		return
	}
	if rev := atoi64(q.Get("rev")); rev > 0 {
		var out Revision
		err := db.QueryRow(`SELECT id, at, username, content FROM revisions
		                    WHERE id=? AND project_id=? AND kind=? AND ref=?`,
			rev, p.ID, kind, ref).Scan(&out.ID, &out.At, &out.By, &out.Content)
		if err != nil {
			writeErr(w, http.StatusNotFound, "no such version")
			return
		}
		out.Size = len(out.Content)
		writeJSON(w, http.StatusOK, map[string]any{"revision": out})
		return
	}

	rows, err := db.Query(`SELECT id, at, username, length(content) FROM revisions
	                       WHERE project_id=? AND kind=? AND ref=? ORDER BY at DESC`,
		p.ID, kind, ref)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not read the history")
		return
	}
	defer rows.Close()
	out := []Revision{}
	for rows.Next() {
		var rev Revision
		if rows.Scan(&rev.ID, &rev.At, &rev.By, &rev.Size) == nil {
			out = append(out, rev)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"revisions": out, "kind": kind, "ref": ref,
		"keptHours": int(revisionWindow.Hours()),
	})
}

// canReadDoc mirrors the permission the document itself has: history must not
// become a side door onto a page somebody can't open.
func canReadDoc(w http.ResponseWriter, u *User, p *Project, kind, ref string) bool {
	switch kind {
	case "file":
		if _, err := cleanRelPath(ref); err != nil {
			writeErr(w, http.StatusBadRequest, err.Error())
			return false
		}
		return !banBlocked(w, u, p.ID, "file", ref)
	case "page":
		g, err := pageByID(p.ID, atoi64(ref))
		if err != nil || !canSeePage(u, p, g.Access) {
			writeErr(w, http.StatusNotFound, "no such page")
			return false
		}
		return !banBlocked(w, u, p.ID, "page", ref)
	}
	writeErr(w, http.StatusBadRequest, "history is kept for files and pages")
	return false
}

func restoreRevision(w http.ResponseWriter, u *User, p *Project, kind, ref string, rev int64) {
	if !canReadDoc(w, u, p, kind, ref) {
		return
	}
	var content string
	if err := db.QueryRow(`SELECT content FROM revisions
	                       WHERE id=? AND project_id=? AND kind=? AND ref=?`,
		rev, p.ID, kind, ref).Scan(&content); err != nil {
		writeErr(w, http.StatusNotFound, "no such version")
		return
	}

	switch kind {
	case "file":
		if !requireWrite(w, u, p) {
			return
		}
		rel, err := cleanRelPath(ref)
		if err != nil {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
		storeMu.Lock()
		_, err = writeFile(p, rel, strings.NewReader(content), u.ID)
		storeMu.Unlock()
		if err == errQuota {
			writeErr(w, http.StatusInsufficientStorage, "restoring that would exceed the storage limit")
			return
		}
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "could not restore: "+err.Error())
			return
		}
	case "page":
		g, err := pageByID(p.ID, atoi64(ref))
		if err != nil || !canEditPage(u, p, g.Access) {
			writeErr(w, http.StatusForbidden, "your account can't edit this page")
			return
		}
		// The snapshot was filtered when it was saved, but it is about to be
		// rendered again — so it gets checked again.
		if err := validatePageHTML(content); err != nil {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
		db.Exec(`UPDATE pages SET html=?, updated_at=?, updated_by=? WHERE id=?`,
			content, time.Now().Unix(), u.ID, g.ID)
	}
	// The restore is itself a save, so it becomes the newest snapshot — which
	// means restoring the wrong version is undoable too.
	recordRevision(p.ID, kind, ref, content, u)
	logAudit(u, p.ID, "restore", kind+" "+ref+" to #"+strconv.FormatInt(rev, 10))
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
