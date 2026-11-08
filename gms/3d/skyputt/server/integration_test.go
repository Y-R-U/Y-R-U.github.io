package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"
)

var (
	ts      *httptest.Server
	clockMu sync.Mutex
	clock   time.Time
)

func TestMain(m *testing.M) {
	dir, _ := os.MkdirTemp("", "skyputt-test")
	os.Setenv("SKYPUTT_DEV_AUTH", "1")
	os.Setenv("SKYPUTT_NO_RATE", "1")
	loadConfig()
	cfg.Salt = "test"
	clock = time.Date(2026, 11, 2, 12, 0, 0, 0, time.UTC)
	nowFn = func() time.Time { clockMu.Lock(); defer clockMu.Unlock(); return clock }
	openDB(dir + "/skyputt.db")
	ts = httptest.NewServer(routes())
	code := m.Run()
	ts.Close()
	os.RemoveAll(dir)
	os.Exit(code)
}

func advance(d time.Duration) { clockMu.Lock(); clock = clock.Add(d); clockMu.Unlock() }

func resetWorld(t *testing.T) {
	old := hub
	old.mu.Lock()
	hub = newHub()
	old.mu.Unlock()
	for _, tb := range []string{"players", "rounds", "round_players", "settings"} {
		db.Exec("DELETE FROM " + tb)
	}
	resetLimits()
	maxPublicRoomsPerIP = 3
}

type client struct {
	t       *testing.T
	c       *websocket.Conn
	mu      sync.Mutex
	backlog []map[string]any
	notify  chan struct{}
	nextID  int64
	welcome map[string]any
	closed  chan struct{}
}

func dial(t *testing.T, uid, name string) *client {
	t.Helper()
	u := "ws" + strings.TrimPrefix(ts.URL, "http") + "/gms/3d/skyputt/api/ws"
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	c, _, err := websocket.Dial(ctx, u, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	cl := &client{t: t, c: c, notify: make(chan struct{}, 1), closed: make(chan struct{})}
	go func() {
		defer close(cl.closed)
		for {
			_, b, err := c.Read(context.Background())
			if err != nil {
				return
			}
			var m map[string]any
			json.Unmarshal(b, &m)
			cl.mu.Lock()
			cl.backlog = append(cl.backlog, m)
			cl.mu.Unlock()
			select {
			case cl.notify <- struct{}{}:
			default:
			}
		}
	}()
	t.Cleanup(func() { c.Close(websocket.StatusNormalClosure, "") })
	cl.send(map[string]any{"t": "hello", "token": "dev:" + uid + ":" + name + ":anon", "name": name})
	cl.welcome = cl.wait("welcome")
	return cl
}

func (cl *client) send(m map[string]any) int64 {
	cl.nextID++
	m["id"] = cl.nextID
	b, _ := json.Marshal(m)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := cl.c.Write(ctx, websocket.MessageText, b); err != nil {
		cl.t.Fatalf("write: %v", err)
	}
	return cl.nextID
}

// take finds and removes the first message matching f, waiting up to 3 s.
func (cl *client) take(desc string, f func(map[string]any) bool) map[string]any {
	cl.t.Helper()
	deadline := time.After(3 * time.Second)
	for {
		cl.mu.Lock()
		for i, m := range cl.backlog {
			if f(m) {
				cl.backlog = append(cl.backlog[:i], cl.backlog[i+1:]...)
				cl.mu.Unlock()
				return m
			}
		}
		cl.mu.Unlock()
		select {
		case <-cl.notify:
		case <-deadline:
			cl.mu.Lock()
			defer cl.mu.Unlock()
			cl.t.Fatalf("timed out waiting for %s; backlog: %v", desc, cl.backlog)
		}
	}
}

func (cl *client) wait(typ string) map[string]any {
	cl.t.Helper()
	return cl.take(typ, func(m map[string]any) bool { return m["t"] == typ })
}

// waitEv waits for a room push carrying ev (holeStart / holeEnd / end).
func (cl *client) waitEv(e string) map[string]any {
	cl.t.Helper()
	return cl.take("room ev "+e, func(m map[string]any) bool { return m["t"] == "room" && m["ev"] == e })["room"].(map[string]any)
}

func (cl *client) req(m map[string]any) map[string]any {
	cl.t.Helper()
	id := cl.send(m)
	return cl.take(fmt.Sprintf("reply to %v", m["t"]), func(r map[string]any) bool {
		n, _ := r["id"].(float64)
		return int64(n) == id && (r["t"] == "ok" || r["t"] == "error" || r["t"] == "pong")
	})
}

func (cl *client) ok(m map[string]any) map[string]any {
	cl.t.Helper()
	r := cl.req(m)
	if r["t"] != "ok" {
		cl.t.Fatalf("%v: %v", m["t"], r)
	}
	return r
}

func (cl *client) fails(m map[string]any, code string) map[string]any {
	cl.t.Helper()
	r := cl.req(m)
	if r["t"] != "error" || r["code"] != code {
		cl.t.Fatalf("%v: want error %s, got %v", m["t"], code, r)
	}
	return r
}

func (cl *client) drain() { cl.mu.Lock(); cl.backlog = nil; cl.mu.Unlock() }

func (cl *client) drop() {
	cl.c.Close(websocket.StatusNormalClosure, "")
	<-cl.closed
	time.Sleep(30 * time.Millisecond)
}

func tick() { hub.tick() }

func opts(kv ...any) map[string]any {
	o := map[string]any{"name": "", "public": false, "course": "sky", "courseName": "Sky Isles", "theme": "sky", "max": 4,
		"holes":   []map[string]any{{"id": "sky1", "par": 2}, {"id": "sky2", "par": 3}, {"id": "sky3", "par": 3}},
		"helpers": map[string]any{"mode": "fixed", "n": 1}, "shotClock": 0,
		"ai": map[string]any{"count": 0, "personality": "any", "skill": 0.4}}
	for i := 0; i+1 < len(kv); i += 2 {
		o[kv[i].(string)] = kv[i+1]
	}
	return o
}

var ball0 = map[string]any{"x": 0, "y": 0.05, "z": 0, "sup": true, "n": []float64{0, 1, 0}, "surf": 0}

func shotMsg(hole, n int, extra ...any) map[string]any {
	m := map[string]any{"t": "shot", "hole": hole, "n": n, "vx": 0.5, "vz": -2.0, "t0": 3.25, "aim": 0.2, "power": 0.4, "ball": ball0}
	for i := 0; i+1 < len(extra); i += 2 {
		m[extra[i].(string)] = extra[i+1]
	}
	return m
}

func resultMsg(hole, n int, state string, extra ...any) map[string]any {
	m := map[string]any{"t": "result", "hole": hole, "n": n, "state": state, "to": []float64{0.5, 0.05, -2}}
	for i := 0; i+1 < len(extra); i += 2 {
		m[extra[i].(string)] = extra[i+1]
	}
	return m
}

func num(v any) int { f, _ := v.(float64); return int(f) }

func seats(room map[string]any) []map[string]any {
	out := []map[string]any{}
	for _, s := range room["seats"].([]any) {
		out = append(out, s.(map[string]any))
	}
	return out
}

// twoUp: alice hosts a private room, bob joins it. Returns both and the code.
func twoUp(t *testing.T, o map[string]any) (*client, *client, string) {
	a := dial(t, "alice", "Alice")
	b := dial(t, "bob", "Bob")
	code := a.ok(map[string]any{"t": "createRoom", "opts": o})["room"].(map[string]any)["code"].(string)
	b.ok(map[string]any{"t": "joinRoom", "code": strings.ToLower(code)})
	a.drain()
	b.drain()
	return a, b, code
}

func TestCreateJoinAndLobby(t *testing.T) {
	resetWorld(t)
	a := dial(t, "alice", "Alice")
	b := dial(t, "bob", "Bob")
	r := a.ok(map[string]any{"t": "createRoom", "opts": opts()})["room"].(map[string]any)
	code := r["code"].(string)
	if len(code) != codeLen || normCode(code) != code {
		t.Fatalf("bad code %q", code)
	}
	if num(r["you"]) != 0 || num(r["host"]) != 0 || r["state"] != "lobby" {
		t.Fatalf("bad room %v", r)
	}
	// private rooms are not listed
	if l := b.ok(map[string]any{"t": "lobby"})["lobby"].(map[string]any); len(l["rooms"].([]any)) != 0 {
		t.Fatalf("private room listed: %v", l)
	}
	peek := b.ok(map[string]any{"t": "peekRoom", "code": code})["room"].(map[string]any)
	if num(peek["players"]) != 1 || num(peek["holes"]) != 3 {
		t.Fatalf("peek %v", peek)
	}
	b.fails(map[string]any{"t": "joinRoom", "code": "ZZZZZZ"}, "no_room")
	jr := b.ok(map[string]any{"t": "joinRoom", "code": strings.ToLower(code)})["room"].(map[string]any)
	if num(jr["you"]) != 1 || len(seats(jr)) != 2 {
		t.Fatalf("join %v", jr)
	}
	pushed := a.take("room with bob", func(m map[string]any) bool {
		return m["t"] == "room" && len(seats(m["room"].(map[string]any))) == 2
	})["room"].(map[string]any)
	if seats(pushed)[1]["name"] != "Bob" {
		t.Fatalf("host did not see bob: %v", pushed)
	}
	// non-host cannot change options or start
	b.fails(map[string]any{"t": "setOpts", "opts": opts()}, "not_host")
	b.fails(map[string]any{"t": "start"}, "not_host")
	// a public room shows in the lobby
	c := dial(t, "cara", "Cara")
	c.ok(map[string]any{"t": "createRoom", "opts": opts("public", true, "name", "Cara's isle")})
	l := b.ok(map[string]any{"t": "lobby"})["lobby"].(map[string]any)
	rooms := l["rooms"].([]any)
	if len(rooms) != 1 || rooms[0].(map[string]any)["name"] != "Cara's isle" {
		t.Fatalf("lobby %v", l)
	}
	// bad options
	a.fails(map[string]any{"t": "setOpts", "opts": opts("max", 9)}, "bad_max")
	a.fails(map[string]any{"t": "setOpts", "opts": opts("max", 1)}, "bad_max")
	a.fails(map[string]any{"t": "setOpts", "opts": opts("shotClock", 17)}, "bad_clock")
	a.fails(map[string]any{"t": "setOpts", "opts": opts("helpers", map[string]any{"mode": "lots"})}, "bad_helpers")
	a.fails(map[string]any{"t": "setOpts", "opts": opts("holes", []map[string]any{})}, "bad_holes")
	a.fails(map[string]any{"t": "setOpts", "opts": opts("theme", "../x")}, "bad_theme")
	a.fails(map[string]any{"t": "setOpts", "opts": opts("ai", map[string]any{"count": 1, "personality": "robot"})}, "bad_ai")
	// leaving the lobby: bob's seat goes; alice leaving closes the room
	b.ok(map[string]any{"t": "leaveRoom"})
	if s := seats(a.take("room after leave", func(m map[string]any) bool { return m["t"] == "room" && len(seats(m["room"].(map[string]any))) == 1 })["room"].(map[string]any)); s[0]["name"] != "Alice" {
		t.Fatalf("after leave %v", s)
	}
	a.ok(map[string]any{"t": "leaveRoom"})
	hub.mu.Lock()
	_, still := hub.rooms[code]
	hub.mu.Unlock()
	if still {
		t.Fatal("room should close when the last human leaves")
	}
}

func TestStartNeedsTwo(t *testing.T) {
	resetWorld(t)
	a := dial(t, "alice", "Alice")
	a.ok(map[string]any{"t": "createRoom", "opts": opts()})
	a.fails(map[string]any{"t": "start"}, "need_players")
	a.ok(map[string]any{"t": "setOpts", "opts": opts("ai", map[string]any{"count": 1, "personality": "carl", "skill": 0.3})})
	a.ok(map[string]any{"t": "start"})
	r := a.waitEv("holeStart")
	if len(seats(r)) != 2 || seats(r)[1]["kind"] != "ai" {
		t.Fatalf("solo vs AI %v", r)
	}
}

func TestRelayScoringAndRound(t *testing.T) {
	resetWorld(t)
	a, b, _ := twoUp(t, opts("helpers", map[string]any{"mode": "own"}))
	a.ok(map[string]any{"t": "start"})
	ra := a.waitEv("holeStart")
	b.waitEv("holeStart")
	if ra["state"] != "playing" || num(ra["hole"]) != 0 || ra["holeAt"].(float64) <= ra["now"].(float64) {
		t.Fatalf("start %v", ra)
	}
	// alice putts: bob receives the input at once
	a.ok(shotMsg(0, 0, "mods", map[string]any{"magnet": true, "steady": true}))
	sh := b.wait("shot")
	if num(sh["seat"]) != 0 || sh["vz"].(float64) != -2 || sh["t0"].(float64) != 3.25 || sh["mods"].(map[string]any)["magnet"] != true {
		t.Fatalf("relayed shot %v", sh)
	}
	if sh["ball"].(map[string]any)["sup"] != true {
		t.Fatalf("ball state not relayed %v", sh)
	}
	a.fails(shotMsg(0, 0), "in_flight")            // one ball at a time
	a.fails(resultMsg(0, 1, "rest"), "stale_shot") // wrong shot number
	a.fails(map[string]any{"t": "shot", "seat": 1, "hole": 0, "n": 0, "vx": 1, "vz": 1, "t0": 0, "aim": 0, "power": 0.5, "ball": ball0}, "not_your_seat")
	r := a.ok(resultMsg(0, 0, "rest", "strokes", 99)) // the server counts strokes itself
	if num(r["strokes"]) != 1 || r["done"] != false {
		t.Fatalf("result %v", r)
	}
	res := b.wait("result")
	if num(res["strokes"]) != 1 || res["state"] != "rest" || res["to"].([]any)[2].(float64) != -2 {
		t.Fatalf("relayed result %v", res)
	}
	// out of bounds: +1 and back where it was
	a.ok(shotMsg(0, 1))
	r = a.ok(resultMsg(0, 1, "oob", "to", []float64{0.5, 0.05, -2}))
	if num(r["strokes"]) != 3 {
		t.Fatalf("oob strokes %v", r)
	}
	a.ok(shotMsg(0, 2))
	r = a.ok(resultMsg(0, 2, "cup"))
	if num(r["strokes"]) != 4 || r["done"] != true {
		t.Fatalf("cup %v", r)
	}
	a.fails(shotMsg(0, 3), "hole_done")
	// bob: an ace ends the hole
	b.ok(shotMsg(0, 0))
	b.ok(resultMsg(0, 0, "cup"))
	board := a.waitEv("holeEnd")
	bs := seats(board)
	if board["phase"] != "board" || num(bs[0]["scores"].([]any)[0]) != 4 || num(bs[1]["scores"].([]any)[0]) != 1 {
		t.Fatalf("board %v", board)
	}
	b.waitEv("holeEnd")
	if board["nextAt"].(float64) <= board["now"].(float64) {
		t.Fatalf("no next countdown %v", board)
	}
	// both tap Next → hole 2
	a.ok(map[string]any{"t": "next"})
	b.ok(map[string]any{"t": "next"})
	if r := a.waitEv("holeStart"); num(r["hole"]) != 1 {
		t.Fatalf("hole 2 %v", r)
	}
	a.fails(shotMsg(0, 0), "stale_hole")
	// hole 2: nobody taps Next on the board, it advances after boardSecs
	for _, c := range []*client{a, b} {
		c.ok(shotMsg(1, 0))
		c.ok(resultMsg(1, 0, "cup"))
	}
	a.waitEv("holeEnd")
	advance(boardSecs + time.Second)
	tick()
	if r := a.waitEv("holeStart"); num(r["hole"]) != 2 {
		t.Fatalf("hole 3 %v", r)
	}
	// hole 3: alice holes in 2, bob picks up at par + 4 (= 7 on a par 3)
	a.ok(shotMsg(2, 0))
	a.ok(resultMsg(2, 0, "rest"))
	a.ok(shotMsg(2, 1))
	a.ok(resultMsg(2, 1, "cup"))
	for n := 0; n < 7; n++ {
		b.ok(shotMsg(2, n))
		r := b.ok(resultMsg(2, n, "rest"))
		if n == 6 && (r["done"] != true || r["picked"] != true || num(r["strokes"]) != 7) {
			t.Fatalf("pick up %v", r)
		}
	}
	end := a.waitEv("end")
	if end["state"] != "ended" || end["roundId"] == "" {
		t.Fatalf("end %v", end)
	}
	es := seats(end)
	if num(es[0]["total"]) != 4+1+2 || num(es[1]["total"]) != 1+1+7 {
		t.Fatalf("totals %v", es)
	}
	// stored, and served over HTTP
	resp, err := http.Get(ts.URL + "/gms/3d/skyputt/api/rounds/" + end["roundId"].(string))
	if err != nil || resp.StatusCode != 200 {
		t.Fatalf("round http: %v %v", err, resp)
	}
	body, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(body), `"Alice"`) || !strings.Contains(string(body), `"rank":1`) {
		t.Fatalf("round body %s", body)
	}
	// play again → lobby with both
	b.fails(map[string]any{"t": "again"}, "not_host")
	r = a.ok(map[string]any{"t": "again"})["room"].(map[string]any)
	if r["state"] != "lobby" || len(seats(r)) != 2 {
		t.Fatalf("again %v", r)
	}
}

func TestMulligan(t *testing.T) {
	resetWorld(t)
	a, b, _ := twoUp(t, opts()) // fixed: 1 of each
	a.ok(map[string]any{"t": "start"})
	a.waitEv("holeStart")
	a.fails(map[string]any{"t": "mulligan", "hole": 0}, "not_now") // nothing to undo
	a.ok(shotMsg(0, 0))
	a.ok(resultMsg(0, 0, "oob", "to", []float64{0, 0.05, 0}))
	r := a.ok(map[string]any{"t": "mulligan", "hole": 0})
	if num(r["strokes"]) != 0 || r["to"] != nil {
		t.Fatalf("mulligan %v", r)
	}
	m := b.wait("mulligan")
	if num(m["seat"]) != 0 || num(m["strokes"]) != 0 {
		t.Fatalf("relayed mulligan %v", m)
	}
	a.ok(shotMsg(0, 1))
	a.ok(resultMsg(0, 1, "rest"))
	a.fails(map[string]any{"t": "mulligan", "hole": 0}, "no_helpers_left") // only 1 in fixed mode
}

func TestHelperModes(t *testing.T) {
	resetWorld(t)
	a, _, _ := twoUp(t, opts("helpers", map[string]any{"mode": "off"}))
	a.ok(map[string]any{"t": "start"})
	a.waitEv("holeStart")
	a.fails(shotMsg(0, 0, "mods", map[string]any{"magnet": true}), "no_helpers")
	a.fails(shotMsg(0, 0, "mods", map[string]any{"sight": 1}), "no_helpers")
	a.ok(shotMsg(0, 0))

	resetWorld(t)
	a, _, _ = twoUp(t, opts("helpers", map[string]any{"mode": "fixed", "n": 2}))
	a.ok(map[string]any{"t": "start"})
	a.waitEv("holeStart")
	a.ok(shotMsg(0, 0, "mods", map[string]any{"sight": 2}))
	a.ok(resultMsg(0, 0, "rest"))
	a.fails(shotMsg(0, 1, "mods", map[string]any{"sight": 1}), "no_helpers_left")
	a.ok(shotMsg(0, 1, "mods", map[string]any{"ghost": true, "power": true}))
	r := a.ok(map[string]any{"t": "room"})["room"].(map[string]any)
	uses := seats(r)[0]["uses"].(map[string]any)
	if num(uses["longSight"]) != 2 || num(uses["ghost"]) != 1 || num(uses["power"]) != 1 {
		t.Fatalf("uses %v", uses)
	}
}

func TestAIFill(t *testing.T) {
	resetWorld(t)
	a, b, _ := twoUp(t, opts("max", 5, "ai", map[string]any{"count": 7, "personality": "carl", "skill": 0.99}))
	a.ok(map[string]any{"t": "start"})
	r := a.waitEv("holeStart")
	ss := seats(r)
	if len(ss) != 5 {
		t.Fatalf("want 2 humans + 3 AIs, got %d", len(ss))
	}
	names := map[string]bool{}
	for _, s := range ss[2:] {
		ai := s["ai"].(map[string]any)
		if s["kind"] != "ai" || s["ctrl"] != "ai" || ai["personality"] != "carl" || ai["skill"].(float64) != 0.9 {
			t.Fatalf("ai seat %v", s)
		}
		names[s["name"].(string)] = true
	}
	if len(names) != 3 || !names["Careful Carl"] || !names["Careful Carl 2"] {
		t.Fatalf("ai names %v", names)
	}
	// only the host drives AI seats
	b.fails(shotMsg(0, 0, "seat", 2), "not_your_seat")
	a.ok(shotMsg(0, 0, "seat", 2))
	if sh := b.wait("shot"); num(sh["seat"]) != 2 {
		t.Fatalf("ai shot relay %v", sh)
	}
	a.ok(resultMsg(0, 0, "cup", "seat", 2))
	// mixed personalities: "any"
	resetWorld(t)
	a, _, _ = twoUp(t, opts("max", 8, "ai", map[string]any{"count": 6, "personality": "any", "skill": 0.5}))
	a.ok(map[string]any{"t": "start"})
	ss = seats(a.waitEv("holeStart"))
	kinds := map[string]bool{}
	for _, s := range ss[2:] {
		ai := s["ai"].(map[string]any)
		kinds[ai["personality"].(string)] = true
		if sk := ai["skill"].(float64); sk < 0.4 || sk > 0.6 {
			t.Fatalf("mixed skill %v", sk)
		}
	}
	if len(ss) != 8 || len(kinds) < 4 || kinds["mags"] {
		t.Fatalf("mixed field %v", kinds)
	}
}

func TestRejoinAndTakeover(t *testing.T) {
	resetWorld(t)
	a, b, code := twoUp(t, opts())
	a.ok(map[string]any{"t": "start"})
	a.waitEv("holeStart")
	b.ok(shotMsg(0, 0))
	b.ok(resultMsg(0, 0, "rest"))
	b.ok(shotMsg(0, 1)) // drops with a ball in the air
	b.drop()
	r := a.take("bob offline", func(m map[string]any) bool {
		return m["t"] == "room" && seats(m["room"].(map[string]any))[1]["online"] == false
	})["room"].(map[string]any)
	if seats(r)[1]["ctrl"] != "human" {
		t.Fatalf("takeover too early %v", seats(r)[1])
	}
	advance(takeoverAfter + time.Second)
	tick()
	v := a.take("void", func(m map[string]any) bool { return m["t"] == "result" && m["state"] == "void" })
	if num(v["seat"]) != 1 || num(v["strokes"]) != 1 {
		t.Fatalf("void %v", v)
	}
	r = a.take("takeover", func(m map[string]any) bool {
		return m["t"] == "room" && seats(m["room"].(map[string]any))[1]["ctrl"] == "ai"
	})["room"].(map[string]any)
	if seats(r)[1]["ai"] == nil {
		t.Fatalf("no ai spec on takeover %v", seats(r)[1])
	}
	// the host drives bob's seat now (shot number moved on past the voided one)
	a.fails(shotMsg(0, 1, "seat", 1), "stale_shot")
	a.ok(shotMsg(0, 2, "seat", 1))
	a.ok(resultMsg(0, 2, "rest", "seat", 1))
	// bob comes back: welcome carries the room, his seat and where his ball is
	b2 := dial(t, "bob", "Bob")
	wr := b2.welcome["room"].(map[string]any)
	if wr["code"] != code || num(wr["you"]) != 1 || wr["state"] != "playing" {
		t.Fatalf("rejoin welcome %v", wr)
	}
	me := seats(wr)[1]
	if me["ctrl"] != "human" || num(me["cur"].(map[string]any)["strokes"]) != 2 || num(me["cur"].(map[string]any)["n"]) != 3 {
		t.Fatalf("rejoin seat %v", me)
	}
	a.fails(shotMsg(0, 3, "seat", 1), "not_your_seat")
	b2.ok(shotMsg(0, 3))
}

func TestHostMigration(t *testing.T) {
	resetWorld(t)
	a, b, _ := twoUp(t, opts("ai", map[string]any{"count": 1, "personality": "pro", "skill": 0.5}))
	a.ok(map[string]any{"t": "start"})
	b.waitEv("holeStart")
	a.ok(shotMsg(0, 0, "seat", 2)) // the host's AI putts…
	b.wait("shot")
	a.drop() // …and the host vanishes
	advance(hostGrace + time.Second)
	tick()
	v := b.take("void ai shot", func(m map[string]any) bool { return m["t"] == "result" && m["state"] == "void" })
	if num(v["seat"]) != 2 {
		t.Fatalf("void %v", v)
	}
	r := b.take("new host", func(m map[string]any) bool { return m["t"] == "room" && num(m["room"].(map[string]any)["host"]) == 1 })["room"].(map[string]any)
	if num(r["you"]) != 1 {
		t.Fatalf("migration %v", r)
	}
	b.ok(shotMsg(0, 1, "seat", 2)) // bob drives the AI now
	b.ok(resultMsg(0, 1, "cup", "seat", 2))
	// alice gone long enough → an AI plays her ball; once every seat is done the hole ends
	advance(takeoverAfter)
	tick()
	b.ok(shotMsg(0, 0, "seat", 0))
	b.ok(resultMsg(0, 0, "cup", "seat", 0))
	b.ok(shotMsg(0, 0))
	b.ok(resultMsg(0, 0, "cup"))
	if r := b.waitEv("holeEnd"); num(seats(r)[0]["scores"].([]any)[0]) != 1 {
		t.Fatalf("hole end %v", r)
	}
	// alice comes back mid-round: still in the room, not host any more
	a2 := dial(t, "alice", "Alice")
	wr := a2.welcome["room"].(map[string]any)
	if num(wr["host"]) != 1 || num(wr["you"]) != 0 || seats(wr)[0]["ctrl"] != "human" {
		t.Fatalf("alice back %v", wr)
	}
}

func TestLeaveMidRound(t *testing.T) {
	resetWorld(t)
	a, b, _ := twoUp(t, opts())
	a.ok(map[string]any{"t": "start"})
	a.waitEv("holeStart")
	a.ok(map[string]any{"t": "leaveRoom"}) // host quits mid-round
	r := b.take("after leave", func(m map[string]any) bool { return m["t"] == "room" && num(m["room"].(map[string]any)["host"]) == 1 })["room"].(map[string]any)
	s := seats(r)[0]
	if s["left"] != true || s["ctrl"] != "ai" {
		t.Fatalf("left seat %v", s)
	}
	b.ok(shotMsg(0, 0, "seat", 0))
	// alice can't rejoin a seat she left
	a.fails(map[string]any{"t": "joinRoom", "code": r["code"]}, "in_play")
}

func TestHoleCapAndShotClock(t *testing.T) {
	resetWorld(t)
	a, _, _ := twoUp(t, opts("shotClock", 20))
	a.ok(map[string]any{"t": "start"})
	a.waitEv("holeStart")
	a.ok(shotMsg(0, 0))
	a.ok(resultMsg(0, 0, "cup"))
	advance(time.Duration(20+15)*time.Second*6 + 31*time.Second + holeDelay)
	tick()
	r := a.waitEv("holeEnd")
	bob := seats(r)[1]
	if num(bob["scores"].([]any)[0]) != 6 || bob["picked"].([]any)[0] != true {
		t.Fatalf("cap pick-up %v", bob)
	}
}

func TestStaleFlightVoided(t *testing.T) {
	resetWorld(t)
	a, b, _ := twoUp(t, opts())
	a.ok(map[string]any{"t": "start"})
	a.waitEv("holeStart")
	a.ok(shotMsg(0, 0))
	advance(flightTimeout + time.Second)
	tick()
	if v := b.take("void", func(m map[string]any) bool { return m["t"] == "result" && m["state"] == "void" }); num(v["strokes"]) != 0 {
		t.Fatalf("void %v", v)
	}
	a.fails(resultMsg(0, 0, "rest"), "stale_shot") // too late
	a.ok(shotMsg(0, 1))
}

func TestQuickPlay(t *testing.T) {
	resetWorld(t)
	a := dial(t, "alice", "Alice")
	b := dial(t, "bob", "Bob")
	ra := a.ok(map[string]any{"t": "quick", "opts": opts("max", 4)})["room"].(map[string]any)
	if ra["quick"] != true || ra["opts"].(map[string]any)["public"] != true || ra["startAt"].(float64) == 0 {
		t.Fatalf("quick room %v", ra)
	}
	if l := b.ok(map[string]any{"t": "lobby"})["lobby"].(map[string]any); len(l["rooms"].([]any)) != 1 {
		t.Fatalf("quick room not listed %v", l)
	}
	rb := b.ok(map[string]any{"t": "quick", "opts": opts("max", 6)})["room"].(map[string]any)
	if rb["code"] != ra["code"] || num(rb["you"]) != 1 {
		t.Fatalf("bob should join alice's quick room: %v", rb)
	}
	if a2 := a.ok(map[string]any{"t": "quick", "opts": opts()})["room"].(map[string]any); a2["code"] != ra["code"] {
		t.Fatal("quick again should keep the room")
	}
	tick()
	if hub.rooms[ra["code"].(string)].State != "lobby" {
		t.Fatal("started too early")
	}
	advance(quickWait + time.Second)
	tick()
	r := a.waitEv("holeStart")
	ss := seats(r)
	if len(ss) != 4 || ss[2]["kind"] != "ai" || ss[3]["kind"] != "ai" {
		t.Fatalf("quick fill %v", ss)
	}
	// a full quick room starts at once
	resetWorld(t)
	cs := []*client{}
	for i := 0; i < 2; i++ {
		c := dial(t, fmt.Sprintf("q%d", i), fmt.Sprintf("Q%d", i))
		c.ok(map[string]any{"t": "quick", "opts": opts("max", 2)})
		cs = append(cs, c)
	}
	if r := cs[0].waitEv("holeStart"); len(seats(r)) != 2 {
		t.Fatalf("full quick room %v", r)
	}
}

func TestPublicRoomCaps(t *testing.T) {
	resetWorld(t)
	maxPublicRoomsPerIP = 1
	a := dial(t, "alice", "Alice")
	b := dial(t, "bob", "Bob")
	a.ok(map[string]any{"t": "createRoom", "opts": opts("public", true)})
	b.fails(map[string]any{"t": "createRoom", "opts": opts("public", true)}, "too_many_rooms") // same IP (loopback)
	b.ok(map[string]any{"t": "createRoom", "opts": opts()})                                    // private is fine
	putSetting("paused", "1")
	b.fails(map[string]any{"t": "createRoom", "opts": opts()}, "paused")
	putSetting("paused", "0")
}

func TestEmptyRoomsClose(t *testing.T) {
	resetWorld(t)
	a, b, code := twoUp(t, opts())
	a.ok(map[string]any{"t": "start"})
	a.drop()
	b.drop()
	tick()
	advance(playEmpty + time.Second)
	tick()
	hub.mu.Lock()
	defer hub.mu.Unlock()
	if hub.rooms[code] != nil {
		t.Fatal("abandoned room still open")
	}
}

func TestHTTP(t *testing.T) {
	resetWorld(t)
	for _, p := range []string{"/gms/3d/skyputt/api/health", "/api/health", "/gms/3d/skyputt/api/status", "/gms/3d/skyputt/api/rooms"} {
		resp, err := http.Get(ts.URL + p)
		if err != nil || resp.StatusCode != 200 {
			t.Fatalf("%s: %v %v", p, err, resp)
		}
	}
	req, _ := http.NewRequest("GET", ts.URL+"/gms/3d/skyputt/api/rooms", nil)
	req.Header.Set("Origin", "https://evil.example")
	if resp, _ := http.DefaultClient.Do(req); resp.StatusCode != 403 {
		t.Fatalf("foreign origin: %d", resp.StatusCode)
	}
	req.Header.Set("Origin", "https://y-r-u.github.io")
	if resp, _ := http.DefaultClient.Do(req); resp.Header.Get("Access-Control-Allow-Origin") != "https://y-r-u.github.io" {
		t.Fatal("CORS header missing")
	}
	// hello must come first and the token must verify
	u := "ws" + strings.TrimPrefix(ts.URL, "http") + "/gms/3d/skyputt/api/ws"
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	c, _, err := websocket.Dial(ctx, u, nil)
	if err != nil {
		t.Fatal(err)
	}
	c.Write(ctx, websocket.MessageText, []byte(`{"t":"hello","id":1,"token":"not-a-jwt"}`))
	_, msg, _ := c.Read(ctx)
	if !strings.Contains(string(msg), "bad_token") {
		t.Fatalf("bad token: %s", msg)
	}
}

func TestReloadMidShotVoidsAtOnce(t *testing.T) {
	resetWorld(t)
	a, b, _ := twoUp(t, opts())
	a.ok(map[string]any{"t": "start"})
	a.waitEv("holeStart")
	b.ok(shotMsg(0, 0))
	b.drop() // page reloaded while the ball was rolling
	b2 := dial(t, "bob", "Bob")
	if v := a.take("void on reconnect", func(m map[string]any) bool { return m["t"] == "result" && m["state"] == "void" }); num(v["seat"]) != 1 || num(v["strokes"]) != 0 {
		t.Fatalf("void %v", v)
	}
	me := seats(b2.welcome["room"].(map[string]any))[1]["cur"].(map[string]any)
	if me["flying"] != false || num(me["n"]) != 1 || num(me["strokes"]) != 0 {
		t.Fatalf("seat after reconnect %v", me)
	}
	b2.ok(shotMsg(0, 1)) // can putt again straight away
}

// Ball hits (notes/ballhit.md): the shooter relays the balls it simulated against and reports
// where it left them; the server moves a knocked ball only if it hasn't moved since the shot.
func TestBallHits(t *testing.T) {
	resetWorld(t)
	a, b, _ := twoUp(t, opts("collide", true, "max", 3))
	a.ok(map[string]any{"t": "start"})
	r := a.waitEv("holeStart")
	b.waitEv("holeStart")
	if r["opts"].(map[string]any)["collide"] != true {
		t.Fatalf("collide not in room opts %v", r["opts"])
	}
	// bob plays off the tee first and rests at z = -2
	b.ok(shotMsg(0, 0))
	b.ok(resultMsg(0, 0, "rest"))
	a.drain()
	b.drain()
	// alice putts at bob's ball: the relay carries the ball list (bad entries dropped)
	bobBall := map[string]any{"seat": 1, "n": 1, "x": 0.5, "y": 0.05, "z": -2}
	a.ok(shotMsg(0, 0, "balls", []map[string]any{bobBall, {"seat": 0, "n": 0, "x": 0, "y": 0, "z": 0}, {"seat": 9, "n": 0, "x": 0, "y": 0, "z": 0}}))
	sh := b.wait("shot")
	bl, _ := sh["balls"].([]any)
	if len(bl) != 1 || num(bl[0].(map[string]any)["seat"]) != 1 {
		t.Fatalf("relayed balls %v", sh["balls"])
	}
	// alice reports: her ball rests, bob's was knocked to z = -3.1
	res := a.ok(resultMsg(0, 0, "rest", "knocks", []map[string]any{{"seat": 1, "state": "rest", "to": []float64{0.4, 0.05, -3.1}}}))
	if ks, _ := res["knocks"].([]any); len(ks) != 1 {
		t.Fatalf("knocks in reply %v", res)
	}
	k := b.wait("knock")
	if num(k["seat"]) != 1 || num(k["by"]) != 0 || num(k["n"]) != 2 || k["to"].([]any)[2].(float64) != -3.1 || num(k["strokes"]) != 1 {
		t.Fatalf("knock event %v", k)
	}
	a.wait("knock") // the shooter hears it too
	// bob's old shot number is stale now; his position moved; no penalty, no Mulligan of the old shot
	b.fails(shotMsg(0, 1), "stale_shot")
	b.fails(map[string]any{"t": "mulligan", "hole": 0}, "not_now")
	// a knock on a ball that moved since (bob shot in between) is dropped; his own shot wins
	a.ok(shotMsg(0, 1, "balls", []map[string]any{{"seat": 1, "n": 2, "x": 0.4, "y": 0.05, "z": -3.1}}))
	b.ok(shotMsg(0, 2))
	b.ok(resultMsg(0, 2, "rest", "to", []float64{0.1, 0.05, -5}))
	res = a.ok(resultMsg(0, 1, "rest", "knocks", []map[string]any{{"seat": 1, "state": "cup"}}))
	if ks, _ := res["knocks"].([]any); len(ks) != 0 {
		t.Fatalf("stale knock applied %v", res)
	}
	// knocked into the cup: holed for its owner at his current strokes (2)
	b.drain()
	a.ok(shotMsg(0, 2, "balls", []map[string]any{{"seat": 1, "n": 3, "x": 0.1, "y": 0.05, "z": -5}}))
	a.ok(resultMsg(0, 2, "rest", "knocks", []map[string]any{{"seat": 1, "state": "cup"}}))
	k = b.wait("knock")
	if k["state"] != "cup" || k["done"] != true || k["picked"] != false || num(k["strokes"]) != 2 {
		t.Fatalf("knocked in %v", k)
	}
	b.fails(shotMsg(0, 3), "hole_done")
}

// Knocked out of bounds: back where it was, +1 to its owner (not the shooter); a knock on a ball not in the shot's list is ignored.
func TestBallHitsOOB(t *testing.T) {
	resetWorld(t)
	a, b, _ := twoUp(t, opts("collide", true))
	a.ok(map[string]any{"t": "start"})
	a.waitEv("holeStart")
	b.ok(shotMsg(0, 0))
	b.ok(resultMsg(0, 0, "rest"))
	b.drain()
	a.ok(shotMsg(0, 0, "balls", []map[string]any{{"seat": 1, "n": 1, "x": 0.5, "y": 0.05, "z": -2}}))
	a.ok(resultMsg(0, 0, "rest", "knocks", []map[string]any{{"seat": 1, "state": "oob"}}))
	k := b.wait("knock")
	if k["state"] != "oob" || num(k["strokes"]) != 2 || k["to"].([]any)[2].(float64) != -2 {
		t.Fatalf("oob knock: back to his spot and +1 to Bob %v", k)
	}
	if r := b.ok(shotMsg(0, 2)); r["t"] != "ok" { // bob plays on from his old spot at shot 2
		t.Fatalf("%v", r)
	}
	if r := b.ok(resultMsg(0, 2, "rest")); num(r["strokes"]) != 3 {
		t.Fatalf("bob's strokes after the knock-out penalty %v", r)
	}
	a.ok(shotMsg(0, 1))
	if r := a.ok(resultMsg(0, 1, "rest", "knocks", []map[string]any{{"seat": 1, "state": "cup"}})); len(r["knocks"].([]any)) != 0 {
		t.Fatalf("knock without a ball ref applied %v", r)
	}
}

func TestBallHitsOff(t *testing.T) {
	resetWorld(t)
	a, b, _ := twoUp(t, opts()) // collide not set = off (older clients)
	a.ok(map[string]any{"t": "start"})
	a.waitEv("holeStart")
	b.ok(shotMsg(0, 0))
	b.ok(resultMsg(0, 0, "rest"))
	b.drain()
	a.ok(shotMsg(0, 0, "balls", []map[string]any{{"seat": 1, "n": 1, "x": 0.5, "y": 0.05, "z": -2}}))
	if sh := b.wait("shot"); sh["balls"] != nil {
		t.Fatalf("balls relayed with ball hits off %v", sh)
	}
	res := a.ok(resultMsg(0, 0, "rest", "knocks", []map[string]any{{"seat": 1, "state": "cup"}}))
	if ks, _ := res["knocks"].([]any); len(ks) != 0 {
		t.Fatalf("knock applied with ball hits off %v", res)
	}
	b.ok(shotMsg(0, 1)) // bob's shot number untouched
}
