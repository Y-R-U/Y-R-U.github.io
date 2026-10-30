import { botHue } from './game.js';
import { h, esc, icon, avatar } from '../ui.js';
import { getStats } from '../store.js';
import { previewPoints } from '../ladder.js';

export const ROUTE = 'bots';
const TIERS = [
  { name: 'Beginner', max: 800 }, { name: 'Casual', max: 1300 }, { name: 'Intermediate', max: 1800 },
  { name: 'Advanced', max: 2150 }, { name: 'Master', max: 99999 },
];
let bench = null, benchPromise = null;
export function getBench(bots) {
  if (bench) return Promise.resolve(bench);
  if (!benchPromise) benchPromise = Promise.resolve(bots.benchmark()).then(b => (bench = b || { score: 0 })).catch(() => (bench = { score: 0 }));
  return benchPromise;
}
export function isLocked(bots, bot) { return bench ? !bots.botAvailable(bot, bench) : false; }
// Forget the cached benchmark (Settings → "Re-test this device" re-runs it).
export function resetBench() { bench = null; benchPromise = null; }

// Typical seconds per bot move on this device (qa / ui-3): the engine's expectedMoveMs plus the
// human-like pause bots under 2000 take (bots.js: ~0.9 s avg, ×0.7 from 1200), whichever is longer.
export function thinkMs(bots, bot) {
  const b = bench || (bots.cachedBenchmark && bots.cachedBenchmark());
  const eng = b && b.nps && bots.expectedMoveMs ? bots.expectedMoveMs(bot, b) : null;
  if (eng == null) return null;
  const pause = bot.elo < 2000 ? (bot.elo < 1200 ? 900 : 630) : 0;
  return Math.max(eng, pause);
}
export function thinkLabel(bots, bot) {
  const ms = thinkMs(bots, bot);
  if (ms == null) return '';
  return ms < 1500 ? '~1 s a move' : ms < 60000 ? `~${Math.round(ms / 1000)} s a move` : `~${Math.round(ms / 60000)} min a move`;
}

export function render(app) {
  const { BOTS } = app.deps.bots;
  const st = getStats();
  const el = h(`<section class="screen bots">
    <p class="screen-lede">Pick an opponent. Beating stronger bots earns <b>far</b> more ladder points.</p>
    <div class="bench-note" hidden>${icon('clock')} Checking how fast this device thinks…</div>
    <div class="bot-list"></div>
  </section>`);
  const list = el.querySelector('.bot-list');
  const draw = () => {
    const sorted = BOTS.slice().sort((a, b) => a.elo - b.elo);
    let html = '', lo = 0;
    for (const t of TIERS) {
      const inTier = sorted.filter(b => b.elo >= lo && b.elo < t.max);
      lo = t.max;
      if (!inTier.length) continue;
      html += `<h2 class="tier">${t.name}</h2>`;
      for (const b of inTier) {
        const rec = st.perBot[b.id];
        const locked = isLocked(app.deps.bots, b);
        const pts = previewPoints(b.elo);
        const beaten = rec && rec.w > 0;
        const think = thinkLabel(app.deps.bots, b);
        html += `<${locked ? 'div' : 'a'} class="bot-card${locked ? ' locked' : ''}" ${locked ? 'aria-disabled="true"' : `href="#/play/bot/${esc(b.id)}"`}>
          ${avatar(b.avatar, { size: 'lg', label: b.name, hue: botHue(b) })}
          <div class="bc-main">
            <div class="bc-top"><b>${esc(b.name)}</b><span class="elo">${b.elo}</span>${beaten ? `<span class="beaten" title="Beaten">${icon('check')}</span>` : ''}</div>
            <p>${esc(b.blurb || '')}</p>
            ${locked ? `<span class="lock-note">${icon('lock')} Too strong for this device${think ? ` (${think})` : ''}</span>`
              : `<div class="bc-meta">${rec ? `<span class="rec"><i class="good">${rec.w}W</i> <i>${rec.d}D</i> <i class="bad">${rec.l}L</i></span>` : '<span class="rec new">New</span>'}${think ? `<span class="think" title="Typical think time on this device">${icon('clock')}${think}</span>` : ''}<span class="pts">Win <b>+${pts.win}</b></span></div>`}
          </div>
          ${locked ? '' : `<span class="bc-go">${icon('chevron')}</span>`}
        </${locked ? 'div' : 'a'}>`;
      }
    }
    list.innerHTML = html;
  };
  draw();
  if (!bench) {
    const note = el.querySelector('.bench-note');
    const t = setTimeout(() => { note.hidden = false; }, 300);
    getBench(app.deps.bots).then(() => { clearTimeout(t); note.hidden = true; if (el.isConnected) draw(); });
  }
  return { el, top: { title: 'Play Bots', back: '#/home' } };
}
