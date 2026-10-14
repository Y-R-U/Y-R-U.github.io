package main

import (
	"fmt"
	mrand "math/rand"
	"strings"
	"testing"
	"time"
)

func quickRig(t *testing.T, window time.Duration) *rig {
	r := newRig(t, false)
	r.h.post(func() { r.h.quickWindow, r.h.quickReveal = window, window*3/10 })
	return r
}

func pressQuick(c *tc, typ string) { c.send(map[string]any{"t": "quick", "type": typ, "tok": c.tok}) }

// listNames: the waiting list as the client shows it.
func listNames(o map[string]any) []string {
	out := []string{}
	for _, e := range o["list"].([]any) {
		out = append(out, e.(map[string]any)["name"].(string))
	}
	return out
}

func ghostsIn(l []string) int {
	n := 0
	for _, s := range l {
		if strings.HasSuffix(s, "*") {
			n++
		}
	}
	return n
}

// offersUntil collects every offer up to the first message of type `end`.
func offersUntil(t *testing.T, c *tc, end string) ([]map[string]any, map[string]any) {
	t.Helper()
	var offers []map[string]any
	timeout := time.After(9 * time.Second)
	for {
		select {
		case m, ok := <-c.msgs:
			if !ok {
				t.Fatalf("socket closed waiting for %q", end)
			}
			if m["t"] == "offer" {
				offers = append(offers, m)
			} else if m["t"] == end {
				return offers, m
			} else if m["t"] == "err" || m["t"] == "cancel" {
				t.Fatalf("waiting for %q: %v", end, m)
			}
		case <-timeout:
			t.Fatalf("no %q", end)
		}
	}
}

func TestQuickAloneFillsWithGhostsRevealedLikePeople(t *testing.T) {
	r := quickRig(t, 5*time.Second)
	a := r.dial("Ann", "dev:ann")
	pressQuick(a, "lms")
	offers, g := offersUntil(t, a, "quickgo")
	first := offers[0]
	if first["quick"] != true || num(first["startIn"]) < 4700 || listNames(first)[0] != "Ann" || ghostsIn(listNames(first)) != 0 {
		t.Fatalf("the window opens with just you and the countdown: %v", first)
	}
	if first["ice"] != nil {
		t.Fatal("no TURN credentials for a window of one")
	}
	// Ghosts appear one at a time, in the last part of the countdown, never all at once.
	seen := []int{}
	for _, o := range offers {
		n := ghostsIn(listNames(o))
		if len(seen) == 0 || n != seen[len(seen)-1] {
			seen = append(seen, n)
		}
	}
	if fmt.Sprint(seen) != "[0 1 2 3]" {
		t.Fatalf("ghosts join one by one: %v", seen)
	}
	gs := g["ghosts"].([]any)
	if len(gs) != 3 || g["mode"] != "lms" {
		t.Fatalf("one person in a room mode: three ghosts make four: %v", g)
	}
	pers := map[string]int{}
	for _, x := range gs {
		gh := x.(map[string]any)
		name, p := gh["name"].(string), gh["pers"].(string)
		if !strings.HasSuffix(name, "*") || strings.Contains(strings.ToLower(name), "bot") {
			t.Fatalf("a ghost's name ends in * and never says bot: %q", name)
		}
		if p != "random" {
			pers[p]++
			if pers[p] > 1 {
				t.Fatalf("no named personality twice in one match: %v", gs)
			}
		}
		sk, _ := gh["skill"].(float64)
		if sk < 0.35 || sk > 0.85 || len(gh["lo"].([]any)) < 1 || gh["seed"] == nil {
			t.Fatalf("every ghost comes with a skill, a loadout and a seed: %v", gh)
		}
	}
	if _, ok := r.spent.Load("dev:ann"); !ok {
		t.Fatal("a quick fight spends the allowance like any arena battle")
	}
	// The match is over as far as the server goes: the next press opens a new window.
	pressQuick(a, "lms")
	if o := a.expect("offer"); o["match"] == g["match"] {
		t.Fatal("a played-out quick window took another player")
	}
}

func TestQuickLateJoinerTakesTheLastRevealedGhostsSeat(t *testing.T) {
	r := quickRig(t, 2*time.Second)
	a, b := r.dial("Ann", "dev:ann"), r.dial("Bob", "dev:bob")
	pressQuick(a, "bandana")
	// Wait for the first ghost to show, then Bob presses QUICK FIGHT on the same mode.
	var before []string
	for {
		o := a.expect("offer")
		if l := listNames(o); ghostsIn(l) >= 1 {
			before = l
			break
		}
	}
	pressQuick(b, "bandana")
	ob := b.expect("offer")
	lb := listNames(ob)
	if lb[0] != "Bob" || !contains(lb, "Ann") || len(lb) > 4 {
		t.Fatalf("Bob sees himself first, Ann, and at most two ghosts: %v", lb)
	}
	if n := ghostsIn(before); ghostsIn(lb) > n || ghostsIn(lb) > 2 {
		t.Fatalf("a person took a ghost's seat: before %v, after %v", before, lb)
	}
	g := a.expect("go")
	gb := b.expect("go")
	if len(g["seats"].([]any)) != 2 || len(g["ghosts"].([]any)) != 2 || g["quick"] != true || g["match"] != gb["match"] {
		t.Fatalf("two people and two ghosts play it online: %v", g)
	}
	for _, tok := range []string{"dev:ann", "dev:bob"} {
		if _, ok := r.spent.Load(tok); !ok {
			t.Fatalf("%s paid for the battle", tok)
		}
	}
}

func TestQuickRoomWithGhostsIsNeverRankedButCountsForEvents(t *testing.T) {
	r := quickRig(t, 600*time.Millisecond)
	a, b := r.dial("Ann", "dev:ann"), r.dial("Bob", "dev:bob")
	after := make(chan string, 1)
	ready := make(chan bool)
	r.h.post(func() {
		r.h.st.afterMatch = func(id string, seats []seatRow) {
			l := []string{}
			for _, s := range seats {
				l = append(l, fmt.Sprintf("%s won=%v", s.UID, s.Won))
			}
			after <- strings.Join(l, ",")
		}
		close(ready)
	})
	<-ready
	pressQuick(a, "hill")
	a.expect("offer")
	pressQuick(b, "hill")
	g := a.expect("go")
	b.expect("go")
	id := g["match"].(string)
	// A ghost (slot 2) wins; Bob placed second, Ann fourth. Ghosts are ignored in the people's
	// ranking: Bob is the best person.
	for _, c := range []*tc{a, b} {
		c.send(map[string]any{"t": "round", "match": id, "round": 1, "winner": 2, "ko": false, "place": []int{4, 2, 1, 3}, "dmg": []int{80, 40, 10, 20}})
	}
	ra, rb := a.expect("result"), b.expect("result")
	if ra["quick"] != true || ra["counted"] != false || ra["stats"] != nil || num(ra["winner"]) != 2 || num(ra["hwin"]) != 1 {
		t.Fatalf("a quick result: not ranked, no stats line, the ghost won, Bob best of the people: %v", ra)
	}
	names := ra["names"].([]any)
	if len(names) != 4 || !strings.HasSuffix(names[2].(string), "*") || strings.HasSuffix(names[0].(string), "*") {
		t.Fatalf("names for every fighter, the ghosts' with *: %v", names)
	}
	if rb["counted"] != false {
		t.Fatal("never counted")
	}
	if _, ok := r.h.st.mine("ann"); ok {
		t.Fatal("a quick fight wrote player stats")
	}
	lb := getJSON(t, r.srv.URL+prefix+"/leaderboard?board=battles")
	if rows, _ := lb["rows"].([]any); len(rows) != 0 {
		t.Fatalf("a quick fight reached the boards: %v", lb)
	}
	got := ""
	select {
	case got = <-after:
	case <-time.After(2 * time.Second):
	}
	if got != "ann won=false,bob won=true" {
		t.Fatalf("events hear the agreed result, people ranked among themselves: %q", got)
	}
}

func TestQuickDuelTwoPeopleIsABestOfThreeStartedAtOnce(t *testing.T) {
	r := quickRig(t, 10*time.Second)
	a, b := r.dial("Ann", "dev:ann"), r.dial("Bob", "dev:bob")
	pressQuick(a, "duel")
	a.expect("offer")
	pressQuick(b, "duel")
	g := a.expect("go")
	b.expect("go")
	if len(g["seats"].([]any)) != 2 || g["ghosts"] != nil || g["mode"] != "duel" {
		t.Fatalf("a full duel window starts now, two people, no ghosts: %v", g)
	}
	id := g["match"].(string)
	playRound(t, []*tc{a, b}, id, 1, 0, true)
	a.expect("go")
	b.expect("go")
	playRound(t, []*tc{a, b}, id, 2, 0, true)
	ra := a.expect("result")
	if ra["quick"] != true || ra["counted"] != false || ra["stats"] != nil || fmt.Sprint(ra["place"]) != "[1 2]" {
		t.Fatalf("quick duel result: %v", ra)
	}
	b.expect("result")
	if _, ok := r.h.st.mine("ann"); ok {
		t.Fatal("a quick duel wrote player stats")
	}
	// No rematch for a quick fight (AGAIN is a new one), and DONE tells nobody "left".
	a.send(map[string]any{"t": "rematch", "match": id, "tok": "dev:ann"})
	b.send(map[string]any{"t": "leave"})
	a.none("rematch", 300*time.Millisecond)
	a.none("left", 200*time.Millisecond)
}

func TestQuickDuelAloneIsAGhostDuel(t *testing.T) {
	r := quickRig(t, 500*time.Millisecond)
	a := r.dial("Ann", "dev:ann")
	pressQuick(a, "duel")
	_, g := offersUntil(t, a, "quickgo")
	if gs := g["ghosts"].([]any); len(gs) != 1 || g["mode"] != "duel" {
		t.Fatalf("one ghost for a duel: %v", g)
	}
}

func TestQuickNeedsSignInAndAllowance(t *testing.T) {
	r := quickRig(t, 400*time.Millisecond)
	anon := r.dial("Anon", "anon:x")
	pressQuick(anon, "lms")
	if e := anon.expect("err"); e["code"] != "signin" {
		t.Fatalf("anonymous: %v", e)
	}
	broke := r.dial("Broke", "dev:broke")
	pressQuick(broke, "lms")
	if e := broke.expect("err"); e["code"] != "allowance" {
		t.Fatalf("out of free battles: %v", e)
	}
	if c := broke.expect("cancel"); c["why"] != "allowance" {
		t.Fatalf("and the quick fight is off: %v", c)
	}
	broke.none("quickgo", 300*time.Millisecond)
}

func TestQuickNeverMixesWithFindAFight(t *testing.T) {
	r := quickRig(t, 3*time.Second)
	a, b, c, d := r.dial("Ann", "dev:ann"), r.dial("Bob", "dev:bob"), r.dial("Cat", "dev:cat"), r.dial("Dan", "dev:dan")
	a.send(map[string]any{"t": "wait", "type": "lms"})
	oa := a.expect("offer")
	pressQuick(b, "lms")
	ob := b.expect("offer")
	pressQuick(d, "lms") // the quick window is now the fuller one: a lobby search would prefer it
	d.expect("offer")
	c.send(map[string]any{"t": "wait", "type": "lms"}) // FIND A FIGHT after a quick window is open
	oc := c.expect("offer")
	if oa["match"] == ob["match"] || ob["quick"] != true || oa["quick"] != nil || oc["match"] == ob["match"] || oc["quick"] != nil {
		t.Fatalf("FIND A FIGHT rooms and quick windows are separate: %v / %v / %v", oa, ob, oc)
	}
	// And a quick window cannot be started early by its first player.
	b.send(map[string]any{"t": "start", "match": ob["match"]})
	b.none("quickgo", 400*time.Millisecond)
}

func TestQuickCancelLeavesTheWindow(t *testing.T) {
	r := quickRig(t, 1500*time.Millisecond)
	a, b := r.dial("Ann", "dev:ann"), r.dial("Bob", "dev:bob")
	pressQuick(a, "lms")
	a.expect("offer")
	pressQuick(b, "lms")
	b.expect("offer")
	b.send(map[string]any{"t": "leave"})
	o := lastOffer(a)
	if l := listNames(o); contains(l, "Bob") {
		t.Fatalf("Bob left the window: %v", l)
	}
	if _, g := offersUntil(t, a, "quickgo"); len(g["ghosts"].([]any)) != 3 {
		t.Fatalf("Ann alone again: three ghosts: %v", g)
	}
	b.none("quickgo", 200*time.Millisecond)
	b.none("go", 10*time.Millisecond)
}

func TestQuickLastPersonFightsOnWithTheGhosts(t *testing.T) {
	r := quickRig(t, 500*time.Millisecond)
	a, b := r.dial("Ann", "dev:ann"), r.dial("Bob", "dev:bob")
	pressQuick(a, "lms")
	a.expect("offer")
	pressQuick(b, "lms")
	g := a.expect("go")
	b.expect("go")
	id := g["match"].(string)
	b.send(map[string]any{"t": "leave"})
	if o := a.expect("out"); num(o["slot"]) != 1 {
		t.Fatalf("Bob is out: %v", o)
	}
	a.none("result", 300*time.Millisecond) // not a forfeit win: the ghosts are still fighting
	a.send(map[string]any{"t": "round", "match": id, "round": 1, "winner": 3, "ko": true, "place": []int{2, 4, 3, 1}, "dmg": []int{100, 100, 100, 10}})
	if res := a.expect("result"); num(res["winner"]) != 3 || num(res["hwin"]) != 0 || res["forfeit"] != false {
		t.Fatalf("the fight finished itself: %v", res)
	}
}

func TestQuickPersonalitiesWeightsAndNames(t *testing.T) {
	rng := mrand.New(mrand.NewSource(7))
	count := map[string]int{}
	const N = 6000
	for i := 0; i < N; i++ {
		p, _ := pickPersonality(rng, map[string]bool{})
		count[p]++
	}
	if f := float64(count["random"]) / N; f < 0.36 || f > 0.44 {
		t.Fatalf("RANDOM ~40%%: %.3f", f)
	}
	for _, p := range []string{"brick", "zippy", "rumble", "inkslinger", "sneak"} {
		if f := float64(count[p]) / N; f < 0.09 || f > 0.15 {
			t.Fatalf("%s ~12%%: %.3f", p, f)
		}
	}
	// Four named ones taken: only RANDOM or the fifth can come.
	four := map[string]bool{"brick": true, "zippy": true, "rumble": true, "inkslinger": true}
	for i := 0; i < 300; i++ {
		if p, _ := pickPersonality(rng, four); p != "random" && p != "sneak" {
			t.Fatalf("a named personality twice: %s", p)
		}
	}
	// A full set of named ones taken: only RANDOM is left.
	all := map[string]bool{"brick": true, "zippy": true, "rumble": true, "inkslinger": true, "sneak": true}
	for i := 0; i < 50; i++ {
		if p, _ := pickPersonality(rng, all); p != "random" {
			t.Fatalf("a named personality twice: %s", p)
		}
	}
	for _, n := range ghostNames {
		if c, err := cleanName(n); err != nil || c != n {
			t.Fatalf("ghost name %q must pass as a typed name (%q, %v)", n, c, err)
		}
	}
	if n, _ := cleanName("Ann*"); n != "Ann" {
		t.Fatalf("a person cannot type a ghost's *: %q", n)
	}
	if humanWinner([]int{3, 2, 1}, 2) != 1 || humanWinner([]int{1, 1, 3}, 2) != -1 {
		t.Fatal("humanWinner ranks people only, ties are nobody's")
	}
}

func TestQuickGhostStrengthFollowsThePeople(t *testing.T) {
	m := &match{typ: "lms", ghosts: []*ghostSeat{{Pers: "inkslinger", Seed: 1}, {Pers: "random", Seed: 2}, {Pers: "brick", Seed: 3}}}
	h := &hub{st: nil}
	strong := &client{loadout: []int{0, 1, 2, 3, 4, 5, 6, 7}}
	m.seats = []*seat{{c: strong}}
	h.quickStrength(m)
	for _, g := range m.ghosts {
		if len(g.Lo) < 7 || g.Lo[0] != 0 {
			t.Fatalf("a fully loaded person meets fully loaded ghosts: %v", g.Lo)
		}
	}
	if m.ghosts[0].Lo[1] != 1 || m.ghosts[2].Lo[1] != 2 {
		t.Fatalf("personalities learn their own specials first: ink %v brick %v", m.ghosts[0].Lo, m.ghosts[2].Lo)
	}
	weak := &client{loadout: []int{0}}
	m.seats = []*seat{{c: weak}}
	h.quickStrength(m)
	for _, g := range m.ghosts {
		if len(g.Lo) > 2 || g.Skill < 0.35 || g.Skill > 0.67 {
			t.Fatalf("a new player meets ghosts near their level: %v %.2f", g.Lo, g.Skill)
		}
	}
}

func contains(l []string, s string) bool {
	for _, x := range l {
		if x == s {
			return true
		}
	}
	return false
}
