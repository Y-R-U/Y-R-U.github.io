// M5 screens (DOM): the weekly Ladder, the Shop (chests, helpers, balls, trails) and the chest
// opening animation. Logic lives in meta.js / ladder.js / economy.js.
import { TIERS, BOARD, PROMOTE, RELEGATE, standings, weekKey, weekCountdown, weekLabel, streakMult, ymd, addDays } from './ladder.js';
import { BALLS, TRAILS, HELPER_PRICES, CHESTS, STAR_CHEST_EVERY, STAR_CHESTS_PER_DAY, BALL_BY_ID, TRAIL_BY_ID } from './economy.js';
import { HELPERS, HELPER_ICONS, helperName } from './helpers.js';
import { ballPreview, trailPreviewCSS } from './cosmetics.js';
import { ICONS, chestIcon, CHEST_COLORS } from '../game/hud.js';
import { onlineTabs, roundPanel } from '../net/boardsui.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const back = `<button class="round" data-a="back" aria-label="Back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button>`;
const coin = n => `<span class="cn">${ICONS.coin}${n}</span>`;

// Tier badge: a shield in the tier colour with its pips (Legend gets a crown).
export function tierBadge(tier, size = 48) {
  const T = TIERS[tier] || TIERS[0], id = `tb${tier}_${size}`;
  const pips = tier < 5 ? Array.from({ length: tier + 1 }, (_, i) => `<circle cx="${24 + (i - tier / 2) * 6.4}" cy="35" r="2.2" fill="${T.dark}"/>`).join('') : '';
  const mark = tier === 5
    ? `<path d="M14 25l3-9 4 5 3-7 3 7 4-5 3 9z" fill="#fff3c4" stroke="${T.dark}" stroke-width="1.5" stroke-linejoin="round"/>`
    : `<path d="M24 13l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.2-4.1 5.8-.8z" fill="#fff" fill-opacity=".9" stroke="${T.dark}" stroke-width="1.3" stroke-linejoin="round"/>`;
  return `<svg class="tier-badge" width="${size}" height="${size}" viewBox="0 0 48 48" aria-label="${T.name}"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".45" stop-color="${T.color}"/><stop offset="1" stop-color="${T.dark}"/></linearGradient></defs>
    <path d="M24 3l17 6v12c0 11-7.5 19-17 24C14.5 40 7 32 7 21V9z" fill="url(#${id})" stroke="${T.dark}" stroke-width="2.2"/>
    <path d="M24 7l13 4.6V21c0 8.6-5.6 15-13 19.3C16.6 36 11 29.6 11 21v-9.4z" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1.2"/>${mark}${pips}</svg>`;
}
export function rewardLine(r) {
  if (!r) return '';
  const out = [];
  if (r.coins) out.push(coin(r.coins));
  for (const [k, n] of Object.entries(r.helpers || {})) out.push(`+${n} ${esc(helperName(k))}`);
  for (const k of [].concat(r.chest || [])) out.push(`${chestIcon(k, 18)} ${esc(CHESTS[k].name)}`);
  return out.join(' · ');
}

// ctx: { store, meta, click(), sfx(name), onBack(), playerName(),
//        boards?: { api (js/net/boards.js), rounds: roundList(), wait() } — the Online rounds tab }
export function createMetaScreens(ctx) {
  const { store, meta } = ctx;
  let shopTab = 'chests';

  // ---------- ladder ----------
  function ladder(flash = '') {
    const L = meta.ladder(), now = meta.now(), el = $('#ladder');
    const T = TIERS[L.tier], key = weekKey(now);
    const board = standings(key, L.tier, now, { name: ctx.playerName(), points: L.points });
    const me = board.find(r => r.you);
    const show = board.filter(r => r.rank <= 3 || Math.abs(r.rank - me.rank) <= 3 || r.rank === BOARD);
    const up = TIERS[L.tier + 1], down = TIERS[L.tier - 1];
    const pending = L.results.map((r, i) => ({ r, i })).filter(x => !x.r.claimed);
    // a streak is alive if you played today or yesterday; otherwise it shows 0 until you play
    const today = ymd(now), streak = L.streak.last === today || (L.streak.last && addDays(L.streak.last, 1) === today) ? L.streak.days : 0;
    const sm = streakMult(streak);
    el.innerHTML = `<div class="career-card wide ladder-card">
      <div class="map-head">${back}<div><div class="map-title">Weekly Ladder</div><div class="map-sub">${esc(weekLabel(key))} · ends in ${esc(weekCountdown(now))}</div></div></div>
      ${flash ? `<div class="card-note good">${flash}</div>` : ''}
      ${pending.map(({ r, i }) => `<div class="lad-result ${r.move > 0 ? 'up' : r.move < 0 ? 'down' : ''}">
        ${tierBadge(r.tier, 40)}<div class="lr-main"><b>Week of ${esc(weekLabel(r.week))}</b>
        <small>${esc(TIERS[r.tier].name)} · finished ${r.rank}/${BOARD} with ${r.points} pts${r.move > 0 ? ` · promoted to ${esc(TIERS[r.tier + 1].name)}!` : r.move < 0 ? ` · down to ${esc(TIERS[r.tier - 1].name)}` : ''}</small>
        <small class="rw">${rewardLine(r.reward)}</small></div>
        <button class="btn small" data-claim="${i}">Claim</button></div>`).join('')}
      <div class="lad-hero" style="--tc:${T.color}">
        <div class="lad-badge">${tierBadge(L.tier, 92)}</div>
        <div class="lad-tier">${esc(T.name)}</div>
        <div class="ev-stats"><div><span>Points</span><b>${L.points}</b></div><div><span>Rank</span><b>${me.rank}/${BOARD}</b></div><div><span>Streak</span><b>${streak}d${sm > 1 ? ` <small>×${sm.toFixed(1)}</small>` : ''}</b></div><div><span>Holes</span><b>${L.holes}</b></div></div>
        <div class="lad-zones">${up ? `<span class="z up">Top ${PROMOTE} → ${esc(up.name)}</span>` : '<span class="z up">Top of the ladder</span>'}${down ? `<span class="z down">Bottom ${RELEGATE} → ${esc(down.name)}</span>` : '<span class="z">No relegation from Bronze</span>'}</div>
      </div>
      <div class="lad-local"><table class="scores board ladder lad-board">${show.map((r, i) => `${i && r.rank - show[i - 1].rank > 1 ? '<tr class="gap"><td colspan="3">⋯</td></tr>' : ''}
        <tr class="${r.you ? 'you' : ''} ${r.zone} ${r.rank === PROMOTE && up ? 'cut-up' : ''} ${r.rank === BOARD - RELEGATE && down ? 'cut-down' : ''}"><td>${r.rank}</td><td>${r.zone === 'up' ? '<i class="zi up">▲</i>' : r.zone === 'down' ? '<i class="zi down">▼</i>' : ''}${esc(r.name)}</td><td>${r.points}</td></tr>`).join('')}</table></div>
      <div class="sec">Earn points <small>any hole, any mode: course, career, events</small></div>
      <ul class="lad-how">
        <li><b>10</b> for every hole you finish</li>
        <li><b>+8</b> per stroke under par, <b>+10</b> for a hole in one, <b>+3</b> per star</li>
        <li><b>Harder holes</b> pay more (by par, plus up to +6 on the toughest)</li>
        <li><b>Streak</b>: +10% for each day in a row you play, up to +50%</li>
        <li><b>Round bonus</b>: +5 a hole when you finish a full round</li>
      </ul>
      <div class="sec">Tiers <small>week ends Monday 00:00 · rewards for everyone who played</small></div>
      <div class="lad-tiers">${TIERS.map((t, k) => `<div class="${k === L.tier ? 'on' : ''}">${tierBadge(k, 34)}<b>${esc(t.name)}</b><span><em>Play: ${coin(t.coins)} ${chestIcon('silver', 15)}</em>${k < TIERS.length - 1 ? `<em>Promoted: ${coin(Math.round(t.coins * 1.5))} ${chestIcon('gold', 15)}</em>` : '<em>The top tier</em>'}</span></div>`).join('')}</div>
    </div>`;
    el.hidden = false;
    // boards agent: Your tier | Online rounds (hidden unless the server has online boards)
    const B = ctx.boards;
    if (B) onlineTabs({ el: el.querySelector('.lad-hero'), local: el.querySelector('.lad-local'), boards: B.api, key: 'ladder', labels: ['Your tier', 'Online rounds'],
      online: roundPanel(B.api, { rounds: B.rounds, week: key, wait: B.wait }) });
    el.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      ctx.click?.();
      if (b.dataset.a === 'back') { el.hidden = true; ctx.onBack(); return; }
      if (b.dataset.claim !== undefined) {
        const r = meta.claim(+b.dataset.claim);
        if (r) ctx.sfx?.('coin');
        ladder(r ? `Claimed: ${rewardLine(r)}${r.chest ? ' · open it in the Shop' : ''}` : '');
      }
    };
  }

  // ---------- shop ----------
  function shop(tab = shopTab, flash = '') {
    shopTab = tab;
    const el = $('#shop'), d = store.data, cos = d.cosmetics, q = d.chests.queue;
    const tabs = [['chests', `Chests${q.length ? ` <i class="dotn">${q.length}</i>` : ''}`], ['helpers', 'Helpers'], ['balls', 'Balls'], ['trails', 'Trails']];
    let body = '';
    if (tab === 'chests') {
      body = `<div class="chest-row">${q.length ? q.map((k, i) => `<button class="chest-tile ${k}" data-open="${i}">${chestIcon(k, 64)}<b>${esc(CHESTS[k].name)}</b></button>`).join('') : '<div class="card-note">No chests waiting.</div>'}</div>
        ${q.length ? '<button class="btn primary" data-open="0">Open a chest</button>' : ''}
        <div class="card-note small">Chests come from ladder tier rewards, event goals, and every ${STAR_CHEST_EVERY} three-star holes (up to ${STAR_CHESTS_PER_DAY} a day). Each holds coins and helpers; golden chests can hold a ball or trail.
        Next star chest: ${d.chests.starCount}/${STAR_CHEST_EVERY} three-star holes.</div>`;
    } else if (tab === 'helpers') {
      body = `<div class="shop-list">${HELPERS.map(h => `<div class="shop-row"><span class="si">${HELPER_ICONS[h.id]}</span>
        <span class="sm"><b>${esc(h.name)} <em>×${d.helpers[h.id] | 0}</em></b><small>${esc(h.desc)}</small></span>
        <button class="btn small buy ${d.coins < HELPER_PRICES[h.id] ? 'poor' : ''}" data-buy="helper:${h.id}">${coin(HELPER_PRICES[h.id])}</button></div>`).join('')}</div>`;
    } else {
      const list = tab === 'balls' ? BALLS : TRAILS, type = tab === 'balls' ? 'ball' : 'trail';
      body = `<div class="shop-grid">${list.map(x => {
        const own = meta.owns(type, x.id), on = cos[type] === x.id;
        const prev = type === 'ball' ? `<img class="bp" src="${ballPreview(x.id, 96)}" alt="">` : `<span class="tp" style="background:${trailPreviewCSS(x.id)}"><i></i></span>`;
        return `<button class="shop-tile ${on ? 'on' : ''} ${own ? 'own' : ''}" data-item="${type}:${x.id}">${prev}<b>${esc(x.name)}</b>
          <span class="st">${on ? 'Equipped' : own ? 'Tap to equip' : coin(x.price)}</span></button>`;
      }).join('')}</div>`;
    }
    el.innerHTML = `<div class="career-card wide shop-card">
      <div class="map-head">${back}<div><div class="map-title">Shop</div><div class="map-sub">Everything is earned by playing</div></div><div class="shop-coins">${coin(d.coins | 0)}</div></div>
      <div class="tabs">${tabs.map(([k, n]) => `<button class="tab ${k === tab ? 'on' : ''}" data-tab="${k}">${n}</button>`).join('')}</div>
      ${flash ? `<div class="card-note ${/^Not/.test(flash) ? 'bad' : 'good'}">${flash}</div>` : ''}
      ${body}</div>`;
    el.hidden = false;
    let confirm = null;
    el.onclick = async e => {
      const b = e.target.closest('button'); if (!b) return;
      ctx.click?.();
      if (b.dataset.a === 'back') { el.hidden = true; ctx.onBack(); return; }
      if (b.dataset.tab) { shop(b.dataset.tab); return; }
      if (b.dataset.open !== undefined) { await openChest(); shop('chests'); return; }
      if (b.dataset.buy) {
        const [type, id] = b.dataset.buy.split(':'), r = meta.buy(type, id);
        if (r.ok) ctx.sfx?.('coin');
        shop(tab, r.ok ? `+1 ${esc(helperName(id))}` : `Not enough coins for ${esc(helperName(id))}`);
        return;
      }
      if (b.dataset.item) {
        const [type, id] = b.dataset.item.split(':'), def = (type === 'ball' ? BALL_BY_ID : TRAIL_BY_ID)[id];
        if (meta.owns(type, id)) { meta.equip(type, id); shop(tab, `${esc(def.name)} equipped`); return; }
        if ((d.coins | 0) < def.price) { shop(tab, `Not enough coins: ${esc(def.name)} costs ${def.price}`); return; }
        if (confirm !== b.dataset.item) {   // two taps to spend: the first asks
          confirm = b.dataset.item;
          el.querySelectorAll('.shop-tile.ask').forEach(x => { x.classList.remove('ask'); });
          b.classList.add('ask'); b.querySelector('.st').innerHTML = `Buy for ${coin(def.price)}?`;
          return;
        }
        const r = meta.buy(type, id);
        if (r.ok) ctx.sfx?.('coin');
        shop(tab, r.ok ? `${esc(def.name)} bought and equipped!` : 'Not enough coins');
      }
    };
  }

  // ---------- chest opening ----------
  // The grant is saved (meta.openChest) before the animation starts; the animation only shows it.
  function openChest() {
    const res = meta.openChest();
    if (!res) return Promise.resolve(null);
    const el = $('#chest'), [a, b, c] = CHEST_COLORS[res.kind];
    const items = [];
    if (res.coins) items.push(`<div class="prize">${ICONS.coin}<b>+${res.coins}</b><small>coins</small></div>`);
    for (const [k, n] of Object.entries(res.helpers)) items.push(`<div class="prize"><span class="pi">${HELPER_ICONS[k]}</span><b>+${n}</b><small>${esc(helperName(k))}</small></div>`);
    if (res.cosmetic) {
      const def = (res.cosmetic.type === 'ball' ? BALL_BY_ID : TRAIL_BY_ID)[res.cosmetic.id];
      items.push(`<div class="prize rare">${res.cosmetic.type === 'ball' ? `<img src="${ballPreview(def.id, 64)}" alt="">` : `<span class="tp" style="background:${trailPreviewCSS(def.id)}"></span>`}<b>NEW</b><small>${esc(def.name)}</small></div>`);
    }
    el.innerHTML = `<div class="chest-stage ${res.kind}">
      <div class="chest-title">${esc(CHESTS[res.kind].name)}</div>
      <div class="chest-big">
        <div class="rays"></div>
        <svg viewBox="0 0 120 110" class="chest-svg">
          <ellipse cx="60" cy="104" rx="44" ry="5" fill="rgba(0,0,0,.35)"/>
          <g class="body"><rect x="14" y="52" width="92" height="50" rx="7" fill="${a}" stroke="${b}" stroke-width="4"/>
            <rect x="14" y="52" width="92" height="10" fill="${b}" opacity=".55"/><rect x="26" y="52" width="8" height="50" fill="${b}" opacity=".35"/><rect x="86" y="52" width="8" height="50" fill="${b}" opacity=".35"/>
            <rect x="52" y="54" width="16" height="22" rx="3" fill="#f2c75c" stroke="#7a5512" stroke-width="2.5"/><circle cx="60" cy="64" r="3" fill="#7a5512"/></g>
          <g class="glowin"><rect x="18" y="46" width="84" height="10" rx="4" fill="#fff6c4"/></g>
          <g class="lid"><path d="M14 54c0-24 14-36 46-36s46 12 46 36z" fill="${c}" stroke="${b}" stroke-width="4"/>
            <path d="M26 54c0-18 8-28 8-30M86 54c0-18-8-28-8-30" stroke="${b}" stroke-width="5" opacity=".35" fill="none"/></g>
        </svg>
        <div class="burst">${Array.from({ length: 14 }, (_, i) => `<i style="--a:${i * 360 / 14}deg;--d:${(i % 3) * 0.06}s"></i>`).join('')}</div>
      </div>
      <div class="prizes">${items.map((h, i) => h.replace('class="prize', `style="--i:${i}" class="prize`)).join('')}</div>
      <div class="chest-tap">Tap to open</div>
      <button class="btn primary chest-ok" hidden>Collect</button></div>`;
    el.hidden = false;
    const stage = el.querySelector('.chest-stage');
    return new Promise(resolve => {
      let opened = false;
      const open = () => {
        if (opened) return; opened = true;
        stage.classList.add('open');
        ctx.sfx?.('holeInOne');
        items.forEach((_, i) => setTimeout(() => ctx.sfx?.(i === 0 && res.coins ? 'coin' : 'star', { n: i + 1 }), 700 + i * 260));
        setTimeout(() => { el.querySelector('.chest-ok').hidden = false; }, 700 + items.length * 260);
      };
      const t = setTimeout(open, 1600);   // opens by itself if you don't tap
      el.onclick = e => {
        if (e.target.closest('.chest-ok')) { clearTimeout(t); ctx.click?.(); el.hidden = true; el.innerHTML = ''; resolve(res); return; }
        clearTimeout(t); open();
      };
    });
  }

  return { ladder, shop, openChest };
}

