package main

// Remote debug logging. A persisted setting (debugLogs) switched from the admin page or
// `clued debuglog on|off` on the box. Clients read it from /api/status and only then
// POST batches to /api/debuglog; while it is off the endpoint answers 204 and stores nothing.

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

const (
	debugBody     = 64 << 10
	debugMaxLines = 400
)

var (
	debugCap = 50000              // rows kept; the oldest go first
	debugTTL = 7 * 24 * time.Hour // rows older than this are pruned
)

// The flag is cached for a few seconds so the CLI (a separate process writing the same
// settings row) takes effect on the running service without a restart.
var dbgFlag struct {
	sync.Mutex
	on   bool
	read time.Time
}

func debugOn() bool {
	dbgFlag.Lock()
	defer dbgFlag.Unlock()
	if time.Since(dbgFlag.read) > 5*time.Second {
		dbgFlag.on = getSetting("debugLogs") == "1"
		dbgFlag.read = time.Now()
	}
	return dbgFlag.on
}

func setDebug(on bool, why string) {
	v := "0"
	if on {
		v = "1"
	}
	old := getSetting("debugLogs") == "1"
	putSetting("debugLogs", v)
	dbgFlag.Lock()
	dbgFlag.on, dbgFlag.read = on, time.Now()
	dbgFlag.Unlock()
	if old != on {
		recordEvent("admin", fmt.Sprintf("Debug logs %s (%s)", map[bool]string{true: "ON", false: "off"}[on], why))
	}
}

type debugLine struct {
	T    int64           `json:"t"`    // client ms epoch
	P    float64         `json:"p"`    // client performance.now()
	Lvl  string          `json:"lvl"`  // info | warn | error
	Tag  string          `json:"tag"`  // e.g. listen, clip, ctx
	Msg  string          `json:"msg"`  // short event name
	Data json.RawMessage `json:"data"` // anything
}

type debugBatch struct {
	Device  string      `json:"device"`
	Session string      `json:"session"`
	Build   string      `json:"build"`
	UA      string      `json:"ua"`
	Room    string      `json:"room"`
	Lines   []debugLine `json:"lines"`
}

func clipStr(s string, n int) string {
	s = strings.ToValidUTF8(s, "?")
	if len(s) <= n {
		return s
	}
	s = s[:n]
	for !utf8.ValidString(s) {
		s = s[:len(s)-1]
	}
	return s + "…"
}

func handleDebugLog(w http.ResponseWriter, r *http.Request) {
	if !debugOn() {
		r.Body.Close()
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if !allow(r, "debuglog") {
		rateLimited(w)
		return
	}
	var b debugBatch
	if !readJSON(w, r, debugBody, &b) {
		return
	}
	if len(b.Lines) > debugMaxLines {
		b.Lines = b.Lines[:debugMaxLines]
	}
	n, err := storeDebug(b)
	if err != nil {
		writeErr(w, 500, "db", "could not store")
		return
	}
	writeJSON(w, 200, map[string]any{"stored": n})
}

func storeDebug(b debugBatch) (int, error) {
	if len(b.Lines) == 0 {
		return 0, nil
	}
	now := nowMs()
	tx, err := db.Begin()
	if err != nil {
		return 0, err
	}
	st, err := tx.Prepare(`INSERT INTO debug_logs(ts, cts, perf, device, session, build, ua, room, level, tag, msg, data)
		VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
	if err != nil {
		tx.Rollback()
		return 0, err
	}
	dev, ses, bld, ua, room := clipStr(b.Device, 40), clipStr(b.Session, 40), clipStr(b.Build, 40), clipStr(b.UA, 300), clipStr(b.Room, 40)
	for _, l := range b.Lines {
		lvl := clipStr(l.Lvl, 10)
		if lvl == "" {
			lvl = "info"
		}
		data := ""
		if len(l.Data) > 0 && string(l.Data) != "null" {
			data = clipStr(string(l.Data), 4000)
		}
		if _, err := st.Exec(now, l.T, int64(l.P), dev, ses, bld, ua, room, lvl, clipStr(l.Tag, 64), clipStr(l.Msg, 500), data); err != nil {
			st.Close()
			tx.Rollback()
			return 0, err
		}
	}
	st.Close()
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	pruneDebug()
	return len(b.Lines), nil
}

// pruneDebug keeps the newest debugCap rows and nothing older than debugTTL.
func pruneDebug() {
	db.Exec(`DELETE FROM debug_logs WHERE id <= (SELECT MAX(id) FROM debug_logs) - ?`, debugCap)
	db.Exec(`DELETE FROM debug_logs WHERE ts < ?`, nowFn().Add(-debugTTL).UnixMilli())
}

type debugRow struct {
	ID      int64           `json:"id"`
	TS      int64           `json:"ts"`
	CTS     int64           `json:"cts"`
	Perf    int64           `json:"perf"`
	Device  string          `json:"device"`
	Session string          `json:"session"`
	Build   string          `json:"build"`
	UA      string          `json:"ua"`
	Room    string          `json:"room"`
	Level   string          `json:"level"`
	Tag     string          `json:"tag"`
	Msg     string          `json:"msg"`
	Data    json.RawMessage `json:"data,omitempty"`
}

// parseSince takes epoch ms, or a duration back from now ("90s", "15m", "2h", "3d").
func parseSince(s string) int64 {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}
	if n, err := strconv.ParseInt(s, 10, 64); err == nil {
		return n
	}
	if strings.HasSuffix(s, "d") {
		if n, err := strconv.Atoi(strings.TrimSuffix(s, "d")); err == nil {
			return nowFn().Add(-time.Duration(n) * 24 * time.Hour).UnixMilli()
		}
	}
	if d, err := time.ParseDuration(s); err == nil {
		return nowFn().Add(-d).UnixMilli()
	}
	return 0
}

type debugQuery struct {
	Since   int64
	After   int64
	Device  string
	Session string
	Tag     string
	Limit   int
}

// queryDebug returns rows in order (oldest first). With a limit, the newest `limit` matches.
func queryDebug(q debugQuery) ([]debugRow, error) {
	where, args := []string{"ts >= ?", "id > ?"}, []any{q.Since, q.After}
	if q.Device != "" {
		where, args = append(where, "device = ?"), append(args, q.Device)
	}
	if q.Session != "" {
		where, args = append(where, "session = ?"), append(args, q.Session)
	}
	if q.Tag != "" {
		where, args = append(where, "(tag = ? OR tag LIKE ?)"), append(args, q.Tag, q.Tag+".%")
	}
	if q.Limit <= 0 || q.Limit > 20000 {
		q.Limit = 2000
	}
	rows, err := db.Query(`SELECT * FROM (SELECT id, ts, cts, perf, device, session, build, ua, room, level, tag, msg, data
		FROM debug_logs WHERE `+strings.Join(where, " AND ")+` ORDER BY id DESC LIMIT ?) ORDER BY id`, append(args, q.Limit)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []debugRow{}
	for rows.Next() {
		var d debugRow
		var data string
		if rows.Scan(&d.ID, &d.TS, &d.CTS, &d.Perf, &d.Device, &d.Session, &d.Build, &d.UA, &d.Room, &d.Level, &d.Tag, &d.Msg, &data) == nil {
			if data != "" {
				if json.Valid([]byte(data)) {
					d.Data = json.RawMessage(data)
				} else {
					d.Data, _ = json.Marshal(data)
				}
			}
			out = append(out, d)
		}
	}
	return out, nil
}

func debugStats() map[string]any {
	var n, devices int64
	var last int64
	db.QueryRow(`SELECT COUNT(*), COUNT(DISTINCT device), COALESCE(MAX(ts),0) FROM debug_logs`).Scan(&n, &devices, &last)
	return map[string]any{"on": debugOn(), "rows": n, "devices": devices, "last": last, "cap": debugCap, "days": int(debugTTL.Hours() / 24)}
}

func handleAdminDebugGet(w http.ResponseWriter, r *http.Request) {
	qv := r.URL.Query()
	after, _ := strconv.ParseInt(qv.Get("after"), 10, 64)
	limit, _ := strconv.Atoi(qv.Get("limit"))
	rows, err := queryDebug(debugQuery{Since: parseSince(qv.Get("since")), After: after, Device: qv.Get("device"),
		Session: qv.Get("session"), Tag: qv.Get("tag"), Limit: limit})
	if err != nil {
		writeErr(w, 500, "db", err.Error())
		return
	}
	out := debugStats()
	out["lines"] = rows
	writeJSON(w, 200, out)
}

func handleAdminDebugSet(w http.ResponseWriter, r *http.Request) {
	var in struct {
		On    *bool `json:"on"`
		Clear bool  `json:"clear"`
	}
	if !readJSON(w, r, smallBody, &in) {
		return
	}
	if in.On != nil {
		setDebug(*in.On, "admin "+identity(r).Email)
	}
	if in.Clear {
		db.Exec(`DELETE FROM debug_logs`)
	}
	writeJSON(w, 200, debugStats())
}

// CLI on the box: clued debuglog on|off|status|clear|dump [--since 1h] [--device D] [--session S] [--tag T] [--limit N] [--json]
func debugCLI(args []string) {
	if len(args) == 0 {
		args = []string{"status"}
	}
	switch args[0] {
	case "on", "off":
		setDebug(args[0] == "on", "cli")
		fallthrough
	case "status":
		s := debugStats()
		fmt.Printf("debug logs %s · %d rows · %d devices\n", map[bool]string{true: "ON", false: "off"}[s["on"].(bool)], s["rows"], s["devices"])
	case "clear":
		res, _ := db.Exec(`DELETE FROM debug_logs`)
		n, _ := res.RowsAffected()
		fmt.Println("deleted", n)
	case "dump":
		q := debugQuery{Since: parseSince("1h"), Limit: 20000}
		asJSON := false
		for i := 1; i < len(args); i++ {
			next := func() string {
				if i+1 < len(args) {
					i++
					return args[i]
				}
				return ""
			}
			switch args[i] {
			case "--since":
				q.Since = parseSince(next())
			case "--device":
				q.Device = next()
			case "--session":
				q.Session = next()
			case "--tag":
				q.Tag = next()
			case "--limit":
				q.Limit, _ = strconv.Atoi(next())
			case "--json":
				asJSON = true
			}
		}
		rows, err := queryDebug(q)
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		if asJSON {
			enc := json.NewEncoder(os.Stdout)
			for _, r := range rows {
				enc.Encode(r)
			}
			return
		}
		seen := map[string]bool{}
		for _, r := range rows {
			if k := r.Device + r.Session; !seen[k] {
				seen[k] = true
				fmt.Printf("== device %s session %s build %s room %q\n   %s\n", r.Device, r.Session, r.Build, r.Room, r.UA)
			}
			fmt.Printf("%s %s/%s %7d %-5s %-8s %s %s\n", time.UnixMilli(r.CTS).Format("15:04:05.000"), r.Device, r.Session,
				r.Perf, r.Level, r.Tag, r.Msg, string(r.Data))
		}
	default:
		fmt.Fprintln(os.Stderr, "usage: clued debuglog [on | off | status | clear | dump [--since 1h] [--device D] [--session S] [--tag T] [--limit N] [--json]]")
		os.Exit(2)
	}
}
