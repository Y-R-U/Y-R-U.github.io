package main

import (
	"bufio"
	"bytes"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"math"
	"math/big"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

var delivered atomic.Int64

var (
	ts      *httptest.Server
	testKey *rsa.PrivateKey
	clock   time.Time
)

func TestMain(m *testing.M) {
	dir, _ := os.MkdirTemp("", "clued-test")
	os.Setenv("CLUED_DATA", dir)
	loadConfig()
	clock = time.Now()
	nowFn = func() time.Time { return clock }
	testKey, _ = rsa.GenerateKey(rand.Reader, 2048)
	tmpl := &x509.Certificate{SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "t"},
		NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(24 * time.Hour)}
	der, _ := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &testKey.PublicKey, testKey)
	certs, _ := json.Marshal(map[string]string{"testkid": string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}))})
	os.WriteFile(dir+"/certs.json", certs, 0o600)
	cfg.TestCerts = dir + "/certs.json"
	openDB(dir + "/clued.db")
	cfg.MaxPrivate, cfg.EscRooms, cfg.EscRefusals = 100000, 100000, 100000
	deliverHook = func(kind, msg string) string { delivered.Add(1); return "test" }
	ts = httptest.NewServer(routes())
	code := m.Run()
	ts.Close()
	os.RemoveAll(dir)
	os.Exit(code)
}

func advance(d time.Duration) { clock = clock.Add(d) }

func mint(provider string) string { return mintAs(provider, "") }

func mintAs(provider, email string) string {
	enc := base64.RawURLEncoding
	h, _ := json.Marshal(map[string]string{"alg": "RS256", "kid": "testkid", "typ": "JWT"})
	now := clock.Unix()
	p, _ := json.Marshal(map[string]any{"aud": firebaseProject, "iss": "https://securetoken.google.com/" + firebaseProject,
		"sub": "uid-" + provider + email, "exp": now + 3600, "iat": now - 10, "name": "Aaron Signed",
		"email": email, "email_verified": email != "",
		"firebase": map[string]string{"sign_in_provider": provider}})
	signing := enc.EncodeToString(h) + "." + enc.EncodeToString(p)
	sum := sha256.Sum256([]byte(signing))
	sig, _ := rsa.SignPKCS1v15(rand.Reader, testKey, crypto.SHA256, sum[:])
	return signing + "." + enc.EncodeToString(sig)
}

type resp struct {
	code int
	body map[string]any
	hdr  http.Header
}

func call(t *testing.T, method, path string, body any, hdr ...string) resp {
	t.Helper()
	var rd *bytes.Reader
	switch b := body.(type) {
	case nil:
		rd = bytes.NewReader(nil)
	case string:
		rd = bytes.NewReader([]byte(b))
	default:
		j, _ := json.Marshal(b)
		rd = bytes.NewReader(j)
	}
	req, _ := http.NewRequest(method, ts.URL+"/gms/2d/clued/api"+path, rd)
	req.Header.Set("Content-Type", "application/json")
	for i := 0; i+1 < len(hdr); i += 2 {
		req.Header.Set(hdr[i], hdr[i+1])
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	var m map[string]any
	json.NewDecoder(res.Body).Decode(&m)
	return resp{res.StatusCode, m, res.Header}
}

func mcQ(i int) map[string]any {
	return map[string]any{"format": "mc", "id": fmt.Sprint("q", i), "prompt": "Q?", "answer": "Right",
		"options": []string{"Right", "Wrong", "Nope", "Nah"}, "timeLimit": 10}
}

func questions(n int) []any {
	out := []any{}
	for i := 0; i < n; i++ {
		out = append(out, mcQ(i))
	}
	return out
}

func createRoom(t *testing.T, host string, n int) (code, hostKey string) {
	t.Helper()
	r := call(t, "POST", "/rooms", map[string]any{"hostName": host, "spec": map[string]any{"v": 1}, "questions": questions(n)})
	if r.code != 200 {
		t.Fatalf("create: %d %v", r.code, r.body)
	}
	return r.body["code"].(string), r.body["hostKey"].(string)
}

func join(t *testing.T, code, name string) (string, resp) {
	t.Helper()
	r := call(t, "POST", "/rooms/"+code+"/join", map[string]any{"name": name})
	key, _ := r.body["playerKey"].(string)
	return key, r
}

func state(t *testing.T, code, key string) map[string]any {
	t.Helper()
	return call(t, "GET", "/rooms/"+code+"/state?k="+key, nil).body
}

func players(st map[string]any) []map[string]any {
	out := []map[string]any{}
	for _, p := range st["players"].([]any) {
		out = append(out, p.(map[string]any))
	}
	return out
}

func num(v any) int { f, _ := v.(float64); return int(f) }

func TestHealthAndRouting(t *testing.T) {
	r := call(t, "GET", "/health", nil)
	if r.code != 200 || r.body["name"] != "clued" {
		t.Fatalf("health %v", r)
	}
	if r.hdr.Get("Cache-Control") != "no-store" {
		t.Fatal("api must be no-store")
	}
	res, _ := http.Get(ts.URL + "/api/health")
	if res.StatusCode != 200 {
		t.Fatal("unprefixed health should work")
	}
	if call(t, "GET", "/nope", nil).code != 404 {
		t.Fatal("unknown should 404")
	}
	if call(t, "GET", "/rooms/ZZZZZ", nil).code != 404 {
		t.Fatal("missing room should 404")
	}
}

func TestCORS(t *testing.T) {
	for _, o := range []string{"https://y-r-u.github.io", "http://localhost:8888", "https://games.br8t.com"} {
		r := call(t, "OPTIONS", "/rooms", nil, "Origin", o, "Access-Control-Request-Method", "POST",
			"Access-Control-Request-Headers", "content-type")
		if r.code != 204 || r.hdr.Get("Access-Control-Allow-Origin") != o ||
			!strings.Contains(r.hdr.Get("Access-Control-Allow-Headers"), "Content-Type") {
			t.Fatalf("preflight from %s: %d %v", o, r.code, r.hdr)
		}
		g := call(t, "GET", "/health", nil, "Origin", o)
		if g.hdr.Get("Access-Control-Allow-Origin") != o {
			t.Fatalf("simple GET from %s lacks ACAO", o)
		}
	}
	r := call(t, "OPTIONS", "/rooms", nil, "Origin", "https://evil.example")
	if r.code != 403 || r.hdr.Get("Access-Control-Allow-Origin") != "" {
		t.Fatalf("foreign preflight must fail: %d", r.code)
	}
	if call(t, "POST", "/rooms", map[string]any{"hostName": "x", "questions": questions(1)}, "Origin", "https://evil.example").code != 403 {
		t.Fatal("foreign POST must be refused")
	}
}

func TestNames(t *testing.T) {
	cases := map[string]string{
		"  Sam  ":                                "Sam",
		"A\x00b" + string(rune(0x200b)) + "c\td": "Abc d",
		"<b>bold</b>":                            "bbold/b",
		"Averyveryverylongnamethatgoes":          "Averyveryverylongnam",
		"Hancock":                                "Hancock",
		"Cassie":                                 "Cassie",
		"Dickens":                                "Dickens",
		"Sussex Sam":                             "Sussex Sam",
	}
	for in, want := range cases {
		got, err := cleanName(in)
		if err != nil || got != want {
			t.Errorf("cleanName(%q) = %q, %v; want %q", in, got, err, want)
		}
	}
	for _, bad := range []string{"fuck", "F U C K", "sh1t head", "big dick", "", "   ", "\u0000"} {
		if _, err := cleanName(bad); err == nil {
			t.Errorf("cleanName(%q) should fail", bad)
		}
	}
	taken := map[string]bool{"sam": true, "sam 2": true}
	if got := dedupeName("Sam", func(n string) bool { return taken[strings.ToLower(n)] }); got != "Sam 3" {
		t.Errorf("dedupe got %q", got)
	}
	for i := 0; i < 2000; i++ {
		c := newCode()
		if normCode(strings.ToLower(c)) != c || strings.ContainsAny(c, "01OIL") {
			t.Fatalf("bad code %q", c)
		}
	}
}

func TestScoring(t *testing.T) {
	if basePoints("mc", true, nil, 0, 10000, true) != 500 {
		t.Error("instant answer = 500")
	}
	if basePoints("mc", true, nil, 5000, 10000, true) != 300 {
		t.Error("half time = 300")
	}
	if basePoints("mc", true, nil, 10000, 10000, true) != 100 {
		t.Error("buzzer = 100")
	}
	if basePoints("mc", false, nil, 0, 10000, true) != 0 {
		t.Error("wrong = 0")
	}
	if basePoints("mc", true, nil, 0, 10000, false) != 100 {
		t.Error("untimed = 100")
	}
	p := 9999.0
	if basePoints("pin-drop", false, &p, 0, 10000, true) != 500 {
		t.Error("partial capped at 500")
	}
	p = 320
	if basePoints("ladder", true, &p, 0, 10000, true) != 320 {
		t.Error("partial uses client points")
	}
	if basePoints("mc", true, &p, 0, 10000, true) != 500 {
		t.Error("mc ignores client points")
	}
	for streak, want := range map[int]int{1: 100, 2: 110, 3: 120, 6: 150, 10: 150} {
		if got := withStreak(100, streak); got != want {
			t.Errorf("streak %d: got %d want %d", streak, got, want)
		}
	}
	m := parseMeta(json.RawMessage(`{"format":"mc","answer":"Paris","timeLimit":15}`))
	if m.LimitMs != 15000 {
		t.Error("seconds timeLimit")
	}
	if !verifyCorrect(m, json.RawMessage(`"paris "`), false) || verifyCorrect(m, json.RawMessage(`"Rome"`), true) {
		t.Error("mc verification")
	}
	mi := parseMeta(json.RawMessage(`{"format":"mc","answer":2}`))
	if verifyCorrect(mi, json.RawMessage(`1`), true) || !verifyCorrect(mi, json.RawMessage(`2`), false) {
		t.Error("mc index verification")
	}
	tf := parseMeta(json.RawMessage(`{"format":"tf","answer":false}`))
	if verifyCorrect(tf, json.RawMessage(`true`), true) {
		t.Error("tf verification")
	}
	if parseMeta(json.RawMessage(`{"format":"connect"}`)).LimitMs != 120000 {
		t.Error("long format default")
	}
}

func TestRoomFlow(t *testing.T) {
	resetLimits()
	code, hk := createRoom(t, "Hosty", 3)
	if len(code) != 5 {
		t.Fatal("code length")
	}
	peek := call(t, "GET", "/rooms/"+strings.ToLower(code), nil)
	if peek.code != 200 || peek.body["host"] != "Hosty" {
		t.Fatalf("peek %v", peek)
	}
	k1, _ := join(t, code, "Sam")
	k2, r2 := join(t, code, "sam")
	if r2.body["room"].(map[string]any)["you"].(map[string]any)["name"] != "sam 2" {
		t.Fatalf("dedupe: %v", r2.body)
	}
	if _, r := join(t, code, "shithead"); r.code != 400 || r.body["code"] != "bad_name" {
		t.Fatal("profane name should be refused")
	}
	if call(t, "POST", "/rooms/"+code+"/start", map[string]any{"key": k1}).code != 403 {
		t.Fatal("non-host start must fail")
	}
	st := call(t, "POST", "/rooms/"+code+"/start", map[string]any{"hostKey": hk}).body
	if st["phase"] != "question" || num(st["q"]) != 0 {
		t.Fatalf("start: %v", st)
	}
	if call(t, "GET", "/rooms/"+code+"/q/0?k="+k1, nil).code != 200 {
		t.Fatal("q0 fetch")
	}
	if call(t, "GET", "/rooms/"+code+"/q/2?k="+k1, nil).code != 404 {
		t.Fatal("future question must be hidden")
	}
	ans := func(key string, q int, given string, ms float64) resp {
		return call(t, "POST", "/rooms/"+code+"/answer", map[string]any{"key": key, "q": q, "given": given, "correct": true, "ms": ms})
	}
	if ans(k1, 0, "Right", 0).code != 409 {
		t.Fatal("answers before the lead-in ends are refused")
	}
	advance(leadInMs * time.Millisecond)
	advance(2 * time.Second)
	a := ans(k1, 0, "Right", 2000)
	if a.code != 200 || num(a.body["points"]) != 420 {
		t.Fatalf("answer: %v", a.body)
	}
	if ans(k1, 0, "Right", 2000).code != 409 {
		t.Fatal("double answer")
	}
	b := ans(k2, 0, "Wrong", 1000)
	if !(b.code == 200 && b.body["correct"] == false && num(b.body["points"]) == 0) {
		t.Fatalf("server must check mc: %v", b.body)
	}
	// a client claiming more time than elapsed is clamped to the server's view
	h := ans(hk, 0, "Right", 99999)
	if num(h.body["ms"]) != 2000 {
		t.Fatalf("ms clamp: %v", h.body)
	}
	st = state(t, code, hk)
	if st["phase"] != "reveal" {
		t.Fatalf("all answered → reveal, got %v", st["phase"])
	}
	ps := players(st)
	if num(ps[0]["score"]) != 420 || ps[0]["last"] == nil || ps[2]["name"] != "sam 2" {
		t.Fatalf("scoreboard sorted with last: %v", ps)
	}
	// late joiner during reveal plays from the next question
	k3, r3 := join(t, code, "Late")
	if num(r3.body["room"].(map[string]any)["you"].(map[string]any)["joinedQ"]) != 1 {
		t.Fatal("late joiner joinedQ")
	}
	// auto-advance after the reveal
	advance(defaultReveal*time.Millisecond + time.Millisecond)
	tickRooms()
	st = state(t, code, k3)
	if st["phase"] != "question" || num(st["q"]) != 1 {
		t.Fatalf("auto next: %v %v", st["phase"], st["q"])
	}
	advance(leadInMs*time.Millisecond + time.Second)
	if ans(k3, 1, "Right", 1000).code != 200 {
		t.Fatal("late joiner can answer q1")
	}
	// streak bonus: Sam's second correct answer gets +10%
	s := ans(k1, 1, "Right", 1000)
	if num(s.body["points"]) != 506 { // (100+round(400*9/10)) = 460 * 1.1
		t.Fatalf("streak points %v", s.body)
	}
	// timer expiry reveals even if some never answer
	state(t, code, hk)
	advance(20 * time.Second)
	tickRooms()
	if state(t, code, hk)["phase"] != "reveal" {
		t.Fatal("deadline → reveal")
	}
	if call(t, "POST", "/rooms/"+code+"/answer", map[string]any{"key": k2, "q": 1, "given": "Right", "correct": true}).code != 409 {
		t.Fatal("answer after reveal refused")
	}
	call(t, "POST", "/rooms/"+code+"/next", map[string]any{"key": hk})
	advance(leadInMs * time.Millisecond)
	call(t, "POST", "/rooms/"+code+"/next", map[string]any{"key": hk, "q": 2}) // skip q2 to reveal (explicit q)
	st = call(t, "POST", "/rooms/"+code+"/next", map[string]any{"key": hk}).body
	if st["phase"] != "final" {
		t.Fatalf("final: %v", st["phase"])
	}
	// play again keeps players, resets scores
	st = call(t, "POST", "/rooms/"+code+"/again", map[string]any{"key": hk, "questions": questions(2)}).body
	if st["phase"] != "lobby" || num(st["total"]) != 2 || num(players(st)[0]["score"]) != 0 || num(st["game"]) != 1 {
		t.Fatalf("again: %v", st)
	}
}

func TestKickLeaveHostHandover(t *testing.T) {
	resetLimits()
	code, hk := createRoom(t, "Host", 2)
	k1, r1 := join(t, code, "Ann")
	k2, r2 := join(t, code, "Bob")
	id2 := r2.body["playerId"].(string)
	if call(t, "POST", "/rooms/"+code+"/kick", map[string]any{"key": k1, "playerId": id2}).code != 403 {
		t.Fatal("only host kicks")
	}
	if call(t, "POST", "/rooms/"+code+"/kick", map[string]any{"key": hk, "playerId": id2}).code != 200 {
		t.Fatal("kick")
	}
	if r := call(t, "GET", "/rooms/"+code+"/state?k="+k2, nil); r.code != 200 || r.body["you"].(map[string]any)["kicked"] != true {
		t.Fatalf("kicked player sees kicked: %v", r.body)
	}
	if call(t, "POST", "/rooms/"+code+"/answer", map[string]any{"key": k2, "q": 0}).code != 410 {
		t.Fatal("kicked key refused")
	}
	if call(t, "POST", "/rooms/"+code+"/join", map[string]any{"key": k2, "name": "Bob"}).body["rejoined"] == true {
		t.Fatal("kicked key cannot rejoin")
	}
	// explicit leave hands host to the next player
	call(t, "POST", "/rooms/"+code+"/leave", map[string]any{"key": hk})
	st := state(t, code, k1)
	if st["hostId"] != r1.body["playerId"] || st["you"].(map[string]any)["host"] != true {
		t.Fatalf("handover on leave: %v", st["hostId"])
	}
	// silent host: goes offline, the room hands over on tick
	k3, r3 := join(t, code, "Cat")
	advance(onlineMs*time.Millisecond + time.Second)
	state(t, code, k3) // only Cat is still seen
	tickRooms()
	if st := state(t, code, k3); st["hostId"] != r3.body["playerId"] {
		t.Fatalf("handover on silence: %v", st["hostId"])
	}
	// rejoin with the key restores the same player
	r := call(t, "POST", "/rooms/"+code+"/join", map[string]any{"key": k1})
	if r.body["rejoined"] != true || r.body["playerId"] != r1.body["playerId"] {
		t.Fatalf("rejoin: %v", r.body)
	}
}

func TestFirebaseUID(t *testing.T) {
	resetLimits()
	code, _ := createRoom(t, "H", 1)
	r := call(t, "POST", "/rooms/"+code+"/join", map[string]any{"name": ""}, "Authorization", "Bearer "+mint("google.com"))
	if r.code != 200 || r.body["room"].(map[string]any)["you"].(map[string]any)["name"] != "Aaron Signed" {
		t.Fatalf("token name prefill: %v", r.body)
	}
	again := call(t, "POST", "/rooms/"+code+"/join", map[string]any{"name": "Other"}, "Authorization", "Bearer "+mint("google.com"))
	if again.body["playerId"] != r.body["playerId"] {
		t.Fatal("same uid reconnects to the same player")
	}
	anon := call(t, "POST", "/rooms/"+code+"/join", map[string]any{"name": "Anon"}, "Authorization", "Bearer "+mint("anonymous"))
	if anon.code != 200 || anon.body["playerId"] == r.body["playerId"] {
		t.Fatal("anonymous token joins as a plain guest")
	}
	bad := call(t, "POST", "/rooms/"+code+"/join", map[string]any{"name": "Junk"}, "Authorization", "Bearer x.y.z")
	if bad.code != 200 {
		t.Fatal("a junk token never blocks joining")
	}
	st := state(t, code, r.body["playerKey"].(string))
	signed := 0
	for _, p := range players(st) {
		if p["signed"] == true {
			signed++
		}
	}
	if signed != 1 {
		t.Fatalf("exactly one signed player, got %d", signed)
	}
}

func TestLimitsAndCaps(t *testing.T) {
	resetLimits()
	big := strings.Repeat("x", 520<<10)
	r := call(t, "POST", "/rooms", map[string]any{"hostName": "H", "questions": []any{map[string]any{"format": "mc", "prompt": big}}})
	if r.code != 413 {
		t.Fatalf("oversize set: %d", r.code)
	}
	if call(t, "POST", "/rooms", map[string]any{"hostName": "H", "questions": []any{}}).code != 400 {
		t.Fatal("empty set")
	}
	if call(t, "POST", "/rooms", `{"hostName":"`+strings.Repeat("y", 700<<10)+`"}`).code != 413 {
		t.Fatal("body cap")
	}
	resetLimits()
	codes := map[int]int{}
	for i := 0; i < limits["room"].max+2; i++ {
		codes[call(t, "POST", "/rooms", map[string]any{"hostName": "H", "questions": questions(1)}).code]++
	}
	if codes[200] != limits["room"].max || codes[429] != 2 {
		t.Fatalf("room create limit: %v", codes)
	}
	advance(11 * time.Minute)
	if call(t, "POST", "/rooms", map[string]any{"hostName": "H", "questions": questions(1)}).code != 200 {
		t.Fatal("window resets")
	}
	resetLimits()
}

func TestExpiryAndPersistence(t *testing.T) {
	resetLimits()
	code, hk := createRoom(t, "Keeper", 2)
	call(t, "POST", "/rooms/"+code+"/start", map[string]any{"key": hk})
	flushRooms(true)
	roomsMu.Lock()
	delete(rooms, code)
	roomsMu.Unlock()
	loadRooms()
	st := state(t, code, hk)
	if st["phase"] != "question" || st["you"].(map[string]any)["name"] != "Keeper" {
		t.Fatalf("restored room: %v", st)
	}
	advance(cfg.RoomIdle - time.Minute)
	tickRooms()
	if getRoom(code) == nil {
		t.Fatal("expired too early")
	}
	advance(2 * time.Minute)
	tickRooms()
	if getRoom(code) != nil {
		t.Fatal("room should expire after 6 h idle")
	}
	var n int
	db.QueryRow(`SELECT COUNT(*) FROM rooms WHERE code = ?`, code).Scan(&n)
	if n != 0 {
		t.Fatal("expired room left in db")
	}
}

func TestSSE(t *testing.T) {
	resetLimits()
	code, hk := createRoom(t, "Streamer", 1)
	k1, _ := join(t, code, "Watcher")
	req, _ := http.NewRequest("GET", ts.URL+"/gms/2d/clued/api/rooms/"+code+"/events?k="+k1, nil)
	req.Header.Set("Origin", "https://y-r-u.github.io")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.Header.Get("Content-Type") != "text/event-stream" || res.Header.Get("Access-Control-Allow-Origin") == "" {
		t.Fatalf("sse headers %v", res.Header)
	}
	events := make(chan map[string]any, 20)
	go func() {
		sc := bufio.NewScanner(res.Body)
		sc.Buffer(make([]byte, 1<<20), 1<<20)
		for sc.Scan() {
			if d, ok := strings.CutPrefix(sc.Text(), "data: "); ok {
				var m map[string]any
				json.Unmarshal([]byte(d), &m)
				events <- m
			}
		}
		close(events)
	}()
	wait := func(phase string) {
		t.Helper()
		deadline := time.After(3 * time.Second)
		for {
			select {
			case m, ok := <-events:
				if !ok {
					t.Fatal("stream closed")
				}
				if m["phase"] == phase {
					return
				}
			case <-deadline:
				t.Fatalf("no %s event", phase)
			}
		}
	}
	wait("lobby")
	call(t, "POST", "/rooms/"+code+"/start", map[string]any{"key": hk})
	wait("question")
	st := state(t, code, hk)
	for _, p := range players(st) {
		if p["name"] == "Watcher" && p["online"] != true {
			t.Fatal("SSE subscriber shows online")
		}
	}
}

func TestChallenges(t *testing.T) {
	resetLimits()
	r := call(t, "POST", "/challenges", map[string]any{"name": "Maker", "spec": map[string]any{"v": 1}, "title": "Snakes",
		"questions": questions(5), "score": 1500, "correct": 4, "ms": 30000})
	if r.code != 200 {
		t.Fatalf("create challenge %v", r.body)
	}
	id := r.body["id"].(string)
	g := call(t, "GET", "/challenges/"+strings.ToUpper(id), nil)
	if g.code != 200 || len(g.body["questions"].([]any)) != 5 || g.body["name"] != "Maker" {
		t.Fatalf("get: %v", g.body)
	}
	if call(t, "POST", "/challenges/"+id+"/scores", map[string]any{"name": "Cheat", "score": 99999, "correct": 5}).code != 400 {
		t.Fatal("implausible score")
	}
	if call(t, "POST", "/challenges/"+id+"/scores", map[string]any{"name": "Cheat", "score": 100, "correct": 6}).code != 400 {
		t.Fatal("correct > total")
	}
	s := call(t, "POST", "/challenges/"+id+"/scores", map[string]any{"name": "Beater", "score": 1800, "correct": 5, "ms": 20000,
		"detail": [][]int{{1, 0, 900}, {1, 2, 4000}, {0, 9, 1}, {1, 0, 50}, {1, 1, 77}}})
	if s.code != 200 || num(s.body["rank"]) != 1 || num(s.body["plays"]) != 2 {
		t.Fatalf("score: %v", s.body)
	}
	s = call(t, "POST", "/challenges/"+id+"/scores", map[string]any{"name": "Tie", "score": 1500, "correct": 4, "ms": 40000})
	if num(s.body["rank"]) != 3 {
		t.Fatalf("tie on score loses on time: %v", s.body["rank"])
	}
	board := call(t, "GET", "/challenges/"+id+"/scores", nil).body["scores"].([]any)
	if len(board) != 3 || board[0].(map[string]any)["name"] != "Beater" || board[1].(map[string]any)["creator"] != true {
		t.Fatalf("board: %v", board)
	}
	if d := board[0].(map[string]any)["detail"].([]any); len(d) != 5 || num(d[1].([]any)[1]) != 2 {
		t.Fatalf("per-question detail stored: %v", board[0])
	}
	if cleanDetail(json.RawMessage(`[[1,0,1],[1,0,1]]`), 1) != "" || cleanDetail(json.RawMessage(`[[1,0]]`), 3) != "" {
		t.Fatal("detail longer than the set or malformed is dropped")
	}
	if call(t, "GET", "/challenges/nope", nil).code != 404 {
		t.Fatal("bad id")
	}
	advance(cfg.ChallengeTTL - time.Hour)
	sweepDB()
	if call(t, "GET", "/challenges/"+id, nil).code != 200 {
		t.Fatal("kept within 90 days")
	}
	advance(2 * time.Hour)
	sweepDB()
	if call(t, "GET", "/challenges/"+id, nil).code != 404 {
		t.Fatal("expired after 90 days idle")
	}
}

func TestKidsRoom(t *testing.T) {
	resetLimits()
	r := call(t, "POST", "/rooms", map[string]any{"hostName": "Mum", "spec": map[string]any{"v": 1,
		"rounds": []any{map[string]any{"format": "mc", "opts": map[string]any{"kids": true}}}}, "questions": questions(2)})
	code, hk := r.body["code"].(string), r.body["hostKey"].(string)
	st := r.body["room"].(map[string]any)
	if st["kids"] != true || num(st["difficulty"]) != 1 {
		t.Fatalf("kids flags: %v", st)
	}
	st = call(t, "POST", "/rooms/"+code+"/start", map[string]any{"key": hk}).body
	if num(st["limitMs"]) != kidsAnswer || num(st["answerSec"]) != 20 {
		t.Fatalf("kids limit: %v", st["limitMs"])
	}
	advance(leadInMs*time.Millisecond + 100*time.Millisecond)
	a := call(t, "POST", "/rooms/"+code+"/answer", map[string]any{"key": hk, "q": 0, "given": 0, "correct": true, "ms": 100})
	if num(a.body["points"]) != 100 {
		t.Fatalf("kids score is flat 100: %v", a.body)
	}
}

func TestGraceBoundaryAndEarlyEnd(t *testing.T) {
	resetLimits()
	r := call(t, "POST", "/rooms", map[string]any{"hostName": "H", "questions": questions(3), "answerSec": 5, "gapSec": 3})
	code, hk := r.body["code"].(string), r.body["hostKey"].(string)
	st := r.body["room"].(map[string]any)
	if num(st["answerSec"]) != 5 || num(st["gapSec"]) != 3 {
		t.Fatalf("timing echo: %v %v", st["answerSec"], st["gapSec"])
	}
	k1, _ := join(t, code, "One")
	call(t, "POST", "/rooms/"+code+"/start", map[string]any{"key": hk})
	ans := func(key string, q int) resp {
		return call(t, "POST", "/rooms/"+code+"/answer", map[string]any{"key": key, "q": q, "given": "Right", "correct": true, "ms": 99999})
	}
	// q0: 499 ms past the deadline is accepted, with ms clamped to the limit
	advance(leadInMs*time.Millisecond + 5000*time.Millisecond + 499*time.Millisecond)
	a := ans(k1, 0)
	if a.code != 200 || num(a.body["ms"]) != 5000 || num(a.body["points"]) != 100 {
		t.Fatalf("499 ms late must count at the buzzer: %d %v", a.code, a.body)
	}
	// 501 ms past is rejected (the host answers at 501)
	advance(2 * time.Millisecond)
	if b := ans(hk, 0); b.code != 409 || b.body["code"] != "too_late" {
		t.Fatalf("501 ms late must be refused: %d %v", b.code, b.body)
	}
	tickRooms()
	if state(t, code, hk)["phase"] != "reveal" {
		t.Fatal("deadline + grace → reveal")
	}
	// 3 s gap then q1; everyone answering ends it early, long before the 5 s limit
	advance(3001 * time.Millisecond)
	tickRooms()
	st = state(t, code, hk)
	if st["phase"] != "question" || num(st["q"]) != 1 || num(st["gapSec"]) != 3 {
		t.Fatalf("gap auto-advance: %v q=%v", st["phase"], st["q"])
	}
	advance(leadInMs*time.Millisecond + 800*time.Millisecond)
	ans(k1, 1)
	if state(t, code, hk)["phase"] != "question" {
		t.Fatal("not everyone has answered yet")
	}
	ans(hk, 1)
	if state(t, code, hk)["phase"] != "reveal" {
		t.Fatal("all answered → early reveal")
	}
	// host taps Next: gap 0 disables auto-advance
	call(t, "POST", "/rooms/"+code+"/settings", map[string]any{"key": hk, "gapSec": 0, "answerSec": 30})
	advance(time.Minute)
	tickRooms()
	st = state(t, code, hk)
	if st["phase"] != "reveal" || st["auto"] != false || num(st["answerSec"]) != 30 {
		t.Fatalf("manual next: %v auto=%v", st["phase"], st["auto"])
	}
	st = call(t, "POST", "/rooms/"+code+"/next", map[string]any{"key": hk}).body
	if num(st["limitMs"]) != 30000 {
		t.Fatalf("new answer time applies: %v", st["limitMs"])
	}
	// invalid choices are ignored
	call(t, "POST", "/rooms/"+code+"/settings", map[string]any{"key": hk, "answerSec": 7})
	if num(state(t, code, hk)["answerSec"]) != 30 {
		t.Fatal("answerSec 7 is not a choice")
	}
}

func clearRooms() {
	roomsMu.Lock()
	rooms = map[string]*Room{}
	roomsMu.Unlock()
	resetPublicCache()
}

func publicRooms(t *testing.T) []map[string]any {
	t.Helper()
	resetPublicCache()
	r := call(t, "GET", "/rooms/public", nil)
	if r.code != 200 || r.hdr.Get("Cache-Control") != "public, max-age=3" {
		t.Fatalf("public list: %d %v", r.code, r.hdr.Get("Cache-Control"))
	}
	out := []map[string]any{}
	for _, x := range r.body["rooms"].([]any) {
		out = append(out, x.(map[string]any))
	}
	return out
}

func TestPublicRooms(t *testing.T) {
	resetLimits()
	clearRooms()
	mk := func(public bool, extra map[string]any) resp {
		body := map[string]any{"hostName": "Pub", "title": "Snakes", "questions": questions(2), "public": public,
			"spec": map[string]any{"rounds": []any{map[string]any{"format": "mc", "packs": []string{"snakes"}}}}}
		for k, v := range extra {
			body[k] = v
		}
		return call(t, "POST", "/rooms", body)
	}
	codes, keys := []string{}, []string{}
	for i := 0; i < cfg.MaxPublic; i++ {
		r := mk(true, map[string]any{"startIn": 120})
		if r.code != 200 {
			t.Fatalf("public room %d: %v", i, r.body)
		}
		codes = append(codes, r.body["code"].(string))
		keys = append(keys, r.body["hostKey"].(string))
	}
	if r := mk(true, nil); r.code != 409 || r.body["code"] != "public_full" {
		t.Fatalf("6th public room must be refused: %d %v", r.code, r.body)
	}
	if mk(false, nil).code != 200 {
		t.Fatal("private rooms are not capped")
	}
	list := publicRooms(t)
	if len(list) != cfg.MaxPublic {
		t.Fatalf("listing has %d rooms", len(list))
	}
	p := list[0]
	if p["host"] != "Pub" || p["title"] != "Snakes" || num(p["players"]) != 1 || num(p["startAt"]) == 0 ||
		p["formats"].([]any)[0] != "mc" || p["packs"].([]any)[0] != "snakes" {
		t.Fatalf("listing row: %v", p)
	}
	// finishing one frees a slot
	call(t, "POST", "/rooms/"+codes[0]+"/end", map[string]any{"key": keys[0]})
	if r := mk(true, nil); r.code != 200 {
		t.Fatalf("slot freed after a game ends: %v", r.body)
	} else {
		codes[0], keys[0] = r.body["code"].(string), r.body["hostKey"].(string)
	}
	if len(publicRooms(t)) != cfg.MaxPublic {
		t.Fatal("ended room drops off the list")
	}
	// started games with late join off drop off; with late join on they stay listed
	call(t, "POST", "/rooms/"+codes[1]+"/settings", map[string]any{"key": keys[1], "lateJoin": false})
	call(t, "POST", "/rooms/"+codes[1]+"/start", map[string]any{"key": keys[1]})
	call(t, "POST", "/rooms/"+codes[2]+"/start", map[string]any{"key": keys[2]})
	inList := map[string]bool{}
	for _, r := range publicRooms(t) {
		inList[r["code"].(string)] = true
	}
	if inList[codes[1]] || !inList[codes[2]] {
		t.Fatalf("started rooms: noLate listed=%v, late listed=%v", inList[codes[1]], inList[codes[2]])
	}
	if _, r := join(t, codes[1], "Latecomer"); r.code != 409 {
		t.Fatal("late join off refuses joiners mid-game")
	}
	// auto-start fires at startAt
	advance(121 * time.Second)
	for _, k := range []int{3, 4} {
		state(t, codes[k], keys[k])
	}
	tickRooms()
	if state(t, codes[3], keys[3])["phase"] != "question" {
		t.Fatal("public room auto-starts")
	}
	// an abandoned public lobby (host gone, nobody online) expires after 10 min, freeing the slot
	r := mk(true, nil)
	if r.code != 409 {
		t.Fatalf("cap still full before abandonment: %d", r.code)
	}
	abandoned := codes[0]
	advance(onlineMs*time.Millisecond + time.Second)
	tickRooms() // marks it empty
	if getRoom(abandoned) == nil {
		t.Fatal("not yet")
	}
	advance(abandonedMs*time.Millisecond + time.Second)
	tickRooms()
	if getRoom(abandoned) != nil {
		t.Fatal("abandoned public lobby should expire")
	}
	if r := mk(true, nil); r.code != 200 {
		t.Fatalf("slot freed after abandonment: %v", r.body)
	}
	clearRooms()
}

func TestCapsLevelsEscalation(t *testing.T) {
	resetLimits()
	clearRooms()
	defer func() {
		cfg.MaxPrivate, cfg.EscRooms, cfg.EscRefusals = 100000, 100000, 100000
		setLevel(0, "test")
		clearRooms()
	}()
	prot.Lock()
	prot.rooms, prot.refusals = nil, nil
	prot.Unlock()
	cfg.MaxPrivate, cfg.EscRefusals = 3, 3
	mk := func(hdr ...string) resp {
		return call(t, "POST", "/rooms", map[string]any{"hostName": "H", "questions": questions(1)}, hdr...)
	}
	for i := 0; i < 3; i++ {
		if mk().code != 200 {
			t.Fatal("under the private cap")
		}
	}
	if r := mk(); r.code != 503 || r.body["code"] != "busy" {
		t.Fatalf("4th private room refused: %d %v", r.code, r.body)
	}
	if level() != 0 {
		t.Fatal("one refusal doesn't escalate")
	}
	mk()
	mk() // third refusal this hour
	if level() != 1 {
		t.Fatalf("3 refusals/hour escalate to level 1, got %d", level())
	}
	cfg.MaxPrivate = 100000
	if r := mk(); r.code != 403 || r.body["code"] != "signin_required" || num(r.body["level"]) != 1 {
		t.Fatalf("level 1: anonymous hosting refused: %d %v", r.code, r.body)
	}
	if mk("Authorization", "Bearer "+mint("anonymous")).code != 403 {
		t.Fatal("an anonymous Firebase token is not a sign-in")
	}
	r := mk("Authorization", "Bearer "+mint("google.com"))
	if r.code != 200 {
		t.Fatalf("signed-in host allowed at level 1: %v", r.body)
	}
	code := r.body["code"].(string)
	if _, j := join(t, code, "Guest"); j.code != 200 {
		t.Fatal("level 1 still lets anyone join")
	}
	advance(2 * time.Hour)
	checkEscalation()
	if level() != 1 {
		t.Fatal("never auto-de-escalates")
	}
	setLevel(2, "test")
	if _, j := join(t, code, "Guest2"); j.code != 403 || j.body["code"] != "signin_required" {
		t.Fatalf("level 2: joining needs sign-in: %v", j.body)
	}
	if j := call(t, "POST", "/rooms/"+code+"/join", map[string]any{"name": "Sig"}, "Authorization", "Bearer "+mintAs("google.com", "sig@example.com")); j.code != 200 {
		t.Fatal("signed-in joiner allowed at level 2")
	}
	setLevel(3, "test")
	if r := mk("Authorization", "Bearer "+mint("google.com")); r.code != 503 || r.body["code"] != "paused" {
		t.Fatalf("level 3 pauses creation: %v", r.body)
	}
	if call(t, "POST", "/challenges", map[string]any{"name": "C", "questions": questions(2), "score": 1, "correct": 1}).code != 503 {
		t.Fatal("level 3 pauses challenges")
	}
	if r := mk("Authorization", "Bearer "+mintAs("google.com", "aaron@itmatters.mobi")); r.code != 200 {
		t.Fatalf("admins are exempt: %v", r.body)
	}
	if st := call(t, "GET", "/status", nil); num(st.body["level"]) != 3 {
		t.Fatal("status reports the level")
	}
	setLevel(0, "test")
	var stored string
	db.QueryRow(`SELECT value FROM settings WHERE key='level'`).Scan(&stored)
	if stored != "0" {
		t.Fatal("level persisted")
	}

	// rooms/hour threshold
	cfg.EscRooms = 2
	advance(2 * time.Hour)
	for i := 0; i < 3; i++ {
		mk()
	}
	if level() != 1 {
		t.Fatalf("more than 2 rooms/hour escalates, got %d", level())
	}
	setLevel(0, "test")
	cfg.EscRooms = 100000

	// players per room
	code = createRoomCode(t)
	for i := 1; i < cfg.MaxPlayers; i++ {
		if _, j := join(t, code, fmt.Sprint("P", i)); j.code != 200 {
			t.Fatalf("player %d: %v", i, j.body)
		}
	}
	if _, j := join(t, code, "TooMany"); j.code != 409 || j.body["code"] != "room_full" {
		t.Fatalf("player cap: %d %v", j.code, j.body)
	}
	// challenges per day
	old := cfg.ChalPerDay
	cfg.ChalPerDay = 1
	call(t, "POST", "/challenges", map[string]any{"name": "C", "questions": questions(2), "score": 1, "correct": 1})
	if r := call(t, "POST", "/challenges", map[string]any{"name": "C", "questions": questions(2), "score": 1, "correct": 1}); r.code != 503 {
		t.Fatalf("challenge daily cap: %d", r.code)
	}
	cfg.ChalPerDay = old
	// SSE cap
	oldSSE := cfg.MaxSSE
	cfg.MaxSSE = 1
	if !sseAcquire("1.1.1.1") || sseAcquire("2.2.2.2") {
		t.Fatal("SSE cap")
	}
	sseRelease("1.1.1.1")
	cfg.MaxSSE = oldSSE
	setLevel(0, "test")
}

func createRoomCode(t *testing.T) string {
	c, _ := createRoom(t, "Cap", 1)
	return c
}

func TestAlertRateLimit(t *testing.T) {
	alerting.Lock()
	alerting.last = nil
	alerting.Unlock()
	advance(2 * time.Hour)
	if !alert("unit", "first") {
		t.Fatal("first alert sends")
	}
	if alert("unit", "second") {
		t.Fatal("second alert within the hour is suppressed")
	}
	if !alert("other", "different kind") {
		t.Fatal("rate limit is per kind")
	}
	advance(59 * time.Minute)
	if alert("unit", "still") {
		t.Fatal("still inside the hour")
	}
	advance(2 * time.Minute)
	if !alert("unit", "after an hour") {
		t.Fatal("sends again after an hour")
	}
	time.Sleep(50 * time.Millisecond)
	var n int
	db.QueryRow(`SELECT COUNT(*) FROM alerts WHERE kind='unit' AND delivered='test'`).Scan(&n)
	if n != 2 {
		t.Fatalf("2 unit alerts delivered and recorded, got %d", n)
	}
}

func TestAdminAuth(t *testing.T) {
	resetLimits()
	if r := call(t, "GET", "/admin/overview", nil); r.code != 401 {
		t.Fatalf("no token: %d", r.code)
	}
	if r := call(t, "GET", "/admin/overview", nil, "Authorization", "Bearer "+mintAs("google.com", "someone@example.com")); r.code != 403 {
		t.Fatalf("non-admin email: %d", r.code)
	}
	if r := call(t, "POST", "/admin/level", map[string]any{"level": 3}, "Authorization", "Bearer "+mintAs("google.com", "someone@example.com")); r.code != 403 || level() != 0 {
		t.Fatal("non-admin cannot change the level")
	}
	admin := "Bearer " + mintAs("google.com", "aaron@itmatters.mobi")
	r := call(t, "GET", "/admin/overview", nil, "Authorization", admin)
	if r.code != 200 || len(r.body["days"].([]any)) != 14 || r.body["live"] == nil {
		t.Fatalf("admin overview: %d %v", r.code, r.body["error"])
	}
	if r := call(t, "POST", "/admin/level", map[string]any{"level": 2}, "Authorization", admin); r.code != 200 || level() != 2 {
		t.Fatal("admin sets level")
	}
	setLevel(0, "test")
	code := createRoomCode(t)
	if call(t, "POST", "/admin/rooms/"+code+"/close", nil, "Authorization", admin).code != 200 || getRoom(code) != nil {
		t.Fatal("admin closes a room")
	}
	flushStats()
	var joins int
	db.QueryRow(`SELECT COALESCE(SUM(value),0) FROM stats_daily WHERE key='rooms_private'`).Scan(&joins)
	if joins == 0 {
		t.Fatal("stats recorded room creations")
	}
}

func progQ(i, stages int) map[string]any {
	q := mcQ(i)
	q["format"], q["stages"] = "reveal", stages
	delete(q, "timeLimit")
	return q
}

func TestVoteToReveal(t *testing.T) {
	resetLimits()
	clearRooms()
	r := call(t, "POST", "/rooms", map[string]any{"hostName": "H", "answerSec": 10, "gapSec": 0,
		"questions": []any{progQ(0, 4), progQ(1, 3), mcQ(2)}})
	code, hk := r.body["code"].(string), r.body["hostKey"].(string)
	k1, _ := join(t, code, "A")
	k2, _ := join(t, code, "B")
	vote := func(k string, q int) resp {
		return call(t, "POST", "/rooms/"+code+"/vote", map[string]any{"playerKey": k, "q": q})
	}
	st := call(t, "POST", "/rooms/"+code+"/start", map[string]any{"key": hk}).body
	if num(st["stages"]) != 4 || num(st["limitMs"]) != 15000 {
		t.Fatalf("progressive initial deadline = answer × 1.5: %v %v", st["stages"], st["limitMs"])
	}
	if vote(k1, 0).code != 409 {
		t.Fatal("no voting during the lead-in")
	}
	advance(leadInMs * time.Millisecond)
	start := num(state(t, code, hk)["qDeadline"]) - 15000
	// unanimous advance
	vote(k1, 0)
	st = vote(k2, 0).body
	if num(st["stage"]) != 0 || num(st["votes"]) != 2 || num(st["needed"]) != 3 {
		t.Fatalf("2/3 votes: %v %v %v", st["stage"], st["votes"], st["needed"])
	}
	advance(12 * time.Second)
	st = vote(hk, 0).body
	if num(st["stage"]) != 1 || num(st["votes"]) != 0 {
		t.Fatalf("unanimous → stage 1: %v", st["stage"])
	}
	// extension: max(15 s, 12 s + max(5 s, 10/2 s)) = 17 s from start
	if d := num(st["qDeadline"]) - start; d != 17000 || num(st["limitMs"]) != 17000 {
		t.Fatalf("extended deadline %d", d)
	}
	// a disconnected player doesn't block: B goes silent
	advance(onlineMs*time.Millisecond + time.Second)
	state(t, code, hk)
	state(t, code, k1)
	vote(hk, 0)
	st = vote(k1, 0).body
	if num(st["stage"]) != 2 || num(st["needed"]) != 2 {
		t.Fatalf("offline player excluded: stage %v needed %v", st["stage"], st["needed"])
	}
	// cap: 90 s from the start
	if d := num(st["qDeadline"]) - start; d > 90000 {
		t.Fatalf("deadline beyond the cap: %d", d)
	}
	// the multiplier: answering at stage 2 of 4 = 1 - 0.6*2/3 = 0.6
	a := call(t, "POST", "/rooms/"+code+"/answer", map[string]any{"key": k1, "q": 0, "given": "Right", "correct": true, "ms": 999999})
	ms, lim := num(a.body["ms"]), 15000
	want := int(math.Round(float64(basePoints("reveal", true, nil, ms, lim, true)) * 0.6))
	if num(a.body["points"]) != want {
		t.Fatalf("stage multiplier: got %v want %d", a.body["points"], want)
	}
	// lock on first answer
	st = state(t, code, hk)
	if st["locked"] != true || vote(hk, 0).code != 409 {
		t.Fatal("the first answer locks voting")
	}
	if num(st["you"].(map[string]any)["stage"]) != 0 {
		t.Fatal("host hasn't answered")
	}
	call(t, "POST", "/rooms/"+code+"/next", map[string]any{"key": hk, "q": 0})
	st = call(t, "POST", "/rooms/"+code+"/next", map[string]any{"key": hk}).body
	if st["locked"] == true || num(st["stage"]) != 0 {
		t.Fatal("next question resets stage and lock")
	}
}

func TestStageExtensionCap(t *testing.T) {
	resetLimits()
	clearRooms()
	r := call(t, "POST", "/rooms", map[string]any{"hostName": "Solo", "answerSec": 30, "questions": []any{progQ(0, 10)}})
	code, hk := r.body["code"].(string), r.body["hostKey"].(string)
	st := call(t, "POST", "/rooms/"+code+"/start", map[string]any{"key": hk}).body
	if num(st["limitMs"]) != 45000 {
		t.Fatalf("30 s × 1.5: %v", st["limitMs"])
	}
	qs := num(st["qStart"])
	advance(leadInMs * time.Millisecond)
	for i := 0; i < 8; i++ {
		advance(14 * time.Second)
		state(t, code, hk)
		st = call(t, "POST", "/rooms/"+code+"/vote", map[string]any{"key": hk, "q": 0}).body
	}
	if num(st["stage"]) < 5 {
		t.Fatalf("solo votes advance: %v", st["stage"])
	}
	if d := num(st["qDeadline"]) - qs; d != 90000 {
		t.Fatalf("capped at 90 s, got %d", d)
	}
	r2 := call(t, "POST", "/rooms", map[string]any{"hostName": "Short", "answerSec": 3, "questions": []any{progQ(0, 3)}})
	st = call(t, "POST", "/rooms/"+r2.body["code"].(string)+"/start", map[string]any{"key": r2.body["hostKey"]}).body
	if num(st["limitMs"]) != 10000 {
		t.Fatalf("min 10 s: %v", st["limitMs"])
	}
	clearRooms()
}

func TestKidsStagesAutoAdvance(t *testing.T) {
	resetLimits()
	clearRooms()
	r := call(t, "POST", "/rooms", map[string]any{"hostName": "Mum", "spec": map[string]any{"kids": true}, "questions": []any{progQ(0, 3)}})
	code, hk := r.body["code"].(string), r.body["hostKey"].(string)
	call(t, "POST", "/rooms/"+code+"/start", map[string]any{"key": hk})
	advance(leadInMs*time.Millisecond + kidsStageMs*time.Millisecond + 10*time.Millisecond)
	state(t, code, hk)
	tickRooms()
	if num(state(t, code, hk)["stage"]) != 1 {
		t.Fatal("kids stages auto-advance")
	}
	clearRooms()
}

func roundQ(i, round int) map[string]any {
	q := mcQ(i)
	q["round"] = round
	return q
}

// Multi-round rooms: round sizes/ordinals in state, a round-card lead-in on each round's
// first question, late join during that card, per-round scores, timeScale-stretched limits.
func TestMultiRound(t *testing.T) {
	resetLimits()
	clearRooms()
	// spec round 1 was dropped (media), so ordinals 0,1,2 map to spec rounds 0,2,3
	qs := []any{roundQ(0, 0), roundQ(1, 0), roundQ(2, 2), roundQ(3, 2), roundQ(4, 3)}
	r := call(t, "POST", "/rooms", map[string]any{"hostName": "H", "answerSec": 10, "gapSec": 0, "questions": qs})
	code, hk := r.body["code"].(string), r.body["hostKey"].(string)
	k1, _ := join(t, code, "A")
	peek := call(t, "GET", "/rooms/"+code, nil).body
	if num(peek["rounds"]) != 3 {
		t.Fatalf("peek rounds: %v", peek)
	}
	st := call(t, "POST", "/rooms/"+code+"/start", map[string]any{"key": hk}).body
	if fmt.Sprint(st["roundSizes"]) != "[2 2 1]" || fmt.Sprint(st["roundSpec"]) != "[0 2 3]" || num(st["round"]) != 0 {
		t.Fatalf("round fields: %v %v %v", st["roundSizes"], st["roundSpec"], st["round"])
	}
	if lead := num(st["qStart"]) - num(st["now"]); lead != leadInMs+roundIntroMs {
		t.Fatalf("first question of a round gets the round card: lead %d", lead)
	}
	ans := func(key string, q int, ms float64) {
		t.Helper()
		if c := call(t, "POST", "/rooms/"+code+"/answer", map[string]any{"key": key, "q": q, "given": "Right", "correct": true, "ms": ms}); c.code != 200 {
			t.Fatalf("answer q%d: %v", q, c.body)
		}
	}
	next := func() map[string]any {
		return call(t, "POST", "/rooms/"+code+"/next", map[string]any{"key": hk}).body
	}
	advance((leadInMs + roundIntroMs) * time.Millisecond)
	ans(hk, 0, 0)
	ans(k1, 0, 0)
	st = next()
	if num(st["q"]) != 1 || num(st["qStart"])-num(st["now"]) != leadInMs {
		t.Fatalf("mid-round question has the normal lead-in: %v", num(st["qStart"])-num(st["now"]))
	}
	advance(leadInMs * time.Millisecond)
	ans(hk, 1, 0)
	ans(k1, 1, 0)
	st = next()
	if num(st["round"]) != 1 || num(st["qStart"])-num(st["now"]) != leadInMs+roundIntroMs {
		t.Fatalf("round 2 card: round %v lead %v", st["round"], num(st["qStart"])-num(st["now"]))
	}
	// joining while the round card shows plays this question; after it opens, the next one
	k2, j2 := join(t, code, "Late")
	if num(j2.body["room"].(map[string]any)["you"].(map[string]any)["joinedQ"]) != 2 {
		t.Fatalf("join during the round card: %v", j2.body["room"].(map[string]any)["you"])
	}
	advance((leadInMs + roundIntroMs) * time.Millisecond)
	_, j3 := join(t, code, "Later")
	if num(j3.body["room"].(map[string]any)["you"].(map[string]any)["joinedQ"]) != 3 {
		t.Fatal("join after the question opened starts at the next one")
	}
	ans(hk, 2, 0)
	ans(k1, 2, 0)
	ans(k2, 2, 0)
	st = state(t, code, hk)
	var a map[string]any
	for _, p := range players(st) {
		if p["name"] == "A" {
			a = p
		}
	}
	// A: q0 500, q1 500 +10% streak = 550, q2 500 +20% = 600
	if fmt.Sprint(a["rs"]) != "[1050 600 0]" || num(a["score"]) != 1650 {
		t.Fatalf("per-round scores: %v score %v", a["rs"], a["score"])
	}

	// single-round rooms carry no round fields and keep the plain lead-in
	code2, hk2 := createRoom(t, "Solo", 2)
	st = call(t, "POST", "/rooms/"+code2+"/start", map[string]any{"key": hk2}).body
	if st["roundSizes"] != nil || num(st["qStart"])-num(st["now"]) != leadInMs || players(st)[0]["rs"] != nil {
		t.Fatalf("single round: %v %v", st["roundSizes"], num(st["qStart"])-num(st["now"]))
	}
}

func TestTimeScaleLimits(t *testing.T) {
	resetLimits()
	clearRooms()
	q := func(format string, ts float64) map[string]any {
		m := mcQ(0)
		m["format"], m["tscale"] = format, ts
		delete(m, "timeLimit")
		return m
	}
	room := newRoom(nil, "", nil)
	room.AnswerMs = 10000
	for _, c := range []struct {
		f    string
		ts   float64
		want int
	}{{"number", 2, 20000}, {"mc", 0, 10000}, {"mc", 0.5, 10000}, {"number", 100, 60000}, {"connect", 6, 120000}, {"type", 1.8, 30000}} {
		raw, _ := json.Marshal(q(c.f, c.ts))
		if got := room.limitFor(parseMeta(raw)); got != c.want {
			t.Fatalf("%s × %v: %d want %d", c.f, c.ts, got, c.want)
		}
	}
	room.AnswerMs = 30000
	raw, _ := json.Marshal(q("connect", 6))
	if got := room.limitFor(parseMeta(raw)); got != maxScaledMs {
		t.Fatalf("scaled limit cap: %d", got)
	}
	roomsMu.Lock()
	delete(rooms, room.Code)
	roomsMu.Unlock()
}
