package main

import (
	"encoding/json"
	"strings"
	"unicode"
)

// Pilot voice ids (data/voices.json pilots). Roster order is the fallback order.
var voiceRoster = []string{
	"toff", "duchess", "bubba", "darlene", "wingco", "geezer", "sheila", "laird",
	"heiress", "comte", "baronin", "tex", "nan", "prince", "charmer",
}

// data/ranks.js order. Hosting gates read this on trust (DECISIONS D5).
var rankOrder = []string{"baron", "viscount", "earl", "marquess", "duke", "archduke", "prince", "crownprince", "king", "emperor"}

func rankIndex(id string) int {
	for i, r := range rankOrder {
		if r == id {
			return i
		}
	}
	return 0
}

func isVoice(v string) bool { return indexOf(voiceRoster, v) >= 0 }

func indexOf(list []string, v string) int {
	for i, x := range list {
		if x == v {
			return i
		}
	}
	return -1
}

// Mirrors data/modes.js HOST_OPTIONS. The server checks shape and range only;
// the host's game applies each room type's fixed values.
var (
	roomTypes    = []string{"court", "rumble", "coronation", "strict", "garden", "joust", "open"}
	protections  = []string{"rubber", "partial", "realistic"}
	densities    = []string{"none", "light", "busy", "chaos"}
	voiceModes   = []string{"first_come", "duplicates_allowed"}
	runways      = []string{"wind", "27", "09", "04", "22"}
	minuteSteps  = []int{5, 8, 10, 12, 15, 0}
	targetSteps  = []int{3000, 5000, 8000, 12000}
	outrageSteps = []float64{0.5, 1, 1.5}
	decreeIDs    = []string{"all_bathtubs", "tower_on_strike", "crosswind_open", "double_points_final_minute"}
	typeMinutes  = map[string]int{"court": 10, "rumble": 8, "coronation": 0, "strict": 12, "garden": 10, "joust": 0, "open": 0}
)

const (
	roomCap       = 8
	maxAircraft   = 24
	hostRankedMin = "duke"
	decreeMinRank = "king"
)

type settings struct {
	Type         string   `json:"type"`
	Aircraft     []string `json:"aircraft"` // allowed class ids or one fixed type id; empty = what the type allows
	Protection   string   `json:"protection"`
	PartialStart int      `json:"partialStart"`
	Traffic      string   `json:"traffic"`
	MaxPlayers   int      `json:"maxPlayers"`
	Voices       string   `json:"voices"`
	Runway       string   `json:"runway"`
	Minutes      int      `json:"minutes"`
	Target       int      `json:"target"`
	OutrageGain  float64  `json:"outrageGain"`
	Decrees      []string `json:"decrees"`
	Ranked       bool     `json:"ranked"`
}

type rawSettings struct {
	settings
	Minutes *int `json:"minutes"`
}

func oneOf(v string, list []string, def string) string {
	if indexOf(list, v) >= 0 {
		return v
	}
	return def
}

func clamp(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func cleanID(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	if len(s) == 0 || len(s) > 24 {
		return ""
	}
	for _, r := range s {
		if !(r >= 'a' && r <= 'z' || r >= '0' && r <= '9' || r == '_' || r == '-' || r == ':') {
			return ""
		}
	}
	return s
}

// cleanSettings: hostRank gates ranked rooms (Duke+) and Royal Decrees (King+), on trust.
func cleanSettings(raw json.RawMessage, hostRank string) settings {
	var in rawSettings
	if len(raw) <= 2048 {
		json.Unmarshal(raw, &in)
	}
	s := in.settings
	s.Type = oneOf(s.Type, roomTypes, "court")
	s.Protection = oneOf(s.Protection, protections, "partial")
	if s.PartialStart != 50 && s.PartialStart != 75 {
		s.PartialStart = 100
	}
	s.Traffic = oneOf(s.Traffic, densities, "busy")
	s.Voices = oneOf(s.Voices, voiceModes, "first_come")
	s.Runway = oneOf(s.Runway, runways, "wind")
	if s.MaxPlayers == 0 {
		s.MaxPlayers = roomCap
	}
	s.MaxPlayers = clamp(s.MaxPlayers, 2, roomCap)
	if s.Type == "joust" {
		s.MaxPlayers = 2
	}
	s.Minutes = typeMinutes[s.Type]
	if in.Minutes != nil && indexOf(intsToStr(minuteSteps), itoa(*in.Minutes)) >= 0 {
		s.Minutes = *in.Minutes
	}
	if indexOf(intsToStr(targetSteps), itoa(s.Target)) < 0 {
		s.Target = 5000
	}
	g := 1.0
	for _, x := range outrageSteps {
		if s.OutrageGain == x {
			g = x
		}
	}
	s.OutrageGain = g
	ac := []string{}
	seen := map[string]bool{}
	for _, a := range s.Aircraft {
		if id := cleanID(a); id != "" && !seen[id] && len(ac) < maxAircraft {
			seen[id] = true
			ac = append(ac, id)
		}
	}
	s.Aircraft = ac
	dec := []string{}
	if rankIndex(hostRank) >= rankIndex(decreeMinRank) {
		for _, d := range s.Decrees {
			if indexOf(decreeIDs, d) >= 0 && indexOf(dec, d) < 0 {
				dec = append(dec, d)
			}
		}
	}
	s.Decrees = dec
	if rankIndex(hostRank) < rankIndex(hostRankedMin) {
		s.Ranked = false
	}
	return s
}

func intsToStr(xs []int) []string {
	out := make([]string, len(xs))
	for i, x := range xs {
		out[i] = itoa(x)
	}
	return out
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	s := ""
	for n > 0 {
		s = string(rune('0'+n%10)) + s
		n /= 10
	}
	if neg {
		s = "-" + s
	}
	return s
}

// Pilot names match the 14-char livery; room names get 24 (DESIGN §3.3).
func cleanName(s, def string) string {
	out := cleanText(s, "", 14)
	if out == "" || isProfane(out) {
		return def
	}
	return out
}

func cleanText(s, def string, max int) string {
	out := []rune{}
	space := false
	for _, r := range strings.TrimSpace(s) {
		if unicode.IsSpace(r) {
			space = true
			continue
		}
		if !unicode.IsPrint(r) || r == '<' || r == '>' || unicode.Is(unicode.Cf, r) {
			continue
		}
		if space && len(out) > 0 {
			out = append(out, ' ')
		}
		space = false
		out = append(out, r)
		if len(out) >= max {
			break
		}
	}
	if len(out) == 0 {
		return def
	}
	return string(out)
}

func cleanRoomName(s, def string) string {
	out := cleanText(s, "", 24)
	if out == "" || isProfane(out) {
		return def
	}
	return out
}
