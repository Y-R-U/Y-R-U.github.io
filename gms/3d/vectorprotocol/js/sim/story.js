// Story maps: flattening, unlocks, stars.
export function allLevels(data) {
  if (data._levels) return data._levels;
  const out = [];
  (data.maps || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).forEach((m, mi) => {
    m.levels.forEach((l, li) => out.push({ ...l, mapId: m.id, mapIndex: mi, index: li, globalIndex: out.length }));
  });
  Object.defineProperty(data, '_levels', { value: out, enumerable: false, configurable: true });
  return out;
}
export function getLevel(data, id) { return allLevels(data).find((l) => l.id === id) || null; }

// Strictly linear: a level is open when the one before it (globally) has been cleared.
export function isUnlocked(data, save, id) {
  const L = allLevels(data);
  const i = L.findIndex((l) => l.id === id);
  if (i < 0) return false;
  return i === 0 || !!save.story.levels[L[i - 1].id]?.stars;
}
export function nextLevel(data, save) {
  return allLevels(data).find((l) => !save.story.levels[l.id]?.stars) || null;
}
export function mapProgress(data, save, mapId) {
  const ls = allLevels(data).filter((l) => l.mapId === mapId);
  let stars = 0, cleared = 0;
  for (const l of ls) { const s = save.story.levels[l.id]?.stars || 0; stars += s; if (s) cleared++; }
  return { levels: ls.length, cleared, stars, maxStars: ls.length * 3, done: cleared === ls.length };
}
export function recordClear(save, levelId, stars) {
  const rec = (save.story.levels[levelId] ||= { stars: 0, clears: 0 });
  const first = rec.clears === 0;
  const newStars = Math.max(0, stars - rec.stars);
  rec.clears++;
  rec.stars = Math.max(rec.stars, stars);
  return { first, newStars, prevStars: rec.stars - newStars };
}

// ---------- star goals (3 per level; each is earned once, independently, on a win)
// GoalDef: {type:'win'} | {type:'no_losses'} | {type:'max_lost', n} | {type:'time', max /*s*/}
//   | {type:'max_units', n} | {type:'no_role', role} | {type:'min_role', role, n}
//   | {type:'min_faction', faction, n} | {type:'integrity', min /*0..1*/}
// ctx: {win, time, lost, deployed, roles:{tank,archer,mage}, factions:{…}, integrity}
export function evalGoal(g, ctx) {
  if (!ctx.win) return false;
  switch (g.type) {
    case 'win': return true;
    case 'no_losses': return ctx.lost === 0;
    case 'max_lost': return ctx.lost <= (g.n ?? 0);
    case 'time': return ctx.time <= g.max;
    case 'max_units': return ctx.deployed <= g.n;
    case 'no_role': return !(ctx.roles?.[g.role] > 0);
    case 'min_role': return (ctx.roles?.[g.role] || 0) >= g.n;
    case 'min_faction': return (ctx.factions?.[g.faction] || 0) >= g.n;
    case 'integrity': return ctx.integrity >= g.min;
    default: return false;
  }
}
export function evalGoals(goals, ctx) { return (goals || []).map((g) => evalGoal(g, ctx)); }

const ROLE_NAME = { tank: 'Tanks', archer: 'Archers', mage: 'Mages' };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// Short UI text. Data may carry its own `text`; this is the fallback.
export function goalText(g) {
  if (g.text) return g.text;
  switch (g.type) {
    case 'win': return 'Win the contract';
    case 'no_losses': return 'Win without losing a unit';
    case 'max_lost': return g.n === 0 ? 'Win without losing a unit' : `Win losing at most ${g.n} unit${g.n === 1 ? '' : 's'}`;
    case 'time': return `Win in ${g.max} s or less`;
    case 'max_units': return `Win with ${g.n} unit${g.n === 1 ? '' : 's'} or fewer`;
    case 'no_role': return `Win without ${ROLE_NAME[g.role] || g.role}`;
    case 'min_role': return `Win with ${g.n}+ ${ROLE_NAME[g.role] || g.role}`;
    case 'min_faction': return `Win with ${g.n}+ ${cap(g.faction)} units`;
    case 'integrity': return `Win with ${Math.round(g.min * 100)}% squad integrity`;
    default: return g.type;
  }
}
// Pre-battle constraints the squad must satisfy for a goal to be possible (UI hint / auto-formation).
export function goalSquadRule(g) {
  if (g.type === 'max_units') return { maxUnits: g.n };
  if (g.type === 'no_role') return { excludeRoles: [g.role] };
  if (g.type === 'min_role') return { minRole: { [g.role]: g.n } };
  if (g.type === 'min_faction') return { minFaction: { [g.faction]: g.n } };
  return null;
}
// Default when a level has no `goals`: win / ≤1 lost / no losses (the old star rule).
export const DEFAULT_GOALS = [{ type: 'win' }, { type: 'max_lost', n: 1 }, { type: 'no_losses' }];
export function levelGoals(level) { return level?.goals?.length ? level.goals : null; }

// Merge one run's goal results into the save record. Returns the indexes newly completed.
export function recordGoals(save, levelId, done) {
  const rec = (save.story.levels[levelId] ||= { stars: 0, clears: 0 });
  const g = rec.goals || (rec.goals = [rec.stars >= 1, rec.stars >= 2, rec.stars >= 3]);
  const fresh = [];
  done.forEach((d, i) => { if (d && !g[i]) { g[i] = true; fresh.push(i); } });
  rec.stars = g.filter(Boolean).length;
  return fresh;
}

// Map star chests: MapDef.chests = [{stars, rewards}]; state per chest.
export function mapChests(data, save, mapId) {
  const m = (data.maps || []).find((x) => x.id === mapId);
  if (!m?.chests) return [];
  const { stars } = mapProgress(data, save, mapId);
  const claimed = save.story.chests?.[mapId] || [];
  return m.chests.map((c, i) => ({ index: i, stars: c.stars, rewards: c.rewards, claimed: !!claimed[i], ready: !claimed[i] && stars >= c.stars }));
}
