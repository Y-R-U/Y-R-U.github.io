package main

import (
	"encoding/json"
	"log"
	"sort"
	"sync"
	"time"
)

const (
	maxQuestions   = 200
	maxQuestionsSz = 512 << 10
	leadInMs       = 3000  // countdown before each question opens
	graceMs        = 500   // server-clock ping grace after the deadline
	onlineMs       = 30000 // a poller waits up to 20 s between requests
	defaultReveal  = 5000
	defaultAnswer  = 10000
	abandonedMs    = 10 * 60 * 1000 // an empty public lobby is dropped so the cap can't be squatted
	kidsAnswer     = 20000          // kids rooms default to a gentle timer and flat 100 per correct
)

type Answer struct {
	Given   json.RawMessage `json:"g,omitempty"`
	Correct bool            `json:"c"`
	Points  int             `json:"p"`
	Ms      int             `json:"ms"`
}

type Player struct {
	ID         string          `json:"id"`
	Name       string          `json:"name"`
	Key        string          `json:"key"`
	UID        string          `json:"uid,omitempty"`
	Score      int             `json:"score"`
	Correct    int             `json:"correct"`
	Streak     int             `json:"streak"`
	BestStreak int             `json:"best"`
	JoinedQ    int             `json:"joinedQ"`
	Order      int             `json:"order"`
	Answers    map[int]*Answer `json:"answers"`
	Gone       bool            `json:"gone,omitempty"`
	Kicked     bool            `json:"kicked,omitempty"`
	LastSeen   int64           `json:"seen"`
	conns      int
}

type Room struct {
	mu        sync.Mutex
	Code      string            `json:"code"`
	HostID    string            `json:"host"`
	Phase     string            `json:"phase"` // lobby | question | reveal | final
	Q         int               `json:"q"`
	QStart    int64             `json:"qStart"`
	QDeadline int64             `json:"qDeadline"`
	RevealAt  int64             `json:"revealAt"`
	Spec      json.RawMessage   `json:"spec"`
	Title     string            `json:"title,omitempty"`
	Questions []json.RawMessage `json:"questions"`
	Players   []*Player         `json:"players"`
	Auto      bool              `json:"auto"`
	RevealMs  int               `json:"revealMs"` // gap before the next question when Auto
	AnswerMs  int               `json:"answerMs"` // host-chosen answer time
	Ver       int64             `json:"ver"`
	Created   int64             `json:"created"`
	Touched   int64             `json:"touched"`
	NextOrder int               `json:"nextOrder"`
	Game      int               `json:"game"` // bumps on "play again"
	Kids      bool              `json:"kids,omitempty"`
	Diff      int               `json:"difficulty,omitempty"`
	Public    bool              `json:"public,omitempty"`
	StartAt   int64             `json:"startAt,omitempty"` // public auto-start, 0 = host starts
	NoLate    bool              `json:"noLate,omitempty"`
	EmptyAt   int64             `json:"emptyAt,omitempty"` // when the last player went offline
	meta      []qMeta
	subs      map[*sub]struct{}
	dirty     bool
	dead      bool
}

type sub struct {
	ch  chan struct{}
	pid string
}

var (
	roomsMu sync.RWMutex
	rooms   = map[string]*Room{}
)

func getRoom(code string) *Room {
	roomsMu.RLock()
	defer roomsMu.RUnlock()
	return rooms[code]
}

func newRoom(spec json.RawMessage, title string, qs []json.RawMessage) *Room {
	now := nowMs()
	r := &Room{Phase: "lobby", Q: -1, Spec: spec, Title: title, Questions: qs, Auto: true, RevealMs: defaultReveal, AnswerMs: defaultAnswer,
		Created: now, Touched: now, subs: map[*sub]struct{}{}, dirty: true}
	r.buildMeta()
	roomsMu.Lock()
	defer roomsMu.Unlock()
	for {
		c := newCode()
		if rooms[c] == nil {
			r.Code = c
			rooms[c] = r
			return r
		}
	}
}

func (r *Room) buildMeta() {
	r.Kids, r.Diff = specInfo(r.Spec)
	r.meta = make([]qMeta, len(r.Questions))
	for i, q := range r.Questions {
		r.meta[i] = parseMeta(q)
		r.meta[i].LimitMs = r.limitFor(r.meta[i].Format)
	}
}

// The host's answer time applies to every question; long formats (connections,
// blitz…) never get less than their own minimum, or they'd be unplayable.
func (r *Room) limitFor(format string) int {
	ms := r.AnswerMs
	if ms <= 0 {
		ms = defaultAnswer
	}
	if long, ok := longFormats[format]; ok && long > ms {
		ms = long
	}
	return ms
}

var answerChoices = map[int]bool{3: true, 5: true, 10: true, 15: true, 20: true, 30: true}
var gapChoices = map[int]bool{3: true, 5: true, 10: true}

// setTiming applies host choices: answer seconds and gap seconds (0 = host taps Next).
func (r *Room) setTiming(answerSec, gapSec *int) {
	if answerSec != nil && answerChoices[*answerSec] {
		r.AnswerMs = *answerSec * 1000
		r.buildMeta()
	}
	if gapSec != nil {
		if *gapSec == 0 {
			r.Auto = false
		} else if gapChoices[*gapSec] {
			r.Auto, r.RevealMs = true, *gapSec*1000
		}
	}
}

// specInfo reads kids/difficulty from the spec top level or its rounds.
func specInfo(spec json.RawMessage) (kids bool, diff int) {
	var s struct {
		Kids       bool `json:"kids"`
		Difficulty int  `json:"difficulty"`
		Rounds     []struct {
			Difficulty int `json:"difficulty"`
			Opts       struct {
				Kids bool `json:"kids"`
			} `json:"opts"`
		} `json:"rounds"`
	}
	json.Unmarshal(spec, &s)
	kids, diff = s.Kids, s.Difficulty
	for _, r := range s.Rounds {
		kids = kids || r.Opts.Kids
		if diff == 0 {
			diff = r.Difficulty
		}
	}
	if kids {
		diff = 1
	}
	return
}

// changed must be called with r.mu held after any visible mutation.
func (r *Room) changed() {
	r.Ver++
	r.dirty = true
	r.Touched = nowMs()
	for s := range r.subs {
		select {
		case s.ch <- struct{}{}:
		default:
		}
	}
}

func (r *Room) player(id string) *Player {
	for _, p := range r.Players {
		if p.ID == id {
			return p
		}
	}
	return nil
}

func (r *Room) byKey(key string) *Player {
	if key == "" {
		return nil
	}
	for _, p := range r.Players {
		if p.Key == key {
			return p
		}
	}
	return nil
}

func (r *Room) active() []*Player {
	out := make([]*Player, 0, len(r.Players))
	for _, p := range r.Players {
		if !p.Gone {
			out = append(out, p)
		}
	}
	return out
}

func (p *Player) online(now int64) bool { return !p.Gone && (p.conns > 0 || now-p.LastSeen < onlineMs) }

// addPlayer joins a new player, or returns the existing one for a signed-in uid.
func (r *Room) addPlayer(name, uid string) (*Player, string) {
	now := nowMs()
	if uid != "" {
		for _, p := range r.Players {
			if p.UID == uid && !p.Kicked {
				p.Gone = false
				p.LastSeen = now
				r.changed()
				return p, ""
			}
		}
	}
	act := r.active()
	if len(act) >= cfg.MaxPlayers {
		return nil, "room_full"
	}
	name = dedupeName(name, func(n string) bool {
		for _, p := range act {
			if equalFoldName(p.Name, n) {
				return true
			}
		}
		return false
	})
	joinQ := 0
	switch r.Phase {
	case "question", "reveal":
		joinQ = r.Q + 1
	case "final":
		joinQ = len(r.Questions)
	}
	p := &Player{ID: randString(codeAlphabet, 6), Name: name, Key: newKey(), UID: uid, JoinedQ: joinQ,
		Order: r.NextOrder, Answers: map[int]*Answer{}, LastSeen: now}
	r.NextOrder++
	r.Players = append(r.Players, p)
	if r.HostID == "" || r.player(r.HostID) == nil || r.player(r.HostID).Gone {
		r.HostID = p.ID
	}
	r.changed()
	return p, ""
}

func (r *Room) start() {
	r.StartAt = 0
	r.advance()
}

// publicCount counts listed-or-running public rooms (anything not finished).
func publicCount() int {
	roomsMu.RLock()
	list := make([]*Room, 0, len(rooms))
	for _, r := range rooms {
		list = append(list, r)
	}
	roomsMu.RUnlock()
	n := 0
	for _, r := range list {
		r.mu.Lock()
		if r.Public && !r.dead && r.Phase != "final" {
			n++
		}
		r.mu.Unlock()
	}
	return n
}

var startChoices = map[int]bool{0: true, 60: true, 120: true, 300: true}

func (r *Room) setStart(startIn *int) {
	if startIn != nil && startChoices[*startIn] && r.Phase == "lobby" {
		r.StartAt = 0
		if *startIn > 0 {
			r.StartAt = nowMs() + int64(*startIn)*1000
		}
	}
}

func (r *Room) advance() {
	now := nowMs()
	if r.Q+1 >= len(r.Questions) {
		r.Phase = "final"
		r.QStart, r.QDeadline, r.RevealAt = 0, 0, 0
		r.changed()
		return
	}
	r.Q++
	r.Phase = "question"
	r.QStart = now + leadInMs
	r.QDeadline = r.QStart + int64(r.meta[r.Q].LimitMs)
	r.RevealAt = 0
	r.changed()
}

func (r *Room) reveal() {
	r.Phase = "reveal"
	r.RevealAt = nowMs() + int64(r.RevealMs)
	for _, p := range r.Players {
		if !p.Gone && p.JoinedQ <= r.Q && p.Answers[r.Q] == nil {
			p.Streak = 0
		}
	}
	r.changed()
}

func (r *Room) finish() {
	r.Phase = "final"
	r.QStart, r.QDeadline, r.RevealAt = 0, 0, 0
	r.changed()
}

func (r *Room) allAnswered(now int64) bool {
	n := 0
	for _, p := range r.Players {
		if p.JoinedQ > r.Q || !p.online(now) {
			continue
		}
		if p.Answers[r.Q] == nil {
			return false
		}
		n++
	}
	return n > 0
}

type answerIn struct {
	Q       int             `json:"q"`
	Given   json.RawMessage `json:"given"`
	Correct bool            `json:"correct"`
	Points  *float64        `json:"points"`
	Ms      *float64        `json:"ms"`
}

func (r *Room) answer(p *Player, in answerIn) (*Answer, string) {
	now := nowMs()
	switch {
	case r.Phase != "question" || in.Q != r.Q:
		return nil, "not_open"
	case p.JoinedQ > r.Q:
		return nil, "late_join"
	case p.Answers[r.Q] != nil:
		return nil, "already_answered"
	case now < r.QStart-500:
		return nil, "not_open"
	case now > r.QDeadline+graceMs:
		return nil, "too_late"
	}
	m := r.meta[r.Q]
	serverMs := int(now - r.QStart)
	ms := serverMs
	// Trust the client's clock-corrected ms unless it claims more than the
	// network could have shaved off.
	if in.Ms != nil && *in.Ms >= 0 && int(*in.Ms) <= serverMs+300 {
		ms = int(*in.Ms)
	}
	ms = max(0, min(ms, m.LimitMs))
	if len(in.Given) > 2048 {
		in.Given = nil
	}
	correct := verifyCorrect(m, in.Given, in.Correct)
	base := basePoints(m.Format, correct, in.Points, ms, m.LimitMs, !r.Kids)
	if correct {
		p.Streak++
		p.Correct++
		p.BestStreak = max(p.BestStreak, p.Streak)
	} else {
		p.Streak = 0
	}
	pts := withStreak(base, p.Streak)
	if !correct {
		pts = base
	}
	a := &Answer{Given: in.Given, Correct: correct, Points: pts, Ms: ms}
	p.Answers[r.Q] = a
	p.Score += pts
	p.LastSeen = now
	r.changed()
	if r.allAnswered(now) {
		r.reveal()
	}
	return a, ""
}

func (r *Room) transferHost(now int64, preferOnline bool) {
	var best *Player
	for _, p := range r.Players {
		if p.Gone || p.ID == r.HostID || (preferOnline && !p.online(now)) {
			continue
		}
		if best == nil || p.Order < best.Order {
			best = p
		}
	}
	if best != nil {
		r.HostID = best.ID
		r.changed()
	}
}

func (r *Room) remove(p *Player, kicked bool) {
	p.Gone = true
	p.Kicked = p.Kicked || kicked
	if p.ID == r.HostID {
		now := nowMs()
		r.transferHost(now, true)
		if r.HostID == p.ID {
			r.transferHost(now, false)
		}
	}
	r.changed()
}

func (r *Room) again(spec json.RawMessage, title string, qs []json.RawMessage) {
	keep := r.Players[:0]
	for _, p := range r.Players {
		if p.Gone {
			continue
		}
		p.Score, p.Correct, p.Streak, p.BestStreak, p.JoinedQ = 0, 0, 0, 0, 0
		p.Answers = map[int]*Answer{}
		keep = append(keep, p)
	}
	r.Players = keep
	r.Spec, r.Title, r.Questions = spec, title, qs
	r.buildMeta()
	r.Phase, r.Q, r.QStart, r.QDeadline, r.RevealAt = "lobby", -1, 0, 0, 0
	r.Game++
	r.changed()
}

// tick runs the clock-driven transitions. Returns false when the room expired.
func (r *Room) tick(now int64) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	if now-r.Touched > cfg.RoomIdle.Milliseconds() {
		r.dead = true
		r.changed()
		return false
	}
	touched := r.Touched // clock-driven changes aren't activity
	defer func() { r.Touched = touched }()
	if r.Public && r.Phase == "lobby" {
		anyOnline := false
		for _, p := range r.Players {
			anyOnline = anyOnline || p.online(now)
		}
		if anyOnline {
			r.EmptyAt = 0
		} else if r.EmptyAt == 0 {
			r.EmptyAt = now
		} else if now-r.EmptyAt > abandonedMs {
			r.dead = true
			r.changed()
			return false
		}
		if r.StartAt > 0 && now >= r.StartAt && len(r.active()) > 0 {
			r.start()
		}
	}
	switch r.Phase {
	case "question":
		if now > r.QDeadline+graceMs {
			r.reveal()
		} else if now >= r.QStart && r.allAnswered(now) {
			r.reveal()
		}
	case "reveal":
		if r.Auto && r.RevealAt > 0 && now >= r.RevealAt {
			r.advance()
		}
	}
	if h := r.player(r.HostID); h == nil || !h.online(now) {
		r.transferHost(now, true)
	}
	return true
}

var shutdownCh = make(chan struct{})
var shutdownOnce sync.Once

func closeStreams() { shutdownOnce.Do(func() { close(shutdownCh) }) }

func roomLoop() {
	t := time.NewTicker(250 * time.Millisecond)
	n := 0
	for range t.C {
		tickRooms()
		n++
		if n%8 == 0 {
			flushRooms(false)
		}
	}
}

func tickRooms() {
	now := nowMs()
	roomsMu.RLock()
	list := make([]*Room, 0, len(rooms))
	for _, r := range rooms {
		list = append(list, r)
	}
	roomsMu.RUnlock()
	for _, r := range list {
		if !r.tick(now) {
			roomsMu.Lock()
			delete(rooms, r.Code)
			roomsMu.Unlock()
			db.Exec(`DELETE FROM rooms WHERE code = ?`, r.Code)
			log.Printf("room %s expired", r.Code)
		}
	}
}

func flushRooms(all bool) {
	roomsMu.RLock()
	list := make([]*Room, 0, len(rooms))
	for _, r := range rooms {
		list = append(list, r)
	}
	roomsMu.RUnlock()
	for _, r := range list {
		r.mu.Lock()
		if !r.dirty && !all {
			r.mu.Unlock()
			continue
		}
		data, err := json.Marshal(r)
		touched := r.Touched
		r.dirty = false
		r.mu.Unlock()
		if err != nil {
			log.Printf("room %s marshal: %v", r.Code, err)
			continue
		}
		if _, err := db.Exec(`INSERT INTO rooms(code, data, touched) VALUES(?,?,?)
			ON CONFLICT(code) DO UPDATE SET data = excluded.data, touched = excluded.touched`, r.Code, data, touched); err != nil {
			log.Printf("room %s save: %v", r.Code, err)
		}
	}
}

func loadRooms() {
	rows, err := db.Query(`SELECT data FROM rooms WHERE touched >= ?`, nowFn().Add(-cfg.RoomIdle).UnixMilli())
	if err != nil {
		log.Printf("load rooms: %v", err)
		return
	}
	defer rows.Close()
	now := nowMs()
	n := 0
	for rows.Next() {
		var data []byte
		if rows.Scan(&data) != nil {
			continue
		}
		r := &Room{}
		if json.Unmarshal(data, r) != nil || r.Code == "" {
			continue
		}
		r.buildMeta()
		r.subs = map[*sub]struct{}{}
		for _, p := range r.Players {
			p.LastSeen = now // give everyone time to reconnect before host handover
			if p.Answers == nil {
				p.Answers = map[int]*Answer{}
			}
		}
		rooms[r.Code] = r
		n++
	}
	if n > 0 {
		log.Printf("restored %d rooms", n)
	}
}

/* ------------------------------------------------------------ public view */

type pubLast struct {
	Correct bool `json:"correct"`
	Points  int  `json:"points"`
	Ms      int  `json:"ms"`
}

type pubPlayer struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Score    int      `json:"score"`
	Correct  int      `json:"correct"`
	Streak   int      `json:"streak"`
	Best     int      `json:"best"`
	Online   bool     `json:"online"`
	Host     bool     `json:"host"`
	Answered bool     `json:"answered"`
	Late     bool     `json:"late,omitempty"`
	Signed   bool     `json:"signed,omitempty"`
	Last     *pubLast `json:"last,omitempty"`
}

type pubYou struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	Host    bool     `json:"host"`
	JoinedQ int      `json:"joinedQ"`
	Kicked  bool     `json:"kicked,omitempty"`
	Gone    bool     `json:"gone,omitempty"`
	Last    *pubLast `json:"last,omitempty"`
	Rank    int      `json:"rank"`
}

type pubState struct {
	Code      string          `json:"code"`
	Ver       int64           `json:"ver"`
	Now       int64           `json:"now"`
	Phase     string          `json:"phase"`
	Q         int             `json:"q"`
	Total     int             `json:"total"`
	Game      int             `json:"game"`
	QStart    int64           `json:"qStart,omitempty"`
	QDeadline int64           `json:"qDeadline,omitempty"`
	LimitMs   int             `json:"limitMs,omitempty"`
	RevealAt  int64           `json:"revealAt,omitempty"`
	Auto      bool            `json:"auto"`
	AnswerSec int             `json:"answerSec"`
	GapSec    int             `json:"gapSec"` // 0 = host taps Next
	Title     string          `json:"title,omitempty"`
	Kids      bool            `json:"kids"`
	Diff      int             `json:"difficulty"`
	Public    bool            `json:"public"`
	StartAt   int64           `json:"startAt,omitempty"`
	LateJoin  bool            `json:"lateJoin"`
	Spec      json.RawMessage `json:"spec,omitempty"`
	HostID    string          `json:"hostId"`
	Answered  int             `json:"answered"`
	Players   []pubPlayer     `json:"players"`
	You       *pubYou         `json:"you,omitempty"`
	Expired   bool            `json:"expired,omitempty"`
}

// stateFor must be called with r.mu held.
func (r *Room) stateFor(viewer *Player) pubState {
	now := nowMs()
	s := pubState{Code: r.Code, Ver: r.Ver, Now: now, Phase: r.Phase, Q: r.Q, Total: len(r.Questions), Game: r.Game,
		Auto: r.Auto, AnswerSec: r.AnswerMs / 1000, Title: r.Title, Kids: r.Kids, Diff: r.Diff, Public: r.Public, StartAt: r.StartAt, LateJoin: !r.NoLate, HostID: r.HostID, Expired: r.dead, Spec: r.Spec}
	if r.Auto {
		s.GapSec = r.RevealMs / 1000
	}
	if r.Phase == "question" || r.Phase == "reveal" {
		s.QStart, s.QDeadline, s.LimitMs = r.QStart, r.QDeadline, r.meta[r.Q].LimitMs
	}
	if r.Phase == "reveal" && r.Auto {
		s.RevealAt = r.RevealAt
	}
	showLast := r.Phase == "reveal" || r.Phase == "final"
	act := r.active()
	if showLast {
		sort.SliceStable(act, func(i, j int) bool {
			if act[i].Score != act[j].Score {
				return act[i].Score > act[j].Score
			}
			return act[i].Order < act[j].Order
		})
	}
	for _, p := range act {
		pp := pubPlayer{ID: p.ID, Name: p.Name, Score: p.Score, Correct: p.Correct, Streak: p.Streak, Best: p.BestStreak,
			Online: p.online(now), Host: p.ID == r.HostID, Late: r.Q >= 0 && p.JoinedQ > r.Q, Signed: p.UID != ""}
		if r.Q >= 0 {
			if a := p.Answers[r.Q]; a != nil {
				pp.Answered = true
				s.Answered++
				if showLast {
					pp.Last = &pubLast{a.Correct, a.Points, a.Ms}
				}
			}
		}
		s.Players = append(s.Players, pp)
	}
	if viewer != nil {
		y := &pubYou{ID: viewer.ID, Name: viewer.Name, Host: viewer.ID == r.HostID, JoinedQ: viewer.JoinedQ,
			Kicked: viewer.Kicked, Gone: viewer.Gone}
		if r.Q >= 0 {
			if a := viewer.Answers[r.Q]; a != nil {
				y.Last = &pubLast{a.Correct, a.Points, a.Ms}
			}
		}
		y.Rank = 1
		for _, p := range act {
			if p.Score > viewer.Score {
				y.Rank++
			}
		}
		s.You = y
	}
	return s
}
