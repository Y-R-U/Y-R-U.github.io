// Command f5deadtown serves the Deadtown browser game and its level editor
// from the same project folder on two ports, backed by one shared SQLite
// database reachable via a REST API on both ports.
package main

import (
	"context"
	"database/sql"
	"flag"
	"fmt"
	"log"
	"mime"
	"net/http"
	"os"
	"os/signal"
	"path"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"
)

// App holds the shared state (db handle + project root) used by every
// request handler, regardless of which port it came in on.
type App struct {
	db   *sql.DB
	root string // absolute path to the project folder served as static files
}

func main() {
	gamePort := flag.Int("game-port", 8901, "port to serve the game on")
	editorPort := flag.Int("editor-port", 8902, "port to serve the level editor on")
	dbPath := flag.String("db", "../data/deadtown.db", "path to the sqlite database file (relative to server/ working dir)")
	root := flag.String("root", "..", "project folder to serve static files from")
	reseed := flag.Bool("reseed", false, "wipe levels/level_versions/config tables (not saves) and re-import seeds, then continue serving")
	flag.Parse()

	// Ensure common web extensions map to the content types the spec
	// requires, regardless of the host OS's mime.types configuration.
	registerMimeTypes()

	absRoot, err := filepath.Abs(*root)
	if err != nil {
		log.Fatalf("resolve -root %q: %v", *root, err)
	}

	db, err := openDB(*dbPath)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer db.Close()

	if *reseed {
		log.Printf("-reseed: wiping levels, level_versions, and config tables (saves untouched)")
		if err := wipeLevels(db); err != nil {
			log.Fatalf("reseed wipe: %v", err)
		}
		if err := seedLevels(db, absRoot); err != nil {
			log.Fatalf("reseed import: %v", err)
		}
	} else {
		empty, err := levelsEmpty(db)
		if err != nil {
			log.Fatalf("check levels table: %v", err)
		}
		if empty {
			if err := seedLevels(db, absRoot); err != nil {
				log.Fatalf("seed import: %v", err)
			}
		}
	}

	app := &App{db: db, root: absRoot}

	gameMux := http.NewServeMux()
	registerAPI(gameMux, app)
	gameMux.Handle("/", staticHandler(absRoot, false))

	editorMux := http.NewServeMux()
	registerAPI(editorMux, app)
	editorMux.Handle("/", staticHandler(absRoot, true))

	gameSrv := &http.Server{
		Addr:    fmt.Sprintf("0.0.0.0:%d", *gamePort),
		Handler: withMiddleware(gameMux),
	}
	editorSrv := &http.Server{
		Addr:    fmt.Sprintf("0.0.0.0:%d", *editorPort),
		Handler: withMiddleware(editorMux),
	}

	errCh := make(chan error, 2)
	go func() {
		log.Printf("game server listening on http://0.0.0.0:%d (root %s)", *gamePort, absRoot)
		if err := gameSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errCh <- fmt.Errorf("game server: %w", err)
		}
	}()
	go func() {
		log.Printf("editor server listening on http://0.0.0.0:%d (root %s)", *editorPort, absRoot)
		if err := editorSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errCh <- fmt.Errorf("editor server: %w", err)
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	select {
	case err := <-errCh:
		log.Printf("server error, shutting down: %v", err)
	case sig := <-sigCh:
		log.Printf("received %s, shutting down...", sig)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		if err := gameSrv.Shutdown(ctx); err != nil {
			log.Printf("game server shutdown: %v", err)
		}
	}()
	go func() {
		defer wg.Done()
		if err := editorSrv.Shutdown(ctx); err != nil {
			log.Printf("editor server shutdown: %v", err)
		}
	}()
	wg.Wait()

	log.Println("shutdown complete")
}

func registerMimeTypes() {
	mime.AddExtensionType(".js", "text/javascript")
	mime.AddExtensionType(".mjs", "text/javascript")
	mime.AddExtensionType(".json", "application/json")
	mime.AddExtensionType(".wasm", "application/wasm")
}

// ---- middleware ----

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

// withMiddleware applies the common no-store/CORS headers, answers CORS
// preflight requests, and logs every request as "METHOD path -> status (duration)".
func withMiddleware(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		h.ServeHTTP(rec, r)
		log.Printf("%s %s -> %d (%s)", r.Method, r.URL.Path, rec.status, time.Since(start))
	})
}

// ---- static file serving ----

// staticHandler serves files from root. If isEditorPort is true, a request
// for "/" is redirected to "/editor/" instead of serving root's index.html.
func staticHandler(root string, isEditorPort bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}

		urlPath := r.URL.Path
		if isEditorPort && urlPath == "/" {
			http.Redirect(w, r, "/editor/", http.StatusFound)
			return
		}

		cleanPath := path.Clean("/" + urlPath)
		if isForbiddenPath(cleanPath) {
			writeJSONError(w, http.StatusForbidden, "forbidden")
			return
		}

		rel := filepath.FromSlash(strings.TrimPrefix(cleanPath, "/"))
		fsPath := filepath.Join(root, rel)

		// Paranoia: even though path.Clean already prevents ".." from
		// escaping a rooted path, double-check the resolved path is still
		// inside root before touching the filesystem.
		if fsPath != root && !strings.HasPrefix(fsPath, root+string(filepath.Separator)) {
			writeJSONError(w, http.StatusForbidden, "forbidden")
			return
		}

		info, err := os.Stat(fsPath)
		if err != nil {
			writeJSONError(w, http.StatusNotFound, "not found")
			return
		}

		served := fsPath
		if info.IsDir() {
			if !strings.HasSuffix(urlPath, "/") {
				http.Redirect(w, r, cleanPath+"/", http.StatusFound)
				return
			}
			idx := filepath.Join(fsPath, "index.html")
			idxInfo, err := os.Stat(idx)
			if err != nil || idxInfo.IsDir() {
				writeJSONError(w, http.StatusNotFound, "not found")
				return
			}
			served = idx
			info = idxInfo
		}

		f, err := os.Open(served)
		if err != nil {
			writeJSONError(w, http.StatusNotFound, "not found")
			return
		}
		defer f.Close()

		if ctype := mime.TypeByExtension(filepath.Ext(served)); ctype != "" {
			w.Header().Set("Content-Type", ctype)
		}
		http.ServeContent(w, r, served, info.ModTime(), f)
	}
}

// isForbiddenPath reports whether a cleaned, absolute request path (e.g.
// "/data/foo.json") must never be served: the server/ source folder, the
// sqlite database file (and its -wal/-shm siblings), or any dotfile.
func isForbiddenPath(cleanPath string) bool {
	if cleanPath == "/server" || strings.HasPrefix(cleanPath, "/server/") {
		return true
	}
	if strings.HasPrefix(cleanPath, "/data/deadtown.db") {
		return true
	}
	for _, part := range strings.Split(cleanPath, "/") {
		if part != "" && strings.HasPrefix(part, ".") {
			return true
		}
	}
	return false
}
