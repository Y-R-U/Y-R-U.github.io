package main

import (
	"net"
	"net/http"
	"strings"
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
	// Only trust X-Forwarded-For from the local reverse proxy. The app binds
	// 127.0.0.1 today so this is always true, but if the listen address is ever
	// widened this fails closed rather than letting anyone spoof the header and
	// walk straight through the login throttle.
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	ip := net.ParseIP(host)
	if ip == nil || !ip.IsLoopback() {
		return host
	}
	// Behind the proxy: the first entry is the original client.
	xff := r.Header.Get("X-Forwarded-For")
	if xff == "" {
		return host
	}
	if i := strings.IndexByte(xff, ','); i >= 0 {
		xff = xff[:i]
	}
	if v := strings.TrimSpace(xff); v != "" {
		return v
	}
	return host
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
