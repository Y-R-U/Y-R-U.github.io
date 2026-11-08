package main

// Protocol gate (docs/notes/protogate.md): a hello below minProtocol is refused play but kept
// connected, so a cached v1 page shows "reload" instead of reconnecting forever.

import (
	"strings"
	"testing"
	"time"
)

func TestOldClientRefusedPlay(t *testing.T) {
	resetWorld(t)
	a := dial(t, "alice", "Alice")
	if num(a.welcome["v"]) != protocolVersion || num(a.welcome["min"]) != minProtocol || a.welcome["old"] != nil {
		t.Fatalf("current welcome %v", a.welcome)
	}
	code := a.ok(map[string]any{"t": "createRoom", "opts": opts("public", true, "collide", true)})["room"].(map[string]any)["code"].(string)
	a.drain()

	for _, v := range []any{1, nil, 0} { // v1 (the pre-ball-hit client), no v at all, zero
		old := dialV(t, "oldbob", "Bob", v)
		w := old.welcome
		if w["old"] != true || w["room"] != nil || num(w["v"]) != protocolVersion || num(w["min"]) != minProtocol {
			t.Fatalf("v=%v welcome %v", v, w)
		}
		if you := w["you"].(map[string]any); you["name"] != "Bob" || you["pid"] != pidOf("dev-oldbob") {
			t.Fatalf("v=%v you %v", v, you)
		}
		e := old.take("old_client push", func(m map[string]any) bool { return m["t"] == "error" && m["code"] == "old_client" })
		if !strings.Contains(e["error"].(string), "Reload") || num(e["min"]) != minProtocol {
			t.Fatalf("v=%v push %v", v, e)
		}
		// play is refused with a reload text; ping and the lobby list still answer
		for _, m := range []map[string]any{
			{"t": "joinRoom", "code": code}, {"t": "peekRoom", "code": code}, {"t": "quick", "opts": opts()},
			{"t": "createRoom", "opts": opts()}, {"t": "room"}, {"t": "rename", "name": "Bobby"}, {"t": "shot"}, {"t": "nonsense"},
		} {
			r := old.fails(m, "old_client")
			if r["error"] != oldClientText {
				t.Fatalf("v=%v %v: %v", v, m["t"], r)
			}
		}
		if r := old.req(map[string]any{"t": "ping"}); r["t"] != "pong" {
			t.Fatalf("ping %v", r)
		}
		if l := old.ok(map[string]any{"t": "lobby"})["lobby"].(map[string]any); len(l["rooms"].([]any)) != 1 {
			t.Fatalf("lobby %v", l)
		}
		// never part of the hub: no user, no seat, no player row, no pushes to the room
		hub.mu.Lock()
		u := hub.users["dev-oldbob"]
		seatsN := len(hub.rooms[code].Seats)
		hub.mu.Unlock()
		if u != nil || seatsN != 1 {
			t.Fatalf("v=%v old client in the hub: user %v, seats %d", v, u, seatsN)
		}
		var n int
		db.QueryRow("SELECT COUNT(*) FROM players WHERE uid = ?", "dev-oldbob").Scan(&n)
		if n != 0 {
			t.Fatalf("v=%v player row stored", v)
		}
		old.drop()
	}
	a.mu.Lock()
	for _, m := range a.backlog {
		if m["t"] == "room" && len(seats(m["room"].(map[string]any))) != 1 {
			t.Fatalf("host saw the old client: %v", m)
		}
	}
	a.mu.Unlock()

	// after a reload (current client, same account) bob plays as usual
	b := dial(t, "oldbob", "Bob")
	if b.welcome["old"] != nil {
		t.Fatalf("reloaded welcome %v", b.welcome)
	}
	if r := b.ok(map[string]any{"t": "joinRoom", "code": code})["room"].(map[string]any); num(r["you"]) != 1 {
		t.Fatalf("join after reload %v", r)
	}
}

func TestNewerClientAccepted(t *testing.T) {
	resetWorld(t)
	c := dialV(t, "future", "Fay", protocolVersion+1) // a client newer than the server still plays
	if c.welcome["old"] != nil {
		t.Fatalf("welcome %v", c.welcome)
	}
	c.ok(map[string]any{"t": "createRoom", "opts": opts()})
}

func TestOldClientSocketExpires(t *testing.T) {
	resetWorld(t)
	defer func(d time.Duration) { oldClientTTL = d }(oldClientTTL)
	oldClientTTL = 200 * time.Millisecond
	old := dialV(t, "stale", "Sam", 1)
	select {
	case <-old.closed:
	case <-time.After(3 * time.Second):
		t.Fatal("old client socket kept past oldClientTTL")
	}
	dial(t, "alice", "Alice") // server fine
}

func TestHealthReportsProtocol(t *testing.T) {
	_, h := api(t, "GET", "/health", "", nil)
	if num(h["protocol"]) != 2 || num(h["minProtocol"]) != 2 {
		t.Fatalf("health %v", h)
	}
}
