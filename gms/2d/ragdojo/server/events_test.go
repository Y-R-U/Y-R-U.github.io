package main

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

// The Go port must match the JS engine byte for byte: testdata/events_vectors.json is written
// by tools/eventsvectors.mjs from js/events (and `--check` fails when it goes stale).
type vectors struct {
	Hash []struct {
		S string
		H uint32
	}
	Mulberry []struct {
		Seed uint32
		Out  []float64
	}
	Dice []struct {
		UID, Event string
		Rolls      []int
	}
	Boards []struct {
		Event          string
		Ladders, Vines [][2]int
	}
	Players []struct {
		UID, Event                 string
		Points                     []int
		Rolls, Pos, Turns, MyTurns int
		FinishedAt                 *int
		Ends, ByTurn               []int
		ShownTurns, ShownPos       int
	}
	Windows []struct {
		Def string
		Ms  int64
		Win *struct {
			Key, ID    string
			Start, End int64
		}
	}
	Parsed []struct {
		ID         string
		Start, End *int64
	}
	Counted []struct {
		Def        string
		Start, End int64
		Battles    []struct {
			ID, Src string
			At      int64
			Pts     int
		}
		Out []struct {
			ID, Src string
			At      int64
			Pts     int
		}
	}
}

func loadVectors(t *testing.T) vectors {
	t.Helper()
	b, err := os.ReadFile("testdata/events_vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var v vectors
	if err := json.Unmarshal(b, &v); err != nil {
		t.Fatal(err)
	}
	return v
}

// The vectors written into docs/EVENTS.md — the server's contract.
func TestEventsDocVectors(t *testing.T) {
	if hash32("") != 2872998923 || hash32("ragdojo") != 2596282342 {
		t.Fatalf("hash32: %d %d", hash32(""), hash32("ragdojo"))
	}
	want := []int{2, 1, 5, 3, 3, 2, 2, 2, 6, 6, 6, 1, 4, 3, 3, 4, 6, 1, 5, 6}
	for n, w := range want {
		if d := die("uid-aaron", "vines-day:2026-10-13", n); d != w {
			t.Fatalf("die roll %d = %d, want %d", n, d, w)
		}
	}
	if e := turnEnds([]int{1, 3, 2}); !reflect.DeepEqual(e, []int{1, 4, 6}) {
		t.Fatalf("turnEnds %v", e)
	}
	b := makeBoard("vines-day:2026-10-13")
	lad := [][2]int{{57, 83}, {48, 56}, {42, 63}, {19, 39}, {32, 51}, {12, 33}, {84, 99}, {14, 28}}
	vin := [][2]int{{55, 27}, {68, 54}, {50, 29}, {60, 41}, {85, 75}, {25, 2}, {98, 66}, {91, 70}}
	if !reflect.DeepEqual(b.Ladders, lad) || !reflect.DeepEqual(b.Vines, vin) {
		t.Fatalf("board\n%v\n%v", b.Ladders, b.Vines)
	}
}

func TestEventsGoldenVectors(t *testing.T) {
	v := loadVectors(t)
	if len(v.Hash) < 40 || len(v.Boards) < 40 || len(v.Players) < 50 || len(v.Windows) < 200 || len(v.Counted) < 20 {
		t.Fatalf("vector file is too thin: %d %d %d %d %d", len(v.Hash), len(v.Boards), len(v.Players), len(v.Windows), len(v.Counted))
	}
	for _, c := range v.Hash {
		if h := hash32(c.S); h != c.H {
			t.Errorf("hash32(%q) = %d, JS %d", c.S, h, c.H)
		}
	}
	for _, c := range v.Mulberry {
		g := mulberry32(c.Seed)
		for i, w := range c.Out {
			if x := g(); x != w {
				t.Errorf("mulberry32(%d)[%d] = %v, JS %v", c.Seed, i, x, w)
			}
		}
	}
	for _, c := range v.Dice {
		for n, w := range c.Rolls {
			if d := die(c.UID, c.Event, n); d != w {
				t.Errorf("die(%s,%s,%d) = %d, JS %d", c.UID, c.Event, n, d, w)
			}
		}
	}
	for _, c := range v.Boards {
		b := makeBoard(c.Event)
		if !reflect.DeepEqual(b.Ladders, c.Ladders) || !reflect.DeepEqual(b.Vines, c.Vines) {
			t.Errorf("makeBoard(%s) differs", c.Event)
		}
	}
	for i, c := range v.Players {
		b := makeBoard(c.Event)
		pos, fin := positionAfterRolls(b, c.UID, c.Event, c.Rolls)
		wantFin := 0
		if c.FinishedAt != nil {
			wantFin = *c.FinishedAt
		}
		if pos != c.Pos || fin != wantFin {
			t.Errorf("player %d: pos %d fin %d, JS %d %d", i, pos, fin, c.Pos, wantFin)
		}
		if k := turnsDone(b, c.UID, c.Event, c.Points, c.Rolls); k != c.Turns {
			t.Errorf("player %d: turnsDone %d, JS %d", i, k, c.Turns)
		}
		if e := turnEnds(c.Points); len(c.Points) > 0 && !reflect.DeepEqual(e, c.Ends) {
			t.Errorf("player %d: turnEnds %v, JS %v", i, e, c.Ends)
		}
		for k, w := range c.ByTurn {
			if p := positionAtTurn(b, c.UID, c.Event, c.Points, k); p != w {
				t.Errorf("player %d: positionAtTurn(%d) %d, JS %d", i, k, p, w)
			}
		}
		shown := min(c.Turns, c.MyTurns)
		if shown != c.ShownTurns || positionAtTurn(b, c.UID, c.Event, c.Points, shown) != c.ShownPos {
			t.Errorf("player %d: rival view differs", i)
		}
	}
	for _, c := range v.Windows {
		w, ok := windowOf(defByID(c.Def), c.Ms)
		if ok != (c.Win != nil) || (ok && (w.Key != c.Win.Key || w.Start != c.Win.Start || w.End != c.Win.End || eventIDOf(defByID(c.Def), w) != c.Win.ID)) {
			t.Errorf("windowOf(%s, %d) = %+v %v, JS %+v", c.Def, c.Ms, w, ok, c.Win)
		}
	}
	for _, c := range v.Parsed {
		_, w, ok := parseEventID(c.ID)
		if ok != (c.Start != nil) || (ok && (w.Start != *c.Start || w.End != *c.End)) {
			t.Errorf("parseEventID(%q) = %+v %v", c.ID, w, ok)
		}
	}
	for i, c := range v.Counted {
		var in []evBattle
		for _, b := range c.Battles {
			in = append(in, evBattle{b.ID, b.At, b.Src, b.Pts})
		}
		got := counted(defByID(c.Def), evWindow{Start: c.Start, End: c.End}, in)
		if len(got) != len(c.Out) {
			t.Errorf("counted case %d: %d battles, JS %d", i, len(got), len(c.Out))
			continue
		}
		for k, w := range c.Out {
			if got[k] != (evBattle{w.ID, w.At, w.Src, w.Pts}) {
				t.Errorf("counted case %d #%d: %+v, JS %+v", i, k, got[k], w)
			}
		}
	}
}

// ── the API ───────────────────────────────────────────────────────────────────────────

type evRig struct {
	*rig
	now  time.Time
	pass map[string]bool
}

func newEvRig(t *testing.T) *evRig {
	r := &evRig{now: time.Date(2026, 10, 13, 9, 0, 0, 0, time.UTC), pass: map[string]bool{}}
	oldPass, oldAns := evPassCheck, evAnswers
	evPassCheck = func(_ context.Context, tok string) bool { return r.pass[strings.TrimPrefix(tok, "dev:")] }
	evAnswers = &answerBook{path: filepath.Join(t.TempDir(), "answers.json")}
	evPassCache = map[string]passEntry{}
	evSyncLast = map[string]time.Time{}
	t.Cleanup(func() { evPassCheck, evAnswers = oldPass, oldAns })
	r.rig = newRig(t, false)
	r.h.st.now = func() time.Time { return r.now }
	return r
}

func (r *evRig) tick(d time.Duration) { r.now = r.now.Add(d) }

func (r *evRig) sync(t *testing.T, uid string, body map[string]any) (int, map[string]any) {
	t.Helper()
	r.tick(time.Second) // the per-player sync limiter
	return call(t, "POST", r.srv.URL+prefix+"/events/sync", "dev:"+uid, body)
}

const vday = "vines-day:2026-10-13"

func camp(id string, pts int, at time.Time) []any {
	return []any{"camp:" + id, pts, "campaign", at.UnixMilli()}
}

// A player with these battle points, every roll taken.
func (r *evRig) seedPlayer(t *testing.T, uid, name string, points []int) {
	t.Helper()
	var b [][]any
	at := r.now.Add(-8 * time.Hour)
	for i, p := range points {
		b = append(b, camp(fmt.Sprintf("%s-%d", uid, i), p, at.Add(time.Duration(i)*2*time.Minute)))
	}
	code, out := r.sync(t, uid, map[string]any{"event": vday, "name": name, "b": b, "rolls": sumInts(points)})
	if code != 200 || int(out["points"].(float64)) != sumInts(points) {
		t.Fatalf("seed %s: %d %v", uid, code, out)
	}
}

func rivalsOf(out map[string]any) []map[string]any {
	var l []map[string]any
	for _, x := range out["rivals"].([]any) {
		l = append(l, x.(map[string]any))
	}
	return l
}

// THE REPLAY RULE on the server: a rival is shown at min(their turns, MY STORED turns), the
// caller cannot ask for more, and nothing in the reply could rebuild a later position.
func TestEventsRivalsNeverLeakFuture(t *testing.T) {
	r := newEvRig(t)
	pts := make([]int, 10)
	for i := range pts {
		pts[i] = 1 + i%3
	}
	r.seedPlayer(t, "rival", "Rival", pts) // 10 turns
	b := makeBoard(vday)
	// Me: 3 battles, but only the first batch rolled — 1 turn done.
	r.tick(time.Minute)
	mine := []int{2, 3, 1}
	var bs [][]any
	for i, p := range mine {
		bs = append(bs, camp(fmt.Sprintf("me-%d", i), p, r.now.Add(time.Duration(i)*2*time.Minute-time.Hour)))
	}
	code, out := r.sync(t, "me", map[string]any{"event": vday, "name": "Me", "b": bs, "rolls": 2})
	if code != 200 || out["turns"].(float64) != 1 {
		t.Fatalf("me: %d %v", code, out)
	}
	check := func(myTurns int, label string, out map[string]any) {
		t.Helper()
		rv := rivalsOf(out)
		if len(rv) != 1 {
			t.Fatalf("%s: rivals %v", label, rv)
		}
		want := positionAtTurn(b, "rival", vday, pts, myTurns)
		if int(rv[0]["pos"].(float64)) != want || int(rv[0]["turns"].(float64)) != myTurns {
			t.Fatalf("%s: rival at %v turn %v, want square %d turn %d", label, rv[0]["pos"], rv[0]["turns"], want, myTurns)
		}
		raw, _ := json.Marshal(out["rivals"])
		for _, leak := range []string{"uid", "points", "rolls", "rival\"", "b\"", "battles"} {
			if strings.Contains(string(raw), "\""+leak) {
				t.Fatalf("%s: rival reply leaks %q: %s", label, leak, raw)
			}
		}
	}
	check(1, "after my turn 1", out)
	if positionAtTurn(b, "rival", vday, pts, 1) == positionAtTurn(b, "rival", vday, pts, 10) {
		t.Fatal("test is blind: the rival's turn 1 and turn 10 are the same square")
	}
	// Asking for more by query string changes nothing: the server uses MY stored turns.
	_, q := call(t, "GET", r.srv.URL+prefix+"/events/rivals?event="+vday+"&turns=99&myTurns=99", "dev:me", nil)
	check(1, "GET with ?turns=99", q)
	// Claiming more rolls than I banked is clamped: 6 banked -> at most turn 3.
	_, out = r.sync(t, "me", map[string]any{"event": vday, "b": bs, "rolls": 999})
	if out["rolls"].(float64) != 6 {
		t.Fatalf("rolls not clamped: %v", out["rolls"])
	}
	check(3, "after my turn 3", out)
	// The rival plays 20 more battles: still shown no further than my turn 3.
	more := append([]int{}, pts...)
	for i := 0; i < 8; i++ {
		more = append(more, 3)
	}
	r.tick(time.Hour)
	var rb [][]any
	for i, p := range more {
		rb = append(rb, camp(fmt.Sprintf("rival-%d", i), p, time.Date(2026, 10, 13, 1, 0, 0, 0, time.UTC).Add(time.Duration(i)*2*time.Minute)))
	}
	r.sync(t, "rival", map[string]any{"event": vday, "b": rb, "rolls": 999})
	_, q = call(t, "GET", r.srv.URL+prefix+"/events/rivals?event="+vday, "dev:me", nil)
	check(3, "after they played on", q)
	// Rolls never go backwards, so a reload cannot re-roll from an earlier point.
	_, out = r.sync(t, "me", map[string]any{"event": vday, "rolls": 1})
	if out["rolls"].(float64) != 6 {
		t.Fatalf("rolls went backwards: %v", out["rolls"])
	}
}

// Ten rivals at most, friends first, then nearest; zero-turn players are not shown.
func TestEventsRivalSelection(t *testing.T) {
	r := newEvRig(t)
	for i := 0; i < 14; i++ {
		r.seedPlayer(t, fmt.Sprintf("p%02d", i), fmt.Sprintf("P%02d", i), []int{1 + i%3, 2})
	}
	r.sync(t, "idle", map[string]any{"event": vday, "name": "Idle"}) // no battles: never a rival
	r.seedPlayer(t, "me", "Me", []int{3, 3})
	_, out := call(t, "GET", r.srv.URL+prefix+"/events/rivals?event="+vday+"&friends=P13,p07", "dev:me", nil)
	rv := rivalsOf(out)
	if len(rv) != 10 || rv[0]["friend"] != true || rv[1]["friend"] != true || rv[2]["friend"] != nil {
		t.Fatalf("selection: %v", rv)
	}
	for _, x := range rv {
		if x["name"] == "Idle" || x["name"] == "Me" {
			t.Fatalf("%v should not be listed", x["name"])
		}
	}
}

// Campaign claims: trusted, but capped at 10 per UTC day, 60 s apart, never ahead of the
// clock, never into an arena-only event; re-sending changes nothing.
func TestEventsCampaignCap(t *testing.T) {
	r := newEvRig(t)
	var b [][]any
	base := r.now.Add(-5 * time.Hour)
	for i := 0; i < 14; i++ {
		b = append(b, camp(fmt.Sprintf("c%d", i), 3, base.Add(time.Duration(i)*2*time.Minute)))
	}
	b = append(b, camp("close", 3, base.Add(27*time.Minute+30*time.Second))) // 30 s after c13's slot
	b = append(b, camp("future", 3, r.now.Add(time.Hour)))
	b = append(b, []any{"arena:fake", 3, "arena", base.UnixMilli()}) // no agreed result behind it
	_, out := r.sync(t, "me", map[string]any{"event": vday, "b": b})
	if out["points"].(float64) != 30 || len(out["b"].([]any)) != 10 {
		t.Fatalf("cap: %v points, %d battles", out["points"], len(out["b"].([]any)))
	}
	_, again := r.sync(t, "me", map[string]any{"event": vday, "b": b})
	if again["points"].(float64) != 30 {
		t.Fatalf("re-send changed points: %v", again["points"])
	}
	r.pass["me"] = true
	_, mon := r.sync(t, "me", map[string]any{"event": "vines-month:2026-10", "b": b})
	if mon["points"].(float64) != 0 {
		t.Fatalf("campaign fights counted in an arena-only event: %v", mon["points"])
	}
}

// Agreed arena results count by themselves, for every event of their moment; a void never
// does; a client can turn its own loss into a close loss (2), never into a win.
func TestEventsArenaResultsCountServerSide(t *testing.T) {
	r := newEvRig(t)
	r.pass["ann"], r.pass["bob"] = true, true
	st := r.h.st
	st.recordMatch("m1", "duel", false, "2-1", []seatRow{rseat("ann", "Ann", true, 2), rseat("bob", "Bob", false, 1)})
	st.recordMatch("m2", "duel", false, "2-0", []seatRow{rseat("bob", "Bob", true, 2), {UID: "anon1", Name: "x", Ranked: false}})
	st.recordVoid("m3", "duel", false, 2, "disagree")
	_, a := r.sync(t, "ann", map[string]any{"event": vday})
	_, bb := r.sync(t, "bob", map[string]any{"event": vday, "b": [][]any{{"arena:m1", 3, "arena", r.now.UnixMilli()}}})
	if a["points"].(float64) != 3 || bb["points"].(float64) != 4 {
		t.Fatalf("arena auto-count: ann %v bob %v", a["points"], bb["points"])
	}
	_, bb = r.sync(t, "bob", map[string]any{"event": vday, "b": [][]any{{"arena:m1", 2, "arena", r.now.UnixMilli()}}})
	if bb["points"].(float64) != 5 {
		t.Fatalf("close loss claim: bob %v", bb["points"])
	}
	_, mon := r.sync(t, "bob", map[string]any{"event": "reveal-month:2026-10"})
	if mon["points"].(float64) != 5 {
		t.Fatalf("arena results must count for arena-only events too: %v", mon["points"])
	}
	_, an := r.sync(t, "anon1", map[string]any{"event": vday})
	if an["points"] != nil && an["points"].(float64) != 0 {
		t.Fatalf("an unranked seat earned points: %v", an["points"])
	}
}

// Pass events are visible to everyone in GET /events, closed to non-Pass players; LAN is open.
func TestEventsPassAndWindows(t *testing.T) {
	r := newEvRig(t)
	if code, _ := r.sync(t, "free", map[string]any{"event": "vines-month:2026-10"}); code != 403 {
		t.Fatalf("pass event without the Pass: %d", code)
	}
	r.pass["paid"] = true
	if code, _ := r.sync(t, "paid", map[string]any{"event": "vines-month:2026-10"}); code != 200 {
		t.Fatalf("pass event with the Pass: %d", code)
	}
	if code, _ := r.sync(t, "free", map[string]any{"event": "vines-day:2026-13-01"}); code != 404 {
		t.Fatalf("bad event id: %d", code)
	}
	if code, _ := call(t, "POST", r.srv.URL+prefix+"/events/sync", "", map[string]any{"event": vday}); code != 401 {
		t.Fatalf("anonymous sync: %d", code)
	}
	// Yesterday's event: readable, but closed to new claims.
	_, old := r.sync(t, "free", map[string]any{"event": "vines-day:2026-10-12", "b": [][]any{camp("late", 3, r.now.Add(-10*time.Hour))}})
	if old["closed"] != true || old["points"].(float64) != 0 {
		t.Fatalf("closed event took a claim: %v", old)
	}
	_, ev := call(t, "GET", r.srv.URL+prefix+"/events", "", nil)
	if n := len(ev["events"].([]any)); n != 4 {
		t.Fatalf("active events on 2026-10-13: %d", n)
	}
	r.h.lan = true
	evPassCache = map[string]passEntry{}
	if code, _ := r.sync(t, "lan:kid", map[string]any{"event": "vines-month:2026-10"}); code != 200 {
		t.Fatalf("LAN pass event: %d", code)
	}
}

// Picture reveal: squares are paid for, the answer lives only in the server's answers file,
// guesses are limited, a right one pays the bonus.
func TestEventsRevealAndGuess(t *testing.T) {
	r := newEvRig(t)
	const rw = "reveal-week:2026-W42"
	var b [][]any
	for i := 0; i < 6; i++ {
		b = append(b, camp(fmt.Sprintf("r%d", i), 1, r.now.Add(time.Duration(i)*2*time.Minute-2*time.Hour)))
	}
	_, out := r.sync(t, "me", map[string]any{"event": rw, "b": b, "open": []int{0, 0, 7, 30, -1, 3, 4, 5, 6, 8, 9}})
	if fmt.Sprint(out["open"]) != "[0 7 3 4 5 6]" || out["guessesLeft"].(float64) != 2 || out["art"] != false {
		t.Fatalf("open: %v left %v art %v", out["open"], out["guessesLeft"], out["art"])
	}
	guess := func(pic, choice string) (int, map[string]any) {
		r.tick(time.Second)
		return call(t, "POST", r.srv.URL+prefix+"/events/guess", "dev:me", map[string]any{"event": rw, "pic": pic, "choice": choice})
	}
	if code, _ := guess("art", "A FLYING KICK"); code != 409 {
		t.Fatalf("art guess on a placeholder event: %d", code)
	}
	code, g := guess("heroic", "A TEA PARTY")
	if code != 200 || g["right"] != false || g["guessesLeft"].(float64) != 1 {
		t.Fatalf("wrong guess: %d %v", code, g)
	}
	if code, _ := guess("heroic", "A TEA PARTY"); code != 409 {
		t.Fatalf("repeat guess: %d", code)
	}
	// Aaron approves art: now the server holds a different answer, and a placeholder guess is refused.
	os.WriteFile(evAnswers.path, []byte(`{"answers":{"`+rw+`":"A PAPER NINJA"}}`), 0o600)
	if code, _ := guess("heroic", "A FLYING KICK"); code != 409 {
		t.Fatalf("placeholder guess after art approved: %d", code)
	}
	code, g = guess("art", "a paper ninja")
	if code != 200 || g["right"] != true || g["solved"] != true || g["bonus"].(float64) != float64((25-6)*2) {
		t.Fatalf("right guess: %d %v", code, g)
	}
	if code, _ := guess("art", "A SUMO MATCH"); code != 409 {
		t.Fatalf("guess after solving: %d", code)
	}
	raw, _ := json.Marshal(out)
	if strings.Contains(string(raw), "NINJA") {
		t.Fatal("the answer leaked into a sync reply")
	}
	// The month picture costs 2 a square: 5 arena points (with the Pass) open 2.
	r.pass["me"] = true
	r.h.st.recordMatch("w1", "duel", false, "2-0", []seatRow{rseat("me", "Me", true, 2), rseat("x", "X", false, 0)})
	r.h.st.recordMatch("w2", "duel", false, "0-2", []seatRow{rseat("me", "Me", false, 0), rseat("x", "X", true, 2)})
	_, m := r.sync(t, "me", map[string]any{"event": "reveal-month:2026-10", "open": []int{1, 2, 3}, "b": [][]any{{"arena:w2", 2, "arena", 0}}})
	if fmt.Sprint(m["open"]) != "[1 2]" || m["points"].(float64) != 5 {
		t.Fatalf("month open: %v points %v", m["open"], m["points"])
	}
}

func TestEventsSeasonalWindow(t *testing.T) {
	d := defByID("halloween")
	for _, c := range []struct {
		at string
		ok bool
	}{{"2026-10-23T23:59:59Z", false}, {"2026-10-24T00:00:00Z", true}, {"2026-10-31T23:59:59Z", true}, {"2026-11-01T00:00:00Z", false}} {
		ts, _ := time.Parse(time.RFC3339, c.at)
		if _, ok := windowOf(d, ts.UnixMilli()); ok != c.ok {
			t.Errorf("halloween at %s: %v", c.at, ok)
		}
	}
	if math.IsNaN(mulberry32(1)()) {
		t.Fatal("nan")
	}
}
