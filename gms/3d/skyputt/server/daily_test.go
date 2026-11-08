package main

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

// TestDailyPicksMatchJS: the Go port of the daily pick agrees with js/daily/daily.js for every day
// of the fixture (460 days from Daily #1, so reef's dailyFrom 2026-11-16 is inside) and every
// open-course set. Fixture: node tools/daily_pool.mjs (tools/boards_test.mjs checks it is fresh).
func TestDailyPicksMatchJS(t *testing.T) {
	b, err := os.ReadFile("testdata/daily_picks.json")
	if err != nil {
		t.Fatal(err)
	}
	var fx struct {
		From   string                       `json:"from"`
		Days   int                          `json:"days"`
		Global []string                     `json:"global"`
		Sets   map[string]map[string]string `json:"sets"`
	}
	if err := json.Unmarshal(b, &fx); err != nil {
		t.Fatal(err)
	}
	if fx.Days < 400 || len(fx.Global) != fx.Days {
		t.Fatalf("fixture too short: %d days", fx.Days)
	}
	if fx.From > "2026-11-16" || addDays(fx.From, fx.Days) <= "2026-11-16" {
		t.Fatalf("fixture must span reef's dailyFrom")
	}
	bad := 0
	for i := 0; i < fx.Days; i++ {
		d := addDays(fx.From, i)
		g := dailyForSet(d, lockable)
		if got := g.Hole + " " + g.Twist + " " + g.Theme; got != fx.Global[i] {
			if bad++; bad < 10 {
				t.Errorf("%s global: go %q js %q", d, got, fx.Global[i])
			}
		}
	}
	sets := 0
	for key, diff := range fx.Sets {
		var open []string
		if key != "-" {
			open = strings.Split(key, ",")
		}
		sets++
		for i := 0; i < fx.Days; i++ {
			d := addDays(fx.From, i)
			p := dailyForSet(d, open)
			want, ok := diff[d]
			if !ok {
				want = strings.Join(strings.Fields(fx.Global[i])[:2], " ")
			}
			if got := p.Hole + " " + p.Twist; got != want {
				if bad++; bad < 20 {
					t.Errorf("%s open=%s: go %q js %q", d, key, got, want)
				}
			}
		}
	}
	if sets != 1<<len(lockable)-1 {
		t.Errorf("fixture has %d open sets, want %d", sets, 1<<len(lockable)-1)
	}
	// reef and star join the pool only from their dailyFrom
	for i := 0; i < fx.Days; i++ {
		d := addDays(fx.From, i)
		p := dailyForSet(d, lockable)
		if d < "2026-11-16" && strings.HasPrefix(p.Hole, "reef") {
			t.Errorf("%s picked %s before reef's dailyFrom", d, p.Hole)
		}
		if d < "2026-11-23" && (strings.HasPrefix(p.Hole, "star") || p.Theme == "star") {
			t.Errorf("%s picked %s / theme %s before star's dailyFrom", d, p.Hole, p.Theme)
		}
	}
	if bad > 0 {
		t.Fatalf("%d mismatches", bad)
	}
}

func TestDailyAllowed(t *testing.T) {
	a := dailyAllowed("2026-11-03")
	if p, ok := a["sky17"]; !ok || p.Twist != "kit" || p.N != 1 {
		t.Fatalf("Daily #1 should allow sky17 / kit, got %v", a)
	}
	if len(a) < 1 || len(a) > 1<<len(lockable) {
		t.Fatalf("allowed set size %d", len(a))
	}
}
