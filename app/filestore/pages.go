package main

// Pages — rich-text documents that belong to a project but are not files.
//
// They live entirely in SQLite: nothing is written to the project directory, so
// pages never appear in the file listing, the zip export or the quota sum. That
// is deliberate — a page is a note about the add-on, not part of it.
//
// Only the owning lead can create, rename, delete or re-share a page. Each page
// carries its own access setting saying what the project's other users may do
// with it; admin stays read-only here as it is everywhere else.

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	maxPageBytes = 256 << 10 // per page; the editor is for prose, not archives
	maxPages     = 200       // per project
)

// Access settings, least to most open.
const (
	pageLeadOnly = "lead" // only the lead who owns the project
	pageView     = "view" // project users may read it
	pageEdit     = "edit" // project users may read and write it
)

func validAccess(a string) bool {
	return a == pageLeadOnly || a == pageView || a == pageEdit
}

type Page struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	Access    string `json:"access"`
	HTML      string `json:"html"`
	CreatedAt int64  `json:"createdAt"`
	UpdatedAt int64  `json:"updatedAt"`
	UpdatedBy string `json:"updatedBy"`
	CanEdit   bool   `json:"canEdit"`
}

/* ----------------------------------------------------------- permissions */

// canSeePage: the owning lead always can, admin can (read-only oversight, same
// as every other project view), and everyone else only when the page is shared.
func canSeePage(u *User, p *Project, access string) bool {
	if canManage(u, p) || u.Role == "admin" {
		return true
	}
	return access != pageLeadOnly
}

func canEditPage(u *User, p *Project, access string) bool {
	if u.Role == "admin" {
		return false
	}
	if canManage(u, p) {
		return true
	}
	return access == pageEdit
}

// requireLead guards the three page actions reserved for the owning lead:
// creating, renaming/re-sharing and deleting.
func requireLead(w http.ResponseWriter, u *User, p *Project) bool {
	if canManage(u, p) {
		return true
	}
	writeErr(w, http.StatusForbidden, "only the lead who owns this project can manage pages")
	return false
}

/* ----------------------------------------------------------------- query */

const pageSelect = `
SELECT g.id, g.name, g.access, g.html, g.created_at, g.updated_at,
       COALESCE(NULLIF(u.display_name,''), u.username, '')
FROM pages g LEFT JOIN users u ON u.id = g.updated_by`

func scanPage(row interface{ Scan(...any) error }) (*Page, error) {
	var g Page
	err := row.Scan(&g.ID, &g.Name, &g.Access, &g.HTML, &g.CreatedAt, &g.UpdatedAt, &g.UpdatedBy)
	if err != nil {
		return nil, err
	}
	return &g, nil
}

// pageByID scopes the lookup to the project from the URL, so a page id from
// another project can't be reached by guessing.
func pageByID(projectID, id int64) (*Page, error) {
	return scanPage(db.QueryRow(pageSelect+` WHERE g.id=? AND g.project_id=?`, id, projectID))
}

/* --------------------------------------------- /api/projects/<id>/pages */

func handlePages(w http.ResponseWriter, r *http.Request, u *User, p *Project, rest []string) {
	if len(rest) == 0 {
		switch r.Method {
		case http.MethodGet:
			listPages(w, u, p)
		case http.MethodPost:
			createPage(w, r, u, p)
		default:
			writeErr(w, http.StatusMethodNotAllowed, "GET or POST")
		}
		return
	}
	if len(rest) > 1 {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	g, err := pageByID(p.ID, atoi64(rest[0]))
	if err != nil || !canSeePage(u, p, g.Access) {
		// 404 rather than 403 for a page that isn't shared: a user shouldn't
		// learn it exists, matching how ungranted projects behave.
		writeErr(w, http.StatusNotFound, "no such page")
		return
	}
	g.CanEdit = canEditPage(u, p, g.Access)
	if banBlocked(w, u, p.ID, "page", rest[0]) {
		return
	}

	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, map[string]any{"page": g})
	case http.MethodPut:
		savePage(w, r, u, p, g)
	case http.MethodPatch:
		patchPage(w, r, u, p, g)
	case http.MethodDelete:
		deletePage(w, u, p, g)
	default:
		writeErr(w, http.StatusMethodNotAllowed, "bad method")
	}
}

// listPages returns metadata only — the body of a page is fetched when it is
// opened, so a project with a hundred long pages still lists instantly.
func listPages(w http.ResponseWriter, u *User, p *Project) {
	rows, err := db.Query(`SELECT g.id, g.name, g.access, '', g.created_at, g.updated_at,
	                         COALESCE(NULLIF(u.display_name,''), u.username, '')
	                       FROM pages g LEFT JOIN users u ON u.id = g.updated_by
	                       WHERE g.project_id=? ORDER BY g.name COLLATE NOCASE`, p.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not list pages")
		return
	}
	defer rows.Close()

	out := []*Page{}
	for rows.Next() {
		g, err := scanPage(rows)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "could not read pages")
			return
		}
		if !canSeePage(u, p, g.Access) {
			continue
		}
		g.CanEdit = canEditPage(u, p, g.Access)
		out = append(out, g)
	}
	writeJSON(w, http.StatusOK, map[string]any{"pages": out, "canManage": canManage(u, p)})
}

func createPage(w http.ResponseWriter, r *http.Request, u *User, p *Project) {
	if !requireLead(w, u, p) {
		return
	}
	var body struct {
		Name   string `json:"name"`
		Access string `json:"access"`
	}
	if err := readJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request")
		return
	}
	name, err := cleanPageName(body.Name)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if body.Access == "" {
		body.Access = pageView
	}
	if !validAccess(body.Access) {
		writeErr(w, http.StatusBadRequest, "unknown access setting")
		return
	}
	var n int
	db.QueryRow(`SELECT COUNT(*) FROM pages WHERE project_id=?`, p.ID).Scan(&n)
	if n >= maxPages {
		writeErr(w, http.StatusBadRequest,
			fmt.Sprintf("this project already has the maximum of %d pages", maxPages))
		return
	}

	now := time.Now().Unix()
	res, err := db.Exec(`INSERT INTO pages(project_id,name,html,access,created_at,updated_at,updated_by)
	                     VALUES(?,?,'',?,?,?,?)`, p.ID, name, body.Access, now, now, u.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not create the page")
		return
	}
	id, _ := res.LastInsertId()
	logAudit(u, p.ID, "page_create", name)
	g, err := pageByID(p.ID, id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not read the new page")
		return
	}
	g.CanEdit = true
	writeJSON(w, http.StatusOK, map[string]any{"page": g})
}

func savePage(w http.ResponseWriter, r *http.Request, u *User, p *Project, g *Page) {
	if !g.CanEdit {
		writeErr(w, http.StatusForbidden, "your account can't edit this page")
		return
	}
	var body struct {
		HTML string `json:"html"`
		// The version the editor started from; see the file editor's save for
		// why this matters once two people share a document.
		Base  int64 `json:"base"`
		Force bool  `json:"force"`
	}
	if err := readJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request")
		return
	}
	if body.Base > 0 && g.UpdatedAt != body.Base && !body.Force {
		writeJSON(w, http.StatusConflict, map[string]any{
			"error": "someone else saved this page while you were writing",
			"code":  "conflict", "at": g.UpdatedAt, "by": g.UpdatedBy,
		})
		return
	}
	if len(body.HTML) > maxPageBytes {
		writeErr(w, http.StatusBadRequest, "this page is too long — split it into two pages")
		return
	}
	// The editor already filters what it sends; this is the backstop for anything
	// posted straight at the API, because the saved markup is later rendered back
	// into the app on this origin.
	if err := validatePageHTML(body.HTML); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	_, err := db.Exec(`UPDATE pages SET html=?, updated_at=?, updated_by=? WHERE id=?`,
		body.HTML, time.Now().Unix(), u.ID, g.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not save the page")
		return
	}
	recordRevision(p.ID, "page", strconv.FormatInt(g.ID, 10), body.HTML, u)
	logAudit(u, p.ID, "page_save", g.Name)
	ng, _ := pageByID(p.ID, g.ID)
	if ng != nil {
		ng.CanEdit = true
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "page": ng})
}

// patchPage covers the two lead-only settings: the page's name and who else may
// read or write it.
func patchPage(w http.ResponseWriter, r *http.Request, u *User, p *Project, g *Page) {
	if !requireLead(w, u, p) {
		return
	}
	var body struct {
		Name   *string `json:"name"`
		Access *string `json:"access"`
	}
	if err := readJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request")
		return
	}
	if body.Name != nil {
		name, err := cleanPageName(*body.Name)
		if err != nil {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
		db.Exec(`UPDATE pages SET name=? WHERE id=?`, name, g.ID)
		logAudit(u, p.ID, "page_rename", g.Name+" -> "+name)
	}
	if body.Access != nil {
		if !validAccess(*body.Access) {
			writeErr(w, http.StatusBadRequest, "unknown access setting")
			return
		}
		db.Exec(`UPDATE pages SET access=? WHERE id=?`, *body.Access, g.ID)
		logAudit(u, p.ID, "page_access", g.Name+"="+*body.Access)
	}
	ng, err := pageByID(p.ID, g.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not read the page")
		return
	}
	ng.CanEdit = true
	writeJSON(w, http.StatusOK, map[string]any{"page": ng})
}

func deletePage(w http.ResponseWriter, u *User, p *Project, g *Page) {
	if !requireLead(w, u, p) {
		return
	}
	if _, err := db.Exec(`DELETE FROM pages WHERE id=?`, g.ID); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not delete the page")
		return
	}
	dropRevisions(p.ID, "page", strconv.FormatInt(g.ID, 10))
	logAudit(u, p.ID, "page_delete", g.Name)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func cleanPageName(s string) (string, error) {
	name := strings.TrimSpace(s)
	// Control characters would make the list unreadable, and a newline in a name
	// breaks the single-line row it is rendered into.
	name = strings.Map(func(r rune) rune {
		if r < 0x20 || r == 0x7f {
			return -1
		}
		return r
	}, name)
	if name == "" || len([]rune(name)) > 80 {
		return "", errors.New("page name must be 1-80 characters")
	}
	return name, nil
}

/* ------------------------------------------------------ markup allow-list */

// Tags the editor can produce. Everything else is refused rather than quietly
// stripped: the front end sends already-filtered markup, so anything outside
// this set means the request didn't come from the editor.
var pageTags = map[string]bool{
	"p": true, "br": true, "div": true, "span": true,
	"b": true, "strong": true, "i": true, "em": true, "u": true,
	"s": true, "strike": true, "del": true,
	"h1": true, "h2": true, "h3": true,
	"ul": true, "ol": true, "li": true,
	"blockquote": true, "pre": true, "code": true, "a": true, "hr": true,
}

func isSpaceByte(c byte) bool {
	return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f'
}

func isNameByte(c byte) bool {
	return c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9'
}

var errBadMarkup = errors.New("that page contains markup this editor doesn't support")

// validatePageHTML walks the markup and refuses anything outside the allow-list:
// unknown tags, any attribute other than a link's href/target/rel, and any href
// that isn't plainly a web or mail link. Text is not examined — the browser
// escapes "<" in prose before it ever reaches here.
func validatePageHTML(s string) error {
	for i := 0; i < len(s); i++ {
		if s[i] != '<' {
			continue
		}
		j := i + 1
		closing := j < len(s) && s[j] == '/'
		if closing {
			j++
		}
		start := j
		for j < len(s) && isNameByte(s[j]) {
			j++
		}
		name := strings.ToLower(s[start:j])
		if name == "" {
			return errBadMarkup // "<!--", "<!doctype", a stray "<"
		}
		if !pageTags[name] {
			return fmt.Errorf("that page uses <%s>, which this editor doesn't support", name)
		}

		// Attributes, up to the closing ">".
		for j < len(s) && s[j] != '>' {
			for j < len(s) && (isSpaceByte(s[j]) || s[j] == '/') {
				j++
			}
			if j >= len(s) || s[j] == '>' {
				break
			}
			as := j
			for j < len(s) && s[j] != '=' && s[j] != '>' && !isSpaceByte(s[j]) {
				j++
			}
			attr := strings.ToLower(s[as:j])

			val := ""
			k := j
			for k < len(s) && isSpaceByte(s[k]) {
				k++
			}
			if k < len(s) && s[k] == '=' {
				k++
				for k < len(s) && isSpaceByte(s[k]) {
					k++
				}
				if k < len(s) && (s[k] == '"' || s[k] == '\'') {
					q := s[k]
					k++
					vs := k
					for k < len(s) && s[k] != q {
						k++
					}
					if k >= len(s) {
						return errBadMarkup // unterminated attribute value
					}
					val = s[vs:k]
					k++
				} else {
					vs := k
					for k < len(s) && !isSpaceByte(s[k]) && s[k] != '>' {
						k++
					}
					val = s[vs:k]
				}
				j = k
			}

			if closing || name != "a" {
				return fmt.Errorf("that page sets %q on <%s>, which this editor doesn't support", attr, name)
			}
			switch attr {
			case "href":
				if !safeHref(val) {
					return errors.New("a link in that page points somewhere this editor doesn't allow")
				}
			case "target", "rel":
				// Fixed values the editor writes on external links.
			default:
				return fmt.Errorf("that page sets %q on a link, which this editor doesn't support", attr)
			}
		}
		if j >= len(s) {
			return errBadMarkup // unterminated tag
		}
		i = j
	}
	return nil
}

// safeHref allows web and mail links plus in-app relative ones. Anything with
// another scheme — javascript:, data:, vbscript: — is refused. Control
// characters are stripped first because browsers ignore them in URLs, so
// "java\nscript:" would otherwise slip through.
func safeHref(v string) bool {
	var b strings.Builder
	for i := 0; i < len(v); i++ {
		if v[i] > 0x20 {
			b.WriteByte(v[i])
		}
	}
	s := strings.ToLower(b.String())
	if s == "" {
		return false
	}
	if strings.HasPrefix(s, "http://") || strings.HasPrefix(s, "https://") ||
		strings.HasPrefix(s, "mailto:") {
		return true
	}
	// A relative link can't carry a scheme, so anything before the first "/" or
	// "#" containing a colon is rejected.
	if strings.HasPrefix(s, "/") || strings.HasPrefix(s, "#") {
		return true
	}
	return false
}
