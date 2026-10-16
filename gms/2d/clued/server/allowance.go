package main

// Online-game allowance (br8t payments, ragdojo-payments/allowance.go): every game a server room starts, and
// every leaderboard challenge created, spends one use of the HOST's daily allowance. Guests play free, a Pass is
// unlimited. Off unless CLUED_ALLOWANCE=on or CLUED_ALLOWANCE_URL is set; CLUED_ALLOWANCE=off always wins.
// Anything but a clear yes/no from the payments service lets the game start (fail open).

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
	"sync"
	"time"
)

var allowanceCfg struct {
	On   bool
	URL  string // base, ends in /
	Game string
}

var allowanceHTTP = &http.Client{Timeout: 4 * time.Second}

func loadAllowanceConfig() {
	sw := strings.ToLower(env("CLUED_ALLOWANCE", ""))
	u := env("CLUED_ALLOWANCE_URL", "")
	allowanceCfg.On = sw != "off" && (sw == "on" || u != "")
	allowanceCfg.URL = strings.TrimSuffix(env("CLUED_ALLOWANCE_URL", "http://127.0.0.1:8016/api/br8t/"), "/") + "/"
	allowanceCfg.Game = env("CLUED_ALLOWANCE_GAME", "clued")
}

type spendResult int

const (
	spendOK     spendResult = iota
	spendDenied             // 429: no games left today
	spendOpen               // unreachable or unexpected: let the game start
)

// spendAllowance spends one use for the account behind tok. id must be the same for retries of one game.
func spendAllowance(tok, id string) (spendResult, json.RawMessage) {
	body, _ := json.Marshal(map[string]string{"game": allowanceCfg.Game, "id": id})
	req, err := http.NewRequest("POST", allowanceCfg.URL+"allowance", bytes.NewReader(body))
	if err != nil {
		return spendOpen, nil
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+tok)
	res, err := allowanceHTTP.Do(req)
	if err != nil {
		log.Printf("allowance: payments unreachable, game allowed: %v", err)
		bump("allowance_open", 1)
		return spendOpen, nil
	}
	defer res.Body.Close()
	var out struct {
		Allowance json.RawMessage `json:"allowance"`
	}
	json.NewDecoder(io.LimitReader(res.Body, 64<<10)).Decode(&out)
	switch res.StatusCode {
	case 200:
		bump("allowance_spent", 1)
		return spendOK, out.Allowance
	case 429:
		bump("allowance_denied", 1)
		return spendDenied, out.Allowance
	}
	log.Printf("allowance: payments answered %d, game allowed", res.StatusCode)
	bump("allowance_open", 1)
	return spendOpen, nil
}

// gameID is a stable UUID per room game, so a retried start never spends twice and a rematch is a new game.
func gameID(parts ...any) string {
	sum := sha256.Sum256([]byte(fmt.Sprint(parts...)))
	b := sum[:16]
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	x := hex.EncodeToString(b)
	return x[:8] + "-" + x[8:12] + "-" + x[12:16] + "-" + x[16:20] + "-" + x[20:]
}

func (r *Room) gameID() string { return gameID("room", r.Code, r.Created, r.Game) }

func writeNoGames(w http.ResponseWriter, a json.RawMessage) {
	writeJSON(w, 429, map[string]any{"code": "no_games_left", "error": "no online games left today", "allowance": a})
}

// Latest verified bearer per room player, for a public room's auto-start (nobody's request is in flight then).
// Memory only: Firebase tokens live an hour, so a restart just turns the next auto-start into a manual one.
var hostToks = struct {
	sync.Mutex
	m map[string]heldTok
}{m: map[string]heldTok{}}

type heldTok struct {
	tok string
	at  time.Time
}

func holdToken(code, pid string, r *http.Request) {
	if !allowanceCfg.On {
		return
	}
	tok, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !ok || tok == "" {
		return
	}
	if _, err := verifyFirebaseToken(tok); err != nil {
		return
	}
	now := time.Now()
	hostToks.Lock()
	defer hostToks.Unlock()
	for k, v := range hostToks.m {
		if now.Sub(v.at) > time.Hour {
			delete(hostToks.m, k)
		}
	}
	hostToks.m[code+"/"+pid] = heldTok{tok, now}
}

func heldToken(code, pid string) string {
	hostToks.Lock()
	defer hostToks.Unlock()
	return hostToks.m[code+"/"+pid].tok
}

// gateStart runs before a host's start (or lobby "next") and before the room lock is taken.
// It answers the refusal itself and returns false when the game must not start.
func gateStart(w http.ResponseWriter, r *http.Request, room *Room, key string) bool {
	if !allowanceCfg.On {
		return true
	}
	room.mu.Lock()
	p := room.byKey(key)
	starting := p != nil && !p.Kicked && !p.Gone && p.ID == room.HostID && room.Phase == "lobby" && !room.Ended
	id := room.gameID()
	if p != nil && starting {
		holdToken(room.Code, p.ID, r)
	}
	room.mu.Unlock()
	if !starting {
		return true // the action handler gives the usual answer
	}
	host := identity(r)
	if host.UID == "" {
		writeErr(w, 403, "signin_required", "sign in with your br8t account to start online games")
		return false
	}
	if isAdmin(host) {
		return true
	}
	tok, _ := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	res, a := spendAllowance(tok, id)
	if res == spendDenied {
		writeNoGames(w, a)
		return false
	}
	return true
}

// autoStart starts a public room whose countdown ran out, after spending the host's allowance off the room lock.
// No usable token, or no games left: the countdown stops and the host starts it by hand. Called with r.mu held.
func (r *Room) autoStart() {
	if !allowanceCfg.On {
		r.start()
		return
	}
	if r.spending {
		return
	}
	tok := heldToken(r.Code, r.HostID)
	id, err := verifyFirebaseToken(tok)
	if tok == "" || err != nil {
		r.StartAt = 0
		r.changed()
		return
	}
	if isAdmin(id) {
		r.start()
		return
	}
	r.spending = true
	game, gid := r.Game, r.gameID()
	go func() {
		res, a := spendAllowance(tok, gid)
		r.mu.Lock()
		defer r.mu.Unlock()
		r.spending = false
		if r.Phase != "lobby" || r.Game != game || r.StartAt == 0 || r.Ended || r.dead {
			return
		}
		if res == spendDenied {
			r.StartAt, r.limit = 0, a
			r.changed()
			return
		}
		r.start()
	}()
}
