// gambit — online lobby, game relay, clocks and ratings for GAMBIT
// (games.br8t.com/gms/3d/gambit/). Modelled on gms/2d/clued/server.
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
	Admins         map[string]bool
	MaxConns       int
	MaxConnsPerIP  int
	MaxMsg         int
	MaxRooms       int
	MaxPublicRooms int
	AllowanceMode  string // on | fake | off
	AllowanceURL   string
	AllowanceGame  string
	AnonPerDay     int
	AnonPerIP      int
	SignedPerDay   int // shown to anonymous players ("sign in for 5 a day"); fake mode's limit
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
	cfg.Addr = env("GAMBIT_ADDR", "127.0.0.1:8019")
	cfg.Data = env("GAMBIT_DATA", "./data")
	cfg.Prefix = strings.TrimSuffix(env("GAMBIT_PREFIX", "/gms/3d/gambit"), "/")
	cfg.Static = os.Getenv("GAMBIT_STATIC")
	cfg.TestCerts = os.Getenv("GAMBIT_TEST_CERTS")
	cfg.NoRate = os.Getenv("GAMBIT_NO_RATE") != ""
	cfg.DevAuth = os.Getenv("GAMBIT_DEV_AUTH") != ""
	cfg.MaxConns = int(envInt("GAMBIT_MAX_CONNS", 800))
	cfg.MaxConnsPerIP = int(envInt("GAMBIT_MAX_CONNS_PER_IP", 12))
	cfg.MaxMsg = int(envInt("GAMBIT_MAX_MSG", 4096))
	cfg.MaxRooms = int(envInt("GAMBIT_MAX_ROOMS", 1000))
	cfg.MaxPublicRooms = int(envInt("GAMBIT_MAX_PUBLIC_ROOMS", 100))
	cfg.AnonPerDay = int(envInt("GAMBIT_ANON_PER_DAY", 2))
	cfg.AnonPerIP = int(envInt("GAMBIT_ANON_PER_IP_DAY", 30))
	cfg.SignedPerDay = int(envInt("GAMBIT_SIGNED_PER_DAY", 5))
	cfg.AllowanceURL = strings.TrimSuffix(env("GAMBIT_ALLOWANCE_URL", "http://127.0.0.1:8016/api/br8t/"), "/") + "/"
	cfg.AllowanceGame = env("GAMBIT_ALLOWANCE_GAME", "chess")
	cfg.AllowanceMode = strings.ToLower(os.Getenv("GAMBIT_ALLOWANCE"))
	switch cfg.AllowanceMode {
	case "on", "fake", "off":
	default:
		cfg.AllowanceMode = "off"
		if os.Getenv("GAMBIT_ALLOWANCE_URL") != "" {
			cfg.AllowanceMode = "on"
		} else if cfg.DevAuth {
			cfg.AllowanceMode = "fake"
		}
	}
	cfg.Admins = map[string]bool{}
	for _, e := range strings.Split(env("GAMBIT_ADMINS", "aaron@itmatters.mobi"), ",") {
		if e = strings.ToLower(strings.TrimSpace(e)); e != "" {
			cfg.Admins[e] = true
		}
	}
	cfg.Origins = map[string]bool{}
	cfg.OriginHosts = nil
	for _, o := range strings.Split(env("GAMBIT_ORIGINS", "https://games.br8t.com,https://y-r-u.github.io,https://yru.br8t.com,http://localhost:8888,http://192.168.0.236:8888"), ",") {
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
	dbPath := cfg.Data + "/gambit.db"
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
		log.Printf("WARNING: GAMBIT_DEV_AUTH is on — dev tokens accepted. Never set this on the box.")
	}
	hub.loadLive()
	go func() {
		t := time.NewTicker(250 * time.Millisecond)
		n := 0
		for range t.C {
			hub.tick()
			if n++; n%60 == 0 {
				hub.mu.Lock()
				hub.heartbeat()
				hub.mu.Unlock()
			}
			if n%14400 == 0 {
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
		hub.mu.Lock()
		hub.heartbeat()
		hub.mu.Unlock()
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		srv.Shutdown(ctx)
	}()
	log.Printf("gambit %s listening on %s (prefix %s, allowance %s, anon %d/day)", buildVersion, cfg.Addr, cfg.Prefix, cfg.AllowanceMode, cfg.AnonPerDay)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
	log.Printf("gambit stopped")
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
		fmt.Println("paused:", paused(), "(a running server picks this up at once)")
	case "stats":
		var players, games, live, anonToday int
		db.QueryRow(`SELECT COUNT(*) FROM players`).Scan(&players)
		db.QueryRow(`SELECT COUNT(*) FROM games`).Scan(&games)
		db.QueryRow(`SELECT COUNT(*) FROM live_games`).Scan(&live)
		db.QueryRow(`SELECT COUNT(*) FROM anon_usage WHERE day = ?`, utcDay(nowFn())).Scan(&anonToday)
		fmt.Printf("players %d · finished games %d · live %d · locally counted games today %d\n", players, games, live, anonToday)
	default:
		fmt.Println("usage: gambit [pause on|off|status | stats]")
		os.Exit(2)
	}
}

func routes() http.Handler {
	api := http.NewServeMux()
	api.HandleFunc("GET /api/health", handleHealth)
	api.HandleFunc("GET /api/status", handleStatus)
	api.HandleFunc("GET /api/ws", handleWS)
	api.HandleFunc("GET /api/leaderboard", handleLeaderboard)
	api.HandleFunc("GET /api/rooms", handleRooms)
	api.HandleFunc("GET /api/games/{id}", handleGetGame)
	api.HandleFunc("GET /api/players/{pid}", handlePlayer)
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
	conns, games := hub.conns, len(hub.games)
	hub.mu.Unlock()
	writeJSON(w, 200, map[string]any{"ok": true, "name": "gambit", "version": buildVersion, "protocol": protocolVersion,
		"now": nowMs(), "conns": conns, "games": games, "devAuth": cfg.DevAuth})
}

func handleStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"now": nowMs(), "tcs": tcList(), "categories": categories, "paused": paused(),
		"allowance": map[string]any{"mode": cfg.AllowanceMode, "anonPerDay": cfg.AnonPerDay, "signedPerDay": cfg.SignedPerDay},
		"devAuth":   cfg.DevAuth, "protocol": protocolVersion})
}

func handleLeaderboard(w http.ResponseWriter, r *http.Request) {
	cat := r.URL.Query().Get("cat")
	if !validCat(cat) {
		cat = "blitz"
	}
	n, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	writeJSON(w, 200, map[string]any{"cat": cat, "rows": leaderboard(cat, clampLimit(n))})
}

func handleRooms(w http.ResponseWriter, r *http.Request) {
	hub.mu.Lock()
	v := hub.lobbyView()
	hub.mu.Unlock()
	writeJSON(w, 200, v)
}

func handleGetGame(w http.ResponseWriter, r *http.Request) {
	var g struct {
		ID        string `json:"id"`
		WhiteName string `json:"white"`
		BlackName string `json:"black"`
		TC        string `json:"tc"`
		Cat       string `json:"cat"`
		Rated     bool   `json:"rated"`
		Result    string `json:"result"`
		Reason    string `json:"reason"`
		Moves     string `json:"moves"`
		PGN       string `json:"pgn"`
		WhiteR    int    `json:"whiteRating"`
		BlackR    int    `json:"blackRating"`
		WhiteD    int    `json:"whiteDelta"`
		BlackD    int    `json:"blackDelta"`
		Started   int64  `json:"started"`
		Ended     int64  `json:"ended"`
	}
	err := db.QueryRow(`SELECT id, white_name, black_name, tc, cat, rated, result, reason, moves, pgn, white_r, black_r, white_d, black_d, started, ended
		FROM games WHERE id = ?`, r.PathValue("id")).Scan(&g.ID, &g.WhiteName, &g.BlackName, &g.TC, &g.Cat, &g.Rated, &g.Result, &g.Reason,
		&g.Moves, &g.PGN, &g.WhiteR, &g.BlackR, &g.WhiteD, &g.BlackD, &g.Started, &g.Ended)
	if err != nil {
		writeErr(w, 404, "not_found", "no such game")
		return
	}
	writeJSON(w, 200, g)
}

// handlePlayer: public profile by pid (ratings per category + last 20 games).
func handlePlayer(w http.ResponseWriter, r *http.Request) {
	var uid, name string
	var anon bool
	if db.QueryRow(`SELECT uid, name, anon FROM players WHERE pid = ?`, r.PathValue("pid")).Scan(&uid, &name, &anon) != nil {
		writeErr(w, 404, "not_found", "no such player")
		return
	}
	rows, _ := db.Query(`SELECT id, white_uid, white_name, black_name, tc, rated, result, reason, ended FROM games
		WHERE white_uid = ? OR black_uid = ? ORDER BY ended DESC LIMIT 20`, uid, uid)
	recent := []map[string]any{}
	if rows != nil {
		for rows.Next() {
			var id, wu, wn, bn, tc, res, reason string
			var rated bool
			var ended int64
			rows.Scan(&id, &wu, &wn, &bn, &tc, &rated, &res, &reason, &ended)
			color := "b"
			if wu == uid {
				color = "w"
			}
			recent = append(recent, map[string]any{"id": id, "white": wn, "black": bn, "tc": tc, "rated": rated,
				"result": res, "reason": reason, "ended": ended, "color": color})
		}
		rows.Close() // before loadRatings: one pooled connection
	}
	writeJSON(w, 200, map[string]any{"pid": r.PathValue("pid"), "name": name, "anon": anon, "ratings": loadRatings(uid), "recent": recent})
}
