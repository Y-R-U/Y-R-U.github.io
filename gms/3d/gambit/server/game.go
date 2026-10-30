package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

// Seat is one player of a game, as shown to both sides.
type Seat struct {
	UID    string `json:"uid"`
	PID    string `json:"pid"`
	Name   string `json:"name"`
	Anon   bool   `json:"anon"`
	Rating int    `json:"rating"`
	Prov   bool   `json:"prov"`
}

// Game is a live (or just-finished) game. Exported fields are persisted to live_games.
type Game struct {
	ID       string   `json:"id"`
	TCID     string   `json:"tc"`
	Rated    bool     `json:"rated"`
	Room     string   `json:"room,omitempty"` // room code it came from ("" = quick match / rematch)
	Seats    [2]Seat  `json:"seats"`
	Moves    []string `json:"moves"`
	Clock    Clock    `json:"clock"`
	Created  int64    `json:"created"`
	LastMove int64    `json:"lastMove"`
	Spent    [2]bool  `json:"spent"`   // allowance counted for this seat
	Draw     int      `json:"draw"`    // colour with a standing draw offer, -1 none
	DrawPly  [2]int   `json:"drawPly"` // len(Moves) when each side last offered (one offer per move)
	Rematch  [2]bool  `json:"-"`
	Gone     [2]int64 `json:"-"` // ms since the seat's last connection closed (0 = connected)

	Ended   bool   `json:"-"`
	Result  string `json:"-"` // 1-0 | 0-1 | 1/2-1/2 | * (aborted)
	Reason  string `json:"-"`
	EndedAt int64  `json:"-"`
	Deltas  [2]int `json:"-"` // rating change, rated games
	After   [2]int `json:"-"`
	PGN     string `json:"-"`
	Next    string `json:"-"` // rematch game id once started

	tc   TimeControl
	pos  Pos
	sans []string
	reps map[string]int
}

var (
	errNotYourTurn = errors.New("not_your_turn")
	errStalePly    = errors.New("stale_ply")
	errIllegal     = errors.New("illegal_move")
	errOver        = errors.New("game_over")
)

func newGame(id string, tc TimeControl, rated bool, w, b Seat, now int64) *Game {
	g := &Game{ID: id, TCID: tc.ID, Rated: rated, Seats: [2]Seat{w, b}, Moves: []string{},
		Clock: newClock(tc, now), Created: now, LastMove: now, Draw: -1, DrawPly: [2]int{-1, -1}}
	g.rebuild()
	return g
}

// rebuild recomputes position, SAN list and repetition counts from Moves.
func (g *Game) rebuild() error {
	tc, ok := timeControls[g.TCID]
	if !ok {
		return fmt.Errorf("unknown tc %q", g.TCID)
	}
	g.tc = tc
	g.pos = StartPos()
	g.sans = make([]string, 0, len(g.Moves))
	g.reps = map[string]int{g.pos.repKey(): 1}
	for _, u := range g.Moves {
		m, ok := g.pos.ParseUCI(u)
		if !ok {
			return fmt.Errorf("replay: illegal %s", u)
		}
		g.sans = append(g.sans, g.pos.SAN(m))
		g.pos = g.pos.Apply(m)
		g.reps[g.pos.repKey()]++
	}
	return nil
}

func (g *Game) toMove() int { return g.pos.side }

func (g *Game) seatOf(uid string) int {
	switch uid {
	case g.Seats[0].UID:
		return white
	case g.Seats[1].UID:
		return black
	}
	return -1
}

func colorName(c int) string {
	if c == white {
		return "w"
	}
	if c == black {
		return "b"
	}
	return ""
}

// move validates and plays a move by side at now. ply is the index the client thinks
// this move has (len(Moves) before it), so a resend after a reconnect is harmless.
// Returns the SAN. On a flag the game ends on time and errOver is returned.
func (g *Game) move(side int, uci string, ply int, now int64) (Move, string, error) {
	if g.Ended {
		return Move{}, "", errOver
	}
	if ply != len(g.Moves) {
		return Move{}, "", errStalePly
	}
	if side != g.toMove() {
		return Move{}, "", errNotYourTurn
	}
	m, ok := g.pos.ParseUCI(uci)
	if !ok {
		return Move{}, "", errIllegal
	}
	if at, abort := deadline(g.tc, &g.Clock, side, ply); now >= at {
		g.timeout(side, abort, now)
		return Move{}, "", errOver
	}
	if !g.Clock.press(g.tc, side, ply, now) {
		g.timeout(side, false, now)
		return Move{}, "", errOver
	}
	san := g.pos.SAN(m)
	g.Moves = append(g.Moves, m.UCI())
	g.sans = append(g.sans, san)
	g.pos = g.pos.Apply(m)
	g.reps[g.pos.repKey()]++
	g.LastMove = now
	if g.Draw == 1-side {
		g.Draw = -1 // moving instead of answering declines the offer
	}
	g.checkOutcome(now)
	return m, san, nil
}

func (g *Game) checkOutcome(now int64) {
	p := &g.pos
	legal := p.LegalMoves()
	switch {
	case len(legal) == 0 && p.InCheck():
		if p.side == white {
			g.end("0-1", "checkmate", now)
		} else {
			g.end("1-0", "checkmate", now)
		}
	case len(legal) == 0:
		g.end("1/2-1/2", "stalemate", now)
	case p.InsufficientMaterial():
		g.end("1/2-1/2", "material", now)
	case p.half >= 100:
		g.end("1/2-1/2", "fifty", now)
	case g.reps[p.repKey()] >= 3:
		g.end("1/2-1/2", "repetition", now)
	}
}

// timeout ends the game because side ran out of time (or never made a first move).
func (g *Game) timeout(side int, abort bool, now int64) {
	if abort {
		g.end("*", "aborted", now)
		return
	}
	if g.Clock.Running {
		g.Clock.Rem[side] = 0
	}
	if !g.pos.CanMate(1 - side) {
		g.end("1/2-1/2", "timeout", now) // timeout vs insufficient material
		return
	}
	g.end(winFor(1-side), "timeout", now)
}

func winFor(c int) string {
	if c == white {
		return "1-0"
	}
	return "0-1"
}

// checkTime ends the game if the side to move is past its deadline.
func (g *Game) checkTime(now int64) bool {
	if g.Ended {
		return false
	}
	side := g.toMove()
	if at, abort := deadline(g.tc, &g.Clock, side, len(g.Moves)); now >= at {
		g.timeout(side, abort, now)
		return true
	}
	return false
}

func (g *Game) end(result, reason string, now int64) {
	if g.Ended {
		return
	}
	if g.Clock.Running && !g.tc.Unlimited() {
		s := g.toMove()
		g.Clock.Rem[s] = max(0, g.Clock.left(s, now))
		g.Clock.Running = false
	}
	g.Ended, g.Result, g.Reason, g.EndedAt = true, result, reason, now
	g.Draw = -1
}

func (g *Game) aborted() bool { return g.Ended && g.Result == "*" }

// clockView is what clients render: remaining ms per side as of `at` (server ms).
func (g *Game) clockView(now int64) map[string]any {
	v := map[string]any{"at": now, "turn": colorName(g.toMove()), "running": g.Clock.Running && !g.Ended}
	if g.tc.Unlimited() {
		v["w"], v["b"] = nil, nil
	} else {
		w, b := g.Clock.Rem[0], g.Clock.Rem[1]
		if g.Clock.Running && !g.Ended {
			if g.toMove() == white {
				w = g.Clock.left(white, now)
			} else {
				b = g.Clock.left(black, now)
			}
		}
		v["w"], v["b"] = max(0, w), max(0, b)
	}
	if !g.Ended {
		at, abort := deadline(g.tc, &g.Clock, g.toMove(), len(g.Moves))
		v["deadline"] = at
		v["deadlineAborts"] = abort
	}
	return v
}

// pgn renders the finished game.
func (g *Game) pgn() string {
	var sb strings.Builder
	date := time.UnixMilli(g.Created).UTC().Format("2006.01.02")
	tcTag := "-"
	if !g.tc.Unlimited() {
		tcTag = fmt.Sprintf("%d+%d", g.tc.Base/1000, g.tc.Inc/1000)
	}
	res := g.Result
	if res == "" {
		res = "*"
	}
	tag := func(k, v string) {
		fmt.Fprintf(&sb, "[%s \"%s\"]\n", k, strings.NewReplacer(`\`, `\\`, `"`, `\"`).Replace(v))
	}
	ev := "GAMBIT casual " + g.tc.Name
	if g.Rated {
		ev = "GAMBIT rated " + g.tc.Name
	}
	tag("Event", ev)
	tag("Site", "https://games.br8t.com/gms/3d/gambit/")
	tag("Date", date)
	tag("White", g.Seats[0].Name)
	tag("Black", g.Seats[1].Name)
	tag("Result", res)
	if g.Seats[0].Rating > 0 {
		tag("WhiteElo", fmt.Sprint(g.Seats[0].Rating))
		tag("BlackElo", fmt.Sprint(g.Seats[1].Rating))
	}
	tag("TimeControl", tcTag)
	tag("Termination", g.Reason)
	tag("GameId", g.ID)
	sb.WriteString("\n")
	for i, s := range g.sans {
		if i%2 == 0 {
			fmt.Fprintf(&sb, "%d. ", i/2+1)
		}
		sb.WriteString(s)
		sb.WriteByte(' ')
	}
	sb.WriteString(res)
	sb.WriteString("\n")
	return sb.String()
}

// view is the game snapshot sent to a client; you = the viewer's colour.
func (g *Game) view(you int, now int64) map[string]any {
	seat := func(s Seat) map[string]any {
		return map[string]any{"pid": s.PID, "name": s.Name, "rating": s.Rating, "prov": s.Prov, "anon": s.Anon}
	}
	v := map[string]any{
		"id": g.ID, "tc": g.tc, "rated": g.Rated, "cat": g.tc.Cat,
		"white": seat(g.Seats[0]), "black": seat(g.Seats[1]),
		"you": colorName(you), "moves": g.Moves, "sans": g.sans, "fen": g.pos.FEN(),
		"clock": g.clockView(now), "status": "playing", "drawOffer": colorName(g.Draw),
		"created": g.Created,
	}
	if you >= 0 && g.Gone[1-you] > 0 && !g.Ended {
		v["opponentGone"] = map[string]any{"since": g.Gone[1-you], "claimAt": g.claimAt(1 - you)}
	}
	if g.Ended {
		v["status"] = "ended"
		v["result"], v["reason"] = g.Result, g.Reason
		if g.Rated && !g.aborted() {
			v["ratings"] = g.ratingsView()
		}
		if you >= 0 {
			v["rematch"] = map[string]any{"you": g.Rematch[you], "them": g.Rematch[1-you]}
		}
		if g.Next != "" {
			v["next"] = g.Next
		}
	}
	return v
}

func (g *Game) ratingsView() map[string]any {
	return map[string]any{
		"w": map[string]any{"before": g.Seats[0].Rating, "after": g.After[0], "delta": g.Deltas[0]},
		"b": map[string]any{"before": g.Seats[1].Rating, "after": g.After[1], "delta": g.Deltas[1]},
	}
}

// claimAt is when the opponent of the gone seat may claim the game (timed games only).
func (g *Game) claimAt(goneSeat int) int64 {
	if g.tc.Unlimited() || g.Gone[goneSeat] == 0 {
		return 0
	}
	return g.Gone[goneSeat] + claimAfter.Milliseconds()
}

func (g *Game) marshal() []byte { b, _ := json.Marshal(g); return b }

func unmarshalGame(data []byte) (*Game, error) {
	g := &Game{}
	if err := json.Unmarshal(data, g); err != nil {
		return nil, err
	}
	if g.Moves == nil {
		g.Moves = []string{}
	}
	return g, g.rebuild()
}
