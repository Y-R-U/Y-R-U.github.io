package main

import (
	"testing"
	"time"
)

func TestAnswerHiddenUntilReveal(t *testing.T) {
	resetLimits()
	qs := []any{mcQ(0), map[string]any{"format": "tf", "id": "tf:x", "prompt": "Sky is blue.", "answer": true, "answerText": "True", "explain": "Yes."},
		map[string]any{"format": "pin-drop", "id": "pin:x", "prompt": "Drop", "answer": map[string]any{"lon": 1, "lat": 2}}}
	r := call(t, "POST", "/rooms", map[string]any{"hostName": "H", "spec": map[string]any{"v": 1}, "questions": qs})
	code, hk := r.body["code"].(string), r.body["hostKey"].(string)
	k1, _ := join(t, code, "Sam")
	get := func(i int) map[string]any {
		t.Helper()
		res := call(t, "GET", "/rooms/"+code+"/q/"+itoa(i)+"?k="+k1, nil)
		if res.code != 200 {
			t.Fatalf("q%d: %d", i, res.code)
		}
		return res.body["question"].(map[string]any)
	}
	hidden := func(q map[string]any) bool {
		_, a := q["answer"]
		_, at := q["answerText"]
		_, ex := q["explain"]
		return !a && !at && !ex && q["hidden"] == true
	}
	call(t, "POST", "/rooms/"+code+"/start", map[string]any{"key": hk})
	if q := get(0); !hidden(q) || q["id"] != "room:0" || q["prompt"] != "Q?" || len(q["options"].([]any)) != 4 {
		t.Fatalf("q0 during the question must hide the answer: %v", q)
	}
	if q := get(1); !hidden(q) {
		t.Fatalf("prefetched q1 must hide the answer: %v", q)
	}
	advance(leadInMs*time.Millisecond + time.Second)
	a := call(t, "POST", "/rooms/"+code+"/answer", map[string]any{"key": k1, "q": 0, "given": "Right", "correct": false, "ms": 1000})
	if a.code != 200 || a.body["correct"] != true {
		t.Fatalf("server scores a hidden mc: %v", a.body)
	}
	call(t, "POST", "/rooms/"+code+"/next", map[string]any{"key": hk, "q": 0})
	if st := state(t, code, hk); st["phase"] != "reveal" {
		t.Fatalf("want reveal, got %v", st["phase"])
	}
	if q := get(0); hidden(q) || q["answer"] != "Right" || q["id"] != "q0" {
		t.Fatalf("q0 after the reveal: %v", q)
	}
	if q := get(1); !hidden(q) {
		t.Fatal("q1 still hidden during q0's reveal")
	}
	call(t, "POST", "/rooms/"+code+"/next", map[string]any{"key": hk, "q": 0})
	if q := get(2); hidden(q) || q["answer"] == nil {
		t.Fatalf("formats the server can't check keep their answer: %v", q)
	}
	if q := get(1); !hidden(q) {
		t.Fatal("q1 hidden while open")
	}
}

func itoa(i int) string { return string(rune('0' + i)) }
