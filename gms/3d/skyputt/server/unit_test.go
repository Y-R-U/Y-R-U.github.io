package main

import (
	"testing"
)

func baseOpts() RoomOpts {
	return RoomOpts{Course: "sky", Theme: "sky", Max: 4, Holes: []HoleRef{{"sky1", 2}, {"sky2", 3}, {"sky3", 3}},
		Helpers: HelperOpts{Mode: "fixed", N: 2}, ShotClock: 30, AI: AIOpts{Count: 2, Personality: "any", Skill: 0.4}}
}

func TestCleanOpts(t *testing.T) {
	o, code := cleanOpts(baseOpts())
	if code != "" || o.Helpers.N != 2 || o.AI.Skill != 0.4 {
		t.Fatalf("good opts refused: %s %+v", code, o)
	}
	o = baseOpts()
	o.AI.Skill = 1
	if c, _ := cleanOpts(o); c.AI.Skill != maxAISkill {
		t.Fatalf("D14 cap: %v", c.AI.Skill)
	}
	o.AI.Skill = -3
	if c, _ := cleanOpts(o); c.AI.Skill != minAISkill {
		t.Fatalf("floor: %v", c.AI.Skill)
	}
	o = baseOpts()
	o.Helpers = HelperOpts{Mode: "own", N: 9}
	if c, code := cleanOpts(o); code != "" || c.Helpers.N != 0 {
		t.Fatalf("own mode: %s %+v", code, c.Helpers)
	}
	bad := map[string]func(*RoomOpts){
		"bad_course":  func(o *RoomOpts) { o.Course = "Sky Isles" },
		"bad_theme":   func(o *RoomOpts) { o.Theme = "" },
		"bad_holes":   func(o *RoomOpts) { o.Holes = append(o.Holes, HoleRef{"sky1", 2}) },
		"bad_max":     func(o *RoomOpts) { o.Max = 12 },
		"bad_helpers": func(o *RoomOpts) { o.Helpers = HelperOpts{Mode: "fixed", N: 0} },
		"bad_clock":   func(o *RoomOpts) { o.ShotClock = 5 },
		"bad_ai":      func(o *RoomOpts) { o.AI.Count = 8 },
		"bad_name":    func(o *RoomOpts) { o.Name = "fuck off" },
	}
	for want, f := range bad {
		o := baseOpts()
		f(&o)
		if _, code := cleanOpts(o); code != want {
			t.Errorf("%s: got %q", want, code)
		}
	}
	long := baseOpts()
	long.Holes = nil
	for i := 0; i < 19; i++ {
		long.Holes = append(long.Holes, HoleRef{ID: "h" + string(rune('a'+i)), Par: 3})
	}
	if _, code := cleanOpts(long); code != "bad_holes" {
		t.Errorf("19 holes: %q", code)
	}
}

func TestModsUses(t *testing.T) {
	u := Mods{Magnet: true, Sight: 3, Power: true}.uses()
	if len(u) != 3 || u["longSight"] != 3 || u["magnet"] != 1 || u["power"] != 1 {
		t.Fatalf("uses %v", u)
	}
	if len(Mods{}.uses()) != 0 {
		t.Fatal("empty mods use nothing")
	}
}

func TestBallStateBounds(t *testing.T) {
	if !(BallState{X: 1, Y: 2, Z: 3, N: [3]float64{0, 1, 0}}).ok() {
		t.Fatal("normal ball refused")
	}
	if (BallState{X: 1e9}).ok() || (BallState{Surf: 99}).ok() {
		t.Fatal("silly ball accepted")
	}
	if okVec([]float64{1, 2}) || !okVec([]float64{1, 2, 3}) {
		t.Fatal("okVec")
	}
}

func TestStandingsTies(t *testing.T) {
	r := &Room{Seats: []*Seat{{Scores: []int{3, 3}}, {Scores: []int{2, 2}}, {Scores: []int{3, 3}}, {Scores: []int{5, 4}}}}
	order, rank := standings(r)
	if order[0] != 1 || rank[1] != 1 || rank[0] != 2 || rank[2] != 2 || rank[3] != 4 {
		t.Fatalf("order %v rank %v", order, rank)
	}
}

func TestCodes(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 2000; i++ {
		c := newCode()
		if len(c) != codeLen || normCode(c) != c || isProfane(c) {
			t.Fatalf("bad code %q", c)
		}
		seen[c] = true
	}
	if len(seen) < 1990 {
		t.Fatalf("codes collide too often: %d unique", len(seen))
	}
	if normCode(" abc23k ") != "ABC23K" || normCode("ABCD0O") != "" || normCode("AB") != "" {
		t.Fatal("normCode")
	}
}

func TestNames(t *testing.T) {
	if _, err := cleanName("SKYPUTT admin"); err == nil {
		t.Fatal("staff name allowed")
	}
	if n, _ := cleanName("  Mags   Fan  "); n != "Mags Fan" {
		t.Fatalf("clean %q", n)
	}
	if displayName("", "", "abcdef123456") != "Golfer ABCD" {
		t.Fatal("fallback name")
	}
}
