package main

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func capAgainst(t *testing.T, reply string, status int) (*turnCap, *string) {
	var body string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer tok" {
			t.Errorf("missing bearer token")
		}
		buf := make([]byte, 4096)
		n, _ := r.Body.Read(buf)
		body = string(buf[:n])
		w.WriteHeader(status)
		fmt.Fprint(w, reply)
	}))
	t.Cleanup(srv.Close)
	c := newTurnCap("acct", "tok", 800)
	c.api = srv.URL
	return c, &body
}

func usage(gb float64) string {
	return fmt.Sprintf(`{"data":{"viewer":{"accounts":[{"callsTurnUsageAdaptiveGroups":[{"sum":{"egressBytes":%f}}]}]}}}`, gb*1e9)
}

func TestCapUnderLimitAllowsTurn(t *testing.T) {
	c, body := capAgainst(t, usage(12.5), 200)
	c.check()
	if !c.allowed() {
		t.Fatalf("12.5 GB of 800 should allow TURN: %v", c.status())
	}
	if !strings.Contains(*body, `"from":"`+time.Now().UTC().Format("2006-01")+`-01"`) {
		t.Fatalf("query should cover the month to date: %s", *body)
	}
}

func TestCapOverLimitBlocksTurn(t *testing.T) {
	c, _ := capAgainst(t, usage(800.1), 200)
	c.check()
	if c.allowed() {
		t.Fatalf("over the cap must switch TURN off")
	}
	tr := &turn{keyID: "k", token: "t", cap: c}
	if string(tr.iceServers()) != string(stunOnly) {
		t.Fatalf("over the cap, clients must get STUN only")
	}
}

func TestCapFailsClosed(t *testing.T) {
	c, _ := capAgainst(t, `{"errors":[{"message":"not authorized"}]}`, 200)
	c.check()
	if !c.allowed() {
		t.Fatalf("a single failed read right after start should not switch TURN off yet")
	}
	c.now = func() time.Time { return time.Now().Add(7 * time.Hour) }
	if c.allowed() {
		t.Fatalf("no successful read for 6h+ must switch TURN off")
	}
	if c.status()["error"] == nil {
		t.Fatalf("the error should be visible in /health")
	}
}

func TestNoCapNoTurn(t *testing.T) {
	tr := &turn{keyID: "k", token: "t", cap: newTurnCap("", "", 800)}
	if tr.usable() {
		t.Fatalf("a TURN key without a working cap must not be used")
	}
}
