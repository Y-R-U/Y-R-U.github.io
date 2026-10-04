package main

import (
	"net/http"
	"sort"
	"time"
)

func requireAdmin(fn http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := identity(r)
		if id.UID == "" {
			writeErr(w, 401, "signin_required", "sign in with an admin account")
			return
		}
		if !isAdmin(id) {
			writeErr(w, 403, "not_admin", "this account is not a Clued admin")
			return
		}
		fn(w, r)
	}
}

type adminRoom struct {
	Code    string `json:"code"`
	Title   string `json:"title"`
	Public  bool   `json:"public"`
	Kids    bool   `json:"kids"`
	Phase   string `json:"phase"`
	Q       int    `json:"q"`
	Total   int    `json:"total"`
	Players int    `json:"players"`
	Online  int    `json:"online"`
	Host    string `json:"host"`
	Signed  bool   `json:"signedHost"`
	Created int64  `json:"created"`
	Touched int64  `json:"touched"`
}

func handleAdminOverview(w http.ResponseWriter, r *http.Request) {
	flushStats()
	now := nowMs()
	roomsMu.RLock()
	list := make([]*Room, 0, len(rooms))
	for _, rm := range rooms {
		list = append(list, rm)
	}
	roomsMu.RUnlock()
	live := []adminRoom{}
	for _, rm := range list {
		rm.mu.Lock()
		a := adminRoom{Code: rm.Code, Title: rm.Title, Public: rm.Public, Kids: rm.Kids, Phase: rm.Phase, Q: rm.Q,
			Total: len(rm.Questions), Players: len(rm.active()), Created: rm.Created, Touched: rm.Touched}
		for _, p := range rm.Players {
			if p.online(now) {
				a.Online++
			}
		}
		if h := rm.player(rm.HostID); h != nil {
			a.Host, a.Signed = h.Name, h.UID != ""
		}
		rm.mu.Unlock()
		live = append(live, a)
	}
	sort.Slice(live, func(i, j int) bool { return live[i].Touched > live[j].Touched })
	days := []map[string]any{}
	t := nowFn().UTC()
	for i := 13; i >= 0; i-- {
		d := t.AddDate(0, 0, -i).Format("2006-01-02")
		days = append(days, map[string]any{"day": d, "stats": dayStats(d)})
	}
	type alertRow struct {
		At        int64  `json:"at"`
		Kind      string `json:"kind"`
		Msg       string `json:"msg"`
		Delivered string `json:"delivered"`
	}
	alerts := []alertRow{}
	if rows, err := db.Query(`SELECT at, kind, msg, delivered FROM alerts ORDER BY id DESC LIMIT 50`); err == nil {
		for rows.Next() {
			var a alertRow
			if rows.Scan(&a.At, &a.Kind, &a.Msg, &a.Delivered) == nil {
				alerts = append(alerts, a)
			}
		}
		rows.Close()
	}
	nr, np, nc := liveCounts()
	hr, hf := hourRates()
	writeJSON(w, 200, map[string]any{
		"now": now, "level": level(), "levels": levelNames,
		"caps": map[string]int{"public": cfg.MaxPublic, "private": cfg.MaxPrivate, "playersPerRoom": cfg.MaxPlayers,
			"sse": cfg.MaxSSE, "challengesPerDay": cfg.ChalPerDay, "escalateRoomsHour": cfg.EscRooms, "escalateRefusalsHour": cfg.EscRefusals},
		"live": map[string]int{"rooms": nr, "players": np, "sse": nc, "public": publicCount(), "private": privateCount(), "challengesToday": challengesToday()},
		"hour": map[string]any{"rooms": hr, "refusals": hf, "counts": hourCounts()},
		"days": days, "rooms": live, "alerts": alerts,
		"channels": map[string]bool{"email": cfg.SMTPHost != "", "ntfy": cfg.NtfyTopic != ""},
		"uptime":   time.Since(started).Round(time.Second).String(),
	})
}

var started = time.Now()

func handleAdminLevel(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Level int `json:"level"`
	}
	if !readJSON(w, r, smallBody, &in) {
		return
	}
	if in.Level < 0 || in.Level > maxLevel {
		writeErr(w, 400, "bad_level", "level must be 0–3")
		return
	}
	setLevel(in.Level, "admin "+identity(r).Email)
	writeJSON(w, 200, map[string]any{"level": level()})
}

func handleAdminClose(w http.ResponseWriter, r *http.Request) {
	room := getRoom(normCode(r.PathValue("code")))
	if room == nil {
		writeErr(w, 404, "room_not_found", "no such room")
		return
	}
	room.mu.Lock()
	room.dead = true
	room.changed()
	room.mu.Unlock()
	roomsMu.Lock()
	delete(rooms, room.Code)
	roomsMu.Unlock()
	db.Exec(`DELETE FROM rooms WHERE code = ?`, room.Code)
	recordEvent("admin", "Closed room "+room.Code)
	resetPublicCache()
	writeJSON(w, 200, map[string]any{"ok": true})
}

func handleAdminAlertTest(w http.ResponseWriter, r *http.Request) {
	sent := alert("test", "Test alert from the Clued server. If you can read this on your phone, alerts work.")
	writeJSON(w, 200, map[string]any{"sent": sent, "channels": map[string]bool{"email": cfg.SMTPHost != "", "ntfy": cfg.NtfyTopic != ""}})
}
