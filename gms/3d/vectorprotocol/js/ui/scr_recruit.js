// Recruitment: contract banners -> drop reveal (pod charge, rarity tease, burst, card flip).
import { h, fmt, wait } from './dom.js';
import { icon } from './icons.js';
import { data, unitDef, levelById } from '../app/data.js';
import { btn, header, unitCard } from './components.js';
import { snd } from '../app/sound.js';

const RC = { common: 'var(--f-common)', rare: 'var(--f-rare)', epic: 'var(--f-epic)', legendary: 'var(--f-legendary)' };
const CUR_ICON = { credits: 'credits', chips: 'cores', scrap: 'scrap', arena_tokens: 'token', event_marks: 'flag' };

function unlockText(store, key) {
  const lid = store.unlockLevelFor(key), l = lid && levelById(lid);
  return 'Unlocks after ' + (l ? l.map.name + ' · ' + l.level.name : 'more story progress');
}

export function mount(root, ctx) {
  const { store, router, portraits } = ctx;
  const banners = Object.values(data().recruit || {});
  root.append(header('Recruitment', () => router.go('/hub')),
    h('div.rc-list.scroll', banners.map((b) => {
      const [cur, cost] = Object.entries(store.recruitCost(b.id) || b.cost)[0];
      const rift = b.id === 'rift' || b.realm === 'fantasy';
      const elite = !rift && ((b.rates?.legendary || 0) >= 0.02 || (b.rates?.common || 0) === 0);
      const pool = rift ? riftPool(store) : null;
      return h('div.rc-banner.vp-panel' + (elite ? '.gold' : '') + (rift ? '.rift' : ''), { '--cut': rift ? '0px' : '18px' },
        rift ? h('div.rc-art.rift', h('div.rc-gate'), h('div.rc-runes')) : h('div.rc-art', h('div.rc-pod'), h('div.rc-beam')),
        h('div.rc-body',
          h('div.vp-kicker', b.kicker || (rift ? 'Beyond the Rift' : b.featured ? 'Featured' : elite ? 'Elite contract' : 'Contract')), h('h2.vp-title', b.name),
          pool ? h('div.rc-pool', pool.length ? pool.map((d) => h('span', { style: { color: RC[d.rarity] } }, d.name)) : h('small', 'No one answers yet. Clear Rift contracts to open the gate to its warriors.')) : null,
          h('div.rc-rates', Object.entries(b.rates).filter(([, p]) => p > 0).map(([r, p]) => h('span', { style: { color: RC[r] } }, r + ' ' + (p * 100).toFixed(p < 0.01 ? 1 : 0) + '%'))),
          b.pity ? h('small.t-muted', 'Guaranteed ' + Object.entries(b.pity).map(([r, n]) => r + ' within ' + n).join(', ')) : null,
          store.isUnlocked(b.unlock) ? h('div.rc-btns',
            btn('×1 · ' + fmt(cost), () => pull(b), { cls: elite || rift ? 'gold primary' : 'primary', icon: CUR_ICON[cur] || 'credits', disabled: pool && !pool.length }),
            btn('×' + MULTI + ' · ' + fmt(cost * MULTI), () => pullMany(b, MULTI), { cls: 'rc-multi' + (elite || rift ? ' gold' : ''), icon: CUR_ICON[cur] || 'credits', disabled: pool && !pool.length }))
            : btn('Locked', () => ctx.toast(unlockText(store, b.unlock), 'err', 3), { icon: 'lock' })));
    })));

  async function pull(b) {
    const res = store.recruit(b.id);
    if (!res.ok) return ctx.toast(res.why || 'Cannot recruit', 'err');
    await reveal(ctx, res, () => pull(b), { rift: isRift(b) });
  }
  async function pullMany(b, n) {
    const res = store.recruitMany(b.id, n);
    if (!res.ok) return ctx.toast(res.why === 'Not enough resources' ? 'Not enough for ' + n + ' contracts' : res.why || 'Cannot recruit', 'err');
    await revealMany(ctx, res.pulls, () => pullMany(b, n), { rift: isRift(b) });
  }
  return { topbar: true, bg: 'on' };
}

const MULTI = 10;
const isRift = (b) => b.id === 'rift' || b.realm === 'fantasy';
// the reveal's centrepiece: a sci-fi drop pod, or for the Rift a stone gate whose runes light and whose portal opens
const RUNES = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺ';
function revealArt(rift) {
  if (!rift) return h('div.rv-pod', h('i'), h('i'), h('i'));
  return h('div.rv-gate',
    h('div.rvg-arch'), h('div.rvg-portal', h('i.swirl'), h('i.core')),
    h('div.rvg-runes', [...RUNES].map((r, i) => h('span', { '--i': i, '--a': (-80 + i * 20) + 'deg' }, r))),
    h('div.rvg-base'));
}
function riftPool(store) {
  let ids = [];
  try { ids = store.game?.bannerPool?.('rift') || []; } catch (e) { ids = []; }
  return ids.map(unitDef).filter(Boolean);
}
const rarSfx = (r) => { snd.sfx('rarity_reveal', { rarity: r }); if (r === 'epic' || r === 'legendary') snd.sting('reveal'); };
const TIER = ['common', 'rare', 'epic', 'legendary'];

// x10 reveal: one pod charge up to the best rarity, then the cards flip in on a grid (best last), tap one for its profile
export async function revealMany(ctx, pulls, again, { rift = false } = {}) {
  const { portraits, router } = ctx;
  const best = pulls.reduce((m, p) => Math.max(m, TIER.indexOf(unitDef(p.def)?.rarity)), 0);
  const ov = h('div.rv-wrap.multi' + (rift ? '.rift' : ''), { '--rv': rift ? '#8ff0d0' : 'var(--cyan)' });
  const pod = revealArt(rift);
  const stage = h('div.rv-stage', h('div.rv-rays'), pod);
  const skip = h('button.rv-skip', { type: 'button' }, 'Tap to skip');
  ov.append(stage, skip);
  document.getElementById('overlay-root').appendChild(ov);
  let skipped = false;
  ov.addEventListener('click', () => { skipped = true; });
  const w = (ms) => skipped ? Promise.resolve() : wait(ms);
  ov.classList.add('charge');
  requestAnimationFrame(() => ov.classList.add('open'));
  await w(rift ? 900 : 600);
  for (const t of TIER.slice(1, best + 1)) { ov.style.setProperty('--rv', RC[t]); ov.classList.remove('tease'); void ov.offsetWidth; ov.classList.add('tease'); await w(450); }
  ov.style.setProperty('--rv', RC[TIER[best]]);
  ov.classList.add('burst');
  rarSfx(TIER[best]);
  await w(320);
  skip.remove();
  const order = pulls.map((p, i) => ({ p, i, r: TIER.indexOf(unitDef(p.def)?.rarity) }));
  const grid = h('div.rv-grid');
  const newCount = pulls.filter((p) => !p.dupe).length;
  stage.replaceChildren(h('div.rv-rays'), h('div.rv-flash'),
    h('div.rv-name', h('div.vp-kicker', pulls.length + ' contracts signed'), h('h2.vp-title', newCount ? newCount + ' new unit' + (newCount > 1 ? 's' : '') : 'All duplicates')), grid);
  order.forEach(({ p, r }, k) => {
    const d = unitDef(p.def);
    const card = unitCard({ ...d, level: 1 }, { portraits, onclick: () => { if (p.uid) { ov.remove(); router.go('/unit/' + p.uid); } } });
    card.classList.add('rv-mcard');
    card.style.animationDelay = (skipped ? 0 : k * 0.09) + 's';
    if (!skipped) setTimeout(() => snd.sfx('card_flip'), k * 90);
    if (r >= 2) card.classList.add('hi');
    grid.append(h('div.rv-cell', card, h('small.' + (p.dupe ? 'dupe' : 'new'), p.dupe ? '+' + p.shards + ' shards' : 'NEW')));
  });
  const acts = h('div.rv-acts',
    btn('Done', () => ov.remove()),
    again ? btn('Again ×' + pulls.length, () => { ov.remove(); again(); }, { cls: 'primary' }) : null);
  ov.append(acts);
  ov.classList.add('done');
}

export async function reveal(ctx, res, again, { rift = false } = {}) {
  const { portraits, router } = ctx;
  const d = unitDef(res.def);
  const col = RC[d.rarity];
  const ov = h('div.rv-wrap' + (rift ? '.rift' : ''), { '--rv': rift ? '#8ff0d0' : 'var(--cyan)' });
  const pod = revealArt(rift);
  const stage = h('div.rv-stage', h('div.rv-rays'), pod);
  const skip = h('button.rv-skip', { type: 'button' }, 'Tap to skip');
  ov.append(stage, skip);
  document.getElementById('overlay-root').appendChild(ov);
  let skipped = false;
  ov.addEventListener('click', () => { skipped = true; });
  const w = (ms) => skipped ? Promise.resolve() : wait(ms);
  ov.classList.add('charge');
  requestAnimationFrame(() => ov.classList.add('open'));
  await w(rift ? 1000 : 700);
  // rarity tease: climb through the tiers up to the result
  const tiers = ['common', 'rare', 'epic', 'legendary'];
  for (const t of tiers.slice(1, tiers.indexOf(d.rarity) + 1)) { snd.sfx('ui_open'); ov.style.setProperty('--rv', RC[t]); ov.classList.remove('tease'); void ov.offsetWidth; ov.classList.add('tease'); await w(550); }
  ov.style.setProperty('--rv', col);
  ov.classList.add('burst');
  rarSfx(d.rarity);
  await w(380);
  snd.sfx('card_flip');
  skip.remove();
  const card = unitCard({ ...d, level: 1 }, { portraits });
  card.classList.add('rv-card');
  stage.replaceChildren(h('div.rv-rays'), h('div.rv-flash'), card,
    h('div.rv-name', h('span.vp-tag.r-' + d.rarity, d.rarity), h('h2.vp-title', d.name), h('small', d.title || (d.role + ' · ' + d.faction))),
    h('div.rv-dupe', res.dupe ? '+' + res.shards + ' shards (duplicate)' : 'New unit joined the company'));
  const acts = h('div.rv-acts',
    btn('Done', () => ov.remove()),
    btn('View', () => { ov.remove(); router.go('/unit/' + res.uid); }),
    again ? btn('Again', () => { ov.remove(); again(); }, { cls: 'primary' }) : null);
  ov.append(acts);
  ov.classList.add('done');
}
