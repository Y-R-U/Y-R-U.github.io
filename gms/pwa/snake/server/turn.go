package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Public STUN is always offered. It is enough for most pairs on different
// networks; TURN is what rescues the rest (same Wi-Fi without hairpinning,
// strict mobile NATs). Cloudflare's TURN is anycast, so Australians relay
// through Sydney rather than through this US box.
var stunOnly = json.RawMessage(`[{"urls":["stun:stun.cloudflare.com:3478","stun:stun.l.google.com:19302"]}]`)

// Short-lived and shared: TURN usage is billed past the free tier, and these
// credentials work for anyone holding them, so they only ever go to players
// who are in a room with somebody else (see hub.broadcastMembers).
const (
	turnTTL     = 4 * time.Hour
	turnRefresh = 2 * time.Hour
)

type turn struct {
	keyID, token string
	cap          *turnCap
	api          string
	http         *http.Client

	mu     sync.Mutex
	cached json.RawMessage
	until  time.Time
	failAt time.Time
}

func newTurn(keyID, token string) *turn {
	return &turn{
		keyID: keyID, token: token,
		api:  "https://rtc.live.cloudflare.com/v1/turn/keys/",
		http: &http.Client{Timeout: 4 * time.Second},
	}
}

func (t *turn) configured() bool { return t.keyID != "" && t.token != "" }

// usable: configured, and the spending cap says yes.
func (t *turn) usable() bool { return t.configured() && t.cap.allowed() }

// iceServers returns the RTCIceServer list for a new client. Credentials are
// shared for a few hours rather than minted per connection: there is nothing
// to revoke per player, and it keeps Cloudflare API calls to a trickle.
func (t *turn) iceServers() json.RawMessage {
	if !t.usable() {
		return stunOnly
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	now := time.Now()
	if t.cached != nil && now.Before(t.until) {
		return t.cached
	}
	if now.Sub(t.failAt) < time.Minute {
		return t.fallback()
	}
	servers, err := t.fetch()
	if err != nil {
		log.Printf("turn: %v", err)
		t.failAt = now
		return t.fallback()
	}
	t.cached, t.until = servers, now.Add(turnRefresh)
	return servers
}

// A stale credential is better than none while Cloudflare is unreachable.
func (t *turn) fallback() json.RawMessage {
	if t.cached != nil {
		return t.cached
	}
	return stunOnly
}

type iceServer struct {
	URLs       any    `json:"urls"`
	Username   string `json:"username,omitempty"`
	Credential string `json:"credential,omitempty"`
}

func (t *turn) fetch() (json.RawMessage, error) {
	body := fmt.Sprintf(`{"ttl":%d}`, int(turnTTL.Seconds()))
	req, err := http.NewRequest("POST", t.api+t.keyID+"/credentials/generate-ice-servers", bytes.NewBufferString(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+t.token)
	req.Header.Set("Content-Type", "application/json")
	res, err := t.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode/100 != 2 {
		return nil, fmt.Errorf("cloudflare answered %s", res.Status)
	}
	var out struct {
		ICEServers []iceServer `json:"iceServers"`
	}
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		return nil, err
	}
	for i := range out.ICEServers {
		out.ICEServers[i].URLs = dropPort53(out.ICEServers[i].URLs)
	}
	if len(out.ICEServers) == 0 {
		return nil, fmt.Errorf("no ice servers in reply")
	}
	return json.Marshal(out.ICEServers)
}

// Browsers refuse port 53, and offering it only slows ICE down.
func dropPort53(urls any) any {
	list, ok := urls.([]any)
	if !ok {
		return urls
	}
	keep := []any{}
	for _, u := range list {
		if s, ok := u.(string); ok && (strings.HasSuffix(s, ":53") || strings.Contains(s, ":53?")) {
			continue
		}
		keep = append(keep, u)
	}
	return keep
}
