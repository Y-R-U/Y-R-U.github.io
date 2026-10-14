// Special events (docs/EVENTS.md): the client CLAIMS battles, rolls and squares; this file
// RECOMPUTES everything from the ordered battle points with a port of js/events. Positions are
// never stored or accepted. Agreed arena results count here automatically (store.afterMatch);
// campaign fights are trusted but capped. Rivals are shown no further than the caller's own
// turn count, so nobody ever receives a future position. Picture answers live only in the
// answers file (ARENA_EVENT_ANSWERS), never in the public manifest.
package main

import (
	"cmp"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"unicode/utf8"
)

// ── the engine port (js/events) ────────────────────────────────────────────────────────

func hash32(s string) uint32 {
	h := uint32(0x811c9dc5)
	for i := 0; i < len(s); i++ {
		h = (h ^ uint32(s[i])) * 0x01000193
	}
	h ^= h >> 16
	h *= 0x85ebca6b
	h ^= h >> 13
	h *= 0xc2b2ae35
	h ^= h >> 16
	return h
}

func mulberry32(seed uint32) func() float64 {
	a := seed
	return func() float64 {
		a += 0x6d2b79f5
		t := a
		t = (t ^ (t >> 15)) * (t | 1)
		t ^= t + (t^(t>>7))*(t|61)
		return float64(t^(t>>14)) / 4294967296
	}
}

func die(uid, eventID string, n int) int {
	return 1 + int(hash32("die|"+uid+"|"+eventID+"|"+strconv.Itoa(n))%6)
}

type evDef struct {
	ID, Kind, Cadence string
	Pass, AnyBattle   bool
	From, To          string // seasonal, UTC "MM-DD", To exclusive
	Cost, GuessBonus  int
}

// Mirror of EVENT_DEFS in js/events/calendar.js.
var evDefs = []evDef{
	{ID: "vines-day", Kind: "vines", Cadence: "daily", AnyBattle: true},
	{ID: "reveal-week", Kind: "reveal", Cadence: "weekly", AnyBattle: true, Cost: 1, GuessBonus: 2},
	{ID: "tower", Kind: "tower", Cadence: "weekly", Pass: true},
	{ID: "story", Kind: "story", Cadence: "monthly", Pass: true, AnyBattle: true},
	{ID: "halloween", Kind: "reveal", Cadence: "seasonal", From: "10-24", To: "11-01", Pass: true, AnyBattle: true, Cost: 1, GuessBonus: 2},
}

// evCap: campaign fights per UTC day (0 = no daily limit) and the gap between counted ones.
// Mirror of CAMPAIGN_CAP / PAID_CAP in js/events/calendar.js.
type evCap struct {
	PerDay int
	GapMs  int64
}

var (
	campaignCap = evCap{10, 60000}
	paidCap     = evCap{0, 15000}
)

func capFor(paid bool) evCap {
	if paid {
		return paidCap
	}
	return campaignCap
}

const dayMs = int64(86400000)

func defByID(id string) *evDef {
	for i := range evDefs {
		if evDefs[i].ID == id {
			return &evDefs[i]
		}
	}
	return nil
}

func utcMs(y int, m time.Month, d int) int64 {
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC).UnixMilli()
}
func utcDayOf(ms int64) string { return time.UnixMilli(ms).UTC().Format("2006-01-02") }

func isoWeek(ms int64) (year, week int, monday int64) {
	t := time.UnixMilli(ms).UTC()
	day := utcMs(t.Year(), t.Month(), t.Day())
	dow := (int(time.UnixMilli(day).UTC().Weekday()) + 6) % 7
	thu := day + int64(3-dow)*dayMs
	year = time.UnixMilli(thu).UTC().Year()
	week = 1 + int((thu-utcMs(year, 1, 1))/(7*dayMs))
	return year, week, day - int64(dow)*dayMs
}

type evWindow struct {
	Key        string
	Start, End int64
}

func windowOf(def *evDef, ms int64) (evWindow, bool) {
	t := time.UnixMilli(ms).UTC()
	y, m := t.Year(), t.Month()
	switch def.Cadence {
	case "daily":
		s := utcMs(y, m, t.Day())
		return evWindow{utcDayOf(s), s, s + dayMs}, true
	case "weekly":
		wy, ww, mon := isoWeek(ms)
		return evWindow{fmt.Sprintf("%d-W%02d", wy, ww), mon, mon + 7*dayMs}, true
	case "monthly":
		s := utcMs(y, m, 1)
		return evWindow{utcDayOf(s)[:7], s, utcMs(y, m+1, 1)}, true
	case "seasonal":
		at := func(yy int, md string) int64 {
			mm, _ := strconv.Atoi(md[:2])
			dd, _ := strconv.Atoi(md[3:5])
			return utcMs(yy, time.Month(mm), dd)
		}
		for _, yy := range []int{y - 1, y} {
			s := at(yy, def.From)
			e := at(yy+1, def.To)
			if def.To > def.From {
				e = at(yy, def.To)
			}
			if ms >= s && ms < e {
				return evWindow{strconv.Itoa(yy), s, e}, true
			}
		}
	}
	return evWindow{}, false
}

func eventIDOf(def *evDef, w evWindow) string { return def.ID + ":" + w.Key }

var (
	reDayKey   = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
	reMonthKey = regexp.MustCompile(`^\d{4}-\d{2}$`)
	reWeekKey  = regexp.MustCompile(`^(\d{4})-W(\d{2})$`)
	reYearKey  = regexp.MustCompile(`^\d{4}$`)
)

// parseEventID: 'vines-day:2026-10-13' -> its definition and exact window, or false.
func parseEventID(id string) (*evDef, evWindow, bool) {
	i := strings.IndexByte(id, ':')
	if i < 0 {
		return nil, evWindow{}, false
	}
	def := defByID(id[:i])
	if def == nil {
		return nil, evWindow{}, false
	}
	key := id[i+1:]
	var probe int64
	switch def.Cadence {
	case "daily", "monthly":
		s := key
		if def.Cadence == "monthly" {
			if !reMonthKey.MatchString(key) {
				return nil, evWindow{}, false
			}
			s = key + "-01"
		} else if !reDayKey.MatchString(key) {
			return nil, evWindow{}, false
		}
		t, err := time.Parse("2006-01-02", s)
		if err != nil {
			return nil, evWindow{}, false
		}
		probe = t.UnixMilli() + dayMs/2
	case "weekly":
		m := reWeekKey.FindStringSubmatch(key)
		if m == nil {
			return nil, evWindow{}, false
		}
		yy, _ := strconv.Atoi(m[1])
		ww, _ := strconv.Atoi(m[2])
		_, _, mon := isoWeek(utcMs(yy, 1, 4))
		probe = mon + int64(ww-1)*7*dayMs + dayMs/2
	default:
		if !reYearKey.MatchString(key) {
			return nil, evWindow{}, false
		}
		yy, _ := strconv.Atoi(key)
		mm, _ := strconv.Atoi(def.From[:2])
		dd, _ := strconv.Atoi(def.From[3:5])
		probe = utcMs(yy, time.Month(mm), dd) + dayMs/2
	}
	w, ok := windowOf(def, probe)
	if !ok || w.Key != key {
		return nil, evWindow{}, false
	}
	return def, w, true
}

// ── Vines & Ladders ───────────────────────────────────────────────────────────────────

const squares = 100

type vBoard struct {
	Ladders, Vines [][2]int
	Link           map[int]int
}

func sqRow(s int) int { return (s - 1) / 10 }
func sqCol(s int) int {
	if sqRow(s)%2 == 1 {
		return 9 - (s-1)%10
	}
	return (s - 1) % 10
}
func iabs(v int) int {
	if v < 0 {
		return -v
	}
	return v
}

func makeBoard(eventID string) vBoard {
	r := mulberry32(hash32("board|" + eventID))
	rint := func(lo, hi int) int { return lo + int(math.Floor(r()*float64(hi-lo+1))) }
	used := map[int]bool{1: true, squares: true}
	b := vBoard{Link: map[int]int{}}
	place := func(list *[][2]int, n int, pick func() (int, int)) {
		for tries := 0; len(*list) < n && tries < 400; tries++ {
			a, z := pick()
			if used[a] || used[z] || iabs(sqCol(a)-sqCol(z)) > 3 {
				continue
			}
			used[a], used[z] = true, true
			*list = append(*list, [2]int{a, z})
			b.Link[a] = z
		}
	}
	place(&b.Ladders, 8, func() (int, int) { a := rint(2, 88); return a, min(99, a+rint(8, 28)) })
	place(&b.Vines, 8, func() (int, int) { a := rint(14, 99); return a, max(2, a-rint(8, 32)) })
	return b
}

func (b vBoard) step(pos, roll int) int {
	p, dir := pos, 1
	for i := 0; i < roll; i++ {
		if p == squares {
			dir = -1
		}
		p += dir
	}
	if to, ok := b.Link[p]; ok {
		return to
	}
	return p
}

// positionAfterRolls: where uid stands after `rolls` rolls; finishedAt is the roll count that
// reached 100 (0 = not home).
func positionAfterRolls(b vBoard, uid, eventID string, rolls int) (pos, finishedAt int) {
	for n := 0; n < rolls && pos != squares; n++ {
		pos = b.step(pos, die(uid, eventID, n))
		if pos == squares {
			finishedAt = n + 1
		}
	}
	return
}

func turnEnds(points []int) []int {
	out, n := make([]int, len(points)), 0
	for i, p := range points {
		n += p
		out[i] = n
	}
	return out
}

func sumInts(v []int) (s int) {
	for _, x := range v {
		s += x
	}
	return
}

func turnsDone(b vBoard, uid, eventID string, points []int, rolls int) int {
	ends := turnEnds(points)
	_, fin := positionAfterRolls(b, uid, eventID, rolls)
	last := rolls
	if fin > 0 {
		for _, e := range ends {
			if e >= fin {
				last = max(rolls, e)
				break
			}
		}
	}
	k := 0
	for _, e := range ends {
		if e <= last {
			k++
		}
	}
	return k
}

func positionAtTurn(b vBoard, uid, eventID string, points []int, k int) int {
	rolls := 0
	if k > 0 && len(points) > 0 {
		rolls = turnEnds(points)[min(k, len(points))-1]
	}
	pos, _ := positionAfterRolls(b, uid, eventID, rolls)
	return pos
}

// ── points ────────────────────────────────────────────────────────────────────────────

type evBattle struct {
	ID  string
	At  int64
	Src string
	Pts int
}

// THE TOWER keeps its own W/L list (ev_tower) and takes no points.
func battleCounts(def *evDef, w evWindow, b evBattle) bool {
	return def.Kind != "tower" && b.At >= w.Start && b.At < w.End && (def.AnyBattle || b.Src == "arena")
}

// counted: the battles that count for one window, in play order, duplicates once, the
// campaign cap applied — exactly js/events/points.js counted().
func counted(def *evDef, w evWindow, battles []evBattle, cap evCap) []evBattle {
	in := append([]evBattle(nil), battles...)
	sort.SliceStable(in, func(i, j int) bool {
		if in[i].At != in[j].At {
			return in[i].At < in[j].At
		}
		return in[i].ID < in[j].ID
	})
	seen, perDay := map[string]bool{}, map[string]int{}
	last := int64(math.MinInt64 / 2)
	var out []evBattle
	for _, b := range in {
		if seen[b.ID] || !battleCounts(def, w, b) {
			continue
		}
		if b.Src == "campaign" {
			day := utcDayOf(b.At)
			if (cap.PerDay > 0 && perDay[day] >= cap.PerDay) || b.At-last < cap.GapMs {
				continue
			}
			perDay[day]++
			last = b.At
		}
		seen[b.ID] = true
		out = append(out, b)
	}
	return out
}

func ptsOf(bs []evBattle) []int {
	out := make([]int, len(bs))
	for i, b := range bs {
		out[i] = b.Pts
	}
	return out
}

// ── picture reveal ────────────────────────────────────────────────────────────────────

const cells = 25

// The code-drawn placeholder picture is used until Aaron approves art for an event. Its old
// guess (public in history) is never offered or paid: real answers live only in answers.json.
const placeholderPic, placeholderAnswer = "heroic", "A PENCIL DUEL"

func guessesLeft(open, guesses int, solved bool) int {
	if solved {
		return 0
	}
	return max(0, 1+open/5-guesses)
}

// answers: eventId -> answer, written by the art review tool when Aaron approves a picture.
type answerBook struct {
	mu    sync.Mutex
	path  string
	mtime time.Time
	m     map[string]string
}

func (a *answerBook) get(eventID string) (string, bool) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.path == "" {
		return "", false
	}
	if st, err := os.Stat(a.path); err == nil && !st.ModTime().Equal(a.mtime) {
		var f struct {
			Answers map[string]string `json:"answers"`
		}
		if b, err := os.ReadFile(a.path); err == nil && json.Unmarshal(b, &f) == nil {
			a.m, a.mtime = f.Answers, st.ModTime()
		}
	}
	v, ok := a.m[eventID]
	return v, ok && v != ""
}

// ── server state ──────────────────────────────────────────────────────────────────────

const evSchema = `
CREATE TABLE IF NOT EXISTS ev_claims (uid TEXT NOT NULL, event TEXT NOT NULL, id TEXT NOT NULL,
  pts INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (uid, event, id));
CREATE TABLE IF NOT EXISTS ev_state (uid TEXT NOT NULL, event TEXT NOT NULL, name TEXT NOT NULL,
  rolls INTEGER NOT NULL DEFAULT 0, open TEXT NOT NULL DEFAULT '[]', guesses TEXT NOT NULL DEFAULT '[]',
  solved INTEGER NOT NULL DEFAULT 0, bonus INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL,
  PRIMARY KEY (uid, event));
CREATE INDEX IF NOT EXISTS ev_state_event ON ev_state(event, updated);
-- Agreed arena results, one row per verified player (store.afterMatch). close = a loss with the
-- opponent more than half beaten (2 points instead of 1), from the agreed damage of the deciding round.
CREATE TABLE IF NOT EXISTS ev_arena (match TEXT NOT NULL, uid TEXT NOT NULL, won INTEGER NOT NULL,
  close INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL, PRIMARY KEY (match, uid));
CREATE INDEX IF NOT EXISTS ev_arena_uid ON ev_arena(uid, at);
`

const (
	evGrace     = 10 * time.Minute // claims still accepted this long after a window ends
	evSkew      = 10 * time.Minute // a fast device clock: claims this far ahead are shifted back to now; further = refused
	evMaxAge    = 26 * time.Hour   // ...nor further back than this
	evSyncSlack = 10 * time.Minute // ...nor before the previous sync, less this (a sync in flight)
	evRivalScan = 500
	evMaxBody   = 32 << 10
)

// Overridable by tests. The payment service's entitlements: Pass events need br8t_pass; paid
// (br8t_pass or ragdojo_supporter) lifts the campaign cap's daily limit.
var (
	evEntCheck  func(ctx context.Context, tok string) evEnt
	evAnswers   = &answerBook{}
	evPassMu    sync.Mutex
	evPassCache = map[string]passEntry{}
	evSyncMu    sync.Mutex
	evSyncLast  = map[string]time.Time{}
	// One player's state in one event is read, changed and written under its stripe.
	evLocks    [256]sync.Mutex
	evNoAnswer sync.Map // events already logged as art-without-answer
)

func evLock(uid, ev string) *sync.Mutex { return &evLocks[hash32(uid+"|"+ev)%uint32(len(evLocks))] }

var evMinGap = 250 * time.Millisecond // tests set 0 to reach the lock behind it

var evAfterLoad = func() {} // tests: widen the load-to-save window

// evLimit: evMinGap between calls of one kind, per player and event.
func (h *hub) evLimit(key string) bool {
	evSyncMu.Lock()
	defer evSyncMu.Unlock()
	if t := evSyncLast[key]; h.st.now().Sub(t) < evMinGap {
		return false
	}
	evSyncLast[key] = h.st.now()
	if len(evSyncLast) > 20000 {
		evSyncLast = map[string]time.Time{}
	}
	return true
}

// evEnt: what the payment service said. Known=false is an outage (no answer, 5xx): Pass events
// then stay open (fail-open, same rule as the allowance), but the campaign cap stays the FREE
// one — an outage never grants unlimited fights (and evApply keeps the refused ones claimable).
type evEnt struct{ Pass, Paid, Known bool }

type passEntry struct {
	e   evEnt
	exp time.Time
}

func entitlementCheck(url string) func(ctx context.Context, tok string) evEnt {
	client := &http.Client{Timeout: 4 * time.Second}
	unknown := evEnt{Pass: true}
	return func(ctx context.Context, tok string) evEnt {
		if url == "" {
			return evEnt{true, true, true}
		}
		req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
		if err != nil {
			return unknown
		}
		req.Header.Set("Authorization", "Bearer "+tok)
		res, err := client.Do(req)
		if err != nil {
			return unknown
		}
		defer res.Body.Close()
		if res.StatusCode != 200 {
			if res.StatusCode >= 500 {
				return unknown
			}
			return evEnt{Known: true}
		}
		var out struct {
			Entitlements map[string]bool `json:"entitlements"`
		}
		if json.NewDecoder(io.LimitReader(res.Body, 16<<10)).Decode(&out) != nil {
			return unknown
		}
		pass := out.Entitlements["br8t_pass"]
		return evEnt{Pass: pass, Paid: pass || out.Entitlements["ragdojo_supporter"], Known: true}
	}
}

// eventRoutes wires the events API onto the arena's mux (one line in routes()).
func (h *hub) eventRoutes(mux *http.ServeMux, prefix string, origins []string) {
	if _, err := h.st.db.Exec(evSchema + towerSchema); err != nil {
		panic(err)
	}
	if evEntCheck == nil {
		url := env("ARENA_ENTITLEMENT_URL", "http://127.0.0.1:8016/api/br8t/entitlement")
		if url == "off" {
			url = ""
		}
		evEntCheck = entitlementCheck(url)
	}
	// The Pass events SCROLLS & ROPES and MONTHLY PICTURE were replaced by THE TOWER and STORY.
	for _, t := range []string{"ev_claims", "ev_state"} {
		h.st.db.Exec(`DELETE FROM ` + t + ` WHERE event LIKE 'vines-month:%' OR event LIKE 'reveal-month:%'`)
	}
	if evAnswers.path == "" {
		evAnswers.path = env("ARENA_EVENT_ANSWERS", filepath.Join(filepath.Dir(env("ARENA_DB", "arena.db")), "event_answers.json"))
	}
	h.st.afterMatch = h.st.eventArenaResult
	for _, p := range []string{"/events", "/events/sync", "/events/rivals", "/events/guess"} {
		mux.HandleFunc("OPTIONS "+prefix+p, func(w http.ResponseWriter, r *http.Request) { preflight(w, r, origins) })
	}
	mux.HandleFunc("GET "+prefix+"/events", func(w http.ResponseWriter, r *http.Request) {
		cors(w, r, origins)
		now := h.st.now().UnixMilli()
		var list []map[string]any
		for i := range evDefs {
			d := &evDefs[i]
			if win, ok := windowOf(d, now); ok {
				list = append(list, map[string]any{"id": eventIDOf(d, win), "kind": d.Kind, "pass": d.Pass, "anyBattle": d.AnyBattle, "start": win.Start, "end": win.End})
			}
		}
		reply(w, 200, map[string]any{"now": now, "events": list, "lan": h.lan})
	})
	mux.HandleFunc("POST "+prefix+"/events/sync", func(w http.ResponseWriter, r *http.Request) {
		cors(w, r, origins)
		h.eventSync(w, r)
	})
	mux.HandleFunc("GET "+prefix+"/events/rivals", func(w http.ResponseWriter, r *http.Request) {
		cors(w, r, origins)
		uid, _, ok := h.evAuth(w, r, r.URL.Query().Get("event"))
		if !ok {
			return
		}
		ev := r.URL.Query().Get("event")
		def, _, _ := parseEventID(ev)
		if def.Kind == "tower" {
			if !h.evLimit("rivals|" + uid + "|" + ev) {
				reply(w, 429, map[string]string{"error": "slow down"})
				return
			}
			rv, err := h.st.towerRivals(ev, uid)
			if err != nil {
				reply(w, 503, map[string]string{"error": "unavailable"})
				return
			}
			reply(w, 200, map[string]any{"event": ev, "rivals": rv})
			return
		}
		if def.Kind != "vines" {
			reply(w, 400, map[string]string{"error": "not a vines event"})
			return
		}
		if !h.evLimit("rivals|" + uid + "|" + ev) {
			if v, ok := h.st.rivals.get(uid+"|"+ev, -1, h.st.now()); ok {
				reply(w, 200, map[string]any{"event": ev, "rivals": v})
			} else {
				reply(w, 429, map[string]string{"error": "slow down"})
			}
			return
		}
		rv, err := h.st.evRivals(ev, uid)
		if err != nil {
			reply(w, 503, map[string]string{"error": "unavailable"})
			return
		}
		reply(w, 200, map[string]any{"event": ev, "rivals": rv})
	})
	mux.HandleFunc("POST "+prefix+"/events/guess", func(w http.ResponseWriter, r *http.Request) {
		cors(w, r, origins)
		h.eventGuess(w, r)
	})
	h.eventArtRoutes(mux, prefix, origins) // eventart.go: tiles of opened squares only
}

// evAuth: a verified (or LAN) player, a known event, and the Pass if the event wants one.
func (h *hub) evAuth(w http.ResponseWriter, r *http.Request, ev string) (uid, tok string, ok bool) {
	tok, _ = strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	uid = h.caller(r)
	if uid == "" {
		reply(w, 401, map[string]string{"error": "sign in"})
		return "", "", false
	}
	def, _, known := parseEventID(ev)
	if !known {
		reply(w, 404, map[string]string{"error": "no such event"})
		return "", "", false
	}
	if def.Pass && !h.lan && !h.ent(r.Context(), uid, tok).Pass {
		reply(w, 403, map[string]string{"error": "pass"})
		return "", "", false
	}
	return uid, tok, true
}

// ent: the caller's entitlements, cached (see ttl below). A LAN
// server treats everyone as a Pass holder, so as paid too.
func (h *hub) ent(ctx context.Context, uid, tok string) evEnt {
	if h.lan {
		return evEnt{true, true, true}
	}
	evPassMu.Lock()
	if e, ok := evPassCache[uid]; ok && h.st.now().Before(e.exp) {
		evPassMu.Unlock()
		return e.e
	}
	evPassMu.Unlock()
	e := evEntCheck(ctx, tok)
	// A purchase must show up soon: only a positive answer is kept the full 5 minutes.
	ttl := 5 * time.Minute
	if !e.Known {
		ttl = 30 * time.Second
	} else if !e.Pass || !e.Paid {
		ttl = time.Minute
	}
	evPassMu.Lock()
	evPassCache[uid] = passEntry{e, h.st.now().Add(ttl)}
	evPassMu.Unlock()
	return e
}

var reBattleID = regexp.MustCompile(`^(camp|ghost|tower|arena):[A-Za-z0-9:_.\-]{1,80}$`)

type syncBody struct {
	Event   string            `json:"event"`
	Name    string            `json:"name"`
	B       []json.RawMessage `json:"b"`
	Rolls   int               `json:"rolls"`
	Open    []int             `json:"open"`
	Friends []string          `json:"friends"`
	T       []json.RawMessage `json:"t"` // THE TOWER: [id, won 1|0, at] per fight
}

func (h *hub) eventSync(w http.ResponseWriter, r *http.Request) {
	var body syncBody
	if err := json.NewDecoder(io.LimitReader(r.Body, evMaxBody)).Decode(&body); err != nil || len(body.B) > 400 || len(body.T) > 400 || len(body.Open) > cells {
		reply(w, 400, map[string]string{"error": "bad body"})
		return
	}
	uid, tok, ok := h.evAuth(w, r, body.Event)
	if !ok {
		return
	}
	ent := h.ent(r.Context(), uid, tok)
	if !h.evLimit(uid + "|" + body.Event) {
		reply(w, 429, map[string]string{"error": "slow down"})
		return
	}
	name, err := cleanName(body.Name)
	if err != nil {
		name = "PLAYER"
	}
	mu := evLock(uid, body.Event)
	mu.Lock()
	out, err := h.st.evApply(uid, name, body, ent)
	mu.Unlock()
	if err != nil {
		reply(w, 503, map[string]string{"error": "unavailable"})
		return
	}
	reply(w, 200, out)
}

// evPlayer: one player's view of one event, everything recomputed from stored battles.
type evPlayer struct {
	uid, name     string
	battles       []evBattle
	rolls         int
	open, guesses []string
	openCells     []int
	solved        bool
	bonus         int
	updated       int64 // ms of the previous sync (0 = never)
	mark          int64 // evSave writes this as `updated` instead of now, when set (see evApply)
	tower         []towerRow
}

func (s *store) evLoad(uid, ev string, def *evDef, win evWindow) (*evPlayer, error) {
	p := &evPlayer{uid: uid, name: "PLAYER", openCells: []int{}, guesses: []string{}}
	var open, guesses string
	var solved int
	err := s.db.QueryRow(`SELECT name, rolls, open, guesses, solved, bonus, updated FROM ev_state WHERE uid=? AND event=?`, uid, ev).
		Scan(&p.name, &p.rolls, &open, &guesses, &solved, &p.bonus, &p.updated)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}
	if err == nil {
		json.Unmarshal([]byte(open), &p.openCells)
		json.Unmarshal([]byte(guesses), &p.guesses)
		p.solved = solved == 1
	}
	var all []evBattle
	rows, err := s.db.Query(`SELECT id, pts, at FROM ev_claims WHERE uid=? AND event=?`, uid, ev)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var b evBattle
		rows.Scan(&b.ID, &b.Pts, &b.At)
		b.Src = "campaign"
		all = append(all, b)
	}
	rows.Close()
	arena, err := s.evArenaFor(uid, win)
	if err != nil {
		return nil, err
	}
	// Stored claims already passed the cap they were claimed under; re-counted with the lenient
	// (paid) one, so a lapsed or unknown entitlement never trims fights that were accepted.
	p.battles = counted(def, win, append(all, arena...), paidCap)
	p.rolls = min(p.rolls, sumInts(ptsOf(p.battles)))
	return p, nil
}

func (s *store) evArenaFor(uid string, win evWindow) ([]evBattle, error) {
	rows, err := s.db.Query(`SELECT match, won, close, at FROM ev_arena WHERE uid=? AND at>=? AND at<?`, uid, win.Start, win.End)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []evBattle
	for rows.Next() {
		var m string
		var won, close int
		var at int64
		rows.Scan(&m, &won, &close, &at)
		out = append(out, evBattle{ID: "arena:" + m, At: at, Src: "arena", Pts: arenaPts(won == 1, close == 1)})
	}
	return out, rows.Err()
}

func arenaPts(won, close bool) int {
	if won {
		return 3
	}
	if close {
		return 2
	}
	return 1
}

// claimWindow: the oldest a claimed fight may be — evMaxAge back, and never before the
// previous sync less evSyncSlack.
func (s *store) claimWindow(p *evPlayer) (oldest int64) {
	oldest = s.now().Add(-evMaxAge).UnixMilli()
	if p.updated > 0 {
		oldest = max(oldest, p.updated-evSyncSlack.Milliseconds())
	}
	return
}

// evApply takes a client's claim, keeps what checks out, and answers with the recomputed state.
func (s *store) evApply(uid, name string, body syncBody, ent evEnt) (map[string]any, error) {
	def, win, _ := parseEventID(body.Event)
	if def.Kind == "tower" {
		return s.towerApply(uid, name, body, def, win)
	}
	now := s.now()
	open := now.UnixMilli() < win.End+evGrace.Milliseconds() && now.UnixMilli() >= win.Start
	p, err := s.evLoad(uid, body.Event, def, win)
	if err != nil {
		return nil, err
	}
	paid := ent.Known && ent.Paid
	cap := capFor(paid)
	if open {
		// Battles: arena results count from the server's own records, never from a claim;
		// campaign fights are trusted, but only recent ones, after the previous sync, and at
		// most a day's cap in one request.
		oldest := s.claimWindow(p)
		var claims []evBattle
		ahead := int64(0)
		for _, raw := range body.B {
			var row []json.RawMessage
			if json.Unmarshal(raw, &row) != nil || len(row) < 4 {
				continue
			}
			var b evBattle
			if json.Unmarshal(row[0], &b.ID) != nil || json.Unmarshal(row[1], &b.Pts) != nil ||
				json.Unmarshal(row[2], &b.Src) != nil || json.Unmarshal(row[3], &b.At) != nil || !reBattleID.MatchString(b.ID) {
				continue
			}
			if b.Src != "campaign" || strings.HasPrefix(b.ID, "arena:") || b.Pts < 1 || b.Pts > 3 ||
				b.At > now.Add(evSkew).UnixMilli() {
				continue
			}
			ahead = max(ahead, b.At-now.UnixMilli())
			claims = append(claims, b)
		}
		// A device clock that runs fast: shift the whole batch back so its newest fight is
		// "now", keeping the gaps between fights (the campaign cap wants 60 s between them).
		kept := claims[:0]
		for _, b := range claims {
			if b.At -= ahead; b.At >= oldest {
				kept = append(kept, b)
			}
		}
		claims = kept
		sort.SliceStable(claims, func(i, j int) bool { return claims[i].At < claims[j].At })
		cur := append([]evBattle(nil), p.battles...)
		added, maxNew := 0, campaignCap.PerDay
		if paid {
			maxNew = 200
		}
		refused := int64(0) // the earliest claim refused only because the entitlement was unknown
		for _, c := range claims {
			if !def.AnyBattle || added >= maxNew {
				break
			}
			if containsID(cur, c.ID) {
				continue
			}
			next := counted(def, win, append(append([]evBattle(nil), cur...), c), cap)
			if containsID(next, c.ID) {
				if _, err := s.db.Exec(`INSERT OR IGNORE INTO ev_claims(uid,event,id,pts,at) VALUES(?,?,?,?,?)`, uid, body.Event, c.ID, c.Pts, c.At); err != nil {
					return nil, err
				}
				cur = next
				added++
			} else if !ent.Known && refused == 0 && containsID(counted(def, win, append(append([]evBattle(nil), cur...), c), paidCap), c.ID) {
				refused = c.At
			}
		}
		if p, err = s.evLoad(uid, body.Event, def, win); err != nil {
			return nil, err
		}
		// Refused only because the payment service did not answer: keep it claimable later
		// (the "before the previous sync" rule then starts just before it).
		if refused > 0 {
			p.mark = min(now.UnixMilli(), refused-1+evSyncSlack.Milliseconds())
		}
		pts := ptsOf(p.battles)
		p.rolls = max(p.rolls, min(body.Rolls, sumInts(pts)))
		if def.Kind == "reveal" && len(p.openCells) < cells { // solved pictures keep opening: the whole art is sent only at 25
			afford := min(cells, sumInts(pts)/def.Cost)
			for _, c := range body.Open {
				if len(p.openCells) >= afford {
					break
				}
				if c >= 0 && c < cells && !containsInt(p.openCells, c) {
					p.openCells = append(p.openCells, c)
				}
			}
		}
		p.name = name
		if err := s.evSave(body.Event, p); err != nil {
			return nil, err
		}
	}
	out := s.evView(body.Event, def, win, p)
	out["closed"] = !open
	out["cap"] = map[string]any{"paid": paid, "known": ent.Known, "perDay": cap.PerDay, "gapMs": cap.GapMs}
	if def.Kind == "vines" {
		rv, err := s.evRivals(body.Event, uid)
		if err != nil {
			return nil, err
		}
		out["rivals"] = rv
	}
	return out, nil
}

func (s *store) evSave(ev string, p *evPlayer) error {
	open, _ := json.Marshal(p.openCells)
	guesses, _ := json.Marshal(p.guesses)
	_, err := s.db.Exec(`INSERT INTO ev_state(uid,event,name,rolls,open,guesses,solved,bonus,updated) VALUES(?,?,?,?,?,?,?,?,?)
		ON CONFLICT(uid,event) DO UPDATE SET name=excluded.name, rolls=MAX(rolls, excluded.rolls), open=excluded.open,
		guesses=excluded.guesses, solved=excluded.solved, bonus=excluded.bonus, updated=excluded.updated`,
		p.uid, ev, p.name, p.rolls, string(open), string(guesses), b2i(p.solved), p.bonus, cmp.Or(p.mark, s.now().UnixMilli()))
	return err
}

// evView: what the player may see of themselves. Positions are computed, never stored.
func (s *store) evView(ev string, def *evDef, win evWindow, p *evPlayer) map[string]any {
	b := make([][]any, len(p.battles))
	for i, x := range p.battles {
		b[i] = []any{x.ID, x.Pts, x.Src, x.At}
	}
	pts := ptsOf(p.battles)
	out := map[string]any{"event": ev, "uid": p.uid, "b": b, "points": sumInts(pts), "start": win.Start, "end": win.End}
	if def.Kind == "vines" {
		board := makeBoard(ev)
		pos, _ := positionAfterRolls(board, p.uid, ev, p.rolls)
		out["rolls"], out["pos"], out["turns"] = p.rolls, pos, turnsDone(board, p.uid, ev, pts, p.rolls)
		out["rid"] = s.rid(ev, p.uid)
	} else if def.Kind == "story" {
		key := ev[strings.IndexByte(ev, ':')+1:]
		st := storyIndex(key)
		ch, circle, done := storyProgress(st, sumInts(pts))
		out["story"], out["chapter"], out["circle"], out["done"] = st, ch, circle, done
	} else {
		out["open"], out["guesses"], out["solved"], out["bonus"] = p.openCells, p.guesses, p.solved, p.bonus
		out["guessesLeft"] = guessesLeft(len(p.openCells), len(p.guesses), p.solved)
		out["art"] = s.evHasArt(ev)
	}
	return out
}

func (s *store) evHasArt(ev string) bool { _, ok := evAnswers.get(ev); return ok }

type rivalOut struct {
	Rid    string `json:"rid"` // stable per event, opaque: a salted hash, never the uid
	Name   string `json:"name"`
	Pos    int    `json:"pos"`
	Turns  int    `json:"turns"` // the turn they are SHOWN at: min(theirs, yours)
	Friend bool   `json:"friend,omitempty"`
	Home   bool   `json:"home,omitempty"`
}

// evRivals applies THE REPLAY RULE with the caller's own stored turn count. Only a name, a
// square and the shown turn leave the server: no uid, no batches, no roll count, no real turns.
// A "friend" is an account the caller finished a friend-link match with (store.friendsOf),
// never a display name the client sends.
func (s *store) evRivals(ev, me string) ([]rivalOut, error) {
	def, win, ok := parseEventID(ev)
	if !ok || def.Kind != "vines" {
		return []rivalOut{}, nil
	}
	board := makeBoard(ev)
	mine, err := s.evLoad(me, ev, def, win)
	if err != nil {
		return nil, err
	}
	myPts := ptsOf(mine.battles)
	myTurns := turnsDone(board, me, ev, myPts, mine.rolls)
	myPos, _ := positionAfterRolls(board, me, ev, mine.rolls)
	if v, ok := s.rivals.get(me+"|"+ev, myTurns, s.now()); ok {
		return v, nil
	}
	rivalSem <- struct{}{}
	defer func() { <-rivalSem }()
	evRivalScans.Add(1)
	friends := s.friendsOf(me)
	rows, err := s.db.Query(`SELECT uid FROM ev_state WHERE event=? AND uid<>? ORDER BY updated DESC LIMIT ?`, ev, me, evRivalScan)
	if err != nil {
		return nil, err
	}
	var uids []string
	for rows.Next() {
		var u string
		rows.Scan(&u)
		uids = append(uids, u)
	}
	rows.Close()
	type cand struct {
		rivalOut
		uid string
	}
	var fr, rest []cand
	for _, u := range uids {
		p, err := s.evLoad(u, ev, def, win)
		if err != nil {
			return nil, err
		}
		pts := ptsOf(p.battles)
		theirs := turnsDone(board, u, ev, pts, p.rolls)
		if theirs == 0 {
			continue
		}
		shown := min(theirs, myTurns)
		pos := positionAtTurn(board, u, ev, pts, shown)
		c := cand{rivalOut{Rid: s.rid(ev, u), Name: p.name, Pos: pos, Turns: shown, Home: pos == squares}, u}
		if friends[u] {
			c.Friend = true
			fr = append(fr, c)
		} else {
			rest = append(rest, c)
		}
	}
	near := func(l []cand) {
		sort.SliceStable(l, func(i, j int) bool {
			di, dj := iabs(l[i].Pos-myPos), iabs(l[j].Pos-myPos)
			if di != dj {
				return di < dj
			}
			return l[i].uid < l[j].uid
		})
	}
	near(fr)
	near(rest)
	out := []rivalOut{}
	for _, c := range append(fr, rest...) {
		if len(out) >= 10 {
			break
		}
		out = append(out, c.rivalOut)
	}
	s.rivals.put(me+"|"+ev, myTurns, s.now(), out)
	return out, nil
}

// The rival scan reads every player in the event (~1,000 queries at 500 players): one caller's
// answer is reused for rivalTTL while their own turn count is unchanged, at most a few scans
// run at once, and GET /events/rivals is rate limited on top (a limited caller gets the cache).
const rivalTTL = 5 * time.Second

var (
	rivalSem     = make(chan struct{}, 4)
	evRivalScans atomic.Int64
)

type rivalEntry struct {
	at    time.Time
	turns int
	v     []rivalOut
}

type rivalMemo struct {
	mu sync.Mutex
	m  map[string]rivalEntry
}

func (c *rivalMemo) get(k string, turns int, now time.Time) ([]rivalOut, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.m[k]
	if !ok || (turns >= 0 && (e.turns != turns || now.Sub(e.at) > rivalTTL)) {
		return nil, false
	}
	return e.v, true
}

func (c *rivalMemo) put(k string, turns int, now time.Time, v []rivalOut) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.m) > 5000 {
		c.m = map[string]rivalEntry{}
	}
	c.m[k] = rivalEntry{now, turns, v}
}

// rid: a rival's id for one event — stable, opaque, unlinkable to the uid or across events.
func (s *store) rid(ev, uid string) string {
	sum := sha256.Sum256([]byte(s.salt() + "|" + ev + "|" + uid))
	return hex.EncodeToString(sum[:8])
}

// salt is made once per database and kept in it, so rids survive a restart.
func (s *store) salt() string {
	s.saltMu.Lock()
	defer s.saltMu.Unlock()
	if s.saltV != "" {
		return s.saltV
	}
	s.db.Exec(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`)
	var v string
	if s.db.QueryRow(`SELECT v FROM meta WHERE k='rid_salt'`).Scan(&v) != nil || v == "" {
		v = randString(idChars, 32)
		s.db.Exec(`INSERT OR IGNORE INTO meta(k,v) VALUES('rid_salt',?)`, v)
		s.db.QueryRow(`SELECT v FROM meta WHERE k='rid_salt'`).Scan(&v)
	}
	s.saltV = v
	return v
}

func (h *hub) eventGuess(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Event  string `json:"event"`
		Pic    string `json:"pic"`
		Choice string `json:"choice"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body); err != nil {
		reply(w, 400, map[string]string{"error": "bad body"})
		return
	}
	uid, _, ok := h.evAuth(w, r, body.Event)
	if !ok {
		return
	}
	def, win, _ := parseEventID(body.Event)
	choice := strings.ToUpper(strings.TrimSpace(body.Choice))
	if def.Kind != "reveal" || choice == "" || utf8.RuneCountInString(choice) > 60 {
		reply(w, 400, map[string]string{"error": "bad guess"})
		return
	}
	now := h.st.now().UnixMilli()
	if now < win.Start || now >= win.End+evGrace.Milliseconds() {
		reply(w, 410, map[string]string{"error": "event over"})
		return
	}
	answer, art := evAnswers.get(body.Event)
	if !art {
		answer = placeholderAnswer
	}
	// Approved art in the manifest but no answer in this server's answers file: the picture
	// cannot be checked, so it takes no guesses (the reveal still works). Logged once.
	if body.Pic == "art" && !art {
		if _, seen := evNoAnswer.LoadOrStore(body.Event, true); !seen {
			log.Printf("events: %s has art but no answer in %s; guesses are off for it", body.Event, evAnswers.path)
		}
		p, err := h.st.evLoad(uid, body.Event, def, win)
		if err != nil {
			reply(w, 503, map[string]string{"error": "unavailable"})
			return
		}
		out := h.st.evView(body.Event, def, win, p)
		out["right"], out["guessable"], out["guessesLeft"] = false, false, 0
		reply(w, 200, out)
		return
	}
	// The server decides which picture is up; a client showing the other one gets told, and
	// keeps its guess.
	if (body.Pic == "art") != art {
		reply(w, 409, map[string]any{"error": "picture changed", "art": art})
		return
	}
	if !h.evLimit("guess|" + uid + "|" + body.Event) {
		reply(w, 429, map[string]string{"error": "slow down"})
		return
	}
	// Load, check and save under the player's lock: concurrent guesses must not all see the
	// one guess that is left.
	mu := evLock(uid, body.Event)
	mu.Lock()
	defer mu.Unlock()
	p, err := h.st.evLoad(uid, body.Event, def, win)
	if err != nil {
		reply(w, 503, map[string]string{"error": "unavailable"})
		return
	}
	evAfterLoad()
	if len(p.battles) == 0 {
		reply(w, 409, map[string]any{"error": "play first", "guessesLeft": guessesLeft(len(p.openCells), len(p.guesses), p.solved)})
		return
	}
	if guessesLeft(len(p.openCells), len(p.guesses), p.solved) <= 0 || containsStr(p.guesses, choice) {
		reply(w, 409, map[string]any{"error": "no guesses left", "guessesLeft": 0})
		return
	}
	p.guesses = append(p.guesses, choice)
	right := choice == strings.ToUpper(answer)
	if right {
		// The placeholder's answer is public (it ships in the client): solving it pays no bonus.
		p.solved = true
		if art {
			p.bonus = (cells - len(p.openCells)) * def.GuessBonus
		}
	}
	if err := h.st.evSave(body.Event, p); err != nil {
		reply(w, 503, map[string]string{"error": "unavailable"})
		return
	}
	out := h.st.evView(body.Event, def, win, p)
	out["right"] = right
	reply(w, 200, out)
}

// eventArenaResult: every agreed arena result counts for the events of its moment, for every
// verified player in it, whether or not their browser ever says so.
func (s *store) eventArenaResult(match string, seats []seatRow) {
	at := s.now().UnixMilli()
	for _, p := range seats {
		if p.UID == "" || !p.Ranked || p.NoStats || p.NoEvent {
			continue
		}
		s.db.Exec(`INSERT OR IGNORE INTO ev_arena(match,uid,won,close,at) VALUES(?,?,?,?,?)`, match, p.UID, b2i(p.Won), b2i(!p.Won && p.OppDmg > 0.5), at)
	}
}

func containsID(l []evBattle, id string) bool {
	for _, b := range l {
		if b.ID == id {
			return true
		}
	}
	return false
}
func containsInt(l []int, v int) bool {
	for _, x := range l {
		if x == v {
			return true
		}
	}
	return false
}
func containsStr(l []string, v string) bool {
	for _, x := range l {
		if x == v {
			return true
		}
	}
	return false
}

// ── THE TOWER (js/events/tower.js) ─────────────────────────────────────────────────────
// A player is their ordered W/L list; the floor is recomputed from it every time.

const (
	towerFloors = 12
	towerGapMs  = int64(8000)
	towerPerDay = 120
	towerMaxNew = 60
)

type towerRow struct {
	ID  string
	Won bool
	At  int64
}

// towerCounted: in the window, one per id, play order, towerGapMs apart, towerPerDay a UTC day.
func towerCounted(w evWindow, rows []towerRow) []towerRow {
	in := append([]towerRow(nil), rows...)
	sort.SliceStable(in, func(i, j int) bool {
		if in[i].At != in[j].At {
			return in[i].At < in[j].At
		}
		return in[i].ID < in[j].ID
	})
	seen, perDay := map[string]bool{}, map[string]int{}
	last := int64(math.MinInt64 / 2)
	var out []towerRow
	for _, r := range in {
		day := utcDayOf(r.At)
		if seen[r.ID] || r.At < w.Start || r.At >= w.End || r.At-last < towerGapMs || perDay[day] >= towerPerDay {
			continue
		}
		perDay[day]++
		seen[r.ID], last = true, r.At
		out = append(out, r)
	}
	return out
}

type towerState struct{ Floor, Tops, Best, Fights, Wins int }

func towerOf(rows []towerRow) towerState {
	t := towerState{Floor: 1, Best: 1}
	for _, r := range rows {
		if r.Won {
			t.Wins++
			if t.Floor == towerFloors {
				t.Tops++
			} else {
				t.Floor++
			}
		} else {
			t.Floor = max(1, t.Floor-1)
		}
		t.Best = max(t.Best, t.Floor)
	}
	t.Fights = len(rows)
	return t
}

const towerSchema = `CREATE TABLE IF NOT EXISTS ev_tower (uid TEXT NOT NULL, event TEXT NOT NULL, id TEXT NOT NULL,
  won INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (uid, event, id));`

var reTowerID = regexp.MustCompile(`^tower:[A-Za-z0-9:_.\-]{1,80}$`)

func (s *store) towerLoad(uid, ev string, win evWindow) (*evPlayer, error) {
	p := &evPlayer{uid: uid, name: "PLAYER"}
	err := s.db.QueryRow(`SELECT name, updated FROM ev_state WHERE uid=? AND event=?`, uid, ev).Scan(&p.name, &p.updated)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}
	rows, err := s.db.Query(`SELECT id, won, at FROM ev_tower WHERE uid=? AND event=?`, uid, ev)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var all []towerRow
	for rows.Next() {
		var r towerRow
		var won int
		rows.Scan(&r.ID, &won, &r.At)
		r.Won = won == 1
		all = append(all, r)
	}
	p.tower = towerCounted(win, all)
	return p, rows.Err()
}

// towerApply: claimed fights are checked like campaign claims (ids, age, the previous sync,
// a fast clock shifted back), then the gap and daily limit; the floor is never accepted.
func (s *store) towerApply(uid, name string, body syncBody, def *evDef, win evWindow) (map[string]any, error) {
	now := s.now()
	open := now.UnixMilli() < win.End+evGrace.Milliseconds() && now.UnixMilli() >= win.Start
	p, err := s.towerLoad(uid, body.Event, win)
	if err != nil {
		return nil, err
	}
	if open {
		oldest := s.claimWindow(p)
		var claims []towerRow
		ahead := int64(0)
		for _, raw := range body.T {
			var row []json.RawMessage
			if json.Unmarshal(raw, &row) != nil || len(row) < 3 {
				continue
			}
			var r towerRow
			var won int
			if json.Unmarshal(row[0], &r.ID) != nil || json.Unmarshal(row[1], &won) != nil || json.Unmarshal(row[2], &r.At) != nil ||
				!reTowerID.MatchString(r.ID) || (won != 0 && won != 1) || r.At > now.Add(evSkew).UnixMilli() {
				continue
			}
			r.Won = won == 1
			ahead = max(ahead, r.At-now.UnixMilli())
			claims = append(claims, r)
		}
		sort.SliceStable(claims, func(i, j int) bool { return claims[i].At < claims[j].At })
		cur := append([]towerRow(nil), p.tower...)
		added := 0
		for _, c := range claims {
			if c.At -= ahead; c.At < oldest || added >= towerMaxNew || containsTower(cur, c.ID) {
				continue
			}
			next := towerCounted(win, append(append([]towerRow(nil), cur...), c))
			if !containsTower(next, c.ID) {
				continue
			}
			if _, err := s.db.Exec(`INSERT OR IGNORE INTO ev_tower(uid,event,id,won,at) VALUES(?,?,?,?,?)`, uid, body.Event, c.ID, b2i(c.Won), c.At); err != nil {
				return nil, err
			}
			cur = next
			added++
		}
		if p, err = s.towerLoad(uid, body.Event, win); err != nil {
			return nil, err
		}
		p.name = name
		p.openCells, p.guesses = []int{}, []string{}
		if err := s.evSave(body.Event, p); err != nil {
			return nil, err
		}
	}
	out := s.towerView(body.Event, win, p)
	out["closed"] = !open
	rv, err := s.towerRivals(body.Event, uid)
	if err != nil {
		return nil, err
	}
	out["rivals"] = rv
	return out, nil
}

func containsTower(l []towerRow, id string) bool {
	for _, r := range l {
		if r.ID == id {
			return true
		}
	}
	return false
}

func (s *store) towerView(ev string, win evWindow, p *evPlayer) map[string]any {
	t := make([][]any, len(p.tower))
	for i, r := range p.tower {
		t[i] = []any{r.ID, b2i(r.Won), r.At}
	}
	st := towerOf(p.tower)
	return map[string]any{"event": ev, "uid": p.uid, "t": t, "floor": st.Floor, "tops": st.Tops, "best": st.Best,
		"fights": st.Fights, "wins": st.Wins, "start": win.Start, "end": win.End, "rid": s.rid(ev, p.uid)}
}

type towerRivalOut struct {
	Rid    string `json:"rid"`
	Name   string `json:"name"`
	Floor  int    `json:"floor"`
	Tops   int    `json:"tops,omitempty"`
	Friend bool   `json:"friend,omitempty"`
}

var towerMemo = struct {
	sync.Mutex
	m map[string]towerMemoEntry
}{m: map[string]towerMemoEntry{}}

type towerMemoEntry struct {
	at     time.Time
	fights int
	v      []towerRivalOut
}

// towerRivals: friends first, then the nearest floors (more tops first), ties by uid; 10 at
// most. Only a name, a floor and the tops leave the server.
func (s *store) towerRivals(ev, me string) ([]towerRivalOut, error) {
	_, win, ok := parseEventID(ev)
	if !ok {
		return []towerRivalOut{}, nil
	}
	mine, err := s.towerLoad(me, ev, win)
	if err != nil {
		return nil, err
	}
	my := towerOf(mine.tower)
	key := me + "|" + ev
	towerMemo.Lock()
	if e, ok := towerMemo.m[key]; ok && e.fights == my.Fights && s.now().Sub(e.at) <= rivalTTL {
		towerMemo.Unlock()
		return e.v, nil
	}
	towerMemo.Unlock()
	rivalSem <- struct{}{}
	defer func() { <-rivalSem }()
	evRivalScans.Add(1)
	friends := s.friendsOf(me)
	rows, err := s.db.Query(`SELECT uid FROM ev_state WHERE event=? AND uid<>? ORDER BY updated DESC LIMIT ?`, ev, me, evRivalScan)
	if err != nil {
		return nil, err
	}
	var uids []string
	for rows.Next() {
		var u string
		rows.Scan(&u)
		uids = append(uids, u)
	}
	rows.Close()
	type cand struct {
		towerRivalOut
		uid string
	}
	var fr, rest []cand
	for _, u := range uids {
		p, err := s.towerLoad(u, ev, win)
		if err != nil {
			return nil, err
		}
		if len(p.tower) == 0 {
			continue
		}
		t := towerOf(p.tower)
		c := cand{towerRivalOut{Rid: s.rid(ev, u), Name: p.name, Floor: t.Floor, Tops: t.Tops}, u}
		if friends[u] {
			c.Friend = true
			fr = append(fr, c)
		} else {
			rest = append(rest, c)
		}
	}
	near := func(l []cand) {
		sort.SliceStable(l, func(i, j int) bool {
			di, dj := iabs(l[i].Floor-my.Floor), iabs(l[j].Floor-my.Floor)
			if di != dj {
				return di < dj
			}
			if l[i].Tops != l[j].Tops {
				return l[i].Tops > l[j].Tops
			}
			return l[i].uid < l[j].uid
		})
	}
	near(fr)
	near(rest)
	out := []towerRivalOut{}
	for _, c := range append(fr, rest...) {
		if len(out) >= 10 {
			break
		}
		out = append(out, c.towerRivalOut)
	}
	towerMemo.Lock()
	if len(towerMemo.m) > 5000 {
		towerMemo.m = map[string]towerMemoEntry{}
	}
	towerMemo.m[key] = towerMemoEntry{s.now(), my.Fights, out}
	towerMemo.Unlock()
	return out, nil
}

// ── STORY (js/events/story.js) ─────────────────────────────────────────────────────────
// Points walk the circles; only the circle counts are needed here (the text is client-side).

var storyCircles = [][]int{
	{13, 14, 14, 15, 15, 16}, // THE STOLEN BANDANA
	{12, 13, 14, 14, 15, 16}, // THE GREAT SPILL
	{12, 13, 14, 15, 15, 16}, // THE DRAWING DRAGON
}

func storyIndex(key string) int {
	y, _ := strconv.Atoi(key[:4])
	m, _ := strconv.Atoi(key[5:7])
	n := len(storyCircles)
	return ((y*12+m-1)%n + n) % n
}

// storyProgress: the chapter being walked (6 = finished) and the circle reached in it.
func storyProgress(story, points int) (chapter, circle int, done bool) {
	left := max(0, points)
	ch := storyCircles[story]
	for chapter < len(ch) && left >= ch[chapter] {
		left -= ch[chapter]
		chapter++
	}
	if chapter >= len(ch) {
		return chapter, 0, true
	}
	return chapter, left, false
}
