package main

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/json"
	"math/big"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/coder/websocket"
)

const (
	maxClients = 500
	maxRooms   = 200
	maxMsg     = 32 << 10
	sendQueue  = 256
	tickEvery  = 250 * time.Millisecond
)

// One goroutine (run) owns every field below. Voice claims are atomic because
// nothing else ever touches a room's member list.
type hub struct {
	in      chan event
	clients map[string]*client
	rooms   map[string]*room
	codes   map[string]*room
	grace   time.Duration
	now     func() time.Time
}

type client struct {
	id, tok, name, title string
	voices               []string // preference order from hello
	voice                string   // claimed in the current room
	callsign             int      // 11–99, unique in the room: the tower's "Baroness Four-Two"
	send                 chan []byte
	room                 *room
	away                 bool
	awayUntil            time.Time
	gen                  int
}

type room struct {
	id, code, name string
	private        bool
	set            settings
	members        []*client // join line; members[0] hosts
	epoch          int       // bumps on every host change
}

type event struct {
	kind  int
	c     *client
	gen   int
	data  []byte
	bye   bool
	rid   string
	rtok  string
	reply chan *client
}

const (
	evAttach = iota
	evLeave
	evMsg
	evTick
)

func newHub(grace time.Duration) *hub {
	return &hub{in: make(chan event, 1024), clients: map[string]*client{}, rooms: map[string]*room{},
		codes: map[string]*room{}, grace: grace, now: time.Now}
}

func (h *hub) run() {
	t := time.NewTicker(tickEvery)
	for {
		select {
		case e := <-h.in:
			h.handle(e)
		case <-t.C:
			h.expireAway()
		}
	}
}

func (h *hub) handle(e event) {
	switch e.kind {
	case evAttach:
		e.reply <- h.attach(e)
	case evLeave:
		if e.gen != e.c.gen {
			return
		}
		if e.bye || h.grace <= 0 {
			h.drop(e.c)
		} else {
			// Away keeps the seat and the voice for the grace, but never the host
			// role: the sky would freeze. The next connected member takes it now.
			e.c.away, e.c.awayUntil = true, h.now().Add(h.grace)
			if r := e.c.room; r != nil {
				if r.members[0] == e.c {
					h.handOff(r)
				}
				h.broadcastRoom(r)
			}
		}
	case evMsg:
		if e.gen == e.c.gen && h.clients[e.c.id] == e.c {
			h.message(e.c, e.data)
		}
	}
}

func (h *hub) attach(e event) *client {
	if old := h.clients[e.rid]; old != nil && e.rtok != "" && subtle.ConstantTimeCompare([]byte(old.tok), []byte(e.rtok)) == 1 {
		old.gen++
		old.send, old.away = e.c.send, false
		h.send(old, map[string]any{"t": "welcome", "id": old.id, "tok": old.tok, "resumed": true})
		if old.room != nil {
			h.broadcastRoom(old.room)
		}
		return old
	}
	if len(h.clients) >= maxClients {
		return nil
	}
	c := e.c
	c.id, c.tok = h.newID(8), h.newID(16)
	h.clients[c.id] = c
	h.send(c, map[string]any{"t": "welcome", "id": c.id, "tok": c.tok, "voices": voiceRoster})
	return c
}

func (h *hub) expireAway() {
	now := h.now()
	for _, c := range h.clients {
		if c.away && now.After(c.awayUntil) {
			h.drop(c)
		}
	}
}

func (h *hub) drop(c *client) {
	h.leaveRoom(c)
	delete(h.clients, c.id)
}

type inMsg struct {
	T      string          `json:"t"`
	Name   string          `json:"name"`
	Title  string          `json:"title"`
	Voices []string        `json:"voices"`
	Voice  string          `json:"voice"`
	Code   string          `json:"code"`
	ID     string          `json:"id"`
	Priv   bool            `json:"priv"`
	Set    json.RawMessage `json:"set"`
	To     string          `json:"to"`
	D      json.RawMessage `json:"d"`
}

func (h *hub) message(c *client, raw []byte) {
	var m inMsg
	if json.Unmarshal(raw, &m) != nil {
		return
	}
	switch m.T {
	case "hello":
		c.name = cleanName(m.Name, "Pilot")
		c.title = cleanID(m.Title)
		c.voices = c.voices[:0]
		for _, v := range m.Voices {
			if isVoice(v) && len(c.voices) < len(voiceRoster) {
				c.voices = append(c.voices, v)
			}
		}
	case "list":
		h.sendList(c)
	case "create":
		h.create(c, m)
	case "join":
		h.join(c, m)
	case "leave":
		h.leaveRoom(c)
		h.sendList(c)
	case "claim":
		h.claim(c, m.Voice)
	case "set":
		if r := c.room; r != nil && r.members[0] == c {
			r.set = cleanSettings(m.Set)
			h.broadcastRoom(r)
		}
	case "rl":
		h.relay(c, m)
	}
}

// ---------------------------------------------------------------- rooms

func (h *hub) create(c *client, m inMsg) {
	if len(h.rooms) >= maxRooms {
		h.send(c, map[string]any{"t": "err", "code": "full", "msg": "The skies are full. Try again in a minute."})
		return
	}
	h.leaveRoom(c)
	r := &room{id: h.newID(6), code: h.newCode(), name: cleanText(m.Name, c.name+"'s court", 24),
		private: m.Priv, set: cleanSettings(m.Set)}
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
		h.send(c, map[string]any{"t": "err", "code": "nocode", "msg": "No room with that code."})
		return
	}
	if r == c.room {
		h.broadcastRoom(r)
		return
	}
	if len(r.members) >= r.set.MaxPlayers {
		h.send(c, map[string]any{"t": "err", "code": "full", "msg": "That room is full."})
		return
	}
	h.leaveRoom(c)
	h.enter(c, r)
}

func (h *hub) enter(c *client, r *room) {
	c.room = r
	c.voice = h.pickVoice(r, c.voices)
	c.callsign = h.pickCallsign(r)
	r.members = append(r.members, c)
	if len(r.members) == 1 {
		r.epoch++
	}
	h.broadcastRoom(r)
}

func (h *hub) leaveRoom(c *client) {
	r := c.room
	if r == nil {
		return
	}
	c.room, c.voice, c.callsign = nil, "", 0
	wasHost := r.members[0] == c
	for i, m := range r.members {
		if m == c {
			r.members = append(r.members[:i], r.members[i+1:]...)
			break
		}
	}
	if len(r.members) == 0 {
		delete(h.rooms, r.id)
		delete(h.codes, r.code)
		return
	}
	if wasHost {
		h.promoteConnected(r)
		r.epoch++
	}
	h.broadcastRoom(r)
}

// The first member still connected moves to the front; away ones keep their place in line.
func (h *hub) promoteConnected(r *room) {
	for i, m := range r.members {
		if !m.away {
			if i > 0 {
				r.members = append([]*client{m}, append(r.members[:i:i], r.members[i+1:]...)...)
			}
			return
		}
	}
}

func (h *hub) handOff(r *room) {
	if len(r.members) < 2 {
		return
	}
	r.members = append(r.members[1:], r.members[0])
	h.promoteConnected(r)
	r.epoch++
}

// ---------------------------------------------------------------- voices

func voiceTaken(r *room, v string, except *client) bool {
	if r.set.Voices == "duplicates_allowed" {
		return false
	}
	for _, m := range r.members {
		if m != except && m.voice == v {
			return true
		}
	}
	return false
}

// First free voice in the player's own order, then in roster order. A room
// holds at most 8 and the roster has 15, so there is always one left.
func (h *hub) pickVoice(r *room, prefs []string) string {
	for _, list := range [][]string{prefs, voiceRoster} {
		for _, v := range list {
			if !voiceTaken(r, v, nil) {
				return v
			}
		}
	}
	return ""
}

func (h *hub) pickCallsign(r *room) int {
	used := map[int]bool{}
	for _, m := range r.members {
		used[m.callsign] = true
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
	if voiceTaken(r, v, c) {
		var by string
		for _, m := range r.members {
			if m.voice == v {
				by = m.id
			}
		}
		h.send(c, map[string]any{"t": "claim", "ok": false, "voice": v, "by": by})
		return
	}
	c.voice = v
	h.send(c, map[string]any{"t": "claim", "ok": true, "voice": v})
	h.broadcastRoom(r)
}

// ---------------------------------------------------------------- relay

// Game traffic between room members only. to "" = everyone else in the room.
func (h *hub) relay(c *client, m inMsg) {
	r := c.room
	if r == nil || len(m.D) == 0 {
		return
	}
	frame, _ := json.Marshal(map[string]any{"t": "rl", "from": c.id, "d": m.D})
	for _, x := range r.members {
		if x != c && (m.To == "" || m.To == x.id) {
			h.push(x, frame)
		}
	}
}

// ---------------------------------------------------------------- views

type memberView struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Title string `json:"title,omitempty"`
	Voice string `json:"voice"`
	Call  int    `json:"call"`
	Away  bool   `json:"away,omitempty"`
}

type roomView struct {
	ID      string       `json:"id"`
	Code    string       `json:"code,omitempty"`
	Name    string       `json:"name"`
	Priv    bool         `json:"priv"`
	N       int          `json:"n"`
	Set     settings     `json:"set"`
	Host    string       `json:"host,omitempty"`
	Epoch   int          `json:"epoch,omitempty"`
	Members []memberView `json:"members,omitempty"`
}

func (h *hub) broadcastRoom(r *room) {
	v := roomView{ID: r.id, Code: r.code, Name: r.name, Priv: r.private, N: len(r.members), Set: r.set,
		Host: r.members[0].id, Epoch: r.epoch}
	for _, m := range r.members {
		v.Members = append(v.Members, memberView{ID: m.id, Name: m.name, Title: m.title, Voice: m.voice, Call: m.callsign, Away: m.away})
	}
	for _, m := range r.members {
		h.send(m, map[string]any{"t": "room", "room": v, "you": m.id})
	}
}

func (h *hub) sendList(c *client) {
	list := []roomView{}
	for _, r := range h.rooms {
		if !r.private {
			list = append(list, roomView{ID: r.id, Name: r.name, N: len(r.members), Set: r.set})
		}
	}
	sort.Slice(list, func(i, j int) bool {
		if list[i].N != list[j].N {
			return list[i].N > list[j].N
		}
		return list[i].ID < list[j].ID
	})
	h.send(c, map[string]any{"t": "rooms", "rooms": list})
}

// ---------------------------------------------------------------- plumbing

func (h *hub) send(c *client, v any) {
	b, err := json.Marshal(v)
	if err == nil {
		h.push(c, b)
	}
}

func (h *hub) push(c *client, b []byte) {
	if c.away || c.send == nil {
		return
	}
	select {
	case c.send <- b:
	default: // a client this far behind is not flying any more; frames are dropped, not queued
	}
}

const idChars = "abcdefghijkmnopqrstuvwxyz23456789"
const codeChars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

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

func (h *hub) newID(n int) string { return randStr(n, idChars) }

func (h *hub) newCode() string {
	for {
		if c := randStr(6, codeChars); h.codes[c] == nil {
			return c
		}
	}
}

func (h *hub) serveWS(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: origins})
	if err != nil {
		return
	}
	conn.SetReadLimit(maxMsg)
	send := make(chan []byte, sendQueue)
	reply := make(chan *client, 1)
	q := r.URL.Query()
	h.in <- event{kind: evAttach, c: &client{name: "Pilot", send: send}, rid: q.Get("id"), rtok: q.Get("tok"), reply: reply}
	c := <-reply
	if c == nil {
		conn.Close(websocket.StatusTryAgainLater, "server full")
		return
	}
	gen := c.gen
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case b := <-send:
				wctx, wc := context.WithTimeout(ctx, 5*time.Second)
				err := conn.Write(wctx, websocket.MessageText, b)
				wc()
				if err != nil {
					cancel()
					return
				}
			}
		}
	}()
	for {
		_, data, err := conn.Read(ctx)
		if err != nil {
			st := websocket.CloseStatus(err)
			h.in <- event{kind: evLeave, c: c, gen: gen, bye: st == websocket.StatusNormalClosure || st == websocket.StatusGoingAway}
			break
		}
		h.in <- event{kind: evMsg, c: c, gen: gen, data: data}
	}
	conn.Close(websocket.StatusNormalClosure, "")
}
