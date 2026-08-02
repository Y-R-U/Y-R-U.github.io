package main

import (
	"net"
	"net/http"
	"sync"
	"time"
)

const buildVersion = "1.0.0"

// Login throttling, per client IP. Caddy is the only thing in front of the app
// and it sets X-Forwarded-For, so that header is trustworthy here — the app
// never listens on a public interface.
const (
	loginWindow   = time.Minute
	loginMaxTries = 8
)

var (
	rlMu   sync.Mutex
	rlHits = map[string][]time.Time{}
)

func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if i := len(xff); i > 0 {
			for j := 0; j < len(xff); j++ {
				if xff[j] == ',' {
					return trimSpace(xff[:j])
				}
			}
			return trimSpace(xff)
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func trimSpace(s string) string {
	for len(s) > 0 && (s[0] == ' ' || s[0] == '\t') {
		s = s[1:]
	}
	for len(s) > 0 && (s[len(s)-1] == ' ' || s[len(s)-1] == '\t') {
		s = s[:len(s)-1]
	}
	return s
}

// loginAllowed records an attempt and reports whether it may proceed.
func loginAllowed(r *http.Request) bool {
	ip := clientIP(r)
	now := time.Now()
	rlMu.Lock()
	defer rlMu.Unlock()

	keep := rlHits[ip][:0]
	for _, t := range rlHits[ip] {
		if now.Sub(t) < loginWindow {
			keep = append(keep, t)
		}
	}
	if len(keep) >= loginMaxTries {
		rlHits[ip] = keep
		return false
	}
	rlHits[ip] = append(keep, now)

	// Opportunistic sweep so the map can't grow forever on a long-lived process.
	if len(rlHits) > 2000 {
		for k, v := range rlHits {
			if len(v) == 0 || now.Sub(v[len(v)-1]) > loginWindow {
				delete(rlHits, k)
			}
		}
	}
	return true
}

// loginSucceeded clears the failure budget so a legitimate user who mistyped a
// few times isn't left throttled after getting it right.
func loginSucceeded(r *http.Request) {
	ip := clientIP(r)
	rlMu.Lock()
	delete(rlHits, ip)
	rlMu.Unlock()
}
