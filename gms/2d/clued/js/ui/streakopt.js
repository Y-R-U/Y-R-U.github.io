// "Streak bonus" choice (Adds points / Just for show) with an inline ⓘ explanation. Used by solo/party setup,
// the pub quiz builder, Settings and the online host/lobby (room-level, server-authoritative there).
import { h } from './kit.js?v=202610100510';

export const STREAK_HELP = {
  on: 'Answer several right in a row to earn up to +50% points per question (+10% for each one in a row after the first).',
  off: 'The 🔥 streak counter still shows, but it adds no points: every answer scores on speed alone.',
};

export function streakOption(on, onPick, { label = 'Streak bonus' } = {}) {
  let cur = !!on;
  const help = h('p.tiny.muted.streak-help', { hidden: true, style: { margin: '6px 0 0' } });
  const info = h('button.icon-btn.info', { type: 'button', 'aria-label': 'What is the streak bonus?', 'aria-expanded': 'false', dataset: { act: 'streak-info' },
    style: { minHeight: '28px', width: '28px', height: '28px', marginLeft: '6px', fontSize: '15px' },
    onclick: () => { help.hidden = !help.hidden; info.setAttribute('aria-expanded', String(!help.hidden)); } }, 'ⓘ');
  const showHelp = () => { help.textContent = STREAK_HELP[cur ? 'on' : 'off']; };
  const row = h('div.chips');
  [[true, 'Adds points'], [false, 'Just for show']].forEach(([v, text]) => {
    const c = h('button.chip', { type: 'button', class: v === cur ? 'on' : '', dataset: { v: String(v) } }, text);
    c.addEventListener('click', () => { cur = v; row.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === c)); showHelp(); onPick(v); });
    row.append(c);
  });
  showHelp();
  return h('div.opt', { dataset: { opt: 'streak' } }, h('div.opt-label', { style: { display: 'flex', alignItems: 'center' } }, label, info), row, help);
}
