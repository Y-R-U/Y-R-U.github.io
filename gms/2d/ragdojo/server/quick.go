package main

import (
	"log"
	"math"
	mrand "math/rand"
	"os"
	"strconv"
	"strings"
	"time"
)

// QUICK FIGHT: a match every time, for any mode. The first player to press it opens a window
// (quickWindow); anyone else pressing QUICK FIGHT on the same mode inside it joins. At the end
// of the window the empty seats (up to quickTarget) go to ghost players: AI fighters with a
// personality, a name and a seed picked HERE, so every browser runs the same ones. They are
// revealed over the last seconds of the countdown so they "join" like people, and a human who
// joins late takes a seat a ghost had (the last-revealed one steps out).
//
// A quick fight is never ranked: no boards, no player stats, no pair cap shared with ranked
// play. It spends the allowance like FIND A FIGHT. Two or more humans play it online (rooms
// with ghost seats; a two-human duel is a normal best of 3); one human plays it on their own
// device (`quickgo`). Ghost names carry a trailing "*" everywhere.

var (
	defaultQuickWindow = 10 * time.Second
	defaultQuickReveal = 3 * time.Second
)

func init() {
	// Tests only (the browser gates): a shorter window; the reveal shrinks with it.
	if v, err := strconv.Atoi(os.Getenv("ARENA_QUICK_MS")); err == nil && v > 0 {
		defaultQuickWindow = time.Duration(v) * time.Millisecond
		defaultQuickReveal = min(defaultQuickReveal, defaultQuickWindow*3/10)
	}
}

type ghostSeat struct {
	Pers  string  `json:"pers"`
	Name  string  `json:"name"`
	Seed  int     `json:"seed"`
	Skill float64 `json:"skill"`
	Lo    []int   `json:"lo"`

	revealAt time.Time
	shownN   int // 0 = not shown yet; else the order it was shown in
}

// quickTarget: how many fighters a quick match has when humans are short.
func quickTarget(typ string) int {
	if typ == "duel" {
		return 2
	}
	return 4
}

// quickCap: a full window starts at once.
func quickCap(typ string) int {
	if typ == "duel" {
		return 2
	}
	return roomMax
}

// Personalities, with their join chances (RANDOM ~40%, the rest ~12% each). The named ones play
// under their own name; RANDOM takes a realistic player name and changes style mid-fight.
var personalities = []struct {
	id, name string
	w        int
}{{"random", "", 40}, {"brick", "Brick", 12}, {"zippy", "Zippy", 12}, {"rumble", "Rumble", 12}, {"inkslinger", "Inkslinger", 12}, {"sneak", "Sneak", 12}}

// Which special each personality learns first (gesture slots: 0 power, 1 toss, 2 rise, 3 dash,
// 4 flipF, 5 slam, 6 flipB, 7 bomb). Slot 0 is everyone's.
var persSlots = map[string][]int{
	"brick":      {2, 5, 6, 1, 3, 4, 7},
	"zippy":      {3, 6, 1, 4, 2, 5, 7},
	"rumble":     {3, 4, 5, 2, 6, 1, 7},
	"inkslinger": {1, 7, 3, 2, 6, 4, 5},
	"sneak":      {3, 7, 1, 4, 2, 5, 6},
}

// pickPersonality: weighted, never a named personality the match already has.
func pickPersonality(r *mrand.Rand, taken map[string]bool) (string, string) {
	total := 0
	for _, p := range personalities {
		if p.id == "random" || !taken[p.id] {
			total += p.w
		}
	}
	n := r.Intn(total)
	for _, p := range personalities {
		if p.id != "random" && taken[p.id] {
			continue
		}
		if n -= p.w; n < 0 {
			return p.id, p.name
		}
	}
	return "random", ""
}

// newGhost: a personality and a name nobody in the match has.
func newGhost(r *mrand.Rand, m *match) *ghostSeat {
	taken, names := map[string]bool{}, map[string]bool{}
	for _, g := range m.ghosts {
		taken[g.Pers] = true
		names[strings.ToLower(strings.TrimSuffix(g.Name, "*"))] = true
	}
	for _, s := range m.seats {
		names[strings.ToLower(s.name)] = true
	}
	pers, name := pickPersonality(r, taken)
	for name == "" || names[strings.ToLower(name)] {
		name = ghostName(r)
	}
	return &ghostSeat{Pers: pers, Name: name + "*", Seed: r.Intn(1 << 30)}
}

func (h *hub) quick(c *client, typ, tok string) {
	typ = cleanType(typ)
	if typ == "" {
		h.send(c, map[string]any{"t": "err", "code": "type", "msg": "That mode is not open yet."})
		return
	}
	if !c.ranked && !h.openLobby {
		h.send(c, map[string]any{"t": "err", "code": "signin", "msg": "Sign in for a quick fight. Friend links work without an account."})
		return
	}
	h.leaveMatch(c, "left")
	var best *match
	for _, m := range h.matches {
		if m.quick && m.typ == typ && m.state == mLobby && len(m.seats) < quickCap(typ) &&
			(best == nil || m.quickEnd.Before(best.quickEnd)) {
			best = m
		}
	}
	if best == nil {
		if len(h.matches) >= maxMatches {
			h.send(c, map[string]any{"t": "err", "code": "full", "msg": "The arena is full right now. Try again in a minute."})
			return
		}
		best = h.newMatch(typ, false)
		best.quick, best.room, best.state = true, true, mLobby
		best.quickEnd = h.now().Add(h.quickWindow)
		best.deadline = best.quickEnd.Add(time.Minute)
		best.rng = mrand.New(mrand.NewSource(int64(coin(1 << 30))))
	}
	h.seatIn(best, c)
	// Pressing QUICK FIGHT is the yes, and it carries the token that pays: a window that fills
	// starts at once, before any separate accept could arrive.
	s := best.seats[len(best.seats)-1]
	s.accepted = true
	if tok != "" && len(tok) < 8192 {
		s.tok = tok
	}
	h.quickChanged(best)
}

// quickChanged: someone came or went. Re-plan the ghost seats and tell everyone.
func (h *hub) quickChanged(m *match) {
	if len(m.seats) == 0 {
		h.closeMatch(m)
		return
	}
	h.quickPlan(m, false)
	h.quickOffer(m) // the client links to its peers only on an offer: the one who fills it too
	if len(m.seats) >= quickCap(m.typ) {
		h.quickStart(m)
	}
}

// quickPlan: exactly as many ghosts as the humans leave seats for. A ghost named like a person
// who joined goes at once. Other surplus ones go unshown first; shown ones stay in the list
// while the window is open (people come and go) and only at the start (`now`) does the LAST
// one shown step out for a person who took its seat. New ones are revealed at a random moment
// in the last quickReveal of the window (or at once, when `now`).
func (h *hub) quickPlan(m *match, now bool) {
	names := map[string]bool{}
	for _, s := range m.seats {
		names[strings.ToLower(s.name)] = true
	}
	kept := m.ghosts[:0]
	for _, g := range m.ghosts {
		if !names[strings.ToLower(strings.TrimSuffix(g.Name, "*"))] {
			kept = append(kept, g)
		}
	}
	m.ghosts = kept
	need := max(0, quickTarget(m.typ)-len(m.seats))
	for len(m.ghosts) > need {
		drop := -1
		for i, g := range m.ghosts {
			if g.shownN == 0 {
				drop = i
			}
		}
		if drop < 0 && !now {
			break
		}
		if drop < 0 {
			for i, g := range m.ghosts {
				if drop < 0 || g.shownN > m.ghosts[drop].shownN {
					drop = i
				}
			}
		}
		m.ghosts = append(m.ghosts[:drop], m.ghosts[drop+1:]...)
	}
	for len(m.ghosts) < need {
		m.ghosts = append(m.ghosts, newGhost(m.rng, m))
	}
	// The unshown ones spread across what is left of the reveal, a little jitter each.
	from := m.quickEnd.Add(-h.quickReveal)
	if t := h.now(); from.Before(t) {
		from = t
	}
	// Everyone is shown a couple of ticks before the start, so nobody pops in unannounced.
	span := m.quickEnd.Sub(from) - max(h.quickReveal/10, 2*tickEvery)
	wait := []*ghostSeat{}
	for _, g := range m.ghosts {
		if g.shownN == 0 {
			wait = append(wait, g)
		}
	}
	for k, g := range wait {
		g.revealAt = from
		if span > 0 {
			u := (float64(k) + 0.2 + 0.6*m.rng.Float64()) / float64(len(wait))
			g.revealAt = from.Add(time.Duration(u * float64(span)))
		}
	}
	if now {
		for _, g := range m.ghosts {
			if g.shownN == 0 {
				m.shownN++
				g.shownN = m.shownN
			}
		}
	}
}

// quickOffer: the waiting list. `peers` are the humans (the client links to them and measures
// the ping, as in a room); `list` is who has joined, you first, then in the order they came.
func (h *hub) quickOffer(m *match) {
	ice, turn := h.ice.get()
	left := max(0, m.quickEnd.Sub(h.now()).Milliseconds())
	type entry struct {
		at   time.Time
		name string
		g    bool
		s    *seat
	}
	all := []entry{}
	for _, s := range m.seats {
		all = append(all, entry{at: s.joinAt, name: s.name, s: s})
	}
	for _, g := range m.ghosts {
		if g.shownN > 0 {
			all = append(all, entry{at: g.revealAt, name: g.Name, g: true})
		}
	}
	for i, s := range m.seats {
		peers := []map[string]any{}
		for j, o := range m.seats {
			if j != i {
				peers = append(peers, map[string]any{"id": o.id, "name": o.name, "ranked": o.ranked, "slot": j})
			}
		}
		list := []map[string]any{{"name": s.name, "you": true}}
		order := append([]entry{}, all...)
		for a := 1; a < len(order); a++ { // by time, stable (a handful of entries)
			for b := a; b > 0 && order[b].at.Before(order[b-1].at); b-- {
				order[b], order[b-1] = order[b-1], order[b]
			}
		}
		for _, e := range order {
			if e.s != s {
				list = append(list, map[string]any{"name": e.name})
			}
		}
		o := map[string]any{"t": "offer", "room": true, "quick": true, "match": m.id, "type": m.typ, "friend": false,
			"you": i, "peers": peers, "list": list, "counted": false, "startIn": left, "target": quickTarget(m.typ), "max": quickCap(m.typ)}
		if len(m.seats) >= 2 {
			o["ice"], o["turn"] = ice, turn
		}
		h.send(s.c, o)
	}
}

// tickQuick: reveal ghosts that are due, start windows that have run out.
func (h *hub) tickQuick(now time.Time) {
	for _, m := range h.matches {
		if !m.quick || m.state != mLobby {
			continue
		}
		if !now.Before(m.quickEnd) {
			h.quickStart(m)
			continue
		}
		for _, g := range m.ghosts { // one per tick: people never arrive in a clump
			if g.shownN == 0 && !now.Before(g.revealAt) {
				m.shownN++
				g.shownN = m.shownN
				h.quickOffer(m)
				break
			}
		}
	}
}

// quickStart: the window closed (or filled). Seats that never accepted are dealt out, the
// ghosts are final, and the allowance is spent as for any arena match.
func (h *hub) quickStart(m *match) {
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
	if len(kept) == 0 {
		h.closeMatch(m)
		return
	}
	h.quickPlan(m, true)
	h.quickStrength(m)
	h.lobbyDirt = true
	h.startMatch(m)
}

// quickStrength: ghosts fight about as well as the people in the match — skill from their
// ranked records (the ghost-fight formula), as many specials as they own on average — with a
// little variance either way.
func (h *hub) quickStrength(m *match) {
	skill, lo, n := 0.0, 0.0, 0.0
	for _, s := range m.seats {
		var b, w int
		if s.ranked && s.uid != "" {
			if l, ok := h.st.mine(s.uid); ok {
				b, w = l.Battles, l.Wins
			}
		}
		skill += ghostSkill(b, w)
		lo += float64(max(1, len(s.c.loadout)))
		n++
	}
	if n == 0 {
		skill, lo, n = 0.55, 2, 1
	}
	skill, lo = skill/n, lo/n
	for _, g := range m.ghosts {
		r := mrand.New(mrand.NewSource(int64(g.Seed)))
		g.Skill = math.Round(math.Max(0.35, math.Min(0.85, skill+(r.Float64()-0.5)*0.12))*100) / 100
		k := int(math.Round(lo)) + []int{-1, 0, 0, 1}[r.Intn(4)]
		g.Lo = ghostLoadout(g.Pers, min(8, max(1, k)), r)
	}
}

// ghostSkill: js/net/ghost.js ghostSkill, for a player's ranked record.
func ghostSkill(battles, wins int) float64 {
	b := float64(max(0, battles))
	w := math.Max(0, math.Min(b, float64(wins)))
	rate := (w + 1) / (b + 2)
	seasoned := math.Min(1, b/20)
	return math.Max(0.3, math.Min(0.9, 0.3+0.12*seasoned+0.5*rate))
}

func ghostLoadout(pers string, k int, r *mrand.Rand) []int {
	order := persSlots[pers]
	if order == nil {
		order = r.Perm(7)
		for i := range order {
			order[i]++
		}
	}
	out := []int{0}
	for _, s := range order {
		if len(out) >= k {
			break
		}
		out = append(out, s)
	}
	return out
}

// quickLocal: one person and ghosts. Nothing to link: their own browser runs the whole fight.
func (h *hub) quickLocal(m *match, s *seat) {
	left := -1
	if s.spent != nil {
		left = s.spent.Remaining
	}
	h.send(s.c, map[string]any{"t": "quickgo", "match": m.id, "mode": m.typ, "arena": coin(1 << 20),
		"ghosts": m.ghosts, "freeLeft": left})
	names := []string{}
	for _, g := range m.ghosts {
		names = append(names, g.Name+"("+g.Pers+")")
	}
	log.Printf("match %s (%s): quick, %s alone vs %s", m.id, m.typ, s.id, strings.Join(names, " "))
	m.state = mDone
	if s.c.match == m {
		s.c.match = nil
	}
	h.closeMatch(m)
}

// humanPlace: a quick match's ranking among its people only (ghost seats are ignored): who
// placed best of the humans, -1 on a tie.
func humanWinner(place []int, humans int) int {
	best, who := 1<<30, -1
	for i := 0; i < humans && i < len(place); i++ {
		switch {
		case place[i] < best:
			best, who = place[i], i
		case place[i] == best:
			who = -1
		}
	}
	return who
}

// humanOppDmg: oppDmg over the other people only.
func humanOppDmg(d []float64, me, humans int) float64 {
	if len(d) > humans {
		d = d[:humans]
	}
	return oppDmg(d, me)
}
