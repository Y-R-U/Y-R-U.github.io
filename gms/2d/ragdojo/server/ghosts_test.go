package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"
)

func rseat(uid, name string, won bool, kos int) seatRow {
	return seatRow{UID: uid, Name: name, Won: won, KOs: kos, Ranked: true}
}

func call(t *testing.T, method, url, tok string, body any) (int, map[string]any) {
	t.Helper()
	var rd *bytes.Reader
	if body != nil {
		rd = bytes.NewReader(mustJSON(body))
	} else {
		rd = bytes.NewReader(nil)
	}
	req, _ := http.NewRequest(method, url, rd)
	if tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	var m map[string]any
	json.NewDecoder(res.Body).Decode(&m)
	return res.StatusCode, m
}

func names(m map[string]any) string {
	var out []string
	rows, _ := m["rows"].([]any)
	for _, r := range rows {
		row := r.(map[string]any)
		out = append(out, row["name"].(string)+":"+strings.TrimSuffix(strings.TrimSuffix(jsonNum(row["value"]), ".0"), ""))
	}
	return strings.Join(out, ",")
}

func jsonNum(v any) string { b, _ := json.Marshal(v); return string(b) }

// Every board orders by its own column, per arena type where asked, marks only the caller's
// row, and never leaks a uid.
func TestLeaderboardOrdering(t *testing.T) {
	r := newRig(t, false)
	boardTypes["xtest"] = true
	t.Cleanup(func() { delete(boardTypes, "xtest") })
	st := r.h.st
	day := time.Date(2026, 10, 13, 12, 0, 0, 0, time.UTC)
	st.now = func() time.Time { return day.Add(-24 * time.Hour) }
	// Yesterday: Cara plays a lot (but not today).
	for i := 0; i < 5; i++ {
		st.recordMatch("y"+string(rune('a'+i)), "duel", false, "2-0", []seatRow{rseat("cara", "Cara", true, 2), rseat("dan", "Dan", false, 0)})
	}
	st.now = func() time.Time { return day }
	// Today: Ann 3 duels (2 wins), Bob 3 duels (1 win) + 4 xtest battles (all lost), Cara 1 xtest win.
	rec := func(id, typ string, a, b seatRow) {
		if err := st.recordMatch(id, typ, false, "2-1", []seatRow{a, b}); err != nil {
			t.Fatal(err)
		}
	}
	rec("t1", "duel", rseat("ann", "Ann", true, 3), rseat("bob", "Bob", false, 1))
	rec("t2", "duel", rseat("ann", "Ann", true, 2), rseat("bob", "Bob", false, 0))
	rec("t3", "duel", rseat("ann", "Ann", false, 0), rseat("bob", "Bob", true, 4))
	for i := 0; i < 3; i++ {
		rec("x"+string(rune('a'+i)), "xtest", rseat("eve", "Eve", true, 1), rseat("bob", "Bob", false, 0))
	}
	rec("x9", "xtest", rseat("cara", "Cara", true, 1), rseat("bob", "Bob", false, 0))

	base := r.srv.URL + prefix + "/leaderboard"
	want := map[string]string{
		"?board=today":              "Bob:7,Eve:3,Ann:3,Cara:1",
		"?board=battles":            "Bob:7,Cara:6,Dan:5,Eve:3,Ann:3",
		"?board=wins":               "Cara:6,Eve:3,Ann:2,Bob:1,Dan:0",
		"?board=losses":             "Bob:6,Dan:5,Ann:1,Cara:0,Eve:0",
		"?board=streak":             "Cara:6,Eve:3,Ann:2,Bob:1,Dan:0",
		"?board=kos":                "Cara:11,Ann:5,Bob:5,Eve:3,Dan:0",
		"?board=battles&type=xtest": "Bob:4,Eve:3,Cara:1",
		"?board=wins&type=xtest":    "Eve:3,Cara:1,Bob:0",
		"?board=battles&type=duel":  "Cara:5,Dan:5,Ann:3,Bob:3",
		"?board=wins&type=duel":     "Cara:5,Ann:2,Bob:1,Dan:0",
	}
	for q, w := range want {
		_, m := call(t, "GET", base+q, "", nil)
		if got := names(m); got != w {
			t.Errorf("%s: got %s want %s", q, got, w)
		}
	}
	if code, _ := call(t, "GET", base+"?board=wins&type=nosuch", "", nil); code != 404 {
		t.Errorf("unknown type: %d", code)
	}
	_, m := call(t, "GET", base+"?board=wins", "dev:ann", nil)
	b, _ := json.Marshal(m)
	if strings.Count(string(b), `"you":true`) != 1 || !strings.Contains(string(b), `{"losses":1,"name":"Ann","value":2,"wins":2,"you":true}`) {
		t.Errorf("you-mark: %s", b)
	}
	for _, uid := range []string{"ann", "bob", "cara", "dev:"} {
		if strings.Contains(string(b), `"`+uid+`"`) {
			t.Errorf("leaks uid %q: %s", uid, b)
		}
	}

	// The stats card.
	code, c := call(t, "GET", r.srv.URL+prefix+"/me", "dev:bob", nil)
	if code != 200 || num(c["battles"]) != 7 || num(c["wins"]) != 1 || num(c["losses"]) != 6 || num(c["today"]) != 7 || num(c["kos"]) != 5 || num(c["rank"]) != 4 {
		t.Errorf("card: %d %v", code, c)
	}
	types, _ := c["types"].(map[string]any)
	if x, _ := types["xtest"].(map[string]any); num(x["battles"]) != 4 || num(x["losses"]) != 4 {
		t.Errorf("card types: %v", types)
	}
	if code, _ := call(t, "GET", r.srv.URL+prefix+"/me", "", nil); code != 401 {
		t.Errorf("card without sign-in: %d", code)
	}
	if code, _ := call(t, "GET", r.srv.URL+prefix+"/me", "anon:zed", nil); code != 401 {
		t.Errorf("card for anonymous: %d", code)
	}
}

// Only a signed-in player can leave a ghost; the snapshot is cleaned, the caller never sees
// their own, and there is no way to report a ghost fight's result.
func TestGhostUploadAndList(t *testing.T) {
	r := newRig(t, false)
	st := r.h.st
	now := time.Now()
	st.now = func() time.Time { return now }
	st.recordMatch("m1", "duel", false, "2-0", []seatRow{rseat("ann", "Ann", true, 2), rseat("bob", "Bob", false, 0)})
	url := r.srv.URL + prefix + "/ghost"
	snap := map[string]any{"v": 1, "t": "dark", "cd": 0, "p": map[string]int{"hp": 4, "atk": 99}, "m": map[string][2]int{"d_shank": {3, 2}, "power": {-5, 1}}}
	if code, _ := call(t, "POST", url, "", map[string]any{"name": "Ann", "snap": snap}); code != 401 {
		t.Errorf("anonymous upload: %d", code)
	}
	if code, _ := call(t, "POST", url, "anon:x", map[string]any{"name": "Ann", "snap": snap}); code != 401 {
		t.Errorf("firebase-anonymous upload: %d", code)
	}
	if code, _ := call(t, "POST", url, "dev:ann", map[string]any{"name": "Ann", "snap": map[string]any{"v": 1, "t": "space"}}); code != 400 {
		t.Errorf("bad theme accepted: %d", code)
	}
	if code, _ := call(t, "POST", url, "dev:ann", map[string]any{"name": "Ann", "snap": map[string]any{"v": 1, "t": "light", "m": map[string][2]int{"<script>": {1, 1}}}}); code != 400 {
		t.Errorf("bad move id accepted: %d", code)
	}
	if code, _ := call(t, "POST", url, "dev:ann", map[string]any{"name": "fuckface", "snap": snap}); code != 400 {
		t.Errorf("profane name accepted: %d", code)
	}
	if code, m := call(t, "POST", url, "dev:ann", map[string]any{"name": "Ann", "snap": snap}); code != 200 {
		t.Fatalf("upload: %d %v", code, m)
	}
	if code, _ := call(t, "POST", url, "dev:ann", map[string]any{"name": "Ann", "snap": snap}); code != 429 {
		t.Errorf("second upload inside the gap: %d", code)
	}
	now = now.Add(ghostGap + time.Second)
	if code, _ := call(t, "POST", url, "dev:cid", map[string]any{"name": "Cid", "snap": map[string]any{"v": 1, "t": "light"}}); code != 200 {
		t.Errorf("cid upload: %d", code)
	}

	_, all := call(t, "GET", r.srv.URL+prefix+"/ghosts", "", nil)
	gs, _ := all["ghosts"].([]any)
	if len(gs) != 2 {
		t.Fatalf("ghosts: %v", all)
	}
	cid, ann := gs[0].(map[string]any), gs[1].(map[string]any)
	if cid["name"] != "Cid" || ann["name"] != "Ann" || num(ann["wins"]) != 1 || num(ann["battles"]) != 1 || num(cid["battles"]) != 0 {
		t.Errorf("ghost rows: %v", gs)
	}
	s := jsonNum(ann["snap"])
	if s != `{"cd":0,"m":{"d_shank":[3,2],"power":[0,1]},"p":{"atk":30,"hp":4},"t":"dark","v":1}` {
		t.Errorf("snapshot not cleaned: %s", s)
	}
	if b := jsonNum(all); strings.Contains(b, `"ann"`) || strings.Contains(b, `"uid"`) {
		t.Errorf("ghost list leaks uids: %s", b)
	}
	_, mine := call(t, "GET", r.srv.URL+prefix+"/ghosts", "dev:ann", nil)
	if gs, _ := mine["ghosts"].([]any); len(gs) != 1 || gs[0].(map[string]any)["name"] != "Cid" {
		t.Errorf("own ghost listed to its owner: %v", mine)
	}
	if _, c := call(t, "GET", r.srv.URL+prefix+"/me", "dev:ann", nil); c["ghost"] != true {
		t.Errorf("card does not know about the ghost: %v", c)
	}
	// Nothing accepts a ghost result.
	for _, p := range []string{"/ghost/result", "/ghosts", "/result"} {
		if code, _ := call(t, "POST", r.srv.URL+prefix+p, "dev:ann", map[string]any{"won": true}); code < 400 {
			t.Errorf("POST %s accepted: %d", p, code)
		}
	}
	// Old ghosts age out.
	now = now.Add(ghostMaxAge + time.Hour)
	if _, all := call(t, "GET", r.srv.URL+prefix+"/ghosts", "", nil); len(all["ghosts"].([]any)) != 0 {
		t.Errorf("stale ghosts listed: %v", all)
	}
}

// On the family LAN a device token is the identity: its own card, ghost and board mark.
func TestLanBoardsUseDeviceIdentity(t *testing.T) {
	r := newRig(t, false)
	r.h.verify = lanVerifier
	r.h.st.recordMatch("l1", "duel", false, "2-0", []seatRow{rseat("lan:kid1", "Kid One", true, 2), rseat("lan:kid2", "Kid Two", false, 0)})
	if code, c := call(t, "GET", r.srv.URL+prefix+"/me", "lan:kid1", nil); code != 200 || c["name"] != "Kid One" || num(c["wins"]) != 1 {
		t.Errorf("LAN card: %d %v", code, c)
	}
	if code, _ := call(t, "GET", r.srv.URL+prefix+"/me", "dev:kid1", nil); code != 401 {
		t.Errorf("a non-LAN token on a LAN server: %d", code)
	}
	if code, _ := call(t, "POST", r.srv.URL+prefix+"/ghost", "lan:kid2", map[string]any{"name": "Kid Two", "snap": map[string]any{"v": 1, "t": "light"}}); code != 200 {
		t.Errorf("LAN ghost upload: %d", code)
	}
	_, lb := call(t, "GET", r.srv.URL+prefix+"/leaderboard?board=wins", "lan:kid1", nil)
	if b := jsonNum(lb); !strings.Contains(b, `"name":"Kid One","value":1,"wins":1,"you":true`) && !strings.Contains(b, `{"losses":0,"name":"Kid One","value":1,"wins":1,"you":true}`) {
		t.Errorf("LAN board: %s", b)
	}
}
