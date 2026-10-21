package main

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"sync"
	"time"
)

// Copied from RAGDOJO. TURN credentials come from snakenet's loopback /ice (gms/pwa/snake/SHARED_TURN.md). They are
// cached for at most refreshSeconds and only ever sent to players who have just been matched.
var stunOnly = json.RawMessage(`[{"urls":["stun:stun.cloudflare.com:3478"]}]`)

type iceSource struct {
	url  string
	http *http.Client
	now  func() time.Time

	mu      sync.Mutex
	servers json.RawMessage
	turn    bool
	until   time.Time
	busy    bool
}

func newIceSource(url string) *iceSource {
	return &iceSource{url: url, http: &http.Client{Timeout: 3 * time.Second}, now: time.Now, servers: stunOnly}
}

// lanIce: on a home network peers connect over host candidates; no STUN, no TURN.
func lanIce() *iceSource {
	return &iceSource{now: time.Now, servers: json.RawMessage(`[]`)}
}

// get never blocks the hub: a stale cache answers immediately and a refresh runs behind it.
func (s *iceSource) get() (json.RawMessage, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.url != "" && !s.busy && s.now().After(s.until) {
		s.busy = true
		go s.refresh()
	}
	return s.servers, s.turn
}

func (s *iceSource) refresh() {
	servers, turn, ttl := stunOnly, false, time.Minute
	defer func() {
		s.mu.Lock()
		s.servers, s.turn, s.until, s.busy = servers, turn, s.now().Add(ttl), false
		s.mu.Unlock()
	}()
	res, err := s.http.Get(s.url)
	if err != nil {
		log.Printf("ice: %s unreachable, STUN only", s.url)
		return
	}
	defer res.Body.Close()
	var body struct {
		IceServers json.RawMessage `json:"iceServers"`
		Turn       bool            `json:"turn"`
		Refresh    int             `json:"refreshSeconds"`
	}
	if res.StatusCode != 200 || json.NewDecoder(io.LimitReader(res.Body, 64<<10)).Decode(&body) != nil || len(body.IceServers) < 2 {
		log.Printf("ice: bad answer from %s, STUN only", s.url)
		return
	}
	servers, turn = body.IceServers, body.Turn
	ttl = time.Duration(body.Refresh) * time.Second
	if ttl <= 0 || ttl > time.Hour {
		ttl = time.Hour
	}
}

// prime fetches once synchronously at start-up so the first match already has TURN.
func (s *iceSource) prime() {
	if s.url == "" {
		return
	}
	s.mu.Lock()
	s.busy = true
	s.mu.Unlock()
	s.refresh()
}
