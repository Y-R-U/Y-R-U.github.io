package main

import (
	"encoding/json"
	"strings"
	"unicode"
)

// Pilot voice ids from docs/CONTRACT.md. Roster order is the fallback order.
var voiceRoster = []string{
	"toff", "duchess", "bubba", "darlene", "wingco", "geezer", "sheila", "laird",
	"heiress", "comte", "baronin", "tex", "nan", "prince", "charmer",
}

func isVoice(v string) bool {
	for _, x := range voiceRoster {
		if x == v {
			return true
		}
	}
	return false
}

// Mirrors docs/DESIGN.md §3.3 until data/modes.js exists; the server only
// checks shape, the host's game reads the meaning and applies type locks.
var (
	roomTypes   = []string{"court", "rumble", "coronation", "strict", "garden", "joust", "open"}
	protections = []string{"rubber", "partial", "realistic"}
	densities   = []string{"none", "light", "busy", "chaos"}
	voiceModes  = []string{"first_come", "duplicates_allowed"}
)

const (
	roomCap     = 8
	maxAircraft = 24
)

type settings struct {
	Type         string   `json:"type"`
	Aircraft     []string `json:"aircraft"` // allowed class ids or one fixed type id; empty = what the type allows
	Protection   string   `json:"protection"`
	PartialStart int      `json:"partialStart"` // starting impossiRubber % in partial mode: 50/75/100
	Traffic      string   `json:"traffic"`
	MaxPlayers   int      `json:"maxPlayers"`
	Voices       string   `json:"voices"`
}

func oneOf(v string, list []string, def string) string {
	for _, x := range list {
		if x == v {
			return v
		}
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

func cleanSettings(raw json.RawMessage) settings {
	var s settings
	json.Unmarshal(raw, &s)
	s.Type = oneOf(s.Type, roomTypes, "court")
	s.Protection = oneOf(s.Protection, protections, "partial")
	if s.PartialStart != 50 && s.PartialStart != 75 {
		s.PartialStart = 100
	}
	s.Traffic = oneOf(s.Traffic, densities, "busy")
	s.Voices = oneOf(s.Voices, voiceModes, "first_come")
	if s.MaxPlayers == 0 {
		s.MaxPlayers = roomCap
	}
	s.MaxPlayers = clamp(s.MaxPlayers, 2, roomCap)
	ac := []string{}
	seen := map[string]bool{}
	for _, a := range s.Aircraft {
		if id := cleanID(a); id != "" && !seen[id] && len(ac) < maxAircraft {
			seen[id] = true
			ac = append(ac, id)
		}
	}
	s.Aircraft = ac
	return s
}

// Pilot names match the 14-char livery; room names get 24 (DESIGN §3.3).
func cleanName(s, def string) string { return cleanText(s, def, 14) }

func cleanText(s, def string, max int) string {
	out := []rune{}
	for _, r := range strings.TrimSpace(s) {
		if unicode.IsPrint(r) && r != '<' && r != '>' {
			out = append(out, r)
		}
		if len(out) == max {
			break
		}
	}
	if len(out) == 0 {
		return def
	}
	return string(out)
}
