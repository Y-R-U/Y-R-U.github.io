// In-game HUD: hotbar, Integrity/Charge/air, crosshair, droop warning, damage vignette, FPS, scale chip.
import { h, click, setText, setCls, setStyle } from './dom.js';
import { g } from './glyphs.js';
import { iconURL, fmtCount } from './icons.js';
import { settings } from './settings.js';

const HOT = 9;

export function createHud(ctx, root, actions) {
  let integCells = [], chargeCells = [], airCells = [];
  const slots = [];
  const hotbar = h('div.sw-hotbar.glass');
  for (let i = 0; i < HOT; i++) {
    const img = h('img', { alt: '', draggable: false });
    const s = h('div.sw-slot', {}, h('span.k', {}, String(i + 1)), img, h('span.n'), h('div.dur', {}, h('b')));
    s.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); e.preventDefault();
      const inv = ctx.game?.inv;
      if (!inv) return;
      if (inv.sel === i) actions.inventory(); else { inv.select(i); click('select'); }
    });
    slots.push({ el: s, img, n: s.querySelector('.n'), dur: s.querySelector('.dur'), durB: s.querySelector('.dur b'), key: null });
    hotbar.append(s);
  }
  hotbar.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });

  const mk = (cls, n, icon) => {
    const cells = [];
    const el = h('div.sw-meter.' + cls, {}, icon && h('span.lbl', {}, g(icon, 14)));
    for (let i = 0; i < n; i++) { const b = h('b'); const c = h('i', {}, b); el.append(c); cells.push(b); }
    return [el, cells];
  };
  let integEl, chargeEl, airEl;
  [integEl, integCells] = mk('integ', 10, 'shield');
  [chargeEl, chargeCells] = mk('charge', 10, 'bolt');
  [airEl, airCells] = mk('air', 10, null);
  const stats = h('div.sw-stats', {}, integEl, chargeEl);
  const airRow = h('div.sw-airrow', {}, airEl);
  airEl.style.visibility = 'hidden';

  const tapBtn = (cls, title, fn, ...kids) => h('div.sw-hud-btn.glass.tap' + cls, { title, onpointerdown: (e) => { e.stopPropagation(); e.preventDefault(); fn(); } }, ...kids);
  const scaleChip = tapBtn('.sw-scalechip', 'Tool wheel (Q)', () => actions.wheel(), h('b', {}, '1'), h('span', {}, 'fill'));
  const bagBtn = tapBtn('', 'Inventory (E)', () => actions.inventory(), g('bag', 20));
  const pauseBtn = tapBtn('.sw-pausebtn', 'Menu (Esc)', () => actions.pause(),
    h('span', { html: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>' }));
  const bottom = h('div.sw-bottom', {}, airRow, stats, h('div.sw-hotrow', {}, scaleChip, hotbar, bagBtn));
  const itemName = h('div.sw-itemname');

  const fps = h('div.sw-fps', { style: { display: 'none' } }, '-- fps');
  const topLeft = h('div.sw-topleft', {}, fps);
  const droop = h('div.sw-droop', {}, g('moon', 16), h('span', {}, 'Power droop: stand near a light to recharge'));
  const vig = h('div.sw-vignette');
  const eatRing = h('div.sw-eat', { html: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16"/><circle class="p" cx="20" cy="20" r="16"/></svg>' });
  const eatP = eatRing.querySelector('.p');
  const water = h('div.sw-vignette.water', { style: { display: 'none' } });
  const cross = h('div.sw-cross');
  const compArrow = h('span.arr', { html: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 3l6 15-6-4-6 4z" fill="currentColor"/></svg>' });
  const compText = h('span');
  const compass = h('div.sw-compass', {}, compArrow, compText);
  const el = h('div.sw-hud.hidden', {}, water, vig, cross, eatRing, droop, compass, topLeft, pauseBtn, itemName, bottom);
  root.append(el);

  const KIND = { outpost: 'Grower Outpost', starter: 'Grower Outpost', ruin: 'Ruin', vault: 'Seed Vault', observatory: 'Observatory' };
  let compT = 0, compTarget = null;
  function updateCompass(dt) {
    const w = ctx.world, p = ctx.player?.pos || ctx.camera?.position;
    compT -= dt;
    if (compT <= 0 && w?.structuresNear && p) {
      compT = 1;
      try { compTarget = w.structuresNear(p.x, p.z, 400).find((s) => s.kind === 'outpost' || s.kind === 'starter') || null; } catch { compTarget = null; }
    }
    const t = ctx.game?.journal?.done?.outpost || ctx.session?.mode === 'minigame' ? null : compTarget;
    if (!t || !p) { setCls(compass, 'on', false); return; }
    const dx = t.pos[0] - p.x, dz = t.pos[2] - p.z, d = Math.hypot(dx, dz);
    if (d < 20) { setCls(compass, 'on', false); return; }
    const e = ctx.camera?.matrixWorld?.elements;
    const yawCam = e ? Math.atan2(-e[8], -e[10]) : 0;
    const ang = Math.atan2(dx, dz) - yawCam;
    const deg = Math.round((-ang * 180) / Math.PI);
    if (deg !== compArrow._deg) { compArrow._deg = deg; compArrow.style.transform = `rotate(${deg}deg)`; }
    setText(compText, `${KIND[t.kind] || t.kind} · ${Math.round(d)} m`);
    setCls(compass, 'on', true);
  }
  // ~60 s before dusk (night starts at time01 0.75; a day is 1200 s), warn once per day in survival.
  let duskWarned = false, lastT = null;
  function duskWatch() {
    const sky = ctx.sky, t = sky?.time01;
    if (t == null || (ctx.session?.mode || 'survival') !== 'survival' || settings.get('alwaysDay')) { lastT = t; return; }
    if (lastT != null && t < lastT) duskWarned = false;
    if (!duskWarned && t >= 0.7 && t < 0.75 && lastT != null && lastT < 0.7) {
      duskWarned = true;
      actions.dusk?.();
    }
    lastT = t;
  }
  let nameT = 0, lastSel = -1, fpsAcc = 0, fpsN = 0, fpsT = 0, lastInteg = null, flashT = 0;
  let dirty = true;

  const bus = ctx.bus;
  const offs = [];
  if (bus) {
    offs.push(bus.on('inv:change', () => { dirty = true; }));
    offs.push(bus.on('inv:select', () => { dirty = true; }));
    offs.push(bus.on('player:damage', () => { vig.classList.add('hit'); setTimeout(() => vig.classList.remove('hit'), 160); }));
  }
  fps.style.display = settings.get('showFps') ? '' : 'none';
  offs.push(settings.on('showFps', (v) => { fps.style.display = v ? '' : 'none'; }));

  function showName(text) {
    itemName.textContent = text;
    itemName.classList.add('on');
    clearTimeout(nameT);
    nameT = setTimeout(() => itemName.classList.remove('on'), 1600);
  }

  function renderHotbar() {
    const inv = ctx.game?.inv;
    if (!inv) return;
    for (let i = 0; i < HOT; i++) {
      const v = inv.view(i), s = slots[i];
      s.el.classList.toggle('sel', i === inv.sel);
      const key = v ? `${v.id}|${v.count}|${v.frac}|${v.dur}|${v.infinite}` : '';
      if (key === s.key) continue;
      s.key = key;
      if (!v) { s.img.removeAttribute('src'); s.img.style.visibility = 'hidden'; s.n.textContent = ''; s.dur.style.display = 'none'; continue; }
      s.img.src = iconURL(v.item); s.img.style.visibility = '';
      s.n.textContent = v.infinite || (v.count <= 1 && !v.frac) ? '' : fmtCount(v);
      if (v.maxDur && v.dur != null && v.dur < v.maxDur) {
        s.dur.style.display = ''; const f = v.dur / v.maxDur;
        s.durB.style.width = f * 100 + '%'; s.durB.style.background = f > 0.5 ? '#6dff9a' : f > 0.2 ? '#ffd25e' : '#ff5a6e';
      } else s.dur.style.display = 'none';
    }
    if (inv.sel !== lastSel) {
      if (lastSel !== -1) { const v = inv.view(inv.sel); if (v) showName(v.item?.fullName || v.item?.name || ''); }
      lastSel = inv.sel;
    }
  }

  function setCells(cells, frac10, mode) {
    for (let i = 0; i < cells.length; i++) {
      const f = Math.round(Math.max(0, Math.min(1, frac10 - i)) * 20) / 20;   // 5% steps: a draining meter isn't a write every frame
      const t = mode === 'v' ? `scaleY(${f})` : `scaleX(${f})`;
      if (cells[i]._t !== t) { cells[i].style.transform = t; cells[i]._t = t; }
    }
  }

  function update(dt) {
    if (dirty) { dirty = false; renderHotbar(); }
    const mgMode = ctx.session?.mode === 'minigame';
    const survival = (ctx.session?.mode || 'survival') === 'survival' || (mgMode && !!ctx.session?.mgSurvival);
    const hideBar = mgMode && !ctx.game?.inv?.slots?.some(Boolean);
    if (bottom._mg !== hideBar) { bottom._mg = hideBar; bottom.style.display = hideBar ? 'none' : ''; }
    const sv = ctx.game?.survival;
    stats.classList.toggle('hidden', !survival || !sv);
    if (survival && sv) {
      const maxI = sv.maxIntegrity ?? 20, maxC = sv.maxCharge ?? 20;
      const I = sv.integrity ?? sv.health ?? maxI, C = sv.charge ?? maxC;
      setCells(integCells, (I / maxI) * 10, 'h');
      setCells(chargeCells, (C / maxC) * 10, 'v');
      integEl.classList.toggle('low', I / maxI <= 0.25);
      chargeEl.classList.toggle('low', C / maxC <= 0.2);
      if (lastInteg != null && I < lastInteg - 0.01) { integEl.classList.add('flash'); flashT = 1.05; }
      lastInteg = I;
      const maxA = sv.maxAir ?? 10, A = sv.air ?? maxA;
      const under = !!(sv.underwater ?? ctx.player?.underwater ?? A < maxA);
      setStyle(airEl, 'visibility', under || A < maxA ? 'visible' : 'hidden');
      if (under || A < maxA) setCells(airCells, (A / maxA) * 10, 'h');
      chargeEl.classList.toggle('charging', (sv.trickle || 0) > 0 && C < maxC);
      const bow = ctx.game?.bow?.charge || 0;
      const ep = bow > 0 ? bow : sv.eatProgress || 0;
      eatRing.classList.toggle('on', ep > 0);
      eatRing.classList.toggle('bow', bow > 0);
      eatRing.classList.toggle('full', bow >= 1);
      if (ep > 0) setStyle(eatP, 'strokeDashoffset', String(100.5 * (1 - Math.min(1, ep))));
      const night = sv.droop ?? (ctx.sky?.isNight && !settings.get('alwaysDay'));
      setCls(droop, 'on', night);
    } else {
      setCls(droop, 'on', false);
      setStyle(airEl, 'visibility', 'hidden');
    }
    updateCompass(dt);
    duskWatch();
    if (flashT > 0 && (flashT -= dt) <= 0) setCls(integEl, 'flash', false);
    cross.classList.toggle('target', !!(ctx.brush?.target || ctx.brush?.placeTarget || ctx.player?.target));
    const uw = !!(ctx.player?.underwater ?? sv?.underwater);
    setStyle(water, 'display', uw ? '' : 'none');

    const b = ctx.brush;
    if (b) {
      const sc = b.scale ?? 1, md = b.mode ?? 'fill', dims = (b.effDims ? b.effDims() : b.dims) || [1, 1, 1];
      const key = sc + md + dims.join();
      if (scaleChip._k !== key) {
        scaleChip._k = key;
        scaleChip.firstChild.textContent = sc === 0.25 ? '¼' : sc === 0.5 ? '½' : String(sc);
        scaleChip.lastChild.textContent = dims.some((d) => d > 1) ? dims.join('×') : md;
      }
    }
    el.classList.toggle('lefty', !!settings.get('leftHanded'));

    if (settings.get('showFps')) {
      fpsAcc += dt; fpsN++; fpsT += dt;
      if (fpsT > 0.5) { fps.textContent = Math.round(fpsN / fpsAcc) + ' fps'; fpsAcc = 0; fpsN = 0; fpsT = 0; }
    }
  }

  return {
    el,
    show(on) { el.classList.toggle('hidden', !on); if (on) dirty = true; },
    refresh() { dirty = true; },
    update,
    showName,
    destroy() { offs.forEach((f) => f && f()); el.remove(); },
  };
}
