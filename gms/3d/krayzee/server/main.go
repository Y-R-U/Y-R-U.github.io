// krayzeenet — room server for The Kingdom of Krayzee (docs/ONLINE.md).
//
// Forked from snakenet (gms/pwa/snake/server) with RAGDOJO's ID-token check
// and ICE source. The server never flies a plane: it keeps the room list, the
// join line (members[0] hosts and runs ATC, AI traffic and the Court in its
// browser), room options, voice claims and callsign numbers, passes WebRTC
// signalling, and relays game traffic for pairs that cannot connect directly.
//
//	KRAYZEE_ADDR       listen address            (default 127.0.0.1:8018)
//	KRAYZEE_PREFIX     URL prefix behind Caddy   (default /gms/3d/krayzee/net)
//	KRAYZEE_GRACE_MS   dropped-socket grace      (default 10000)
//	KRAYZEE_ICE_URL    snakenet's loopback ICE   (default http://127.0.0.1:8014/ice; "off" = STUN only)
//	KRAYZEE_FIREBASE_PROJECT                     (default br8t-games)
//	KRAYZEE_ORIGINS    extra allowed origins, comma separated host patterns
//	KRAYZEE_PER_IP     sockets per address       (default 64, IPv6 per /64)
//	KRAYZEE_DEV_AUTH=1 tests only: accept "dev:<uid>" and "anon:<uid>" tokens
package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

var defaultOrigins = []string{
	"games.br8t.com", "yru.br8t.com", "y-r-u.github.io",
	"localhost", "localhost:*", "127.0.0.1", "127.0.0.1:*",
}

func main() {
	addr := env("KRAYZEE_ADDR", "127.0.0.1:8018")
	prefix := strings.TrimRight(env("KRAYZEE_PREFIX", "/gms/3d/krayzee/net"), "/")
	origins := defaultOrigins
	if extra := os.Getenv("KRAYZEE_ORIGINS"); extra != "" {
		origins = append(origins, strings.Split(extra, ",")...)
	}
	iceURL := env("KRAYZEE_ICE_URL", "http://127.0.0.1:8014/ice")
	if iceURL == "off" {
		iceURL = ""
	}
	ice := newIceSource(iceURL)
	ice.prime()

	tv := newTokenVerifier(env("KRAYZEE_FIREBASE_PROJECT", "br8t-games"))
	verify := verifier(tv.verify)
	if os.Getenv("KRAYZEE_DEV_AUTH") == "1" {
		log.Print("KRAYZEE_DEV_AUTH=1: accepting dev tokens — never set this on the box")
		verify = devVerifier(verify)
	}
	h := newHub(ice, verify)
	if ms, err := strconv.Atoi(os.Getenv("KRAYZEE_GRACE_MS")); err == nil && ms >= 0 {
		h.grace = time.Duration(ms) * time.Millisecond
	}
	if n, err := strconv.Atoi(os.Getenv("KRAYZEE_PER_IP")); err == nil && n > 0 {
		h.perIP = n
	}
	go h.run()

	srv := &http.Server{Addr: addr, Handler: h.routes(prefix, origins), ReadHeaderTimeout: 5 * time.Second}
	log.Printf("krayzeenet on %s%s", addr, prefix)
	log.Fatal(srv.ListenAndServe())
}

func devVerifier(real verifier) verifier {
	return func(ctx context.Context, tok string) (identity, error) {
		if uid, ok := strings.CutPrefix(tok, "dev:"); ok && uid != "" && len(uid) <= 64 {
			return identity{UID: uid}, nil
		}
		if uid, ok := strings.CutPrefix(tok, "anon:"); ok && uid != "" && len(uid) <= 64 {
			return identity{UID: uid, Anonymous: true}, nil
		}
		if strings.Count(tok, ".") != 2 {
			return identity{}, errors.New("bad dev token")
		}
		return real(ctx, tok)
	}
}

func (h *hub) routes(prefix string, origins []string) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc(prefix+"/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		json.NewEncoder(w).Encode(map[string]any{"ok": true})
	})
	mux.HandleFunc(prefix+"/stats", func(w http.ResponseWriter, r *http.Request) {
		if o := r.Header.Get("Origin"); o != "" {
			w.Header().Set("Access-Control-Allow-Origin", o)
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		json.NewEncoder(w).Encode(h.snapshotStats())
	})
	mux.HandleFunc(prefix+"/ws", func(w http.ResponseWriter, r *http.Request) { h.serveWS(w, r, origins) })
	return mux
}
