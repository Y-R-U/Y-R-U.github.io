// Workshop (D28): company fabrication, nothing tied to one unit. Buff fabrication, the shard exchange, a scrap overview,
// and a locked gear-chip bay. Unit levels / ranks / abilities stay in the unit profile (Barracks).
import { h, fmt } from './dom.js';
import { icon } from './icons.js';
import { data, levelById } from '../app/data.js';
import { header, btn, confirmBox } from './components.js';
import { snd } from '../app/sound.js';
import { hint } from './tutorial.js';

const BUFF_IC = { stim: 'sword', plate: 'shield', cap: 'overdrive', shield: 'shield', aim: 'target', overclock: 'bolt' };
const buffIcon = (b) => BUFF_IC[b.icon] || (b.mods?.hp || b.mods?.dr ? 'shield' : b.mods?.charge ? 'overdrive' : 'up');
const CUR_IC = { credits: 'credits', scrap: 'scrap', chips: 'cores', arena_tokens: 'token' };

export function mount(root, ctx) {
  const { store, router } = ctx;
  const unlockText = (key) => {
    const l = levelById(store.unlockLevelFor(key) || key);
    return l ? 'Unlocks after ' + l.map.name + ' · ' + (l.level.node ?? '') + ' ' + l.level.name : 'Unlocks with story progress';
  };
  const bay = (n, title, sub, cls, ...kids) => h('section.ws-bay' + (cls ? '.' + cls : ''), { dataset: { bay: n } },
    h('div.ws-bay-h', h('span.ws-no', 'BAY ' + String(n).padStart(2, '0')), h('div.grow', h('b', title), sub ? h('small', sub) : null)), ...kids);

  const fabEl = h('div.ws-fab');
  const exEl = h('div.ws-ex');
  const scrapEl = h('div.ws-scrap');
  const footEl = h('div.ws-foot');
  const body = h('div.ws-body.scroll',
    h('div.ws-intro', icon('wrench'), h('div.grow', h('b', 'Company fabrication'), h('small', 'Buffs and shard exchange for the whole company. Robots level up, rank up and train in the Barracks.'))),
    h('div.ws-col.a', bay(1, 'Combat buffs', 'Fabricate here · arm one per battle', 'fab', fabEl)),
    h('div.ws-col.b',
      bay(2, 'Shard exchange', 'Surplus shards → chips', 'ex', exEl),
      bay(3, 'Scrap', 'Robot fuel: 1 scrap = 1 XP', 'scrap', scrapEl),
      h('section.ws-bay.locked-bay', { dataset: { bay: 4 } },
        h('div.ws-bay-h', h('span.ws-no', 'BAY 04'), h('div.grow', h('b', 'Gear chips'), h('small', 'Fabrication line offline'))),
        h('div.ws-shutter', h('div.ws-lock', icon('lock')), h('div', h('b', 'Coming soon'), h('small', 'Socketable gear chips will be built here.'))))));
  root.append(header('Workshop', () => router.back('/hub')), body, footEl);

  function renderFab() {
    if (!store.isUnlocked('buffs')) {
      fabEl.replaceChildren(h('div.ws-shutter.sm', h('div.ws-lock', icon('lock')), h('div', h('b', 'Buff line sealed'), h('small', unlockText('buffs')))));
      return;
    }
    const sel = store.state.selectedBuff;
    fabEl.replaceChildren(...Object.values(data().buffs || {}).map((b) => {
      const n = store.state.buffs?.[b.id] || 0;
      const open = store.isUnlocked(b.unlock);
      const [cur, cost] = Object.entries(b.cost || {})[0] || [];
      const armed = sel === b.id;
      const make = cur && open ? btn(fmt(cost), () => {
        const r = store.buyBuff(b.id);
        if (!r.ok) return ctx.toast(r.why, 'err');
        snd.sfx('reward'); ctx.toast(b.name + ' fabricated', 'gold'); render();
      }, { cls: 'gold', icon: CUR_IC[cur] || 'credits', disabled: !store.canAfford(b.cost), sfx: 'none' }) : null;
      const arm = n ? btn(armed ? 'Armed' : 'Arm', () => {
        const r = store.selectBuff(armed ? null : b.id);
        if (!r.ok) return ctx.toast(r.why, 'err');
        render();
      }, { cls: armed ? 'primary' : '', icon: armed ? 'check' : 'play' }) : null;
      return h('div.ws-unit' + (armed ? '.armed' : '') + (open ? '' : '.sealed'), { dataset: { buff: b.id } },
        h('div.ws-port', icon(open ? buffIcon(b) : 'lock'), h('span.ws-stock', '×' + n)),
        h('div.ws-txt', h('b', b.name), h('small', (b.desc || '').replace(/\s*\([^)]*only\)/, '')),
          !open ? h('small.t-muted', unlockText(b.unlock)) : !cur ? h('small.t-muted', 'Raid and arena-shop drop only') : null),
        h('div.ws-acts', make, arm));
    }));
  }

  function renderEx() {
    const rate = data().economy?.shardExchange?.rate || {};
    const list = store.roster().filter((v) => v.surplusShards > 0).sort((a, b) => b.surplusShards - a.surplusShards);
    const tot = store.surplusTotal();
    exEl.replaceChildren(...[
      h('div.ws-rates', ['common', 'rare', 'epic', 'legendary'].filter((r) => rate[r] != null).map((r) =>
        h('span.ws-rate.r-' + r, h('i'), r, h('b', rate[r])))),
      list.length > 1 ? btn('Convert all · ' + fmt(tot.chips) + ' chips', convertAll, { cls: 'gold primary', icon: 'cores', sfx: 'none' }) : null,
      ...(list.length ? list.map((v) => {
        const chips = Math.floor(v.surplusShards * (v.shardValue?.chips ?? 1));
        return h('div.ws-exrow', icon(v.role || 'hex'), h('div.grow', h('b', v.name), h('small', v.surplusShards + ' surplus · ' + fmt(chips) + ' chips')),
          btn('Convert', async () => {
            if (!await confirmBox('Convert shards?', 'Turn ' + v.surplusShards + ' surplus ' + v.name + ' shards into ' + fmt(chips) + ' chips. This can\'t be undone.', 'Convert', 'Keep')) return;
            const r = store.convertShards(v.id);
            if (!r.ok) return ctx.toast(r.why, 'err');
            snd.sfx('currency_tick'); snd.sfx('reward');
            ctx.toast('+' + fmt(r.gained?.chips || 0) + ' chips from ' + r.shards + ' shards', 'gold'); render();
          }, { cls: 'gold', icon: 'cores', sfx: 'none' }));
      }) : [h('div.ws-empty', icon('hex'), h('small', 'No surplus yet. Shards a unit no longer needs to reach max rank land here. Shards of units you don\'t own stay banked for a future recruit.'))])].filter(Boolean));
  }
  async function convertAll() {
    const sp = store.surplusTotal();
    if (!await confirmBox('Convert all surplus?', sp.shards + ' surplus shards become ' + fmt(sp.chips) + ' chips. This can\'t be undone.', 'Convert', 'Keep')) return;
    const r = store.convertAllShards();
    if (!r.ok) return ctx.toast(r.why, 'err');
    snd.sfx('reward'); ctx.toast('+' + fmt(r.gained?.chips || 0) + ' chips', 'gold'); render();
  }

  function renderScrap() {
    const eco = data().economy || {};
    const have = store.state.cur.scrap || 0;
    let need = 0;
    for (const v of store.squad()) { const c = store.levelUpCost(v.uid); if (c && !c.capped) need += c.scrap || 0; }
    const src = [
      ['map', 'Every contract', 'story battles, more on elite and boss nodes', true],
      ['calendar', 'Salvage Run', 'daily Special Op, the big scrap payout', store.isUnlocked('daily_ops'), 'daily_ops'],
      ['trophy', 'Arena', 'wins pay scrap; Scrap crate in the arena shop', store.isUnlocked('arena'), 'arena'],
    ];
    scrapEl.replaceChildren(
      h('div.ws-gauge', h('div', h('small', 'In stock'), h('b', icon('scrap'), fmt(have))),
        h('div', h('small', 'Squad\'s next levels'), h('b', need ? fmt(need) : '—'))),
      h('small.ws-note', 'Feed it to robots in the Barracks: open a unit, tap Level up. Each XP also costs ' + (eco.levelCost?.creditsPerXp ?? 0.3) + ' credits.'),
      h('div.ws-src', src.map(([ic, t, s, on, key]) => h('div' + (on ? '' : '.off'), icon(on ? ic : 'lock'), h('div', h('b', t), h('small', on ? s : unlockText(key)))))));
  }

  function renderFoot() {
    const b = data().buffs?.[store.state.selectedBuff];
    footEl.replaceChildren(
      h('div.ws-load', h('small', 'Next battle'), b ? h('b.t-gold', icon(buffIcon(b)), b.name) : h('b.t-muted', 'No buff armed')),
      h('small.ws-fnote', 'Levels, ranks and abilities'),
      btn('Barracks', () => router.go('/squad'), { cls: 'primary', icon: 'squad' }));
  }

  function render() { renderFab(); renderEx(); renderScrap(); renderFoot(); }
  render();
  const off = store.on((what) => { if (what !== 'settings') render(); });
  hint(store, 'workshop', body.querySelector('.ws-intro'), 'The Workshop fabricates for the whole company: combat buffs and the shard exchange. Robots level up in the Barracks.', { place: 'below', delay: 500 });
  return { topbar: true, bg: 'on', unmount: off };
}
