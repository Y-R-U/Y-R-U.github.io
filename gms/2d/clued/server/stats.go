package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"
)

// Counters live in memory and are flushed to stats_daily every 30 s, so a busy
// minute costs one small transaction instead of a write per request.
var stats struct {
	sync.Mutex
	day   string
	add   map[string]int64
	peaks map[string]int64
	ips   map[string]bool
	ring  [60]minuteBucket // rolling hour, one bucket per minute
	salt  string
}

type minuteBucket struct {
	min    int64
	counts map[string]int64
}

func today() string { return nowFn().UTC().Format("2006-01-02") }

func statsInit() {
	if stats.add == nil {
		stats.add, stats.peaks, stats.ips = map[string]int64{}, map[string]int64{}, map[string]bool{}
		stats.day = today()
	}
}

func bump(key string, n int64) {
	stats.Lock()
	defer stats.Unlock()
	statsInit()
	stats.add[key] += n
	m := nowMs() / 60000
	b := &stats.ring[m%60]
	if b.min != m {
		b.min, b.counts = m, map[string]int64{}
	}
	b.counts[key] += n
}

func peak(key string, v int64) {
	stats.Lock()
	defer stats.Unlock()
	statsInit()
	if v > stats.peaks[key] {
		stats.peaks[key] = v
	}
}

func seenIP(ip string) {
	if ip == "" {
		return
	}
	stats.Lock()
	defer stats.Unlock()
	statsInit()
	if stats.salt == "" {
		stats.salt = getSetting("ip_salt")
		if stats.salt == "" {
			stats.salt = newKey()
			putSetting("ip_salt", stats.salt)
		}
	}
	sum := sha256.Sum256([]byte(stats.salt + "|" + stats.day + "|" + ip))
	stats.ips[hex.EncodeToString(sum[:12])] = true
}

func hourCounts() map[string]int64 {
	stats.Lock()
	defer stats.Unlock()
	out := map[string]int64{}
	now := nowMs() / 60000
	for _, b := range stats.ring {
		if b.counts != nil && now-b.min < 60 {
			for k, v := range b.counts {
				out[k] += v
			}
		}
	}
	return out
}

func flushStats() {
	stats.Lock()
	statsInit()
	day, add, peaks, ips := stats.day, stats.add, stats.peaks, stats.ips
	stats.add, stats.peaks, stats.ips = map[string]int64{}, map[string]int64{}, map[string]bool{}
	if d := today(); d != stats.day {
		stats.day = d
	}
	stats.Unlock()
	if len(add)+len(peaks)+len(ips) == 0 {
		return
	}
	tx, err := db.Begin()
	if err != nil {
		return
	}
	defer tx.Rollback()
	for k, v := range add {
		tx.Exec(`INSERT INTO stats_daily(day, key, value) VALUES(?,?,?)
			ON CONFLICT(day, key) DO UPDATE SET value = value + excluded.value`, day, k, v)
	}
	for k, v := range peaks {
		tx.Exec(`INSERT INTO stats_daily(day, key, value) VALUES(?,?,?)
			ON CONFLICT(day, key) DO UPDATE SET value = max(value, excluded.value)`, day, k, v)
	}
	for h := range ips {
		tx.Exec(`INSERT OR IGNORE INTO stats_ips(day, hash) VALUES(?,?)`, day, h)
	}
	tx.Commit()
}

// liveCounts reports rooms, online players and SSE connections right now.
func liveCounts() (nRooms, players, conns int) {
	now := nowMs()
	roomsMu.RLock()
	list := make([]*Room, 0, len(rooms))
	for _, r := range rooms {
		list = append(list, r)
	}
	roomsMu.RUnlock()
	for _, r := range list {
		r.mu.Lock()
		active := false
		for _, p := range r.Players {
			if p.online(now) {
				players++
				active = true
			}
		}
		if active {
			nRooms++
		}
		r.mu.Unlock()
	}
	sse.Lock()
	conns = sse.total
	sse.Unlock()
	return
}

func samplePeaks() {
	r, p, c := liveCounts()
	peak("peak_rooms", int64(r))
	peak("peak_players", int64(p))
	peak("peak_sse", int64(c))
}

func statsLoop() {
	t := time.NewTicker(5 * time.Second)
	n := 0
	day := today()
	for range t.C {
		samplePeaks()
		n++
		if n%6 == 0 {
			flushStats()
		}
		if d := today(); d != day {
			flushStats()
			go dailyDigest(day)
			day = d
		}
	}
}

func dayStats(day string) map[string]int64 {
	out := map[string]int64{}
	rows, err := db.Query(`SELECT key, value FROM stats_daily WHERE day = ?`, day)
	if err == nil {
		for rows.Next() {
			var k string
			var v int64
			if rows.Scan(&k, &v) == nil {
				out[k] = v
			}
		}
		rows.Close()
	}
	var ips int64
	db.QueryRow(`SELECT COUNT(*) FROM stats_ips WHERE day = ?`, day).Scan(&ips)
	out["distinct_ips"] = ips
	return out
}

// dailyDigest emails only when yesterday looked unusual.
func dailyDigest(day string) {
	s := dayStats(day)
	var reasons []string
	if s["refusals"] > 0 {
		reasons = append(reasons, fmt.Sprintf("%d cap refusals", s["refusals"]))
	}
	rooms := s["rooms_public"] + s["rooms_private"]
	var avg float64
	t, _ := time.Parse("2006-01-02", day)
	for i := 1; i <= 7; i++ {
		p := dayStats(t.AddDate(0, 0, -i).Format("2006-01-02"))
		avg += float64(p["rooms_public"]+p["rooms_private"]) / 7
	}
	if rooms >= 10 && float64(rooms) > 3*avg {
		reasons = append(reasons, fmt.Sprintf("%d rooms vs a 7-day average of %.1f", rooms, avg))
	}
	if s["challenges"] > int64(cfg.ChalPerDay)/2 {
		reasons = append(reasons, fmt.Sprintf("%d challenges created", s["challenges"]))
	}
	if len(reasons) == 0 {
		log.Printf("digest %s: nothing unusual", day)
		return
	}
	alert("digest", fmt.Sprintf("Clued daily digest %s: %s. Rooms %d, joins %d, challenges %d, distinct visitors %d, level %d.",
		day, strings.Join(reasons, "; "), rooms, s["joins"], s["challenges"], s["distinct_ips"], level()))
}
