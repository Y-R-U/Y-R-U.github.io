package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coder/websocket"
)

const prefix = "/gms/2d/ragdojo/arena"

type rig struct {
	t     *testing.T
	srv   *httptest.Server
	h     *hub
	iceN  atomic.Int32
	spent sync.Map // token -> spend id
}

// newRig starts the arena with a fake snakenet /ice and a fake payment allowance service.
// The allowance refuses the account "broke".
func newRig(t *testing.T, openLobby bool) *rig {
	r := &rig{t: t}
	ice := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, q *http.Request) {
		r.iceN.Add(1)
		io.WriteString(w, `{"iceServers":[{"urls":["stun:stun.cloudflare.com:3478"]},{"urls":["turn:turn.example:3478"],"username":"u","credential":"SECRETCRED"}],"turn":true,"refreshSeconds":3600}`)
	}))
	t.Cleanup(ice.Close)
	pay := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, q *http.Request) {
		var body struct{ Game, ID string }
		json.NewDecoder(q.Body).Decode(&body)
		tok := strings.TrimPrefix(q.Header.Get("Authorization"), "Bearer ")
		r.spent.Store(tok, body.ID)
		if body.Game != "ragdojo" || len(body.ID) != 36 {
			w.WriteHeader(400)
			return
		}
		if tok == "dev:broke" {
			w.WriteHeader(429)
			io.WriteString(w, `{"ok":false,"allowance":{"remaining":0}}`)
			return
		}
		io.WriteString(w, `{"ok":true,"allowance":{"remaining":2}}`)
	}))
	t.Cleanup(pay.Close)
	st, err := openStore(filepath.Join(t.TempDir(), "a.db"))
	if err != nil {
		t.Fatal(err)
	}
	src := newIceSource(ice.URL)
	src.prime()
	r.h = newHub(st, src, newAllowance(pay.URL), devVerifier(func(context.Context, string) (identity, error) {
		return identity{}, io.EOF
	}))
	r.h.openLobby = openLobby
	go r.h.run()
	r.srv = httptest.NewServer(r.h.routes(prefix, []string{"*"}))
	t.Cleanup(r.srv.Close)
	return r
}

type tc struct {
	t    *testing.T
	ws   *websocket.Conn
	id   string
	msgs chan map[string]any
	bins chan []byte
}

func (r *rig) dial(name, tok string) *tc { c, _ := r.dialTok(name, tok); return c }

func (r *rig) resume(id, rtok string) *tc {
	c, _ := r.open("?id="+id+"&tok="+rtok, "", "", true)
	return c
}

func (r *rig) dialTok(name, tok string) (*tc, string) { return r.open("", name, tok, false) }

func (r *rig) open(q, name, tok string, resumed bool) (*tc, string) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	ws, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(r.srv.URL, "http")+prefix+"/ws"+q, nil)
	if err != nil {
		r.t.Fatal(err)
	}
	c := &tc{t: r.t, ws: ws, msgs: make(chan map[string]any, 256), bins: make(chan []byte, 64)}
	go func() {
		for {
			typ, b, err := ws.Read(context.Background())
			if err != nil {
				close(c.msgs)
				return
			}
			if typ == websocket.MessageBinary {
				c.bins <- b
				continue
			}
			var m map[string]any
			json.Unmarshal(b, &m)
			if m["t"] == "p" {
				c.send(map[string]any{"t": "q", "s": m["s"]})
				continue
			}
			c.msgs <- m
		}
	}()
	w := c.expect("welcome")
	c.id = w["id"].(string)
	r.t.Cleanup(func() { ws.Close(websocket.StatusNormalClosure, "") })
	if resumed {
		if w["resumed"] != true {
			r.t.Fatalf("not resumed: %v", w)
		}
		return c, ""
	}
	c.send(map[string]any{"t": "hello", "name": name, "tok": tok, "tz": "Australia/Sydney"})
	c.expect("me")
	return c, w["tok"].(string)
}

func (c *tc) send(v any) {
	b, _ := json.Marshal(v)
	c.ws.Write(context.Background(), websocket.MessageText, b)
}

func (c *tc) expect(t string) map[string]any {
	c.t.Helper()
	timeout := time.After(4 * time.Second)
	for {
		select {
		case m, ok := <-c.msgs:
			if !ok {
				c.t.Fatalf("socket closed waiting for %q", t)
			}
			if m["t"] == t {
				return m
			}
		case <-timeout:
			c.t.Fatalf("no %q message", t)
		}
	}
}

func (c *tc) none(t string, d time.Duration) {
	c.t.Helper()
	timeout := time.After(d)
	for {
		select {
		case m := <-c.msgs:
			if m["t"] == t {
				c.t.Fatalf("unexpected %q: %v", t, m)
			}
		case <-timeout:
			return
		}
	}
}

func num(v any) int { f, _ := v.(float64); return int(f) }

// matchUp: a waits in the lobby, b challenges, both get an offer and accept.
func matchUp(t *testing.T, a, b *tc) (string, map[string]any, map[string]any) {
	a.send(map[string]any{"t": "wait", "type": "duel"})
	b.send(map[string]any{"t": "lobby", "on": true})
	for {
		l := b.expect("lobby")
		ps, _ := l["players"].([]any)
		if len(ps) == 1 && ps[0].(map[string]any)["id"] == a.id {
			break
		}
	}
	b.send(map[string]any{"t": "challenge", "to": a.id})
	oa, ob := a.expect("offer"), b.expect("offer")
	id := oa["match"].(string)
	if ob["match"] != id {
		t.Fatal("offers disagree on the match")
	}
	return id, oa, ob
}

func playRound(t *testing.T, cs []*tc, id string, round, winner int, ko bool) {
	for _, c := range cs {
		c.send(map[string]any{"t": "round", "match": id, "round": round, "winner": winner, "ko": ko})
	}
}

func TestDuelBestOfThreeAgreedStats(t *testing.T) {
	r := newRig(t, false)
	a, b := r.dial("Alice", "dev:alice"), r.dial("Bob", "dev:bob")
	id, oa, _ := matchUp(t, a, b)
	if !strings.Contains(string(mustJSON(oa["ice"])), "SECRETCRED") || oa["turn"] != true {
		t.Fatalf("matched players get TURN: %v", oa["ice"])
	}
	for _, c := range []*tc{a, b} {
		c.send(map[string]any{"t": "accept", "match": id, "tok": "dev:" + map[*tc]string{a: "alice", b: "bob"}[c]})
	}
	ga, gb := a.expect("go"), b.expect("go")
	if num(ga["round"]) != 1 || ga["master"] != gb["master"] {
		t.Fatalf("round 1 go mismatch %v %v", ga, gb)
	}
	if v, ok := r.spent.Load("dev:alice"); !ok || len(v.(string)) != 36 {
		t.Fatal("alice's free allowance was not spent with her own token")
	}
	m1 := num(ga["master"])
	// Round 1: the master wins. Round 2 must swap the master.
	playRound(t, []*tc{a, b}, id, 1, m1, true)
	ga, gb = a.expect("go"), b.expect("go")
	if num(ga["round"]) != 2 || num(ga["master"]) != 1-m1 {
		t.Fatalf("round 2 must swap master: r1 %d, got %v", m1, ga)
	}
	// Round 2: the round-1 master loses, so it is 1-1 and the round-1 master gets round 3.
	w2 := m1
	playRound(t, []*tc{a, b}, id, 2, 1-w2, false)
	ga, _ = a.expect("go"), b.expect("go")
	// 1-1. Round 3 goes to whoever lost round 2 (= w2).
	if num(ga["round"]) != 3 || num(ga["master"]) != w2 {
		t.Fatalf("round 3 must go to the round-2 loser %d, got %v", w2, ga)
	}
	playRound(t, []*tc{a, b}, id, 3, 0, true)
	ra, rb := a.expect("result"), b.expect("result")
	if num(ra["winner"]) != 0 || num(rb["winner"]) != 0 {
		t.Fatalf("result: %v", ra)
	}
	st, _ := ra["stats"].(map[string]any)
	wantKOs := 1 + b2i(m1 == 0)
	if st == nil || num(st["battles"]) != 1 || num(st["wins"]) != 1 || num(st["kos"]) != wantKOs {
		t.Fatalf("alice (slot 0) stats after winning 2-1 with two KOs: %v", st)
	}
	stb, _ := rb["stats"].(map[string]any)
	if stb == nil || num(stb["losses"]) != 1 || num(stb["wins"]) != 0 {
		t.Fatalf("bob stats: %v", stb)
	}
	lb := getJSON(t, r.srv.URL+prefix+"/leaderboard?board=wins")
	rows := lb["rows"].([]any)
	if len(rows) != 2 || rows[0].(map[string]any)["name"] != "Alice" || num(rows[0].(map[string]any)["value"]) != 1 {
		t.Fatalf("leaderboard: %v", lb)
	}
	if strings.Contains(string(mustJSON(lb)), "alice") {
		t.Fatal("leaderboard leaks uids")
	}
	today := getJSON(t, r.srv.URL+prefix+"/leaderboard?board=today")
	if len(today["rows"].([]any)) != 2 {
		t.Fatalf("daily board: %v", today)
	}
	duel := getJSON(t, r.srv.URL+prefix+"/leaderboard?type=duel")
	if len(duel["rows"].([]any)) != 2 {
		t.Fatalf("per-type board: %v", duel)
	}

	// Rematch: both ask, a new match starts straight away with a fresh coin flip.
	a.send(map[string]any{"t": "rematch", "match": id})
	b.expect("rematch")
	b.send(map[string]any{"t": "rematch", "match": id})
	g2 := a.expect("go")
	if g2["match"] == id || num(g2["round"]) != 1 {
		t.Fatalf("rematch should be a new match at round 1: %v", g2)
	}
}

func TestDisagreementVoidsAndCountsNothing(t *testing.T) {
	r := newRig(t, false)
	a, b := r.dial("Alice", "dev:alice"), r.dial("Bob", "dev:bob")
	id, _, _ := matchUp(t, a, b)
	a.send(map[string]any{"t": "accept", "match": id})
	b.send(map[string]any{"t": "accept", "match": id})
	a.expect("go")
	b.expect("go")
	a.send(map[string]any{"t": "round", "match": id, "round": 1, "winner": 0, "ko": true})
	b.send(map[string]any{"t": "round", "match": id, "round": 1, "winner": 1, "ko": true})
	if v := a.expect("void"); v["why"] != "disagree" {
		t.Fatalf("void why: %v", v)
	}
	b.expect("void")
	lb := getJSON(t, r.srv.URL+prefix+"/leaderboard?board=battles")
	if len(lb["rows"].([]any)) != 0 {
		t.Fatalf("a void match must not count: %v", lb)
	}
	if c := r.h.st.counts(); c.Voided != 1 {
		t.Fatalf("void must be logged: %+v", c)
	}
}

func TestDropIsForfeitNotVoid(t *testing.T) {
	r := newRig(t, false)
	r.h.post(func() { r.h.awayGrace = 400 * time.Millisecond })
	a, b := r.dial("Alice", "dev:alice"), r.dial("Bob", "dev:bob")
	id, _, _ := matchUp(t, a, b)
	a.send(map[string]any{"t": "accept", "match": id})
	b.send(map[string]any{"t": "accept", "match": id})
	a.expect("go")
	// Bob was winning round 1, then his socket died and he never came back.
	b.ws.Close(websocket.StatusGoingAway, "")
	if w := a.expect("away"); num(w["ms"]) != 400 {
		t.Fatalf("away notice: %v", w)
	}
	res := a.expect("result")
	if num(res["winner"]) != 0 || res["forfeit"] != true || res["counted"] != true {
		t.Fatalf("a drop past the grace is a forfeit win for the one who stayed: %v", res)
	}
	if st := res["stats"].(map[string]any); num(st["wins"]) != 1 {
		t.Fatalf("forfeit counts: %v", st)
	}
	lb := getJSON(t, r.srv.URL+prefix+"/leaderboard?board=losses")
	rows := lb["rows"].([]any)
	if len(rows) != 2 || rows[0].(map[string]any)["name"] != "Bob" {
		t.Fatalf("the leaver takes the loss: %v", lb)
	}
}

func TestRageQuitIsImmediateForfeit(t *testing.T) {
	r := newRig(t, false)
	a, b := r.dial("Alice", "dev:alice"), r.dial("Bob", "dev:bob")
	id, _, _ := matchUp(t, a, b)
	a.send(map[string]any{"t": "accept", "match": id})
	b.send(map[string]any{"t": "accept", "match": id})
	a.expect("go")
	b.expect("go")
	a.send(map[string]any{"t": "leave"})
	res := b.expect("result")
	if num(res["winner"]) != 1 || res["forfeit"] != true {
		t.Fatalf("rage-quit: %v", res)
	}
	if c := r.h.st.counts(); c.Voided != 0 || c.Matches != 1 {
		t.Fatalf("a rage-quit is a counted result, not a void: %+v", c)
	}
}

func TestReconnectInsideGraceKeepsTheMatch(t *testing.T) {
	r := newRig(t, false)
	a := r.dial("Alice", "dev:alice")
	b, tok := r.dialTok("Bob", "dev:bob")
	id, _, _ := matchUp(t, a, b)
	a.send(map[string]any{"t": "accept", "match": id})
	b.send(map[string]any{"t": "accept", "match": id})
	a.expect("go")
	b.expect("go")
	b.ws.Close(4000, "blip")
	a.expect("away")
	b2 := r.resume(b.id, tok)
	g := b2.expect("go")
	if g["match"] != id || num(g["round"]) != 1 {
		t.Fatalf("resumed player gets the round back: %v", g)
	}
	if bk := a.expect("back"); num(bk["slot"]) != 1 {
		t.Fatalf("back: %v", bk)
	}
	playRound(t, []*tc{a, b2}, id, 1, 0, true)
	a.expect("go")
}

func TestAnonymousFriendLinkButNoLobbyNoBoard(t *testing.T) {
	r := newRig(t, false)
	a, b := r.dial("Mum", "dev:mum"), r.dial("Kid", "")
	b.send(map[string]any{"t": "wait", "type": "duel"})
	if e := b.expect("err"); e["code"] != "signin" {
		t.Fatalf("anonymous must not wait in the public lobby: %v", e)
	}
	a.send(map[string]any{"t": "friend"})
	f := a.expect("friend")
	code := f["code"].(string)
	b.send(map[string]any{"t": "join", "code": strings.ToLower(code)})
	ob := b.expect("offer")
	a.expect("offer")
	if ob["counted"] != true {
		t.Fatal("a match with one signed-in player counts for that player")
	}
	id := ob["match"].(string)
	a.send(map[string]any{"t": "accept", "match": id})
	b.send(map[string]any{"t": "accept", "match": id})
	a.expect("go")
	b.expect("go")
	for round := 1; round <= 2; round++ {
		playRound(t, []*tc{a, b}, id, round, 1, true)
		if round == 1 {
			a.expect("go")
			b.expect("go")
		}
	}
	rb := b.expect("result")
	if rb["counted"] != false || rb["stats"] != nil {
		t.Fatalf("anonymous gets no stats: %v", rb)
	}
	lb := getJSON(t, r.srv.URL+prefix+"/leaderboard?board=battles")
	rows := lb["rows"].([]any)
	if len(rows) != 1 || rows[0].(map[string]any)["name"] != "Mum" {
		t.Fatalf("only the signed-in player is on the board: %v", lb)
	}
	// A used code is gone.
	c := r.dial("Late", "")
	c.send(map[string]any{"t": "join", "code": code})
	if e := c.expect("err"); e["code"] != "nocode" {
		t.Fatalf("used code: %v", e)
	}
}

func TestTurnOnlyForMatchedAndRelayStaysInMatch(t *testing.T) {
	r := newRig(t, true)
	a, b, x := r.dial("A", ""), r.dial("B", ""), r.dial("X", "")
	// welcome carries STUN only; nobody unmatched ever sees the TURN credential.
	x.send(map[string]any{"t": "lobby", "on": true})
	x.none("offer", 100*time.Millisecond)
	id, _, _ := matchUp(t, a, b)
	_ = id
	// Signalling and relay frames reach the peer...
	a.send(map[string]any{"t": "sig", "to": b.id, "d": map[string]any{"sdp": 1}})
	if s := b.expect("sig"); s["from"] != a.id {
		t.Fatalf("sig: %v", s)
	}
	frame := append([]byte{byte(len(b.id))}, b.id...)
	frame = append(frame, 'u', 9, 9)
	a.ws.Write(context.Background(), websocket.MessageBinary, frame)
	select {
	case got := <-b.bins:
		if string(got[1:1+got[0]]) != a.id || got[len(got)-1] != 9 {
			t.Fatalf("relay frame: %v", got)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("relay frame not delivered")
	}
	// ...but never to someone outside the match.
	a.send(map[string]any{"t": "sig", "to": x.id, "d": 1})
	frame = append([]byte{byte(len(x.id))}, x.id...)
	a.ws.Write(context.Background(), websocket.MessageBinary, append(frame, 'u', 1))
	x.none("sig", 300*time.Millisecond)
	select {
	case <-x.bins:
		t.Fatal("relay leaked outside the match")
	case <-time.After(200 * time.Millisecond):
	}
}

func TestAllowanceExhaustedCancels(t *testing.T) {
	r := newRig(t, false)
	a, b := r.dial("Broke", "dev:broke"), r.dial("Bob", "dev:bob")
	id, _, _ := matchUp(t, a, b)
	a.send(map[string]any{"t": "accept", "match": id, "tok": "dev:broke"})
	b.send(map[string]any{"t": "accept", "match": id, "tok": "dev:bob"})
	if e := a.expect("err"); e["code"] != "allowance" {
		t.Fatalf("broke: %v", e)
	}
	if c := b.expect("cancel"); c["why"] != "allowance" {
		t.Fatalf("bob: %v", c)
	}
}

func TestIceCachedAndFallsBack(t *testing.T) {
	r := newRig(t, true)
	for i := 0; i < 3; i++ {
		a, b := r.dial("A", ""), r.dial("B", "")
		matchUp(t, a, b)
	}
	if n := r.iceN.Load(); n != 1 {
		t.Fatalf("ice fetched %d times, want 1 (cached)", n)
	}
	dead := newIceSource("http://127.0.0.1:1/ice")
	dead.prime()
	if s, turn := dead.get(); turn || string(s) != string(stunOnly) {
		t.Fatalf("unreachable ice must fall back to STUN: %s %v", s, turn)
	}
}

func TestInternalStatsLoopbackOnly(t *testing.T) {
	r := newRig(t, false)
	res, err := http.Get(r.srv.URL + "/internal/stats")
	if err != nil || res.StatusCode != 200 {
		t.Fatalf("loopback stats: %v %v", err, res)
	}
	var body map[string]any
	json.NewDecoder(res.Body).Decode(&body)
	if body["app"] != "ragdojo-arena" {
		t.Fatalf("stats body: %v", body)
	}
	for _, hdr := range []string{"X-Forwarded-For", "X-Forwarded-Host", "Forwarded", "Origin"} {
		req, _ := http.NewRequest("GET", r.srv.URL+"/internal/stats", nil)
		req.Header.Set(hdr, "1.2.3.4")
		res, _ := http.DefaultClient.Do(req)
		if res.StatusCode != 404 {
			t.Fatalf("%s must 404, got %d", hdr, res.StatusCode)
		}
	}
}

func TestProfaneNameRefused(t *testing.T) {
	r := newRig(t, false)
	a := r.dial("Alice", "")
	a.send(map[string]any{"t": "name", "name": "fuckface"})
	if e := a.expect("err"); e["code"] != "name" {
		t.Fatalf("profanity: %v", e)
	}
	if me := a.expect("me"); me["name"] != "Alice" {
		t.Fatalf("name kept: %v", me)
	}
}

func getJSON(t *testing.T, url string) map[string]any {
	res, err := http.Get(url)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	var out map[string]any
	json.NewDecoder(res.Body).Decode(&out)
	return out
}

func mustJSON(v any) []byte { b, _ := json.Marshal(v); return b }

func TestLanResultsKeptLinkedAndUploadable(t *testing.T) {
	r := newRig(t, true)
	r.h.post(func() {
		r.h.lan, r.h.verify = true, lanVerifier
		r.h.linkAuth = devVerifier(func(context.Context, string) (identity, error) { return identity{}, io.EOF })
	})
	a, b := r.dial("Kid A", "lan:deviceaaa"), r.dial("Kid B", "lan:devicebbb")
	// Kid A's device is also signed in to br8t: link it.
	a.send(map[string]any{"t": "hello", "name": "Kid A", "tok": "lan:deviceaaa", "link": "dev:firebase-a"})
	a.expect("me")
	id, _, _ := matchUp(t, a, b)
	a.send(map[string]any{"t": "accept", "match": id})
	b.send(map[string]any{"t": "accept", "match": id})
	a.expect("go")
	b.expect("go")
	playRound(t, []*tc{a, b}, id, 1, 0, true)
	a.expect("go")
	b.expect("go")
	playRound(t, []*tc{a, b}, id, 2, 0, true)
	if res := a.expect("result"); res["counted"] != true {
		t.Fatalf("LAN players are counted on the LAN server: %v", res)
	}
	got, mark, err := r.h.st.uploadLanResults(10)
	if err != nil || len(got) != 1 || got[0].FirebaseUID != "firebase-a" || got[0].Device != "lan:deviceaaa" || !got[0].Won {
		t.Fatalf("only the linked device's result is ready to upload: %+v %v", got, err)
	}
	if err := mark(); err != nil {
		t.Fatal(err)
	}
	if again, _, _ := r.h.st.uploadLanResults(10); len(again) != 0 {
		t.Fatalf("uploaded rows must not come back: %+v", again)
	}
	// Linking Kid B later makes B's result uploadable too.
	r.h.st.linkDevice("lan:devicebbb", "firebase-b")
	if later, _, _ := r.h.st.uploadLanResults(10); len(later) != 1 || later[0].FirebaseUID != "firebase-b" {
		t.Fatalf("late link: %+v", later)
	}
}
