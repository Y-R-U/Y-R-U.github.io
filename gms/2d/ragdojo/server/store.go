package main

import (
	"database/sql"
	"encoding/json"
	"strings"
	"sync"
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
-- One ghost per player: the loadout snapshot their last arena match uploaded (ghosts.go).
-- Fights against it run offline in the challenger's browser and are never reported back.
CREATE TABLE IF NOT EXISTS ghosts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  snap TEXT NOT NULL, updated INTEGER NOT NULL
);
-- A disagreement, per account (see flagged). dispute_flags hides a flagged account from the boards.
CREATE TABLE IF NOT EXISTS disputes (uid TEXT NOT NULL, match TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (uid, match));
CREATE TABLE IF NOT EXISTS dispute_flags (uid TEXT PRIMARY KEY, until INTEGER NOT NULL);
-- Counted results per pair of accounts per UTC day (a < b; "anon" = any anonymous opponent).
CREATE TABLE IF NOT EXISTS pairs (a TEXT NOT NULL, b TEXT NOT NULL, day TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (a, b, day));
-- Accounts that finished a friend-link match together: the only "friend" the server believes.
CREATE TABLE IF NOT EXISTS friends (a TEXT NOT NULL, b TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (a, b));
`

type store struct {
	db      *sql.DB
	now     func() time.Time
	pairCap int        // counted results per pair of accounts per day; 0 = no cap (the LAN server)
	rivals  *rivalMemo // events.go: recent rival lists per caller
	saltMu  sync.Mutex
	saltV   string
	// afterMatch hears every agreed result once it is stored (events.go counts it for events).
	afterMatch func(match string, seats []seatRow)
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
	return &store{db: db, now: time.Now, pairCap: defaultPairCap, rivals: &rivalMemo{m: map[string]rivalEntry{}}}, nil
}

func (s *store) day() string { return s.now().UTC().Format("2006-01-02") }

type seatRow struct {
	UID     string // "" = anonymous: plays, never counted
	Name    string
	Won     bool
	KOs     int
	Ranked  bool
	Loadout []int
	OppDmg  float64 // the most-damaged opponent in the deciding round, from the agreed reports (0-1)
	NoStats bool    // not counted for this seat (an early forfeit's stayer; set by the pair cap)
	NoEvent bool    // no event points (an early forfeit)
}

const (
	defaultPairCap = 3
	flagFor        = 7 * 24 * time.Hour
)

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
	if err := s.capPairs(tx, day, seats); err != nil {
		return err
	}
	if friend && !strings.Contains(score, " ff") {
		for i, p := range seats {
			for _, q := range seats[i+1:] {
				if p.Ranked && q.Ranked && p.UID != "" && q.UID != "" && p.UID != q.UID {
					a, b := pairOf(p.UID, q.UID)
					tx.Exec(`INSERT OR IGNORE INTO friends(a,b,at) VALUES(?,?,?)`, a, b, now)
				}
			}
		}
	}
	for _, p := range seats {
		if !p.Ranked || p.UID == "" || p.NoStats {
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
	if err := tx.Commit(); err != nil {
		return err
	}
	if s.afterMatch != nil {
		s.afterMatch(id, seats)
	}
	return nil
}

func pairOf(a, b string) (string, string) {
	if a > b {
		return b, a
	}
	return a, b
}

// capPairs: the same two accounts count at most pairCap results a day against each other
// (friend links included; all anonymous opponents share one key). A seat is counted only if
// it has an opponent it has not hit the cap with; playing yourself never counts. Every pair
// in a match that counted for anyone is charged one.
func (s *store) capPairs(tx *sql.Tx, day string, seats []seatRow) error {
	if s.pairCap <= 0 {
		return nil
	}
	keys := make([]string, len(seats))
	for i, p := range seats {
		keys[i] = "anon"
		if p.Ranked && p.UID != "" {
			keys[i] = p.UID
		}
	}
	n := func(i, j int) (int, error) {
		a, b := pairOf(keys[i], keys[j])
		var v int
		err := tx.QueryRow(`SELECT n FROM pairs WHERE a=? AND b=? AND day=?`, a, b, day).Scan(&v)
		if err == sql.ErrNoRows {
			err = nil
		}
		return v, err
	}
	counted := false
	for i, p := range seats {
		if keys[i] == "anon" || p.NoStats {
			continue
		}
		fresh := false
		for j := range seats {
			if j == i || keys[j] == "anon" && keys[i] == "anon" {
				continue
			}
			if keys[j] == keys[i] {
				fresh = false
				break
			}
			v, err := n(i, j)
			if err != nil {
				return err
			}
			fresh = fresh || v < s.pairCap
		}
		if !fresh {
			seats[i].NoStats = true
			continue
		}
		counted = true
	}
	if !counted {
		return nil
	}
	seen := map[[2]string]bool{}
	for i := range seats {
		for j := i + 1; j < len(seats); j++ {
			a, b := pairOf(keys[i], keys[j])
			if a == b || seen[[2]string{a, b}] {
				continue
			}
			seen[[2]string{a, b}] = true
			if _, err := tx.Exec(`INSERT INTO pairs(a,b,day,n) VALUES(?,?,?,1) ON CONFLICT(a,b,day) DO UPDATE SET n=n+1`, a, b, day); err != nil {
				return err
			}
		}
	}
	return nil
}

// recordVoid logs a void; a disagreement ("disagree") is also a dispute for each account in it.
func (s *store) recordVoid(id, typ string, friend bool, players int, why string, uids []string) {
	s.db.Exec(`INSERT OR IGNORE INTO matches(id,type,friend,players,voided,why,day,at) VALUES(?,?,?,?,1,?,?,?)`,
		id, typ, b2i(friend), players, why, s.day(), s.now().Unix())
	if why == "disagree" {
		s.recordDispute(id, uids)
	}
	old := s.now().UTC().AddDate(0, 0, -40)
	_, _ = s.db.Exec(`DELETE FROM daily WHERE day < ?`, old.Format("2006-01-02"))
	_, _ = s.db.Exec(`DELETE FROM pairs WHERE day < ?`, s.now().UTC().AddDate(0, 0, -2).Format("2006-01-02"))
}

func (s *store) recordDispute(match string, uids []string) {
	for _, u := range uids {
		if u == "" {
			continue
		}
		s.db.Exec(`INSERT OR IGNORE INTO disputes(uid,match,at) VALUES(?,?,?)`, u, match, s.now().Unix())
		if s.flagged(u) {
			s.db.Exec(`INSERT INTO dispute_flags(uid,until) VALUES(?,?) ON CONFLICT(uid) DO UPDATE SET until=excluded.until`,
				u, s.now().Add(flagFor).Unix())
		}
	}
}

// flagged: an account that disputes a lot. Three disputes in 24 h when they are at least 40%
// of its matches in that time, or six ever at 40% of all its matches. An honest player who
// met a liar has one dispute among many counted battles; a player who disputes every loss
// does not. Flagged accounts lose further disputed matches and are hidden from the boards.
func (s *store) flagged(uid string) bool {
	if uid == "" {
		return false
	}
	now := s.now()
	var d24, dAll, b2, bAll int
	s.db.QueryRow(`SELECT COUNT(*), COALESCE(SUM(at > ?),0) FROM disputes WHERE uid=?`, now.Add(-24*time.Hour).Unix(), uid).Scan(&dAll, &d24)
	if d24 < 3 && dAll < 6 {
		return false
	}
	s.db.QueryRow(`SELECT COALESCE(SUM(battles),0) FROM daily WHERE uid=? AND day>=?`, uid, now.UTC().AddDate(0, 0, -1).Format("2006-01-02")).Scan(&b2)
	s.db.QueryRow(`SELECT COALESCE(battles,0) FROM players WHERE uid=?`, uid).Scan(&bAll)
	return (d24 >= 3 && d24*100 >= 40*(d24+b2)) || (dAll >= 6 && dAll*100 >= 40*(dAll+bAll))
}

// friendsOf: the accounts uid finished a friend-link match with.
func (s *store) friendsOf(uid string) map[string]bool {
	out := map[string]bool{}
	rows, err := s.db.Query(`SELECT b FROM friends WHERE a=? UNION SELECT a FROM friends WHERE b=? LIMIT 200`, uid, uid)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var f string
		rows.Scan(&f)
		out[f] = true
	}
	return out
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

type typeLine struct {
	Battles int `json:"battles"`
	Wins    int `json:"wins"`
	Losses  int `json:"losses"`
}

// card is the player's own stats card: totals, per arena type, and where they stand on the
// all-time wins board (1 = top; ties share the better place).
type card struct {
	statLine
	Rank  int                 `json:"rank"`
	Types map[string]typeLine `json:"types"`
	Ghost bool                `json:"ghost"`
}

func (s *store) card(uid string) (*card, error) {
	c := &card{Types: map[string]typeLine{}}
	var g int
	s.db.QueryRow(`SELECT COUNT(*) FROM ghosts WHERE uid=?`, uid).Scan(&g)
	c.Ghost = g > 0
	l, ok := s.mine(uid)
	if !ok {
		return c, nil
	}
	c.statLine = l
	if err := s.db.QueryRow(`SELECT COUNT(*)+1 FROM players WHERE battles>0 AND wins>?`, l.Wins).Scan(&c.Rank); err != nil {
		return nil, err
	}
	rows, err := s.db.Query(`SELECT type,battles,wins,losses FROM by_type WHERE uid=?`, uid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var t string
		var tl typeLine
		if err := rows.Scan(&t, &tl.Battles, &tl.Wins, &tl.Losses); err != nil {
			return nil, err
		}
		c.Types[t] = tl
	}
	return c, rows.Err()
}

var boards = map[string]string{
	"wins": "p.wins", "battles": "p.battles", "streak": "p.best_streak", "kos": "p.kos", "losses": "p.losses",
}

var typeBoards = map[string]string{"wins": "t.wins", "battles": "t.battles", "losses": "t.losses"}

type boardRow struct {
	Name  string `json:"name"`
	Value int    `json:"value"`
	Wins  int    `json:"wins"`
	Lost  int    `json:"losses"`
	You   bool   `json:"you,omitempty"`
}

// leaderboard: no uids leave the server, only display names and numbers. `me` (a uid, or "")
// only marks the caller's own row. Ties break on wins, then name, so the order is stable.
//
//	today                     most battles today, any arena type
//	wins|battles|losses       all time; with a type, that arena type only
//	streak|kos                all time, every type together
func (s *store) leaderboard(board, typ string, limit int, me string) ([]boardRow, error) {
	var rows *sql.Rows
	var err error
	// Accounts with a record of disputes are left off every board.
	hide := ` AND p.uid NOT IN (SELECT uid FROM dispute_flags WHERE until > ?)`
	now := s.now().Unix()
	switch {
	case board == "today":
		rows, err = s.db.Query(`SELECT p.uid, p.name, d.battles, d.wins, d.battles-d.wins FROM daily d JOIN players p ON p.uid=d.uid
			WHERE d.day=? AND d.battles>0`+hide+` ORDER BY d.battles DESC, d.wins DESC, p.name LIMIT ?`, s.day(), now, limit)
	case typ != "":
		col, ok := typeBoards[board]
		if !ok {
			col = "t.wins"
		}
		rows, err = s.db.Query(`SELECT p.uid, p.name, `+col+`, t.wins, t.losses FROM by_type t JOIN players p ON p.uid=t.uid
			WHERE t.type=? AND t.battles>0`+hide+` ORDER BY `+col+` DESC, t.wins DESC, p.name LIMIT ?`, typ, now, limit)
	default:
		col, ok := boards[board]
		if !ok {
			col = "p.wins"
		}
		rows, err = s.db.Query(`SELECT p.uid, p.name, `+col+`, p.wins, p.losses FROM players p WHERE p.battles>0`+hide+`
			ORDER BY `+col+` DESC, p.wins DESC, p.name LIMIT ?`, now, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []boardRow{}
	for rows.Next() {
		var r boardRow
		var uid string
		if err := rows.Scan(&uid, &r.Name, &r.Value, &r.Wins, &r.Lost); err != nil {
			return nil, err
		}
		r.You = me != "" && uid == me
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
	ID      int64           `json:"id"`
	Name    string          `json:"name"`
	Snap    json.RawMessage `json:"snap"`
	Wins    int             `json:"wins"`
	Losses  int             `json:"losses"`
	Battles int             `json:"battles"`
	Updated int64           `json:"updated"`
}

const ghostMaxAge = 90 * 24 * time.Hour

// saveGhost keeps one snapshot per player, replaced by each newer arena match.
func (s *store) saveGhost(uid, name string, snap []byte) error {
	_, err := s.db.Exec(`INSERT INTO ghosts(uid,name,snap,updated) VALUES(?,?,?,?)
		ON CONFLICT(uid) DO UPDATE SET name=excluded.name, snap=excluded.snap, updated=excluded.updated`,
		uid, name, string(snap), s.now().Unix())
	return err
}

// ghosts: the most recent snapshots (not the caller's own), each with its owner's ranked
// record so the client can derive a skill. Names, loadouts and numbers only — no uids.
func (s *store) ghosts(limit int, except string) ([]ghostRow, error) {
	rows, err := s.db.Query(`SELECT g.id, g.uid, g.name, g.snap, g.updated, COALESCE(p.wins,0), COALESCE(p.losses,0), COALESCE(p.battles,0)
		FROM ghosts g LEFT JOIN players p ON p.uid=g.uid WHERE g.updated>? AND g.uid<>? ORDER BY g.updated DESC, g.id DESC LIMIT ?`,
		s.now().Add(-ghostMaxAge).Unix(), except, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ghostRow{}
	for rows.Next() {
		var g ghostRow
		var uid, snap string
		if err := rows.Scan(&g.ID, &uid, &g.Name, &snap, &g.Updated, &g.Wins, &g.Losses, &g.Battles); err != nil {
			return nil, err
		}
		g.Snap = json.RawMessage(snap)
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
