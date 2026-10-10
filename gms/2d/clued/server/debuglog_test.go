package main

import (
	"fmt"
	"strings"
	"testing"
	"time"
)

func debugRows() int {
	var n int
	db.QueryRow(`SELECT COUNT(*) FROM debug_logs`).Scan(&n)
	return n
}

func dbgBatch(n int, tag string) map[string]any {
	lines := []any{}
	for i := 0; i < n; i++ {
		lines = append(lines, map[string]any{"t": clock.UnixMilli(), "p": 1234.5, "lvl": "info", "tag": tag, "msg": fmt.Sprint("m", i), "data": map[string]any{"i": i, "state": "running"}})
	}
	return map[string]any{"device": "dev1", "session": "s1", "build": "202610100431", "ua": "TestUA", "room": "ABCDE", "lines": lines}
}

func TestDebugLogGating(t *testing.T) {
	resetLimits()
	db.Exec(`DELETE FROM debug_logs`)
	setDebug(false, "test")
	if st := call(t, "GET", "/status", nil); st.body["debugLogs"] != false {
		t.Fatalf("status off: %v", st.body)
	}
	if r := call(t, "POST", "/debuglog", dbgBatch(3, "clip")); r.code != 204 || debugRows() != 0 {
		t.Fatalf("off: want 204 and nothing stored, got %d rows=%d", r.code, debugRows())
	}
	// off ignores even oversized and broken bodies without reading them
	if r := call(t, "POST", "/debuglog", "{not json"); r.code != 204 {
		t.Fatalf("off + bad json: %d", r.code)
	}

	setDebug(true, "test")
	if st := call(t, "GET", "/status", nil); st.body["debugLogs"] != true {
		t.Fatalf("status on: %v", st.body)
	}
	if r := call(t, "POST", "/debuglog", dbgBatch(3, "clip"), "Content-Type", "text/plain;charset=UTF-8"); r.code != 200 || num(r.body["stored"]) != 3 || debugRows() != 3 {
		t.Fatalf("on: %d %v rows=%d", r.code, r.body, debugRows())
	}
	var dev, room, tag, data, ua string
	var cts int64
	db.QueryRow(`SELECT device, room, tag, data, ua, cts FROM debug_logs ORDER BY id LIMIT 1`).Scan(&dev, &room, &tag, &data, &ua, &cts)
	if dev != "dev1" || room != "ABCDE" || tag != "clip" || !strings.Contains(data, `"state":"running"`) || ua != "TestUA" || cts != clock.UnixMilli() {
		t.Fatalf("row: %q %q %q %q %q %d", dev, room, tag, data, ua, cts)
	}
	// size cap: > 64 KB → 413, nothing stored
	big := dbgBatch(1, "x")
	big["lines"].([]any)[0].(map[string]any)["msg"] = strings.Repeat("a", 70<<10)
	if r := call(t, "POST", "/debuglog", big); r.code != 413 || debugRows() != 3 {
		t.Fatalf("too large: %d rows=%d", r.code, debugRows())
	}
	// at most debugMaxLines per request; long fields truncated
	b := dbgBatch(debugMaxLines+50, "many")
	b["lines"].([]any)[0].(map[string]any)["msg"] = strings.Repeat("é", 400)
	if r := call(t, "POST", "/debuglog", b); r.code != 200 || num(r.body["stored"]) != debugMaxLines {
		t.Fatalf("line cap: %d %v", r.code, r.body)
	}
	var msg string
	db.QueryRow(`SELECT msg FROM debug_logs WHERE tag='many' ORDER BY id LIMIT 1`).Scan(&msg)
	if len(msg) > 504 {
		t.Fatalf("msg not truncated: %d", len(msg))
	}

	// turning it off again stops storage at once
	setDebug(false, "test")
	before := debugRows()
	if r := call(t, "POST", "/debuglog", dbgBatch(2, "clip")); r.code != 204 || debugRows() != before {
		t.Fatalf("off again: %d", r.code)
	}
}

func TestDebugLogRateLimit(t *testing.T) {
	resetLimits()
	setDebug(true, "test")
	defer setDebug(false, "test")
	ok, limited := 0, 0
	for i := 0; i < 130; i++ {
		switch call(t, "POST", "/debuglog", dbgBatch(1, "rate")).code {
		case 200:
			ok++
		case 429:
			limited++
		}
	}
	if ok != limits["debuglog"].max || limited != 130-ok {
		t.Fatalf("rate limit: ok=%d limited=%d", ok, limited)
	}
	resetLimits()
}

func TestDebugLogCapAndPrune(t *testing.T) {
	resetLimits()
	db.Exec(`DELETE FROM debug_logs`)
	setDebug(true, "test")
	defer setDebug(false, "test")
	old := debugCap
	debugCap = 250
	defer func() { debugCap = old }()
	for i := 0; i < 4; i++ {
		call(t, "POST", "/debuglog", dbgBatch(100, fmt.Sprint("cap", i)))
	}
	if n := debugRows(); n != 250 {
		t.Fatalf("cap: %d rows", n)
	}
	var first string
	db.QueryRow(`SELECT tag FROM debug_logs ORDER BY id LIMIT 1`).Scan(&first)
	if first != "cap1" {
		t.Fatalf("oldest rows should go first, oldest left is %s", first)
	}
	// 7-day prune by server time
	advance(debugTTL + time.Hour)
	call(t, "POST", "/debuglog", dbgBatch(5, "fresh"))
	if n := debugRows(); n != 5 {
		t.Fatalf("prune: %d rows", n)
	}
	advance(debugTTL + time.Hour)
	sweepDB()
	if n := debugRows(); n != 0 {
		t.Fatalf("sweep prune: %d rows", n)
	}
}

func TestDebugLogAdmin(t *testing.T) {
	resetLimits()
	db.Exec(`DELETE FROM debug_logs`)
	setDebug(false, "test")
	admin := "Bearer " + mintAs("google.com", "aaron@itmatters.mobi")
	if r := call(t, "GET", "/admin/debuglog", nil); r.code != 401 {
		t.Fatalf("no token: %d", r.code)
	}
	if r := call(t, "POST", "/admin/debuglog", map[string]any{"on": true}, "Authorization", "Bearer "+mintAs("google.com", "x@example.com")); r.code != 403 || debugOn() {
		t.Fatal("non-admin cannot switch it on")
	}
	if r := call(t, "POST", "/admin/debuglog", map[string]any{"on": true}, "Authorization", admin); r.code != 200 || r.body["on"] != true || !debugOn() {
		t.Fatalf("admin on: %d %v", r.code, r.body)
	}
	call(t, "POST", "/debuglog", dbgBatch(3, "listen"))
	b := dbgBatch(2, "clip")
	b["device"] = "dev2"
	call(t, "POST", "/debuglog", b)
	r := call(t, "GET", "/admin/debuglog?since=1h&device=dev2", nil, "Authorization", admin)
	if r.code != 200 || len(r.body["lines"].([]any)) != 2 || num(r.body["rows"]) != 5 || num(r.body["devices"]) != 2 {
		t.Fatalf("admin get: %d %v", r.code, r.body)
	}
	r = call(t, "GET", "/admin/debuglog?tag=listen", nil, "Authorization", admin)
	lines := r.body["lines"].([]any)
	if len(lines) != 3 || lines[0].(map[string]any)["msg"] != "m0" || lines[0].(map[string]any)["data"].(map[string]any)["state"] != "running" {
		t.Fatalf("tag filter / order / data: %v", lines)
	}
	if r := call(t, "GET", "/admin/overview", nil, "Authorization", admin); r.body["debug"].(map[string]any)["rows"] != float64(5) {
		t.Fatalf("overview debug: %v", r.body["debug"])
	}
	if r := call(t, "POST", "/admin/debuglog", map[string]any{"clear": true, "on": false}, "Authorization", admin); r.code != 200 || debugRows() != 0 || debugOn() {
		t.Fatalf("clear + off: %d %v", r.code, r.body)
	}
	// the setting persists (a CLI write from another process is seen within the cache window)
	putSetting("debugLogs", "1")
	dbgFlag.Lock()
	dbgFlag.read = time.Time{}
	dbgFlag.Unlock()
	if !debugOn() {
		t.Fatal("setting written elsewhere not picked up")
	}
	setDebug(false, "test")
}

func TestParseSince(t *testing.T) {
	now := nowFn().UnixMilli()
	if v := parseSince("1h"); now-v != time.Hour.Milliseconds() {
		t.Fatalf("1h: %d", now-v)
	}
	if v := parseSince("2d"); now-v != 48*time.Hour.Milliseconds() {
		t.Fatalf("2d: %d", now-v)
	}
	if parseSince("1700000000000") != 1700000000000 || parseSince("") != 0 || parseSince("junk") != 0 {
		t.Fatal("epoch / empty / junk")
	}
}
