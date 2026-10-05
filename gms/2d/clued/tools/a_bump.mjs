#!/usr/bin/env node
// Bump BUILD: rewrites js/build.js and every `?v=<old>` in index.html, css/ and js/ (all lanes) to the new value.
// Usage: node tools/a_bump.mjs [newBuild]   (default: yyyymmddHHMM)
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const old = readFileSync(join(ROOT, 'js/build.js'), 'utf8').match(/BUILD = '([^']+)'/)[1];
const next = process.argv[2] || new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
const files = [join(ROOT, 'index.html'), join(ROOT, 'admin.html')];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) { if (f !== 'vendor') walk(p); } else if (/\.(js|css|html)$/.test(f)) files.push(p);
  }
})(join(ROOT, 'js'));
(function walk(d) { for (const f of readdirSync(d)) if (f.endsWith('.css')) files.push(join(d, f)); })(join(ROOT, 'css'));
const re = new RegExp(`\\?v=${old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=['"\`&)])`, 'g');
let n = 0;
for (const f of files) {
  const s = readFileSync(f, 'utf8');
  const t = s.replace(re, () => (n++, `?v=${next}`));
  if (t !== s) writeFileSync(f, t);
}
writeFileSync(join(ROOT, 'js/build.js'), `export const BUILD = '${next}';\n`);
console.log(`BUILD ${old} -> ${next}: ${n} references in ${files.length} files`);
