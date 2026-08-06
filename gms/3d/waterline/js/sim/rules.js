import { ORDNANCE } from './tables.js';
import { RulesError, UNKNOWN, MISS, HIT, SUNK } from './consts.js';
import { redactEvents } from './events.js';

export const KINDS = Object.keys(ORDNANCE);

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// Anchor domain per kind, written out because `Cell` and `Anchor` are different types with
// different ranges (REVIEW.md B8): shell r∈[0,h), heavy r∈[0,h-2], salvo r∈[1,h-2].
export function anchorDomain(game, kind) {
  const [lo, hi] = ORDNANCE[kind].anchorInset;
  return { rLo: lo, rHi: game.h - 1 - hi, cLo: lo, cHi: game.w - 1 - hi };
}

// Total and idempotent: any input, including off-board, fractional or a bogus kind, lands on a
// legal anchor.
export function snapTarget(game, shot) {
  const kind = KINDS.includes(shot?.kind) ? shot.kind : 'shell';
  const d = anchorDomain(game, kind);
  const r = Number.isFinite(shot?.r) ? Math.round(shot.r) : 0;
  const c = Number.isFinite(shot?.c) ? Math.round(shot.c) : 0;
  return { kind, r: clamp(r, d.rLo, d.rHi), c: clamp(c, d.cLo, d.cHi) };
}

// Snaps first, so the footprint is always exactly 1, 4 or 9 in-bounds cells — the "footprints are
// never clipped" rule made structural rather than trusted (BUILD_PLAN §3.2).
export function footprint(game, shot) {
  const a = snapTarget(game, shot);
  return ORDNANCE[a.kind].offsets
    .map(([dr, dc]) => ({ r: a.r + dr, c: a.c + dc }))
    .sort((x, y) => x.r - y.r || x.c - y.c);
}

// null when the shot is legal, a reason string when it is not. Named for the failure so that the
// natural call site reads correctly: `const why = whyIllegal(g, side, shot); if (why) return why;`
export function whyIllegal(game, side, shot) {
  if (side !== 0 && side !== 1) return 'side must be 0 or 1';
  if (game.phase === 'OVER') return 'the match is over';
  if (game.phase !== 'AIM') return 'both fleets must be placed first';
  if (side !== game.sideToMove) return 'not your turn';
  if (!shot || !KINDS.includes(shot.kind)) return 'unknown ordnance';
  if (!Number.isInteger(shot.r) || !Number.isInteger(shot.c)) return 'target must be whole cells';
  const d = anchorDomain(game, shot.kind);
  if (shot.r < 0 || shot.c < 0 || shot.r >= game.h || shot.c >= game.w) return 'target is off the board';
  if (shot.r < d.rLo || shot.r > d.rHi || shot.c < d.cLo || shot.c > d.cHi) {
    return `${shot.kind} cannot be anchored that close to the edge`;
  }
  if (ORDNANCE[shot.kind].charges && game.players[side].charges[shot.kind] <= 0) {
    return `no ${shot.kind} charges left`;
  }
  return null;
}

// Charges tick after the shot resolves: +1 every `recharge` turns of your own, capped at the
// value you started with (BUILD_PLAN §3.2). Exported because the event replayer re-derives it.
export function rechargeStep(charges, start, shotsTaken) {
  for (const k of KINDS) {
    const every = ORDNANCE[k].recharge;
    if (every && shotsTaken % every === 0) charges[k] = Math.min(start[k], charges[k] + 1);
  }
  return charges;
}

// Atomic. Resolves the whole footprint, scores it, advances the turn, returns the finished list.
// Order is fixed (DECISIONS D6): shot, then results row-major, then sunks, then turn/over.
export function fireRaw(game, side, shot) {
  const why = whyIllegal(game, side, shot);
  if (why) throw new RulesError(why);

  const def = game.players[1 - side], atk = game.players[side];
  const cells = footprint(game, shot);
  const out = [];
  out.push({
    t: 'shot', side, by: side, at: 1 - side,
    kind: shot.kind, anchor: { r: shot.r, c: shot.c }, cells: cells.map(c => ({ ...c })),
  });

  if (ORDNANCE[shot.kind].charges) atk.charges[shot.kind]--;

  const sunkNow = [];
  for (const { r, c } of cells) {
    const i = r * game.w + c;
    const prev = def.board[i];
    const shipId = def.owner[i];
    const base = { t: 'result', side, by: side, at: 1 - side, r, c };
    if (prev !== UNKNOWN) {
      out.push({ ...base, hit: prev !== MISS, shipId: prev === MISS ? null : shipId, repeat: true });
      continue;
    }
    if (shipId >= 0) {
      def.board[i] = HIT;
      const ship = def.ships[shipId];
      ship.hits++;
      out.push({ ...base, hit: true, shipId, repeat: false });
      if (ship.hits === ship.len) { ship.sunk = true; sunkNow.push(ship); }
    } else {
      def.board[i] = MISS;
      out.push({ ...base, hit: false, shipId: null, repeat: false });
    }
  }

  for (const ship of sunkNow.sort((a, b) => a.id - b.id)) {
    for (const { r, c } of ship.cells) def.board[r * game.w + c] = SUNK;
    out.push({
      t: 'sunk', side, by: side, at: 1 - side,
      shipId: ship.id, len: ship.len, cells: ship.cells.map(c => ({ ...c })),
    });
  }

  game.turns++;
  atk.shots++;
  rechargeStep(atk.charges, atk.ordnanceStart, atk.shots);

  if (def.ships.every(s => s.sunk)) {
    game.phase = 'OVER';
    game.winner = side;
    out.push({ t: 'over', side, by: side, winner: side, turns: game.turns });
  } else {
    game.sideToMove = 1 - side;
    out.push({ t: 'turn', side: game.sideToMove, by: game.sideToMove });
  }

  for (const e of out) game.log.push(e);
  return out;
}

// What a renderer animates. The delta is redacted for `game.localSide` — the session's viewer,
// set once at newGame — so a presenter cannot leak by forgetting an argument. It is deliberately
// NOT redacted for the firing side: brief step 6 requires that when the enemy fires you see
// exactly which of YOUR ships was struck, which is the shipId on a result whose `at` is you.
// The unredacted delta is fireRaw(), and that is the harness's.
export function fire(game, side, shot, viewer = game.localSide ?? 0) {
  if (viewer !== 0 && viewer !== 1) throw new RulesError('viewer must be 0 or 1');
  return redactEvents(fireRaw(game, side, shot), viewer);
}
