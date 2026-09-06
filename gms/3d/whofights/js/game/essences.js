// Essences, confluences, and what the four of them give you. Pure — no DOM, no three — because
// the one rule that matters is arithmetic over a triple and it has to hold for every triple there
// is, not for the twelve somebody thought of.
//
// The book's shape, kept: you take THREE essences, and the fourth is whatever those three come to
// between them. Nobody chooses a confluence. `data/essences.json` names the combinations the
// Society has on file; anything else is matched on what the three are made of, so there is no
// triple that resolves to nothing and no player who can pick their way into a blank sheet.
//
// One ability from each of the four to begin with — DEV_CONTRACT §12. The rest are awakened later.

export const PICK = 3;

const asId = v => (typeof v === 'string' ? v : '');

// A triple is a set, not a sequence: fire-water-wind and wind-fire-water are one choice, and the
// registry is keyed on the sorted form so it cannot hold both.
export const key = ids => [...new Set(ids.map(asId).filter(Boolean))].sort();

export function normalise(raw) {
  const warnings = [];
  const essences = {};
  for (const [id, e] of Object.entries(raw?.essences || {})) {
    if (!e || typeof e !== 'object') { warnings.push(`${id}: not an object`); continue; }
    const abilities = (Array.isArray(e.abilities) ? e.abilities : []).filter(a => a && a.id && a.name);
    if (!abilities.length) warnings.push(`${id}: no abilities`);
    essences[id] = {
      id,
      name: String(e.name || id),
      colour: typeof e.colour === 'string' ? e.colour : '#888888',
      tags: Array.isArray(e.tags) ? e.tags.filter(t => typeof t === 'string') : [],
      blurb: String(e.blurb || ''),
      abilities,
    };
  }
  const confluences = (Array.isArray(raw?.confluences) ? raw.confluences : [])
    .filter(c => c && c.id && c.name)
    .map(c => ({
      id: c.id,
      name: String(c.name),
      blurb: String(c.blurb || ''),
      exact: Array.isArray(c.exact) ? key(c.exact) : null,
      needs: c.needs && typeof c.needs === 'object' ? c.needs : null,
      abilities: (Array.isArray(c.abilities) ? c.abilities : []).filter(a => a && a.id && a.name),
    }));
  if (!confluences.some(c => !c.exact && !Object.keys(c.needs || {}).length)) {
    // Without one, a triple nobody named and whose tags match nothing at all would resolve to
    // null and the player would be handed three abilities and a blank fourth slot.
    warnings.push('no catch-all confluence: some triples will resolve to nothing');
  }
  for (const c of confluences) {
    if (!c.exact) continue;
    for (const id of c.exact) if (!essences[id]) warnings.push(`${c.id}: names unknown essence "${id}"`);
  }
  return {
    doc: { pick: Math.max(1, +raw?.pick || PICK), essences, confluences },
    warnings,
  };
}

export const ids = doc => Object.keys(doc?.essences || {});

// Every tag the three carry, counted. A triple of two elementals and a destructive scores against
// a rule that wants exactly that, and the best score wins.
export function tally(doc, triple) {
  const out = {};
  for (const id of triple) {
    for (const t of doc.essences[id]?.tags || []) out[t] = (out[t] || 0) + 1;
  }
  return out;
}

// The one rule. An exact entry always wins; otherwise the entry whose `needs` are all met, by the
// widest margin, in document order. A `needs` of `{}` matches everything at score zero, which is
// what makes the catch-all a catch-all rather than a special case in the loop.
export function confluenceFor(doc, picked) {
  const triple = key(picked);
  if (!triple.length) return null;
  const named = doc.confluences.find(c => c.exact && sameSet(c.exact, triple));
  if (named) return named;
  const have = tally(doc, triple);
  let best = null, bestScore = -1;
  for (const c of doc.confluences) {
    // An entry with no `exact` and no `needs` is the catch-all, and it has to stay in this loop
    // rather than be skipped by it: it matches everything at score zero, which is exactly what
    // makes it the last resort instead of a special case after the loop. Skipping it was a real
    // bug — fire + void + blood satisfies no tag rule and resolved to nothing at all.
    if (c.exact) continue;
    let score = 0, ok = true;
    for (const [tag, n] of Object.entries(c.needs || {})) {
      if ((have[tag] || 0) < n) { ok = false; break; }
      score += n;
    }
    if (ok && score > bestScore) { best = c; bestScore = score; }
  }
  return best;
}

const sameSet = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// Is this a legal choice? Said as a reason rather than a boolean, because the picker has to put
// something on screen when it is not.
export function checkPick(doc, picked) {
  const t = key(picked);
  if (t.length < doc.pick) return `Choose ${doc.pick - t.length} more.`;
  if (t.length > doc.pick) return `Choose only ${doc.pick}.`;
  for (const id of t) if (!doc.essences[id]) return `There is no ${id} essence.`;
  return null;
}

// What the four of them give you at registration: the first ability of each, which is each
// essence's signature one. The rest are awakened later, with stones the Society does not hand out.
export function awaken(doc, picked) {
  const triple = key(picked);
  const conf = confluenceFor(doc, triple);
  const out = [];
  for (const id of triple) {
    const a = doc.essences[id]?.abilities?.[0];
    if (a) out.push({ ...a, from: id, fromName: doc.essences[id].name });
  }
  const c = conf?.abilities?.[0];
  if (c) out.push({ ...c, from: conf.id, fromName: conf.name, confluence: true });
  return out;
}

// The whole result of choosing, in the shape the save keeps it in.
export function resolve(doc, picked) {
  const why = checkPick(doc, picked);
  if (why) return { ok: false, why, picked: key(picked), confluence: null, abilities: [] };
  const triple = key(picked);
  const conf = confluenceFor(doc, triple);
  return {
    ok: true, why: null, picked: triple,
    confluence: conf ? conf.id : null,
    confluenceName: conf ? conf.name : null,
    abilities: awaken(doc, triple).map(a => a.id),
  };
}

// Everything the player has, for the sheet. Reads the save, not the picker.
export function held(doc, saved) {
  const picked = key(saved?.picked || []);
  if (!picked.length) return null;
  const conf = doc.confluences.find(c => c.id === saved?.confluence) || confluenceFor(doc, picked);
  const owned = new Set(saved?.abilities || []);
  const rows = [];
  for (const id of picked) {
    const e = doc.essences[id];
    if (!e) continue;
    rows.push({ ...e, confluence: false, abilities: e.abilities.map(a => ({ ...a, owned: owned.has(a.id) })) });
  }
  if (conf) {
    rows.push({
      ...conf, colour: '#c8a24a', tags: ['confluence'], confluence: true,
      abilities: conf.abilities.map(a => ({ ...a, owned: owned.has(a.id) })),
    });
  }
  return { picked, confluence: conf || null, rows, count: owned.size };
}

export async function load(url = 'data/essences.json') {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return normalise(await r.json());
}
