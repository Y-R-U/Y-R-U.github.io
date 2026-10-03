import { el, btn, bar } from './dom.js?v=20261004a';
import { fmtNum } from '../state/format.js?v=20261004a';
import { section, empty } from './kit.js?v=20261004a';

const CRATE = { basic: '📦', silver: '🎁', gold: '🏆' };
export function rewardText(r) {
  if (!r) return '';
  const out = [];
  if (r.tickets) out.push('🎟️' + r.tickets);
  if (r.crate) out.push(CRATE[r.crate] || '🎁');
  if (r.cashSec || r.cash) out.push('💵');
  if (r.candy) out.push('🍬' + r.candy);
  return out.join(' ') || '✨';
}

export function fillGoals(body, ctx) {
  const { model, game } = ctx;
  const data = model.data;
  const giftSec = section(body);
  const gift = el('div', 'gift');
  giftSec.appendChild(gift);
  const conSec = section(body, '📜 Contracts');
  const con = el('div', 'goal-list');
  conSec.appendChild(con);
  const daySec = section(body, '☀️ Today');
  const day = el('div', 'goal-list');
  daySec.appendChild(day);
  const achSec = section(body, '🏅 Achievements');
  const ach = el('div', 'ach-grid');
  achSec.appendChild(ach);
  let sig = '';

  function claim(kind, id, node) {
    const act = kind === 'daily' ? 'claimDaily' : kind === 'gift' ? 'claimGift' : 'claimContract';
    const r = game.act(act, kind === 'gift' ? {} : kind === 'daily' ? { index: id } : { id });
    if (r.ok) {
      const b = node.getBoundingClientRect();
      ctx.juice.coins(b.left + b.width / 2, b.top + b.height / 2, 4, { big: true, step: 7 });
      ctx.audio.sfx.chime();
      ctx.buzz(15);
      sig = '';
      ctx.textNow();
    } else ctx.toast(r.msg || '⏳ Not yet');
  }

  function goalRow(g, kind, idx) {
    const r = el('div', 'goal' + (g.claimed ? ' claimed' : g.done ? ' ready' : ''));
    const t = el('div', 'goal-t');
    const dist = (data.districts || []).find((d) => d.id === g.district);
    t.append(el('b', '', (g.emoji || dist?.emoji || '•') + ' ' + (g.text || g.name || g.id)), bar(g.n ? g.p / g.n : g.done ? 1 : 0));
    r.appendChild(t);
    if (g.claimed) r.appendChild(el('span', 'goal-r', '✓'));
    else if (g.done) r.appendChild(btn('pill gold', rewardText(g.reward) || 'Claim', (e) => claim(kind, kind === 'daily' ? idx : g.id, e.currentTarget)));
    else r.appendChild(el('span', 'goal-r', `${fmtNum(g.p || 0)}/${fmtNum(g.n || 1)}`));
    return r;
  }

  function paint() {
    const cs = model.contracts();
    const ds = model.daily();
    const gf = model.gift();
    const as = model.achievements();
    const key = JSON.stringify([cs.map((c) => [c.p, c.done, c.claimed]), ds.map((d) => [d.p, d.done, d.claimed]), gf, as.map((a) => a.done)]);
    if (key === sig) return;
    sig = key;

    gift.replaceChildren();
    const gd = gf?.step ?? 0;
    const ladder = gf?.ladder || [];
    const strip = el('div', 'gift-days');
    for (let i = 0; i < 7; i++) strip.appendChild(el('span', 'gd' + (i < gd ? ' got' : i === gd && gf?.ready ? ' today' : ''), ladder[i]?.crate ? CRATE[ladder[i].crate] || '🎁' : i === 6 ? '🎁' : '🎟️'));
    gift.appendChild(strip);
    if (gf?.ready) gift.appendChild(btn('pill gold', 'Day ' + (gd + 1) + ' ' + rewardText(gf.reward), (e) => claim('gift', null, e.currentTarget)));
    else gift.appendChild(el('small', 'muted', gf ? '⏳ Tomorrow' : '🎁 7-day gift'));

    con.replaceChildren();
    const shown = cs.filter((c) => c.visible !== false && !c.claimed).sort((a, b) => (b.done - a.done)).slice(0, 8);
    for (const c of shown) con.appendChild(goalRow(c, 'contract'));
    if (!shown.length) empty(con, '📜', '✓');

    daySec.hidden = !ds.length;
    day.replaceChildren();
    ds.forEach((d, i) => day.appendChild(goalRow(d, 'daily', i)));

    ach.replaceChildren();
    for (const a of as) {
      const s = el('span', 'ach' + (a.done ? ' got' : ''), a.emoji || '🏅');
      s.title = a.name;
      ach.appendChild(s);
    }
    const got = as.filter((a) => a.done).length;
    achSec.querySelector('.sec-t').textContent = `🏅 ${got}/${as.length} · +${got}%`;
  }
  paint();
  return paint;
}
