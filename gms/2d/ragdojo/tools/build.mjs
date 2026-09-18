import { build, transform } from 'esbuild';
import { readFile, writeFile, mkdir, rm, cp, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
await mkdir(dist, { recursive: true });
for (const edition of ['home', 'itch']) {
  const out = join(dist, edition);
  await rm(out, { recursive: true, force: true });
  await mkdir(join(out, 'js'), { recursive: true });
  await mkdir(join(out, 'css'), { recursive: true });
  await mkdir(join(out, 'assets/audio'), { recursive: true });
  await build({
    entryPoints: { 'js/main': join(root, 'js/main.js') }, outdir: out, splitting: true, chunkNames: 'js/chunks/[name]-[hash]',
    bundle: true, minify: true, sourcemap: false, format: 'esm', target: ['es2022'],
    external: ['/lib/auth/*'], define: { __RAGDOJO_EDITION__: JSON.stringify(edition) },
    plugins: edition === 'itch' ? [{ name: 'no-itch-accounts', setup(b) {
      b.onResolve({ filter: /^\.\/cloud\.js$/ }, () => ({ path: 'no-account', namespace: 'demo' }));
      b.onLoad({ filter: /.*/, namespace: 'demo' }, () => ({ contents: 'export function connectCloud() { throw new Error("Accounts live on games.br8t.com"); }', loader: 'js' }));
    } }] : [],
  });
  let html = await readFile(join(root, 'index.html'), 'utf8');
  html = html.replace(/<link[^>]+https:\/\/fonts\.[^>]+>\n/g, '')
    .replace('<link rel="stylesheet" href="css/style.css">', '<link rel="stylesheet" href="assets/fonts/fonts.css">\n<link rel="stylesheet" href="css/style.css">');
  if (edition === 'itch') html = html.replace('RAGDOJO</title>', 'RAGDOJO — Free LIGHT Campaign</title>');
  await writeFile(join(out, 'index.html'), html);
  const css = await transform(await readFile(join(root, 'css/style.css'), 'utf8'), { loader: 'css', minify: true });
  await writeFile(join(out, 'css/style.css'), css.code);
  await cp(join(root, 'assets/fonts'), join(out, 'assets/fonts'), { recursive: true });
  for (const file of await readdir(join(root, 'assets/audio'))) {
    if (/^[a-z0-9]+\.mp3$/.test(file) && (edition === 'home' || !file.startsWith('d'))) await cp(join(root, 'assets/audio', file), join(out, 'assets/audio', file));
  }
  await cp(join(root, 'privacy.html'), join(out, 'privacy.html'));
  const files = [];
  async function walk(dir) { for (const f of (await readdir(dir)).sort()) { const p = join(dir, f); const st = await stat(p); if (st.isDirectory()) await walk(p); else files.push({ path: relative(out, p), bytes: st.size, sha256: createHash('sha256').update(await readFile(p)).digest('hex') }); } }
  await walk(out);
  if (files.length > 1000 || files.reduce((n,f) => n + f.bytes, 0) > 500e6 || files.some(f => f.bytes > 200e6 || f.path.length > 240)) throw new Error('itch upload limits exceeded');
  await writeFile(join(dist, `${edition}-manifest.json`), JSON.stringify({ edition, testPaymentsOnly: true, files }, null, 2)+'\n');
  console.log(`${edition}: ${files.length} files, ${(files.reduce((n,f) => n + f.bytes, 0)/1e6).toFixed(2)} MB; minified JS ${(files.find(f=>f.path==='js/main.js').bytes/1000).toFixed(1)} KB`);
}
execFileSync('python3', ['-c', `import sys, pathlib, zipfile
root=pathlib.Path(sys.argv[1]); out=pathlib.Path(sys.argv[2])
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
 for f in sorted(root.rglob('*')):
  if f.is_file():
   info=zipfile.ZipInfo(f.relative_to(root).as_posix(), (2026,9,8,0,0,0)); info.compress_type=zipfile.ZIP_DEFLATED; info.external_attr=0o100644<<16
   z.writestr(info,f.read_bytes())`, join(dist, 'itch'), join(dist, 'ragdojo-itch.zip')]);
await cp(join(root, '../../../assets/screenshots/ragdojo.jpg'), join(dist, 'itch-cover.jpg'));
console.log('Prepared dist/ragdojo-itch.zip, itch-cover.jpg, and dist/home. Nothing deployed.');
