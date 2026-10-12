package main

import (
	"fmt"
	"testing"
	"time"

	"github.com/coder/websocket"
)

// roomOf: n signed-in players wait for `typ`; returns them and the room id once all are in.
func roomOf(t *testing.T, r *rig, typ string, n int) ([]*tc, string) {
	cs := make([]*tc, n)
	var id string
	for i := range cs {
		cs[i] = r.dial(fmt.Sprintf("P%d", i), fmt.Sprintf("dev:p%d", i))
		cs[i].send(map[string]any{"t": "wait", "type": typ})
		o := cs[i].expect("offer")
		if o["room"] != true || o["type"] != typ {
			t.Fatalf("a room offer: %v", o)
		}
		if id == "" {
			id = o["match"].(string)
		} else if o["match"] != id {
			t.Fatalf("player %d went to a different room", i)
		}
		cs[i].send(map[string]any{"t": "accept", "match": id, "tok": fmt.Sprintf("dev:p%d", i)})
	}
	return cs, id
}

// lastOffer drains offers until none arrive for a moment; the newest one is the room as it is now.
func lastOffer(c *tc) map[string]any {
	var last map[string]any
	for {
		select {
		case m := <-c.msgs:
			if m["t"] == "offer" {
				last = m
			}
		case <-time.After(250 * time.Millisecond):
			return last
		}
	}
}

func rtts(c *tc, id string, r map[string]float64) {
	c.send(map[string]any{"t": "rtts", "match": id, "r": r})
}

func TestRoomCountdownStartsAtFourAndFillsToEight(t *testing.T) {
	r := newRig(t, false)
	r.h.post(func() { r.h.roomCountdown = 20 * time.Second; r.h.roomSlow = 45 * time.Second })
	cs, id := roomOf(t, r, "lms", 3)
	if o := lastOffer(cs[0]); num(o["startIn"]) <= 20000 || len(o["peers"].([]any)) != 2 {
		t.Fatalf("three players: the slow countdown only, and everyone linked: %v", o)
	}
	more, _ := roomOf(t, r, "lms", 1)
	cs = append(cs, more...)
	if o := lastOffer(cs[0]); num(o["startIn"]) > 20000 || num(o["startIn"]) < 15000 {
		t.Fatalf("the fourth player starts the ~20 s countdown: %v", o)
	}
	// Joins stay open: four more fill the room, and a full room starts at once.
	for i := 4; i < 8; i++ {
		c := r.dial(fmt.Sprintf("Q%d", i), fmt.Sprintf("dev:q%d", i))
		c.send(map[string]any{"t": "wait", "type": "lms"})
		o := c.expect("offer")
		if o["match"] != id {
			t.Fatalf("join %d went elsewhere", i)
		}
		c.send(map[string]any{"t": "accept", "match": id, "tok": fmt.Sprintf("dev:q%d", i)})
		time.Sleep(50 * time.Millisecond) // let the accept land before the next socket's wait
		cs = append(cs, c)
	}
	// The 8th joined before its accept arrived, so the full room started without it... unless
	// it accepted first. Either way the room starts now, with everyone who had accepted.
	g := cs[0].expect("go")
	if g["mode"] != "lms" || num(g["round"]) != 1 {
		t.Fatalf("go: %v", g)
	}
	if n := len(g["seats"].([]any)); n < 7 || n > 8 {
		t.Fatalf("a full room starts with its accepted seats: %d", n)
	}
	// A ninth player gets a new room, not this one.
	x := r.dial("Late", "dev:late")
	x.send(map[string]any{"t": "wait", "type": "lms"})
	if o := x.expect("offer"); o["match"] == id {
		t.Fatal("a started room took another player")
	}
}

func TestRoomCountdownEndsAndBestPingMasters(t *testing.T) {
	r := newRig(t, false)
	r.h.post(func() { r.h.roomCountdown = 900 * time.Millisecond })
	cs, id := roomOf(t, r, "bandana", 4)
	// a<->b 20, a<->c 30, a<->d 40, everyone else 200: a's worst ping (40) is the best.
	ids := []string{cs[0].id, cs[1].id, cs[2].id, cs[3].id}
	ms := [][]float64{{0, 20, 30, 40}, {20, 0, 200, 200}, {30, 200, 0, 200}, {40, 200, 200, 0}}
	for i, c := range cs {
		m := map[string]float64{}
		for j := range cs {
			if i != j {
				m[ids[j]] = ms[i][j]
			}
		}
		rtts(c, id, m)
	}
	for _, c := range cs {
		g := c.expect("go")
		if num(g["master"]) != 0 || g["mode"] != "bandana" {
			t.Fatalf("the master is the seat with the lowest worst ping (0): %v", g)
		}
	}
}

func TestRoomNeverAcceptedIsNotDealtIn(t *testing.T) {
	r := newRig(t, false)
	r.h.post(func() { r.h.roomCountdown = 500 * time.Millisecond })
	cs, _ := roomOf(t, r, "hill", 3)
	lurk := r.dial("Lurker", "dev:lurk")
	lurk.send(map[string]any{"t": "wait", "type": "hill"})
	lurk.expect("offer")
	if c := lurk.expect("cancel"); c["why"] != "notready" {
		t.Fatalf("a seat with no accept is dropped at the start: %v", c)
	}
	if g := cs[0].expect("go"); len(g["seats"].([]any)) != 3 {
		t.Fatalf("three play: %v", g)
	}
}

// startRoom3: a friend room of three, started by its host.
func startRoom3(t *testing.T, r *rig, typ string) ([]*tc, string) {
	h := r.dial("Host", "dev:host")
	h.send(map[string]any{"t": "friend", "type": typ})
	f := h.expect("friend")
	id := f["match"].(string)
	h.expect("offer")
	h.send(map[string]any{"t": "accept", "match": id, "tok": "dev:host"})
	cs := []*tc{h}
	for i := 1; i < 3; i++ {
		c := r.dial(fmt.Sprintf("F%d", i), fmt.Sprintf("dev:f%d", i))
		c.send(map[string]any{"t": "join", "code": f["code"]})
		if o := c.expect("offer"); o["match"] != id || o["host"] == true {
			t.Fatalf("friend room join: %v", o)
		}
		c.send(map[string]any{"t": "accept", "match": id, "tok": fmt.Sprintf("dev:f%d", i)})
		cs = append(cs, c)
	}
	if o := lastOffer(h); num(o["startIn"]) != -1 {
		t.Fatalf("a friend room of three waits for its host: %v", o)
	}
	cs[1].send(map[string]any{"t": "start", "match": id})
	cs[1].none("go", 300*time.Millisecond)
	// Masters by ping: F1 is closest to everyone.
	rtts(cs[0], id, map[string]float64{cs[1].id: 30, cs[2].id: 90})
	rtts(cs[1], id, map[string]float64{cs[0].id: 30, cs[2].id: 40})
	rtts(cs[2], id, map[string]float64{cs[0].id: 90, cs[1].id: 40})
	time.Sleep(100 * time.Millisecond)
	h.send(map[string]any{"t": "start", "match": id})
	for _, c := range cs {
		if g := c.expect("go"); num(g["master"]) != 1 {
			t.Fatalf("F1 (worst ping 40) masters: %v", g)
		}
	}
	return cs, id
}

func TestRoomMasterDropMigratesAndFightFinishes(t *testing.T) {
	r := newRig(t, false)
	r.h.post(func() { r.h.migrateAfter = 300 * time.Millisecond })
	cs, id := startRoom3(t, r, "lms")
	// The master's tab dies mid-fight.
	cs[1].ws.Close(websocket.StatusGoingAway, "")
	for _, c := range []*tc{cs[0], cs[2]} {
		if a := c.expect("away"); num(a["slot"]) != 1 {
			t.Fatalf("away: %v", a)
		}
		if o := c.expect("out"); num(o["slot"]) != 1 {
			t.Fatalf("the master is eliminated: %v", o)
		}
		// Two left, one ping between them: a tie, settled by seat order.
		if m := c.expect("master"); num(m["master"]) != 0 || num(m["gone"]) != 1 {
			t.Fatalf("a remaining seat takes over: %v", m)
		}
	}
	// The new master finishes the fight; both still in agree on it.
	for _, c := range []*tc{cs[0], cs[2]} {
		c.send(map[string]any{"t": "round", "match": id, "round": 1, "winner": 2, "ko": true, "place": []int{2, 3, 1}})
	}
	for _, c := range []*tc{cs[0], cs[2]} {
		res := c.expect("result")
		if num(res["winner"]) != 2 || res["forfeit"] == true || res["mode"] != "lms" {
			t.Fatalf("agreed result after migration: %v", res)
		}
	}
	var score string
	r.h.st.db.QueryRow(`SELECT score FROM matches WHERE id=?`, id).Scan(&score)
	if score != "place 2,3,1" {
		t.Fatalf("placements recorded: %q", score)
	}
	lb := getJSON(t, r.srv.URL+prefix+"/leaderboard?board=battles")
	if len(lb["rows"].([]any)) != 3 {
		t.Fatalf("the leaver's battle counts too (a loss): %v", lb)
	}
}

func TestRoomLeaversAreOutLastOneWinsByForfeit(t *testing.T) {
	r := newRig(t, false)
	cs, _ := startRoom3(t, r, "hill")
	cs[0].send(map[string]any{"t": "leave"})
	if o := cs[0].expect("out"); o["you"] != true {
		t.Fatalf("the leaver hears it is out: %v", o)
	}
	for _, c := range cs[1:] {
		if o := c.expect("out"); num(o["slot"]) != 0 {
			t.Fatalf("out: %v", o)
		}
	}
	cs[2].none("master", 200*time.Millisecond) // the host was not master: no migration
	cs[1].send(map[string]any{"t": "leave"})
	res := cs[2].expect("result")
	if num(res["winner"]) != 2 || res["forfeit"] != true {
		t.Fatalf("last one in wins by forfeit: %v", res)
	}
	if p := res["place"].([]any); num(p[2]) != 1 || num(p[1]) != 2 || num(p[0]) != 3 {
		t.Fatalf("forfeit placements: winner, then the later leaver: %v", p)
	}
	if c := r.h.st.counts(); c.Voided != 0 || c.Matches != 1 {
		t.Fatalf("leaving never voids a room: %+v", c)
	}
}

func TestRoomDisagreementVoids(t *testing.T) {
	r := newRig(t, false)
	cs, id := startRoom3(t, r, "bandana")
	for i, c := range cs {
		place := []int{1, 2, 3}
		if i == 2 {
			place = []int{1, 3, 2}
		}
		c.send(map[string]any{"t": "round", "match": id, "round": 1, "winner": 0, "ko": false, "place": place})
	}
	if v := cs[0].expect("void"); v["why"] != "disagree" {
		t.Fatalf("placements are part of the agreement: %v", v)
	}
}

func TestRoomGuestDropGetsGraceThenOut(t *testing.T) {
	r := newRig(t, false)
	r.h.post(func() { r.h.awayGrace = 400 * time.Millisecond })
	cs, _ := startRoom3(t, r, "lms")
	cs[2].ws.Close(websocket.StatusGoingAway, "")
	cs[0].expect("away")
	cs[0].none("master", 250*time.Millisecond)
	if o := cs[0].expect("out"); num(o["slot"]) != 2 || o["why"] != "gone" {
		t.Fatalf("a guest who never comes back is out: %v", o)
	}
}

// The agreed reports carry everyone's damage; the server, not the loser, decides a close loss.
func TestAgreedDamageMakesACloseLoss(t *testing.T) {
	r := newRig(t, false)
	a, b := r.dial("Alice", "dev:alice"), r.dial("Bob", "dev:bob")
	id, _, _ := matchUp(t, a, b)
	a.accept(id)
	b.accept(id)
	a.expect("go")
	b.expect("go")
	rep := func(round int, dmg []int, cs ...*tc) {
		for _, c := range cs {
			c.send(map[string]any{"t": "round", "match": id, "round": round, "winner": 0, "ko": true, "dmg": dmg})
		}
	}
	rep(1, []int{20, 100}, a, b)
	a.expect("go")
	b.expect("go")
	// Round 2 decides it: Alice wins but ends 61% damaged — Bob's loss was close.
	rep(2, []int{61, 100}, a, b)
	a.expect("result")
	var bobClose, aliceClose int
	r.h.st.db.QueryRow(`SELECT close FROM ev_arena WHERE match=? AND uid='bob'`, id).Scan(&bobClose)
	r.h.st.db.QueryRow(`SELECT close FROM ev_arena WHERE match=? AND uid='alice'`, id).Scan(&aliceClose)
	if bobClose != 1 || aliceClose != 0 {
		t.Fatalf("close loss from the agreed deciding round: bob %d alice %d", bobClose, aliceClose)
	}
}

func TestDamageIsPartOfTheAgreement(t *testing.T) {
	r := newRig(t, false)
	cs, id := startRoom3(t, r, "lms")
	for i, c := range cs {
		d := []int{100, 30, 100}
		if i == 1 {
			d = []int{100, 70, 100}
		}
		c.send(map[string]any{"t": "round", "match": id, "round": 1, "winner": 1, "ko": true, "place": []int{3, 1, 2}, "dmg": d})
	}
	if v := cs[0].expect("void"); v["why"] != "disagree" {
		t.Fatalf("a different damage report is a disagreement: %v", v)
	}
}
