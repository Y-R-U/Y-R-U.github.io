import { loadCareer, careerRankIndex, EMPEROR_MIN_WINS } from '../game/career.js';
import { RANKS, titleFor } from './ranks.js';

// FLIGHT should hand us its live instance (initUI({ career }) or setCareer): two instances would each save a stale copy.
let shared = null;
export function setCareer(c) { shared = c || null; }
export function career() { return shared || loadCareer(); }

const fmt = (n) => Math.round(n).toLocaleString('en-GB');

export function rankProgress(gender, c = career()) {
  const i = c.rankIndex, pp = c.lifetimePP, goal = c.nextGoal();
  const out = { rankIndex: i, rankTitle: titleFor(gender, i), title: c.displayTitle({ context: 'menu', gender, rankIndex: i }), pp, ppText: fmt(pp), next: null };
  if (!goal) return out;
  const lo = RANKS[i].minPP, hi = goal.rank.minPP;
  const isEmp = goal.rank.id === 'emperor';
  out.next = {
    title: titleFor(gender, i + 1), emperor: isEmp, ppNeeded: goal.ppNeeded, ppText: fmt(goal.ppNeeded),
    frac: Math.max(0, Math.min(1, (pp - lo) / Math.max(1, hi - lo))),
    wins: Math.min(c.onlineWins, EMPEROR_MIN_WINS), winsNeeded: goal.winsNeeded, winsMax: EMPEROR_MIN_WINS,
  };
  const n = out.next;
  const wins = `${n.winsNeeded} online win${n.winsNeeded === 1 ? '' : 's'}`;
  n.text = n.ppNeeded > 0 && n.winsNeeded > 0 ? `${n.ppText} PP + ${wins} to ${n.title}`
    : n.ppNeeded > 0 ? `${n.ppText} PP to ${n.title}` : `${wins} to ${n.title}`;
  return out;
}

// For the cloud two-saves chooser, from a parsed save (no instance).
export function describeCareer(raw, gender) {
  if (!raw || typeof raw !== 'object') return null;
  const i = careerRankIndex(+raw.lifetimePP || 0, raw.onlineWins | 0, raw.rankFloor | 0);
  return { rankIndex: i, title: titleFor(gender, i), pp: fmt(+raw.lifetimePP || 0) };
}
