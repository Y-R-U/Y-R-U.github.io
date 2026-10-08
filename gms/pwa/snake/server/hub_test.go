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
	return r
}

func (r *rig) client(name, tz string) *client {
	c := &client{id: r.h.newID(), send: make(chan []byte, 4096)}
	done := make(chan bool, 1)
	r.h.handle(event{kind: evJoin, c: c, done: done})
	<-done
	r.msg(c, map[string]any{"t": "hello", "name": name, "tz": tz})
	return c
}

func (r *rig) msg(c *client, m map[string]any) {
	b, _ := json.Marshal(m)
	r.h.handle(event{kind: evMsg, c: c, data: b})
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
