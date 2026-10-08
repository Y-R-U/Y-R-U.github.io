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
	"unicode"

	"github.com/coder/websocket"
)

const (
	maxClients   = 500
	maxRooms     = 200
	roomMax      = 8
	maxMsg       = 64 << 10
	sendQueue    = 512
	hostSilence  = 2500 * time.Millisecond // no beat from the host this long and it is replaced
	tickEvery    = 250 * time.Millisecond
	relayPerSec  = 400 // messages a second one client may push through sig/relay
	relayBytesPS = 512 << 10
)

// One goroutine owns every room and client field below; readers and writers
// only talk to it through h.in. That is the whole concurrency story.
type hub struct {
	in      chan event
	clients map[string]*client
	rooms   map[string]*room
	codes   map[string]*room
	turn    *turn
	now     func() time.Time
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
	id, name, region string
	send             chan []byte // first byte: 't' text, 'b' binary
	room             *room
	seen             time.Time
	budgetAt         time.Time
	budgetN          float64
	budgetB          float64
	gone             bool
	lagging          bool
	ready            bool // holds the arena (synced follower, or host): fit to take over
}

type room struct {
	id, code, name, region string
	private                bool
	settings               json.RawMessage
	members                []*client // line order; members[0] is the host
	epoch                  int
}

type event struct {
	kind int
	c    *client
	data []byte
	bin  bool
	done chan bool
}

const (
	evJoin = iota
	evLeave
	evMsg
	evTick
)

func newHub(t *turn) *hub {
	return &hub{
		in:      make(chan event, 1024),
		clients: map[string]*client{},
		rooms:   map[string]*room{},
		codes:   map[string]*room{},
		turn:    t,
		now:     time.Now,
		pubSeq:  map[string]int{},
	}
}

func (h *hub) run() {
	tick := time.NewTicker(tickEvery)
	defer tick.Stop()
	for {
		select {
		case e := <-h.in:
			h.handle(e)
		case <-tick.C:
			h.handle(event{kind: evTick})
		}
	}
}

func (h *hub) handle(e event) {
	switch e.kind {
	case evJoin:
		ok := len(h.clients) < maxClients
		if ok {
			h.clients[e.c.id] = e.c
			e.c.seen = h.now()
		}
		e.done <- ok
	case evLeave:
		h.drop(e.c)
	case evMsg:
		if e.c.gone {
			return
		}
		e.c.seen = h.now()
		if e.bin {
			h.relayBinary(e.c, e.data)
		} else {
			h.message(e.c, e.data)
		}
	case evTick:
		h.checkHosts()
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
	T    string          `json:"t"`
	Name string          `json:"name"`
	TZ   string          `json:"tz"`
	Code string          `json:"code"`
	ID   string          `json:"id"`
	To   string          `json:"to"`
	D    json.RawMessage `json:"d"`
	Set  json.RawMessage `json:"set"`
	R    int             `json:"r"`
}

func (h *hub) message(c *client, raw []byte) {
	var m inMsg
	if json.Unmarshal(raw, &m) != nil {
		return
	}
	switch m.T {
	case "b": // heartbeat: c.seen is already updated
		c.ready = m.R == 1
	case "hello":
		c.name = cleanName(m.Name, "Player")
		c.region = regionOf(m.TZ)
	case "list":
		h.sendList(c)
	case "quick":
		h.leaveRoom(c)
		h.quickJoin(c)
	case "create":
		h.leaveRoom(c)
		h.create(c, m)
	case "join":
		h.join(c, m)
	case "leave":
		h.leaveRoom(c)
		h.sendList(c)
	case "handoff":
		if r := c.room; r != nil && r.members[0] == c {
			log.Printf("room %s: host %s handed off", r.id, c.id)
			h.demoteHost(r)
		}
	case "sig", "rl":
		h.forwardText(c, m)
	}
}

func (h *hub) send(c *client, v any) {
	b, err := json.Marshal(v)
	if err != nil {
		return
	}
	h.push(c, append([]byte{'t'}, b...))
}

func (h *hub) push(c *client, frame []byte) {
	if c.gone {
		return
	}
	select {
	case c.send <- frame:
	default:
		// A client this far behind is not playing any more; cut it loose
		// rather than letting it stall everyone else. Dropped after the event,
		// never mid-broadcast, so no member list changes under a loop.
		if !c.lagging {
			c.lagging = true
			h.lagging = append(h.lagging, c)
		}
	}
}

// ---------------------------------------------------------------- rooms

type roomView struct {
	ID       string          `json:"id"`
	Name     string          `json:"name"`
	Private  bool            `json:"priv"`
	Region   string          `json:"region"`
	Players  int             `json:"n"`
	Max      int             `json:"max"`
	Settings json.RawMessage `json:"set,omitempty"`
}

func (r *room) view() roomView {
	return roomView{ID: r.id, Name: r.name, Private: r.private, Region: r.region,
		Players: len(r.members), Max: roomMax, Settings: r.settings}
}

func (h *hub) sendList(c *client) {
	list := []roomView{}
	for _, r := range h.rooms {
		list = append(list, r.view())
	}
	// Your own region first, then the busiest, so the obvious pick is on top.
	sort.Slice(list, func(i, j int) bool {
		a, b := list[i], list[j]
		if (a.Region == c.region) != (b.Region == c.region) {
			return a.Region == c.region
		}
		if a.Players != b.Players {
			return a.Players > b.Players
		}
		return a.Name < b.Name
	})
	s := h.countStats()
	h.send(c, map[string]any{"t": "rooms", "rooms": list, "players": s.Players, "online": s.Online, "region": c.region})
}

func (h *hub) quickJoin(c *client) {
	var best *room
	for _, r := range h.rooms {
		if r.private || r.region != c.region || len(r.members) >= roomMax {
			continue
		}
		// Fill the busiest room first: a game with people in it beats an empty one.
		if best == nil || len(r.members) > len(best.members) || (len(r.members) == len(best.members) && r.id < best.id) {
			best = r
		}
	}
	if best == nil {
		if len(h.rooms) >= maxRooms {
			h.send(c, map[string]any{"t": "err", "msg": "The server is full right now. Try again in a minute."})
			return
		}
		h.pubSeq[c.region]++
		best = &room{id: h.newID(), name: regionName(c.region) + " #" + itoa(h.pubSeq[c.region]), region: c.region}
		h.rooms[best.id] = best
	}
	h.enter(c, best)
}

func (h *hub) create(c *client, m inMsg) {
	if len(h.rooms) >= maxRooms {
		h.send(c, map[string]any{"t": "err", "msg": "The server is full right now. Try again in a minute."})
		return
	}
	r := &room{id: h.newID(), code: h.newCode(), name: cleanName(m.Name, c.name+"'s room"),
		region: c.region, private: true, settings: cleanSettings(m.Set)}
	h.rooms[r.id] = r
	h.codes[r.code] = r
	h.enter(c, r)
}

func (h *hub) join(c *client, m inMsg) {
	var r *room
	if m.Code != "" {
		r = h.codes[strings.ToUpper(strings.TrimSpace(m.Code))]
	} else if pr := h.rooms[m.ID]; pr != nil && !pr.private {
		r = pr
	}
	if r == nil {
		h.send(c, map[string]any{"t": "err", "msg": "No room with that code. Check it, or ask for the link again.", "code": "nocode"})
		return
	}
	if r == c.room {
		h.sendRoom(c)
		return
	}
	if len(r.members) >= roomMax {
		h.send(c, map[string]any{"t": "err", "msg": "That room is full.", "code": "full"})
		return
	}
	h.leaveRoom(c)
	h.enter(c, r)
}

func (h *hub) enter(c *client, r *room) {
	c.room = r
	r.members = append(r.members, c)
	if len(r.members) == 1 {
		r.epoch++
	}
	h.broadcastMembers(r, c)
}

func (h *hub) leaveRoom(c *client) {
	r := c.room
	if r == nil {
		return
	}
	c.room = nil
	wasHost := r.members[0] == c
	for i, m := range r.members {
		if m == c {
			r.members = append(r.members[:i], r.members[i+1:]...)
			break
		}
	}
	if len(r.members) == 0 {
		delete(h.rooms, r.id)
		if r.code != "" {
			delete(h.codes, r.code)
		}
		return
	}
	if wasHost {
		h.promoteFresh(r)
		r.epoch++
	}
	h.broadcastMembers(r, nil)
}

// demoteHost sends the host to the back of the line and promotes the next
// player who is actually still running the game.
func (h *hub) demoteHost(r *room) {
	if len(r.members) < 2 {
		return
	}
	old := r.members[0]
	r.members = append(r.members[1:], old)
	h.promoteFresh(r)
	r.epoch++
	h.broadcastMembers(r, nil)
}

// promoteFresh moves the first player with a recent heartbeat who already
// holds the arena to the front. A player still loading has nothing to run.
// The game loop sends the beats, so a hidden tab — which stops its loop —
// is never handed the arena.
func (h *hub) promoteFresh(r *room) {
	now := h.now()
	for i, m := range r.members {
		if m.ready && now.Sub(m.seen) < hostSilence {
			if i > 0 {
				r.members = append([]*client{m}, append(r.members[:i:i], r.members[i+1:]...)...)
			}
			return
		}
	}
}

func (h *hub) checkHosts() {
	now := h.now()
	for _, r := range h.rooms {
		if len(r.members) > 1 && now.Sub(r.members[0].seen) > hostSilence && h.anyFresh(r.members[1:]) {
			log.Printf("room %s: host %s silent %dms, replaced", r.id, r.members[0].id, now.Sub(r.members[0].seen).Milliseconds())
			h.demoteHost(r)
		}
	}
}

// Replacing a silent host only helps if someone else is running. When every
// browser stalls at once (a busy machine, a network blip on the server side)
// passing the arena around would just thrash.
func (h *hub) anyFresh(ms []*client) bool {
	now := h.now()
	for _, m := range ms {
		if m.ready && now.Sub(m.seen) < hostSilence {
			return true
		}
	}
	return false
}

type memberView struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

func (h *hub) broadcastMembers(r *room, joined *client) {
	// TURN credentials only once there is someone to connect to. Fetching them
	// can block on Cloudflare for a moment, but only on a cache miss (hourly).
	var ice json.RawMessage
	if len(r.members) > 1 {
		ice = h.turn.iceServers()
	}
	ms := make([]memberView, len(r.members))
	for i, m := range r.members {
		ms[i] = memberView{m.id, m.name}
	}
	for _, m := range r.members {
		msg := map[string]any{"t": "room", "room": r.view(), "members": ms,
			"host": r.members[0].id, "epoch": r.epoch, "you": m.id}
		if r.private {
			msg["code"] = r.code
		}
		if ice != nil {
			msg["ice"] = ice
		}
		if m == joined {
			msg["joined"] = true
		}
		h.send(m, msg)
	}
}

func (h *hub) sendRoom(c *client) {
	if c.room != nil {
		h.broadcastMembers(c.room, nil)
	}
}

// ---------------------------------------------------------------- relay

func (h *hub) allow(c *client, n int) bool {
	now := h.now()
	el := now.Sub(c.budgetAt).Seconds()
	c.budgetAt = now
	c.budgetN = minf(relayPerSec, c.budgetN+el*relayPerSec)
	c.budgetB = minf(relayBytesPS, c.budgetB+el*relayBytesPS)
	if c.budgetN < 1 || c.budgetB < float64(n) {
		return false
	}
	c.budgetN--
	c.budgetB -= float64(n)
	return true
}

func (h *hub) peer(c *client, to string) *client {
	if c.room == nil {
		return nil
	}
	for _, m := range c.room.members {
		if m.id == to && m != c {
			return m
		}
	}
	return nil
}

func (h *hub) forwardText(c *client, m inMsg) {
	if !h.allow(c, len(m.D)) {
		return
	}
	if p := h.peer(c, m.To); p != nil {
		h.send(p, map[string]any{"t": m.T, "from": c.id, "d": m.D})
	}
}

// Binary relay frames are [len][to id][payload] on the way in and
// [len][from id][payload] on the way out.
func (h *hub) relayBinary(c *client, b []byte) {
	if len(b) < 2 || int(b[0])+1 > len(b) || !h.allow(c, len(b)) {
		return
	}
	to := string(b[1 : 1+int(b[0])])
	p := h.peer(c, to)
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

func (h *hub) drop(c *client) {
	if c.gone {
		return
	}
	h.leaveRoom(c)
	c.gone = true
	delete(h.clients, c.id)
	close(c.send)
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

func (h *hub) serveWS(w http.ResponseWriter, r *http.Request, origins []string) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: origins})
	if err != nil {
		return
	}
	conn.SetReadLimit(maxMsg)
	c := &client{id: h.newID(), name: "Player", region: "xx", send: make(chan []byte, sendQueue)}
	done := make(chan bool, 1)
	h.in <- event{kind: evJoin, c: c, done: done}
	if !<-done {
		conn.Close(websocket.StatusTryAgainLater, "server full")
		return
	}

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	go writer(ctx, conn, c.send, cancel)

	welcome, _ := json.Marshal(map[string]any{"t": "welcome", "id": c.id, "ice": stunOnly, "turn": h.turn.usable()})
	// Straight to the socket: the hub has not been told about anything yet.
	wctx, wcancel := context.WithTimeout(ctx, 5*time.Second)
	err = conn.Write(wctx, websocket.MessageText, welcome)
	wcancel()

	for err == nil {
		var typ websocket.MessageType
		var data []byte
		typ, data, err = conn.Read(ctx)
		if err != nil {
			break
		}
		h.in <- event{kind: evMsg, c: c, data: data, bin: typ == websocket.MessageBinary}
	}
	h.in <- event{kind: evLeave, c: c}
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
const codeChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // no 0/O, 1/I

func randString(chars string, n int) string {
	b := make([]byte, n)
	max := big.NewInt(int64(len(chars)))
	for i := range b {
		v, _ := rand.Int(rand.Reader, max)
		b[i] = chars[v.Int64()]
	}
	return string(b)
}

func (h *hub) newID() string {
	for {
		id := randString(idChars, 8)
		if h.clients[id] == nil && h.rooms[id] == nil {
			return id
		}
	}
}

func (h *hub) newCode() string {
	for {
		code := randString(codeChars, 6)
		if h.codes[code] == nil {
			return code
		}
	}
}

func cleanName(s, def string) string {
	var b strings.Builder
	n := 0
	for _, r := range strings.TrimSpace(s) {
		if n >= 24 {
			break
		}
		if unicode.IsControl(r) || r == '<' || r == '>' {
			continue
		}
		b.WriteRune(r)
		n++
	}
	out := strings.TrimSpace(b.String())
	if out == "" {
		return def
	}
	return out
}

// Settings are opaque to the server: a small flat object of booleans that the
// host's browser applies. Anything else is dropped.
func cleanSettings(raw json.RawMessage) json.RawMessage {
	if len(raw) == 0 || len(raw) > 512 {
		return nil
	}
	var m map[string]bool
	if json.Unmarshal(raw, &m) != nil || len(m) > 16 {
		return nil
	}
	out, _ := json.Marshal(m)
	return out
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
		return "Australia/NZ"
	case "am":
		return "Americas"
	case "eu":
		return "Europe"
	case "as":
		return "Asia"
	}
	return "World"
}

func itoa(n int) string {
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

func minf(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}
