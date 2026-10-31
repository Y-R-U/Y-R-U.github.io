package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

// A fake payments service: perDay free uses per uid, pass uids unlimited, idempotent per id.
type fakePay struct {
	mu     sync.Mutex
	used   map[string]int
	ids    map[string]bool
	pass   map[string]bool
	perDay int
	calls  int
	out    spendOutcome // forced outcome (spendOpen = unreachable) when force is set
	force  bool
}

func newFakePay(perDay int) *fakePay {
	return &fakePay{used: map[string]int{}, ids: map[string]bool{}, pass: map[string]bool{}, perDay: perDay}
}

func (f *fakePay) spend(tok, id string) (spendOutcome, json.RawMessage) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	if f.force {
		return f.out, nil
	}
	uid := strings.TrimPrefix(tok, "dev:")
	if f.pass[uid] {
		return spendOK, json.RawMessage(`{"unlimited":true,"remaining":-1,"perDay":-1,"tier":"pass"}`)
	}
	if !f.ids[id] {
		if f.used[uid] >= f.perDay {
			return spendDenied, json.RawMessage(`{"remaining":0,"perDay":3,"tier":"free"}`)
		}
		f.ids[id] = true
		f.used[uid]++
	}
	b, _ := json.Marshal(map[string]any{"remaining": f.perDay - f.used[uid], "perDay": f.perDay, "tier": "free"})
	return spendOK, b
}

// signedIn: hello with a dev token, and the token check pumped through.
func (r *rig) signedIn(name, uid string) *client {
	c := r.player(name, map[string]any{"tok": "dev:" + uid})
	r.pump()
	return c
}

// act sends a message and pumps any spend / token answers back into the hub.
func (r *rig) act(c *client, m map[string]any, pumps int) {
	r.msg(c, m)
	for i := 0; i < pumps; i++ {
		if !c.spending && !c.authBusy {
			return
		}
		r.pump()
	}
}

func accessRig(signin bool, mode string, pay *fakePay) *rig {
	r := newRig()
	r.h.acc = &accessCfg{signin: signin, mode: mode}
	if pay != nil {
		r.h.spendFn = pay.spend
	}
	return r
}

func TestSigninRequired(t *testing.T) {
	r := accessRig(true, "off", nil)
	guest := r.player("Guest", nil)
	r.msg(guest, map[string]any{"t": "create", "set": map[string]any{"type": "court"}})
	if e := last(guest, "err"); e == nil || e["code"] != "signin" || guest.room != nil {
		t.Fatal("a guest created a room", e)
	}
	r.msg(guest, map[string]any{"t": "quick"})
	if e := last(guest, "err"); e == nil || e["code"] != "signin" || guest.room != nil {
		t.Fatal("a guest quick-joined", e)
	}
	anon := r.player("Anon", map[string]any{"tok": "anon:x1"})
	r.pump()
	r.msg(anon, map[string]any{"t": "quick"})
	if e := last(anon, "err"); e == nil || e["code"] != "signin" {
		t.Fatal("an anonymous Firebase user got in", e)
	}
	a := r.signedIn("Dirk", "u1")
	r.msg(a, map[string]any{"t": "create", "set": map[string]any{"type": "court"}})
	if a.room == nil {
		t.Fatal("signed-in player could not create")
	}
	b := r.signedIn("Mo", "u2")
	r.msg(b, map[string]any{"t": "join", "code": a.room.code})
	if b.room != a.room {
		t.Fatal("signed-in player could not join")
	}
	w := last(a, "welcome")
	_ = w
}

// The client sends hello+auth and create back to back: the create waits for the token check instead of failing.
func TestEntryWaitsForTokenCheck(t *testing.T) {
	r := accessRig(true, "off", nil)
	c := r.connect("", "")
	r.msg(c, map[string]any{"t": "hello", "name": "Dirk", "tok": "dev:u9"})
	r.msg(c, map[string]any{"t": "create", "set": map[string]any{"type": "court"}})
	if c.room != nil || c.pending == nil {
		t.Fatal("create did not wait for the token check")
	}
	r.pump()
	if c.room == nil {
		t.Fatal("the pending create was not replayed", last(c, "err"))
	}
}

func TestAllowanceThreeThenRefused(t *testing.T) {
	pay := newFakePay(3)
	r := accessRig(true, "on", pay)
	a := r.signedIn("Dirk", "u1")
	host := r.signedIn("Host", "h1")
	pay.pass["h1"] = true // the host has a Pass: never counted
	var codes []string
	for i := 0; i < 3; i++ {
		r.act(host, map[string]any{"t": "create", "priv": true, "set": map[string]any{"type": "court"}}, 3)
		codes = append(codes, host.room.code)
		r.act(a, map[string]any{"t": "join", "code": host.room.code}, 3)
		if a.room != host.room {
			t.Fatalf("join %d refused: %v", i+1, last(a, "err"))
		}
		if al := last(a, "allowance"); al == nil || int(al["allowance"].(map[string]any)["remaining"].(float64)) != 2-i {
			t.Fatalf("join %d: allowance not reported %v", i+1, al)
		}
	}
	// Re-entering a room this account already paid for is free (a drop, a second tab, leave and come back).
	before := pay.calls
	r.act(a, map[string]any{"t": "leave"}, 0)
	r.act(a, map[string]any{"t": "join", "code": codes[2]}, 3)
	if a.room == nil || a.room.code != codes[2] || pay.used["u1"] != 3 || pay.calls != before {
		t.Fatal("re-entry to a paid room was refused or charged", pay.used["u1"], last(a, "err"))
	}
	// The fourth new room is refused politely, with the allowance attached.
	r.act(host, map[string]any{"t": "create", "set": map[string]any{"type": "court"}}, 3)
	r.act(a, map[string]any{"t": "join", "code": host.room.code}, 3)
	e := last(a, "err")
	if e == nil || e["code"] != "nogames" || e["allowance"] == nil || a.room == host.room {
		t.Fatal("fourth room not refused", e)
	}
	r.act(a, map[string]any{"t": "create", "set": map[string]any{"type": "court"}}, 3)
	if e := last(a, "err"); e == nil || e["code"] != "nogames" {
		t.Fatal("create after the allowance ran out was not refused", e)
	}
	r.act(a, map[string]any{"t": "quick"}, 3)
	if e := last(a, "err"); e == nil || e["code"] != "nogames" {
		t.Fatal("quick join after the allowance ran out was not refused", e)
	}
	// A Pass holder is never refused.
	for i := 0; i < 6; i++ {
		r.act(host, map[string]any{"t": "create", "set": map[string]any{"type": "court"}}, 3)
		if host.room == nil || last(host, "err") != nil {
			t.Fatal("pass holder refused")
		}
	}
}

func TestAllowanceFailsOpen(t *testing.T) {
	pay := newFakePay(3)
	pay.force, pay.out = true, spendOpen
	r := accessRig(true, "on", pay)
	a := r.signedIn("Dirk", "u1")
	for i := 0; i < 5; i++ {
		r.act(a, map[string]any{"t": "create", "set": map[string]any{"type": "court"}}, 3)
		if a.room == nil || last(a, "err") != nil {
			t.Fatal("unreachable payments locked a player out")
		}
	}
	if pay.calls != 5 {
		t.Fatal("spend not attempted per room", pay.calls)
	}
}

func TestAllowanceAutoNotLive(t *testing.T) {
	pay := newFakePay(0) // would refuse everything
	r := accessRig(false, "auto", pay)
	a := r.signedIn("Dirk", "u1")
	r.act(a, map[string]any{"t": "create", "set": map[string]any{"type": "court"}}, 3)
	if a.room == nil || pay.calls != 0 {
		t.Fatal("auto mode counted while payments are not live", pay.calls)
	}
	r.h.acc.live.Store(true)
	r.act(a, map[string]any{"t": "create", "set": map[string]any{"type": "court"}}, 3)
	if e := last(a, "err"); e == nil || e["code"] != "nogames" || pay.calls != 1 {
		t.Fatal("auto mode did not count once live", e, pay.calls)
	}
}

func TestPaymentsHTTP(t *testing.T) {
	var status int
	var testMode string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, q *http.Request) {
		switch q.URL.Path {
		case "/api/br8t/offer":
			w.Write([]byte(`{"testMode":` + testMode + `,"items":[{"entitlement":"br8t_pass","key":"br8t_pass_monthly"}]}`))
		case "/api/br8t/allowance":
			if q.Header.Get("Authorization") != "Bearer tok" {
				w.WriteHeader(401)
				return
			}
			w.WriteHeader(status)
			w.Write([]byte(`{"ok":true,"allowance":{"remaining":2}}`))
		}
	}))
	defer srv.Close()
	a := &accessCfg{mode: "auto", url: srv.URL + "/api/br8t/", game: "krayzee", client: srv.Client()}
	testMode = "true"
	if a.checkLive() {
		t.Fatal("test mode read as live")
	}
	testMode = "false"
	if !a.checkLive() {
		t.Fatal("live mode not seen")
	}
	for code, want := range map[int]spendOutcome{200: spendOK, 429: spendDenied, 404: spendOpen, 500: spendOpen} {
		status = code
		if got, _ := a.spend("tok", "id"); got != want {
			t.Fatalf("status %d → %v, want %v", code, got, want)
		}
	}
	srv.Close()
	if got, _ := a.spend("tok", "id"); got != spendOpen {
		t.Fatal("unreachable payments did not fail open")
	}
	if a.checkLive() {
		t.Fatal("unreachable payments read as live")
	}
}
