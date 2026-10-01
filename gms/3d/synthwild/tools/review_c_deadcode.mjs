// R3 reviewer C: unused exports and files never imported (static, regex-based; verify each by hand).
//   node tools/review_c_deadcode.mjs
import fs from 'node:fs';
import path from 'node:path';
const ROOT = new URL('../', import.meta.url).pathname;
const files = [];
const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.js$/.test(f.name)) files.push(p); } };
walk(ROOT + 'js');
const src = Object.fromEntries(files.map((f) => [f, fs.readFileSync(f, 'utf8')]));
const html = fs.readFileSync(ROOT + 'index.html', 'utf8');
const rel = (f) => path.relative(ROOT, f);
// imports graph
const imported = new Set();
for (const [f, s] of Object.entries(src)) {
  for (const m of s.matchAll(/(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|new URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url/g)) {
    const spec = m[1] || m[2] || m[3];
    if (!spec.startsWith('.')) continue;
    imported.add(path.resolve(path.dirname(f), spec));
  }
}
for (const m of html.matchAll(/src=["']\.?\/?(js\/[^"']+)["']/g)) imported.add(path.resolve(ROOT, m[1]));
console.log('FILES NEVER IMPORTED:');
for (const f of files) if (!imported.has(f)) console.log('  ', rel(f));
console.log('\nEXPORTS NOT REFERENCED OUTSIDE THEIR FILE (and not used inside except the declaration):');
const all = Object.values(src).join('\n');
for (const [f, s] of Object.entries(src)) {
  for (const m of s.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)) {
    const name = m[1];
    const re = new RegExp('\\b' + name.replace('$', '\\$') + '\\b', 'g');
    let outside = 0;
    for (const [g, t] of Object.entries(src)) if (g !== f) outside += (t.match(re) || []).length;
    const inside = (s.match(re) || []).length;
    if (!outside) console.log('  ', rel(f) + ':', name, inside > 1 ? '(used locally)' : '(DEAD)');
  }
}
