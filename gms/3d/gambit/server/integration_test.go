package main

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"math/big"
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
	testKey *rsa.PrivateKey
	clockMu sync.Mutex
	clock   time.Time
)

func TestMain(m *testing.M) {
	dir, _ := os.MkdirTemp("", "gambit-test")
	os.Setenv("GAMBIT_DEV_AUTH", "1")
	os.Setenv("GAMBIT_NO_RATE", "1")
	loadConfig()
	cfg.Salt = "test"
	clock = time.Date(2026, 10, 31, 12, 0, 0, 0, time.UTC)
	nowFn = func() time.Time { clockMu.Lock(); defer clockMu.Unlock(); return clock }
	testKey, _ = rsa.GenerateKey(rand.Reader, 2048)
	tmpl := &x509.Certificate{SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "t"},
		NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(24 * time.Hour)}
	der, _ := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &testKey.PublicKey, testKey)
	certs, _ := json.Marshal(map[string]string{"testkid": string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}))})
	os.WriteFile(dir+"/certs.json", certs, 0o600)
	cfg.TestCerts = dir + "/certs.json"
	openDB(dir + "/gambit.db")
	ts = httptest.NewServer(routes())
	code := m.Run()
	ts.Close()
	os.RemoveAll(dir)
	os.Exit(code)
}

func advance(d time.Duration) { clockMu.Lock(); clock = clock.Add(d); clockMu.Unlock() }

// mint signs a Firebase-shaped ID token with the test key.
func mint(uid, provider, email string) string {
	enc := base64.RawURLEncoding
	h, _ := json.Marshal(map[string]string{"alg": "RS256", "kid": "testkid", "typ": "JWT"})
	now := nowFn().Unix()
	p, _ := json.Marshal(map[string]any{"aud": firebaseProject, "iss": "https://securetoken.google.com/" + firebaseProject,
		"sub": uid, "exp": now + 3600, "iat": now - 10, "name": "Signed " + uid, "email": email, "email_verified": email != "",
		"firebase": map[string]string{"sign_in_provider": provider}})
	in := enc.EncodeToString(h) + "." + enc.EncodeToString(p)
	sum := sha256.Sum256([]byte(in))
	sig, _ := rsa.SignPKCS1v15(rand.Reader, testKey, 5, sum[:]) // 5 = crypto.SHA256
	return in + "." + enc.EncodeToString(sig)
}

// resetWorld clears in-memory state and the tables tests look at.
func resetWorld(t *testing.T) {
	old := hub
	old.mu.Lock()
	hub = newHub()
	old.mu.Unlock()
	for _, tb := range []string{"players", "ratings", "games", "live_games", "anon_usage", "settings"} {
		db.Exec("DELETE FROM " + tb)
	}
	resetLimits()
	cfg.AllowanceMode, cfg.AnonPerDay, cfg.AnonPerIP = "fake", 2, 30
	t.Cleanup(func() {})
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

func dial(t *testing.T, token, name string) *client {
	t.Helper()
	u := "ws" + strings.TrimPrefix(ts.URL, "http") + "/gms/3d/gambit/api/ws"
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
	cl.send(map[string]any{"t": "hello", "token": token, "name": name})
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

// req sends m and returns the ok/error reply for it.
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

func (cl *client) drop() { cl.c.Close(websocket.StatusNormalClosure, ""); <-cl.closed }

// pair runs a quick match between a and b and returns (white, black, gameID).
func pair(t *testing.T, a, b *client, tc string, rated bool) (*client, *client, string) {
	t.Helper()
	a.ok(map[string]any{"t": "seek", "tc": tc, "rated": rated})
	b.ok(map[string]any{"t": "seek", "tc": tc, "rated": rated})
	sa, sb := a.wait("start"), b.wait("start")
	ga, gb := sa["game"].(map[string]any), sb["game"].(map[string]any)
	if ga["id"] != gb["id"] || ga["you"] == gb["you"] {
		t.Fatalf("bad pairing %v / %v", ga, gb)
	}
	if ga["you"] == "w" {
		return a, b, ga["id"].(string)
	}
	return b, a, ga["id"].(string)
}

func playWire(t *testing.T, w, b *client, game string, ucis ...string) {
	t.Helper()
	start := len(w.ok(map[string]any{"t": "game", "game": game})["game"].(map[string]any)["moves"].([]any))
	for j, u := range ucis {
		i := start + j
		mover, other := w, b
		if i%2 == 1 {
			mover, other = b, w
		}
		mover.ok(map[string]any{"t": "move", "game": game, "uci": u, "ply": i})
		for _, c := range []*client{mover, other} {
			mv := c.take("move "+u, func(m map[string]any) bool { return m["t"] == "move" && m["game"] == game && m["uci"] == u })
			if int(mv["ply"].(float64)) != i {
				t.Fatalf("ply %v want %d", mv["ply"], i)
			}
		}
	}
}

func getJSON(t *testing.T, path string, out any) int {
	t.Helper()
	res, err := http.Get(ts.URL + "/gms/3d/gambit" + path)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	json.NewDecoder(res.Body).Decode(out)
	return res.StatusCode
}

// ------------------------------------------------------------------ tests

func TestFullGameQuickMatch(t *testing.T) {
	resetWorld(t)
	alice := dial(t, "dev:alice:Alice", "")
	bob := dial(t, "dev:bob:Bob", "Bobby")
	if bob.welcome["you"].(map[string]any)["name"] != "Bobby" || alice.welcome["you"].(map[string]any)["name"] != "Alice" {
		t.Fatalf("names: %v / %v", alice.welcome["you"], bob.welcome["you"])
	}
	al := alice.welcome["allowance"].(map[string]any)
	if al["tier"] != "anon" || al["remaining"].(float64) != 2 {
		t.Fatalf("anon allowance %v", al)
	}
	w, b, game := pair(t, alice, bob, "5+0", true)
	// Wrong turn, illegal and stale moves are refused without changing anything.
	b.fails(map[string]any{"t": "move", "game": game, "uci": "e7e5", "ply": 0}, "not_your_turn")
	w.fails(map[string]any{"t": "move", "game": game, "uci": "e2e5", "ply": 0}, "illegal_move")
	w.fails(map[string]any{"t": "move", "game": game, "uci": "e2e4", "ply": 3}, "stale_ply")
	playWire(t, w, b, game, "f2f3", "e7e5")
	// Resending an accepted move is harmless.
	if r := b.ok(map[string]any{"t": "move", "game": game, "uci": "e7e5", "ply": 1}); r["dup"] != true {
		t.Fatalf("dup resend: %v", r)
	}
	// Both moved: the game counted for both anonymous players.
	aw := w.wait("allowance")["allowance"].(map[string]any)
	if aw["used"].(float64) != 1 || aw["remaining"].(float64) != 1 {
		t.Fatalf("after counting: %v", aw)
	}
	advance(3 * time.Second)
	playWire(t, w, b, game, "g2g4", "d8h4")
	for _, c := range []*client{w, b} {
		end := c.wait("end")
		if end["result"] != "0-1" || end["reason"] != "checkmate" || !strings.Contains(end["pgn"].(string), "2. g4 Qh4# 0-1") {
			t.Fatalf("end: %v", end)
		}
		r := end["ratings"].(map[string]any)
		if r["w"].(map[string]any)["delta"].(float64) >= 0 || r["b"].(map[string]any)["delta"].(float64) <= 0 {
			t.Fatalf("rating deltas: %v", r)
		}
	}
	var stored map[string]any
	if getJSON(t, "/api/games/"+game, &stored) != 200 || stored["result"] != "0-1" || stored["cat"] != "blitz" {
		t.Fatalf("stored game: %v", stored)
	}
	// Ratings moved; anonymous players stay off the leaderboard.
	rat := b.ok(map[string]any{"t": "ratings"})["ratings"].(map[string]any)["blitz"].(map[string]any)
	if rat["r"].(float64) <= 1500 || rat["games"].(float64) != 1 || rat["prov"] != true {
		t.Fatalf("black blitz rating %v", rat)
	}
	var lb map[string]any
	getJSON(t, "/api/leaderboard?cat=blitz", &lb)
	if rows := lb["rows"].([]any); len(rows) != 0 {
		t.Fatalf("anon players on the board: %v", rows)
	}
	// Move after the end is refused.
	w.fails(map[string]any{"t": "move", "game": game, "uci": "a2a3", "ply": 4}, "game_over")
}

func TestAnonAllowance(t *testing.T) {
	resetWorld(t)
	carol := dial(t, "dev:carol:Carol", "")
	dave := dial(t, "dev:dave:Dave", "")
	// An aborted game costs nothing.
	w, _, game := pair(t, carol, dave, "3+0", false)
	w.ok(map[string]any{"t": "abort", "game": game})
	if e := carol.wait("end"); e["reason"] != "aborted" {
		t.Fatalf("abort: %v", e)
	}
	dave.wait("end")
	for i := 0; i < 2; i++ {
		w, b, game := pair(t, carol, dave, "3+0", false)
		playWire(t, w, b, game, "e2e4", "e7e5")
		w.ok(map[string]any{"t": "resign", "game": game})
		w.wait("end")
		b.wait("end")
	}
	r := carol.fails(map[string]any{"t": "seek", "tc": "3+0"}, "no_games_left")
	if a := r["allowance"].(map[string]any); a["remaining"].(float64) != 0 || a["used"].(float64) != 2 {
		t.Fatalf("allowance after 2: %v", a)
	}
	carol.fails(map[string]any{"t": "createRoom", "tc": "10+0"}, "no_games_left")
	// Next UTC day: back to 2.
	advance(24 * time.Hour)
	carol.ok(map[string]any{"t": "seek", "tc": "3+0"})
	carol.ok(map[string]any{"t": "unseek"})
	// Per-IP ceiling for guests.
	cfg.AnonPerIP = 1
	db.Exec(`INSERT INTO anon_usage(uid, day, game_id, ip, at) VALUES('someone', ?, 'x', ?, 0)`, utcDay(nowFn()), ipHash("127.0.0.1"))
	carol.fails(map[string]any{"t": "seek", "tc": "3+0"}, "ip_limit")
}

func TestPrivateRoomDrawRematch(t *testing.T) {
	resetWorld(t)
	host := dial(t, "dev:erin:Erin", "")
	guest := dial(t, "dev:frank:Frank", "")
	watcher := dial(t, "dev:gina:Gina", "")
	watcher.ok(map[string]any{"t": "lobby", "on": true})
	room := host.ok(map[string]any{"t": "createRoom", "tc": "10+5", "rated": false, "color": "b", "public": false})["room"].(map[string]any)
	code := room["code"].(string)
	if len(code) != 5 {
		t.Fatalf("room code %q", code)
	}
	// Private rooms are not listed.
	var lobby map[string]any
	getJSON(t, "/api/rooms", &lobby)
	if len(lobby["rooms"].([]any)) != 0 {
		t.Fatalf("private room listed: %v", lobby)
	}
	host.fails(map[string]any{"t": "joinRoom", "code": code}, "own_room")
	guest.fails(map[string]any{"t": "joinRoom", "code": "ZZZZZ"}, "no_room")
	guest.ok(map[string]any{"t": "joinRoom", "code": strings.ToLower(code)})
	gs, hs := guest.wait("start")["game"].(map[string]any), host.wait("start")["game"].(map[string]any)
	if hs["you"] != "b" || gs["you"] != "w" {
		t.Fatalf("host asked for black: host %v guest %v", hs["you"], gs["you"])
	}
	game := gs["id"].(string)
	host.wait("roomClosed")
	guest.fails(map[string]any{"t": "joinRoom", "code": code}, "no_room")
	playWire(t, guest, host, game, "d2d4", "d7d5")
	// One draw offer per move; the opponent declines, then a later offer is accepted.
	guest.ok(map[string]any{"t": "draw", "game": game, "action": "offer"})
	guest.fails(map[string]any{"t": "draw", "game": game, "action": "offer"}, "not_now")
	host.wait("draw")
	host.ok(map[string]any{"t": "draw", "game": game, "action": "decline"})
	playWire(t, guest, host, game, "c2c4", "e7e6")
	host.ok(map[string]any{"t": "draw", "game": game, "action": "offer"})
	guest.ok(map[string]any{"t": "draw", "game": game, "action": "accept"})
	for _, c := range []*client{host, guest} {
		if e := c.wait("end"); e["result"] != "1/2-1/2" || e["reason"] != "agreement" || e["ratings"] != nil {
			t.Fatalf("draw end: %v", e)
		}
	}
	// Rematch: both agree, colours swap.
	host.ok(map[string]any{"t": "rematch", "game": game, "action": "offer"})
	if r := guest.wait("rematch"); r["action"] != "offer" || r["by"] != "b" {
		t.Fatalf("rematch offer event: %v", r)
	}
	guest.ok(map[string]any{"t": "rematch", "game": game, "action": "accept"})
	ns := host.wait("start")["game"].(map[string]any)
	if ns["you"] != "w" || ns["id"] == game || ns["rated"] != false {
		t.Fatalf("rematch game: %v", ns)
	}
	guest.wait("start")
	// Public rooms show up in the lobby feed.
	pr := host.req(map[string]any{"t": "createRoom", "tc": "10+5", "public": true, "name": "Friendly"})
	if pr["t"] != "error" || pr["code"] != "already_playing" {
		// the host is in a timed game: creating a second timed room is refused
		t.Fatalf("room while playing: %v", pr)
	}
	pu := watcher.ok(map[string]any{"t": "createRoom", "tc": "unlimited", "public": true, "name": "Slow chess"})["room"].(map[string]any)
	advance(1100 * time.Millisecond)
	hub.tick()
	lb := watcher.take("lobby with room", func(m map[string]any) bool {
		if m["t"] != "lobby" {
			return false
		}
		rooms := m["lobby"].(map[string]any)["rooms"].([]any)
		return len(rooms) == 1 && rooms[0].(map[string]any)["code"] == pu["code"]
	})
	if lb["lobby"].(map[string]any)["rooms"].([]any)[0].(map[string]any)["name"] != "Slow chess" {
		t.Fatalf("lobby: %v", lb)
	}
}

func TestDisconnectClaimAndResume(t *testing.T) {
	resetWorld(t)
	a := dial(t, "dev:hal:Hal", "")
	b := dial(t, "dev:ivy:Ivy", "")
	w, bl, game := pair(t, a, b, "15+10", true)
	playWire(t, w, bl, game, "e2e4", "c7c5")
	wTok := "dev:hal:Hal"
	if w == b {
		wTok = "dev:ivy:Ivy"
	}
	w.drop()
	gone := bl.wait("opponent")
	if gone["status"] != "gone" || gone["claimAt"].(float64) == 0 {
		t.Fatalf("gone event: %v", gone)
	}
	bl.fails(map[string]any{"t": "claim", "game": game, "kind": "win"}, "not_now")
	// Reconnect inside the grace: the game comes back in the welcome.
	advance(10 * time.Second)
	w2 := dial(t, wTok, "")
	gs := w2.welcome["games"].([]any)
	if len(gs) != 1 || gs[0].(map[string]any)["id"] != game || len(gs[0].(map[string]any)["moves"].([]any)) != 2 {
		t.Fatalf("resume: %v", gs)
	}
	if bk := bl.wait("opponent"); bk["status"] != "back" {
		t.Fatalf("back event: %v", bk)
	}
	// White's clock ran while away: 15 min minus 10 s.
	clk := gs[0].(map[string]any)["clock"].(map[string]any)
	if clk["w"].(float64) != 890000 {
		t.Fatalf("clock after reconnect: %v", clk)
	}
	w2.ok(map[string]any{"t": "move", "game": game, "uci": "g1f3", "ply": 2})
	w2.drop()
	bl.wait("opponent")
	advance(31 * time.Second)
	bl.ok(map[string]any{"t": "claim", "game": game, "kind": "win"})
	if e := bl.wait("end"); e["reason"] != "abandoned" || e["result"] != "0-1" {
		t.Fatalf("claim end: %v", e)
	}
}

func TestFlagOverWire(t *testing.T) {
	resetWorld(t)
	a := dial(t, "dev:jo:Jo", "")
	b := dial(t, "dev:kim:Kim", "")
	w, bl, game := pair(t, a, b, "1+0", false)
	playWire(t, w, bl, game, "e2e4", "e7e5")
	advance(61 * time.Second)
	hub.tick()
	for _, c := range []*client{w, bl} {
		if e := c.wait("end"); e["result"] != "0-1" || e["reason"] != "timeout" {
			t.Fatalf("flag: %v", e)
		}
	}
	// First-move timeout aborts and refunds nothing (nothing was counted).
	w, _, game = pair(t, a, b, "1+0", false)
	advance(31 * time.Second)
	hub.tick()
	if e := w.wait("end"); e["reason"] != "aborted" {
		t.Fatalf("first-move abort: %v", e)
	}
	if al := w.ok(map[string]any{"t": "allowance"})["allowance"].(map[string]any); al["used"].(float64) != 1 {
		t.Fatalf("allowance after abort: %v", al)
	}
}

func TestSignedPaymentsAllowance(t *testing.T) {
	resetWorld(t)
	type acct struct {
		used, per int
		pass      bool
		ids       map[string]bool
	}
	var mu sync.Mutex
	accts := map[string]*acct{"u-free": {per: 1, ids: map[string]bool{}}, "u-pass": {pass: true, ids: map[string]bool{}}}
	spends := 0
	view := func(a *acct) map[string]any {
		if a.pass {
			return map[string]any{"tier": "pass", "perDay": -1, "usedToday": 0, "remaining": -1, "unlimited": true}
		}
		return map[string]any{"tier": "free", "perDay": a.per, "usedToday": a.used, "remaining": a.per - a.used}
	}
	pay := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := verifyFirebaseToken(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
		mu.Lock()
		defer mu.Unlock()
		a := accts[id.UID]
		if err != nil || a == nil || id.Anon {
			w.WriteHeader(401)
			return
		}
		if r.Method == "GET" {
			if r.URL.Query().Get("game") != "chess" {
				w.WriteHeader(404)
				return
			}
			json.NewEncoder(w).Encode(view(a))
			return
		}
		var in struct{ Game, ID string }
		json.NewDecoder(r.Body).Decode(&in)
		if in.Game != "chess" || len(in.ID) != 36 {
			w.WriteHeader(400)
			return
		}
		spends++
		if !a.pass && !a.ids[in.ID] {
			if a.used >= a.per {
				w.WriteHeader(429)
				json.NewEncoder(w).Encode(map[string]any{"ok": false, "allowance": view(a)})
				return
			}
			a.used++
			a.ids[in.ID] = true
		}
		json.NewEncoder(w).Encode(map[string]any{"ok": true, "allowance": view(a)})
	}))
	defer pay.Close()
	cfg.AllowanceMode, cfg.AllowanceURL = "on", pay.URL+"/api/br8t/"
	defer func() { cfg.AllowanceMode = "fake" }()

	free := dial(t, mint("u-free", "google.com", "free@example.com"), "")
	pass := dial(t, mint("u-pass", "google.com", "pass@example.com"), "")
	if ft := free.welcome["you"].(map[string]any); ft["anon"] != false {
		t.Fatalf("signed user marked anon: %v", ft)
	}
	w, b, game := pair(t, free, pass, "5+3", true)
	playWire(t, w, b, game, "e2e4", "e7e5")
	// The spend goroutine updates the cached allowance and pushes it.
	fa := free.take("allowance after spend", func(m map[string]any) bool {
		if m["t"] != "allowance" {
			return false
		}
		a := m["allowance"].(map[string]any)
		return a["tier"] == "free" && a["remaining"].(float64) == 0
	})
	_ = fa
	w.ok(map[string]any{"t": "resign", "game": game})
	free.wait("end")
	pass.wait("end")
	free.fails(map[string]any{"t": "seek", "tc": "5+3"}, "no_games_left")
	pa := pass.ok(map[string]any{"t": "allowance"})["allowance"].(map[string]any)
	if pa["tier"] != "pass" || pa["unlimited"] != true {
		t.Fatalf("pass allowance: %v", pa)
	}
	pass.ok(map[string]any{"t": "seek", "tc": "5+3"})
	mu.Lock()
	defer mu.Unlock()
	if spends != 2 || accts["u-free"].used != 1 {
		t.Fatalf("spends %d used %d", spends, accts["u-free"].used)
	}
	// Signed-in players with settled ratings appear on the leaderboard (none yet: provisional).
	rows := leaderboard("blitz", 10)
	if len(rows) != 0 {
		t.Fatalf("provisional players listed: %v", rows)
	}
}

func TestRestartRestoresGames(t *testing.T) {
	resetWorld(t)
	a := dial(t, "dev:lee:Lee", "")
	b := dial(t, "dev:max:Max", "")
	w, bl, game := pair(t, a, b, "unlimited", true)
	playWire(t, w, bl, game, "e2e4", "e7e5", "g1f3")
	old := hub
	old.mu.Lock()
	hub.heartbeat()
	hub = newHub() // "restart"
	old.mu.Unlock()
	hub.mu.Lock()
	hub.loadLive()
	g := hub.games[game]
	hub.mu.Unlock()
	if g == nil || len(g.Moves) != 3 || g.toMove() != black {
		t.Fatalf("restored game: %+v", g)
	}
	c := dial(t, "dev:max:Max", "")
	gs := c.welcome["games"].([]any)
	if len(gs) != 1 || gs[0].(map[string]any)["fen"] != g.pos.FEN() {
		t.Fatalf("welcome after restart: %v", gs)
	}
}

func TestProtocolAbuse(t *testing.T) {
	resetWorld(t)
	u := "ws" + strings.TrimPrefix(ts.URL, "http") + "/gms/3d/gambit/api/ws"
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	// Bad token: error then close.
	c, _, err := websocket.Dial(ctx, u, nil)
	if err != nil {
		t.Fatal(err)
	}
	c.Write(ctx, websocket.MessageText, []byte(`{"t":"hello","token":"nope"}`))
	_, b, _ := c.Read(ctx)
	if !strings.Contains(string(b), "bad_token") {
		t.Fatalf("bad token reply %s", b)
	}
	if _, _, err := c.Read(ctx); err == nil {
		t.Fatal("connection stayed open after a bad token")
	}
	// Oversized message closes the connection.
	cl := dial(t, "dev:ned:Ned", "")
	big := strings.Repeat("x", 5000)
	cl.c.Write(ctx, websocket.MessageText, []byte(`{"t":"rename","name":"`+big+`"}`))
	select {
	case <-cl.closed:
	case <-time.After(3 * time.Second):
		t.Fatal("oversized message did not close the connection")
	}
	// Origin not on the list is refused.
	_, res, err := websocket.Dial(ctx, u, &websocket.DialOptions{HTTPHeader: http.Header{"Origin": {"https://evil.example"}}})
	if err == nil || res == nil || res.StatusCode != 403 {
		t.Fatalf("foreign origin accepted: %v", err)
	}
	// Room caps.
	cl2 := dial(t, "dev:ola:Ola", "")
	cl2.ok(map[string]any{"t": "createRoom", "tc": "unlimited"})
	cl2.ok(map[string]any{"t": "createRoom", "tc": "unlimited"})
	cl2.fails(map[string]any{"t": "createRoom", "tc": "unlimited"}, "too_many_rooms")
	cl2.fails(map[string]any{"t": "seek", "tc": "7+0"}, "bad_tc")
	cl2.fails(map[string]any{"t": "move", "game": "nope", "uci": "e2e4"}, "no_game")
}
