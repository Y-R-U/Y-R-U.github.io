#!/usr/bin/env node
// Rebuilds the visual progress board from the compare sheets. Every round's render is recovered
// from critique/<shot>_r<n>.png using .keys/ to say which panel was ours, so history survives even
// though shots/ only ever holds the latest render.
//
//   node tools/progress.mjs            → tools/progress.html
//
// Scores live in tools/progress.json. Add a round there after each review and re-run.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(TOOLS, '..');
const DATA = JSON.parse(readFileSync(join(TOOLS, 'progress.json'), 'utf8'));

// compare.mjs lays out two 900x506 panels at x=12 and x=912, y=12, on a 1824x530 sheet.
const PANEL = { w: 900, h: 506, y: 12, left: 12, right: 912 };
const OUT_W = 520, Q = 4;   // ffmpeg -q:v, 2 is best, 5 is lean. 48 panels have to fit in 16 MB.

const tmp = mkdtempSync(join(tmpdir(), 'wlprog-'));
let bytes = 0;

function panel(sheet, side) {
  const x = side === 'left' ? PANEL.left : PANEL.right;
  const out = join(tmp, `p${Math.random().toString(36).slice(2)}.jpg`);
  execFileSync('ffmpeg', ['-v', 'error', '-i', sheet,
    '-vf', `crop=${PANEL.w}:${PANEL.h}:${x}:${PANEL.y},scale=${OUT_W}:-2:flags=lanczos`,
    '-q:v', String(Q), out, '-y']);
  const b = readFileSync(out);
  bytes += b.length;
  rmSync(out);
  return `data:image/jpeg;base64,${b.toString('base64')}`;
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sign = g => (g > 0 ? '+' : '') + g.toFixed(2).replace(/\.00$/, '.0');

// −6 is the worst gap seen on this project; the bar reads left-to-right as "distance from the bar".
const WORST = -6.5;
const barPct = g => Math.max(0, Math.min(100, (1 - Math.min(g, 0) / WORST) * 100));

let cards = '';
for (const comp of DATA.components) {
  let rows = '';
  for (const shot of comp.shots) {
    const first = join(ROOT, 'critique', `${shot.id}_r1.png`);
    const key1 = join(ROOT, '.keys', `${shot.id}_r1.json`);
    if (!existsSync(first) || !existsSync(key1)) continue;
    const oursSide = JSON.parse(readFileSync(key1, 'utf8')).oursSide;
    const plate = panel(first, oursSide === 'left' ? 'right' : 'left');

    let strip = '';
    for (const rd of shot.rounds) {
      const sheet = join(ROOT, 'critique', `${shot.id}_r${rd.r}.png`);
      const key = join(ROOT, '.keys', `${shot.id}_r${rd.r}.json`);
      if (!existsSync(sheet) || !existsSync(key)) continue;
      const side = JSON.parse(readFileSync(key, 'utf8')).oursSide;
      const img = panel(sheet, side);
      const pass = rd.gap >= DATA.gate;
      const prev = shot.rounds.find(x => x.r === rd.r - 1);
      const delta = prev ? rd.gap - prev.gap : null;
      const trend = delta === null ? '' : delta > 0.001 ? 'up' : delta < -0.001 ? 'down' : 'flat';
      const trendTxt = delta === null ? 'first attempt'
        : trend === 'up' ? `improved ${delta.toFixed(2).replace(/\.00$/, '.0')}`
          : trend === 'down' ? `regressed ${Math.abs(delta).toFixed(2).replace(/\.00$/, '.0')}`
            : 'no change';
      strip += `
        <figure class="att${pass ? ' is-pass' : ''}">
          <img src="${img}" alt="${esc(shot.id)} attempt ${rd.r}" loading="lazy">
          <figcaption>
            <span class="rd">Pass ${rd.r}</span>
            <span class="gap">${sign(rd.gap)}</span>
          </figcaption>
          <div class="bar" role="img" aria-label="gap ${sign(rd.gap)} against a gate of ${DATA.gate}">
            <span class="fill" style="width:${barPct(rd.gap).toFixed(1)}%"></span>
            <span class="gate" style="left:${barPct(DATA.gate).toFixed(1)}%"></span>
          </div>
          <p class="trend t-${trend}">${esc(trendTxt)}${pass ? ' · <b>met the bar</b>' : ''}</p>
          ${rd.note ? `<p class="note">${esc(rd.note)}</p>` : ''}
        </figure>`;
    }

    const last = shot.rounds[shot.rounds.length - 1];
    const total = shot.rounds.length > 1 ? last.gap - shot.rounds[0].gap : 0;
    rows += `
      <article class="shot">
        <header class="shot-h">
          <h3>${esc(shot.id)}</h3>
          <p class="src">${esc(shot.game)} · <span class="mono">${esc(shot.plate)}</span></p>
          <p class="net ${total > 0.001 ? 't-up' : total < -0.001 ? 't-down' : 't-flat'}">
            ${total > 0 ? '+' : ''}${total.toFixed(2).replace(/\.00$/, '.0')} across ${shot.rounds.length} pass${shot.rounds.length === 1 ? '' : 'es'}
          </p>
        </header>
        <div class="strip">
          <figure class="att is-ref">
            <img src="${plate}" alt="reference plate for ${esc(shot.id)}" loading="lazy">
            <figcaption><span class="rd">Reference</span><span class="gap">—</span></figcaption>
            <div class="bar is-ghost"><span class="gate" style="left:${barPct(DATA.gate).toFixed(1)}%"></span></div>
            <p class="trend">the bar we score against</p>
          </figure>
          ${strip}
        </div>
      </article>`;
  }
  cards += `
    <section class="comp">
      <div class="comp-h">
        <h2><span class="cid">${esc(comp.id)}</span> ${esc(comp.name)}</h2>
        <span class="status s-${comp.status === 'closed' ? 'closed' : 'live'}">${esc(comp.status)}</span>
      </div>
      ${rows}
    </section>`;
}

const html = `<title>WATERLINE — visual progress</title>
<style>
:root{
  --ground:#0e1418; --panel:#151d23; --edge:#22303a; --edge-hi:#31434f;
  --ink:#e6eef2; --ink-2:#9fb3bd; --ink-3:#6d848f;
  --glass:#7fd4e8; --lamp:#e8a33d; --signal:#7fb08d; --warn:#d4705c;
  --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
  --sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
}
@media (prefers-color-scheme: light){
  :root{ --ground:#eef1f2; --panel:#fff; --edge:#d3dbdf; --edge-hi:#b9c6cc;
    --ink:#101a1f; --ink-2:#4a5c65; --ink-3:#71858e;
    --glass:#12798f; --lamp:#a4661a; --signal:#3d6b4c; --warn:#a8402c; }
}
:root[data-theme="dark"]{ --ground:#0e1418; --panel:#151d23; --edge:#22303a; --edge-hi:#31434f;
  --ink:#e6eef2; --ink-2:#9fb3bd; --ink-3:#6d848f;
  --glass:#7fd4e8; --lamp:#e8a33d; --signal:#7fb08d; --warn:#d4705c; }
:root[data-theme="light"]{ --ground:#eef1f2; --panel:#fff; --edge:#d3dbdf; --edge-hi:#b9c6cc;
  --ink:#101a1f; --ink-2:#4a5c65; --ink-3:#71858e;
  --glass:#12798f; --lamp:#a4661a; --signal:#3d6b4c; --warn:#a8402c; }

body{ background:var(--ground); color:var(--ink); font-family:var(--sans);
  line-height:1.5; margin:0; padding:clamp(1.25rem,3vw,3rem); }
.wrap{ max-width:1400px; margin:0 auto; display:flex; flex-direction:column; gap:3.5rem; }

.lede{ display:flex; flex-direction:column; gap:.85rem; border-bottom:1px solid var(--edge); padding-bottom:1.75rem; }
h1{ font-size:clamp(1.5rem,2.6vw,2.1rem); font-weight:600; letter-spacing:-.015em; margin:0; text-wrap:balance; }
.sub{ color:var(--ink-2); max-width:66ch; margin:0; }
.legend{ display:flex; flex-wrap:wrap; gap:1.5rem; font-size:.78rem; color:var(--ink-3);
  text-transform:uppercase; letter-spacing:.09em; margin-top:.35rem; }
.legend b{ color:var(--ink-2); font-weight:600; }

.comp{ display:flex; flex-direction:column; gap:1.5rem; }
.comp-h{ display:flex; align-items:baseline; gap:1rem; flex-wrap:wrap;
  border-bottom:1px solid var(--edge); padding-bottom:.6rem; }
.comp-h h2{ font-size:1.05rem; font-weight:600; margin:0; letter-spacing:.01em; }
.cid{ font-family:var(--mono); color:var(--glass); margin-right:.5rem; }
.status{ font-size:.7rem; text-transform:uppercase; letter-spacing:.11em;
  padding:.2rem .55rem; border:1px solid var(--edge-hi); border-radius:2px; color:var(--ink-3); }
.s-live{ color:var(--lamp); border-color:color-mix(in srgb,var(--lamp) 45%,transparent); }

.shot{ display:flex; flex-direction:column; gap:.9rem; }
.shot-h{ display:flex; align-items:baseline; gap:.9rem; flex-wrap:wrap; }
.shot-h h3{ font-family:var(--mono); font-size:.95rem; font-weight:600; margin:0; }
.src{ color:var(--ink-3); font-size:.82rem; margin:0; }
.mono{ font-family:var(--mono); }
.net{ margin:0 0 0 auto; font-family:var(--mono); font-size:.82rem; font-variant-numeric:tabular-nums; }

.strip{ display:flex; gap:1rem; overflow-x:auto; padding-bottom:.5rem; }
.att{ margin:0; flex:0 0 clamp(230px,26vw,300px); display:flex; flex-direction:column; gap:.5rem; }
.att img{ width:100%; height:auto; display:block; border:1px solid var(--edge);
  border-radius:2px; background:var(--panel); }
.is-ref img{ border-color:var(--edge-hi); box-shadow:0 0 0 1px color-mix(in srgb,var(--glass) 22%,transparent); }
.is-pass img{ border-color:color-mix(in srgb,var(--glass) 55%,transparent); }
figcaption{ display:flex; justify-content:space-between; align-items:baseline; gap:.5rem; }
.rd{ font-size:.7rem; text-transform:uppercase; letter-spacing:.11em; color:var(--ink-3); }
.gap{ font-family:var(--mono); font-size:1rem; font-variant-numeric:tabular-nums; color:var(--ink); }
.is-pass .gap{ color:var(--glass); }

.bar{ position:relative; height:4px; background:color-mix(in srgb,var(--ink-3) 22%,transparent);
  border-radius:2px; overflow:visible; }
.fill{ position:absolute; inset:0 auto 0 0; background:var(--ink-2); border-radius:2px; }
.is-pass .fill{ background:var(--glass); }
.gate{ position:absolute; top:-3px; bottom:-3px; width:1px; background:var(--lamp); }
.is-ghost{ opacity:.35; }

.trend{ font-size:.75rem; color:var(--ink-3); margin:0; }
.t-up{ color:var(--signal); }
.t-down{ color:var(--warn); }
.note{ font-size:.72rem; color:var(--ink-3); margin:0; font-style:italic; }
.trend b{ color:var(--glass); font-weight:600; }

footer{ border-top:1px solid var(--edge); padding-top:1.25rem; color:var(--ink-3); font-size:.8rem; }
footer code{ font-family:var(--mono); color:var(--ink-2); }
</style>
<div class="wrap">
  <div class="lede">
    <h1>WATERLINE — visual progress</h1>
    <p class="sub">Every scored shot, its reference plate, and each attempt against it. Scores are
    <b>gaps</b>, not absolutes: how far our render sat below the plate on the same blind sheet.
    Absolute scores drift two to three points between rounds; gaps reproduce, so only the gap is
    recorded.</p>
    <div class="legend">
      <span><b>Gate</b> gap ≥ −2.0 <span style="color:var(--lamp)">│</span> amber line</span>
      <span><b>Bar</b> longer is closer to the plate</span>
      <span><b>Cyan</b> met the bar</span>
      <span>Panels are the exact crops the critic scored</span>
    </div>
  </div>
  ${cards}
  <footer>
    Rebuild with <code>node tools/progress.mjs</code> after adding a round to
    <code>tools/progress.json</code>. Renders are recovered from the blind compare sheets, so the
    history stays intact even though <code>shots/</code> only holds the latest.
    Reference plates are copyrighted press screenshots held outside the public repo.
  </footer>
</div>`;

writeFileSync(join(TOOLS, 'progress.html'), html);
rmSync(tmp, { recursive: true, force: true });
console.log(`tools/progress.html — ${(Buffer.byteLength(html) / 1048576).toFixed(2)} MB (${(bytes / 1048576).toFixed(2)} MB of JPEG)`);
