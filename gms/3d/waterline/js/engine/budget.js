// Texture memory accounting. Every texture the game builds must go through track().

const registry = new Map();

const BYTES_PER_PX = { rgba: 4, rgb: 3, r: 1, half: 8, float: 16 };

// mult covers a multisampled target, which stores `samples` copies of every pixel.
export function track(tex, { w, h, fmt = 'rgba', mips = true, mult = 1, label = 'unnamed' } = {}) {
  const base = w * h * (BYTES_PER_PX[fmt] || 4) * mult;
  const bytes = mips ? base * 1.34 : base;
  registry.set(tex, { bytes, label, w, h });
  return tex;
}

export function untrack(tex) { registry.delete(tex); }

export function totalMB() {
  let b = 0;
  for (const v of registry.values()) b += v.bytes;
  return b / 1048576;
}

// Biggest offenders first — for when the budget blows and we need to know why.
export function breakdown() {
  return [...registry.values()]
    .sort((a, b) => b.bytes - a.bytes)
    .map(v => ({ label: v.label, mb: v.bytes / 1048576, size: `${v.w}×${v.h}` }));
}
