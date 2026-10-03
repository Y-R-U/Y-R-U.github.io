import { fileURLToPath } from 'node:url';
import { launch, stop, openPage, GAME, sleep } from './cdp.mjs';

const OUT = fileURLToPath(new URL('../docs/shots/', import.meta.url));
const SHOTS = process.argv.includes('--shots');
const VPS = [
  ['s22', { width: 412, height: 915, deviceScaleFactor: 3, mobile: true }],
  ['iphone', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true }],
  ['small', { width: 360, height: 740, deviceScaleFactor: 2, mobile: true }],
  ['max', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true }],
  ['ipad', { width: 820, height: 1180, deviceScaleFactor: 2, mobile: true }],
  ['desktop', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }],
];
const fails = [];
const check = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) fails.push(msg); };

const MEASURE = `(() => {
  const vw = innerWidth, vh = innerHeight;
  const visible = (e) => { if (!e || e.closest('[hidden]')) return false; const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw; };
  let words = 0;
  const walker = document.createTreeWalker(document.getElementById('root'), NodeFilter.SHOW_TEXT);
  const seen = [];
  for (let n; (n = walker.nextNode());) {
    const p = n.parentElement;
    if (!visible(p)) continue;
    const r = p.getBoundingClientRect();
    if (r.top >= vh || r.bottom <= 0) continue;
    const ws = n.textContent.split(/\\s+/).filter((w) => /[A-Za-z]{2,}/.test(w));
    words += ws.length;
    if (ws.length) seen.push(ws.join(' '));
  }
  const glyphs = [...document.querySelectorAll('.glyph, .corner, .qty-btn, .tab, .hud-btn, .hud-age')].filter(visible).map((b) => { const r = b.getBoundingClientRect(); return { cls: b.className, w: r.width, h: r.height }; });
  const cards = [...document.querySelectorAll('.line-card')].filter(visible).map((c) => {
    const cr = c.getBoundingClientRect();
    const ctrls = [...c.querySelectorAll('button, .badge')].filter(visible);
    let area = 0;
    for (const b of ctrls) { const r = b.getBoundingClientRect(); area += r.width * r.height; }
    const v = c.querySelector('.line-view'), cv = v && v.querySelector('canvas');
    const vr = v.getBoundingClientRect();
    return { id: c.dataset.line, mode: c.className, controls: [...c.querySelectorAll('button')].filter(visible).length, cover: area / (cr.width * cr.height),
      canvas: cv ? { cw: cv.width, ch: cv.height, ew: vr.width, eh: vr.height, dpr: cv.width / Math.max(1, vr.width) } : null };
  });
  const hero = document.querySelector('.hero-view'), hc = hero.querySelector('canvas'), hr = hero.getBoundingClientRect();
  const heroBox = document.querySelector('.hero').getBoundingClientRect();
  const chips = [...document.querySelectorAll('.ev-edge, .ev-marker, .hero-chip, .hero-btn, .qty')].filter(visible).reduce((a, e) => { const r = e.getBoundingClientRect(); return a + r.width * r.height; }, 0);
  return {
    overflow: document.documentElement.scrollWidth > vw + 0.5, words, seen,
    small: glyphs.filter((g) => g.w < 40 || g.h < 40), glyphs: glyphs.length, cards,
    hero: { cw: hc && hc.width, ch: hc && hc.height, ew: hr.width, eh: hr.height, dpr: hc ? hc.width / Math.max(1, hr.width) : 0, chipCover: chips / (heroBox.width * heroBox.height) },
  };
})()`;

function verify(tag, r, { fresh, folded = false }) {
  check(!r.overflow, `${tag} no horizontal overflow`);
  check(!r.small.length, `${tag} all ${r.glyphs} buttons ≥40px` + (r.small.length ? ': ' + r.small.map((g) => `${g.cls} ${g.w.toFixed(0)}×${g.h.toFixed(0)}`).join(', ') : ''));
  const dprOk = (x) => x.dpr > 0.9 && x.dpr < 3.1 && Math.abs(x.cw / x.ch - x.ew / x.eh) < 0.03;
  check(r.hero.cw > 0 && dprOk(r.hero), `${tag} hero canvas ${r.hero.cw}×${r.hero.ch} matches box ${r.hero.ew.toFixed(0)}×${r.hero.eh.toFixed(0)}`);
  check(r.hero.chipCover < (folded ? 0.15 : 0.1), `${tag} hero chrome covers ${(r.hero.chipCover * 100).toFixed(1)}% of the hero`);
  for (const c of r.cards) {
    if (c.mode.includes('ghost') || c.mode.includes('compact')) continue;
    check(c.controls <= 5, `${tag} ${c.id} has ${c.controls} controls (≤5)`);
    check(c.cover <= 0.4, `${tag} ${c.id} controls cover ${(c.cover * 100).toFixed(0)}% (≤40%)`);
    if (c.canvas && c.canvas.cw) check(dprOk(c.canvas), `${tag} ${c.id} canvas ${c.canvas.cw}×${c.canvas.ch} matches ${c.canvas.ew.toFixed(0)}×${c.canvas.eh.toFixed(0)}`);
  }
  if (fresh) check(r.words < 30, `${tag} ${r.words} words above the fold on a fresh start (<30): ${r.seen.join(' | ')}`);
}

const port = launch();
try {
  for (const [name, vp] of VPS) {
    console.log(`${name} ${vp.width}x${vp.height}`);
    for (const [mode, q] of [['fresh', '?nosave=1'], ['demo', '?nosave=1&demo=1']]) {
      const page = await openPage(port);
      await page.goto(GAME + q, vp);
      let ready = false;
      try { ready = await page.wait('window.__il2 && window.__il2.ready', 15000); } catch {}
      check(ready, `${name}/${mode} booted` + (ready ? '' : [...page.exceptions, ...page.consoleLog.map((c) => c.text)].slice(0, 2).map((x) => '\n    ' + String(x).split('\n')[0]).join('')));
      if (!ready) { await page.close(); continue; }
      await sleep(1600);
      const r = await page.eval(MEASURE);
      verify(`${name}/${mode}`, r, { fresh: mode === 'fresh' });
      if (mode === 'demo') {
        await page.eval('scrollTo(0, 600)');
        await sleep(700);
        const r2 = await page.eval(MEASURE);
        verify(`${name}/scrolled`, r2, { fresh: false, folded: true });
        if (vp.width < 900) {
          await page.eval('scrollTo(0, 2400)');
          await sleep(700);
          const v = await page.eval(`(() => { const top = document.querySelector('.hud').getBoundingClientRect().bottom, tb = document.querySelector('.tabbar'), bot = tb && !tb.hidden ? tb.getBoundingClientRect().top : innerHeight;
            const full = [...document.querySelectorAll('.hero, .line-card:not([hidden])')].filter((c) => { const r = c.getBoundingClientRect(); return r.top >= top - 1 && r.bottom <= bot + 1; }).length;
            return { full, vis: __il2.host.debug.visibleViews, up: !document.querySelector('.jump').hidden }; })()`);
          check(v.full < 2, `${name} <2 views fully on screen mid-list (${v.full})`);
          check(!v.vis.includes('hero'), `${name} hero stops rendering when scrolled away (${v.vis.join(',')})`);
          check(v.up, `${name} jump buttons shown when the hero is away`);
        }
        if (SHOTS) await page.shot(OUT + `layout-${name}-scrolled.png`);
        await page.eval('scrollTo(0, 0)');
        await sleep(300);
      }
      if (SHOTS) await page.shot(OUT + `layout-${name}-${mode}.png`);
      const bad = page.consoleLog.filter((c) => c.type === 'error' || c.type === 'warning');
      check(!bad.length && !page.exceptions.length, `${name}/${mode} no console errors` + [...bad.map((c) => c.text), ...page.exceptions].slice(0, 3).map((s) => '\n    ' + String(s).split('\n')[0]).join(''));
      await page.close();
    }
  }
} finally {
  stop(port);
}
console.log(fails.length ? `\nFAILED ${fails.length}` : '\nPASS');
process.exit(fails.length ? 1 : 0);
