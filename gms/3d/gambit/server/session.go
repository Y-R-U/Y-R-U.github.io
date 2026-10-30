package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
)

// Sess is one websocket connection. A user may have several (tabs, devices).
type Sess struct {
	c      *websocket.Conn
	send   chan []byte
	u      *User
	ip     string
	lobby  bool
	once   sync.Once
	done   chan struct{}
	tokens float64
	last   time.Time
}

const (
	sendBuf      = 64
	helloTimeout = 10 * time.Second
	pingEvery    = 25 * time.Second
	writeTimeout = 10 * time.Second
	msgBurst     = 30
	msgPerSec    = 10
)

func itoa(n int64) string { return strconv.FormatInt(n, 10) }

func (s *Sess) sendRaw(b []byte) {
	select {
	case s.send <- b:
	default:
		s.close(websocket.StatusPolicyViolation, "too slow") // a client that can't keep up is dropped
	}
}

func (s *Sess) push(v any) { s.sendRaw(encode(v)) }

func (s *Sess) close(code websocket.StatusCode, why string) {
	s.once.Do(func() {
		close(s.done)
		go s.c.Close(code, why)
	})
}

func (s *Sess) reply(id int64, kv ...any) {
	m := ev("ok", kv...)
	m["id"] = id
	s.push(m)
}

func (s *Sess) fail(id int64, code, msg string, kv ...any) {
	m := ev("error", kv...)
	m["id"], m["code"], m["error"] = id, code, msg
	s.push(m)
}

// allowMsg is a token bucket per connection.
func (s *Sess) allowMsg() bool {
	now := time.Now()
	if !s.last.IsZero() {
		s.tokens = min(msgBurst, s.tokens+now.Sub(s.last).Seconds()*msgPerSec)
	}
	s.last = now
	if s.tokens < 1 {
		return false
	}
	s.tokens--
	return true
}

func (s *Sess) writer() {
	ping := time.NewTicker(pingEvery)
	defer ping.Stop()
	for {
		select {
		case <-s.done:
			return
		case b := <-s.send:
			ctx, cancel := context.WithTimeout(context.Background(), writeTimeout)
			err := s.c.Write(ctx, websocket.MessageText, b)
			cancel()
			if err != nil {
				s.close(websocket.StatusGoingAway, "write failed")
				return
			}
		case <-ping.C:
			ctx, cancel := context.WithTimeout(context.Background(), writeTimeout)
			err := s.c.Ping(ctx)
			cancel()
			if err != nil {
				s.close(websocket.StatusGoingAway, "ping failed")
				return
			}
		}
	}
}

type inMsg struct {
	T      string `json:"t"`
	ID     int64  `json:"id"`
	Token  string `json:"token"`
	Name   string `json:"name"`
	On     *bool  `json:"on"`
	TC     string `json:"tc"`
	Rated  *bool  `json:"rated"`
	Public *bool  `json:"public"`
	Color  string `json:"color"`
	Code   string `json:"code"`
	Game   string `json:"game"`
	UCI    string `json:"uci"`
	Ply    *int   `json:"ply"`
	Action string `json:"action"`
	Kind   string `json:"kind"`
	Cat    string `json:"cat"`
	Limit  int    `json:"limit"`
}

func handleWS(w http.ResponseWriter, r *http.Request) {
	ip := clientIP(r)
	if !hit("ws", ip) {
		rateLimited(w)
		return
	}
	hub.mu.Lock()
	full := hub.conns >= cfg.MaxConns || hub.perIP[ip] >= cfg.MaxConnsPerIP
	if !full {
		hub.conns++
		hub.perIP[ip]++
	}
	hub.mu.Unlock()
	if full {
		writeErr(w, 503, "busy", "too many connections")
		return
	}
	defer func() {
		hub.mu.Lock()
		hub.conns--
		if hub.perIP[ip]--; hub.perIP[ip] <= 0 {
			delete(hub.perIP, ip)
		}
		hub.mu.Unlock()
	}()
	// Long-lived: lift the server's read/write deadlines for this connection.
	rc := http.NewResponseController(w)
	rc.SetReadDeadline(time.Time{})
	rc.SetWriteDeadline(time.Time{})
	c, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: cfg.OriginHosts, CompressionMode: websocket.CompressionDisabled})
	if err != nil {
		return
	}
	c.SetReadLimit(int64(cfg.MaxMsg))
	s := &Sess{c: c, send: make(chan []byte, sendBuf), ip: ip, done: make(chan struct{}), tokens: msgBurst}
	go s.writer()
	defer s.close(websocket.StatusNormalClosure, "")

	ctx := r.Context()
	hctx, cancel := context.WithTimeout(ctx, helloTimeout)
	m, err := readMsg(hctx, c)
	cancel()
	if err != nil || m.T != "hello" {
		s.close(websocket.StatusPolicyViolation, "hello first")
		return
	}
	id, err := verifyToken(m.Token)
	if err != nil {
		s.fail(m.ID, "bad_token", "could not verify your sign-in, reload and try again")
		time.Sleep(200 * time.Millisecond) // let the error reach the client
		s.close(4001, "bad token")
		return
	}
	hub.attach(s, id, m, m.Token)
	defer hub.detach(s)

	for {
		m, err := readMsg(ctx, c)
		if err != nil {
			var ce websocket.CloseError
			if !errors.As(err, &ce) && !errors.Is(err, context.Canceled) && !strings.Contains(err.Error(), "EOF") {
				if strings.Contains(err.Error(), "read limited") {
					s.close(websocket.StatusMessageTooBig, "message too big")
				}
			}
			return
		}
		select {
		case <-s.done:
			return
		default:
		}
		if !s.allowMsg() {
			s.fail(m.ID, "rate_limited", "slow down")
			continue
		}
		hub.dispatch(s, m)
	}
}

func readMsg(ctx context.Context, c *websocket.Conn) (inMsg, error) {
	var m inMsg
	typ, b, err := c.Read(ctx)
	if err != nil {
		return m, err
	}
	if typ != websocket.MessageText {
		return m, errors.New("binary message")
	}
	if err := json.Unmarshal(b, &m); err != nil {
		m.T = "bad"
	}
	return m, nil
}

func displayName(raw, fb, pid string) string {
	if n, err := cleanName(raw); err == nil {
		return n
	}
	if n, err := cleanName(fb); err == nil {
		return n
	}
	return "Guest " + strings.ToUpper(pid[:4])
}

func (h *Hub) attach(s *Sess, id fbIdentity, m inMsg, tok string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	u := h.user(id.UID)
	u.Name = displayName(m.Name, id.Name, u.PID)
	u.Anon, u.Dev, u.IP = id.Anon, id.Dev, s.ip
	u.Admin = !id.Dev && !id.Anon && id.EmailVerified && cfg.Admins[id.Email]
	if !id.Anon && !id.Dev {
		u.Tok = tok
	}
	upsertPlayer(u.UID, u.Name, u.Anon)
	s.u = u
	back := len(u.sess) == 0 && u.goneAt > 0
	u.sess[s] = true
	u.goneAt = 0
	now := nowMs()
	games := []any{}
	for _, g := range u.games {
		side := g.seatOf(u.UID)
		if back && !g.Ended {
			g.Gone[side] = 0
			if o := h.users[g.Seats[1-side].UID]; o != nil {
				h.pushUser(o, ev("opponent", "game", g.ID, "status", "back"))
			}
		}
		games = append(games, g.view(side, now))
	}
	rooms := []any{}
	for _, r := range u.rooms {
		rooms = append(rooms, r.view())
	}
	var seek any
	if u.seek != nil {
		seek = map[string]any{"tc": u.seek.TC.ID, "rated": u.seek.Rated, "at": u.seek.At}
	}
	s.push(map[string]any{"t": "welcome", "id": m.ID, "now": now, "v": protocolVersion,
		"you":     map[string]any{"pid": u.PID, "name": u.Name, "anon": u.Anon, "admin": u.Admin, "dev": u.Dev},
		"ratings": loadRatings(u.UID), "games": games, "rooms": rooms, "seek": seek,
		"allowance": h.allowView(u), "tcs": tcList(), "paused": paused()})
	h.dirty = true
}

func (h *Hub) detach(s *Sess) {
	h.mu.Lock()
	defer h.mu.Unlock()
	u := s.u
	if u == nil {
		return
	}
	delete(u.sess, s)
	if len(u.sess) > 0 {
		return
	}
	now := nowMs()
	u.goneAt = now
	h.removeSeek(u)
	for _, g := range u.games {
		if g.Ended {
			continue
		}
		side := g.seatOf(u.UID)
		g.Gone[side] = now
		if o := h.users[g.Seats[1-side].UID]; o != nil {
			h.pushUser(o, ev("opponent", "game", g.ID, "status", "gone", "claimAt", g.claimAt(side)))
		}
	}
	h.dirty = true
}

func tcList() []TimeControl {
	out := make([]TimeControl, 0, len(timeControlIDs))
	for _, id := range timeControlIDs {
		out = append(out, timeControls[id])
	}
	return out
}

func paused() bool { return getSetting("paused") == "1" }

var errText = map[string]string{
	"no_games_left":   "no online games left today",
	"ip_limit":        "too many guest games from your network today, sign in to keep playing",
	"already_playing": "finish your current game first",
	"too_many_games":  "you have too many Unlimited games going",
	"paused":          "new online games are paused for a little while",
	"bad_tc":          "unknown time control",
	"no_game":         "no such game",
	"not_your_turn":   "it is not your turn",
	"stale_ply":       "out of sync, refreshing the game",
	"illegal_move":    "illegal move",
	"game_over":       "the game is over",
	"no_room":         "no room with that code",
	"own_room":        "that is your own room",
	"too_many_rooms":  "you already have open rooms, close one first",
	"lobby_full":      "the lobby is full right now, try quick match",
	"host_busy":       "the host is playing another game",
	"host_no_games":   "the host has no online games left today",
	"opponent_busy":   "your opponent can't play right now",
	"rate_limited":    "slow down",
	"bad_name":        "that name is not allowed",
	"bad_request":     "bad request",
	"not_now":         "not possible right now",
}

func (s *Sess) failCode(id int64, code string, kv ...any) { s.fail(id, code, errText[code], kv...) }

// dispatch handles one client message. Gate actions refresh the payments allowance
// first, off the lock.
func (h *Hub) dispatch(s *Sess, m inMsg) {
	u := s.u
	switch m.T {
	case "seek", "createRoom", "joinRoom":
		h.refreshAllowance(u)
	case "rematch":
		if m.Action != "decline" {
			h.refreshAllowance(u)
		}
	case "auth":
		id, err := verifyToken(m.Token)
		if err != nil || id.UID != u.UID {
			s.fail(m.ID, "bad_token", "sign-in changed, reconnecting")
			s.close(4001, "identity changed")
			return
		}
		h.mu.Lock()
		if !id.Anon && !id.Dev {
			u.Tok = m.Token
		}
		h.mu.Unlock()
		s.reply(m.ID)
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	now := nowMs()
	switch m.T {
	case "ping":
		s.push(map[string]any{"t": "pong", "id": m.ID, "now": now})
	case "lobby":
		s.lobby = m.On == nil || *m.On
		s.reply(m.ID, "lobby", h.lobbyView())
	case "allowance":
		s.reply(m.ID, "allowance", h.allowView(u))
	case "ratings":
		s.reply(m.ID, "ratings", loadRatings(u.UID))
	case "leaderboard":
		cat := m.Cat
		if !validCat(cat) {
			cat = "blitz"
		}
		s.reply(m.ID, "cat", cat, "rows", leaderboard(cat, clampLimit(m.Limit)))
	case "rename":
		n, err := cleanName(m.Name)
		if err != nil {
			s.failCode(m.ID, "bad_name")
			return
		}
		u.Name = n
		upsertPlayer(u.UID, n, u.Anon)
		s.reply(m.ID, "name", n)
	case "seek":
		h.doSeek(s, m)
	case "unseek":
		h.removeSeek(u)
		s.reply(m.ID)
	case "createRoom":
		h.doCreateRoom(s, m)
	case "closeRoom":
		if r := u.rooms[normCode(m.Code)]; r != nil {
			h.closeRoom(r, "closed")
		}
		s.reply(m.ID)
	case "joinRoom":
		h.doJoinRoom(s, m)
	case "peekRoom":
		r := h.rooms[normCode(m.Code)]
		if r == nil {
			s.failCode(m.ID, "no_room")
			return
		}
		s.reply(m.ID, "room", r.view())
	case "game":
		g := u.games[m.Game]
		if g == nil {
			s.failCode(m.ID, "no_game")
			return
		}
		s.reply(m.ID, "game", g.view(g.seatOf(u.UID), now))
	case "move", "resign", "draw", "abort", "claim", "rematch":
		g := u.games[m.Game]
		if g == nil {
			s.failCode(m.ID, "no_game")
			return
		}
		h.doGameAction(s, g, m, now)
	default:
		s.failCode(m.ID, "bad_request")
	}
}

func validCat(c string) bool {
	for _, x := range categories {
		if x == c {
			return true
		}
	}
	return false
}

func clampLimit(n int) int {
	if n <= 0 {
		return 50
	}
	return min(n, 100)
}

func (h *Hub) gate(s *Sess, id int64, tc TimeControl) bool {
	u := s.u
	if paused() && !u.Admin {
		s.failCode(id, "paused")
		return false
	}
	if c := h.canPlay(u, tc); c != "" {
		s.failCode(id, c)
		return false
	}
	if c := h.canStart(u); c != "" {
		s.failCode(id, c, "allowance", h.allowView(u))
		return false
	}
	return true
}

func (h *Hub) doSeek(s *Sess, m inMsg) {
	u := s.u
	tc, ok := timeControls[m.TC]
	if !ok {
		s.failCode(m.ID, "bad_tc")
		return
	}
	if !hit("seek", u.UID) {
		s.failCode(m.ID, "rate_limited")
		return
	}
	if !h.gate(s, m.ID, tc) {
		return
	}
	rated := m.Rated == nil || *m.Rated
	h.removeSeek(u)
	r, _ := h.ratingFor(u, tc.Cat)
	u.seek = &Seek{U: u, TC: tc, Rated: rated, Rating: r, At: nowMs()}
	h.seeks = append(h.seeks, u.seek)
	h.dirty = true
	s.reply(m.ID, "seek", map[string]any{"tc": tc.ID, "rated": rated, "at": u.seek.At})
	h.match()
}

func (h *Hub) doCreateRoom(s *Sess, m inMsg) {
	u := s.u
	tc, ok := timeControls[m.TC]
	if !ok {
		s.failCode(m.ID, "bad_tc")
		return
	}
	if !hit("room", u.UID) {
		s.failCode(m.ID, "rate_limited")
		return
	}
	if len(u.rooms) >= maxRoomsPerUser {
		s.failCode(m.ID, "too_many_rooms")
		return
	}
	public := m.Public != nil && *m.Public
	if public {
		n := 0
		for _, r := range h.rooms {
			if r.Public {
				n++
			}
		}
		if n >= cfg.MaxPublicRooms {
			s.failCode(m.ID, "lobby_full")
			return
		}
	}
	if len(h.rooms) >= cfg.MaxRooms {
		s.failCode(m.ID, "lobby_full")
		return
	}
	if !h.gate(s, m.ID, tc) {
		return
	}
	name := u.Name + "'s game"
	if strings.TrimSpace(m.Name) != "" {
		n, err := cleanName(m.Name)
		if err != nil {
			s.failCode(m.ID, "bad_name")
			return
		}
		name = n
	}
	color := m.Color
	if color != "w" && color != "b" {
		color = "random"
	}
	code := newCode()
	for h.rooms[code] != nil {
		code = newCode()
	}
	rating, prov := h.ratingFor(u, tc.Cat)
	r := &Room{Code: code, Public: public, Name: name, TC: tc, Rated: m.Rated == nil || *m.Rated, Color: color,
		Host: u, Rating: rating, Prov: prov, Created: nowMs()}
	h.rooms[code] = r
	u.rooms[code] = r
	if public {
		h.dirty = true
	}
	s.reply(m.ID, "room", r.view())
}

func (h *Hub) doJoinRoom(s *Sess, m inMsg) {
	u := s.u
	if !hit("join", u.UID) {
		s.failCode(m.ID, "rate_limited")
		return
	}
	r := h.rooms[normCode(m.Code)]
	if r == nil {
		s.failCode(m.ID, "no_room")
		return
	}
	if r.Host == u {
		s.failCode(m.ID, "own_room")
		return
	}
	if !h.gate(s, m.ID, r.TC) {
		return
	}
	if h.canPlay(r.Host, r.TC) != "" {
		s.failCode(m.ID, "host_busy")
		return
	}
	if h.canStart(r.Host) != "" {
		h.closeRoom(r, "no_games_left")
		s.failCode(m.ID, "host_no_games")
		return
	}
	w, b := r.Host, u
	switch r.Color {
	case "b":
		w, b = u, r.Host
	case "random":
		if randString("01", 1) == "1" {
			w, b = u, r.Host
		}
	}
	h.closeRoom(r, "started")
	g := h.startGame(w, b, r.TC, r.Rated, r.Code)
	s.reply(m.ID, "game", g.ID)
}

func (h *Hub) doGameAction(s *Sess, g *Game, m inMsg, now int64) {
	u := s.u
	side := g.seatOf(u.UID)
	opp := h.users[g.Seats[1-side].UID]
	switch m.T {
	case "move":
		ply := len(g.Moves)
		if m.Ply != nil {
			ply = *m.Ply
		}
		if ply >= 0 && ply < len(g.Moves) && g.Moves[ply] == strings.ToLower(strings.TrimSpace(m.UCI)) && side == ply%2 {
			s.reply(m.ID, "dup", true) // resend of a move we already have
			return
		}
		wasEnded := g.Ended
		mv, san, err := g.move(side, m.UCI, ply, now)
		if err != nil {
			if g.Ended && !wasEnded {
				h.finish(g)
			}
			s.failCode(m.ID, err.Error(), "game", g.view(side, now))
			return
		}
		h.persist(g)
		s.reply(m.ID, "san", san)
		ply = len(g.Moves) - 1
		h.pushGame(g, func(int) any {
			return ev("move", "game", g.ID, "ply", ply, "uci", mv.UCI(), "san", san, "fen", g.pos.FEN(),
				"clock", g.clockView(now), "drawOffer", colorName(g.Draw))
		})
		if len(g.Moves) == 2 {
			h.countGame(g)
		}
		if g.Ended {
			h.finish(g)
		}
	case "resign":
		if g.Ended {
			s.failCode(m.ID, "game_over")
			return
		}
		if len(g.Moves) < 2 {
			g.end("*", "aborted", now)
		} else {
			g.end(winFor(1-side), "resign", now)
		}
		s.reply(m.ID)
		h.finish(g)
	case "abort":
		if g.Ended || len(g.Moves) >= 2 {
			s.failCode(m.ID, "not_now")
			return
		}
		g.end("*", "aborted", now)
		s.reply(m.ID)
		h.finish(g)
	case "draw":
		if g.Ended || len(g.Moves) < 2 {
			s.failCode(m.ID, "not_now")
			return
		}
		switch m.Action {
		case "offer", "accept":
			if g.Draw == 1-side { // the opponent already offered: agree
				g.end("1/2-1/2", "agreement", now)
				s.reply(m.ID)
				h.finish(g)
				return
			}
			if m.Action == "accept" || g.Draw == side || g.DrawPly[side] == len(g.Moves) {
				s.failCode(m.ID, "not_now")
				return
			}
			g.Draw, g.DrawPly[side] = side, len(g.Moves)
			h.persist(g)
			s.reply(m.ID)
			h.pushGame(g, func(int) any { return ev("draw", "game", g.ID, "by", colorName(side), "action", "offer") })
		case "decline":
			if g.Draw != 1-side {
				s.failCode(m.ID, "not_now")
				return
			}
			g.Draw = -1
			h.persist(g)
			s.reply(m.ID)
			h.pushGame(g, func(int) any { return ev("draw", "game", g.ID, "by", colorName(side), "action", "decline") })
		default:
			s.failCode(m.ID, "bad_request")
		}
	case "claim":
		if g.Ended || g.tc.Unlimited() || g.Gone[1-side] == 0 || now < g.claimAt(1-side) {
			s.failCode(m.ID, "not_now")
			return
		}
		switch {
		case len(g.Moves) < 2:
			g.end("*", "aborted", now)
		case m.Kind == "draw":
			g.end("1/2-1/2", "abandoned", now)
		default:
			g.end(winFor(side), "abandoned", now)
		}
		s.reply(m.ID)
		h.finish(g)
	case "rematch":
		if !g.Ended || g.Next != "" || h.games[g.ID] == nil {
			s.failCode(m.ID, "not_now")
			return
		}
		if m.Action == "decline" || m.Action == "cancel" {
			g.Rematch = [2]bool{}
			s.reply(m.ID)
			h.pushGame(g, func(int) any { return ev("rematch", "game", g.ID, "by", colorName(side), "action", "decline") })
			return
		}
		if !h.gate(s, m.ID, g.tc) {
			return
		}
		g.Rematch[side] = true
		if !g.Rematch[1-side] {
			s.reply(m.ID)
			h.pushGame(g, func(int) any { return ev("rematch", "game", g.ID, "by", colorName(side), "action", "offer") })
			return
		}
		if opp == nil || h.canPlay(opp, g.tc) != "" || h.canStart(opp) != "" {
			g.Rematch[1-side] = false
			s.failCode(m.ID, "opponent_busy")
			return
		}
		w, b := h.user(g.Seats[1].UID), h.user(g.Seats[0].UID) // colours swap
		ng := h.startGame(w, b, g.tc, g.Rated, "")
		g.Next = ng.ID
		s.reply(m.ID, "game", ng.ID)
	}
}

func logf(format string, a ...any) { log.Printf(format, a...) }
