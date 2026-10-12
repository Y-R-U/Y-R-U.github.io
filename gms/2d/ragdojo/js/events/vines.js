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

/** Where `uid` stands after `turns` turns. Turns after reaching 100 are not taken. */
export function positionAt(board, uid, eventId, turns) {
  let pos = 0, finishedAt = null;
  for (let t = 0; t < turns && pos !== SQUARES; t++) {
    pos = move(board, pos, die(uid, eventId, t)).to;
    if (pos === SQUARES) finishedAt = t + 1;
  }
  return { pos, finishedAt };
}

/** Rolls banked so far: the event's starting roll plus one per point earned in its window. */
export const rollsBanked = (def, pts) => (def.startRolls ?? 0) + pts;

/** Take the next turn if one is banked. Pure: returns the new turn count and the move made. */
export function takeTurn(board, uid, eventId, turns, banked) {
  const now = positionAt(board, uid, eventId, turns);
  if (turns >= banked || now.pos === SQUARES) return { turns, move: null };
  return { turns: turns + 1, move: move(board, now.pos, die(uid, eventId, turns)) };
}

/**
 * THE REPLAY RULE. Other players are shown only as far as your own turn count: when you have
 * taken N turns, a rival who has taken M is drawn where they stood after min(M, N). Leave at
 * turn 7 and come back after they have played 30 — they are still drawn at their turn 7 until
 * you take turn 8.
 */
export const shownTurns = (rivalTurns, myTurns) => Math.min(rivalTurns, myTurns);

export function rivalView(board, eventId, rival, myTurns) {
  const t = shownTurns(rival.turns, myTurns);
  return { ...rival, shownTurns: t, ...positionAt(board, rival.uid, eventId, t) };
}

/** ~10 rivals: friends first (nearest first), then everyone else nearest on the board. */
export function selectRivals(board, eventId, rivals, me, { friends = new Set(), max = 10 } = {}) {
  const mine = positionAt(board, me.uid, eventId, me.turns).pos;
  const seen = rivals
    .filter((r) => r.uid !== me.uid && r.turns > 0)
    .map((r) => rivalView(board, eventId, r, me.turns));
  const near = (a, b) => Math.abs(a.pos - mine) - Math.abs(b.pos - mine) || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0);
  const fr = seen.filter((r) => friends.has(r.uid)).sort(near).map((r) => ({ ...r, friend: true }));
  const rest = seen.filter((r) => !friends.has(r.uid)).sort(near);
  return [...fr, ...rest].slice(0, max);
}
