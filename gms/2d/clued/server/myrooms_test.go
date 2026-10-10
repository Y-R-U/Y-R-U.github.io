package main

import (
	"testing"
	"time"
)

// keepOnline polls as each key every 20 s for d, ticking the rooms, so those players stay connected.
func keepOnline(t *testing.T, d time.Duration, seats ...[2]string) {
	t.Helper()
	for left := d; left > 0; left -= 20 * time.Second {
		advance(20 * time.Second)
		for _, s := range seats {
			state(t, s[0], s[1])
		}
		tickRooms()
	}
}

func TestEndRoom(t *testing.T) {
	resetLimits()
	code, hk := createRoom(t, "Host", 3)
	k1, _ := join(t, code, "Ann")
	k2, _ := join(t, code, "Bob")
	call(t, "POST", "/rooms/"+code+"/start", map[string]any{"key": hk})
	if r := call(t, "POST", "/rooms/"+code+"/end", map[string]any{"hostKey": k1}); r.code != 403 {
		t.Fatalf("a non-host must not end the room: %d", r.code)
	}
	if state(t, code, k1)["phase"] != "question" {
		t.Fatal("a refused end changed the room")
	}
	if you := state(t, code, hk)["you"].(map[string]any); you["owner"] != true {
		t.Fatalf("creator is the owner: %v", you)
	}
	// the host leaves (Ann takes over); as the creator they can still end it from "Your rooms"
	if call(t, "POST", "/rooms/"+code+"/leave", map[string]any{"key": hk}).code != 200 {
		t.Fatal("host leave")
	}
	if st := state(t, code, k1); st["you"].(map[string]any)["host"] != true {
		t.Fatalf("handover after the host left: %v", st["hostId"])
	}
	if r := call(t, "POST", "/rooms/"+code+"/next", map[string]any{"key": hk}); r.code != 403 {
		t.Fatalf("the creator who left may only end, not run the room: %d", r.code)
	}
	if r := call(t, "POST", "/rooms/"+code+"/end", map[string]any{"key": k2}); r.code != 403 {
		t.Fatalf("a plain player still can't end: %d", r.code)
	}
	r := call(t, "POST", "/rooms/"+code+"/end", map[string]any{"hostKey": hk})
	if r.code != 200 || r.body["ended"] != true || r.body["phase"] != "final" {
		t.Fatalf("owner ends: %d %v", r.code, r.body)
	}
	st := state(t, code, k2)
	if st["ended"] != true || st["phase"] != "final" || len(players(st)) != 2 {
		t.Fatalf("players see the ended room with the podium: %v", st)
	}
	if _, j := join(t, code, "Late"); j.code != 410 || j.body["code"] != "room_ended" {
		t.Fatalf("no new joins into an ended room: %d %v", j.code, j.body)
	}
	if r := call(t, "POST", "/rooms/"+code+"/again", map[string]any{"key": k1, "questions": questions(1)}); r.code != 409 {
		t.Fatalf("no play again in an ended room: %d", r.code)
	}
	if p := call(t, "GET", "/rooms/"+code, nil); p.body["ended"] != true {
		t.Fatalf("peek says ended: %v", p.body)
	}
	if call(t, "POST", "/rooms/"+code+"/end", map[string]any{"key": k1}).code != 200 {
		t.Fatal("ending twice is harmless")
	}
	// it lingers while someone looks at the podium, then goes 2 min after the last one left
	keepOnline(t, 10*time.Minute, [2]string{code, k2})
	if getRoom(code) == nil {
		t.Fatal("ended room went while a player was still looking")
	}
	advance(onlineMs*time.Millisecond + time.Second)
	tickRooms()
	advance(endedEmptyMs*time.Millisecond + time.Second)
	tickRooms()
	if getRoom(code) != nil {
		t.Fatal("ended room should go once nobody is looking")
	}
}

func TestEndFreesCaps(t *testing.T) {
	resetLimits()
	clearRooms()
	oldPriv := cfg.MaxPrivate
	cfg.MaxPrivate = 2
	defer func() { cfg.MaxPrivate = oldPriv; clearRooms() }()
	mk := func(public bool) resp {
		return call(t, "POST", "/rooms", map[string]any{"hostName": "H", "questions": questions(2), "public": public})
	}
	pub := []resp{}
	for i := 0; i < cfg.MaxPublic; i++ {
		pub = append(pub, mk(true))
	}
	if r := mk(true); r.code != 409 {
		t.Fatalf("public cap full: %d", r.code)
	}
	if n := len(publicRooms(t)); n != cfg.MaxPublic {
		t.Fatalf("listed %d", n)
	}
	call(t, "POST", "/rooms/"+pub[0].body["code"].(string)+"/end", map[string]any{"hostKey": pub[0].body["hostKey"]})
	if publicCount() != cfg.MaxPublic-1 {
		t.Fatalf("public count after end: %d", publicCount())
	}
	for _, r := range publicRooms(t) {
		if r["code"] == pub[0].body["code"] {
			t.Fatal("ended room still listed")
		}
	}
	if r := mk(true); r.code != 200 {
		t.Fatalf("slot freed at once: %d %v", r.code, r.body)
	}
	a, b := mk(false), mk(false)
	if a.code != 200 || b.code != 200 {
		t.Fatal("two private rooms")
	}
	if r := mk(false); r.code != 503 {
		t.Fatalf("private cap full: %d", r.code)
	}
	call(t, "POST", "/rooms/"+a.body["code"].(string)+"/end", map[string]any{"hostKey": a.body["hostKey"]})
	if privateCount() != 1 {
		t.Fatalf("private count after end: %d", privateCount())
	}
	if r := mk(false); r.code != 200 {
		t.Fatalf("private slot freed at once: %d", r.code)
	}
}

func TestPlayerLeaveAndMine(t *testing.T) {
	resetLimits()
	code, hk := createRoom(t, "Host", 2)
	k1, _ := join(t, code, "Ann")
	if r := call(t, "POST", "/rooms/"+code+"/leave", map[string]any{"playerKey": k1}); r.code != 200 {
		t.Fatalf("leave with playerKey: %d", r.code)
	}
	if n := len(players(state(t, code, hk))); n != 1 {
		t.Fatalf("player left: %d players", n)
	}
	other, ok := createRoom(t, "Host", 1)
	call(t, "POST", "/rooms/"+other+"/end", map[string]any{"key": ok})
	before := state(t, code, hk)["ver"]
	r := call(t, "POST", "/rooms/mine", map[string]any{"rooms": []any{
		map[string]any{"code": code, "key": hk}, map[string]any{"code": code, "key": "nope"},
		map[string]any{"code": "ZZZZZ", "key": "x"}, map[string]any{"code": other, "key": ok}}})
	if r.code != 200 {
		t.Fatalf("mine: %d", r.code)
	}
	list := r.body["rooms"].([]any)
	gone := r.body["gone"].([]any)
	if len(list) != 1 || len(gone) != 3 {
		t.Fatalf("mine: %v", r.body)
	}
	m := list[0].(map[string]any)
	if m["code"] != code || m["isHost"] != true || m["owner"] != true || m["phase"] != "lobby" || num(m["players"]) != 1 || num(m["created"]) == 0 {
		t.Fatalf("mine row: %v", m)
	}
	if state(t, code, hk)["ver"] != before {
		t.Fatal("listing your rooms must not change the room")
	}
}

func TestAbandonedRoomExpiry(t *testing.T) {
	resetLimits()
	clearRooms()
	defer clearRooms()
	// a private game in progress whose players all went away
	code, hk := createRoom(t, "Gone", 3)
	k1, _ := join(t, code, "Ann")
	call(t, "POST", "/rooms/"+code+"/start", map[string]any{"key": hk})
	// a room where people are still connected is kept
	busy, bk := createRoom(t, "Busy", 3)
	call(t, "POST", "/rooms/"+busy+"/settings", map[string]any{"key": bk, "gapSec": 0})
	advance(onlineMs*time.Millisecond + time.Second)
	tickRooms()
	keepOnline(t, 15*time.Minute, [2]string{busy, bk})
	if getRoom(code) == nil {
		t.Fatal("expired before 20 min")
	}
	// a refresh within the window rejoins (and resets the clock)
	if r := call(t, "POST", "/rooms/"+code+"/join", map[string]any{"key": k1}); r.code != 200 || r.body["rejoined"] != true {
		t.Fatalf("rejoin inside the window: %d %v", r.code, r.body)
	}
	tickRooms()
	if getRoom(code).EmptyAt != 0 {
		t.Fatal("rejoin resets the empty clock")
	}
	advance(onlineMs*time.Millisecond + time.Second)
	tickRooms()
	keepOnline(t, 19*time.Minute, [2]string{busy, bk})
	if getRoom(code) == nil {
		t.Fatal("expired before 20 min after the rejoin")
	}
	// persisted empty clock: a restart doesn't make the room look busy again
	flushRooms(true)
	roomsMu.Lock()
	delete(rooms, code)
	roomsMu.Unlock()
	loadRooms()
	if r := getRoom(code); r == nil || r.EmptyAt == 0 || r.anyOnline(nowMs()) {
		t.Fatal("restored abandoned room keeps its empty clock")
	}
	keepOnline(t, 2*time.Minute, [2]string{busy, bk})
	if getRoom(code) != nil {
		t.Fatal("abandoned room should expire after 20 min with nobody connected")
	}
	if getRoom(busy) == nil {
		t.Fatal("a room with someone connected is kept")
	}
	var n int
	db.QueryRow(`SELECT COUNT(*) FROM rooms WHERE code = ?`, code).Scan(&n)
	if n != 0 {
		t.Fatal("expired room left in db")
	}
}

func TestAdminCloseFinished(t *testing.T) {
	resetLimits()
	clearRooms()
	defer clearRooms()
	admin := "Bearer " + mintAs("google.com", "aaron@itmatters.mobi")
	done, dk := createRoom(t, "Done", 1)
	call(t, "POST", "/rooms/"+done+"/start", map[string]any{"key": dk})
	call(t, "POST", "/rooms/"+done+"/end", map[string]any{"key": dk})
	idle, _ := createRoom(t, "Idle", 1)
	live, lk := createRoom(t, "Live", 1)
	advance(onlineMs*time.Millisecond + time.Second)
	state(t, live, lk)
	if r := call(t, "POST", "/admin/close-finished", nil, "Authorization", "Bearer "+mintAs("google.com", "someone@example.com")); r.code != 403 {
		t.Fatalf("non-admin: %d", r.code)
	}
	r := call(t, "POST", "/admin/close-finished", nil, "Authorization", admin)
	if r.code != 200 || num(r.body["closed"]) != 2 {
		t.Fatalf("close finished: %d %v", r.code, r.body)
	}
	if getRoom(done) != nil || getRoom(idle) != nil || getRoom(live) == nil {
		t.Fatal("closed the finished and the abandoned room, kept the live one")
	}
}
