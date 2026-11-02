package main

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"log"
	"time"

	_ "modernc.org/sqlite"
)

var db *sql.DB

// Live rooms are memory-only (a restart ends them; clients see roomClosed / no room on
// rejoin). Finished rounds are kept for a results link and later a global ladder.
const schema = `
CREATE TABLE IF NOT EXISTS players (
  uid     TEXT PRIMARY KEY,
  pid     TEXT NOT NULL UNIQUE,      -- public id (hash of uid), safe to show
  name    TEXT NOT NULL,
  anon    INTEGER NOT NULL DEFAULT 1,
  created INTEGER NOT NULL,
  seen    INTEGER NOT NULL,
  rounds  INTEGER NOT NULL DEFAULT 0
);

-- Finished rounds (rooms that played their last hole).
CREATE TABLE IF NOT EXISTS rounds (
  id      TEXT PRIMARY KEY,
  code    TEXT NOT NULL,
  holes   TEXT NOT NULL,             -- JSON [{id, par}]
  seats   TEXT NOT NULL,             -- JSON [{name, pid, kind, scores, total, rank}]
  started INTEGER NOT NULL,
  ended   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rounds_ended ON rounds(ended DESC);

CREATE TABLE IF NOT EXISTS round_players (
  round TEXT NOT NULL,
  uid   TEXT NOT NULL,
  total INTEGER NOT NULL,
  rank  INTEGER NOT NULL,
  PRIMARY KEY (round, uid)
);
CREATE INDEX IF NOT EXISTS idx_round_players_uid ON round_players(uid);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

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
}

func pidOf(uid string) string {
	s := sha256.Sum256([]byte("skyputt-pid:" + uid))
	return hex.EncodeToString(s[:6])
}

func ipHash(ip string) string {
	s := sha256.Sum256([]byte(cfg.Salt + "|" + ip))
	return hex.EncodeToString(s[:8])
}

func b2i(b bool) int {
	if b {
		return 1
	}
	return 0
}

func upsertPlayer(uid, name string, anon bool) {
	now := nowMs()
	_, err := db.Exec(`INSERT INTO players(uid, pid, name, anon, created, seen) VALUES(?,?,?,?,?,?)
		ON CONFLICT(uid) DO UPDATE SET name = excluded.name, anon = excluded.anon, seen = excluded.seen`,
		uid, pidOf(uid), name, b2i(anon), now, now)
	if err != nil {
		log.Printf("upsert player: %v", err)
	}
}

// storeRound keeps a finished round: the summary row plus one row per human seat.
func storeRound(id, code, holes, seats string, started int64, humans []roundPlayer) {
	tx, err := db.Begin()
	if err != nil {
		log.Printf("store round: %v", err)
		return
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`INSERT OR REPLACE INTO rounds(id, code, holes, seats, started, ended) VALUES(?,?,?,?,?,?)`,
		id, code, holes, seats, started, nowMs()); err != nil {
		log.Printf("store round: %v", err)
		return
	}
	for _, p := range humans {
		tx.Exec(`INSERT OR REPLACE INTO round_players(round, uid, total, rank) VALUES(?,?,?,?)`, id, p.UID, p.Total, p.Rank)
		tx.Exec(`UPDATE players SET rounds = rounds + 1 WHERE uid = ?`, p.UID)
	}
	if err := tx.Commit(); err != nil {
		log.Printf("store round commit: %v", err)
	}
}

type roundPlayer struct {
	UID         string
	Total, Rank int
}

func getSetting(k string) string {
	var v string
	db.QueryRow(`SELECT value FROM settings WHERE key = ?`, k).Scan(&v)
	return v
}

func putSetting(k, v string) {
	db.Exec(`INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, k, v)
}

// sweepDB drops finished rounds older than a year (they are only kept for results links).
func sweepDB() {
	old := nowFn().Add(-365 * 24 * time.Hour).UnixMilli()
	db.Exec(`DELETE FROM round_players WHERE round IN (SELECT id FROM rounds WHERE ended < ?)`, old)
	db.Exec(`DELETE FROM rounds WHERE ended < ?`, old)
}
