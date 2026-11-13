package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"
)

const tSim, tMap = "simv1", "mapv1"

var clock struct {
	sync.Mutex
	off time.Duration
}

func testNow() time.Time {
	clock.Lock()
	defer clock.Unlock()
	return time.Now().Add(clock.off)
}

func advance(d time.Duration) {
	clock.Lock()
	clock.off += d
	clock.Unlock()
}

func TestMain(m *testing.M) {
	dir, _ := os.MkdirTemp("", "throng-test-")
	os.Setenv("THRONG_DATA", dir)
	loadConfig()
	cfg.QuickWait = 300 * time.Millisecond
	openDB(dir + "/t.db")
	nowFn = testNow
	code := m.Run()
	os.RemoveAll(dir)
	os.Exit(code)
}

type tc struct {
	t    *testing.T
	c    *websocket.Conn
	mu   sync.Mutex
	msgs []map[string]any
	bins [][]byte
	id   int64
	you  string
	done chan struct{}
	code websocket.StatusCode
}

func newServer(t *testing.T) *httptest.Server {
	time.Sleep(100 * time.Millisecond) // let the previous test's sockets finish closing
	hub = newHub()
	resetLimits()
	db.Exec(`DELETE FROM results`)
	db.Exec(`DELETE FROM alltime`)
	db.Exec(`DELETE FROM alltime_mode`)
	s := httptest.NewServer(routes())
	t.Cleanup(s.Close)
	return s
}

func dial(t *testing.T, s *httptest.Server, name string, hello map[string]any) *tc {
	t.Helper()
	u := "ws" + strings.TrimPrefix(s.URL, "http") + "/gms/3d/throng/api/ws"
	c, _, err := websocket.Dial(context.Background(), u, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	c.SetReadLimit(1 << 20)
	x := &tc{t: t, c: c, done: make(chan struct{}), code: -1}
	go func() {
		defer close(x.done)
		for {
			typ, b, err := c.Read(context.Background())
			if err != nil {
				x.mu.Lock()
				x.code = websocket.CloseStatus(err)
				x.mu.Unlock()
				return
			}
			x.mu.Lock()
			if typ == websocket.MessageBinary {
				x.bins = append(x.bins, b)
			} else {
				var m map[string]any
				json.Unmarshal(b, &m)
				x.msgs = append(x.msgs, m)
			}
			x.mu.Unlock()
		}
	}()
	h := map[string]any{"t": "hello", "v": protocolVersion, "sim": tSim, "map": tMap, "dev": fmt.Sprintf("%032x", len(name)*7919+int(name[0])), "cid": "cid-" + name + "-xxxxxx", "name": name}
	for k, v := range hello {
		h[k] = v
	}
	x.send(h)
	if hello["v"] == nil && hello["dev"] != "bad" {
		w := x.wait("welcome")
		x.you = w["you"].(map[string]any)["id"].(string)
	}
	t.Cleanup(func() { c.CloseNow() })
	return x
}

func (x *tc) send(m map[string]any) {
	b, _ := json.Marshal(m)
	x.c.Write(context.Background(), websocket.MessageText, b)
}

func (x *tc) bin(b []byte) { x.c.Write(context.Background(), websocket.MessageBinary, b) }

func (x *tc) req(m map[string]any) map[string]any {
	x.id++
	m["id"] = x.id
	x.send(m)
	return x.waitf(func(r map[string]any) bool {
		v, _ := r["id"].(float64)
		return int64(v) == x.id && (r["t"] == "ok" || r["t"] == "error")
	}, "reply to "+m["t"].(string))
}

func (x *tc) waitf(f func(map[string]any) bool, what string) map[string]any {
	x.t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		x.mu.Lock()
		for i, m := range x.msgs {
			if f(m) {
				x.msgs = append(x.msgs[:i:i], x.msgs[i+1:]...)
				x.mu.Unlock()
				return m
			}
		}
		x.mu.Unlock()
		time.Sleep(5 * time.Millisecond)
	}
	x.t.Fatalf("timed out waiting for %s", what)
	return nil
}

func (x *tc) wait(t string) map[string]any {
	x.t.Helper()
	return x.waitf(func(m map[string]any) bool { return m["t"] == t }, t)
}

func (x *tc) has(t string) bool {
	x.mu.Lock()
	defer x.mu.Unlock()
	for _, m := range x.msgs {
		if m["t"] == t {
			return true
		}
	}
	return false
}

func (x *tc) binCount() int {
	x.mu.Lock()
	defer x.mu.Unlock()
	return len(x.bins)
}

func (x *tc) waitBins(n int) [][]byte {
	x.t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		x.mu.Lock()
		if len(x.bins) >= n {
			out := append([][]byte(nil), x.bins...)
			x.mu.Unlock()
			return out
		}
		x.mu.Unlock()
		time.Sleep(5 * time.Millisecond)
	}
	x.t.Fatalf("timed out waiting for %d binary frames (have %d)", n, x.binCount())
	return nil
}

func snap(kind byte, tick int) []byte {
	b := make([]byte, 40)
	b[0] = kind
	b[2] = byte(tick >> 24)
	b[3] = byte(tick >> 16)
	b[4] = byte(tick >> 8)
	b[5] = byte(tick)
	return b
}

func meta(ids ...string) map[string]any {
	ps := []map[string]any{}
	for i := 0; i < 8; i++ {
		id := ""
		if i < len(ids) {
			id = ids[i]
		}
		ps = append(ps, map[string]any{"name": fmt.Sprintf("p%d", i), "id": id})
	}
	return map[string]any{"seed": "1", "duration": 120, "countdown": 3, "players": ps}
}

func settleTicks(n int) {
	for i := 0; i < n; i++ {
		hub.tick()
	}
}

// ---------------------------------------------------------------- tests

func TestVersionGate(t *testing.T) {
	s := newServer(t)
	old := dial(t, s, "old", map[string]any{"v": 99})
	e := old.wait("error")
	if e["code"] != "old_client" {
		t.Fatalf("want old_client, got %v", e)
	}
	<-old.done
	if old.code != 4002 {
		t.Fatalf("want close 4002, got %d", old.code)
	}
	bad := dial(t, s, "bad", map[string]any{"dev": "bad", "v": protocolVersion})
	<-bad.done
	if bad.code != 4001 {
		t.Fatalf("bad hello: want close 4001, got %d", bad.code)
	}
	a := dial(t, s, "alice", nil)
	room := a.req(map[string]any{"t": "create"})["room"].(map[string]any)
	other := dial(t, s, "zed", map[string]any{"sim": "othersim"})
	r := other.req(map[string]any{"t": "join", "code": room["code"]})
	if r["code"] != "version_mismatch" {
		t.Fatalf("join from another build: want version_mismatch, got %v", r)
	}
	q1 := a.req(map[string]any{"t": "quick"})["room"].(map[string]any)
	q2 := other.req(map[string]any{"t": "quick"})["room"].(map[string]any)
	if q1["code"] == q2["code"] {
		t.Fatalf("quick match mixed two builds in room %v", q1["code"])
	}
}

func TestRoomFlowRelayLateJoinMigration(t *testing.T) {
	s := newServer(t)
	h, g := dial(t, s, "host", nil), dial(t, s, "guest", nil)
	room := h.req(map[string]any{"t": "create"})["room"].(map[string]any)
	code := room["code"].(string)
	if r := g.req(map[string]any{"t": "join", "code": strings.ToLower(code)}); r["t"] != "ok" {
		t.Fatalf("join: %v", r)
	}
	if r := g.req(map[string]any{"t": "begin", "meta": meta(g.you)}); r["code"] != "not_now" {
		t.Fatalf("a guest began the match: %v", r)
	}
	if r := h.req(map[string]any{"t": "begin", "meta": meta(h.you, g.you)}); r["t"] != "ok" {
		t.Fatalf("begin: %v", r)
	}
	bh, bg := h.wait("begin"), g.wait("begin")
	if bh["crowd"].(float64) != 0 || bg["crowd"].(float64) != 1 {
		t.Fatalf("crowds: host %v guest %v", bh["crowd"], bg["crowd"])
	}
	// relay: key + deltas host → guest; a guest's snapshot is not relayed; inputs guest → host with its crowd
	h.bin(snap(2, 10))
	h.bin(snap(1, 12))
	g.bin(snap(1, 99))
	g.bin([]byte{3, 0, 7, 50, 206})
	bins := g.waitBins(2)
	time.Sleep(50 * time.Millisecond)
	if g.binCount() != 2 || bins[0][0] != 2 || bins[1][0] != 1 {
		t.Fatalf("guest got %d frames", g.binCount())
	}
	in := h.waitBins(1)
	if len(in[0]) != 6 || in[0][0] != 3 || in[0][1] != 1 || in[0][3] != 7 {
		t.Fatalf("forwarded input: %v", in[0])
	}
	// late join: the host is asked, assigns a bot crowd, the joiner gets begin(late) + key + tail
	l := dial(t, s, "late", nil)
	l.req(map[string]any{"t": "join", "code": code})
	want := h.wait("want")
	if want["who"] != l.you {
		t.Fatalf("want: %v", want)
	}
	h.send(map[string]any{"t": "assign", "who": l.you, "crowd": 1}) // taken: ignored
	h.send(map[string]any{"t": "assign", "who": l.you, "crowd": 5})
	bl := l.wait("begin")
	if bl["late"] != true || bl["crowd"].(float64) != 5 {
		t.Fatalf("late begin: %v", bl)
	}
	if lb := l.waitBins(2); lb[0][0] != 2 || lb[1][0] != 1 {
		t.Fatalf("late joiner replay: %v", len(lb))
	}
	// host vanishes (no close frame): after the grace the longest-standing guest is promoted with the replay
	h.bin(snap(1, 14))
	g.waitBins(3)
	gBefore := g.binCount()
	h.c.CloseNow()
	<-h.done
	time.Sleep(50 * time.Millisecond)
	settleTicks(1)
	if g.has("promote") {
		t.Fatalf("promoted before the host grace")
	}
	advance(hostGrace*time.Millisecond + 100*time.Millisecond)
	settleTicks(1)
	p := g.wait("promote")
	if p["epoch"].(float64) != 1 {
		t.Fatalf("promote epoch: %v", p)
	}
	away := p["away"].([]any)
	if len(away) != 1 || away[0].(float64) != 0 {
		t.Fatalf("away crowds: %v", away)
	}
	if n := g.waitBins(gBefore + 3); n[gBefore][0] != 2 {
		t.Fatalf("promotion replay must start with the keyframe")
	}
	// the new host's snapshots now reach the late joiner; the old host's would not
	lBefore := l.binCount()
	g.bin(snap(2, 20))
	l.waitBins(lBefore + 1)
}

func TestGracefulHostLeaveMigratesAtOnce(t *testing.T) {
	s := newServer(t)
	h, g := dial(t, s, "host", nil), dial(t, s, "guest", nil)
	code := h.req(map[string]any{"t": "create"})["room"].(map[string]any)["code"]
	g.req(map[string]any{"t": "join", "code": code})
	h.req(map[string]any{"t": "begin", "meta": meta(h.you, g.you)})
	g.wait("begin")
	h.bin(snap(2, 2))
	g.waitBins(1)
	h.c.Close(websocket.StatusGoingAway, "tab closed")
	g.wait("promote")
}

func TestHostSilenceMigrates(t *testing.T) {
	s := newServer(t)
	h, g := dial(t, s, "host", nil), dial(t, s, "guest", nil)
	code := h.req(map[string]any{"t": "create"})["room"].(map[string]any)["code"]
	g.req(map[string]any{"t": "join", "code": code})
	h.req(map[string]any{"t": "begin", "meta": meta(h.you, g.you)})
	g.wait("begin")
	h.bin(snap(2, 2))
	g.waitBins(1)
	advance(hostSilence*time.Millisecond + 200*time.Millisecond)
	settleTicks(1)
	g.wait("promote")
	r := h.wait("room")
	for r["room"].(map[string]any)["host"] != g.you {
		r = h.wait("room")
	}
}

func TestQuickMatchLobbyTimer(t *testing.T) {
	s := newServer(t)
	a, b := dial(t, s, "aa", nil), dial(t, s, "bb", nil)
	ra := a.req(map[string]any{"t": "quick"})["room"].(map[string]any)
	rb := b.req(map[string]any{"t": "quick"})["room"].(map[string]any)
	if ra["code"] != rb["code"] {
		t.Fatalf("two quick players in different rooms")
	}
	settleTicks(1)
	if a.has("go") {
		t.Fatalf("go before the lobby wait")
	}
	advance(cfg.QuickWait + 50*time.Millisecond)
	settleTicks(1)
	a.wait("go")
	if b.has("go") {
		t.Fatalf("a guest got go")
	}
}

func TestResultsConfirmedAndBoards(t *testing.T) {
	s := newServer(t)
	h, g := dial(t, s, "Hana", nil), dial(t, s, "Gus", nil)
	code := h.req(map[string]any{"t": "create"})["room"].(map[string]any)["code"]
	g.req(map[string]any{"t": "join", "code": code})
	mid := h.req(map[string]any{"t": "begin", "meta": meta(h.you, g.you)})["mid"]
	g.wait("begin")
	rows := []map[string]any{}
	for i := 0; i < 8; i++ {
		rows = append(rows, map[string]any{"crowd": i, "count": 100 * (8 - i), "best": 120 * (8 - i), "kills": i, "rank": i + 1})
	}
	advance(123 * time.Second)
	h.bin(snap(1, 3600))
	h.send(map[string]any{"t": "result", "mid": mid, "rows": rows})
	time.Sleep(50 * time.Millisecond)
	settleTicks(1)
	if h.has("ended") {
		t.Fatalf("recorded before the guest confirmed")
	}
	g.send(map[string]any{"t": "result", "mid": mid, "rows": rows})
	h.bin(snap(1, 3602))
	time.Sleep(50 * time.Millisecond)
	settleTicks(1)
	e := h.wait("ended")
	if e["recorded"] != true {
		t.Fatalf("not recorded: %v", e)
	}
	res, _ := http.Get(s.URL + "/gms/3d/throng/api/boards?period=day&kind=best&me=" + pidOf(fmt.Sprintf("%032x", len("Gus")*7919+int('G'))))
	var b struct {
		Rows []boardRow     `json:"rows"`
		Me   map[string]any `json:"me"`
	}
	json.NewDecoder(res.Body).Decode(&b)
	if len(b.Rows) != 2 || b.Rows[0].Name != "Hana" || b.Rows[0].Value != 960 || b.Rows[1].Value != 840 {
		t.Fatalf("board: %+v", b.Rows)
	}
	if b.Me == nil || b.Me["rank"].(float64) != 2 {
		t.Fatalf("me row: %v", b.Me)
	}
	res, _ = http.Get(s.URL + "/gms/3d/throng/api/boards?period=all&kind=wins")
	json.NewDecoder(res.Body).Decode(&b)
	if len(b.Rows) != 1 || b.Rows[0].Name != "Hana" || b.Rows[0].Value != 1 {
		t.Fatalf("wins board: %+v", b.Rows)
	}
	// private room is back in its lobby, a second match with a disagreeing guest is not recorded
	h.wait("room")
	mid = h.req(map[string]any{"t": "begin", "meta": meta(h.you, g.you)})["mid"]
	advance(123 * time.Second)
	h.bin(snap(1, 3600))
	h.send(map[string]any{"t": "result", "mid": mid, "rows": rows})
	bad := append([]map[string]any(nil), rows...)
	bad[0] = map[string]any{"crowd": 0, "count": 5, "best": 5000, "kills": 0, "rank": 1}
	g.send(map[string]any{"t": "result", "mid": mid, "rows": bad})
	time.Sleep(50 * time.Millisecond)
	settleTicks(1)
	advance(confirmWait*time.Millisecond + time.Second)
	h.bin(snap(1, 3700))
	time.Sleep(50 * time.Millisecond)
	settleTicks(1)
	if e := h.wait("ended"); e["recorded"] != false {
		t.Fatalf("a disputed result was recorded")
	}
	var n int
	db.QueryRow(`SELECT COUNT(*) FROM results`).Scan(&n)
	if n != 2 {
		t.Fatalf("results rows %d, want 2", n)
	}
}

func TestPlausibility(t *testing.T) {
	r := &Room{Duration: 120, Countdown: 3, BeganAt: 0}
	ok := []ResultRow{{0, 100, 120, 1, 1}, {1, 50, 60, 0, 2}}
	if !plausible(r, ok, 123000) {
		t.Fatal("a normal result was refused")
	}
	if plausible(r, ok, 60000) {
		t.Fatal("a result after 60 s of a 2-minute match was accepted")
	}
	for _, bad := range [][]ResultRow{{{0, 100, 9000, 1, 1}}, {{0, 100, 90, 1, 1}}, {{0, 1, 1, 99, 1}}, {{0, 1, 1, 0, 1}, {1, 1, 1, 0, 1}}, {{9, 1, 1, 0, 1}}} {
		if plausible(r, bad, 123000) {
			t.Fatalf("implausible row accepted: %+v", bad)
		}
	}
	if plausible(&Room{Duration: 20, BeganAt: 0}, ok, 123000) {
		t.Fatal("a 20 s match counted for the boards")
	}
}

func TestRateLimits(t *testing.T) {
	s := newServer(t)
	a := dial(t, s, "flood", nil)
	for i := 0; i < 60; i++ {
		a.send(map[string]any{"t": "ping", "c": i})
	}
	a.waitf(func(m map[string]any) bool { return m["code"] == "rate_limited" }, "rate_limited")
	time.Sleep(100 * time.Millisecond)
	a.mu.Lock()
	pongs := 0
	for _, m := range a.msgs {
		if m["t"] == "pong" {
			pongs++
		}
	}
	a.mu.Unlock()
	if pongs > int(textRate.burst)+2 {
		t.Fatalf("%d pongs for 60 pings", pongs)
	}
	cfg.MaxConnsPerIP = 2
	defer func() { cfg.MaxConnsPerIP = 8 }()
	dial(t, s, "two", nil)
	u := "ws" + strings.TrimPrefix(s.URL, "http") + "/gms/3d/throng/api/ws"
	if _, _, err := websocket.Dial(context.Background(), u, nil); err == nil {
		t.Fatal("third socket from one IP accepted")
	}
}

func TestNamesAndCodes(t *testing.T) {
	for in, want := range map[string]string{"  Bob  ": "Bob", "a​b": "ab", "<b>x</b>": "bx/b", "ThisNameIsWayTooLongForUs": "ThisNameIsWayT"} {
		if got, err := cleanName(in); err != nil || got != want {
			t.Fatalf("cleanName(%q) = %q, %v; want %q", in, got, err, want)
		}
	}
	for _, bad := range []string{"", "   ", "fuck", "Admin", "THRONG staff"} {
		if _, err := cleanName(bad); err == nil {
			t.Fatalf("cleanName(%q) accepted", bad)
		}
	}
	for i := 0; i < 200; i++ {
		if c := newCode(); normCode(strings.ToLower(c)) != c {
			t.Fatalf("code %q does not round-trip", c)
		}
	}
}

func TestCleanCos(t *testing.T) {
	got := string(cleanCos(json.RawMessage(`{"hat":"cowboy","flag":"⭐","ring":"<script>","trail":123,"hatShare":0.6,"evil":"x","leader":"fuck"}`)))
	if got != `{"flag":"⭐","hat":"cowboy","hatShare":0.6}` {
		t.Fatalf("cleanCos: %s", got)
	}
	if cleanCos(json.RawMessage(`[1,2]`)) != nil || cleanCos(json.RawMessage(strings.Repeat(" ", 500))) != nil {
		t.Fatal("cleanCos accepted junk")
	}
	s := newServer(t)
	a := dial(t, s, "cosy", map[string]any{"cos": map[string]any{"hat": "tophat"}})
	room := a.req(map[string]any{"t": "create"})["room"].(map[string]any)
	if c := room["members"].([]any)[0].(map[string]any)["cos"].(map[string]any); c["hat"] != "tophat" {
		t.Fatalf("room member cos: %v", c)
	}
}

// LCS and Infection end when one crowd (or the horde) is left: an early end after 40 s of play is real.
// Every other mode, and a mode the server does not know, still has to run the full clock.
func TestPlausibilityEarlyEndModes(t *testing.T) {
	ok := []ResultRow{{0, 100, 120, 1, 1}, {1, 50, 60, 0, 2}}
	for _, c := range []struct {
		mode     string
		duration float64
		at       int64 // ms after BeganAt
		want     bool
	}{
		{"lcs", 90, 3000 + 72000, true},
		{"lcs", 90, 3000 + 41000, true},
		{"lcs", 90, 3000 + 30000, false},
		{"infection", 120, 3000 + 64000, true},
		{"infection", 120, 3000 + 35000, false},
		{"classic", 120, 3000 + 64000, false},
		{"", 120, 3000 + 64000, false},
		{"teams", 120, 3000 + 64000, false},
		{"koth", 120, 3000 + 64000, false},
		{"bogus", 120, 3000 + 64000, false},
		{"classic", 120, 123000, true},
		{"lcs", 90, 93000, true},
	} {
		r := &Room{Duration: c.duration, Countdown: 3, BeganAt: 1000, Mode: c.mode}
		if got := plausible(r, ok, 1000+c.at); got != c.want {
			t.Errorf("mode %q, %d ms in: plausible = %v, want %v", c.mode, c.at, got, c.want)
		}
	}
}

func TestLobbyModePick(t *testing.T) {
	s := newServer(t)
	h, g := dial(t, s, "Hana", nil), dial(t, s, "Gus", nil)
	code := h.req(map[string]any{"t": "create"})["room"].(map[string]any)["code"]
	g.req(map[string]any{"t": "join", "code": code})
	if r := h.req(map[string]any{"t": "mode", "mode": "koth"}); r["t"] != "ok" {
		t.Fatalf("host mode pick: %v", r)
	}
	seen := g.waitf(func(m map[string]any) bool {
		room, _ := m["room"].(map[string]any)
		return m["t"] == "room" && room != nil && room["mode"] == "koth"
	}, "room with mode koth")
	if seen == nil {
		t.Fatal("guest never saw the mode")
	}
	if r := g.req(map[string]any{"t": "mode", "mode": "lcs"}); r["code"] != "not_now" {
		t.Fatalf("a guest changed the mode: %v", r)
	}
	if r := h.req(map[string]any{"t": "mode", "mode": "darts"}); r["code"] != "bad_request" {
		t.Fatalf("unknown mode accepted: %v", r)
	}
	// a late joiner sees the pick in its join reply
	l := dial(t, s, "Lou", nil)
	if room := l.req(map[string]any{"t": "join", "code": code})["room"].(map[string]any); room["mode"] != "koth" {
		t.Fatalf("join reply mode %v", room["mode"])
	}
	// the pick survives a match: the room is back in its lobby with the same mode
	mid := h.req(map[string]any{"t": "begin", "meta": meta(h.you, g.you, l.you)})["mid"]
	if r := h.req(map[string]any{"t": "mode", "mode": "teams"}); r["code"] != "not_now" {
		t.Fatalf("mode changed mid-match: %v", r)
	}
	time.Sleep(50 * time.Millisecond)
	h.mu.Lock()
	h.msgs = nil
	h.mu.Unlock()
	advance(123 * time.Second)
	h.bin(snap(1, 3600))
	rows := []map[string]any{}
	for i := 0; i < 8; i++ {
		rows = append(rows, map[string]any{"crowd": i, "count": 10 * (8 - i), "best": 10 * (8 - i), "kills": 0, "rank": i + 1})
	}
	for _, x := range []*tc{h, g, l} {
		x.send(map[string]any{"t": "result", "mid": mid, "rows": rows})
	}
	time.Sleep(50 * time.Millisecond)
	settleTicks(1)
	h.wait("ended")
	back := h.waitf(func(m map[string]any) bool {
		room, _ := m["room"].(map[string]any)
		return m["t"] == "room" && room != nil && room["state"] == "lobby"
	}, "room back in lobby")
	if back["room"].(map[string]any)["mode"] != "koth" {
		t.Fatalf("mode after the match: %v", back["room"])
	}
	// quick rooms rotate on a clock: nobody picks
	q := dial(t, s, "Quin", nil)
	q.req(map[string]any{"t": "quick"})
	if r := q.req(map[string]any{"t": "mode", "mode": "koth"}); r["code"] != "not_now" {
		t.Fatalf("mode pick in a quick room: %v", r)
	}
}

func TestWelcomeFeatures(t *testing.T) {
	s := newServer(t)
	u := "ws" + strings.TrimPrefix(s.URL, "http") + "/gms/3d/throng/api/ws"
	c, _, err := websocket.Dial(context.Background(), u, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer c.CloseNow()
	b, _ := json.Marshal(map[string]any{"t": "hello", "v": protocolVersion, "sim": tSim, "map": tMap, "dev": fmt.Sprintf("%032x", 42), "cid": "cid-feat-xxxxxx", "name": "Feat"})
	c.Write(context.Background(), websocket.MessageText, b)
	_, msg, err := c.Read(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	var w struct {
		T    string   `json:"t"`
		Feat []string `json:"feat"`
	}
	json.Unmarshal(msg, &w)
	if w.T != "welcome" || strings.Join(w.Feat, ",") != "mode,boards-mode" {
		t.Fatalf("welcome %s", msg)
	}
}

func board(t *testing.T, s *httptest.Server, q string) (int, []boardRow) {
	t.Helper()
	res, err := http.Get(s.URL + "/gms/3d/throng/api/boards?" + q)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	var b struct {
		Rows []boardRow `json:"rows"`
	}
	json.NewDecoder(res.Body).Decode(&b)
	return res.StatusCode, b.Rows
}

func TestBoardsPerMode(t *testing.T) {
	s := newServer(t)
	now := nowMs()
	recordResults("m1", "classic", []boardEntry{{PID: "aaaaaaaaaaaa", Name: "Ann", Best: 700, Win: true}, {PID: "bbbbbbbbbbbb", Name: "Bob", Best: 300}}, now)
	recordResults("m2", "lcs", []boardEntry{{PID: "bbbbbbbbbbbb", Name: "Bob", Best: 900, Win: true}}, now+1)
	recordResults("m3", "lcs", []boardEntry{{PID: "cccccccccccc", Name: "Cy", Best: 400}}, now+2)
	for _, c := range []struct {
		q    string
		want string
	}{
		{"period=day&kind=best", "Bob:900,Ann:700,Cy:400"},
		{"period=day&kind=best&mode=all", "Bob:900,Ann:700,Cy:400"},
		{"period=day&kind=best&mode=classic", "Ann:700,Bob:300"},
		{"period=week&kind=best&mode=lcs", "Bob:900,Cy:400"},
		{"period=day&kind=wins&mode=lcs", "Bob:1"},
		{"period=all&kind=best&mode=lcs", "Bob:900,Cy:400"},
		{"period=all&kind=best&mode=classic", "Ann:700,Bob:300"},
		{"period=all&kind=wins", "Ann:1,Bob:1"},
		{"period=all&kind=best&mode=teams", ""},
	} {
		code, rows := board(t, s, c.q)
		got := []string{}
		for _, r := range rows {
			got = append(got, fmt.Sprintf("%s:%d", r.Name, r.Value))
		}
		if code != 200 || strings.Join(got, ",") != c.want {
			t.Errorf("%s: %d %v, want %s", c.q, code, got, c.want)
		}
	}
	if code, _ := board(t, s, "period=day&mode=darts"); code != 400 {
		t.Errorf("unknown mode: HTTP %d", code)
	}
}

// An M3/M4 database file (no mode column, no alltime_mode) opens, keeps its rows as Classic, and opens again.
func TestMigrateOldDatabase(t *testing.T) {
	keep := db
	defer func() { db = keep }()
	path := t.TempDir() + "/old.db"
	old, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := old.Exec(`CREATE TABLE results (mid TEXT NOT NULL, pid TEXT NOT NULL, name TEXT NOT NULL, day TEXT NOT NULL, week TEXT NOT NULL,
		best INTEGER NOT NULL, win INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (mid, pid));
		CREATE TABLE alltime (pid TEXT PRIMARY KEY, name TEXT NOT NULL, best INTEGER NOT NULL, wins INTEGER NOT NULL, matches INTEGER NOT NULL, at INTEGER NOT NULL);
		CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`); err != nil {
		t.Fatal(err)
	}
	t0 := time.Now()
	old.Exec(`INSERT INTO results VALUES ('m0', 'dddddddddddd', 'Dee', ?, ?, 650, 1, ?)`, dayKey(t0), weekKey(t0), t0.UnixMilli())
	old.Exec(`INSERT INTO alltime VALUES ('dddddddddddd', 'Dee', 650, 3, 9, ?)`, t0.UnixMilli())
	old.Close()
	for pass := 0; pass < 2; pass++ {
		openDB(path)
		var mode string
		var n, wins int
		db.QueryRow(`SELECT mode FROM results WHERE pid = 'dddddddddddd'`).Scan(&mode)
		db.QueryRow(`SELECT COUNT(*), SUM(wins) FROM alltime_mode WHERE mode = 'classic'`).Scan(&n, &wins)
		if mode != "classic" || n != 1 || wins != 3 {
			t.Fatalf("pass %d: results mode %q, alltime_mode classic rows %d wins %d", pass, mode, n, wins)
		}
		recordResults(fmt.Sprintf("mx%d", pass), "teams", []boardEntry{{PID: "dddddddddddd", Name: "Dee", Best: 100, Win: true}}, t0.UnixMilli()+int64(pass)+1)
		db.Close()
	}
	openDB(path)
	defer db.Close()
	var all, teams, classic int
	db.QueryRow(`SELECT wins FROM alltime WHERE pid = 'dddddddddddd'`).Scan(&all)
	db.QueryRow(`SELECT wins FROM alltime_mode WHERE pid = 'dddddddddddd' AND mode = 'teams'`).Scan(&teams)
	db.QueryRow(`SELECT wins FROM alltime_mode WHERE pid = 'dddddddddddd' AND mode = 'classic'`).Scan(&classic)
	if all != 5 || teams != 2 || classic != 3 {
		t.Fatalf("after two opens: all-modes wins %d (want 5), teams %d (want 2), classic %d (want 3)", all, teams, classic)
	}
}
