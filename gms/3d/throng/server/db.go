package main

import (
	"database/sql"
	"log"
	"time"

	_ "modernc.org/sqlite"
)

var db *sql.DB

// Live rooms are memory-only. The database holds only the leaderboards: one row per player per
// finished match (kept 16 days, for the daily and weekly boards) and an all-time aggregate.
const schema = `
CREATE TABLE IF NOT EXISTS results (
  mid   TEXT NOT NULL,
  pid   TEXT NOT NULL,            -- public id: a hash of the device id, never the id itself
  name  TEXT NOT NULL,
  day   TEXT NOT NULL,            -- UTC 2026-11-13
  week  TEXT NOT NULL,            -- ISO week 2026-W46 (Monday UTC)
  best  INTEGER NOT NULL,
  win   INTEGER NOT NULL,
  at    INTEGER NOT NULL,
  PRIMARY KEY (mid, pid)
);
CREATE INDEX IF NOT EXISTS idx_results_day ON results(day, pid);
CREATE INDEX IF NOT EXISTS idx_results_week ON results(week, pid);
CREATE INDEX IF NOT EXISTS idx_results_at ON results(at);

CREATE TABLE IF NOT EXISTS alltime (
  pid     TEXT PRIMARY KEY,
  name    TEXT NOT NULL,
  best    INTEGER NOT NULL,
  wins    INTEGER NOT NULL,
  matches INTEGER NOT NULL,
  at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alltime_best ON alltime(best DESC);
CREATE INDEX IF NOT EXISTS idx_alltime_wins ON alltime(wins DESC);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

func openDB(path string) {
	var err error
	db, err = sql.Open("sqlite", path+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)&_txlock=immediate")
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(schema); err != nil {
		log.Fatalf("schema: %v", err)
	}
	if err := migrate(); err != nil {
		log.Fatalf("migrate: %v", err)
	}
}

// Schema 2 (wave 5): per-mode boards. results gains a mode column and alltime_mode holds the per-mode
// all-time rows; alltime stays the all-modes aggregate (and the name lookup). Rows written before this
// were Classic matches. Idempotent: safe on a fresh file, an M3/M4 file, and an already-migrated one.
func migrate() error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	has := false
	rows, err := tx.Query(`PRAGMA table_info(results)`)
	if err != nil {
		return err
	}
	for rows.Next() {
		var cid, notnull, pk int
		var name, typ string
		var dflt sql.NullString
		rows.Scan(&cid, &name, &typ, &notnull, &dflt, &pk)
		if name == "mode" {
			has = true
		}
	}
	rows.Close()
	if !has {
		if _, err := tx.Exec(`ALTER TABLE results ADD COLUMN mode TEXT NOT NULL DEFAULT 'classic'`); err != nil {
			return err
		}
	}
	var v int
	tx.QueryRow(`SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'schema'`).Scan(&v)
	for _, q := range []string{
		`CREATE TABLE IF NOT EXISTS alltime_mode (
		  pid TEXT NOT NULL, mode TEXT NOT NULL, name TEXT NOT NULL, best INTEGER NOT NULL, wins INTEGER NOT NULL,
		  matches INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (pid, mode))`,
		`CREATE INDEX IF NOT EXISTS idx_alltime_mode_best ON alltime_mode(mode, best DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_alltime_mode_wins ON alltime_mode(mode, wins DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_results_mode_day ON results(mode, day, pid)`,
		`CREATE INDEX IF NOT EXISTS idx_results_mode_week ON results(mode, week, pid)`,
	} {
		if _, err := tx.Exec(q); err != nil {
			return err
		}
	}
	if v < 2 {
		if _, err := tx.Exec(`INSERT OR IGNORE INTO alltime_mode(pid, mode, name, best, wins, matches, at)
			SELECT pid, 'classic', name, best, wins, matches, at FROM alltime`); err != nil {
			return err
		}
		if _, err := tx.Exec(`INSERT INTO settings(key, value) VALUES('schema', '2') ON CONFLICT(key) DO UPDATE SET value = excluded.value`); err != nil {
			return err
		}
		log.Printf("db: migrated to schema 2 (per-mode boards; existing rows are Classic)")
	}
	return tx.Commit()
}

func getSetting(k string) string {
	var v string
	db.QueryRow(`SELECT value FROM settings WHERE key = ?`, k).Scan(&v)
	return v
}

func putSetting(k, v string) {
	db.Exec(`INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, k, v)
	pausedCache.at = 0
}

func sweepDB() {
	old := nowFn().Add(-16 * 24 * time.Hour).UnixMilli()
	db.Exec(`DELETE FROM results WHERE at < ?`, old)
}
