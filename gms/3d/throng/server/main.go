// throng — rooms, matchmaking, snapshot relay, host migration and leaderboards for THRONG online
// (games.br8t.com/gms/3d/throng/). Host-run (DECISIONS D11): one player's browser runs the sim and the
// bots; this server never simulates anything. Protocol: docs/NET.md.
package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const buildVersion = "0.1.0"

// protocolVersion must equal the client's PROTO (js/net/proto.js). Anything else is refused at hello.
const protocolVersion = 1
const minProtocol = 1

var cfg struct {
	Addr          string
	Data          string
	Prefix        string
	Static        string
	Origins       map[string]bool
	OriginHosts   []string
	NoRate        bool
	MaxConns      int
	MaxConnsPerIP int
	MaxRooms      int
	QuickWait     time.Duration
	Salt          string
}

var nowFn = time.Now

func nowMs() int64 { return nowFn().UnixMilli() }

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func envInt(k string, def int64) int64 {
	if v, err := strconv.ParseInt(os.Getenv(k), 10, 64); err == nil {
		return v
	}
	return def
}

func loadConfig() {
	cfg.Addr = env("THRONG_ADDR", "127.0.0.1:8024")
	cfg.Data = env("THRONG_DATA", "./data")
	cfg.Prefix = strings.TrimSuffix(env("THRONG_PREFIX", "/gms/3d/throng"), "/")
	cfg.Static = os.Getenv("THRONG_STATIC")
	cfg.NoRate = os.Getenv("THRONG_NO_RATE") != ""
	cfg.MaxConns = int(envInt("THRONG_MAX_CONNS", 600))
	cfg.MaxConnsPerIP = int(envInt("THRONG_MAX_CONNS_PER_IP", 8))
	cfg.MaxRooms = int(envInt("THRONG_MAX_ROOMS", 300))
	cfg.QuickWait = time.Duration(envInt("THRONG_QUICK_WAIT_MS", 8000)) * time.Millisecond
	cfg.Origins = map[string]bool{}
	cfg.OriginHosts = nil
	for _, o := range strings.Split(env("THRONG_ORIGINS", "https://games.br8t.com,https://y-r-u.github.io,https://yru.br8t.com"), ",") {
		if o = strings.TrimSpace(o); o != "" {
			cfg.Origins[o] = true
			if u, err := url.Parse(o); err == nil && u.Host != "" {
				cfg.OriginHosts = append(cfg.OriginHosts, u.Host)
			}
		}
	}
}

func main() {
	loadConfig()
	syscall.Umask(0o077)
	if err := os.MkdirAll(cfg.Data, 0o700); err != nil {
		log.Fatalf("data dir: %v", err)
	}
	os.Chmod(cfg.Data, 0o700)
	dbPath := cfg.Data + "/throng.db"
	openDB(dbPath)
	for _, f := range []string{"", "-wal", "-shm"} {
		os.Chmod(dbPath+f, 0o600)
	}
	cfg.Salt = getSetting("salt")
	if cfg.Salt == "" {
		b := make([]byte, 16)
		rand.Read(b)
		cfg.Salt = hex.EncodeToString(b)
		putSetting("salt", cfg.Salt)
	}
	if len(os.Args) > 1 {
		runCLI(os.Args[1:])
		return
	}
	go func() {
		t := time.NewTicker(100 * time.Millisecond)
		n := 0
		for range t.C {
			hub.tick()
			if n++; n%36000 == 0 {
				sweepDB()
			}
		}
	}()
	sweepDB()

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           routes(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       90 * time.Second,
		MaxHeaderBytes:    32 << 10,
	}
	go func() {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, syscall.SIGTERM, syscall.SIGINT)
		<-sig
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		srv.Shutdown(ctx)
	}()
	log.Printf("throng %s listening on %s (prefix %s)", buildVersion, cfg.Addr, cfg.Prefix)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
	log.Printf("throng stopped")
}

func runCLI(args []string) {
	switch args[0] {
	case "pause":
		if len(args) > 1 {
			switch args[1] {
			case "on":
				putSetting("paused", "1")
			case "off":
				putSetting("paused", "0")
			}
		}
		fmt.Println("paused:", paused(), "(a running server stops opening new rooms at once)")
	case "stats":
		var rows, players int
		db.QueryRow(`SELECT COUNT(*) FROM results`).Scan(&rows)
		db.QueryRow(`SELECT COUNT(*) FROM alltime`).Scan(&players)
		fmt.Printf("board rows (last 16 days) %d · players on the all-time board %d\n", rows, players)
	default:
		fmt.Println("usage: throng [pause on|off|status | stats]")
		os.Exit(2)
	}
}

var pausedCache struct {
	v  bool
	at int64
}

func paused() bool {
	if now := nowMs(); now-pausedCache.at > 5000 {
		pausedCache.v, pausedCache.at = getSetting("paused") == "1", now
	}
	return pausedCache.v
}

func routes() http.Handler {
	api := http.NewServeMux()
	api.HandleFunc("GET /api/health", handleHealth)
	api.HandleFunc("GET /api/ws", handleWS)
	api.HandleFunc("GET /api/boards", handleBoards)
	api.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		writeErr(w, http.StatusNotFound, "not_found", "no such endpoint")
	})
	var static http.Handler
	if cfg.Static != "" {
		static = http.FileServer(http.Dir(cfg.Static))
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Path
		if strings.HasPrefix(p, cfg.Prefix+"/api/") {
			p = strings.TrimPrefix(p, cfg.Prefix)
		}
		if strings.HasPrefix(p, "/api/") {
			if path.Clean(p) != p || strings.Contains(r.URL.RawPath, "%2") || strings.Contains(r.URL.RawPath, "%5") {
				writeErr(w, http.StatusNotFound, "not_found", "no such endpoint")
				return
			}
			if p != "/api/ws" && !applyCORS(w, r) {
				writeErr(w, http.StatusForbidden, "forbidden", "origin not allowed")
				return
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			w.Header().Set("Cache-Control", "no-store")
			w.Header().Set("X-Content-Type-Options", "nosniff")
			if p != "/api/health" && p != "/api/ws" && !allowIP(r) {
				rateLimited(w)
				return
			}
			r2 := r.Clone(r.Context())
			r2.URL.Path = p
			r2.URL.RawPath = ""
			api.ServeHTTP(w, r2)
			return
		}
		if static != nil {
			w.Header().Set("Cache-Control", "no-cache")
			static.ServeHTTP(w, r)
			return
		}
		http.NotFound(w, r)
	})
}

func applyCORS(w http.ResponseWriter, r *http.Request) bool {
	o := r.Header.Get("Origin")
	h := w.Header()
	h.Add("Vary", "Origin")
	if o == "" {
		return true
	}
	if !cfg.Origins[o] {
		return false
	}
	h.Set("Access-Control-Allow-Origin", o)
	if r.Method == http.MethodOptions {
		h.Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		h.Set("Access-Control-Allow-Headers", "Content-Type")
		h.Set("Access-Control-Max-Age", "600")
	}
	return true
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, map[string]string{"error": msg, "code": code})
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	hub.mu.Lock()
	conns, rooms, playing, online := hub.conns, len(hub.rooms), 0, 0
	for _, rm := range hub.rooms {
		if rm.State == "playing" {
			playing++
		}
		for _, m := range rm.Members {
			if m.sess != nil {
				online++
			}
		}
	}
	hub.mu.Unlock()
	writeJSON(w, 200, map[string]any{"ok": true, "name": "throng", "version": buildVersion, "protocol": protocolVersion,
		"minProtocol": minProtocol, "now": nowMs(), "conns": conns, "rooms": rooms, "playing": playing, "inRooms": online,
		"paused": paused(), "boards": 1})
}
