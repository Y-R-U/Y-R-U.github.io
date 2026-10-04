#!/usr/bin/env node
// Mirrors unreliable media into media/<pack>/ and rewrites pack srcs to the relative path (credits kept).
// Picks URLs marked "mirror" by linkcheck (failed on 2 runs). Extra selectors:
//   --failing        also mirror URLs that failed once
//   --host=HOST      mirror every URL on that host (an unreliable host)
//   --url=URL        mirror one URL
//   [packId…]        limit to these packs
// Images are converted to JPEG and resized to ≤640px with macOS `sips`. The map original→local is kept in
// media/mirror.json so tools/c1_build.mjs re-applies it after a rebuild.
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const ROOT = join(TOOLS, '..');
const argv = process.argv.slice(2);
const opt = k => argv.filter(a => a.startsWith(`--${k}=`)).map(a => a.slice(k.length + 3));
const hosts = opt('host'), only = opt('url'), failing = argv.includes('--failing');
let ids = argv.filter(a => !a.startsWith('--'));
if (!ids.length) ids = readdirSync(join(ROOT, 'data/packs')).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''));

const cachePath = join(TOOLS, '.linkcache.json');
const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
const mapPath = join(ROOT, 'media/mirror.json');
const map = existsSync(mapPath) ? JSON.parse(readFileSync(mapPath, 'utf8')) : {};

const want = u => {
  if (u.startsWith('media/')) return false;
  if (only.includes(u)) return true;
  if (hosts.length && hosts.includes(new URL(u).host)) return true;
  const c = cache[u];
  return !!c && !c.ok && (c.mirror || failing);
};

async function download(url, dest) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'CluedMirror/1.0 (https://y-r-u.github.io/gms/2d/clued/)' } });
      if (!r.ok) throw new Error(String(r.status));
      writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
      return true;
    } catch (e) { if (i === 2) { console.warn(`  download failed ${url}: ${e.message}`); return false; } await new Promise(r => setTimeout(r, 1500)); }
  }
}

let changed = 0, mirrored = 0;
for (const id of ids) {
  const file = join(ROOT, 'data/packs', id + '.json');
  const pack = JSON.parse(readFileSync(file, 'utf8'));
  let dirty = false;
  const handle = async (media, base) => {
    for (const kind of ['img', 'audio']) {
      const list = media?.[kind] || [];
      for (let i = 0; i < list.length; i++) {
        const m = list[i];
        if (map[m.src]) { m.src = map[m.src]; dirty = true; continue; }
        if (!want(m.src)) continue;
        const dir = join(ROOT, 'media', id);
        mkdirSync(dir, { recursive: true });
        const ext = kind === 'img' ? '.jpg' : (extname(new URL(m.src).pathname) || '.mp3');
        const rel = `media/${id}/${base}-${kind}${i + 1}${ext}`;
        const tmp = join(dir, `.tmp-${base}-${i}`);
        if (!(await download(m.src, tmp))) continue;
        try {
          if (kind === 'img') {
            const dims = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', tmp]).toString().match(/\d+/g).slice(-2).map(Number);
            execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '80', ...(Math.max(...dims) > 640 ? ['-Z', '640'] : []), tmp, '--out', join(ROOT, rel)], { stdio: 'ignore' });
            const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', join(ROOT, rel)]).toString();
            m.w = +out.match(/pixelWidth: (\d+)/)[1]; m.h = +out.match(/pixelHeight: (\d+)/)[1];
            unlinkSync(tmp);
          } else {
            writeFileSync(join(ROOT, rel), readFileSync(tmp)); unlinkSync(tmp);
          }
        } catch (e) { console.warn(`  convert failed ${m.src}: ${e.message}`); continue; }
        map[m.src] = rel;
        console.log(`  ${id}/${base}: ${m.src} → ${rel} (${Math.round(statSync(join(ROOT, rel)).size / 1024)} KB)`);
        m.src = rel; dirty = true; mirrored++;
      }
    }
  };
  for (const it of pack.items || []) await handle(it.media, it.id);
  for (const q of pack.questions || []) await handle(q.media, 'q-' + q.id);
  if (dirty) { writeFileSync(file, JSON.stringify(pack, null, 1) + '\n'); changed++; }
}
mkdirSync(join(ROOT, 'media'), { recursive: true });
writeFileSync(mapPath, JSON.stringify(map, null, 1) + '\n');
console.log(`mirror: ${mirrored} file(s) mirrored, ${changed} pack(s) rewritten`);
