import { botHue } from './game.js';
import { h, esc, icon, avatar, segmented, bindSegmented } from '../ui.js';
import { getSettings, setSettings, getStats, getResume, clearResume } from '../store.js';
import { TIME_CONTROLS, parseTc } from '../clock.js';
import { previewPoints } from '../ladder.js';
import { isLocked, getBench, thinkLabel } from './bots.js';
import { startNewGame } from './game.js';
import { confirmDialog } from '../ui.js';

export const ROUTE = 'timecontrol';

export function render(app, { botId }) {
  const bot = app.deps.bots.BOTS.find(b => b.id === botId);
  if (!bot) { setTimeout(() => app.go('#/play/bot')); return { el: h('<section></section>') }; }
  const s = getSettings();
  let tc = s.lastTc, color = s.lastColor;
  const pts = previewPoints(bot.elo);
  const rec = getStats().perBot[bot.id];
  const el = h(`<section class="screen tc">
    <div class="tc-bot card">
      ${avatar(bot.avatar, { size: 'xl', label: bot.name, hue: botHue(bot) })}
      <div><h2>${esc(bot.name)} <span class="elo">${bot.elo}</span></h2><p>${esc(bot.blurb || '')}</p>
      <div class="tc-meta">${rec ? `<span class="rec"><i class="good">${rec.w}W</i> <i>${rec.d}D</i> <i class="bad">${rec.l}L</i></span>` : ''}${thinkLabel(app.deps.bots, bot) ? `<span class="think">${icon('clock')}${thinkLabel(app.deps.bots, bot)}</span>` : ''}</div></div>
    </div>
    <div class="pts-row">
      <div><small>Win</small><b class="good">+${pts.win}</b></div>
      <div><small>Draw</small><b>+${pts.draw}</b></div>
      <div><small>Loss</small><b>+${pts.loss}</b></div>
    </div>
    <h3 class="sect">Play as</h3>
    ${segmented('color', [
      { value: 'w', label: '<span class="kdot w"></span> White' },
      { value: 'random', label: '<span class="kdot r"></span> Random' },
      { value: 'b', label: '<span class="kdot b"></span> Black' }], color)}
    <h3 class="sect">Time control</h3>
    <div class="tc-groups">${TIME_CONTROLS.map(g => `<div class="tc-group"><small>${icon(g.group === 'Unlimited' ? 'clock' : g.group === 'Bullet' ? 'swords' : 'clock')} ${g.group}</small>
      <div class="tc-chips">${g.items.map(t => `<button class="chip ${t === tc ? 'on' : ''}" data-tc="${t}">${t === 'unlimited' ? '∞ No clock' : parseTc(t).label}</button>`).join('')}</div></div>`).join('')}</div>
    <div class="tc-cta"><button class="btn btn-primary btn-xl" data-act="play">${icon('play')} Play</button></div>
  </section>`);
  el.addEventListener('click', async e => {
    const c = e.target.closest('[data-tc]');
    if (c) { tc = c.dataset.tc; el.querySelectorAll('[data-tc]').forEach(x => x.classList.toggle('on', x === c)); return; }
    if (e.target.closest('[data-act="play"]')) {
      await getBench(app.deps.bots);
      if (isLocked(app.deps.bots, bot)) return;
      const r = getResume();
      if (r && !(await confirmDialog({ title: 'Abandon your game in progress?', body: 'You have an unfinished game. Starting a new one discards it (no ladder points either way).', ok: 'Start new game', danger: true }))) return;
      clearResume();
      setSettings({ lastTc: tc, lastColor: color });
      const side = color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : color;
      startNewGame({ botId: bot.id, tc, color: side });
      app.go('#/game');
    }
  });
  bindSegmented(el, (name, v) => { if (name === 'color') color = v; });
  return { el, top: { title: 'Game setup', back: '#/play/bot' } };
}
