package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

type roomIn struct {
	HostName  string            `json:"hostName"`
	Name      string            `json:"name"`
	Title     string            `json:"title"`
	Spec      json.RawMessage   `json:"spec"`
	Questions []json.RawMessage `json:"questions"`
	Auto      *bool             `json:"auto"`
	AnswerSec *int              `json:"answerSec"`
	GapSec    *int              `json:"gapSec"`
	Public    *bool             `json:"public"`
	StartIn   *int              `json:"startIn"` // public auto-start seconds: 60/120/300, 0 = host starts
	LateJoin  *bool             `json:"lateJoin"`
	Streak    *bool             `json:"streak"` // streak bonus adds points (false = just for show)
}

// streakFromSpec reads spec.streak ("off"/false = just for show) when the body doesn't say.
func streakFromSpec(spec json.RawMessage) *bool {
	var s struct {
		Streak any `json:"streak"`
	}
	if json.Unmarshal(spec, &s) != nil || s.Streak == nil {
		return nil
	}
	on := s.Streak != false && s.Streak != "off"
	return &on
}

func validQuestions(w http.ResponseWriter, in *roomIn) bool {
	if len(in.Questions) == 0 || len(in.Questions) > maxQuestions {
		writeErr(w, 400, "bad_questions", fmt.Sprintf("need 1–%d questions", maxQuestions))
		return false
	}
	size := len(in.Spec)
	for _, q := range in.Questions {
		size += len(q)
		if len(q) == 0 || q[0] != '{' {
			writeErr(w, 400, "bad_questions", "each question must be an object")
			return false
		}
	}
	if size > maxQuestionsSz {
		writeErr(w, 413, "too_large", "question set is over 512 KB")
		return false
	}
	if len(in.Spec) == 0 {
		in.Spec = json.RawMessage(`{}`)
	}
	in.Title = clip(in.Title, 60)
	if isProfane(in.Title) {
		in.Title = "Clued game"
	}
	return true
}

func clip(s string, n int) string {
	s = strings.TrimSpace(strings.Map(func(r rune) rune {
		if r < 32 || r == '<' || r == '>' {
			return -1
		}
		return r
	}, s))
	if r := []rune(s); len(r) > n {
		return string(r[:n])
	}
	return s
}

func nameErr(w http.ResponseWriter, err error) {
	if err == errEmptyName {
		writeErr(w, 400, "name_required", "type a name to join")
	} else {
		writeErr(w, 400, "bad_name", "please pick a different name")
	}
}

// identity returns the verified Firebase identity, or a zero value. A bad token
// never blocks anything by itself; protection levels decide what needs one.
func identity(r *http.Request) fbIdentity {
	tok, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !ok || tok == "" {
		return fbIdentity{}
	}
	id, err := verifyFirebaseToken(tok)
	if err != nil {
		return fbIdentity{}
	}
	return id
}

func bearer(r *http.Request) (uid, name string) {
	id := identity(r)
	return id.UID, id.Name
}

func handleCreateRoom(w http.ResponseWriter, r *http.Request) {
	if !allow(r, "room") {
		rateLimited(w)
		return
	}
	var in roomIn
	if !readJSON(w, r, bigBody, &in) || !validQuestions(w, &in) {
		return
	}
	id := identity(r)
	uid := id.UID
	raw := in.HostName
	if raw == "" {
		raw = id.Name
	}
	name, err := cleanName(raw)
	if err != nil {
		nameErr(w, err)
		return
	}
	if !gateCreate(w, id) {
		return
	}
	admin := isAdmin(id)
	roomsMu.RLock()
	n := len(rooms)
	roomsMu.RUnlock()
	public := in.Public != nil && *in.Public
	switch {
	case n >= cfg.MaxRooms && !admin:
		refuse(w, "rooms_total", 503, "busy")
		return
	case public && publicCount() >= cfg.MaxPublic && !admin:
		refuse(w, "public_rooms", 409, "public_full")
		return
	case !public && privateCount() >= cfg.MaxPrivate && !admin:
		refuse(w, "private_rooms", 503, "busy")
		return
	}
	noteRoomCreated(public, uid != "", clientIP(r))
	room := newRoom(in.Spec, in.Title, in.Questions)
	room.mu.Lock()
	defer room.mu.Unlock()
	if room.Kids {
		room.AnswerMs = kidsAnswer
		room.buildMeta()
	}
	if in.Auto != nil {
		room.Auto = *in.Auto
	}
	room.setTiming(in.AnswerSec, in.GapSec)
	room.Public = public
	if public {
		room.setStart(in.StartIn)
	}
	if in.LateJoin != nil {
		room.NoLate = !*in.LateJoin
	}
	if in.Streak == nil {
		in.Streak = streakFromSpec(in.Spec)
	}
	if in.Streak != nil {
		room.NoStreak = !*in.Streak
	}
	p, _ := room.addPlayer(name, uid)
	room.Owner = p.ID
	writeJSON(w, 200, map[string]any{"code": room.Code, "hostKey": p.Key, "playerKey": p.Key, "playerId": p.ID,
		"room": room.stateFor(p)})
}

func handlePeek(w http.ResponseWriter, r *http.Request) {
	room := getRoom(normCode(r.PathValue("code")))
	if room == nil {
		writeErr(w, 404, "room_not_found", "no room with that code")
		return
	}
	room.mu.Lock()
	defer room.mu.Unlock()
	host := ""
	if h := room.player(room.HostID); h != nil {
		host = h.Name
	}
	writeJSON(w, 200, map[string]any{"code": room.Code, "phase": room.Phase, "players": len(room.active()),
		"host": host, "title": room.Title, "total": len(room.Questions), "q": room.Q, "rounds": max(1, len(room.rounds.sizes)),
		"ended": room.Ended, "public": room.Public, "created": room.Created})
}

func handleJoin(w http.ResponseWriter, r *http.Request) {
	if !allow(r, "join") {
		rateLimited(w)
		return
	}
	room := getRoom(normCode(r.PathValue("code")))
	if room == nil {
		writeErr(w, 404, "room_not_found", "no room with that code")
		return
	}
	var in struct {
		Name string `json:"name"`
		Key  string `json:"key"`
	}
	if !readJSON(w, r, smallBody, &in) {
		return
	}
	id := identity(r)
	uid, fbName := id.UID, id.Name
	room.mu.Lock()
	defer room.mu.Unlock()
	if p := room.byKey(in.Key); p != nil && !p.Kicked {
		p.Gone = false
		p.LastSeen = nowMs()
		room.changed()
		writeJSON(w, 200, map[string]any{"playerId": p.ID, "playerKey": p.Key, "room": room.stateFor(p), "rejoined": true})
		return
	}
	if room.Ended {
		writeErr(w, 410, "room_ended", "the host ended this room")
		return
	}
	raw := in.Name
	if raw == "" {
		raw = fbName
	}
	name, err := cleanName(raw)
	if err != nil {
		nameErr(w, err)
		return
	}
	if room.NoLate && (room.Phase == "question" || room.Phase == "reveal") {
		writeErr(w, 409, "started", "this game has already started")
		return
	}
	if !gateJoin(w, id) {
		return
	}
	p, code := room.addPlayer(name, uid)
	if p == nil {
		room.mu.Unlock()
		refuse(w, "players_per_room", 409, code)
		room.mu.Lock()
		return
	}
	noteJoin(clientIP(r))
	writeJSON(w, 200, map[string]any{"playerId": p.ID, "playerKey": p.Key, "room": room.stateFor(p)})
}

// withPlayer resolves code + key and runs fn under the room lock.
func withPlayer(w http.ResponseWriter, code, key string, fn func(*Room, *Player)) {
	room := getRoom(normCode(code))
	if room == nil {
		writeErr(w, 404, "room_not_found", "this room has ended")
		return
	}
	room.mu.Lock()
	defer room.mu.Unlock()
	p := room.byKey(key)
	switch {
	case p == nil:
		writeErr(w, 403, "bad_key", "not a player in this room")
	case p.Kicked:
		writeErr(w, 410, "kicked", "the host removed you from this room")
	default:
		p.LastSeen = nowMs()
		fn(room, p)
	}
}

func handleState(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	since, hasSince := int64(-1), q.Has("since")
	if hasSince {
		since, _ = strconv.ParseInt(q.Get("since"), 10, 64)
	}
	room := getRoom(normCode(r.PathValue("code")))
	if room == nil {
		writeErr(w, 404, "room_not_found", "this room has ended")
		return
	}
	room.mu.Lock()
	p := room.byKey(q.Get("k"))
	if p == nil {
		room.mu.Unlock()
		writeErr(w, 403, "bad_key", "not a player in this room")
		return
	}
	wasOnline := p.online(nowMs())
	p.LastSeen = nowMs()
	if !wasOnline && !p.Gone {
		room.changed()
	}
	if !hasSince || room.Ver > since || p.Kicked {
		st := room.stateFor(p)
		room.mu.Unlock()
		writeJSON(w, 200, st)
		return
	}
	s := &sub{ch: make(chan struct{}, 1), pid: p.ID}
	room.subs[s] = struct{}{}
	room.mu.Unlock()
	http.NewResponseController(w).SetWriteDeadline(time.Now().Add(30 * time.Second))
	select {
	case <-s.ch:
	case <-time.After(20 * time.Second):
	case <-r.Context().Done():
	case <-shutdownCh:
	}
	room.mu.Lock()
	delete(room.subs, s)
	p.LastSeen = nowMs()
	st := room.stateFor(p)
	room.mu.Unlock()
	writeJSON(w, 200, st)
}

var sse struct {
	sync.Mutex
	total int
	perIP map[string]int
}

const maxSSEPerIP = 120

func sseAcquire(ip string) bool {
	sse.Lock()
	defer sse.Unlock()
	if sse.perIP == nil {
		sse.perIP = map[string]int{}
	}
	if sse.total >= cfg.MaxSSE || sse.perIP[ip] >= maxSSEPerIP {
		return false
	}
	sse.total++
	sse.perIP[ip]++
	return true
}

func sseRelease(ip string) {
	sse.Lock()
	defer sse.Unlock()
	sse.total--
	if sse.perIP[ip]--; sse.perIP[ip] <= 0 {
		delete(sse.perIP, ip)
	}
}

func handleEvents(w http.ResponseWriter, r *http.Request) {
	room := getRoom(normCode(r.PathValue("code")))
	if room == nil {
		writeErr(w, 404, "room_not_found", "this room has ended")
		return
	}
	key := r.URL.Query().Get("k")
	room.mu.Lock()
	p := room.byKey(key)
	if p == nil || p.Kicked {
		room.mu.Unlock()
		if p == nil {
			writeErr(w, 403, "bad_key", "not a player in this room")
		} else {
			writeErr(w, 410, "kicked", "the host removed you from this room")
		}
		return
	}
	room.mu.Unlock()
	ip := clientIP(r)
	if !sseAcquire(ip) {
		refuse(w, "sse", 503, "busy")
		return
	}
	defer sseRelease(ip)
	rc := http.NewResponseController(w)
	rc.SetWriteDeadline(time.Time{})
	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("X-Accel-Buffering", "no")
	w.WriteHeader(200)

	s := &sub{ch: make(chan struct{}, 1), pid: p.ID}
	room.mu.Lock()
	room.subs[s] = struct{}{}
	p.conns++
	p.LastSeen = nowMs()
	room.changed()
	room.mu.Unlock()
	defer func() {
		room.mu.Lock()
		delete(room.subs, s)
		p.conns--
		p.LastSeen = nowMs()
		room.changed()
		room.mu.Unlock()
	}()

	send := func() bool {
		room.mu.Lock()
		dead, kicked := room.dead, p.Kicked
		st := room.stateFor(p)
		room.mu.Unlock()
		b, _ := json.Marshal(st)
		ev := "state"
		if dead {
			ev = "gone"
		} else if kicked {
			ev = "kicked"
		}
		if _, err := fmt.Fprintf(w, "id: %d\nevent: %s\ndata: %s\n\n", st.Ver, ev, b); err != nil {
			return false
		}
		return rc.Flush() == nil && !dead && !kicked
	}
	fmt.Fprint(w, "retry: 2000\n\n")
	if !send() {
		return
	}
	ping := time.NewTicker(15 * time.Second)
	defer ping.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-shutdownCh:
			return
		case <-s.ch:
			if !send() {
				return
			}
		case <-ping.C:
			if _, err := fmt.Fprintf(w, ": ping %d\n\n", nowMs()); err != nil || rc.Flush() != nil {
				return
			}
		}
	}
}

func handleQuestion(w http.ResponseWriter, r *http.Request) {
	i, err := strconv.Atoi(r.PathValue("i"))
	if err != nil {
		writeErr(w, 400, "bad_request", "bad index")
		return
	}
	withPlayer(w, r.PathValue("code"), r.URL.Query().Get("k"), func(room *Room, p *Player) {
		if i < 0 || i >= len(room.Questions) || (i > room.Q+1 && p.ID != room.HostID) {
			writeErr(w, 404, "not_yet", "that question isn't open")
			return
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		q := room.Questions[i]
		if !room.answerShown(i) {
			q = hideAnswer(q, i)
		}
		fmt.Fprintf(w, `{"i":%d,"game":%d,"question":%s}`, i, room.Game, q)
	})
}

// Formats the server verifies itself (verifyCorrect) don't need the answer on the client until the reveal.
var hiddenFormats = map[string]bool{"mc": true, "tf": true}
var answerKeys = []string{"answer", "answerText", "explain", "refs", "wrongNotes"}

func (r *Room) answerShown(i int) bool {
	return i < r.Q || (i == r.Q && r.Phase != "question") || r.Phase == "final"
}

// hideAnswer strips the answer (and the id, refs and explanation, which name it) from a verifiable question.
func hideAnswer(raw json.RawMessage, i int) json.RawMessage {
	var m map[string]json.RawMessage
	if json.Unmarshal(raw, &m) != nil {
		return raw
	}
	var f string
	json.Unmarshal(m["format"], &f)
	if !hiddenFormats[f] {
		return raw
	}
	for _, k := range answerKeys {
		delete(m, k)
	}
	m["id"], _ = json.Marshal(fmt.Sprintf("room:%d", i))
	m["hidden"] = json.RawMessage("true")
	out, err := json.Marshal(m)
	if err != nil {
		return raw
	}
	return out
}

func handleAnswer(w http.ResponseWriter, r *http.Request) {
	if !allow(r, "answer") {
		rateLimited(w)
		return
	}
	var in struct {
		answerIn
		Key string `json:"key"`
	}
	if !readJSON(w, r, smallBody, &in) {
		return
	}
	withPlayer(w, r.PathValue("code"), in.Key, func(room *Room, p *Player) {
		a, code := room.answer(p, in.answerIn)
		if a == nil {
			writeErr(w, 409, code, strings.ReplaceAll(code, "_", " "))
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true, "correct": a.Correct, "points": a.Points, "ms": a.Ms,
			"score": p.Score, "streak": p.Streak, "state": room.stateFor(p)})
	})
}

func handleLeave(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Key       string `json:"key"`
		PlayerKey string `json:"playerKey"`
	}
	if !readJSON(w, r, smallBody, &in) {
		return
	}
	if in.Key == "" {
		in.Key = in.PlayerKey
	}
	withPlayer(w, r.PathValue("code"), in.Key, func(room *Room, p *Player) {
		room.remove(p, false)
		writeJSON(w, 200, map[string]any{"ok": true})
	})
}

func handleHostAction(w http.ResponseWriter, r *http.Request) {
	action := r.PathValue("action")
	limit := int64(smallBody)
	if action == "again" {
		limit = bigBody
	}
	var in struct {
		roomIn
		Key      string `json:"key"`
		HostKey  string `json:"hostKey"`
		PlayerID string `json:"playerId"`
		RevealMs int    `json:"revealMs"`
		Q        *int   `json:"q"` // next: the question the host is looking at (stale taps are ignored)
	}
	if !readJSON(w, r, limit, &in) {
		return
	}
	if in.Key == "" {
		in.Key = in.HostKey
	}
	withPlayer(w, r.PathValue("code"), in.Key, func(room *Room, p *Player) {
		host := p.ID == room.HostID && !p.Gone
		owner := room.Owner != "" && p.ID == room.Owner // the creator can end it after leaving or handing over
		if !host && !(action == "end" && owner) {
			writeErr(w, 403, "not_host", "only the host can do that")
			return
		}
		if room.Ended && action != "end" {
			writeErr(w, 409, "room_ended", "the host ended this room")
			return
		}
		switch action {
		case "start":
			if room.Phase != "lobby" {
				writeErr(w, 409, "already_started", "the game has already started")
				return
			}
			room.start()
		case "next":
			// A "next" is bound to the question on the host's screen. A tap that lands after the gap timer
			// already opened the next question (or a double tap) used to reveal that new question during its
			// lead-in, so everyone got "Time's up" at the start. Now it's a no-op; only an explicit q equal to
			// the open question ends it early (old clients send no q, so they can never end one).
			switch room.Phase {
			case "lobby":
				room.advance()
			case "reveal":
				if in.Q == nil || *in.Q == room.Q {
					room.advance()
				}
			case "question":
				if in.Q != nil && *in.Q == room.Q && nowMs() >= room.QStart {
					room.reveal()
				}
			default:
				writeErr(w, 409, "finished", "the game is over")
				return
			}
		case "end":
			room.endRoom()
			resetPublicCache()
		case "kick":
			t := room.player(in.PlayerID)
			if t == nil || t.Gone || t.ID == p.ID {
				writeErr(w, 404, "no_player", "no such player")
				return
			}
			room.remove(t, true)
		case "host":
			t := room.player(in.PlayerID)
			if t == nil || t.Gone {
				writeErr(w, 404, "no_player", "no such player")
				return
			}
			room.HostID = t.ID
			room.changed()
		case "settings":
			if in.Auto != nil {
				room.Auto = *in.Auto
			}
			if in.RevealMs >= 3000 && in.RevealMs <= 60000 {
				room.RevealMs = in.RevealMs
			}
			if room.Phase == "question" && in.AnswerSec != nil {
				writeErr(w, 409, "in_question", "change the answer time between questions")
				return
			}
			room.setTiming(in.AnswerSec, in.GapSec)
			if in.Public != nil && *in.Public != room.Public {
				if *in.Public {
					room.mu.Unlock()
					full := publicCount() >= cfg.MaxPublic
					room.mu.Lock()
					if full {
						writeErr(w, 409, "public_full", "all public game slots are busy right now")
						return
					}
				}
				room.Public = *in.Public
			}
			room.setStart(in.StartIn)
			if in.LateJoin != nil {
				room.NoLate = !*in.LateJoin
			}
			if in.Streak != nil {
				room.NoStreak = !*in.Streak
			}
			room.changed()
		case "again":
			if !validQuestions(w, &in.roomIn) {
				return
			}
			room.again(in.Spec, in.Title, in.Questions)
		default:
			writeErr(w, 404, "not_found", "no such action")
			return
		}
		writeJSON(w, 200, room.stateFor(p))
	})
}

type pubRoom struct {
	Code      string   `json:"code"`
	Title     string   `json:"title"`
	Formats   []string `json:"formats"`
	Packs     []string `json:"packs"`
	Kids      bool     `json:"kids"`
	Diff      int      `json:"difficulty"`
	Host      string   `json:"host"`
	Players   int      `json:"players"`
	Phase     string   `json:"phase"`
	Q         int      `json:"q"`
	Total     int      `json:"total"`
	AnswerSec int      `json:"answerSec"`
	StartAt   int64    `json:"startAt,omitempty"`
}

var pubCache struct {
	sync.Mutex
	at   int64
	body []byte
}

func specSummary(spec json.RawMessage) (formats, packs []string) {
	var s struct {
		Rounds []struct {
			Format string          `json:"format"`
			Packs  json.RawMessage `json:"packs"`
		} `json:"rounds"`
	}
	json.Unmarshal(spec, &s)
	seenF, seenP := map[string]bool{}, map[string]bool{}
	for _, r := range s.Rounds {
		if r.Format != "" && !seenF[r.Format] && len(formats) < 8 {
			seenF[r.Format] = true
			formats = append(formats, clip(r.Format, 24))
		}
		var ps []string
		if json.Unmarshal(r.Packs, &ps) != nil {
			ps = []string{"all"}
		}
		for _, p := range ps {
			if !seenP[p] && len(packs) < 12 {
				seenP[p] = true
				packs = append(packs, clip(p, 32))
			}
		}
	}
	return
}

func publicList() []pubRoom {
	roomsMu.RLock()
	list := make([]*Room, 0, len(rooms))
	for _, r := range rooms {
		list = append(list, r)
	}
	roomsMu.RUnlock()
	out := []pubRoom{}
	for _, r := range list {
		r.mu.Lock()
		listed := r.Public && !r.dead && (r.Phase == "lobby" || (!r.NoLate && (r.Phase == "question" || r.Phase == "reveal")))
		if listed {
			host := ""
			if h := r.player(r.HostID); h != nil {
				host = h.Name
			}
			f, p := specSummary(r.Spec)
			out = append(out, pubRoom{Code: r.Code, Title: r.Title, Formats: f, Packs: p, Kids: r.Kids, Diff: r.Diff, Host: host,
				Players: len(r.active()), Phase: r.Phase, Q: r.Q, Total: len(r.Questions), AnswerSec: r.AnswerMs / 1000, StartAt: r.StartAt})
		}
		r.mu.Unlock()
	}
	sort.Slice(out, func(i, j int) bool {
		if (out[i].Phase == "lobby") != (out[j].Phase == "lobby") {
			return out[i].Phase == "lobby"
		}
		return out[i].Code < out[j].Code
	})
	return out
}

// handlePublic is polled by every Online screen, so the body is memoised for 2 s.
func handlePublic(w http.ResponseWriter, r *http.Request) {
	now := nowMs()
	pubCache.Lock()
	if pubCache.body == nil || now-pubCache.at > 2000 || now < pubCache.at {
		b, _ := json.Marshal(map[string]any{"now": now, "max": cfg.MaxPublic, "rooms": publicList()})
		pubCache.body, pubCache.at = b, now
	}
	body := pubCache.body
	pubCache.Unlock()
	w.Header().Set("Cache-Control", "public, max-age=3")
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Write(body)
}

func resetPublicCache() {
	pubCache.Lock()
	pubCache.body = nil
	pubCache.Unlock()
}

// handleReady: the client has the question and its media loaded (see Room.checkHold).
func handleReady(w http.ResponseWriter, r *http.Request) {
	if !allow(r, "answer") {
		rateLimited(w)
		return
	}
	var in struct {
		Key string `json:"key"`
		Q   int    `json:"q"`
	}
	if !readJSON(w, r, smallBody, &in) {
		return
	}
	withPlayer(w, r.PathValue("code"), in.Key, func(room *Room, p *Player) {
		room.ready(p, in.Q)
		writeJSON(w, 200, room.stateFor(p))
	})
}

func handleVote(w http.ResponseWriter, r *http.Request) {
	if !allow(r, "answer") {
		rateLimited(w)
		return
	}
	var in struct {
		Key       string `json:"key"`
		PlayerKey string `json:"playerKey"`
		Q         int    `json:"q"`
	}
	if !readJSON(w, r, smallBody, &in) {
		return
	}
	if in.Key == "" {
		in.Key = in.PlayerKey
	}
	withPlayer(w, r.PathValue("code"), in.Key, func(room *Room, p *Player) {
		if code := room.vote(p, in.Q); code != "" {
			writeErr(w, 409, code, strings.ReplaceAll(code, "_", " "))
			return
		}
		writeJSON(w, 200, room.stateFor(p))
	})
}

// handleMine: the "Your rooms" list. The client sends the seats it remembers; rooms that are gone, ended or no longer
// know the key come back in "gone" so it can forget them. Read-only: it never counts as being online.
func handleMine(w http.ResponseWriter, r *http.Request) {
	if !allow(r, "answer") {
		rateLimited(w)
		return
	}
	var in struct {
		Rooms []struct {
			Code string `json:"code"`
			Key  string `json:"key"`
		} `json:"rooms"`
	}
	if !readJSON(w, r, smallBody, &in) {
		return
	}
	type mine struct {
		Code    string `json:"code"`
		Title   string `json:"title"`
		Phase   string `json:"phase"`
		Q       int    `json:"q"`
		Total   int    `json:"total"`
		Players int    `json:"players"`
		Online  int    `json:"online"`
		Host    string `json:"host"`
		Public  bool   `json:"public"`
		Created int64  `json:"created"`
		Touched int64  `json:"touched"`
		IsHost  bool   `json:"isHost"`
		Owner   bool   `json:"owner"`
		Left    bool   `json:"left,omitempty"`
	}
	now := nowMs()
	out, gone := []mine{}, []string{}
	for i, s := range in.Rooms {
		if i >= 30 {
			break
		}
		code := normCode(s.Code)
		room := getRoom(code)
		if room == nil {
			gone = append(gone, code)
			continue
		}
		room.mu.Lock()
		p := room.byKey(s.Key)
		if p == nil || p.Kicked || room.Ended || room.dead {
			room.mu.Unlock()
			gone = append(gone, code)
			continue
		}
		m := mine{Code: room.Code, Title: room.Title, Phase: room.Phase, Q: room.Q, Total: len(room.Questions),
			Players: len(room.active()), Public: room.Public, Created: room.Created, Touched: room.Touched,
			IsHost: p.ID == room.HostID && !p.Gone, Owner: room.Owner != "" && p.ID == room.Owner, Left: p.Gone}
		for _, x := range room.Players {
			if x.online(now) {
				m.Online++
			}
		}
		if h := room.player(room.HostID); h != nil {
			m.Host = h.Name
		}
		room.mu.Unlock()
		out = append(out, m)
	}
	writeJSON(w, 200, map[string]any{"now": now, "rooms": out, "gone": gone})
}
