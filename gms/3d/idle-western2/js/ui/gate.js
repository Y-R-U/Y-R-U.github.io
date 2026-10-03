import { el, btn, setText, show } from './dom.js?v=20261004d';
import { fmtCash } from '../state/format.js?v=20261004d';

// The next district's permit, bought right here under the list. Hidden while there is no next district.
export function createGate(ctx) {
  const { game, model, data } = ctx;
  const root = el('div', 'gate');
  root.hidden = true;
  const main = btn('gate-main', '', () => buy(), 'Open the next district');
  const name = el('span', 'gate-name');
  const cost = el('span', 'gate-cost');
  const bar = el('div', 'bar');
  const fill = el('i');
  bar.appendChild(fill);
  main.append(name, cost, bar);
  const note = el('small', 'gate-note');
  root.append(main, note);
  let next = null;

  function buy() {
    if (!next) return;
    const d = next;
    const r = game.act('permit', { districtId: d.id });
    if (r.ok) {
      ctx.celebrate(d.emoji + ' ' + d.name + ' is yours!');
      ctx.audio.sfx.kaching();
      ctx.buzz(25);
      ctx.bus.emit('ui:district', { districtId: d.id });
      if (d.verbText) ctx.toast(d.verbText.split(' · ')[0], { ms: 3200 });
      ctx.textNow();
      const first = data.lines.find((l) => l.district === d.id);
      if (first) ctx.flyTo(first.id);
      return;
    }
    ctx.audio.sfx.nope();
    root.classList.remove('nope');
    requestAnimationFrame(() => root.classList.add('nope'));
    setTimeout(() => root.classList.remove('nope'), 400);
    if (r.code === 'funds') ctx.toast('💵 Need ' + fmtCash(model.q('permit', { districtId: d.id }).cost - model.cash()) + ' more');
    else if (r.msg) { ctx.toast('🔒 ' + r.msg); if (/demand/i.test(r.msg)) ctx.openTab('goals'); }
  }

  return {
    root,
    update(started, R) {
      next = data.districts.find((d) => !model.districtOpen(d.id)) || null;
      if (!next || !started) { root.hidden = true; return; }
      const allOwned = data.lines.every((l) => !model.districtOpen(l.district) || game.state.lines[l.id].lv > 0);
      const qp = model.q('permit', { districtId: next.id });
      const showIt = allOwned || model.cash() >= qp.cost * 0.3 || R.town;
      root.hidden = !showIt;
      if (!showIt) return;
      setText(name, `📜 Deed · ${next.emoji} ${next.name}`);
      setText(cost, qp.affordable ? (qp.cost > 0 ? '🔓 Open · ' + fmtCash(qp.cost) : '🔓 Open') : '🔒 ' + fmtCash(qp.cost));
      fill.style.setProperty('--p', Math.min(1, model.cash() / Math.max(1, qp.cost)).toFixed(2));
      root.classList.toggle('can', !!qp.affordable);
      root.classList.toggle('blocked', !!qp.blocked);
      if (qp.blocked) setText(note, '🔒 ' + qp.blocked);
      else if (!qp.affordable) setText(note, '💵 ' + fmtCash(Math.max(0, qp.cost - model.cash())) + ' to go');
      else setText(note, next.verbText ? '✨ ' + next.verbText : '');
      show(note, !!note.textContent);
    },
  };
}
