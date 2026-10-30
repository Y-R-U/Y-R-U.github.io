package main

import "testing"

// Standard perft suite (chessprogramming.org/Perft_Results).
var perftCases = []struct {
	name  string
	fen   string
	nodes []int64 // depth 1..n
}{
	{"start", startFEN, []int64{20, 400, 8902, 197281, 4865609}},
	{"kiwipete", "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", []int64{48, 2039, 97862, 4085603}},
	{"pos3", "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", []int64{14, 191, 2812, 43238, 674624}},
	{"pos4", "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1", []int64{6, 264, 9467, 422333}},
	{"pos4-mirror", "r2q1rk1/pP1p2pp/Q4n2/bbp1p3/Np6/1B3NBn/pPPP1PPP/R3K2R b KQ - 0 1", []int64{6, 264, 9467, 422333}},
	{"pos5", "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", []int64{44, 1486, 62379, 2103487}},
	{"pos6", "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10", []int64{46, 2079, 89890, 3894594}},
}

func TestPerft(t *testing.T) {
	for _, c := range perftCases {
		p, err := ParseFEN(c.fen)
		if err != nil {
			t.Fatalf("%s: %v", c.name, err)
		}
		for d, want := range c.nodes {
			if testing.Short() && want > 500000 {
				break
			}
			if got := perft(p, d+1); got != want {
				t.Errorf("%s depth %d: got %d want %d", c.name, d+1, got, want)
			}
		}
	}
}

func TestFENRoundTrip(t *testing.T) {
	for _, c := range perftCases {
		p, _ := ParseFEN(c.fen)
		if got := p.FEN(); got != c.fen {
			t.Errorf("round trip: %q != %q", got, c.fen)
		}
	}
	for _, bad := range []string{"", "8/8/8 w - -", "rnbqkbnr/pppppppp/9/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "x7/8/8/8/8/8/8/8 w - - 0 1"} {
		if _, err := ParseFEN(bad); err == nil {
			t.Errorf("accepted bad fen %q", bad)
		}
	}
}

func play(t *testing.T, p Pos, ucis ...string) (Pos, []string) {
	t.Helper()
	var sans []string
	for _, u := range ucis {
		m, ok := p.ParseUCI(u)
		if !ok {
			t.Fatalf("illegal %s in %s", u, p.FEN())
		}
		sans = append(sans, p.SAN(m))
		p = p.Apply(m)
	}
	return p, sans
}

func TestSAN(t *testing.T) {
	_, sans := play(t, StartPos(), "f2f3", "e7e5", "g2g4", "d8h4")
	if sans[3] != "Qh4#" || sans[0] != "f3" {
		t.Errorf("fool's mate SAN %v", sans)
	}
	// Disambiguation: knights on b1 and f3 both reach d2.
	p, _ := ParseFEN("4k3/8/8/8/8/5N2/8/RN2K2R w KQ - 0 1")
	m, _ := p.ParseUCI("b1d2")
	if s := p.SAN(m); s != "Nbd2" {
		t.Errorf("got %s want Nbd2", s)
	}
	m, _ = p.ParseUCI("e1g1")
	if s := p.SAN(m); s != "O-O" {
		t.Errorf("got %s want O-O", s)
	}
	m, ok := p.ParseUCI("e1h1") // king-takes-rook spelling
	if !ok || m.To != 6 {
		t.Errorf("e1h1 castling spelling not accepted")
	}
	// Rank disambiguation: rooks a1 and a5 both reach a3.
	p, _ = ParseFEN("4k3/8/8/R7/8/8/8/R3K3 w - - 0 1")
	m, _ = p.ParseUCI("a1a3")
	if s := p.SAN(m); s != "R1a3" {
		t.Errorf("got %s want R1a3", s)
	}
	// Promotion with capture and check.
	p, _ = ParseFEN("3r3k/4P3/8/8/8/8/8/4K3 w - - 0 1")
	m, _ = p.ParseUCI("e7d8q")
	if s := p.SAN(m); s != "exd8=Q+" {
		t.Errorf("got %s want exd8=Q+", s)
	}
	// En passant.
	p, sans = play(t, StartPos(), "e2e4", "a7a6", "e4e5", "d7d5", "e5d6")
	if sans[4] != "exd6" || p.b[35] != empty {
		t.Errorf("en passant: %v %s", sans, p.FEN())
	}
}

func TestIllegal(t *testing.T) {
	p := StartPos()
	for _, u := range []string{"e2e5", "e1e2", "a1a3", "zz", "e7e5", "e2e4x", "b1d2", ""} {
		if _, ok := p.ParseUCI(u); ok {
			t.Errorf("accepted %q", u)
		}
	}
	// Pinned piece may not move; castling out of / through check refused.
	p, _ = ParseFEN("4r1k1/8/8/8/8/8/4B3/R3K2R w KQ - 0 1")
	if _, ok := p.ParseUCI("e2d3"); ok {
		t.Error("pinned bishop moved")
	}
	p, _ = ParseFEN("4k3/8/8/8/8/8/8/R3K2r w Q - 0 1")
	if _, ok := p.ParseUCI("e1c1"); ok {
		t.Error("castled out of check")
	}
	p, _ = ParseFEN("4k3/8/8/8/8/8/5r2/R3K2R w KQ - 0 1")
	if _, ok := p.ParseUCI("e1g1"); ok {
		t.Error("castled through check")
	}
}

func TestMaterial(t *testing.T) {
	cases := map[string]bool{
		"4k3/8/8/8/8/8/8/4K3 w - - 0 1":     true,
		"4k3/8/8/8/8/8/8/3NK3 w - - 0 1":    true,
		"4kb2/8/8/8/8/8/8/2B1K3 w - - 0 1":  true,  // same-colour bishops
		"4k1b1/8/8/8/8/8/8/2B1K3 w - - 0 1": false, // opposite colours
		"4k3/8/8/8/8/8/8/2NNK3 w - - 0 1":   false,
		"4k3/8/8/8/8/8/P7/4K3 w - - 0 1":    false,
	}
	for fen, want := range cases {
		p, _ := ParseFEN(fen)
		if got := p.InsufficientMaterial(); got != want {
			t.Errorf("%s: insufficient=%v want %v", fen, got, want)
		}
	}
	p, _ := ParseFEN("4k3/8/8/8/8/8/8/3NK3 w - - 0 1")
	if p.CanMate(white) || p.CanMate(black) {
		t.Error("lone knight can mate?")
	}
}
