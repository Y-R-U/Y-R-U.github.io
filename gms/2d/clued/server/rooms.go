package main

import (
	"encoding/json"
	"log"
	"math"
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
	kidsStageMs    = 4000           // kids rooms: progressive stages auto-advance
	kidsAnswer     = 20000          // kids rooms default to a gentle timer and flat 100 per correct
	roundIntroMs   = 5000           // extra lead-in on the first question of each round (the round card)
	maxTScale      = 6
	maxScaledMs    = 180000
	readyCapMs     = 5000 // longest the opening waits for clients still loading the question's media
	readyGoMs      = 800  // once the last client is ready: a short "go" so every countdown ends together
	holdDecideMs   = 700  // the hold is decided this long before the planned opening, so clients learn of it in time
	maxTransitMs   = 1500 // a client's ms may undercut the server's receive time by at most this (network transit)
)

type Answer struct {
	Given   json.RawMessage `json:"g,omitempty"`
	Correct bool            `json:"c"`
	Points  int             `json:"p"`
	Ms      int             `json:"ms"`
	Stage   int             `json:"st,omitempty"`
	Speed   int             `json:"sp,omitempty"` // base points (speed, or the format's own) before stage and streak
	Bonus   int             `json:"bo,omitempty"` // streak bonus points included in Points
	ClipMul float64         `json:"cm,omitempty"` // listen: clip-length and artwork multipliers, replays counted
	ArtMul  float64         `json:"am,omitempty"`
	Replays int             `json:"rp,omitempty"`
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
	Ready      int             `json:"ready,omitempty"`    // highest question index + 1 this client has loaded
	ReadyCap   bool            `json:"readyCap,omitempty"` // the client reports readiness, so openings may wait for it
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
	Stage     int               `json:"stage"`
	StageAt   int64             `json:"stageAt"`
	Votes     map[string]bool   `json:"votes,omitempty"`
	Locked    bool              `json:"locked,omitempty"`
	Kids      bool              `json:"kids,omitempty"`
	Diff      int               `json:"difficulty,omitempty"`
	Public    bool              `json:"public,omitempty"`
	StartAt   int64             `json:"startAt,omitempty"` // public auto-start, 0 = host starts
	NoLate    bool              `json:"noLate,omitempty"`
	EmptyAt   int64             `json:"emptyAt,omitempty"`  // when the last player went offline
	LeadAt    int64             `json:"leadAt,omitempty"`   // the planned opening (qStart before any ready hold)
	Hold      bool              `json:"hold,omitempty"`     // opening held while clients load media
	NoStreak  bool              `json:"noStreak,omitempty"` // the streak counter shows but adds no points
	meta      []qMeta
	rounds    roundInfo
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

// roundInfo groups the question list into rounds by question.round (consecutive runs).
type roundInfo struct {
	of    []int // question → round ordinal
	sizes []int
	spec  []int // round ordinal → spec round index
}

func (ri roundInfo) multi() bool { return len(ri.sizes) > 1 }

// first reports whether question i opens a round (and the game has several).
func (ri roundInfo) first(i int) bool {
	return ri.multi() && i >= 0 && i < len(ri.of) && (i == 0 || ri.of[i] != ri.of[i-1])
}

func groupRounds(meta []qMeta) roundInfo {
	ri := roundInfo{of: make([]int, len(meta))}
	for i, m := range meta {
		if i == 0 || m.Round != meta[i-1].Round {
			ri.sizes = append(ri.sizes, 0)
			ri.spec = append(ri.spec, m.Round)
		}
		ri.of[i] = len(ri.sizes) - 1
		ri.sizes[len(ri.sizes)-1]++
	}
	return ri
}

func (r *Room) buildMeta() {
	r.Kids, r.Diff = specInfo(r.Spec)
	r.meta = make([]qMeta, len(r.Questions))
	for i, q := range r.Questions {
		r.meta[i] = parseMeta(q)
		r.meta[i].LimitMs = r.limitFor(r.meta[i])
		if n := r.meta[i].Stages; n >= 2 {
			if r.Kids {
				r.meta[i].LimitMs = max(r.meta[i].LimitMs, progressiveInitial, r.AnswerMs*3/2)
			} else {
				r.meta[i].LimitMs, r.meta[i].StepMs = autoStages(r.meta[i].Format, n, r.AnswerMs)
			}
		}
	}
	r.rounds = groupRounds(r.meta)
}

// The host's answer time applies to every question, stretched by the format's
// timeScale (typing, boards); long formats (connections, blitz…) never get less
// than their own minimum, or they'd be unplayable.
func (r *Room) limitFor(m qMeta) int {
	ms := r.AnswerMs
	if ms <= 0 {
		ms = defaultAnswer
	}
	if m.TScale > 1 {
		ms = max(ms, min(int(math.Round(float64(ms)*m.TScale)), maxScaledMs))
	}
	if long, ok := longFormats[m.Format]; ok && long > ms {
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
		if r.Phase == "question" && now < r.QStart {
			joinQ = r.Q // still counting down (or on the round card): play this one
		}
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
	r.Stage, r.Votes, r.Locked = 0, nil, false
	r.QStart = now + leadInMs
	if r.rounds.first(r.Q) {
		r.QStart += roundIntroMs
	}
	r.StageAt = r.QStart
	r.LeadAt, r.Hold = r.QStart, false
	r.QDeadline = r.QStart + int64(r.meta[r.Q].LimitMs)
	r.RevealAt = 0
	r.changed()
}

// notReady counts online players who will play this question, report readiness, and haven't loaded it yet.
func (r *Room) notReady(now int64) int {
	n := 0
	for _, p := range r.Players {
		if p.ReadyCap && p.JoinedQ <= r.Q && p.online(now) && p.Ready < r.Q+1 {
			n++
		}
	}
	return n
}

func (r *Room) openAt(t int64) {
	r.QStart, r.StageAt = t, t
	r.QDeadline = t + int64(r.meta[r.Q].LimitMs)
}

// checkHold: media must not eat the answer window. When the planned opening arrives and a client is still loading,
// the opening waits (up to readyCapMs); it opens readyGoMs after the last one is ready, or at the cap.
func (r *Room) checkHold(now int64) {
	if r.Phase != "question" {
		return
	}
	if !r.Hold {
		if r.QStart == r.LeadAt && now >= r.QStart-holdDecideMs && r.notReady(now) > 0 {
			r.Hold = true
			r.openAt(r.LeadAt + readyCapMs)
			r.changed()
		}
		return
	}
	if now >= r.QStart {
		r.Hold = false
		r.changed()
	} else if r.notReady(now) == 0 {
		r.Hold = false
		r.openAt(max(r.LeadAt, min(r.QStart, now+readyGoMs)))
		r.changed()
	}
}

func (r *Room) ready(p *Player, q int) {
	p.ReadyCap = true
	p.LastSeen = nowMs()
	if q >= 0 && q < len(r.Questions) && q+1 > p.Ready {
		p.Ready = q + 1
	}
	r.checkHold(nowMs())
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
	Replays *int            `json:"replays"` // listen: replays used (client-reported, clamped to the question's allowance)
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
	ms := answerMs(int(now-r.QStart), in.Ms, m.LimitMs)
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
	stage := r.Stage
	speed := base
	var clipMul, artMul float64
	reps := 0
	if m.Format == "listen" && m.Stages < 2 && correct && !r.Kids {
		clipMul, artMul, reps = listenFactors(m, in.Replays)
		base = int(math.Round(float64(base) * clipMul * artMul * math.Pow(replayMul, float64(reps))))
	}
	base = int(math.Round(float64(base) * stageMultiplier(stage, m.Stages)))
	pts := base
	if correct && !r.NoStreak {
		pts = withStreak(base, p.Streak)
	}
	a := &Answer{Given: in.Given, Correct: correct, Points: pts, Ms: ms, Stage: stage, Speed: speed, Bonus: pts - base,
		ClipMul: clipMul, ArtMul: artMul, Replays: reps}
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
		p.Ready = 0
		p.Answers = map[int]*Answer{}
		keep = append(keep, p)
	}
	r.Players = keep
	r.Spec, r.Title, r.Questions = spec, title, qs
	r.buildMeta()
	r.Phase, r.Q, r.QStart, r.QDeadline, r.RevealAt = "lobby", -1, 0, 0, 0
	r.LeadAt, r.Hold = 0, false
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
		r.checkHold(now)
		// progressive stages auto-advance for everyone; an answer no longer freezes them
		if m := r.meta[r.Q]; m.Stages >= 2 && r.Stage < m.Stages-1 && now >= r.QStart {
			due := 0
			if r.Kids {
				if now-r.StageAt >= kidsStageMs {
					due = r.Stage + 1
				}
			} else {
				due = dueStage(now-r.QStart, m.Stages, m.StepMs)
			}
			if due > r.Stage {
				r.setStage(due)
			} else if len(r.Votes) > 0 {
				r.checkVotes(now) // votes from older clients
			}
		}
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
	Speed   int  `json:"speed,omitempty"` // base points before the stage multiplier and streak bonus
	Bonus   int  `json:"bonus,omitempty"` // streak bonus points
	Stage   int  `json:"stage,omitempty"`
	Stages  int  `json:"stages,omitempty"`
	Streak  int  `json:"streak,omitempty"` // streak after this answer
	// listen: the clip-length/artwork multipliers and replays applied (absent elsewhere)
	ClipMul float64 `json:"clipMul,omitempty"`
	ArtMul  float64 `json:"artMul,omitempty"`
	Clip    float64 `json:"clip,omitempty"`
	Replays int     `json:"replays,omitempty"`
}

func (r *Room) lastOf(a *Answer, p *Player) *pubLast {
	l := &pubLast{Correct: a.Correct, Points: a.Points, Ms: a.Ms, Speed: a.Speed, Bonus: a.Bonus, Stage: a.Stage}
	if r.Q >= 0 && r.Q < len(r.meta) && r.meta[r.Q].Stages >= 2 {
		l.Stages = r.meta[r.Q].Stages
	}
	if a.Correct {
		l.Streak = p.Streak
	}
	if a.ClipMul > 0 {
		l.ClipMul, l.ArtMul, l.Replays = a.ClipMul, a.ArtMul, a.Replays
		if r.Q >= 0 && r.Q < len(r.meta) {
			l.Clip = r.meta[r.Q].ClipLen
		}
	}
	return l
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
	Rounds   []int    `json:"rs,omitempty"` // points per round (multi-round games)
	RBonus   []int    `json:"rb,omitempty"` // streak bonus points per round
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
	Voted   bool     `json:"voted,omitempty"`
	Stage   int      `json:"stage,omitempty"` // stage you answered at
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
	Stage     int             `json:"stage"`
	Stages    int             `json:"stages,omitempty"`
	VoteCount int             `json:"votes"`
	Needed    int             `json:"needed"`
	Locked    bool            `json:"locked"`
	// multi-round games only: the current question's round ordinal, questions per round,
	// and each round's index in spec.rounds (a round can be dropped when its media failed)
	Round      int   `json:"round,omitempty"`
	RoundSizes []int `json:"roundSizes,omitempty"`
	RoundSpec  []int `json:"roundSpec,omitempty"`
	// streakBonus: the streak adds points (off = the counter is just for show); hold: the opening waits for media
	StreakBonus bool `json:"streakBonus"`
	Hold        bool `json:"hold,omitempty"`
}

// stateFor must be called with r.mu held.
func (r *Room) stateFor(viewer *Player) pubState {
	now := nowMs()
	s := pubState{Code: r.Code, Ver: r.Ver, Now: now, Phase: r.Phase, Q: r.Q, Total: len(r.Questions), Game: r.Game, StreakBonus: !r.NoStreak,
		Auto: r.Auto, AnswerSec: r.AnswerMs / 1000, Title: r.Title, Kids: r.Kids, Diff: r.Diff, Public: r.Public, StartAt: r.StartAt, LateJoin: !r.NoLate, HostID: r.HostID, Expired: r.dead, Spec: r.Spec}
	if r.Auto {
		s.GapSec = r.RevealMs / 1000
	}
	multi := r.rounds.multi()
	if multi {
		s.RoundSizes, s.RoundSpec = r.rounds.sizes, r.rounds.spec
		if r.Q >= 0 && r.Q < len(r.rounds.of) {
			s.Round = r.rounds.of[r.Q]
		}
	}
	if r.Phase == "question" || r.Phase == "reveal" {
		s.QStart, s.QDeadline, s.LimitMs = r.QStart, r.QDeadline, r.meta[r.Q].LimitMs
		s.Hold = r.Phase == "question" && r.Hold
		if n := r.meta[r.Q].Stages; n >= 2 {
			s.Stage, s.Stages, s.Locked = r.Stage, n, r.Locked
			s.LimitMs = int(r.QDeadline - r.QStart) // the ring re-targets after extensions
			s.VoteCount, s.Needed = r.voteNeed(now)
		}
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
		if multi {
			pp.Rounds = make([]int, len(r.rounds.sizes))
			pp.RBonus = make([]int, len(r.rounds.sizes))
			for qi, a := range p.Answers {
				if qi >= 0 && qi < len(r.rounds.of) {
					pp.Rounds[r.rounds.of[qi]] += a.Points
					pp.RBonus[r.rounds.of[qi]] += a.Bonus
				}
			}
		}
		if r.Q >= 0 {
			if a := p.Answers[r.Q]; a != nil {
				pp.Answered = true
				s.Answered++
				if showLast {
					pp.Last = r.lastOf(a, p)
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
				y.Last = r.lastOf(a, viewer)
				y.Stage = a.Stage
			}
		}
		y.Voted = r.Votes[viewer.ID]
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

/* ------------------------------------------------------- vote to reveal */

// voteNeed counts connected players who can still answer this question, and their votes.
func (r *Room) voteNeed(now int64) (votes, needed int) {
	for _, p := range r.Players {
		if p.JoinedQ > r.Q || !p.online(now) || p.Answers[r.Q] != nil {
			continue
		}
		needed++
		if r.Votes[p.ID] {
			votes++
		}
	}
	return
}

// setStage advances. Kids rooms also extend the deadline: max(current, now + max(5 s, answer/2)), never beyond
// 90 s from the question start; other rooms keep the fixed deadline (the stage schedule fits inside it).
func (r *Room) setStage(s int) {
	now := nowMs()
	r.Stage, r.StageAt, r.Votes = s, now, nil
	if r.Kids {
		ext := now + int64(max(stageExtendMin, r.AnswerMs/2))
		r.QDeadline = min(max(r.QDeadline, ext), r.QStart+progressiveCap)
	}
	r.changed()
}

func (r *Room) checkVotes(now int64) {
	if v, n := r.voteNeed(now); n > 0 && v >= n {
		r.setStage(r.Stage + 1)
	}
}

func (r *Room) vote(p *Player, q int) string {
	now := nowMs()
	switch {
	case r.Phase != "question" || q != r.Q:
		return "not_open"
	case r.meta[r.Q].Stages < 2:
		return "not_progressive"
	case now < r.QStart:
		return "not_open"
	case r.Locked:
		return "locked"
	case r.Stage >= r.meta[r.Q].Stages-1:
		return "last_stage"
	case p.JoinedQ > r.Q || p.Answers[r.Q] != nil:
		return "cannot_vote"
	}
	if r.Votes == nil {
		r.Votes = map[string]bool{}
	}
	r.Votes[p.ID] = true
	r.changed()
	r.checkVotes(now)
	return ""
}
