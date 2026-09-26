// Story flag state machine, codex / family tree, story mission builder, script beats (STORY.md).
import { STORY_MISSIONS, STORY_FLAGS, RENEWAL_START, STORY_CHOICES, STORY_ITEMS, ACTS } from '../data/story.js';
import { PEOPLE, PLACES, CLUES, REVEALS, ECHO_CHANCE } from '../data/codex.js';
import { SCRIPTS, SPEAKERS } from '../data/story_a1.js';
import { BOSSES } from '../data/enemies.js';
import { generateContract, sitesFor, missionPayout, threatDef } from './missions.js';
import { rollItem } from './loot.js';
import { rngFor } from './rng.js';

export function newStoryState() {
  return { mission: 'a1_m1', done: [], reveals: [], choices: {}, clues: [], renewalDays: RENEWAL_START, flags: [], echoes: [], newClues: [] };
}

export const storyDef = id => STORY_MISSIONS.find(m => m.id === id);

export function storyReady(st, riderLevel) {
  const def = storyDef(st.mission);
  if (!def) return null;
  return riderLevel >= def.gate ? def : null;
}

export function nextStoryGate(st) { return storyDef(st.mission)?.gate ?? null; }

export function actOf(st) {
  const def = storyDef(st.mission);
  return def ? ACTS.find(a => a.act === def.act) : { act: 7, title: 'ENDGAME' };
}

// flags consumed by the contract generator + codex
export function storyFlags(st) { return new Set([...st.flags, ...st.reveals, ...st.done]); }

export function addClue(st, id) {
  if (st.clues.includes(id) || !CLUES.find(c => c.id === id)) return false;
  st.clues.push(id);
  st.newClues.push(id);
  return true;
}

// Called for every completed non-story contract.
export function tickRenewal(st) {
  if (st.done.includes('a6_m1')) { st.renewalDays = 0; return 0; }
  st.renewalDays = Math.max(1, st.renewalDays - 1);
  return st.renewalDays;
}

// Complete a story mission. choice: {key, value} for missions with a choice. Returns effects for game_state/UI.
export function completeStory(st, id, { choice } = {}) {
  const def = storyDef(id);
  if (!def || st.done.includes(id)) return null;
  const fx = { id, title: def.title, clues: [], reveal: null, unlocks: def.unlocks || [], grants: def.grants || {}, flags: [], setHeat: def.setHeat ?? null, next: null };
  st.done.push(id);
  for (const c of def.clues || []) if (addClue(st, c)) fx.clues.push(c);
  if (def.reveal) { st.reveals.push(def.reveal); fx.reveal = REVEALS[def.reveal]; }
  if (def.choice) {
    const opts = STORY_CHOICES[def.choice].options.map(o => o.id);
    st.choices[def.choice] = choice && opts.includes(choice) ? choice : opts[0];
  }
  for (const f of [...(STORY_FLAGS[id] || []), ...(def.flags || [])]) if (!st.flags.includes(f)) { st.flags.push(f); fx.flags.push(f); }
  if (def.setRenewal != null) st.renewalDays = def.setRenewal;
  const idx = STORY_MISSIONS.findIndex(m => m.id === id);
  st.mission = STORY_MISSIONS[idx + 1]?.id || 'endgame';
  fx.next = st.mission;
  return fx;
}

// 3% Echo clue from a contract in a story-relevant district (each unique once)
export function rollEcho(rng, st, district) {
  const pool = CLUES.filter(c => c.source === 'echo' && c.districts?.includes(district) && !st.clues.includes(c.id));
  if (!pool.length || !rng.chance(ECHO_CHANCE)) return null;
  const c = rng.pick(pool);
  addClue(st, c.id);
  return c.id;
}

export function echoAvailable(st, district) {
  return CLUES.some(c => c.source === 'echo' && c.districts?.includes(district) && !st.clues.includes(c.id));
}

// ---- codex ---------------------------------------------------------------------------------

function reached(st, key) {
  if (!key) return false;
  if (key === 'start') return true;
  return st.reveals.includes(key) || st.done.includes(key);
}

export function nodeState(st, node) {
  const clues = CLUES.filter(c => c.node === node.id && c.source !== 'echo');
  if (reached(st, node.revealedBy)) {
    return clues.length && clues.every(c => st.clues.includes(c.id)) ? 'complete' : 'revealed';
  }
  return reached(st, node.rumouredBy) || clues.some(c => st.clues.includes(c.id)) ? 'rumoured' : 'unknown';
}

// Shape for ui.panel.open('codex', ...)
export function codexView(st, { heirs = [] } = {}) {
  const people = PEOPLE.map(p => {
    const state = nodeState(st, p);
    const revealed = state === 'revealed' || state === 'complete';
    return {
      id: p.id, gen: p.gen, parents: p.parents, partner: p.partner, sibling: p.sibling, you: !!p.you, collapsed: !!p.collapsed,
      state, revealed,
      name: revealed ? p.name : state === 'rumoured' ? (p.rumouredName || p.name) : '?',
      role: revealed ? (p.revealedRole || p.role) : state === 'rumoured' ? p.role?.split('·')[0].trim() : '',
      portrait: revealed ? p.portrait : 'unknown', bio: revealed ? p.bio : undefined, years: revealed ? p.years : undefined,
      link: p.link && reached(st, p.revealedBy) ? p.link : undefined,
    };
  });
  heirs.forEach((h, i) => people.push({ id: 'heir' + (i + 2), gen: 5 + i, parents: [i ? 'heir' + (i + 1) : 'wren'], name: h.name, role: `Generation ${i + 2}`, state: 'revealed', revealed: true, portrait: 'rental' }));
  const clues = CLUES.map(c => ({ id: c.id, title: c.name, text: c.text, source: c.source, found: st.clues.includes(c.id), personId: c.node, new: st.newClues.includes(c.id), echo: c.source === 'echo' }));
  const places = PLACES.map(p => ({ id: p.id, name: p.name, blurb: reached(st, p.revealedBy) ? (p.revealedBlurb || p.blurb) : p.blurb, revealed: reached(st, p.revealedBy) }));
  return { chapter: actOf(st).title, act: actOf(st).act, people, clues, places, renewalDays: st.renewalDays };
}

export function markCluesSeen(st) { st.newClues = []; }

// ---- story missions ------------------------------------------------------------------------

let sseq = 0;
const sstep = (type, p) => ({ id: `ss${++sseq}`, type, ...p });

// Build the mission object for a story card. ctx is the same ctx as generateBoard.
export function buildStoryMission(id, ctx) {
  const def = storyDef(id);
  if (!def) return null;
  const rng = rngFor(ctx.seed, 'story', id);
  const threat = threatDef(ctx.threat === 'calm' ? 'tense' : ctx.threat);
  const level = Math.max(def.gate, (ctx.riderLevel || 1) - 2) + Math.max(0, threat.lvlOff);
  const S = sitesFor(def.district, ctx.sites);
  let m;
  if (def.steps) m = templateMission(def, id, S, rng, level, threat);
  else if (['walk', 'confront'].includes(def.archetype)) {
    sseq = 0;
    const tagPool = S.filter(s => s.tag !== 'spawn_edge');
    const a = def.archetype === 'confront' ? (S.find(s => s.tag === 'market') || S.find(s => s.tag === 'plaza') || tagPool[0]) : tagPool[0];
    const b = tagPool[Math.min(tagPool.length - 1, 3)];
    const steps = def.archetype === 'confront'
      ? [sstep('goto', { site: a.id, radius: 5, label: "Mara's kiosk" }), sstep('choose', { choiceKey: 'maraTone', options: STORY_CHOICES.maraTone.options.map(o => ({ label: o.label, outcome: o.id })) }), sstep('goto', { site: a.id, radius: 50, label: 'Leave', auto: true })]
      : [sstep('goto', { site: a.id, radius: 6, label: def.title }), sstep('goto', { site: b.id, radius: 6, label: 'Keep going' })];
    m = {
      id: `story_${id}`, seed: rng.int(1, 2 ** 31 - 1), archetype: def.archetype, type: 'story', name: 'Story', grade: 'story', threat: threat.id, district: def.district,
      level, client: { name: 'Mara Quill', org: 'Quill Contracts', faction: 'unlinked', portrait: { kind: 'human', seed: 11 } }, faction: def.faction || 'concord',
      target: null, npcs: [], steps, modifiers: [], timeLimit: null, parTime: 180, twist: null, enemies: [], heat: 0, checkpoints: true, bonuses: ['stealth', 'flawless', 'speed', 'clean'],
    };
  } else {
    m = generateContract(rng, { ...ctx, threat: threat.id }, { grade: 'story', archetype: def.archetype, district: def.district, noTwist: true, id: `story_${id}` });
    if (!m) return null;
    m.level = level;
    m.checkpoints = true;
    m.modifiers = [];
    m.timeLimit = null;
    if (def.faction) { m.faction = def.faction; for (const e of m.enemies) e.faction = def.faction; }
    for (const e of m.enemies) for (const u of e.units) u.level = level;
  }
  m.story = { id, act: def.act, clues: def.clues, reveal: def.reveal || null, choice: def.choice || null, grants: def.grants || null, setHeat: def.setHeat ?? null, noCombat: !!def.noCombat };
  m.title = def.title;
  m.blurb = def.blurb;
  m.client = { name: 'Mara Quill', org: 'Quill Contracts', faction: 'unlinked', portrait: { kind: 'human', seed: 11 } };
  if (def.noCombat) m.enemies = [];
  if (def.boss) {
    const bi = Math.max(0, m.steps.findIndex(s => s.type === def.bossAt));
    const bossStep = m.steps[bi];
    const site = bossStep.site || bossStep.sites?.[bossStep.sites.length - 1] || m.steps.find(s => s.site)?.site;
    m.boss = { defId: def.boss, name: BOSSES[def.boss].name, level: level + 1, site, atStep: bi };
    m.steps.splice(bi + 1, 0, { id: `sb_${id}`, type: 'kill', target: 'boss', site, label: `Defeat ${BOSSES[def.boss].name}` });
    for (const e of m.enemies) if (e.atStep > bi) e.atStep++;
  }
  if (def.scriptedAmbush) {
    const src = S.find(s => s.tag === def.scriptedAmbush.from) || S.find(s => s.tag === 'spawn_edge') || S[0];
    const leg = m.steps.findIndex((s, i) => s.type === 'goto' && i > 0);
    m.enemies = [{ pack: 'scripted', faction: 'scrap', atStep: Math.max(0, leg), site: src.id, scripted: true, trigger: { progress: def.scriptedAmbush.at, event: 'ambush' },
      units: def.scriptedAmbush.units.flatMap(([defId, rank, n]) => Array.from({ length: n }, () => ({ defId, rank, level: 1 }))) }];
  }
  m.payout = def.payout ? { credits: def.payout.credits, xp: def.payout.xp, rep: {}, cache: 'story' } : missionPayout(m, ctx);
  if (def.cacheItem) m.cacheItem = def.cacheItem;
  m.difficulty = 3;
  return m;
}

// Hand-built story steps (Act 1 M2–M5): tags → sites (deterministic), '@N'/at:N reuse step N's site.
function templateMission(def, id, S, rng, level, threat) {
  sseq = 0;
  const pool = S;
  const used = new Set();
  const pick = (tags, from, far) => {
    for (const t of tags) {
      let c = pool.filter(s => s.tag === t && !used.has(s.id));
      if (!c.length) c = pool.filter(s => s.tag === t);
      if (!c.length) continue;
      if (from && c.length > 1) c = c.slice().sort((a, b) => (far ? -1 : 1) * (Math.hypot(a.x - from.x, a.z - from.z) - Math.hypot(b.x - from.x, b.z - from.z)));
      const s = from ? c[0] : c[rng.int(0, c.length - 1)];
      used.add(s.id);
      return s;
    }
    return pool[0];
  };
  const siteOf = [];
  const steps = def.steps.map((t, i) => {
    const prev = siteOf[i - 1] || null;
    const site = t.at != null ? siteOf[t.at] : t.tags ? pick(t.tags, prev, t.far) : prev;
    siteOf[i] = site;
    const { tags, at, far, spawnTags, orExfilTags, ...rest } = t;
    const st = sstep(t.type, { ...rest, label: t.label });
    if (['goto', 'exfil', 'photo', 'defend'].includes(t.type)) st.site = site.id;
    if (t.type === 'hack') st.sites = [site.id];
    if (t.type === 'defend') st.spawns = (spawnTags || ['spawn_edge']).map(tag => pick([tag, 'spawn_edge'], site, false).id).filter((v, k, a) => a.indexOf(v) === k);
    if (t.type === 'survive' && orExfilTags) st.orExfil = pick(orExfilTags, site, false).id;
    return st;
  });
  const enemies = (def.packs || []).map((p, k) => ({
    pack: p.scripted ? 'scripted' : 'story_' + k, faction: def.faction || 'syndicate', atStep: p.atStep, site: (siteOf[p.at] || siteOf[p.atStep]).id,
    ...(p.scripted ? { scripted: true, trigger: { event: p.scripted.event, progress: p.scripted.progress } } : {}), guard: !!p.guard,
    units: p.units.flatMap(([defId, rank, n]) => Array.from({ length: n }, () => ({ defId, rank, level }))),
  }));
  const m = {
    id: `story_${id}`, seed: rng.int(1, 2 ** 31 - 1), archetype: def.archetype, type: 'story', name: 'Story', grade: 'story', threat: threat.id, district: def.district,
    level, client: null, faction: def.faction || 'syndicate', target: null, npcs: [], steps, modifiers: [], timeLimit: null, parTime: 300, twist: null, enemies,
    heat: 0, checkpoints: true, stealthy: !!def.stealthy, bonuses: ['stealth', 'flawless', 'speed', 'clean'],
  };
  if (def.target) m.target = { defId: def.target.defId, rank: def.target.rank || 'grunt', name: def.target.name, level, faction: def.faction, site: siteOf[def.target.at || 0].id };
  return m;
}

export function storyCacheItem(key, rng, ilvl = 1) {
  const spec = STORY_ITEMS[key];
  if (!spec) return null;
  const it = rollItem(rng, { ilvl, slot: spec.slot, rarity: spec.rarity, element: spec.element, forceAffixes: spec.forceAffixes, name: spec.name });
  it.story = key;
  return it;
}

// ---- scripts -------------------------------------------------------------------------------

// Beats that fire for a trigger: the matching beat plus its 'after:N' chain, in order.
export function scriptBeats(sceneId, trigger) {
  const scene = SCRIPTS[sceneId];
  if (!scene) return [];
  const start = scene.find(b => b.trigger === trigger);
  if (!start) return [];
  const out = [start];
  let n = start.n;
  for (;;) {
    const nxt = scene.find(b => b.trigger === `after:${n}`);
    if (!nxt) break;
    out.push(nxt);
    n = nxt.n;
  }
  return out.map(b => ({ ...b, speakerInfo: b.speaker ? SPEAKERS[b.speaker] : null }));
}

export const scriptTriggers = sceneId => (SCRIPTS[sceneId] || []).filter(b => !b.trigger.startsWith('after:')).map(b => b.trigger);

export { STORY_MISSIONS, CLUES, PEOPLE, REVEALS, SPEAKERS };
