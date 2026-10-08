// snakenet — rooms, WebRTC signalling and a fallback relay for Snake-eee.
//
// The server never runs the game. It keeps the room list, puts players in a
// room in join order (the first in line is the host, whose browser runs the
// arena), passes WebRTC offers/answers between them, and relays game traffic
// for any pair whose direct connection could not be made. It also referees
// host changes, so two browsers can never both believe they are the host.
//
//	SNAKENET_ADDR      listen address            (default 127.0.0.1:8013)
//	SNAKENET_PREFIX    URL prefix behind Caddy   (default /gms/pwa/snake/net)
//	SNAKENET_ORIGINS   extra allowed WS origins, comma separated host patterns
//	CF_TURN_KEY_ID     optional Cloudflare TURN key id
//	CF_TURN_KEY_TOKEN  optional Cloudflare TURN key API token (secret: box only)
//	CF_ACCOUNT_ID      Cloudflare account, for the TURN spending cap
//	CF_ANALYTICS_TOKEN read-only Account Analytics token (secret: box only)
//	SNAKENET_TURN_CAP_GB  monthly TURN egress cap in GB (default 800; free tier is 1,000)
//	SNAKENET_INTERNAL_ADDR  loopback-only listener for other apps on this box
//	                        (default 127.0.0.1:8014; see ../SHARED_TURN.md)
//
// TURN is only ever handed out while the cap can be read and is not reached.
package main

import (
	"encoding/json"
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
	"192.168.*.*", "192.168.*.*:*", "10.*.*.*:*",
}

func main() {
	addr := env("SNAKENET_ADDR", "127.0.0.1:8013")
	prefix := strings.TrimRight(env("SNAKENET_PREFIX", "/gms/pwa/snake/net"), "/")
	origins := defaultOrigins
	if extra := os.Getenv("SNAKENET_ORIGINS"); extra != "" {
		origins = append(origins, strings.Split(extra, ",")...)
	}

	capGB, err := strconv.ParseFloat(env("SNAKENET_TURN_CAP_GB", "800"), 64)
	if err != nil || capGB <= 0 {
		log.Fatalf("bad SNAKENET_TURN_CAP_GB")
	}
	t := newTurn(os.Getenv("CF_TURN_KEY_ID"), os.Getenv("CF_TURN_KEY_TOKEN"))
	t.cap = newTurnCap(os.Getenv("CF_ACCOUNT_ID"), os.Getenv("CF_ANALYTICS_TOKEN"), capGB)
	if t.cap.configured() {
		go t.cap.run()
	}
	h := newHub(t)
	go h.run()

	srv := &http.Server{
		Addr:              addr,
		Handler:           h.routes(prefix, origins),
		ReadHeaderTimeout: 5 * time.Second,
	}
	// Other apps on this box (Serpent.io) get TURN credentials here, so the
	// Cloudflare key lives in one place and the spending cap covers everyone.
	// Never proxied by Caddy: loopback only.
	internal := env("SNAKENET_INTERNAL_ADDR", "127.0.0.1:8014")
	go func() {
		isrv := &http.Server{Addr: internal, Handler: internalRoutes(t), ReadHeaderTimeout: 5 * time.Second}
		log.Printf("internal ice endpoint on %s", internal)
		log.Print(isrv.ListenAndServe())
	}()

	log.Printf("snakenet on %s%s (turn key: %v, cap: %v at %.0f GB)", addr, prefix, t.configured(), t.cap.configured(), capGB)
	log.Fatal(srv.ListenAndServe())
}

func internalRoutes(t *turn) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/ice", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		json.NewEncoder(w).Encode(map[string]any{
			"iceServers":     t.iceServers(),
			"turn":           t.usable(),
			"refreshSeconds": int(time.Hour.Seconds()),
		})
	})
	return mux
}

func (h *hub) routes(prefix string, origins []string) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc(prefix+"/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"ok": true, "turn": h.turn.cap.status()})
	})
	mux.HandleFunc(prefix+"/stats", func(w http.ResponseWriter, r *http.Request) {
		cors(w, r)
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		json.NewEncoder(w).Encode(h.snapshotStats())
	})
	mux.HandleFunc(prefix+"/ws", func(w http.ResponseWriter, r *http.Request) {
		h.serveWS(w, r, origins)
	})
	return mux
}

// Stats are public and harmless, so any page may read them.
func cors(w http.ResponseWriter, r *http.Request) {
	if o := r.Header.Get("Origin"); o != "" {
		w.Header().Set("Access-Control-Allow-Origin", o)
		w.Header().Set("Vary", "Origin")
	}
}
