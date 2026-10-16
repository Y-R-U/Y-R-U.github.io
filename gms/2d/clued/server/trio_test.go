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
	if e != "" || !b.Correct || b.Points < 550 || b.Hat != hatTrickBonus {
		t.Fatalf("a hat-trick is correct with speed points + the bonus, whatever the client claimed: %+v %s", b, e)
	}
	if cheat.Streak != 0 || honest.Streak != 1 {
		t.Fatalf("only the hat-trick counts for the streak: %d %d", cheat.Streak, honest.Streak)
	}
}

// Picks never locked in are scored at the deadline (minimum speed points); nothing picked scores nothing.
func TestTrioDrafts(t *testing.T) {
	q := json.RawMessage(`{"format":"trio","answer":[1,2,0]}`)
	pq := json.RawMessage(`{"format":"pickall","answer":[0,2]}`)
	mq := json.RawMessage(`{"format":"mc","answer":1}`)
	r := &Room{Phase: "question", Q: 0, QStart: nowMs(), QDeadline: nowMs() + 30000, meta: []qMeta{parseMeta(q), parseMeta(pq), parseMeta(mq)}}
	for i := range r.meta {
		r.meta[i].LimitMs = 30000
	}
	mk := func(id string) *Player { return &Player{ID: id, Answers: map[int]*Answer{}, LastSeen: nowMs()} }
	a, b, c, d := mk("a"), mk("b"), mk("c"), mk("d")
	r.Players = []*Player{a, b, c, d}
	if e := r.draft(a, answerIn{Q: 0, Given: json.RawMessage(`[0,0,0]`)}); e != "" {
		t.Fatal(e)
	}
	r.draft(a, answerIn{Q: 0, Given: json.RawMessage(`[1,2,0]`)}) // newest wins
	r.draft(b, answerIn{Q: 0, Given: json.RawMessage(`[1,0,3]`)})
	ms := 0.0
	if _, e := r.answer(c, answerIn{Q: 0, Given: json.RawMessage(`[1,0,0]`), Ms: &ms}); e != "" {
		t.Fatal(e)
	}
	if e := r.draft(c, answerIn{Q: 0, Given: json.RawMessage(`[1,2,0]`)}); e != "already_answered" {
		t.Fatalf("a draft after the answer: %q", e)
	}
	if e := r.draft(d, answerIn{Q: 1, Given: json.RawMessage(`[1]`)}); e != "not_open" {
		t.Fatalf("a draft for another question: %q", e)
	}
	r.reveal()
	if x := a.Answers[0]; x == nil || !x.Correct || x.Points != 100+hatTrickBonus || x.Ms != 30000 || a.Streak != 1 {
		t.Fatalf("an unlocked hat-trick scores minimum speed + bonus: %+v", x)
	}
	if x := b.Answers[0]; x == nil || x.Correct || x.Points != 33 {
		t.Fatalf("an unlocked 1 of 3 scores a third of minimum speed: %+v", x)
	}
	if c.Answers[0].Points < 300 || d.Answers[0] != nil {
		t.Fatal("a locked answer keeps its own score; no picks, no answer")
	}
	// pick-all drafts work the same way; an mc question takes no drafts
	r.Q, r.Phase = 1, "question"
	if e := r.draft(d, answerIn{Q: 1, Given: json.RawMessage(`[2]`)}); e != "" {
		t.Fatal(e)
	}
	r.reveal()
	if x := d.Answers[1]; x == nil || x.Correct || x.Points != 50 {
		t.Fatalf("an unlocked pick-all 1 of 2 scores 50: %+v", x)
	}
	r.Q, r.Phase = 2, "question"
	if e := r.draft(d, answerIn{Q: 2, Given: json.RawMessage(`1`)}); e != "not_draftable" {
		t.Fatalf("mc draft: %q", e)
	}
}
