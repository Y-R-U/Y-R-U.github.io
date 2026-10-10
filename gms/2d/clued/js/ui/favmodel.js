// Favourite picks, pure logic (node-testable): sanitising a saved fav against today's packs/options, matching, labels.
import { supportsPack } from '../formats/registry.js?v=202610100547';
import { ANSWER_TIMES } from '../core/store.js?v=202610100547';

export const favKey = (fmt, kids) => (kids ? `${fmt.id}:kids` : fmt.id);
const KIDS_TIMES = [0, 20, 30];

function optValues(o, kids) {
  if (o.type === 'bool') return [true, false];
  if (!o.values) return null;
  return kids && o.kidsValues ? o.values.filter(x => o.kidsValues.includes(x)) : o.values;
}

// Returns the fav as it can be applied now, or null. `gone` counts saved packs that no longer exist or can't play this format.
export function cleanFav(fav, fmt, index, { kids = false } = {}) {
  if (!fav || typeof fav !== 'object' || !fmt) return null;
  const out = { packs: 'all', opts: {}, gone: 0 };
  if (!fmt.packless && Array.isArray(fav.packs)) {
    const ok = id => {
      const info = index?.packs?.[id];
      return !!info && !(kids && info.kidsSafe === false) && supportsPack(fmt, info, { kids }) === true;
    };
    const ids = [...new Set(fav.packs.filter(id => typeof id === 'string'))];
    const keep = ids.filter(ok);
    out.gone = ids.length - keep.length;
    out.packs = keep.length ? keep : 'all';
  }
  if ('count' in fav) out.count = Number.isInteger(fav.count) ? Math.max(3, Math.min(50, fav.count)) : 10;
  if ('difficulty' in fav) out.difficulty = [0, 1, 2, 3].includes(fav.difficulty) ? fav.difficulty : 0;
  if (typeof fav.timer === 'number' && (kids ? KIDS_TIMES : ANSWER_TIMES).includes(fav.timer)) out.timer = fav.timer;
  const saved = fav.opts && typeof fav.opts === 'object' ? fav.opts : {};
  for (const o of fmt.options || []) {
    if (kids && o.kidsHide) continue;
    const vals = optValues(o, kids);
    if (vals && o.key in saved && vals.includes(saved[o.key])) out.opts[o.key] = saved[o.key];
  }
  return out;
}

const norm = v => (Array.isArray(v) ? [...v].sort() : v);
// True when `fav` holds the same picks as `snap` for every field the current screen shows (snap's keys).
export function sameFav(fav, snap, fmt, index, opts) {
  const c = cleanFav(fav, fmt, index, opts);
  if (!c || !snap) return false;
  for (const k of Object.keys(snap)) {
    if (k === 'opts') {
      for (const [ok, ov] of Object.entries(snap.opts || {})) {
        const o = (fmt.options || []).find(x => x.key === ok);
        const def = o ? o.default : undefined;
        if ((ok in c.opts ? c.opts[ok] : def) !== ov) return false;
      }
    } else if (JSON.stringify(norm(c[k])) !== JSON.stringify(norm(snap[k]))) return false;
  }
  return true;
}

export function shortTitle(t) {
  const m = /^Hits of the (?:19|20)?(\d0s)$/.exec(t || '');
  if (m) return m[1];
  return String(t || '').replace(/^(Hits|Songs) of the /, '').replace(/^Classical /, 'Classical ').trim();
}

function packsPart(packs, fmt, index) {
  if (fmt.packless) return '';
  if (packs === 'all' || !packs?.length) return 'All themes';
  const left = new Set(packs);
  const parts = [];
  for (const t of index?.themes || []) {
    const ids = t.packs.filter(id => index.packs[id] && !index.packs[id].virtual);
    if (ids.length > 1 && ids.every(id => left.has(id))) { parts.push(t.title); ids.forEach(id => left.delete(id)); }
  }
  for (const id of left) { const info = index?.packs?.[id]; if (info && !info.virtual) parts.push(shortTitle(info.title)); }
  for (const id of left) { const info = index?.packs?.[id]; if (info?.virtual) parts.push(shortTitle(info.title)); }
  if (!parts.length) return 'All themes';
  return parts.length > 3 ? `${parts.slice(0, 2).join('+')} +${parts.length - 2}` : parts.join('+');
}

function optPart(o, v) {
  if (o.type === 'bool') return v ? o.label : `No ${o.label.toLowerCase()}`;
  const i = (o.values || []).indexOf(v);
  if (o.favLabels?.[i]) return o.favLabels[i];
  const lab = String(o.labels?.[i] ?? v);
  const word = o.label.split(/\s+/)[0].toLowerCase();
  return /^\d/.test(lab) ? `${lab} ${word}` : `${o.label.split(/\s+/)[0]}: ${lab.toLowerCase()}`;
}

// Short auto label, e.g. "80s+90s · 2s clip · Hard". Lists packs, then what differs from the defaults.
export function favLabel(fav, fmt, index, { kids = false, timerDefault = kids ? 0 : 10 } = {}) {
  const c = cleanFav(fav, fmt, index, { kids });
  if (!c) return '';
  const bits = [];
  const p = packsPart(c.packs, fmt, index);
  if (p) bits.push(p);
  if (c.count != null && c.count !== 10) bits.push(`${c.count} Qs`);
  if (!kids && c.difficulty) bits.push(['', 'Easy', 'Medium', 'Hard'][c.difficulty]);
  for (const o of fmt.options || []) {
    if (!(o.key in c.opts)) continue;
    // favIf(opts): shown exactly when it holds, default or not (reveal: the zoom timing goes with Zoom)
    const show = o.favIf ? o.favIf(c.opts) : c.opts[o.key] !== o.default && !(kids && o.kidsDefault === c.opts[o.key]);
    if (show) bits.push(optPart(o, c.opts[o.key]));
  }
  if (c.timer != null && c.timer !== timerDefault) bits.push(c.timer ? `${c.timer}s timer` : 'No timer');
  return bits.join(' · ') || (fmt.packless ? 'Standard picks' : 'All themes');
}
