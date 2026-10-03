// Blind side-by-side for a critic: node tools/artsheet.mjs <ours.png> <refs/x.jpg> <name> [round]
// Side is random; the answer key goes to docs/art/critic/KEY.md (critics must not be shown that file).
import { execFileSync } from 'node:child_process';
import { mkdirSync, appendFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [ours, ref, name, round = '1'] = process.argv.slice(2);
const OUT = resolve(ROOT, 'docs/art/critic');
mkdirSync(OUT, { recursive: true });
const left = Math.random() < 0.5;
const sheet = resolve(OUT, `${name}_r${round}.png`);
const prep = process.env.FIT === 'native' ? 'scale=-2:440' : process.env.FIT === 'pad' ? 'scale=780:520:force_original_aspect_ratio=decrease,pad=780:520:(ow-iw)/2:(oh-ih)/2:color=0x151719' : 'scale=780:520:force_original_aspect_ratio=increase,crop=780:520';
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', left ? ours : ref, '-i', left ? ref : ours, '-filter_complex',
  `[0:v]${prep}[a];[1:v]${prep}[b];[a][b]hstack=inputs=2,pad=iw+24:ih+24:12:12:color=0x151719`, '-frames:v', '1', sheet]);
const key = resolve(OUT, round === '1' ? 'KEY.md' : `KEY_r${round}.md`);
if (!existsSync(key)) appendFileSync(key, '# Blind critic answer key (do not show critics)\n\n| sheet | game side | ref |\n|---|---|---|\n');
appendFileSync(key, `| ${name}_r${round}.png | ${left ? 'LEFT' : 'RIGHT'} | ${ref.split('/').pop()} |\n`);
console.log(sheet);
