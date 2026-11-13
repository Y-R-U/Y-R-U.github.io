package main

// The hub owns all live state under one mutex (the box has one CPU; a room is a few dozen small
// messages a second). Network writes never block under the lock: they go through each session's
// buffered channel.

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log"
	"regexp"
	"sort"
	"strings"
	"sync"

	"github.com/coder/websocket"
)

const (
	maxCrowds    = 8
	lateMinLeft  = 45000 // ms a running match must have left for a late joiner to take over a bot
	hostGrace    = 2000  // ms an abruptly dropped host has to come back before a guest takes over
	hostSilence  = 3000  // ms without a snapshot from the host while playing → take over
	goTimeout    = 5000  // ms the host has to answer `go` with `begin`
	lobbyGrace   = 10000 // ms a dropped member keeps their lobby place
	playGrace    = 30000 // ms a dropped member keeps their crowd (a bot drives it meanwhile)
	emptyClose   = 20000 // ms a room with nobody connected survives
	wantTimeout  = 4000  // ms the host has to answer `want` with `assign`
	confirmWait  = 10000 // ms to wait for a second client to confirm the host's result
	endSlack     = 25000 // ms after the expected end before a match is closed without results
	maxTail      = 600   // snapshots kept after the last keyframe (8 s of 15 Hz is 120)
	maxMetaBytes = 5000
)

var (
	reHexID = regexp.MustCompile(`^[0-9a-f]{16,64}$`)
	reCID   = regexp.MustCompile(`^[A-Za-z0-9_-]{8,64}$`)
	reVer   = regexp.MustCompile(`^[0-9a-z]{1,16}$`)
)

type Hub struct {
	mu      sync.Mutex
	rooms   map[string]*Room
	members map[string]*Member // by cid
	conns   int
	perIP   map[string]int
}

type Member struct {
	CID, ID, Dev, PID, Name, IP string
	sess                        *Sess
	room                        *Room
	Crowd                       int
	Ready, Synced, Late         bool
	Joined, GoneAt              int64
	WantAt                      int64
	report                      *Report
	Cos                         json.RawMessage
}

type Room struct {
	Code, Ver                            string
	Quick                                bool
	State                                string // lobby | playing
	Members                              []*Member
	Host                                 *Member
	Epoch                                int
	Created, StartAt, GoAt, BeganAt      int64
	EndsAt, LastBin, EmptyAt, HostGoneAt int64
	Meta                                 json.RawMessage
	MID                                  string
	Duration, Countdown                  float64
	Mode                                 string
	LobbyMode                            string // private room: the host's pick, shown to everyone in the lobby
	key                                  []byte
	tail                                 [][]byte
	hostReport                           *Report
	hostReportAt                         int64
	CreatorIP                            string
}

type ResultRow struct {
	Crowd int `json:"crowd"`
	Count int `json:"count"`
	Best  int `json:"best"`
	Kills int `json:"kills"`
	Rank  int `json:"rank"`
}

type Report struct {
	From *Member
	Rows []ResultRow
}

var hub = newHub()

// Game modes the boards know. Anything else (and the empty mode of pre-M4 clients) is Classic.
var validModes = map[string]bool{"classic": true, "teams": true, "koth": true, "lcs": true, "infection": true}

func boardMode(m string) string {
	if validModes[m] {
		return m
	}
	return "classic"
}

// serverFeatures lets new clients use additions an older server would refuse (no protocol bump needed).
var serverFeatures = []string{"mode", "boards-mode"}

func newHub() *Hub {
	return &Hub{rooms: map[string]*Room{}, members: map[string]*Member{}, perIP: map[string]int{}}
}

func encode(v any) []byte { b, _ := json.Marshal(v); return b }

func ev(t string, kv ...any) map[string]any {
	m := map[string]any{"t": t}
	for i := 0; i+1 < len(kv); i += 2 {
		m[kv[i].(string)] = kv[i+1]
	}
	return m
}

func short(prefix, s string) string {
	h := sha256.Sum256([]byte(prefix + s))
	return hex.EncodeToString(h[:6])
}

func pidOf(dev string) string { return short("throng-pid:", dev) }

// ---------------------------------------------------------------- connect

func (h *Hub) attach(s *Sess, m inMsg) bool {
	dev, cid := strings.ToLower(m.Dev), m.CID
	if !reHexID.MatchString(dev) || !reCID.MatchString(cid) || !reVer.MatchString(m.Sim) || !reVer.MatchString(m.Map) {
		s.fail(m.ID, "bad_request", "bad hello")
		return false
	}
	name, err := cleanName(m.Name)
	if err != nil {
		name = "Player " + strings.ToUpper(pidOf(dev)[:4])
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	mem := h.members[cid]
	if mem != nil && mem.Dev != dev {
		s.fail(m.ID, "bad_request", "bad hello")
		return false
	}
	ver := m.Sim + "." + m.Map
	if mem != nil && mem.room != nil && mem.room.Ver != ver { // reloaded into a new build: start afresh
		h.removeMember(mem, "version")
		mem = nil
	}
	if mem == nil {
		mem = &Member{CID: cid, ID: short("throng-id:", cid), Dev: dev, PID: pidOf(dev), Crowd: -1}
		h.members[cid] = mem
	}
	if old := mem.sess; old != nil && old != s {
		old.m = nil
		old.close(4003, "replaced")
	}
	mem.sess, mem.IP, mem.GoneAt = s, s.ip, 0
	s.ver = ver
	if mem.room == nil || mem.room.State == "lobby" {
		mem.Name = name
		mem.Cos = cleanCos(m.Cos)
	}
	s.m = mem
	s.push(map[string]any{"t": "welcome", "id": m.ID, "now": nowMs(), "v": protocolVersion,
		"you": map[string]any{"id": mem.ID, "pid": mem.PID, "name": mem.Name}, "ver": ver, "paused": paused(), "feat": serverFeatures})
	if r := mem.room; r != nil {
		r.EmptyAt = 0
		if r.State == "playing" && mem.Crowd >= 0 {
			if r.Host == mem {
				r.HostGoneAt = 0
				h.sendReplay(r, mem)
				s.push(ev("promote", "epoch", r.Epoch, "away", h.awayCrowds(r), "meta", r.Meta, "crowd", mem.Crowd, "mid", r.MID))
			} else {
				h.sendBegin(r, mem, mem.Late)
				h.toHost(r, ev("back", "crowd", mem.Crowd, "who", mem.ID, "name", mem.Name))
			}
		}
		h.pushRoom(r)
	}
	return true
}

func (h *Hub) detach(s *Sess) {
	h.mu.Lock()
	defer h.mu.Unlock()
	mem := s.m
	if mem == nil || mem.sess != s {
		return
	}
	mem.sess = nil
	mem.GoneAt = nowMs()
	r := mem.room
	if r == nil {
		delete(h.members, mem.CID)
		return
	}
	if r.State == "playing" {
		if r.Host == mem {
			r.HostGoneAt = nowMs()
			if s.code == websocket.StatusNormalClosure || s.code == websocket.StatusGoingAway {
				h.migrate(r, "left")
			}
		} else if mem.Crowd >= 0 {
			h.toHost(r, ev("away", "crowd", mem.Crowd, "who", mem.ID))
		}
	} else if r.Host == mem && (s.code == websocket.StatusNormalClosure || s.code == websocket.StatusGoingAway) {
		h.removeMember(mem, "left")
		return
	}
	h.pushRoom(r)
}

// ---------------------------------------------------------------- rooms

func (h *Hub) newRoom(quick bool, ver, ip string) *Room {
	code := newCode()
	for h.rooms[code] != nil {
		code = newCode()
	}
	now := nowMs()
	r := &Room{Code: code, Ver: ver, Quick: quick, State: "lobby", Created: now, CreatorIP: ip}
	if quick {
		r.StartAt = now + cfg.QuickWait.Milliseconds()
	}
	h.rooms[code] = r
	return r
}

func (h *Hub) humans(r *Room) int {
	n := 0
	for _, m := range r.Members {
		if m.Crowd >= 0 {
			n++
		}
	}
	return n
}

func (h *Hub) addMember(r *Room, mem *Member) {
	if mem.room == r {
		return
	}
	if mem.room != nil {
		h.removeMember(mem, "joined_other")
	}
	mem.room, mem.Crowd, mem.Ready, mem.Synced, mem.Late, mem.report, mem.WantAt = r, -1, false, false, false, nil, 0
	mem.Joined = nowMs()
	r.Members = append(r.Members, mem)
	if r.Host == nil {
		r.Host = mem
	}
	r.EmptyAt = 0
	if r.State == "playing" && r.EndsAt-nowMs() > lateMinLeft && h.humans(r) < maxCrowds && h.online(r.Host) {
		mem.WantAt = nowMs()
		h.toHost(r, ev("want", "who", mem.ID, "name", mem.Name, "cos", mem.Cos))
	}
}

func (h *Hub) removeMember(mem *Member, why string) {
	r := mem.room
	if r == nil {
		return
	}
	mem.room = nil
	for i, m := range r.Members {
		if m == mem {
			r.Members = append(r.Members[:i], r.Members[i+1:]...)
			break
		}
	}
	if mem.sess != nil {
		mem.sess.push(ev("closed", "code", r.Code, "reason", why))
	} else {
		delete(h.members, mem.CID)
	}
	crowd := mem.Crowd
	mem.Crowd = -1
	if len(r.Members) == 0 {
		delete(h.rooms, r.Code)
		return
	}
	if r.Host == mem {
		if r.State == "playing" {
			r.Host = nil
			h.migrate(r, why)
		} else {
			r.Host = h.pickHost(r, false)
			r.GoAt = 0
		}
	} else if r.State == "playing" && crowd >= 0 {
		h.toHost(r, ev("away", "crowd", crowd, "who", mem.ID))
	}
	h.pushRoom(r)
}

func (h *Hub) online(m *Member) bool { return m != nil && m.sess != nil }

// pickHost: the longest-standing connected member (synced = has the match state, for mid-match).
func (h *Hub) pickHost(r *Room, synced bool) *Member {
	var best *Member
	for _, m := range r.Members {
		if !h.online(m) || m == r.Host || (synced && (!m.Synced || m.Crowd < 0)) {
			continue
		}
		if best == nil || m.Joined < best.Joined {
			best = m
		}
	}
	if best == nil && r.Host != nil && !synced {
		return r.Host
	}
	return best
}

func (h *Hub) awayCrowds(r *Room) []int {
	out := []int{}
	for _, m := range r.Members {
		if m.Crowd >= 0 && !h.online(m) {
			out = append(out, m.Crowd)
		}
	}
	return out
}

// migrate hands the running match to another client: it gets the cached keyframe and every
// snapshot since (so it ends up at the last state the old host relayed), then `promote`.
func (h *Hub) migrate(r *Room, why string) {
	next := h.pickHost(r, true)
	if next == nil {
		return // nobody can take it: the old host may still come back
	}
	old := r.Host
	r.Host, r.Epoch, r.LastBin, r.HostGoneAt = next, r.Epoch+1, nowMs(), 0
	h.sendReplay(r, next)
	next.sess.push(ev("promote", "epoch", r.Epoch, "away", h.awayCrowds(r), "meta", r.Meta, "crowd", next.Crowd, "mid", r.MID, "why", why))
	if old != nil && old.Crowd >= 0 && old.room == r {
		next.sess.push(ev("away", "crowd", old.Crowd, "who", old.ID))
	}
	log.Printf("room %s: host → %s (epoch %d, %s)", r.Code, next.ID, r.Epoch, why)
	h.pushRoom(r)
}

func (h *Hub) sendReplay(r *Room, m *Member) {
	if r.key == nil || m.sess == nil {
		return
	}
	m.sess.sendBin(r.key)
	for _, b := range r.tail {
		m.sess.sendBin(b)
	}
	m.Synced = true
}

func (h *Hub) sendBegin(r *Room, m *Member, late bool) {
	if m.sess == nil {
		return
	}
	host := ""
	if r.Host != nil {
		host = r.Host.ID
	}
	m.sess.push(ev("begin", "meta", r.Meta, "crowd", m.Crowd, "epoch", r.Epoch, "mid", r.MID, "late", late,
		"beganAt", r.BeganAt, "endsAt", r.EndsAt, "host", host))
	if late || r.key != nil {
		h.sendReplay(r, m)
	}
}

func (h *Hub) toHost(r *Room, v any) {
	if r.Host != nil && r.Host.sess != nil {
		r.Host.sess.push(v)
	}
}

func (h *Hub) roomView(r *Room, you *Member) map[string]any {
	ms := make([]map[string]any, 0, len(r.Members))
	for _, m := range r.Members {
		ms = append(ms, map[string]any{"id": m.ID, "pid": m.PID, "name": m.Name, "ready": m.Ready, "host": m == r.Host,
			"crowd": m.Crowd, "online": h.online(m), "late": m.Late, "cos": m.Cos})
	}
	v := map[string]any{"code": r.Code, "quick": r.Quick, "state": r.State, "members": ms, "epoch": r.Epoch,
		"startAt": r.StartAt, "beganAt": r.BeganAt, "endsAt": r.EndsAt, "mid": r.MID, "now": nowMs(), "max": maxCrowds}
	if r.Host != nil {
		v["host"] = r.Host.ID
	}
	if r.LobbyMode != "" {
		v["mode"] = r.LobbyMode
	}
	if you != nil {
		v["you"] = you.ID
	}
	return v
}

func (h *Hub) pushRoom(r *Room) {
	for _, m := range r.Members {
		if m.sess != nil {
			m.sess.push(ev("room", "room", h.roomView(r, m)))
		}
	}
}

// ---------------------------------------------------------------- messages

func (h *Hub) dispatch(s *Sess, m inMsg) {
	h.mu.Lock()
	defer h.mu.Unlock()
	mem := s.m
	if mem == nil {
		return
	}
	r := mem.room
	switch m.T {
	case "ping":
		s.push(ev("pong", "c", m.C, "now", nowMs()))
	case "quick":
		if paused() {
			s.fail(m.ID, "paused", "online play is paused for maintenance")
			return
		}
		if !hit("quick", s.ip) {
			s.fail(m.ID, "rate_limited", "too many matches, wait a minute")
			return
		}
		ver := mem.verOrRoom(r)
		if ver == "" {
			s.fail(m.ID, "bad_request", "hello first")
			return
		}
		target := h.findQuick(ver)
		if target == nil {
			if len(h.rooms) >= cfg.MaxRooms {
				s.fail(m.ID, "busy", "the server is full, try again soon")
				return
			}
			target = h.newRoom(true, ver, s.ip)
		}
		h.addMember(target, mem)
		s.reply(m.ID, "room", h.roomView(target, mem))
		h.pushRoom(target)
	case "create":
		if paused() {
			s.fail(m.ID, "paused", "online play is paused for maintenance")
			return
		}
		if len(h.rooms) >= cfg.MaxRooms {
			s.fail(m.ID, "busy", "the server is full, try again soon")
			return
		}
		if !hit("room", s.ip) {
			s.fail(m.ID, "rate_limited", "too many rooms, wait a few minutes")
			return
		}
		ver := mem.verOrRoom(r)
		if ver == "" {
			s.fail(m.ID, "bad_request", "hello first")
			return
		}
		nr := h.newRoom(false, ver, s.ip)
		h.addMember(nr, mem)
		nr.Host = mem
		s.reply(m.ID, "room", h.roomView(nr, mem))
		h.pushRoom(nr)
	case "join":
		if !hit("joinip", s.ip) {
			s.fail(m.ID, "rate_limited", "too many tries, wait a few minutes")
			return
		}
		code := normCode(m.Code)
		target := h.rooms[code]
		if code == "" || target == nil || target.Quick {
			s.fail(m.ID, "no_room", "no room with that code")
			return
		}
		if target.Ver != mem.verOrRoom(r) {
			s.fail(m.ID, "version_mismatch", "that room is on a different version of THRONG: both players should reload")
			return
		}
		if target != r && len(target.Members) >= maxCrowds {
			s.fail(m.ID, "room_full", "that room is full")
			return
		}
		h.addMember(target, mem)
		s.reply(m.ID, "room", h.roomView(target, mem))
		h.pushRoom(target)
	case "leave":
		if r != nil {
			h.removeMember(mem, "left")
		}
		s.reply(m.ID)
	case "ready":
		if r == nil || r.State != "lobby" {
			return
		}
		mem.Ready = m.On
		h.pushRoom(r)
	case "rename":
		if r != nil && r.State == "playing" {
			return
		}
		if n, err := cleanName(m.Name); err == nil {
			mem.Name = n
			if r != nil {
				h.pushRoom(r)
			}
			s.reply(m.ID, "name", n)
		} else {
			s.fail(m.ID, "bad_name", "pick another name")
		}
	case "cos":
		if r != nil && r.State == "playing" {
			return
		}
		mem.Cos = cleanCos(m.Cos)
		if r != nil {
			h.pushRoom(r)
		}
	case "start":
		if r == nil || r.Host != mem || r.State != "lobby" {
			s.fail(m.ID, "not_now", "only the host can start, from the lobby")
			return
		}
		r.GoAt = nowMs()
		s.push(ev("go", "code", r.Code))
		s.reply(m.ID)
	case "mode":
		if r == nil || r.Quick || r.Host != mem || r.State != "lobby" {
			s.fail(m.ID, "not_now", "only the host picks the mode, in the room lobby")
			return
		}
		if !validModes[m.Mode] {
			s.fail(m.ID, "bad_request", "unknown mode")
			return
		}
		r.LobbyMode = m.Mode
		s.reply(m.ID)
		h.pushRoom(r)
	case "begin":
		h.begin(s, mem, r, m)
	case "meta":
		if r == nil || r.Host != mem || r.State != "playing" || len(m.Meta) > maxMetaBytes || !json.Valid(m.Meta) {
			return
		}
		r.Meta = m.Meta
		for _, o := range r.Members {
			if o != mem && o.sess != nil && o.Crowd >= 0 {
				o.sess.push(ev("meta", "meta", r.Meta))
			}
		}
	case "assign":
		if r == nil || r.Host != mem || r.State != "playing" || m.Crowd == nil {
			return
		}
		h.assign(r, m.Who, *m.Crowd)
	case "handoff":
		if r != nil && r.Host == mem && r.State == "playing" {
			h.migrate(r, "handoff")
		}
	case "result":
		h.result(s, mem, r, m)
	default:
		s.fail(m.ID, "bad_request", "unknown message")
	}
}

// verOrRoom: a member's build version comes from the hello that created it (kept on the session).
func (m *Member) verOrRoom(r *Room) string {
	if m.sess != nil && m.sess.ver != "" {
		return m.sess.ver
	}
	if r != nil {
		return r.Ver
	}
	return ""
}

func (h *Hub) findQuick(ver string) *Room {
	now := nowMs()
	var lobby, late *Room
	for _, r := range h.rooms {
		if !r.Quick || r.Ver != ver || r.Host == nil || !h.online(r.Host) {
			continue
		}
		if r.State == "lobby" && r.GoAt == 0 && len(r.Members) < maxCrowds {
			if lobby == nil || len(r.Members) > len(lobby.Members) || len(r.Members) == len(lobby.Members) && r.Created < lobby.Created {
				lobby = r
			}
		}
		if r.State == "playing" && r.EndsAt-now > lateMinLeft+2000 && h.humans(r) < maxCrowds && len(r.Members) < maxCrowds && r.key != nil {
			if late == nil || r.EndsAt > late.EndsAt {
				late = r
			}
		}
	}
	if lobby != nil {
		return lobby
	}
	return late
}

type matchMeta struct {
	Seed      json.RawMessage `json:"seed"`
	Duration  float64         `json:"duration"`
	Countdown float64         `json:"countdown"`
	Mode      string          `json:"mode"`
	Players   []struct {
		Name string `json:"name"`
		ID   string `json:"id"`
	} `json:"players"`
}

func (h *Hub) begin(s *Sess, mem *Member, r *Room, m inMsg) {
	if r == nil || r.Host != mem || r.State != "lobby" {
		s.fail(m.ID, "not_now", "not the host of a room in its lobby")
		return
	}
	var meta matchMeta
	if len(m.Meta) > maxMetaBytes || json.Unmarshal(m.Meta, &meta) != nil || len(meta.Players) < 1 || len(meta.Players) > maxCrowds ||
		meta.Duration < 10 || meta.Duration > 300 || meta.Countdown < 0 || meta.Countdown > 10 {
		s.fail(m.ID, "bad_request", "bad match")
		return
	}
	crowd := map[string]int{}
	for i, p := range meta.Players {
		if p.ID != "" {
			if _, dup := crowd[p.ID]; dup {
				s.fail(m.ID, "bad_request", "a player twice")
				return
			}
			crowd[p.ID] = i
		}
	}
	if _, ok := crowd[mem.ID]; !ok {
		s.fail(m.ID, "bad_request", "the host needs a crowd")
		return
	}
	now := nowMs()
	r.State, r.Meta, r.BeganAt, r.MID = "playing", m.Meta, now, newKey()[:12]
	r.Duration, r.Countdown = meta.Duration, meta.Countdown
	r.Mode = meta.Mode
	r.EndsAt = now + int64((meta.Duration+meta.Countdown)*1000)
	r.LastBin, r.key, r.tail, r.hostReport = now, nil, nil, nil
	for _, o := range r.Members {
		o.report, o.Late, o.Synced = nil, false, false
		if c, ok := crowd[o.ID]; ok {
			o.Crowd = c
		} else {
			o.Crowd = -1
		}
	}
	for _, o := range r.Members {
		if o.Crowd >= 0 {
			h.sendBegin(r, o, false)
		} else if o.sess != nil { // joined between go and begin
			o.WantAt = now
			h.toHost(r, ev("want", "who", o.ID, "name", o.Name, "cos", o.Cos))
		}
	}
	s.reply(m.ID, "mid", r.MID)
	h.pushRoom(r)
}

func (h *Hub) assign(r *Room, who string, crowd int) {
	var mem *Member
	for _, m := range r.Members {
		if m.ID == who {
			mem = m
		}
		if m.Crowd == crowd && crowd >= 0 {
			return // taken
		}
	}
	if mem == nil || mem.Crowd >= 0 || crowd < 0 || crowd >= maxCrowds {
		return
	}
	mem.Crowd, mem.Late, mem.WantAt = crowd, true, 0
	h.sendBegin(r, mem, true)
	h.pushRoom(r)
}

// binary relays snapshots host → guests and inputs guest → host. Nothing else is accepted.
func (h *Hub) binary(s *Sess, b []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()
	mem := s.m
	if mem == nil || mem.room == nil || len(b) < 1 {
		return
	}
	r := mem.room
	if r.State != "playing" {
		return
	}
	switch b[0] {
	case 1, 2: // snapshot, keyframe
		if r.Host != mem {
			return
		}
		if !s.bin.allow(hostRate) {
			s.limited(0)
			return
		}
		if len(b) < 16 {
			return
		}
		r.LastBin = nowMs()
		cp := append([]byte(nil), b...)
		if b[0] == 2 {
			r.key, r.tail = cp, r.tail[:0]
		} else if r.key != nil {
			if len(r.tail) >= maxTail {
				r.key, r.tail = nil, nil
			} else {
				r.tail = append(r.tail, cp)
			}
		}
		for _, o := range r.Members {
			if o == mem || o.sess == nil || o.Crowd < 0 {
				continue
			}
			if b[0] == 2 {
				o.Synced = true
			} else if !o.Synced {
				continue
			}
			o.sess.sendBin(cp)
		}
	case 3: // input
		if r.Host == mem || mem.Crowd < 0 || len(b) != 5 {
			return
		}
		if !s.bin.allow(guestRate) {
			s.limited(0)
			return
		}
		if r.Host != nil && r.Host.sess != nil {
			r.Host.sess.sendBin([]byte{3, byte(mem.Crowd), b[1], b[2], b[3], b[4]})
		}
	}
}

// ---------------------------------------------------------------- results

func (h *Hub) result(s *Sess, mem *Member, r *Room, m inMsg) {
	if r == nil || r.State != "playing" || m.MID != r.MID || mem.Crowd < 0 || len(m.Rows) > maxCrowds {
		return
	}
	rep := &Report{From: mem, Rows: m.Rows}
	mem.report = rep
	if r.Host == mem && r.hostReport == nil {
		r.hostReport, r.hostReportAt = rep, nowMs()
	}
}

func rowFor(rows []ResultRow, crowd int) *ResultRow {
	for i := range rows {
		if rows[i].Crowd == crowd {
			return &rows[i]
		}
	}
	return nil
}

// settle decides a finished match: written when the host's table is confirmed by another client
// (from a different device) on every human crowd, or when nobody else is there to confirm.
func (h *Hub) settle(r *Room, now int64) {
	hr := r.hostReport
	if hr == nil {
		if now > r.EndsAt+endSlack {
			h.endMatch(r, false, "no_result")
		}
		return
	}
	confirmers, confirmed := 0, false
	for _, m := range r.Members {
		if m == hr.From || m.Crowd < 0 || m.Dev == hr.From.Dev {
			continue
		}
		if h.online(m) {
			confirmers++
		}
		if m.report != nil && sameHumans(r, hr.Rows, m.report.Rows) {
			confirmed = true
		}
	}
	switch {
	case confirmed || confirmers == 0:
		ok := h.record(r, hr.Rows, now)
		h.endMatch(r, ok, "")
	case now-r.hostReportAt > confirmWait:
		log.Printf("room %s: result not confirmed, not recorded", r.Code)
		h.endMatch(r, false, "unconfirmed")
	}
}

func sameHumans(r *Room, a, b []ResultRow) bool {
	for _, m := range r.Members {
		if m.Crowd < 0 {
			continue
		}
		x, y := rowFor(a, m.Crowd), rowFor(b, m.Crowd)
		if x == nil || y == nil || *x != *y {
			return false
		}
	}
	return true
}

// plausible: caps on what a 2-minute match can produce (the host's browser is trusted for the rest, D11).
func plausible(r *Room, rows []ResultRow, now int64) bool {
	minRun := int64((r.Duration+r.Countdown)*1000) - 8000
	// these two modes end when one side is left, well before the clock
	if mode := boardMode(r.Mode); mode == "lcs" || mode == "infection" {
		minRun = int64((40 + r.Countdown) * 1000)
	}
	if r.Duration < 90 || r.Duration > 180 || now-r.BeganAt < minRun {
		return false
	}
	seen := map[int]bool{}
	for _, x := range rows {
		if x.Crowd < 0 || x.Crowd >= maxCrowds || x.Rank < 1 || x.Rank > maxCrowds || seen[x.Rank] ||
			x.Count < 0 || x.Best < x.Count || x.Best > 6000 || x.Kills < 0 || x.Kills > 60 {
			return false
		}
		seen[x.Rank] = true
	}
	return true
}

func (h *Hub) record(r *Room, rows []ResultRow, now int64) bool {
	if !plausible(r, rows, now) {
		log.Printf("room %s: implausible result, not recorded", r.Code)
		return false
	}
	var entries []boardEntry
	for _, m := range r.Members {
		if m.Crowd < 0 || m.Late {
			continue // late joiners took over a bot's crowd mid-match: their numbers are not all theirs
		}
		if x := rowFor(rows, m.Crowd); x != nil {
			entries = append(entries, boardEntry{PID: m.PID, Name: m.Name, Best: x.Best, Win: x.Rank == 1})
		}
	}
	return recordResults(r.MID, boardMode(r.Mode), entries, now) == nil
}

func (h *Hub) endMatch(r *Room, recorded bool, why string) {
	for _, m := range r.Members {
		if m.sess != nil {
			m.sess.push(ev("ended", "mid", r.MID, "recorded", recorded, "why", why))
		}
	}
	if r.Quick {
		for _, m := range append([]*Member(nil), r.Members...) {
			m.room, m.Crowd = nil, -1
			if m.sess == nil {
				delete(h.members, m.CID)
			}
		}
		delete(h.rooms, r.Code)
		return
	}
	r.State, r.MID, r.Meta, r.key, r.tail, r.hostReport, r.GoAt = "lobby", "", nil, nil, nil, nil, 0
	for _, m := range r.Members {
		m.Crowd, m.Ready, m.Late, m.Synced, m.report, m.WantAt = -1, false, false, false, nil, 0
	}
	if !h.online(r.Host) {
		r.Host = h.pickHost(r, false)
	}
	h.pushRoom(r)
}

// ---------------------------------------------------------------- timers

func (h *Hub) tick() {
	h.mu.Lock()
	defer h.mu.Unlock()
	now := nowMs()
	codes := make([]string, 0, len(h.rooms))
	for c := range h.rooms {
		codes = append(codes, c)
	}
	sort.Strings(codes)
	for _, c := range codes {
		r := h.rooms[c]
		if r == nil {
			continue
		}
		grace := int64(lobbyGrace)
		if r.State == "playing" {
			grace = playGrace
		}
		for _, m := range append([]*Member(nil), r.Members...) {
			if m.sess == nil && m.GoneAt > 0 && now-m.GoneAt > grace && m.room == r {
				h.removeMember(m, "gone")
			}
		}
		if h.rooms[c] == nil {
			continue
		}
		live := false
		for _, m := range r.Members {
			live = live || h.online(m)
		}
		if !live {
			if r.EmptyAt == 0 {
				r.EmptyAt = now
			} else if now-r.EmptyAt > emptyClose {
				for _, m := range append([]*Member(nil), r.Members...) {
					h.removeMember(m, "empty")
				}
				delete(h.rooms, c)
				continue
			}
		}
		switch r.State {
		case "lobby":
			if !h.online(r.Host) {
				if nh := h.pickHost(r, false); nh != nil && nh != r.Host {
					r.Host, r.GoAt = nh, 0
					h.pushRoom(r)
				}
			}
			if r.Quick && r.GoAt == 0 && h.online(r.Host) && (now >= r.StartAt || len(r.Members) >= maxCrowds) {
				r.GoAt = now
				r.Host.sess.push(ev("go", "code", r.Code))
			} else if r.GoAt > 0 && now-r.GoAt > goTimeout {
				if nh := h.pickHost(r, false); nh != nil && nh != r.Host {
					r.Host = nh
					h.pushRoom(r)
				}
				r.GoAt = 0
				if !r.Quick {
					h.pushRoom(r)
				}
			}
		case "playing":
			if r.hostReport == nil && (r.Host == nil || (!h.online(r.Host) && r.HostGoneAt > 0 && now-r.HostGoneAt > hostGrace) || now-r.LastBin > hostSilence) {
				h.migrate(r, "silent")
			}
			for _, m := range r.Members {
				if m.WantAt > 0 && now-m.WantAt > wantTimeout && m.Crowd < 0 {
					m.WantAt = 0
					if m.sess != nil {
						m.sess.push(ev("error", "code", "late_failed", "error", "could not join the running match: you are in for the next one"))
					}
				}
			}
			h.settle(r, now)
		}
	}
}

// cleanCos keeps a player's crowd cosmetics small and inert: known keys, short strings, nothing else.
// The renderer ignores ids it does not know, so the values are not checked against the shop.
func cleanCos(raw json.RawMessage) json.RawMessage {
	if len(raw) == 0 || len(raw) > 400 {
		return nil
	}
	var in map[string]any
	if json.Unmarshal(raw, &in) != nil {
		return nil
	}
	out := map[string]any{}
	for _, k := range []string{"hat", "leader", "flag", "trail", "ring"} {
		if v, ok := in[k].(string); ok && v != "" && len(v) <= 16 {
			if c, err := cleanName(v); err == nil && c == v {
				out[k] = v
			}
		}
	}
	if v, ok := in["hatShare"].(float64); ok && v >= 0 && v <= 1 {
		out["hatShare"] = v
	}
	if len(out) == 0 {
		return nil
	}
	b, _ := json.Marshal(out)
	return b
}
