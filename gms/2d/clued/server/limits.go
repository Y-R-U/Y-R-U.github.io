package main

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

type bucket struct {
	max    int
	window time.Duration
}

// A classroom shares one IP, so per-IP ceilings are generous; the tight ones
// guard the expensive writes.
var limits = map[string]bucket{
	"ip":        {1500, time.Minute},
	"room":      {12, 10 * time.Minute},
	"join":      {90, time.Minute},
	"challenge": {30, 10 * time.Minute},
	"score":     {120, 10 * time.Minute},
	"answer":    {600, time.Minute},
}

var (
	rlMu   sync.Mutex
	rlHits = map[string][]time.Time{}
)

// Caddy replaces any client-sent X-Forwarded-For with the real peer, so the
// header is trusted only from loopback, and its rightmost hop is used.
func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	if ip := net.ParseIP(host); ip == nil || !ip.IsLoopback() {
		return host
	}
	xff := r.Header.Get("X-Forwarded-For")
	if i := strings.LastIndexByte(xff, ','); i >= 0 {
		xff = xff[i+1:]
	}
	if v := strings.TrimSpace(xff); v != "" {
		return v
	}
	return host
}

func hit(kind, key string) bool {
	if cfg.NoRate {
		return true
	}
	b := limits[kind]
	now := nowFn()
	k := kind + "|" + key
	rlMu.Lock()
	defer rlMu.Unlock()
	keep := rlHits[k][:0]
	for _, t := range rlHits[k] {
		if now.Sub(t) < b.window {
			keep = append(keep, t)
		}
	}
	if len(keep) >= b.max {
		rlHits[k] = keep
		return false
	}
	rlHits[k] = append(keep, now)
	if len(rlHits) > 20000 {
		for kk, v := range rlHits {
			if len(v) == 0 || now.Sub(v[len(v)-1]) > 10*time.Minute {
				delete(rlHits, kk)
			}
		}
	}
	return true
}

func allowIP(r *http.Request) bool { return hit("ip", clientIP(r)) }

func allow(r *http.Request, kind string) bool { return hit(kind, clientIP(r)) }

func rateLimited(w http.ResponseWriter) {
	w.Header().Set("Retry-After", "60")
	writeErr(w, http.StatusTooManyRequests, "rate_limited", "too many requests, wait a minute")
}

func resetLimits() {
	rlMu.Lock()
	rlHits = map[string][]time.Time{}
	rlMu.Unlock()
}
