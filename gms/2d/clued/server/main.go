// clued — live rooms and challenge links for CLUED (games.br8t.com/gms/2d/clued/).
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unicode"
)

const buildVersion = "1.0.0"

var cfg struct {
	Addr         string
	Data         string
	Prefix       string
	Static       string
	TestCerts    string
	Origins      map[string]bool
	RoomIdle     time.Duration
	ChallengeTTL time.Duration
	MaxRooms     int
	NoRate       bool
	MaxPublic    int
	MaxPrivate   int
	MaxPlayers   int
	MaxSSE       int
	ChalPerDay   int
	EscRooms     int // rooms/hour that auto-escalates to level 1
	EscRefusals  int // cap refusals/hour that auto-escalates to level 1
	Admins       map[string]bool
	SMTPHost     string
	SMTPPort     string
	SMTPUser     string
	SMTPPass     string
	SMTPFrom     string
	AlertTo      string
	NtfyTopic    string
	NtfyURL      string
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
	cfg.Addr = env("CLUED_ADDR", "127.0.0.1:8012")
	cfg.Data = env("CLUED_DATA", "./data")
	cfg.Prefix = strings.TrimSuffix(env("CLUED_PREFIX", "/gms/2d/clued"), "/")
	cfg.Static = os.Getenv("CLUED_STATIC")
	cfg.TestCerts = os.Getenv("CLUED_TEST_CERTS")
	cfg.RoomIdle = time.Duration(envInt("CLUED_ROOM_IDLE_MIN", 360)) * time.Minute
	cfg.ChallengeTTL = time.Duration(envInt("CLUED_CHALLENGE_DAYS", 90)) * 24 * time.Hour
	cfg.MaxRooms = int(envInt("CLUED_MAX_ROOMS", 3000))
	cfg.NoRate = os.Getenv("CLUED_NO_RATE") != ""
	cfg.MaxPublic = int(envInt("CLUED_MAX_PUBLIC", 5))
	cfg.MaxPrivate = int(envInt("CLUED_MAX_PRIVATE", 20))
	cfg.MaxPlayers = int(envInt("CLUED_MAX_PLAYERS", 16))
	cfg.MaxSSE = int(envInt("CLUED_MAX_SSE", 200))
	cfg.ChalPerDay = int(envInt("CLUED_CHALLENGES_PER_DAY", 300))
	cfg.EscRooms = int(envInt("CLUED_ESCALATE_ROOMS_HOUR", 30))
	cfg.EscRefusals = int(envInt("CLUED_ESCALATE_REFUSALS_HOUR", 3))
	cfg.Admins = map[string]bool{}
	for _, e := range strings.Split(env("CLUED_ADMINS", "aaron@itmatters.mobi"), ",") {
		if e = strings.ToLower(strings.TrimSpace(e)); e != "" {
			cfg.Admins[e] = true
		}
	}
	cfg.SMTPHost = os.Getenv("CLUED_SMTP_HOST")
	cfg.SMTPPort = env("CLUED_SMTP_PORT", "587")
	cfg.SMTPUser = os.Getenv("CLUED_SMTP_USER")
	cfg.SMTPPass = os.Getenv("CLUED_SMTP_PASS")
	cfg.SMTPFrom = env("CLUED_SMTP_FROM", cfg.SMTPUser)
	cfg.AlertTo = env("CLUED_ALERT_TO", "aaron@itmatters.mobi")
	cfg.NtfyTopic = os.Getenv("CLUED_NTFY_TOPIC")
	cfg.NtfyURL = strings.TrimSuffix(env("CLUED_NTFY_URL", "https://ntfy.sh"), "/")
	cfg.Origins = map[string]bool{}
	for _, o := range strings.Split(env("CLUED_ORIGINS", "https://y-r-u.github.io,http://localhost:8888,https://games.br8t.com,https://yru.br8t.com"), ",") {
		if o = strings.TrimSpace(o); o != "" {
			cfg.Origins[o] = true
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
	dbPath := cfg.Data + "/clued.db"
	openDB(dbPath)
	for _, f := range []string{"", "-wal", "-shm"} {
		os.Chmod(dbPath+f, 0o600)
	}
	loadProtection()
	if len(os.Args) > 1 {
		runCLI(os.Args[1:])
		return
	}
	loadRooms()
	go roomLoop()
	go statsLoop()
	go func() {
		for {
			sweepDB()
			time.Sleep(time.Hour)
		}
	}()

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           logRequests(routes()),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      40 * time.Second, // streams clear their own deadline
		IdleTimeout:       90 * time.Second,
		MaxHeaderBytes:    32 << 10,
	}
	go func() {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, syscall.SIGTERM, syscall.SIGINT)
		<-sig
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		closeStreams()
		srv.Shutdown(ctx)
	}()
	log.Printf("clued %s listening on %s (prefix %s)", buildVersion, cfg.Addr, cfg.Prefix)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
	flushRooms(true)
	flushStats()
	log.Printf("clued stopped, rooms flushed")
}

func routes() http.Handler {
	api := http.NewServeMux()
	api.HandleFunc("GET /api/health", handleHealth)
	api.HandleFunc("GET /api/time", handleTime)
	api.HandleFunc("POST /api/rooms", handleCreateRoom)
	api.HandleFunc("GET /api/rooms/public", handlePublic)
	api.HandleFunc("POST /api/rooms/{code}/join", handleJoin)
	api.HandleFunc("GET /api/rooms/{code}", handlePeek)
	api.HandleFunc("GET /api/rooms/{code}/state", handleState)
	api.HandleFunc("GET /api/rooms/{code}/events", handleEvents)
	api.HandleFunc("GET /api/rooms/{code}/q/{i}", handleQuestion)
	api.HandleFunc("POST /api/rooms/{code}/answer", handleAnswer)
	api.HandleFunc("POST /api/rooms/{code}/leave", handleLeave)
	api.HandleFunc("POST /api/rooms/{code}/vote", handleVote)
	api.HandleFunc("POST /api/rooms/{code}/ready", handleReady)
	api.HandleFunc("POST /api/rooms/{code}/{action}", handleHostAction)
	api.HandleFunc("POST /api/challenges", handleCreateChallenge)
	api.HandleFunc("GET /api/challenges/{id}", handleGetChallenge)
	api.HandleFunc("GET /api/challenges/{id}/scores", handleChallengeScores)
	api.HandleFunc("POST /api/challenges/{id}/scores", handlePostScore)
	api.HandleFunc("GET /api/admin/overview", requireAdmin(handleAdminOverview))
	api.HandleFunc("POST /api/admin/level", requireAdmin(handleAdminLevel))
	api.HandleFunc("POST /api/admin/rooms/{code}/close", requireAdmin(handleAdminClose))
	api.HandleFunc("POST /api/admin/test-alert", requireAdmin(handleAdminAlertTest))
	api.HandleFunc("GET /api/status", handleStatus)
	api.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		writeErr(w, http.StatusNotFound, "not_found", "no such endpoint")
	})

	var static http.Handler
	if cfg.Static != "" {
		static = http.FileServer(http.Dir(cfg.Static))
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Path
		if strings.HasPrefix(p, cfg.Prefix+"/api/") || p == cfg.Prefix+"/api" {
			p = strings.TrimPrefix(p, cfg.Prefix)
		}
		if strings.HasPrefix(p, "/api/") {
			if path.Clean(p) != p || strings.Contains(r.URL.RawPath, "%2") || strings.Contains(r.URL.RawPath, "%5") {
				writeErr(w, http.StatusNotFound, "not_found", "no such endpoint")
				return
			}
			if !applyCORS(w, r) {
				writeErr(w, http.StatusForbidden, "forbidden", "origin not allowed")
				return
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			w.Header().Set("Cache-Control", "no-store")
			w.Header().Set("X-Content-Type-Options", "nosniff")
			if !p2health(p) && !allowIP(r) {
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

func p2health(p string) bool { return p == "/api/health" }

// applyCORS echoes allowed origins. Requests with a foreign Origin are refused
// outright (a text/plain POST skips preflight, so the browser alone can't stop it).
// Requests without Origin (curl, same-origin GET) pass.
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
		h.Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		h.Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		h.Set("Access-Control-Max-Age", "600")
	}
	return true
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	roomsMu.RLock()
	n := len(rooms)
	roomsMu.RUnlock()
	writeJSON(w, 200, map[string]any{"ok": true, "name": "clued", "version": buildVersion, "now": nowMs(), "rooms": n})
}

func handleTime(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"now": nowMs()})
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, map[string]string{"error": msg, "code": code})
}

const smallBody = 16 << 10
const bigBody = 600 << 10 // spec + 512 KB of questions + slack

func readJSON(w http.ResponseWriter, r *http.Request, limit int64, v any) bool {
	defer r.Body.Close()
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, limit))
	if err := dec.Decode(v); err != nil {
		var mbe *http.MaxBytesError
		if errors.As(err, &mbe) {
			writeErr(w, http.StatusRequestEntityTooLarge, "too_large", "request body too large")
		} else {
			writeErr(w, http.StatusBadRequest, "bad_request", "invalid JSON body")
		}
		return false
	}
	return true
}

func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		p := r.URL.Path
		if strings.Contains(p, "/api/") && !strings.HasSuffix(p, "/health") && !strings.HasSuffix(p, "/events") &&
			!strings.HasSuffix(p, "/state") && !strings.HasSuffix(p, "/time") {
			log.Printf("%s %s %s", r.Method, logSafe(p), time.Since(start).Round(time.Millisecond))
		}
	})
}

func logSafe(s string) string {
	if len(s) > 200 {
		s = s[:200] + "…"
	}
	return strings.Map(func(c rune) rune {
		if unicode.IsControl(c) {
			return '?'
		}
		return c
	}, s)
}

// CLI for the box: `clued test-alert` sends one alert through the configured channels;
// `clued level N` sets the protection level (the running service picks it up on restart).
func runCLI(args []string) {
	switch args[0] {
	case "test-alert":
		msg := "Test alert from the Clued server. If you can read this on your phone, alerts work."
		id := recordEvent("test", msg)
		via := deliverAlert("test", msg)
		db.Exec(`UPDATE alerts SET delivered = ? WHERE id = ?`, via, id)
		fmt.Println("delivered via:", via)
	case "level":
		if len(args) == 2 {
			if n, err := strconv.Atoi(args[1]); err == nil {
				setLevel(n, "cli")
			}
		}
		fmt.Println("level", level())
	default:
		fmt.Fprintln(os.Stderr, "usage: clued [test-alert | level N]")
		os.Exit(2)
	}
}
