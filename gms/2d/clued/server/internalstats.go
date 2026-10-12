package main

import (
	"net"
	"net/http"
)

// GET /internal/stats: counts for the vpstats admin page on the same box. Caddy only
// proxies /gms/2d/clued/api/*, and anything forwarded or non-loopback is refused anyway.
// Counts only: no room codes, titles, names or alert text.

func loopbackOnly(r *http.Request) bool {
	if r.Header.Get("X-Forwarded-For") != "" || r.Header.Get("X-Forwarded-Host") != "" || r.Header.Get("Forwarded") != "" || r.Header.Get("Origin") != "" {
		return false
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	ip := net.ParseIP(host)
	return err == nil && ip != nil && ip.IsLoopback()
}

func handleInternalStats(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if r.Method != http.MethodGet || !loopbackOnly(r) {
		http.NotFound(w, r)
		return
	}
	flushStats()
	nr, np, nc := liveCounts()
	t := nowFn().UTC()
	days := []map[string]any{}
	for i := 13; i >= 0; i-- {
		d := t.AddDate(0, 0, -i).Format("2006-01-02")
		days = append(days, map[string]any{"day": d, "stats": dayStats(d)})
	}
	var alerts24h, lastAlert int64
	db.QueryRow(`SELECT COUNT(*), COALESCE(MAX(at), 0) FROM alerts WHERE at >= ?`, nowMs()-24*3600*1000).Scan(&alerts24h, &lastAlert)
	var lastKind string
	db.QueryRow(`SELECT kind FROM alerts ORDER BY id DESC LIMIT 1`).Scan(&lastKind)
	lvl := level()
	hr, hf := hourRates()
	writeJSON(w, 200, map[string]any{
		"app": "clued", "version": buildVersion, "now": nowMs(),
		"online": np,
		"live": map[string]int{"rooms": nr, "players": np, "sse": nc, "public": publicCount(), "private": privateCount(),
			"challengesToday": challengesToday()},
		"level": lvl, "levelName": levelNames[lvl],
		"caps": map[string]int{"public": cfg.MaxPublic, "private": cfg.MaxPrivate, "playersPerRoom": cfg.MaxPlayers},
		"hour": map[string]int{"rooms": hr, "refusals": hf},
		"alerts": map[string]any{"last24h": alerts24h, "lastKind": lastKind,
			"email": cfg.SMTPHost != "", "ntfy": cfg.NtfyTopic != ""},
		"days": days,
	})
}
