// Truths, their supersession chains, and the dialogue log. Pure — the screen renders what
// `truthChains` returns and makes no decisions of its own.
//
// A Truth is world-scope: earned in any campaign, never reset, never lost. When a later campaign
// overturns one, the old line is kept and struck through with the new one beneath it. Deleting it
// would erase the thing the mechanic is about (STORY §6).

export const LOG_MAX = 200;

export const blankJournal = () => ({ truths: [], log: [] });

const parentsOf = def => {
  const s = def?.supersedes;
  return s == null ? [] : (Array.isArray(s) ? s : [s]);
};

export const known = (journal, id) => journal.truths.some(t => t.id === id);

// Awarding a Truth that supersedes a known one stamps the old one rather than replacing it.
export function award(journal, id, defs, { day = 0, campaign = null, quest = null, scene = null } = {}) {
  if (!id || known(journal, id)) return journal;
  const def = defs?.[id];
  const truths = journal.truths.map(t => ({ ...t }));
  truths.push({ id, day, campaign: campaign ?? def?.campaign ?? null, quest, scene });
  for (const old of parentsOf(def)) {
    const prev = truths.find(t => t.id === old);
    if (prev && !prev.superseded) prev.superseded = { by: id, day, campaign: campaign ?? def?.campaign ?? null };
  }
  return { ...journal, truths };
}

// Chains are computed from what the player knows, not from the catalogue: a Truth is struck only
// once its overturning Truth is actually in the journal.
export function truthChains(journal, defs = {}) {
  const held = new Map(journal.truths.map(t => [t.id, t]));
  const linked = new Map(journal.truths.map(t => [t.id, new Set()]));
  const struck = new Set();
  for (const t of journal.truths) {
    for (const p of parentsOf(defs[t.id])) {
      if (!held.has(p)) continue;
      struck.add(p);
      linked.get(t.id).add(p);
      linked.get(p).add(t.id);
    }
  }

  // Grouped as connected components, so one Truth overturning two still renders as one block
  // with both struck lines above it.
  const seen = new Set();
  const chains = [];
  for (const t of journal.truths) {
    if (seen.has(t.id)) continue;
    const group = [], queue = [t.id];
    seen.add(t.id);
    while (queue.length) {
      const id = queue.shift();
      const cur = held.get(id);
      group.push({
        id,
        text: defs[id]?.text ?? id,
        day: cur.day,
        // The ring is the Truth's own campaign, not the one the player happened to be in.
        campaign: defs[id]?.campaign ?? cur.campaign,
        earned: cur.campaign,
        scene: cur.scene ?? null,
        struck: struck.has(id),
      });
      for (const n of linked.get(id)) if (!seen.has(n)) { seen.add(n); queue.push(n); }
    }
    // Struck lines first in the order they were learned, the line that still stands last.
    group.sort((a, b) => (a.struck === b.struck ? a.day - b.day : b.struck - a.struck));
    chains.push(group);
  }
  return chains.sort((a, b) => a[0].day - b[0].day);
}

export const count = (journal, defs = {}) => ({
  known: journal.truths.length,
  total: Object.keys(defs).length,
});

export function appendLog(journal, entry) {
  const log = [...journal.log, entry];
  if (log.length > LOG_MAX) log.splice(0, log.length - LOG_MAX);
  return { ...journal, log };
}

// The Log tab groups consecutive lines from one scene under one heading, which is also what
// "tapping a Truth jumps to the scene that granted it" needs to scroll to.
export function logScenes(journal) {
  const out = [];
  for (const e of journal.log) {
    const last = out[out.length - 1];
    if (last && last.scene === e.scene && last.day === e.day) last.lines.push(e.line);
    else out.push({ scene: e.scene, day: e.day, lines: [e.line] });
  }
  return out;
}

// What the Quests tab lists: tracked first, then active, board, failed, done.
const ORDER = { active: 0, turnin: 0, failed: 2, cooling: 3, done: 4 };

export function questList(defs, state, progressOf) {
  const rows = [];
  for (const [id, rec] of Object.entries(state.quests)) {
    const def = defs[id];
    if (!def) continue;
    const p = progressOf(id);
    rows.push({
      id,
      title: def.title,
      summary: def.summary,
      giver: def.giver,
      act: def.act,
      board: !!def.board,
      state: rec.s,
      tracked: state.tracked === id,
      text: p?.text || '',
      have: p?.have ?? 0,
      need: p?.need ?? 0,
    });
  }
  return rows.sort((a, b) =>
    (b.tracked - a.tracked)
    || ((ORDER[a.state] ?? 1) + (a.board ? 1 : 0)) - ((ORDER[b.state] ?? 1) + (b.board ? 1 : 0))
    || a.id.localeCompare(b.id));
}
