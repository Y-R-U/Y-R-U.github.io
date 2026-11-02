// skyputt — online rooms and shot relay for SKYPUTT mini golf
// (games.br8t.com/gms/3d/skyputt/). Modelled on gms/3d/gambit/server.
//
// The server is a room manager and a relay: clients run the deterministic physics, send each
// shot's input (and, when it stops, the result) and every other client replays it as a ghost.
// Results are client-reported (D11: no cheat detection yet). Online is free: no allowance gate.
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
const protocolVersion = 1

var cfg struct {
	Addr           string
	Data           string
	Prefix         string
	Static         string
	TestCerts      string
	Origins        map[string]bool
	OriginHosts    []string // websocket origin patterns (host[:port])
	NoRate         bool
	DevAuth        bool
	Salt           string
	MaxConns       int
	MaxConnsPerIP  int
	MaxMsg         int
	MaxRooms       int
	MaxPublicRooms int
}

// nowFn is swapped by tests to fast-forward time.
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
	cfg.Addr = env("SKYPUTT_ADDR", "127.0.0.1:8023")
	cfg.Data = env("SKYPUTT_DATA", "./data")
	cfg.Prefix = strings.TrimSuffix(env("SKYPUTT_PREFIX", "/gms/3d/skyputt"), "/")
	cfg.Static = os.Getenv("SKYPUTT_STATIC")
	cfg.TestCerts = os.Getenv("SKYPUTT_TEST_CERTS")
	cfg.NoRate = os.Getenv("SKYPUTT_NO_RATE") != ""
	cfg.DevAuth = os.Getenv("SKYPUTT_DEV_AUTH") != ""
	cfg.MaxConns = int(envInt("SKYPUTT_MAX_CONNS", 800))
	cfg.MaxConnsPerIP = int(envInt("SKYPUTT_MAX_CONNS_PER_IP", 12))
	cfg.MaxMsg = int(envInt("SKYPUTT_MAX_MSG", 4096))
	cfg.MaxRooms = int(envInt("SKYPUTT_MAX_ROOMS", 500))
	cfg.MaxPublicRooms = int(envInt("SKYPUTT_MAX_PUBLIC_ROOMS", 100))
	cfg.Origins = map[string]bool{}
	cfg.OriginHosts = nil
	for _, o := range strings.Split(env("SKYPUTT_ORIGINS", "https://games.br8t.com,https://y-r-u.github.io,https://yru.br8t.com,http://localhost:8888,http://192.168.0.236:8888"), ",") {
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
	dbPath := cfg.Data + "/skyputt.db"
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
	if cfg.DevAuth {
		log.Printf("WARNING: SKYPUTT_DEV_AUTH is on — dev tokens accepted. Never set this on the box.")
	}
	go func() {
		t := time.NewTicker(250 * time.Millisecond)
		n := 0
		for range t.C {
			hub.tick()
			if n++; n%14400 == 0 {
				sweepDB()
			}
		}
	}()
	sweepDB()

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           routes(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second, // the websocket handler lifts these for its connection
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
	log.Printf("skyputt %s listening on %s (prefix %s)", buildVersion, cfg.Addr, cfg.Prefix)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
	log.Printf("skyputt stopped")
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
		fmt.Println("paused:", paused(), "(a running server picks this up at once: no new rooms)")
	case "stats":
		var players, rounds int
		db.QueryRow(`SELECT COUNT(*) FROM players`).Scan(&players)
		db.QueryRow(`SELECT COUNT(*) FROM rounds`).Scan(&rounds)
		fmt.Printf("players %d · finished rounds %d\n", players, rounds)
	default:
		fmt.Println("usage: skyputt [pause on|off|status | stats]")
		os.Exit(2)
	}
}

func paused() bool { return getSetting("paused") == "1" }

func routes() http.Handler {
	api := http.NewServeMux()
	api.HandleFunc("GET /api/health", handleHealth)
	api.HandleFunc("GET /api/status", handleStatus)
	api.HandleFunc("GET /api/ws", handleWS)
	api.HandleFunc("GET /api/rooms", handleRooms)
	api.HandleFunc("GET /api/rounds/{id}", handleGetRound)
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
			if p != "/api/ws" && !applyCORS(w, r) { // the websocket checks Origin itself
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
		h.Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
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
	conns, rooms := hub.conns, len(hub.rooms)
	hub.mu.Unlock()
	writeJSON(w, 200, map[string]any{"ok": true, "name": "skyputt", "version": buildVersion, "protocol": protocolVersion,
		"now": nowMs(), "conns": conns, "rooms": rooms, "devAuth": cfg.DevAuth})
}

func handleStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"now": nowMs(), "paused": paused(), "devAuth": cfg.DevAuth, "protocol": protocolVersion,
		"limits": map[string]any{"maxPlayers": maxPlayers, "minPlayers": minPlayers, "maxHoles": maxHoles, "shotClocks": shotClocks,
			"personalities": personalityIDs(), "maxAISkill": maxAISkill}})
}

func handleRooms(w http.ResponseWriter, r *http.Request) {
	hub.mu.Lock()
	v := hub.lobbyView()
	hub.mu.Unlock()
	writeJSON(w, 200, v)
}

func handleGetRound(w http.ResponseWriter, r *http.Request) {
	var id, code, holes, seats string
	var started, ended int64
	err := db.QueryRow(`SELECT id, code, holes, seats, started, ended FROM rounds WHERE id = ?`, r.PathValue("id")).
		Scan(&id, &code, &holes, &seats, &started, &ended)
	if err != nil {
		writeErr(w, 404, "not_found", "no such round")
		return
	}
	writeJSON(w, 200, map[string]any{"id": id, "code": code, "holes": json.RawMessage(holes), "seats": json.RawMessage(seats),
		"started": started, "ended": ended})
}
