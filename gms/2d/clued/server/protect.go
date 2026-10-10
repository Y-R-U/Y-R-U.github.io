package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"sync"
	"time"
)

// Protection levels: 0 open · 1 hosting needs a br8t sign-in · 2 joining needs one
// too · 3 new rooms and challenges paused. Admins are exempt. Persisted in settings.
const maxLevel = 3

var prot struct {
	sync.Mutex
	level    int
	rooms    []int64 // creation times in the last hour
	refusals []int64
}

var levelNames = []string{"open", "hosting needs sign-in", "joining needs sign-in", "creation paused"}

func getSetting(k string) string {
	var v string
	db.QueryRow(`SELECT value FROM settings WHERE key = ?`, k).Scan(&v)
	return v
}

func putSetting(k, v string) {
	db.Exec(`INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, k, v)
}

func loadProtection() {
	n, _ := strconv.Atoi(getSetting("level"))
	prot.Lock()
	prot.level = max(0, min(maxLevel, n))
	prot.Unlock()
	if n > 0 {
		log.Printf("protection level %d (%s)", n, levelNames[n])
	}
}

func level() int {
	prot.Lock()
	defer prot.Unlock()
	return prot.level
}

func setLevel(n int, why string) {
	n = max(0, min(maxLevel, n))
	prot.Lock()
	old := prot.level
	prot.level = n
	prot.Unlock()
	putSetting("level", strconv.Itoa(n))
	if old != n {
		log.Printf("protection level %d → %d (%s)", old, n, why)
		recordEvent("level", fmt.Sprintf("Level %d → %d (%s): %s", old, n, levelNames[n], why))
	}
}

func isAdmin(id fbIdentity) bool { return id.UID != "" && id.EmailVerified && cfg.Admins[id.Email] }

func writeGate(w http.ResponseWriter, status int, code, msg string, lvl int) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]any{"error": msg, "code": code, "level": lvl})
}

// gateCreate guards new rooms and challenges.
func gateCreate(w http.ResponseWriter, id fbIdentity) bool {
	lvl := level()
	if isAdmin(id) {
		return true
	}
	if lvl >= 3 {
		writeGate(w, 503, "paused", "new games are paused for a little while", lvl)
		return false
	}
	if lvl >= 1 && id.UID == "" {
		writeGate(w, 403, "signin_required", "sign in with your br8t account to host", lvl)
		return false
	}
	return true
}

func gateJoin(w http.ResponseWriter, id fbIdentity) bool {
	lvl := level()
	if lvl >= 2 && id.UID == "" && !isAdmin(id) {
		writeGate(w, 403, "signin_required", "sign in with your br8t account to join", lvl)
		return false
	}
	return true
}

func pruneHour(ts []int64, now int64) []int64 {
	keep := ts[:0]
	for _, t := range ts {
		if now-t < time.Hour.Milliseconds() {
			keep = append(keep, t)
		}
	}
	return keep
}

// refuse answers a cap hit, counts it, alerts and may escalate.
func refuse(w http.ResponseWriter, capName string, status int, code string) {
	now := nowMs()
	prot.Lock()
	prot.refusals = append(pruneHour(prot.refusals, now), now)
	n := len(prot.refusals)
	prot.Unlock()
	bump("refusals", 1)
	bump("refusal_"+capName, 1)
	alert("cap", fmt.Sprintf("Cap hit: %s (%d refusals in the last hour)", capName, n))
	checkEscalation()
	msg := "Clued is busy right now, try again soon"
	switch code {
	case "public_full":
		msg = "all public game slots are busy right now"
	case "room_full":
		msg = "this room is full"
	}
	writeErr(w, status, code, msg)
}

func noteRoomCreated(public, signed bool, ip string) {
	now := nowMs()
	prot.Lock()
	prot.rooms = append(pruneHour(prot.rooms, now), now)
	prot.Unlock()
	if public {
		bump("rooms_public", 1)
	} else {
		bump("rooms_private", 1)
	}
	if signed {
		bump("hosts_signed", 1)
	} else {
		bump("hosts_anon", 1)
	}
	seenIP(ip)
	checkEscalation()
}

func noteJoin(ip string) {
	bump("joins", 1)
	seenIP(ip)
}

// checkEscalation raises 0 → 1 on a burst; it never lowers the level.
func checkEscalation() {
	now := nowMs()
	prot.Lock()
	prot.rooms = pruneHour(prot.rooms, now)
	prot.refusals = pruneHour(prot.refusals, now)
	rooms, refusals, lvl := len(prot.rooms), len(prot.refusals), prot.level
	prot.Unlock()
	if lvl > 0 {
		return
	}
	why := ""
	switch {
	case rooms > cfg.EscRooms:
		why = fmt.Sprintf("%d rooms created in the last hour (threshold %d)", rooms, cfg.EscRooms)
	case refusals >= cfg.EscRefusals:
		why = fmt.Sprintf("%d cap refusals in the last hour (threshold %d)", refusals, cfg.EscRefusals)
	default:
		return
	}
	setLevel(1, "auto: "+why)
	alert("escalation", "Clued auto-escalated to level 1 (hosting needs sign-in): "+why)
}

func hourRates() (rooms, refusals int) {
	now := nowMs()
	prot.Lock()
	defer prot.Unlock()
	prot.rooms = pruneHour(prot.rooms, now)
	prot.refusals = pruneHour(prot.refusals, now)
	return len(prot.rooms), len(prot.refusals)
}

func privateCount() int {
	now := nowMs()
	roomsMu.RLock()
	list := make([]*Room, 0, len(rooms))
	for _, r := range rooms {
		list = append(list, r)
	}
	roomsMu.RUnlock()
	n := 0
	for _, r := range list {
		r.mu.Lock()
		if !r.Public && !r.dead && r.Phase != "final" && now-r.Touched < 20*60*1000 {
			n++
		}
		r.mu.Unlock()
	}
	return n
}

func challengesToday() int {
	var n int
	db.QueryRow(`SELECT COUNT(*) FROM challenges WHERE created >= ?`, dayStart(nowFn()).UnixMilli()).Scan(&n)
	return n
}

func dayStart(t time.Time) time.Time {
	t = t.UTC()
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
}

// handleStatus tells clients the level before they try (hosting UI shows the sign-in ask up front).
func handleStatus(w http.ResponseWriter, r *http.Request) {
	lvl := level()
	writeJSON(w, 200, map[string]any{"level": lvl, "levelName": levelNames[lvl], "now": nowMs(),
		"publicFree": max(0, cfg.MaxPublic-publicCount()), "maxPlayers": cfg.MaxPlayers, "debugLogs": debugOn()})
}
