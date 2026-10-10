package main

import (
	"bytes"
	"encoding/json"
	"testing"
)

func roomRow(t *testing.T, code string) (data, qs []byte) {
	t.Helper()
	if err := db.QueryRow(`SELECT data, questions FROM rooms WHERE code = ?`, code).Scan(&data, &qs); err != nil {
		t.Fatalf("row %s: %v", code, err)
	}
	return
}

func reload(code string) {
	roomsMu.Lock()
	delete(rooms, code)
	roomsMu.Unlock()
	loadRooms()
}

func TestFlushQuestionsOnce(t *testing.T) {
	resetLimits()
	code, hk := createRoom(t, "Flusher", 3)
	flushRooms(false)
	data, qs := roomRow(t, code)
	if bytes.Contains(data, []byte(`"prompt"`)) || !bytes.Contains(qs, []byte(`"prompt"`)) {
		t.Fatalf("questions belong in their own column: data=%s qs=%.80s", data, qs)
	}
	// mark the stored questions: a state-only flush must leave them alone
	db.Exec(`UPDATE rooms SET questions = replace(questions, 'Q?', 'Q!') WHERE code = ?`, code)
	call(t, "POST", "/rooms/"+code+"/start", map[string]any{"key": hk})
	flushRooms(false)
	data2, qs2 := roomRow(t, code)
	if !bytes.Contains(qs2, []byte("Q!")) || bytes.Equal(data, data2) {
		t.Fatal("state flush rewrote the questions or skipped the state")
	}
	reload(code)
	st := state(t, code, hk)
	if st["phase"] != "question" || num(st["total"]) != 3 {
		t.Fatalf("restored: %v", st)
	}
	q := call(t, "GET", "/rooms/"+code+"/q/0?k="+hk, nil)
	if q.code != 200 || q.body["question"].(map[string]any)["prompt"] != "Q!" {
		t.Fatalf("restored question: %v", q.body)
	}
	// play again swaps the question set: written on the next flush, and survives a restart
	again := call(t, "POST", "/rooms/"+code+"/again", map[string]any{"key": hk, "spec": map[string]any{"v": 1}, "questions": questions(5)})
	if again.code != 200 {
		t.Fatalf("again: %d %v", again.code, again.body)
	}
	flushRooms(false)
	reload(code)
	if st := state(t, code, hk); num(st["total"]) != 5 {
		t.Fatalf("after again + restart: %v", st["total"])
	}
}

func TestLoadPreSplitRoomRow(t *testing.T) {
	resetLimits()
	code, hk := createRoom(t, "Legacy", 2)
	rm := getRoom(code)
	rm.mu.Lock()
	full, _ := jsonMarshalRoom(rm)
	rm.mu.Unlock()
	db.Exec(`DELETE FROM rooms WHERE code = ?`, code)
	db.Exec(`INSERT INTO rooms(code, data, touched) VALUES(?,?,?)`, code, full, rm.Touched)
	reload(code)
	if st := state(t, code, hk); num(st["total"]) != 2 {
		t.Fatalf("legacy row restored: %v", st)
	}
	flushRooms(false)
	data, qs := roomRow(t, code)
	if bytes.Contains(data, []byte(`"prompt"`)) || !bytes.Contains(qs, []byte(`"prompt"`)) {
		t.Fatal("legacy row not split on the next flush")
	}
}

func jsonMarshalRoom(r *Room) ([]byte, error) { return json.Marshal(r) }
