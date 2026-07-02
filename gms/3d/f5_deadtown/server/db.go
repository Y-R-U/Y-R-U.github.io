package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

// openDB opens (creating if needed) the sqlite database at path, sets pragmas,
// and ensures the schema exists.
func openDB(path string) (*sql.DB, error) {
	if dir := filepath.Dir(path); dir != "." && dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, fmt.Errorf("create db dir: %w", err)
		}
	}

	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}

	// This app uses a single *sql.DB with WAL + busy_timeout, which tolerates
	// a modest number of concurrent readers/writers; keep the pool small since
	// sqlite serializes writers anyway.
	db.SetMaxOpenConns(8)

	pragmas := []string{
		"PRAGMA journal_mode=WAL;",
		"PRAGMA busy_timeout=5000;",
	}
	for _, p := range pragmas {
		if _, err := db.Exec(p); err != nil {
			db.Close()
			return nil, fmt.Errorf("pragma %q: %w", p, err)
		}
	}

	if err := ensureSchema(db); err != nil {
		db.Close()
		return nil, err
	}

	return db, nil
}

func ensureSchema(db *sql.DB) error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS levels (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			data TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS level_versions (
			vid INTEGER PRIMARY KEY AUTOINCREMENT,
			level_id TEXT NOT NULL,
			name TEXT NOT NULL,
			data TEXT NOT NULL,
			created_at TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS config (
			key TEXT PRIMARY KEY,
			data TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS saves (
			slot TEXT PRIMARY KEY,
			data TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);`,
	}
	for _, s := range stmts {
		if _, err := db.Exec(s); err != nil {
			return fmt.Errorf("schema: %w", err)
		}
	}
	return nil
}

// wipeLevels removes all levels, level_versions and config rows (used by -reseed).
// Saves are intentionally left untouched.
func wipeLevels(db *sql.DB) error {
	stmts := []string{
		"DELETE FROM level_versions;",
		"DELETE FROM levels;",
		"DELETE FROM config;",
	}
	for _, s := range stmts {
		if _, err := db.Exec(s); err != nil {
			return fmt.Errorf("wipe: %w", err)
		}
	}
	return nil
}

var slugNonAlnum = regexp.MustCompile(`[^a-z0-9]+`)

// slugify lowercases the input and joins runs of non-alphanumeric characters
// with a single '-', trimming leading/trailing dashes.
func slugify(name string) string {
	s := strings.ToLower(name)
	s = slugNonAlnum.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if s == "" {
		s = "level"
	}
	return s
}

var idPattern = regexp.MustCompile(`^[a-z0-9_-]{1,64}$`)

func validID(id string) bool {
	return idPattern.MatchString(id)
}

func nowRFC3339() string {
	return time.Now().UTC().Format(time.RFC3339)
}

// seedLevels imports <root>/data/seed/*.level.json into the levels table
// (only called when the table is empty, or always under -reseed) and
// upserts <root>/data/seed/config.game.json as config key "game".
func seedLevels(db *sql.DB, root string) error {
	seedDir := filepath.Join(root, "data", "seed")
	entries, err := os.ReadDir(seedDir)
	if err != nil {
		if os.IsNotExist(err) {
			log.Printf("warning: seed dir %s does not exist, skipping seeding", seedDir)
			return nil
		}
		return fmt.Errorf("read seed dir: %w", err)
	}
	if len(entries) == 0 {
		log.Printf("warning: seed dir %s is empty, skipping seeding", seedDir)
		return nil
	}

	imported := 0
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".level.json") {
			continue
		}
		p := filepath.Join(seedDir, e.Name())
		raw, err := os.ReadFile(p)
		if err != nil {
			log.Printf("warning: cannot read seed file %s: %v", p, err)
			continue
		}
		var doc struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		}
		if err := json.Unmarshal(raw, &doc); err != nil {
			log.Printf("warning: cannot parse seed file %s: %v", p, err)
			continue
		}
		if doc.ID == "" || doc.Name == "" {
			log.Printf("warning: seed file %s missing id/name, skipping", p)
			continue
		}
		if !validID(doc.ID) {
			log.Printf("warning: seed file %s has invalid id %q, skipping", p, doc.ID)
			continue
		}
		_, err = db.Exec(
			`INSERT INTO levels (id, name, data, updated_at) VALUES (?, ?, ?, ?)
			 ON CONFLICT(id) DO UPDATE SET name=excluded.name, data=excluded.data, updated_at=excluded.updated_at`,
			doc.ID, doc.Name, string(raw), nowRFC3339(),
		)
		if err != nil {
			log.Printf("warning: cannot insert seed level %s: %v", doc.ID, err)
			continue
		}
		imported++
	}
	log.Printf("seeded %d level(s) from %s", imported, seedDir)

	configPath := filepath.Join(seedDir, "config.game.json")
	if raw, err := os.ReadFile(configPath); err == nil {
		_, err := db.Exec(
			`INSERT INTO config (key, data, updated_at) VALUES ('game', ?, ?)
			 ON CONFLICT(key) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`,
			string(raw), nowRFC3339(),
		)
		if err != nil {
			log.Printf("warning: cannot upsert seed config: %v", err)
		} else {
			log.Printf("seeded config key \"game\" from %s", configPath)
		}
	} else if !os.IsNotExist(err) {
		log.Printf("warning: cannot read seed config %s: %v", configPath, err)
	}

	return nil
}

func levelsEmpty(db *sql.DB) (bool, error) {
	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM levels").Scan(&count); err != nil {
		return false, err
	}
	return count == 0, nil
}
