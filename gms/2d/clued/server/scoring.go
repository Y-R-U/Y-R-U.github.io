package main

import (
	"encoding/json"
	"math"
	"strings"
)

// Per DESIGN.md: untimed 100 per correct; timed 100 + round(400*remaining/limit)
// capped at 500; formats with partial credit (ladder, pin drop…) send their own
// points; +10% per correct answer in a row after the first, capped at +50%.

const maxBase = 500

// Formats whose score depends on more than right/wrong; the client's points are used (clamped).
var partialFormats = map[string]bool{
	"ladder": true, "pin-drop": true, "number": true, "blitz60": true, "match": true,
	"connect": true, "sort": true, "neighbours": true, "order": true, "chain": true,
}

// Long-form formats get a longer default limit in rooms.
var longFormats = map[string]int{
	"connect": 120000, "blitz60": 60000, "match": 60000, "ladder": 60000, "sort": 45000,
	"neighbours": 45000, "order": 40000, "chain": 60000, "pin-drop": 30000, "type": 30000,
}

const defaultLimit = 20000

type qMeta struct {
	Format  string
	Answer  json.RawMessage
	LimitMs int
	Stages  int // progressive question: stages 0…Stages-1 (0/1 = not progressive)
}

func parseMeta(raw json.RawMessage) qMeta {
	var q struct {
		Format    string          `json:"format"`
		Answer    json.RawMessage `json:"answer"`
		TimeLimit float64         `json:"timeLimit"`
		Stages    int             `json:"stages"`
	}
	json.Unmarshal(raw, &q)
	m := qMeta{Format: q.Format, Answer: q.Answer, Stages: max(0, min(q.Stages, 50))}
	// timeLimit may be seconds (small numbers) or ms.
	switch {
	case q.TimeLimit <= 0:
		if v, ok := longFormats[q.Format]; ok {
			m.LimitMs = v
		} else {
			m.LimitMs = defaultLimit
		}
	case q.TimeLimit < 1000:
		m.LimitMs = int(q.TimeLimit * 1000)
	default:
		m.LimitMs = int(q.TimeLimit)
	}
	m.LimitMs = max(3000, min(m.LimitMs, 300000))
	return m
}

// verifyCorrect overrides the client's claim only where the server can check:
// mc (given = option index) and tf (given = bool).
func verifyCorrect(m qMeta, given json.RawMessage, claimed bool) bool {
	if m.Format != "mc" && m.Format != "tf" || len(m.Answer) == 0 || len(given) == 0 {
		return claimed
	}
	var a, g any
	if json.Unmarshal(m.Answer, &a) != nil || json.Unmarshal(given, &g) != nil {
		return claimed
	}
	switch av := a.(type) {
	case string:
		if gv, ok := g.(string); ok {
			return strings.EqualFold(strings.TrimSpace(av), strings.TrimSpace(gv))
		}
	case bool:
		if gv, ok := g.(bool); ok {
			return av == gv
		}
	case float64: // mc answers are option indices
		if gv, ok := g.(float64); ok {
			return av == gv
		}
	}
	return claimed
}

// basePoints is the score before the streak bonus.
func basePoints(format string, correct bool, clientPoints *float64, ms, limitMs int, timed bool) int {
	if partialFormats[format] && clientPoints != nil {
		p := *clientPoints
		if math.IsNaN(p) || p < 0 {
			return 0
		}
		return int(math.Min(p, maxBase))
	}
	if !correct {
		return 0
	}
	if !timed || limitMs <= 0 {
		return 100
	}
	rem := float64(limitMs - ms)
	if rem < 0 {
		rem = 0
	}
	return min(maxBase, 100+int(math.Round(400*rem/float64(limitMs))))
}

// withStreak applies the bonus for a streak that already includes this answer.
func withStreak(base, streak int) int {
	if streak <= 1 || base == 0 {
		return base
	}
	pct := min(50, 10*(streak-1))
	return int(math.Round(float64(base) * float64(100+pct) / 100))
}

// stageMultiplier per CONTRACT "Progressive stages": 1 at stage 0 down to 0.4 at the last stage.
func stageMultiplier(stage, n int) float64 {
	if n < 2 {
		return 1
	}
	return 1 - 0.6*float64(min(stage, n-1))/float64(n-1)
}

// Progressive timing: initial = answer time × 1.5 (min 10 s); each stage advance extends to
// max(deadline, advance + max(5 s, answer/2)); capped at 90 s from the question start.
const (
	progressiveInitial = 10000
	stageExtendMin     = 5000
	progressiveCap     = 90000
)
