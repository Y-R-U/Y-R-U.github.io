package main

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/http/httptest"
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
	TowerCap struct {
		GapMs  int64
		PerDay int
	}
	PaidCap      struct{ GapMs int64 }
	StoryCircles [][]int
	Tower        []struct {
		Start, End                      int64
		Rows, Out                       [][3]any
		Floor, Tops, Best, Fights, Wins int
	}
	Story []struct {
		Key                    string
		Story, Points, Chapter int
		Circle                 int
		Done                   bool
	}
	Counted []struct {
		Def        string
		Paid       bool
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
		got := counted(defByID(c.Def), evWindow{Start: c.Start, End: c.End}, in, capFor(c.Paid))
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

func TestEventsTowerAndStoryVectors(t *testing.T) {
	v := loadVectors(t)
	if v.TowerCap.GapMs != towerGapMs || v.TowerCap.PerDay != towerPerDay || v.PaidCap.GapMs != paidCap.GapMs || !reflect.DeepEqual(v.StoryCircles, storyCircles) {
		t.Fatalf("constants differ from js/events: %+v %+v %v", v.TowerCap, v.PaidCap, v.StoryCircles)
	}
	if len(v.Tower) < 20 || len(v.Story) < 30 {
		t.Fatalf("vector file is too thin: %d tower, %d story", len(v.Tower), len(v.Story))
	}
	row := func(x [3]any) towerRow { return towerRow{x[0].(string), x[1].(float64) == 1, int64(x[2].(float64))} }
	for i, c := range v.Tower {
		var in []towerRow
		for _, x := range c.Rows {
			in = append(in, row(x))
		}
		got := towerCounted(evWindow{Start: c.Start, End: c.End}, in)
		if len(got) != len(c.Out) {
			t.Errorf("tower case %d: %d rows, JS %d", i, len(got), len(c.Out))
			continue
		}
		for k, x := range c.Out {
			if got[k] != row(x) {
				t.Errorf("tower case %d #%d: %+v, JS %v", i, k, got[k], x)
			}
		}
		if st := towerOf(got); st != (towerState{c.Floor, c.Tops, c.Best, c.Fights, c.Wins}) {
			t.Errorf("tower case %d: %+v, JS floor %d tops %d best %d", i, st, c.Floor, c.Tops, c.Best)
		}
	}
	for _, c := range v.Story {
		ch, circle, done := storyProgress(storyIndex(c.Key), c.Points)
		if storyIndex(c.Key) != c.Story || ch != c.Chapter || circle != c.Circle || done != c.Done {
			t.Errorf("story %s at %d: %d %d/%d %v, JS %d %d/%d %v", c.Key, c.Points, storyIndex(c.Key), ch, circle, done, c.Story, c.Chapter, c.Circle, c.Done)
		}
	}
}

// ── the API ───────────────────────────────────────────────────────────────────────────

type evRig struct {
	*rig
	now                 time.Time
	pass, paid, unknown map[string]bool
}

func newEvRig(t *testing.T) *evRig {
	r := &evRig{now: time.Date(2026, 10, 13, 9, 0, 0, 0, time.UTC), pass: map[string]bool{}, paid: map[string]bool{}, unknown: map[string]bool{}}
	oldEnt, oldAns := evEntCheck, evAnswers
	evEntCheck = func(_ context.Context, tok string) evEnt {
		u := strings.TrimPrefix(tok, "dev:")
		if r.unknown[u] {
			return evEnt{Pass: true}
		}
		return evEnt{Pass: r.pass[u], Paid: r.pass[u] || r.paid[u], Known: true}
	}
	evAnswers = &answerBook{path: filepath.Join(t.TempDir(), "answers.json")}
	evPassCache = map[string]passEntry{}
	evSyncLast = map[string]time.Time{}
	t.Cleanup(func() { evEntCheck, evAnswers = oldEnt, oldAns })
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
	// Friends are accounts I finished a friend-link match with; names the client sends are ignored.
	r.h.st.recordMatch("fm1", "duel", true, "2-0", []seatRow{rseat("me", "Me", true, 0), rseat("p13", "P13", false, 0)})
	r.h.st.recordMatch("fm2", "duel", true, "2-1", []seatRow{rseat("p07", "P07", true, 0), rseat("me", "Me", false, 0)})
	r.h.st.recordMatch("fm3", "duel", true, "0-0 ff", []seatRow{rseat("me", "Me", true, 0), rseat("p01", "P01", false, 0)})
	r.tick(rivalTTL + time.Second) // past the rival cache
	_, out := call(t, "GET", r.srv.URL+prefix+"/events/rivals?event="+vday+"&friends=P02,P03,P04", "dev:me", nil)
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
	evPassCache = map[string]passEntry{}
	_, tw := r.sync(t, "me", map[string]any{"event": "tower:2026-W42", "b": b})
	if tw["points"] != nil || len(tw["t"].([]any)) != 0 {
		t.Fatalf("battle points counted in THE TOWER: %v", tw)
	}
}

// Paid players (supporter or Pass) have no daily cap, only a 15 s gap; the free cap applies
// the moment the entitlement is gone; an outage is never unlimited, but loses nothing.
func TestEventsPaidCampaignCap(t *testing.T) {
	r := newEvRig(t)
	gaps := func(uid string, n int, gap time.Duration, from time.Time) [][]any {
		var b [][]any
		for i := 0; i < n; i++ {
			b = append(b, camp(fmt.Sprintf("%s%d", uid, i), 1, from.Add(time.Duration(i)*gap)))
		}
		return b
	}
	base := r.now.Add(-5 * time.Hour)
	r.paid["sup"] = true // a supporter: no Pass, but paid
	b := gaps("s", 30, 20*time.Second, base)
	b = append(b, camp("s-quick", 1, base.Add(29*20*time.Second+10*time.Second))) // 10 s after the last: spam
	_, out := r.sync(t, "sup", map[string]any{"event": vday, "b": b})
	if out["points"].(float64) != 30 || out["cap"].(map[string]any)["paid"] != true {
		t.Fatalf("paid: %v points (want 30, 15 s gap, no daily cap) cap %v", out["points"], out["cap"])
	}
	// Free: the same fights, 10 count.
	_, free := r.sync(t, "free", map[string]any{"event": vday, "b": gaps("f", 30, 61*time.Second, base)})
	if free["points"].(float64) != 10 {
		t.Fatalf("free: %v points", free["points"])
	}
	// The supporter lapses: what was banked stays, nothing new counts past today's 10.
	r.paid["sup"] = false
	evPassCache = map[string]passEntry{}
	r.tick(2 * time.Minute)
	_, lap := r.sync(t, "sup", map[string]any{"event": vday, "b": [][]any{camp("s-late", 1, r.now.Add(-time.Minute))}})
	if lap["points"].(float64) != 30 {
		t.Fatalf("lapsed: %v points (banked 30 kept, no 31st)", lap["points"])
	}
	// The payment service is down for a paid player: free cap now, the refused fights still
	// count once it answers again.
	r.paid["out"], r.unknown["out"] = true, true
	ob := gaps("o", 14, 20*time.Second, r.now.Add(-time.Hour))
	_, o1 := r.sync(t, "out", map[string]any{"event": vday, "b": ob})
	if o1["points"].(float64) != 5 || o1["cap"].(map[string]any)["known"] != false {
		t.Fatalf("outage: %v points (60 s apart: 0, 60, 120, 180, 240 s = 5), cap %v", o1["points"], o1["cap"])
	}
	r.unknown["out"] = false
	evPassCache = map[string]passEntry{}
	r.tick(20 * time.Minute)
	_, o2 := r.sync(t, "out", map[string]any{"event": vday, "b": ob})
	if o2["points"].(float64) != 14 {
		t.Fatalf("after the outage: %v points (want all 14)", o2["points"])
	}
}

// Agreed arena results count by themselves, for every event of their moment; a void never
// does; a client cannot change them at all (a close loss comes only from the agreed damage).
func TestEventsArenaResultsCountServerSide(t *testing.T) {
	r := newEvRig(t)
	r.pass["ann"], r.pass["bob"] = true, true
	st := r.h.st
	st.recordMatch("m1", "duel", false, "2-1", []seatRow{rseat("ann", "Ann", true, 2), rseat("bob", "Bob", false, 1)})
	st.recordMatch("m2", "duel", false, "2-0", []seatRow{rseat("bob", "Bob", true, 2), {UID: "anon1", Name: "x", Ranked: false}})
	st.recordVoid("m3", "duel", false, 2, "disagree", []string{"ann", "bob"})
	_, a := r.sync(t, "ann", map[string]any{"event": vday})
	_, bb := r.sync(t, "bob", map[string]any{"event": vday, "b": [][]any{{"arena:m1", 3, "arena", r.now.UnixMilli()}}})
	if a["points"].(float64) != 3 || bb["points"].(float64) != 4 {
		t.Fatalf("arena auto-count: ann %v bob %v", a["points"], bb["points"])
	}
	_, bb = r.sync(t, "bob", map[string]any{"event": vday, "b": [][]any{{"arena:m1", 2, "arena", r.now.UnixMilli()}}})
	if bb["points"].(float64) != 4 {
		t.Fatalf("a claimed close loss must change nothing: bob %v", bb["points"])
	}
	_, mon := r.sync(t, "bob", map[string]any{"event": "story:2026-10"})
	if mon["points"].(float64) != 4 || mon["chapter"].(float64) != 0 || mon["circle"].(float64) != 4 {
		t.Fatalf("arena results must walk the story too: %v", mon)
	}
	_, an := r.sync(t, "anon1", map[string]any{"event": vday})
	if an["points"] != nil && an["points"].(float64) != 0 {
		t.Fatalf("an unranked seat earned points: %v", an["points"])
	}
}

// Pass events are visible to everyone in GET /events, closed to non-Pass players; LAN is open.
func TestEventsPassAndWindows(t *testing.T) {
	r := newEvRig(t)
	r.paid["sup"] = true // a supporter is paid, but the Pass events need the Pass
	for _, ev := range []string{"tower:2026-W42", "story:2026-10"} {
		for _, u := range []string{"free", "sup"} {
			if code, _ := r.sync(t, u, map[string]any{"event": ev}); code != 403 {
				t.Fatalf("%s without the Pass (%s): %d", ev, u, code)
			}
		}
	}
	r.pass["paid"] = true
	for _, ev := range []string{"tower:2026-W42", "story:2026-10"} {
		if code, _ := r.sync(t, "paid", map[string]any{"event": ev}); code != 200 {
			t.Fatalf("%s with the Pass: %d", ev, code)
		}
	}
	for _, old := range []string{"vines-month:2026-10", "reveal-month:2026-10"} {
		if code, _ := r.sync(t, "paid", map[string]any{"event": old}); code != 404 {
			t.Fatalf("the retired %s still answers: %d", old, code)
		}
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
	if code, _ := r.sync(t, "lan:kid", map[string]any{"event": "tower:2026-W42"}); code != 200 {
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
	// The client shows art the server has no answer for: not guessable, nothing spent.
	if code, g := guess("art", "A PENCIL DUEL"); code != 200 || g["guessable"] != false || g["right"] != false || len(g["guesses"].([]any)) != 0 {
		t.Fatalf("art guess without an answer on the server: %d %v", code, g)
	}
	code, g := guess("heroic", "A TEA PARTY")
	if code != 200 || g["right"] != false || g["guessesLeft"].(float64) != 1 {
		t.Fatalf("wrong guess: %d %v", code, g)
	}
	if code, _ := guess("heroic", "A TEA PARTY"); code != 409 {
		t.Fatalf("repeat guess: %d", code)
	}
	// Aaron approves art: now the server holds a different answer, and a placeholder guess is refused.
	os.WriteFile(evAnswers.path, []byte(`{"answers":{"`+rw+`":"A TEAPOT WALTZ"}}`), 0o600)
	if code, _ := guess("heroic", placeholderAnswer); code != 409 {
		t.Fatalf("placeholder guess after art approved: %d", code)
	}
	code, g = guess("art", "a teapot waltz")
	if code != 200 || g["right"] != true || g["solved"] != true || g["bonus"].(float64) != float64((25-6)*2) {
		t.Fatalf("right guess: %d %v", code, g)
	}
	if code, _ := guess("art", "A SUMO MATCH"); code != 409 {
		t.Fatalf("guess after solving: %d", code)
	}
	raw, _ := json.Marshal(out)
	if strings.Contains(string(raw), "TEAPOT") {
		t.Fatal("the answer leaked into a sync reply")
	}
	// Arena points pay for squares too: a win (3) and a close loss (2, from the agreed damage —
	// the claim in "b" is ignored) on top of the 6 campaign points.
	r.h.st.recordMatch("w1", "duel", false, "2-0", []seatRow{rseat("me", "Me", true, 2), rseat("x", "X", false, 0)})
	r.h.st.recordMatch("w2", "duel", false, "0-2", []seatRow{{UID: "me", Name: "Me", Ranked: true, OppDmg: 0.6}, rseat("x", "X", true, 2)})
	_, m := r.sync(t, "me", map[string]any{"event": rw, "open": []int{10, 11, 12, 13, 14, 15}, "b": [][]any{{"arena:w2", 3, "arena", 0}}})
	if m["points"].(float64) != 11 || len(m["open"].([]any)) != 11 {
		t.Fatalf("arena points: %v, open %v", m["points"], m["open"])
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

// THE TOWER: the floor is recomputed from the ordered W/L list (up on a win, down on a loss,
// never below 1, a win on 12 is a TOP); claims are checked like campaign claims plus the gap.
func TestEventsTower(t *testing.T) {
	r := newEvRig(t)
	const tw = "tower:2026-W42"
	r.pass["me"], r.pass["ann"], r.pass["bob"] = true, true, true
	at := r.now.Add(-3 * time.Hour)
	var rows [][]any
	add := func(id string, won int, gap time.Duration) {
		at = at.Add(gap)
		rows = append(rows, []any{"tower:" + id, won, at.UnixMilli()})
	}
	add("l0", 0, 0)           // floor 1, a loss: still 1
	for i := 0; i < 11; i++ { // eleven wins: floor 12
		add(fmt.Sprintf("w%d", i), 1, 40*time.Second)
	}
	add("spam", 1, 3*time.Second)  // 3 s after the last one: not a fight
	add("top", 1, 40*time.Second)  // a win ON floor 12: the TOP
	add("drop", 0, 40*time.Second) // defending: down to 11
	_, out := r.sync(t, "me", map[string]any{"event": tw, "name": "Me", "t": append(rows,
		[]any{"camp:x", 1, at.UnixMilli()}, []any{"tower:two", 2, at.UnixMilli()}, []any{"tower:fut", 1, r.now.Add(time.Hour).UnixMilli()}),
		"floor": 12, "tops": 9})
	if out["floor"].(float64) != 11 || out["tops"].(float64) != 1 || out["best"].(float64) != 12 || len(out["t"].([]any)) != 14 {
		t.Fatalf("tower: floor %v tops %v best %v rows %d", out["floor"], out["tops"], out["best"], len(out["t"].([]any)))
	}
	// Losses never take you under floor 1.
	var lose [][]any
	for i := 0; i < 5; i++ {
		lose = append(lose, []any{fmt.Sprintf("tower:b%d", i), 0, r.now.Add(time.Duration(i)*time.Minute - time.Hour).UnixMilli()})
	}
	lose = append(lose, []any{"tower:bw", 1, r.now.Add(-50 * time.Minute).UnixMilli()})
	_, b := r.sync(t, "bob", map[string]any{"event": tw, "name": "Bob", "t": lose})
	if b["floor"].(float64) != 2 {
		t.Fatalf("five losses then a win from floor 1: floor %v (want 2)", b["floor"])
	}
	// A fight dated before the previous sync is refused (no backfilling a better history).
	r.tick(30 * time.Minute)
	_, again := r.sync(t, "bob", map[string]any{"event": tw, "name": "Bob", "t": [][]any{{"tower:old", 1, r.now.Add(-2 * time.Hour).UnixMilli()}}})
	if again["floor"].(float64) != 2 || again["fights"].(float64) != 6 {
		t.Fatalf("backdated tower fight accepted: floor %v, %v fights", again["floor"], again["fights"])
	}
	r.sync(t, "ann", map[string]any{"event": tw, "name": "Ann", "t": [][]any{{"tower:a1", 1, r.now.Add(-time.Minute).UnixMilli()}}})
	r.pass["cat"] = true
	r.sync(t, "cat", map[string]any{"event": tw, "name": "Cat", "t": [][]any{{"tower:c1", 1, r.now.Add(-4 * time.Minute).UnixMilli()},
		{"tower:c2", 1, r.now.Add(-3 * time.Minute).UnixMilli()}, {"tower:c3", 1, r.now.Add(-2 * time.Minute).UnixMilli()}}})
	r.sync(t, "nobody", map[string]any{"event": tw, "name": "Nobody"}) // no fights: never a rival
	r.tick(rivalTTL + time.Second)
	_, q := call(t, "GET", r.srv.URL+prefix+"/events/rivals?event="+tw, "dev:me", nil)
	rv := rivalsOf(q)
	// I am on 11: Cat (4) is nearest, then Ann and Bob (both 2) by uid.
	if len(rv) != 3 || rv[0]["name"] != "Cat" || rv[0]["floor"].(float64) != 4 || rv[1]["name"] != "Ann" || rv[2]["name"] != "Bob" {
		t.Fatalf("tower rivals: %v", rv)
	}
	raw, _ := json.Marshal(q["rivals"])
	for _, leak := range []string{"uid", "t", "fights", "wins", "at", "best"} {
		if strings.Contains(string(raw), "\""+leak+"\":") {
			t.Fatalf("tower rival reply leaks %q: %s", leak, raw)
		}
	}
	// A tower fight (and a solo quick fight, net/panel.js) is a campaign fight for the other events too.
	_, qf := r.sync(t, "bob", map[string]any{"event": vday, "name": "Bob", "b": [][]any{{"quick:m1", 3, "campaign", r.now.Add(-2 * time.Minute).UnixMilli()}}})
	if qf["points"].(float64) != 3 {
		t.Fatalf("a quick fight did not count as a campaign battle: %v", qf["points"])
	}
	_, v := r.sync(t, "ann", map[string]any{"event": vday, "b": [][]any{{"tower:a1", 3, "campaign", r.now.Add(-time.Minute).UnixMilli()}}})
	if v["points"].(float64) != 3 {
		t.Fatalf("a tower fight did not count as a campaign battle: %v", v["points"])
	}
}

// STORY: points walk the circles across chapters; the month picks the story.
func TestEventsStory(t *testing.T) {
	r := newEvRig(t)
	r.pass["me"] = true
	const sv = "story:2026-10"
	var b [][]any
	for i := 0; i < 10; i++ {
		b = append(b, camp(fmt.Sprintf("s%d", i), 3, r.now.Add(time.Duration(i)*2*time.Minute-time.Hour)))
	}
	_, out := r.sync(t, "me", map[string]any{"event": sv, "b": b})
	// 30 points through THE STOLEN BANDANA (13, 14, ...): chapters 1 and 2 open, 3 circles into chapter 3.
	if out["story"].(float64) != 0 || out["chapter"].(float64) != 2 || out["circle"].(float64) != 3 || out["done"] != false {
		t.Fatalf("story: %v", out)
	}
	if storyIndex("2026-11") != 1 || storyIndex("2026-12") != 2 || storyIndex("2027-01") != 0 {
		t.Fatal("the stories do not take turns by month")
	}
	if ch, _, done := storyProgress(0, 87); ch != 6 || !done {
		t.Fatalf("87 points should finish THE STOLEN BANDANA: %d %v", ch, done)
	}
}

// The payment service's answer: br8t_pass opens Pass events; br8t_pass or ragdojo_supporter is
// paid; an outage (no answer, 5xx, junk) is unknown — Pass events stay open, the cap stays free.
func TestEventsEntitlementCheck(t *testing.T) {
	answer := map[string]struct {
		code int
		body string
	}{
		"pass": {200, `{"entitlements":{"br8t_pass":true}}`},
		"sup":  {200, `{"entitlements":{"ragdojo_supporter":true}}`},
		"none": {200, `{"entitlements":{}}`},
		"down": {503, ``},
		"junk": {200, `not json`},
		"anon": {401, `{}`},
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		a := answer[strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")]
		w.WriteHeader(a.code)
		w.Write([]byte(a.body))
	}))
	defer srv.Close()
	check := entitlementCheck(srv.URL)
	for tok, want := range map[string]evEnt{
		"pass": {Pass: true, Paid: true, Known: true}, "sup": {Paid: true, Known: true}, "none": {Known: true},
		"down": {Pass: true}, "junk": {Pass: true}, "anon": {Known: true},
	} {
		if got := check(context.Background(), tok); got != want {
			t.Errorf("%s: %+v, want %+v", tok, got, want)
		}
	}
	if got := entitlementCheck("")(context.Background(), "x"); got != (evEnt{true, true, true}) {
		t.Errorf("entitlements off (dev): %+v", got)
	}
	if got := entitlementCheck("http://127.0.0.1:1/x")(context.Background(), "x"); got != (evEnt{Pass: true}) {
		t.Errorf("payment service unreachable: %+v", got)
	}
}
