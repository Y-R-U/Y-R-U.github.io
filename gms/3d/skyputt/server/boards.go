package main

// Online leaderboards (boards agent, docs/notes/boards.md): the Daily Challenge board per
// (day, hole) and the course-round board per (course, round, week | all). HTTP + JSON, the same
// identity as the websocket (Firebase ID token, anonymous users included, or a dev token with
// SKYPUTT_DEV_AUTH) sent as `Authorization: Bearer <token>`. Names are the ones rooms use
// (players.name, set by hello or by a submission), never emails.
//
// Results are client-reported (D11). The server only does cheap sanity checks: the day is a
// local "today" somewhere on Earth right now (or just after midnight), the hole + twist are what
// the daily pick (daily.go, ported from the JS) could have given that day, strokes are 1..par+4,
// at most one result per try and 3 tries per player per day, and per-uid / per-IP rate limits.

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"math/bits"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Additive schema, applied by openDB after the base schema (CREATE ... IF NOT EXISTS only, so it
// is safe on a live DB created by an older server: existing tables are never touched).
const boardsSchema = `
CREATE TABLE IF NOT EXISTS daily_results (
  day     TEXT NOT NULL,              -- the player's local date, YYYY-MM-DD
  uid     TEXT NOT NULL,
  hole    TEXT NOT NULL,
  twist   TEXT NOT NULL,
  strokes INTEGER NOT NULL,           -- best finished try so far
  met     INTEGER NOT NULL DEFAULT 0, -- that try met the twist goal (server-computed)
  gems    INTEGER NOT NULL DEFAULT 0,
  ms      INTEGER NOT NULL DEFAULT 0, -- that try's play time (client clock)
  tries   INTEGER NOT NULL DEFAULT 0, -- bitmask of the try numbers reported (1..3)
  best_try INTEGER NOT NULL DEFAULT 0,
  first   INTEGER NOT NULL,           -- first report (server ms)
  at      INTEGER NOT NULL,           -- when the best was set (ties: earlier first)
  PRIMARY KEY (day, uid)
);
CREATE INDEX IF NOT EXISTS idx_daily_board ON daily_results(day, hole, strokes, at);

CREATE TABLE IF NOT EXISTS ladder_results (
  course  TEXT NOT NULL,
  round   TEXT NOT NULL,              -- a nine id (front/back) or 'all'
  week    TEXT NOT NULL,              -- Monday YYYY-MM-DD of the player's local week, or 'all'
  uid     TEXT NOT NULL,
  strokes INTEGER NOT NULL,           -- best round total
  par     INTEGER NOT NULL,
  scores  TEXT NOT NULL,              -- JSON per-hole strokes of that best round
  rounds  INTEGER NOT NULL DEFAULT 0, -- rounds reported
  at      INTEGER NOT NULL,
  PRIMARY KEY (course, round, week, uid)
);
CREATE INDEX IF NOT EXISTS idx_ladder_board ON ladder_results(course, round, week, strokes, at);
`

// boardsVersion is reported by /api/health ("boards"): clients show the Online tabs only when it is set.
const boardsVersion = 1

const (
	dailyTries   = 3
	pickupOver   = 4 // D10: a hole is picked up at par + 4
	boardDefault = 50
	boardMax     = 100
	keepDailyDay = 120 // days of daily rows kept
	keepLadderWk = 400 // days of weekly ladder rows kept ('all' rows are kept)
	maxBody      = 4096
	// a try started before midnight is recorded on the day it started: accept it this long after
	// the latest midnight on Earth (UTC-12)
	lateGrace = 3 * time.Hour
)

func init() {
	limits["dsub"] = bucket{20, 10 * time.Minute}     // daily submissions per uid
	limits["lsub"] = bucket{30, 10 * time.Minute}     // round submissions per uid
	limits["subip"] = bucket{120, 10 * time.Minute}   // all submissions per IP
	limits["boardip"] = bucket{240, 10 * time.Minute} // board reads per IP
}

// dayWindow: the local dates that are "today" somewhere right now (UTC+14 .. UTC-12), plus the
// previous day for lateGrace after the last midnight.
func dayWindow(now time.Time) (lo, hi string) {
	u := now.UTC()
	return u.Add(-12*time.Hour - lateGrace).Format("2006-01-02"), u.Add(14 * time.Hour).Format("2006-01-02")
}

func mondayOf(ymd string) string {
	t, _ := time.Parse("2006-01-02", ymd)
	return t.AddDate(0, 0, -((int(t.Weekday()) + 6) % 7)).Format("2006-01-02")
}

// ---------------------------------------------------------------- helpers

type authed struct {
	id   fbIdentity
	pid  string
	name string
}

func bearer(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if t, ok := strings.CutPrefix(h, "Bearer "); ok {
		return strings.TrimSpace(t)
	}
	return ""
}

// optAuth: the caller's identity if a valid token was sent (nil otherwise, not an error).
func optAuth(r *http.Request) *authed {
	tok := bearer(r)
	if tok == "" {
		return nil
	}
	id, err := verifyToken(tok)
	if err != nil {
		return nil
	}
	return &authed{id: id, pid: pidOf(id.UID)}
}

func readBody(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxBody)
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		writeErr(w, 400, "bad_request", "bad JSON")
		return false
	}
	return true
}

// submitAuth: token required; the display name follows the rooms' rule and is stored on players.
func submitAuth(w http.ResponseWriter, r *http.Request, rawName, kind string) *authed {
	a := optAuth(r)
	if a == nil {
		writeErr(w, 401, "bad_token", "sign-in needed")
		return nil
	}
	if !hit(kind, a.id.UID) || !hit("subip", clientIP(r)) {
		rateLimited(w)
		return nil
	}
	a.name = displayName(rawName, a.id.Name, a.pid)
	upsertPlayer(a.id.UID, a.name, a.id.Anon)
	return a
}

// scopeSQL restricts a board to the caller and the people they finished an online round with.
const friendsSQL = ` AND t.uid IN (SELECT rp2.uid FROM round_players rp1 JOIN round_players rp2 ON rp2.round = rp1.round WHERE rp1.uid = ? UNION SELECT ?)`

type boardRow struct {
	Rank    int    `json:"rank"`
	Name    string `json:"name"`
	PID     string `json:"pid"`
	Strokes int    `json:"strokes"`
	Par     int    `json:"par,omitempty"`
	Tries   int    `json:"tries,omitempty"`  // daily: tries reported
	Rounds  int    `json:"rounds,omitempty"` // course round: rounds reported
	Met     bool   `json:"met,omitempty"`
	At      int64  `json:"at"`
	You     bool   `json:"you,omitempty"`
	scanUID *string
}

func limitOf(r *http.Request) int {
	n, err := strconv.Atoi(r.URL.Query().Get("limit"))
	if err != nil || n <= 0 {
		return boardDefault
	}
	return min(n, boardMax)
}

// board runs a board query: `where` selects the rows of table t (args), ordered by strokes then
// time; returns the top rows, the total and the caller's own row (any rank). `cols` are the
// columns `scan` reads after t.uid (players.name + pid come last).
func board(table, cols, where string, args []any, a *authed, friends bool, limit int, scan func(*sql.Rows, *boardRow) error) (rows []boardRow, total int, me *boardRow, err error) {
	if friends && a != nil {
		where += friendsSQL
		args = append(args, a.id.UID, a.id.UID)
	}
	if err = db.QueryRow(`SELECT COUNT(*) FROM `+table+` t WHERE `+where, args...).Scan(&total); err != nil {
		return
	}
	sel := `SELECT t.uid, ` + cols + `, p.name, p.pid FROM ` + table + ` t JOIN players p ON p.uid = t.uid WHERE ` + where
	read := func(q *sql.Rows) (boardRow, string, error) {
		var row boardRow
		var uid string
		row.scanUID = &uid
		e := scan(q, &row)
		return row, uid, e
	}
	// one connection (SetMaxOpenConns(1)): every result set is closed before the next query
	q, err := db.Query(sel+` ORDER BY t.strokes, t.at LIMIT ?`, append(args, limit)...)
	if err != nil {
		return
	}
	rank, prev := 0, -1
	for i := 0; q.Next(); i++ {
		row, uid, e := read(q)
		if e != nil {
			q.Close()
			err = e
			return
		}
		if row.Strokes != prev {
			rank, prev = i+1, row.Strokes
		}
		row.Rank = rank
		if a != nil && uid == a.id.UID {
			row.You = true
			c := row
			me = &c
		}
		rows = append(rows, row)
	}
	err = q.Err()
	q.Close()
	if err != nil || a == nil || me != nil {
		return
	}
	// my row below the top: rank = 1 + rows strictly better
	one, e := db.Query(sel+` AND t.uid = ?`, append(args, a.id.UID)...)
	if e != nil {
		return
	}
	var mine *boardRow
	if one.Next() {
		if row, _, e := read(one); e == nil {
			mine = &row
		}
	}
	one.Close()
	if mine != nil {
		var better int
		db.QueryRow(`SELECT COUNT(*) FROM `+table+` t WHERE `+where+` AND t.strokes < ?`, append(args, mine.Strokes)...).Scan(&better)
		mine.Rank, mine.You = better+1, true
		me = mine
	}
	return
}

// ---------------------------------------------------------------- daily

type dailyIn struct {
	Day     string `json:"day"`
	Hole    string `json:"hole"`
	Twist   string `json:"twist"`
	Try     int    `json:"try"`
	Strokes int    `json:"strokes"`
	Gems    int    `json:"gems"`
	Ms      int64  `json:"ms"`
	Name    string `json:"name"`
}

// checkDaily: the sanity rules for one daily result → the day's pick for that hole, or an error code.
func checkDaily(in dailyIn, now time.Time) (dailyPick, string) {
	var none dailyPick
	if _, ok := parseYmd(in.Day); !ok || in.Day < pool.Epoch {
		return none, "bad_day"
	}
	if lo, hi := dayWindow(now); in.Day < lo || in.Day > hi {
		return none, "bad_day"
	}
	p, ok := dailyAllowed(in.Day)[in.Hole]
	if !ok {
		return none, "bad_hole"
	}
	if in.Twist != p.Twist {
		return none, "bad_twist"
	}
	if in.Try < 1 || in.Try > dailyTries {
		return none, "bad_try"
	}
	if in.Strokes < 1 || in.Strokes > p.Par+pickupOver {
		return none, "bad_strokes"
	}
	if in.Gems < 0 || in.Gems > p.Pickups {
		return none, "bad_gems"
	}
	return p, ""
}

func dailyMet(p dailyPick, strokes, gems int) bool {
	switch p.Twist {
	case "birdie", "kit":
		return strokes < p.Par
	case "crystals":
		return gems >= p.Pickups
	}
	return strokes <= p.Par
}

func handleDailySubmit(w http.ResponseWriter, r *http.Request) {
	var in dailyIn
	if !readBody(w, r, &in) {
		return
	}
	a := submitAuth(w, r, in.Name, "dsub")
	if a == nil {
		return
	}
	p, code := checkDaily(in, nowFn())
	if code != "" {
		writeErr(w, 400, code, "result refused: "+code)
		return
	}
	if in.Ms < 0 || in.Ms > 3600_000 {
		in.Ms = 0
	}
	met := dailyMet(p, in.Strokes, in.Gems)
	now := nowMs()
	tx, err := db.Begin()
	if err != nil {
		writeErr(w, 500, "db", "try again")
		return
	}
	defer tx.Rollback()
	var hole string
	var best, mask int
	err = tx.QueryRow(`SELECT hole, strokes, tries FROM daily_results WHERE day = ? AND uid = ?`, in.Day, a.id.UID).Scan(&hole, &best, &mask)
	bit := 1 << (in.Try - 1)
	dup, improved := false, false
	switch {
	case errors.Is(err, sql.ErrNoRows):
		_, err = tx.Exec(`INSERT INTO daily_results(day, uid, hole, twist, strokes, met, gems, ms, tries, best_try, first, at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
			in.Day, a.id.UID, in.Hole, in.Twist, in.Strokes, b2i(met), in.Gems, in.Ms, bit, in.Try, now, now)
		improved = true
	case err != nil:
	case hole != in.Hole:
		writeErr(w, 409, "hole_changed", "you already reported a different hole today")
		return
	case mask&bit != 0:
		dup = true // a resend (the reply was lost): the first report of a try stands
	case in.Strokes < best:
		_, err = tx.Exec(`UPDATE daily_results SET strokes = ?, met = ?, gems = ?, ms = ?, tries = tries | ?, best_try = ?, at = ? WHERE day = ? AND uid = ?`,
			in.Strokes, b2i(met), in.Gems, in.Ms, bit, in.Try, now, in.Day, a.id.UID)
		improved = true
	default:
		_, err = tx.Exec(`UPDATE daily_results SET tries = tries | ? WHERE day = ? AND uid = ?`, bit, in.Day, a.id.UID)
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		log.Printf("daily submit: %v", err)
		writeErr(w, 500, "db", "try again")
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "dup": dup, "improved": improved, "met": met, "name": a.name, "n": p.N})
}

const dailyCols = `t.strokes, t.met, t.tries, t.at`

func scanDaily(q *sql.Rows, row *boardRow) error {
	var met, mask int
	err := q.Scan(row.scanUID, &row.Strokes, &met, &mask, &row.At, &row.Name, &row.PID)
	row.Met, row.Tries = met != 0, bits.OnesCount(uint(mask))
	return err
}

func handleDailyBoard(w http.ResponseWriter, r *http.Request) {
	if !hit("boardip", clientIP(r)) {
		rateLimited(w)
		return
	}
	qv := r.URL.Query()
	day := qv.Get("day")
	if _, ok := parseYmd(day); !ok {
		writeErr(w, 400, "bad_day", "day must be YYYY-MM-DD")
		return
	}
	hole := qv.Get("hole")
	if hole == "" && day >= pool.Epoch {
		hole = dailyForSet(day, lockable).Hole
	}
	if _, ok := holeByID[hole]; !ok {
		writeErr(w, 400, "bad_hole", "unknown hole")
		return
	}
	a, friends := optAuth(r), qv.Get("scope") == "friends"
	rows, total, me, err := board("daily_results", dailyCols, "t.day = ? AND t.hole = ?", []any{day, hole}, a, friends, limitOf(r), scanDaily)
	if err != nil {
		log.Printf("daily board: %v", err)
		writeErr(w, 500, "db", "try again")
		return
	}
	writeJSON(w, 200, map[string]any{"day": day, "hole": hole, "par": holeByID[hole].h.Par, "scope": scopeName(friends, a),
		"total": total, "rows": nonNil(rows), "me": me, "signedIn": a != nil, "now": nowMs()})
}

func scopeName(friends bool, a *authed) string {
	if friends && a != nil {
		return "friends"
	}
	return "all"
}

func nonNil(r []boardRow) []boardRow {
	if r == nil {
		return []boardRow{}
	}
	return r
}

// ---------------------------------------------------------------- course rounds

type ladderIn struct {
	Course string `json:"course"`
	Round  string `json:"round"`
	Week   string `json:"week"`
	Scores []int  `json:"scores"`
	Name   string `json:"name"`
}

// roundHoles: the holes of a course round ('all' or one of its nines).
func roundHoles(course, round string) ([]poolHole, bool) {
	c := courseByID[course]
	if c == nil {
		return nil, false
	}
	if round == "all" {
		return c.Holes, true
	}
	for _, n := range c.Nines {
		if n.ID == round && n.From >= 0 && n.To <= len(c.Holes) && n.From < n.To {
			return c.Holes[n.From:n.To], true
		}
	}
	return nil, false
}

func checkLadder(in ladderIn, now time.Time) (strokes, par int, code string) {
	hs, ok := roundHoles(in.Course, in.Round)
	if !ok {
		return 0, 0, "bad_round"
	}
	if _, ok := parseYmd(in.Week); !ok || mondayOf(in.Week) != in.Week {
		return 0, 0, "bad_week"
	}
	if lo, hi := dayWindow(now); in.Week != mondayOf(lo) && in.Week != mondayOf(hi) {
		return 0, 0, "bad_week"
	}
	if len(in.Scores) != len(hs) {
		return 0, 0, "bad_scores"
	}
	for i, s := range in.Scores {
		if s < 1 || s > hs[i].Par+pickupOver {
			return 0, 0, "bad_scores"
		}
		strokes += s
		par += hs[i].Par
	}
	return strokes, par, ""
}

func handleLadderSubmit(w http.ResponseWriter, r *http.Request) {
	var in ladderIn
	if !readBody(w, r, &in) {
		return
	}
	a := submitAuth(w, r, in.Name, "lsub")
	if a == nil {
		return
	}
	strokes, par, code := checkLadder(in, nowFn())
	if code != "" {
		writeErr(w, 400, code, "result refused: "+code)
		return
	}
	sc, _ := json.Marshal(in.Scores)
	now := nowMs()
	tx, err := db.Begin()
	if err != nil {
		writeErr(w, 500, "db", "try again")
		return
	}
	defer tx.Rollback()
	improved := map[string]bool{}
	for _, wk := range []string{in.Week, "all"} {
		var best int
		e := tx.QueryRow(`SELECT strokes FROM ladder_results WHERE course = ? AND round = ? AND week = ? AND uid = ?`, in.Course, in.Round, wk, a.id.UID).Scan(&best)
		switch {
		case errors.Is(e, sql.ErrNoRows):
			_, err = tx.Exec(`INSERT INTO ladder_results(course, round, week, uid, strokes, par, scores, rounds, at) VALUES(?,?,?,?,?,?,?,1,?)`,
				in.Course, in.Round, wk, a.id.UID, strokes, par, string(sc), now)
			improved[wk] = true
		case e != nil:
			err = e
		case strokes < best:
			_, err = tx.Exec(`UPDATE ladder_results SET strokes = ?, par = ?, scores = ?, rounds = rounds + 1, at = ? WHERE course = ? AND round = ? AND week = ? AND uid = ?`,
				strokes, par, string(sc), now, in.Course, in.Round, wk, a.id.UID)
			improved[wk] = true
		default:
			_, err = tx.Exec(`UPDATE ladder_results SET rounds = rounds + 1 WHERE course = ? AND round = ? AND week = ? AND uid = ?`, in.Course, in.Round, wk, a.id.UID)
		}
		if err != nil {
			break
		}
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		log.Printf("ladder submit: %v", err)
		writeErr(w, 500, "db", "try again")
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "strokes": strokes, "par": par, "improved": improved[in.Week], "best": improved["all"], "name": a.name})
}

const ladderCols = `t.strokes, t.par, t.rounds, t.at`

func scanLadder(q *sql.Rows, row *boardRow) error {
	return q.Scan(row.scanUID, &row.Strokes, &row.Par, &row.Rounds, &row.At, &row.Name, &row.PID)
}

func handleLadderBoard(w http.ResponseWriter, r *http.Request) {
	if !hit("boardip", clientIP(r)) {
		rateLimited(w)
		return
	}
	qv := r.URL.Query()
	course, round, week := qv.Get("course"), qv.Get("round"), qv.Get("week")
	if _, ok := roundHoles(course, round); !ok {
		writeErr(w, 400, "bad_round", "unknown course round")
		return
	}
	if week == "" {
		week = mondayOf(nowFn().UTC().Format("2006-01-02"))
	}
	if _, ok := parseYmd(week); week != "all" && (!ok || mondayOf(week) != week) {
		writeErr(w, 400, "bad_week", "week must be a Monday YYYY-MM-DD or all")
		return
	}
	a, friends := optAuth(r), qv.Get("scope") == "friends"
	rows, total, me, err := board("ladder_results", ladderCols, "t.course = ? AND t.round = ? AND t.week = ?", []any{course, round, week}, a, friends, limitOf(r), scanLadder)
	if err != nil {
		log.Printf("ladder board: %v", err)
		writeErr(w, 500, "db", "try again")
		return
	}
	writeJSON(w, 200, map[string]any{"course": course, "round": round, "week": week, "scope": scopeName(friends, a),
		"total": total, "rows": nonNil(rows), "me": me, "signedIn": a != nil, "now": nowMs()})
}

// sweepBoards: daily rows after keepDailyDay days, weekly round rows after keepLadderWk days.
func sweepBoards() {
	day := nowFn().UTC().AddDate(0, 0, -keepDailyDay).Format("2006-01-02")
	db.Exec(`DELETE FROM daily_results WHERE day < ?`, day)
	wk := nowFn().UTC().AddDate(0, 0, -keepLadderWk).Format("2006-01-02")
	db.Exec(`DELETE FROM ladder_results WHERE week != 'all' AND week < ?`, wk)
}
