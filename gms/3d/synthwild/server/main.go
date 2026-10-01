// synthwild — accounts and world saves for SYNTHWILD (games.br8t.com/gms/3d/synthwild/).
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"path"
	"strconv"
	"strings"
	"time"
)

const buildVersion = "1.0.0"

var cfg struct {
	Addr       string
	Data       string
	Prefix     string // URL prefix Caddy forwards, stripped before routing
	CookiePath string
	PublicURL  string // used by admin-link
	Secure     bool
	Static     string // optional site root to serve (local dev only)
	TestCerts  string // test-only: JSON {kid: PEM} replacing Google's certs
	GlobalCap  int64
	DiskFloor  int64 // keep at least this much free on the data disk
	Admins     map[string]bool
}

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
	cfg.Addr = env("SYNTHWILD_ADDR", "127.0.0.1:8011")
	cfg.Data = env("SYNTHWILD_DATA", "./data")
	cfg.Prefix = strings.TrimSuffix(env("SYNTHWILD_PREFIX", "/gms/3d/synthwild"), "/")
	cfg.CookiePath = cfg.Prefix + "/"
	cfg.PublicURL = strings.TrimSuffix(env("SYNTHWILD_PUBLIC_URL", "https://games.br8t.com/gms/3d/synthwild"), "/")
	cfg.Secure = os.Getenv("SYNTHWILD_INSECURE_COOKIE") == ""
	cfg.Static = os.Getenv("SYNTHWILD_STATIC")
	cfg.TestCerts = os.Getenv("SYNTHWILD_TEST_CERTS")
	cfg.GlobalCap = envInt("SYNTHWILD_GLOBAL_CAP", 3<<30)
	cfg.DiskFloor = envInt("SYNTHWILD_DISK_FLOOR", 400<<20)
	cfg.Admins = map[string]bool{}
	for _, e := range strings.Split(env("SYNTHWILD_ADMINS", "aaron@br8t.com,dante@br8t.com,malaki@br8t.com"), ",") {
		if e = strings.ToLower(strings.TrimSpace(e)); e != "" {
			cfg.Admins[e] = true
		}
	}
}

func main() {
	loadConfig()
	if err := os.MkdirAll(cfg.Data, 0o750); err != nil {
		log.Fatalf("data dir: %v", err)
	}
	openDB(cfg.Data + "/synthwild.db")

	if len(os.Args) > 1 {
		runCLI(os.Args[1:])
		return
	}

	go func() {
		for {
			sweep()
			time.Sleep(time.Hour)
		}
	}()

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           logRequests(routes()),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       120 * time.Second,
		WriteTimeout:      120 * time.Second,
		IdleTimeout:       90 * time.Second,
		MaxHeaderBytes:    32 << 10,
	}
	log.Printf("synthwild %s listening on %s (prefix %s)", buildVersion, cfg.Addr, cfg.Prefix)
	log.Fatal(srv.ListenAndServe())
}

func runCLI(args []string) {
	switch args[0] {
	case "admin-link":
		if len(args) != 2 {
			fmt.Fprintln(os.Stderr, "usage: synthwild admin-link <email>")
			os.Exit(2)
		}
		link, err := makeAdminLink(args[1])
		if err != nil {
			fmt.Fprintln(os.Stderr, "error:", err)
			os.Exit(1)
		}
		fmt.Println(link)
		fmt.Fprintln(os.Stderr, "one-time link, valid for 15 minutes")
	default:
		fmt.Fprintln(os.Stderr, "usage: synthwild [admin-link <email>]")
		os.Exit(2)
	}
}

func routes() http.Handler {
	api := http.NewServeMux()
	api.HandleFunc("GET /api/health", handleHealth)
	api.HandleFunc("GET /api/me", handleMe)
	api.HandleFunc("POST /api/login", handleLogin)
	api.HandleFunc("POST /api/logout", handleLogout)
	api.HandleFunc("POST /api/admin/google", handleAdminGoogle)
	api.HandleFunc("GET /api/admin/link", handleAdminLink)
	api.HandleFunc("GET /api/admin/users", requireAdmin(handleListUsers))
	api.HandleFunc("POST /api/admin/users", requireAdmin(handleAddUser))
	api.HandleFunc("DELETE /api/admin/users/{username}", requireAdmin(handleRemoveUser))
	api.HandleFunc("GET /api/worlds", requireUser(handleListWorlds))
	api.HandleFunc("POST /api/worlds", requireUser(handleCreateWorld))
	api.HandleFunc("GET /api/worlds/{id}", requireUser(handleGetWorld))
	api.HandleFunc("PATCH /api/worlds/{id}", requireUser(handlePatchWorld))
	api.HandleFunc("DELETE /api/worlds/{id}", requireUser(handleDeleteWorld))
	api.HandleFunc("GET /api/worlds/{id}/blob", requireUser(handleGetBlob))
	api.HandleFunc("PUT /api/worlds/{id}/blob", requireUser(handlePutBlob))
	api.HandleFunc("GET /api/worlds/{id}/thumb", requireUser(handleGetThumb))
	api.HandleFunc("PUT /api/worlds/{id}/thumb", requireUser(handlePutThumb))
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
			// Never let the mux "clean" a dot-segment path into a redirect.
			if path.Clean(p) != p || strings.Contains(r.URL.RawPath, "%2") || strings.Contains(r.URL.RawPath, "%5") {
				writeErr(w, http.StatusNotFound, "not_found", "no such endpoint")
				return
			}
			if !sameOrigin(r) {
				writeErr(w, http.StatusForbidden, "forbidden", "cross-origin request")
				return
			}
			w.Header().Set("Cache-Control", "no-store")
			w.Header().Set("X-Content-Type-Options", "nosniff")
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

// A browser always sends Origin on cross-site POST/PUT/PATCH/DELETE; reject any
// that isn't this host. SameSite=Lax already covers most of this.
func sameOrigin(r *http.Request) bool {
	o := r.Header.Get("Origin")
	if o == "" || r.Method == http.MethodGet || r.Method == http.MethodHead {
		return true
	}
	u, err := url.Parse(o)
	if err != nil {
		return false
	}
	host := r.Header.Get("X-Forwarded-Host")
	if host == "" {
		host = r.Host
	}
	return strings.EqualFold(u.Host, host)
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"ok": true, "name": "synthwild", "version": buildVersion})
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, map[string]string{"error": msg, "code": code})
}

func readJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	defer r.Body.Close()
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10))
	if err := dec.Decode(v); err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", "invalid JSON body")
		return false
	}
	return true
}

func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		if strings.Contains(r.URL.Path, "/api/") && !strings.HasSuffix(r.URL.Path, "/health") {
			log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start).Round(time.Millisecond))
		}
	})
}
