package main

// Online access (D36, docs/ACCESS.md §3). Two switches, both env, both read once at start:
//
//	KRAYZEE_SIGNIN=required        create / join / quick need a verified, non-anonymous br8t account ("" = anyone)
//	KRAYZEE_ALLOWANCE=off|auto|on  spend one of the player's free daily online games (the payments service's
//	                               POST /api/br8t/allowance, game "krayzee") for each ROOM they enter. Re-entering a
//	                               room the account already paid for (a drop, a second tab, rematches) is free.
//	                               auto (default) = only while the payments service's offer says LIVE (testMode false),
//	                               re-read every 5 minutes; off = never; on = always.
//	KRAYZEE_ALLOWANCE_URL          payments base (default http://127.0.0.1:8016/api/br8t/)
//	KRAYZEE_ALLOWANCE_GAME         allowance key (default krayzee)
//
// Fail-open: anything but a clear 429 from the payments service (unreachable, 5xx, 404 = krayzee not configured
// there, 401 = a token that expired between our check and theirs) lets the player in. Pass holders are never
// counted (the payments service answers 200 unlimited).

import (
	"bytes"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync/atomic"
	"time"
)

type spendOutcome int

const (
	spendOK spendOutcome = iota
	spendDenied
	spendOpen
)

type accessCfg struct {
	signin bool
	mode   string // off | auto | on
	url    string // ends in /
	game   string
	live   atomic.Bool
	client *http.Client
}

func loadAccess() *accessCfg {
	a := &accessCfg{
		signin: strings.EqualFold(env("KRAYZEE_SIGNIN", ""), "required"),
		mode:   oneOf(strings.ToLower(env("KRAYZEE_ALLOWANCE", "auto")), []string{"off", "auto", "on"}, "off"),
		url:    strings.TrimSuffix(env("KRAYZEE_ALLOWANCE_URL", "http://127.0.0.1:8016/api/br8t/"), "/") + "/",
		game:   env("KRAYZEE_ALLOWANCE_GAME", "krayzee"),
		client: &http.Client{Timeout: 4 * time.Second},
	}
	return a
}

// counting: is the daily allowance being spent right now?
func (a *accessCfg) counting() bool {
	return a != nil && (a.mode == "on" || (a.mode == "auto" && a.live.Load()))
}

func (a *accessCfg) gating() bool { return a != nil && (a.signin || a.counting()) }

func (a *accessCfg) view() map[string]any {
	if a == nil {
		return map[string]any{"signin": false, "allowance": "off", "counting": false}
	}
	return map[string]any{"signin": a.signin, "allowance": a.mode, "counting": a.counting()}
}

// watchLive keeps `live` in step with the payments service (auto mode only). One request every 5 minutes.
func (a *accessCfg) watchLive(every time.Duration) {
	if a == nil || a.mode != "auto" {
		return
	}
	for {
		was, now := a.live.Load(), a.checkLive()
		a.live.Store(now)
		if was != now {
			log.Printf("access: payments live=%v (allowance counting=%v)", now, a.counting())
		}
		time.Sleep(every)
	}
}

func (a *accessCfg) checkLive() bool {
	res, err := a.client.Get(a.url + "offer")
	if err != nil {
		return false
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return false
	}
	var out struct {
		TestMode *bool `json:"testMode"`
		Items    []struct {
			Entitlement string `json:"entitlement"`
		} `json:"items"`
	}
	if json.NewDecoder(io.LimitReader(res.Body, 64<<10)).Decode(&out) != nil || out.TestMode == nil || *out.TestMode {
		return false
	}
	for _, it := range out.Items {
		if it.Entitlement == "br8t_pass" {
			return true
		}
	}
	return false
}

// spend one use for the account behind tok. id is a fresh UUID per room entry (a retry with it never spends twice).
func (a *accessCfg) spend(tok, id string) (spendOutcome, json.RawMessage) {
	body, _ := json.Marshal(map[string]string{"game": a.game, "id": id})
	req, err := http.NewRequest("POST", a.url+"allowance", bytes.NewReader(body))
	if err != nil {
		return spendOpen, nil
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+tok)
	res, err := a.client.Do(req)
	if err != nil {
		log.Printf("allowance: payments unreachable, player let in: %v", err)
		return spendOpen, nil
	}
	defer res.Body.Close()
	var out struct {
		Allowance json.RawMessage `json:"allowance"`
	}
	json.NewDecoder(io.LimitReader(res.Body, 64<<10)).Decode(&out)
	switch res.StatusCode {
	case 200:
		return spendOK, out.Allowance
	case 429:
		return spendDenied, out.Allowance
	}
	log.Printf("allowance: payments answered %d, player let in", res.StatusCode)
	return spendOpen, nil
}

func newUUID() string {
	b := make([]byte, 16)
	rand.Read(b)
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

// ---------------------------------------------------------------- the gate (hub goroutine only)

const noGamesMsg = "That's today's free online games flown. A br8t Pass lifts the limit."

// entry runs create / join / quick through the access gate: sign-in first, then one allowance spend per room.
func (h *hub) entry(c *client, m inMsg) {
	if c.spending {
		return // one spend in flight; its answer replays the request
	}
	if h.acc.gating() && c.authBusy {
		mm := m
		c.pending = &mm // replayed when the token check lands (checkToken)
		return
	}
	if h.acc != nil && h.acc.signin && (c.uid == "" || !c.ranked) {
		h.send(c, map[string]any{"t": "err", "code": "signin", "msg": "Sign in with your br8t account to fly online."})
		return
	}
	if h.needTicket(c, m) {
		h.buyTicket(c, m)
		return
	}
	switch m.T {
	case "create":
		h.create(c, m)
	case "join":
		h.join(c, m)
	case "quick":
		h.quickJoin(c)
	}
}

func (h *hub) needTicket(c *client, m inMsg) bool {
	if !h.acc.counting() || c.uid == "" || !c.ranked || c.ticket || h.spendFn == nil {
		return false
	}
	if m.T == "join" {
		r := h.lookup(m)
		// No room, the same room, or a refusal: join() gives the usual answer and nothing is spent.
		if r == nil || r == c.room || h.refuse(r, c) != "" || r.paid[c.uid] {
			return false
		}
	}
	return true
}

func (h *hub) buyTicket(c *client, m inMsg) {
	c.spending = true
	tok, id := c.idTok, newUUID()
	spend := h.spendFn
	go func() {
		res, a := spend(tok, id)
		h.post(func() {
			c.spending = false
			if c.gone {
				return
			}
			if res == spendDenied {
				h.send(c, map[string]any{"t": "err", "code": "nogames", "msg": noGamesMsg, "allowance": a})
				return
			}
			c.ticket = true
			if len(a) > 0 {
				h.send(c, map[string]any{"t": "allowance", "allowance": a})
			}
			h.entry(c, m)
		})
	}()
}

func (h *hub) lookup(m inMsg) *room {
	if m.Code != "" {
		return h.codes[strings.ToUpper(strings.TrimSpace(m.Code))]
	}
	if pr := h.rooms[m.ID]; pr != nil && !pr.private {
		return pr
	}
	return nil
}
