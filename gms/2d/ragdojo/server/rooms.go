package main

import (
	"log"
	"math"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Rooms: the 2-8 player modes (Last Man Standing, Steal the Bandana, King of the Hill).
//
// A room gathers in mLobby. Its countdown starts when roomQuorum players are in (a slower one
// from two, for public rooms), joins stay open until it ends or the room is full, and a
// friend room's host may start it early. Every seat links to every other one while it waits,
// so the master is picked from MEASURED pings: the seat whose worst ping to the others is
// lowest. One round decides it.
//
// Nobody can end a room by leaving it. A leaver is eliminated (out), never a void; if the
// master goes, the best-ping seat still here becomes master and rebuilds the fight from its
// last keyframe. The last seat standing wins by forfeit.

const (
	roomMax    = 8
	roomQuorum = 4
)

var (
	defaultRoomCountdown = 20 * time.Second
	defaultRoomSlow      = 45 * time.Second
	// A master's socket that stays down this long is gone: the fight cannot wait for it,
	// because nobody else is running it. Short, but longer than a reconnect usually takes.
	defaultMigrateAfter = 5 * time.Second // a blip is not a hand-over; guests' stall reports are the fast path
)

func init() {
	for _, t := range []string{"lms", "bandana", "hill"} {
		gameTypes[t] = true
	}
	// Tests only (the browser gates): shorter countdowns, and a way to break migration.
	if v, err := strconv.Atoi(os.Getenv("ARENA_ROOM_MS")); err == nil && v > 0 {
		defaultRoomCountdown, defaultRoomSlow = time.Duration(v)*time.Millisecond, time.Duration(v)*time.Millisecond
	}
	if v, err := strconv.Atoi(os.Getenv("ARENA_MIGRATE_MS")); err == nil && v > 0 {
		defaultMigrateAfter = time.Duration(v) * time.Millisecond
	}
}

func isRoomType(t string) bool { return t == "lms" || t == "bandana" || t == "hill" }

func (h *hub) joinRoom(c *client, typ string) {
	var best *match
	for _, m := range h.matches {
		if m.room && !m.friend && !m.quick && m.typ == typ && m.state == mLobby && len(m.seats) < roomMax &&
			(best == nil || len(m.seats) > len(best.seats) || (len(m.seats) == len(best.seats) && m.id < best.id)) {
			best = m
		}
	}
	if best == nil {
		if len(h.matches) >= maxMatches {
			h.send(c, map[string]any{"t": "err", "code": "full", "msg": "The arena is full right now. Try again in a minute."})
			return
		}
		best = h.newMatch(typ, false)
		best.room = true
		best.state = mLobby
		best.deadline = h.now().Add(30 * time.Minute)
	}
	h.seatIn(best, c)
	h.roomChanged(best)
}

// roomChanged: someone came or went. Recompute the countdown and tell everyone who is in.
func (h *hub) roomChanged(m *match) {
	n := len(m.seats)
	now := h.now()
	switch {
	case n >= roomMax:
		h.roomOffer(m)
		h.startRoom(m)
		return
	case n >= roomQuorum:
		if m.startAt.IsZero() || m.startAt.After(now.Add(h.roomCountdown)) {
			m.startAt = now.Add(h.roomCountdown)
		}
	case n >= 2 && !m.friend:
		if m.startAt.IsZero() {
			m.startAt = now.Add(h.roomSlow)
		}
	case n < 2:
		m.startAt = time.Time{}
	}
	h.roomOffer(m)
}

func (h *hub) roomOffer(m *match) {
	ice, turn := h.ice.get()
	startIn := int64(-1)
	if !m.startAt.IsZero() {
		startIn = max(0, m.startAt.Sub(h.now()).Milliseconds())
	}
	for i, s := range m.seats {
		peers := []map[string]any{}
		for j, o := range m.seats {
			if j != i {
				peers = append(peers, map[string]any{"id": o.id, "name": o.name, "ranked": o.ranked, "slot": j})
			}
		}
		o := map[string]any{"t": "offer", "room": true, "match": m.id, "type": m.typ, "friend": m.friend, "code": m.code,
			"you": i, "host": i == 0, "peers": peers, "counted": m.counted(),
			"startIn": startIn, "quorum": roomQuorum, "max": roomMax}
		// TURN credentials only once there is someone to link to: never to a room of one.
		if len(m.seats) >= 2 {
			o["ice"], o["turn"] = ice, turn
		}
		h.send(s.c, o)
	}
}

// roomAccept: joining a room is already saying yes; the accept carries the token that pays
// for the battle, and a seat that never sends one is not dealt in.
func (h *hub) roomAccept(m *match, c *client, tok string) {
	s := m.seats[m.slotOf(c)]
	s.accepted = true
	if tok != "" && len(tok) < 8192 {
		s.tok = tok
	}
}

func (h *hub) startEarly(c *client, id string) {
	m := h.mine(c, id)
	if m == nil || !m.room || m.quick || m.state != mLobby || m.seats[0].c != c || len(m.seats) < 2 {
		return
	}
	h.startRoom(m)
}

func (h *hub) setRtts(c *client, id string, r map[string]float64) {
	m := h.mine(c, id)
	if m == nil || !m.room || len(r) > roomMax {
		return
	}
	s := m.seats[m.slotOf(c)]
	if s.rtts == nil {
		s.rtts = map[string]float64{}
	}
	for k, v := range r {
		if v > 0 && v < 5000 {
			s.rtts[k] = v
		}
	}
}

func (h *hub) startRoom(m *match) {
	kept := m.seats[:0:0]
	for _, s := range m.seats {
		if s.accepted {
			kept = append(kept, s)
			continue
		}
		h.send(s.c, map[string]any{"t": "cancel", "match": m.id, "why": "notready"})
		if s.c.match == m {
			s.c.match = nil
		}
	}
	m.seats = kept
	m.startAt = time.Time{}
	if len(kept) < 2 {
		if len(kept) == 0 {
			h.closeMatch(m)
		} else {
			h.roomOffer(m)
		}
		return
	}
	if m.code != "" && h.codes[m.code] == m {
		delete(h.codes, m.code)
	}
	h.lobbyDirt = true
	h.startMatch(m)
}

// roomBegin: every seat's allowance is settled. Seats that are out of free battles are dealt
// out; the rest play, mastered by the best measured ping.
func (h *hub) roomBegin(m *match) {
	kept := m.seats[:0:0]
	for _, s := range m.seats {
		if s.spent.OK {
			kept = append(kept, s)
			continue
		}
		why := h.refused(s)
		h.send(s.c, map[string]any{"t": "cancel", "match": m.id, "why": why})
		if s.c.match == m {
			s.c.match = nil
		}
	}
	m.seats = kept
	if m.quick && len(kept) > 0 {
		if len(m.ghosts) < quickTarget(m.typ)-len(kept) { // someone was dealt out: a ghost takes the seat
			h.quickPlan(m, true)
			h.quickStrength(m)
		}
		if len(kept) == 1 {
			h.quickLocal(m, kept[0])
			return
		}
		if m.typ == "duel" && len(kept) == 2 { // two people: a normal best of 3, never ranked
			m.room, m.ghosts = false, nil
			h.duelBegin(m)
			return
		}
	}
	if len(kept) < 2 {
		h.cancel(m, "allowance", nil)
		return
	}
	m.state = mPlay
	m.playAt = h.now()
	m.round = 1
	m.arena = coin(1 << 20)
	m.master = h.bestMaster(m)
	m.log = append(m.log, "master "+m.seats[m.master].id)
	log.Printf("match %s (%s): %d players, master %s by ping (%s)", m.id, m.typ, len(m.seats), m.seats[m.master].id, h.pingLine(m))
	h.sendGo(m)
}

// pairRTT: the two seats' own measurements of each other, averaged; unmeasured pairs fall back
// to the server's rough estimate plus a penalty, so a measured seat always beats a guess.
func pairRTT(a, b *seat) float64 {
	n, sum := 0, 0.0
	if v, ok := a.rtts[b.id]; ok {
		n, sum = n+1, sum+v
	}
	if v, ok := b.rtts[a.id]; ok {
		n, sum = n+1, sum+v
	}
	if n > 0 {
		return sum / float64(n)
	}
	return float64(estimate(a.c, b.c)) + 100
}

// bestMaster: the seat whose worst ping to everyone still playing is lowest.
func (h *hub) bestMaster(m *match) int { return h.bestMasterBut(m, -1) }

func (h *hub) bestMasterBut(m *match, skip int) int {
	best, cost := -1, math.MaxFloat64
	for i, a := range m.seats {
		if a.out || a.c.away || i == skip {
			continue
		}
		worst := 0.0
		for j, b := range m.seats {
			if i != j && !b.out && !b.c.away {
				worst = math.Max(worst, pairRTT(a, b))
			}
		}
		if worst < cost-0.5 {
			best, cost = i, worst
		}
	}
	if best < 0 {
		for i, s := range m.seats {
			if !s.out {
				return i
			}
		}
		return 0
	}
	return best
}

// pingLine: the master's worst ping to the others, and how many pairs were measured, for the log.
func (h *hub) pingLine(m *match) string {
	a := m.seats[m.master]
	worst, measured, pairs := 0.0, 0, 0
	for i, b := range m.seats {
		if i == m.master {
			continue
		}
		pairs++
		if _, ok := a.rtts[b.id]; ok {
			measured++
		} else if _, ok := b.rtts[a.id]; ok {
			measured++
		}
		worst = math.Max(worst, pairRTT(a, b))
	}
	return "worst " + itoa(int(worst)) + " ms, " + itoa(measured) + "/" + itoa(pairs) + " measured"
}

func (h *hub) leaveRoom(m *match, c *client, why string) {
	slot := m.slotOf(c)
	if slot < 0 {
		return
	}
	switch m.state {
	case mPlay:
		h.eliminate(m, slot, why)
	case mLobby, mStarting:
		m.seats = append(m.seats[:slot], m.seats[slot+1:]...)
		if len(m.seats) == 0 {
			h.closeMatch(m)
		} else if m.quick && m.state == mLobby {
			h.quickChanged(m)
		} else if m.state == mStarting && len(m.seats) < 2 && !m.quick {
			h.cancel(m, "left", nil)
		} else if m.state == mLobby {
			h.roomChanged(m)
		}
	}
}

// eliminate: a seat is out of a running room for good. Everyone hears; if it was the master,
// a new one takes over; if one seat is left, it wins by forfeit.
func (h *hub) eliminate(m *match, slot int, why string) {
	s := m.seats[slot]
	if s.out || m.state != mPlay {
		return
	}
	m.outN++
	s.out, s.outSeq = true, m.outN
	m.log = append(m.log, "out "+s.id+" ("+why+")")
	note := map[string]any{"t": "out", "match": m.id, "slot": slot, "why": why}
	for i, o := range m.seats {
		if i != slot && !o.out {
			h.send(o.c, note)
		}
	}
	mine := map[string]any{"t": "out", "match": m.id, "slot": slot, "why": why, "you": true}
	if s.c.send != nil && !s.c.away {
		h.send(s.c, mine)
	} else {
		s.c.lastOut = mine
	}
	if s.c.match == m {
		s.c.match = nil
	}
	left := []int{}
	for i, o := range m.seats {
		if !o.out {
			left = append(left, i)
		}
	}
	switch {
	case len(left) == 0:
		h.void(m, "empty", nil)
		return
	case len(left) == 1 && len(m.ghosts) == 0: // with ghosts in, the last person fights on
		h.finishRoom(m, left[0], nil, true)
		return
	}
	if slot == m.master {
		h.migrate(m, slot)
	}
	h.checkRoomReports(m)
}

func (h *hub) migrate(m *match, gone int) {
	m.master = h.bestMaster(m)
	m.log = append(m.log, "new master "+m.seats[m.master].id)
	log.Printf("match %s: master %s gone, %s takes over", m.id, m.seats[gone].id, m.seats[m.master].id)
	for _, s := range m.seats {
		if !s.out {
			h.send(s.c, map[string]any{"t": "master", "match": m.id, "round": m.round, "master": m.master, "gone": gone})
		}
	}
}

// tickRooms: countdowns that ran out, and masters whose socket has been down too long.
// handOver: a new master without eliminating the old one (hidden tab, or guests' stall reports
// the server cannot confirm). It stays in as a guest; "gone" is -1.
func (h *hub) handOver(m *match, from int) {
	next := h.bestMasterBut(m, from)
	if next < 0 || next == from || m.seats[next].out || m.seats[next].c.away {
		return
	}
	m.master = next
	m.log = append(m.log, "handed over to "+m.seats[next].id)
	log.Printf("match %s: master %s handed over to %s", m.id, m.seats[from].id, m.seats[next].id)
	for _, s := range m.seats {
		if !s.out {
			h.send(s.c, map[string]any{"t": "master", "match": m.id, "round": m.round, "master": m.master, "gone": -1})
		}
	}
}

func (h *hub) tickRooms(now time.Time) {
	for _, m := range h.matches {
		if !m.room {
			continue
		}
		if m.state == mLobby && !m.startAt.IsZero() && !now.Before(m.startAt) {
			h.startRoom(m)
			continue
		}
		if m.state == mPlay && m.master >= 0 && m.master < len(m.seats) {
			ms := m.seats[m.master]
			if !ms.out && ms.c.away && now.Sub(ms.c.awaySince) >= h.migrateAfter {
				h.eliminate(m, m.master, "gone")
			}
		}
	}
}

func (h *hub) roomReport(m *match, c *client, round, winner int, ko bool, place, dmg []int) {
	if m.state != mPlay || round != m.round || winner < -1 || winner >= m.fighters() {
		return
	}
	slot := m.slotOf(c)
	if slot < 0 || m.seats[slot].out {
		return
	}
	if _, dup := m.reports[slot]; dup {
		return
	}
	if len(m.reports) == 0 {
		m.firstReport = h.now()
		m.firstIn = make([]bool, len(m.seats))
		for i, s := range m.seats {
			m.firstIn[i] = !s.out
		}
	}
	m.reports[slot] = report{winner, ko, placeKey(place, m.fighters()), dmgKey(dmg, m.fighters())}
	h.checkRoomReports(m)
}

// checkRoomReports: everyone still in has reported; count it only if they all say the same.
func (h *hub) checkRoomReports(m *match) {
	if m.state != mPlay || len(m.reports) == 0 {
		return
	}
	var first *report
	for i, s := range m.seats {
		if s.out {
			continue
		}
		r, ok := m.reports[i]
		if !ok {
			return
		}
		if first == nil {
			first = &r
		} else if m.cmp(r) != m.cmp(*first) {
			h.disputeRoom(m)
			return
		}
	}
	if first == nil {
		return
	}
	if first.winner >= 0 && first.winner < len(m.seats) && m.seats[first.winner].out && !m.wasIn(first.winner) {
		h.void(m, "disagree", nil)
		return
	}
	h.countRoom(m, *first)
}

func (m *match) wasIn(i int) bool { return i < len(m.firstIn) && m.firstIn[i] }

// cmp: what must agree between room reports. Placings and damage are compared only for seats
// that were still in at the first report: a seat that left before the fight was decided is
// placed by the server's elimination order, whatever each client's view of it says.
func (m *match) cmp(r report) report {
	mask := func(k string) string {
		if k == "" || m.firstIn == nil {
			return k
		}
		parts := strings.Split(k, ",")
		for i := range parts {
			if i < len(m.firstIn) && !m.firstIn[i] {
				parts[i] = "-"
			}
		}
		return strings.Join(parts, ",")
	}
	r.place, r.dmg = mask(r.place), mask(r.dmg)
	return r
}

func (h *hub) countRoom(m *match, r report) {
	if r.winner >= 0 && r.winner < len(m.seats) && r.ko {
		m.seats[r.winner].kos++
	}
	m.dmg = parseDmg(r.dmg)
	h.finishRoom(m, r.winner, parsePlace(r.place), false)
}

// disputeRoom: the reports differ. The duel rule, for a room: if a strict majority (two or
// more) agree, nobody in it has a record of disputes, and EVERY seat disagreeing with it has
// one, the majority's report counts and the dissenters take the dispute. Otherwise a void,
// logged against every account still in.
func (h *hub) disputeRoom(m *match) {
	groups := map[report][]int{}
	in := 0
	for i, s := range m.seats {
		if !s.out {
			in++
			k := m.cmp(m.reports[i])
			groups[k] = append(groups[k], i)
		}
	}
	var best report
	bestN := 0
	for r, l := range groups {
		if len(l) > bestN {
			best, bestN = r, len(l)
		}
	}
	if bestN >= 2 && bestN*2 > in && (best.winner < 0 || best.winner >= len(m.seats) || !m.seats[best.winner].out || m.wasIn(best.winner)) {
		var bad []string
		ok := true
		for i, s := range m.seats {
			if s.out {
				continue
			}
			flagged := s.ranked && h.st.flagged(s.uid)
			if m.cmp(m.reports[i]) == best {
				ok = ok && !flagged
			} else {
				ok = ok && flagged
				bad = append(bad, s.uid)
			}
		}
		if ok && len(bad) > 0 {
			h.st.recordDispute(m.id, bad)
			m.log = append(m.log, "disputed by "+strings.Join(bad, ",")+" (a record of disputes): the majority counts")
			m.note = " disputed"
			h.countRoom(m, m.reports[groups[best][0]])
			return
		}
	}
	h.void(m, "disagree", nil)
}

func placeKey(p []int, n int) string {
	if len(p) != n {
		return ""
	}
	parts := make([]string, n)
	for i, v := range p {
		if v < 1 || v > n {
			return ""
		}
		parts[i] = itoa(v)
	}
	return strings.Join(parts, ",")
}

// dmgKey: each fighter's damage taken, whole percent, as reported — agreed like the winner is.
func dmgKey(d []int, n int) string {
	if len(d) != n {
		return ""
	}
	parts := make([]string, n)
	for i, v := range d {
		parts[i] = itoa(min(100, max(0, v)))
	}
	return strings.Join(parts, ",")
}

func parseDmg(k string) []float64 {
	out := []float64{}
	for _, v := range parsePlace(k) {
		out = append(out, float64(v)/100)
	}
	return out
}

// oppDmg: for event points, how close a loss was — the most-damaged opponent (docs/EVENTS.md).
func oppDmg(d []float64, me int) float64 {
	best := 0.0
	for j, v := range d {
		if j != me && v > best {
			best = v
		}
	}
	return best
}

func parsePlace(k string) []int {
	if k == "" {
		return nil
	}
	out := []int{}
	for _, p := range strings.Split(k, ",") {
		n := 0
		for _, ch := range p {
			n = n*10 + int(ch-'0')
		}
		out = append(out, n)
	}
	return out
}

// serverPlace: when the server decides (a forfeit), the winner first, then everyone still in,
// then the leavers, latest out first.
func serverPlace(m *match, winner int) []int {
	idx := make([]int, len(m.seats))
	for i := range idx {
		idx[i] = i
	}
	sort.SliceStable(idx, func(a, b int) bool {
		sa, sb := m.seats[idx[a]], m.seats[idx[b]]
		if (idx[a] == winner) != (idx[b] == winner) {
			return idx[a] == winner
		}
		if sa.out != sb.out {
			return !sa.out
		}
		return sa.outSeq > sb.outSeq
	})
	place := make([]int, m.fighters())
	for rank, i := range idx {
		place[i] = rank + 1
	}
	for g := len(m.seats); g < len(place); g++ {
		place[g] = g + 1
	}
	return place
}

// finishRoom records one room: the winner (or nobody, a draw) and everyone's placing. The
// room closes at once; "again" is a fresh wait.
func (h *hub) finishRoom(m *match, winner int, place []int, ff bool) {
	if len(place) != m.fighters() {
		place = serverPlace(m, winner)
	}
	m.state = mDone
	rows := make([]seatRow, len(m.seats))
	names := make([]string, m.fighters())
	early := ff && h.earlyForfeit(m)
	// A quick fight ranks its people among themselves: ghost seats are not in the ranking.
	hw := winner
	// One person left with the ghosts: their report alone would decide it (a friend who walks
	// out hands them the win), so it earns nobody event points.
	lone := false
	if m.quick {
		hw = humanWinner(place, len(m.seats))
		in := 0
		for _, s := range m.seats {
			if !s.out {
				in++
			}
		}
		lone = in < 2
	}
	for i, s := range m.seats {
		rows[i] = seatRow{UID: s.uid, Name: s.name, Won: i == hw, KOs: s.kos, Ranked: s.ranked, Loadout: s.c.loadout, OppDmg: oppDmg(m.dmg, i)}
		if m.quick {
			rows[i].OppDmg = humanOppDmg(m.dmg, i, len(m.seats))
		}
		if early {
			rows[i].NoEvent = true
			rows[i].NoStats = i == winner
		}
		rows[i].NoEvent = rows[i].NoEvent || lone
		names[i] = s.name
	}
	for j, g := range m.ghosts {
		names[len(m.seats)+j] = g.Name
	}
	score := "place " + placeKey(place, len(place))
	if ff {
		score += " ff"
	}
	if early {
		score += " early"
	}
	score += m.note
	if m.quick {
		h.st.recordQuick(m.id, m.typ, score, rows)
	} else {
		if err := h.st.recordMatch(m.id, m.typ, m.friend, score, rows); err != nil {
			log.Printf("match %s: stats write failed: %v", m.id, err)
		}
		if h.lan {
			h.st.recordLan(m.id, m.typ, ff, rows)
		}
	}
	who := "nobody"
	if winner >= 0 {
		who = names[winner]
	}
	log.Printf("match %s (%s): %s won, %s (%s)", m.id, m.typ, who, score, strings.Join(m.log, ", "))
	for i, s := range m.seats {
		if s.out {
			continue
		}
		out := map[string]any{"t": "result", "match": m.id, "mode": m.typ, "winner": winner, "you": i, "place": place,
			"names": names, "counted": s.ranked && !rows[i].NoStats && !m.quick, "forfeit": ff}
		if m.quick {
			out["quick"], out["hwin"] = true, hw
		}
		if s.ranked && !m.quick {
			if line, ok := h.st.mine(s.uid); ok {
				out["stats"] = line
			}
		}
		h.send(s.c, out)
		if s.c.match == m {
			s.c.match = nil
		}
	}
	h.closeMatch(m)
}
