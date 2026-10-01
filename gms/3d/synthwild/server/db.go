package main

import (
	"database/sql"
	"log"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

var db *sql.DB

// removed_at marks a username an admin took away: its sessions are gone and its
// worlds are hidden, but the rows stay so nothing is lost.
const schema = `
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  username    TEXT NOT NULL UNIQUE,
  display     TEXT NOT NULL DEFAULT '',
  admin_email TEXT UNIQUE,
  created_at  INTEGER NOT NULL,
  created_by  TEXT NOT NULL DEFAULT '',
  removed_at  INTEGER,
  last_login  INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  admin      INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS login_links (
  token_hash TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS worlds (
  id         TEXT PRIMARY KEY,
  owner_id   INTEGER NOT NULL REFERENCES users(id),
  name       TEXT NOT NULL,
  seed       TEXT NOT NULL DEFAULT '',
  mode       TEXT NOT NULL DEFAULT 'survival',
  public     INTEGER NOT NULL DEFAULT 0,
  version    INTEGER NOT NULL DEFAULT 0,
  size       INTEGER NOT NULL DEFAULT 0,
  thumb_size INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Bytes live apart from the metadata so listings never page blobs in.
CREATE TABLE IF NOT EXISTS world_data (
  world_id  TEXT PRIMARY KEY REFERENCES worlds(id) ON DELETE CASCADE,
  blob      BLOB,
  blob_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  thumb     BLOB
);

CREATE INDEX IF NOT EXISTS idx_worlds_owner  ON worlds(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_worlds_public ON worlds(public, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`

func openDB(path string) {
	var err error
	db, err = sql.Open("sqlite", path+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)&_pragma=synchronous(NORMAL)")
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(schema); err != nil {
		log.Fatalf("schema: %v", err)
	}
	migrate()
}

// Columns added after the first release go here, one ALTER each.
var migrations = []string{}

func migrate() {
	for _, m := range migrations {
		if _, err := db.Exec(m); err != nil && !strings.Contains(err.Error(), "duplicate column") {
			log.Fatalf("migrate %q: %v", m, err)
		}
	}
}

func sweep() {
	now := time.Now().Unix()
	db.Exec(`DELETE FROM sessions WHERE expires_at < ?`, now)
	db.Exec(`DELETE FROM login_links WHERE expires_at < ?`, now)
}
