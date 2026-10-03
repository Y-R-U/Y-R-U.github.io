import { el, btn, setText, show } from './dom.js?v=20261004a';
import { fmtCash, fmtNum } from '../state/format.js?v=20261004a';
import { rewardText } from './goals.js?v=20261004a';

// The next district's permit, bought right here; when contracts block it, the missing ones are listed inline.
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
  const cons = el('div', 'gate-cons');
  root.append(main, note, cons);
  let next = null, sig = '';

  function prevOf(d) { return data.districts[data.districts.indexOf(d) - 1]; }

  function buy() {
    if (!next) return;
    const d = next;
    const r = game.act('permit', { districtId: d.id });
    if (r.ok) {
      ctx.celebrate(d.emoji + ' ' + d.name + ' open!');
      ctx.audio.sfx.kaching();
      ctx.buzz(25);
      ctx.bus.emit('ui:district', { districtId: d.id });
      const got = (r.claimed || []).map((id) => model.contracts().find((c) => c.id === id)).filter(Boolean);
      if (got.length) ctx.toast(`🏆 ${got.length} contract${got.length > 1 ? 's' : ''} claimed · ${rewardText(got.reduce((a, c) => ({ ...a, ...c.reward, tickets: (a.tickets || 0) + (c.reward?.tickets || 0) }), {}))}`, { ms: 3200, cls: 'gold' });
      if (d.verbText) setTimeout(() => ctx.toast(d.verbText.split(' · ')[0], { ms: 3200 }), got.length ? 900 : 0);
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
    else if (r.msg) ctx.toast('🔒 ' + r.msg);
  }

  function paintCons(list) {
    cons.replaceChildren();
    for (const c of list) {
      const row = el('div', 'gc');
      row.append(el('span', 'gc-e', c.emoji), el('span', 'gc-t', c.text), el('span', 'gc-p', `${fmtNum(c.p || 0)}/${fmtNum(c.n || 1)}`));
      cons.appendChild(row);
    }
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
      setText(name, `${next.emoji} ${next.name}`);
      setText(cost, qp.affordable ? (qp.cost > 0 ? '🔓 Open · ' + fmtCash(qp.cost) : '🔓 Open') : '🔒 ' + fmtCash(qp.cost));
      fill.style.setProperty('--p', Math.min(1, model.cash() / Math.max(1, qp.cost)).toFixed(2));
      root.classList.toggle('can', !!qp.affordable);
      root.classList.toggle('blocked', !!qp.blocked);
      const prev = prevOf(next);
      let missing = [];
      if (qp.blocked && prev) {
        const all = model.contracts().filter((c) => c.district === prev.id);
        const { done = 0, need = next.needContracts } = qp.contracts || {};
        missing = all.filter((c) => !c.done && !c.claimed).sort((a, b) => (b.p / (b.n || 1)) - (a.p / (a.n || 1)));
        setText(note, `🏆 ${done}/${need} · ${typeof qp.blocked === 'string' ? qp.blocked : 'Finish ' + need + ' ' + prev.name + ' contracts'}`);
      } else if (!qp.affordable) setText(note, '💵 ' + fmtCash(Math.max(0, qp.cost - model.cash())) + ' to go');
      else {
        const n = qp.contracts?.autoClaim?.length || 0;
        setText(note, n ? `🏆 ${n} contract${n > 1 ? 's' : ''} claimed on open` : next.verbText ? '✨ ' + next.verbText : '');
      }
      show(note, !!note.textContent);
      const key = missing.map((c) => c.id + ':' + c.p).join();
      if (key !== sig) { sig = key; paintCons(missing); }
      show(cons, missing.length > 0);
    },
  };
}
