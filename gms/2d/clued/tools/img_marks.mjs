#!/usr/bin/env node
// Puts review.html circles (img_review.mark) into the packs: media.img[i].mark = {cx, cy, rx, ry} in 0–1 image coordinates.
// Usage: node tools/img_marks.mjs marks.json [--dry]
// marks.json = the GET /api/admin/imgreview body ({reviews: [...]}), a plain array of rows, or `sqlite3 -json` rows (mark as a JSON string).
// A reviewed row without a mark removes that picture's mark. Marks match by src inside the row's pack, so a replaced picture loses its mark.
// Also saved to tools/img_marks.json (pack → Commons page or src → mark), which c1_build.mjs re-applies on a rebuild.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const ROOT = join(TOOLS, '..');
export const MARKS_FILE = join(TOOLS, 'img_marks.json');

export function cleanMark(m) {
  if (typeof m === 'string') { if (!m) return null; try { m = JSON.parse(m); } catch { return null; } }
  if (!m || typeof m !== 'object') return null;
  const r = v => Math.round(v * 1e4) / 1e4;
  const o = { cx: r(+m.cx), cy: r(+m.cy), rx: r(+m.rx), ry: r(+m.ry) };
  const ok = Object.values(o).every(Number.isFinite) && o.cx >= 0 && o.cx <= 1 && o.cy >= 0 && o.cy <= 1 && o.rx > 0 && o.rx <= 1 && o.ry > 0 && o.ry <= 1;
  return ok ? o : null;
}

export function rowsOf(data) {
  const rows = Array.isArray(data) ? data : data?.reviews || [];
  return rows.filter(r => r && typeof r.ref === 'string' && r.src).map(r => ({ ref: r.ref, src: r.src, mark: cleanMark(r.mark) }));
}

// every media.img entry (objects only) in a pack, wherever it sits
export function imgEntries(pack) {
  const out = [];
  (function walk(o) {
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (!o || typeof o !== 'object') return;
    const imgs = o.media?.img || (Array.isArray(o.img) ? o.img : null);
    for (const m of imgs || []) if (m && typeof m === 'object' && m.src) out.push(m);
    for (const [k, v] of Object.entries(o)) if (k !== 'media' && v && typeof v === 'object') walk(v);
  })([pack.items, pack.questions]);
  return out;
}

const keyOf = m => m.page || m.src;

// Applies rows to one pack in place. store = this pack's {pageOrSrc: mark} map, updated too.
export function applyRows(pack, rows, store = {}) {
  const entries = imgEntries(pack);
  let set = 0, cleared = 0;
  const missing = [];
  for (const row of rows) {
    const hit = entries.filter(m => m.src === row.src);
    if (!hit.length) { if (row.mark) missing.push(row.ref); continue; }
    for (const m of hit) {
      if (row.mark) { if (JSON.stringify(m.mark) !== JSON.stringify(row.mark)) set++; m.mark = row.mark; store[keyOf(m)] = row.mark; }
      else { if (m.mark) cleared++; delete m.mark; delete store[keyOf(m)]; }
    }
  }
  return { set, cleared, missing };
}

// For builders: re-apply saved marks to a freshly built pack.
export function applyMarks(packId, pack, all = readJSON(MARKS_FILE, {})) {
  const store = all[packId];
  if (!store) return 0;
  let n = 0;
  for (const m of imgEntries(pack)) {
    const mark = store[m.page] || store[m.src];
    if (mark) { m.mark = mark; n++; }
  }
  return n;
}

function readJSON(p, dflt) { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return dflt; } }
function indentOf(text) { const m = text.match(/^\{\n( +)"/); return m ? m[1].length : text.includes('\n') ? 1 : 0; }
function writeLike(p, text, data) { writeFileSync(p, JSON.stringify(data, null, indentOf(text) || undefined) + '\n'); }

export function run(file, { dry = false, root = ROOT, marksFile = MARKS_FILE, log = console.log } = {}) {
  const rows = rowsOf(readJSON(file, null) ?? (() => { throw new Error(`can't read ${file}`); })());
  const index = readJSON(join(root, 'data/index.json'), { packs: {} });
  const all = readJSON(marksFile, {});
  const byPack = new Map();
  for (const r of rows) { const id = r.ref.split('/')[0]; if (!byPack.has(id)) byPack.set(id, []); byPack.get(id).push(r); }
  const report = {};
  for (const [id, list] of byPack) {
    const rel = index.packs[id]?.path;
    const p = rel && join(root, 'data', rel);
    if (!p || !existsSync(p)) { if (list.some(r => r.mark)) log(`${id}: pack not found, ${list.filter(r => r.mark).length} mark(s) skipped`); continue; }
    const text = readFileSync(p, 'utf8');
    const pack = JSON.parse(text);
    const store = { ...(all[id] || {}) };
    const res = applyRows(pack, list, store);
    report[id] = res;
    if (Object.keys(store).length) all[id] = store; else delete all[id];
    if (res.set || res.cleared) {
      const src = existsSync(join(root, 'tools/c1_src', `${id}.mjs`)) ? 'rebuild-safe (c1_build)' : 'pack JSON only: its builder does not re-apply marks yet';
      log(`${id}: ${res.set} set, ${res.cleared} cleared — ${src}`);
      if (!dry) writeLike(p, text, pack);
    }
    for (const ref of res.missing) log(`${id}: ${ref} — picture changed since it was circled, skipped`);
  }
  if (!dry) writeFileSync(marksFile, JSON.stringify(all, null, 1) + '\n');
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const args = process.argv.slice(2);
  const file = args.find(a => !a.startsWith('--'));
  if (!file) { console.error('usage: node tools/img_marks.mjs marks.json [--dry]'); process.exit(2); }
  run(file, { dry: args.includes('--dry') });
}
