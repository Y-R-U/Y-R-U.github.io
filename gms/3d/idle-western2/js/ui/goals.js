import { el, btn, bar } from './dom.js?v=20261004c';
import { fmtNum } from '../state/format.js?v=20261004c';
import { section, empty } from './kit.js?v=20261004c';
import { BOX_INFO } from './boxes.js?v=20261004c';

export function rewardText(r) {
  if (!r) return '';
  const out = [];
  if (r.teeth) out.push('🦷' + r.teeth);
  if (r.box) out.push(BOX_INFO[r.box]?.e || '📦');
  if (r.cashSec) out.push('💵');
  return out.join(' ') || '✨';
}

// "Town Council Demands" (contracts) per block, plus achievements (+1% each, forever).
export function fillGoals(body, ctx) {
  const { model, game } = ctx;
  const data = model.data;
  const head = el('p', 'decree', 'By order of the Dribble Creek Town Council, the following demands are made of the new money in town:');
  body.appendChild(head);
  const con = el('div', 'goal-list');
  section(body, '📜 Demands').appendChild(con);
  const achSec = section(body, '🏅 Achievements');
  const ach = el('div', 'ach-grid');
  achSec.appendChild(ach);
  const achT = achSec.querySelector('.sec-t');
  let sig = '';

  function claim(c, node) {
    const r = game.act('claimContract', { id: c.id });
    if (r.ok) {
      const b = node.getBoundingClientRect();
      ctx.juice.coins(b.left + b.width / 2, b.top + b.height / 2, 4, { big: true, step: 7 });
      ctx.audio.sfx.chime();
      ctx.buzz(15);
      sig = '';
      ctx.textNow();
    } else ctx.toast(r.msg || '⏳ Not yet');
  }

  function row(c) {
    const r = el('div', 'goal' + (c.claimed ? ' claimed' : c.done ? ' ready' : ''));
    const t = el('div', 'goal-t');
    t.append(el('b', '', (c.emoji || '•') + ' ' + c.text), bar(c.n ? c.p / c.n : c.done ? 1 : 0, 'gold'));
    r.appendChild(t);
    if (c.claimed) r.appendChild(el('span', 'goal-r', '✓'));
    else if (c.done) r.appendChild(btn('pill gold', rewardText(c.reward) || 'Claim', (e) => claim(c, e.currentTarget)));
    else r.appendChild(el('span', 'goal-r', `${fmtNum(c.p || 0)}/${fmtNum(c.n || 1)}`));
    return r;
  }

  function paint() {
    const cs = model.contracts();
    const as = model.achievements();
    const key = JSON.stringify([cs.map((c) => [c.p, c.done, c.claimed, c.visible]), as.map((a) => a.done)]);
    if (key === sig) return;
    sig = key;
    con.replaceChildren();
    for (const d of data.districts) {
      const list = cs.filter((c) => c.district === d.id && c.visible);
      if (!list.length) continue;
      const done = list.filter((c) => c.done).length;
      con.appendChild(el('div', 'goal-block', `${d.emoji} ${d.name} · ${done}/${list.length}`));
      for (const c of list.sort((a, b) => (a.claimed - b.claimed) || (b.done - a.done))) con.appendChild(row(c));
    }
    if (!con.children.length) empty(con, '📜', 'The Council is drafting');
    ach.replaceChildren();
    for (const a of as) {
      const s = btn('ach' + (a.done ? ' got' : ''), a.emoji || '🏅', () => ctx.toast(`${a.emoji} ${a.name}${a.done ? ' ✓' : ''}`), a.name);
      ach.appendChild(s);
    }
    const got = as.filter((a) => a.done).length;
    achT.textContent = `🏅 ${got}/${as.length} · +${got}% income`;
  }
  paint();
  return paint;
}
