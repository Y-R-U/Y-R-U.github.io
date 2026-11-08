package main

// The hub owns every piece of live state (users, rooms) under one mutex, like GAMBIT's: the
// box has one CPU and a room sees a shot every second or so. Network writes never happen with
// the lock held: they go through each session's buffered channel.

import (
	"encoding/json"
	"sort"
	"strings"
	"sync"
)

type Hub struct {
	mu     sync.Mutex
	users  map[string]*User
	rooms  map[string]*Room
	conns  int
	perIP  map[string]int
	dirty  bool  // lobby changed since the last broadcast
	sentAt int64 // last lobby broadcast
}

type User struct {
	UID, Name, PID string
	Anon, Dev      bool
	IP             string
	sess           map[*Sess]bool
	goneAt         int64
	room           *Room
}

// maxPublicRoomsPerIP caps open public rooms per creator IP (a var for tests).
var maxPublicRoomsPerIP = 3

var hub = newHub()

func newHub() *Hub {
	return &Hub{users: map[string]*User{}, rooms: map[string]*Room{}, perIP: map[string]int{}}
}

func (h *Hub) user(uid string) *User {
	u := h.users[uid]
	if u == nil {
		u = &User{UID: uid, PID: pidOf(uid), sess: map[*Sess]bool{}}
		h.users[uid] = u
	}
	return u
}

func encode(v any) []byte { b, _ := json.Marshal(v); return b }

func (h *Hub) pushUser(u *User, v any) {
	if u == nil || len(u.sess) == 0 {
		return
	}
	b := encode(v)
	for s := range u.sess {
		s.sendRaw(b)
	}
}

func ev(t string, kv ...any) map[string]any {
	m := map[string]any{"t": t}
	for i := 0; i+1 < len(kv); i += 2 {
		m[kv[i].(string)] = kv[i+1]
	}
	return m
}

// ---------------------------------------------------------------- connect

func (h *Hub) attach(s *Sess, id fbIdentity, m inMsg) {
	h.mu.Lock()
	defer h.mu.Unlock()
	u := h.user(id.UID)
	u.Name = displayName(m.Name, id.Name, u.PID)
	u.Anon, u.Dev, u.IP = id.Anon, id.Dev, s.ip
	upsertPlayer(u.UID, u.Name, u.Anon)
	s.u = u
	back := len(u.sess) == 0
	u.sess[s] = true
	u.goneAt = 0
	var room any
	if r := u.room; r != nil {
		if i := r.seatOf(u.UID); i >= 0 {
			st := r.Seats[i]
			if back && st.Ctrl == "human" && r.State == "playing" { // a shot from before the reload can never report: void it now
				h.voidFlight(r, st)
			}
			if st.Ctrl == "ai" && st.Kind == "human" && !st.Left { // back from an AI takeover
				st.Ctrl = "human"
			}
			if r.State == "lobby" && st.Name != u.Name { // renamed while away
				st.Name = u.Name
			}
		}
		r.EmptyAt = 0
		h.pushRoom(r) // everyone sees them back (incl. this session, which gets the welcome first)
		room = h.roomView(r, u.UID)
	}
	s.push(map[string]any{"t": "welcome", "id": m.ID, "now": nowMs(), "v": protocolVersion, "min": minProtocol,
		"you": map[string]any{"pid": u.PID, "name": u.Name, "anon": u.Anon, "dev": u.Dev}, "room": room, "paused": paused()})
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
	if len(u.sess) == 0 {
		u.goneAt = nowMs()
		if r := u.room; r != nil {
			h.pushRoom(r) // presence changed
		}
	}
	h.dirty = true
}

func displayName(raw, fb, pid string) string {
	if n, err := cleanName(raw); err == nil {
		return n
	}
	if n, err := cleanName(fb); err == nil {
		return n
	}
	return "Golfer " + strings.ToUpper(pid[:4])
}

// ---------------------------------------------------------------- lobby

func (h *Hub) lobbyView() map[string]any {
	list := make([]*Room, 0, len(h.rooms))
	playing, online := 0, 0
	for _, r := range h.rooms {
		if r.State == "playing" {
			playing++
		}
		if r.Opts.Public && r.State == "lobby" && r.humans() < r.Opts.Max && h.online(r.Host) {
			list = append(list, r)
		}
	}
	sort.Slice(list, func(i, j int) bool { return list[i].Created > list[j].Created })
	rooms := []any{}
	for _, r := range list {
		rooms = append(rooms, h.listing(r))
	}
	for _, u := range h.users {
		if len(u.sess) > 0 {
			online++
		}
	}
	return map[string]any{"rooms": rooms, "playing": playing, "online": online}
}

func (h *Hub) broadcastLobby() {
	var b []byte
	for _, u := range h.users {
		for s := range u.sess {
			if s.lobby {
				if b == nil {
					b = encode(map[string]any{"t": "lobby", "lobby": h.lobbyView()})
				}
				s.sendRaw(b)
			}
		}
	}
	h.dirty, h.sentAt = false, nowMs()
}

func (h *Hub) publicRoomsOf(ip string) (n, total int) {
	for _, r := range h.rooms {
		if r.Opts.Public && r.State != "ended" {
			total++
			if r.IP == ip {
				n++
			}
		}
	}
	return
}

// canCreate checks the server-wide and per-IP room caps (lock held).
func (h *Hub) canCreate(u *User, public bool) string {
	if paused() {
		return "paused"
	}
	if len(h.rooms) >= cfg.MaxRooms {
		return "lobby_full"
	}
	if public {
		n, total := h.publicRoomsOf(u.IP)
		if total >= cfg.MaxPublicRooms {
			return "lobby_full"
		}
		if n >= maxPublicRoomsPerIP {
			return "too_many_rooms"
		}
	}
	return ""
}

// quickPlay joins the fullest open quick room, or opens one with the client's default options.
func (h *Hub) quickPlay(u *User, o RoomOpts) (*Room, string) {
	if u.room != nil && u.room.Quick && u.room.State == "lobby" {
		return u.room, "" // already waiting in one
	}
	var best *Room
	for _, r := range h.rooms {
		if !r.Quick || r.State != "lobby" || r.humans() >= r.Opts.Max || !h.online(r.Host) || r.seatOf(u.UID) >= 0 {
			continue
		}
		if best == nil || r.humans() > best.humans() || (r.humans() == best.humans() && r.Created < best.Created) {
			best = r
		}
	}
	if best != nil {
		h.addMember(best, u)
		h.afterJoin(best)
		return best, ""
	}
	o.Public = true
	o.Name = "Quick play"
	if o.Max < minPlayers || o.Max > maxPlayers {
		o.Max = 4
	}
	o.AI.Count = o.Max - 1
	c, code := cleanOpts(o)
	if code != "" {
		return nil, code
	}
	if code := h.canCreate(u, true); code != "" {
		return nil, code
	}
	r := h.newRoom(u, c, true)
	h.pushRoom(r)
	return r, ""
}

func (h *Hub) afterJoin(r *Room) {
	if r.Quick && r.humans() >= r.Opts.Max {
		h.start(r)
		return
	}
	h.pushRoom(r)
}

// ---------------------------------------------------------------- tick

func (h *Hub) tick() {
	h.mu.Lock()
	defer h.mu.Unlock()
	now := nowMs()
	for _, r := range h.rooms {
		h.tickRoom(r, now)
	}
	for uid, u := range h.users {
		if len(u.sess) == 0 && u.room == nil && now-u.goneAt > 10*60_000 {
			delete(h.users, uid)
		}
	}
	if h.dirty && now-h.sentAt >= 1000 {
		h.broadcastLobby()
	}
}

// ---------------------------------------------------------------- dispatch

func (h *Hub) dispatch(s *Sess, m inMsg) {
	h.mu.Lock()
	defer h.mu.Unlock()
	u := s.u
	switch m.T {
	case "ping":
		s.push(map[string]any{"t": "pong", "id": m.ID, "now": nowMs()})
	case "lobby":
		s.lobby = m.On == nil || *m.On
		s.reply(m.ID, "lobby", h.lobbyView())
	case "rename":
		n, err := cleanName(m.Name)
		if err != nil {
			s.fail(m.ID, "bad_name", "that name is not allowed")
			return
		}
		u.Name = n
		upsertPlayer(u.UID, n, u.Anon)
		if r := u.room; r != nil && r.State == "lobby" {
			if i := r.seatOf(u.UID); i >= 0 {
				r.Seats[i].Name = n
				h.pushRoom(r)
			}
		}
		s.reply(m.ID, "name", n)
	case "createRoom":
		if !hit("room", u.UID) {
			s.fail(m.ID, "rate_limited", "too many rooms, wait a few minutes")
			return
		}
		if m.Opts == nil {
			s.fail(m.ID, "bad_request", "opts required")
			return
		}
		o, code := cleanOpts(*m.Opts)
		if code != "" {
			s.fail(m.ID, code, "those room options are not allowed")
			return
		}
		if code := h.canCreate(u, o.Public); code != "" {
			s.fail(m.ID, code, "cannot open a room right now")
			return
		}
		if u.room != nil {
			h.leave(u, "joined_other")
		}
		r := h.newRoom(u, o, false)
		s.reply(m.ID, "room", h.roomView(r, u.UID))
		h.pushRoom(r)
	case "quick":
		if !hit("quick", u.UID) {
			s.fail(m.ID, "rate_limited", "slow down")
			return
		}
		var o RoomOpts
		if m.Opts != nil {
			o = *m.Opts
		}
		r, code := h.quickPlay(u, o)
		if code != "" {
			s.fail(m.ID, code, "quick play is not available right now")
			return
		}
		s.reply(m.ID, "room", h.roomView(r, u.UID))
	case "joinRoom", "peekRoom":
		if !hit("join", u.UID) || !hit("joinip", u.IP) {
			s.fail(m.ID, "rate_limited", "slow down")
			return
		}
		r := h.rooms[normCode(m.Code)]
		if r == nil {
			s.fail(m.ID, "no_room", "no room with that code")
			return
		}
		if m.T == "peekRoom" {
			s.reply(m.ID, "room", h.listing(r), "state", r.State)
			return
		}
		if r.seatOf(u.UID) >= 0 && !r.Seats[r.seatOf(u.UID)].Left { // rejoin (another tab, or after leaving the screen)
			u.room = r
			s.reply(m.ID, "room", h.roomView(r, u.UID))
			h.pushRoom(r)
			return
		}
		switch {
		case r.State != "lobby":
			s.fail(m.ID, "in_play", "that room has already started")
			return
		case r.humans() >= r.Opts.Max:
			s.fail(m.ID, "room_full", "that room is full")
			return
		}
		h.addMember(r, u)
		s.reply(m.ID, "room", h.roomView(r, u.UID))
		h.afterJoin(r)
	case "leaveRoom":
		h.leave(u, "left")
		s.reply(m.ID)
	case "room":
		if u.room == nil {
			s.reply(m.ID, "room", nil)
			return
		}
		s.reply(m.ID, "room", h.roomView(u.room, u.UID))
	case "setOpts":
		r := u.room
		switch {
		case r == nil:
			s.fail(m.ID, "no_room", "you are not in a room")
		case r.Host != u.UID:
			s.fail(m.ID, "not_host", "only the host can change the room")
		case r.State != "lobby":
			s.fail(m.ID, "not_now", "the round has started")
		case m.Opts == nil:
			s.fail(m.ID, "bad_request", "opts required")
		default:
			o, code := cleanOpts(*m.Opts)
			if code == "" && o.Max < r.humans() {
				code = "bad_max"
			}
			if code == "" && o.Public && !r.Opts.Public {
				if n, total := h.publicRoomsOf(u.IP); n >= maxPublicRoomsPerIP || total >= cfg.MaxPublicRooms {
					code = "too_many_rooms"
				}
			}
			if code != "" {
				s.fail(m.ID, code, "those room options are not allowed")
				return
			}
			if r.Quick { // quick rooms stay public and full of AIs
				o.Public, o.AI.Count = true, o.Max-1
			}
			r.Opts = o
			s.reply(m.ID, "room", h.roomView(r, u.UID))
			h.pushRoom(r)
			h.dirty = true
		}
	case "start":
		r := u.room
		switch {
		case r == nil:
			s.fail(m.ID, "no_room", "you are not in a room")
		case r.Host != u.UID:
			s.fail(m.ID, "not_host", "only the host can start")
		case r.State != "lobby":
			s.fail(m.ID, "not_now", "already started")
		case r.humans()+min(r.Opts.AI.Count, r.Opts.Max-r.humans()) < 2 && !r.Quick:
			s.fail(m.ID, "need_players", "add a ghost AI or wait for a friend")
		default:
			h.start(r)
			s.reply(m.ID)
		}
	case "shot":
		out, code := h.shot(u, m)
		h.answer(s, m.ID, out, code)
	case "result":
		out, code := h.result(u, m)
		h.answer(s, m.ID, out, code)
	case "mulligan":
		out, code := h.mulligan(u, m)
		h.answer(s, m.ID, out, code)
	case "next":
		h.answer(s, m.ID, nil, h.next(u))
	case "again":
		r := u.room
		switch {
		case r == nil:
			s.fail(m.ID, "no_room", "you are not in a room")
		case r.Host != u.UID:
			s.fail(m.ID, "not_host", "only the host can restart")
		case r.State != "ended":
			s.fail(m.ID, "not_now", "the round is not over")
		default:
			h.again(r)
			s.reply(m.ID, "room", h.roomView(r, u.UID))
		}
	default:
		s.fail(m.ID, "bad_request", "unknown message")
	}
}

var errText = map[string]string{
	"no_room": "you are not in a room", "not_now": "not right now", "not_your_seat": "that is not your ball",
	"stale_hole": "that hole is over", "hole_done": "you have finished this hole", "in_flight": "the ball is still rolling",
	"stale_shot": "out of sync", "bad_shot": "bad shot", "bad_result": "bad result",
	"no_helpers": "helpers are off in this room", "no_helpers_left": "none of that helper left this round",
}

func (h *Hub) answer(s *Sess, id int64, out map[string]any, code string) {
	if code != "" {
		s.fail(id, code, errText[code])
		return
	}
	kv := []any{}
	for k, v := range out {
		kv = append(kv, k, v)
	}
	s.reply(id, kv...)
}
