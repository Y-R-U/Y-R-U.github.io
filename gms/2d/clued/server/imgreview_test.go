package main

import "testing"

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
