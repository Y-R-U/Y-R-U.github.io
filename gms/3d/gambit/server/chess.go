package main

// A small, self-contained chess rules engine: copy-make on a 64-square mailbox,
// pseudo-legal generation filtered by "is my king attacked afterwards". Perft-tested
// (chess_test.go). Written here rather than pulled in so the server has no rules
// dependency and the licence question never comes up; it only needs to be correct,
// not fast (a game validates one move at a time).

import (
	"errors"
	"strconv"
	"strings"
)

const (
	empty  int8 = 0
	pawn   int8 = 1
	knight int8 = 2
	bishop int8 = 3
	rook   int8 = 4
	queen  int8 = 5
	king   int8 = 6
	blackF int8 = 8 // colour bit
)

const (
	white = 0
	black = 1
)

const (
	castleWK uint8 = 1 << iota
	castleWQ
	castleBK
	castleBQ
)

const (
	flagCapture uint8 = 1 << iota
	flagEP
	flagCastle
	flagDouble
	flagPromo
)

const startFEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

// Square index: a1 = 0, h1 = 7, a8 = 56.
type Pos struct {
	b      [64]int8
	side   int
	castle uint8
	ep     int8 // en-passant target square or -1
	half   int  // halfmove clock
	full   int  // fullmove number
}

type Move struct {
	From, To int8
	Promo    int8 // piece kind, 0 = none
	Flags    uint8
}

func kindOf(p int8) int8   { return p & 7 }
func colorOf(p int8) int   { return int(p>>3) & 1 }
func fileOf(s int8) int8   { return s & 7 }
func rankOf(s int8) int8   { return s >> 3 }
func sqName(s int8) string { return string([]byte{'a' + byte(fileOf(s)), '1' + byte(rankOf(s))}) }

func parseSq(s string) (int8, bool) {
	if len(s) != 2 || s[0] < 'a' || s[0] > 'h' || s[1] < '1' || s[1] > '8' {
		return 0, false
	}
	return int8(s[1]-'1')*8 + int8(s[0]-'a'), true
}

const pieceChars = " pnbrqk"

func ParseFEN(fen string) (Pos, error) {
	var p Pos
	f := strings.Fields(fen)
	if len(f) < 4 {
		return p, errors.New("fen: too few fields")
	}
	r, c := 7, 0
	for _, ch := range f[0] {
		switch {
		case ch == '/':
			if c != 8 {
				return p, errors.New("fen: bad rank")
			}
			r, c = r-1, 0
		case ch >= '1' && ch <= '8':
			c += int(ch - '0')
		default:
			i := strings.IndexRune(pieceChars, ch|0x20)
			if i <= 0 || c > 7 || r < 0 {
				return p, errors.New("fen: bad piece")
			}
			pc := int8(i)
			if ch >= 'a' {
				pc |= blackF
			}
			p.b[r*8+c] = pc
			c++
		}
		if c > 8 {
			return p, errors.New("fen: rank overflow")
		}
	}
	if r != 0 || c != 8 {
		return p, errors.New("fen: bad board")
	}
	switch f[1] {
	case "w":
		p.side = white
	case "b":
		p.side = black
	default:
		return p, errors.New("fen: bad side")
	}
	if f[2] != "-" {
		for _, ch := range f[2] {
			switch ch {
			case 'K':
				p.castle |= castleWK
			case 'Q':
				p.castle |= castleWQ
			case 'k':
				p.castle |= castleBK
			case 'q':
				p.castle |= castleBQ
			default:
				return p, errors.New("fen: bad castling")
			}
		}
	}
	p.ep = -1
	if f[3] != "-" {
		s, ok := parseSq(f[3])
		if !ok {
			return p, errors.New("fen: bad ep")
		}
		p.ep = s
	}
	p.full = 1
	if len(f) >= 6 {
		p.half, _ = strconv.Atoi(f[4])
		p.full, _ = strconv.Atoi(f[5])
		if p.full < 1 {
			p.full = 1
		}
	}
	return p, nil
}

func StartPos() Pos { p, _ := ParseFEN(startFEN); return p }

func (p *Pos) boardFEN() string {
	var sb strings.Builder
	for r := 7; r >= 0; r-- {
		n := 0
		for c := 0; c < 8; c++ {
			pc := p.b[r*8+c]
			if pc == empty {
				n++
				continue
			}
			if n > 0 {
				sb.WriteByte('0' + byte(n))
				n = 0
			}
			ch := pieceChars[kindOf(pc)]
			if colorOf(pc) == white {
				ch -= 0x20
			}
			sb.WriteByte(ch)
		}
		if n > 0 {
			sb.WriteByte('0' + byte(n))
		}
		if r > 0 {
			sb.WriteByte('/')
		}
	}
	return sb.String()
}

func (p *Pos) castleStr() string {
	s := ""
	if p.castle&castleWK != 0 {
		s += "K"
	}
	if p.castle&castleWQ != 0 {
		s += "Q"
	}
	if p.castle&castleBK != 0 {
		s += "k"
	}
	if p.castle&castleBQ != 0 {
		s += "q"
	}
	if s == "" {
		s = "-"
	}
	return s
}

func (p *Pos) FEN() string {
	ep := "-"
	if p.ep >= 0 {
		ep = sqName(p.ep)
	}
	side := "w"
	if p.side == black {
		side = "b"
	}
	return p.boardFEN() + " " + side + " " + p.castleStr() + " " + ep + " " + strconv.Itoa(p.half) + " " + strconv.Itoa(p.full)
}

// repKey identifies a position for threefold repetition: board, side, castling and
// the en-passant square only when an en-passant capture is actually legal.
func (p *Pos) repKey() string {
	ep := "-"
	if p.ep >= 0 {
		for _, m := range p.LegalMoves() {
			if m.Flags&flagEP != 0 {
				ep = sqName(p.ep)
				break
			}
		}
	}
	side := "w"
	if p.side == black {
		side = "b"
	}
	return p.boardFEN() + " " + side + " " + p.castleStr() + " " + ep
}

var (
	knightD = [8][2]int8{{1, 2}, {2, 1}, {2, -1}, {1, -2}, {-1, -2}, {-2, -1}, {-2, 1}, {-1, 2}}
	kingD   = [8][2]int8{{1, 0}, {1, 1}, {0, 1}, {-1, 1}, {-1, 0}, {-1, -1}, {0, -1}, {1, -1}}
	rookD   = [4][2]int8{{1, 0}, {-1, 0}, {0, 1}, {0, -1}}
	bishopD = [4][2]int8{{1, 1}, {1, -1}, {-1, 1}, {-1, -1}}
)

// step returns the square (file+df, rank+dr) or -1 off the board.
func step(s, df, dr int8) int8 {
	f, r := fileOf(s)+df, rankOf(s)+dr
	if f < 0 || f > 7 || r < 0 || r > 7 {
		return -1
	}
	return r*8 + f
}

// attacked reports whether square s is attacked by colour by.
func (p *Pos) attacked(s int8, by int) bool {
	col := int8(0)
	if by == black {
		col = blackF
	}
	// pawns: a white pawn attacks diagonally upward, so look one rank below s.
	dr := int8(-1)
	if by == black {
		dr = 1
	}
	for _, df := range []int8{-1, 1} {
		if t := step(s, df, dr); t >= 0 && p.b[t] == pawn|col {
			return true
		}
	}
	for _, d := range knightD {
		if t := step(s, d[0], d[1]); t >= 0 && p.b[t] == knight|col {
			return true
		}
	}
	for _, d := range kingD {
		if t := step(s, d[0], d[1]); t >= 0 && p.b[t] == king|col {
			return true
		}
	}
	for _, d := range rookD {
		for t := step(s, d[0], d[1]); t >= 0; t = step(t, d[0], d[1]) {
			if pc := p.b[t]; pc != empty {
				if pc == rook|col || pc == queen|col {
					return true
				}
				break
			}
		}
	}
	for _, d := range bishopD {
		for t := step(s, d[0], d[1]); t >= 0; t = step(t, d[0], d[1]) {
			if pc := p.b[t]; pc != empty {
				if pc == bishop|col || pc == queen|col {
					return true
				}
				break
			}
		}
	}
	return false
}

func (p *Pos) kingSq(c int) int8 {
	k := king
	if c == black {
		k |= blackF
	}
	for i, pc := range p.b {
		if pc == k {
			return int8(i)
		}
	}
	return -1
}

func (p *Pos) InCheck() bool {
	k := p.kingSq(p.side)
	return k >= 0 && p.attacked(k, 1-p.side)
}

func (p *Pos) pseudo(out []Move) []Move {
	us := p.side
	for i := int8(0); i < 64; i++ {
		pc := p.b[i]
		if pc == empty || colorOf(pc) != us {
			continue
		}
		switch kindOf(pc) {
		case pawn:
			out = p.pawnMoves(out, i)
		case knight:
			for _, d := range knightD {
				out = p.addIf(out, i, step(i, d[0], d[1]))
			}
		case king:
			for _, d := range kingD {
				out = p.addIf(out, i, step(i, d[0], d[1]))
			}
			out = p.castles(out, i)
		case bishop:
			out = p.slide(out, i, bishopD[:])
		case rook:
			out = p.slide(out, i, rookD[:])
		case queen:
			out = p.slide(out, i, bishopD[:])
			out = p.slide(out, i, rookD[:])
		}
	}
	return out
}

func (p *Pos) addIf(out []Move, from, to int8) []Move {
	if to < 0 {
		return out
	}
	t := p.b[to]
	if t == empty {
		return append(out, Move{From: from, To: to})
	}
	if colorOf(t) != p.side {
		return append(out, Move{From: from, To: to, Flags: flagCapture})
	}
	return out
}

func (p *Pos) slide(out []Move, from int8, dirs [][2]int8) []Move {
	for _, d := range dirs {
		for t := step(from, d[0], d[1]); t >= 0; t = step(t, d[0], d[1]) {
			pc := p.b[t]
			if pc == empty {
				out = append(out, Move{From: from, To: t})
				continue
			}
			if colorOf(pc) != p.side {
				out = append(out, Move{From: from, To: t, Flags: flagCapture})
			}
			break
		}
	}
	return out
}

func (p *Pos) pawnMoves(out []Move, from int8) []Move {
	dir, startRank, lastRank := int8(1), int8(1), int8(7)
	if p.side == black {
		dir, startRank, lastRank = -1, 6, 0
	}
	push := func(m Move) {
		if rankOf(m.To) == lastRank {
			for _, k := range []int8{queen, rook, bishop, knight} {
				mm := m
				mm.Promo, mm.Flags = k, m.Flags|flagPromo
				out = append(out, mm)
			}
			return
		}
		out = append(out, m)
	}
	if t := step(from, 0, dir); t >= 0 && p.b[t] == empty {
		push(Move{From: from, To: t})
		if rankOf(from) == startRank {
			if t2 := step(t, 0, dir); t2 >= 0 && p.b[t2] == empty {
				out = append(out, Move{From: from, To: t2, Flags: flagDouble})
			}
		}
	}
	for _, df := range []int8{-1, 1} {
		t := step(from, df, dir)
		if t < 0 {
			continue
		}
		if pc := p.b[t]; pc != empty && colorOf(pc) != p.side {
			push(Move{From: from, To: t, Flags: flagCapture})
		} else if t == p.ep {
			out = append(out, Move{From: from, To: t, Flags: flagCapture | flagEP})
		}
	}
	return out
}

func (p *Pos) castles(out []Move, from int8) []Move {
	them := 1 - p.side
	if p.side == white && from == 4 {
		if p.castle&castleWK != 0 && p.b[5] == empty && p.b[6] == empty && p.b[7] == rook &&
			!p.attacked(4, them) && !p.attacked(5, them) && !p.attacked(6, them) {
			out = append(out, Move{From: 4, To: 6, Flags: flagCastle})
		}
		if p.castle&castleWQ != 0 && p.b[3] == empty && p.b[2] == empty && p.b[1] == empty && p.b[0] == rook &&
			!p.attacked(4, them) && !p.attacked(3, them) && !p.attacked(2, them) {
			out = append(out, Move{From: 4, To: 2, Flags: flagCastle})
		}
	}
	if p.side == black && from == 60 {
		br := rook | blackF
		if p.castle&castleBK != 0 && p.b[61] == empty && p.b[62] == empty && p.b[63] == br &&
			!p.attacked(60, them) && !p.attacked(61, them) && !p.attacked(62, them) {
			out = append(out, Move{From: 60, To: 62, Flags: flagCastle})
		}
		if p.castle&castleBQ != 0 && p.b[59] == empty && p.b[58] == empty && p.b[57] == empty && p.b[56] == br &&
			!p.attacked(60, them) && !p.attacked(59, them) && !p.attacked(58, them) {
			out = append(out, Move{From: 60, To: 58, Flags: flagCastle})
		}
	}
	return out
}

// castling rights lost when a piece leaves or lands on these squares.
var castleMask = func() (m [64]uint8) {
	for i := range m {
		m[i] = 0xF
	}
	m[0] &^= castleWQ
	m[7] &^= castleWK
	m[4] &^= castleWK | castleWQ
	m[56] &^= castleBQ
	m[63] &^= castleBK
	m[60] &^= castleBK | castleBQ
	return
}()

// Apply returns the position after m (m must come from pseudo/LegalMoves).
func (p Pos) Apply(m Move) Pos {
	pc := p.b[m.From]
	p.b[m.From] = empty
	if m.Flags&flagEP != 0 {
		if p.side == white {
			p.b[m.To-8] = empty
		} else {
			p.b[m.To+8] = empty
		}
	}
	if m.Promo != 0 {
		pc = m.Promo | (pc & blackF)
	}
	p.b[m.To] = pc
	if m.Flags&flagCastle != 0 {
		switch m.To {
		case 6:
			p.b[5], p.b[7] = p.b[7], empty
		case 2:
			p.b[3], p.b[0] = p.b[0], empty
		case 62:
			p.b[61], p.b[63] = p.b[63], empty
		case 58:
			p.b[59], p.b[56] = p.b[56], empty
		}
	}
	p.castle &= castleMask[m.From] & castleMask[m.To]
	p.ep = -1
	if m.Flags&flagDouble != 0 {
		p.ep = (m.From + m.To) / 2
	}
	if kindOf(pc) == pawn || m.Flags&flagCapture != 0 || m.Promo != 0 {
		p.half = 0
	} else {
		p.half++
	}
	if p.side == black {
		p.full++
	}
	p.side = 1 - p.side
	return p
}

func (p *Pos) LegalMoves() []Move {
	ps := p.pseudo(make([]Move, 0, 48))
	out := ps[:0]
	for _, m := range ps {
		np := p.Apply(m)
		if k := np.kingSq(p.side); k >= 0 && !np.attacked(k, np.side) {
			out = append(out, m)
		}
	}
	return out
}

func (m Move) UCI() string {
	s := sqName(m.From) + sqName(m.To)
	if m.Promo != 0 {
		s += string(pieceChars[m.Promo])
	}
	return s
}

// ParseUCI finds the legal move matching "e2e4" / "e7e8q". Also accepts the
// king-takes-own-rook castling spelling ("e1h1") some GUIs send.
func (p *Pos) ParseUCI(s string) (Move, bool) {
	s = strings.ToLower(strings.TrimSpace(s))
	if len(s) != 4 && len(s) != 5 {
		return Move{}, false
	}
	from, ok1 := parseSq(s[0:2])
	to, ok2 := parseSq(s[2:4])
	if !ok1 || !ok2 {
		return Move{}, false
	}
	var promo int8
	if len(s) == 5 {
		i := strings.IndexByte("nbrq", s[4])
		if i < 0 {
			return Move{}, false
		}
		promo = int8(i) + knight
	}
	if kindOf(p.b[from]) == king {
		switch {
		case from == 4 && to == 7:
			to = 6
		case from == 4 && to == 0:
			to = 2
		case from == 60 && to == 63:
			to = 62
		case from == 60 && to == 56:
			to = 58
		}
	}
	for _, m := range p.LegalMoves() {
		if m.From == from && m.To == to && m.Promo == promo {
			return m, true
		}
	}
	return Move{}, false
}

// SAN renders m (legal in p) in standard algebraic notation with +/#.
func (p *Pos) SAN(m Move) string {
	var s string
	pc := p.b[m.From]
	k := kindOf(pc)
	switch {
	case m.Flags&flagCastle != 0:
		if fileOf(m.To) == 6 {
			s = "O-O"
		} else {
			s = "O-O-O"
		}
	case k == pawn:
		if m.Flags&flagCapture != 0 {
			s = string('a'+byte(fileOf(m.From))) + "x"
		}
		s += sqName(m.To)
		if m.Promo != 0 {
			s += "=" + strings.ToUpper(string(pieceChars[m.Promo]))
		}
	default:
		s = strings.ToUpper(string(pieceChars[k]))
		sameFile, sameRank, ambiguous := false, false, false
		for _, o := range p.LegalMoves() {
			if o.To == m.To && o.From != m.From && p.b[o.From] == pc {
				ambiguous = true
				if fileOf(o.From) == fileOf(m.From) {
					sameFile = true
				}
				if rankOf(o.From) == rankOf(m.From) {
					sameRank = true
				}
			}
		}
		if ambiguous {
			switch {
			case !sameFile:
				s += string('a' + byte(fileOf(m.From)))
			case !sameRank:
				s += string('1' + byte(rankOf(m.From)))
			default:
				s += sqName(m.From)
			}
		}
		if m.Flags&flagCapture != 0 {
			s += "x"
		}
		s += sqName(m.To)
	}
	np := p.Apply(m)
	if np.InCheck() {
		if len(np.LegalMoves()) == 0 {
			s += "#"
		} else {
			s += "+"
		}
	}
	return s
}

// InsufficientMaterial: neither side can possibly mate (K v K, K+minor v K,
// bishops only and all on one square colour).
func (p *Pos) InsufficientMaterial() bool {
	minors, bishopsLight, bishopsDark, knights := 0, 0, 0, 0
	for i, pc := range p.b {
		switch kindOf(pc) {
		case pawn, rook, queen:
			return false
		case knight:
			knights++
			minors++
		case bishop:
			minors++
			if (fileOf(int8(i))+rankOf(int8(i)))%2 == 0 {
				bishopsDark++
			} else {
				bishopsLight++
			}
		}
	}
	if minors <= 1 {
		return true
	}
	return knights == 0 && (bishopsLight == 0 || bishopsDark == 0)
}

// CanMate reports whether colour c has enough material to ever deliver mate
// (used for "timeout vs insufficient material" = draw).
func (p *Pos) CanMate(c int) bool {
	n, b := 0, 0
	for _, pc := range p.b {
		if pc == empty || colorOf(pc) != c {
			continue
		}
		switch kindOf(pc) {
		case pawn, rook, queen:
			return true
		case knight:
			n++
		case bishop:
			b++
		}
	}
	return n+b >= 2
}

func perft(p Pos, depth int) int64 {
	moves := p.LegalMoves()
	if depth == 1 {
		return int64(len(moves))
	}
	var n int64
	for _, m := range moves {
		n += perft(p.Apply(m), depth-1)
	}
	return n
}
