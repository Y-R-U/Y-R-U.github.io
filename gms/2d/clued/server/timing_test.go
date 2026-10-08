package main

import (
	"fmt"
	"testing"
	"time"
)

// Regression tests for docs/notes/TIMING.md: stale host "next" taps, media-ready holds, speed fairness,
// the per-answer points breakdown and the room's streak-bonus setting. HTTP only, literal numbers, so the
// file also compiles against the pre-fix server (that's how the "fails on the old code" check was run).

// listenQ mirrors the 4XG4W questions: listen, "grow the clip" (5 stages), timeLimit 35 s.
func listenQ(i, round int) map[string]any {
	return map[string]any{"format": "listen", "id": fmt.Sprint("l", i), "prompt": "Name this song", "answer": 0,
		"options": []string{"A", "B", "C", "D"}, "timeLimit": 35000, "stages": 5, "round": round}
}

func timingRoom(t *testing.T, qs []any, extra map[string]any) (code, hk, k1 string) {
	t.Helper()
	resetLimits()
	clearRooms()
	body := map[string]any{"hostName": "H", "answerSec": 10, "gapSec": 5, "questions": qs}
	for k, v := range extra {
		body[k] = v
	}
	r := call(t, "POST", "/rooms", body)
	if r.code != 200 {
		t.Fatalf("create: %v", r.body)
	}
	code, hk = r.body["code"].(string), r.body["hostKey"].(string)
	k1, _ = join(t, code, "P")
	return
}

func answerAt(t *testing.T, code, key string, q int, correct bool, ms float64) resp {
	t.Helper()
	return call(t, "POST", "/rooms/"+code+"/answer", map[string]any{"key": key, "q": q, "given": 0, "correct": correct, "ms": ms})
}

func nowOf(st map[string]any) int { return num(st["now"]) }

// Bug 1: the gap timer opens question N+1, then the host's "Next question ›" / "Round 2 ›" tap (sent while the
// old reveal card was still on screen) lands in phase "question" and used to reveal N+1 during its lead-in:
// both players saw "Time's up" at the start of the question with no answer recorded.
func TestStaleNextDoesNotEndNewQuestion(t *testing.T) {
	code, hk, k1 := timingRoom(t, []any{listenQ(0, 0), listenQ(1, 0), listenQ(2, 1), listenQ(3, 1)}, nil)
	call(t, "POST", "/rooms/"+code+"/start", map[string]any{"key": hk})
	advance(8 * time.Second) // 3 s lead-in + 5 s round card
	answerAt(t, code, hk, 0, true, 2000)
	answerAt(t, code, k1, 0, true, 2000)
	if st := state(t, code, hk); st["phase"] != "reveal" || num(st["q"]) != 0 {
		t.Fatalf("q0 revealed when both answered: %v %v", st["phase"], st["q"])
	}
	// the 5 s gap runs out: the server opens q1 …
	advance(5 * time.Second)
	tickRooms()
	if st := state(t, code, hk); st["phase"] != "question" || num(st["q"]) != 1 {
		t.Fatalf("gap → q1: %v %v", st["phase"], st["q"])
	}
	// … and the host's tap on the still-visible "Next question ›" arrives 100 ms later
	advance(100 * time.Millisecond)
	st := call(t, "POST", "/rooms/"+code+"/next", map[string]any{"key": hk, "q": 0}).body
	if st["phase"] != "question" || num(st["q"]) != 1 {
		t.Fatalf("stale next (q:0) must not end q1: phase=%v q=%v", st["phase"], st["q"])
	}
	st = call(t, "POST", "/rooms/"+code+"/next", map[string]any{"key": hk}).body // an old client sends no q
	if st["phase"] != "question" || num(st["q"]) != 1 {
		t.Fatalf("next without q during the lead-in must not end q1: phase=%v q=%v", st["phase"], st["q"])
	}
	// both can still answer q1 once it opens: nobody was auto-answered
	advance(3 * time.Second)
	if a := answerAt(t, code, hk, 1, true, 1500); a.code != 200 {
		t.Fatalf("host answers q1: %v", a.body)
	}
	if a := answerAt(t, code, k1, 1, true, 1500); a.code != 200 {
		t.Fatalf("player answers q1: %v", a.body)
	}
	// "Round 2 ›" pressed early during the reveal still advances, with the round card lead-in
	st = call(t, "POST", "/rooms/"+code+"/next", map[string]any{"key": hk, "q": 1}).body
	if st["phase"] != "question" || num(st["q"]) != 2 || num(st["qStart"])-nowOf(st) != 8000 {
		t.Fatalf("early Round 2 › advances with the 8 s card: %v q=%v lead=%d", st["phase"], st["q"], num(st["qStart"])-nowOf(st))
	}
	// a double tap on it is ignored, even after the question has opened
	advance(8500 * time.Millisecond)
	tickRooms()
	st = call(t, "POST", "/rooms/"+code+"/next", map[string]any{"key": hk, "q": 1}).body
	if st["phase"] != "question" || num(st["q"]) != 2 {
		t.Fatalf("double tap ignored: %v %v", st["phase"], st["q"])
	}
	// a deliberate skip names the open question
	st = call(t, "POST", "/rooms/"+code+"/next", map[string]any{"key": hk, "q": 2}).body
	if st["phase"] != "reveal" || num(st["q"]) != 2 {
		t.Fatalf("explicit skip of the open question: %v %v", st["phase"], st["q"])
	}
}

// Media must not eat the answer window: a client still loading the clip holds the opening (≤ 5 s cap).
func TestReadyHold(t *testing.T) {
	code, hk, k1 := timingRoom(t, []any{listenQ(0, 0), listenQ(1, 0), listenQ(2, 0)}, nil)
	for _, k := range []string{hk, k1} { // clients announce they report readiness
		if r := call(t, "POST", "/rooms/"+code+"/ready", map[string]any{"key": k, "q": -1}); r.code != 200 {
			t.Fatalf("ready endpoint: %d %v", r.code, r.body)
		}
	}
	st := call(t, "POST", "/rooms/"+code+"/start", map[string]any{"key": hk}).body
	lead := num(st["qStart"])
	call(t, "POST", "/rooms/"+code+"/ready", map[string]any{"key": hk, "q": 0})
	advance(2200 * time.Millisecond)
	tickRooms()
	if st = state(t, code, hk); st["hold"] == true {
		t.Fatal("no hold decided earlier than 700 ms before the opening")
	}
	advance(100 * time.Millisecond) // 700 ms before: decided now, so clients hear of it before their countdown ends
	tickRooms()
	if st = state(t, code, hk); st["hold"] != true {
		t.Fatal("hold decided 700 ms before the planned opening")
	}
	advance(700 * time.Millisecond)
	tickRooms()
	st = state(t, code, hk)
	if st["hold"] != true || num(st["qStart"]) != lead+5000 {
		t.Fatalf("opening held for the loading client: hold=%v qStart+%d", st["hold"], num(st["qStart"])-lead)
	}
	if a := answerAt(t, code, hk, 0, true, 100); a.code != 409 {
		t.Fatalf("no answers while held: %v", a.body)
	}
	advance(2 * time.Second)
	st = call(t, "POST", "/rooms/"+code+"/ready", map[string]any{"key": k1, "q": 0}).body
	if st["hold"] == true || num(st["qStart"]) != nowOf(st)+800 || num(st["qDeadline"])-num(st["qStart"]) != 21000 { // listen with old Grow stages: auto window max(15 s, 4 × 4 s + 5 s)
		t.Fatalf("last ready → opens in 800 ms with the full window: hold=%v start-now=%d window=%d",
			st["hold"], num(st["qStart"])-nowOf(st), num(st["qDeadline"])-num(st["qStart"]))
	}
	// the slow-media player and the fast one tap at the same real moment: same speed points
	advance(800*time.Millisecond + 2500*time.Millisecond)
	a1, a2 := answerAt(t, code, hk, 0, true, 2500), answerAt(t, code, k1, 0, true, 2500)
	if num(a1.body["points"]) != num(a2.body["points"]) || num(a1.body["points"]) == 0 {
		t.Fatalf("same moment, same points: %v vs %v", a1.body["points"], a2.body["points"])
	}
	// q1: nobody ready → opens at the cap, no later
	advance(5 * time.Second)
	tickRooms()
	st = state(t, code, hk)
	lead = num(st["qStart"])
	advance(3 * time.Second)
	tickRooms()
	advance(5 * time.Second)
	tickRooms()
	st = state(t, code, hk)
	if st["hold"] == true || num(st["qStart"]) != lead+5000 || nowOf(st) < num(st["qStart"]) {
		t.Fatalf("hold capped at 5 s: hold=%v qStart+%d", st["hold"], num(st["qStart"])-lead)
	}
}

// Old clients never report readiness, so they are never waited for.
func TestReadyHoldOnlyForReportingClients(t *testing.T) {
	code, hk, _ := timingRoom(t, []any{listenQ(0, 0)}, nil)
	st := call(t, "POST", "/rooms/"+code+"/start", map[string]any{"key": hk}).body
	lead := num(st["qStart"])
	advance(3 * time.Second)
	tickRooms()
	if st = state(t, code, hk); st["hold"] == true || num(st["qStart"]) != lead {
		t.Fatalf("no hold without ready reports: %v %d", st["hold"], num(st["qStart"])-lead)
	}
}

// Speed is measured against the server's question start; a client clock running behind can't buy points.
func TestSpeedClamp(t *testing.T) {
	code, hk, k1 := timingRoom(t, []any{listenQ(0, 0), listenQ(1, 0)}, map[string]any{"streak": false})
	call(t, "POST", "/rooms/"+code+"/start", map[string]any{"key": hk})
	advance(3*time.Second + 4*time.Second) // both tap 4 s after the opening (server receive ≈ 4.0 s)
	honest := answerAt(t, code, hk, 0, true, 3950)
	behind := answerAt(t, code, k1, 0, true, 950) // clock estimate 3 s behind
	if num(behind.body["ms"]) < 4000-1500 {
		t.Fatalf("client ms undercutting the receive time by > 1.5 s is clamped: %v", behind.body["ms"])
	}
	if num(behind.body["points"])-num(honest.body["points"]) > 45 {
		t.Fatalf("same real moment: %v vs %v", behind.body["points"], honest.body["points"])
	}
}

// The reveal explains every score: speed, stage multiplier, streak bonus. The snapshot's UNVDC Q18 case:
// the faster player (1.4 s, no streak) scored 442, the slower one (2.8 s, 5 in a row) 545.
func TestBreakdownAndStreakSetting(t *testing.T) {
	for _, on := range []bool{true, false} {
		resetLimits()
		clearRooms()
		r := call(t, "POST", "/rooms", map[string]any{"hostName": "H", "answerSec": 10, "gapSec": 5, "questions": questions(6), "streak": on})
		code, hk := r.body["code"].(string), r.body["hostKey"].(string)
		k1, _ := join(t, code, "P")
		if r.body["room"].(map[string]any)["streakBonus"] != on {
			t.Fatalf("state carries streakBonus=%v: %v", on, r.body["room"].(map[string]any)["streakBonus"])
		}
		call(t, "POST", "/rooms/"+code+"/start", map[string]any{"key": hk})
		for q := 0; q < 5; q++ {
			advance(3 * time.Second)
			given := "Right"
			if q == 4 {
				given = "Wrong" // the host's streak breaks just before the last question
			}
			call(t, "POST", "/rooms/"+code+"/answer", map[string]any{"key": hk, "q": q, "given": given, "correct": true, "ms": 3000})
			call(t, "POST", "/rooms/"+code+"/answer", map[string]any{"key": k1, "q": q, "given": "Right", "correct": true, "ms": 3000})
			advance(5 * time.Second)
			tickRooms()
		}
		advance(3 * time.Second)
		advance(2783 * time.Millisecond)
		fast := call(t, "POST", "/rooms/"+code+"/answer", map[string]any{"key": hk, "q": 5, "given": "Right", "correct": true, "ms": 1449})
		slow := call(t, "POST", "/rooms/"+code+"/answer", map[string]any{"key": k1, "q": 5, "given": "Right", "correct": true, "ms": 2783})
		st := slow.body["state"].(map[string]any)
		you := st["you"].(map[string]any)["last"].(map[string]any)
		if on {
			if num(fast.body["points"]) != 442 || num(slow.body["points"]) != 584 { // 6 in a row: 389 × 1.5
				t.Fatalf("streak on: fast %v slow %v", fast.body["points"], slow.body["points"])
			}
			if num(you["speed"]) != 389 || num(you["bonus"]) != num(slow.body["points"])-389 || num(you["streak"]) != 6 {
				t.Fatalf("breakdown: %v", you)
			}
		} else {
			if num(fast.body["points"]) != 442 || num(slow.body["points"]) != 389 || num(you["bonus"]) != 0 {
				t.Fatalf("streak just for show: fast %v slow %v last %v", fast.body["points"], slow.body["points"], you)
			}
			if num(st["players"].([]any)[0].(map[string]any)["streak"]) == 0 {
				t.Fatal("the streak counter still counts when it adds no points")
			}
		}
		// the lobby setting can be changed between games
		call(t, "POST", "/rooms/"+code+"/settings", map[string]any{"key": hk, "streak": !on})
		if state(t, code, hk)["streakBonus"] != !on {
			t.Fatal("settings toggles the streak bonus")
		}
	}
	// spec.streak = "off" also works (rooms created from a saved spec)
	resetLimits()
	clearRooms()
	r := call(t, "POST", "/rooms", map[string]any{"hostName": "H", "questions": questions(1), "spec": map[string]any{"streak": "off"}})
	if r.body["room"].(map[string]any)["streakBonus"] != false {
		t.Fatal("spec.streak off")
	}
}

// Progressive breakdown: the stage multiplier is reported with the speed points.
func TestBreakdownStage(t *testing.T) {
	code, hk, k1 := timingRoom(t, []any{listenQ(0, 0)}, nil)
	call(t, "POST", "/rooms/"+code+"/start", map[string]any{"key": hk})
	advance(3 * time.Second)
	call(t, "POST", "/rooms/"+code+"/vote", map[string]any{"key": hk, "q": 0})
	call(t, "POST", "/rooms/"+code+"/vote", map[string]any{"key": k1, "q": 0})
	advance(3 * time.Second)
	// auto window max(15 s, 4 × 4 s + 5 s) = 21 s: speed 100+343 = 443; stage 1 of 5 (legacy vote) → ×0.85 = 377
	a := answerAt(t, code, hk, 0, true, 3000)
	last := a.body["state"].(map[string]any)["you"].(map[string]any)["last"].(map[string]any)
	if num(a.body["points"]) != 377 || num(last["speed"]) != 443 || num(last["stage"]) != 1 || num(last["stages"]) != 5 {
		t.Fatalf("stage breakdown: %v %v", a.body["points"], last)
	}
}

// listen without Grow: the host's clip length and artwork set a multiplier for everyone; each replay ×0.85.
// The server applies them (it used to ignore listen's factors online while the runner card showed them).
func TestListenFactors(t *testing.T) {
	q := func(i int, clip float64, art string) map[string]any {
		return map[string]any{"format": "listen", "id": fmt.Sprint("c", i), "prompt": "Name this song", "answer": 0,
			"options": []string{"A", "B", "C", "D"}, "timeLimit": 20000, "data": map[string]any{"len": clip, "art": art, "replays": 2}}
	}
	code, hk, k1 := timingRoom(t, []any{q(0, 5, "off"), q(1, 30, "on")}, map[string]any{"streak": false})
	call(t, "POST", "/rooms/"+code+"/start", map[string]any{"key": hk})
	advance(5 * time.Second)
	// 10 s window, 2 s in: speed 100+320 = 420. 5 s clip ×1.25 → 525; one replay ×0.85 → 446; 9 claimed → 2 max
	a := call(t, "POST", "/rooms/"+code+"/answer", map[string]any{"key": hk, "q": 0, "given": 0, "correct": true, "ms": 2000, "replays": 1})
	b := call(t, "POST", "/rooms/"+code+"/answer", map[string]any{"key": k1, "q": 0, "given": 0, "correct": true, "ms": 2000, "replays": 9})
	if num(a.body["points"]) != 446 || num(b.body["points"]) != 379 {
		t.Fatalf("clip ×1.25 and replays ×0.85 (clamped to 2): %v %v", a.body["points"], b.body["points"])
	}
	last := b.body["state"].(map[string]any)["players"].([]any) // revealed once both answered
	var mine map[string]any
	for _, p := range last {
		if pm := p.(map[string]any); pm["name"] == "H" {
			mine = pm["last"].(map[string]any)
		}
	}
	if mine == nil || num(mine["speed"]) != 420 || mine["clipMul"] != 1.25 || num(mine["replays"]) != 1 || num(mine["clip"]) != 5 {
		t.Fatalf("listen breakdown: %v", mine)
	}
	advance(8 * time.Second)
	tickRooms()
	advance(5 * time.Second)
	// 30 s clip ×0.7, artwork on ×0.65: 420 × 0.455 = 191
	c := call(t, "POST", "/rooms/"+code+"/answer", map[string]any{"key": hk, "q": 1, "given": 0, "correct": true, "ms": 2000})
	if num(c.body["points"]) != 191 {
		t.Fatalf("30 s clip with artwork: %v", c.body["points"])
	}
}
