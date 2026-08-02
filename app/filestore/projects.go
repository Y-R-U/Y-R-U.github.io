package main

import (
	"archive/zip"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

/* ------------------------------------------------------------- access */

// canAccess reports whether u may see a project. Admins can see all of them for
// oversight and quota setting, a lead owns the projects they created, and
// everyone else needs an explicit grant.
func canAccess(u *User, p *Project) bool {
	if u.Role == "admin" || p.OwnerID == u.ID {
		return true
	}
	var n int
	db.QueryRow(`SELECT COUNT(*) FROM project_members WHERE project_id=? AND user_id=?`,
		p.ID, u.ID).Scan(&n)
	return n > 0
}

// canManage reports whether u may rename, delete or change the membership of a
// project. Only the lead who owns it can — admin deliberately cannot, so the
// account that configures the server can't quietly destroy a team's work.
func canManage(u *User, p *Project) bool {
	return u.Role == "lead" && p.OwnerID == u.ID
}

// canWrite reports whether u may add, edit or delete files. Admin is an
// operator account, not a collaborator, so it is read-only on project contents.
func canWrite(u *User, p *Project) bool {
	return u.Role != "admin" && canAccess(u, p)
}

// requireWrite guards every file-mutating handler.
func requireWrite(w http.ResponseWriter, u *User, p *Project) bool {
	if canWrite(u, p) {
		return true
	}
	writeErr(w, http.StatusForbidden, "your account can't change files in this project")
	return false
}

// loadProject resolves the :id in a route and enforces access in one step.
func loadProject(w http.ResponseWriter, u *User, idStr string) *Project {
	p, err := projectByID(atoi64(idStr))
	if err != nil {
		writeErr(w, http.StatusNotFound, "no such project")
		return nil
	}
	if !canAccess(u, p) {
		// 404 rather than 403: a user with no grant shouldn't learn the project exists.
		writeErr(w, http.StatusNotFound, "no such project")
		return nil
	}
	return p
}

var slugBad = regexp.MustCompile(`[^a-z0-9]+`)

func makeSlug(name string) string {
	s := slugBad.ReplaceAllString(strings.ToLower(name), "-")
	s = strings.Trim(s, "-")
	if len(s) > 48 {
		s = s[:48]
	}
	if s == "" {
		s = "project"
	}
	return s
}

/* ---------------------------------------------------- /api/projects */

func handleProjects(w http.ResponseWriter, r *http.Request, u *User) {
	switch r.Method {
	case http.MethodGet:
		listProjects(w, r, u)
	case http.MethodPost:
		createProject(w, r, u)
	default:
		writeErr(w, http.StatusMethodNotAllowed, "GET or POST")
	}
}

func listProjects(w http.ResponseWriter, r *http.Request, u *User) {
	var (
		rows *sql.Rows
		err  error
	)
	if u.Role == "admin" {
		// Admin sees every project, optionally narrowed to one lead's — the
		// "?owner=<id>" filter behind the lead picker in the admin view.
		if owner := atoi64(r.URL.Query().Get("owner")); owner > 0 {
			rows, err = db.Query(projectSelect+` WHERE p.owner_id=? ORDER BY p.name COLLATE NOCASE`, owner)
		} else {
			rows, err = db.Query(projectSelect + ` ORDER BY p.name COLLATE NOCASE`)
		}
	} else {
		rows, err = db.Query(projectSelect+`
			WHERE p.owner_id=? OR p.id IN (SELECT project_id FROM project_members WHERE user_id=?)
			ORDER BY p.name COLLATE NOCASE`, u.ID, u.ID)
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not list projects")
		return
	}
	defer rows.Close()

	out := []*Project{}
	for rows.Next() {
		p, err := scanProject(rows)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "could not read projects")
			return
		}
		out = append(out, p)
	}

	resp := map[string]any{"projects": out, "canCreate": u.Role == "lead"}
	if u.Role == "admin" {
		resp["leads"] = listLeads()
	}
	writeJSON(w, http.StatusOK, resp)
}

// listLeads powers the admin's "filter by lead" picker.
func listLeads() []map[string]any {
	out := []map[string]any{}
	rows, err := db.Query(`SELECT u.id, u.username,
	                         (SELECT COUNT(*) FROM projects p WHERE p.owner_id=u.id)
	                       FROM users u WHERE u.role='lead' ORDER BY u.username COLLATE NOCASE`)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var id, n int64
		var name string
		if rows.Scan(&id, &name, &n) == nil {
			out = append(out, map[string]any{"id": id, "username": name, "projects": n})
		}
	}
	return out
}

func createProject(w http.ResponseWriter, r *http.Request, u *User) {
	// Creating projects is a lead-only action, by design.
	if u.Role != "lead" {
		writeErr(w, http.StatusForbidden, "only a lead can create projects")
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if err := readJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request")
		return
	}
	body.Name = strings.TrimSpace(body.Name)
	if body.Name == "" || len(body.Name) > 80 {
		writeErr(w, http.StatusBadRequest, "project name must be 1-80 characters")
		return
	}
	// New projects always start at the admin-configured default limit; only an
	// admin can raise an individual project's quota afterwards.
	quota := defaultQuota()

	// Slugs are unique; a collision just gets a numeric suffix.
	base := makeSlug(body.Name)
	slug := base
	for i := 2; ; i++ {
		var n int
		db.QueryRow(`SELECT COUNT(*) FROM projects WHERE slug=?`, slug).Scan(&n)
		if n == 0 {
			break
		}
		slug = fmt.Sprintf("%s-%d", base, i)
	}

	res, err := db.Exec(`INSERT INTO projects(name,slug,owner_id,quota_bytes,created_at)
	                     VALUES(?,?,?,?,?)`, body.Name, slug, u.ID, quota, time.Now().Unix())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not create project")
		return
	}
	id, _ := res.LastInsertId()
	if err := os.MkdirAll(projectDir(id), 0o755); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not create project folder")
		return
	}
	logAudit(u, id, "project_create", body.Name)
	p, _ := projectByID(id)
	writeJSON(w, http.StatusOK, map[string]any{"project": p})
}

/* ------------------------------------------------ /api/projects/<id>/... */

func handleProjectSub(w http.ResponseWriter, r *http.Request, u *User) {
	parts := pathParts(r, "/api/projects/")
	if len(parts) == 0 {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	p := loadProject(w, u, parts[0])
	if p == nil {
		return
	}
	action := ""
	if len(parts) > 1 {
		action = parts[1]
	}

	switch action {
	case "": // GET metadata, PATCH settings, DELETE the project
		switch r.Method {
		case http.MethodGet:
			writeJSON(w, http.StatusOK, map[string]any{
				"project": p, "canManage": canManage(u, p), "role": u.Role,
			})
		case http.MethodPatch:
			patchProject(w, r, u, p)
		case http.MethodDelete:
			deleteProject(w, u, p)
		default:
			writeErr(w, http.StatusMethodNotAllowed, "bad method")
		}
	case "files":
		handleFiles(w, r, u, p)
	case "upload":
		handleUpload(w, r, u, p)
	case "zip":
		handleProjectZip(w, r, u, p)
	case "import":
		handleImportZip(w, r, u, p)
	case "members":
		handleMembers(w, r, u, p)
	case "reindex":
		// Maintenance, not authoring: the owning lead or an admin may heal a
		// drifted index.
		if r.Method != http.MethodPost {
			// POST only: a state-changing GET is reachable by cross-site
			// top-level navigation, which SameSite=Lax still carries the cookie on.
			writeErr(w, http.StatusMethodNotAllowed, "POST only")
			return
		}
		if !canManage(u, p) && u.Role != "admin" {
			writeErr(w, http.StatusForbidden, "not allowed")
			return
		}
		storeMu.Lock()
		err := reindex(p.ID)
		storeMu.Unlock()
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "reindex failed: "+err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	default:
		writeErr(w, http.StatusNotFound, "not found")
	}
}

// bytes stored / files held, as the UI shows them.
func projectSummary(p *Project) map[string]any {
	return map[string]any{"used": p.UsedBytes, "quota": p.QuotaBytes, "files": p.FileCount}
}

// patchProject handles the two independently-permissioned edits: the owning
// lead may rename, and only an admin may change the storage limit (it spends
// shared disk).
func patchProject(w http.ResponseWriter, r *http.Request, u *User, p *Project) {
	var body struct {
		Name  *string `json:"name"`
		Quota *int64  `json:"quota"`
	}
	if err := readJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request")
		return
	}
	if body.Name != nil {
		if !canManage(u, p) {
			writeErr(w, http.StatusForbidden, "only the lead who owns this project can rename it")
			return
		}
		name := strings.TrimSpace(*body.Name)
		if name == "" || len(name) > 80 {
			writeErr(w, http.StatusBadRequest, "project name must be 1-80 characters")
			return
		}
		db.Exec(`UPDATE projects SET name=? WHERE id=?`, name, p.ID)
	}
	if body.Quota != nil {
		if u.Role != "admin" {
			writeErr(w, http.StatusForbidden, "only an admin can change the storage limit")
			return
		}
		if *body.Quota < 1<<20 {
			writeErr(w, http.StatusBadRequest, "limit must be at least 1 MB")
			return
		}
		db.Exec(`UPDATE projects SET quota_bytes=? WHERE id=?`, *body.Quota, p.ID)
	}
	logAudit(u, p.ID, "project_update", p.Name)
	np, _ := projectByID(p.ID)
	writeJSON(w, http.StatusOK, map[string]any{"project": np})
}

func deleteProject(w http.ResponseWriter, u *User, p *Project) {
	if !canManage(u, p) {
		writeErr(w, http.StatusForbidden, "only the lead who owns this project can delete it")
		return
	}
	storeMu.Lock()
	defer storeMu.Unlock()

	// This is the one operation that can destroy a whole team's work, so it gets
	// a rollback point: move the directory aside first (atomic, same filesystem),
	// commit the delete, and only then remove the bytes. If anything fails before
	// the commit the directory goes back and the project is untouched.
	dir := projectDir(p.ID)
	trash := dir + ".trash"
	os.RemoveAll(trash) // a leftover from an earlier interrupted delete
	staged := false
	if _, err := os.Stat(dir); err == nil {
		if err := os.Rename(dir, trash); err != nil {
			writeErr(w, http.StatusInternalServerError, "could not delete project files")
			return
		}
		staged = true
	}
	if _, err := db.Exec(`DELETE FROM projects WHERE id=?`, p.ID); err != nil {
		if staged {
			os.Rename(trash, dir)
		}
		writeErr(w, http.StatusInternalServerError, "could not delete project")
		return
	}
	// Cascades depend on foreign_keys being on; delete explicitly so the rows
	// go regardless of pragma state.
	db.Exec(`DELETE FROM files WHERE project_id=?`, p.ID)
	db.Exec(`DELETE FROM project_members WHERE project_id=?`, p.ID)
	// Past the point of no return; the bytes can go. A failure here only leaves
	// an orphaned .trash directory for an operator to sweep.
	if staged {
		os.RemoveAll(trash)
	}
	logAudit(u, 0, "project_delete", p.Name)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

/* ---------------------------------------------------------------- files */

type FileEntry struct {
	Path      string `json:"path"`
	Size      int64  `json:"size"`
	UpdatedAt int64  `json:"updatedAt"`
	UpdatedBy string `json:"updatedBy"`
}

func handleFiles(w http.ResponseWriter, r *http.Request, u *User, p *Project) {
	switch r.Method {
	case http.MethodGet:
		if r.URL.Query().Get("path") != "" {
			serveOneFile(w, r, p)
			return
		}
		listFiles(w, p)
	case http.MethodPut:
		if !requireWrite(w, u, p) {
			return
		}
		saveTextFile(w, r, u, p)
	case http.MethodPost:
		if !requireWrite(w, u, p) {
			return
		}
		fileAction(w, r, u, p)
	case http.MethodDelete:
		if !requireWrite(w, u, p) {
			return
		}
		rel, err := cleanRelPath(r.URL.Query().Get("path"))
		if err != nil {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
		isDir := r.URL.Query().Get("dir") == "1"
		storeMu.Lock()
		err = deletePath(p.ID, rel, isDir)
		storeMu.Unlock()
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "could not delete: "+err.Error())
			return
		}
		logAudit(u, p.ID, "file_delete", rel)
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	default:
		writeErr(w, http.StatusMethodNotAllowed, "bad method")
	}
}

func listFiles(w http.ResponseWriter, p *Project) {
	rows, err := db.Query(`SELECT f.path, f.size, f.updated_at, COALESCE(u.username,'')
	                       FROM files f LEFT JOIN users u ON u.id=f.updated_by
	                       WHERE f.project_id=? ORDER BY f.path`, p.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not list files")
		return
	}
	defer rows.Close()
	out := []FileEntry{}
	for rows.Next() {
		var f FileEntry
		if err := rows.Scan(&f.Path, &f.Size, &f.UpdatedAt, &f.UpdatedBy); err != nil {
			writeErr(w, http.StatusInternalServerError, "could not read files")
			return
		}
		out = append(out, f)
	}
	np, _ := projectByID(p.ID)
	writeJSON(w, http.StatusOK, map[string]any{
		"files": out, "dirs": listDirs(p.ID), "project": np,
	})
}

// listDirs returns every folder in the project, relative and slash-separated.
//
// The index only tracks files, so a folder the user created but hasn't put
// anything in yet exists solely on disk — without this it would be invisible
// the moment they navigated away from it.
func listDirs(projectID int64) []string {
	root := projectDir(projectID)
	out := []string{}
	filepath.Walk(root, func(p string, info os.FileInfo, err error) error {
		if err != nil {
			// Unreadable subtree: skip it rather than failing the whole listing.
			if info != nil && info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if !info.IsDir() || p == root {
			return nil
		}
		rel, rerr := filepath.Rel(root, p)
		if rerr != nil {
			return nil
		}
		out = append(out, filepath.ToSlash(rel))
		return nil
	})
	sort.Strings(out)
	return out
}

// Extensions we are willing to open in the browser's text editor. Anything else
// is download-only — the editor would corrupt a binary on save.
var textExt = map[string]bool{
	".json": true, ".txt": true, ".md": true, ".js": true, ".mjs": true, ".ts": true,
	".css": true, ".html": true, ".htm": true, ".xml": true, ".yml": true, ".yaml": true,
	".mcfunction": true, ".lang": true, ".properties": true, ".csv": true, ".ini": true,
	".cfg": true, ".conf": true, ".sh": true, ".py": true, ".go": true, ".toml": true,
	".gitignore": true, ".env": true, ".log": true, ".material": true, ".fragment": true,
	".vertex": true, ".glsl": true, ".svg": true,
}

func isTextPath(rel string) bool {
	return textExt[strings.ToLower(path.Ext(rel))]
}

const maxEditBytes = 2 << 20 // refuse to open anything larger in the editor

func serveOneFile(w http.ResponseWriter, r *http.Request, p *Project) {
	rel, err := cleanRelPath(r.URL.Query().Get("path"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	abs, err := absFor(p.ID, rel)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	st, err := os.Stat(abs)
	if err != nil || st.IsDir() {
		writeErr(w, http.StatusNotFound, "no such file")
		return
	}

	if r.URL.Query().Get("mode") == "text" {
		if !isTextPath(rel) {
			writeErr(w, http.StatusBadRequest, "this file type can't be edited as text")
			return
		}
		if st.Size() > maxEditBytes {
			writeErr(w, http.StatusBadRequest, "file is too large to edit in the browser")
			return
		}
		b, err := os.ReadFile(abs)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "could not read file")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"path": rel, "content": string(b), "size": st.Size(),
		})
		return
	}

	ct := mime.TypeByExtension(path.Ext(rel))
	if ct == "" {
		ct = "application/octet-stream"
	}
	w.Header().Set("Content-Type", ct)
	// Everything here is user-uploaded, so it must never be treated as active
	// content on our own origin, and never sniffed into something executable.
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox")
	disp := "attachment"
	if r.URL.Query().Get("inline") == "1" && safeInline(ct) {
		disp = "inline"
	}
	w.Header().Set("Content-Disposition", fmt.Sprintf(`%s; filename*=UTF-8''%s`,
		disp, urlEscape(path.Base(rel))))
	http.ServeFile(w, r, abs)
}

// Only media we are confident the browser will render rather than execute may
// be shown inline; HTML and SVG are deliberately excluded.
func safeInline(ct string) bool {
	return strings.HasPrefix(ct, "image/") && !strings.Contains(ct, "svg") ||
		strings.HasPrefix(ct, "video/") ||
		strings.HasPrefix(ct, "audio/") ||
		ct == "application/pdf"
}

func urlEscape(s string) string {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' ||
			c == '.' || c == '-' || c == '_' {
			b.WriteByte(c)
		} else {
			fmt.Fprintf(&b, "%%%02X", c)
		}
	}
	return b.String()
}

func saveTextFile(w http.ResponseWriter, r *http.Request, u *User, p *Project) {
	var body struct{ Path, Content string }
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxEditBytes+(1<<16))).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "file is too large to save from the editor")
		return
	}
	rel, err := cleanRelPath(body.Path)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if !isTextPath(rel) {
		writeErr(w, http.StatusBadRequest, "this file type can't be edited as text")
		return
	}
	storeMu.Lock()
	n, err := writeFile(p, rel, strings.NewReader(body.Content), u.ID)
	storeMu.Unlock()
	if err == errQuota {
		writeErr(w, http.StatusInsufficientStorage, "saving this would exceed the project's storage limit")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not save: "+err.Error())
		return
	}
	logAudit(u, p.ID, "file_save", rel)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "size": n})
}

// fileAction covers the small mutations that aren't uploads: new file, new
// folder, and rename/move.
func fileAction(w http.ResponseWriter, r *http.Request, u *User, p *Project) {
	var body struct{ Action, Path, To string }
	if err := readJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request")
		return
	}
	rel, err := cleanRelPath(body.Path)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}

	switch body.Action {
	case "newfile":
		abs, _ := absFor(p.ID, rel)
		if _, err := os.Stat(abs); err == nil {
			writeErr(w, http.StatusConflict, "a file already exists there")
			return
		}
		storeMu.Lock()
		_, err = writeFile(p, rel, strings.NewReader(""), u.ID)
		storeMu.Unlock()
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "could not create: "+err.Error())
			return
		}
		logAudit(u, p.ID, "file_new", rel)

	case "newfolder":
		// Empty folders exist only on disk — the index tracks files, so a folder
		// with nothing in it simply shows up from the directory listing side.
		abs, err := absFor(p.ID, rel)
		if err != nil {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
		if err := os.MkdirAll(abs, 0o755); err != nil {
			writeErr(w, http.StatusInternalServerError, "could not create folder")
			return
		}
		logAudit(u, p.ID, "folder_new", rel)

	case "rename":
		to, err := cleanRelPath(body.To)
		if err != nil {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
		abs, _ := absFor(p.ID, rel)
		st, err := os.Stat(abs)
		if err != nil {
			writeErr(w, http.StatusNotFound, "no such file")
			return
		}
		storeMu.Lock()
		err = movePath(p.ID, rel, to, st.IsDir())
		storeMu.Unlock()
		if err != nil {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
		logAudit(u, p.ID, "file_rename", rel+" -> "+to)

	default:
		writeErr(w, http.StatusBadRequest, "unknown action")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

/* --------------------------------------------------------------- upload */

func handleUpload(w http.ResponseWriter, r *http.Request, u *User, p *Project) {
	if r.Method != http.MethodPost {
		writeErr(w, http.StatusMethodNotAllowed, "POST only")
		return
	}
	if !requireWrite(w, u, p) {
		return
	}
	mr, err := r.MultipartReader()
	if err != nil {
		writeErr(w, http.StatusBadRequest, "expected a multipart upload")
		return
	}
	// Streamed part by part: a 100 MB upload never has to fit in the box's 845 MB
	// of RAM, and the quota is enforced as bytes land.
	dest := ""
	written := []string{}
	for {
		part, err := mr.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			writeErr(w, http.StatusBadRequest, "upload failed: "+err.Error())
			return
		}
		if part.FormName() == "dest" {
			b, _ := io.ReadAll(io.LimitReader(part, 512))
			dest = strings.TrimSpace(string(b))
			part.Close()
			continue
		}
		if part.FileName() == "" {
			part.Close()
			continue
		}
		// webkitRelativePath comes through in the filename for folder uploads.
		name := part.FileName()
		if dest != "" {
			name = dest + "/" + name
		}
		rel, err := cleanRelPath(name)
		if err != nil {
			part.Close()
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
		storeMu.Lock()
		_, err = writeFile(p, rel, part, u.ID)
		storeMu.Unlock()
		part.Close()
		if err == errQuota {
			writeErr(w, http.StatusInsufficientStorage,
				"upload stopped: the project's storage limit would be exceeded")
			return
		}
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "upload failed: "+err.Error())
			return
		}
		written = append(written, rel)
	}
	logAudit(u, p.ID, "upload", strconv.Itoa(len(written))+" file(s)")
	np, _ := projectByID(p.ID)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "written": written, "project": np})
}

/* ------------------------------------------------------------ zip in/out */

func handleProjectZip(w http.ResponseWriter, r *http.Request, u *User, p *Project) {
	if r.Method != http.MethodGet {
		writeErr(w, http.StatusMethodNotAllowed, "GET only")
		return
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition",
		fmt.Sprintf(`attachment; filename="%s.zip"`, p.Slug))
	// Streamed straight to the client, so a project near its 100 MB limit is
	// never buffered in memory.
	if err := zipProject(p, w); err != nil {
		// Headers are already out by now; the truncated zip is the error signal.
		logAudit(u, p.ID, "zip_download_failed", err.Error())
		return
	}
	logAudit(u, p.ID, "zip_download", "")
}

func handleImportZip(w http.ResponseWriter, r *http.Request, u *User, p *Project) {
	if r.Method != http.MethodPost {
		writeErr(w, http.StatusMethodNotAllowed, "POST only")
		return
	}
	if !requireWrite(w, u, p) {
		return
	}
	mr, err := r.MultipartReader()
	if err != nil {
		writeErr(w, http.StatusBadRequest, "expected a multipart upload")
		return
	}
	prefix := ""
	for {
		part, err := mr.NextPart()
		if err == io.EOF {
			writeErr(w, http.StatusBadRequest, "no zip file in the upload")
			return
		}
		if err != nil {
			writeErr(w, http.StatusBadRequest, "upload failed: "+err.Error())
			return
		}
		if part.FormName() == "dest" {
			b, _ := io.ReadAll(io.LimitReader(part, 512))
			prefix = strings.TrimSpace(string(b))
			part.Close()
			continue
		}
		if part.FileName() == "" {
			part.Close()
			continue
		}

		// archive/zip needs a ReaderAt, so the archive itself has to be landed
		// somewhere seekable first. Disk, not memory — a 100 MB zip would be a
		// significant chunk of this box's RAM.
		tmp, err := os.CreateTemp("", "import-*.zip")
		if err != nil {
			part.Close()
			writeErr(w, http.StatusInternalServerError, "could not stage the upload")
			return
		}
		limit := remaining(p.ID, p.QuotaBytes)
		if limit > maxUpload() {
			limit = maxUpload()
		}
		n, err := io.Copy(tmp, io.LimitReader(part, limit+1))
		part.Close()
		if err != nil {
			tmp.Close()
			os.Remove(tmp.Name())
			writeErr(w, http.StatusBadRequest, "upload failed: "+err.Error())
			return
		}
		if n > limit {
			tmp.Close()
			os.Remove(tmp.Name())
			writeErr(w, http.StatusInsufficientStorage,
				"that archive is larger than the space left in this project")
			return
		}

		zr, err := zip.NewReader(tmp, n)
		if err != nil {
			tmp.Close()
			os.Remove(tmp.Name())
			writeErr(w, http.StatusBadRequest, "that file isn't a readable zip archive")
			return
		}
		storeMu.Lock()
		count, err := unzipInto(p, zr, prefix, u.ID)
		storeMu.Unlock()
		tmp.Close()
		os.Remove(tmp.Name())

		if err == errQuota {
			writeErr(w, http.StatusInsufficientStorage,
				"the archive's contents would exceed the project's storage limit")
			return
		}
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "extract failed: "+err.Error())
			return
		}
		logAudit(u, p.ID, "zip_import", strconv.Itoa(count)+" file(s)")
		np, _ := projectByID(p.ID)
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "extracted": count, "project": np})
		return
	}
}
