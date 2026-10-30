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
//   - Lag credit (D24, lichess-style): each timed move is credited up to
//     min(estimated round trip, 1000 ms), paid from a per-side quota that refills by a
//     small amount per move, so a client that fakes a big lag cannot bank extra time.

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

// press charges the mover (side) for a move made at now (ply = index of this move),
// minus credit ms of lag compensation. It returns false if the mover had run out of time.
func (c *Clock) press(tc TimeControl, side, ply int, now, credit int64) bool {
	if tc.Unlimited() {
		c.TurnStart = now
		return true
	}
	if c.Running {
		c.Rem[side] -= now - c.TurnStart - credit
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

// ---------------------------------------------------------------- lag credit (D24)
//
// The mover's clock runs from the server's accept time of the previous move, so the
// network round trip (opponent's move travelling out, this move travelling back) is
// charged to the mover. Lag compensation, modelled on lichess's LagTracker:
//
//   - The server measures each connection's round trip itself with websocket pings (every
//     4 s while the player has a live timed game, else 25 s; browsers answer pings at the
//     protocol level, page JS cannot delay them). Lag = the full RTT (the mover is charged
//     both legs; manager decision), smoothed with an EWMA (1/4 weight per sample, samples capped at 2 s RTT). Nothing the client says
//     about itself is trusted.
//   - Each timed move (from ply 2, clocks running) is credited
//         credit = min(lag, maxLagCredit = 1000 ms, quota[side], time spent on the move)
//     and then quota[side] = min(quota[side] - credit + gain, 5 × gain).
//   - gain = min(300, 100 + (base + 40 × inc) / 1500) ms per move: 140 ms at 1+0,
//     206 at 2+1, 220 at 3+0, 300 from 5+0 up. The quota starts at 3 × gain.
//
// An honest connection (RTT below gain) is always fully credited; a slow one is
// credited up to gain per move on average plus the banked quota for spikes. A client that
// fakes lag (delaying pongs) gains at most gain per move + 2 × gain overall, e.g. ~9 s
// over a 40-move 3+0 game, and only while the quota lasts. A move can never earn more
// credit than the time it took, so a credited move never adds net time beyond the
// increment. The tick that flags a player waits the same credit before flagging, so a
// move that arrives just after the visible deadline but within its lag credit counts.

const (
	maxLagCredit = 1000 // ms
	maxLagSample = 2000 // ms of RTT; bigger samples are clamped
)

func lagQuotaGain(tc TimeControl) int64 {
	if tc.Unlimited() {
		return 0
	}
	return min(300, 100+(tc.Base+40*tc.Inc)/1500)
}

func initialLagQuota(tc TimeControl) int64 { return 3 * lagQuotaGain(tc) }
func maxLagQuota(tc TimeControl) int64     { return 5 * lagQuotaGain(tc) }

// lagCredit is the credit a move by side at now would get with lag (round-trip) estimate est (ms).
func lagCredit(tc TimeControl, c *Clock, quota, est, now int64) int64 {
	if tc.Unlimited() || !c.Running || est <= 0 {
		return 0
	}
	return max(0, min(est, maxLagCredit, quota, now-c.TurnStart))
}

// spendLagQuota updates a side's quota after a credited timed move.
func spendLagQuota(tc TimeControl, quota, credit int64) int64 {
	return min(quota-credit+lagQuotaGain(tc), maxLagQuota(tc))
}
