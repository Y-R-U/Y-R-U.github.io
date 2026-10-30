package main

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"log"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

var db *sql.DB

const schema = `
CREATE TABLE IF NOT EXISTS players (
  uid     TEXT PRIMARY KEY,
  pid     TEXT NOT NULL UNIQUE,      -- public id (hash of uid), safe to show
  name    TEXT NOT NULL,
  anon    INTEGER NOT NULL DEFAULT 1,
  created INTEGER NOT NULL,
  seen    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ratings (
  uid     TEXT NOT NULL,
  cat     TEXT NOT NULL,
  r       REAL NOT NULL,
  rd      REAL NOT NULL,
  vol     REAL NOT NULL,
  games   INTEGER NOT NULL DEFAULT 0,
  wins    INTEGER NOT NULL DEFAULT 0,
  losses  INTEGER NOT NULL DEFAULT 0,
  draws   INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL,
  PRIMARY KEY (uid, cat)
);
CREATE INDEX IF NOT EXISTS idx_ratings_board ON ratings(cat, r DESC);

-- Finished games (aborted games are not stored).
CREATE TABLE IF NOT EXISTS games (
  id         TEXT PRIMARY KEY,
  white_uid  TEXT NOT NULL,
  black_uid  TEXT NOT NULL,
  white_name TEXT NOT NULL,
  black_name TEXT NOT NULL,
  tc         TEXT NOT NULL,
  cat        TEXT NOT NULL,
  rated      INTEGER NOT NULL,
  result     TEXT NOT NULL,
  reason     TEXT NOT NULL,
  moves      TEXT NOT NULL,          -- UCI, space separated
  pgn        TEXT NOT NULL,
  white_r    INTEGER NOT NULL DEFAULT 0,
  black_r    INTEGER NOT NULL DEFAULT 0,
  white_d    INTEGER NOT NULL DEFAULT 0,
  black_d    INTEGER NOT NULL DEFAULT 0,
  started    INTEGER NOT NULL,
  ended      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_games_white ON games(white_uid, ended DESC);
CREATE INDEX IF NOT EXISTS idx_games_black ON games(black_uid, ended DESC);

-- Games in progress, so a deploy or restart (and 3-day Unlimited games) survive.
CREATE TABLE IF NOT EXISTS live_games (
  id      TEXT PRIMARY KEY,
  data    BLOB NOT NULL,
  touched INTEGER NOT NULL
);

-- Anonymous allowance (D12): games counted per anonymous uid per UTC day.
CREATE TABLE IF NOT EXISTS anon_usage (
  uid     TEXT NOT NULL,
  day     TEXT NOT NULL,
  game_id TEXT NOT NULL,
  ip      TEXT NOT NULL DEFAULT '',  -- salted hash
  at      INTEGER NOT NULL,
  PRIMARY KEY (uid, game_id)
);
CREATE INDEX IF NOT EXISTS idx_anon_day ON anon_usage(day, uid);
CREATE INDEX IF NOT EXISTS idx_anon_ip ON anon_usage(day, ip);

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
	s := sha256.Sum256([]byte("gambit-pid:" + uid))
	return hex.EncodeToString(s[:6])
}

func ipHash(ip string) string {
	s := sha256.Sum256([]byte(cfg.Salt + "|" + ip))
	return hex.EncodeToString(s[:8])
}

func utcDay(t time.Time) string { return t.UTC().Format("2006-01-02") }

func upsertPlayer(uid, name string, anon bool) {
	now := nowMs()
	_, err := db.Exec(`INSERT INTO players(uid, pid, name, anon, created, seen) VALUES(?,?,?,?,?,?)
		ON CONFLICT(uid) DO UPDATE SET name = excluded.name, anon = excluded.anon, seen = excluded.seen`,
		uid, pidOf(uid), name, b2i(anon), now, now)
	if err != nil {
		log.Printf("upsert player: %v", err)
	}
}

func b2i(b bool) int {
	if b {
		return 1
	}
	return 0
}

type ratingRow struct {
	Rating
	Games, Wins, Losses, Draws int
}

func loadRating(uid, cat string) ratingRow {
	row := ratingRow{Rating: newRating()}
	db.QueryRow(`SELECT r, rd, vol, games, wins, losses, draws, updated FROM ratings WHERE uid = ? AND cat = ?`, uid, cat).
		Scan(&row.R, &row.RD, &row.Vol, &row.Games, &row.Wins, &row.Losses, &row.Draws, &row.Updated)
	return row
}

func loadRatings(uid string) map[string]map[string]any {
	out := map[string]map[string]any{}
	for _, c := range categories {
		r := loadRating(uid, c)
		rr := r.decay(nowMs())
		out[c] = map[string]any{"r": int(r.R + 0.5), "rd": int(rr.RD + 0.5), "prov": rr.Provisional(), "games": r.Games}
	}
	return out
}

func saveRating(tx *sql.Tx, uid, cat string, r ratingRow) error {
	_, err := tx.Exec(`INSERT INTO ratings(uid, cat, r, rd, vol, games, wins, losses, draws, updated) VALUES(?,?,?,?,?,?,?,?,?,?)
		ON CONFLICT(uid, cat) DO UPDATE SET r=excluded.r, rd=excluded.rd, vol=excluded.vol, games=excluded.games,
		wins=excluded.wins, losses=excluded.losses, draws=excluded.draws, updated=excluded.updated`,
		uid, cat, r.R, r.RD, r.Vol, r.Games, r.Wins, r.Losses, r.Draws, r.Updated)
	return err
}

type boardRow struct {
	Rank   int    `json:"rank"`
	PID    string `json:"pid"`
	Name   string `json:"name"`
	Rating int    `json:"rating"`
	RD     int    `json:"rd"`
	Games  int    `json:"games"`
	Wins   int    `json:"wins"`
	Losses int    `json:"losses"`
	Draws  int    `json:"draws"`
}

// leaderboard lists signed-in, non-provisional players (anonymous accounts can play
// rated games and keep their rating when they sign in — Firebase linking keeps the uid —
// but only appear on the board once signed in). Provisional is judged on the decayed RD.
func leaderboard(cat string, limit int) []boardRow {
	rows, err := db.Query(`SELECT p.pid, p.name, r.r, r.rd, r.vol, r.updated, r.games, r.wins, r.losses, r.draws
		FROM ratings r JOIN players p ON p.uid = r.uid
		WHERE r.cat = ? AND p.anon = 0 AND r.rd <= ? ORDER BY r.r DESC LIMIT ?`, cat, provisionalRD, limit*2+20)
	if err != nil {
		log.Printf("leaderboard: %v", err)
		return nil
	}
	defer rows.Close()
	out := []boardRow{}
	now := nowMs()
	for rows.Next() {
		var b boardRow
		var r Rating
		rows.Scan(&b.PID, &b.Name, &r.R, &r.RD, &r.Vol, &r.Updated, &b.Games, &b.Wins, &b.Losses, &b.Draws)
		d := r.decay(now)
		if d.Provisional() {
			continue
		}
		b.Rating, b.RD = int(r.R+0.5), int(d.RD+0.5)
		b.Rank = len(out) + 1
		out = append(out, b)
		if len(out) >= limit {
			break
		}
	}
	return out
}

func getSetting(k string) string {
	var v string
	db.QueryRow(`SELECT value FROM settings WHERE key = ?`, k).Scan(&v)
	return v
}

func putSetting(k, v string) {
	db.Exec(`INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, k, v)
}

func sweepDB() {
	old := utcDay(nowFn().AddDate(0, 0, -35))
	db.Exec(`DELETE FROM anon_usage WHERE day < ?`, old)
	// live rows of games no longer in memory (crash between end and delete)
	db.Exec(`DELETE FROM live_games WHERE touched < ?`, nowFn().Add(-2*moveTimeout).UnixMilli())
}

func joinMoves(m []string) string { return strings.Join(m, " ") }
