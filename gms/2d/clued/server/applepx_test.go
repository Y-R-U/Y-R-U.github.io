package main

import (
	"bytes"
	"context"
	"crypto/tls"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

const pxPrev = "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/b1/13/b5/x/mzaf_1.plus.aac.p.m4a"

type fakeApple struct {
	hits  atomic.Int64
	paths []string
	srv   *httptest.Server
}

// pxFake points the proxy's upstream client at a local TLS server for every host.
func pxFake(t *testing.T, h http.HandlerFunc) *fakeApple {
	t.Helper()
	f := &fakeApple{}
	f.srv = httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.hits.Add(1)
		f.paths = append(f.paths, r.Host+r.URL.RequestURI())
		h(w, r)
	}))
	addr := f.srv.Listener.Addr().String()
	oldT, oldDir := pxClient.Transport, pxDir
	dir := t.TempDir()
	pxClient.Transport = &http.Transport{
		DialContext: func(ctx context.Context, n, _ string) (net.Conn, error) {
			return (&net.Dialer{}).DialContext(ctx, n, addr)
		},
		TLSClientConfig:       &tls.Config{InsecureSkipVerify: true},
		ResponseHeaderTimeout: 2 * time.Second,
	}
	pxDir = func() string { return dir }
	pxMu.Lock()
	pxTotal = -1
	pxMu.Unlock()
	pxJSONMu.Lock()
	pxJSON, pxJSONSz = map[string]pxJSONEntry{}, 0
	pxJSONMu.Unlock()
	resetLimits()
	t.Cleanup(func() { f.srv.Close(); pxClient.Transport = oldT; pxDir = oldDir; resetLimits() })
	return f
}

func m4a(n int) []byte { return bytes.Repeat([]byte{7}, n) }

func pxGet(t *testing.T, u string, hdr ...string) (*http.Response, []byte) {
	t.Helper()
	req, _ := http.NewRequest("GET", ts.URL+"/gms/2d/clued/api/preview?u="+url.QueryEscape(u), nil)
	for i := 0; i+1 < len(hdr); i += 2 {
		req.Header.Set(hdr[i], hdr[i+1])
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, nil
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	return res, b
}

func TestPreviewAllowlist(t *testing.T) {
	f := pxFake(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "audio/x-m4p")
		w.Write(m4a(10))
	})
	bad := []string{
		"",
		"http://audio-ssl.itunes.apple.com/itunes-assets/a/b.m4a",
		"https://audio-ssl.itunes.apple.com/other/a/b.m4a",
		"https://audio-ssl.itunes.apple.com/itunes-assets/a/b.mp3",
		"https://audio-ssl.itunes.apple.com/itunes-assets/../etc/passwd.m4a",
		"https://audio-ssl.itunes.apple.com/itunes-assets/a/%2e%2e/b.m4a",
		"https://audio-ssl.itunes.apple.com:8443/itunes-assets/a/b.m4a",
		"https://user@audio-ssl.itunes.apple.com/itunes-assets/a/b.m4a",
		"https://audio-ssl.itunes.apple.com/itunes-assets/a/b.m4a?x=1",
		"https://audio-ssl.itunes.apple.com.evil.com/itunes-assets/a/b.m4a",
		"https://evil.com/itunes-assets/a/b.m4a",
		"https://169.254.169.254/itunes-assets/a/b.m4a",
		"https://localhost/itunes-assets/a/b.m4a",
		"https://is1-ssl.mzstatic.com/other/x.jpg",
		"https://is9-ssl.mzstatic.com/image/thumb/x.jpg",
		"https://is1-ssl.mzstatic.com/image/thumb/x.m4a",
		"https://is1.mzstatic.com/image/thumb/x.jpg",
		"https://itunes.apple.com/lookup",
		"https://www.google.com/",
		"file:///etc/passwd",
		"gopher://audio-ssl.itunes.apple.com/itunes-assets/a.m4a",
	}
	for _, u := range bad {
		res, _ := pxGet(t, u)
		if res == nil || res.StatusCode != 403 {
			t.Errorf("%q: want 403, got %v", u, res)
		}
	}
	if f.hits.Load() != 0 {
		t.Fatalf("a rejected URL reached upstream %d times: %v", f.hits.Load(), f.paths)
	}
	for _, u := range []string{pxPrev, "https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/72/a.rgb.jpg/300x300bb.jpg", "https://is5-ssl.mzstatic.com/image/thumb/M/x.png/100x100bb.png"} {
		if res, _ := pxGet(t, u); res == nil || res.StatusCode != 200 {
			t.Errorf("%s: want 200, got %v", u, res)
		}
	}
	// redirects to a non-allowlisted host are refused (no open proxy via a 30x)
	pxFake(t, func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "https://evil.com/x.m4a", http.StatusFound)
	})
	if res, _ := pxGet(t, pxPrev); res == nil || res.StatusCode != 502 {
		t.Fatalf("redirect off the allowlist: want 502, got %v", res)
	}
}

func TestPreviewCacheHitMiss(t *testing.T) {
	body := m4a(50000)
	f := pxFake(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "audio/x-m4p")
		w.Write(body)
	})
	res, b := pxGet(t, pxPrev, "Origin", "https://y-r-u.github.io")
	if res.StatusCode != 200 || !bytes.Equal(b, body) || res.Header.Get("X-Clued-Cache") != "miss" {
		t.Fatalf("miss: %d %d %q", res.StatusCode, len(b), res.Header.Get("X-Clued-Cache"))
	}
	if res.Header.Get("Content-Type") != "audio/mp4" || !strings.Contains(res.Header.Get("Cache-Control"), "max-age=") ||
		res.Header.Get("Access-Control-Allow-Origin") != "https://y-r-u.github.io" {
		t.Fatalf("headers: %v", res.Header)
	}
	res, b = pxGet(t, pxPrev)
	if res.StatusCode != 200 || !bytes.Equal(b, body) || res.Header.Get("X-Clued-Cache") != "hit" || f.hits.Load() != 1 {
		t.Fatalf("hit: %d %q upstream=%d", res.StatusCode, res.Header.Get("X-Clued-Cache"), f.hits.Load())
	}
	res, b = pxGet(t, pxPrev, "Range", "bytes=0-1023")
	if res.StatusCode != 206 || len(b) != 1024 {
		t.Fatalf("range on hit: %d %d", res.StatusCode, len(b))
	}
	// range on a miss fills the cache first
	other := strings.Replace(pxPrev, "mzaf_1", "mzaf_2", 1)
	res, b = pxGet(t, other, "Range", "bytes=10-19")
	if res.StatusCode != 206 || len(b) != 10 || f.hits.Load() != 2 {
		t.Fatalf("range on miss: %d %d", res.StatusCode, len(b))
	}
	// image
	img := "https://is1-ssl.mzstatic.com/image/thumb/M/a.jpg/300x300bb.jpg"
	pxFake(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/jpeg")
		w.Write([]byte("jpg"))
	})
	if res, _ := pxGet(t, img); res.StatusCode != 200 || res.Header.Get("Content-Type") != "image/jpeg" {
		t.Fatalf("image: %d %q", res.StatusCode, res.Header.Get("Content-Type"))
	}
	// upstream 404 → 404, not cached; HTML error pages are not passed through
	pxFake(t, func(w http.ResponseWriter, r *http.Request) { http.NotFound(w, r) })
	if res, _ := pxGet(t, pxPrev+"x.m4a"); res == nil || res.StatusCode != 404 {
		t.Fatalf("upstream 404: %v", res)
	}
	pxFake(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte("<html>"))
	})
	if res, _ := pxGet(t, pxPrev); res == nil || res.StatusCode != 502 {
		t.Fatalf("html upstream: %v", res)
	}
}

func TestPreviewLRU(t *testing.T) {
	pxFake(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "audio/mp4")
		w.Write(m4a(1000))
	})
	old := pxCacheMax
	pxCacheMax = 3500
	defer func() { pxCacheMax = old }()
	u := func(i int) string { return strings.Replace(pxPrev, "mzaf_1", "mzaf_"+string(rune('a'+i)), 1) }
	for i := 0; i < 3; i++ {
		pxGet(t, u(i))
		past := time.Now().Add(time.Duration(i-10) * time.Minute)
		os.Chtimes(pxFile(u(i)), past, past)
	}
	pxGet(t, u(0)) // touch: 0 is now the newest
	pxGet(t, u(3)) // 4 KB > 3.5 KB → evict oldest (1) down to ≤ 3150
	ents, _ := filepath.Glob(filepath.Join(pxDir(), "*.m4a"))
	if len(ents) != 3 {
		t.Fatalf("want 3 files after eviction, got %d", len(ents))
	}
	if _, err := os.Stat(pxFile(u(1))); err == nil {
		t.Fatal("least recently used file survived")
	}
	if _, err := os.Stat(pxFile(u(0))); err != nil {
		t.Fatal("recently touched file was evicted")
	}
}

func TestPreviewSizeCap(t *testing.T) {
	old := pxMaxBody
	pxMaxBody = 4096
	defer func() { pxMaxBody = old }()
	pxFake(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "audio/mp4")
		w.Header().Set("Content-Length", "5000")
		w.Write(m4a(5000))
	})
	if res, _ := pxGet(t, pxPrev); res == nil || res.StatusCode != 502 {
		t.Fatalf("declared too large: want 502, got %v", res)
	}
	// no Content-Length: streamed, then cut off past the cap and never cached
	pxFake(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "audio/mp4")
		for i := 0; i < 5; i++ {
			w.Write(m4a(1000))
			w.(http.Flusher).Flush()
		}
	})
	res, b := pxGet(t, pxPrev)
	if res != nil && len(b) > 4096 {
		t.Fatalf("streamed %d bytes past the cap", len(b))
	}
	if _, err := os.Stat(pxFile(pxPrev)); err == nil {
		t.Fatal("over-cap file was cached")
	}
	if ents, _ := os.ReadDir(pxDir()); len(ents) != 0 {
		t.Fatalf("temp files left: %d", len(ents))
	}
}

func TestPreviewRateLimit(t *testing.T) {
	pxFake(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "audio/mp4")
		w.Write(m4a(10))
	})
	ok, limited := 0, 0
	for i := 0; i < limits["preview"].max+10; i++ {
		res, _ := pxGet(t, pxPrev)
		switch res.StatusCode {
		case 200:
			ok++
		case 429:
			limited++
		}
	}
	if ok != limits["preview"].max || limited != 10 {
		t.Fatalf("preview limit: ok=%d limited=%d", ok, limited)
	}
	pxFake(t, func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(`{"resultCount":0}`)) })
	ok, limited = 0, 0
	for i := 0; i < limits["itunes"].max+5; i++ {
		switch call(t, "GET", "/itunes?path=lookup&id=1", nil).code {
		case 200:
			ok++
		case 429:
			limited++
		}
	}
	if ok != limits["itunes"].max || limited != 5 {
		t.Fatalf("itunes limit: ok=%d limited=%d", ok, limited)
	}
}

func TestPreviewTimeout(t *testing.T) {
	old := pxTimeout
	pxTimeout = 1500 * time.Millisecond
	defer func() { pxTimeout = old }()
	release := make(chan struct{})
	pxFake(t, func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-release:
		case <-r.Context().Done():
		}
	})
	defer close(release)
	t0 := time.Now()
	res, _ := pxGet(t, pxPrev)
	if res == nil || res.StatusCode != 502 || time.Since(t0) > 4*time.Second {
		t.Fatalf("hung upstream: %v after %v", res, time.Since(t0))
	}
	// a stalled body after the headers is also cut off by the overall timeout
	pxFake(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "audio/mp4")
		w.Header().Set("Content-Length", "2000")
		w.Write(m4a(100))
		w.(http.Flusher).Flush()
		<-r.Context().Done()
	})
	t0 = time.Now()
	res, b := pxGet(t, pxPrev)
	if time.Since(t0) > 4*time.Second || (res != nil && len(b) == 2000) {
		t.Fatalf("stalled body: %d bytes after %v", len(b), time.Since(t0))
	}
	if _, err := os.Stat(pxFile(pxPrev)); err == nil {
		t.Fatal("partial file was cached")
	}
}

func TestItunesProxy(t *testing.T) {
	f := pxFake(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
		w.Write([]byte(`{"resultCount":1,"results":[{"trackId":1}]}`))
	})
	r := call(t, "GET", "/itunes?path=lookup&id=1440833098,12&country=us&entity=song", nil)
	if r.code != 200 || r.body["resultCount"] != float64(1) || r.hdr.Get("Content-Type") != "application/json; charset=utf-8" {
		t.Fatalf("lookup: %d %v", r.code, r.body)
	}
	if got := f.paths[0]; got != "itunes.apple.com/lookup?country=US&entity=song&id=1440833098%2C12" {
		t.Fatalf("upstream url %q", got)
	}
	r = call(t, "GET", "/itunes?path=lookup&id=1440833098,12&country=us&entity=song", nil)
	if r.code != 200 || r.hdr.Get("X-Clued-Cache") != "hit" || f.hits.Load() != 1 {
		t.Fatalf("lookup cache: %q hits=%d", r.hdr.Get("X-Clued-Cache"), f.hits.Load())
	}
	r = call(t, "GET", "/itunes?path=search&media=music&entity=song&limit=10&country=US&term="+url.QueryEscape("Queen Bohemian Rhapsody"), nil)
	if r.code != 200 || !strings.HasPrefix(f.paths[1], "itunes.apple.com/search?") || !strings.Contains(f.paths[1], "term=Queen+Bohemian+Rhapsody") {
		t.Fatalf("search: %d %v", r.code, f.paths)
	}
	for _, q := range []string{
		"path=lookup", "path=lookup&id=abc", "path=lookup&id=1&callback=x", "path=lookup&id=1&url=https://evil.com",
		"path=search", "path=search&term=x&media=movie", "path=search&term=x&limit=500", "path=search&term=x&entity=album",
		"path=../evil&id=1", "path=https://evil.com&id=1", "path=lookup&id=1&country=usa", "id=1",
		"path=search&term=" + strings.Repeat("a", 201),
	} {
		if r := call(t, "GET", "/itunes?"+q, nil); r.code != 403 {
			t.Errorf("%s: want 403, got %d", q, r.code)
		}
	}
	if f.hits.Load() != 2 {
		t.Fatalf("a rejected query reached upstream (%d)", f.hits.Load())
	}
	pxFake(t, func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("<html>nope")) })
	if r := call(t, "GET", "/itunes?path=lookup&id=5", nil); r.code != 502 {
		t.Fatalf("non-JSON upstream: %d", r.code)
	}
}
