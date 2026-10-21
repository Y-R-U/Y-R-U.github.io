// Career: lifetime PP, rank ladder with Aaron's D2 (Emperor = PP AND online wins) and D3 (title picker).
import { RANKS, rankFor } from '../../data/ranks.js';

export const CAREER_KEY = 'krayzee.career';
export const CAREER_VERSION = 1;
export const EMPEROR_MIN_WINS = RANKS.find((r) => r.id === 'emperor')?.minOnlineWins ?? 10;
export const STORY_FLOOR = 'prince';
// Contexts whose rules dictate the title (ctx.rankIndex); everything else may show the chosen title.
export const DICTATED = ['story', 'event', 'ranked', 'online'];

const IDX = Object.fromEntries(RANKS.map((r, i) => [r.id, i]));
const KING = IDX.king, EMPEROR = IDX.emperor;

export const DEFAULT_CAREER = () => ({
  v: CAREER_VERSION, lifetimePP: 0, onlineWins: 0, onlineRooms: 0, unlockedTitles: ['baron'], selectedTitle: null,
  storyComplete: false, rankFloor: 0, savedAt: 0,
  stats: { sorties: 0, bestSortie: 0, scandals: 0, crashes: 0, infractions: 0 },
});

// Pure rank rule, exported for tests: points ladder stops at King until the wins are earned.
export function careerRankIndex(lifetimePP, onlineWins = 0, floor = 0) {
  let i = Math.max(floor | 0, RANKS.indexOf(rankFor(lifetimePP)));
  if (i >= EMPEROR && onlineWins < EMPEROR_MIN_WINS) i = KING;
  return i;
}

function memoryStorage() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; }
function defaultStorage() { try { return globalThis.localStorage || memoryStorage(); } catch (e) { return memoryStorage(); } }

export function migrate(raw) {
  const d = DEFAULT_CAREER();
  if (!raw || typeof raw !== 'object') return d;
  const c = { ...d, ...raw, stats: { ...d.stats, ...(raw.stats || {}) } };
  c.lifetimePP = Math.max(0, +c.lifetimePP || 0);
  c.onlineWins = Math.max(0, c.onlineWins | 0);
  c.unlockedTitles = Array.isArray(c.unlockedTitles) ? c.unlockedTitles.filter((id) => id in IDX) : ['baron'];
  if (c.selectedTitle && !(c.selectedTitle in IDX)) c.selectedTitle = null;
  c.v = CAREER_VERSION;
  return c;
}

// Freshness is the savedAt stamp, never a JSON.stringify comparison.
export const newerCareer = (a, b) => ((a?.savedAt || 0) >= (b?.savedAt || 0) ? a : b);

export function loadCareer({ storage = defaultStorage(), now = () => Date.now(), autosave = true } = {}) {
  let raw = null;
  try { raw = JSON.parse(storage.getItem(CAREER_KEY)); } catch (e) { raw = null; }
  const C = migrate(raw);
  const listeners = {};
  const emit = (t, p) => { for (const fn of listeners[t] || []) fn(p); };

  const rankIndex = () => careerRankIndex(C.lifetimePP, C.onlineWins, C.rankFloor);
  function unlockUpTo(i) {
    const added = [];
    for (let k = 0; k <= i; k++) if (!C.unlockedTitles.includes(RANKS[k].id)) { C.unlockedTitles.push(RANKS[k].id); added.push(RANKS[k].id); }
    C.unlockedTitles.sort((a, b) => IDX[a] - IDX[b]);
    return added;
  }
  function changed(before) {
    const after = rankIndex();
    const added = unlockUpTo(after);
    let up = null;
    if (after > before) {
      up = { from: before, to: after, rank: RANKS[after], unlocks: RANKS.slice(before + 1, after + 1).flatMap((r) => r.unlocks || []), titles: added };
      emit('rankUp', up);
    }
    if (autosave) save();
    return up;
  }
  function save() {
    C.savedAt = now();
    try { storage.setItem(CAREER_KEY, JSON.stringify(C)); return true; } catch (e) { return false; }
  }
  unlockUpTo(rankIndex());

  const api = {
    on(t, fn) { (listeners[t] ||= []).push(fn); return () => { listeners[t] = listeners[t].filter((x) => x !== fn); }; },
    get lifetimePP() { return C.lifetimePP; },
    get onlineWins() { return C.onlineWins; },
    get rankIndex() { return rankIndex(); },
    get rank() { return RANKS[rankIndex()]; },
    get emperorEarned() { return C.unlockedTitles.includes('emperor'); },
    get unlockedTitles() { return C.unlockedTitles.slice(); },
    get selectedTitle() { return C.selectedTitle; },
    get storyComplete() { return C.storyComplete; },
    get savedAt() { return C.savedAt; },
    get stats() { return { ...C.stats }; },
    // PP still needed for the next rung, or wins still needed when parked at King.
    nextGoal() {
      const i = rankIndex();
      if (i >= EMPEROR) return null;
      const next = RANKS[i + 1];
      return { rank: next, ppNeeded: Math.max(0, next.minPP - C.lifetimePP), winsNeeded: next.id === 'emperor' ? Math.max(0, EMPEROR_MIN_WINS - C.onlineWins) : 0 };
    },
    addPP(pp, stats = {}) {
      const before = rankIndex();
      C.lifetimePP += Math.max(0, Math.round(pp));
      C.stats.sorties++;
      C.stats.bestSortie = Math.max(C.stats.bestSortie, Math.round(pp));
      for (const k of ['scandals', 'crashes', 'infractions']) if (stats[k]) C.stats[k] += stats[k];
      return changed(before);
    },
    addOnlineWin() { const b = rankIndex(); C.onlineWins++; return changed(b); },
    addOnlineRoom() { C.onlineRooms++; if (autosave) save(); },
    setStoryComplete() { const b = rankIndex(); C.storyComplete = true; C.rankFloor = Math.max(C.rankFloor, IDX[STORY_FLOOR]); return changed(b); },
    selectTitle(id) {
      if (id != null && !C.unlockedTitles.includes(id)) return false;
      C.selectedTitle = id;
      if (autosave) save();
      return true;
    },
    // ctx: { context:'free'|'story'|'event'|'ranked'|'online'|'menu', gender:'m'|'f', rankIndex? }
    displayRank(ctx = {}) {
      const context = ctx.context || 'free';
      if (DICTATED.includes(context)) return RANKS[ctx.rankIndex ?? rankIndex()];
      const pickOk = context === 'free' || C.storyComplete;
      const sel = pickOk && C.selectedTitle && C.unlockedTitles.includes(C.selectedTitle) ? IDX[C.selectedTitle] : rankIndex();
      return RANKS[sel];
    },
    displayTitle(ctx = {}) { const r = api.displayRank(ctx); return ctx.gender === 'f' ? r.f : r.m; },
    canPickTitle(context = 'free') { return !DICTATED.includes(context) && (context === 'free' || C.storyComplete) && C.unlockedTitles.length > 1; },
    save,
    toJSON() { return JSON.parse(JSON.stringify(C)); },
    reset() { Object.assign(C, DEFAULT_CAREER()); if (autosave) save(); },
  };
  return api;
}
