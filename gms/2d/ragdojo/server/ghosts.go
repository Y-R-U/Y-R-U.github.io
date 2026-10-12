// Leaderboards, the player's own stats card, and ghosts (a player's loadout snapshot that
// others fight offline as an AI). Ghost fights never reach this server: there is no endpoint
// for their results, so they cannot count toward ranked stats or the free allowance.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

const ghostGap = 10 * time.Second // per player, between snapshot uploads

// Arena types with their own boards (js/net/modes.js ids). Wider than gameTypes, which is
// what the lobby accepts today: a board for a mode nobody has played is simply empty.
var boardTypes = map[string]bool{"duel": true, "lms": true, "bandana": true, "hill": true}

var (
	ghostMu    sync.Mutex
	ghostLast  = map[string]time.Time{}
	snapKey    = regexp.MustCompile(`^[a-zA-Z_]{1,16}$`)
	snapThemes = map[string]bool{"light": true, "dark": true, "cyborg": true, "god": true}
)

// ghostSnap is what a ghost needs to fight and nothing else (js/net/ghost.js ghostSnap).
type ghostSnap struct {
	V  int               `json:"v"`
	T  string            `json:"t"`
	CD int               `json:"cd"`
	P  map[string]int    `json:"p"`
	M  map[string][2]int `json:"m"`
}

func cleanSnap(raw json.RawMessage) ([]byte, error) {
	var g ghostSnap
	if err := json.Unmarshal(raw, &g); err != nil {
		return nil, err
	}
	if g.V != 1 || !snapThemes[g.T] || len(g.P) > 16 || len(g.M) > 12 {
		return nil, errors.New("bad snapshot")
	}
	clamp := func(v int) int { return min(max(v, 0), 30) }
	for k, v := range g.P {
		if !snapKey.MatchString(k) {
			return nil, errors.New("bad perk")
		}
		g.P[k] = clamp(v)
	}
	for k, v := range g.M {
		if !snapKey.MatchString(k) {
			return nil, errors.New("bad move")
		}
		g.M[k] = [2]int{clamp(v[0]), clamp(v[1])}
	}
	g.CD = min(max(g.CD, 0), 1)
	if g.P == nil {
		g.P = map[string]int{}
	}
	if g.M == nil {
		g.M = map[string][2]int{}
	}
	return json.Marshal(g)
}

// caller: the signed-in (or LAN device) uid behind an Authorization header, or "".
func (h *hub) caller(r *http.Request) string {
	tok, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !ok || tok == "" || len(tok) > 4096 {
		return ""
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	id, err := h.verify(ctx, tok)
	if err != nil || id.Anonymous {
		return ""
	}
	return id.UID
}

func preflight(w http.ResponseWriter, r *http.Request, origins []string) {
	cors(w, r, origins)
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST")
	w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
	w.Header().Set("Access-Control-Max-Age", "600")
	w.WriteHeader(204)
}

func (h *hub) boardRoutes(mux *http.ServeMux, prefix string, origins []string) {
	for _, p := range []string{"/leaderboard", "/ghosts", "/ghost", "/me"} {
		mux.HandleFunc("OPTIONS "+prefix+p, func(w http.ResponseWriter, r *http.Request) { preflight(w, r, origins) })
	}
	mux.HandleFunc("GET "+prefix+"/leaderboard", func(w http.ResponseWriter, r *http.Request) {
		cors(w, r, origins)
		q := r.URL.Query()
		typ := ""
		if q.Get("type") != "" {
			if typ = strings.ToLower(q.Get("type")); !boardTypes[typ] {
				reply(w, 404, map[string]string{"error": "no such mode"})
				return
			}
		}
		n, _ := strconv.Atoi(q.Get("n"))
		if n <= 0 || n > 50 {
			n = 20
		}
		rows, err := h.st.leaderboard(q.Get("board"), typ, n, h.caller(r))
		if err != nil {
			reply(w, 503, map[string]string{"error": "unavailable"})
			return
		}
		reply(w, 200, map[string]any{"board": q.Get("board"), "type": typ, "rows": rows})
	})
	mux.HandleFunc("GET "+prefix+"/me", func(w http.ResponseWriter, r *http.Request) {
		cors(w, r, origins)
		uid := h.caller(r)
		if uid == "" {
			reply(w, 401, map[string]string{"error": "sign in"})
			return
		}
		c, err := h.st.card(uid)
		if err != nil {
			reply(w, 503, map[string]string{"error": "unavailable"})
			return
		}
		reply(w, 200, c)
	})
	mux.HandleFunc("GET "+prefix+"/ghosts", func(w http.ResponseWriter, r *http.Request) {
		cors(w, r, origins)
		rows, err := h.st.ghosts(60, h.caller(r))
		if err != nil {
			reply(w, 503, map[string]string{"error": "unavailable"})
			return
		}
		reply(w, 200, map[string]any{"ghosts": rows})
	})
	mux.HandleFunc("POST "+prefix+"/ghost", func(w http.ResponseWriter, r *http.Request) {
		cors(w, r, origins)
		uid := h.caller(r)
		if uid == "" {
			reply(w, 401, map[string]string{"error": "sign in"})
			return
		}
		var body struct {
			Name string          `json:"name"`
			Snap json.RawMessage `json:"snap"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body); err != nil {
			reply(w, 400, map[string]string{"error": "bad body"})
			return
		}
		snap, err := cleanSnap(body.Snap)
		if err != nil {
			reply(w, 400, map[string]string{"error": err.Error()})
			return
		}
		name, err := cleanName(body.Name)
		if errors.Is(err, errEmptyName) {
			name = "PLAYER"
		} else if err != nil {
			reply(w, 400, map[string]string{"error": "name not allowed"})
			return
		}
		ghostMu.Lock()
		now := h.st.now()
		if now.Sub(ghostLast[uid]) < ghostGap {
			ghostMu.Unlock()
			reply(w, 429, map[string]string{"error": "slow down"})
			return
		}
		ghostLast[uid] = now
		if len(ghostLast) > 5000 {
			for k, t := range ghostLast {
				if now.Sub(t) > ghostGap {
					delete(ghostLast, k)
				}
			}
		}
		ghostMu.Unlock()
		if err := h.st.saveGhost(uid, name, snap); err != nil {
			reply(w, 503, map[string]string{"error": "unavailable"})
			return
		}
		reply(w, 200, map[string]any{"ok": true})
	})
}
