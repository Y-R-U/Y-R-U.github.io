package main

// Regression tests for the adversarial review (docs/notes/serverfix.md). The originals
// were repros that failed on the old code; these assert the fixed behaviour.

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

// mockPay is a payments double that verifies the bearer like the real one (expired or
// invalid -> 401) and counts spends per uid.
type mockPay struct {
	mu                sync.Mutex
	used, per, spends int
	n401              int
	revoked           bool // answer 401 even to a valid token
	ids               map[string]bool
}

func (p *mockPay) start(t *testing.T) {
	p.ids = map[string]bool{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, err := verifyFirebaseToken(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
		p.mu.Lock()
		defer p.mu.Unlock()
		if err != nil || p.revoked {
			p.n401++
			w.WriteHeader(401)
			return
		}
		view := func() map[string]any {
			return map[string]any{"tier": "free", "perDay": p.per, "usedToday": p.used, "remaining": p.per - p.used}
		}
		if r.Method == "GET" {
			json.NewEncoder(w).Encode(view())
			return
		}
		var in struct{ ID string }
		json.NewDecoder(r.Body).Decode(&in)
		if !p.ids[in.ID] {
			if p.used >= p.per {
				w.WriteHeader(429)
				json.NewEncoder(w).Encode(map[string]any{"ok": false, "allowance": view()})
				return
			}
			p.ids[in.ID] = true
			p.used++
			p.spends++
		}
		json.NewEncoder(w).Encode(map[string]any{"ok": true, "allowance": view()})
	}))
	t.Cleanup(srv.Close)
	cfg.AllowanceMode, cfg.AllowanceURL = "on", srv.URL+"/api/br8t/"
	t.Cleanup(func() { cfg.AllowanceMode = "fake" })
}

func (p *mockPay) get() (used, spends, n401 int) {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.used, p.spends, p.n401
}

func playOne(t *testing.T, host, opp *client) {
	t.Helper()
	code := host.ok(map[string]any{"t": "createRoom", "tc": "unlimited", "color": "w"})["room"].(map[string]any)["code"]
	game := opp.ok(map[string]any{"t": "joinRoom", "code": code})["game"].(string)
	host.wait("start")
	opp.wait("start")
	playWire(t, host, opp, game, "e2e4", "e7e5")
	time.Sleep(100 * time.Millisecond) // spend goroutine
	host.ok(map[string]any{"t": "resign", "game": game})
	host.wait("end")
	opp.wait("end")
}

// Finding 1: an expired token must not make a signed-in player unlimited.
func TestReviewStaleTokenNeedsReauth(t *testing.T) {
	resetWorld(t)
	pay := &mockPay{per: 1}
	pay.start(t)
	me := dial(t, mint("u-stale", "google.com", "stale@example.com"), "")
	opp := dial(t, "dev:stale-opp:Opp:signed", "")
	r := me.ok(map[string]any{"t": "createRoom", "tc": "unlimited"})["room"].(map[string]any)
	me.ok(map[string]any{"t": "closeRoom", "code": r["code"]})

	advance(2 * time.Hour) // the held token expired; the client never re-authed
	me.fails(map[string]any{"t": "createRoom", "tc": "unlimited"}, "stale_token")
	me.fails(map[string]any{"t": "seek", "tc": "5+0"}, "stale_token")

	me.ok(map[string]any{"t": "auth", "token": mint("u-stale", "google.com", "stale@example.com")})
	playOne(t, me, opp)
	advance(11 * time.Second)
	me.fails(map[string]any{"t": "createRoom", "tc": "unlimited"}, "no_games_left")
	if used, spends, _ := pay.get(); used != 1 || spends != 1 {
		t.Fatalf("payments used=%d spends=%d, want 1/1", used, spends)
	}
}

// Finding 1: a token that expires between the gate and ply 2 leaves the spend owed
// (reserved, authNeeded pushed); the next auth sends it. Never counted as free.
func TestReviewOwedSpend(t *testing.T) {
	resetWorld(t)
	pay := &mockPay{per: 2}
	pay.start(t)
	me := dial(t, mint("u-owed", "google.com", "owed@example.com"), "")
	opp := dial(t, "dev:owed-opp:Opp:signed", "")
	code := me.ok(map[string]any{"t": "createRoom", "tc": "unlimited", "color": "w"})["room"].(map[string]any)["code"]
	game := opp.ok(map[string]any{"t": "joinRoom", "code": code})["game"].(string)
	me.wait("start")
	opp.wait("start")
	advance(59 * time.Minute) // token within the refresh margin by the time both have moved
	playWire(t, me, opp, game, "e2e4", "e7e5")
	me.wait("authNeeded")
	a := me.ok(map[string]any{"t": "allowance"})["allowance"].(map[string]any)
	if a["pending"].(float64) != 1 || a["remaining"].(float64) != 1 {
		t.Fatalf("owed spend not reserved: %v", a)
	}
	if _, spends, _ := pay.get(); spends != 0 {
		t.Fatalf("spend sent with a stale token")
	}
	me.ok(map[string]any{"t": "auth", "token": mint("u-owed", "google.com", "owed@example.com")})
	time.Sleep(100 * time.Millisecond)
	if used, spends, _ := pay.get(); used != 1 || spends != 1 {
		t.Fatalf("owed spend not sent after auth: used=%d spends=%d", used, spends)
	}
}

// Finding 1: payments refusing a valid-looking token (401) is a stale token, not fail-open.
func TestReviewPayments401NotFailOpen(t *testing.T) {
	resetWorld(t)
	pay := &mockPay{per: 1, revoked: true}
	pay.start(t)
	me := dial(t, mint("u-rev", "google.com", "rev@example.com"), "")
	me.fails(map[string]any{"t": "createRoom", "tc": "unlimited"}, "stale_token")
	pay.mu.Lock()
	pay.revoked = false
	pay.mu.Unlock()
	me.ok(map[string]any{"t": "auth", "token": mint("u-rev", "google.com", "rev@example.com")})
	me.ok(map[string]any{"t": "createRoom", "tc": "unlimited"})
}

// Finding 4: linking an anonymous account in the open tab upgrades the session.
func TestReviewAuthUpgradesAnon(t *testing.T) {
	resetWorld(t)
	c := dial(t, mint("u-link", "anonymous", ""), "")
	if c.welcome["allowance"].(map[string]any)["tier"] != "anon" {
		t.Fatal("not anon at start")
	}
	c.ok(map[string]any{"t": "auth", "token": mint("u-link", "google.com", "link@example.com")})
	idm := c.wait("identity")
	if idm["you"].(map[string]any)["anon"] != false || idm["allowance"].(map[string]any)["tier"] != "free" {
		t.Fatalf("identity push: %v", idm)
	}
	var anon int
	db.QueryRow(`SELECT anon FROM players WHERE uid = 'u-link'`).Scan(&anon)
	if anon != 0 {
		t.Fatal("players.anon not updated (leaderboard eligibility)")
	}
}

// Finding 2: rooms of offline hosts are not listed and close (Unlimited after 24 h); a
// single IP can hold at most maxPublicRoomsPerIP public rooms.
func TestReviewOfflineHostRooms(t *testing.T) {
	resetWorld(t)
	watcher := dial(t, "dev:rw:W:anon", "")
	host := dial(t, "dev:rh:H:anon", "")
	host.ok(map[string]any{"t": "createRoom", "tc": "unlimited", "public": true})
	if n := len(watcher.ok(map[string]any{"t": "lobby"})["lobby"].(map[string]any)["rooms"].([]any)); n != 1 {
		t.Fatalf("lobby rooms %d, want 1", n)
	}
	host.drop()
	time.Sleep(50 * time.Millisecond)
	if n := len(watcher.ok(map[string]any{"t": "lobby"})["lobby"].(map[string]any)["rooms"].([]any)); n != 0 {
		t.Fatalf("offline host's room still listed")
	}
	advance(23 * time.Hour)
	hub.tick()
	hub.mu.Lock()
	n := len(hub.rooms)
	hub.mu.Unlock()
	if n != 1 {
		t.Fatal("Unlimited room closed before 24 h away")
	}
	advance(2 * time.Hour)
	hub.tick()
	hub.mu.Lock()
	n = len(hub.rooms)
	hub.mu.Unlock()
	if n != 0 {
		t.Fatal("Unlimited room of a host away 25 h still open")
	}

	// per-IP cap (all test clients share 127.0.0.1)
	for i := 0; i < maxPublicRoomsPerIP; i++ {
		c := dial(t, fmt.Sprintf("dev:ipcap%d:P%d:anon", i, i), "")
		c.ok(map[string]any{"t": "createRoom", "tc": "unlimited", "public": true})
	}
	extra := dial(t, "dev:ipcapx:PX:anon", "")
	extra.fails(map[string]any{"t": "createRoom", "tc": "unlimited", "public": true}, "too_many_rooms")
	extra.ok(map[string]any{"t": "createRoom", "tc": "unlimited", "public": false}) // private rooms are not capped per IP
}

// Finding 2: the original squat (50 accounts x 2 Unlimited public rooms, then leave) no
// longer locks the lobby (cap lifted here to model many IPs).
func TestReviewUnlimitedRoomSquat(t *testing.T) {
	resetWorld(t)
	old := maxPublicRoomsPerIP
	maxPublicRoomsPerIP = 1 << 20
	defer func() { maxPublicRoomsPerIP = old }()
	for i := 0; i < cfg.MaxPublicRooms/2; i++ {
		c := dial(t, fmt.Sprintf("dev:squat%d:Spam%d:anon", i, i), "")
		for j := 0; j < 2; j++ {
			c.ok(map[string]any{"t": "createRoom", "tc": "unlimited", "public": true})
		}
		c.drop()
	}
	advance(25 * time.Hour)
	hub.tick()
	victim := dial(t, "dev:victim:Vic:anon", "")
	victim.ok(map[string]any{"t": "createRoom", "tc": "5+3", "public": true})
}

// Finding 3: peekRoom shares joinRoom's per-player limit, plus a per-IP one.
func TestReviewPeekRoomLimited(t *testing.T) {
	resetWorld(t)
	cfg.NoRate = false
	oj, oi := limits["join"], limits["joinip"]
	limits["join"], limits["joinip"] = bucket{5, 10 * time.Minute}, bucket{8, 10 * time.Minute}
	defer func() { cfg.NoRate = true; limits["join"], limits["joinip"] = oj, oi; resetLimits() }()
	resetLimits()
	a := dial(t, "dev:peek-a:A:anon", "")
	for i := 0; i < 5; i++ {
		a.fails(map[string]any{"t": "peekRoom", "code": randString(codeAlphabet, codeLen)}, "no_room")
	}
	a.fails(map[string]any{"t": "peekRoom", "code": "ABCDEF"}, "rate_limited")
	a.fails(map[string]any{"t": "joinRoom", "code": "ABCDEF"}, "rate_limited")
	b := dial(t, "dev:peek-b:B:anon", "") // same IP, fresh uid
	for i := 0; i < 3; i++ {
		b.fails(map[string]any{"t": "peekRoom", "code": randString(codeAlphabet, codeLen)}, "no_room")
	}
	b.fails(map[string]any{"t": "peekRoom", "code": "ABCDEF"}, "rate_limited")
}

// Finding 5: the Spent flag set at ply 2 is persisted with that move.
func TestReviewSpentPersisted(t *testing.T) {
	resetWorld(t)
	a := dial(t, "dev:sp-a:A:anon", "")
	b := dial(t, "dev:sp-b:B:anon", "")
	w, bl, game := pair(t, a, b, "unlimited", false)
	playWire(t, w, bl, game, "e2e4", "e7e5")
	a.drop()
	b.drop()
	old := hub
	old.mu.Lock()
	hub.heartbeat()
	hub = newHub()
	old.mu.Unlock()
	hub.mu.Lock()
	hub.loadLive()
	hub.mu.Unlock()
	a2 := dial(t, "dev:sp-a:A:anon", "")
	al := a2.welcome["allowance"].(map[string]any)
	if al["remaining"].(float64) != 1 || al["pending"].(float64) != 0 {
		t.Errorf("phantom pending game after restart: %v", al)
	}
}

// Finding 7: invisible, zalgo, homoglyph-profane and staff-impersonating names.
func TestReviewNames(t *testing.T) {
	bad := []string{"ㅤㅤㅤ", "⠀⠀", "ᅟᅠ", "fцck", "ｆｕｃｋ", "f̶u̶c̶k̶", "Aaron (admin)", "ADMIN", "Mod Tom",
		"GAMBIT official", "br8t team", "adm1n", "Staff", "ѕhіt"}
	for _, s := range bad {
		if n, err := cleanName(s); err == nil {
			t.Errorf("%q accepted as %q", s, n)
		}
	}
	good := map[string]string{"Tom & Jerry": "Tom & Jerry", "Zoë": "Zoë", "Ὀδυσσεύς": "Ὀδυσσεύς",
		"李小龙": "李小龙", "Hancock": "Hancock", "Modern Admiral": "Modern Admiral", "  a  b ": "a b"}
	for in, want := range good {
		n, err := cleanName(in)
		if err != nil {
			t.Errorf("%q refused: %v", in, err)
		} else if want != "" && n != want {
			t.Errorf("%q -> %q, want %q", in, n, want)
		}
	}
	if n, _ := cleanName("Z̵̶̷̸a̵̶̷"); len([]rune(n)) != 6 {
		t.Errorf("zalgo not capped: %q (%d runes)", n, len([]rune(n)))
	}
}

// chess.go: FIDE timeout rule (a helpmate is enough to win on time).
func TestReviewCanMateFIDE(t *testing.T) {
	cases := []struct {
		fen  string
		w, b bool
		why  string
	}{
		{"4k3/8/8/8/8/8/8/3NK3 w - - 0 1", false, false, "K+N vs K"},
		{"4k3/8/8/8/8/8/8/2B1K3 w - - 0 1", false, false, "K+B vs K"},
		{"4k3/4p3/8/8/8/8/8/3NK3 w - - 0 1", true, true, "K+N vs K+P: both can mate"},
		{"4kb2/8/8/8/8/8/8/2B1K3 w - - 0 1", false, false, "same-colour bishops"},
		{"4k1b1/8/8/8/8/8/8/2B1K3 w - - 0 1", true, true, "opposite-colour bishops"},
		{"4k3/8/8/8/8/8/8/2NNK3 w - - 0 1", true, false, "K+N+N vs K"},
		{"4k3/8/8/8/8/8/8/1BB1K3 w - - 0 1", true, false, "two bishops, both colours"},
		{"2b1k3/8/8/8/8/8/8/1N2K3 w - - 0 1", true, true, "K+N vs K+B"},
		{"4k3/8/8/8/8/8/8/3QK3 w - - 0 1", true, false, "K+Q vs K"},
	}
	for _, c := range cases {
		p, _ := ParseFEN(c.fen)
		if p.CanMate(white) != c.w || p.CanMate(black) != c.b {
			t.Errorf("%s: CanMate w=%v b=%v, want %v %v", c.why, p.CanMate(white), p.CanMate(black), c.w, c.b)
		}
	}
}

// firebase.go: certs expired + Google unreachable keeps the old set (stale-while-error).
func TestReviewCertsStaleWhileError(t *testing.T) {
	if _, err := signingKeys(false); err != nil {
		t.Fatal(err)
	}
	certCache.Lock()
	certCache.expires = time.Now().Add(-time.Second)
	certCache.Unlock()
	old := cfg.TestCerts
	cfg.TestCerts = "/nonexistent/certs.json"
	defer func() { cfg.TestCerts = old }()
	if _, err := verifyToken(mint("u-certs", "google.com", "")); err != nil {
		t.Fatalf("login failed while Google is unreachable: %v", err)
	}
}

// Protocol fuzz from both seats of a live game: the process must survive.
func TestReviewFuzzDispatch(t *testing.T) {
	resetWorld(t)
	a := dial(t, "dev:fz-a:A:anon", "")
	b := dial(t, "dev:fz-b:B:anon", "")
	w, bl, game := pair(t, a, b, "1+0", true)
	playWire(t, w, bl, game, "e2e4", "e7e5")
	types := []string{"move", "resign", "draw", "abort", "claim", "rematch", "game", "seek", "unseek", "createRoom", "closeRoom", "joinRoom", "peekRoom", "lobby", "rename", "leaderboard", "allowance", "ratings", "ping", "x"}
	vals := []any{nil, "", "e7e8q", "e1h1", "a1a1", "zzzz", strings.Repeat("é", 300), -1, 1 << 40, 3.5, true, []any{1}, map[string]any{"a": 1}, game, "unlimited", "1+0", "offer", "accept", "decline", "cancel", "draw"}
	keys := []string{"game", "uci", "ply", "action", "kind", "tc", "code", "name", "on", "rated", "public", "color", "cat", "limit"}
	for i := 0; i < 3000; i++ {
		c := a
		if i%2 == 1 {
			c = b
		}
		m := map[string]any{"t": types[(i*7+i/3)%len(types)]}
		for k := 0; k < 4; k++ {
			m[keys[(i*13+k*5)%len(keys)]] = vals[(i*11+k*17)%len(vals)]
		}
		c.send(m)
	}
	time.Sleep(500 * time.Millisecond)
	var h map[string]any
	if getJSON(t, "/api/health", &h) != 200 {
		t.Fatal("server died")
	}
}
