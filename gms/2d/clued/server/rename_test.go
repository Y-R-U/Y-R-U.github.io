package main

import (
	"testing"
	"time"
)

func rename(t *testing.T, code, key, name string) resp {
	t.Helper()
	return call(t, "POST", "/rooms/"+code+"/rename", map[string]any{"key": key, "name": name})
}

func nameOf(st map[string]any, id string) string {
	for _, p := range players(st) {
		if p["id"] == id {
			n, _ := p["name"].(string)
			return n
		}
	}
	return ""
}

func TestRename(t *testing.T) {
	resetLimits()
	code, hk := createRoom(t, "Player", 2)
	k1, r1 := join(t, code, "Sam")
	samID := r1.body["playerId"].(string)
	hostID := state(t, code, hk)["you"].(map[string]any)["id"].(string)

	r := rename(t, code, hk, "  Aaron​  the\tHost ")
	if r.code != 200 || r.body["you"].(map[string]any)["name"] != "Aaron the Host" {
		t.Fatalf("host rename: %d %v", r.code, r.body)
	}
	if got := nameOf(state(t, code, k1), hostID); got != "Aaron the Host" {
		t.Fatalf("joiner sees %q", got)
	}
	if peek := call(t, "GET", "/rooms/"+code, nil); peek.body["host"] != "Aaron the Host" {
		t.Fatalf("peek host %v", peek.body["host"])
	}

	// duplicate names resolve like joins; keeping your own name (any case) is not a clash
	if r := rename(t, code, k1, "aaron the host"); r.code != 200 || nameOf(r.body, samID) != "aaron the host 2" {
		t.Fatalf("dedupe: %v", r.body)
	}
	if r := rename(t, code, k1, "AARON THE HOST 2"); r.code != 200 || nameOf(r.body, samID) != "AARON THE HOST 2" {
		t.Fatalf("own-name recase: %v", r.body)
	}

	// capped, cleaned, and refused the same way as join names
	if r := rename(t, code, k1, "Averyveryverylongnamethatgoes"); nameOf(r.body, samID) != "Averyveryverylongnam" {
		t.Fatalf("cap: %v", r.body)
	}
	if r := rename(t, code, k1, "<b>"); nameOf(r.body, samID) != "b" {
		t.Fatalf("angle brackets: %v", r.body)
	}
	for bad, want := range map[string]string{"shithead": "bad_name", "   ": "name_required", "\u0000": "name_required"} {
		if r := rename(t, code, k1, bad); r.code != 400 || r.body["code"] != want {
			t.Fatalf("rename %q: %d %v", bad, r.code, r.body)
		}
	}
	if r := rename(t, code, "nope", "Fine"); r.code != 403 {
		t.Fatalf("bad key: %d", r.code)
	}

	// locked while a question is open, allowed again at the reveal
	call(t, "POST", "/rooms/"+code+"/start", map[string]any{"key": hk})
	if r := rename(t, code, k1, "Mid Q"); r.code != 409 || r.body["code"] != "in_question" {
		t.Fatalf("mid-question rename: %d %v", r.code, r.body)
	}
	advance(leadInMs * time.Millisecond)
	call(t, "POST", "/rooms/"+code+"/next", map[string]any{"key": hk, "q": 0})
	if st := state(t, code, hk); st["phase"] != "reveal" {
		t.Fatalf("expected reveal, got %v", st["phase"])
	}
	if r := rename(t, code, k1, "Between"); r.code != 200 || nameOf(r.body, samID) != "Between" {
		t.Fatalf("reveal rename: %d %v", r.code, r.body)
	}

	// kicked players can't rename
	call(t, "POST", "/rooms/"+code+"/kick", map[string]any{"key": hk, "playerId": samID})
	if r := rename(t, code, k1, "Back"); r.code != 410 {
		t.Fatalf("kicked rename: %d", r.code)
	}
}
