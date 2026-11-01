package main

// Online allowance (DECISIONS D12): anonymous 2 games / UTC day (counted here, in
// anon_usage), signed in 5 / day via br8t-payments (game "chess", BR8T_FREE_PER_DAY
// chess=5 on the payments side), BR8T Pass unlimited. Bots and puzzles never touch this.
//
// When a game counts: when BOTH players have made their first move (ply 2). Aborted games
// (no move, or abort/first-move timeout before ply 2) cost nothing. Players are gated
// earlier, when they seek / create / join / accept a rematch: they need a game left
// after counting their other started-but-not-yet-counted games (pending).
//
// Modes (GAMBIT_ALLOWANCE): "on" = signed-in users go through payments (deploy);
// "fake" = signed-in users counted locally at GAMBIT_FAKE_SIGNED_PER_DAY, dev uids
// starting "pass" have a Pass (local UI testing); "off" = signed-in unlimited.
// Payments unreachable or answering 5xx (or another unexpected status) = the game goes
// ahead (fail open, as Clued does). 401/403 is NOT an outage: payments refused the bearer
// (expired / revoked token), so the player is asked for a fresh token (stale_token) and the
// spend is kept as owed until one arrives - never counted as free.

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)

var allowanceHTTP = &http.Client{Timeout: 4 * time.Second}

// Allow is the allowance as the client sees it.
type Allow struct {
	Tier      string `json:"tier"`      // anon | free | supporter | pass | admin | off | unknown
	PerDay    int    `json:"perDay"`    // -1 = unlimited
	Used      int    `json:"used"`      // counted today
	Remaining int    `json:"remaining"` // -1 = unlimited (pending games already subtracted)
	Pending   int    `json:"pending"`   // started games not yet counted
	Unlimited bool   `json:"unlimited"`
	ResetsAt  int64  `json:"resetsAt"` // unix seconds, next UTC midnight
	SignedPer int    `json:"signedPerDay"`
	Fetched   int64  `json:"-"`
}

func nextMidnight(t time.Time) int64 {
	t = t.UTC()
	return time.Date(t.Year(), t.Month(), t.Day()+1, 0, 0, 0, 0, time.UTC).Unix()
}

// payUUID is a stable UUID per (game, uid) so a retried spend never counts twice.
func payUUID(parts ...any) string {
	sum := sha256.Sum256([]byte(fmt.Sprint(parts...)))
	b := sum[:16]
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	x := hex.EncodeToString(b)
	return x[:8] + "-" + x[8:12] + "-" + x[12:16] + "-" + x[16:20] + "-" + x[20:]
}

type payAllowance struct {
	Tier      string `json:"tier"`
	PerDay    int    `json:"perDay"`
	UsedToday int    `json:"usedToday"`
	Remaining int    `json:"remaining"`
	Unlimited bool   `json:"unlimited"`
	ResetsAt  int64  `json:"resetsAt"`
}

func (p payAllowance) toAllow() Allow {
	return Allow{Tier: p.Tier, PerDay: p.PerDay, Used: p.UsedToday, Remaining: p.Remaining, Unlimited: p.Unlimited,
		ResetsAt: p.ResetsAt, SignedPer: cfg.SignedPerDay, Fetched: nowMs()}
}

type fetchResult int

const (
	fetchOK      fetchResult = iota
	fetchUnknown             // unreachable / 5xx / unexpected: fail open
	fetchStale               // 401/403: payments refused the bearer
)

// fetchAllowance GETs the payments allowance.
func fetchAllowance(tok string) (Allow, fetchResult) {
	req, err := http.NewRequest("GET", cfg.AllowanceURL+"allowance?game="+cfg.AllowanceGame, nil)
	if err != nil {
		return Allow{}, fetchUnknown
	}
	req.Header.Set("Authorization", "Bearer "+tok)
	res, err := allowanceHTTP.Do(req)
	if err != nil {
		log.Printf("allowance: payments unreachable: %v", err)
		return Allow{}, fetchUnknown
	}
	defer res.Body.Close()
	if res.StatusCode == 401 || res.StatusCode == 403 {
		return Allow{}, fetchStale
	}
	if res.StatusCode != 200 {
		log.Printf("allowance: payments GET answered %d (is %s in BR8T_FREE_PER_DAY?)", res.StatusCode, cfg.AllowanceGame)
		return Allow{}, fetchUnknown
	}
	var p payAllowance
	if json.NewDecoder(io.LimitReader(res.Body, 64<<10)).Decode(&p) != nil {
		return Allow{}, fetchUnknown
	}
	return p.toAllow(), fetchOK
}

type spendResult int

const (
	spendOK spendResult = iota
	spendDenied
	spendOpen
	spendStale // 401/403: retry with a fresh token (owed), never free
)

func spendAllowance(tok, id string) (spendResult, *Allow) {
	body, _ := json.Marshal(map[string]string{"game": cfg.AllowanceGame, "id": id})
	req, err := http.NewRequest("POST", cfg.AllowanceURL+"allowance", bytes.NewReader(body))
	if err != nil {
		return spendOpen, nil
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+tok)
	res, err := allowanceHTTP.Do(req)
	if err != nil {
		log.Printf("allowance: payments unreachable, game counted as free: %v", err)
		return spendOpen, nil
	}
	defer res.Body.Close()
	if res.StatusCode == 401 || res.StatusCode == 403 {
		return spendStale, nil
	}
	var out struct {
		Allowance *payAllowance `json:"allowance"`
	}
	json.NewDecoder(io.LimitReader(res.Body, 64<<10)).Decode(&out)
	var a *Allow
	if out.Allowance != nil {
		x := out.Allowance.toAllow()
		a = &x
	}
	switch res.StatusCode {
	case 200:
		return spendOK, a
	case 429:
		return spendDenied, a
	}
	log.Printf("allowance: payments POST answered %d, game not counted", res.StatusCode)
	return spendOpen, nil
}

// localUsed counts games recorded here today for uid (anon, or signed in fake mode).
func localUsed(uid string) int {
	var n int
	db.QueryRow(`SELECT COUNT(*) FROM anon_usage WHERE uid = ? AND day = ?`, uid, utcDay(nowFn())).Scan(&n)
	return n
}

func ipUsed(ip string) int {
	var n int
	db.QueryRow(`SELECT COUNT(*) FROM anon_usage WHERE ip = ? AND day = ? AND uid NOT LIKE 'S:%'`, ipHash(ip), utcDay(nowFn())).Scan(&n)
	return n
}

func recordLocal(key, gameID, ip string) {
	db.Exec(`INSERT OR IGNORE INTO anon_usage(uid, day, game_id, ip, at) VALUES(?,?,?,?,?)`,
		key, utcDay(nowFn()), gameID, ipHash(ip), nowMs())
}

func isFakePass(uid string) bool { return strings.HasPrefix(uid, "dev-pass") }
