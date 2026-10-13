package main

import (
	"encoding/json"
	"testing"
)

func TestPickallScoring(t *testing.T) {
	ans := json.RawMessage(`[1,4,6]`)
	cases := []struct {
		given string
		cap   int
		ok    bool
	}{
		{`[6,1,4]`, 500, true},        // all right (any order)
		{`[0,1,2,3,4,5,6]`, 0, false}, // picking everything never pays: more picks than answers
		{`[]`, 0, false},              // none
		{`null`, 0, false},            // timeout
		{`[1,4,0]`, 333, false},       // 2 of 3 found → 2/3
		{`[1,4]`, 333, false},         // 2 right, nothing wrong → 2/3
		{`[1,0,2]`, 167, false},       // 1 of 3 found → 1/3
		{`[1,1,4,4,6]`, 500, true},    // duplicates count once
		{`[1,4,6,9]`, 0, false},       // more picks than right answers scores 0
		{`[1.5,4,6]`, 333, false},
		{`[1,4,9]`, 333, false},   // an out-of-range pick is a wrong pick
		{`[0,2,3,5,7]`, 0, false}, // a non-integer is ignored
		{`"junk"`, 0, false},      // unparseable
	}
	for _, c := range cases {
		if got := pickallCap(ans, json.RawMessage(c.given)); got != c.cap {
			t.Errorf("cap %s = %d, want %d", c.given, got, c.cap)
		}
		m := parseMeta(json.RawMessage(`{"format":"pickall","answer":[1,4,6]}`))
		if got := verifyCorrect(m, json.RawMessage(c.given), !c.ok); got != c.ok {
			t.Errorf("verifyCorrect %s = %v, want %v", c.given, got, c.ok)
		}
	}
	if parseMeta(json.RawMessage(`{"format":"pickall"}`)).LimitMs != 30000 {
		t.Error("pickall default limit 30 s")
	}
	p := 320.0
	if !partialFormats["pickall"] || basePoints("pickall", false, &p, 0, 10000, true) != 320 {
		t.Error("pickall is a partial format using client points")
	}
}

// A room where one player claims full points for a half-right pick: the server caps it by the picks it received.
func TestPickallRoomCap(t *testing.T) {
	q := json.RawMessage(`{"format":"pickall","answer":[0,2],"options":[{"text":"a"},{"text":"b"},{"text":"c"},{"text":"d"},{"text":"e"},{"text":"f"}],"data":{"need":2}}`)
	r := &Room{Phase: "question", Q: 0, QStart: nowMs(), QDeadline: nowMs() + 30000, meta: []qMeta{parseMeta(q)}}
	cheat := &Player{ID: "a", Answers: map[int]*Answer{}, LastSeen: nowMs()}
	honest := &Player{ID: "b", Answers: map[int]*Answer{}, LastSeen: nowMs()}
	r.Players = []*Player{cheat, honest}
	pts := 500.0
	a, e := r.answer(cheat, answerIn{Q: 0, Given: json.RawMessage(`[0,1]`), Correct: true, Points: &pts})
	if e != "" || a.Correct || a.Points != 250 {
		t.Fatalf("1 right + 1 wrong of 2 must be capped at half and not count as correct: %+v %s", a, e)
	}
	b, e := r.answer(honest, answerIn{Q: 0, Given: json.RawMessage(`[2,0]`), Correct: true, Points: &pts})
	if e != "" || !b.Correct || b.Points != 500 {
		t.Fatalf("all right keeps its points: %+v %s", b, e)
	}
}
