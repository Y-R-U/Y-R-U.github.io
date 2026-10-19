import { h, fmt, wait } from './dom.js';
import { icon, roleBadge } from './icons.js';
import { levelById, unitDef, maps, data } from '../app/data.js';
import { btn, bar, setBar, unitCard, rewardChips } from './components.js';
import { snd } from '../app/sound.js';
import { playScene } from './dialogue.js';

export async function mount(root, ctx) {
  const { store, router, portraits } = ctx;
  const R = ctx.session.result;
  if (!R) { router.go('/hub', { replace: true }); return {}; }
  const { battle: B, result } = R;
  const win = !!result?.win;
  if (!R.rewards) R.rewards = store.finishBattle(result);
  const rw = R.rewards;
  const found = B.levelId ? levelById(B.levelId) : null;

  const starsEl = h('div.rs-stars', [0, 1, 2].map((i) => h('span.rs-star' + (i < (result?.stars || 0) ? '.got' : ''), icon('star'))));
  const loot = h('div.rs-loot');
  const units = h('div.rs-units');
  const mvpEl = h('div.rs-mvpwrap');
  const goalsEl = B.kind === 'story' && B.levelId ? h('div.vp-panel.rs-panel.rs-goals', { '--cut': '14px' }) : null;
  const acts = h('div.rs-acts');
  root.append(h('div.rs-wrap',
    h('div.rs-head' + (win ? '.win' : '.loss'), h('div.vp-kicker', B.title || ''), h('h1', win ? 'Victory' : 'Defeat'),
      win ? starsEl : h('div.rs-sub', result?.reason === 'retreat' || result?.reason === 'forfeit' ? 'Squad withdrew' : result?.reason === 'timeout' ? 'Contract timer expired' : 'Squad integrity lost')),
    goalsEl,
    h('div.vp-panel.rs-panel', { '--cut': '14px' }, h('div.vp-kicker', 'Payout'), loot),
    mvpEl,
    h('div.vp-panel.rs-panel', { '--cut': '14px' }, h('div.row.between', h('div.vp-kicker', 'After-action report'), h('small.t-muted', rw.xp ? '+' + rw.xp + ' XP' : '')), units),
    !win ? h('div.vp-panel.dim.rs-panel.rs-tips', h('div.vp-kicker', 'Field advice'),
      h('ul', h('li', 'Level units in the Barracks with scrap'), h('li', 'Tanks hold the front column; archers hit harder from the back'),
        h('li', 'Arena and Special Ops pay out shards and scrap'))) : null),
    acts);   // pinned under the scrolling report, always reachable

  // star goals tick in one by one (this run's result), first completions show their reward; then any map chest opens
  const goalsDone = (async () => {
    if (!goalsEl) return;
    const list = store.goals(B.levelId), run = rw.goals || result?.goals || [], fresh = new Set(rw.newGoals || []);
    goalsEl.append(h('div.row.between', h('div.vp-kicker', 'Star goals'), h('small.t-gold', list.filter((g) => g.done).length + '/' + list.length + ' ★ earned')));
    for (const g of list) {
      const met = !!run[g.index];
      const row = h('div.goal-row.rs-g' + (met ? '.done' : ''),
        h('span.goal-star', icon(met || g.done ? 'star' : 'starO')),
        h('div.goal-txt', h('span', g.text), !met && g.done ? h('small.t-muted', 'Earned on an earlier run') : null),
        h('div.goal-rw', fresh.has(g.index) ? [h('small.rs-gnew', 'NEW'), ...rewardChips(g.index === 0 ? null : g.reward, { small: true })] : met ? h('small.goal-ok', icon('check'), 'Met') : h('small.t-muted', g.done ? '' : 'Missed')));
      goalsEl.append(row);
      await wait(260);
      row.classList.add('in');
      if (met) snd.sfx(fresh.has(g.index) ? 'reward' : 'ui_tap');
    }
  })();

  // payout reveal: staggered chips, then cards flip in
  (async () => {
    await goalsDone;
    const items = [];
    if (rw.credits) items.push(['credits', fmt(rw.credits), 'var(--gold)']);
    if (rw.scrap) items.push(['scrap', fmt(rw.scrap), 'var(--text-2)']);
    if (rw.chips) items.push(['cores', fmt(rw.chips) + ' chips', 'var(--purple)']);
    if (rw.arena_tokens) items.push(['token', fmt(rw.arena_tokens) + ' tokens', 'var(--cyan)']);
    if (rw.event_marks) items.push(['flag', fmt(rw.event_marks) + ' marks', 'var(--orange)']);
    for (const [k, n] of Object.entries(rw.buffsGot || {})) items.push(['up', (data().buffs?.[k]?.name || k) + ' ×' + n, 'var(--gold)']);
    for (const c of rw.dupeCards || []) items.push(['hex', (unitDef(c.def)?.name || c.def) + ' +' + c.shards + ' shards', 'var(--purple)']);
    if (rw.delta != null) items.push(['trophy', (rw.delta >= 0 ? '+' : '') + rw.delta + ' rating', rw.delta >= 0 ? 'var(--cyan)' : 'var(--red)']);
    for (const [k, n] of Object.entries(rw.shards || {})) items.push(['hex', (unitDef(k)?.name || k) + ' shards ×' + n, 'var(--purple)']);
    if (rw.slotUnlocked) items.push(['plus', 'Squad slot ' + rw.slotUnlocked + ' unlocked', 'var(--gold)']);
    if (rw.companyLevelUp) items.push(['up', 'Company level ' + store.state.company.level, 'var(--gold)']);
    if (!items.length && !rw.cards?.length) loot.append(h('small.t-muted', win ? 'No payout' : 'No payout on a failed contract'));
    for (const [ic, txt, c] of items) {
      const i = icon(ic); i.style.color = c;
      loot.append(h('div.rs-item', i, h('b', txt)));
      snd.sfx('currency_tick');
      await wait(140);
    }
    for (const id of rw.cards || []) {
      const d = unitDef(id); if (!d) continue;
      const card = unitCard({ ...d, level: 1 }, { portraits });
      card.classList.add('rs-newcard');
      loot.append(h('div.rs-cardwrap', h('div.vp-tag.r-' + d.rarity, 'New recruit'), card));
      snd.sfx('card_flip');
      await wait(300);
    }
    for (const c of rw.chests || []) await chestReveal(c);
    chestsDone();
  })();
  let chestsDone; const afterChests = new Promise((r) => { chestsDone = r; });

  // after-action report: XP + per-unit combat stats from the sim result (result.stats keyed by sim id, uids maps id -> uid)
  const st = result?.stats || {}, uidOf = result?.uids || {};
  const idByUid = Object.fromEntries(Object.entries(uidOf).map(([id, uid]) => [uid, id]));
  const rows = B.player.units.map((u) => {
    const v = u.uid && store.view(u.uid); if (!v) return null;
    const sid = idByUid[u.uid]; const s = (sid && st[sid]) || null;
    return { u, v, sid, s, lost: sid && result?.lost?.includes(sid) };
  }).filter(Boolean);
  const maxDealt = Math.max(1, ...rows.map((r) => r.s?.dealt || 0));
  const mvp = rows.find((r) => r.sid && r.sid === result?.mvp && r.s && (r.s.dealt + r.s.healed + r.s.shielded) > 0);
  if (mvp) {
    const m = mvp.s, support = m.healed + m.shielded;
    const art = h('div.rs-mvp-art', h('div.ph', icon(mvp.v.role)));
    portraits.fill(art, mvp.v);
    mvpEl.append(h('div.rs-mvp.vp-panel.gold', { '--cut': '14px', dataset: { faction: mvp.v.rarity === 'legendary' ? 'legendary' : mvp.v.faction } }, art,
      h('div.grow', h('div.vp-kicker.t-gold', win ? 'MVP' : 'Top performer'), h('h2.vp-title', mvp.v.name),
        h('div.rs-mvp-stats', h('span', h('b', fmt(m.dealt)), ' dmg'), support > m.dealt * 0.4 ? h('span', h('b', fmt(support)), ' support') : null,
          m.kills ? h('span', h('b', m.kills), m.kills > 1 ? ' kills' : ' kill') : null))));
  }
  for (const r of rows) {
    const { v, s } = r;
    const lu = rw.levelUps?.find((x) => x.uid === r.u.uid);
    const xb = bar(0, 'gold');
    const th = h('div.rs-th', h('div.ph', icon(v.role)));
    portraits.fill(th, v);
    units.append(h('div.rs-u' + (r.lost ? '.lost' : ''), th,
      h('div.grow',
        h('div.row.between', h('b.rs-nm', v.name, r === mvp ? h('span.rs-mvptag', 'MVP') : null),
          h('small' + (lu ? '.t-gold' : ''), lu ? 'LEVEL UP ' + lu.from + '→' + lu.to : 'Lv' + v.level)),
        s ? h('div.rs-dmg', h('div.rs-dbar', h('i', { style: { width: (100 * (s.dealt || 0) / maxDealt).toFixed(1) + '%' } })), h('b', fmt(s.dealt || 0))) : null,
        s ? h('div.rs-sts', s.healed ? h('span.t-green', icon('heal'), fmt(s.healed)) : null, s.shielded ? h('span.t-cyan', icon('shield'), fmt(s.shielded)) : null,
          h('span.t-muted', icon('down'), fmt(s.taken || 0) + ' taken'), s.kills ? h('span', icon('target'), s.kills) : null, r.lost ? h('span.t-red', 'DOWN') : null) : null,
        xb)));
    setTimeout(() => setBar(xb, v.level >= v.cap ? 1 : v.xp / v.xpNext), 300);
  }
  if (rows.length && !rows.some((r) => r.s)) units.append(h('small.t-muted', 'No combat telemetry for a withdrawn squad'));

  // next actions
  const mi = found ? maps().indexOf(found.map) + 1 : 1;
  const nextLevel = found && win ? (() => { const L = found.map.levels; const i = L.indexOf(found.level); return L[i + 1] || maps()[mi]?.levels[0] || null; })() : null;
  if (B.kind === 'story') {
    acts.append(btn('Map', () => router.go('/map/' + mi), { icon: 'map' }),
      btn(win ? 'Replay' : 'Retry', () => router.go('/formation/' + B.levelId), { icon: 'swap' }));
    if (!win) acts.append(btn('Barracks', () => router.go('/squad'), { cls: 'primary', icon: 'up' }));
    else if (nextLevel) acts.append(btn('Next', () => router.go('/map/' + (maps().findIndex((m) => m.levels.includes(nextLevel)) + 1) + '?level=' + nextLevel.id), { cls: 'primary', icon: 'play' }));
  } else acts.append(btn('Continue', () => router.go(B.kind === 'event' ? '/events' : '/' + (B.kind || 'hub')), { cls: 'primary' }));

  if (B.kind === 'story' && rw.firstClear && found?.level.story?.post && !R.postShown) { R.postShown = true; afterChests.then(() => setTimeout(() => playScene(found.level.story.post), 900)); }
  return { topbar: false, bg: 'on' };
}

// map star chest: the chest drops in, the lid pops, rewards rise out; tap to continue
function chestReveal(c) {
  const map = maps().find((m) => m.id === c.mapId);
  return new Promise((done) => {
    const ov = h('div.cr-wrap',
      h('div.cr-rays'),
      h('div.cr-chest', h('div.cr-lid'), h('div.cr-box', icon('star')), h('div.cr-glow')),
      h('div.cr-txt', h('div.vp-kicker.t-gold', (map?.name || 'Map') + ' · ' + c.stars + ' ★'), h('h2.vp-title', 'Star chest opened')),
      h('div.cr-loot', rewardChips(c.rewards)),
      h('small.cr-tap', 'Tap to continue'));
    document.getElementById('overlay-root').appendChild(ov);
    snd.sfx('ui_open');
    setTimeout(() => { ov.classList.add('open'); snd.sfx('rarity_reveal', { rarity: 'epic' }); }, 650);
    setTimeout(() => { ov.classList.add('loot'); snd.sfx('reward'); }, 1000);
    const close = () => { ov.classList.add('gone'); setTimeout(() => { ov.remove(); done(); }, 250); };
    setTimeout(() => ov.addEventListener('click', close, { once: true }), 900);
  });
}
