package main

import (
	"database/sql"
	"encoding/json"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

// Agreed results only. Rows are keyed by Firebase uid; anonymous players never get one, so
// they never reach a leaderboard. Every match (counted or void) is logged in `matches`.
const schema = `
CREATE TABLE IF NOT EXISTS players (
  uid TEXT PRIMARY KEY, name TEXT NOT NULL,
  battles INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0, best_streak INTEGER NOT NULL DEFAULT 0, kos INTEGER NOT NULL DEFAULT 0,
  loadout TEXT NOT NULL DEFAULT '', updated INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS by_type (
  uid TEXT NOT NULL, type TEXT NOT NULL,
  battles INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (uid, type)
);
CREATE TABLE IF NOT EXISTS daily (
  uid TEXT NOT NULL, day TEXT NOT NULL,
  battles INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (uid, day)
);
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, friend INTEGER NOT NULL, players INTEGER NOT NULL,
  winner_uid TEXT NOT NULL DEFAULT '', score TEXT NOT NULL DEFAULT '',
  voided INTEGER NOT NULL DEFAULT 0, why TEXT NOT NULL DEFAULT '', day TEXT NOT NULL, at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS matches_day ON matches(day);
-- Home-network (ARENA_LAN) only. Every agreed LAN result, per player, with the device id and,
-- once known, the Firebase account it belongs to. See uploadLanResults.
CREATE TABLE IF NOT EXISTS lan_results (
  match TEXT NOT NULL, device TEXT NOT NULL, firebase_uid TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL, type TEXT NOT NULL, won INTEGER NOT NULL, kos INTEGER NOT NULL,
  forfeit INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL, uploaded INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (match, device)
);
CREATE TABLE IF NOT EXISTS lan_links (device TEXT PRIMARY KEY, firebase_uid TEXT NOT NULL, at INTEGER NOT NULL);
`

type store struct {
	db  *sql.DB
	now func() time.Time
}

func openStore(path string) (*store, error) {
	db, err := sql.Open("sqlite", path+"?_pragma=busy_timeout(3000)&_pragma=journal_mode(WAL)")
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(schema); err != nil {
		return nil, err
	}
	return &store{db: db, now: time.Now}, nil
}

func (s *store) day() string { return s.now().UTC().Format("2006-01-02") }

type seatRow struct {
	UID     string // "" = anonymous: plays, never counted
	Name    string
	Won     bool
	KOs     int
	Ranked  bool
	Loadout []int
}

func (s *store) recordMatch(id, typ string, friend bool, score string, seats []seatRow) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	now, day := s.now().Unix(), s.day()
	winner := ""
	for _, p := range seats {
		if p.Won {
			winner = p.UID
		}
	}
	if _, err := tx.Exec(`INSERT INTO matches(id,type,friend,players,winner_uid,score,day,at) VALUES(?,?,?,?,?,?,?,?)`,
		id, typ, b2i(friend), len(seats), winner, score, day, now); err != nil {
		return err
	}
	for _, p := range seats {
		if !p.Ranked || p.UID == "" {
			continue
		}
		w, l := b2i(p.Won), b2i(!p.Won)
		lo, _ := json.Marshal(p.Loadout)
		if _, err := tx.Exec(`INSERT INTO players(uid,name,loadout,updated) VALUES(?,?,?,?) ON CONFLICT(uid) DO UPDATE SET name=excluded.name, loadout=excluded.loadout`, p.UID, p.Name, string(lo), now); err != nil {
			return err
		}
		if _, err := tx.Exec(`UPDATE players SET battles=battles+1, wins=wins+?, losses=losses+?, kos=kos+?,
			streak=CASE WHEN ?=1 THEN streak+1 ELSE 0 END,
			best_streak=MAX(best_streak, CASE WHEN ?=1 THEN streak+1 ELSE 0 END), updated=? WHERE uid=?`,
			w, l, p.KOs, w, w, now, p.UID); err != nil {
			return err
		}
		if _, err := tx.Exec(`INSERT INTO by_type(uid,type,battles,wins,losses) VALUES(?,?,1,?,?)
			ON CONFLICT(uid,type) DO UPDATE SET battles=battles+1, wins=wins+excluded.wins, losses=losses+excluded.losses`, p.UID, typ, w, l); err != nil {
			return err
		}
		if _, err := tx.Exec(`INSERT INTO daily(uid,day,battles,wins) VALUES(?,?,1,?)
			ON CONFLICT(uid,day) DO UPDATE SET battles=battles+1, wins=wins+excluded.wins`, p.UID, day, w); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *store) recordVoid(id, typ string, friend bool, players int, why string) {
	s.db.Exec(`INSERT OR IGNORE INTO matches(id,type,friend,players,voided,why,day,at) VALUES(?,?,?,?,1,?,?,?)`,
		id, typ, b2i(friend), players, why, s.day(), s.now().Unix())
	_, _ = s.db.Exec(`DELETE FROM daily WHERE day < ?`, s.now().UTC().AddDate(0, 0, -40).Format("2006-01-02"))
}

type statLine struct {
	Name       string `json:"name"`
	Battles    int    `json:"battles"`
	Wins       int    `json:"wins"`
	Losses     int    `json:"losses"`
	Streak     int    `json:"streak"`
	BestStreak int    `json:"bestStreak"`
	KOs        int    `json:"kos"`
	Today      int    `json:"today"`
}

func (s *store) mine(uid string) (statLine, bool) {
	var l statLine
	err := s.db.QueryRow(`SELECT p.name,p.battles,p.wins,p.losses,p.streak,p.best_streak,p.kos,COALESCE(d.battles,0)
		FROM players p LEFT JOIN daily d ON d.uid=p.uid AND d.day=? WHERE p.uid=?`, s.day(), uid).
		Scan(&l.Name, &l.Battles, &l.Wins, &l.Losses, &l.Streak, &l.BestStreak, &l.KOs, &l.Today)
	return l, err == nil
}

var boards = map[string]string{
	"wins": "p.wins", "battles": "p.battles", "streak": "p.best_streak", "kos": "p.kos", "losses": "p.losses",
}

type boardRow struct {
	Name  string `json:"name"`
	Value int    `json:"value"`
	Wins  int    `json:"wins"`
	Lost  int    `json:"losses"`
}

// leaderboard: no uids leave the server, only display names and numbers.
func (s *store) leaderboard(board, typ string, limit int) ([]boardRow, error) {
	var rows *sql.Rows
	var err error
	switch {
	case board == "today":
		rows, err = s.db.Query(`SELECT p.name, d.battles, d.wins, 0 FROM daily d JOIN players p ON p.uid=d.uid
			WHERE d.day=? ORDER BY d.battles DESC, d.wins DESC, p.name LIMIT ?`, s.day(), limit)
	case typ != "":
		col := "t.wins"
		if board == "battles" {
			col = "t.battles"
		}
		rows, err = s.db.Query(`SELECT p.name, `+col+`, t.wins, t.losses FROM by_type t JOIN players p ON p.uid=t.uid
			WHERE t.type=? AND t.battles>0 ORDER BY `+col+` DESC, t.wins DESC, p.name LIMIT ?`, typ, limit)
	default:
		col, ok := boards[board]
		if !ok {
			col = "p.wins"
		}
		rows, err = s.db.Query(`SELECT p.name, `+col+`, p.wins, p.losses FROM players p WHERE p.battles>0
			ORDER BY `+col+` DESC, p.wins DESC, p.name LIMIT ?`, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []boardRow{}
	for rows.Next() {
		var r boardRow
		if err := rows.Scan(&r.Name, &r.Value, &r.Wins, &r.Lost); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

type storeCounts struct {
	MatchesToday int `json:"matchesToday"`
	VoidToday    int `json:"voidToday"`
	FriendToday  int `json:"friendToday"`
	RankedToday  int `json:"rankedPlayersToday"`
	Matches      int `json:"matches"`
	Voided       int `json:"voided"`
	Ranked       int `json:"rankedPlayers"`
}

func (s *store) counts() storeCounts {
	var c storeCounts
	d := s.day()
	s.db.QueryRow(`SELECT COUNT(*), COALESCE(SUM(voided),0), COALESCE(SUM(friend),0) FROM matches WHERE day=?`, d).Scan(&c.MatchesToday, &c.VoidToday, &c.FriendToday)
	s.db.QueryRow(`SELECT COUNT(*) FROM daily WHERE day=?`, d).Scan(&c.RankedToday)
	s.db.QueryRow(`SELECT COUNT(*), COALESCE(SUM(voided),0) FROM matches`).Scan(&c.Matches, &c.Voided)
	s.db.QueryRow(`SELECT COUNT(*) FROM players`).Scan(&c.Ranked)
	return c
}

func b2i(b bool) int {
	if b {
		return 1
	}
	return 0
}

func cleanType(t string) string {
	t = strings.ToLower(strings.TrimSpace(t))
	if gameTypes[t] {
		return t
	}
	return ""
}

// Game types a waiting player can ask for. Only the duel ships in phase 1; the rest are
// listed so the protocol and the lobby already carry a type.
var gameTypes = map[string]bool{"duel": true}

type ghostRow struct {
	Name    string `json:"name"`
	Loadout []int  `json:"loadout"`
	Wins    int    `json:"wins"`
	Battles int    `json:"battles"`
}

// ghosts: recent signed-in players to fight as an AI any time. Always labelled GHOST in the
// game and never counted in ranked stats. Names and loadouts only — no uids.
func (s *store) ghosts(limit int) ([]ghostRow, error) {
	rows, err := s.db.Query(`SELECT name, loadout, wins, battles FROM players WHERE battles>0 ORDER BY updated DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ghostRow{}
	for rows.Next() {
		var g ghostRow
		var lo string
		if err := rows.Scan(&g.Name, &lo, &g.Wins, &g.Battles); err != nil {
			return nil, err
		}
		json.Unmarshal([]byte(lo), &g.Loadout)
		if g.Loadout == nil {
			g.Loadout = []int{0}
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

// recordLan keeps a LAN result for a later upload to the production arena.
func (s *store) recordLan(match, typ string, forfeit bool, seats []seatRow) {
	now := s.now().Unix()
	for _, p := range seats {
		if p.UID == "" {
			continue
		}
		s.db.Exec(`INSERT OR IGNORE INTO lan_results(match,device,firebase_uid,name,type,won,kos,forfeit,at)
			VALUES(?,?,COALESCE((SELECT firebase_uid FROM lan_links WHERE device=?),''),?,?,?,?,?,?)`,
			match, p.UID, p.UID, p.Name, typ, b2i(p.Won), p.KOs, b2i(forfeit), now)
	}
}

// linkDevice: a LAN player turned out to be signed in. Their past and future LAN results
// belong to that account.
func (s *store) linkDevice(device, firebaseUID string) {
	s.db.Exec(`INSERT INTO lan_links(device,firebase_uid,at) VALUES(?,?,?) ON CONFLICT(device) DO UPDATE SET firebase_uid=excluded.firebase_uid, at=excluded.at`,
		device, firebaseUID, s.now().Unix())
	s.db.Exec(`UPDATE lan_results SET firebase_uid=? WHERE device=? AND uploaded=0`, firebaseUID, device)
}

type lanResult struct {
	Match, Device, FirebaseUID, Name, Type string
	Won, Forfeit                           bool
	KOs                                    int
	At                                     int64
}

// uploadLanResults is the hook for the later sync job (NOT built in phase 1; docs/ONLINE.md
// "LAN results"). It hands back up to `limit` agreed LAN results that belong to a signed-in
// account and have not been uploaded, and a function that marks them uploaded once the
// production arena has accepted the batch. Production must count them toward that account's
// arena stats only — never toward daily-limit or allowance counts.
func (s *store) uploadLanResults(limit int) ([]lanResult, func() error, error) {
	rows, err := s.db.Query(`SELECT match,device,firebase_uid,name,type,won,forfeit,kos,at FROM lan_results
		WHERE uploaded=0 AND firebase_uid<>'' ORDER BY at LIMIT ?`, limit)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	var out []lanResult
	for rows.Next() {
		var r lanResult
		var won, ff int
		if err := rows.Scan(&r.Match, &r.Device, &r.FirebaseUID, &r.Name, &r.Type, &won, &ff, &r.KOs, &r.At); err != nil {
			return nil, nil, err
		}
		r.Won, r.Forfeit = won == 1, ff == 1
		out = append(out, r)
	}
	mark := func() error {
		for _, r := range out {
			if _, err := s.db.Exec(`UPDATE lan_results SET uploaded=1 WHERE match=? AND device=?`, r.Match, r.Device); err != nil {
				return err
			}
		}
		return nil
	}
	return out, mark, rows.Err()
}
