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
