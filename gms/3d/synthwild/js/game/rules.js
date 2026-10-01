// Pure break/harvest/drop/damage rules. No THREE, no DOM: node-testable.

const EXTRA_DROPS = { solar_leaves: [{ key: 'sun_fruit', chance: 0.12 }] };

export function blockOf(blocks, mat) {
  return Array.isArray(blocks) ? blocks[mat] : blocks?.[mat];
}

// Lane 1's `tier` is 0-based (0 = any cutter); our tool levels are 1..4 (lattice..qubit).
// Hard cutter blocks (hardness >= 1.5) need a cutter of level tier+1 to drop anything.
export function requiredLevel(b) {
  if (!b || b.tool !== 'cutter' || (b.hardness ?? 0) < 1.5) return 0;
  return (b.tier | 0) + 1;
}

export function toolOf(held) {
  return held?.item?.tool || null;
}

export function canHarvest(b, held) {
  const need = requiredLevel(b);
  if (!need) return true;
  const t = toolOf(held);
  return !!t && t.type === b.tool && t.level >= need;
}

// Seconds to break one block of `mat`. scale < 1 (fine-grid breaks) is proportionally quicker.
export function breakTime(blocks, mat, held, { creative = false, scale = 1 } = {}) {
  if (creative) return 0;
  const b = blockOf(blocks, mat);
  if (!b) return 0.05;
  const h = b.hardness ?? 1;
  if (h < 0) return Infinity;
  if (h === 0) return 0.05;
  const t = toolOf(held);
  const speed = t && b.tool && t.type === b.tool ? t.speed : 1;
  const base = (h * (canHarvest(b, held) ? 1.5 : 5)) / speed;
  return Math.max(0.05, base * Math.min(1, Math.max(0.2, scale)));
}

// count = removed volume in subs (64 subs = one block). Returns [{key|id, n}].
export function dropsFor(blocks, mat, count, held, rnd = Math.random) {
  const b = blockOf(blocks, mat);
  if (!b || !canHarvest(b, held)) return [];
  const frac = count / 64;
  let d = b.drops;
  if (d === 'none') d = null;
  const extra = [...(EXTRA_DROPS[b.key] || [])];
  if (d === undefined || d === 'self') d = mat;
  const out = [];
  if (typeof d === 'string' || typeof d === 'number') out.push({ [typeof d === 'string' ? 'key' : 'id']: d, n: frac });
  else if (d) extra.unshift(...[].concat(d));
  for (const e of extra) {
    const ref = e.key != null ? { key: e.key } : { id: e.id ?? e.item };
    if (e.chance != null) {
      // Whole items only: roll the chance once per full block's worth, fractional remainder as a weighted roll.
      let n = 0;
      let left = frac;
      while (left > 1e-9) { if (rnd() < e.chance * Math.min(1, left)) n += e.n || 1; left -= 1; }
      if (n) out.push({ ...ref, n });
    } else {
      const lo = e.min ?? e.n ?? 1, hi = e.max ?? lo;
      out.push({ ...ref, n: (lo + Math.floor(rnd() * (hi - lo + 1))) * frac });
    }
  }
  return out;
}

export function meleeDamage(held) {
  return toolOf(held)?.dmg ?? 1;
}
