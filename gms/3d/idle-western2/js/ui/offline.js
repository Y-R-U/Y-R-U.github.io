import { el, btn } from './dom.js?v=20261004d';
import { fmtCash, fmtTime } from '../state/format.js?v=20261004d';

export function createOffline(root, ctx) {
  const card = el('div', 'away');
  card.hidden = true;
  card.setAttribute('role', 'status');
  root.appendChild(card);
  let shownFor = null, timer = 0;

  function hide() {
    card.classList.remove('in');
    root.classList.remove('away-on');
    clearTimeout(timer);
    setTimeout(() => { card.hidden = true; }, 350);
  }
  card.addEventListener('click', hide);

  return {
    show(report) {
      if (!report || report === shownFor || !(report.cash > 0 || report.built?.length)) return;
      shownFor = report;
      card.replaceChildren();
      const top = el('div', 'away-top');
      top.append(el('span', 'away-moon', '🌵'), el('span', 'away-t', fmtTime(report.awaySec)), el('b', 'away-cash', '+' + fmtCash(report.cash)));
      card.appendChild(top);
      for (const id of report.built || []) card.appendChild(el('div', 'away-built', `🔨 ${ctx.model.line(id)?.emoji || ''} ${ctx.model.lineName(id)} opened while you were out`));
      const lines = Object.entries(report.lines).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
      if (lines.length) {
        const row = el('div', 'away-lines');
        for (const [id, v] of lines) row.appendChild(el('span', 'away-l', ctx.model.line(id).emoji + ' ' + fmtCash(v)));
        card.appendChild(row);
      }
      const foot = el('div', 'away-foot');
      foot.append(el('span', '', report.capped ? '⏳ Cap ' + fmtTime(report.capSec) : report.harvest.length ? '📦 Piles ×1.5' : '🤠 Welcome back, stranger'), btn('away-ok', '👍', hide, 'OK'));
      card.appendChild(foot);
      card.hidden = false;
      requestAnimationFrame(() => card.classList.add('in'));
      root.classList.add('away-on');
      ctx.audio.sfx.kaching();
      clearTimeout(timer);
      timer = setTimeout(hide, 9000);
      const r = card.getBoundingClientRect();
      ctx.juice?.coins(r.left + r.width * 0.7, r.top + 20, 6, { step: 5 });
    },
  };
}
