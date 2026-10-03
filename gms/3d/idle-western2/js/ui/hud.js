import { el, btn, setText, show } from './dom.js?v=20261004a';
import { fmtCash, fmtRate } from '../state/format.js?v=20261004a';

export function createHud({ onSettings }) {
  const root = el('header', 'hud');
  const money = el('div', 'hud-money');
  const cash = el('div', 'hud-cash', '$0');
  const sub = el('div', 'hud-sub');
  const rate = el('span', 'hud-rate', '');
  sub.append(rate);
  money.append(cash, sub);
  const right = el('div', 'hud-right');
  const gear = btn('hud-btn gear', '⚙️', onSettings, 'Settings');
  right.append(gear);
  root.append(money, right);
  rate.hidden = gear.hidden = true;

  let shown = null, lastRate = 0, glowT = 0, lastUnit = -1;

  return {
    root, cashEl: cash,
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
      const r = model.game.totals().incomePerSec || 0;
      show(rate, r > 0);
      setText(rate, fmtRate(r));
      if (r > lastRate * 1.005 && lastRate > 0) { rate.classList.add('rise'); glowT = performance.now(); }
      else if (performance.now() - glowT > 1200) rate.classList.remove('rise');
      lastRate = r;
      show(gear, reveals.gear);
    },
  };
}
