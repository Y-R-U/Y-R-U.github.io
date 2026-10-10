package main

import (
	"database/sql"
	"log"
	"strings"

	_ "modernc.org/sqlite"
)

var db *sql.DB

// Rooms are live in memory; the rooms table is a write-behind snapshot so a
// deploy or restart doesn't end games in progress.
const schema = `
CREATE TABLE IF NOT EXISTS rooms (
  code    TEXT PRIMARY KEY,
  data    BLOB NOT NULL,
  touched INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS challenges (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  uid       TEXT NOT NULL DEFAULT '',
  title     TEXT NOT NULL DEFAULT '',
  spec      TEXT NOT NULL,
  questions BLOB NOT NULL,
  total     INTEGER NOT NULL,
  score     INTEGER NOT NULL,
  plays     INTEGER NOT NULL DEFAULT 0,
  created   INTEGER NOT NULL,
  touched   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS challenge_scores (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  uid          TEXT NOT NULL DEFAULT '',
  score        INTEGER NOT NULL,
  correct      INTEGER NOT NULL,
  ms           INTEGER NOT NULL DEFAULT 0,
  creator      INTEGER NOT NULL DEFAULT 0,
  created      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Counters per UTC day; peak_* keys hold maxima instead of sums.
CREATE TABLE IF NOT EXISTS stats_daily (
  day   TEXT NOT NULL,
  key   TEXT NOT NULL,
  value INTEGER NOT NULL,
  PRIMARY KEY (day, key)
);

-- Salted hashes only, for distinct-visitor counts. Pruned after 30 days.
CREATE TABLE IF NOT EXISTS stats_ips (
  day  TEXT NOT NULL,
  hash TEXT NOT NULL,
  PRIMARY KEY (day, hash)
);

CREATE TABLE IF NOT EXISTS alerts (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  at        INTEGER NOT NULL,
  kind      TEXT NOT NULL,
  msg       TEXT NOT NULL,
  delivered TEXT NOT NULL DEFAULT ''
);

-- Remote client debug logs (only written while the debugLogs setting is on). Capped + pruned.
CREATE TABLE IF NOT EXISTS debug_logs (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ts      INTEGER NOT NULL,
  cts     INTEGER NOT NULL DEFAULT 0,
  perf    INTEGER NOT NULL DEFAULT 0,
  device  TEXT NOT NULL DEFAULT '',
  session TEXT NOT NULL DEFAULT '',
  build   TEXT NOT NULL DEFAULT '',
  ua      TEXT NOT NULL DEFAULT '',
  room    TEXT NOT NULL DEFAULT '',
  level   TEXT NOT NULL DEFAULT 'info',
  tag     TEXT NOT NULL DEFAULT '',
  msg     TEXT NOT NULL DEFAULT '',
  data    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_debug_ts ON debug_logs(ts);
CREATE INDEX IF NOT EXISTS idx_debug_device ON debug_logs(device, id);

CREATE INDEX IF NOT EXISTS idx_scores_board ON challenge_scores(challenge_id, score DESC, ms ASC, id ASC);
CREATE INDEX IF NOT EXISTS idx_challenges_touched ON challenges(touched);
`

// Columns added after the first release, one ALTER each.
var migrations = []string{
	`ALTER TABLE challenge_scores ADD COLUMN detail TEXT NOT NULL DEFAULT ''`, // per-question [correct, stage, ms]
	`ALTER TABLE rooms ADD COLUMN questions BLOB`,                             // written once per game, not with every state flush
}

func openDB(path string) {
	var err error
	db, err = sql.Open("sqlite", path+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)&_pragma=synchronous(NORMAL)&_txlock=immediate")
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(schema); err != nil {
		log.Fatalf("schema: %v", err)
	}
	for _, m := range migrations {
		if _, err := db.Exec(m); err != nil && !strings.Contains(err.Error(), "duplicate column") {
			log.Fatalf("migrate %q: %v", m, err)
		}
	}
}

func sweepDB() {
	cut := nowFn().Add(-cfg.ChallengeTTL).UnixMilli()
	if res, err := db.Exec(`DELETE FROM challenges WHERE touched < ?`, cut); err == nil {
		if n, _ := res.RowsAffected(); n > 0 {
			log.Printf("swept %d expired challenges", n)
		}
	}
	db.Exec(`DELETE FROM rooms WHERE touched < ?`, nowFn().Add(-cfg.RoomIdle).UnixMilli())
	old := nowFn().UTC().AddDate(0, 0, -30).Format("2006-01-02")
	db.Exec(`DELETE FROM stats_ips WHERE day < ?`, old)
	db.Exec(`DELETE FROM alerts WHERE at < ?`, nowFn().AddDate(0, 0, -90).UnixMilli())
	pruneDebug()
}
