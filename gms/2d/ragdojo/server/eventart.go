package main

// Event art. The full pictures never reach the public site: Aaron's approved art sits on this
// server (ARENA_EVENT_ART) and a player is sent the square under each tile THEY have opened —
// checked against their own stored state — and the whole picture only once all 25 are open.

import (
	"bytes"
	"encoding/json"
	"image"
	"image/jpeg"
	_ "image/png"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"sync"
	"time"
)

type artPic struct {
	mtime time.Time
	img   image.Image
	tiles [cells][]byte
	full  []byte
}

type artBook struct {
	mu   sync.Mutex
	dir  string
	pics map[string]*artPic
}

var (
	evArt      = &artBook{}
	reArtSlug  = regexp.MustCompile(`[^A-Za-z0-9-]+`)
	artLimitMu sync.Mutex
	artLimit   = map[string][]time.Time{}
)

// artDir: ARENA_EVENT_ART, else the review tool's folder next to the answers (LAN), else
// event_art next to the answers (the box: deploy.sh copies it there).
func artDir() string {
	if d := os.Getenv("ARENA_EVENT_ART"); d != "" {
		return d
	}
	base := filepath.Dir(evAnswers.path)
	if st, err := os.Stat(filepath.Join(base, "approved")); err == nil && st.IsDir() {
		return filepath.Join(base, "approved")
	}
	return filepath.Join(base, "event_art")
}

// get: the event's picture, decoded once and re-read when the file changes. nil = no art.
func (a *artBook) get(ev string) *artPic {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.dir == "" {
		a.dir = artDir()
	}
	if a.pics == nil {
		a.pics = map[string]*artPic{}
	}
	f := filepath.Join(a.dir, reArtSlug.ReplaceAllString(ev, "-")+".jpg")
	st, err := os.Stat(f)
	if err != nil {
		delete(a.pics, ev)
		return nil
	}
	if p := a.pics[ev]; p != nil && p.mtime.Equal(st.ModTime()) {
		return p
	}
	r, err := os.Open(f)
	if err != nil {
		return nil
	}
	defer r.Close()
	img, _, err := image.Decode(r)
	if err != nil {
		return nil
	}
	p := &artPic{mtime: st.ModTime(), img: img}
	a.pics[ev] = p
	return p
}

// tileRect: the same integer cut the client draws with (ui.js cellRect).
func tileRect(b image.Rectangle, c int) image.Rectangle {
	w, h := b.Dx(), b.Dy()
	col, row := c%5, c/5
	return image.Rect(b.Min.X+col*w/5, b.Min.Y+row*h/5, b.Min.X+(col+1)*w/5, b.Min.Y+(row+1)*h/5)
}

func (a *artBook) tile(p *artPic, c int) []byte {
	a.mu.Lock()
	defer a.mu.Unlock()
	if p.tiles[c] == nil {
		sub := p.img.(interface {
			SubImage(image.Rectangle) image.Image
		}).SubImage(tileRect(p.img.Bounds(), c))
		var buf bytes.Buffer
		jpeg.Encode(&buf, sub, &jpeg.Options{Quality: 86})
		p.tiles[c] = buf.Bytes()
	}
	return p.tiles[c]
}

func (a *artBook) whole(p *artPic) []byte {
	a.mu.Lock()
	defer a.mu.Unlock()
	if p.full == nil {
		var buf bytes.Buffer
		jpeg.Encode(&buf, p.img, &jpeg.Options{Quality: 86})
		p.full = buf.Bytes()
	}
	return p.full
}

// artAllow: 120 art requests a minute per player — a full set of tiles is 25.
func (h *hub) artAllow(uid string) bool {
	artLimitMu.Lock()
	defer artLimitMu.Unlock()
	now := h.st.now()
	l := artLimit[uid][:0]
	for _, t := range artLimit[uid] {
		if now.Sub(t) < time.Minute {
			l = append(l, t)
		}
	}
	if len(l) >= 120 {
		artLimit[uid] = l
		return false
	}
	artLimit[uid] = append(l, now)
	if len(artLimit) > 20000 {
		artLimit = map[string][]time.Time{}
	}
	return true
}

// openCells: the squares this player has opened, as the server stored them.
func (s *store) openCells(uid, ev string) ([]int, error) {
	var raw string
	err := s.db.QueryRow(`SELECT open FROM ev_state WHERE uid=? AND event=?`, uid, ev).Scan(&raw)
	if err != nil {
		return nil, err
	}
	var open []int
	json.Unmarshal([]byte(raw), &open)
	return open, nil
}

// eventArtRoutes: GET /events/art/tile?event=&cell= and GET /events/art/full?event=.
func (h *hub) eventArtRoutes(mux *http.ServeMux, prefix string, origins []string) {
	for _, p := range []string{"/events/art/tile", "/events/art/full"} {
		mux.HandleFunc("OPTIONS "+prefix+p, func(w http.ResponseWriter, r *http.Request) { preflight(w, r, origins) })
	}
	serve := func(w http.ResponseWriter, r *http.Request, whole bool) {
		cors(w, r, origins)
		ev := r.URL.Query().Get("event")
		uid, _, ok := h.evAuth(w, r, ev)
		if !ok {
			return
		}
		def, _, _ := parseEventID(ev)
		cell := -1
		if !whole {
			c, err := strconv.Atoi(r.URL.Query().Get("cell"))
			if err != nil || c < 0 || c >= cells {
				reply(w, 400, map[string]string{"error": "bad cell"})
				return
			}
			cell = c
		}
		if def.Kind != "reveal" {
			reply(w, 400, map[string]string{"error": "not a picture event"})
			return
		}
		if !h.artAllow(uid) {
			reply(w, 429, map[string]string{"error": "slow down"})
			return
		}
		// The caller's own opened squares first: whether a picture exists (a future event's,
		// say) is not something anyone learns before they have opened it. One answer for both.
		open, err := h.st.openCells(uid, ev)
		if err != nil && err.Error() != "sql: no rows in result set" {
			reply(w, 503, map[string]string{"error": "unavailable"})
			return
		}
		p := evArt.get(ev)
		if (whole && len(open) < cells) || (!whole && !containsInt(open, cell)) || p == nil {
			reply(w, 403, map[string]string{"error": "not open"})
			return
		}
		var body []byte
		if whole {
			body = evArt.whole(p)
		} else {
			body = evArt.tile(p, cell)
		}
		w.Header().Set("Content-Type", "image/jpeg")
		w.Header().Set("Cache-Control", "private, no-store")
		w.WriteHeader(200)
		w.Write(body)
	}
	mux.HandleFunc("GET "+prefix+"/events/art/tile", func(w http.ResponseWriter, r *http.Request) { serve(w, r, false) })
	mux.HandleFunc("GET "+prefix+"/events/art/full", func(w http.ResponseWriter, r *http.Request) { serve(w, r, true) })
}
