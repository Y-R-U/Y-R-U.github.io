package main

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"log"
	"math/big"
	mrand "math/rand"
	"net"
	"net/http"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
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
	maxClients = 600
	maxMatches = 300
	maxSeats   = 8 // protocol ceiling (Last Man Standing); a duel uses two
	maxMsg     = 32 << 10
	sendQueue  = 1024      // frame slots; the real bound is maxQueued bytes
	maxQueued  = 512 << 10 // bytes waiting for one socket's writer
	tickEvery  = 250 * time.Millisecond
	pingEvery  = 4 * time.Second
	// No pong for pingEvery+pongLate (2 pings) = the tab is frozen or gone: the socket is closed
	// and the seat takes the away path (1v1 grace then forfeit, room elimination / migration).
	pongLate = pingEvery
	// stall: a guest that has had no master snapshot for at least stallMin says so; reports
	// fresher than stallFresh count. The silence is timed by the server from the first report.
	stallMin, stallFresh = 2 * time.Second, 3 * time.Second
	// 1v1: a guest who quits after this long of reported silence does not forfeit, IF the server
	// itself saw the master go quiet (away, or a pong more than pongDue late).
	stallQuit    = 10 * time.Second
	pongDue      = 2 * time.Second
	helloWithin  = 10 * time.Second
	offerTTL     = 75 * time.Second
	reportWindow = 15 * time.Second
	// Every inbound frame, per socket (relay included: a room master sends ~30/s per guest).
	inRate, inBurst = 400, 400
	// name / wait / unwait: they change what every lobby client sees.
	ctlRate, ctlBurst = 1, 6
	joinFailsPerMin   = 5
	defaultPerIP      = 64 // IPv6 counts per /64 (ipKey): one home or phone, not one address
	// A round that nobody finishes still ends: past this, silence is a forfeit (or, if nobody
	// reported at all, a void). Duel rounds are 60 s, room rounds up to 150 s + 30 s overtime.
	duelRoundCap = 3 * time.Minute
	roomRoundCap = 5 * time.Minute
	// A forfeit this early (or before any round was agreed) costs the leaver, pays nobody.
	defaultEarlyFF = 10 * time.Second
	// A player whose socket drops mid-match keeps their seat this long, fighter standing
	// idle. Not back in time = a forfeit loss. Never a void: rage-quitting must not erase a result.
	defaultAwayGrace = 10 * time.Second
	rematchTTL       = 90 * time.Second
	roundsToWin      = 2
	maxDrawReplay    = 3
	relayPerSec      = 300
	relayBytesPS     = 256 << 10
	recvPerSec       = 2 * relayPerSec // relay + signalling INTO one socket, from all its peers
	recvBytesPS      = 2 * relayBytesPS
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
	// Multi-player rooms (rooms.go): countdown at roomQuorum, slower one below it.
	roomCountdown, roomSlow, migrateAfter   time.Duration
	reportWindow, earlyFF, duelCap, roomCap time.Duration
	helloWithin, pongLate                   time.Duration
	pingEvery, pongDue, stallQuit           time.Duration
	quickWindow, quickReveal                time.Duration // quick.go
	perIP                                   int
	ipN                                     map[string]int

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
	queued           *atomic.Int64 // bytes in send, shared with this socket's writer
	ip               string
	hello            bool
	since, pongAt    time.Time
	authBusy         bool
	authNext         string
	linking          bool
	ctlAt            time.Time
	ctlN             float64
	joinFails        []time.Time
	lobbyOwed        bool
	recvAt           time.Time
	recvN, recvB     float64
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
	awaySince        time.Time
	lastOut          map[string]any // a room elimination this client has not heard yet (it was away)
	loadout          []int          // gesture slots owned, for ghosts
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
	checked  bool               // its token verified as its own account (startMatch phase 1)
	paying   bool               // its allowance claim is in flight (phase 2)
	rtok     string             // the fresh token sent with "rematch": a rematch never reuses tok
	stallAt  time.Time          // last "stall" report from this seat (the master is silent)
	stallFor time.Time          // when the silence it reports began
	out      bool               // rooms: eliminated (left, or never came back)
	outSeq   int                // order of going out, for placements
	rtts     map[string]float64 // rooms: this seat's measured ping to each peer id
	joinAt   time.Time
}

type report struct {
	winner int
	ko     bool
	place  string // rooms: placements, comma-joined, part of what must agree
	dmg    string // each fighter's damage at the end (whole percent, comma-joined): agreed too
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
	dmg           []float64 // damage per seat (0-1) in the latest agreed round: the deciding one at the end
	room          bool      // a 2-8 player mode: one round, host migration, eliminations
	startAt       time.Time // rooms: when the countdown ends
	outN          int
	playAt        time.Time // when play began
	roundEnd      time.Time // hard deadline for the current round
	agreed        int       // rounds every seat agreed on
	firstIn       []bool    // rooms: which seats were still in at the first report
	ffBy          int       // 1v1 forfeit: the seat that forfeited, and why
	ffWhy         string
	note          string // appended to the stored score (" disputed")
	// quick.go: a QUICK FIGHT window/match. Ghost seats come after the people's, slot-wise.
	quick    bool
	ghosts   []*ghostSeat
	quickEnd time.Time
	shownN   int
	rng      *mrand.Rand
}

// fighters: every slot in the fight, ghost seats included.
func (m *match) fighters() int { return len(m.seats) + len(m.ghosts) }

type attachResult struct {
	c   *client
	gen int
	why string
}

type event struct {
	kind  int
	gen   int
	rid   string
	rtok  string
	c     *client
	ip    string
	hide  bool // evLeave: the page closed its socket on purpose (4001, tab hidden)
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
		roomCountdown: defaultRoomCountdown, roomSlow: defaultRoomSlow, migrateAfter: defaultMigrateAfter,
		reportWindow: reportWindow, earlyFF: defaultEarlyFF, duelCap: duelRoundCap, roomCap: roomRoundCap,
		perIP: defaultPerIP, ipN: map[string]int{}, helloWithin: helloWithin, pongLate: pongLate,
		pingEvery: pingEvery, pongDue: pongDue, stallQuit: stallQuit,
		quickWindow: defaultQuickWindow, quickReveal: defaultQuickReveal,
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
		c, why := h.attach(e)
		gen := 0
		if c != nil {
			gen = c.gen
		}
		e.reply <- attachResult{c, gen, why}
	case evLeave:
		if e.gen == e.c.gen {
			h.disconnect(e.c)
			if e.hide {
				h.hidden(e.c)
			}
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
		// A full queue is a dead or very slow reader: mid-match it gets the away grace (and can
		// resume), anywhere else it is simply gone.
		log.Printf("client %s lagging", c.id)
		h.disconnect(c)
	}
	if e.kind == evTick {
		h.flushLobbies()
		h.publish()
	}
}

// ---------------------------------------------------------------- messages

type inMsg struct {
	T       string             `json:"t"`
	Name    string             `json:"name"`
	Tok     string             `json:"tok"`
	TZ      string             `json:"tz"`
	Type    string             `json:"type"`
	To      string             `json:"to"`
	Code    string             `json:"code"`
	Match   string             `json:"match"`
	Round   int                `json:"round"`
	Winner  *int               `json:"winner"`
	KO      bool               `json:"ko"`
	On      bool               `json:"on"`
	S       float64            `json:"s"`
	D       json.RawMessage    `json:"d"`
	Loadout []int              `json:"loadout"`
	Place   []int              `json:"place"`
	Dmg     []int              `json:"dmg"`
	R       map[string]float64 `json:"r"`
	Link    string             `json:"link"` // LAN: a Firebase ID token, if this device is signed in
	Ms      float64            `json:"ms"`   // stall: how long the master has been silent
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
		c.pongAt = h.now()
	case "hello":
		c.hello = true
		c.region = regionOf(m.TZ)
		c.loadout = cleanLoadout(m.Loadout)
		h.setName(c, m.Name)
		if m.Link != "" && h.lan && h.linkAuth != nil && !c.linking {
			c.linking = true
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
		if !h.ctl(c) {
			return
		}
		h.setName(c, m.Name)
		h.sendMe(c)
		h.lobbyDirt = true
	case "lobby":
		c.lobby = m.On
		if c.lobby {
			c.lobbyOwed = true
		}
	case "wait":
		if !h.ctl(c) {
			return
		}
		h.wait(c, m.Type)
	case "quick":
		if !h.ctl(c) {
			return
		}
		h.quick(c, m.Type, m.Tok)
	case "unwait":
		if !h.ctl(c) {
			return
		}
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
	case "start":
		h.startEarly(c, m.Match)
	case "rtts":
		h.setRtts(c, m.Match, m.R)
	case "decline":
		if mt := h.mine(c, m.Match); mt != nil && mt.state <= mStarting {
			h.cancel(mt, "declined", c)
		}
	case "round":
		if mt := h.mine(c, m.Match); mt != nil && m.Winner != nil {
			if mt.room {
				h.roomReport(mt, c, m.Round, *m.Winner, m.KO, m.Place, m.Dmg)
			} else {
				h.report(mt, c, m.Round, *m.Winner, m.KO, m.Dmg)
			}
		}
	case "rematch":
		h.rematch(c, m.Match, m.Tok)
	case "leave":
		h.leaveMatch(c, "left")
		c.lobbyOwed = true
	case "sig":
		h.forwardSig(c, m)
	case "stall":
		if mt := h.mine(c, m.Match); mt != nil {
			h.stall(mt, c, m.Ms)
		}
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

// ctl: the small per-client budget for messages that change what every lobby client sees.
func (h *hub) ctl(c *client) bool {
	now := h.now()
	if c.ctlAt.IsZero() {
		c.ctlN = ctlBurst
	} else {
		c.ctlN = min(ctlBurst, c.ctlN+now.Sub(c.ctlAt).Seconds()*ctlRate)
	}
	c.ctlAt = now
	if c.ctlN < 1 {
		h.send(c, map[string]any{"t": "err", "code": "slow", "msg": "Slow down a moment."})
		return false
	}
	c.ctlN--
	return true
}

// checkToken: at most one verification in flight per client; a newer token waits its turn.
func (h *hub) checkToken(c *client, tok string) {
	if tok == "" || len(tok) > 8192 {
		h.sendMe(c)
		return
	}
	if c.authBusy {
		c.authNext = tok
		return
	}
	c.authBusy = true
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
		defer cancel()
		id, err := h.verify(ctx, tok)
		h.post(func() {
			c.authBusy = false
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
			if next := c.authNext; next != "" {
				c.authNext = ""
				h.checkToken(c, next)
			}
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

// push queues a frame for the socket's writer. The queue is bounded in BYTES: a reader that
// falls maxQueued behind is lagging and gets disconnected (see handle).
func (h *hub) push(c *client, frame []byte) {
	if c.gone || c.send == nil {
		return
	}
	n := int64(len(frame))
	if c.queued.Add(n) > maxQueued {
		c.queued.Add(-n)
		h.lag(c)
		return
	}
	select {
	case c.send <- frame:
	default:
		c.queued.Add(-n)
		h.lag(c)
	}
}

func (h *hub) lag(c *client) {
	if !c.lagging {
		c.lagging = true
		h.lagging = append(h.lagging, c)
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
	if isRoomType(typ) {
		h.joinRoom(c, typ)
		return
	}
	c.waiting = typ
	c.lobby = true
	h.lobbyDirt = true
}

// flushLobbies runs on the tick: lobby changes are coalesced to one push per 250 ms, and a
// client whose queue is half full skips a frame (it is owed one) instead of being dropped.
func (h *hub) flushLobbies() {
	if h.lobbyDirt {
		h.lobbyDirt = false
		for _, c := range h.clients {
			if c.lobby {
				c.lobbyOwed = true
			}
		}
	}
	for _, c := range h.clients {
		if !c.lobbyOwed || c.send == nil {
			continue
		}
		if c.queued.Load() > maxQueued/2 {
			continue
		}
		c.lobbyOwed = false
		h.sendLobby(c)
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
	m.seats = append(m.seats, &seat{c: c, id: c.id, name: c.name, uid: c.uid, ranked: c.ranked, joinAt: h.now()})
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
		c.lobbyOwed = true
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
	m.room = isRoomType(typ)
	h.send(c, map[string]any{"t": "friend", "match": m.id, "code": m.code, "type": typ})
	if m.room {
		h.roomChanged(m)
	}
}

func (h *hub) joinCode(c *client, code string) {
	now := h.now()
	fails := c.joinFails[:0]
	for _, t := range c.joinFails {
		if now.Sub(t) < time.Minute {
			fails = append(fails, t)
		}
	}
	c.joinFails = fails
	if len(fails) >= joinFailsPerMin {
		h.send(c, map[string]any{"t": "err", "code": "slow", "msg": "Too many tries. Wait a minute, then try the link again."})
		return
	}
	m := h.codes[normCode(code)]
	if m == nil || m.state != mLobby {
		c.joinFails = append(c.joinFails, now)
		h.send(c, map[string]any{"t": "err", "code": "nocode", "msg": "That link has expired. Ask for a new one."})
		return
	}
	if m == c.match {
		return
	}
	if m.room && len(m.seats) >= roomMax {
		h.send(c, map[string]any{"t": "err", "code": "full", "msg": "That room is full."})
		return
	}
	h.leaveMatch(c, "left")
	if m.room {
		h.seatIn(m, c)
		h.roomChanged(m)
		return
	}
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
	if m != nil && m.room && m.state == mLobby {
		h.roomAccept(m, c, tok)
		return
	}
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
// the coin for round 1. A ranked seat must pay with its own fresh token: none, one that does
// not verify, or someone else's cancels the match ("signin"). Every token is checked BEFORE
// anyone is charged, so a bad seat cannot spend its opponent's battle. Only an unreachable or
// failing payment service lets play go ahead unpaid.
func (h *hub) startMatch(m *match) {
	m.state = mStarting
	m.spendID = newUUID()
	for _, s := range m.seats {
		s.spent, s.checked, s.paying = nil, false, false
		if !s.ranked {
			s.spent = &spendResult{OK: true, Remaining: -1}
			continue
		}
		if s.tok == "" {
			s.spent = &spendResult{Why: "signin"}
			continue
		}
		s := s
		uid, tok := s.uid, s.tok
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
			idn, err := h.verify(ctx, tok)
			cancel()
			ok := err == nil && idn.UID == uid && !idn.Anonymous
			h.post(func() {
				s.checked = true
				if !ok {
					s.spent = &spendResult{Why: "signin"}
				}
				h.maybeSpend(m)
			})
		}()
	}
	h.maybeSpend(m)
}

// maybeSpend: once every token is checked, charge the verified seats — unless a duel already
// failed one, in which case nobody pays and maybeBegin cancels it. A room deals the failed
// seats out and plays on.
func (h *hub) maybeSpend(m *match) {
	if m.state != mStarting || h.matches[m.id] != m {
		return
	}
	failed := false
	for _, s := range m.seats {
		if s.spent == nil && !s.checked {
			return
		}
		failed = failed || (s.spent != nil && !s.spent.OK)
	}
	for _, s := range m.seats {
		if s.spent != nil || s.paying {
			continue
		}
		if failed && !m.room {
			s.spent = &spendResult{OK: true, Remaining: -1}
			continue
		}
		s.paying = true
		s := s
		tok, id := s.tok, m.spendID
		go func() {
			r := h.allow.claimArenaBattle(tok, id)
			h.post(func() {
				s.spent = &r
				h.maybeBegin(m)
			})
		}()
	}
	h.maybeBegin(m)
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
	if m.room {
		h.roomBegin(m)
		return
	}
	for _, s := range m.seats {
		if !s.spent.OK {
			why := h.refused(s)
			h.cancel(m, why, nil)
			return
		}
	}
	m.state = mPlay
	m.playAt = h.now()
	m.round = 1
	m.master = coin(len(m.seats))
	m.arena = coin(1 << 20)
	for _, s := range m.seats {
		s.wins, s.kos, s.rematch = 0, 0, false
	}
	m.log = append(m.log, "r1 master "+m.seats[m.master].id)
	h.sendGo(m)
}

// refused tells a seat why it cannot play, and returns the cancel reason.
func (h *hub) refused(s *seat) string {
	if s.spent.Why == "allowance" {
		h.send(s.c, map[string]any{"t": "err", "code": "allowance",
			"msg": "That was today's last free arena battle. The br8t Pass makes them unlimited — or come back tomorrow."})
		return "allowance"
	}
	h.send(s.c, map[string]any{"t": "err", "code": "signin", "msg": "Your sign-in could not be checked. Sign in again to fight."})
	return "signin"
}

func (h *hub) sendGo(m *match) {
	m.reports = map[int]report{}
	m.firstReport = time.Time{}
	m.firstIn = nil
	h.clearStalls(m)
	if m.room {
		m.roundEnd = h.now().Add(h.roomCap)
	} else {
		m.roundEnd = h.now().Add(h.duelCap)
	}
	for i := range m.seats {
		h.sendGoTo(m, i)
	}
}

func (h *hub) sendGoTo(m *match, i int) {
	score := make([]int, len(m.seats))
	roster := make([]map[string]any, len(m.seats))
	out := make([]bool, len(m.seats))
	for j, s := range m.seats {
		score[j] = s.wins
		out[j] = s.out
		roster[j] = map[string]any{"id": s.id, "name": s.name, "ranked": s.ranked, "away": s.c.away}
	}
	s := m.seats[i]
	left := -1
	if s.spent != nil {
		left = s.spent.Remaining
	}
	g := map[string]any{"t": "go", "match": m.id, "round": m.round, "master": m.master, "mode": m.typ,
		"you": i, "score": score, "seats": roster, "arena": m.arena, "freeLeft": left, "out": out}
	if m.quick {
		g["quick"], g["ghosts"] = true, m.ghosts
	}
	h.send(s.c, g)
}

// report: every player says who won the round. Counted only if they all agree.
func (h *hub) report(m *match, c *client, round, winner int, ko bool, dmg []int) {
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
	m.reports[slot] = report{winner: winner, ko: ko, dmg: dmgKey(dmg, len(m.seats))}
	if len(m.reports) < len(m.seats) {
		return
	}
	first := m.reports[0]
	for _, r := range m.reports {
		if r != first {
			h.disputeDuel(m, "disagree")
			return
		}
	}
	m.agreed++
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
	m.dmg = parseDmg(first.dmg)
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

// disputeDuel: the two reports differ. Normally a void, logged against both accounts. A player
// with a record of disputes (store.flagged) loses a disputed match instead, to an opponent
// without one; if both or neither have a record, it stays a void.
func (h *hub) disputeDuel(m *match, why string) {
	bad := -1
	for i, s := range m.seats {
		if s.ranked && h.st.flagged(s.uid) {
			if bad >= 0 {
				bad = -1
				break
			}
			bad = i
		}
	}
	if bad < 0 || len(m.seats) != 2 {
		h.void(m, why, nil)
		return
	}
	h.st.recordDispute(m.id, []string{m.seats[bad].uid})
	m.log = append(m.log, "disputed by "+m.seats[bad].id+" (a record of disputes): a loss")
	m.dmg, m.note = nil, " disputed"
	h.finish(m, 1-bad)
}

// forfeit: a player left (or never came back) mid-match. In a duel the other player wins the
// match outright and it counts. Multi-player modes will eliminate the leaver instead.
func (h *hub) forfeit(m *match, leaver int, why string) {
	m.ffBy, m.ffWhy = leaver, why
	winner := -1
	for i, s := range m.seats {
		if i != leaver && (winner < 0 || s.wins > m.seats[winner].wins) {
			winner = i
		}
	}
	m.log = append(m.log, "forfeit by "+m.seats[leaver].id)
	h.finishFF(m, winner, true)
}

// earlyForfeit: in the first seconds of a match a forfeit is a loss for whoever left and nothing
// for whoever stayed. After that a quit (or silence) in round 1 is a real win; the per-pair daily
// cap is what stops two accounts farming it.
func (h *hub) earlyForfeit(m *match) bool {
	return h.now().Sub(m.playAt) < h.earlyFF
}

func (h *hub) finish(m *match, winner int) { h.finishFF(m, winner, false) }

func (h *hub) finishFF(m *match, winner int, ff bool) {
	if ff {
		m.dmg = nil // no deciding round was agreed
	}
	m.state = mDone
	m.deadline = h.now().Add(rematchTTL)
	seats := make([]seatRow, len(m.seats))
	score := ""
	early := ff && h.earlyForfeit(m)
	for i, s := range m.seats {
		seats[i] = seatRow{UID: s.uid, Name: s.name, Won: i == winner, KOs: s.kos, Ranked: s.ranked, Loadout: s.c.loadout, OppDmg: oppDmg(m.dmg, i)}
		if early {
			seats[i].NoEvent = true
			seats[i].NoStats = i == winner
		}
		if i > 0 {
			score += "-"
		}
		score += itoa(s.wins)
	}
	if ff {
		score += " ff"
	}
	if early {
		score += " early"
	}
	score += m.note
	if m.quick {
		h.st.recordQuick(m.id, m.typ, score, seats)
	} else {
		if err := h.st.recordMatch(m.id, m.typ, m.friend, score, seats); err != nil {
			log.Printf("match %s: stats write failed: %v", m.id, err)
		}
		if h.lan {
			h.st.recordLan(m.id, m.typ, ff, seats)
		}
	}
	who := "nobody"
	if winner >= 0 {
		who = m.seats[winner].id
	}
	log.Printf("match %s: %s won %s (%s)", m.id, who, score, strings.Join(m.log, ", "))
	for i, s := range m.seats {
		out := map[string]any{"t": "result", "match": m.id, "winner": winner, "you": i, "score": scoreOf(m), "counted": s.ranked && !seats[i].NoStats && !m.quick, "forfeit": ff}
		if m.quick {
			// Never ranked: no stats line. The card lists placings like a room's.
			place, names := make([]int, len(m.seats)), make([]string, len(m.seats))
			for j, o := range m.seats {
				names[j], place[j] = o.name, 2
				if j == winner {
					place[j] = 1
				}
			}
			out["quick"], out["mode"], out["names"], out["place"], out["hwin"] = true, m.typ, names, place, winner
		}
		if ff {
			// who forfeited and why: left | gone | silent | stall (the master went silent and
			// the guest quit: the guest is NOT the one who forfeited) | lagging
			out["by"], out["why"] = m.ffBy, m.ffWhy
		}
		if s.ranked && !m.quick {
			if line, ok := h.st.mine(s.uid); ok {
				out["stats"] = line
			}
		}
		h.send(s.c, out)
	}
	if m.quick { // no rematch: AGAIN is a fresh quick fight
		for _, s := range m.seats {
			if s.c.match == m {
				s.c.match = nil
			}
		}
		h.closeMatch(m)
	}
}

func scoreOf(m *match) []int {
	out := make([]int, len(m.seats))
	for i, s := range m.seats {
		out[i] = s.wins
	}
	return out
}

func (h *hub) rematch(c *client, id, tok string) {
	m := h.mine(c, id)
	if m == nil || m.state != mDone || m.room || m.quick {
		return
	}
	me := m.seats[m.slotOf(c)]
	me.rematch = true
	if len(tok) < 8192 {
		me.rtok = tok
	}
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
	// Same players, a fresh match: new id, new coin flip, one more allowance each, paid with
	// the token each player sent with "rematch" (the first accept's may have expired).
	cs := make([]*client, len(m.seats))
	toks := make([]string, len(m.seats))
	for i, s := range m.seats {
		cs[i], toks[i] = s.c, s.rtok
		if s.c.match == m {
			s.c.match = nil
		}
	}
	h.closeMatch(m)
	n := h.newMatch(m.typ, m.friend, cs...)
	for i, s := range n.seats {
		s.accepted, s.tok = true, toks[i]
	}
	h.startMatch(n)
}

// cancel and void only touch seats still in THIS match: an eliminated room seat may already
// be in another one, and must not be detached from it.
func (h *hub) cancel(m *match, why string, by *client) {
	for _, s := range m.seats {
		if s.out || s.c.match != m {
			continue
		}
		if s.c != by {
			h.send(s.c, map[string]any{"t": "cancel", "match": m.id, "why": why})
		}
		s.c.match = nil
	}
	h.closeMatch(m)
}

func (h *hub) void(m *match, why string, by *client) {
	log.Printf("match %s: VOID (%s) %s", m.id, why, strings.Join(m.log, ", "))
	var uids []string
	for _, s := range m.seats {
		if s.ranked && s.uid != "" && !s.out {
			uids = append(uids, s.uid)
		}
	}
	h.st.recordVoid(m.id, m.typ, m.friend, len(m.seats), why, uids)
	for _, s := range m.seats {
		if s.out || s.c.match != m {
			continue
		}
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
	if m.room {
		h.leaveRoom(m, c, why)
		c.match = nil
		return
	}
	switch m.state {
	case mPlay:
		leaver := m.slotOf(c)
		// A guest who gives up after stallQuit of reported silence (server-timed) does not forfeit
		// if the server saw the master go quiet too. If the server still hears the master it cannot
		// tell a broken link from a lie: a void, on record against both (disputeDuel). A flagged
		// account's reports count for nothing.
		if s := m.seats[leaver]; leaver != m.master && h.stalled(s) && h.now().Sub(s.stallFor) >= h.stallQuit &&
			!(s.ranked && h.st.flagged(s.uid)) {
			m.log = append(m.log, "quit by "+s.id+" after "+h.now().Sub(s.stallFor).Round(time.Second).String()+" of reported master silence")
			if h.masterSilent(m) {
				h.forfeit(m, m.master, "stall")
			} else {
				h.disputeDuel(m, "stall")
			}
			break
		}
		h.forfeit(m, leaver, why)
	case mDone:
		for _, s := range m.seats {
			if s.c.match != m {
				continue
			}
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
		case m.state == mPlay && !m.firstReport.IsZero() && now.Sub(m.firstReport) > h.reportWindow:
			h.silent(m)
		case m.state == mPlay && !m.roundEnd.IsZero() && now.After(m.roundEnd):
			if len(m.reports) == 0 {
				h.void(m, "timeout", nil)
			} else {
				h.silent(m)
			}
		case (m.state == mOffer || m.state == mLobby || m.state == mDone) && now.After(m.deadline):
			if m.state == mDone {
				h.leaveMatchAll(m)
			} else {
				h.cancel(m, "timeout", nil)
			}
		}
	}
	h.tickRooms(now)
	h.tickQuick(now)
	for _, c := range h.clients {
		if c.away {
			if now.After(c.awayUntil) {
				log.Printf("client %s did not come back", c.id)
				h.drop(c, "gone")
			}
			continue
		}
		if !c.hello && now.Sub(c.since) > h.helloWithin {
			h.drop(c, "nohello")
			continue
		}
		if now.Sub(c.pongAt) > h.pingEvery+h.pongLate && !c.away {
			log.Printf("client %s stopped answering pings", c.id)
			h.disconnect(c)
			continue
		}
		if now.Sub(c.lastPing) >= h.pingEvery {
			c.lastPing, c.pingAt = now, now
			h.send(c, map[string]any{"t": "p", "s": now.UnixMilli()})
		}
	}
}

// stall: a guest reports that the master's snapshots stopped ms ago.
func (h *hub) stall(m *match, c *client, ms float64) {
	slot := m.slotOf(c)
	if m.state != mPlay || slot < 0 || slot == m.master || m.seats[slot].out {
		return
	}
	if ms <= 0 { // recovered
		m.seats[slot].stallAt, m.seats[slot].stallFor = time.Time{}, time.Time{}
		return
	}
	if ms < float64(stallMin.Milliseconds()) || ms > 600000 {
		return
	}
	// The client's ms only has to clear stallMin: how long it lasts is the server's clock.
	s, now := m.seats[slot], h.now()
	if !h.stalled(s) {
		s.stallFor = now
	}
	s.stallAt = now
	if !m.room {
		h.send(c, map[string]any{"t": "stall", "match": m.id, "silent": h.masterSilent(m)})
	}
	h.checkStall(m)
}

// masterSilent: the server itself sees the master gone (socket away) or not answering pings.
func (h *hub) masterSilent(m *match) bool {
	if m.master < 0 || m.master >= len(m.seats) {
		return false
	}
	c := m.seats[m.master].c
	return c.away || h.now().Sub(c.pongAt) > h.pingEvery+h.pongDue
}

func (h *hub) stalled(s *seat) bool {
	return !s.stallAt.IsZero() && h.now().Sub(s.stallAt) <= stallFresh
}

func (h *hub) clearStalls(m *match) {
	for _, s := range m.seats {
		s.stallAt, s.stallFor = time.Time{}, time.Time{}
	}
}

// checkStall (rooms): when most of the other seats say the master is silent, a new master takes
// over at once. The old one is out only if the server saw it go quiet too; otherwise it plays on
// as a guest (a forged report must not eliminate anyone). A 1v1 master is never touched here:
// its own 4001 close or its pongs decide.
func (h *hub) checkStall(m *match) {
	if m.state != mPlay || m.master < 0 || !m.room {
		return
	}
	ms := m.seats[m.master]
	if ms.out {
		return
	}
	n, yes := 0, 0
	for i, s := range m.seats {
		if i == m.master || s.out || s.c.away {
			continue
		}
		n++
		if h.stalled(s) {
			yes++
		}
	}
	if n == 0 || yes*2 <= n {
		return
	}
	log.Printf("match %s: %d of %d guests report master %s silent", m.id, yes, n, ms.id)
	m.log = append(m.log, "master "+ms.id+" stalled")
	h.clearStalls(m)
	if h.masterSilent(m) {
		h.eliminate(m, m.master, "stall")
	} else {
		h.handOver(m, m.master)
	}
}

// silent: a report came in and the report window ran out (or the round's hard deadline did).
// A seat that still says nothing — connected or not — forfeits (a room: is out, and the rest
// finish with what they agree on). Silence never voids a match.
func (h *hub) silent(m *match) {
	for i, s := range m.seats {
		if m.state != mPlay {
			return
		}
		if _, ok := m.reports[i]; ok || s.out {
			continue
		}
		m.log = append(m.log, "silent "+s.id)
		if m.room {
			h.eliminate(m, i, "silent")
		} else {
			h.forfeit(m, i, "silent")
			return
		}
	}
}

func (h *hub) leaveMatchAll(m *match) {
	for _, s := range m.seats {
		if s.c.match != m {
			continue
		}
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

// allowRecv: the receiving side's budget, so several senders cannot pile onto one socket.
func (h *hub) allowRecv(c *client, n int) bool {
	now := h.now()
	if c.recvAt.IsZero() {
		c.recvN, c.recvB = recvPerSec, recvBytesPS
	} else {
		el := now.Sub(c.recvAt).Seconds()
		c.recvN = min(recvPerSec, c.recvN+el*recvPerSec)
		c.recvB = min(recvBytesPS, c.recvB+el*recvBytesPS)
	}
	c.recvAt = now
	if c.recvN < 1 || c.recvB < float64(n) {
		return false
	}
	c.recvN--
	c.recvB -= float64(n)
	return true
}

// peer: signalling only ever goes to someone in the same match (an offer included: the
// players open their direct link to measure the ping before accepting).
func (h *hub) peer(c *client, to string) *client {
	m := c.match
	if m == nil || (m.state == mLobby && !m.room) {
		return nil
	}
	for _, s := range m.seats {
		if s.id == to && s.c != c {
			return s.c
		}
	}
	return nil
}

// relayPeer: relayed GAME traffic needs both seats to have accepted, and neither to be out.
func (h *hub) relayPeer(c *client, to string) *client {
	m := c.match
	if m == nil || m.state == mDone {
		return nil
	}
	me := m.slotOf(c)
	if me < 0 || !m.seats[me].accepted || m.seats[me].out {
		return nil
	}
	for _, s := range m.seats {
		if s.id == to && s.c != c && s.accepted && !s.out {
			return s.c
		}
	}
	return nil
}

func (h *hub) forwardSig(c *client, m inMsg) {
	if !h.allowRelay(c, len(m.D)) {
		return
	}
	if p := h.peer(c, m.To); p != nil && h.allowRecv(p, len(m.D)) {
		h.send(p, map[string]any{"t": "sig", "from": c.id, "d": m.D})
	}
}

// Binary relay frames are [len][to id][payload] in and [len][from id][payload] out.
func (h *hub) relayBinary(c *client, b []byte) {
	if len(b) < 2 || int(b[0])+1 > len(b) || !h.allowRelay(c, len(b)) {
		return
	}
	p := h.relayPeer(c, string(b[1:1+int(b[0])]))
	if p == nil || !h.allowRecv(p, len(b)) {
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

func (h *hub) attach(e event) (*client, string) {
	if old := h.clients[e.rid]; e.rid != "" && old != nil && !old.gone && old.tok != "" && old.tok == e.rtok {
		if old.send != nil {
			close(old.send)
		}
		old.send, old.queued, old.away, old.lagging = e.c.send, e.c.queued, false, false
		old.gen++
		old.budgetAt, old.pongAt = h.now(), h.now()
		if old.ip != e.ip {
			h.ipN[old.ip]--
			h.ipN[e.ip]++
			old.ip = e.ip
		}
		h.send(old, map[string]any{"t": "welcome", "id": old.id, "tok": old.tok, "ice": stunOnly, "resumed": true, "grace": h.awayGrace.Milliseconds()})
		h.sendMe(old)
		if old.lastOut != nil {
			h.send(old, old.lastOut)
			old.lastOut = nil
		}
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
		return old, ""
	}
	if len(h.clients) >= maxClients {
		return nil, "server full"
	}
	if h.ipN[e.ip] >= h.perIP {
		return nil, "too many connections"
	}
	c := e.c
	c.id = h.newID()
	c.tok = randString(idChars, 24)
	c.name = "Fighter " + randString("0123456789", 4)
	c.region = "xx"
	c.ip = e.ip
	c.budgetAt, c.since, c.pongAt = h.now(), h.now(), h.now()
	h.ipN[c.ip]++
	h.clients[c.id] = c
	h.send(c, map[string]any{"t": "welcome", "id": c.id, "tok": c.tok, "ice": stunOnly, "grace": h.awayGrace.Milliseconds()})
	return c, ""
}

// disconnect: the socket is gone. Mid-match the seat is held for awayGrace with the fighter
// idle; anywhere else the player simply leaves.
// closeHidden: the page closes its socket with this code when its tab is hidden (a hidden tab
// cannot run the fight). That is a deliberate away: a room master hands over at once; a 1v1
// seat's grace has already started in disconnect.
const closeHidden = 4001

// A hidden room master hands the role on but stays in: the seat has the normal away grace to
// come back, as a guest.
func (h *hub) hidden(c *client) {
	m := c.match
	if m == nil || !m.room || m.state != mPlay || !c.away {
		return
	}
	if slot := m.slotOf(c); slot == m.master && !m.seats[slot].out {
		m.log = append(m.log, "master "+c.id+" hid its tab")
		h.handOver(m, slot)
	}
}

func (h *hub) disconnect(c *client) {
	if c.gone || c.away {
		return
	}
	m := c.match
	if m == nil || m.state != mPlay {
		h.drop(c, "left")
		return
	}
	c.away = true
	c.awaySince = h.now()
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
	if h.ipN[c.ip]--; h.ipN[c.ip] <= 0 {
		delete(h.ipN, c.ip)
	}
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
	queued := new(atomic.Int64)
	reply := make(chan attachResult, 1)
	q := r.URL.Query()
	h.in <- event{kind: evJoin, c: &client{send: send, queued: queued}, ip: ipKey(clientIP(r)), rid: q.Get("id"), rtok: q.Get("tok"), reply: reply}
	res := <-reply
	c, gen := res.c, res.gen
	if c == nil {
		conn.Close(websocket.StatusTryAgainLater, res.why)
		return
	}
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	go writer(ctx, conn, send, queued, cancel)
	// One token bucket for every inbound frame; over it, frames are dropped before the hub.
	tokens, last := float64(inBurst), time.Now()
	var readErr error
	for {
		typ, data, err := conn.Read(ctx)
		if err != nil {
			readErr = err
			break
		}
		now := time.Now()
		tokens = min(inBurst, tokens+now.Sub(last).Seconds()*inRate)
		last = now
		if tokens < 1 {
			continue
		}
		tokens--
		h.in <- event{kind: evMsg, c: c, gen: gen, data: data, bin: typ == websocket.MessageBinary}
	}
	h.in <- event{kind: evLeave, c: c, gen: gen, hide: websocket.CloseStatus(readErr) == closeHidden}
	conn.Close(websocket.StatusNormalClosure, "")
}

// clientIP: the peer address; behind Caddy (a loopback peer) the right-most X-Forwarded-For hop,
// which is the one Caddy itself appended and the client cannot forge.
func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	if ip := net.ParseIP(host); ip != nil && ip.IsLoopback() {
		if v := r.Header.Values("X-Forwarded-For"); len(v) > 0 {
			hops := strings.Split(v[len(v)-1], ",")
			if hop := strings.TrimSpace(hops[len(hops)-1]); net.ParseIP(hop) != nil {
				return hop
			}
		}
	}
	return host
}

// ipKey: what the per-address cap counts. An IPv6 client usually holds a whole /64 and can pick
// a fresh address from it for every socket, so it counts per /64.
func ipKey(ip string) string {
	p := net.ParseIP(ip)
	if p == nil || p.To4() != nil {
		return ip
	}
	return p.Mask(net.CIDRMask(64, 128)).String() + "/64"
}

func writer(ctx context.Context, conn *websocket.Conn, send chan []byte, queued *atomic.Int64, cancel func()) {
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
			queued.Add(-int64(len(frame)))
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
