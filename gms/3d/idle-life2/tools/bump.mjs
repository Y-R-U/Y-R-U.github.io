import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const vfile = join(ROOT, 'js/core/version.js');
const old = readFileSync(vfile, 'utf8').match(/BUILD = '([^']+)'/)[1];
const d = new Date();
const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
let next = process.argv[2];
if (!next) {
  const letter = old.startsWith(day) ? String.fromCharCode(old.charCodeAt(8) + 1) : 'a';
  next = day + letter;
}
const files = [join(ROOT, 'index.html')];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p);
  }
})(join(ROOT, 'js'));
let n = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const out = src.replaceAll('?v=' + old, '?v=' + next).replace(`BUILD = '${old}'`, `BUILD = '${next}'`);
  if (out !== src) { writeFileSync(f, out); n++; }
}
console.log(`BUILD ${old} → ${next} (${n} files)`);
