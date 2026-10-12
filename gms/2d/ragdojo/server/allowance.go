package main

import (
	"bytes"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

// claimArenaBattle is the ONE place the arena asks whether a player may start a battle.
// Tiers (docs/ONLINE.md, 2026-10-13): free 3 a day, supporter (A$1.99) 10 a day, Pass unlimited.
// The tiers are decided by the payment service, not here; the supporter tier still has to be
// added there (separate agent). The arena only reads ok / 429.
//
// The free daily allowance lives in the payment service (POST /api/br8t/allowance, already
// built there: BR8T_FREE_PER_DAY=ragdojo=3, Pass unlimited, idempotent per id). The arena
// forwards the player's own fresh Firebase ID token over loopback, so it needs no credential.
// A best of 3 spends one use per signed-in player. Anonymous players (friend links only)
// cannot be counted by account and are not. If the payment service does not answer, play is
// allowed and logged: a family game should not stop because billing is down.
type allowance struct {
	url  string // "" = allowance off
	game string
	http *http.Client
}

func newAllowance(url string) *allowance {
	return &allowance{url: url, game: "ragdojo", http: &http.Client{Timeout: 4 * time.Second}}
}

type spendResult struct {
	OK        bool
	Remaining int // -1 unlimited / unknown
	Why       string
}

func (a *allowance) claimArenaBattle(token, id string) spendResult {
	if a == nil || a.url == "" {
		return spendResult{OK: true, Remaining: -1}
	}
	body, _ := json.Marshal(map[string]string{"game": a.game, "id": id})
	req, err := http.NewRequest("POST", a.url, bytes.NewReader(body))
	if err != nil {
		return spendResult{OK: true, Remaining: -1}
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	res, err := a.http.Do(req)
	if err != nil {
		log.Printf("allowance: payment service unreachable, allowing play")
		return spendResult{OK: true, Remaining: -1}
	}
	defer res.Body.Close()
	var out struct {
		Allowance struct {
			Remaining int `json:"remaining"`
		} `json:"allowance"`
	}
	json.NewDecoder(io.LimitReader(res.Body, 16<<10)).Decode(&out)
	switch res.StatusCode {
	case 200:
		return spendResult{OK: true, Remaining: out.Allowance.Remaining}
	case 429:
		return spendResult{OK: false, Remaining: 0, Why: "allowance"}
	}
	log.Printf("allowance: payment service answered %d, allowing play", res.StatusCode)
	return spendResult{OK: true, Remaining: -1}
}

func newUUID() string {
	b := make([]byte, 16)
	rand.Read(b)
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
