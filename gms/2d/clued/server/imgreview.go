package main

// Admin picture review (review.html): Aaron marks each pack picture ok or bad so bad ones
// can be swapped or regenerated. Read the bad list on the box with
// sqlite3 /srv/data/clued/clued.db "SELECT ref, reason, note, src FROM img_review WHERE verdict='bad'".

import (
	"net/http"
	"strings"
)

type imgReview struct {
	Ref     string `json:"ref"`
	Src     string `json:"src,omitempty"`
	Verdict string `json:"verdict"`
	Reason  string `json:"reason,omitempty"`
	Note    string `json:"note,omitempty"`
	At      int64  `json:"at,omitempty"`
}

func handleImgReviewGet(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Query(`SELECT ref, src, verdict, reason, note, at FROM img_review ORDER BY at`)
	if err != nil {
		writeErr(w, 500, "db", "couldn't read reviews")
		return
	}
	defer rows.Close()
	out := []imgReview{}
	for rows.Next() {
		var v imgReview
		if rows.Scan(&v.Ref, &v.Src, &v.Verdict, &v.Reason, &v.Note, &v.At) == nil {
			out = append(out, v)
		}
	}
	writeJSON(w, 200, map[string]any{"reviews": out})
}

// Body: {items: [{ref, src, verdict: "ok"|"bad"|"", reason, note}]}; an empty verdict clears the row.
func handleImgReviewSet(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Items []imgReview `json:"items"`
	}
	if !readJSON(w, r, 256<<10, &in) {
		return
	}
	if len(in.Items) == 0 || len(in.Items) > 600 {
		writeErr(w, 400, "bad_request", "send 1 to 600 items")
		return
	}
	cut := func(s string, n int) string {
		s = strings.TrimSpace(s)
		if len(s) > n {
			return s[:n]
		}
		return s
	}
	tx, err := db.Begin()
	if err != nil {
		writeErr(w, 500, "db", "couldn't save")
		return
	}
	now, by := nowMs(), identity(r).Email
	for _, v := range in.Items {
		ref := cut(v.Ref, 200)
		if ref == "" {
			continue
		}
		switch v.Verdict {
		case "ok", "bad":
			_, err = tx.Exec(`INSERT INTO img_review(ref, src, verdict, reason, note, at, by) VALUES(?,?,?,?,?,?,?)
				ON CONFLICT(ref) DO UPDATE SET src=excluded.src, verdict=excluded.verdict, reason=excluded.reason, note=excluded.note, at=excluded.at, by=excluded.by`,
				ref, cut(v.Src, 600), v.Verdict, cut(v.Reason, 40), cut(v.Note, 400), now, by)
		case "":
			_, err = tx.Exec(`DELETE FROM img_review WHERE ref = ?`, ref)
		default:
			tx.Rollback()
			writeErr(w, 400, "bad_request", "verdict must be ok, bad or empty")
			return
		}
		if err != nil {
			tx.Rollback()
			writeErr(w, 500, "db", "couldn't save")
			return
		}
	}
	if tx.Commit() != nil {
		writeErr(w, 500, "db", "couldn't save")
		return
	}
	writeJSON(w, 200, map[string]any{"saved": len(in.Items)})
}
