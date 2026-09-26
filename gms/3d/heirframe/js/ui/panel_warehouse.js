import { esc, fmt, onTap, haptic, SLOTS, statLabel, fmtStat, RARITY } from './core.js';
import { icon } from './icons.js';
import { framePortrait } from './portrait.js';
import { frameFigure } from './figure.js';
import { itemTile, itemCardHTML } from './itemcard.js';

const KIND = { rental: 'Rental', brawler: 'Brawler', gunner: 'Gunner', ghost: 'Ghost' };
const BLURB = {
  rental: 'Hourly-rate chassis. Scuffed, underpowered, cheerfully insured.',
  brawler: 'Melee tank. Wades in, soaks damage, makes things fly.',
  gunner: 'Ranged fire platform. Keeps threats at the far end of the boulevard.',
  ghost: 'Stealth, hacking and precision. Invisible, lethal, fragile.',
};
const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI'];
const MATS = [['scrap', 'Scrap Alloy'], ['circuitry', 'Circuitry'], ['flux', 'Flux Cells'], ['shards', 'Heir Shards']];
const TABS = [['loadout', 'Loadout', 'chassis'], ['frames', 'Frames', 'warehouse'], ['fabricator', 'Fabricator', 'upgrade']];

const slotsOf = (f, all) => f.slotsAllowed || (f.rental ? ['weapon', 'chip'] : all);
const better = (it, eq) => it.fr != null && (!eq || (eq.fr != null && it.fr > eq.fr));

export function warehousePanel(body, data, ctx) {
  const st = ctx.state;
  const frames = data.frames || [];
  st.tab ||= data.tab || 'loadout';
  st.frame ||= data.active || frames[0]?.id;
  if (!frames.find(f => f.id === st.frame)) st.frame = frames[0]?.id;
  st.filter ||= 'all';
  const allSlots = ctx.slots || SLOTS;
  const emit = (e, p) => { haptic(); ctx.bus.emit('sfx', 'click'); ctx.bus.emit(e, p); };

  ctx.extra.innerHTML = `<div class="wh-tabs">${TABS.map(([id, l, ic]) => `<button class="wh-tab hf-live ${st.tab === id ? 'on' : ''}" data-tab="${id}">${icon(ic)}<span>${l}</span></button>`).join('')}</div>
    <div class="hf-credits pn-cred"><span class="ci">${icon('credits')}</span><span class="cv hf-num hf-gold-text">${fmt(data.credits || 0)}</span></div>`;
  ctx.extra.querySelectorAll('.wh-tab').forEach(b => onTap(b, () => { st.tab = b.dataset.tab; ctx.bus.emit('sfx', 'click'); ctx.rerender(); }));

  if (st.tab === 'frames') return framesTab(body, data, ctx, emit);
  if (st.tab === 'fabricator') return fabTab(body, data, ctx, emit);

  const f = frames.find(x => x.id === st.frame) || {};
  const allowed = slotsOf(f, allSlots);
  const sl = f.slots || {};
  const bayHtml = frames.map(fr => `<button class="wh-bay hf-live ${fr.id === st.frame ? 'sel' : ''} ${fr.id === data.active ? 'active' : ''} k-${fr.kind}" data-f="${esc(fr.id)}">
      <div class="wb-p">${framePortrait(fr.kind, fr.seed || 3)}</div>
      <div class="wb-t"><b>${esc(fr.name)}</b><span>${fr.rental ? 'Rental' : `Mk ${ROMAN[fr.mk || 1]}`}${fr.fr != null ? ` · FR ${fr.fr}` : ''}</span></div>
      ${fr.id === data.active ? '<i class="wb-on">Active</i>' : ''}
    </button>`).join('') + (data.shop?.length ? `<button class="wh-bay empty hf-live" data-go="frames"><div class="wb-p">${icon('plus')}</div><div class="wb-t"><b>Acquire frame</b><span>${data.shop.length} available</span></div></button>` : '');

  const slotHtml = (s, side) => {
    const locked = !allowed.includes(s);
    return `<button class="wh-slot hf-live ${side} ${locked ? 'locked' : ''}" data-slot="${s}">
      ${locked ? `<div class="hf-tile empty lk"><span class="ti">${icon('lock')}</span></div>` : sl[s] ? itemTile(sl[s]) : `<div class="hf-tile empty"><span class="ti">${icon(s)}</span></div>`}
      <span class="ws-l">${s}</span></button>`;
  };
  const half = Math.ceil(allSlots.length / 2);
  const stats = Object.entries(f.stats || {}).slice(0, 8).map(([k, v]) => `<div class="wh-stat"><span>${esc(statLabel(k))}</span><b class="hf-num">${fmtStat(k, v)}</b></div>`).join('');
  const inv = (data.inventory || []).filter(it => st.filter === 'all' || it.slot === st.filter)
    .sort((a, b) => RARITY.index(b.rarity) - RARITY.index(a.rarity) || (b.fr || b.level || 0) - (a.fr || a.level || 0));
  const filters = ['all', ...allSlots].map(s => `<button class="wh-f hf-live ${st.filter === s ? 'on' : ''}" data-filter="${s}" aria-label="${s}">${s === 'all' ? 'All' : icon(s)}</button>`).join('');

  body.innerHTML = `<div class="hf-wh">
    <div class="wh-bays hf-scroll">${bayHtml}</div>
    <div class="wh-doll">
      <div class="wd-hd">
        <div class="wd-nm"><span class="hf-label">${KIND[f.kind] || ''}${f.model ? ` · ${esc(f.model)}` : ''}</span><h3>${esc(f.name || '')}${f.fr != null ? ` <small class="hf-num">FR ${f.fr}</small>` : ''}</h3></div>
        <div class="wd-btns">
          <button class="hf-btn ghost wd-best hf-live" aria-label="Best FR auto-equip">${icon('upgrade')}Best</button>
          ${f.id && f.id !== data.active ? '<button class="hf-btn primary wd-act hf-live">Deploy</button>' : `<span class="hf-chip good wd-live">${icon('check')}Deployed</span>`}
        </div>
      </div>
      <div class="wd-stage">
        <div class="wd-col">${allSlots.slice(0, half).map(s => slotHtml(s, 'l')).join('')}</div>
        <div class="wd-fig"><div class="wd-plinth"></div>${frameFigure(f.kind)}<p class="wd-blurb">${esc(f.blurb || BLURB[f.kind] || '')}</p></div>
        <div class="wd-col">${allSlots.slice(half).map(s => slotHtml(s, 'r')).join('')}</div>
      </div>
      <div class="wd-stats">${stats}</div>
    </div>
    <div class="wh-inv">
      <div class="wi-hd"><span class="hf-label">Stash</span><span class="wi-n hf-num">${(data.inventory || []).length}${data.invMax ? ` / ${data.invMax}` : ''}</span></div>
      <div class="wi-f">${filters}</div>
      <div class="wi-grid hf-scroll">${inv.map(it => itemTile(it, better(it, sl[it.slot]) && allowed.includes(it.slot) ? 'better' : '')).join('') || '<div class="hf-empty">Nothing here yet.</div>'}</div>
    </div>
  </div>`;

  body.querySelectorAll('.wh-bay[data-f]').forEach(b => onTap(b, () => { st.frame = b.dataset.f; ctx.bus.emit('sfx', 'click'); ctx.rerender(); }));
  body.querySelectorAll('.wh-bay[data-go]').forEach(b => onTap(b, () => { st.tab = 'frames'; ctx.rerender(); }));
  const act = body.querySelector('.wd-act');
  if (act) onTap(act, () => emit('warehouse:activate', { frameId: f.id }));
  onTap(body.querySelector('.wd-best'), () => emit('warehouse:autoEquip', { frameId: f.id }));
  body.querySelectorAll('.wh-f').forEach(b => onTap(b, () => { st.filter = b.dataset.filter; ctx.bus.emit('sfx', 'click'); ctx.rerender(); }));

  const toFab = it => { st.fab = it.id; st.tab = 'fabricator'; ctx.rerender(); };
  body.querySelectorAll('.wh-slot').forEach(b => onTap(b, () => {
    if (b.classList.contains('locked')) { ctx.bus.emit('sfx', 'deny'); ctx.toast('Rental frames only take a weapon and a chip', 'warn'); return; }
    const it = sl[b.dataset.slot];
    if (!it) { st.filter = b.dataset.slot; ctx.rerender(); return; }
    ctx.itemCard(it, null, {
      actions: `<button class="hf-btn ghost hf-live" data-act="unequip">${icon('swap')}Remove</button><button class="hf-btn hf-live" data-act="tune">${icon('upgrade')}Tune</button>`,
      onAction: a => a === 'unequip' ? emit('warehouse:unequip', { frameId: f.id, slot: b.dataset.slot }) : toFab(it),
    });
  }));
  body.querySelectorAll('.wi-grid .hf-tile').forEach(t => onTap(t, () => {
    const it = (data.inventory || []).find(x => String(x.id) === t.dataset.id);
    if (!it) return;
    body.querySelectorAll('.wi-grid .sel').forEach(x => x.classList.remove('sel'));
    t.classList.add('sel');
    const can = allowed.includes(it.slot);
    ctx.itemCard(it, sl[it.slot] || null, {
      actions: `<button class="hf-btn danger hf-live" data-act="salvage">${icon('scrap')}Salvage</button><button class="hf-btn hf-live" data-act="tune">${icon('upgrade')}Tune</button>${can ? '<button class="hf-btn primary hf-live" data-act="equip">Equip</button>' : ''}`,
      onAction: a => {
        if (a === 'equip') emit('warehouse:equip', { frameId: f.id, itemId: it.id });
        else if (a === 'salvage') emit('warehouse:salvage', { itemId: it.id });
        else toFab(it);
      },
    });
  }));
}

function framesTab(body, data, ctx, emit) {
  const cards = (data.frames || []).map(f => {
    const mk = f.mk || 0, mkMax = f.mkMax || 6;
    return `<article class="wf-card k-${f.kind} ${f.id === data.active ? 'active' : ''}">
      <div class="wf-fig">${frameFigure(f.kind)}</div>
      <div class="wf-b">
        <span class="hf-label">${KIND[f.kind] || ''}</span><h3>${esc(f.name)}</h3><small>${esc(f.model || '')}</small>
        ${f.rental ? '<div class="wf-mk"><span>Rental · no tiers</span></div>' : `<div class="wf-mk"><span>Mk ${ROMAN[mk]}</span><div class="pips">${Array.from({ length: mkMax }, (_, i) => `<i class="${i < mk ? 'on' : ''}"></i>`).join('')}</div></div>`}
        <div class="wf-meta">${f.fr != null ? `<span>FR <b class="hf-num">${f.fr}</b></span>` : ''}${f.sync != null ? `<span>Sync <b class="hf-num">${f.sync}</b></span>` : ''}${f.level != null ? `<span>LV <b class="hf-num">${f.level}</b></span>` : ''}</div>
        <div class="wf-btns">
          ${f.id === data.active ? `<span class="hf-chip good">${icon('check')}Deployed</span>` : `<button class="hf-btn primary hf-live" data-deploy="${esc(f.id)}">Deploy</button>`}
          ${!f.rental && mk < mkMax && f.mkCost ? `<button class="hf-btn gold hf-live" data-mk="${esc(f.id)}">${icon('upgrade')}Mk ${ROMAN[mk + 1]} <b class="hf-num">${fmt(f.mkCost)}</b></button>` : ''}
        </div>
      </div>
    </article>`;
  });
  const shop = (data.shop || []).map(s => `<article class="wf-card shop k-${s.kind}">
      <div class="wf-fig">${frameFigure(s.kind)}</div>
      <div class="wf-b">
        <span class="hf-label">${KIND[s.kind] || ''} · Not owned</span><h3>${esc(s.name)}</h3><small>${esc(s.model || '')}</small>
        <p class="wf-bl">${esc(s.blurb || BLURB[s.kind] || '')}</p>
        <div class="wf-btns"><button class="hf-btn gold hf-live" data-buy="${esc(s.kind)}">Acquire <b class="hf-num">${fmt(s.price || 0)}</b></button></div>
      </div>
    </article>`);
  body.innerHTML = `<div class="wf-row hf-scroll">${[...cards, ...shop].join('')}</div>`;
  body.querySelectorAll('[data-deploy]').forEach(b => onTap(b, () => emit('warehouse:activate', { frameId: b.dataset.deploy })));
  body.querySelectorAll('[data-mk]').forEach(b => onTap(b, () => emit('warehouse:mk', { frameId: b.dataset.mk })));
  body.querySelectorAll('[data-buy]').forEach(b => onTap(b, () => emit('warehouse:buy', { kind: b.dataset.buy })));
}

function fabTab(body, data, ctx, emit) {
  const st = ctx.state;
  const active = (data.frames || []).find(f => f.id === data.active) || {};
  const equipped = Object.values(active.slots || {}).filter(Boolean);
  const items = [...equipped.map(it => ({ ...it, _eq: true })), ...(data.inventory || [])];
  const sel = items.find(i => i.id === st.fab) || items[0];
  if (sel) st.fab = sel.id;
  const m = data.materials || {};
  const tune = sel?.tune || 0, tuneMax = sel?.tuneMax || 10;
  const cost = sel?.tuneCost || {};
  const costHtml = Object.entries(cost).map(([k, v]) => {
    const have = k === 'credits' ? data.credits || 0 : m[k] || 0;
    return `<span class="${have < v ? 'short' : ''}">${k === 'credits' ? icon('credits') : icon('materials')}<b class="hf-num">${fmt(v)}</b><small>${k === 'credits' ? 'cr' : esc((MATS.find(x => x[0] === k) || [k, k])[1])}</small></span>`;
  }).join('');
  const yields = sel?.salvage ? Object.entries(sel.salvage).map(([k, v]) => `<span>+${fmt(v)} ${esc((MATS.find(x => x[0] === k) || [k, k])[1])}</span>`).join('') : '';
  const tiers = RARITY.list.slice(0, 4);
  body.innerHTML = `<div class="hf-fab">
    <div class="fb-l">
      <div class="fb-mats">${MATS.map(([k, n]) => `<div class="fb-mat m-${k}"><span>${icon('materials')}</span><b class="hf-num">${fmt(m[k] || 0)}</b><small>${n}</small></div>`).join('')}</div>
      <div class="fb-grid hf-scroll">${items.map(it => itemTile(it, `${it.id === st.fab ? 'sel' : ''} ${it._eq ? 'eq' : ''}`)).join('')}</div>
      <div class="fb-all"><span class="hf-label">Salvage all ≤</span><div class="st-seg">${tiers.map((r, i) => `<button class="hf-live ${st.salvTier === i ? 'on' : ''}" data-tier="${i}" style="color:${r.color}">${esc(r.name)}</button>`).join('')}</div><button class="hf-btn danger hf-live fb-go">${icon('scrap')}Salvage</button></div>
    </div>
    <div class="fb-r">
      ${sel ? itemCardHTML(sel, null, { equipped: false }) : '<div class="hf-empty">No parts to work on.</div>'}
      ${sel ? `<div class="fb-tune hf-glass">
        <div class="ft-h"><span class="hf-label">Tune</span><b class="hf-num">+${tune} <em>→</em> +${Math.min(tuneMax, tune + 1)}</b>${sel.tuneChance != null ? `<span class="ft-ch hf-num">${Math.round(sel.tuneChance * 100)}% success</span>` : ''}</div>
        <div class="ft-bar">${Array.from({ length: tuneMax }, (_, i) => `<i class="${i < tune ? 'on' : i === tune ? 'next' : ''}"></i>`).join('')}</div>
        <div class="ft-cost">${costHtml}</div>
        <div class="ft-btns">
          <button class="hf-btn danger hf-live" data-salv ${sel._eq ? 'disabled' : ''}>${icon('scrap')}Salvage</button>
          <button class="hf-btn gold hf-live" data-tune ${tune >= tuneMax ? 'disabled' : ''}>${icon('upgrade')}Tune +${Math.min(tuneMax, tune + 1)}</button>
        </div>
        ${yields ? `<div class="ft-y">Salvage yields ${yields}</div>` : ''}
      </div>` : ''}
    </div>
  </div>`;
  body.querySelectorAll('.fb-grid .hf-tile').forEach(t => onTap(t, () => { st.fab = items.find(i => String(i.id) === t.dataset.id)?.id; ctx.bus.emit('sfx', 'click'); ctx.rerender(); }));
  body.querySelectorAll('[data-tier]').forEach(b => onTap(b, () => { st.salvTier = +b.dataset.tier; ctx.bus.emit('sfx', 'click'); ctx.rerender(); }));
  onTap(body.querySelector('.fb-go'), () => { if (st.salvTier == null) return ctx.bus.emit('sfx', 'deny'); emit('warehouse:salvageAll', { tier: st.salvTier }); });
  const tb = body.querySelector('[data-tune]'), sb = body.querySelector('[data-salv]');
  if (tb) onTap(tb, () => emit('warehouse:tune', { itemId: sel.id }));
  if (sb) onTap(sb, () => emit('warehouse:salvage', { itemId: sel.id }));
}
