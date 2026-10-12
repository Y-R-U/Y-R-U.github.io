package main

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"log"
	"math/big"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
)

// The arena never runs a fight. It introduces players (lobby, challenges, friend codes),
// relays WebRTC signalling, relays game traffic for pairs that cannot connect directly, picks
// each round's master, and counts a result only when every player reports the same one.
//
// One goroutine owns every client and match field; sockets and slow calls (token checks,
// the payment service) talk to it through h.in. Same shape as Snake-eee's snakenet.

const (
	maxClients   = 600
	maxMatches   = 300
	maxSeats     = 8 // protocol ceiling (Last Man Standing); a duel uses two
	maxMsg       = 32 << 10
	sendQueue    = 512
	tickEvery    = 250 * time.Millisecond
	pingEvery    = 4 * time.Second
	offerTTL     = 75 * time.Second
	reportWindow = 15 * time.Second
	// A player whose socket drops mid-match keeps their seat this long, fighter standing
	// idle. Not back in time = a forfeit loss. Never a void: rage-quitting must not erase a result.
	defaultAwayGrace = 10 * time.Second
	rematchTTL       = 90 * time.Second
	roundsToWin      = 2
	maxDrawReplay    = 3
	relayPerSec      = 300
	relayBytesPS     = 256 << 10
)

type verifier func(context.Context, string) (identity, error)

type hub struct {
	in        chan event
	clients   map[string]*client
	matches   map[string]*match
	codes     map[string]*match
	ice       *iceSource
	allow     *allowance
	verify    verifier
	st        *store
	now       func() time.Time
	openLobby bool // dev/test: anonymous players may use the public lobby
	awayGrace time.Duration
	lan       bool     // home-network mode: results also kept for a later upload
	linkAuth  verifier // LAN: checks a Firebase token offered to link a device to an account
	lobbyDirt bool
	lagging   []*client

	statsMu sync.Mutex
	live    liveStats
}

type liveStats struct {
	Online  int `json:"online"`
	Waiting int `json:"waiting"`
	Offers  int `json:"offers"`
	Playing int `json:"playing"`
	Friend  int `json:"friendCodes"`
}

type client struct {
	id, name, region string
	uid              string
	ranked           bool // verified, non-anonymous Firebase account
	send             chan []byte
	gone, lagging    bool
	waiting          string // preferred game type while in the lobby
	lobby            bool   // wants lobby updates
	match            *match
	rtt              float64 // ms, server round trip, smoothed
	pingAt, lastPing time.Time
	budgetAt         time.Time
	budgetN, budgetB float64
	tok              string // resume secret for a dropped socket
	gen              int    // which socket is current; events from older ones are ignored
	away             bool
	awayUntil        time.Time
	loadout          []int // gesture slots owned, for ghosts
}

const (
	mLobby    = iota // friend code made, waiting for the friend
	mOffer           // matched: peers measure the real ping, both must accept
	mStarting        // both accepted: spending allowances
	mPlay
	mDone
)

type seat struct {
	c        *client
	id, name string
	uid      string
	ranked   bool
	accepted bool
	tok      string
	wins     int
	kos      int
	rematch  bool
	spent    *spendResult
}

type report struct {
	winner int
	ko     bool
}

type match struct {
	id, typ, code string
	friend        bool
	seats         []*seat
	state         int
	round         int
	master        int
	draws         int
	reports       map[int]report
	firstReport   time.Time
	deadline      time.Time
	arena         int
	log           []string
	spendID       string
}

type attachResult struct {
	c   *client
	gen int
}

type event struct {
	kind  int
	gen   int
	rid   string
	rtok  string
	c     *client
	data  []byte
	bin   bool
	fn    func()
	reply chan attachResult
}

const (
	evJoin = iota
	evLeave
	evMsg
	evTick
	evFn
)

func newHub(st *store, ice *iceSource, allow *allowance, verify verifier) *hub {
	return &hub{
		in: make(chan event, 2048), clients: map[string]*client{}, matches: map[string]*match{},
		codes: map[string]*match{}, awayGrace: defaultAwayGrace, ice: ice, allow: allow, verify: verify, st: st, now: time.Now,
	}
}

func (h *hub) run() {
	t := time.NewTicker(tickEvery)
	defer t.Stop()
	for {
		select {
		case e := <-h.in:
			h.handle(e)
		case <-t.C:
			h.handle(event{kind: evTick})
		}
	}
}

// post runs fn on the hub goroutine; used by the goroutines doing slow calls.
func (h *hub) post(fn func()) { h.in <- event{kind: evFn, fn: fn} }

func (h *hub) handle(e event) {
	switch e.kind {
	case evJoin:
		c := h.attach(e)
		gen := 0
		if c != nil {
			gen = c.gen
		}
		e.reply <- attachResult{c, gen}
	case evLeave:
		if e.gen == e.c.gen {
			h.disconnect(e.c)
		}
	case evMsg:
		if e.c.gone || e.gen != e.c.gen {
			return
		}
		if e.bin {
			h.relayBinary(e.c, e.data)
		} else {
			h.message(e.c, e.data)
		}
	case evTick:
		h.tick()
	case evFn:
		e.fn()
	}
	for len(h.lagging) > 0 {
		c := h.lagging[0]
		h.lagging = h.lagging[1:]
		h.drop(c, "lagging")
	}
	if h.lobbyDirt {
		h.lobbyDirt = false
		h.sendLobbies()
	}
	h.publish()
}

// ---------------------------------------------------------------- messages

type inMsg struct {
	T       string          `json:"t"`
	Name    string          `json:"name"`
	Tok     string          `json:"tok"`
	TZ      string          `json:"tz"`
	Type    string          `json:"type"`
	To      string          `json:"to"`
	Code    string          `json:"code"`
	Match   string          `json:"match"`
	Round   int             `json:"round"`
	Winner  *int            `json:"winner"`
	KO      bool            `json:"ko"`
	On      bool            `json:"on"`
	S       float64         `json:"s"`
	D       json.RawMessage `json:"d"`
	Loadout []int           `json:"loadout"`
	Link    string          `json:"link"` // LAN: a Firebase ID token, if this device is signed in
}

func (h *hub) message(c *client, raw []byte) {
	var m inMsg
	if json.Unmarshal(raw, &m) != nil {
		return
	}
	switch m.T {
	case "q": // pong to our ping
		if !c.pingAt.IsZero() {
			rtt := float64(h.now().Sub(c.pingAt).Microseconds()) / 1000
			if c.rtt == 0 {
				c.rtt = rtt
			} else {
				c.rtt = c.rtt*0.7 + rtt*0.3
			}
			c.pingAt = time.Time{}
		}
	case "hello":
		c.region = regionOf(m.TZ)
		c.loadout = cleanLoadout(m.Loadout)
		h.setName(c, m.Name)
		if m.Link != "" && h.lan && h.linkAuth != nil {
			h.linkAccount(c, m.Link)
		}
		if m.Tok != "" {
			h.checkToken(c, m.Tok)
		} else {
			h.sendMe(c)
		}
	case "auth":
		h.checkToken(c, m.Tok)
	case "name":
		h.setName(c, m.Name)
		h.sendMe(c)
		h.lobbyDirt = true
	case "lobby":
		c.lobby = m.On
		if c.lobby {
			h.sendLobby(c)
		}
	case "wait":
		h.wait(c, m.Type)
	case "unwait":
		if c.waiting != "" {
			c.waiting = ""
			h.lobbyDirt = true
		}
	case "challenge":
		h.challenge(c, m.To)
	case "friend":
		h.friend(c, m.Type)
	case "join":
		h.joinCode(c, m.Code)
	case "accept":
		h.accept(c, m.Match, m.Tok)
	case "decline":
		if mt := h.mine(c, m.Match); mt != nil && mt.state <= mStarting {
			h.cancel(mt, "declined", c)
		}
	case "round":
		if mt := h.mine(c, m.Match); mt != nil && m.Winner != nil {
			h.report(mt, c, m.Round, *m.Winner, m.KO)
		}
	case "rematch":
		h.rematch(c, m.Match)
	case "leave":
		h.leaveMatch(c, "left")
		h.sendLobby(c)
	case "sig":
		h.forwardSig(c, m)
	}
}

func (h *hub) setName(c *client, raw string) {
	if strings.TrimSpace(raw) == "" {
		return
	}
	n, err := cleanName(raw)
	if err != nil {
		h.send(c, map[string]any{"t": "err", "code": "name", "msg": "Pick a different name."})
		return
	}
	c.name = n
}

func (h *hub) checkToken(c *client, tok string) {
	if tok == "" || len(tok) > 8192 {
		h.sendMe(c)
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
		defer cancel()
		id, err := h.verify(ctx, tok)
		h.post(func() {
			if c.gone {
				return
			}
			if err != nil {
				log.Printf("client %s: token refused (%v)", c.id, err)
			} else if c.uid == "" || c.uid == id.UID {
				// One socket, one account. A different uid mid-session is ignored.
				c.uid, c.ranked = id.UID, !id.Anonymous
			}
			h.sendMe(c)
			h.lobbyDirt = true
		})
	}()
}

// linkAccount: a LAN device that is also signed in to br8t (hook; the LAN page does not send
// it yet). Verified like production, then every un-uploaded LAN result of the device is tied
// to that account.
func (h *hub) linkAccount(c *client, tok string) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
		defer cancel()
		id, err := h.linkAuth(ctx, tok)
		if err != nil || id.Anonymous {
			return
		}
		h.post(func() {
			if strings.HasPrefix(c.uid, "lan:") {
				h.st.linkDevice(c.uid, id.UID)
			}
		})
	}()
}

func (h *hub) sendMe(c *client) {
	h.send(c, map[string]any{"t": "me", "id": c.id, "name": c.name, "ranked": c.ranked, "lobby": h.openLobby || c.ranked})
}

func (h *hub) send(c *client, v any) {
	b, err := json.Marshal(v)
	if err != nil {
		return
	}
	h.push(c, append([]byte{'t'}, b...))
}

func (h *hub) push(c *client, frame []byte) {
	if c.gone || c.send == nil {
		return
	}
	select {
	case c.send <- frame:
	default:
		if !c.lagging {
			c.lagging = true
			h.lagging = append(h.lagging, c)
		}
	}
}

// ---------------------------------------------------------------- lobby

type lobbyEntry struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Type   string `json:"type"`
	Ranked bool   `json:"ranked"`
	Est    int    `json:"est"` // rough ping estimate in ms; the real one is measured on tap
}

func (h *hub) wait(c *client, typ string) {
	typ = cleanType(typ)
	if typ == "" {
		h.send(c, map[string]any{"t": "err", "code": "type", "msg": "That mode is not open yet."})
		return
	}
	if !c.ranked && !h.openLobby {
		h.send(c, map[string]any{"t": "err", "code": "signin", "msg": "Sign in to fight strangers. Friend links work without an account."})
		return
	}
	h.leaveMatch(c, "left")
	c.waiting = typ
	c.lobby = true
	h.lobbyDirt = true
}

func (h *hub) sendLobbies() {
	for _, c := range h.clients {
		if c.lobby {
			h.sendLobby(c)
		}
	}
}

func (h *hub) sendLobby(c *client) {
	list := []lobbyEntry{}
	for _, o := range h.clients {
		if o == c || o.waiting == "" || o.match != nil {
			continue
		}
		list = append(list, lobbyEntry{ID: o.id, Name: o.name, Type: o.waiting, Ranked: o.ranked, Est: estimate(c, o)})
	}
	sort.Slice(list, func(i, j int) bool {
		if list[i].Est != list[j].Est {
			return list[i].Est < list[j].Est
		}
		return list[i].ID < list[j].ID
	})
	if len(list) > 50 {
		list = list[:50]
	}
	h.send(c, map[string]any{"t": "lobby", "players": list, "waiting": c.waiting, "online": len(h.clients)})
}

// A rough guess at the browser-to-browser ping, from timezones and each player's round trip
// to this server. Only a sort order and a hint: the offer measures the real one.
var regionRTT = map[string]int{
	"oce|am": 170, "oce|eu": 280, "oce|as": 120, "am|eu": 100, "am|as": 170, "eu|as": 170,
}

func estimate(a, b *client) int {
	if a.region != "xx" && a.region == b.region {
		return 35
	}
	if v, ok := regionRTT[a.region+"|"+b.region]; ok {
		return v
	}
	if v, ok := regionRTT[b.region+"|"+a.region]; ok {
		return v
	}
	if a.rtt > 0 && b.rtt > 0 {
		return int((a.rtt + b.rtt) / 2)
	}
	return 150
}

// ---------------------------------------------------------------- matching

func (h *hub) newMatch(typ string, friend bool, cs ...*client) *match {
	m := &match{id: h.newID(), typ: typ, friend: friend, reports: map[int]report{}, master: -1}
	for _, c := range cs {
		h.seatIn(m, c)
	}
	h.matches[m.id] = m
	return m
}

func (h *hub) seatIn(m *match, c *client) {
	c.waiting = ""
	c.match = m
	m.seats = append(m.seats, &seat{c: c, id: c.id, name: c.name, uid: c.uid, ranked: c.ranked})
	h.lobbyDirt = true
}

func (h *hub) challenge(c *client, to string) {
	o := h.clients[to]
	switch {
	case !c.ranked && !h.openLobby:
		h.send(c, map[string]any{"t": "err", "code": "signin", "msg": "Sign in to fight strangers. Friend links work without an account."})
		return
	case o == nil || o == c || o.waiting == "" || o.match != nil:
		h.send(c, map[string]any{"t": "err", "code": "gone", "msg": "They are not waiting any more."})
		h.sendLobby(c)
		return
	case len(h.matches) >= maxMatches:
		h.send(c, map[string]any{"t": "err", "code": "full", "msg": "The arena is full right now. Try again in a minute."})
		return
	}
	typ := o.waiting
	h.leaveMatch(c, "left")
	m := h.newMatch(typ, false, o, c)
	h.offer(m)
}

func (h *hub) friend(c *client, typ string) {
	if typ = cleanType(typ); typ == "" {
		typ = "duel"
	}
	if len(h.matches) >= maxMatches {
		h.send(c, map[string]any{"t": "err", "code": "full", "msg": "The arena is full right now. Try again in a minute."})
		return
	}
	h.leaveMatch(c, "left")
	m := h.newMatch(typ, true, c)
	for {
		m.code = newCode()
		if h.codes[m.code] == nil {
			break
		}
	}
	h.codes[m.code] = m
	m.state = mLobby
	m.deadline = h.now().Add(30 * time.Minute)
	h.send(c, map[string]any{"t": "friend", "match": m.id, "code": m.code, "type": typ})
}

func (h *hub) joinCode(c *client, code string) {
	m := h.codes[normCode(code)]
	if m == nil || m.state != mLobby {
		h.send(c, map[string]any{"t": "err", "code": "nocode", "msg": "That link has expired. Ask for a new one."})
		return
	}
	if m == c.match {
		return
	}
	h.leaveMatch(c, "left")
	delete(h.codes, m.code)
	h.seatIn(m, c)
	h.offer(m)
}

// offer: the players are matched. Only now do they get TURN credentials, and they open a
// direct link to measure the real ping before either accepts.
func (h *hub) offer(m *match) {
	m.state = mOffer
	m.deadline = h.now().Add(offerTTL)
	ice, turn := h.ice.get()
	for i, s := range m.seats {
		peers := []map[string]any{}
		for j, o := range m.seats {
			if j != i {
				peers = append(peers, map[string]any{"id": o.id, "name": o.name, "ranked": o.ranked, "slot": j})
			}
		}
		h.send(s.c, map[string]any{"t": "offer", "match": m.id, "type": m.typ, "friend": m.friend,
			"you": i, "peers": peers, "ice": ice, "turn": turn, "counted": m.counted()})
	}
}

// counted: a result can reach the stats (at least one signed-in player).
func (m *match) counted() bool {
	for _, s := range m.seats {
		if s.ranked {
			return true
		}
	}
	return false
}

func (h *hub) mine(c *client, id string) *match {
	if c.match != nil && c.match.id == id {
		return c.match
	}
	return nil
}

func (m *match) slotOf(c *client) int {
	for i, s := range m.seats {
		if s.c == c {
			return i
		}
	}
	return -1
}

func (h *hub) accept(c *client, id, tok string) {
	m := h.mine(c, id)
	if m == nil || m.state != mOffer {
		return
	}
	s := m.seats[m.slotOf(c)]
	s.accepted = true
	if tok != "" && len(tok) < 8192 {
		s.tok = tok
	}
	for _, o := range m.seats {
		if o != s {
			h.send(o.c, map[string]any{"t": "accepted", "match": m.id, "slot": m.slotOf(c)})
		}
	}
	for _, o := range m.seats {
		if !o.accepted {
			return
		}
	}
	h.startMatch(m)
}

// startMatch spends each signed-in player's free allowance (one per best of 3), then flips
// the coin for round 1.
func (h *hub) startMatch(m *match) {
	m.state = mStarting
	m.spendID = newUUID()
	pending := 0
	for _, s := range m.seats {
		s.spent = nil
		if !s.ranked || s.tok == "" {
			s.spent = &spendResult{OK: true, Remaining: -1}
			continue
		}
		pending++
		s := s
		uid, tok, id := s.uid, s.tok, m.spendID
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
			idn, err := h.verify(ctx, tok)
			cancel()
			r := spendResult{OK: true, Remaining: -1}
			if err == nil && idn.UID == uid && !idn.Anonymous {
				r = h.allow.claimArenaBattle(tok, id)
			}
			h.post(func() {
				s.spent = &r
				h.maybeBegin(m)
			})
		}()
	}
	if pending == 0 {
		h.maybeBegin(m)
	}
}

func (h *hub) maybeBegin(m *match) {
	if m.state != mStarting || h.matches[m.id] != m {
		return
	}
	for _, s := range m.seats {
		if s.spent == nil {
			return
		}
	}
	for _, s := range m.seats {
		if !s.spent.OK {
			h.send(s.c, map[string]any{"t": "err", "code": "allowance",
				"msg": "That was today's last free arena battle. The br8t Pass makes them unlimited — or come back tomorrow."})
			h.cancel(m, "allowance", nil)
			return
		}
	}
	m.state = mPlay
	m.round = 1
	m.master = coin(len(m.seats))
	m.arena = coin(1 << 20)
	for _, s := range m.seats {
		s.wins, s.kos, s.rematch = 0, 0, false
	}
	m.log = append(m.log, "r1 master "+m.seats[m.master].id)
	h.sendGo(m)
}

func (h *hub) sendGo(m *match) {
	m.reports = map[int]report{}
	m.firstReport = time.Time{}
	for i := range m.seats {
		h.sendGoTo(m, i)
	}
}

func (h *hub) sendGoTo(m *match, i int) {
	score := make([]int, len(m.seats))
	roster := make([]map[string]any, len(m.seats))
	for j, s := range m.seats {
		score[j] = s.wins
		roster[j] = map[string]any{"id": s.id, "name": s.name, "ranked": s.ranked, "away": s.c.away}
	}
	s := m.seats[i]
	left := -1
	if s.spent != nil {
		left = s.spent.Remaining
	}
	h.send(s.c, map[string]any{"t": "go", "match": m.id, "round": m.round, "master": m.master,
		"you": i, "score": score, "seats": roster, "arena": m.arena, "freeLeft": left})
}

// report: every player says who won the round. Counted only if they all agree.
func (h *hub) report(m *match, c *client, round, winner int, ko bool) {
	if m.state != mPlay || round != m.round || winner < -1 || winner >= len(m.seats) {
		return
	}
	slot := m.slotOf(c)
	if _, dup := m.reports[slot]; dup {
		return
	}
	if len(m.reports) == 0 {
		m.firstReport = h.now()
	}
	m.reports[slot] = report{winner, ko}
	if len(m.reports) < len(m.seats) {
		return
	}
	first := m.reports[0]
	for _, r := range m.reports {
		if r != first {
			h.void(m, "disagree", nil)
			return
		}
	}
	m.log = append(m.log, "r"+itoa(m.round)+" won by "+itoa(first.winner))
	if first.winner < 0 {
		m.draws++
		if m.draws >= maxDrawReplay {
			h.void(m, "draws", nil)
			return
		}
		h.sendGo(m) // replay the round, same master
		return
	}
	m.draws = 0
	w := m.seats[first.winner]
	w.wins++
	if first.ko {
		w.kos++
	}
	if w.wins >= roundsToWin {
		h.finish(m, first.winner)
		return
	}
	// Round 2 swaps the master; round 3 goes to whoever lost round 2.
	prev := m.master
	m.round++
	if m.round == 2 {
		m.master = (prev + 1) % len(m.seats)
	} else {
		m.master = (first.winner + 1) % len(m.seats)
	}
	m.log = append(m.log, "r"+itoa(m.round)+" master "+m.seats[m.master].id)
	h.sendGo(m)
}

// forfeit: a player left (or never came back) mid-match. In a duel the other player wins the
// match outright and it counts. Multi-player modes will eliminate the leaver instead.
func (h *hub) forfeit(m *match, leaver int) {
	winner := -1
	for i, s := range m.seats {
		if i != leaver && (winner < 0 || s.wins > m.seats[winner].wins) {
			winner = i
		}
	}
	m.log = append(m.log, "forfeit by "+m.seats[leaver].id)
	h.finishFF(m, winner, true)
}

func (h *hub) finish(m *match, winner int) { h.finishFF(m, winner, false) }

func (h *hub) finishFF(m *match, winner int, ff bool) {
	m.state = mDone
	m.deadline = h.now().Add(rematchTTL)
	seats := make([]seatRow, len(m.seats))
	score := ""
	for i, s := range m.seats {
		seats[i] = seatRow{UID: s.uid, Name: s.name, Won: i == winner, KOs: s.kos, Ranked: s.ranked, Loadout: s.c.loadout}
		if i > 0 {
			score += "-"
		}
		score += itoa(s.wins)
	}
	if ff {
		score += " ff"
	}
	if err := h.st.recordMatch(m.id, m.typ, m.friend, score, seats); err != nil {
		log.Printf("match %s: stats write failed: %v", m.id, err)
	}
	if h.lan {
		h.st.recordLan(m.id, m.typ, ff, seats)
	}
	log.Printf("match %s: %s won %s (%s)", m.id, m.seats[winner].id, score, strings.Join(m.log, ", "))
	for i, s := range m.seats {
		out := map[string]any{"t": "result", "match": m.id, "winner": winner, "you": i, "score": scoreOf(m), "counted": s.ranked, "forfeit": ff}
		if s.ranked {
			if line, ok := h.st.mine(s.uid); ok {
				out["stats"] = line
			}
		}
		h.send(s.c, out)
	}
}

func scoreOf(m *match) []int {
	out := make([]int, len(m.seats))
	for i, s := range m.seats {
		out[i] = s.wins
	}
	return out
}

func (h *hub) rematch(c *client, id string) {
	m := h.mine(c, id)
	if m == nil || m.state != mDone {
		return
	}
	m.seats[m.slotOf(c)].rematch = true
	for _, s := range m.seats {
		if s != m.seats[m.slotOf(c)] {
			h.send(s.c, map[string]any{"t": "rematch", "match": m.id, "slot": m.slotOf(c)})
		}
	}
	for _, s := range m.seats {
		if !s.rematch {
			return
		}
	}
	// Same players, a fresh match: new id, new coin flip, one more allowance each.
	cs := make([]*client, len(m.seats))
	toks := make([]string, len(m.seats))
	for i, s := range m.seats {
		cs[i], toks[i] = s.c, s.tok
		s.c.match = nil
	}
	h.closeMatch(m)
	n := h.newMatch(m.typ, m.friend, cs...)
	for i, s := range n.seats {
		s.accepted, s.tok = true, toks[i]
	}
	h.startMatch(n)
}

func (h *hub) cancel(m *match, why string, by *client) {
	for _, s := range m.seats {
		if s.c != by {
			h.send(s.c, map[string]any{"t": "cancel", "match": m.id, "why": why})
		}
		s.c.match = nil
	}
	h.closeMatch(m)
}

func (h *hub) void(m *match, why string, by *client) {
	log.Printf("match %s: VOID (%s) %s", m.id, why, strings.Join(m.log, ", "))
	h.st.recordVoid(m.id, m.typ, m.friend, len(m.seats), why)
	for _, s := range m.seats {
		if s.c != by {
			h.send(s.c, map[string]any{"t": "void", "match": m.id, "why": why})
		}
		s.c.match = nil
	}
	h.closeMatch(m)
}

func (h *hub) closeMatch(m *match) {
	delete(h.matches, m.id)
	if m.code != "" && h.codes[m.code] == m {
		delete(h.codes, m.code)
	}
	h.lobbyDirt = true
}

func (h *hub) leaveMatch(c *client, why string) {
	m := c.match
	if m == nil {
		return
	}
	switch m.state {
	case mPlay:
		h.forfeit(m, m.slotOf(c))
	case mDone:
		for _, s := range m.seats {
			if s.c != c {
				h.send(s.c, map[string]any{"t": "left", "match": m.id})
			}
			s.c.match = nil
		}
		h.closeMatch(m)
	default:
		h.cancel(m, why, c)
	}
	c.match = nil
}

func (h *hub) tick() {
	now := h.now()
	for _, m := range h.matches {
		switch {
		case m.state == mPlay && !m.firstReport.IsZero() && now.Sub(m.firstReport) > reportWindow:
			h.void(m, "timeout", nil)
		case (m.state == mOffer || m.state == mLobby || m.state == mDone) && now.After(m.deadline):
			if m.state == mDone {
				h.leaveMatchAll(m)
			} else {
				h.cancel(m, "timeout", nil)
			}
		}
	}
	for _, c := range h.clients {
		if c.away {
			if now.After(c.awayUntil) {
				log.Printf("client %s did not come back", c.id)
				h.drop(c, "gone")
			}
			continue
		}
		if now.Sub(c.lastPing) >= pingEvery {
			c.lastPing, c.pingAt = now, now
			h.send(c, map[string]any{"t": "p", "s": now.UnixMilli()})
		}
	}
}

func (h *hub) leaveMatchAll(m *match) {
	for _, s := range m.seats {
		h.send(s.c, map[string]any{"t": "left", "match": m.id})
		s.c.match = nil
	}
	h.closeMatch(m)
}

// ---------------------------------------------------------------- relay

func (h *hub) allowRelay(c *client, n int) bool {
	now := h.now()
	el := now.Sub(c.budgetAt).Seconds()
	c.budgetAt = now
	c.budgetN = min(relayPerSec, c.budgetN+el*relayPerSec)
	c.budgetB = min(relayBytesPS, c.budgetB+el*relayBytesPS)
	if c.budgetN < 1 || c.budgetB < float64(n) {
		return false
	}
	c.budgetN--
	c.budgetB -= float64(n)
	return true
}

// peer: signalling and relayed traffic only ever go to someone in the same match.
func (h *hub) peer(c *client, to string) *client {
	m := c.match
	if m == nil || m.state == mLobby {
		return nil
	}
	for _, s := range m.seats {
		if s.id == to && s.c != c {
			return s.c
		}
	}
	return nil
}

func (h *hub) forwardSig(c *client, m inMsg) {
	if !h.allowRelay(c, len(m.D)) {
		return
	}
	if p := h.peer(c, m.To); p != nil {
		h.send(p, map[string]any{"t": "sig", "from": c.id, "d": m.D})
	}
}

// Binary relay frames are [len][to id][payload] in and [len][from id][payload] out.
func (h *hub) relayBinary(c *client, b []byte) {
	if len(b) < 2 || int(b[0])+1 > len(b) || !h.allowRelay(c, len(b)) {
		return
	}
	p := h.peer(c, string(b[1:1+int(b[0])]))
	if p == nil {
		return
	}
	payload := b[1+int(b[0]):]
	out := make([]byte, 0, 2+len(c.id)+len(payload))
	out = append(out, 'b', byte(len(c.id)))
	out = append(out, c.id...)
	out = append(out, payload...)
	h.push(p, out)
}

// ---------------------------------------------------------------- lifecycle

func (h *hub) attach(e event) *client {
	if old := h.clients[e.rid]; e.rid != "" && old != nil && !old.gone && old.tok != "" && old.tok == e.rtok {
		if old.send != nil {
			close(old.send)
		}
		old.send, old.away = e.c.send, false
		old.gen++
		old.budgetAt = h.now()
		h.send(old, map[string]any{"t": "welcome", "id": old.id, "tok": old.tok, "ice": stunOnly, "resumed": true, "grace": h.awayGrace.Milliseconds()})
		h.sendMe(old)
		if m := old.match; m != nil {
			slot := m.slotOf(old)
			for _, s := range m.seats {
				if s.c != old {
					h.send(s.c, map[string]any{"t": "back", "match": m.id, "slot": slot})
				}
			}
			if m.state == mPlay {
				h.sendGoTo(m, slot)
			}
		}
		return old
	}
	if len(h.clients) >= maxClients {
		return nil
	}
	c := e.c
	c.id = h.newID()
	c.tok = randString(idChars, 24)
	c.name = "Fighter " + randString("0123456789", 4)
	c.region = "xx"
	c.budgetAt = h.now()
	h.clients[c.id] = c
	h.send(c, map[string]any{"t": "welcome", "id": c.id, "tok": c.tok, "ice": stunOnly, "grace": h.awayGrace.Milliseconds()})
	return c
}

// disconnect: the socket is gone. Mid-match the seat is held for awayGrace with the fighter
// idle; anywhere else the player simply leaves.
func (h *hub) disconnect(c *client) {
	if c.gone {
		return
	}
	m := c.match
	if m == nil || m.state != mPlay {
		h.drop(c, "left")
		return
	}
	c.away = true
	c.awayUntil = h.now().Add(h.awayGrace)
	if c.send != nil {
		close(c.send)
		c.send = nil
	}
	slot := m.slotOf(c)
	for _, s := range m.seats {
		if s.c != c {
			h.send(s.c, map[string]any{"t": "away", "match": m.id, "slot": slot, "ms": h.awayGrace.Milliseconds()})
		}
	}
}

func (h *hub) drop(c *client, why string) {
	if c.gone {
		return
	}
	h.leaveMatch(c, why)
	if c.waiting != "" {
		h.lobbyDirt = true
	}
	c.gone = true
	delete(h.clients, c.id)
	if c.send != nil {
		close(c.send)
		c.send = nil
	}
}

func (h *hub) publish() {
	s := liveStats{Online: len(h.clients), Friend: len(h.codes)}
	for _, c := range h.clients {
		if c.waiting != "" {
			s.Waiting++
		}
	}
	for _, m := range h.matches {
		switch m.state {
		case mOffer, mStarting:
			s.Offers++
		case mPlay:
			s.Playing++
		}
	}
	h.statsMu.Lock()
	h.live = s
	h.statsMu.Unlock()
}

func (h *hub) liveStats() liveStats {
	h.statsMu.Lock()
	defer h.statsMu.Unlock()
	return h.live
}

func (h *hub) serveWS(w http.ResponseWriter, r *http.Request, origins []string) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: origins})
	if err != nil {
		return
	}
	conn.SetReadLimit(maxMsg)
	send := make(chan []byte, sendQueue)
	reply := make(chan attachResult, 1)
	q := r.URL.Query()
	h.in <- event{kind: evJoin, c: &client{send: send}, rid: q.Get("id"), rtok: q.Get("tok"), reply: reply}
	res := <-reply
	c, gen := res.c, res.gen
	if c == nil {
		conn.Close(websocket.StatusTryAgainLater, "server full")
		return
	}
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	go writer(ctx, conn, send, cancel)
	for {
		typ, data, err := conn.Read(ctx)
		if err != nil {
			break
		}
		h.in <- event{kind: evMsg, c: c, gen: gen, data: data, bin: typ == websocket.MessageBinary}
	}
	h.in <- event{kind: evLeave, c: c, gen: gen}
	conn.Close(websocket.StatusNormalClosure, "")
}

func writer(ctx context.Context, conn *websocket.Conn, send chan []byte, cancel func()) {
	defer cancel()
	for {
		select {
		case <-ctx.Done():
			return
		case frame, ok := <-send:
			if !ok {
				conn.Close(websocket.StatusPolicyViolation, "dropped")
				return
			}
			typ := websocket.MessageText
			if frame[0] == 'b' {
				typ = websocket.MessageBinary
			}
			wctx, wcancel := context.WithTimeout(ctx, 10*time.Second)
			err := conn.Write(wctx, typ, frame[1:])
			wcancel()
			if err != nil {
				return
			}
		}
	}
}

// ---------------------------------------------------------------- helpers

const idChars = "abcdefghijkmnpqrstuvwxyz23456789"

func (h *hub) newID() string {
	for {
		id := randString(idChars, 8)
		if h.clients[id] == nil && h.matches[id] == nil {
			return id
		}
	}
}

func cleanLoadout(in []int) []int {
	out := []int{}
	seen := map[int]bool{}
	for _, v := range in {
		if v >= 0 && v < 8 && !seen[v] && len(out) < 8 {
			seen[v] = true
			out = append(out, v)
		}
	}
	return out
}

func coin(n int) int {
	v, _ := rand.Int(rand.Reader, big.NewInt(int64(n)))
	return int(v.Int64())
}

func regionOf(tz string) string {
	switch {
	case strings.HasPrefix(tz, "Australia/"), tz == "Pacific/Auckland", tz == "Pacific/Chatham",
		tz == "Pacific/Fiji", tz == "Pacific/Port_Moresby", tz == "Pacific/Noumea":
		return "oce"
	case strings.HasPrefix(tz, "America/"), strings.HasPrefix(tz, "US/"), strings.HasPrefix(tz, "Canada/"),
		tz == "Pacific/Honolulu":
		return "am"
	case strings.HasPrefix(tz, "Europe/"), strings.HasPrefix(tz, "Africa/"), strings.HasPrefix(tz, "Atlantic/"):
		return "eu"
	case strings.HasPrefix(tz, "Asia/"), strings.HasPrefix(tz, "Indian/"):
		return "as"
	}
	return "xx"
}

func itoa(n int) string {
	if n < 0 {
		return "-" + itoa(-n)
	}
	if n == 0 {
		return "0"
	}
	s := ""
	for n > 0 {
		s = string(rune('0'+n%10)) + s
		n /= 10
	}
	return s
}
