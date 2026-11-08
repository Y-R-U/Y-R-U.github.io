package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"
)

// ---------------------------------------------------------------- helpers

func resetBoards(t *testing.T, at time.Time) {
	t.Helper()
	resetWorld(t)
	db.Exec(`DELETE FROM daily_results`)
	db.Exec(`DELETE FROM ladder_results`)
	clockMu.Lock()
	old := clock
	clock = at
	clockMu.Unlock()
	t.Cleanup(func() { clockMu.Lock(); clock = old; clockMu.Unlock() })
}

func setClock(at time.Time) { clockMu.Lock(); clock = at; clockMu.Unlock() }

func api(t *testing.T, method, path, tok string, body any) (int, map[string]any) {
	t.Helper()
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, ts.URL+"/gms/3d/skyputt/api"+path, rd)
	if tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, path, err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	var m map[string]any
	json.Unmarshal(raw, &m)
	if m == nil {
		m = map[string]any{}
	}
	m["_raw"] = string(raw)
	return res.StatusCode, m
}

func dev(uid, name string) string { return "dev:" + uid + ":" + name + ":signed" }

func dailyBody(day, hole, twist string, try, strokes int) map[string]any {
	return map[string]any{"day": day, "hole": hole, "twist": twist, "try": try, "strokes": strokes, "gems": 0, "ms": 42000}
}

func rowsOf(m map[string]any) []map[string]any {
	var out []map[string]any
	for _, r := range m["rows"].([]any) {
		out = append(out, r.(map[string]any))
	}
	return out
}

func noon(day string) time.Time { t, _ := time.Parse("2006-01-02", day); return t.Add(12 * time.Hour) }

// ---------------------------------------------------------------- daily

func TestDailySubmitAndBoard(t *testing.T) {
	const day = "2026-11-10"
	resetBoards(t, noon(day))
	p := dailyForSet(day, lockable)
	code, m := api(t, "POST", "/daily", dev("alice", "Alice"), dailyBody(day, p.Hole, p.Twist, 1, p.Par+1))
	if code != 200 || m["ok"] != true || m["improved"] != true {
		t.Fatalf("submit: %d %v", code, m["_raw"])
	}
	api(t, "POST", "/daily", dev("bob", "Bob"), dailyBody(day, p.Hole, p.Twist, 1, p.Par))
	api(t, "POST", "/daily", dev("cara", "Cara"), dailyBody(day, p.Hole, p.Twist, 1, p.Par))
	// alice's try 2 is better; try 3 worse (best stands); a resend of try 2 is a no-op
	if _, m := api(t, "POST", "/daily", dev("alice", "Alice"), dailyBody(day, p.Hole, p.Twist, 2, 1)); m["improved"] != true {
		t.Fatalf("try 2 should improve: %v", m["_raw"])
	}
	if _, m := api(t, "POST", "/daily", dev("alice", "Alice"), dailyBody(day, p.Hole, p.Twist, 3, p.Par+2)); m["improved"] != false || m["dup"] != false {
		t.Fatalf("try 3 worse: %v", m["_raw"])
	}
	if _, m := api(t, "POST", "/daily", dev("alice", "Alice"), dailyBody(day, p.Hole, p.Twist, 2, 1)); m["dup"] != true {
		t.Fatalf("resend should be dup: %v", m["_raw"])
	}
	if code, m := api(t, "POST", "/daily", dev("alice", "Alice"), dailyBody(day, p.Hole, p.Twist, 4, 1)); code != 400 || m["code"] != "bad_try" {
		t.Fatalf("try 4: %d %v", code, m["_raw"])
	}
	// board, as bob: alice 1st (1 stroke, 3 tries), bob + cara joint 2nd, bob is "you"
	code, b := api(t, "GET", "/daily?day="+day+"&hole="+p.Hole, dev("bob", "Bob"), nil)
	if code != 200 {
		t.Fatalf("board %d %v", code, b["_raw"])
	}
	rows := rowsOf(b)
	if len(rows) != 3 || rows[0]["name"] != "Alice" || rows[0]["strokes"].(float64) != 1 || rows[0]["tries"].(float64) != 3 {
		t.Fatalf("rows: %v", b["_raw"])
	}
	if rows[1]["rank"].(float64) != 2 || rows[2]["rank"].(float64) != 2 {
		t.Fatalf("ties should share a rank: %v", b["_raw"])
	}
	me := b["me"].(map[string]any)
	if me["name"] != "Bob" || me["rank"].(float64) != 2 || b["total"].(float64) != 3 {
		t.Fatalf("me: %v", b["_raw"])
	}
	// no emails or uids anywhere (dev signed tokens carry uid@dev.local)
	if strings.Contains(b["_raw"].(string), "@") || strings.Contains(b["_raw"].(string), "dev-") {
		t.Fatalf("board leaks identity: %v", b["_raw"])
	}
	// limit + my rank below the cut
	_, b = api(t, "GET", "/daily?day="+day+"&hole="+p.Hole+"&limit=1", dev("cara", "Cara"), nil)
	if len(rowsOf(b)) != 1 || b["me"].(map[string]any)["rank"].(float64) != 2 {
		t.Fatalf("limit/me: %v", b["_raw"])
	}
	// anonymous read works, no "me"; default hole = the global pick
	_, b = api(t, "GET", "/daily?day="+day, "", nil)
	if b["me"] != nil || b["hole"] != p.Hole || b["signedIn"] != false || len(rowsOf(b)) != 3 {
		t.Fatalf("anon board: %v", b["_raw"])
	}
}

func TestDailySanity(t *testing.T) {
	const day = "2026-11-20" // after reef's dailyFrom
	resetBoards(t, noon(day))
	p := dailyForSet(day, lockable)
	tok := dev("zed", "Zed")
	cases := []struct {
		name string
		body map[string]any
		code string
	}{
		{"malformed day", dailyBody("2026-11-2", p.Hole, p.Twist, 1, 2), "bad_day"},
		{"impossible date", dailyBody("2026-02-30", p.Hole, p.Twist, 1, 2), "bad_day"},
		{"two days ago", dailyBody(addDays(day, -2), p.Hole, p.Twist, 1, 2), "bad_day"},
		{"the day after tomorrow", dailyBody(addDays(day, 2), p.Hole, p.Twist, 1, 2), "bad_day"},
		{"before Daily #1", dailyBody("2026-11-01", p.Hole, p.Twist, 1, 2), "bad_day"},
		{"wrong hole", dailyBody(day, "sky1", p.Twist, 1, 2), "bad_hole"},
		{"unknown hole", dailyBody(day, "nope9", p.Twist, 1, 2), "bad_hole"},
		{"wrong twist", dailyBody(day, p.Hole, map[bool]string{true: "par", false: "clock"}[p.Twist != "par"], 1, 2), "bad_twist"},
		{"try 0", dailyBody(day, p.Hole, p.Twist, 0, 2), "bad_try"},
		{"0 strokes", dailyBody(day, p.Hole, p.Twist, 1, 0), "bad_strokes"},
		{"over the pickup cap", dailyBody(day, p.Hole, p.Twist, 1, p.Par+pickupOver+1), "bad_strokes"},
	}
	for _, c := range cases {
		code, m := api(t, "POST", "/daily", tok, c.body)
		if code != 400 || m["code"] != c.code {
			t.Errorf("%s: want 400 %s, got %d %v", c.name, c.code, code, m["_raw"])
		}
	}
	g := dailyBody(day, p.Hole, p.Twist, 1, 2)
	g["gems"] = p.Pickups + 1
	if code, m := api(t, "POST", "/daily", tok, g); code != 400 || m["code"] != "bad_gems" {
		t.Errorf("gems: %d %v", code, m["_raw"])
	}
	// the cap itself is fine
	if code, m := api(t, "POST", "/daily", tok, dailyBody(day, p.Hole, p.Twist, 1, p.Par+pickupOver)); code != 200 {
		t.Errorf("par+4: %d %v", code, m["_raw"])
	}
	// auth
	if code, m := api(t, "POST", "/daily", "", dailyBody(day, p.Hole, p.Twist, 2, 2)); code != 401 || m["code"] != "bad_token" {
		t.Errorf("no token: %d %v", code, m["_raw"])
	}
	if code, _ := api(t, "POST", "/daily", "garbage", dailyBody(day, p.Hole, p.Twist, 2, 2)); code != 401 {
		t.Errorf("bad token: %d", code)
	}
	// the hole is frozen for the day: a different (even valid) hole later is refused
	for h, q := range dailyAllowed(day) {
		if h != p.Hole {
			if code, m := api(t, "POST", "/daily", tok, dailyBody(day, h, q.Twist, 2, 2)); code != 409 || m["code"] != "hole_changed" {
				t.Errorf("hole changed: %d %v", code, m["_raw"])
			}
			break
		}
	}
	// a body over 4 KB
	big := dailyBody(day, p.Hole, p.Twist, 2, 2)
	big["name"] = strings.Repeat("x", 5000)
	if code, _ := api(t, "POST", "/daily", tok, big); code != 400 {
		t.Errorf("big body: %d", code)
	}
}

// The date window: a local "today" anywhere on Earth (UTC+14 .. UTC-12), plus a grace after the
// last midnight for a try started before it.
func TestDailyDateWindow(t *testing.T) {
	resetBoards(t, time.Date(2026, 11, 20, 11, 0, 0, 0, time.UTC))
	try := func(day string) int {
		p := dailyForSet(day, lockable)
		code, _ := api(t, "POST", "/daily", dev("w"+strings.ReplaceAll(day, "-", "")+clock.Format("1504"), "W"), dailyBody(day, p.Hole, p.Twist, 1, p.Par))
		return code
	}
	// 11:00 UTC: Kiritimati (UTC+14) is already on the 21st, Baker Island (UTC-12) still on the 19th
	for _, d := range []string{"2026-11-19", "2026-11-20", "2026-11-21"} {
		if c := try(d); c != 200 {
			t.Errorf("11:00Z %s: %d", d, c)
		}
	}
	if c := try("2026-11-22"); c != 400 {
		t.Errorf("11:00Z 22nd should be refused: %d", c)
	}
	// 14:30 UTC: the 19th ended at 12:00Z in UTC-12; the 3 h grace still takes it, 15:30 doesn't
	setClock(time.Date(2026, 11, 20, 14, 30, 0, 0, time.UTC))
	if c := try("2026-11-19"); c != 200 {
		t.Errorf("14:30Z 19th (grace): %d", c)
	}
	setClock(time.Date(2026, 11, 20, 15, 30, 0, 0, time.UTC))
	if c := try("2026-11-19"); c != 400 {
		t.Errorf("15:30Z 19th should be refused: %d", c)
	}
	// 09:59 UTC the 21st doesn't exist anywhere yet; 10:00 it does (UTC+14)
	setClock(time.Date(2026, 11, 20, 9, 59, 0, 0, time.UTC))
	if c := try("2026-11-21"); c != 400 {
		t.Errorf("09:59Z 21st should be refused: %d", c)
	}
	setClock(time.Date(2026, 11, 20, 10, 0, 0, 0, time.UTC))
	if c := try("2026-11-21"); c != 200 {
		t.Errorf("10:00Z 21st: %d", c)
	}
}

// A player with a locked course gets a fallback hole: that board is separate, and accepted.
func TestDailyLockedFallback(t *testing.T) {
	var day string
	var fb dailyPick
	for i := 0; i < 60 && day == ""; i++ {
		d := addDays("2026-11-10", i)
		g := dailyForSet(d, lockable)
		for h, q := range dailyAllowed(d) {
			if h != g.Hole {
				day, fb = d, q
				break
			}
		}
	}
	if day == "" {
		t.Fatal("no fallback day found in 60 days")
	}
	resetBoards(t, noon(day))
	g := dailyForSet(day, lockable)
	api(t, "POST", "/daily", dev("g1", "Global"), dailyBody(day, g.Hole, g.Twist, 1, g.Par))
	if code, m := api(t, "POST", "/daily", dev("f1", "Fallback"), dailyBody(day, fb.Hole, fb.Twist, 1, fb.Par)); code != 200 {
		t.Fatalf("fallback %s on %s: %d %v", fb.Hole, day, code, m["_raw"])
	}
	_, b := api(t, "GET", "/daily?day="+day+"&hole="+fb.Hole, "", nil)
	if rows := rowsOf(b); len(rows) != 1 || rows[0]["name"] != "Fallback" {
		t.Fatalf("fallback board: %v", b["_raw"])
	}
}

func TestBoardsFriends(t *testing.T) {
	const day = "2026-11-12"
	resetBoards(t, noon(day))
	p := dailyForSet(day, lockable)
	for i, u := range []string{"amy", "ben", "cat", "dan"} {
		api(t, "POST", "/daily", dev(u, strings.ToUpper(u[:1])+u[1:]), dailyBody(day, p.Hole, p.Twist, 1, 1+i))
	}
	// amy finished an online round with cat
	storeRound("r1", "ABCDEF", "[]", "[]", nowMs(), []roundPlayer{{UID: "dev-amy", Total: 20, Rank: 1}, {UID: "dev-cat", Total: 22, Rank: 2}})
	_, b := api(t, "GET", "/daily?day="+day+"&hole="+p.Hole+"&scope=friends", dev("amy", "Amy"), nil)
	rows := rowsOf(b)
	if b["scope"] != "friends" || len(rows) != 2 || rows[0]["name"] != "Amy" || rows[1]["name"] != "Cat" || rows[1]["rank"].(float64) != 2 {
		t.Fatalf("friends: %v", b["_raw"])
	}
	// dan has no friends: just himself, rank 1
	_, b = api(t, "GET", "/daily?day="+day+"&hole="+p.Hole+"&scope=friends", dev("dan", "Dan"), nil)
	if len(rowsOf(b)) != 1 || b["me"].(map[string]any)["rank"].(float64) != 1 {
		t.Fatalf("friends (none): %v", b["_raw"])
	}
	// without a token, friends falls back to everyone
	_, b = api(t, "GET", "/daily?day="+day+"&hole="+p.Hole+"&scope=friends", "", nil)
	if b["scope"] != "all" || len(rowsOf(b)) != 4 {
		t.Fatalf("friends anon: %v", b["_raw"])
	}
}

// The name is the rooms' name: the one sent, cleaned (profanity / blank → Firebase name → Golfer XXXX).
func TestBoardsNames(t *testing.T) {
	const day = "2026-11-12"
	resetBoards(t, noon(day))
	p := dailyForSet(day, lockable)
	b := dailyBody(day, p.Hole, p.Twist, 1, 2)
	b["name"] = "  Putt   Queen "
	api(t, "POST", "/daily", "dev:q1::anon", b)
	b["name"] = ""
	api(t, "POST", "/daily", "dev:q2::anon", b)
	_, m := api(t, "GET", "/daily?day="+day+"&hole="+p.Hole, "", nil)
	names := []string{}
	for _, r := range rowsOf(m) {
		names = append(names, r["name"].(string))
	}
	if strings.Join(names, "|") != "Putt Queen|Golfer "+strings.ToUpper(pidOf("dev-q2")[:4]) {
		t.Fatalf("names: %v", names)
	}
	// a hello with a new name renames the board row too (same players table)
	c := dial(t, "q1", "Queenie")
	_ = c
	_, m = api(t, "GET", "/daily?day="+day+"&hole="+p.Hole, "", nil)
	if rowsOf(m)[0]["name"] != "Queenie" {
		t.Fatalf("rename via hello: %v", m["_raw"])
	}
}

func TestBoardsRateLimit(t *testing.T) {
	const day = "2026-11-12"
	resetBoards(t, noon(day))
	cfg.NoRate = false
	defer func() { cfg.NoRate = true }()
	p := dailyForSet(day, lockable)
	got429 := 0
	for i := 0; i < 25; i++ {
		code, _ := api(t, "POST", "/daily", dev("spam", "Spam"), dailyBody(day, p.Hole, p.Twist, 1, 2))
		if code == 429 {
			got429++
		}
	}
	if got429 != 5 {
		t.Fatalf("want 5 rate-limited of 25 (20 / 10 min per uid), got %d", got429)
	}
}

// ---------------------------------------------------------------- course rounds

func TestLadderSubmitAndBoard(t *testing.T) {
	resetBoards(t, time.Date(2026, 11, 11, 12, 0, 0, 0, time.UTC)) // a Wednesday
	const week = "2026-11-09"
	sky := courseByID["sky"]
	front := make([]int, 9)
	par := 0
	for i := range front {
		front[i] = sky.Holes[i].Par
		par += sky.Holes[i].Par
	}
	sub := func(tok string, scores []int, wk string) (int, map[string]any) {
		return api(t, "POST", "/ladder", tok, map[string]any{"course": "sky", "round": "front", "week": wk, "scores": scores})
	}
	if code, m := sub(dev("ann", "Ann"), front, week); code != 200 || m["strokes"].(float64) != float64(par) || m["improved"] != true {
		t.Fatalf("submit: %d %v", code, m["_raw"])
	}
	better := append([]int{}, front...)
	better[0] = 1
	sub(dev("bo", "Bo"), better, week)
	worse := append([]int{}, front...)
	worse[1]++
	if _, m := sub(dev("ann", "Ann"), worse, week); m["improved"] != false {
		t.Fatalf("worse round should not improve: %v", m["_raw"])
	}
	_, b := api(t, "GET", "/ladder?course=sky&round=front&week="+week, dev("ann", "Ann"), nil)
	rows := rowsOf(b)
	if len(rows) != 2 || rows[0]["name"] != "Bo" || rows[1]["strokes"].(float64) != float64(par) || rows[1]["rounds"].(float64) != 2 {
		t.Fatalf("week board: %v", b["_raw"])
	}
	if b["me"].(map[string]any)["rank"].(float64) != 2 || rows[0]["par"].(float64) != float64(par) {
		t.Fatalf("me/par: %v", b["_raw"])
	}
	// next week: the weekly board is empty, all-time keeps both
	setClock(time.Date(2026, 11, 17, 12, 0, 0, 0, time.UTC))
	if code, m := sub(dev("ann", "Ann"), front, week); code != 400 || m["code"] != "bad_week" {
		t.Fatalf("last week's key next Tuesday: %d %v", code, m["_raw"])
	}
	_, b = api(t, "GET", "/ladder?course=sky&round=front&week=2026-11-16", "", nil)
	if len(rowsOf(b)) != 0 {
		t.Fatalf("new week should be empty: %v", b["_raw"])
	}
	_, b = api(t, "GET", "/ladder?course=sky&round=front&week=all", "", nil)
	if len(rowsOf(b)) != 2 {
		t.Fatalf("all-time: %v", b["_raw"])
	}
	// Monday 05:00 UTC: Sunday still runs in the Americas, so last week's key is still fine
	setClock(time.Date(2026, 11, 16, 5, 0, 0, 0, time.UTC))
	if code, m := sub(dev("cy", "Cy"), front, week); code != 200 {
		t.Fatalf("late Sunday round: %d %v", code, m["_raw"])
	}
	// sanity
	setClock(time.Date(2026, 11, 11, 12, 0, 0, 0, time.UTC))
	bad := []struct {
		name string
		body map[string]any
		code string
	}{
		{"unknown course", map[string]any{"course": "moon", "round": "all", "week": week, "scores": front}, "bad_round"},
		{"unknown nine", map[string]any{"course": "sky", "round": "middle", "week": week, "scores": front}, "bad_round"},
		{"not a Monday", map[string]any{"course": "sky", "round": "front", "week": "2026-11-10", "scores": front}, "bad_week"},
		{"short card", map[string]any{"course": "sky", "round": "front", "week": week, "scores": front[:8]}, "bad_scores"},
		{"zero", map[string]any{"course": "sky", "round": "front", "week": week, "scores": append([]int{0}, front[1:]...)}, "bad_scores"},
		{"over cap", map[string]any{"course": "sky", "round": "front", "week": week, "scores": append([]int{sky.Holes[0].Par + 5}, front[1:]...)}, "bad_scores"},
	}
	for _, c := range bad {
		if code, m := api(t, "POST", "/ladder", dev("ann", "Ann"), c.body); code != 400 || m["code"] != c.code {
			t.Errorf("%s: want %s, got %d %v", c.name, c.code, code, m["_raw"])
		}
	}
	// a whole course without nines ('all')
	fest := courseByID["festival"]
	fs := make([]int, len(fest.Holes))
	for i, h := range fest.Holes {
		fs[i] = h.Par
	}
	if code, m := api(t, "POST", "/ladder", dev("ann", "Ann"), map[string]any{"course": "festival", "round": "all", "week": week, "scores": fs}); code != 200 {
		t.Errorf("festival all: %d %v", code, m["_raw"])
	}
	if code, _ := api(t, "GET", "/ladder?course=sky&round=front&week=2026-11-10", "", nil); code != 400 {
		t.Errorf("board with a non-Monday week: %d", code)
	}
}

func TestBoardsHealthAndCORS(t *testing.T) {
	_, h := api(t, "GET", "/health", "", nil)
	if h["boards"].(float64) != boardsVersion {
		t.Fatalf("health: %v", h["_raw"])
	}
	req, _ := http.NewRequest("OPTIONS", ts.URL+"/gms/3d/skyputt/api/daily", nil)
	req.Header.Set("Origin", "https://games.br8t.com")
	req.Header.Set("Access-Control-Request-Method", "POST")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.Header.Get("Access-Control-Allow-Origin") != "https://games.br8t.com" || !strings.Contains(res.Header.Get("Access-Control-Allow-Methods"), "POST") ||
		!strings.Contains(res.Header.Get("Access-Control-Allow-Headers"), "Authorization") {
		t.Fatalf("preflight: %v", res.Header)
	}
	req, _ = http.NewRequest("POST", ts.URL+"/gms/3d/skyputt/api/daily", strings.NewReader("{}"))
	req.Header.Set("Origin", "https://evil.example")
	res, _ = http.DefaultClient.Do(req)
	res.Body.Close()
	if res.StatusCode != 403 {
		t.Fatalf("foreign origin POST: %d", res.StatusCode)
	}
}

// The boards schema is additive: on a DB made by the previous server (base schema + data) it
// adds its tables and leaves every existing row alone; opening twice is a no-op.
func TestBoardsMigrationOnOldDB(t *testing.T) {
	dir := t.TempDir()
	path := dir + "/old.db"
	old, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := old.Exec(schema); err != nil {
		t.Fatal(err)
	}
	old.Exec(`INSERT INTO players(uid, pid, name, anon, created, seen, rounds) VALUES('u1','p1','Old',1,1,1,3)`)
	old.Exec(`INSERT INTO rounds(id, code, holes, seats, started, ended) VALUES('r9','CODE99','[]','[]',1,2)`)
	old.Exec(`INSERT INTO settings(key, value) VALUES('salt','keepme')`)
	old.Close()

	keep := db
	defer func() { db = keep }()
	openDB(path)
	openDB(path) // idempotent
	var n int
	var name, salt string
	db.QueryRow(`SELECT name, rounds FROM players WHERE uid='u1'`).Scan(&name, &n)
	db.QueryRow(`SELECT value FROM settings WHERE key='salt'`).Scan(&salt)
	if name != "Old" || n != 3 || salt != "keepme" {
		t.Fatalf("old rows changed: %q %d %q", name, n, salt)
	}
	for _, tb := range []string{"daily_results", "ladder_results"} {
		if err := db.QueryRow(`SELECT COUNT(*) FROM ` + tb).Scan(&n); err != nil || n != 0 {
			t.Fatalf("%s: %v %d", tb, err, n)
		}
	}
	db.Close()
	os.Remove(path)
}

func TestBoardsSweep(t *testing.T) {
	resetBoards(t, time.Date(2027, 6, 1, 12, 0, 0, 0, time.UTC))
	db.Exec(`INSERT INTO daily_results(day, uid, hole, twist, strokes, first, at) VALUES('2026-11-10','x','sky1','par',2,1,1), ('2027-05-30','x','sky1','par',2,1,1)`)
	db.Exec(`INSERT INTO ladder_results(course, round, week, uid, strokes, par, scores, at) VALUES('sky','front','2026-01-05','x',30,27,'[]',1), ('sky','front','all','x',30,27,'[]',1), ('sky','front','2027-05-31','x',30,27,'[]',1)`)
	sweepBoards()
	var d, l int
	db.QueryRow(`SELECT COUNT(*) FROM daily_results`).Scan(&d)
	db.QueryRow(`SELECT COUNT(*) FROM ladder_results`).Scan(&l)
	if d != 1 || l != 2 {
		t.Fatalf("sweep kept daily %d (want 1), ladder %d (want 2: all-time + this week)", d, l)
	}
}
