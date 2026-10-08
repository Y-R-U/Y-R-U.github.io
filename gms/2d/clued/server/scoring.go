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
	Stages  int     // progressive question: stages 0…Stages-1 (0/1 = not progressive)
	StepMs  int     // online auto-advance interval (progressive, not kids)
	Round   int     // spec round index (question.round)
	TScale  float64 // the format's answer-time stretch, resolved by the client (question.tscale)
	// listen: host-chosen clip length (s), artwork mode and replays allowed (-1 = unlimited), from question.data
	ClipLen    float64
	Art        string
	MaxReplays int
}

// listen point factors (js/audio/listen.js): shorter clips and artwork off score more; each replay ×0.85.
var listenClipMul = map[float64]float64{1: 2, 2: 1.7, 3: 1.5, 5: 1.25, 10: 1, 15: 0.85, 30: 0.7}
var listenArtMul = map[string]float64{"off": 1, "blur": 0.85, "on": 0.65}

const replayMul = 0.85

// listenFactors: clip × artwork multipliers and the replays that count (clamped to what the question allows).
func listenFactors(m qMeta, replays *int) (clipMul, artMul float64, reps int) {
	clipMul, artMul = 1, 1
	if v, ok := listenClipMul[m.ClipLen]; ok {
		clipMul = v
	}
	if v, ok := listenArtMul[m.Art]; ok {
		artMul = v
	}
	if replays != nil && m.MaxReplays >= 0 {
		reps = max(0, min(*replays, m.MaxReplays))
	}
	return
}

func parseMeta(raw json.RawMessage) qMeta {
	var q struct {
		Format    string          `json:"format"`
		Answer    json.RawMessage `json:"answer"`
		TimeLimit float64         `json:"timeLimit"`
		Stages    int             `json:"stages"`
		Round     int             `json:"round"`
		TScale    float64         `json:"tscale"`
		Data      struct {
			Len     float64 `json:"len"`
			Art     string  `json:"art"`
			Replays *int    `json:"replays"`
		} `json:"data"`
	}
	json.Unmarshal(raw, &q)
	m := qMeta{Format: q.Format, Answer: q.Answer, Stages: max(0, min(q.Stages, 50)), Round: max(0, q.Round), TScale: 1,
		ClipLen: q.Data.Len, Art: q.Data.Art, MaxReplays: 2}
	if q.Data.Replays != nil {
		m.MaxReplays = *q.Data.Replays
	}
	if q.TScale > 1 {
		m.TScale = min(q.TScale, maxTScale)
	}
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

// Online rooms: progressive stages auto-advance for everyone (no voting). The window fits the stages at a per-format
// pace plus a tail after the last stage; the deadline is fixed when the question opens. Mirrors js/core/scoring.js.
var stageStepMs = map[string]int{"ladder": 4500, "silhouette": 5000}

func autoStages(format string, n, answerMs int) (limit, step int) {
	tail := min(8000, max(5000, int(math.Round(float64(answerMs)/2))))
	pace, ok := stageStepMs[format]
	if !ok {
		pace = 4000
	}
	limit = min(progressiveCap, max(progressiveInitial, int(math.Round(float64(answerMs)*1.5)), (n-1)*pace+tail))
	step = (limit - tail) / (n - 1)
	return
}

func dueStage(elapsed int64, n, step int) int {
	if elapsed <= 0 || step <= 0 {
		return 0
	}
	return min(n-1, int(elapsed/int64(step)))
}

// answerMs is the answer time used for speed points, measured against the server's question start. The client's
// clock-corrected ms (taken at the tap) is used when it is plausible: never more than 300 ms past the server's receive
// time, and never more than maxTransitMs before it (a client whose clock estimate runs behind can't buy speed).
// Two players who tap at the same real moment therefore score the same, whatever their media or network did.
func answerMs(serverMs int, client *float64, limitMs int) int {
	ms := serverMs
	if client != nil && *client >= 0 && !math.IsNaN(*client) {
		ms = max(serverMs-maxTransitMs, min(int(*client), serverMs+300))
		if int(*client) > serverMs+300 {
			ms = serverMs
		}
	}
	return max(0, min(ms, limitMs))
}
