package main

import (
	"database/sql"
	"testing"
)

func TestImgReview(t *testing.T) {
	resetLimits()
	if r := call(t, "POST", "/admin/imgreview", map[string]any{"items": []any{map[string]any{"ref": "body/thyroid/0", "verdict": "bad"}}},
		"Authorization", "Bearer "+mintAs("google.com", "someone@example.com")); r.code != 403 {
		t.Fatalf("non-admin: %d", r.code)
	}
	admin := "Bearer " + mintAs("google.com", "aaron@itmatters.mobi")
	items := []any{
		map[string]any{"ref": "body/thyroid/0", "src": "x.jpg", "verdict": "bad", "reason": "text", "note": "says Thyroid"},
		map[string]any{"ref": "body/heart/0", "verdict": "ok"},
	}
	if r := call(t, "POST", "/admin/imgreview", map[string]any{"items": items}, "Authorization", admin); r.code != 200 {
		t.Fatalf("save: %d %v", r.code, r.body)
	}
	call(t, "POST", "/admin/imgreview", map[string]any{"items": []any{map[string]any{"ref": "body/heart/0", "verdict": ""}}}, "Authorization", admin)
	if r := call(t, "POST", "/admin/imgreview", map[string]any{"items": []any{map[string]any{"ref": "a", "verdict": "meh"}}}, "Authorization", admin); r.code != 400 {
		t.Fatalf("bad verdict: %d", r.code)
	}
	r := call(t, "GET", "/admin/imgreview", nil, "Authorization", admin)
	got := r.body["reviews"].([]any)
	if len(got) != 1 || got[0].(map[string]any)["reason"] != "text" || got[0].(map[string]any)["note"] != "says Thyroid" {
		t.Fatalf("reviews: %v", got)
	}
}

func TestImgReviewMark(t *testing.T) {
	resetLimits()
	admin := "Bearer " + mintAs("google.com", "aaron@itmatters.mobi")
	mark := map[string]any{"cx": 0.4, "cy": 0.55, "rx": 0.1, "ry": 0.08}
	if r := call(t, "POST", "/admin/imgreview", map[string]any{"items": []any{map[string]any{"ref": "body/liver/0", "src": "l.png", "verdict": "ok", "mark": mark}}},
		"Authorization", admin); r.code != 200 {
		t.Fatalf("save mark: %d %v", r.code, r.body)
	}
	for _, bad := range []map[string]any{{"cx": 1.5, "cy": 0.5, "rx": 0.1, "ry": 0.1}, {"cx": 0.5, "cy": 0.5, "rx": 0, "ry": 0.1}} {
		if r := call(t, "POST", "/admin/imgreview", map[string]any{"items": []any{map[string]any{"ref": "body/x/0", "verdict": "ok", "mark": bad}}},
			"Authorization", admin); r.code != 400 {
			t.Fatalf("bad mark %v: %d", bad, r.code)
		}
	}
	find := func() map[string]any {
		for _, x := range call(t, "GET", "/admin/imgreview", nil, "Authorization", admin).body["reviews"].([]any) {
			if m := x.(map[string]any); m["ref"] == "body/liver/0" {
				return m
			}
		}
		return nil
	}
	got := find()
	if m, _ := got["mark"].(map[string]any); m == nil || m["cx"] != 0.4 || m["ry"] != 0.08 {
		t.Fatalf("mark not read back: %v", got)
	}
	call(t, "POST", "/admin/imgreview", map[string]any{"items": []any{map[string]any{"ref": "body/liver/0", "src": "l.png", "verdict": "ok"}}}, "Authorization", admin)
	if got := find(); got["mark"] != nil {
		t.Fatalf("mark not cleared: %v", got)
	}
}

// A live table from before marks gains the column and keeps its rows.
func TestImgReviewMigration(t *testing.T) {
	path := t.TempDir() + "/old.db"
	old, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	old.Exec(`CREATE TABLE img_review (ref TEXT PRIMARY KEY, src TEXT NOT NULL DEFAULT '', verdict TEXT NOT NULL,
		reason TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL, by TEXT NOT NULL DEFAULT '')`)
	if _, err := old.Exec(`INSERT INTO img_review(ref, src, verdict, at) VALUES('body/heart/0', 'h.png', 'bad', 1)`); err != nil {
		t.Fatal(err)
	}
	old.Close()
	keep := db
	defer func() { db.Close(); db = keep }()
	for i := 0; i < 2; i++ {
		if i == 1 {
			db.Close()
		}
		openDB(path)
	}
	var verdict, mark string
	if err := db.QueryRow(`SELECT verdict, mark FROM img_review WHERE ref='body/heart/0'`).Scan(&verdict, &mark); err != nil || verdict != "bad" || mark != "" {
		t.Fatalf("migrated row: %q %q %v", verdict, mark, err)
	}
}
