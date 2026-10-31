package main

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/json"
	"log"
	"math/big"
	"net"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
)

const (
	maxClients    = 500
	maxRooms      = 200
	maxMsg        = 32 << 10
	sendQueue     = 512
	tickEvery     = 250 * time.Millisecond
	hostSilence   = 2500 * time.Millisecond // Snake tried 1.5 s; stalls replaced hosts for nothing
	rebuildWindow = 60 * time.Second
	relayPerSec   = 400
	relayBytesPS  = 512 << 10
	ctlPerSec     = 20
	ctlBurst      = 40
	defaultPerIP  = 64
	defaultGrace  = 10 * time.Second
	defaultIdle   = 5 * time.Minute // public rooms: no input this long and you are removed (ONLINE §8)
)

type verifier func(context.Context, string) (identity, error)

// One goroutine (run) owns every field below; readers, writers and token
// checks only reach it through h.in. Voice claims and callsigns are atomic
// because nothing else ever touches a room.
type hub struct {
	in      chan event
	clients map[string]*client
	rooms   map[string]*room
	codes   map[string]*room
	grace   time.Duration
	idle    time.Duration
	now     func() time.Time
	started time.Time
	ice     *iceSource
	verify  verifier
	acc     *accessCfg                                           // D36 sign-in + daily allowance (access.go); nil = open
	spendFn func(tok, id string) (spendOutcome, json.RawMessage) // the allowance spend (tests inject one)
	perIP   int
	ipN     map[string]int
	pubSeq  map[string]int
	lagging []*client

	statsMu sync.Mutex
	stats   stats
}

type stats struct {
	Rooms   int `json:"rooms"`
	Players int `json:"players"`
	Online  int `json:"online"`
}

type client struct {
	id, tok, ip, region string
	uid                 string // verified Firebase uid ("" = not signed in)
	ranked              bool
	name, title, rank   string
	gender              string
	emp                 bool     // has earned Emperor in their career (D2/D4), on trust
	voices              []string // favourites in order
	voice               string
	call                int // 11–99, never ending in 0: the tower's "Baroness Four-Two"
	send                chan []byte
	room                *room
	seen                time.Time
	input               time.Time // last player input (beat i=1, or any control message)
	ready               bool      // holds the shared world (in sync, stable frame rate): fit to host
	parked              bool      // landed or parked: may change voice mid-session (D5)
	rdy                 bool      // lobby "ready" tick
	away                bool
	awayUntil           time.Time
	gen                 int
	gone, lagging       bool
	budgetAt            time.Time
	budgetN, budgetB    float64
	ctlAt               time.Time
	ctlN                float64
	authBusy            bool
	authNext            string
	idTok               string // the last verified Firebase ID token (forwarded to the payments service only)
	pending             *inMsg // create/join/quick waiting for a token check (access.go)
	spending, ticket    bool   // an allowance spend in flight; one paid room entry not yet used
}

type roomMeta struct {
	Crown string `json:"crown,omitempty"`
	Left  int    `json:"left"`
}

type room struct {
	id, code, name, region string
	private                bool
	set                    settings
	members                []*client // join line; members[0] hosts
	epoch                  int
	owner                  string // creator's client id: private-room kick rights
	phase                  string // lobby | flight | podium
	banned                 map[string]bool
	votes                  map[string]map[string]bool // target id -> voter ids
	meta                   *roomMeta
	paid                   map[string]bool // uids that spent an online game on this room (re-entry is free)
}

type event struct {
	kind  int
	c     *client
	data  []byte
	bin   bool
	gen   int
	bye   bool
	rid   string
	rtok  string
	ip    string
	fn    func()
	reply chan attachResult
}

type attachResult struct {
	c   *client
	gen int
	why string
}

const (
	evJoin = iota
	evLeave
	evMsg
	evTick
	evFn
)

func newHub(ice *iceSource, verify verifier) *hub {
	now := time.Now()
	return &hub{in: make(chan event, 1024), clients: map[string]*client{}, rooms: map[string]*room{},
		codes: map[string]*room{}, grace: defaultGrace, idle: defaultIdle, now: time.Now, started: now, ice: ice, verify: verify,
		perIP: defaultPerIP, ipN: map[string]int{}, pubSeq: map[string]int{}}
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

func (h *hub) post(fn func()) { h.in <- event{kind: evFn, fn: fn} }

func (h *hub) handle(e event) {
	switch e.kind {
	case evJoin:
		e.reply <- h.attach(e)
	case evLeave:
		if e.gen == e.c.gen && !e.c.gone {
			if e.bye || h.grace <= 0 || e.c.room == nil || e.c.lagging {
				h.drop(e.c)
			} else {
				h.disconnect(e.c)
			}
		}
	case evMsg:
		if e.c.gone || e.gen != e.c.gen || h.clients[e.c.id] != e.c {
			return
		}
		e.c.seen = h.now()
		if e.bin {
			h.relayBinary(e.c, e.data)
		} else {
			h.message(e.c, e.data)
		}
	case evTick:
		h.expireAway()
		h.expireIdle()
		h.checkHosts()
	case evFn:
		e.fn()
	}
	for len(h.lagging) > 0 {
		c := h.lagging[0]
		h.lagging = h.lagging[1:]
		h.drop(c)
	}
	h.publishStats()
}

// ---------------------------------------------------------------- messages

type inMsg struct {
	T      string          `json:"t"`
	Name   string          `json:"name"`
	Title  string          `json:"title"`
	Rank   string          `json:"rank"`
	G      string          `json:"g"`
	Emp    bool            `json:"emp"`
	Voices []string        `json:"voices"`
	Voice  string          `json:"voice"`
	TZ     string          `json:"tz"`
	Tok    string          `json:"tok"`
	Code   string          `json:"code"`
	ID     string          `json:"id"`
	Priv   bool            `json:"priv"`
	Set    json.RawMessage `json:"set"`
	P      string          `json:"p"`
	On     bool            `json:"on"`
	R      int             `json:"r"`
	Pk     int             `json:"pk"`
	I      int             `json:"i"`
	Crown  string          `json:"crown"`
	Left   int             `json:"left"`
	To     string          `json:"to"`
	D      json.RawMessage `json:"d"`
	RJ     *rejoinMsg      `json:"rj"`
}

func (h *hub) message(c *client, raw []byte) {
	var m inMsg
	if json.Unmarshal(raw, &m) != nil {
		return
	}
	switch m.T {
	case "b": // heartbeat from the game loop: a hidden tab stops beating
		c.ready, c.parked = m.R == 1, m.Pk == 1
		if m.I == 1 {
			c.input = c.seen
		}
		return
	case "sig", "rl":
		h.forwardText(c, m)
		return
	}
	c.input = c.seen
	if !h.ctlAllow(c) {
		h.send(c, map[string]any{"t": "err", "code": "slow", "msg": "Slow down a moment."})
		return
	}
	switch m.T {
	case "hello":
		h.hello(c, m)
	case "auth":
		h.checkToken(c, m.Tok)
	case "list":
		h.sendList(c)
	case "create", "join", "quick":
		h.entry(c, m) // access.go: sign-in + allowance gate, then create / join / quickJoin
	case "rejoin":
		h.rejoin(c, m.RJ)
	case "leave":
		h.leaveRoom(c)
		h.sendList(c)
	case "claim":
		h.claim(c, m.Voice)
	case "set":
		if r := c.room; r != nil && r.members[0] == c && r.phase != "flight" {
			r.set = cleanSettings(m.Set, c.rank)
			h.broadcastRoom(r)
		}
	case "phase":
		if r := c.room; r != nil && r.members[0] == c && (m.P == "lobby" || m.P == "flight" || m.P == "podium") && r.phase != m.P {
			r.phase = m.P
			if m.P == "flight" {
				for _, x := range r.members {
					x.rdy = false
				}
			}
			h.broadcastRoom(r)
		}
	case "rdy":
		if r := c.room; r != nil && c.rdy != m.On {
			c.rdy = m.On
			h.broadcastRoom(r)
		}
	case "handoff":
		if r := c.room; r != nil && r.members[0] == c {
			log.Printf("room %s: host %s handed off", r.id, c.id)
			h.demoteHost(r)
		}
	case "meta":
		if r := c.room; r != nil && r.members[0] == c {
			r.meta = &roomMeta{Crown: cleanName(m.Crown, ""), Left: clamp(m.Left, 0, 86400)}
		}
	case "kick":
		h.kick(c, m.ID)
	case "vote":
		h.vote(c, m.ID)
	}
}

func (h *hub) ctlAllow(c *client) bool {
	now := h.now()
	if c.ctlAt.IsZero() {
		c.ctlN = ctlBurst
	} else {
		c.ctlN = minf(ctlBurst, c.ctlN+now.Sub(c.ctlAt).Seconds()*ctlPerSec)
	}
	c.ctlAt = now
	if c.ctlN < 1 {
		return false
	}
	c.ctlN--
	return true
}

func (h *hub) hello(c *client, m inMsg) {
	c.name = cleanName(m.Name, "Pilot")
	c.title = cleanText(m.Title, "", 24)
	if isProfane(c.title) {
		c.title = ""
	}
	c.rank = oneOf(cleanID(m.Rank), rankOrder, "baron")
	c.gender = oneOf(m.G, []string{"m", "f"}, "m")
	c.emp = m.Emp
	c.voices = c.voices[:0]
	for _, v := range m.Voices {
		if isVoice(v) && indexOf(c.voices, v) < 0 && len(c.voices) < 3 {
			c.voices = append(c.voices, v)
		}
	}
	if m.TZ != "" {
		c.region = regionOf(m.TZ)
	}
	if m.Tok != "" {
		h.checkToken(c, m.Tok)
	}
	if c.room != nil {
		h.broadcastRoom(c.room)
	}
}

// checkToken: one verification in flight per client; a newer token waits its turn.
func (h *hub) checkToken(c *client, tok string) {
	if tok == "" || len(tok) > 8192 || h.verify == nil {
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
				h.send(c, map[string]any{"t": "auth", "ok": false})
			} else if c.uid == "" || c.uid == id.UID {
				c.uid, c.ranked, c.idTok = id.UID, !id.Anonymous, tok
				h.send(c, map[string]any{"t": "auth", "ok": true, "ranked": c.ranked})
				if c.room != nil {
					if c.room.banned[c.uid] {
						h.removeFromRoom(c, "banned")
					} else {
						h.oneSeatPerUID(c.room, c)
					}
				}
			}
			if next := c.authNext; next != "" {
				c.authNext = ""
				h.checkToken(c, next)
			}
			if p := c.pending; p != nil && !c.authBusy {
				c.pending = nil
				h.entry(c, *p)
			}
		})
	}()
}

// ---------------------------------------------------------------- rooms

func (h *hub) newRoom(c *client, name string, priv bool, set settings) *room {
	r := &room{id: h.newID(6), code: h.newCode(), name: name, region: c.region, private: priv, set: set,
		owner: c.id, phase: "lobby", banned: map[string]bool{}, votes: map[string]map[string]bool{}, paid: map[string]bool{}}
	h.rooms[r.id] = r
	h.codes[r.code] = r
	return r
}

func (h *hub) create(c *client, m inMsg) {
	if len(h.rooms) >= maxRooms {
		h.send(c, map[string]any{"t": "err", "code": "full", "msg": "The skies are full. Try again in a minute."})
		return
	}
	h.leaveRoom(c)
	r := h.newRoom(c, cleanRoomName(m.Name, c.name+"'s court"), m.Priv, cleanSettings(m.Set, c.rank))
	h.enter(c, r)
}

// Quick join: the busiest public room in your region with a seat, else a new public Court Session.
func (h *hub) quickJoin(c *client) {
	var best *room
	for _, r := range h.rooms {
		if r.private || r.region != c.region || r == c.room || h.refuse(r, c) != "" {
			continue
		}
		if best == nil || len(r.members) > len(best.members) || (len(r.members) == len(best.members) && r.id < best.id) {
			best = r
		}
	}
	h.leaveRoom(c)
	if best == nil {
		if len(h.rooms) >= maxRooms {
			h.send(c, map[string]any{"t": "err", "code": "full", "msg": "The skies are full. Try again in a minute."})
			return
		}
		h.pubSeq[c.region]++
		best = h.newRoom(c, regionName(c.region)+" Court #"+itoa(h.pubSeq[c.region]), false, cleanSettings(nil, ""))
	}
	h.enter(c, best)
}

// refuse: why c may not join r right now ("" = welcome).
func (h *hub) refuse(r *room, c *client) string {
	switch {
	case r.banned[c.id] || (c.uid != "" && r.banned[c.uid]):
		return "banned"
	case r.phase == "flight" && r.set.Type == "joust":
		return "joust"
	case len(r.members) >= r.set.MaxPlayers:
		return "full"
	}
	return ""
}

var refuseMsg = map[string]string{
	"banned": "You were removed from that room.",
	"full":   "That room is full.",
	"joust":  "A joust is under way. Wait for the next round.",
}

func (h *hub) join(c *client, m inMsg) {
	var r *room
	if m.Code != "" {
		r = h.codes[strings.ToUpper(strings.TrimSpace(m.Code))]
	} else if pr := h.rooms[m.ID]; pr != nil && !pr.private {
		r = pr
	}
	if r == nil {
		h.send(c, map[string]any{"t": "err", "code": "nocode", "msg": "No room with that code."})
		return
	}
	if r == c.room {
		h.broadcastRoom(r)
		return
	}
	if why := h.refuse(r, c); why != "" {
		h.send(c, map[string]any{"t": "err", "code": why, "msg": refuseMsg[why]})
		return
	}
	h.leaveRoom(c)
	h.enter(c, r)
}

func (h *hub) enter(c *client, r *room) {
	c.room, c.rdy, c.input = r, false, h.now()
	if c.uid != "" && (c.ticket || !h.acc.counting()) {
		r.paid[c.uid], c.ticket = true, false // this account's online game for this room (access.go)
	}
	c.voice = h.pickVoice(r, c.voices)
	c.call = pickCallsign(r)
	r.members = append(r.members, c)
	if len(r.members) == 1 {
		r.epoch++
	}
	h.oneSeatPerUID(r, c)
	h.broadcastRoom(r, c)
}

// One seat per account per room: a second tab replaces the first.
func (h *hub) oneSeatPerUID(r *room, c *client) {
	if c.uid == "" {
		return
	}
	for _, m := range append([]*client(nil), r.members...) {
		if m != c && m.uid == c.uid {
			h.removeFromRoom(m, "replaced")
		}
	}
}

func (h *hub) removeFromRoom(c *client, why string) {
	msgs := map[string]string{"replaced": "You joined this room from another tab.", "banned": "You were removed from that room.",
		"kicked": "You were removed from the room.", "idle": "No input for a while, so the room let you go."}
	h.leaveRoom(c)
	h.send(c, map[string]any{"t": "kicked", "code": why, "msg": msgs[why]})
}

func (h *hub) leaveRoom(c *client) {
	r := c.room
	if r == nil {
		return
	}
	c.room, c.voice, c.call, c.rdy = nil, "", 0, false
	wasHost := r.members[0] == c
	for i, m := range r.members {
		if m == c {
			r.members = append(r.members[:i], r.members[i+1:]...)
			break
		}
	}
	delete(r.votes, c.id)
	for _, v := range r.votes {
		delete(v, c.id)
	}
	if len(r.members) == 0 {
		delete(h.rooms, r.id)
		delete(h.codes, r.code)
		return
	}
	if wasHost {
		h.promote(r)
		r.epoch++
	}
	h.broadcastRoom(r)
}

// promote moves the best next host to the front: the first member beating
// "ready" (it holds the world), else the first one still connected. Away
// members keep their place in line.
func (h *hub) promote(r *room) {
	now := h.now()
	pick := -1
	for i, m := range r.members {
		if !m.away && m.ready && now.Sub(m.seen) < hostSilence {
			pick = i
			break
		}
	}
	if pick < 0 {
		for i, m := range r.members {
			if !m.away {
				pick = i
				break
			}
		}
	}
	if pick > 0 {
		m := r.members[pick]
		r.members = append([]*client{m}, append(r.members[:pick:pick], r.members[pick+1:]...)...)
	}
}

func (h *hub) demoteHost(r *room) {
	if len(r.members) < 2 {
		return
	}
	r.members = append(r.members[1:], r.members[0])
	h.promote(r)
	r.epoch++
	h.broadcastRoom(r)
}

func (h *hub) checkHosts() {
	now := h.now()
	for _, r := range h.rooms {
		if len(r.members) < 2 || now.Sub(r.members[0].seen) <= hostSilence {
			continue
		}
		// Only if someone else is running: when every browser stalls at once, passing the sky around just thrashes.
		for _, m := range r.members[1:] {
			if !m.away && m.ready && now.Sub(m.seen) < hostSilence {
				log.Printf("room %s: host %s silent %dms, replaced", r.id, r.members[0].id, now.Sub(r.members[0].seen).Milliseconds())
				h.demoteHost(r)
				break
			}
		}
	}
}

// ---------------------------------------------------------------- kick / vote

func banKey(c *client) string {
	if c.uid != "" {
		return c.uid
	}
	return c.id
}

func (h *hub) kick(c *client, target string) {
	r := c.room
	if r == nil || !r.private {
		h.vote(c, target)
		return
	}
	t := h.member(r, target)
	if r.owner != c.id || t == nil || t == c {
		return
	}
	r.banned[banKey(t)] = true
	r.banned[t.id] = true
	log.Printf("room %s: %s kicked by the owner", r.id, t.id)
	h.removeFromRoom(t, "kicked")
}

// In a public room the host is only first in line, so removal takes a majority of the other humans.
func (h *hub) vote(c *client, target string) {
	r := c.room
	if r == nil {
		return
	}
	t := h.member(r, target)
	if t == nil || t == c {
		return
	}
	v := r.votes[t.id]
	if v == nil {
		v = map[string]bool{}
		r.votes[t.id] = v
	}
	v[c.id] = true
	if len(v) >= (len(r.members)-1)/2+1 {
		r.banned[banKey(t)] = true
		r.banned[t.id] = true
		log.Printf("room %s: %s voted out", r.id, t.id)
		h.removeFromRoom(t, "kicked")
		return
	}
	h.broadcastRoom(r)
}

func (h *hub) member(r *room, id string) *client {
	for _, m := range r.members {
		if m.id == id {
			return m
		}
	}
	return nil
}

// ---------------------------------------------------------------- voices, callsigns

func voiceTaken(r *room, v string, except *client) *client {
	if r.set.Voices == "duplicates_allowed" {
		return nil
	}
	for _, m := range r.members {
		if m != except && m.voice == v {
			return m
		}
	}
	return nil
}

// First free favourite, then roster order. 15 voices, at most 8 players: always one left.
func (h *hub) pickVoice(r *room, prefs []string) string {
	for _, list := range [][]string{prefs, voiceRoster} {
		for _, v := range list {
			if voiceTaken(r, v, nil) == nil {
				return v
			}
		}
	}
	return voiceRoster[0]
}

func pickCallsign(r *room) int {
	used := map[int]bool{}
	for _, m := range r.members {
		used[m.call] = true
	}
	for {
		if n := 11 + int(randInt(89)); !used[n] && n%10 != 0 {
			return n
		}
	}
}

func (h *hub) claim(c *client, v string) {
	r := c.room
	if r == nil || !isVoice(v) {
		return
	}
	if r.phase == "flight" && !c.parked {
		h.send(c, map[string]any{"t": "claim", "ok": false, "voice": v, "why": "airborne"})
		return
	}
	if by := voiceTaken(r, v, c); by != nil {
		h.send(c, map[string]any{"t": "claim", "ok": false, "voice": v, "by": by.id, "byName": by.name})
		return
	}
	c.voice = v
	h.send(c, map[string]any{"t": "claim", "ok": true, "voice": v})
	h.broadcastRoom(r)
}

// ---------------------------------------------------------------- relay

func (h *hub) allow(c *client, n int) bool {
	now := h.now()
	if c.budgetAt.IsZero() {
		c.budgetN, c.budgetB = relayPerSec, relayBytesPS
	} else {
		el := now.Sub(c.budgetAt).Seconds()
		c.budgetN = minf(relayPerSec, c.budgetN+el*relayPerSec)
		c.budgetB = minf(relayBytesPS, c.budgetB+el*relayBytesPS)
	}
	c.budgetAt = now
	if c.budgetN < 1 || c.budgetB < float64(n) {
		return false
	}
	c.budgetN--
	c.budgetB -= float64(n)
	return true
}

// sig: WebRTC offers/answers/candidates to one peer. rl: JSON game traffic to
// one member, or (to "") the whole room.
func (h *hub) forwardText(c *client, m inMsg) {
	r := c.room
	if r == nil || len(m.D) == 0 || !h.allow(c, len(m.D)) {
		return
	}
	frame, _ := json.Marshal(map[string]any{"t": m.T, "from": c.id, "d": m.D})
	frame = append([]byte{'t'}, frame...)
	for _, x := range r.members {
		if x != c && (m.To == x.id || (m.To == "" && m.T == "rl")) {
			h.push(x, frame)
		}
	}
}

// Binary frames are [len][to id][payload] in and [len][from id][payload] out.
func (h *hub) relayBinary(c *client, b []byte) {
	if c.room == nil || len(b) < 2 || int(b[0])+1 > len(b) || !h.allow(c, len(b)) {
		return
	}
	p := h.member(c.room, string(b[1:1+int(b[0])]))
	if p == nil || p == c {
		return
	}
	payload := b[1+int(b[0]):]
	out := make([]byte, 0, 2+len(c.id)+len(payload))
	out = append(out, 'b', byte(len(c.id)))
	out = append(out, c.id...)
	out = append(out, payload...)
	h.push(p, out)
}

// ---------------------------------------------------------------- rebuild after a restart

type rejoinMsg struct {
	ID      string          `json:"id"`
	Code    string          `json:"code"`
	Name    string          `json:"name"`
	Priv    bool            `json:"priv"`
	Region  string          `json:"region"`
	Set     json.RawMessage `json:"set"`
	Phase   string          `json:"phase"`
	Owner   string          `json:"owner"`
	Members []memberView    `json:"members"`
	Epoch   int             `json:"epoch"`
}

// rejoin: normally the grace kept the seat and this just resends the room.
// After a server restart the browser rebuilds it (same id, code, line order,
// voices, callsigns and epoch), so nobody sees a host change and the WebRTC
// links stay up. Members not back yet are held as away placeholders.
func (h *hub) rejoin(c *client, rj *rejoinMsg) {
	if c.room != nil {
		h.broadcastRoom(c.room)
		return
	}
	if rj == nil || !validFrom(rj.ID, idChars, 6, 6) {
		h.send(c, map[string]any{"t": "err", "code": "gone", "msg": "That room has closed."})
		return
	}
	if r := h.rooms[rj.ID]; r != nil {
		if why := h.refuse(r, c); why != "" {
			h.send(c, map[string]any{"t": "err", "code": why, "msg": refuseMsg[why]})
			return
		}
		c.room = r
		if voiceTaken(r, c.voice, c) != nil || !isVoice(c.voice) {
			c.voice = h.pickVoice(r, c.voices)
		}
		if c.call == 0 {
			c.call = pickCallsign(r)
		}
		r.members = append(r.members, c)
		h.broadcastRoom(r)
		return
	}
	now := h.now()
	if now.Sub(h.started) > rebuildWindow || len(h.rooms) >= maxRooms {
		h.send(c, map[string]any{"t": "err", "code": "gone", "msg": "That room has closed."})
		return
	}
	r := &room{id: rj.ID, name: cleanRoomName(rj.Name, c.name+"'s court"), region: regionOrDefault(rj.Region),
		private: rj.Priv, epoch: rj.Epoch, phase: oneOf(rj.Phase, []string{"lobby", "flight", "podium"}, "lobby"),
		owner: rj.Owner, set: cleanSettings(rj.Set, c.rank), banned: map[string]bool{}, votes: map[string]map[string]bool{}, paid: map[string]bool{}}
	code := strings.ToUpper(strings.TrimSpace(rj.Code))
	if !validFrom(code, codeChars, 6, 6) || h.codes[code] != nil {
		code = h.newCode()
	}
	r.code = code
	h.codes[code], h.rooms[r.id] = r, r
	seen := map[string]bool{}
	in := false
	for _, mv := range rj.Members {
		if len(r.members) >= roomCap || seen[mv.ID] {
			continue
		}
		seen[mv.ID] = true
		var m *client
		switch {
		case mv.ID == c.id:
			m, in = c, true
		case !validFrom(mv.ID, idChars, 8, 8):
			continue
		case h.clients[mv.ID] != nil:
			m = h.clients[mv.ID]
			if m.room != nil || m.gone {
				continue
			}
		case len(h.clients) < maxClients:
			m = &client{id: mv.ID, name: cleanName(mv.Name, "Pilot"), title: cleanText(mv.Title, "", 24), rank: oneOf(mv.Rank, rankOrder, "baron"),
				gender: oneOf(mv.G, []string{"m", "f"}, "m"), region: r.region, seen: now, away: true, awayUntil: now.Add(h.grace)}
			h.clients[m.id] = m
		default:
			continue
		}
		m.room = r
		m.voice, m.call = "", 0
		if isVoice(mv.Voice) && voiceTaken(r, mv.Voice, nil) == nil {
			m.voice = mv.Voice
		}
		if mv.Call >= 11 && mv.Call <= 99 && mv.Call%10 != 0 && !callTaken(r, mv.Call) {
			m.call = mv.Call
		}
		r.members = append(r.members, m)
	}
	if !in {
		c.room = r
		r.members = append(r.members, c)
	}
	for _, m := range r.members {
		if m.voice == "" {
			m.voice = h.pickVoice(r, m.voices)
		}
		if m.call == 0 {
			m.call = pickCallsign(r)
		}
	}
	log.Printf("room %s rebuilt by %s after restart (%d members)", r.id, c.id, len(r.members))
	h.broadcastRoom(r)
}

func callTaken(r *room, n int) bool {
	for _, m := range r.members {
		if m.call == n {
			return true
		}
	}
	return false
}

// ---------------------------------------------------------------- views

type memberView struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Title string `json:"title,omitempty"`
	Rank  string `json:"rank,omitempty"`
	G     string `json:"g,omitempty"`
	Emp   bool   `json:"emp,omitempty"`
	Voice string `json:"voice"`
	Call  int    `json:"call"`
	Away  bool   `json:"away,omitempty"`
	Rdy   bool   `json:"rdy,omitempty"`
	KV    int    `json:"kv,omitempty"` // kick votes against
}

type roomView struct {
	ID      string       `json:"id"`
	Code    string       `json:"code,omitempty"`
	Name    string       `json:"name"`
	Priv    bool         `json:"priv"`
	Region  string       `json:"region"`
	N       int          `json:"n"`
	Max     int          `json:"max"`
	Set     settings     `json:"set"`
	Phase   string       `json:"phase"`
	Meta    *roomMeta    `json:"meta,omitempty"`
	Open    bool         `json:"open"`
	Host    string       `json:"host,omitempty"`
	Owner   string       `json:"owner,omitempty"`
	Epoch   int          `json:"epoch,omitempty"`
	Members []memberView `json:"members,omitempty"`
}

func (h *hub) broadcastRoom(r *room, joined ...*client) {
	v := roomView{ID: r.id, Code: r.code, Name: r.name, Priv: r.private, Region: r.region, N: len(r.members), Max: r.set.MaxPlayers,
		Set: r.set, Phase: r.phase, Meta: r.meta, Host: r.members[0].id, Owner: r.owner, Epoch: r.epoch}
	for _, m := range r.members {
		v.Members = append(v.Members, memberView{ID: m.id, Name: m.name, Title: m.title, Rank: m.rank, G: m.gender, Emp: m.emp,
			Voice: m.voice, Call: m.call, Away: m.away, Rdy: m.rdy, KV: len(r.votes[m.id])})
	}
	// TURN credentials only once there is someone to connect to.
	var ice json.RawMessage
	if len(r.members) > 1 && h.ice != nil {
		ice, _ = h.ice.get()
	}
	for _, m := range r.members {
		msg := map[string]any{"t": "room", "room": v, "you": m.id}
		if ice != nil {
			msg["ice"] = ice
		}
		if len(joined) > 0 && joined[0] == m {
			msg["joined"] = true
		}
		h.send(m, msg)
	}
}

func (h *hub) sendList(c *client) {
	list := []roomView{}
	for _, r := range h.rooms {
		if !r.private {
			list = append(list, roomView{ID: r.id, Name: r.name, Region: r.region, N: len(r.members), Max: r.set.MaxPlayers,
				Set: r.set, Phase: r.phase, Meta: r.meta, Open: h.refuse(r, c) == ""})
		}
	}
	sort.Slice(list, func(i, j int) bool {
		a, b := list[i], list[j]
		if (a.Region == c.region) != (b.Region == c.region) {
			return a.Region == c.region
		}
		if a.N != b.N {
			return a.N > b.N
		}
		return a.ID < b.ID
	})
	s := h.countStats()
	h.send(c, map[string]any{"t": "rooms", "rooms": list, "players": s.Players, "online": s.Online, "region": c.region})
}

// ---------------------------------------------------------------- lifecycle

func (h *hub) drop(c *client) {
	if c.gone {
		return
	}
	h.leaveRoom(c)
	c.gone = true
	delete(h.clients, c.id)
	if c.ip != "" {
		if h.ipN[c.ip]--; h.ipN[c.ip] <= 0 {
			delete(h.ipN, c.ip)
		}
	}
	if c.send != nil {
		close(c.send)
		c.send = nil
	}
}

// disconnect: the socket died without a goodbye. The seat, voice and callsign
// are held for the grace, but never the host role: the sky would freeze.
func (h *hub) disconnect(c *client) {
	c.away, c.awayUntil = true, h.now().Add(h.grace)
	if c.send != nil {
		close(c.send)
		c.send = nil
	}
	if r := c.room; r != nil {
		if r.members[0] == c && len(r.members) > 1 {
			r.members = append(r.members[1:], c)
			h.promote(r)
			r.epoch++
		}
		h.broadcastRoom(r)
	}
}

func (h *hub) expireAway() {
	now := h.now()
	for _, c := range h.clients {
		if c.away && now.After(c.awayUntil) {
			h.drop(c)
		}
	}
}

// Public rooms only: a player who has not touched anything for h.idle is removed. Away players expire on their own.
func (h *hub) expireIdle() {
	if h.idle <= 0 {
		return
	}
	now := h.now()
	for _, r := range h.rooms {
		if r.private {
			continue
		}
		for _, m := range append([]*client(nil), r.members...) {
			if !m.away && !m.input.IsZero() && now.Sub(m.input) > h.idle {
				log.Printf("room %s: %s idle, removed", r.id, m.id)
				h.removeFromRoom(m, "idle")
			}
		}
	}
}

func (h *hub) attach(e event) attachResult {
	now := h.now()
	if e.rid != "" && validFrom(e.rid, idChars, 8, 8) && validFrom(e.rtok, idChars, 16, 40) {
		if old := h.clients[e.rid]; old != nil && !old.gone {
			if old.tok == "" || subtle.ConstantTimeCompare([]byte(old.tok), []byte(e.rtok)) == 1 {
				if old.send != nil {
					close(old.send)
				}
				old.send, old.tok, old.away, old.lagging, old.seen = e.c.send, e.rtok, false, false, now
				if old.ip == "" {
					old.ip = e.ip
					h.ipN[e.ip]++
				}
				old.gen++
				h.welcome(old, true)
				if old.room != nil {
					h.broadcastRoom(old.room)
				}
				return attachResult{c: old, gen: old.gen}
			}
		} else if old == nil && now.Sub(h.started) < rebuildWindow && len(h.clients) < maxClients {
			// The server restarted: keep the browser's id so the rebuilt room and everyone's links still know it.
			c := e.c
			c.id, c.tok, c.seen, c.ip = e.rid, e.rtok, now, e.ip
			h.ipN[e.ip]++
			h.clients[c.id] = c
			h.welcome(c, false)
			return attachResult{c: c, gen: c.gen}
		}
	}
	if len(h.clients) >= maxClients {
		return attachResult{why: "server full"}
	}
	if h.ipN[e.ip] >= h.perIP {
		return attachResult{why: "too many connections"}
	}
	c := e.c
	c.id, c.tok, c.seen, c.ip = h.newID(8), randStr(24, idChars), now, e.ip
	h.ipN[e.ip]++
	h.clients[c.id] = c
	h.welcome(c, false)
	return attachResult{c: c, gen: c.gen}
}

func (h *hub) welcome(c *client, resumed bool) {
	h.send(c, map[string]any{"t": "welcome", "id": c.id, "tok": c.tok, "ice": stunOnly, "voices": voiceRoster,
		"grace": h.grace.Milliseconds(), "resumed": resumed, "access": h.acc.view()})
}

func (h *hub) countStats() stats {
	s := stats{Rooms: len(h.rooms), Online: len(h.clients)}
	for _, r := range h.rooms {
		s.Players += len(r.members)
	}
	return s
}

func (h *hub) publishStats() {
	s := h.countStats()
	h.statsMu.Lock()
	h.stats = s
	h.statsMu.Unlock()
}

func (h *hub) snapshotStats() stats {
	h.statsMu.Lock()
	defer h.statsMu.Unlock()
	return h.stats
}

// ---------------------------------------------------------------- plumbing

func (h *hub) send(c *client, v any) {
	b, err := json.Marshal(v)
	if err == nil {
		h.push(c, append([]byte{'t'}, b...))
	}
}

func (h *hub) push(c *client, frame []byte) {
	if c.gone || c.send == nil {
		return
	}
	select {
	case c.send <- frame:
	default:
		// A client this far behind is not flying any more. Cut loose after the event, never mid-broadcast.
		if !c.lagging {
			c.lagging = true
			h.lagging = append(h.lagging, c)
		}
	}
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
	h.in <- event{kind: evJoin, c: &client{name: "Pilot", rank: "baron", gender: "m", region: "xx", send: send},
		rid: q.Get("id"), rtok: q.Get("tok"), ip: ipKey(clientIP(r)), reply: reply}
	res := <-reply
	if res.c == nil {
		conn.Close(websocket.StatusTryAgainLater, res.why)
		return
	}
	c, gen := res.c, res.gen
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	go writer(ctx, conn, send, cancel)
	for {
		typ, data, err := conn.Read(ctx)
		if err != nil {
			st := websocket.CloseStatus(err)
			h.in <- event{kind: evLeave, c: c, gen: gen, bye: st == websocket.StatusNormalClosure || st == websocket.StatusGoingAway}
			break
		}
		h.in <- event{kind: evMsg, c: c, gen: gen, data: data, bin: typ == websocket.MessageBinary}
	}
	conn.Close(websocket.StatusNormalClosure, "")
}

func writer(ctx context.Context, conn *websocket.Conn, send chan []byte, cancel func()) {
	defer cancel()
	for {
		select {
		case <-ctx.Done():
			return
		case f, ok := <-send:
			if !ok {
				conn.Close(websocket.StatusPolicyViolation, "dropped")
				return
			}
			typ := websocket.MessageText
			if f[0] == 'b' {
				typ = websocket.MessageBinary
			}
			wctx, wc := context.WithTimeout(ctx, 10*time.Second)
			err := conn.Write(wctx, typ, f[1:])
			wc()
			if err != nil {
				return
			}
		}
	}
}

// clientIP: behind Caddy (a loopback peer) the right-most X-Forwarded-For hop, which Caddy appended itself.
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

// ipKey: IPv6 clients hold a whole /64, so the per-address cap counts per /64.
func ipKey(ip string) string {
	p := net.ParseIP(ip)
	if p == nil || p.To4() != nil {
		return ip
	}
	return p.Mask(net.CIDRMask(64, 128)).String() + "/64"
}

const idChars = "abcdefghijkmnopqrstuvwxyz23456789"
const codeChars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789" // no 0/O, 1/I/L

func randInt(n int) int64 {
	k, _ := rand.Int(rand.Reader, big.NewInt(int64(n)))
	return k.Int64()
}

func randStr(n int, chars string) string {
	b := make([]byte, n)
	for i := range b {
		b[i] = chars[randInt(len(chars))]
	}
	return string(b)
}

func (h *hub) newID(n int) string {
	for {
		id := randStr(n, idChars)
		if h.clients[id] == nil && h.rooms[id] == nil {
			return id
		}
	}
}

func (h *hub) newCode() string {
	for {
		if c := randStr(6, codeChars); h.codes[c] == nil && !isProfane(c) {
			return c
		}
	}
}

func validFrom(s, chars string, min, max int) bool {
	if len(s) < min || len(s) > max {
		return false
	}
	for i := 0; i < len(s); i++ {
		if strings.IndexByte(chars, s[i]) < 0 {
			return false
		}
	}
	return true
}

func regionOrDefault(r string) string {
	switch r {
	case "oce", "am", "eu", "as":
		return r
	}
	return "xx"
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

func regionName(r string) string {
	switch r {
	case "oce":
		return "Aus/NZ"
	case "am":
		return "Americas"
	case "eu":
		return "Europe"
	case "as":
		return "Asia"
	}
	return "World"
}

func minf(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}
