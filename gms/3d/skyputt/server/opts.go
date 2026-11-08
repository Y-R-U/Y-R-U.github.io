package main

// Room options: what the host picks (PLAN 2.9) and how the server cleans them.

import (
	"math"
	"regexp"
	"sort"
	"strings"
)

const (
	minPlayers = 2
	maxPlayers = 8
	maxHoles   = 18
	maxAISkill = 0.9  // D14: skill 1 finds inhuman hole-in-one lines
	minAISkill = 0.05 // below this the planner just wanders
	maxHelperN = 5
)

var shotClocks = []int{0, 20, 30, 45, 60}

// AI personalities (js/ai/golfers.js PERSONALITIES) and the names their seats get.
var personalities = map[string]string{
	"carl": "Careful Carl", "bertha": "Big Bertha", "banks": "Banks", "lou": "Lucky Lou",
	"pro": "The Pro", "professor": "The Professor", "zoe": "Zippy Zoe", "mags": "Old Mags",
}

// "any" picks from these (Mags is the story's final boss, she only plays when asked for).
var anyPersonalities = []string{"carl", "bertha", "banks", "lou", "pro", "professor", "zoe"}

func personalityIDs() []string {
	out := make([]string, 0, len(personalities)+1)
	for k := range personalities {
		out = append(out, k)
	}
	sort.Strings(out)
	return append(out, "any")
}

var idRe = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,31}$`)

type HoleRef struct {
	ID  string `json:"id"`
	Par int    `json:"par"`
}

type HelperOpts struct {
	Mode string `json:"mode"` // off | fixed (everyone starts with N of each) | own (your own inventory)
	N    int    `json:"n"`
}

type AIOpts struct {
	Count       int     `json:"count"`       // ghost AIs added at start (capped by free seats)
	Personality string  `json:"personality"` // a personality id or "any"
	Skill       float64 `json:"skill"`       // 0..0.9 (D14)
}

type RoomOpts struct {
	Name       string     `json:"name"`
	Public     bool       `json:"public"`
	Course     string     `json:"course"`
	CourseName string     `json:"courseName"`
	Holes      []HoleRef  `json:"holes"`
	Theme      string     `json:"theme"`
	Max        int        `json:"max"`
	Helpers    HelperOpts `json:"helpers"`
	ShotClock  int        `json:"shotClock"` // seconds per shot, 0 = off
	AI         AIOpts     `json:"ai"`
	Collide    bool       `json:"collide"` // ball hits: balls knock each other (notes/ballhit.md); false = pass through
}

func finite(v float64) bool { return !math.IsNaN(v) && !math.IsInf(v, 0) }

func clampF(v, lo, hi float64) float64 {
	if !finite(v) {
		return lo
	}
	return math.Max(lo, math.Min(hi, v))
}

// cleanOpts validates o, returning the cleaned options or an error code. Holes are client
// data ({id, par}); the server only checks their shape (every client ships the same holes,
// and an unknown id makes the joining client refuse with "update the game").
func cleanOpts(o RoomOpts) (RoomOpts, string) {
	if !idRe.MatchString(o.Course) {
		return o, "bad_course"
	}
	if !idRe.MatchString(o.Theme) {
		return o, "bad_theme"
	}
	if len(o.Holes) < 1 || len(o.Holes) > maxHoles {
		return o, "bad_holes"
	}
	seen := map[string]bool{}
	for _, h := range o.Holes {
		if !idRe.MatchString(h.ID) || h.Par < 1 || h.Par > 8 || seen[h.ID] {
			return o, "bad_holes"
		}
		seen[h.ID] = true
	}
	if o.Max < minPlayers || o.Max > maxPlayers {
		return o, "bad_max"
	}
	switch o.Helpers.Mode {
	case "off", "own":
		o.Helpers.N = 0
	case "fixed":
		if o.Helpers.N < 1 || o.Helpers.N > maxHelperN {
			return o, "bad_helpers"
		}
	default:
		return o, "bad_helpers"
	}
	ok := false
	for _, c := range shotClocks {
		ok = ok || c == o.ShotClock
	}
	if !ok {
		return o, "bad_clock"
	}
	if o.AI.Personality == "" {
		o.AI.Personality = "any"
	}
	if _, known := personalities[o.AI.Personality]; !known && o.AI.Personality != "any" {
		return o, "bad_ai"
	}
	if o.AI.Count < 0 || o.AI.Count > maxPlayers-1 {
		return o, "bad_ai"
	}
	o.AI.Skill = math.Round(clampF(o.AI.Skill, minAISkill, maxAISkill)*100) / 100
	o.Name = strings.TrimSpace(o.Name)
	if o.Name != "" {
		n, err := cleanName(o.Name)
		if err != nil {
			return o, "bad_name"
		}
		o.Name = n
	}
	o.CourseName = strings.TrimSpace(o.CourseName)
	if o.CourseName != "" {
		if n, err := cleanName(o.CourseName); err == nil {
			o.CourseName = n
		} else {
			o.CourseName = ""
		}
	}
	return o, ""
}

// Shot modifiers (helpers armed for one shot) as relayed to the other clients for replay.
type Mods struct {
	Magnet bool `json:"magnet,omitempty"`
	Sticky bool `json:"sticky,omitempty"`
	Guard  bool `json:"guard,omitempty"`
	Ghost  bool `json:"ghost,omitempty"`
	Steady bool `json:"steady,omitempty"`
	Power  bool `json:"power,omitempty"`
	Sight  int  `json:"sight,omitempty"` // Long Sight stacks (0..3), counts as uses
}

// uses lists the helpers a shot spends (helper id → count), matching js/meta/helpers.js ids.
func (m Mods) uses() map[string]int {
	u := map[string]int{}
	add := func(on bool, id string) {
		if on {
			u[id]++
		}
	}
	add(m.Magnet, "magnet")
	add(m.Sticky, "sticky")
	add(m.Guard, "guard")
	add(m.Ghost, "ghost")
	add(m.Steady, "steady")
	add(m.Power, "power")
	if m.Sight > 0 {
		u["longSight"] = m.Sight
	}
	return u
}

// BallState is the shooter's ball before the shot (round.js ballState): position plus the
// support flags, so a replay starts from exactly the same state.
type BallState struct {
	X    float64    `json:"x"`
	Y    float64    `json:"y"`
	Z    float64    `json:"z"`
	Sup  bool       `json:"sup"`
	N    [3]float64 `json:"n"`
	Surf int        `json:"surf"`
}

func (b BallState) ok() bool {
	for _, v := range []float64{b.X, b.Y, b.Z, b.N[0], b.N[1], b.N[2]} {
		if !finite(v) || math.Abs(v) > 1000 {
			return false
		}
	}
	return b.Surf >= 0 && b.Surf < 64
}

// BallRef: another seat's resting ball a shot was simulated against (relayed for exact replays).
type BallRef struct {
	Seat int     `json:"seat"`
	N    int     `json:"n"` // that seat's shot number when the shot was taken
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	Z    float64 `json:"z"`
}

// Knock: where a shot left another seat's ball (reported with the shooter's result).
type Knock struct {
	Seat  int       `json:"seat"`
	State string    `json:"state"` // rest | cup | oob (oob = back to where it was, no penalty)
	To    []float64 `json:"to"`
}

const maxBallRefs = maxPlayers - 1

func okVec(v []float64) bool {
	if len(v) != 3 {
		return false
	}
	for _, x := range v {
		if !finite(x) || math.Abs(x) > 1000 {
			return false
		}
	}
	return true
}
