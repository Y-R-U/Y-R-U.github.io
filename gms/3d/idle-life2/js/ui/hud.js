import { el, btn, setText, show } from './dom.js?v=20261004b';
import { fmtCash, fmtRate, fmtNum } from '../state/format.js?v=20261004b';

export function createHud({ onSettings, onLife, onSeason, onTickets }) {
  const root = el('header', 'hud');
  const money = el('div', 'hud-money');
  const cash = el('div', 'hud-cash', '$0');
  const sub = el('div', 'hud-sub');
  const rate = el('span', 'hud-rate', '');
  const tix = btn('hud-tix', '', onTickets, 'Tickets');
  sub.append(rate, tix);
  money.append(cash, sub);
  const right = el('div', 'hud-right');
  const season = btn('hud-btn season', '🎃', onSeason, "Hollow's Eve");
  const age = btn('hud-age', '', onLife, 'Life');
  const gear = btn('hud-btn gear', '⚙️', onSettings, 'Settings');
  right.append(season, age, gear);
  root.append(money, right);
  season.hidden = rate.hidden = tix.hidden = age.hidden = gear.hidden = true;

  let shown = null, lastRate = 0, glowT = 0, lastUnit = -1;

  return {
    root, cashEl: cash, seasonBtn: season,
    frame(dt, target) {
      if (shown == null || target < shown * 0.5) shown = target;
      const diff = target - shown;
      if (Math.abs(diff) < Math.max(0.01, Math.abs(target) * 1e-4)) shown = target;
      else shown += diff * (1 - Math.exp(-dt * 9));
      setText(cash, fmtCash(shown));
      const unit = shown >= 1000 ? Math.floor(Math.log10(shown) / 3) : 0;
      if (unit > lastUnit && lastUnit >= 1 && unit >= 3) {
        cash.classList.remove('newunit'); void cash.offsetWidth; cash.classList.add('newunit');
      }
      lastUnit = Math.max(lastUnit, unit);
    },
    update(model, reveals) {
      const t = model.game.totals();
      const r = t.incomePerSec || 0;
      show(rate, r > 0);
      setText(rate, fmtRate(r));
      if (r > lastRate * 1.005 && lastRate > 0) { rate.classList.add('rise'); glowT = performance.now(); }
      else if (performance.now() - glowT > 1200) rate.classList.remove('rise');
      lastRate = r;
      const tk = model.tickets();
      show(tix, tk > 0);
      setText(tix, '🎟️ ' + fmtNum(tk));
      show(age, reveals.age);
      const kids = model.kids().length;
      setText(age, `${model.life().partner ? '💑' : '🧑'} ${model.age()}` + (model.gen() > 1 ? ' · G' + model.gen() : '') + (kids ? ' · ' + '👶'.repeat(Math.min(kids, 3)) : ''));
      show(gear, reveals.gear);
      show(season, reveals.season);
      season.classList.toggle('inside', !!model.season()?.active);
    },
  };
}
