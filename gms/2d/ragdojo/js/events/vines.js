// Vines & Ladders. Everything a player's position depends on is (account, event id, turns taken):
// the board is seeded by the event id and every die by account + event + turn, so a server can
// recompute any position from a single integer.

import { hash32, mulberry32, die } from './hash.js';

export const SQUARES = 100;
const row = (s) => Math.floor((s - 1) / 10);
const col = (s) => (row(s) % 2 ? 9 - (s - 1) % 10 : (s - 1) % 10);

/**
 * 8 ladders and 8 vines. No square is the end of two links, so links never chain. Links are 8+
 * squares long and drift at most 3 columns, so each one also crosses at least one row.
 */
export function makeBoard(eventId, { ladders = 8, vines = 8 } = {}) {
  const r = mulberry32(hash32(`board|${eventId}`));
  const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const used = new Set([1, SQUARES]);
  const out = { ladders: [], vines: [], link: {} };
  const place = (list, n, pick) => {
    for (let tries = 0; list.length < n && tries < 400; tries++) {
      const [a, b] = pick();
      if (used.has(a) || used.has(b) || Math.abs(col(a) - col(b)) > 3) continue;
      used.add(a); used.add(b);
      list.push([a, b]);
      out.link[a] = b;
    }
  };
  place(out.ladders, ladders, () => { const a = int(2, 88); return [a, Math.min(99, a + int(8, 28))]; });
  place(out.vines, vines, () => { const a = int(14, 99); return [a, Math.max(2, a - int(8, 32))]; });
  return out;
}

/**
 * One roll from `pos` (0 = before square 1). Overshooting 100 bounces back.
 * Returns the squares walked, then any ladder/vine taken.
 */
export function move(board, pos, roll) {
  const path = [];
  let p = pos, dir = 1, bounced = false;
  for (let i = 0; i < roll; i++) {
    if (p === SQUARES) { dir = -1; bounced = true; }
    p += dir;
    path.push(p);
  }
  const to = board.link[p];
  const link = to ? { from: p, to, kind: to > p ? 'ladder' : 'vine' } : null;
  return { from: pos, roll, path, bounced, link, to: to ?? p };
}

/** Where `uid` stands after `rolls` rolls. Rolls after reaching 100 are not taken. */
export function positionAfterRolls(board, uid, eventId, rolls) {
  let pos = 0, finishedAt = null;
  for (let n = 0; n < rolls && pos !== SQUARES; n++) {
    pos = move(board, pos, die(uid, eventId, n)).to;
    if (pos === SQUARES) finishedAt = n + 1;
  }
  return { pos, finishedAt };
}

/**
 * A TURN IS A BATTLE. Each battle banks a batch of rolls equal to its points, in the order the
 * battles were played; a turn is consuming one battle's batch. `points` is that ordered list.
 * Turn k ends after roll ends[k-1]: battles worth 1, 3, 2 end their turns after rolls 1, 4, 6.
 */
export function turnEnds(points) {
  let n = 0;
  return points.map((p) => (n += p));
}
export const rollsBanked = (points) => points.reduce((a, b) => a + b, 0);

/** Turns finished after `rolls` rolls (reaching 100 finishes the turn it happens in). */
export function turnsDone(board, uid, eventId, points, rolls) {
  const ends = turnEnds(points);
  const fin = positionAfterRolls(board, uid, eventId, rolls).finishedAt;
  const last = fin === null ? rolls : Math.max(rolls, ends.find((e) => e >= fin) ?? rolls);
  return ends.filter((e) => e <= last).length;
}

/** Rolls still to take in the current turn (0 between turns or once home). */
export function rollsLeftInTurn(board, uid, eventId, points, rolls) {
  const k = turnsDone(board, uid, eventId, points, rolls);
  if (k >= points.length || positionAfterRolls(board, uid, eventId, rolls).pos === SQUARES) return 0;
  return turnEnds(points)[k] - rolls;
}

/** Where a player stood at the end of their turn k. */
export function positionAtTurn(board, uid, eventId, points, k) {
  return positionAfterRolls(board, uid, eventId, k > 0 ? turnEnds(points)[Math.min(k, points.length) - 1] : 0);
}

/**
 * Take one roll. Pure: returns the new roll count, the move, and whether it ended a turn —
 * the only moment anyone else on the board may move.
 */
export function takeRoll(board, uid, eventId, points, rolls) {
  const now = positionAfterRolls(board, uid, eventId, rolls);
  if (rolls >= rollsBanked(points) || now.pos === SQUARES) return { rolls, move: null, turnEnded: false };
  const m = move(board, now.pos, die(uid, eventId, rolls));
  const before = turnsDone(board, uid, eventId, points, rolls);
  const after = turnsDone(board, uid, eventId, points, rolls + 1);
  return { rolls: rolls + 1, move: m, turnEnded: after > before, turns: after };
}

/**
 * THE REPLAY RULE. Other players are shown only as far as your own TURN count (battles whose
 * rolls you have finished): when you have finished N turns, a rival who has finished M is drawn
 * where they stood at the end of their turn min(M, N) — their own batch sizes, their own dice.
 * Nobody moves mid-turn. Leave at turn 7 and come back after they have played 30 battles —
 * they are still drawn at their turn 7 until you finish turn 8.
 */
export const shownTurns = (rivalTurns, myTurns) => Math.min(rivalTurns, myTurns);

/** `p` = { uid, points: [ordered battle points], rolls } — a player as the server stores them. */
export const turnsOf = (board, eventId, p) => turnsDone(board, p.uid, eventId, p.points, p.rolls);

export function rivalView(board, eventId, rival, myTurns) {
  const turns = turnsOf(board, eventId, rival);
  const t = shownTurns(turns, myTurns);
  return { ...rival, turns, shownTurns: t, ...positionAtTurn(board, rival.uid, eventId, rival.points, t) };
}

/** ~10 rivals: friends first (nearest first), then everyone else nearest on the board. */
export function selectRivals(board, eventId, rivals, me, { friends = new Set(), max = 10 } = {}) {
  const myTurns = turnsOf(board, eventId, me);
  const mine = positionAfterRolls(board, me.uid, eventId, me.rolls).pos;
  const seen = rivals
    .filter((r) => r.uid !== me.uid)
    .map((r) => rivalView(board, eventId, r, myTurns))
    .filter((r) => r.turns > 0);
  const near = (a, b) => Math.abs(a.pos - mine) - Math.abs(b.pos - mine) || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0);
  const fr = seen.filter((r) => friends.has(r.uid)).sort(near).map((r) => ({ ...r, friend: true }));
  const rest = seen.filter((r) => !friends.has(r.uid)).sort(near);
  return [...fr, ...rest].slice(0, max);
}
