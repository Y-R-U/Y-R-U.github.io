// What points at a conversation node. DEV_CONTRACT §6: reverse links are derived, never stored,
// so this walks every level's hotspots, every character record and every other node on demand.
// Pure — the tab draws what comes out and the tests drive it from fixtures.

export function deriveLinks({ nodes = {}, levels = {}, characters = {} } = {}) {
  const links = {};
  const missing = [];
  const at = id => (links[id] ||= []);

  for (const [levelId, level] of Object.entries(levels || {})) {
    for (const h of level?.hotspots || []) {
      for (const [i, a] of (h?.actions || []).entries()) {
        if (!isSay(a)) continue;
        at(a.node).push({ kind: 'hotspot', level: levelId, hotspot: h.id || `#${i}`,
          name: h.name || h.id || '', trigger: h.trigger || 'enter', attach: h.attach || null, node: a.node });
        if (!nodes[a.node]) missing.push({ node: a.node, from: `level ${levelId} · hotspot ${h.id}` });
      }
    }
  }

  for (const [charId, c] of Object.entries(characters || {})) {
    for (const a of saysIn(c)) {
      at(a.node).push({ kind: 'character', character: charId, name: c?.name || charId, node: a.node });
      if (!nodes[a.node]) missing.push({ node: a.node, from: `character ${charId}` });
    }
  }

  for (const [id, n] of Object.entries(nodes)) {
    for (const [i, c] of (n?.choices || []).entries()) {
      if (!c?.goto) continue;
      at(c.goto).push({ kind: 'choice', from: id, say: c.say || '', index: i, node: c.goto });
      if (!nodes[c.goto]) missing.push({ node: c.goto, from: `${id} · choice ${i}` });
    }
    if (n?.next) {
      at(n.next).push({ kind: 'next', from: id, node: n.next });
      if (!nodes[n.next]) missing.push({ node: n.next, from: `${id} · next` });
    }
  }

  const entered = id => (links[id] || []).some(l => l.kind === 'hotspot' || l.kind === 'character');
  const orphans = Object.keys(nodes).filter(id => !(links[id] || []).length);
  const roots = Object.keys(nodes).filter(id =>
    entered(id) || !(links[id] || []).some(l => l.kind === 'choice' || l.kind === 'next'));

  return { links, orphans, roots, missing };
}

const isSay = a => a && a.k === 'say' && typeof a.node === 'string' && a.node;

// A character record has no fixed home for actions yet, so anything shaped like a say action
// anywhere inside one counts as a link rather than being silently invisible.
function saysIn(value, seen = new Set(), out = []) {
  if (!value || typeof value !== 'object' || seen.has(value)) return out;
  seen.add(value);
  if (isSay(value)) out.push(value);
  for (const v of Array.isArray(value) ? value : Object.values(value)) saysIn(v, seen, out);
  return out;
}

// Depth-first from every root, so a branching conversation reads as a tree. A node reached twice
// appears again marked `repeat` rather than being duplicated into an infinite walk.
export function tree(nodes = {}, derived = deriveLinks({ nodes })) {
  const { links, roots } = derived;
  const children = id => {
    const n = nodes[id] || {};
    const out = [];
    for (const c of n.choices || []) if (c?.goto && nodes[c.goto]) out.push({ id: c.goto, via: 'choice', say: c.say || '' });
    if (n.next && nodes[n.next]) out.push({ id: n.next, via: 'next', say: '' });
    return out;
  };
  const rows = [];
  const placed = new Set();
  const walk = (id, depth, via, say, path) => {
    const repeat = placed.has(id);
    rows.push({ id, depth, via, say, repeat, cycle: path.includes(id) });
    placed.add(id);
    if (repeat || path.includes(id) || depth > 12) return;
    for (const c of children(id)) walk(c.id, depth + 1, c.via, c.say, [...path, id]);
  };
  const order = [...roots].sort((a, b) => rank(links[a]) - rank(links[b]) || a.localeCompare(b));
  for (const r of order) if (!placed.has(r)) walk(r, 0, null, '', []);
  for (const id of Object.keys(nodes)) if (!placed.has(id)) walk(id, 0, null, '', []);
  return rows;
}

const rank = list => ((list || []).some(l => l.kind === 'hotspot' || l.kind === 'character') ? 0 : 1);

export const describeLink = l =>
  l.kind === 'hotspot' ? `${l.level} · ${l.name || l.hotspot} (${l.attach ? `on ${l.attach}` : l.trigger})`
  : l.kind === 'character' ? `character ${l.name} (${l.character})`
  : l.kind === 'choice' ? `${l.from} — choice “${l.say}”`
  : `${l.from} — next`;
