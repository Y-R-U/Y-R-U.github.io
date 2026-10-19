// Unit profile: 3D turntable (robots' createTurntable) in the upper half, stats + upgrades below.
import { h, fmt } from './dom.js';
import { icon, roleBadge, abilityIcon } from './icons.js';
import { ability } from '../app/data.js';
import { btn, bar, header, confirmBox } from './components.js';
import { hint } from './tutorial.js';
import { snd } from '../app/sound.js';
import { featureOpen } from './scr_hub.js';

const FACTION_NAME = { corporate: 'Corporate', rogue: 'Rogue', experimental: 'Experimental' };

export function abilityDesc(ab, level = 1) {
  if (!ab) return '';
  const e0 = (ab.effects || [])[0] || {};
  const per = ab.perLevel || {};
  const mult = (e0.mult || 0) + (per.mult || 0) * (level - 1);
  const vals = { mult: Math.round(mult * 100), duration: e0.duration, chance: Math.round((e0.chance ?? 1) * 100), amount: e0.amount ?? Math.round((e0.pctMax || 0) * 100) };
  if (ab.desc) return ab.desc.replace(/\{(\w+)\}/g, (_, k) => vals[k] ?? '?');
  // generated fallback
  const parts = [];
  const tgt = ab.target?.pick ? ({ lane: 'the lane target', all: 'all', lowest_hp: 'the weakest', lowest_hp_ally: 'the weakest ally', backline: 'the backline', frontline: 'the frontline', random: 'random targets', lane_all: 'the whole lane', self: 'self' })[ab.target.pick] || ab.target.pick : '';
  for (const e of ab.effects || []) {
    const m = Math.round(((e.mult || 0) + (per.mult || 0) * (level - 1)) * 100);
    if (e.type === 'damage') parts.push(`Deals ${m}% ATK to ${ab.target?.side === 'enemy' ? (tgt.startsWith('all') ? 'all enemies' : tgt) : tgt}${e.pierce ? ', ignoring armour' : ''}`);
    else if (e.type === 'heal') parts.push(e.pctMax ? `Repairs ${Math.round(e.pctMax * 100)}% max HP` : `Repairs ${m}% ATK`);
    else if (e.type === 'shield') parts.push(e.pctMax ? `Shields for ${Math.round(e.pctMax * 100)}% max HP` : `Shields ${tgt === 'all' ? 'all allies' : tgt} for ${m}% ATK`);
    else if (e.type === 'status') parts.push(`applies ${e.status}${e.duration ? ' (' + e.duration + 's)' : ''}`);
    else if (e.type === 'charge') parts.push(e.amount < 0 ? `drains ${-e.amount} Overdrive charge` : `grants ${e.amount} charge`);
    else if (e.type === 'cleanse') parts.push('cleanses a debuff');
    else if (e.type === 'mods') parts.push('boosts stats briefly');
  }
  if (ab.trigger && ab.trigger !== 'aura') parts.unshift(({ battle_start: 'At battle start', wave_start: 'Each round', on_kill: 'On kill', on_crit: 'On crit', low_hp: 'Below ' + Math.round((ab.threshold || 0.4) * 100) + '% HP', every_n: 'Every ' + (ab.n || 3) + ' attacks', interval: 'Every ' + (ab.every || 5) + 's', on_hit: 'On hit', on_damaged: 'When damaged' })[ab.trigger] || ab.trigger);
  if (ab.trigger === 'aura' && ab.aura?.mods) parts.push('Aura: ' + Object.entries(ab.aura.mods).map(([k, v]) => '+' + Math.round(v * 100) + '% ' + k.toUpperCase()).join(', '));
  return parts.join(' — ').replace(/^(\w)/, (c) => c.toUpperCase()) + '.';
}

export async function mount(root, ctx, route) {
  const { store, router, engine, units, portraits } = ctx;
  const uid = route.args[0];
  if (!store.unit(uid)) { router.go('/squad', { replace: true }); return {}; }
  let scene = null;
  const v0 = store.view(uid);
  if (engine && units?.createTurntable) {
    try {
      scene = units.createTurntable(engine, { model: v0.model, rarity: v0.rarity, faction: v0.rarity === 'legendary' ? 'legendary' : v0.faction, seed: 1, quality: engine.quality?.name });
      // shift the subject into the upper ~45% of the column (the info sheet covers the rest)
      const r0 = scene.resize?.bind(scene);
      scene.resize = (w, hh) => {
        r0?.(w, hh);
        const cam = scene.camera; if (!cam?.setViewOffset) return;
        // portrait: subject in the top 38 %; landscape (w/h >= 1): subject centred in the left 46 % stage, beside the sheet
        if (w / hh >= 1) { cam.zoom = 0.85; cam.setViewOffset(w, hh, w * 0.27, -hh * 0.03, w, hh); }
        else { cam.zoom = 0.6; cam.setViewOffset(w, hh, 0, hh * 0.27, w, hh); }
        cam.updateProjectionMatrix();
      };
    } catch (e) { console.warn('[unit] turntable failed', e); scene = null; }
  }

  const stage = h('div.up-stage', scene ? null : h('div.up-fallback'));
  if (!scene) { const art = stage.firstChild; art.append(h('div.ph', icon(v0.role))); portraits.fill(art, v0); }
  const info = h('div.up-sheet.vp-panel', { '--cut': '16px' });
  root.append(header('', () => router.back('/squad')), stage, info);
  // drag to spin the turntable
  if (scene) dragSpin(stage, scene);

  function render() {
    const v = store.view(uid);
    const lc = store.levelUpCost(uid), rc = store.rankUpCost(uid);
    const S = v.stats;
    const fac = v.rarity === 'legendary' ? 'legendary' : v.faction;
    info.dataset.faction = fac;
    info.replaceChildren(
      h('div.up-title', roleBadge(v.role), h('div.grow', h('h2.vp-title', v.name), h('div.up-sub', h('span.vp-tag.r-' + v.rarity, v.rarity), ' ', h('span.fac', FACTION_NAME[v.faction] || v.faction), ' · ', h('span', v.role))),
        h('div.up-pow', h('small', 'Power'), h('b', fmt(v.power)))),
      v.fantasy || v.title ? h('div.up-flavour', v.title ? h('b', v.title) : null, v.fantasy ? h('span', ' — ' + v.fantasy) : null) : null,
      h('div.up-rank', Array.from({ length: (v.maxRank ?? 5) + 1 }, (_, i) => h('span' + (i <= v.rank ? '.on' : ''), icon('star'))),
        h('span.grow'), rc ? h('small', 'Shards ' + v.shards + '/' + rc.shards) : h('small.t-gold', 'MAX RANK')),
      v.surplusShards > 0 ? h('div.up-surplus', icon('hex'), h('div.grow', h('b', v.surplusShards + ' surplus shard' + (v.surplusShards > 1 ? 's' : '')),
        h('small', (rc ? 'More than this unit needs to reach max rank' : 'Max rank: these shards have no further use') + ' · worth ' + fmt(Math.floor(v.surplusShards * (v.shardValue?.chips ?? 1))) + ' chips')),
        // D28: the shard exchange is the Workshop's; convert in place only while the Workshop is still locked
        featureOpen(store, 'workshop') ? btn('Exchange', () => router.go('/workshop'), { cls: 'gold sm', icon: 'wrench', id: 'up-convert' }) : btn('Convert', async () => {
          const chips = Math.floor(v.surplusShards * (v.shardValue?.chips ?? 1));
          if (!await confirmBox('Convert shards?', 'Turn ' + v.surplusShards + ' surplus ' + v.name + ' shards into ' + fmt(chips) + ' chips. This can\'t be undone.', 'Convert', 'Keep')) return;
          const r = store.convertShards(v.id);
          if (!r.ok) return ctx.toast(r.why, 'err');
          snd.sfx('currency_tick'); snd.sfx('reward');
          ctx.toast('+' + fmt(r.gained?.chips || 0) + ' chips from ' + r.shards + ' shards', 'gold'); render();
        }, { cls: 'gold sm', icon: 'cores', id: 'up-convert', sfx: 'none' })) : '',
      h('div.up-lvl', h('b', 'Lv ' + v.level), h('small', '/ ' + v.cap), h('div.grow', bar(v.level >= v.cap ? 1 : v.xp / v.xpNext, 'gold')), h('small', v.level >= v.cap ? 'CAP' : v.xp + '/' + v.xpNext)),
      h('div.up-stats',
        stat('HP', S.hp, 'heal'), stat('ATK', S.atk, 'sword'), stat('DEF', S.def, 'shield'), stat('RATE', S.spd + 's', 'ffwd'), stat('CRIT', Math.round(S.crit * 100) + '%', 'target')),
      h('div.up-acts',
        btn(lc.capped ? 'Level cap' : 'Level up', () => act(store.levelUp(uid), 'Level up!'), { cls: 'primary', sfx: 'none', disabled: lc.capped, icon: 'up', id: 'up-level' }),
        h('div.up-cost', lc.capped ? h('small.t-muted', 'Rank up to raise the cap') : [h('span', icon('scrap'), fmt(lc.scrap)), h('span', icon('credits'), fmt(lc.credits))]),
        // rank up needs the level cap first (QA Q18): disabled until then, the cost row says why
        btn('Rank up', () => act(store.rankUp(uid), 'Rank up!'), { cls: 'gold', disabled: !rc || v.shards < rc.shards || v.level < v.cap, icon: 'star', sfx: !rc || v.shards < rc.shards || v.level < v.cap ? undefined : 'none' }),
        rc ? (v.level < v.cap ? h('div.up-cost', h('small.t-muted', 'Reach Lv ' + v.cap + ' first'))
          : v.shards >= rc.shards && (store.state.cur.credits || 0) < rc.credits ? h('div.up-cost', h('small.t-gold', 'Save ' + fmt(rc.credits - (store.state.cur.credits || 0)) + ' more credits'))
          : h('div.up-cost', h('span', icon('hex'), rc.shards), h('span', icon('credits'), fmt(rc.credits)))) : h('div.up-cost', h('small.t-muted', 'Max rank'))),
      h('div.vp-kicker', 'Abilities'),
      h('div.up-abs', ['attack', 'passive', 'overdrive'].map((k) => {
        const ab = ability(v[k]);
        const lv = v.ab?.[k] || 1;
        const c = store.abilityCost(uid, k);
        return h('div.up-ab' + (k === 'overdrive' ? '.od' : ''),
          h('div.up-abic', icon(abilityIcon(ab))),
          h('div.grow', h('div.row.between', h('b', ab?.name || k), h('small.t-muted', ({ attack: 'Basic', passive: 'Passive', overdrive: 'Overdrive' })[k] + ' · Lv' + lv)),
            h('p', abilityDesc(ab, lv))),
          c ? btn(null, async () => {
            const ok = await ctx.modal({ title: 'Train ' + (ab?.name || k), body: 'Lv' + lv + ' → Lv' + (lv + 1) + ' for ' + fmt(c.credits) + ' credits' + (c.chips ? ' + ' + c.chips + ' chips' : '') + '.', actions: [{ label: 'Cancel', value: false }, { label: 'Train', value: true, cls: 'primary' }] });
            if (ok) act(store.abilityUp(uid, k), 'Ability trained');
          }, { cls: 'sm', icon: 'up', disabled: c.capped }) : h('small.t-gold', 'MAX'));
      })));
  }
  function stat(k, val, ic) { return h('div.up-stat', icon(ic), h('small', k), h('b', typeof val === 'number' ? fmt(val) : val)); }
  function act(res, okMsg) {
    if (!res.ok) { ctx.toast(res.why || 'Not possible', 'err'); return; }
    ctx.toast(okMsg, 'gold');
    snd.sfx(okMsg.startsWith('Level') ? 'level_up' : 'reward');
    if (okMsg.startsWith('Level')) scene?.unit?.play?.('victory', { loop: false });
    render();
  }
  render();
  hint(store, 'levelup', '#up-level', 'Level up with scrap and credits. When a robot hits its level cap, rank it up with shards from duplicates.', { delay: 700 });
  return { scene, topbar: false, bg: scene ? 'off' : 'on' };
}

function dragSpin(el, scene) {
  let x0 = null, base = 0;
  const target = () => scene.unit?.root || scene.scene?.children?.find((c) => c.isGroup);
  el.addEventListener('pointerdown', (e) => { x0 = e.clientX; base = target()?.rotation.y || 0; el.setPointerCapture(e.pointerId); scene.spinPaused = true; });
  el.addEventListener('pointermove', (e) => { if (x0 == null) return; const t = target(); if (t) t.rotation.y = base + (e.clientX - x0) * 0.012; });
  const end = () => { x0 = null; scene.spinPaused = false; };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}
