// Online Court (DESIGN §1.6 as amended by D4): rank by room PP. Leader = Emperor/Empress only if they have EARNED it
// in their career, else King/Queen; each later place steps down one rung; 0 room PP = Baron. Plain JSON for host handoff.
import { RANKS } from '../../data/ranks.js';
import { ROOM_TYPES } from '../../data/modes.js';

const KING = RANKS.findIndex((r) => r.id === 'king');
const EMPEROR = RANKS.findIndex((r) => r.id === 'emperor');
export const COURT_VERSION = 1;

// players: [{id, roomPP, reachedAt, emperorEarned}] → [{id, place, rankIndex}] sorted best first.
export function courtStandings(players) {
  const sorted = [...players].sort((a, b) => b.roomPP - a.roomPP || a.reachedAt - b.reachedAt || String(a.id).localeCompare(String(b.id)));
  const top = sorted[0] && sorted[0].roomPP > 0 && sorted[0].emperorEarned ? EMPEROR : KING;
  return sorted.map((p, place) => ({ ...p, place, rankIndex: p.roomPP > 0 ? Math.max(0, top - place) : 0 }));
}

export function createCourt({ roomType = 'court', target, winRounds } = {}) {
  const type = ROOM_TYPES[roomType] || ROOM_TYPES.court;
  let S = { v: COURT_VERSION, roomType, win: type.win, target: target ?? type.target ?? null, winRounds: winRounds ?? Math.ceil((type.rounds || 5) / 2),
    players: {}, holder: null, crowned: null, rounds: {}, ended: false };
  const listeners = {};
  const emit = (t, p) => { for (const fn of listeners[t] || []) fn(p); };

  function standings() {
    return courtStandings(Object.values(S.players)).map((p) => ({ ...p, rank: RANKS[p.rankIndex], crown: p.id === S.holder }));
  }
  function recompute(roomMs) {
    const st = standings();
    for (const p of st) {
      const old = S.players[p.id].rankIndex;
      S.players[p.id].rankIndex = p.rankIndex;
      if (old !== p.rankIndex) emit('rank', { id: p.id, from: old, to: p.rankIndex, rank: RANKS[p.rankIndex] });
    }
    const lead = st[0] && st[0].roomPP > 0 ? st[0].id : null;
    if (lead !== S.holder) { const from = S.holder; S.holder = lead; if (lead) emit('crownChange', { from, to: lead, emperor: st[0].rankIndex === EMPEROR, t: roomMs }); }
    if (S.win === 'first_to_target' && !S.crowned && S.target) {
      const hit = st.find((p) => p.roomPP >= S.target);
      if (hit) { S.crowned = hit.id; S.ended = true; emit('winner', { id: hit.id, reason: 'target', t: roomMs }); }
    }
    emit('standings', standings());
    return standings();
  }

  const api = {
    on(t, fn) { (listeners[t] ||= []).push(fn); return () => { listeners[t] = listeners[t].filter((x) => x !== fn); }; },
    addPlayer(id, { name = '', gender = 'm', emperorEarned = false, human = true } = {}, roomMs = 0) {
      S.players[id] ||= { id, name, gender, emperorEarned: !!emperorEarned, human, roomPP: 0, reachedAt: roomMs, rankIndex: 0 };
      Object.assign(S.players[id], { name, gender, emperorEarned: !!emperorEarned, human });
      return recompute(roomMs);
    },
    removePlayer(id, roomMs = 0) { delete S.players[id]; delete S.rounds[id]; return recompute(roomMs); },
    // Banked PP only (DESIGN: recomputed whenever anyone banks). Negative = penalty (Strict Tower crash), floored at 0.
    addPP(id, pp, roomMs = 0) {
      const p = S.players[id];
      if (!p || !pp) return standings();
      p.roomPP = Math.max(0, p.roomPP + Math.round(pp));
      p.reachedAt = roomMs;
      return recompute(roomMs);
    },
    penalize(id, pp, roomMs = 0) { return api.addPP(id, -Math.abs(pp), roomMs); },
    recordRound(id, roomMs = 0) {
      if (!S.players[id] || S.ended) return null;
      S.rounds[id] = (S.rounds[id] || 0) + 1;
      if (S.win === 'rounds' && S.rounds[id] >= S.winRounds) { S.crowned = id; S.ended = true; emit('winner', { id, reason: 'rounds', t: roomMs }); }
      return S.rounds[id];
    },
    rankOf(id) { const p = S.players[id]; return p ? RANKS[p.rankIndex] : null; },
    rankIndexOf(id) { return S.players[id]?.rankIndex ?? 0; },
    get holder() { return S.holder; },
    humanCount() { return Object.values(S.players).filter((p) => p.human).length; },
    standings,
    // Call at the bell. winner null for 'none' rooms or an all-zero room. countsAsWin: ≥ 2 humans (career onlineWins, D2).
    finish(roomMs = 0) {
      S.ended = true;
      const st = standings();
      let winner = S.crowned;
      if (!winner && S.win === 'most_pp') winner = st[0] && st[0].roomPP > 0 ? st[0].id : null;
      if (!winner && S.win === 'rounds') { const best = Object.entries(S.rounds).sort((a, b) => b[1] - a[1]); winner = best[0] && (best.length < 2 || best[0][1] > best[1][1]) ? best[0][0] : null; }
      const res = { winner, standings: st, countsAsWin: !!winner && api.humanCount() >= 2, t: roomMs };
      emit('finish', res);
      return res;
    },
    serialize() { return JSON.parse(JSON.stringify(S)); },
    restore(json) {
      const j = typeof json === 'string' ? JSON.parse(json) : json;
      if (!j || j.v !== COURT_VERSION) return false;
      S = JSON.parse(JSON.stringify(j));
      return true;
    },
  };
  return api;
}
