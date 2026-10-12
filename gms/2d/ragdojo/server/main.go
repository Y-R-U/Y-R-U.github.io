// ragdojo-arena — lobby, matchmaking, WebRTC signalling, a fallback relay and agreed-result
// stats for RAGDOJO's online arena. The fights themselves run in the players' browsers
// (docs/ONLINE.md); this service only introduces players and keeps score.
//
//	ARENA_ADDR        listen address                 (default 127.0.0.1:8017)
//	ARENA_PREFIX      URL prefix behind Caddy        (default /gms/2d/ragdojo/arena)
//	ARENA_DB          SQLite path                    (default ./arena.db)
//	ARENA_ICE_URL     snakenet's loopback ICE source (default http://127.0.0.1:8014/ice; "off" = STUN only)
//	ARENA_ALLOWANCE_URL  payment service free-allowance API
//	                  (default http://127.0.0.1:8016/api/br8t/allowance; "off" = no allowance)
//	ARENA_FIREBASE_PROJECT  (default br8t-games)
//	ARENA_ORIGINS     extra allowed browser origins, comma separated host patterns
//	ARENA_DEV_AUTH=1  tests only: accept "dev:<uid>" (signed in) and "anon:<uid>" tokens
//	ARENA_OPEN_LOBBY=1  tests only: anonymous players may use the public lobby
//	ARENA_LAN=1       home-network mode (server/lan.sh): no Firebase, no allowance, no STUN/TURN,
//	                  players are a typed name + a per-device id ("lan:<device>" tokens), its own DB
//	ARENA_STATIC      also serve this directory at / (lan.sh serves the site root this way)
package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net"
	"net/http"
	"os"
	"path"
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
	"games.br8t.com", "localhost", "localhost:*", "127.0.0.1", "127.0.0.1:*",
	"192.168.*.*", "192.168.*.*:*",
}

func main() {
	addr := env("ARENA_ADDR", "127.0.0.1:8017")
	prefix := strings.TrimRight(env("ARENA_PREFIX", "/gms/2d/ragdojo/arena"), "/")
	origins := defaultOrigins
	if extra := os.Getenv("ARENA_ORIGINS"); extra != "" {
		origins = append(origins, strings.Split(extra, ",")...)
	}
	st, err := openStore(env("ARENA_DB", "arena.db"))
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	iceURL := env("ARENA_ICE_URL", "http://127.0.0.1:8014/ice")
	if iceURL == "off" {
		iceURL = ""
	}
	allowURL := env("ARENA_ALLOWANCE_URL", "http://127.0.0.1:8016/api/br8t/allowance")
	if allowURL == "off" {
		allowURL = ""
	}
	lan := os.Getenv("ARENA_LAN") == "1"
	ice := newIceSource(iceURL)
	if lan {
		ice, allowURL, iceURL = lanIce(), "", ""
	}
	ice.prime()
	tv := newTokenVerifier(env("ARENA_FIREBASE_PROJECT", "br8t-games"))
	verify := verifier(tv.verify)
	if lan {
		verify = lanVerifier
	} else if os.Getenv("ARENA_DEV_AUTH") == "1" {
		log.Print("ARENA_DEV_AUTH=1: accepting dev tokens — never set this on the box")
		verify = devVerifier(verify)
	}
	h := newHub(st, ice, newAllowance(allowURL), verify)
	h.openLobby = lan || os.Getenv("ARENA_OPEN_LOBBY") == "1"
	if lan {
		h.lan, h.linkAuth = true, verifier(tv.verify)
	}
	go h.run()

	handler := h.routes(prefix, origins)
	if dir := os.Getenv("ARENA_STATIC"); dir != "" {
		files := http.FileServer(http.Dir(dir))
		api := handler
		handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.HasPrefix(r.URL.Path, prefix+"/") || r.URL.Path == "/internal/stats" {
				api.ServeHTTP(w, r)
				return
			}
			// The site root is a git checkout: never serve .git or any other dot-path.
			if strings.Contains(r.URL.Path, "/.") {
				http.NotFound(w, r)
				return
			}
			w.Header().Set("Cache-Control", "no-cache")
			files.ServeHTTP(w, r)
		})
	}
	srv := &http.Server{Addr: addr, Handler: handler, ReadHeaderTimeout: 5 * time.Second}
	log.Printf("ragdojo-arena on %s%s (ice %q, allowance %q)", addr, prefix, iceURL, allowURL)
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

// lanVerifier: on the family LAN a player is a device, named by what they type. Counted in the
// LAN server's own database, never mixed with games.br8t.com's.
func lanVerifier(_ context.Context, tok string) (identity, error) {
	if id, ok := strings.CutPrefix(tok, "lan:"); ok && len(id) >= 4 && len(id) <= 40 {
		return identity{UID: "lan:" + id}, nil
	}
	return identity{}, errors.New("not a LAN token")
}

func (h *hub) routes(prefix string, origins []string) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET "+prefix+"/health", func(w http.ResponseWriter, r *http.Request) {
		cors(w, r, origins)
		reply(w, 200, map[string]any{"ok": true, "v": 1, "modes": []string{"duel"}})
	})
	h.boardRoutes(mux, prefix, origins)
	h.eventRoutes(mux, prefix, origins)
	mux.HandleFunc(prefix+"/ws", func(w http.ResponseWriter, r *http.Request) {
		h.serveWS(w, r, origins)
	})
	mux.HandleFunc("GET /internal/stats", h.internalStats)
	return mux
}

// GET /internal/stats: counts for the vpstats admin page on the same box. Caddy only proxies
// the prefix, and anything forwarded or non-loopback is refused anyway. No uids or names.
func loopbackOnly(r *http.Request) bool {
	if r.Header.Get("X-Forwarded-For") != "" || r.Header.Get("X-Forwarded-Host") != "" || r.Header.Get("Forwarded") != "" || r.Header.Get("Origin") != "" {
		return false
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	ip := net.ParseIP(host)
	return err == nil && ip != nil && ip.IsLoopback()
}

func (h *hub) internalStats(w http.ResponseWriter, r *http.Request) {
	if !loopbackOnly(r) {
		http.NotFound(w, r)
		return
	}
	_, turn := h.ice.get()
	reply(w, 200, map[string]any{"app": "ragdojo-arena", "now": time.Now().UnixMilli(),
		"live": h.liveStats(), "turn": turn, "db": h.st.counts()})
}

func reply(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

// Health and leaderboards are public counts; only allowed origins get CORS (local dev runs
// the page and the arena on different ports).
func cors(w http.ResponseWriter, r *http.Request, origins []string) {
	o := r.Header.Get("Origin")
	if o == "" {
		return
	}
	host := o
	if i := strings.Index(host, "://"); i >= 0 {
		host = host[i+3:]
	}
	for _, p := range origins {
		if ok, _ := path.Match(p, host); ok {
			w.Header().Set("Access-Control-Allow-Origin", o)
			w.Header().Set("Vary", "Origin")
			return
		}
	}
}
