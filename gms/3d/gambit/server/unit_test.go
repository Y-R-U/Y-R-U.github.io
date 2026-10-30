package main

import (
	"math"
	"strings"
	"testing"
	"time"
)

func TestGlickoPaperExample(t *testing.T) {
	// Glickman's worked example: 1500/200/0.06 vs 1400/30 (win), 1550/100 (loss), 1700/300 (loss).
	p := Rating{R: 1500, RD: 200, Vol: 0.06}
	got := glickoUpdate(p, []glickoResult{
		{Opp: Rating{R: 1400, RD: 30}, Score: 1},
		{Opp: Rating{R: 1550, RD: 100}, Score: 0},
		{Opp: Rating{R: 1700, RD: 300}, Score: 0},
	})
	if math.Abs(got.R-1464.06) > 0.05 || math.Abs(got.RD-151.52) > 0.05 || math.Abs(got.Vol-0.05999) > 0.00001 {
		t.Errorf("got %.2f / %.2f / %.5f, want 1464.06 / 151.52 / 0.05999", got.R, got.RD, got.Vol)
	}
}

func TestRateGame(t *testing.T) {
	now := int64(1_800_000_000_000)
	a, b := newRating(), newRating()
	if !a.Provisional() {
		t.Fatal("new player should be provisional")
	}
	na, nb := rateGame(a, b, 1, now)
	if na.R <= 1500 || nb.R >= 1500 || math.Abs((na.R-1500)+(nb.R-1500)) > 0.01 {
		t.Errorf("equal players, white wins: %.1f %.1f", na.R, nb.R)
	}
	// Upset: a weak, settled player beating a strong, settled one moves more than the reverse.
	weak, strong := Rating{R: 1200, RD: 60, Vol: 0.06, Updated: now}, Rating{R: 1800, RD: 60, Vol: 0.06, Updated: now}
	up, _ := rateGame(weak, strong, 1, now)
	exp, _ := rateGame(strong, weak, 1, now)
	if up.R-1200 <= exp.R-1800 {
		t.Errorf("upset gain %.1f should beat expected gain %.1f", up.R-1200, exp.R-1800)
	}
	// Provisional clears after enough games; RD grows back with a long break.
	p := newRating()
	opp := Rating{R: 1500, RD: 80, Vol: 0.06, Updated: now}
	for i := 0; i < 12; i++ {
		p, _ = rateGame(p, opp, float64(i%2), now)
	}
	if p.Provisional() {
		t.Errorf("still provisional after 12 games: RD %.1f", p.RD)
	}
	if later := p.decay(now + 365*86400e3); later.RD <= p.RD {
		t.Errorf("RD did not grow over a year: %.1f -> %.1f", p.RD, later.RD)
	}
	// Draw between equals changes nothing much.
	d1, _ := rateGame(opp, opp, 0.5, now)
	if math.Abs(d1.R-1500) > 0.5 {
		t.Errorf("draw moved rating to %.1f", d1.R)
	}
}

func TestTimeControls(t *testing.T) {
	want := map[string]string{"1+0": "bullet", "2+1": "bullet", "3+0": "blitz", "3+2": "blitz", "5+0": "blitz",
		"5+3": "blitz", "10+0": "rapid", "10+5": "rapid", "15+10": "rapid", "30+0": "classical", "unlimited": "daily"}
	for id, cat := range want {
		if tc := timeControls[id]; tc.Cat != cat {
			t.Errorf("%s: cat %s want %s", id, tc.Cat, cat)
		}
	}
	if tc := timeControls["5+3"]; tc.Base != 300000 || tc.Inc != 3000 {
		t.Errorf("5+3 = %+v", tc)
	}
}

func seatsAB() (Seat, Seat) {
	return Seat{UID: "a", Name: "A", Rating: 1500}, Seat{UID: "b", Name: "B", Rating: 1500}
}

func mustMove(t *testing.T, g *Game, side int, uci string, now int64) {
	t.Helper()
	if _, _, err := g.move(side, uci, len(g.Moves), now); err != nil {
		t.Fatalf("move %s: %v", uci, err)
	}
}

func TestClockRules(t *testing.T) {
	w, b := seatsAB()
	t0 := int64(1_000_000)
	g := newGame("g1", timeControls["3+2"], true, w, b, t0)
	// No clock before both first moves: a slow first move costs nothing (within 30 s).
	mustMove(t, g, white, "e2e4", t0+20_000)
	mustMove(t, g, black, "e7e5", t0+45_000)
	if g.Clock.Rem != [2]int64{180000, 180000} || !g.Clock.Running {
		t.Fatalf("after first moves: %+v", g.Clock)
	}
	// White thinks 10 s: 180 - 10 + 2 = 172 s.
	mustMove(t, g, white, "g1f3", t0+55_000)
	if g.Clock.Rem[white] != 172000 {
		t.Errorf("white rem %d want 172000", g.Clock.Rem[white])
	}
	// Black's live clock counts down; view reports it.
	v := g.clockView(t0 + 60_000)
	if v["b"].(int64) != 175000 || v["turn"] != "b" {
		t.Errorf("clock view %+v", v)
	}
	// Black flags: the move arrives after 181 s and is refused, white wins on time.
	if _, _, err := g.move(black, "b8c6", 3, t0+55_000+181_000); err != errOver {
		t.Fatalf("late move err %v", err)
	}
	if g.Result != "1-0" || g.Reason != "timeout" {
		t.Errorf("result %s %s", g.Result, g.Reason)
	}
}

func TestFlagByTickAndInsufficient(t *testing.T) {
	w, b := seatsAB()
	g := newGame("g2", timeControls["1+0"], true, w, b, 0)
	mustMove(t, g, white, "e2e4", 1000)
	mustMove(t, g, black, "e7e5", 2000)
	if g.checkTime(2000 + 59_999) {
		t.Fatal("flagged early")
	}
	if !g.checkTime(2000+60_000) || g.Result != "0-1" {
		t.Fatalf("white should flag: %v %s", g.Ended, g.Result)
	}
	// Black flags vs K+P: white can still mate, so white wins.
	g2 := newGame("g4", timeControls["1+0"], true, w, b, 0)
	g2.pos, _ = ParseFEN("4k3/8/8/8/8/8/4P3/4K3 b - - 0 1")
	g2.timeout(black, false, 60_000)
	if g2.Result != "1-0" {
		t.Errorf("black flags vs K+P: %s", g2.Result)
	}
	// White flags vs a lone king: black cannot mate, draw.
	g3 := newGame("g5", timeControls["1+0"], true, w, b, 0)
	g3.pos, _ = ParseFEN("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1")
	g3.timeout(white, false, 60_000)
	if g3.Result != "1/2-1/2" || g3.Reason != "timeout" {
		t.Errorf("white flags vs lone king: %s %s, want draw", g3.Result, g3.Reason)
	}
}

func TestFirstMoveAbortAndUnlimited(t *testing.T) {
	w, b := seatsAB()
	g := newGame("g6", timeControls["5+0"], true, w, b, 0)
	if !g.checkTime(30_000) || !g.aborted() {
		t.Fatalf("no first move in 30 s should abort: %s %s", g.Result, g.Reason)
	}
	g = newGame("g7", timeControls["5+0"], true, w, b, 0)
	mustMove(t, g, white, "d2d4", 5000)
	if g.checkTime(34_999) || !g.checkTime(35_000) || !g.aborted() {
		t.Fatalf("black's first-move timer: %v %s", g.Ended, g.Reason)
	}
	// Unlimited: days between moves are fine; 3 days of silence loses.
	day := int64(86400_000)
	g = newGame("g8", timeControls["unlimited"], true, w, b, 0)
	mustMove(t, g, white, "e2e4", day)
	mustMove(t, g, black, "c7c5", 3*day)
	mustMove(t, g, white, "g1f3", 5*day)
	if g.checkTime(8*day - 1) {
		t.Fatal("unlimited timed out early")
	}
	if !g.checkTime(8*day) || g.Result != "1-0" || g.Reason != "timeout" {
		t.Fatalf("unlimited 3-day timeout: %s %s", g.Result, g.Reason)
	}
	if v := g.clockView(0); v["w"] != nil {
		t.Errorf("unlimited clock should be nil: %+v", v)
	}
}

func TestDrawRules(t *testing.T) {
	w, b := seatsAB()
	g := newGame("g9", timeControls["unlimited"], false, w, b, 0)
	for i, u := range []string{"g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1", "f6g8"} {
		mustMove(t, g, i%2, u, int64(i))
	}
	if g.Result != "1/2-1/2" || g.Reason != "repetition" {
		t.Errorf("threefold: %s %s", g.Result, g.Reason)
	}
	g = newGame("g10", timeControls["unlimited"], false, w, b, 0)
	for i, u := range []string{"f2f3", "e7e5", "g2g4", "d8h4"} {
		mustMove(t, g, i%2, u, int64(i))
	}
	if g.Result != "0-1" || g.Reason != "checkmate" {
		t.Errorf("fool's mate: %s %s", g.Result, g.Reason)
	}
	pgn := g.pgn()
	for _, want := range []string{`[Result "0-1"]`, "1. f3 e5 2. g4 Qh4# 0-1", `[TimeControl "-"]`} {
		if !strings.Contains(pgn, want) {
			t.Errorf("pgn missing %q:\n%s", want, pgn)
		}
	}
	// Persist round trip.
	g2, err := unmarshalGame(g.marshal())
	if err != nil || g2.pos.FEN() != g.pos.FEN() || len(g2.sans) != 4 {
		t.Errorf("round trip: %v", err)
	}
	_ = time.Second
}
