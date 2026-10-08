package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"
)

// turnCap is the automatic spending guard on Cloudflare TURN. Cloudflare has
// no hard spending limit, so every hour this asks Cloudflare's analytics how
// many bytes the TURN relay has sent this month (egress is what is billed)
// and, once that passes the cap, stops handing out TURN credentials. Players
// then fall back to the slower relay through this server.
//
// It fails closed: if usage cannot be read for failClosedAfter, TURN is
// switched off too, because "we don't know" is not safe while testing.
// Credentials already handed out stay valid for up to turnTTL (4h).
type turnCap struct {
	accountID, token string
	capBytes         float64
	api              string
	http             *http.Client
	now              func() time.Time

	mu      sync.Mutex
	used    float64 // egress bytes this month, as last read
	readAt  time.Time
	startAt time.Time
	lastErr string
	tripped bool
}

const (
	capEvery        = time.Hour
	failClosedAfter = 6 * time.Hour
)

func newTurnCap(accountID, token string, capGB float64) *turnCap {
	return &turnCap{
		accountID: accountID, token: token, capBytes: capGB * 1e9,
		api:  "https://api.cloudflare.com/client/v4/graphql",
		http: &http.Client{Timeout: 10 * time.Second},
		now:  time.Now, startAt: time.Now(),
	}
}

func (c *turnCap) configured() bool { return c != nil && c.accountID != "" && c.token != "" }

// allowed reports whether TURN credentials may be handed out right now.
func (c *turnCap) allowed() bool {
	if !c.configured() {
		return false // no guard, no TURN: the cap is mandatory while testing
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.tripped {
		return false
	}
	last := c.readAt
	if last.IsZero() {
		last = c.startAt
	}
	return c.now().Sub(last) < failClosedAfter
}

func (c *turnCap) run() {
	for {
		c.check()
		time.Sleep(capEvery)
	}
}

func (c *turnCap) check() {
	used, err := c.fetch()
	c.mu.Lock()
	defer c.mu.Unlock()
	if err != nil {
		c.lastErr = err.Error()
		log.Printf("turn cap: could not read usage: %v", err)
		return
	}
	c.used, c.readAt, c.lastErr = used, c.now(), ""
	was := c.tripped
	c.tripped = used >= c.capBytes
	if c.tripped && !was {
		log.Printf("turn cap: %.2f GB used of %.0f GB this month — TURN switched OFF", used/1e9, c.capBytes/1e9)
	} else if !c.tripped && was {
		log.Printf("turn cap: new month (%.2f GB used) — TURN back ON", used/1e9)
	}
}

func (c *turnCap) fetch() (float64, error) {
	now := c.now().UTC()
	from := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC).Format("2006-01-02")
	to := now.Format("2006-01-02")
	q := map[string]any{
		"query": `query($acct: String!, $from: Date!, $to: Date!) {
  viewer { accounts(filter: {accountTag: $acct}) {
    callsTurnUsageAdaptiveGroups(limit: 1, filter: {date_geq: $from, date_leq: $to}) { sum { egressBytes } }
  } }
}`,
		"variables": map[string]string{"acct": c.accountID, "from": from, "to": to},
	}
	body, _ := json.Marshal(q)
	req, err := http.NewRequest("POST", c.api, bytes.NewReader(body))
	if err != nil {
		return 0, err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Content-Type", "application/json")
	res, err := c.http.Do(req)
	if err != nil {
		return 0, err
	}
	defer res.Body.Close()
	var out struct {
		Data struct {
			Viewer struct {
				Accounts []struct {
					Groups []struct {
						Sum struct {
							EgressBytes float64 `json:"egressBytes"`
						} `json:"sum"`
					} `json:"callsTurnUsageAdaptiveGroups"`
				} `json:"accounts"`
			} `json:"viewer"`
		} `json:"data"`
		Errors []struct {
			Message string `json:"message"`
		} `json:"errors"`
	}
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		return 0, fmt.Errorf("%s: %v", res.Status, err)
	}
	if len(out.Errors) > 0 {
		return 0, fmt.Errorf("graphql: %s", out.Errors[0].Message)
	}
	if res.StatusCode/100 != 2 || len(out.Data.Viewer.Accounts) == 0 {
		return 0, fmt.Errorf("unexpected reply (%s)", res.Status)
	}
	total := 0.0
	for _, g := range out.Data.Viewer.Accounts[0].Groups {
		total += g.Sum.EgressBytes
	}
	return total, nil
}

// status is for /health: how much has been used and whether TURN is on.
func (c *turnCap) status() map[string]any {
	if !c.configured() {
		return map[string]any{"configured": false, "turn": false}
	}
	c.mu.Lock()
	used, readAt, errText, capB := c.used, c.readAt, c.lastErr, c.capBytes
	c.mu.Unlock()
	st := map[string]any{"configured": true, "turn": c.allowed(),
		"usedGB": fmt.Sprintf("%.3f", used/1e9), "capGB": capB / 1e9}
	if !readAt.IsZero() {
		st["readAt"] = readAt.UTC().Format(time.RFC3339)
	}
	if errText != "" {
		st["error"] = errText
	}
	return st
}
