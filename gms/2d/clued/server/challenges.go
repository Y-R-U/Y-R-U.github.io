package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
)

const idAlphabet = "abcdefghijkmnpqrstuvwxyz23456789"

func newChallengeID() string {
	for {
		id := randString(idAlphabet, 8)
		if isProfane(id) {
			continue
		}
		var x int
		if db.QueryRow(`SELECT 1 FROM challenges WHERE id = ?`, id).Scan(&x) == sql.ErrNoRows {
			return id
		}
	}
}

func normID(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	if len(s) != 8 {
		return ""
	}
	for _, c := range s {
		if !strings.ContainsRune(idAlphabet, c) {
			return ""
		}
	}
	return s
}

// The client's runner does the scoring; the server only bounds it.
func plausibleScore(score, correct, total int) bool {
	return score >= 0 && correct >= 0 && correct <= total && score <= total*maxBase*3/2
}

type scoreRow struct {
	ID      int64  `json:"id"`
	Name    string `json:"name"`
	Score   int    `json:"score"`
	Correct int    `json:"correct"`
	Ms      int    `json:"ms"`
	Creator bool   `json:"creator,omitempty"`
	Signed  bool   `json:"signed,omitempty"`
	At      int64  `json:"at"`
}

func board(id string, limit int) []scoreRow {
	rows, err := db.Query(`SELECT id, name, score, correct, ms, creator, uid != '', created FROM challenge_scores
		WHERE challenge_id = ? ORDER BY score DESC, ms ASC, id ASC LIMIT ?`, id, limit)
	if err != nil {
		return nil
	}
	defer rows.Close()
	out := []scoreRow{}
	for rows.Next() {
		var s scoreRow
		if rows.Scan(&s.ID, &s.Name, &s.Score, &s.Correct, &s.Ms, &s.Creator, &s.Signed, &s.At) == nil {
			out = append(out, s)
		}
	}
	return out
}

type scoreIn struct {
	Name    string `json:"name"`
	Score   int    `json:"score"`
	Correct int    `json:"correct"`
	Ms      int    `json:"ms"`
}

func handleCreateChallenge(w http.ResponseWriter, r *http.Request) {
	if !allow(r, "challenge") {
		rateLimited(w)
		return
	}
	var in struct {
		roomIn
		Score   int `json:"score"`
		Correct int `json:"correct"`
		Ms      int `json:"ms"`
	}
	if !readJSON(w, r, bigBody, &in) || !validQuestions(w, &in.roomIn) {
		return
	}
	id := identity(r)
	uid := id.UID
	raw := in.Name
	if raw == "" {
		raw = id.Name
	}
	name, err := cleanName(raw)
	if err != nil {
		nameErr(w, err)
		return
	}
	if !gateCreate(w, id) {
		return
	}
	if !isAdmin(id) && challengesToday() >= cfg.ChalPerDay {
		refuse(w, "challenges_per_day", 503, "busy")
		return
	}
	total := len(in.Questions)
	if !plausibleScore(in.Score, in.Correct, total) {
		writeErr(w, 400, "bad_score", "score out of range")
		return
	}
	qs, _ := json.Marshal(in.Questions)
	now := nowMs()
	cid := newChallengeID()
	tx, err := db.Begin()
	if err != nil {
		writeErr(w, 500, "db", "database error")
		return
	}
	defer tx.Rollback()
	_, err = tx.Exec(`INSERT INTO challenges(id, name, uid, title, spec, questions, total, score, plays, created, touched)
		VALUES(?,?,?,?,?,?,?,?,1,?,?)`, cid, name, uid, in.Title, string(in.Spec), qs, total, in.Score, now, now)
	if err == nil {
		_, err = tx.Exec(`INSERT INTO challenge_scores(challenge_id, name, uid, score, correct, ms, creator, created)
			VALUES(?,?,?,?,?,?,1,?)`, cid, name, uid, in.Score, in.Correct, max(0, in.Ms), now)
	}
	if err != nil || tx.Commit() != nil {
		writeErr(w, 500, "db", "database error")
		return
	}
	bump("challenges", 1)
	seenIP(clientIP(r))
	writeJSON(w, 200, map[string]any{"id": cid, "name": name})
}

func handleGetChallenge(w http.ResponseWriter, r *http.Request) {
	id := normID(r.PathValue("id"))
	var c struct {
		name, title, spec string
		qs                []byte
		total, score      int
		plays             int
		created           int64
	}
	err := db.QueryRow(`SELECT name, title, spec, questions, total, score, plays, created FROM challenges WHERE id = ?`, id).
		Scan(&c.name, &c.title, &c.spec, &c.qs, &c.total, &c.score, &c.plays, &c.created)
	if err != nil {
		writeErr(w, 404, "challenge_not_found", "this challenge has expired or never existed")
		return
	}
	writeJSON(w, 200, map[string]any{"id": id, "name": c.name, "title": c.title, "spec": json.RawMessage(c.spec),
		"questions": json.RawMessage(c.qs), "total": c.total, "score": c.score, "plays": c.plays, "created": c.created,
		"scores": board(id, 50)})
}

func handleChallengeScores(w http.ResponseWriter, r *http.Request) {
	id := normID(r.PathValue("id"))
	var total, plays int
	if db.QueryRow(`SELECT total, plays FROM challenges WHERE id = ?`, id).Scan(&total, &plays) != nil {
		writeErr(w, 404, "challenge_not_found", "this challenge has expired or never existed")
		return
	}
	writeJSON(w, 200, map[string]any{"id": id, "total": total, "plays": plays, "scores": board(id, 50)})
}

func handlePostScore(w http.ResponseWriter, r *http.Request) {
	if !allow(r, "score") {
		rateLimited(w)
		return
	}
	id := normID(r.PathValue("id"))
	var in scoreIn
	if !readJSON(w, r, smallBody, &in) {
		return
	}
	var total, n int
	if db.QueryRow(`SELECT total FROM challenges WHERE id = ?`, id).Scan(&total) != nil {
		writeErr(w, 404, "challenge_not_found", "this challenge has expired or never existed")
		return
	}
	uid, fbName := bearer(r)
	raw := in.Name
	if raw == "" {
		raw = fbName
	}
	name, err := cleanName(raw)
	if err != nil {
		nameErr(w, err)
		return
	}
	if !plausibleScore(in.Score, in.Correct, total) {
		writeErr(w, 400, "bad_score", "score out of range")
		return
	}
	db.QueryRow(`SELECT COUNT(*) FROM challenge_scores WHERE challenge_id = ?`, id).Scan(&n)
	if n >= 5000 {
		writeErr(w, 409, "board_full", "this leaderboard is full")
		return
	}
	now := nowMs()
	res, err := db.Exec(`INSERT INTO challenge_scores(challenge_id, name, uid, score, correct, ms, created) VALUES(?,?,?,?,?,?,?)`,
		id, name, uid, in.Score, in.Correct, max(0, in.Ms), now)
	if err != nil {
		writeErr(w, 500, "db", "database error")
		return
	}
	rowID, _ := res.LastInsertId()
	bump("challenge_plays", 1)
	seenIP(clientIP(r))
	db.Exec(`UPDATE challenges SET plays = plays + 1, touched = ? WHERE id = ?`, now, id)
	var rank, plays int
	db.QueryRow(`SELECT COUNT(*) + 1 FROM challenge_scores WHERE challenge_id = ? AND
		(score > ? OR (score = ? AND (ms < ? OR (ms = ? AND id < ?))))`, id, in.Score, in.Score, in.Ms, in.Ms, rowID).Scan(&rank)
	db.QueryRow(`SELECT plays FROM challenges WHERE id = ?`, id).Scan(&plays)
	writeJSON(w, 200, map[string]any{"id": rowID, "rank": rank, "plays": plays, "scores": board(id, 50)})
}
