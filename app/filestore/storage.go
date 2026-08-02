package main

import (
	"archive/zip"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// filesRoot is the parent of every project directory. Set in main().
var filesRoot string

// Quota accounting is read-modify-write across the DB and the filesystem, so
// every mutation of a project's contents is serialised. One global lock is
// fine here: writes are short and this box has a single vCPU.
var storeMu sync.Mutex

var errQuota = errors.New("quota exceeded")

func projectDir(id int64) string {
	return filepath.Join(filesRoot, fmt.Sprintf("p%d", id))
}

/* ------------------------------------------------------- path safety */

// cleanRelPath normalises a client-supplied path into a safe project-relative
// one, or returns an error. This is the only place paths enter the store, so
// it is the single choke point for directory traversal ("zip slip" included).
func cleanRelPath(p string) (string, error) {
	p = strings.ReplaceAll(p, "\\", "/")
	p = strings.TrimSpace(p)
	p = strings.TrimPrefix(p, "./")
	if p == "" {
		return "", errors.New("empty path")
	}
	if strings.HasPrefix(p, "/") {
		return "", errors.New("path must be relative")
	}
	// path.Clean collapses ".." — checking after cleaning catches "a/../../b"
	// which a naive prefix check on the raw string would miss.
	c := path.Clean(p)
	if c == "." || c == ".." || strings.HasPrefix(c, "../") {
		return "", errors.New("path escapes the project")
	}
	if len(c) > 400 {
		return "", errors.New("path is too long")
	}
	for _, seg := range strings.Split(c, "/") {
		if seg == "" {
			return "", errors.New("empty path segment")
		}
		if len(seg) > 120 {
			return "", errors.New("name is too long")
		}
		for _, r := range seg {
			if r < 0x20 || r == 0x7f || r == ':' || r == '*' || r == '?' || r == '"' || r == '<' || r == '>' || r == '|' {
				return "", errors.New("name contains an illegal character")
			}
		}
	}
	return c, nil
}

// absFor resolves a project-relative path to an absolute one and re-verifies
// containment — belt and braces against a cleanRelPath bug or a symlinked root.
func absFor(projectID int64, rel string) (string, error) {
	dir := projectDir(projectID)
	abs := filepath.Join(dir, filepath.FromSlash(rel))
	if abs != dir && !strings.HasPrefix(abs, dir+string(os.PathSeparator)) {
		return "", errors.New("path escapes the project")
	}
	return abs, nil
}

/* ----------------------------------------------------------- quota */

// remaining reports how many more bytes the project may store, taking both the
// project quota and the global disk cap into account.
func remaining(projectID, quota int64) int64 {
	var used int64
	db.QueryRow(`SELECT COALESCE(SUM(size),0) FROM files WHERE project_id=?`, projectID).Scan(&used)
	left := quota - used
	if g := globalCap() - totalUsed(); g < left {
		left = g
	}
	if left < 0 {
		left = 0
	}
	return left
}

/* -------------------------------------------------------- write path */

// writeFile stores one file, replacing any existing entry at the same path.
//
// Bytes are streamed to a temp file first so a client that lies about its
// Content-Length (or dies mid-upload) can never leave a half-written file in
// place, and the quota is checked against what actually arrived. Caller must
// hold storeMu.
func writeFile(p *Project, rel string, src io.Reader, userID int64) (int64, error) {
	abs, err := absFor(p.ID, rel)
	if err != nil {
		return 0, err
	}
	if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
		return 0, err
	}

	// An overwrite frees the old file's bytes, so they count toward the budget.
	var old int64
	db.QueryRow(`SELECT size FROM files WHERE project_id=? AND path=?`, p.ID, rel).Scan(&old)
	budget := remaining(p.ID, p.QuotaBytes) + old
	if budget > maxUpload() {
		budget = maxUpload()
	}

	tmp, err := os.CreateTemp(filepath.Dir(abs), ".upload-*")
	if err != nil {
		return 0, err
	}
	tmpName := tmp.Name()
	defer func() { tmp.Close(); os.Remove(tmpName) }()

	// budget+1 so a file that exactly fills the budget still succeeds while one
	// byte over is detected rather than silently truncated.
	n, err := io.Copy(tmp, io.LimitReader(src, budget+1))
	if err != nil {
		return 0, err
	}
	if n > budget {
		return 0, errQuota
	}
	if err := tmp.Sync(); err != nil {
		return 0, err
	}
	if err := tmp.Close(); err != nil {
		return 0, err
	}
	if err := os.Chmod(tmpName, 0o644); err != nil {
		return 0, err
	}
	if err := os.Rename(tmpName, abs); err != nil {
		return 0, err
	}

	_, err = db.Exec(`INSERT INTO files(project_id,path,size,updated_at,updated_by)
	                  VALUES(?,?,?,?,?)
	                  ON CONFLICT(project_id,path) DO UPDATE SET
	                    size=excluded.size, updated_at=excluded.updated_at,
	                    updated_by=excluded.updated_by`,
		p.ID, rel, n, time.Now().Unix(), userID)
	return n, err
}

// deletePath removes a single file, or a folder and everything under it.
// Caller must hold storeMu.
func deletePath(projectID int64, rel string, isDir bool) error {
	abs, err := absFor(projectID, rel)
	if err != nil {
		return err
	}
	if isDir {
		if err := os.RemoveAll(abs); err != nil {
			return err
		}
		_, err = db.Exec(`DELETE FROM files WHERE project_id=? AND (path=? OR path LIKE ?)`,
			projectID, rel, rel+"/%")
		return err
	}
	if err := os.Remove(abs); err != nil && !os.IsNotExist(err) {
		return err
	}
	_, err = db.Exec(`DELETE FROM files WHERE project_id=? AND path=?`, projectID, rel)
	return err
}

// movePath renames a file or folder, keeping the index in step.
// Caller must hold storeMu.
func movePath(projectID int64, from, to string, isDir bool) error {
	fromAbs, err := absFor(projectID, from)
	if err != nil {
		return err
	}
	toAbs, err := absFor(projectID, to)
	if err != nil {
		return err
	}
	if _, err := os.Stat(toAbs); err == nil {
		return errors.New("a file or folder already exists there")
	}
	if err := os.MkdirAll(filepath.Dir(toAbs), 0o755); err != nil {
		return err
	}
	if err := os.Rename(fromAbs, toAbs); err != nil {
		return err
	}
	if isDir {
		// SQLite has no regex; rebuild each descendant path by trimming the old
		// prefix and prepending the new one.
		_, err = db.Exec(`UPDATE files SET path = ? || substr(path, ?)
		                  WHERE project_id=? AND path LIKE ?`,
			to, len(from)+1, projectID, from+"/%")
		return err
	}
	_, err = db.Exec(`UPDATE files SET path=? WHERE project_id=? AND path=?`, to, projectID, from)
	return err
}

/* ---------------------------------------------------------------- zip */

// zipProject streams the whole project to w as a zip archive.
func zipProject(p *Project, w io.Writer) error {
	zw := zip.NewWriter(w)
	rows, err := db.Query(`SELECT path FROM files WHERE project_id=? ORDER BY path`, p.ID)
	if err != nil {
		return err
	}
	defer rows.Close()

	var paths []string
	for rows.Next() {
		var rel string
		if err := rows.Scan(&rel); err != nil {
			return err
		}
		paths = append(paths, rel)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	for _, rel := range paths {
		abs, err := absFor(p.ID, rel)
		if err != nil {
			continue
		}
		f, err := os.Open(abs)
		if err != nil {
			// The index can outlive a file that vanished underneath us; skip it
			// rather than aborting an otherwise good download.
			continue
		}
		hdr := &zip.FileHeader{Name: rel, Method: zip.Deflate, Modified: time.Now()}
		dst, err := zw.CreateHeader(hdr)
		if err != nil {
			f.Close()
			return err
		}
		_, err = io.Copy(dst, f)
		f.Close()
		if err != nil {
			return err
		}
	}
	return zw.Close()
}

// unzipInto extracts an archive into the project under prefix, honouring the
// quota as it goes. Returns the number of files written.
// Caller must hold storeMu.
func unzipInto(p *Project, zr *zip.Reader, prefix string, userID int64) (int, error) {
	// Reject up front if the declared contents can't possibly fit, so a huge
	// archive fails fast instead of after writing half of it.
	var declared int64
	for _, zf := range zr.File {
		if !zf.FileInfo().IsDir() {
			declared += int64(zf.UncompressedSize64)
		}
	}
	if declared > remaining(p.ID, p.QuotaBytes) {
		return 0, errQuota
	}

	count := 0
	for _, zf := range zr.File {
		if zf.FileInfo().IsDir() {
			continue
		}
		name := zf.Name
		if prefix != "" {
			name = prefix + "/" + name
		}
		rel, err := cleanRelPath(name)
		if err != nil {
			// A traversal entry ("../../etc/passwd") is skipped, not fatal —
			// otherwise one hostile entry blocks an otherwise fine addon zip.
			continue
		}
		rc, err := zf.Open()
		if err != nil {
			return count, err
		}
		_, err = writeFile(p, rel, rc, userID)
		rc.Close()
		if err != nil {
			return count, err
		}
		count++
	}
	return count, nil
}

/* --------------------------------------------------------- reindexing */

// reindex rebuilds the file index from what is actually on disk. Used after a
// restore, or to heal the index if it ever drifts from the filesystem.
// Caller must hold storeMu.
func reindex(projectID int64) error {
	dir := projectDir(projectID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM files WHERE project_id=?`, projectID); err != nil {
		return err
	}
	now := time.Now().Unix()
	err = filepath.Walk(dir, func(p string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return err
		}
		rel, rerr := filepath.Rel(dir, p)
		if rerr != nil {
			return nil
		}
		rel = filepath.ToSlash(rel)
		if strings.HasPrefix(filepath.Base(p), ".upload-") {
			os.Remove(p) // leftover from an interrupted upload
			return nil
		}
		mt := info.ModTime().Unix()
		if mt <= 0 {
			mt = now
		}
		_, e := tx.Exec(`INSERT OR REPLACE INTO files(project_id,path,size,updated_at)
		                 VALUES(?,?,?,?)`, projectID, rel, info.Size(), mt)
		return e
	})
	if err != nil {
		return err
	}
	return tx.Commit()
}
