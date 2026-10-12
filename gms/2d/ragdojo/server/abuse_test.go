package main

// The hostile review (R1, 2026-10-13) proved each of these exploits with a test that passed
// while it worked. They are ported here inverted: each one FAILS while its exploit works.

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"runtime/debug"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func httptestHang(t *testing.T) string {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-time.After(5 * time.Second):
		}
	}))
	t.Cleanup(s.Close)
	return s.URL
}

func jsonUnmarshal(b []byte, v any) error { return json.Unmarshal(b, v) }

func mkdirAll(t *testing.T, file string) {
	if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
		t.Fatal(err)
	}
}

func writeFile(t *testing.T, p, s string) {
	if err := os.WriteFile(p, []byte(s), 0o644); err != nil {
		t.Fatal(err)
	}
}

func spentCount(r *rig) int {
	n := 0
	r.spent.Range(func(_, _ any) bool { n++; return true })
	return n
}

func onHub[T any](r *rig, f func() T) T {
	ch := make(chan T, 1)
	r.h.post(func() { ch <- f() })
	return <-ch
}

func rawWS(t *testing.T, r *rig, hdr http.Header) (*websocket.Conn, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	ws, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(r.srv.URL, "http")+prefix+"/ws", &websocket.DialOptions{HTTPHeader: hdr})
	if err == nil {
		t.Cleanup(func() { ws.CloseNow() })
	}
	return ws, err
}

// readType reads raw frames until one of type typ (or an error).
func readType(ctx context.Context, ws *websocket.Conn, typ string) (map[string]any, error) {
	for {
		_, b, err := ws.Read(ctx)
		if err != nil {
			return nil, err
		}
		var m map[string]any
		jsonUnmarshal(b, &m)
		if m["t"] == typ {
			return m, nil
		}
	}
}

// F1: a ranked seat with no token, a junk token or someone else's token never reached the
// payment service and still played a counted match.
func TestAllowanceNeedsTheSeatsOwnToken(t *testing.T) {
	r := newRig(t, false)
	for i, toks := range [][2]any{{nil, "x.y.z"}, {"dev:bob", "dev:bob"}, {"", "dev:bob"}} {
		a, b := r.dial("Broke", "dev:broke"), r.dial("Bob", "dev:bob")
		id, _, _ := matchUp(t, a, b)
		am := map[string]any{"t": "accept", "match": id}
		if toks[0] != nil {
			am["tok"] = toks[0]
		}
		a.send(am)
		b.send(map[string]any{"t": "accept", "match": id, "tok": toks[1]})
		if c := b.expect("cancel"); c["why"] != "signin" {
			t.Fatalf("case %d: a seat without its own token must cancel with signin: %v", i, c)
		}
		a.none("go", 100*time.Millisecond)
		a.send(map[string]any{"t": "leave"})
		b.send(map[string]any{"t": "leave"})
	}
	if l, ok := r.h.st.mine("broke"); ok && l.Battles > 0 {
		t.Fatalf("broke played %d counted battles", l.Battles)
	}
	if n := spentCount(r); n != 0 {
		t.Fatalf("payment service called %d times for unpaid seats", n)
	}
}

// The payment service: 401/403/400 refuse, a 5xx (or no answer) lets play go ahead.
func TestAllowanceRefusalVersusOutage(t *testing.T) {
	r := newRig(t, false)
	a, b := r.dial("Ref", "dev:refused"), r.dial("Bob", "dev:bob")
	id, _, _ := matchUp(t, a, b)
	a.accept(id)
	b.accept(id)
	if c := b.expect("cancel"); c["why"] != "signin" {
		t.Fatalf("a 401 from the payment service is a refusal: %v", c)
	}
	a.send(map[string]any{"t": "leave"})
	b.send(map[string]any{"t": "leave"})
	c, d := r.dial("Down", "dev:billingdown"), r.dial("Dee", "dev:dee")
	id, _, _ = matchUp(t, c, d)
	c.accept(id)
	d.accept(id)
	if g := c.expect("go"); num(g["freeLeft"]) != -1 {
		t.Fatalf("a 503 fails open: %v", g)
	}
}

// A rematch pays with the token sent WITH the rematch, never the first accept's.
func TestRematchNeedsAFreshToken(t *testing.T) {
	r := newRig(t, false)
	c, d := r.dial("Cat", "dev:cat"), r.dial("Dog", "dev:dog")
	id, _, _ := matchUp(t, c, d)
	c.accept(id)
	d.accept(id)
	c.expect("go")
	d.expect("go")
	playRound(t, []*tc{c, d}, id, 1, 0, true)
	c.expect("go")
	d.expect("go")
	playRound(t, []*tc{c, d}, id, 2, 0, true)
	c.expect("result")
	d.expect("result")
	c.send(map[string]any{"t": "rematch", "match": id})
	d.expect("rematch")
	d.send(map[string]any{"t": "rematch", "match": id})
	if x := c.expect("cancel"); x["why"] != "signin" {
		t.Fatalf("a rematch without a fresh token must not reuse the old one: %v", x)
	}
	c.none("go", 100*time.Millisecond)
}

// F2: two accounts farmed wins by one of them quitting straight after "go".
func TestEarlyForfeitPaysNobody(t *testing.T) {
	r := newRig(t, false)
	a, b := r.dial("Farmer", "dev:farmer"), r.dial("Mule", "dev:mule")
	for i := 0; i < 3; i++ {
		id, _, _ := matchUp(t, a, b)
		a.accept(id)
		b.accept(id)
		a.expect("go")
		b.expect("go")
		b.send(map[string]any{"t": "leave"})
		if res := a.expect("result"); res["forfeit"] != true || res["counted"] != false {
			t.Fatalf("an early forfeit is not counted for the stayer: %v", res)
		}
		a.send(map[string]any{"t": "leave"})
		time.Sleep(20 * time.Millisecond)
	}
	if l, _ := r.h.st.mine("farmer"); l.Wins != 0 || l.BestStreak != 0 {
		t.Fatalf("farmed %d wins, streak %d", l.Wins, l.BestStreak)
	}
	if l, _ := r.h.st.mine("mule"); l.Losses != 3 {
		t.Fatalf("the leaver takes each loss: %+v", l)
	}
	var pts int
	r.h.st.db.QueryRow(`SELECT COUNT(*) FROM ev_arena`).Scan(&pts)
	if pts != 0 {
		t.Fatalf("early forfeits earned event points: %d rows", pts)
	}
}

// ...and once past the first agreed round, the same pair counts at most 3 results a day,
// friend links included.
func TestPairCapThreeADay(t *testing.T) {
	r := newRig(t, false)
	r.h.post(func() { r.h.earlyFF = 0 })
	a, b := r.dial("Farmer", "dev:farmer"), r.dial("Mule", "dev:mule")
	for i := 0; i < 5; i++ {
		a.send(map[string]any{"t": "friend", "type": "duel"})
		f := a.expect("friend")
		b.send(map[string]any{"t": "join", "code": f["code"]})
		id := a.expect("offer")["match"].(string)
		b.expect("offer")
		a.accept(id)
		b.accept(id)
		a.expect("go")
		b.expect("go")
		playRound(t, []*tc{a, b}, id, 1, 0, true)
		a.expect("go")
		b.expect("go")
		b.send(map[string]any{"t": "leave"})
		res := a.expect("result")
		if want := i < 3; res["counted"] != want {
			t.Fatalf("match %d counted=%v, want %v", i+1, res["counted"], want)
		}
		a.send(map[string]any{"t": "leave"})
	}
	if l, _ := r.h.st.mine("farmer"); l.Wins != 3 {
		t.Fatalf("pair cap: %d wins", l.Wins)
	}
	// Two sockets on one account never count against each other.
	c, d := r.dial("Me", "dev:solo"), r.dial("Me too", "dev:solo")
	c.send(map[string]any{"t": "friend", "type": "duel"})
	f := c.expect("friend")
	d.send(map[string]any{"t": "join", "code": f["code"]})
	id := c.expect("offer")["match"].(string)
	d.expect("offer")
	c.accept(id)
	d.accept(id)
	c.expect("go")
	d.expect("go")
	playRound(t, []*tc{c, d}, id, 1, 0, true)
	c.expect("go")
	d.expect("go")
	playRound(t, []*tc{c, d}, id, 2, 0, true)
	if res := c.expect("result"); res["counted"] != false {
		t.Fatalf("self-play counted: %v", res)
	}
}

// F3: the loser voided a lost match by staying silent...
func TestSilentLoserForfeits(t *testing.T) {
	r := newRig(t, false)
	r.h.post(func() { r.h.reportWindow = 300 * time.Millisecond; r.h.earlyFF = 0 })
	a, b := r.dial("Alice", "dev:alice"), r.dial("Sore", "dev:sore")
	id, _, _ := matchUp(t, a, b)
	a.accept(id)
	b.accept(id)
	a.expect("go")
	b.expect("go")
	playRound(t, []*tc{a, b}, id, 1, 0, true)
	a.expect("go")
	b.expect("go")
	a.send(map[string]any{"t": "round", "match": id, "round": 2, "winner": 0, "ko": true})
	res := a.expect("result")
	if res["forfeit"] != true || num(res["winner"]) != 0 || res["counted"] != true {
		t.Fatalf("silence past the report window is a forfeit: %v", res)
	}
	if l, _ := r.h.st.mine("sore"); l.Losses != 1 {
		t.Fatalf("no loss for the silent seat: %+v", l)
	}
}

// ...or by disagreeing. Disputes are kept per account; a record of them turns the next
// disputed match into a loss, and hides the account from the boards.
func TestRepeatDisputerLoses(t *testing.T) {
	r := newRig(t, false)
	sore := r.dial("Sore", "dev:sore")
	for i := 0; i < 3; i++ {
		o := r.dial(fmt.Sprintf("Opp%d", i), fmt.Sprintf("dev:opp%d", i))
		id, _, _ := matchUp(t, o, sore)
		o.accept(id)
		sore.accept(id)
		o.expect("go")
		sore.expect("go")
		o.send(map[string]any{"t": "round", "match": id, "round": 1, "winner": 0, "ko": true})
		sore.send(map[string]any{"t": "round", "match": id, "round": 1, "winner": 1, "ko": true})
		if v := o.expect("void"); v["why"] != "disagree" {
			t.Fatalf("a first dispute is a void: %v", v)
		}
	}
	var n int
	r.h.st.db.QueryRow(`SELECT COUNT(*) FROM disputes WHERE uid='sore'`).Scan(&n)
	if n != 3 {
		t.Fatalf("disputes per uid: %d", n)
	}
	a := r.dial("Alice", "dev:alice")
	id, _, _ := matchUp(t, a, sore)
	a.accept(id)
	sore.accept(id)
	a.expect("go")
	sore.expect("go")
	playRound(t, []*tc{a, sore}, id, 1, 0, true)
	a.expect("go")
	sore.expect("go")
	a.send(map[string]any{"t": "round", "match": id, "round": 2, "winner": 0, "ko": true})
	sore.send(map[string]any{"t": "round", "match": id, "round": 2, "winner": 1, "ko": true})
	res := a.expect("result")
	if num(res["winner"]) != 0 || res["counted"] != true {
		t.Fatalf("a repeat disputer's disputed match is a loss for them: %v", res)
	}
	if l, _ := r.h.st.mine("sore"); l.Losses != 1 {
		t.Fatalf("sore: %+v", l)
	}
	if l, _ := r.h.st.mine("alice"); l.Wins != 1 {
		t.Fatalf("alice: %+v", l)
	}
	lb := getJSON(t, r.srv.URL+prefix+"/leaderboard?board=losses")
	if strings.Contains(string(mustJSON(lb)), "Sore") {
		t.Fatalf("a flagged account is on the boards: %v", lb)
	}
}

// The same rules in a room: a flagged dissenter loses to the majority; a silent seat is out.
func TestRoomDisputeAndSilence(t *testing.T) {
	r := newRig(t, false)
	for i := 0; i < 3; i++ {
		r.h.st.recordDispute(fmt.Sprintf("old%d", i), []string{"f2"})
	}
	cs, id := startRoom3(t, r, "lms")
	for i, c := range cs {
		place := []int{2, 1, 3}
		if i == 2 {
			place = []int{3, 2, 1}
		}
		c.send(map[string]any{"t": "round", "match": id, "round": 1, "winner": map[bool]int{true: 2, false: 1}[i == 2], "ko": true, "place": place})
	}
	res := cs[0].expect("result")
	if num(res["winner"]) != 1 {
		t.Fatalf("the majority counts against a flagged dissenter: %v", res)
	}
	r.h.post(func() { r.h.reportWindow = 300 * time.Millisecond })
	r2 := newRig(t, false)
	r2.h.post(func() { r2.h.reportWindow = 300 * time.Millisecond })
	cs, id = startRoom3(t, r2, "hill")
	for _, c := range cs[:2] {
		c.send(map[string]any{"t": "round", "match": id, "round": 1, "winner": 0, "ko": false, "place": []int{1, 2, 3}})
	}
	if o := cs[0].expect("out"); num(o["slot"]) != 2 || o["why"] != "silent" {
		t.Fatalf("a silent room seat is out: %v", o)
	}
	if res := cs[0].expect("result"); num(res["winner"]) != 0 || res["forfeit"] == true {
		t.Fatalf("the rest's agreed result counts: %v", res)
	}
}

// F4: sockets that never say hello (or stop answering pings) held every slot for good.
func TestIdleSocketsAreReaped(t *testing.T) {
	r := newRig(t, false)
	r.h.post(func() { r.h.pongLate = time.Minute }) // only the hello rule may reap them
	for i := 0; i < maxClients; i++ {
		if _, err := rawWS(t, r, nil); err != nil {
			t.Fatal(err)
		}
	}
	time.Sleep(helloWithin + 1500*time.Millisecond)
	ws, err := rawWS(t, r, nil)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if _, err := readType(ctx, ws, "welcome"); err != nil {
		t.Fatalf("a real player after %v of silent sockets: %v", helloWithin, err)
	}
}

func TestDeadReaderIsReaped(t *testing.T) {
	r := newRig(t, false)
	r.h.post(func() { r.h.pongLate = 500 * time.Millisecond })
	ws, _ := rawWS(t, r, nil)
	ws.Write(context.Background(), websocket.MessageText, []byte(`{"t":"hello","name":"Zombie"}`))
	time.Sleep(200 * time.Millisecond)
	if n := onHub(r, func() int { return len(r.h.clients) }); n != 1 {
		t.Fatalf("clients %d", n)
	}
	time.Sleep(pingEvery + 1500*time.Millisecond)
	if n := onHub(r, func() int { return len(r.h.clients) }); n != 0 {
		t.Fatal("a socket that never answers pings was kept")
	}
}

func TestPerIPCap(t *testing.T) {
	r := newRig(t, false)
	r.h.post(func() { r.h.perIP = 3 })
	xff := func(v string) http.Header { return http.Header{"X-Forwarded-For": {v}} }
	for i := 0; i < 3; i++ {
		ws, _ := rawWS(t, r, xff("203.0.113.7"))
		if _, err := readType(context.Background(), ws, "welcome"); err != nil {
			t.Fatal(err)
		}
	}
	for _, h := range []string{"203.0.113.7", "198.51.100.1, 203.0.113.7"} {
		ws, _ := rawWS(t, r, xff(h))
		if _, err := readType(context.Background(), ws, "welcome"); err == nil || !strings.Contains(err.Error(), "too many") {
			t.Fatalf("XFF %q: the 4th socket from one address: %v", h, err)
		}
	}
	ws, _ := rawWS(t, r, xff("203.0.113.7, 198.51.100.1"))
	if _, err := readType(context.Background(), ws, "welcome"); err != nil {
		t.Fatalf("another address (right-most hop): %v", err)
	}
	req := httptest.NewRequest("GET", "/", nil)
	req.RemoteAddr = "192.0.2.9:5555"
	req.Header.Set("X-Forwarded-For", "203.0.113.7")
	if ip := clientIP(req); ip != "192.0.2.9" {
		t.Fatalf("X-Forwarded-For trusted from a non-loopback peer: %s", ip)
	}
}

// A match in play ends even if nobody ever reports.
func TestRoundHardDeadline(t *testing.T) {
	r := newRig(t, false)
	r.h.post(func() { r.h.duelCap = 400 * time.Millisecond })
	a, b := r.dial("Alice", "dev:alice"), r.dial("Bob", "dev:bob")
	id, _, _ := matchUp(t, a, b)
	a.accept(id)
	b.accept(id)
	a.expect("go")
	if v := a.expect("void"); v["why"] != "timeout" {
		t.Fatalf("hard deadline: %v", v)
	}
	if n := onHub(r, func() int { return len(r.h.matches) }); n != 0 {
		t.Fatalf("%d matches left open", n)
	}
}

// F5: a lone anonymous room creator got TURN credentials.
func TestNoTurnForASoloRoom(t *testing.T) {
	r := newRig(t, false)
	a := r.dial("Nobody", "")
	a.send(map[string]any{"t": "friend", "type": "lms"})
	code := a.expect("friend")["code"]
	if o := a.expect("offer"); strings.Contains(string(mustJSON(o)), "SECRETCRED") || o["ice"] != nil {
		t.Fatalf("a room of one got ice: %v", o)
	}
	b := r.dial("Somebody", "")
	b.send(map[string]any{"t": "join", "code": code})
	if o := b.expect("offer"); !strings.Contains(string(mustJSON(o["ice"])), "SECRETCRED") {
		t.Fatalf("a room of two links with TURN: %v", o)
	}
}

// F6: one socket's name changes rebuilt the lobby for everyone and dropped slow readers.
func TestLobbyFloodKeepsSlowReaders(t *testing.T) {
	r := newRig(t, true)
	for i := 0; i < 40; i++ {
		c := r.dial(fmt.Sprintf("W%02d", i), "")
		c.send(map[string]any{"t": "wait", "type": "duel"})
	}
	vws, _ := rawWS(t, r, nil)
	ctx := context.Background()
	vws.Write(ctx, websocket.MessageText, []byte(`{"t":"hello","name":"Victim"}`))
	vws.Write(ctx, websocket.MessageText, []byte(`{"t":"lobby","on":true}`))
	time.Sleep(300 * time.Millisecond)
	victim := onHub(r, func() *client {
		for _, c := range r.h.clients {
			if c.name == "Victim" {
				return c
			}
		}
		return nil
	})
	atk := r.dial("Atk", "")
	for i := 0; i < 20000; i++ {
		atk.send(map[string]any{"t": "name", "name": fmt.Sprintf("A%d", i%2)})
	}
	time.Sleep(time.Second)
	if gone := onHub(r, func() bool { return r.h.clients[victim.id] == nil }); gone {
		t.Fatal("a slow lobby reader was dropped by someone else's name changes")
	}
	if q := victim.queued.Load(); q > maxQueued {
		t.Fatalf("victim queue %d bytes", q)
	}
}

// F7: every "auth" spawned a goroutine; a stalled verifier piled them up.
func TestAuthFloodOneCheckAtATime(t *testing.T) {
	r := newRig(t, false)
	r.h.post(func() {
		r.h.verify = func(ctx context.Context, tok string) (identity, error) {
			<-ctx.Done()
			return identity{}, ctx.Err()
		}
	})
	a := r.dial("Atk", "")
	base := runtime.NumGoroutine()
	tok := strings.Repeat("A", 8000) + ".b.c"
	for i := 0; i < 20000; i++ {
		a.send(map[string]any{"t": "auth", "tok": tok})
	}
	time.Sleep(500 * time.Millisecond)
	if n := runtime.NumGoroutine() - base; n > 20 {
		t.Fatalf("%d extra goroutines from one socket", n)
	}
}

// F13: an expired certificate cache retried the fetch under the lock for every verify.
func TestCertRefreshDoesNotBlockVerifies(t *testing.T) {
	f := newTokenFixture(t)
	tok := f.sign(t, "kid1", f.key, nil)
	if _, e := f.v.verify(context.Background(), tok); e != nil {
		t.Fatal(e)
	}
	f.v.certsURL = httptestHang(t)
	f.v.http.Timeout = time.Second
	f.now = f.now.Add(2 * time.Hour)
	tok = f.sign(t, "kid1", f.key, nil)
	var wg sync.WaitGroup
	var okN atomic.Int32
	t0 := time.Now()
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, e := f.v.verify(context.Background(), tok); e == nil {
				okN.Add(1)
			}
		}()
	}
	wg.Wait()
	if el := time.Since(t0); okN.Load() != 5 || el > 300*time.Millisecond {
		t.Fatalf("stale keys must keep verifying: %d ok in %v", okN.Load(), el)
	}
	// The failed fetch keeps the old keys and waits a minute before trying again.
	time.Sleep(1200 * time.Millisecond)
	if _, e := f.v.verify(context.Background(), tok); e != nil {
		t.Fatalf("old keys dropped after a failed refresh: %v", e)
	}
	f.v.mu.Lock()
	retry := f.v.retryAt
	f.v.mu.Unlock()
	if !retry.After(f.now) {
		t.Fatalf("no retry backoff after a failed fetch: %v", retry)
	}
}

// F8: friend codes could be guessed thousands of times a second.
func TestJoinGuessesLimited(t *testing.T) {
	r := newRig(t, false)
	a := r.dial("Atk", "")
	for i := 0; i < 50; i++ {
		a.send(map[string]any{"t": "join", "code": "ABCDE"})
	}
	nocode := 0
	timeout := time.After(time.Second)
	for done := false; !done; {
		select {
		case m := <-a.msgs:
			if m["t"] == "err" && m["code"] == "nocode" {
				nocode++
			}
		case <-timeout:
			done = true
		}
	}
	if nocode > joinFailsPerMin {
		t.Fatalf("%d code guesses checked in a second", nocode)
	}
}

// F9: concurrent guesses all saw the one guess that was left.
func TestGuessRaceAllowsOneGuess(t *testing.T) {
	r := newEvRig(t)
	ev := "reveal-week:2026-W42"
	r.sync(t, "racer", map[string]any{"event": ev, "b": [][]any{camp("c1", 1, r.now.Add(-time.Hour))}})
	var wg sync.WaitGroup
	var oks atomic.Int32
	for round := 0; round < 4; round++ {
		for _, c := range []string{placeholderAnswer, "A TEA PARTY", "A CAT", "A BOAT"} {
			wg.Add(1)
			go func(c string) {
				defer wg.Done()
				if code, _ := call(t, "POST", r.srv.URL+prefix+"/events/guess", "dev:racer", map[string]any{"event": ev, "pic": "heroic", "choice": c}); code == 200 {
					oks.Add(1)
				}
			}(c)
		}
	}
	wg.Wait()
	if oks.Load() > 1 {
		t.Fatalf("%d guesses accepted with one allowed", oks.Load())
	}
}

// F10: one sync on the last day of a weekly event filled every past day's campaign cap.
func TestCampaignBackdateRejected(t *testing.T) {
	r := newEvRig(t)
	r.now = time.Date(2026, 10, 18, 22, 0, 0, 0, time.UTC)
	ev := "reveal-week:2026-W42"
	mon := time.Date(2026, 10, 12, 0, 0, 0, 0, time.UTC)
	var b [][]any
	for d := 0; d < 7; d++ {
		for k := 0; k < 10; k++ {
			b = append(b, camp(fmt.Sprintf("d%dk%d", d, k), 3, mon.Add(time.Duration(d)*24*time.Hour+time.Duration(k)*2*time.Minute)))
		}
	}
	_, out := r.sync(t, "late", map[string]any{"event": ev, "name": "Late", "b": b})
	if p := out["points"].(float64); p > 30 {
		t.Fatalf("backdated claims: %v points in one sync", p)
	}
	// After a sync, a fight dated well before it is refused too.
	_, out = r.sync(t, "late", map[string]any{"event": ev, "b": [][]any{camp("old", 3, r.now.Add(-time.Hour))}})
	if p := out["points"].(float64); p > 30 {
		t.Fatalf("a fight dated before the previous sync was accepted: %v", p)
	}
}

// F11: a room's void detached an eliminated seat from the duel it had moved on to.
func TestRoomVoidLeavesAnOutSeatsNewMatch(t *testing.T) {
	r := newRig(t, false)
	r.h.post(func() { r.h.awayGrace = 300 * time.Millisecond })
	cs, id := startRoom3(t, r, "lms")
	x := cs[2]
	x.send(map[string]any{"t": "leave"})
	x.expect("out")
	x.send(map[string]any{"t": "friend", "type": "duel"})
	f := x.expect("friend")
	d := r.dial("Dee", "dev:dee")
	d.send(map[string]any{"t": "join", "code": f["code"]})
	mid := x.expect("offer")["match"].(string)
	d.expect("offer")
	x.send(map[string]any{"t": "accept", "match": mid, "tok": "dev:f2"})
	d.accept(mid)
	x.expect("go")
	d.expect("go")
	cs[0].send(map[string]any{"t": "round", "match": id, "round": 1, "winner": 0, "place": []int{1, 2, 3}})
	cs[1].send(map[string]any{"t": "round", "match": id, "round": 1, "winner": 1, "place": []int{2, 1, 3}})
	cs[0].expect("void")
	time.Sleep(100 * time.Millisecond)
	x.send(map[string]any{"t": "leave"})
	if res := d.expect("result"); res["forfeit"] != true || num(res["winner"]) != 1 {
		t.Fatalf("X's quit must still forfeit the duel: %v", res)
	}
	if open := onHub(r, func() bool { return r.h.matches[mid] != nil && r.h.matches[mid].state == mPlay }); open {
		t.Fatal("the duel is still running")
	}
}

// F14: a relay queue of 512 frames held up to 16 MB per slow reader.
func TestRelayMemoryBounded(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}
	old := debug.SetMemoryLimit(48 << 20)
	defer debug.SetMemoryLimit(old)
	r := newRig(t, false)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	for p := 0; p < 10; p++ {
		a := r.dial(fmt.Sprintf("A%d", p), "")
		a.send(map[string]any{"t": "friend", "type": "duel"})
		f := a.expect("friend")
		bws, _ := rawWS(t, r, nil)
		bws.Write(ctx, websocket.MessageText, []byte(`{"t":"hello","name":"B"}`))
		bws.Write(ctx, websocket.MessageText, mustJSON(map[string]any{"t": "join", "code": f["code"]}))
		w, _ := readType(ctx, bws, "welcome")
		bid := w["id"].(string)
		o := a.expect("offer")
		a.accept(o["match"].(string))
		bws.Write(ctx, websocket.MessageText, mustJSON(map[string]any{"t": "accept", "match": o["match"]}))
		a.expect("go")
		go func() {
			for {
				select {
				case <-ctx.Done():
					return
				case <-time.After(time.Second):
				}
				if _, _, err := bws.Read(ctx); err != nil {
					return
				}
			}
		}()
		frame := append([]byte{byte(len(bid))}, bid...)
		frame = append(frame, make([]byte, 32<<10-len(frame)-1)...)
		go func() {
			tk := time.NewTicker(125 * time.Millisecond)
			defer tk.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-tk.C:
					a.ws.Write(ctx, websocket.MessageBinary, frame)
				}
			}
		}()
	}
	for i := 0; i < 4; i++ {
		time.Sleep(5 * time.Second)
		runtime.GC()
		var ms runtime.MemStats
		runtime.ReadMemStats(&ms)
		q := onHub(r, func() (q int64) {
			for _, c := range r.h.clients {
				q = max(q, c.queued.Load())
			}
			return
		})
		t.Logf("t=%ds heap in use %d MiB, largest queue %d KB", (i+1)*5, ms.HeapInuse>>20, q>>10)
		if ms.HeapInuse > 24<<20 || q > maxQueued {
			t.Fatalf("relay memory: heap %d MiB, queue %d bytes", ms.HeapInuse>>20, q)
		}
	}
}

// F15: the loser's own "it was close" claim overrode the agreed damage.
func TestCloseLossClaimIgnored(t *testing.T) {
	r := newEvRig(t)
	r.h.st.recordMatch("m1", "duel", false, "0-2", []seatRow{
		{UID: "w", Name: "W", Won: true, Ranked: true, OppDmg: 0.9},
		{UID: "l", Name: "L", Won: false, Ranked: true, OppDmg: 0.1},
	})
	_, before := r.sync(t, "l", map[string]any{"event": vday, "name": "L"})
	_, after := r.sync(t, "l", map[string]any{"event": vday, "name": "L", "b": [][]any{{"arena:m1", 2, "arena", r.now.UnixMilli()}}})
	if before["points"] != after["points"] || after["points"].(float64) != 1 {
		t.Fatalf("loser's points %v, then %v after claiming 'close'", before["points"], after["points"])
	}
}

// Fake friends: a rival is a friend only through a finished friend-link match.
func TestRivalFriendsAreServerSide(t *testing.T) {
	r := newEvRig(t)
	r.seedPlayer(t, "imp", "Mum", []int{3})
	r.seedPlayer(t, "me", "Me", []int{3})
	_, out := call(t, "GET", r.srv.URL+prefix+"/events/rivals?event="+vday+"&friends=MUM", "dev:me", nil)
	for _, x := range rivalsOf(out) {
		if x["friend"] == true {
			t.Fatalf("a friend by display name: %v", x)
		}
	}
}

// One bucket for every inbound frame: a flood is cut before it reaches the hub.
func TestInboundBucket(t *testing.T) {
	r := newRig(t, false)
	a := r.dial("Atk", "")
	for i := 0; i < 3000; i++ {
		a.send(map[string]any{"t": "auth", "tok": ""}) // each one answers with "me"
	}
	n, timeout := 0, time.After(time.Second)
	for done := false; !done; {
		select {
		case m := <-a.msgs:
			if m["t"] == "me" {
				n++
			}
		case <-timeout:
			done = true
		}
	}
	if n > 1500 {
		t.Fatalf("%d of 3000 frames reached the hub in about a second", n)
	}
}

func TestNameChangesRateLimited(t *testing.T) {
	r := newRig(t, false)
	a := r.dial("Atk", "")
	for i := 0; i < 50; i++ {
		a.send(map[string]any{"t": "name", "name": fmt.Sprintf("A%d", i%2)})
	}
	n, timeout := 0, time.After(500*time.Millisecond)
	for done := false; !done; {
		select {
		case m := <-a.msgs:
			if m["t"] == "me" {
				n++
			}
		case <-timeout:
			done = true
		}
	}
	if n > ctlBurst+1 {
		t.Fatalf("%d name changes went through in half a second", n)
	}
}

// Many lobby changes at once reach a lobby client as about one frame per tick.
func TestLobbyPushesCoalesced(t *testing.T) {
	r := newRig(t, true)
	v := r.dial("Viewer", "")
	v.send(map[string]any{"t": "lobby", "on": true})
	v.expect("lobby")
	cs := make([]*tc, 30)
	for i := range cs {
		cs[i] = r.dial(fmt.Sprintf("W%02d", i), "")
	}
	time.Sleep(300 * time.Millisecond)
	for len(v.msgs) > 0 {
		<-v.msgs
	}
	for _, c := range cs {
		c.send(map[string]any{"t": "wait", "type": "duel"})
		c.send(map[string]any{"t": "unwait"})
	}
	n, timeout := 0, time.After(600*time.Millisecond)
	for done := false; !done; {
		select {
		case m := <-v.msgs:
			if m["t"] == "lobby" {
				n++
			}
		case <-timeout:
			done = true
		}
	}
	if n > 5 {
		t.Fatalf("60 lobby changes became %d lobby frames", n)
	}
}

// A lobby client whose queue is nearly full skips the frame (it is owed one) instead of
// being dropped.
func TestLobbySkipsANearlyFullQueue(t *testing.T) {
	r := newRig(t, true)
	v := r.dial("Viewer", "")
	v.send(map[string]any{"t": "lobby", "on": true})
	v.expect("lobby")
	vc := onHub(r, func() *client { return r.h.clients[v.id] })
	onHub(r, func() bool { vc.queued.Add(maxQueued/2 + 1); return true })
	w := r.dial("Waiter", "")
	w.send(map[string]any{"t": "wait", "type": "duel"})
	time.Sleep(500 * time.Millisecond)
	if owed := onHub(r, func() bool { return vc.lobbyOwed && !vc.lagging && r.h.clients[v.id] != nil }); !owed {
		t.Fatal("a nearly full queue should skip (and owe) the lobby frame")
	}
	onHub(r, func() bool { vc.queued.Add(-(maxQueued/2 + 1)); return true })
	if l := v.expect("lobby"); len(l["players"].([]any)) != 1 {
		t.Fatalf("the owed frame: %v", l)
	}
}

// Relay is charged to the receiver too: three senders cannot pile 3x the rate onto one socket.
func TestRelayChargesTheReceiver(t *testing.T) {
	h := newHub(nil, lanIce(), nil, nil)
	now := time.Unix(1_800_000_000, 0)
	h.now = func() time.Time { return now }
	m := &match{id: "m", state: mPlay, room: true}
	var cs []*client
	for i := 0; i < 4; i++ {
		c := &client{id: fmt.Sprintf("c%d", i), send: make(chan []byte, 4096), queued: new(atomic.Int64), budgetAt: now, budgetN: relayPerSec, budgetB: relayBytesPS, match: m}
		cs = append(cs, c)
		m.seats = append(m.seats, &seat{c: c, id: c.id, accepted: true})
	}
	frame := func(to string) []byte {
		b := append([]byte{byte(len(to))}, to...)
		return append(b, 'u', 1)
	}
	for k := 0; k < relayPerSec; k++ {
		for _, s := range cs[1:] {
			h.relayBinary(s, frame("c0"))
		}
	}
	if got, most := len(cs[0].send), recvPerSec; got > most {
		t.Fatalf("receiver got %d frames in an instant, budget %d", got, most)
	}
}

func TestLanServesOnlyTheGame(t *testing.T) {
	dir := t.TempDir()
	for _, f := range []string{"gms/2d/ragdojo/index.html", "gms/2d/ragdojo/js/main.js", "gms/2d/ragdojo/server/hub.go",
		"gms/2d/ragdojo/docs/ONLINE.md", "lib/auth/auth.js", "secret.txt", ".git/config", "gms/3d/other/index.html"} {
		p := dir + "/" + f
		mkdirAll(t, p)
		writeFile(t, p, "x")
	}
	api := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(299) })
	h := staticHandler(dir, prefix, api)
	for path, want := range map[string]int{
		"/gms/2d/ragdojo/":               200,
		"/gms/2d/ragdojo/js/main.js":     200,
		"/lib/auth/auth.js":              200,
		"/gms/2d/ragdojo/js/":            404, // no listing
		"/gms/2d/ragdojo/server/hub.go":  404,
		"/gms/2d/ragdojo/docs/ONLINE.md": 404,
		"/secret.txt":                    404,
		"/.git/config":                   404,
		"/gms/3d/other/index.html":       404,
		"/gms/":                          404,
		prefix + "/health":               299,
	} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest("GET", path, nil))
		if rec.Code != want {
			t.Errorf("%s: %d, want %d", path, rec.Code, want)
		}
	}
}

// One sync adds at most a day's cap of campaign fights, even across two UTC days.
func TestCampaignOneSyncOneDaysCap(t *testing.T) {
	r := newEvRig(t)
	r.now = time.Date(2026, 10, 14, 1, 0, 0, 0, time.UTC)
	ev := "reveal-week:2026-W42"
	var b [][]any
	for k := 0; k < 20; k++ {
		b = append(b, camp(fmt.Sprintf("k%d", k), 1, r.now.Add(-time.Duration(40-2*k)*time.Minute*2)))
	}
	_, out := r.sync(t, "x", map[string]any{"event": ev, "b": b})
	if p := out["points"].(float64); p != 10 {
		t.Fatalf("one sync, two days of claims: %v points", p)
	}
}

func TestCampaignTooOldRejected(t *testing.T) {
	r := newEvRig(t)
	r.now = time.Date(2026, 10, 16, 12, 0, 0, 0, time.UTC)
	_, out := r.sync(t, "x", map[string]any{"event": "reveal-week:2026-W42", "b": [][]any{camp("old", 3, r.now.Add(-30*time.Hour))}})
	if p := out["points"].(float64); p != 0 {
		t.Fatalf("a fight from 30 h ago: %v points", p)
	}
}

func TestCampaignBeforePreviousSyncRejected(t *testing.T) {
	r := newEvRig(t)
	ev := "reveal-week:2026-W42"
	r.sync(t, "x", map[string]any{"event": ev})
	r.tick(2 * time.Hour)
	_, out := r.sync(t, "x", map[string]any{"event": ev, "b": [][]any{camp("old", 3, r.now.Add(-3*time.Hour))}})
	if p := out["points"].(float64); p != 0 {
		t.Fatalf("a fight dated before the previous sync: %v points", p)
	}
}

// The guess lock on its own (the rate limiter switched off), and the limiter on its own.
func TestGuessLockAndLimiter(t *testing.T) {
	r := newEvRig(t)
	ev := "reveal-week:2026-W42"
	for _, u := range []string{"racer", "other"} {
		r.sync(t, u, map[string]any{"event": ev, "b": [][]any{camp("c-"+u, 1, r.now.Add(-time.Hour))}})
	}
	old := evMinGap
	evMinGap = 0
	evAfterLoad = func() { time.Sleep(10 * time.Millisecond) }
	defer func() { evAfterLoad = func() {} }()
	var wg sync.WaitGroup
	var oks atomic.Int32
	for i := 0; i < 16; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			if code, _ := call(t, "POST", r.srv.URL+prefix+"/events/guess", "dev:racer", map[string]any{"event": ev, "pic": "heroic", "choice": fmt.Sprintf("GUESS %d", i)}); code == 200 {
				oks.Add(1)
			}
		}(i)
	}
	wg.Wait()
	evMinGap = old
	if oks.Load() != 1 {
		t.Fatalf("%d guesses accepted with one allowed (lock)", oks.Load())
	}
	call(t, "POST", r.srv.URL+prefix+"/events/guess", "dev:other", map[string]any{"event": ev, "pic": "heroic", "choice": "A"})
	if code, _ := call(t, "POST", r.srv.URL+prefix+"/events/guess", "dev:other", map[string]any{"event": ev, "pic": "heroic", "choice": "B"}); code != 429 {
		t.Fatalf("a second guess in the same instant: %d", code)
	}
}

// R3: a device clock a few minutes fast lost every campaign point the client had shown.
func TestCampaignClockAheadShifted(t *testing.T) {
	r := newEvRig(t)
	_, out := r.sync(t, "me", map[string]any{"event": vday, "b": [][]any{
		camp("x", 3, r.now.Add(3*time.Minute)), camp("y", 3, r.now.Add(5*time.Minute)), camp("far", 3, r.now.Add(time.Hour))}})
	if p := out["points"].(float64); p != 6 {
		t.Fatalf("a clock 5 min fast: %v points (want the two near fights, not the far one)", p)
	}
	for _, b := range out["b"].([]any) {
		if at := int64(b.([]any)[3].(float64)); at > r.now.UnixMilli() {
			t.Fatalf("a fight kept in the future: %v", b)
		}
	}
}

// R3: the placeholder's answer is public — solving it pays nothing, and no battle = no guess.
func TestPlaceholderGuessPaysNoBonus(t *testing.T) {
	r := newEvRig(t)
	ev := "reveal-week:2026-W42"
	guess := func(uid string) (int, map[string]any) {
		r.tick(time.Second)
		return call(t, "POST", r.srv.URL+prefix+"/events/guess", "dev:"+uid, map[string]any{"event": ev, "pic": "heroic", "choice": placeholderAnswer})
	}
	if code, g := guess("free"); code != 409 || g["error"] != "play first" {
		t.Fatalf("a guess with no battle: %d %v", code, g)
	}
	r.sync(t, "free", map[string]any{"event": ev, "b": [][]any{camp("c1", 1, r.now.Add(-time.Hour))}})
	code, g := guess("free")
	if code != 200 || g["right"] != true || g["bonus"].(float64) != 0 {
		t.Fatalf("the public answer paid a bonus: %d %v", code, g)
	}
}

// R3: a room seat that joins (accepts) with no token is dealt out, never played for free.
func TestRoomSeatWithoutTokenDealtOut(t *testing.T) {
	r := newRig(t, false)
	h := r.dial("Host", "dev:host")
	h.send(map[string]any{"t": "friend", "type": "lms"})
	f := h.expect("friend")
	id := f["match"].(string)
	h.accept(id)
	var cs []*tc
	for i, tok := range []string{"", "garbage"} {
		c := r.dial(fmt.Sprintf("F%d", i), fmt.Sprintf("dev:f%d", i))
		c.send(map[string]any{"t": "join", "code": f["code"]})
		c.expect("offer")
		c.send(map[string]any{"t": "accept", "match": id, "tok": tok})
		cs = append(cs, c)
	}
	ok := r.dial("Payer", "dev:payer")
	ok.send(map[string]any{"t": "join", "code": f["code"]})
	ok.expect("offer")
	ok.accept(id)
	time.Sleep(100 * time.Millisecond)
	h.send(map[string]any{"t": "start", "match": id})
	for _, c := range cs {
		if x := c.expect("cancel"); x["why"] != "signin" {
			t.Fatalf("a seat without its own token: %v", x)
		}
	}
	if g := h.expect("go"); len(g["seats"].([]any)) != 2 {
		t.Fatalf("the paying seats play: %v", g)
	}
	if _, asked := r.spent.Load(""); asked {
		t.Fatal("the payment service was asked with no token")
	}
}

// R3: GET /events/rivals scanned every player on every call.
func TestRivalsRateLimitedAndCached(t *testing.T) {
	r := newEvRig(t)
	for i := 0; i < 30; i++ {
		r.seedPlayer(t, fmt.Sprintf("p%02d", i), fmt.Sprintf("P%02d", i), []int{1, 2})
	}
	r.tick(rivalTTL + time.Second)
	before := evRivalScans.Load()
	codes := map[int]int{}
	for i := 0; i < 50; i++ {
		code, _ := call(t, "GET", r.srv.URL+prefix+"/events/rivals?event="+vday, "dev:p01", nil)
		codes[code]++
	}
	if n := evRivalScans.Load() - before; n > 1 || codes[200] != 50 {
		t.Fatalf("50 back-to-back calls: %d full scans, codes %v", n, codes)
	} // The cache on its own: the store answers a repeat from memory.
	before = evRivalScans.Load()
	for i := 0; i < 10; i++ {
		r.h.st.evRivals(vday, "p02")
	}
	if n := evRivalScans.Load() - before; n != 1 {
		t.Fatalf("10 direct calls: %d full scans", n)
	}
	// The limiter on its own: a limited caller with nothing cached is told to slow down.
	r.tick(rivalTTL + time.Second)
	call(t, "GET", r.srv.URL+prefix+"/events/rivals?event="+vday, "dev:p03", nil)
	r.h.st.rivals = &rivalMemo{m: map[string]rivalEntry{}}
	if code, _ := call(t, "GET", r.srv.URL+prefix+"/events/rivals?event="+vday, "dev:p03", nil); code != 429 {
		t.Fatalf("a second call in the same instant with no cache: %d", code)
	}
}

// R3 item 4: rival rows carry a stable opaque id, never the uid.
func TestRivalRowsCarryAnOpaqueID(t *testing.T) {
	r := newEvRig(t)
	r.seedPlayer(t, "alice-uid", "Alice", []int{3})
	_, mine := r.sync(t, "alice-uid", map[string]any{"event": vday})
	r.seedPlayer(t, "me", "Me", []int{3})
	_, out := call(t, "GET", r.srv.URL+prefix+"/events/rivals?event="+vday, "dev:me", nil)
	rv := rivalsOf(out)
	if len(rv) != 1 || rv[0]["rid"] == "" || rv[0]["rid"] != mine["rid"] || strings.Contains(string(mustJSON(out)), "alice-uid") {
		t.Fatalf("rid: %v (alice's own %v)", rv, mine["rid"])
	}
	if r.h.st.rid("vines-day:2026-10-14", "alice-uid") == mine["rid"] {
		t.Fatal("a rid must not link one player across events")
	}
}

// ---- R2 (netcode review): liveness, stall reports, report timeout, migration, placings ----

// H1/H2: a tab that stops answering pings is away (grace, then forfeit), not "connected".
func TestFrozenTabGoesAway(t *testing.T) {
	r := newRig(t, false)
	r.h.post(func() { r.h.pongLate = 300 * time.Millisecond; r.h.awayGrace = 400 * time.Millisecond; r.h.earlyFF = 0 })
	a, b := r.dial("Alice", "dev:alice"), r.dial("Bob", "dev:bob")
	id, _, _ := matchUp(t, a, b)
	a.accept(id)
	b.accept(id)
	a.expect("go")
	b.expect("go")
	playRound(t, []*tc{a, b}, id, 1, 0, true)
	a.expect("go")
	b.mute.Store(true)
	deadline := time.After(pingEvery + 3*time.Second)
	for {
		select {
		case m := <-a.msgs:
			if m["t"] == "result" {
				if m["forfeit"] != true || num(m["by"]) != 1 || num(m["winner"]) != 0 {
					t.Fatalf("a frozen tab forfeits after its grace: %v", m)
				}
				return
			}
		case <-deadline:
			t.Fatal("a seat that stopped answering pings was never treated as away")
		}
	}
}

// H1: a hidden master's socket still answers pings; a majority of guests saying "no snapshots"
// hands the room over at once, and a 1v1 starts the master's grace.
func TestStallMajorityHandsOver(t *testing.T) {
	r := newRig(t, false)
	cs, id := startRoom3(t, r, "lms") // master = slot 1
	cs[0].send(map[string]any{"t": "stall", "match": id, "ms": 4000})
	cs[0].none("out", 300*time.Millisecond) // one of two guests is not a majority
	cs[0].send(map[string]any{"t": "stall", "match": id, "ms": 0})
	cs[0].send(map[string]any{"t": "stall", "match": id, "ms": 3500})
	cs[2].send(map[string]any{"t": "stall", "match": id, "ms": 3500})
	if o := cs[0].expect("out"); num(o["slot"]) != 1 || o["why"] != "stall" {
		t.Fatalf("the stalled master is out: %v", o)
	}
	if m := cs[2].expect("master"); num(m["master"]) == 1 {
		t.Fatalf("hand-over: %v", m)
	}
	// 1v1: the guest's report starts the master's away grace.
	a, b := r.dial("Alice", "dev:alice"), r.dial("Bob", "dev:bob")
	mid, _, _ := matchUp(t, a, b)
	a.accept(mid)
	b.accept(mid)
	g := a.expect("go")
	b.expect("go")
	master, guest := a, b
	if num(g["master"]) == 1 {
		master, guest = b, a
	}
	guest.send(map[string]any{"t": "stall", "match": mid, "ms": 4000})
	if w := guest.expect("away"); num(w["slot"]) != num(g["master"]) {
		t.Fatalf("away: %v", w)
	}
	_ = master
}

// H1: a 1v1 guest who quits after >10 s of reported master silence does not forfeit.
func TestQuitAfterStallIsNotTheGuestsForfeit(t *testing.T) {
	r := newRig(t, false)
	r.h.post(func() { r.h.earlyFF = 0; r.h.awayGrace = time.Minute })
	a, b := r.dial("Alice", "dev:alice"), r.dial("Bob", "dev:bob")
	id, _, _ := matchUp(t, a, b)
	a.accept(id)
	b.accept(id)
	g := a.expect("go")
	b.expect("go")
	playRound(t, []*tc{a, b}, id, 1, num(g["master"]), true)
	g = a.expect("go")
	b.expect("go")
	ms := num(g["master"])
	guest := []*tc{a, b}[1-ms]
	guest.send(map[string]any{"t": "stall", "match": id, "ms": 11000})
	time.Sleep(100 * time.Millisecond)
	guest.send(map[string]any{"t": "leave"})
	res := guest.expect("result")
	if res["forfeit"] != true || num(res["winner"]) != 1-ms || num(res["by"]) != ms || res["why"] != "stall" {
		t.Fatalf("the frozen master forfeits, not the guest who gave up: %v", res)
	}
}

// H2: at the report timeout a silent seat whose socket is down is out too, and the rest
// finish with what they agree on.
func TestReportTimeoutFinishesWithTheAgreeing(t *testing.T) {
	r := newRig(t, false)
	r.h.post(func() { r.h.reportWindow = 300 * time.Millisecond; r.h.awayGrace = time.Minute })
	cs, id := startRoom3(t, r, "hill")
	cs[2].ws.Close(websocket.StatusGoingAway, "")
	cs[0].expect("away")
	for _, c := range cs[:2] {
		c.send(map[string]any{"t": "round", "match": id, "round": 1, "winner": 1, "place": []int{2, 1, 3}})
	}
	if res := cs[0].expect("result"); num(res["winner"]) != 1 || res["forfeit"] == true {
		t.Fatalf("finish with the agreeing seats: %v", res)
	}
}

// M3: a master's 1-2 s WebSocket blip is not a hand-over; a deliberate 4001 (tab hidden) is.
func TestMigrationNotOnABlip(t *testing.T) {
	r := newRig(t, false)
	cs, _ := startRoom3(t, r, "lms") // master = slot 1
	rtok := onHub(r, func() string { return r.h.clients[cs[1].id].tok })
	cs[1].ws.Close(websocket.StatusGoingAway, "blip")
	cs[0].expect("away")
	time.Sleep(2500 * time.Millisecond)
	r.resume(cs[1].id, rtok)
	cs[0].expect("back")
	cs[0].none("out", 300*time.Millisecond)

	r2 := newRig(t, false)
	cs, _ = startRoom3(t, r2, "lms")
	cs[1].ws.Close(closeHidden, "hidden")
	if o := cs[0].expect("out"); num(o["slot"]) != 1 {
		t.Fatalf("a hidden master hands over at once: %v", o)
	}
}

// H3: a seat that left before the first report does not make the reports disagree (its damage
// and place are each client's guess), and the winner leaving after the fight ended does not void.
func TestPlacingsOnlyForSeatsStillIn(t *testing.T) {
	r := newRig(t, false)
	cs, id := startRoom3(t, r, "lms")
	cs[2].send(map[string]any{"t": "leave"})
	cs[0].expect("out")
	cs[0].send(map[string]any{"t": "round", "match": id, "round": 1, "winner": 0, "ko": true, "place": []int{1, 2, 3}, "dmg": []int{10, 100, 100}})
	cs[1].send(map[string]any{"t": "round", "match": id, "round": 1, "winner": 0, "ko": true, "place": []int{1, 2, 3}, "dmg": []int{10, 100, 55}})
	if res := cs[0].expect("result"); num(res["winner"]) != 0 {
		t.Fatalf("a gone seat's damage must not void: %v", res)
	}
	r2 := newRig(t, false)
	cs, id = startRoom3(t, r2, "bandana")
	cs[0].send(map[string]any{"t": "round", "match": id, "round": 1, "winner": 0, "place": []int{1, 2, 3}})
	cs[0].send(map[string]any{"t": "leave"}) // the winner quits during the slow-mo
	for _, c := range cs[1:] {
		c.send(map[string]any{"t": "round", "match": id, "round": 1, "winner": 0, "place": []int{1, 2, 3}})
	}
	if res := cs[1].expect("result"); num(res["winner"]) != 0 || res["forfeit"] == true {
		t.Fatalf("the winner leaving after the fight ended: %v", res)
	}
}
