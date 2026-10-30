package main

// Time controls (DECISIONS D8) and the server-authoritative clock.
//
// Rules:
//   - No clock runs until both sides have made their first move (lichess-style). Until
//     then a first-move timer applies: miss it and the game is aborted (no result,
//     nothing counted).
//   - From ply 2 the side to move's clock runs from the moment the server accepted the
//     previous move. A move is timed when the server receives it; if the mover's time
//     ran out before that, the move is refused and the game ends on time.
//   - Increment is added after each timed move (not for the two first moves).
//   - Unlimited: no clock; each move must come within MoveTimeout (3 days) or the side
//     to move loses on time ("timeout").

import (
	"strconv"
	"strings"
	"time"
)

type TimeControl struct {
	ID   string `json:"id"`
	Base int64  `json:"base"` // ms, 0 = unlimited
	Inc  int64  `json:"inc"`  // ms
	Name string `json:"name"`
	Cat  string `json:"cat"` // bullet | blitz | rapid | classical | daily
}

func (tc TimeControl) Unlimited() bool { return tc.Base == 0 }

var timeControlIDs = []string{"1+0", "2+1", "3+0", "3+2", "5+0", "5+3", "10+0", "10+5", "15+10", "30+0", "unlimited"}

var timeControls = func() map[string]TimeControl {
	m := map[string]TimeControl{}
	for _, id := range timeControlIDs {
		m[id] = mkTC(id)
	}
	return m
}()

var categories = []string{"bullet", "blitz", "rapid", "classical", "daily"}

func mkTC(id string) TimeControl {
	if id == "unlimited" {
		return TimeControl{ID: id, Name: "Unlimited", Cat: "daily"}
	}
	a, b, _ := strings.Cut(id, "+")
	mins, _ := strconv.Atoi(a)
	inc, _ := strconv.Atoi(b)
	tc := TimeControl{ID: id, Base: int64(mins) * 60000, Inc: int64(inc) * 1000}
	// Estimated game length = base + 40 × increment (lichess's split).
	est := tc.Base/1000 + 40*tc.Inc/1000
	switch {
	case est < 180:
		tc.Cat, tc.Name = "bullet", "Bullet"
	case est < 480:
		tc.Cat, tc.Name = "blitz", "Blitz"
	case est < 1500:
		tc.Cat, tc.Name = "rapid", "Rapid"
	default:
		tc.Cat, tc.Name = "classical", "Classical"
	}
	return tc
}

const (
	firstMoveTimeout = 30 * time.Second   // timed games: each side's first move
	moveTimeout      = 3 * 24 * time.Hour // unlimited games: every move (incl. the first)
	claimAfter       = 30 * time.Second   // opponent disconnected this long → claim win/draw
)

// Clock is the per-game clock state, persisted with the game.
type Clock struct {
	Rem       [2]int64 `json:"rem"`       // ms left, white/black
	TurnStart int64    `json:"turnStart"` // ms when the side to move's turn began
	Running   bool     `json:"running"`
}

func newClock(tc TimeControl, now int64) Clock {
	return Clock{Rem: [2]int64{tc.Base, tc.Base}, TurnStart: now}
}

// left is the time the side to move (side) has at now.
func (c *Clock) left(side int, now int64) int64 {
	if !c.Running {
		return c.Rem[side]
	}
	return c.Rem[side] - (now - c.TurnStart)
}

// press charges the mover (side) for a move made at now (ply = index of this move).
// It returns false if the mover had already run out of time.
func (c *Clock) press(tc TimeControl, side, ply int, now int64) bool {
	if tc.Unlimited() {
		c.TurnStart = now
		return true
	}
	if c.Running {
		c.Rem[side] -= now - c.TurnStart
		if c.Rem[side] <= 0 {
			c.Rem[side] = 0
			return false
		}
		c.Rem[side] += tc.Inc
	}
	if ply >= 1 { // black's first move done: clocks start (white to move)
		c.Running = true
	}
	c.TurnStart = now
	return true
}

// deadline is when the side to move loses (on time) or the game is aborted (first moves).
func deadline(tc TimeControl, c *Clock, side, ply int) (at int64, abort bool) {
	switch {
	case tc.Unlimited():
		return c.TurnStart + moveTimeout.Milliseconds(), ply < 2
	case ply < 2:
		return c.TurnStart + firstMoveTimeout.Milliseconds(), true
	default:
		return c.TurnStart + c.Rem[side], false
	}
}
