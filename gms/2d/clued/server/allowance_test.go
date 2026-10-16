package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"regexp"
	"sync"
	"testing"
	"time"
)

type fakePayments struct {
	mu    sync.Mutex
	code  int // reply status for every spend
	calls []map[string]string
	auth  []string
}

func (f *fakePayments) handler(t *testing.T) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || r.URL.Path != "/api/br8t/allowance" {
			t.Errorf("unexpected %s %s", r.Method, r.URL.Path)
		}
		var in map[string]string
		json.NewDecoder(r.Body).Decode(&in)
		f.mu.Lock()
		f.calls = append(f.calls, in)
		f.auth = append(f.auth, r.Header.Get("Authorization"))
		code := f.code
		f.mu.Unlock()
		left := 2
		if code == 429 {
			left = 0
		}
		w.WriteHeader(code)
		json.NewEncoder(w).Encode(map[string]any{"ok": code == 200, "allowance": map[string]any{"game": "clued", "tier": "free",
			"perDay": 5, "usedToday": 5 - left, "remaining": left, "freePerDay": 3, "promoPerDay": 2, "promoUntil": "2026-12-31", "resetsAt": 1791936000}})
	}
}

func (f *fakePayments) n() int { f.mu.Lock(); defer f.mu.Unlock(); return len(f.calls) }

// withPayments points the gate at a fake payments service for one test.
func withPayments(t *testing.T, code int) *fakePayments {
	t.Helper()
	f := &fakePayments{code: code}
	srv := httptest.NewServer(f.handler(t))
	old := allowanceCfg
	allowanceCfg.On, allowanceCfg.URL, allowanceCfg.Game = true, srv.URL+"/api/br8t/", "clued"
	t.Cleanup(func() { allowanceCfg = old; srv.Close() })
	return f
}

var uuidV4 = regexp.MustCompile(`^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$`)

func createSigned(t *testing.T, tok string, extra map[string]any) (code, key string) {
	t.Helper()
	body := map[string]any{"hostName": "Payer", "spec": map[string]any{"v": 1}, "questions": questions(2)}
	for k, v := range extra {
		body[k] = v
	}
	r := call(t, "POST", "/rooms", body, "Authorization", "Bearer "+tok)
	if r.code != 200 {
		t.Fatalf("create: %d %v", r.code, r.body)
	}
	return r.body["code"].(string), r.body["hostKey"].(string)
}

func TestAllowanceConfig(t *testing.T) {
	old := allowanceCfg
	defer func() { allowanceCfg = old }()
	for _, c := range []struct {
		sw, url string
		on      bool
	}{{"", "", false}, {"on", "", true}, {"", "http://x/api/br8t", true}, {"off", "http://x/api/br8t", false}, {"OFF", "", false}} {
		t.Setenv("CLUED_ALLOWANCE", c.sw)
		t.Setenv("CLUED_ALLOWANCE_URL", c.url)
		loadAllowanceConfig()
		if allowanceCfg.On != c.on {
			t.Fatalf("%+v → %v", c, allowanceCfg.On)
		}
	}
	if allowanceCfg.URL != "http://127.0.0.1:8016/api/br8t/" || allowanceCfg.Game != "clued" {
		t.Fatalf("defaults: %+v", allowanceCfg)
	}
	if status := call(t, "GET", "/status", nil); status.body["allowance"] != false {
		t.Fatalf("status: %v", status.body)
	}
}

func TestAllowanceOffNeverCalls(t *testing.T) {
	resetLimits()
	f := withPayments(t, 429)
	allowanceCfg.On = false
	code, hk := createRoom(t, "Free", 2)
	if st := call(t, "POST", "/rooms/"+code+"/start", map[string]any{"key": hk}).body; st["phase"] != "question" {
		t.Fatalf("off switch must not gate: %v", st)
	}
	if f.n() != 0 {
		t.Fatal("payments called while off")
	}
}

func TestAllowanceHostSpendsAtStart(t *testing.T) {
	resetLimits()
	f := withPayments(t, 200)
	if call(t, "GET", "/status", nil).body["allowance"] != true {
		t.Fatal("status must say the allowance is on")
	}
	tok := mint("google")
	code, hk := createSigned(t, tok, nil)
	join(t, code, "Guest")
	if f.n() != 0 {
		t.Fatal("creating a room or joining it must not spend")
	}
	call(t, "POST", "/rooms/"+code+"/settings", map[string]any{"key": hk, "answerSec": 15}, "Authorization", "Bearer "+tok)
	if f.n() != 0 {
		t.Fatal("settings must not spend")
	}
	st := call(t, "POST", "/rooms/"+code+"/start", map[string]any{"key": hk}, "Authorization", "Bearer "+tok)
	if st.code != 200 || st.body["phase"] != "question" || f.n() != 1 {
		t.Fatalf("start: %d %v calls=%d", st.code, st.body, f.n())
	}
	first := f.calls[0]
	if first["game"] != "clued" || !uuidV4.MatchString(first["id"]) || f.auth[0] != "Bearer "+tok {
		t.Fatalf("spend request: %v %q", first, f.auth[0])
	}
	// mid-game host actions never spend
	call(t, "POST", "/rooms/"+code+"/next", map[string]any{"key": hk, "q": 0}, "Authorization", "Bearer "+tok)
	if f.n() != 1 {
		t.Fatal("next mid-game spent")
	}
	// a rematch is another game, with its own id
	call(t, "POST", "/rooms/"+code+"/again", map[string]any{"key": hk, "spec": map[string]any{"v": 1}, "questions": questions(2)}, "Authorization", "Bearer "+tok)
	st = call(t, "POST", "/rooms/"+code+"/next", map[string]any{"key": hk}, "Authorization", "Bearer "+tok) // lobby "next" starts too
	if st.body["phase"] != "question" || f.n() != 2 || f.calls[1]["id"] == first["id"] {
		t.Fatalf("rematch: %v calls=%v", st.body, f.calls)
	}
}

func TestAllowanceRefusedAt429(t *testing.T) {
	resetLimits()
	f := withPayments(t, 429)
	tok := mint("google")
	code, hk := createSigned(t, tok, nil)
	r := call(t, "POST", "/rooms/"+code+"/start", map[string]any{"key": hk}, "Authorization", "Bearer "+tok)
	a, _ := r.body["allowance"].(map[string]any)
	if r.code != 429 || r.body["code"] != "no_games_left" || a == nil || num(a["remaining"]) != 0 || a["promoUntil"] != "2026-12-31" {
		t.Fatalf("429: %d %v", r.code, r.body)
	}
	if state(t, code, hk)["phase"] != "lobby" {
		t.Fatal("refused game started anyway")
	}
	// a retry of the same game reuses its id (the payments service never double-spends it)
	call(t, "POST", "/rooms/"+code+"/start", map[string]any{"key": hk}, "Authorization", "Bearer "+tok)
	if f.n() != 2 || f.calls[0]["id"] != f.calls[1]["id"] {
		t.Fatalf("retry ids: %v", f.calls)
	}
	// no sign-in, no start
	code2, hk2 := createRoom(t, "Anon", 2)
	if r := call(t, "POST", "/rooms/"+code2+"/start", map[string]any{"key": hk2}); r.code != 403 || r.body["code"] != "signin_required" {
		t.Fatalf("anonymous host: %d %v", r.code, r.body)
	}
	// only the host's start is gated: a guest gets the usual not_host
	gk, _ := join(t, code, "Guest")
	if r := call(t, "POST", "/rooms/"+code+"/start", map[string]any{"key": gk}); r.code != 403 || r.body["code"] != "not_host" {
		t.Fatalf("guest start: %d %v", r.code, r.body)
	}
	if f.n() != 2 {
		t.Fatal("non-host start reached payments")
	}
}

func TestAllowanceFailsOpen(t *testing.T) {
	resetLimits()
	for _, c := range []struct {
		name string
		code int
		down bool
	}{{"unreachable", 0, true}, {"payments 503", 503, false}, {"payments 404", 404, false}} {
		f := withPayments(t, c.code)
		if c.down {
			allowanceCfg.URL = "http://127.0.0.1:1/api/br8t/"
		}
		tok := mint("google")
		code, hk := createSigned(t, tok, nil)
		if st := call(t, "POST", "/rooms/"+code+"/start", map[string]any{"key": hk}, "Authorization", "Bearer "+tok).body; st["phase"] != "question" {
			t.Fatalf("%s: must fail open: %v", c.name, st)
		}
		_ = f
	}
}

func TestAllowanceAutoStart(t *testing.T) {
	resetLimits()
	clearRooms()
	f := withPayments(t, 429)
	tok := mint("google")
	code, hk := createSigned(t, tok, map[string]any{"public": true, "startIn": 60})
	advance(61 * time.Second)
	state(t, code, hk)
	tickRooms()
	waitFor(t, func() bool { return f.n() == 1 })
	waitFor(t, func() bool { return state(t, code, hk)["startAt"] == nil })
	st := state(t, code, hk)
	you := st["you"].(map[string]any)
	if st["phase"] != "lobby" || you["limit"] == nil {
		t.Fatalf("refused auto-start: %v", st)
	}
	if f.auth[0] != "Bearer "+tok {
		t.Fatal("auto-start must spend the host's token")
	}
	gk, _ := join(t, code, "Guest")
	if state(t, code, gk)["you"].(map[string]any)["limit"] != nil {
		t.Fatal("guests must not see the host's allowance")
	}

	// a granted auto-start starts the game
	f.mu.Lock()
	f.code = 200
	f.mu.Unlock()
	code2, hk2 := createSigned(t, tok, map[string]any{"public": true, "startIn": 60})
	advance(61 * time.Second)
	state(t, code2, hk2)
	tickRooms()
	waitFor(t, func() bool { return state(t, code2, hk2)["phase"] == "question" })

	// no held token (e.g. after a restart): the countdown stops, the host starts by hand
	code3, hk3 := createRoom(t, "Anon", 2)
	call(t, "POST", "/rooms/"+code3+"/settings", map[string]any{"key": hk3, "public": true, "startIn": 60})
	advance(61 * time.Second)
	state(t, code3, hk3)
	tickRooms()
	if st := state(t, code3, hk3); st["phase"] != "lobby" || st["startAt"] != nil {
		t.Fatalf("tokenless auto-start: %v", st)
	}
}

func TestAllowanceChallenges(t *testing.T) {
	resetLimits()
	f := withPayments(t, 429)
	body := map[string]any{"name": "Maker", "spec": map[string]any{"v": 1}, "questions": questions(5), "score": 1500, "correct": 4, "ms": 30000}
	if r := call(t, "POST", "/challenges", body); r.code != 403 || r.body["code"] != "signin_required" {
		t.Fatalf("anonymous challenge: %d %v", r.code, r.body)
	}
	tok := mint("google")
	if r := call(t, "POST", "/challenges", body, "Authorization", "Bearer "+tok); r.code != 429 || r.body["code"] != "no_games_left" {
		t.Fatalf("challenge 429: %d %v", r.code, r.body)
	}
	f.mu.Lock()
	f.code = 200
	f.mu.Unlock()
	r := call(t, "POST", "/challenges", body, "Authorization", "Bearer "+tok)
	if r.code != 200 || f.n() != 2 || !uuidV4.MatchString(f.calls[1]["id"]) {
		t.Fatalf("challenge ok: %d %v", r.code, r.body)
	}
	// playing someone's challenge is free
	if s := call(t, "POST", "/challenges/"+r.body["id"].(string)+"/scores", map[string]any{"name": "Guest", "score": 100, "correct": 1}); s.code != 200 || f.n() != 2 {
		t.Fatalf("challenge play: %d %v", s.code, s.body)
	}
}

func waitFor(t *testing.T, ok func() bool) {
	t.Helper()
	for i := 0; i < 200; i++ {
		if ok() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("timed out")
}
