package main

import (
	"encoding/json"
	"testing"
)

func TestTrioScoring(t *testing.T) {
	ans := json.RawMessage(`[2,0,3]`)
	cases := []struct {
		given string
		frac  float64
		ok    bool
	}{
		{`[2,0,3]`, 1, true},
		{`[2,0,1]`, 2.0 / 3, false},
		{`[2,1,1]`, 1.0 / 3, false},
		{`[0,1,1]`, 0, false},
		{`[2,0]`, 2.0 / 3, false},       // a missing row is wrong
		{`[2,0,3,1]`, 0, false},         // more rows than asked scores nothing
		{`[2.0,0,3.5]`, 2.0 / 3, false}, // non-integers never match
		{`["2",0,3]`, 2.0 / 3, false},   // strings never match
		{`null`, 0, false},
		{`"junk"`, 0, false},
	}
	for _, c := range cases {
		frac, ok := trioScore(ans, json.RawMessage(c.given))
		if ok != c.ok || frac < c.frac-1e-9 || frac > c.frac+1e-9 {
			t.Errorf("trioScore %s = %v %v, want %v %v", c.given, frac, ok, c.frac, c.ok)
		}
		m := parseMeta(json.RawMessage(`{"format":"trio","answer":[2,0,3]}`))
		if got := verifyCorrect(m, json.RawMessage(c.given), !c.ok); got != c.ok {
			t.Errorf("verifyCorrect %s = %v, want %v", c.given, got, c.ok)
		}
	}
	if f, _ := trioScore(json.RawMessage(`[1,1]`), json.RawMessage(`[1,0]`)); f != 0.5 {
		t.Error("two-row trio: one right = half")
	}
	// speed points × share: an instant 3/3 = 500, 2/3 = 333, 1/3 = 167; untimed (kids) 100 × share
	for _, c := range []struct {
		given string
		ms    int
		timed bool
		want  int
	}{{`[2,0,3]`, 0, true, 500}, {`[2,0,1]`, 0, true, 333}, {`[0,0,1]`, 0, true, 167}, {`[2,0,1]`, 10000, true, 67}, {`[2,0,1]`, 0, false, 67}, {`[0,1,1]`, 0, true, 0}} {
		if got := trioPoints(ans, json.RawMessage(c.given), c.ms, 10000, c.timed); got != c.want {
			t.Errorf("trioPoints %s ms=%d timed=%v = %d, want %d", c.given, c.ms, c.timed, got, c.want)
		}
	}
	if !partialFormats["trio"] {
		t.Error("trio is a partial format")
	}
}

// The answer time is the host's plus 10 s.
func TestTrioLimit(t *testing.T) {
	r := &Room{AnswerMs: 15000}
	if got := r.limitFor(parseMeta(json.RawMessage(`{"format":"trio"}`))); got != 25000 {
		t.Errorf("trio limit = %d, want 25000", got)
	}
	if got := r.limitFor(parseMeta(json.RawMessage(`{"format":"mc"}`))); got != 15000 {
		t.Errorf("mc limit = %d, want 15000", got)
	}
}

// A player claims full points for a 1-of-3 answer: the server scores the rows it received with its own clock.
func TestTrioRoomScore(t *testing.T) {
	q := json.RawMessage(`{"format":"trio","answer":[1,2,0],"rows":[{"options":["a","b","c","d"]},{"options":["a","b","c","d"]},{"options":["1","2","3","4"]}]}`)
	r := &Room{Phase: "question", Q: 0, QStart: nowMs(), QDeadline: nowMs() + 30000, meta: []qMeta{parseMeta(q)}}
	r.meta[0].LimitMs = 30000
	cheat := &Player{ID: "a", Answers: map[int]*Answer{}, LastSeen: nowMs()}
	honest := &Player{ID: "b", Answers: map[int]*Answer{}, LastSeen: nowMs()}
	r.Players = []*Player{cheat, honest}
	pts := 500.0
	ms := 0.0
	a, e := r.answer(cheat, answerIn{Q: 0, Given: json.RawMessage(`[1,0,3]`), Correct: true, Points: &pts, Ms: &ms})
	if e != "" || a.Correct || a.Points > 167 || a.Points < 150 {
		t.Fatalf("1 of 3 must score about a third and not count as correct: %+v %s", a, e)
	}
	b, e := r.answer(honest, answerIn{Q: 0, Given: json.RawMessage(`[1,2,0]`), Correct: false, Points: &ms, Ms: &ms})
	if e != "" || !b.Correct || b.Points < 450 {
		t.Fatalf("a hat-trick is correct with speed points, whatever the client claimed: %+v %s", b, e)
	}
	if cheat.Streak != 0 || honest.Streak != 1 {
		t.Fatalf("only the hat-trick counts for the streak: %d %d", cheat.Streak, honest.Streak)
	}
}
