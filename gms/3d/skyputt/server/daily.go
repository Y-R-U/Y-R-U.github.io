package main

// The Daily Challenge pick, ported from js/daily/daily.js so the server can check that a
// submitted daily result names the hole + twist the game really gave that day (boards.go).
// Course data comes from dailypool.json, generated from the JS by tools/daily_pool.mjs;
// TestDailyPicksMatchJS compares this port with the JS picks for 460 days and every open-course
// set (testdata/daily_picks.json, same tool). Keep the two in step: see the RULE in that tool.

import (
	_ "embed"
	"encoding/json"
	"math"
	"strings"
	"sync"
	"time"
)

//go:embed dailypool.json
var dailyPoolJSON []byte

type poolHole struct {
	ID      string `json:"id"`
	Par     int    `json:"par"`
	Pickups int    `json:"pickups"`
}

type poolNine struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	From int    `json:"from"`
	To   int    `json:"to"`
}

type poolCourse struct {
	ID        string     `json:"id"`
	Name      string     `json:"name"`
	Locked    bool       `json:"locked"`
	DailyFrom string     `json:"dailyFrom"`
	Nines     []poolNine `json:"nines"`
	Holes     []poolHole `json:"holes"`
}

type dailyPoolData struct {
	Epoch   string       `json:"epoch"`
	Twists  []string     `json:"twists"`
	Courses []poolCourse `json:"courses"`
	Themes  []struct {
		ID        string `json:"id"`
		DailyFrom string `json:"dailyFrom"`
	} `json:"themes"`
}

type poolEntry struct {
	h      poolHole
	course int // index into pool.Courses
}

var (
	pool       dailyPoolData
	poolHoles  []poolEntry // allHoles(): every course's holes in COURSES order
	holeByID   = map[string]poolEntry{}
	courseByID = map[string]*poolCourse{}
	lockable   []string // ids of courses with lockedBy, in order
)

func init() {
	if err := json.Unmarshal(dailyPoolJSON, &pool); err != nil {
		panic("dailypool.json: " + err.Error())
	}
	for ci := range pool.Courses {
		c := &pool.Courses[ci]
		courseByID[c.ID] = c
		if c.Locked {
			lockable = append(lockable, c.ID)
		}
		for _, h := range c.Holes {
			e := poolEntry{h, ci}
			poolHoles = append(poolHoles, e)
			holeByID[h.ID] = e
		}
	}
}

// ---- js/ai/rng.js: FNV-1a over UTF-16 code units (all our strings are ASCII) + mulberry32
func hashStr(s string) uint32 {
	h := uint32(2166136261)
	for i := 0; i < len(s); i++ {
		h ^= uint32(s[i])
		h *= 16777619
	}
	return h
}

// unit = makeRng(hashStr(str))(): the first draw of mulberry32.
func unit(s string) float64 {
	st := hashStr(s) + 0x6D2B79F5
	t := st
	t = (t ^ (t >> 15)) * (t | 1)
	t ^= t + (t^(t>>7))*(t|61)
	return float64(t^(t>>14)) / 4294967296
}

// ---- js/events/calendar.js day maths on YYYY-MM-DD (UTC inside)
func parseYmd(s string) (time.Time, bool) {
	t, err := time.Parse("2006-01-02", s)
	return t, err == nil && t.Format("2006-01-02") == s
}

func addDays(ymd string, n int) string {
	t, _ := time.Parse("2006-01-02", ymd)
	return t.AddDate(0, 0, n).Format("2006-01-02")
}

func daysBetween(a, b string) int {
	ta, _ := time.Parse("2006-01-02", a)
	tb, _ := time.Parse("2006-01-02", b)
	return int(math.Round(tb.Sub(ta).Hours() / 24))
}

const (
	dailyRecent = 6
	dailyWindow = 28
)

func liveOn(ymd, from string) bool { return from == "" || from <= ymd }

func fullAt(d string) []poolEntry {
	out := make([]poolEntry, 0, len(poolHoles))
	for _, e := range poolHoles {
		if liveOn(d, pool.Courses[e.course].DailyFrom) {
			out = append(out, e)
		}
	}
	return out
}

func rawPick(ymd string, p []poolEntry, skip map[string]bool) (poolEntry, bool) {
	var best poolEntry
	bs, found := math.Inf(1), false
	for _, e := range p {
		if skip[e.h.ID] {
			continue
		}
		if s := unit("skyputt-daily:" + ymd + ":" + e.h.ID); s < bs {
			bs, best, found = s, e, true
		}
	}
	return best, found
}

func pickSkipping(d string, p []poolEntry, skip map[string]bool) poolEntry {
	if len(skip) < len(p) {
		if e, ok := rawPick(d, p, skip); ok {
			return e
		}
	}
	e, _ := rawPick(d, p, nil)
	return e
}

func lastSkip(seq []poolEntry) map[string]bool {
	skip := map[string]bool{}
	for i := max(0, len(seq)-dailyRecent); i < len(seq); i++ {
		skip[seq[i].h.ID] = true
	}
	return skip
}

var (
	pickMu    sync.Mutex
	pickCache = map[string]poolEntry{}
)

func cached(k string, f func() poolEntry) poolEntry {
	pickMu.Lock()
	e, ok := pickCache[k]
	pickMu.Unlock()
	if ok {
		return e
	}
	e = f()
	pickMu.Lock()
	if len(pickCache) > 20000 {
		pickCache = map[string]poolEntry{}
	}
	pickCache[k] = e
	pickMu.Unlock()
	return e
}

// walkPick: the global pick of ymd (every course open).
func walkPick(ymd string) poolEntry {
	return cached("G|"+ymd, func() poolEntry {
		var seq []poolEntry
		for k := dailyWindow; k >= 0; k-- {
			d := addDays(ymd, -k)
			seq = append(seq, pickSkipping(d, fullAt(d), lastSkip(seq)))
		}
		return seq[len(seq)-1]
	})
}

// pickFor: the pick for a player whose open lockable courses are `open` (pickFor in daily.js).
func pickFor(ymd string, open map[string]bool, key string) poolEntry {
	if key == "" {
		return walkPick(ymd)
	}
	isOpen := func(c *poolCourse) bool { return !c.Locked || open[c.ID] }
	return cached("R|"+key+"|"+ymd, func() poolEntry {
		var seq []poolEntry
		for k := dailyWindow; k >= 0; k-- {
			d := addDays(ymd, -k)
			gp := walkPick(d)
			var p []poolEntry
			in := map[string]bool{}
			for _, e := range fullAt(d) {
				if isOpen(&pool.Courses[e.course]) {
					p = append(p, e)
					in[e.h.ID] = true
				}
			}
			if in[gp.h.ID] {
				seq = append(seq, gp)
				continue
			}
			skip := lastSkip(seq)
			for j := 1; j <= dailyRecent; j++ {
				if f := walkPick(addDays(d, j)); in[f.h.ID] {
					skip[f.h.ID] = true
				}
			}
			if len(p) == 0 {
				seq = append(seq, gp)
			} else {
				seq = append(seq, pickSkipping(d, p, skip))
			}
		}
		return seq[len(seq)-1]
	})
}

// twistOK mirrors TWISTS[].ok in daily.js.
func twistOK(id string, h poolHole) bool {
	switch id {
	case "birdie", "kit":
		return h.Par >= 3
	case "crystals":
		return h.Pickups >= 1
	}
	return true
}

func twistFor(ymd string, h poolHole) string {
	var tw []string
	for _, id := range pool.Twists {
		if twistOK(id, h) {
			tw = append(tw, id)
		}
	}
	return tw[int(math.Floor(unit("skyputt-twist:"+ymd+":"+h.ID)*float64(len(tw))))]
}

func themeFor(ymd string) string {
	var th []string
	for _, t := range pool.Themes {
		if liveOn(ymd, t.DailyFrom) {
			th = append(th, t.ID)
		}
	}
	return th[int(math.Floor(unit("skyputt-theme:"+ymd)*float64(len(th))))]
}

type dailyPick struct {
	Hole, Twist, Theme, Course string
	Par, Pickups, N            int
}

// dailyForSet = dailyFor(ymd, { open }) where `open` lists the player's open lockable courses.
func dailyForSet(ymd string, open []string) dailyPick {
	om := map[string]bool{}
	for _, c := range open {
		om[c] = true
	}
	// the key names the live courses this player has open; all of them open → the global pick
	var cs, openCs []string
	seen := map[string]bool{}
	for _, e := range fullAt(ymd) {
		c := &pool.Courses[e.course]
		if seen[c.ID] {
			continue
		}
		seen[c.ID] = true
		cs = append(cs, c.ID)
		if !c.Locked || om[c.ID] {
			openCs = append(openCs, c.ID)
		}
	}
	key := ""
	if len(openCs) != len(cs) {
		key = strings.Join(openCs, ",")
	}
	e := pickFor(ymd, om, key)
	return dailyPick{Hole: e.h.ID, Twist: twistFor(ymd, e.h), Theme: themeFor(ymd), Course: pool.Courses[e.course].ID,
		Par: e.h.Par, Pickups: e.h.Pickups, N: daysBetween(pool.Epoch, ymd) + 1}
}

// dailyAllowed: every (hole → twist) a player could have been given on ymd, over all
// open-course sets (a locked player gets a fallback hole; the hole is frozen once a try starts).
func dailyAllowed(ymd string) map[string]dailyPick {
	out := map[string]dailyPick{}
	for m := 0; m < 1<<len(lockable); m++ {
		var open []string
		for i, c := range lockable {
			if m&(1<<i) != 0 {
				open = append(open, c)
			}
		}
		p := dailyForSet(ymd, open)
		out[p.Hole] = p
	}
	return out
}
