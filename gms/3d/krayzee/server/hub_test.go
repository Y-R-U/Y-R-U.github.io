package main

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
)

// A hub driven synchronously with a fake clock: no sockets, no goroutines
// except token checks, which pump() feeds back in.
type rig struct {
	h   *hub
	now time.Time
}

func newRig() *rig {
	r := &rig{now: time.Unix(1_800_000_000, 0)}
	r.h = newHub(nil, devVerifier(func(context.Context, string) (identity, error) { return identity{}, errors.New("no") }))
	r.h.now = func() time.Time { return r.now }
	r.h.started = r.now
	return r
}

func (r *rig) connect(id, tok string) *client {
	reply := make(chan attachResult, 1)
	r.h.handle(event{kind: evJoin, c: &client{send: make(chan []byte, 4096), rank: "baron"}, rid: id, rtok: tok, ip: "1.2.3.4", reply: reply})
	return (<-reply).c
}

func (r *rig) player(name string, extra map[string]any) *client {
	c := r.connect("", "")
	m := map[string]any{"t": "hello", "name": name, "tz": "Australia/Sydney"}
	for k, v := range extra {
		m[k] = v
	}
	r.msg(c, m)
	return c
}

func (r *rig) msg(c *client, m map[string]any) {
	b, _ := json.Marshal(m)
	r.h.handle(event{kind: evMsg, c: c, gen: c.gen, data: b})
}

func (r *rig) pump() {
	select {
	case e := <-r.h.in:
		r.h.handle(e)
	case <-time.After(2 * time.Second):
	}
}

func (r *rig) advance(d time.Duration) {
	r.now = r.now.Add(d)
	r.h.handle(event{kind: evTick})
}

func (r *rig) beat(c *client, ready bool) {
	m := map[string]any{"t": "b"}
	if ready {
		m["r"] = 1
	}
	r.msg(c, m)
}

// last returns the newest text message of type t sent to c, draining its queue.
func last(c *client, t string) map[string]any {
	var found map[string]any
	for {
		select {
		case f, ok := <-c.send:
			if !ok {
				return found
			}
			if f[0] != 't' {
				continue
			}
			var m map[string]any
			json.Unmarshal(f[1:], &m)
			if m["t"] == t {
				found = m
			}
		default:
			return found
		}
	}
}

func roomOf(t *testing.T, c *client) map[string]any {
	m := last(c, "room")
	if m == nil {
		t.Fatal("no room message")
	}
	return m["room"].(map[string]any)
}

func memberOf(room map[string]any, id string) map[string]any {
	for _, x := range room["members"].([]any) {
		if m := x.(map[string]any); m["id"] == id {
			return m
		}
	}
	return nil
}

func TestCreateVoicesCallsigns(t *testing.T) {
	r := newRig()
	a := r.player("Dirk", map[string]any{"voices": []string{"toff", "bubba"}})
	r.msg(a, map[string]any{"t": "create", "name": "Dirk Air", "set": map[string]any{"type": "court"}})
	room := roomOf(t, a)
	if room["host"] != a.id || room["owner"] != a.id || room["phase"] != "lobby" || len(room["code"].(string)) != 6 {
		t.Fatal("bad new room", room)
	}
	if a.voice != "toff" {
		t.Fatal("first favourite not given", a.voice)
	}
	others := []*client{}
	for i := 0; i < 7; i++ {
		c := r.player("P", map[string]any{"voices": []string{"toff", "bubba"}})
		r.msg(c, map[string]any{"t": "join", "code": strings.ToLower(a.room.code)})
		others = append(others, c)
	}
	if others[0].voice != "bubba" || others[1].voice != "duchess" {
		t.Fatal("fallback order wrong", others[0].voice, others[1].voice)
	}
	seenV, seenC := map[string]bool{}, map[int]bool{}
	for _, c := range append(others, a) {
		if seenV[c.voice] || seenC[c.call] || c.call < 11 || c.call > 99 || c.call%10 == 0 {
			t.Fatal("voice/callsign not unique or out of range", c.voice, c.call)
		}
		seenV[c.voice], seenC[c.call] = true, true
	}
	late := r.player("Late", nil)
	r.msg(late, map[string]any{"t": "join", "code": a.room.code})
	if e := last(late, "err"); e == nil || e["code"] != "full" {
		t.Fatal("ninth player admitted", e)
	}
}

func TestSettingsAndRankGates(t *testing.T) {
	s := cleanSettings(json.RawMessage(`{"type":"joust","maxPlayers":8,"decrees":["all_bathtubs","nope"],"ranked":true,"minutes":7,"partialStart":60,"traffic":"warp","aircraft":["C172","light","<x>"]}`), "baron")
	if s.MaxPlayers != 2 || len(s.Decrees) != 0 || s.Ranked || s.Minutes != 0 || s.PartialStart != 100 || s.Traffic != "busy" {
		t.Fatalf("baron joust not cleaned: %+v", s)
	}
	if strings.Join(s.Aircraft, ",") != "c172,light" {
		t.Fatal("aircraft ids", s.Aircraft)
	}
	s = cleanSettings(json.RawMessage(`{"type":"court","decrees":["all_bathtubs","all_bathtubs","tower_on_strike"],"ranked":true,"minutes":0}`), "king")
	if len(s.Decrees) != 2 || !s.Ranked || s.Minutes != 0 {
		t.Fatalf("king host lost options: %+v", s)
	}
	s = cleanSettings(json.RawMessage(`{"type":"court","decrees":["all_bathtubs"],"ranked":true}`), "duke")
	if len(s.Decrees) != 0 || !s.Ranked || s.Minutes != 10 {
		t.Fatalf("duke gates wrong: %+v", s)
	}
	if cleanName("  fuck   off ", "Pilot") != "Pilot" || cleanName("Lady  <b>Mo</b>", "x") != "Lady bMo/b" {
		t.Fatal("name cleaning", cleanName("Lady  <b>Mo</b>", "x"))
	}
}

func TestClaimRules(t *testing.T) {
	r := newRig()
	a := r.player("A", map[string]any{"voices": []string{"toff"}})
	r.msg(a, map[string]any{"t": "create"})
	b := r.player("B", nil)
	c := r.player("C", nil)
	r.msg(b, map[string]any{"t": "join", "code": a.room.code})
	r.msg(c, map[string]any{"t": "join", "code": a.room.code})
	last(b, "claim")
	r.msg(b, map[string]any{"t": "claim", "voice": "tex"})
	r.msg(c, map[string]any{"t": "claim", "voice": "tex"})
	cb, cc := last(b, "claim"), last(c, "claim")
	if cb["ok"] != true || cc["ok"] != false || cc["by"] != b.id || cc["byName"] != "B" {
		t.Fatal("claim race", cb, cc)
	}
	r.msg(a, map[string]any{"t": "phase", "p": "flight"})
	r.msg(c, map[string]any{"t": "claim", "voice": "nan"})
	if m := last(c, "claim"); m["ok"] != false || m["why"] != "airborne" {
		t.Fatal("voice changed in the air", m)
	}
	r.msg(c, map[string]any{"t": "b", "pk": 1})
	r.msg(c, map[string]any{"t": "claim", "voice": "nan"})
	if m := last(c, "claim"); m["ok"] != true {
		t.Fatal("parked player could not change voice", m)
	}
	r.msg(b, map[string]any{"t": "phase", "p": "lobby"})
	if a.room.phase != "flight" {
		t.Fatal("a guest changed the phase")
	}
	r.msg(b, map[string]any{"t": "set", "set": map[string]any{"type": "rumble"}})
	r.msg(a, map[string]any{"t": "set", "set": map[string]any{"type": "rumble"}})
	if a.room.set.Type != "court" {
		t.Fatal("options changed mid-flight or by a guest")
	}
	r.msg(a, map[string]any{"t": "phase", "p": "lobby"})
	r.msg(a, map[string]any{"t": "set", "set": map[string]any{"type": "rumble", "voices": "duplicates_allowed"}})
	r.msg(b, map[string]any{"t": "claim", "voice": "toff"})
	if a.room.set.Type != "rumble" || b.voice != "toff" {
		t.Fatal("host options / duplicates_allowed", a.room.set.Type, b.voice)
	}
}

func TestJoustMidJoin(t *testing.T) {
	r := newRig()
	a := r.player("A", nil)
	r.msg(a, map[string]any{"t": "create", "set": map[string]any{"type": "court"}})
	r.msg(a, map[string]any{"t": "phase", "p": "flight"})
	b := r.player("B", nil)
	r.msg(b, map[string]any{"t": "join", "code": a.room.code})
	if b.room != a.room {
		t.Fatal("mid-session join refused in a court")
	}
	j := r.player("J", nil)
	r.msg(j, map[string]any{"t": "create", "set": map[string]any{"type": "joust"}})
	r.msg(j, map[string]any{"t": "phase", "p": "flight"})
	r.msg(b, map[string]any{"t": "join", "code": j.room.code})
	if e := last(b, "err"); b.room == j.room || e == nil || e["code"] != "joust" {
		t.Fatal("joined a joust mid-round", e)
	}
}

func TestHostDropGraceAndSilence(t *testing.T) {
	r := newRig()
	a := r.player("A", map[string]any{"voices": []string{"toff"}})
	r.msg(a, map[string]any{"t": "create"})
	b := r.player("B", nil)
	c := r.player("C", nil)
	r.msg(b, map[string]any{"t": "join", "code": a.room.code})
	r.msg(c, map[string]any{"t": "join", "code": a.room.code})
	rm := a.room
	ep := rm.epoch
	r.h.handle(event{kind: evLeave, c: a, gen: a.gen})
	if rm.members[0] != b || rm.epoch <= ep || !a.away || a.voice != "toff" {
		t.Fatal("dropped host did not hand off at once, or lost its seat")
	}
	r.msg(b, map[string]any{"t": "claim", "voice": "toff"})
	if m := last(b, "claim"); m["ok"] != false {
		t.Fatal("away player's voice was free")
	}
	a2 := r.connect(a.id, a.tok)
	if a2 != a || a.away || a.room != rm || rm.members[0] != b {
		t.Fatal("resume failed or retook the host role")
	}
	if bad := r.connect(a.id, "wrongwrongwrongwrong"); bad == a {
		t.Fatal("wrong token took the seat")
	}
	r.h.handle(event{kind: evLeave, c: c, gen: c.gen})
	r.advance(r.h.grace + time.Second)
	if c.room != nil || len(rm.members) != 2 {
		t.Fatal("grace did not expire")
	}

	// Silence: the host stops beating, a ready guest takes over.
	r.beat(a, true)
	r.beat(b, true)
	ep = rm.epoch
	r.now = r.now.Add(1500 * time.Millisecond)
	r.beat(a, true)
	r.advance(1500 * time.Millisecond)
	if rm.members[0] != a || rm.epoch <= ep {
		t.Fatal("silent host not replaced", rm.members[0].id)
	}
	r.beat(b, true)
	r.msg(a, map[string]any{"t": "handoff"})
	if rm.members[0] != b {
		t.Fatal("handoff ignored")
	}
}

func TestKickAndVote(t *testing.T) {
	r := newRig()
	a := r.player("A", nil)
	r.msg(a, map[string]any{"t": "create", "priv": true})
	b, c := r.player("B", nil), r.player("C", nil)
	r.msg(b, map[string]any{"t": "join", "code": a.room.code})
	r.msg(c, map[string]any{"t": "join", "code": a.room.code})
	rm := a.room
	r.msg(b, map[string]any{"t": "kick", "id": c.id})
	if c.room != rm {
		t.Fatal("a guest kicked in a private room")
	}
	r.msg(a, map[string]any{"t": "kick", "id": c.id})
	if c.room != nil || last(c, "kicked") == nil {
		t.Fatal("owner kick failed")
	}
	r.msg(c, map[string]any{"t": "join", "code": rm.code})
	if c.room != nil {
		t.Fatal("kicked player came back")
	}

	p := r.player("P", nil)
	r.msg(p, map[string]any{"t": "create"})
	q, s, u := r.player("Q", nil), r.player("S", nil), r.player("U", nil)
	for _, x := range []*client{q, s, u} {
		r.msg(x, map[string]any{"t": "join", "code": p.room.code})
	}
	r.msg(p, map[string]any{"t": "kick", "id": u.id})
	if u.room == nil {
		t.Fatal("one vote of three removed a player")
	}
	r.msg(q, map[string]any{"t": "vote", "id": u.id})
	if u.room != nil {
		t.Fatal("majority vote did not remove")
	}
}

func TestOneSeatPerAccount(t *testing.T) {
	r := newRig()
	a := r.player("A", map[string]any{"tok": "dev:alice"})
	r.pump()
	r.msg(a, map[string]any{"t": "create"})
	a2 := r.player("A again", map[string]any{"tok": "dev:alice"})
	r.pump()
	r.msg(a2, map[string]any{"t": "join", "code": a.room.code})
	if a.room != nil || a2.room == nil || a2.uid != "alice" {
		t.Fatal("second tab did not replace the first")
	}
	if m := last(a, "kicked"); m == nil || m["code"] != "replaced" {
		t.Fatal("first tab not told", m)
	}
}

func TestListAndMeta(t *testing.T) {
	r := newRig()
	a := r.player("A", nil)
	r.msg(a, map[string]any{"t": "create", "name": "Pub"})
	r.msg(a, map[string]any{"t": "meta", "crown": "Baroness Dirk", "left": 252})
	h := r.player("H", nil)
	r.msg(h, map[string]any{"t": "create", "priv": true})
	l := r.player("L", nil)
	r.msg(l, map[string]any{"t": "list"})
	rooms := last(l, "rooms")["rooms"].([]any)
	if len(rooms) != 1 {
		t.Fatal("private room listed", rooms)
	}
	x := rooms[0].(map[string]any)
	if x["code"] != nil || x["meta"].(map[string]any)["crown"] != "Baroness Dirk" || x["open"] != true {
		t.Fatal("list entry wrong", x)
	}
	q := r.player("Q", nil)
	r.msg(q, map[string]any{"t": "quick"})
	if q.room != a.room {
		t.Fatal("quick join did not pick the public room in region")
	}
}

func TestRelay(t *testing.T) {
	r := newRig()
	a := r.player("A", nil)
	r.msg(a, map[string]any{"t": "create"})
	b, c := r.player("B", nil), r.player("C", nil)
	r.msg(b, map[string]any{"t": "join", "code": a.room.code})
	r.msg(c, map[string]any{"t": "join", "code": a.room.code})
	last(b, "x")
	last(c, "x")
	frame := append([]byte{byte(len(b.id))}, b.id...)
	frame = append(frame, 'u', 1, 2, 3)
	r.h.handle(event{kind: evMsg, c: a, gen: a.gen, data: frame, bin: true})
	got := <-b.send
	if got[0] != 'b' || string(got[2:2+len(a.id)]) != a.id || got[len(got)-1] != 3 {
		t.Fatal("binary relay frame", got)
	}
	select {
	case f := <-c.send:
		t.Fatal("binary relay leaked", f)
	default:
	}
	r.msg(a, map[string]any{"t": "sig", "to": c.id, "d": map[string]any{"sdp": 1}})
	if m := last(c, "sig"); m == nil || m["from"] != a.id || last(b, "sig") != nil {
		t.Fatal("sig routing")
	}
}

func TestRebuildAfterRestart(t *testing.T) {
	r := newRig()
	a := r.connect("aaaaaaaa", "tokentokentokentoken")
	if a.id != "aaaaaaaa" {
		t.Fatal("id not kept inside the rebuild window")
	}
	rj := map[string]any{"id": "roomid", "code": "ABCDEF", "name": "Old", "priv": true, "epoch": 4, "phase": "flight", "owner": "aaaaaaaa",
		"set":     map[string]any{"type": "strict"},
		"members": []map[string]any{{"id": "bbbbbbbb", "name": "B", "voice": "tex", "call": 42}, {"id": "aaaaaaaa", "name": "A", "voice": "nan", "call": 21}}}
	r.msg(a, map[string]any{"t": "rejoin", "rj": rj})
	rm := r.h.rooms["roomid"]
	if rm == nil || rm.code != "ABCDEF" || rm.epoch != 4 || rm.phase != "flight" || rm.set.Type != "strict" || len(rm.members) != 2 {
		t.Fatal("room not rebuilt", rm)
	}
	if rm.members[0].id != "bbbbbbbb" || !rm.members[0].away || rm.members[0].voice != "tex" || a.voice != "nan" || a.call != 21 {
		t.Fatal("line, voices or callsigns lost")
	}
	r.advance(rebuildWindow)
	late := r.connect("cccccccc", "tokentokentokentoken")
	if late.id == "cccccccc" {
		t.Fatal("id reuse allowed after the window")
	}
}

func TestPerIPCap(t *testing.T) {
	r := newRig()
	r.h.perIP = 2
	r.connect("", "")
	r.connect("", "")
	if c := r.connect("", ""); c != nil {
		t.Fatal("third socket from one address accepted")
	}
}
