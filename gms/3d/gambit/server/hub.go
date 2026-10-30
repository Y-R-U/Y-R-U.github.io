package main

// The hub owns every piece of live state (users, seeks, rooms, games) under one mutex.
// The box has one CPU and games see a move every few seconds, so one lock is plenty and
// keeps the reasoning simple. Network I/O (payments calls, websocket writes) never
// happens with the lock held: writes go through each session's buffered channel.

import (
	"encoding/json"
	"log"
	"sort"
	"sync"
	"time"
)

type Hub struct {
	mu     sync.Mutex
	users  map[string]*User
	games  map[string]*Game
	seeks  []*Seek
	rooms  map[string]*Room
	conns  int
	perIP  map[string]int
	dirty  bool  // lobby changed since last broadcast
	sentAt int64 // last lobby broadcast
}

type User struct {
	UID, Name, PID   string
	Anon, Admin, Dev bool
	IP               string
	Tok              string // latest verified Firebase token (signed-in, for payments)
	sess             map[*Sess]bool
	goneAt           int64
	allow            Allow // payments mode cache
	seek             *Seek
	rooms            map[string]*Room
	games            map[string]*Game
}

type Seek struct {
	U      *User
	TC     TimeControl
	Rated  bool
	Rating int
	At     int64
}

type Room struct {
	Code    string
	Public  bool
	Name    string
	TC      TimeControl
	Rated   bool
	Color   string // w | b | random (the host's colour)
	Host    *User
	Rating  int
	Prov    bool
	Created int64
}

const (
	maxRoomsPerUser     = 2
	maxUnlimitedPerUser = 10
	rematchWindow       = 5 * time.Minute
	roomHostGrace       = 60 * time.Second
	roomTTL             = 30 * time.Minute
	unlimitedRoomTTL    = 3 * 24 * time.Hour
)

var hub = newHub()

func newHub() *Hub {
	return &Hub{users: map[string]*User{}, games: map[string]*Game{}, rooms: map[string]*Room{}, perIP: map[string]int{}}
}

func (h *Hub) user(uid string) *User {
	u := h.users[uid]
	if u == nil {
		u = &User{UID: uid, PID: pidOf(uid), sess: map[*Sess]bool{}, rooms: map[string]*Room{}, games: map[string]*Game{}}
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

func (h *Hub) pushGame(g *Game, f func(side int) any) {
	for side := 0; side < 2; side++ {
		if u := h.users[g.Seats[side].UID]; u != nil {
			h.pushUser(u, f(side))
		}
	}
}

func ev(t string, kv ...any) map[string]any {
	m := map[string]any{"t": t}
	for i := 0; i+1 < len(kv); i += 2 {
		m[kv[i].(string)] = kv[i+1]
	}
	return m
}

// ---------------------------------------------------------------- allowance

func (h *Hub) pending(u *User) int {
	n := 0
	for _, g := range u.games {
		if s := g.seatOf(u.UID); s >= 0 && !g.Ended && !g.Spent[s] {
			n++
		}
	}
	return n
}

func (h *Hub) allowView(u *User) Allow {
	now := nowFn()
	a := Allow{ResetsAt: nextMidnight(now), SignedPer: cfg.SignedPerDay, Pending: h.pending(u)}
	unlimited := func(tier string) Allow {
		a.Tier, a.PerDay, a.Remaining, a.Unlimited = tier, -1, -1, true
		return a
	}
	local := func(tier, key string, per int) Allow {
		if per <= 0 {
			return unlimited(tier)
		}
		a.Tier, a.PerDay, a.Used = tier, per, localUsed(key)
		a.Remaining = max(0, per-a.Used-a.Pending)
		return a
	}
	switch {
	case u.Admin:
		return unlimited("admin")
	case u.Anon:
		return local("anon", u.UID, cfg.AnonPerDay)
	case cfg.AllowanceMode == "fake":
		if isFakePass(u.UID) {
			return unlimited("pass")
		}
		return local("free", "S:"+u.UID, cfg.SignedPerDay)
	case cfg.AllowanceMode != "on":
		return unlimited("off")
	case u.allow.Fetched == 0:
		a.Tier, a.PerDay, a.Remaining = "unknown", -1, -1
		return a
	case u.allow.Unlimited:
		return unlimited("pass")
	default:
		a.Tier, a.PerDay, a.Used = u.allow.Tier, u.allow.PerDay, u.allow.Used
		a.Remaining = max(0, u.allow.Remaining-a.Pending)
		a.ResetsAt = u.allow.ResetsAt
		return a
	}
}

// canStart: may u start one more online game now? Returns an error code or "".
func (h *Hub) canStart(u *User) string {
	if u.Admin {
		return ""
	}
	a := h.allowView(u)
	if !a.Unlimited && a.Tier != "unknown" && a.Remaining <= 0 {
		return "no_games_left"
	}
	if u.Anon && cfg.AnonPerIP > 0 && ipUsed(u.IP) >= cfg.AnonPerIP {
		return "ip_limit"
	}
	return ""
}

// refreshAllowance re-reads payments for a signed-in user before a gate (off the lock).
func (h *Hub) refreshAllowance(u *User) {
	h.mu.Lock()
	need := cfg.AllowanceMode == "on" && !u.Anon && !u.Admin && !u.Dev && u.Tok != "" && nowMs()-u.allow.Fetched > 10_000
	tok := u.Tok
	h.mu.Unlock()
	if !need {
		return
	}
	if a, ok := fetchAllowance(tok); ok {
		h.mu.Lock()
		u.allow = a
		h.mu.Unlock()
	}
}

// countGame spends both seats' allowance once both have moved (lock held).
func (h *Hub) countGame(g *Game) {
	for side := 0; side < 2; side++ {
		if g.Spent[side] {
			continue
		}
		g.Spent[side] = true
		u := h.user(g.Seats[side].UID)
		switch {
		case u.Admin:
		case u.Anon:
			recordLocal(u.UID, g.ID, u.IP)
		case cfg.AllowanceMode == "fake":
			if !isFakePass(u.UID) {
				recordLocal("S:"+u.UID, g.ID, u.IP)
			}
		case cfg.AllowanceMode == "on" && u.Tok != "" && !u.Dev:
			tok, id := u.Tok, payUUID("gambit", g.ID, u.UID)
			go func() {
				res, a := spendAllowance(tok, id)
				h.mu.Lock()
				defer h.mu.Unlock()
				if a != nil {
					u.allow = *a
				}
				if res == spendDenied {
					log.Printf("allowance: %s had no games left at count time (game %s goes on)", u.PID, g.ID)
				}
				h.pushUser(u, ev("allowance", "allowance", h.allowView(u)))
			}()
			continue
		}
		h.pushUser(u, ev("allowance", "allowance", h.allowView(u)))
	}
}

// ---------------------------------------------------------------- lobby

func (h *Hub) liveTimed(u *User) bool {
	for _, g := range u.games {
		if !g.Ended && !g.tc.Unlimited() {
			return true
		}
	}
	return false
}

func (h *Hub) liveUnlimited(u *User) int {
	n := 0
	for _, g := range u.games {
		if !g.Ended && g.tc.Unlimited() {
			n++
		}
	}
	return n
}

// canPlay checks the per-user concurrency limits for a game of tc.
func (h *Hub) canPlay(u *User, tc TimeControl) string {
	if tc.Unlimited() {
		if h.liveUnlimited(u) >= maxUnlimitedPerUser {
			return "too_many_games"
		}
		return ""
	}
	if h.liveTimed(u) {
		return "already_playing"
	}
	return ""
}

func (h *Hub) ratingFor(u *User, cat string) (int, bool) {
	r := loadRating(u.UID, cat)
	d := r.decay(nowMs())
	return int(r.R + 0.5), d.Provisional()
}

func (h *Hub) seat(u *User, cat string) Seat {
	r, prov := h.ratingFor(u, cat)
	return Seat{UID: u.UID, PID: u.PID, Name: u.Name, Anon: u.Anon, Rating: r, Prov: prov}
}

func (h *Hub) startGame(w, b *User, tc TimeControl, rated bool, room string) *Game {
	now := nowMs()
	id := randString("abcdefghijkmnpqrstuvwxyz23456789", 10)
	for h.games[id] != nil {
		id = randString("abcdefghijkmnpqrstuvwxyz23456789", 10)
	}
	g := newGame(id, tc, rated, h.seat(w, tc.Cat), h.seat(b, tc.Cat), now)
	g.Room = room
	h.games[id] = g
	w.games[id], b.games[id] = g, g
	for _, u := range []*User{w, b} {
		if u.seek != nil {
			h.removeSeek(u)
			h.pushUser(u, ev("seek", "seek", nil))
		}
		if !tc.Unlimited() {
			for code, r := range u.rooms {
				if !r.TC.Unlimited() {
					h.closeRoom(r, "playing")
					_ = code
				}
			}
		}
		if len(u.sess) == 0 {
			g.Gone[g.seatOf(u.UID)] = now
		}
	}
	h.persist(g)
	h.pushGame(g, func(side int) any { return ev("start", "game", g.view(side, now)) })
	h.dirty = true
	return g
}

func (h *Hub) removeSeek(u *User) {
	if u.seek == nil {
		return
	}
	for i, s := range h.seeks {
		if s == u.seek {
			h.seeks = append(h.seeks[:i], h.seeks[i+1:]...)
			break
		}
	}
	u.seek = nil
	h.dirty = true
}

// seekWindow is the rating gap two seeks accept after waiting ms.
func seekWindow(waitMs int64) int {
	if waitMs >= 20_000 {
		return 1 << 30
	}
	return 200 + int(waitMs/5000)*100
}

// match pairs compatible seeks: same time control and rated flag, different players,
// rating gap inside the window of the longer waiter, both still allowed to start.
func (h *Hub) match() {
	now := nowMs()
	for {
		paired := false
		sort.SliceStable(h.seeks, func(i, j int) bool { return h.seeks[i].At < h.seeks[j].At })
		for i := 0; i < len(h.seeks) && !paired; i++ {
			a := h.seeks[i]
			best, bestGap := -1, 1<<31-1
			for j := i + 1; j < len(h.seeks); j++ {
				b := h.seeks[j]
				if b.TC.ID != a.TC.ID || b.Rated != a.Rated || b.U.UID == a.U.UID {
					continue
				}
				gap := a.Rating - b.Rating
				if gap < 0 {
					gap = -gap
				}
				if gap <= seekWindow(now-a.At) && gap < bestGap {
					best, bestGap = j, gap
				}
			}
			if best < 0 {
				continue
			}
			b := h.seeks[best]
			if h.canStart(a.U) != "" || h.canPlay(a.U, a.TC) != "" {
				h.removeSeek(a.U)
				h.pushUser(a.U, ev("seek", "seek", nil, "reason", "no_games_left"))
				paired = true
				break
			}
			if h.canStart(b.U) != "" || h.canPlay(b.U, b.TC) != "" {
				h.removeSeek(b.U)
				h.pushUser(b.U, ev("seek", "seek", nil, "reason", "no_games_left"))
				paired = true
				break
			}
			w, bl := a.U, b.U
			if randString("01", 1) == "1" {
				w, bl = bl, w
			}
			h.startGame(w, bl, a.TC, a.Rated, "")
			paired = true
		}
		if !paired {
			return
		}
	}
}

func (h *Hub) closeRoom(r *Room, reason string) {
	if h.rooms[r.Code] != r {
		return
	}
	delete(h.rooms, r.Code)
	delete(r.Host.rooms, r.Code)
	h.pushUser(r.Host, ev("roomClosed", "code", r.Code, "reason", reason))
	if r.Public {
		h.dirty = true
	}
}

func (r *Room) view() map[string]any {
	return map[string]any{"code": r.Code, "public": r.Public, "name": r.Name, "tc": r.TC, "rated": r.Rated,
		"color": r.Color, "created": r.Created,
		"host": map[string]any{"pid": r.Host.PID, "name": r.Host.Name, "rating": r.Rating, "prov": r.Prov}}
}

func (h *Hub) lobbyView() map[string]any {
	rooms := []map[string]any{}
	list := make([]*Room, 0, len(h.rooms))
	for _, r := range h.rooms {
		if r.Public {
			list = append(list, r)
		}
	}
	sort.Slice(list, func(i, j int) bool { return list[i].Created > list[j].Created })
	for _, r := range list {
		rooms = append(rooms, r.view())
	}
	seeking := map[string]int{}
	for _, s := range h.seeks {
		seeking[s.TC.ID]++
	}
	playing := 0
	for _, g := range h.games {
		if !g.Ended {
			playing++
		}
	}
	online := 0
	for _, u := range h.users {
		if len(u.sess) > 0 {
			online++
		}
	}
	return map[string]any{"rooms": rooms, "seeking": seeking, "playing": playing, "online": online}
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

// ---------------------------------------------------------------- games

func (h *Hub) persist(g *Game) {
	if _, err := db.Exec(`INSERT INTO live_games(id, data, touched) VALUES(?,?,?)
		ON CONFLICT(id) DO UPDATE SET data = excluded.data, touched = excluded.touched`, g.ID, g.marshal(), nowMs()); err != nil {
		log.Printf("persist %s: %v", g.ID, err)
	}
}

// finish stores a game that just ended, rates it and tells both players (lock held).
func (h *Hub) finish(g *Game) {
	now := nowMs()
	db.Exec(`DELETE FROM live_games WHERE id = ?`, g.ID)
	if !g.aborted() {
		g.PGN = g.pgn()
		h.store(g)
	}
	h.pushGame(g, func(side int) any {
		m := ev("end", "game", g.ID, "result", g.Result, "reason", g.Reason, "pgn", g.PGN, "clock", g.clockView(now))
		if g.Rated && !g.aborted() {
			m["ratings"] = g.ratingsView()
		}
		return m
	})
	h.dirty = true
	// allowance views change when a pending game is aborted
	if g.aborted() {
		for side := 0; side < 2; side++ {
			if u := h.users[g.Seats[side].UID]; u != nil {
				h.pushUser(u, ev("allowance", "allowance", h.allowView(u)))
			}
		}
	}
}

func (h *Hub) store(g *Game) {
	// Read before Begin: the pool has one connection, a db.Query inside the tx would deadlock.
	wr, br := loadRating(g.Seats[0].UID, g.tc.Cat), loadRating(g.Seats[1].UID, g.tc.Cat)
	tx, err := db.Begin()
	if err != nil {
		log.Printf("store %s: %v", g.ID, err)
		return
	}
	defer tx.Rollback()
	if g.Rated {
		score := 0.5
		switch g.Result {
		case "1-0":
			score = 1
		case "0-1":
			score = 0
		}
		nw, nb := rateGame(wr.Rating, br.Rating, score, nowMs())
		wr.Rating, br.Rating = nw, nb
		wr.Games++
		br.Games++
		switch score {
		case 1:
			wr.Wins++
			br.Losses++
		case 0:
			wr.Losses++
			br.Wins++
		default:
			wr.Draws++
			br.Draws++
		}
		g.After = [2]int{int(nw.R + 0.5), int(nb.R + 0.5)}
		g.Deltas = [2]int{g.After[0] - g.Seats[0].Rating, g.After[1] - g.Seats[1].Rating}
		if err := saveRating(tx, g.Seats[0].UID, g.tc.Cat, wr); err != nil {
			log.Printf("rating: %v", err)
		}
		if err := saveRating(tx, g.Seats[1].UID, g.tc.Cat, br); err != nil {
			log.Printf("rating: %v", err)
		}
	}
	_, err = tx.Exec(`INSERT OR REPLACE INTO games(id, white_uid, black_uid, white_name, black_name, tc, cat, rated, result, reason,
		moves, pgn, white_r, black_r, white_d, black_d, started, ended) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		g.ID, g.Seats[0].UID, g.Seats[1].UID, g.Seats[0].Name, g.Seats[1].Name, g.TCID, g.tc.Cat, b2i(g.Rated), g.Result, g.Reason,
		joinMoves(g.Moves), g.PGN, g.Seats[0].Rating, g.Seats[1].Rating, g.Deltas[0], g.Deltas[1], g.Created, g.EndedAt)
	if err != nil {
		log.Printf("store game: %v", err)
		return
	}
	if err := tx.Commit(); err != nil {
		log.Printf("store commit: %v", err)
	}
}

func (h *Hub) dropGame(g *Game) {
	delete(h.games, g.ID)
	for side := 0; side < 2; side++ {
		if u := h.users[g.Seats[side].UID]; u != nil {
			delete(u.games, g.ID)
		}
	}
}

// tick runs timers: flags, first-move aborts, 3-day timeouts, matching, cleanup.
func (h *Hub) tick() {
	h.mu.Lock()
	defer h.mu.Unlock()
	now := nowMs()
	for _, g := range h.games {
		if !g.Ended && g.checkTime(now) {
			h.finish(g)
		}
		if g.Ended && now-g.EndedAt > rematchWindow.Milliseconds() {
			h.dropGame(g)
		}
	}
	for _, r := range h.rooms {
		ttl := roomTTL
		if r.TC.Unlimited() {
			ttl = unlimitedRoomTTL
		}
		switch {
		case r.Host.goneAt > 0 && now-r.Host.goneAt > roomHostGrace.Milliseconds() && !r.TC.Unlimited():
			h.closeRoom(r, "host_left")
		case now-r.Created > ttl.Milliseconds():
			h.closeRoom(r, "expired")
		}
	}
	h.match()
	for uid, u := range h.users {
		if len(u.sess) == 0 && len(u.games) == 0 && len(u.rooms) == 0 && u.seek == nil && now-u.goneAt > 10*60_000 {
			delete(h.users, uid)
		}
	}
	if h.dirty && now-h.sentAt >= 1000 {
		h.broadcastLobby()
	}
}

// loadLive restores games in progress after a restart. Timed games don't charge the
// downtime: the side to move gets back the time the server was away.
func (h *Hub) loadLive() {
	now := nowMs()
	stopped := now
	if v, err := json.Number(getSetting("stopped_at")).Int64(); err == nil && v > 0 && v < now {
		stopped = v
	}
	rows, err := db.Query(`SELECT data FROM live_games`)
	if err != nil {
		log.Printf("load live: %v", err)
		return
	}
	defer rows.Close()
	n := 0
	for rows.Next() {
		var data []byte
		rows.Scan(&data)
		g, err := unmarshalGame(data)
		if err != nil {
			log.Printf("load live: %v", err)
			continue
		}
		if !g.tc.Unlimited() {
			g.Clock.TurnStart += now - stopped
		}
		h.games[g.ID] = g
		for side := 0; side < 2; side++ {
			u := h.user(g.Seats[side].UID)
			if u.Name == "" {
				u.Name, u.Anon = g.Seats[side].Name, g.Seats[side].Anon
			}
			u.games[g.ID] = g
			u.goneAt = now
			g.Gone[side] = now
		}
		n++
	}
	if n > 0 {
		log.Printf("restored %d live games (downtime %ds credited to timed games)", n, (now-stopped)/1000)
	}
}

func (h *Hub) heartbeat() { putSetting("stopped_at", json.Number(itoa(nowMs())).String()) }
