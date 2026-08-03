package main

import (
	"database/sql"
	"errors"
	"log"
	"strconv"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

var db *sql.DB

const schema = `
-- display_name is what everyone else sees; username stays the sign-in handle.
-- Empty means "no separate name chosen yet" and reads as the username.
CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  username     TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL DEFAULT '',
  email        TEXT NOT NULL DEFAULT '' COLLATE NOCASE,
  pass_hash    TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('admin','lead','user')),
  must_reset   INTEGER NOT NULL DEFAULT 0,
  disabled     INTEGER NOT NULL DEFAULT 0,
  created_by   INTEGER,
  created_at   INTEGER NOT NULL,
  last_login   INTEGER
);

CREATE TABLE IF NOT EXISTS projects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  owner_id    INTEGER NOT NULL REFERENCES users(id),
  quota_bytes INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);

-- Explicit grants. A project's owner (lead) and any admin always have access
-- without a row here; this table is only for the extra users a lead adds.
CREATE TABLE IF NOT EXISTS project_members (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_at   INTEGER NOT NULL,
  PRIMARY KEY (project_id, user_id)
);

-- Mirrors what is on disk. The filesystem is the source of truth for bytes;
-- this table is the index we query for listings and quota sums, so it must be
-- written in the same critical section as the file itself.
CREATE TABLE IF NOT EXISTS files (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path        TEXT NOT NULL,
  size        INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  updated_by  INTEGER,
  UNIQUE (project_id, path)
);

-- Rich-text pages. Unlike files these live only here: a page belongs to the
-- project but is never written to disk, so it stays out of the file listing,
-- the zip export and the quota. The access column says what the project's users
-- (not its lead, who always has both) may do: 'lead' hides it from them,
-- 'view' lets them read it, 'edit' lets them write it too.
CREATE TABLE IF NOT EXISTS pages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  html        TEXT NOT NULL DEFAULT '',
  access      TEXT NOT NULL DEFAULT 'view' CHECK (access IN ('lead','view','edit')),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  updated_by  INTEGER
);

-- acting_lead is the admin's "act as a lead" switch. It is per session rather
-- than per account so it dies with a sign-out and never leaks to another device.
CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  acting_lead INTEGER NOT NULL DEFAULT 0
);

-- Periodic snapshots of text files and pages, so a shared document can be
-- wound back. Only text is kept (a binary would bloat the database), at most
-- one snapshot a minute per document, and nothing older than the retention
-- window — see revisions.go.
CREATE TABLE IF NOT EXISTS revisions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('file','page')),
  ref        TEXT NOT NULL,          -- file path, or page id as text
  content    TEXT NOT NULL,
  at         INTEGER NOT NULL,
  user_id    INTEGER,
  username   TEXT NOT NULL DEFAULT ''
);

-- A lead keeping someone out of part of their project. scope 'project' ignores
-- ref; 'file' matches the path or anything under it; 'page' matches a page id.
-- until = 0 means "no time limit".
CREATE TABLE IF NOT EXISTS bans (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scope      TEXT NOT NULL CHECK (scope IN ('project','file','page')),
  ref        TEXT NOT NULL DEFAULT '',
  reason     TEXT NOT NULL DEFAULT '',
  until      INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  at         INTEGER NOT NULL,
  user_id    INTEGER,
  username   TEXT NOT NULL DEFAULT '',
  project_id INTEGER,
  action     TEXT NOT NULL,
  detail     TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_files_project  ON files(project_id);
CREATE INDEX IF NOT EXISTS idx_pages_project  ON pages(project_id);
CREATE INDEX IF NOT EXISTS idx_rev_doc        ON revisions(project_id, kind, ref, at DESC);
CREATE INDEX IF NOT EXISTS idx_bans_user      ON bans(user_id, project_id);
CREATE INDEX IF NOT EXISTS idx_members_user   ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_at       ON audit(at DESC);
`

func openDB(path string) {
	var err error
	// _busy_timeout keeps concurrent uploads from failing outright on a lock;
	// WAL lets reads continue while a large upload is committing.
	db, err = sql.Open("sqlite", path+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)")
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	// modernc's driver is not safe to hammer from many connections on a 1 vCPU
	// box, and SQLite serialises writes anyway.
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(schema); err != nil {
		log.Fatalf("schema: %v", err)
	}
	migrate()
}

// Columns added after a release. CREATE TABLE IF NOT EXISTS leaves an existing
// table alone, so each one needs its own ALTER; a duplicate-column error just
// means this database already has it.
var migrations = []string{
	`ALTER TABLE sessions ADD COLUMN acting_lead INTEGER NOT NULL DEFAULT 0`,
	`ALTER TABLE users ADD COLUMN display_name TEXT NOT NULL DEFAULT ''`,
}

func migrate() {
	for _, m := range migrations {
		if _, err := db.Exec(m); err != nil && !strings.Contains(err.Error(), "duplicate column") {
			log.Fatalf("migrate %q: %v", m, err)
		}
	}
}

/* ------------------------------------------------------------- settings */

func setting(key string, def int64) int64 {
	var v string
	if err := db.QueryRow(`SELECT value FROM settings WHERE key=?`, key).Scan(&v); err != nil {
		return def
	}
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil {
		return def
	}
	return n
}

func setSetting(key string, v int64) error {
	_, err := db.Exec(`INSERT INTO settings(key,value) VALUES(?,?)
	                   ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
		key, strconv.FormatInt(v, 10))
	return err
}

// Admin-tunable limits. Defaults match the brief: 100 MB per project.
func defaultQuota() int64 { return setting("default_quota_bytes", 100<<20) }
func globalCap() int64    { return setting("global_cap_bytes", 3<<30) }
func maxUpload() int64    { return setting("max_upload_bytes", 100<<20) }

/* ---------------------------------------------------------------- users */

type User struct {
	ID          int64  `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
	Email       string `json:"email"`
	Role        string `json:"role"`
	MustReset bool   `json:"mustReset"`
	Disabled  bool   `json:"disabled"`
	CreatedBy int64  `json:"createdBy"`
	CreatedAt int64  `json:"createdAt"`
	LastLogin int64  `json:"lastLogin"`

	// Set only on the actor of a request, and only while the admin has switched
	// itself into lead mode: Role then reads "lead" so every permission check
	// treats it as one, and these two remember what it really is. They are
	// omitted from user listings, where they would always be empty.
	RealRole     string `json:"realRole,omitempty"`
	ActingAsLead bool   `json:"actingAsLead,omitempty"`
}

// realRole is the account's actual role, ignoring any lead mode it is in.
func realRole(u *User) string {
	if u.RealRole != "" {
		return u.RealRole
	}
	return u.Role
}

const userCols = `id, username, COALESCE(NULLIF(display_name,''), username), email,
                  role, must_reset, disabled,
                  COALESCE(created_by,0), created_at, COALESCE(last_login,0)`

// The same fallback in a join, for the "who touched this" columns.
const displayNameExpr = `COALESCE(NULLIF(u.display_name,''), u.username, '')`

func scanUser(row interface{ Scan(...any) error }) (*User, error) {
	var u User
	err := row.Scan(&u.ID, &u.Username, &u.DisplayName, &u.Email, &u.Role, &u.MustReset,
		&u.Disabled, &u.CreatedBy, &u.CreatedAt, &u.LastLogin)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func userByID(id int64) (*User, error) {
	return scanUser(db.QueryRow(`SELECT `+userCols+` FROM users WHERE id=?`, id))
}

func userByName(name string) (*User, error) {
	return scanUser(db.QueryRow(`SELECT `+userCols+` FROM users WHERE username=?`, name))
}

var errNoRows = sql.ErrNoRows

func isNoRows(err error) bool { return errors.Is(err, sql.ErrNoRows) }

/* -------------------------------------------------------------- projects */

type Project struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	Slug       string `json:"slug"`
	OwnerID    int64  `json:"ownerId"`
	OwnerName  string `json:"ownerName"`
	QuotaBytes int64  `json:"quotaBytes"`
	UsedBytes  int64  `json:"usedBytes"`
	FileCount  int64  `json:"fileCount"`
	CreatedAt  int64  `json:"createdAt"`
}

const projectSelect = `
SELECT p.id, p.name, p.slug, p.owner_id,
       COALESCE(NULLIF(u.display_name,''), u.username, '?'), p.quota_bytes,
       COALESCE((SELECT SUM(size) FROM files f WHERE f.project_id=p.id),0),
       COALESCE((SELECT COUNT(*)  FROM files f WHERE f.project_id=p.id),0),
       p.created_at
FROM projects p LEFT JOIN users u ON u.id=p.owner_id`

func scanProject(row interface{ Scan(...any) error }) (*Project, error) {
	var p Project
	err := row.Scan(&p.ID, &p.Name, &p.Slug, &p.OwnerID, &p.OwnerName,
		&p.QuotaBytes, &p.UsedBytes, &p.FileCount, &p.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func projectByID(id int64) (*Project, error) {
	return scanProject(db.QueryRow(projectSelect+` WHERE p.id=?`, id))
}

// Total bytes stored across every project — the figure the global cap guards.
func totalUsed() int64 {
	var n int64
	db.QueryRow(`SELECT COALESCE(SUM(size),0) FROM files`).Scan(&n)
	return n
}

/* ----------------------------------------------------------------- audit */

func logAudit(u *User, projectID int64, action, detail string) {
	var uid any
	name := ""
	if u != nil {
		uid, name = u.ID, u.Username
	}
	var pid any
	if projectID > 0 {
		pid = projectID
	}
	if _, err := db.Exec(`INSERT INTO audit(at,user_id,username,project_id,action,detail)
	                      VALUES(?,?,?,?,?,?)`,
		time.Now().Unix(), uid, name, pid, action, detail); err != nil {
		log.Printf("audit: %v", err)
	}
}
