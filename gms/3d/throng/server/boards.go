package main

import (
	"database/sql"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"time"
)

type boardEntry struct {
	PID, Name string
	Best      int
	Win       bool
}

// perDayCap: board rows one device can add in a UTC day (a match is 2 minutes; 300 is ten hours).
const perDayCap = 300

func dayKey(t time.Time) string { return t.UTC().Format("2006-01-02") }

func weekKey(t time.Time) string {
	y, w := t.UTC().ISOWeek()
	return fmt.Sprintf("%d-W%02d", y, w)
}

func recordResults(mid string, entries []boardEntry, now int64) error {
	if len(entries) == 0 {
		return nil
	}
	t := time.UnixMilli(now)
	day, week := dayKey(t), weekKey(t)
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	seen := map[string]bool{}
	for _, e := range entries {
		if seen[e.PID] { // two tabs on one device: one row
			continue
		}
		seen[e.PID] = true
		var n int
		tx.QueryRow(`SELECT COUNT(*) FROM results WHERE day = ? AND pid = ?`, day, e.PID).Scan(&n)
		if n >= perDayCap {
			continue
		}
		res, err := tx.Exec(`INSERT OR IGNORE INTO results(mid, pid, name, day, week, best, win, at) VALUES(?,?,?,?,?,?,?,?)`,
			mid, e.PID, e.Name, day, week, e.Best, b2i(e.Win), now)
		if err != nil {
			return err
		}
		if k, _ := res.RowsAffected(); k == 0 {
			continue
		}
		if _, err := tx.Exec(`INSERT INTO alltime(pid, name, best, wins, matches, at) VALUES(?,?,?,?,1,?)
			ON CONFLICT(pid) DO UPDATE SET name = excluded.name, best = MAX(best, excluded.best),
			wins = wins + excluded.wins, matches = matches + 1, at = excluded.at`, e.PID, e.Name, e.Best, b2i(e.Win), now); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func b2i(b bool) int {
	if b {
		return 1
	}
	return 0
}

var rePID = regexp.MustCompile(`^[0-9a-f]{12}$`)

type boardRow struct {
	Rank  int    `json:"rank"`
	PID   string `json:"pid"`
	Name  string `json:"name"`
	Value int    `json:"value"`
}

// GET /api/boards?period=day|week|all&kind=best|wins&me=<pid>&limit=1..100
func handleBoards(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	period, kind := q.Get("period"), q.Get("kind")
	if period == "" {
		period = "day"
	}
	if kind == "" {
		kind = "best"
	}
	if (period != "day" && period != "week" && period != "all") || (kind != "best" && kind != "wins") {
		writeErr(w, 400, "bad_request", "period day|week|all, kind best|wins")
		return
	}
	limit, _ := strconv.Atoi(q.Get("limit"))
	if limit < 1 || limit > 100 {
		limit = 50
	}
	me := q.Get("me")
	if me != "" && !rePID.MatchString(me) {
		me = ""
	}
	now := nowFn()
	key := ""
	var inner string
	var args []any
	agg := "MAX(best)"
	if kind == "wins" {
		agg = "SUM(win)"
	}
	switch period {
	case "day":
		key = dayKey(now)
		inner = `SELECT pid, ` + agg + ` AS v, MAX(at) AS last FROM results WHERE day = ? GROUP BY pid`
		args = []any{key}
	case "week":
		key = weekKey(now)
		inner = `SELECT pid, ` + agg + ` AS v, MAX(at) AS last FROM results WHERE week = ? GROUP BY pid`
		args = []any{key}
	default:
		col := "best"
		if kind == "wins" {
			col = "wins"
		}
		inner = `SELECT pid, ` + col + ` AS v, at AS last FROM alltime`
	}
	nameOf := `(SELECT name FROM alltime a WHERE a.pid = t.pid)`
	rows, err := db.Query(`SELECT t.pid, `+nameOf+`, t.v FROM (`+inner+`) t WHERE t.v > 0 ORDER BY t.v DESC, t.last ASC LIMIT ?`, append(args, limit)...)
	if err != nil {
		writeErr(w, 500, "db", "board unavailable")
		return
	}
	defer rows.Close()
	out := []boardRow{}
	for rows.Next() {
		var b boardRow
		var name sql.NullString
		rows.Scan(&b.PID, &name, &b.Value)
		b.Name = name.String
		b.Rank = len(out) + 1
		out = append(out, b)
	}
	res := map[string]any{"period": period, "kind": kind, "key": key, "rows": out, "now": now.UnixMilli()}
	if me != "" {
		var v int
		var last int64
		if err := db.QueryRow(`SELECT t.v, t.last FROM (`+inner+`) t WHERE t.pid = ?`, append(args, me)...).Scan(&v, &last); err == nil && v > 0 {
			var above int
			db.QueryRow(`SELECT COUNT(*) FROM (`+inner+`) t WHERE t.v > ? OR (t.v = ? AND t.last < ?)`, append(args, v, v, last)...).Scan(&above)
			res["me"] = map[string]any{"rank": above + 1, "value": v}
		}
	}
	writeJSON(w, 200, res)
}
