package main

import (
	"encoding/json"
	"testing"
	"time"
)

// A hub driven synchronously with a fake clock: no sockets, no goroutines.
type rig struct {
	h   *hub
	now time.Time
}

func newRig() *rig {
	r := &rig{now: time.Unix(1_800_000_000, 0)}
	r.h = newHub(newTurn("", ""))
	r.h.now = func() time.Time { return r.now }
	r.h.started = r.now
	return r
}

func (r *rig) client(name, tz string) *client {
	c := r.connect("", "")
	r.msg(c, map[string]any{"t": "hello", "name": name, "tz": tz})
	return c
}

// connect opens a socket, optionally resuming an earlier id/token.
func (r *rig) connect(id, tok string) *client {
	reply := make(chan attachResult, 1)
	r.h.handle(event{kind: evJoin, c: &client{send: make(chan []byte, 4096)}, rid: id, rtok: tok, reply: reply})
	return (<-reply).c
}

func (r *rig) msg(c *client, m map[string]any) {
	b, _ := json.Marshal(m)
	r.h.handle(event{kind: evMsg, c: c, gen: c.gen, data: b})
}

// dropSocket: the browser's connection dies (no leave message).
func (r *rig) dropSocket(c *client) {
	r.h.handle(event{kind: evLeave, c: c, gen: c.gen})
}

func (r *rig) beat(c *client, ready bool) {
	m := map[string]any{"t": "b"}
	if ready {
		m["r"] = 1
	}
	r.msg(c, m)
}

func (r *rig) advance(d time.Duration) {
	r.now = r.now.Add(d)
	r.h.handle(event{kind: evTick})
}

// last returns the newest text message of a given type sent to c.
func last(c *client, t string) map[string]any {
	var found map[string]any
	for {
		select {
		case f := <-c.send:
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

func drain(cs ...*client) {
	for _, c := range cs {
		last(c, "")
	}
}

func TestQuickJoinGroupsByRegionAndFills(t *testing.T) {
	r := newRig()
	a := r.client("A", "Australia/Sydney")
	b := r.client("B", "Australia/Perth")
	u := r.client("U", "America/Chicago")
	r.msg(a, map[string]any{"t": "quick"})
	r.msg(b, map[string]any{"t": "quick"})
	r.msg(u, map[string]any{"t": "quick"})
	if a.room == nil || a.room != b.room {
		t.Fatalf("two Australians should share a room")
	}
	if u.room == a.room {
		t.Fatalf("an American should not be put in the Australian room")
	}
	if a.room.members[0] != a {
		t.Fatalf("first in should host")
	}
	if got := r.h.countStats(); got.Rooms != 2 || got.Players != 3 {
		t.Fatalf("stats %+v", got)
	}
}

func TestPrivateRoomsNeedTheCode(t *testing.T) {
	r := newRig()
	a := r.client("Dad", "Australia/Sydney")
	r.msg(a, map[string]any{"t": "create", "name": "Family", "set": map[string]bool{"baseSpeed": false}})
	code := a.room.code
	if len(code) != 6 {
		t.Fatalf("code %q", code)
	}
	b := r.client("Kid", "Australia/Sydney")
	r.msg(b, map[string]any{"t": "join", "id": a.room.id}) // by id: refused
	if b.room != nil {
		t.Fatalf("a private room must not be joinable by id")
	}
	r.msg(b, map[string]any{"t": "list"})
	list := last(b, "rooms")
	raw, _ := json.Marshal(list)
	if !json.Valid(raw) || containsString(string(raw), code) {
		t.Fatalf("room list leaked the code: %s", raw)
	}
	r.msg(b, map[string]any{"t": "join", "code": "  " + toLower(code) + " "})
	if b.room != a.room {
		t.Fatalf("join by code (any case, padded) failed")
	}
	if string(a.room.settings) != `{"baseSpeed":false}` {
		t.Fatalf("settings %s", a.room.settings)
	}
	r.msg(b, map[string]any{"t": "quick"})
	if b.room == a.room {
		t.Fatalf("AUTO JOIN must never land in a private room")
	}
}

func TestSilentHostIsReplacedOnlyByAReadyPlayer(t *testing.T) {
	r := newRig()
	a := r.client("A", "Australia/Sydney")
	b := r.client("B", "Australia/Sydney")
	c := r.client("C", "Australia/Sydney")
	for _, x := range []*client{a, b, c} {
		r.msg(x, map[string]any{"t": "quick"})
	}
	r.beat(a, true)
	r.beat(b, false) // still loading the arena
	r.beat(c, true)
	epoch := a.room.epoch

	// A goes quiet. B is next in line but has nothing to run; C takes over.
	for i := 0; i < 11; i++ {
		r.beat(b, false)
		r.beat(c, true)
		r.advance(250 * time.Millisecond)
	}
	if a.room.members[0] != c {
		t.Fatalf("expected C to host, got %s", a.room.members[0].name)
	}
	if a.room.members[len(a.room.members)-1] != a {
		t.Fatalf("the silent host goes to the back of the line")
	}
	if a.room.epoch == epoch {
		t.Fatalf("a host change must bump the epoch")
	}
}

func TestNoThrashWhenEveryoneStalls(t *testing.T) {
	r := newRig()
	a := r.client("A", "Australia/Sydney")
	b := r.client("B", "Australia/Sydney")
	r.msg(a, map[string]any{"t": "quick"})
	r.msg(b, map[string]any{"t": "quick"})
	r.beat(a, true)
	r.beat(b, true)
	epoch := a.room.epoch
	for i := 0; i < 40; i++ { // ten seconds of nobody beating
		r.advance(250 * time.Millisecond)
	}
	if a.room.epoch != epoch || a.room.members[0] != a {
		t.Fatalf("host passed around while nobody could take it (epoch %d → %d)", epoch, a.room.epoch)
	}
}

func TestHandoffIsImmediateAndLeavingPromotes(t *testing.T) {
	r := newRig()
	a := r.client("A", "Australia/Sydney")
	b := r.client("B", "Australia/Sydney")
	r.msg(a, map[string]any{"t": "quick"})
	r.msg(b, map[string]any{"t": "quick"})
	r.beat(a, true)
	r.beat(b, true)
	r.msg(b, map[string]any{"t": "handoff"}) // not the host: ignored
	if a.room.members[0] != a {
		t.Fatalf("only the host may hand off")
	}
	r.msg(a, map[string]any{"t": "handoff"})
	if a.room.members[0] != b {
		t.Fatalf("handoff should promote B at once")
	}
	room := a.room
	r.msg(b, map[string]any{"t": "leave"})
	if room.members[0] != a || len(room.members) != 1 {
		t.Fatalf("host leaving should promote the next in line")
	}
	r.msg(a, map[string]any{"t": "leave"})
	if r.h.rooms[room.id] != nil {
		t.Fatalf("an empty room should be deleted")
	}
}

func TestRelayStaysInsideTheRoom(t *testing.T) {
	r := newRig()
	a := r.client("A", "Australia/Sydney")
	b := r.client("B", "Australia/Sydney")
	x := r.client("X", "Europe/London")
	r.msg(a, map[string]any{"t": "quick"})
	r.msg(b, map[string]any{"t": "quick"})
	r.msg(x, map[string]any{"t": "quick"})
	drain(a, b, x)

	frame := append([]byte{byte(len(b.id))}, b.id...)
	frame = append(frame, 'u', 1, 2, 3)
	r.h.handle(event{kind: evMsg, c: a, data: frame, bin: true})
	got := <-b.send
	if got[0] != 'b' || string(got[2:2+len(a.id)]) != a.id || got[len(got)-1] != 3 {
		t.Fatalf("relayed frame %v", got)
	}
	frame = append([]byte{byte(len(b.id))}, b.id...)
	frame = append(frame, 'u', 9)
	r.h.handle(event{kind: evMsg, c: x, data: frame, bin: true})
	select {
	case f := <-b.send:
		t.Fatalf("a stranger relayed into the room: %v", f)
	default:
	}
}

func TestRegions(t *testing.T) {
	for tz, want := range map[string]string{
		"Australia/Melbourne": "oce", "Pacific/Auckland": "oce", "America/Los_Angeles": "am",
		"Europe/Berlin": "eu", "Asia/Tokyo": "as", "": "xx",
	} {
		if got := regionOf(tz); got != want {
			t.Errorf("%s → %s, want %s", tz, got, want)
		}
	}
}

func containsString(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}

func toLower(s string) string {
	b := []byte(s)
	for i, c := range b {
		if c >= 'A' && c <= 'Z' {
			b[i] = c + 32
		}
	}
	return string(b)
}

func TestTurnOnlyOnceSomeoneElseIsInTheRoom(t *testing.T) {
	r := newRig()
	c := newTurnCap("acct", "tok", 800)
	c.readAt = time.Now()
	r.h.turn = &turn{keyID: "k", token: "t", cap: c, cached: json.RawMessage(`[{"urls":["turn:x"]}]`), until: time.Now().Add(time.Hour)}
	a := r.client("A", "Australia/Sydney")
	r.msg(a, map[string]any{"t": "quick"})
	if m := last(a, "room"); m == nil || m["ice"] != nil {
		t.Fatalf("a lone player must not get TURN credentials: %v", m)
	}
	b := r.client("B", "Australia/Sydney")
	r.msg(b, map[string]any{"t": "quick"})
	if m := last(a, "room"); m == nil || m["ice"] == nil {
		t.Fatalf("with two players, credentials should be handed out")
	}
}

func memberIDs(m map[string]any) []string {
	var out []string
	for _, x := range m["members"].([]any) {
		out = append(out, x.(map[string]any)["id"].(string))
	}
	return out
}

func TestDroppedSocketKeepsItsPlaceForTheGrace(t *testing.T) {
	r := newRig()
	r.advance(2 * rebuildWindow) // a long-running server: no rebuilds
	a := r.client("A", "Australia/Sydney")
	r.msg(a, map[string]any{"t": "create", "name": "Fam"})
	b := r.client("B", "Australia/Sydney")
	r.msg(b, map[string]any{"t": "join", "code": a.room.code})
	drain(a, b)
	id, tok, epoch := b.id, b.tok, a.room.epoch

	r.dropSocket(b)
	r.advance(3 * time.Second)
	if len(a.room.members) != 2 || last(a, "room") != nil {
		t.Fatal("a dropped socket must not change the room during the grace")
	}
	if c := r.connect(id, "wrongtokenwrongtoken"); c.id == id {
		t.Fatal("a wrong token must not take over the id")
	}
	b2 := r.connect(id, tok)
	if b2 != b || !last(b2, "welcome")["resumed"].(bool) {
		t.Fatal("resume with the token should rebind the same client")
	}
	r.msg(b2, map[string]any{"t": "rejoin"})
	m := last(b2, "room")
	if m == nil || int(m["epoch"].(float64)) != epoch || m["joined"] != nil {
		t.Fatalf("rejoin should resend the same room, not a fresh join: %v", m)
	}
	// The old connection's late close must not knock the new one offline.
	r.h.handle(event{kind: evLeave, c: b, gen: b.gen - 1})
	if b.away || b.send == nil {
		t.Fatal("a stale connection's close was applied to the new one")
	}

	r.dropSocket(b)
	r.advance(reconnectGrace + time.Second)
	if len(a.room.members) != 1 || r.h.clients[id] != nil {
		t.Fatal("a player who never comes back is removed after the grace")
	}
	if c := r.connect(id, tok); c.id == id {
		t.Fatal("an expired id is not handed back on a long-running server")
	}

	// A tab closed on purpose leaves at once.
	d := r.client("D", "Australia/Sydney")
	r.msg(d, map[string]any{"t": "join", "code": a.room.code})
	r.h.handle(event{kind: evLeave, c: d, gen: d.gen, bye: true})
	if len(a.room.members) != 1 {
		t.Fatal("a goodbye close should leave the room immediately")
	}
}

func TestRestartRebuildsTheRoomUnchanged(t *testing.T) {
	r := newRig() // fresh server, inside the rebuild window
	host := r.connect("hxsthxst", "tkentkentkentkentken")
	if host.id != "hxsthxst" {
		t.Fatal("after a restart a browser keeps its id")
	}
	fol := r.connect("fwdrfwdr", "fwdrtkenfwdrtkenfwdr")
	rj := map[string]any{"id": "rxxmrxxm", "code": "ABCDEF", "name": "Fam", "priv": true, "region": "oce",
		"set": map[string]bool{"boost": false}, "epoch": 7,
		"members": []map[string]string{{"id": "hxsthxst", "name": "H"}, {"id": "fwdrfwdr", "name": "F"}, {"id": "gxnegxne", "name": "G"}}}
	r.msg(fol, map[string]any{"t": "rejoin", "rj": rj})
	m := last(fol, "room")
	if m == nil || m["host"] != "hxsthxst" || int(m["epoch"].(float64)) != 7 || m["code"] != "ABCDEF" {
		t.Fatalf("rebuilt room should keep host, epoch and code: %v", m)
	}
	// The host reconnected before the follower rebuilt: it keeps the front.
	r.msg(host, map[string]any{"t": "rejoin", "rj": rj})
	ids := memberIDs(last(host, "room"))
	if len(ids) != 3 || ids[0] != "hxsthxst" || ids[1] != "fwdrfwdr" {
		t.Fatalf("unexpected order %v", ids)
	}

	// A member who reconnects after the rebuild adopts its placeholder.
	r2 := newRig()
	f2 := r2.connect("fwdrfwdr", "fwdrtkenfwdrtkenfwdr")
	r2.msg(f2, map[string]any{"t": "rejoin", "rj": rj})
	h2 := r2.connect("hxsthxst", "tkentkentkentkentken")
	r2.msg(h2, map[string]any{"t": "rejoin", "rj": rj})
	m2 := last(h2, "room")
	if m2 == nil || m2["host"] != "hxsthxst" || memberIDs(m2)[0] != "hxsthxst" || h2.room == nil {
		t.Fatalf("host should be back at the front: %v", m2)
	}
	r2.advance(reconnectGrace + time.Second)
	if n := len(h2.room.members); n != 2 {
		t.Fatalf("the member who never came back should be gone, have %d", n)
	}

	r3 := newRig()
	r3.advance(rebuildWindow + time.Second)
	c := r3.connect("fwdrfwdr", "fwdrtkenfwdrtkenfwdr")
	if c.id == "fwdrfwdr" {
		t.Fatal("ids are only reclaimable just after a restart")
	}
	r3.msg(c, map[string]any{"t": "rejoin", "rj": rj})
	if e := last(c, "err"); e == nil || e["code"] != "gone" {
		t.Fatal("too late to rebuild: the room is gone")
	}
}
