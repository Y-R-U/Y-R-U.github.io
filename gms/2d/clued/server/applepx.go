package main

// Apple proxy for clients whose network blocks or blackholes Apple hosts (docs/notes/APPLEPROXY.md).
// Not an open proxy: previews and artwork must match a strict host/path/extension allowlist, and the
// iTunes JSON URL is rebuilt server-side from a few validated params.

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

func init() {
	limits["preview"] = bucket{300, time.Minute}
	limits["itunes"] = bucket{60, time.Minute}
}

func registerAppleProxy(api *http.ServeMux) {
	api.HandleFunc("GET /api/preview", handlePreview)
	api.HandleFunc("HEAD /api/preview", handlePreview)
	api.HandleFunc("GET /api/itunes", handleItunes)
}

var (
	pxMaxBody    int64 = 2 << 20
	pxMaxJSON    int64 = 1 << 20
	pxCacheMax   int64 = 200 << 20
	pxTimeout          = 20 * time.Second
	pxSlots            = make(chan struct{}, 6) // concurrent upstream fetches
	pxDir              = func() string { return filepath.Join(cfg.Data, "previews") }
	pxItunesBase       = "https://itunes.apple.com"
)

var pxClient = &http.Client{
	Transport: &http.Transport{
		Proxy:                 nil,
		DialContext:           (&net.Dialer{Timeout: 5 * time.Second}).DialContext,
		TLSHandshakeTimeout:   5 * time.Second,
		ResponseHeaderTimeout: 8 * time.Second,
		MaxIdleConnsPerHost:   4,
		IdleConnTimeout:       60 * time.Second,
		ForceAttemptHTTP2:     true,
	},
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 3 {
			return errors.New("too many redirects")
		}
		if req.URL.Host == "itunes.apple.com" && req.URL.Scheme == "https" {
			return nil
		}
		if _, _, err := pxCheck(req.URL.String()); err != nil {
			return err
		}
		return nil
	},
}

var pxTypes = map[string]string{".m4a": "audio/mp4", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}

var pxSafePath = regexp.MustCompile(`^[A-Za-z0-9/._+-]+$`)

// pxCheck returns the canonical URL and the content type to serve, or an error if not allowlisted.
func pxCheck(raw string) (string, string, error) {
	bad := errors.New("not allowed")
	if raw == "" || len(raw) > 600 {
		return "", "", bad
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.User != nil || u.Port() != "" || u.RawQuery != "" || u.Fragment != "" || u.Opaque != "" {
		return "", "", bad
	}
	host := strings.ToLower(u.Hostname())
	p := u.EscapedPath()
	if !pxSafePath.MatchString(p) || path.Clean(p) != p || strings.Contains(p, "..") {
		return "", "", bad
	}
	ext := strings.ToLower(path.Ext(p))
	switch {
	case host == "audio-ssl.itunes.apple.com" && strings.HasPrefix(p, "/itunes-assets/") && ext == ".m4a":
	case pxArtHost(host) && strings.HasPrefix(p, "/image/thumb/") && ext != ".m4a" && pxTypes[ext] != "":
	default:
		return "", "", bad
	}
	return "https://" + host + p, pxTypes[ext], nil
}

func pxArtHost(h string) bool {
	if !strings.HasSuffix(h, "-ssl.mzstatic.com") {
		return false
	}
	n := strings.TrimSuffix(strings.TrimPrefix(h, "is"), "-ssl.mzstatic.com")
	return len(n) == 1 && n[0] >= '1' && n[0] <= '5'
}

func pxOKType(ct string) bool {
	ct = strings.ToLower(ct)
	return strings.HasPrefix(ct, "audio/") || strings.HasPrefix(ct, "image/") || strings.HasPrefix(ct, "video/mp4") || strings.HasPrefix(ct, "application/octet-stream")
}

/* ------------------------------------------------------------------ disk LRU */

var (
	pxMu    sync.Mutex
	pxTotal int64 = -1
)

func pxFile(u string) string {
	s := sha256.Sum256([]byte(u))
	return filepath.Join(pxDir(), hex.EncodeToString(s[:16])+path.Ext(u))
}

// pxScan recomputes the cache size and drops stale temp files. Caller holds pxMu.
func pxScan() []os.FileInfo {
	ents, _ := os.ReadDir(pxDir())
	var out []os.FileInfo
	pxTotal = 0
	for _, e := range ents {
		fi, err := e.Info()
		if err != nil || !fi.Mode().IsRegular() {
			continue
		}
		if strings.HasPrefix(fi.Name(), ".tmp-") {
			if time.Since(fi.ModTime()) > 2*time.Minute {
				os.Remove(filepath.Join(pxDir(), fi.Name()))
			}
			continue
		}
		pxTotal += fi.Size()
		out = append(out, fi)
	}
	return out
}

// pxAdd records a new file and evicts least-recently-used files (mtime, touched on hit) down to 90% of the cap.
func pxAdd(n int64) {
	pxMu.Lock()
	defer pxMu.Unlock()
	if pxTotal < 0 {
		pxScan()
	} else {
		pxTotal += n
	}
	if pxTotal <= pxCacheMax {
		return
	}
	files := pxScan()
	sort.Slice(files, func(i, j int) bool { return files[i].ModTime().Before(files[j].ModTime()) })
	for _, fi := range files {
		if pxTotal <= pxCacheMax*9/10 {
			break
		}
		if os.Remove(filepath.Join(pxDir(), fi.Name())) == nil {
			pxTotal -= fi.Size()
		}
	}
}

func pxTemp() (*os.File, error) {
	if err := os.MkdirAll(pxDir(), 0o700); err != nil {
		return nil, err
	}
	b := make([]byte, 8)
	rand.Read(b)
	return os.OpenFile(filepath.Join(pxDir(), ".tmp-"+hex.EncodeToString(b)), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
}

// softWriter never fails the stream to the browser because the cache copy failed.
type softWriter struct {
	f   *os.File
	err error
}

func (s *softWriter) Write(p []byte) (int, error) {
	if s.err == nil {
		_, s.err = s.f.Write(p)
	}
	return len(p), nil
}

/* ------------------------------------------------------------------ handlers */

func pxAcquire(ctx context.Context) bool {
	select {
	case pxSlots <- struct{}{}:
		return true
	case <-ctx.Done():
		return false
	case <-time.After(10 * time.Second):
		return false
	}
}

func pxRelease() { <-pxSlots }

func handlePreview(w http.ResponseWriter, r *http.Request) {
	if !allow(r, "preview") {
		rateLimited(w)
		return
	}
	u, ct, err := pxCheck(r.URL.Query().Get("u"))
	if err != nil {
		writeErr(w, http.StatusForbidden, "forbidden", "url not allowed")
		return
	}
	file := pxFile(u)
	h := w.Header()
	if pxServeFile(w, r, file, ct, "hit") {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), pxTimeout)
	defer cancel()
	if !pxAcquire(ctx) {
		writeErr(w, http.StatusServiceUnavailable, "busy", "proxy busy")
		return
	}
	defer pxRelease()
	if pxServeFile(w, r, file, ct, "hit") { // filled while we waited
		return
	}
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	req.Header.Set("User-Agent", "clued-proxy/1 (+https://games.br8t.com/gms/2d/clued/)")
	res, err := pxClient.Do(req)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "upstream", "upstream unreachable")
		return
	}
	defer res.Body.Close()
	switch {
	case res.StatusCode == 404 || res.StatusCode == 403 || res.StatusCode == 410:
		writeErr(w, http.StatusNotFound, "upstream_missing", "upstream has no such file")
		return
	case res.StatusCode != 200:
		writeErr(w, http.StatusBadGateway, "upstream", "upstream status "+strconv.Itoa(res.StatusCode))
		return
	case !pxOKType(res.Header.Get("Content-Type")):
		writeErr(w, http.StatusBadGateway, "upstream_type", "unexpected upstream type")
		return
	case res.ContentLength > pxMaxBody:
		writeErr(w, http.StatusBadGateway, "too_large", "upstream file too large")
		return
	}
	tmp, terr := pxTemp()
	// Range or HEAD on a miss: fill the cache first, then serve the file (ServeContent does ranges).
	if r.Method == http.MethodHead || r.Header.Get("Range") != "" {
		if terr != nil {
			writeErr(w, http.StatusBadGateway, "cache", "cache unavailable")
			return
		}
		n, err := io.Copy(tmp, io.LimitReader(res.Body, pxMaxBody+1))
		tmp.Close()
		if err != nil || n > pxMaxBody || (res.ContentLength >= 0 && n != res.ContentLength) || os.Rename(tmp.Name(), file) != nil {
			os.Remove(tmp.Name())
			writeErr(w, http.StatusBadGateway, "upstream", "upstream body failed")
			return
		}
		pxAdd(n)
		pxServeFile(w, r, file, ct, "miss")
		return
	}
	h.Set("Content-Type", ct)
	h.Set("Cache-Control", "public, max-age=2592000")
	h.Set("X-Clued-Cache", "miss")
	h.Set("Access-Control-Expose-Headers", "X-Clued-Cache")
	if res.ContentLength >= 0 {
		h.Set("Content-Length", strconv.FormatInt(res.ContentLength, 10))
	}
	if lm := res.Header.Get("Last-Modified"); lm != "" {
		h.Set("Last-Modified", lm)
	}
	w.WriteHeader(200)
	var dst io.Writer = w
	sw := &softWriter{f: tmp, err: terr}
	if terr == nil {
		dst = io.MultiWriter(w, sw)
	}
	n, cerr := io.Copy(dst, io.LimitReader(res.Body, pxMaxBody+1))
	if terr != nil {
		return
	}
	tmp.Close()
	if cerr != nil || sw.err != nil || n > pxMaxBody || (res.ContentLength >= 0 && n != res.ContentLength) || os.Rename(tmp.Name(), file) != nil {
		os.Remove(tmp.Name())
		if n > pxMaxBody {
			panic(http.ErrAbortHandler) // cut the connection: the client must not take a truncated file as whole
		}
		return
	}
	pxAdd(n)
}

func pxServeFile(w http.ResponseWriter, r *http.Request, file, ct, tag string) bool {
	f, err := os.Open(file)
	if err != nil {
		return false
	}
	defer f.Close()
	fi, err := f.Stat()
	if err != nil {
		return false
	}
	now := time.Now()
	os.Chtimes(file, now, now) // LRU touch
	h := w.Header()
	h.Set("Content-Type", ct)
	h.Set("Cache-Control", "public, max-age=2592000")
	h.Set("X-Clued-Cache", tag)
	h.Set("Access-Control-Expose-Headers", "X-Clued-Cache")
	http.ServeContent(w, r, "", fi.ModTime(), f)
	return true
}

/* ------------------------------------------------------------------ iTunes JSON */

var (
	pxDigits  = regexp.MustCompile(`^[0-9]{1,15}(,[0-9]{1,15})*$`)
	pxCountry = regexp.MustCompile(`^[A-Za-z]{2}$`)
	pxJSONMu  sync.Mutex
	pxJSON    = map[string]pxJSONEntry{}
	pxJSONSz  int
)

type pxJSONEntry struct {
	body []byte
	exp  time.Time
}

const pxJSONCap = 4 << 20

// pxItunesURL rebuilds the upstream URL from allowlisted params only.
func pxItunesURL(q url.Values) (string, bool) {
	out := url.Values{}
	for k := range q {
		switch k {
		case "path", "id", "term", "country", "entity", "media", "limit", "_":
		default:
			return "", false
		}
	}
	if c := q.Get("country"); c != "" {
		if !pxCountry.MatchString(c) {
			return "", false
		}
		out.Set("country", strings.ToUpper(c))
	}
	if e := q.Get("entity"); e != "" {
		if e != "song" && e != "musicTrack" {
			return "", false
		}
		out.Set("entity", e)
	}
	if l := q.Get("limit"); l != "" {
		n, err := strconv.Atoi(l)
		if err != nil || n < 1 || n > 50 {
			return "", false
		}
		out.Set("limit", strconv.Itoa(n))
	}
	switch q.Get("path") {
	case "lookup":
		if !pxDigits.MatchString(q.Get("id")) || strings.Count(q.Get("id"), ",") >= 150 || q.Has("term") || q.Has("media") {
			return "", false
		}
		out.Set("id", q.Get("id"))
		return pxItunesBase + "/lookup?" + out.Encode(), true
	case "search":
		t := strings.TrimSpace(q.Get("term"))
		if t == "" || len(t) > 200 || q.Has("id") {
			return "", false
		}
		if m := q.Get("media"); m != "" && m != "music" {
			return "", false
		}
		out.Set("media", "music")
		out.Set("term", t)
		return pxItunesBase + "/search?" + out.Encode(), true
	}
	return "", false
}

func handleItunes(w http.ResponseWriter, r *http.Request) {
	if !allow(r, "itunes") {
		rateLimited(w)
		return
	}
	u, ok := pxItunesURL(r.URL.Query())
	if !ok {
		writeErr(w, http.StatusForbidden, "forbidden", "query not allowed")
		return
	}
	pxJSONMu.Lock()
	e, hit := pxJSON[u]
	pxJSONMu.Unlock()
	if hit && time.Now().Before(e.exp) {
		pxWriteJSON(w, e.body, "hit")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
	defer cancel()
	if !pxAcquire(ctx) {
		writeErr(w, http.StatusServiceUnavailable, "busy", "proxy busy")
		return
	}
	defer pxRelease()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	req.Header.Set("User-Agent", "clued-proxy/1 (+https://games.br8t.com/gms/2d/clued/)")
	res, err := pxClient.Do(req)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "upstream", "upstream unreachable")
		return
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		writeErr(w, http.StatusBadGateway, "upstream", "upstream status "+strconv.Itoa(res.StatusCode))
		return
	}
	body, err := io.ReadAll(io.LimitReader(res.Body, pxMaxJSON+1))
	if err != nil || int64(len(body)) > pxMaxJSON {
		writeErr(w, http.StatusBadGateway, "too_large", "upstream body too large")
		return
	}
	if len(body) == 0 || (body[0] != '{' && body[0] != '\n' && body[0] != ' ' && body[0] != '\r') {
		writeErr(w, http.StatusBadGateway, "upstream_type", "upstream is not JSON")
		return
	}
	pxJSONMu.Lock()
	if old, ok := pxJSON[u]; ok {
		pxJSONSz -= len(old.body)
	}
	for k, v := range pxJSON { // tiny cache: drop expired, then anything, until it fits
		if pxJSONSz+len(body) <= pxJSONCap {
			break
		}
		if time.Now().After(v.exp) || pxJSONSz+len(body) > pxJSONCap {
			pxJSONSz -= len(v.body)
			delete(pxJSON, k)
		}
	}
	if len(body) <= pxJSONCap {
		pxJSON[u] = pxJSONEntry{body, time.Now().Add(6 * time.Hour)}
		pxJSONSz += len(body)
	}
	pxJSONMu.Unlock()
	pxWriteJSON(w, body, "miss")
}

func pxWriteJSON(w http.ResponseWriter, body []byte, tag string) {
	h := w.Header()
	h.Set("Content-Type", "application/json; charset=utf-8")
	h.Set("Cache-Control", "public, max-age=3600")
	h.Set("X-Clued-Cache", tag)
	h.Set("Access-Control-Expose-Headers", "X-Clued-Cache")
	h.Set("Content-Length", strconv.Itoa(len(body)))
	w.WriteHeader(200)
	w.Write(body)
}
