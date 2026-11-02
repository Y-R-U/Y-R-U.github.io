package main

// A room: members in the lobby, then a round where everyone plays the same hole at once.
//
// Flow: lobby → start (ghost AIs fill seats) → per hole: play (shots relayed as they happen,
// results reported when each ball stops) → board (scoreboard; next hole when everyone taps
// Next or after boardSecs) → … → ended (results; the host can play again = back to lobby).
//
// AI seats (and humans who dropped out, "AI takeover") are driven by the host's client with
// js/ai (the server has no physics). Their shots arrive from the host and are relayed like a
// player's. If the host goes away, the next connected human becomes host and takes over.

import (
	"encoding/json"
	"fmt"
	"log"
	"sort"
	"time"
)

const (
	quickWait      = 20 * time.Second // quick-play rooms start this long after creation…
	quickJoinWait  = 6 * time.Second  // …and at least this long after the latest join
	holeDelay      = 1500 * time.Millisecond
	boardSecs      = 20 * time.Second  // scoreboard between holes
	hostGrace      = 10 * time.Second  // host offline this long → next human becomes host
	takeoverAfter  = 30 * time.Second  // a human offline this long mid-round → an AI plays their seat
	flightTimeout  = 45 * time.Second  // a shot without a result this long is voided
	noShotClockCap = 6 * time.Minute   // hole time cap without a shot clock
	roomTTL        = 3 * time.Hour     // hard cap on a room's life
	endedTTL       = 10 * time.Minute  // results stay up this long
	lobbyEmpty     = 60 * time.Second  // no human connected this long → close
	playEmpty      = 180 * time.Second // (mid-round: people reload, phones sleep)
	takeoverSkill  = 0.45
)

// Seat colours (ghost balls, names on the board), by seat index.
var seatColors = []string{"#ff5a5a", "#4fc3ff", "#ffd34d", "#6fe39a", "#c38bff", "#ff9a3c", "#ff6fc8", "#4fd6d6"}

type AISpec struct {
	Personality string  `json:"personality"`
	Skill       float64 `json:"skill"`
	Seed        int64   `json:"seed"`
}

type Flight struct {
	N       int
	Strokes int // strokes before the shot
	From    *[3]float64
	At      int64
}

type Prev struct {
	Strokes int
	Pos     *[3]float64
}

type HoleState struct {
	Strokes, N   int
	Pos          *[3]float64 // nil = on the tee
	Done, Picked bool
	Flight       *Flight
	Prev         *Prev // for Mulligan
}

type Seat struct {
	Kind     string // human | ai
	UID, PID string
	Name     string
	Anon     bool
	AI       *AISpec // the AI that plays it (ai seats, or a human seat during takeover)
	Ctrl     string  // human | ai
	Left     bool    // the human left the room mid-round (an AI finishes for them)
	JoinedAt int64
	Scores   []int // per hole, -1 = not played yet
	Picked   []bool
	Uses     map[string]int
	Cur      HoleState
	Next     bool
}

type Room struct {
	Code      string
	Opts      RoomOpts
	Quick     bool
	State     string // lobby | playing | ended
	Host      string // host uid
	Seats     []*Seat
	IP        string
	Created   int64
	StartAt   int64 // quick rooms: auto start
	StartedAt int64
	Hole      int
	Phase     string // play | board
	HoleAt    int64  // shared obstacle clock zero for this hole (server ms)
	CapAt     int64
	BoardAt   int64
	EmptyAt   int64
	EndedAt   int64
	RoundID   string
	Seed      int64
}

func (r *Room) seatOf(uid string) int {
	for i, s := range r.Seats {
		if s.Kind == "human" && s.UID == uid {
			return i
		}
	}
	return -1
}

func (r *Room) humans() int {
	n := 0
	for _, s := range r.Seats {
		if s.Kind == "human" && !s.Left {
			n++
		}
	}
	return n
}

func (h *Hub) online(uid string) bool { u := h.users[uid]; return u != nil && len(u.sess) > 0 }

// connectedHumans counts humans still in the room with a live connection.
func (h *Hub) connectedHumans(r *Room) int {
	n := 0
	for _, s := range r.Seats {
		if s.Kind == "human" && !s.Left && h.online(s.UID) {
			n++
		}
	}
	return n
}

func (r *Room) par() int        { return r.Opts.Holes[r.Hole].Par }
func (r *Room) maxStrokes() int { return r.par() + 4 } // D10

func (s *Seat) total() int {
	t := 0
	for _, v := range s.Scores {
		if v > 0 {
			t += v
		}
	}
	return t
}

// ---------------------------------------------------------------- views

func posView(p *[3]float64) any {
	if p == nil {
		return nil
	}
	return []float64{p[0], p[1], p[2]}
}

func (h *Hub) seatView(r *Room, i int) map[string]any {
	s := r.Seats[i]
	m := map[string]any{"i": i, "kind": s.Kind, "name": s.Name, "color": seatColors[i%len(seatColors)], "ctrl": s.Ctrl,
		"left": s.Left, "next": s.Next, "total": s.total(), "scores": s.Scores, "picked": s.Picked, "uses": s.Uses,
		"cur": map[string]any{"strokes": s.Cur.Strokes, "n": s.Cur.N, "pos": posView(s.Cur.Pos), "done": s.Cur.Done,
			"picked": s.Cur.Picked, "flying": s.Cur.Flight != nil, "mull": s.Cur.Prev != nil}}
	if s.Kind == "human" {
		m["pid"], m["anon"], m["online"], m["host"] = s.PID, s.Anon, h.online(s.UID), s.UID == r.Host
	} else {
		m["online"] = true
	}
	if s.AI != nil {
		m["ai"] = s.AI
	}
	return m
}

func (h *Hub) roomView(r *Room, uid string) map[string]any {
	seats := make([]any, len(r.Seats))
	host := -1
	for i := range r.Seats {
		seats[i] = h.seatView(r, i)
		if r.Seats[i].Kind == "human" && r.Seats[i].UID == r.Host {
			host = i
		}
	}
	return map[string]any{"code": r.Code, "opts": r.Opts, "quick": r.Quick, "state": r.State, "host": host, "you": r.seatOf(uid),
		"created": r.Created, "startAt": r.StartAt, "startedAt": r.StartedAt, "hole": r.Hole, "phase": r.Phase,
		"holeAt": r.HoleAt, "capAt": r.CapAt, "boardAt": r.BoardAt, "nextAt": r.nextAt(), "endedAt": r.EndedAt,
		"roundId": r.RoundID, "seats": seats, "now": nowMs()}
}

func (r *Room) nextAt() int64 {
	if r.State == "playing" && r.Phase == "board" {
		return r.BoardAt + boardSecs.Milliseconds()
	}
	return 0
}

// listing is the lobby row of a public room.
func (h *Hub) listing(r *Room) map[string]any {
	hostName := ""
	if i := r.seatOf(r.Host); i >= 0 {
		hostName = r.Seats[i].Name
	}
	return map[string]any{"code": r.Code, "name": r.Opts.Name, "quick": r.Quick, "players": r.humans(), "max": r.Opts.Max,
		"holes": len(r.Opts.Holes), "course": r.Opts.Course, "courseName": r.Opts.CourseName, "theme": r.Opts.Theme,
		"helpers": r.Opts.Helpers, "shotClock": r.Opts.ShotClock, "ai": r.Opts.AI, "host": hostName,
		"startAt": r.StartAt, "created": r.Created}
}

// pushRoom sends every member their own snapshot (as `t`, default "room").
func (h *Hub) pushRoom(r *Room, extra ...any) {
	for _, s := range r.Seats {
		if s.Kind != "human" || s.Left {
			continue
		}
		if u := h.users[s.UID]; u != nil {
			m := ev("room", "room", h.roomView(r, s.UID))
			for i := 0; i+1 < len(extra); i += 2 {
				m[extra[i].(string)] = extra[i+1]
			}
			h.pushUser(u, m)
		}
	}
	if r.Opts.Public && r.State == "lobby" {
		h.dirty = true
	}
}

// pushEv sends an event to every member except `except` (uid, "" = everyone).
func (h *Hub) pushEv(r *Room, except string, v map[string]any) {
	b := encode(v)
	for _, s := range r.Seats {
		if s.Kind != "human" || s.Left || s.UID == except {
			continue
		}
		if u := h.users[s.UID]; u != nil {
			for ss := range u.sess {
				ss.sendRaw(b)
			}
		}
	}
}

// ---------------------------------------------------------------- lifecycle

func (h *Hub) newRoom(u *User, o RoomOpts, quick bool) *Room {
	now := nowMs()
	code := newCode()
	for h.rooms[code] != nil {
		code = newCode()
	}
	r := &Room{Code: code, Opts: o, Quick: quick, State: "lobby", Host: u.UID, IP: u.IP, Created: now, Seed: now ^ int64(len(h.rooms))*7919}
	if quick {
		r.StartAt = now + quickWait.Milliseconds()
	}
	h.rooms[code] = r
	h.addMember(r, u)
	return r
}

func newSeatHuman(u *User) *Seat {
	return &Seat{Kind: "human", UID: u.UID, PID: u.PID, Name: u.Name, Anon: u.Anon, Ctrl: "human", JoinedAt: nowMs(), Uses: map[string]int{}}
}

// addMember seats u in the lobby (lock held; caller checked state and space).
func (h *Hub) addMember(r *Room, u *User) {
	if u.room != nil && u.room != r {
		h.leave(u, "joined_other")
	}
	u.room = r
	if r.seatOf(u.UID) < 0 {
		s := newSeatHuman(u)
		s.Name = dedupeName(u.Name, func(n string) bool {
			for _, x := range r.Seats {
				if equalFoldName(x.Name, n) {
					return true
				}
			}
			return false
		})
		r.Seats = append(r.Seats, s)
	}
	if r.Quick {
		r.StartAt = max(r.StartAt, nowMs()+quickJoinWait.Milliseconds())
	}
	r.EmptyAt = 0
}

// leave takes u out of their room (lock held). In the lobby the seat goes; mid-round it stays
// (scores count) and an AI finishes it.
func (h *Hub) leave(u *User, reason string) {
	r := u.room
	if r == nil {
		return
	}
	u.room = nil
	i := r.seatOf(u.UID)
	if i < 0 {
		return
	}
	if r.State == "playing" {
		s := r.Seats[i]
		s.Left = true
		h.takeover(r, s)
	} else {
		r.Seats = append(r.Seats[:i], r.Seats[i+1:]...)
	}
	h.pushUser(u, ev("roomClosed", "code", r.Code, "reason", "left"))
	if r.Host == u.UID {
		h.migrateHost(r)
	}
	if r.humans() == 0 {
		h.closeRoom(r, "empty")
		return
	}
	if r.State == "playing" {
		h.checkHole(r)
	}
	h.pushRoom(r)
}

func (h *Hub) closeRoom(r *Room, reason string) {
	if h.rooms[r.Code] != r {
		return
	}
	delete(h.rooms, r.Code)
	for _, s := range r.Seats {
		if s.Kind != "human" {
			continue
		}
		if u := h.users[s.UID]; u != nil && u.room == r {
			u.room = nil
			if !s.Left {
				h.pushUser(u, ev("roomClosed", "code", r.Code, "reason", reason))
			}
		}
	}
	if r.Opts.Public {
		h.dirty = true
	}
}

// migrateHost hands the room to the longest-seated connected human (lock held). With nobody
// connected the host stays as is (the room closes if nobody comes back).
func (h *Hub) migrateHost(r *Room) bool {
	best := -1
	for i, s := range r.Seats {
		if s.Kind != "human" || s.Left || s.UID == r.Host || !h.online(s.UID) {
			continue
		}
		if best < 0 || s.JoinedAt < r.Seats[best].JoinedAt {
			best = i
		}
	}
	if best < 0 {
		if i := r.seatOf(r.Host); i >= 0 && !r.Seats[i].Left {
			return false
		}
		for i, s := range r.Seats { // host left for good: anyone still seated, connected or not
			if s.Kind == "human" && !s.Left {
				best = i
				break
			}
		}
		if best < 0 {
			return false
		}
	}
	r.Host = r.Seats[best].UID
	// shots the old host had in flight for AI seats will never get a result
	for _, s := range r.Seats {
		if s.Ctrl == "ai" {
			h.voidFlight(r, s)
		}
	}
	return true
}

// takeover hands a human seat to an AI for the rest of the round (lock held).
func (h *Hub) takeover(r *Room, s *Seat) {
	if s.Ctrl == "ai" {
		return
	}
	s.Ctrl = "ai"
	if s.AI == nil {
		s.AI = &AISpec{Personality: "pro", Skill: min(takeoverSkill, r.Opts.AI.Skill+0.1), Seed: r.Seed + int64(len(s.Name))}
		if s.AI.Skill < minAISkill {
			s.AI.Skill = takeoverSkill
		}
	}
	h.voidFlight(r, s)
}

// voidFlight cancels a shot whose result will never come (lock held): no stroke, the ball
// stays where it was; clients snap their ghost back.
func (h *Hub) voidFlight(r *Room, s *Seat) {
	f := s.Cur.Flight
	if f == nil {
		return
	}
	s.Cur.Flight = nil
	s.Cur.N++
	h.pushEv(r, "", ev("result", "seat", h.seatIndex(r, s), "hole", r.Hole, "n", f.N, "state", "void",
		"to", posView(f.From), "strokes", s.Cur.Strokes, "done", s.Cur.Done, "picked", s.Cur.Picked))
}

func (h *Hub) seatIndex(r *Room, s *Seat) int {
	for i, x := range r.Seats {
		if x == s {
			return i
		}
	}
	return -1
}

// start fills empty seats with ghost AIs and begins hole 1 (lock held).
func (h *Hub) start(r *Room) {
	now := nowMs()
	free := r.Opts.Max - r.humans()
	n := min(free, r.Opts.AI.Count)
	if r.Quick {
		n = free // quick play always fills the table
	}
	taken := func(name string) bool {
		for _, s := range r.Seats {
			if equalFoldName(s.Name, name) {
				return true
			}
		}
		return false
	}
	for k := 0; k < n; k++ {
		p := r.Opts.AI.Personality
		if p == "any" || p == "" {
			p = anyPersonalities[int((r.Seed/7+int64(k)*5)%int64(len(anyPersonalities))+int64(len(anyPersonalities)))%len(anyPersonalities)]
		}
		name := dedupeName(personalities[p], taken)
		skill := r.Opts.AI.Skill
		if r.Opts.AI.Personality == "any" { // a mixed field spreads a little around the chosen rank
			skill = clampF(skill+float64((k*37)%9-4)*0.01, minAISkill, maxAISkill)
		}
		r.Seats = append(r.Seats, &Seat{Kind: "ai", PID: fmt.Sprintf("ai%d", len(r.Seats)), Name: name, Ctrl: "ai",
			AI: &AISpec{Personality: p, Skill: skill, Seed: r.Seed*31 + int64(k)*1009 + 17}, JoinedAt: now, Uses: map[string]int{}})
	}
	nh := len(r.Opts.Holes)
	for _, s := range r.Seats {
		s.Scores, s.Picked = make([]int, nh), make([]bool, nh)
		for i := range s.Scores {
			s.Scores[i] = -1
		}
		s.Uses = map[string]int{}
	}
	r.State, r.StartedAt, r.StartAt = "playing", now, 0
	r.RoundID = randString("abcdefghijkmnpqrstuvwxyz23456789", 10)
	if r.Opts.Public {
		h.dirty = true
	}
	h.startHole(r, 0)
}

func (h *Hub) holeCap(r *Room) time.Duration {
	if r.Opts.ShotClock > 0 {
		return time.Duration(r.Opts.ShotClock+15)*time.Second*time.Duration(r.maxStrokes()) + 30*time.Second
	}
	return noShotClockCap
}

func (h *Hub) startHole(r *Room, i int) {
	now := nowMs()
	r.Hole, r.Phase = i, "play"
	r.HoleAt = now + holeDelay.Milliseconds()
	r.CapAt = r.HoleAt + h.holeCap(r).Milliseconds()
	r.BoardAt = 0
	for _, s := range r.Seats {
		s.Cur = HoleState{}
		s.Next = false
	}
	h.pushRoom(r, "ev", "holeStart")
}

// checkHole ends the hole when every seat is done (lock held).
func (h *Hub) checkHole(r *Room) {
	if r.State != "playing" || r.Phase != "play" {
		return
	}
	for _, s := range r.Seats {
		if !s.Cur.Done {
			return
		}
	}
	h.endHole(r)
}

func (h *Hub) endHole(r *Room) {
	r.Phase, r.BoardAt = "board", nowMs()
	for _, s := range r.Seats {
		if !s.Cur.Done { // time cap: picked up at par + 4
			s.Cur.Done, s.Cur.Picked, s.Cur.Strokes = true, true, r.maxStrokes()
			s.Cur.Flight = nil
		}
		score := min(s.Cur.Strokes, r.maxStrokes())
		s.Scores[r.Hole], s.Picked[r.Hole] = score, s.Cur.Picked
	}
	if r.Hole == len(r.Opts.Holes)-1 {
		h.endRound(r)
		return
	}
	h.pushRoom(r, "ev", "holeEnd")
}

// standings: seat indices by total (then by best last hole), with shared ranks.
func standings(r *Room) ([]int, []int) {
	idx := make([]int, len(r.Seats))
	for i := range idx {
		idx[i] = i
	}
	sort.SliceStable(idx, func(a, b int) bool { return r.Seats[idx[a]].total() < r.Seats[idx[b]].total() })
	rank := make([]int, len(r.Seats))
	for k, i := range idx {
		if k > 0 && r.Seats[i].total() == r.Seats[idx[k-1]].total() {
			rank[i] = rank[idx[k-1]]
		} else {
			rank[i] = k + 1
		}
	}
	return idx, rank
}

func (h *Hub) endRound(r *Room) {
	r.State, r.Phase, r.EndedAt = "ended", "", nowMs()
	order, rank := standings(r)
	type row struct {
		Name   string `json:"name"`
		PID    string `json:"pid"`
		Kind   string `json:"kind"`
		Scores []int  `json:"scores"`
		Total  int    `json:"total"`
		Rank   int    `json:"rank"`
	}
	rows := []row{}
	humans := []roundPlayer{}
	for _, i := range order {
		s := r.Seats[i]
		rows = append(rows, row{s.Name, s.PID, s.Kind, s.Scores, s.total(), rank[i]})
		if s.Kind == "human" {
			humans = append(humans, roundPlayer{s.UID, s.total(), rank[i]})
		}
	}
	hj, _ := json.Marshal(r.Opts.Holes)
	sj, _ := json.Marshal(rows)
	storeRound(r.RoundID, r.Code, string(hj), string(sj), r.StartedAt, humans)
	log.Printf("round %s (room %s) finished: %d seats, %d holes", r.RoundID, r.Code, len(r.Seats), len(r.Opts.Holes))
	h.pushRoom(r, "ev", "end")
}

// again (host, after the round): back to the lobby with whoever is still here.
func (h *Hub) again(r *Room) {
	keep := []*Seat{}
	for _, s := range r.Seats {
		if s.Kind == "human" && !s.Left {
			s.Ctrl, s.AI, s.Scores, s.Picked, s.Cur, s.Next = "human", nil, nil, nil, HoleState{}, false
			keep = append(keep, s)
		}
	}
	r.Seats = keep
	r.State, r.Phase, r.Hole, r.RoundID, r.EndedAt, r.StartedAt = "lobby", "", 0, "", 0, 0
	if r.Quick {
		r.StartAt = nowMs() + quickWait.Milliseconds()
	}
	h.pushRoom(r)
}

// ---------------------------------------------------------------- timers

func (h *Hub) tickRoom(r *Room, now int64) {
	if h.connectedHumans(r) == 0 {
		if r.EmptyAt == 0 {
			r.EmptyAt = now
		}
		grace := lobbyEmpty
		if r.State == "playing" {
			grace = playEmpty
		}
		if now-r.EmptyAt > grace.Milliseconds() {
			h.closeRoom(r, "empty")
			return
		}
	} else {
		r.EmptyAt = 0
	}
	if now-r.Created > roomTTL.Milliseconds() {
		h.closeRoom(r, "expired")
		return
	}
	switch r.State {
	case "lobby":
		if r.Quick && r.StartAt > 0 && now >= r.StartAt && h.online(r.Host) {
			h.start(r)
		}
	case "ended":
		if now-r.EndedAt > endedTTL.Milliseconds() {
			h.closeRoom(r, "expired")
		}
	case "playing":
		changed := false
		if hu := h.users[r.Host]; (hu == nil || len(hu.sess) == 0) && (hu == nil || now-hu.goneAt > hostGrace.Milliseconds()) {
			changed = h.migrateHost(r) || changed
		}
		for _, s := range r.Seats {
			if s.Kind == "human" && s.Ctrl == "human" && !s.Left {
				if u := h.users[s.UID]; u == nil || (len(u.sess) == 0 && now-u.goneAt > takeoverAfter.Milliseconds()) {
					h.takeover(r, s)
					changed = true
				}
			}
			if f := s.Cur.Flight; f != nil && now-f.At > flightTimeout.Milliseconds() {
				h.voidFlight(r, s)
			}
		}
		switch {
		case r.Phase == "play" && now > r.CapAt:
			h.endHole(r)
			return
		case r.Phase == "board" && now > r.nextAt():
			h.startHole(r, r.Hole+1)
			return
		}
		if changed {
			h.pushRoom(r)
		}
	}
}

// ---------------------------------------------------------------- play

// canDrive: may uid send shots for seat i? Its own human seat, or (host) an AI-run seat.
func (r *Room) canDrive(uid string, i int) bool {
	if i < 0 || i >= len(r.Seats) {
		return false
	}
	s := r.Seats[i]
	if s.Ctrl == "ai" {
		return uid == r.Host
	}
	return s.Kind == "human" && s.UID == uid
}

// helperCheck: a shot (or mulligan) spending `uses` is allowed by the room's helper mode.
func (r *Room) helperCheck(s *Seat, uses map[string]int) string {
	if len(uses) == 0 {
		return ""
	}
	switch r.Opts.Helpers.Mode {
	case "off":
		return "no_helpers"
	case "fixed":
		for id, n := range uses {
			if s.Uses[id]+n > r.Opts.Helpers.N {
				return "no_helpers_left"
			}
		}
	}
	return "" // own inventory: the client's own count (D11)
}

func (h *Hub) shot(u *User, m inMsg) (map[string]any, string) {
	r := u.room
	if r == nil {
		return nil, "no_room"
	}
	if r.State != "playing" || r.Phase != "play" {
		return nil, "not_now"
	}
	i := r.seatOf(u.UID)
	if m.Seat != nil {
		i = *m.Seat
	}
	if !r.canDrive(u.UID, i) {
		return nil, "not_your_seat"
	}
	s := r.Seats[i]
	switch {
	case m.Hole == nil || *m.Hole != r.Hole:
		return nil, "stale_hole"
	case s.Cur.Done:
		return nil, "hole_done"
	case s.Cur.Flight != nil:
		return nil, "in_flight"
	case m.N == nil || *m.N != s.Cur.N:
		return nil, "stale_shot"
	case !finite(m.VX) || !finite(m.VZ) || m.VX*m.VX+m.VZ*m.VZ > 81 || !finite(m.T0) || !finite(m.Aim) || !finite(m.Power):
		return nil, "bad_shot"
	case m.Ball == nil || !m.Ball.ok():
		return nil, "bad_shot"
	}
	uses := m.Mods.uses()
	if code := r.helperCheck(s, uses); code != "" {
		return nil, code
	}
	for id, n := range uses {
		s.Uses[id] += n
	}
	from := &[3]float64{m.Ball.X, m.Ball.Y, m.Ball.Z}
	s.Cur.Flight = &Flight{N: s.Cur.N, Strokes: s.Cur.Strokes, From: from, At: nowMs()}
	s.Cur.Prev = &Prev{Strokes: s.Cur.Strokes, Pos: s.Cur.Pos}
	h.pushEv(r, u.UID, ev("shot", "seat", i, "hole", r.Hole, "n", s.Cur.N, "vx", m.VX, "vz", m.VZ, "t0", m.T0,
		"aim", m.Aim, "power", m.Power, "mods", m.Mods, "ball", m.Ball))
	return map[string]any{"seat": i, "n": s.Cur.N}, ""
}

func (h *Hub) result(u *User, m inMsg) (map[string]any, string) {
	r := u.room
	if r == nil {
		return nil, "no_room"
	}
	if r.State != "playing" || r.Phase != "play" {
		return nil, "not_now"
	}
	i := r.seatOf(u.UID)
	if m.Seat != nil {
		i = *m.Seat
	}
	if !r.canDrive(u.UID, i) {
		return nil, "not_your_seat"
	}
	s := r.Seats[i]
	f := s.Cur.Flight
	switch {
	case m.Hole == nil || *m.Hole != r.Hole:
		return nil, "stale_hole"
	case f == nil || m.N == nil || *m.N != f.N:
		return nil, "stale_shot"
	}
	// strokes are counted here from the outcome: +1 per shot, +1 more out of bounds (D9)
	strokes := f.Strokes + 1
	switch m.State {
	case "cup":
	case "rest":
		if !okVec(m.To) {
			return nil, "bad_result"
		}
		s.Cur.Pos = &[3]float64{m.To[0], m.To[1], m.To[2]}
	case "oob":
		strokes++
		if okVec(m.To) {
			s.Cur.Pos = &[3]float64{m.To[0], m.To[1], m.To[2]}
		} else {
			s.Cur.Pos = f.From
		}
	default:
		return nil, "bad_result"
	}
	s.Cur.Flight = nil
	s.Cur.N++
	s.Cur.Strokes = min(strokes, r.maxStrokes())
	if m.State == "cup" {
		s.Cur.Done, s.Cur.Prev = true, nil
	} else if s.Cur.Strokes >= r.maxStrokes() {
		s.Cur.Done, s.Cur.Picked, s.Cur.Prev = true, true, nil
	}
	h.pushEv(r, u.UID, ev("result", "seat", i, "hole", r.Hole, "n", f.N, "state", m.State, "to", posView(s.Cur.Pos),
		"strokes", s.Cur.Strokes, "done", s.Cur.Done, "picked", s.Cur.Picked))
	out := map[string]any{"seat": i, "strokes": s.Cur.Strokes, "done": s.Cur.Done, "picked": s.Cur.Picked}
	h.checkHole(r)
	return out, ""
}

func (h *Hub) mulligan(u *User, m inMsg) (map[string]any, string) {
	r := u.room
	if r == nil {
		return nil, "no_room"
	}
	if r.State != "playing" || r.Phase != "play" {
		return nil, "not_now"
	}
	i := r.seatOf(u.UID)
	if m.Seat != nil {
		i = *m.Seat
	}
	if !r.canDrive(u.UID, i) {
		return nil, "not_your_seat"
	}
	s := r.Seats[i]
	if m.Hole == nil || *m.Hole != r.Hole {
		return nil, "stale_hole"
	}
	if s.Cur.Done || s.Cur.Flight != nil || s.Cur.Prev == nil {
		return nil, "not_now"
	}
	uses := map[string]int{"mulligan": 1}
	if code := r.helperCheck(s, uses); code != "" {
		return nil, code
	}
	s.Uses["mulligan"]++
	s.Cur.Strokes, s.Cur.Pos, s.Cur.Prev = s.Cur.Prev.Strokes, s.Cur.Prev.Pos, nil
	h.pushEv(r, u.UID, ev("mulligan", "seat", i, "hole", r.Hole, "to", posView(s.Cur.Pos), "strokes", s.Cur.Strokes))
	return map[string]any{"seat": i, "strokes": s.Cur.Strokes, "to": posView(s.Cur.Pos)}, ""
}

// next: a player is ready for the next hole; it starts when every connected human is.
func (h *Hub) next(u *User) string {
	r := u.room
	if r == nil {
		return "no_room"
	}
	if r.State != "playing" || r.Phase != "board" {
		return "not_now"
	}
	i := r.seatOf(u.UID)
	if i < 0 {
		return "no_room"
	}
	r.Seats[i].Next = true
	for _, s := range r.Seats {
		if s.Kind == "human" && !s.Left && h.online(s.UID) && !s.Next {
			h.pushRoom(r)
			return ""
		}
	}
	h.startHole(r, r.Hole+1)
	return ""
}
