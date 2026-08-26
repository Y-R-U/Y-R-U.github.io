// Hangar: plane carousel, upgrade rows, armoury, and the 4-slot loadout editor. One screen.

import { el, btn, topbar, popup, toast, refreshCoins, coinChip } from '../widgets.js';
import { cash } from '../units.js';
import { planeCanvas, iconCanvas, GOLD } from '../icons.js';
import { buzz } from '../prefs.js';
import * as M from '../model.js';

let cleanup = [];
let carouselIdx = 0;
let selSlot = 0;

export function mount(root, ctx) {
  const { data, save } = ctx;
  const PLANES = data.PLANES, WEAPONS = data.WEAPONS, UPGRADES = data.UPGRADES, ECON = data.ECON;

  // The carousel BROWSES. Everything you can spend or commit — upgrades, stores, hardpoints —
  // belongs to the aeroplane you actually fly, and must be read from here rather than from
  // PLANES[carouselIdx]. Browsing used to unlock the hardpoints of a plane you did not own and
  // let you load a bomb into one; the sim then flew your own aeroplane, which had no such slot,
  // and the bomb was nowhere on the HUD.
  const activePlane = () => M.currentPlane(save, PLANES);

  const cur = M.currentPlane(save, PLANES);
  if (cur) {
    const i = PLANES.findIndex((p) => p.id === cur.id);
    if (i >= 0 && !ctx.args.keepIdx) carouselIdx = i;
  }
  carouselIdx = Math.max(0, Math.min(PLANES.length - 1, carouselIdx));

  root.appendChild(topbar(ctx, 'HANGAR', { back: () => ctx.go('title'), screen: 'hangar' }));

  const bay = el('section.bay');
  const pane = el('section.pane');
  root.appendChild(el('div.hangar-body', {}, bay, pane));

  const bar = el('footer.loadbar');
  root.appendChild(bar);

  /* --------------------------------------------------------------- the bay */

  function renderBay() {
    bay.textContent = '';
    const p = PLANES[carouselIdx];
    if (!p) { bay.appendChild(el('div.empty', {}, 'No airframes in data/planes.js')); return; }

    const owned = M.ownsPlane(save, PLANES, p.id);
    const active = M.currentPlaneId(save, PLANES) === p.id;

    const art = el('div.bay-art' + (owned ? '' : '.locked'), {}, planeCanvas(p.shape, 218, 96));
    if (!owned) {
      const lk = iconCanvas('lock', 40, 'rgba(255,196,107,0.92)');
      lk.className = 'bay-lock';
      art.appendChild(lk);
    }

    bay.appendChild(el('div.bay-head', {},
      arrow('left', -1),
      el('div.bay-name', {}, el('div.bay-title', {}, p.name)),
      arrow('right', 1)
    ));
    // The spec line sits under the head, not inside it: the bigger arrows leave the name box too
    // narrow to hold it on one line and it wrapped.
    bay.appendChild(el('div.bay-meta', { style: { textAlign: 'center' } },
      `TIER ${p.tier} · ${String(p.era).toUpperCase()} · ${M.slotCount(p)} HARDPOINTS`));
    bay.appendChild(art);
    swipeSource(art);

    const act = activePlane();
    if (act && act.id !== p.id) {
      bay.appendChild(el('div.bay-preview', { style: PREVIEW_CSS }, `PREVIEW · YOU FLY THE ${act.name.toUpperCase()}`));
    }

    bay.appendChild(el('div.bay-stats', {},
      statBar('ARM', p.hp, 700), statBar('SPD', p.cruise, 950),
      statBar('MAN', p.turnRate, 4.5), statBar('SLT', M.slotCount(p), 4)
    ));

    bay.appendChild(el('div.bay-dots', {}, PLANES.map((q, i) =>
      el('span.dot' + (i === carouselIdx ? '.on' : '') + (M.ownsPlane(save, PLANES, q.id) ? '.owned' : '')))));

    if (active) {
      bay.appendChild(btn('wide ok', 'IN SERVICE', null, { disabled: true }));
    } else if (owned) {
      bay.appendChild(btn('wide', 'SELECT', () => {
        M.selectPlane(save, PLANES, p.id);   // stows the old loadout and recalls this plane's
        selSlot = 0;
        toast(`${p.name} rolled out`);
        renderBay(); renderPane(); renderBar();
      }));
    } else {
      const m = M.getMoney(save);
      const can = m >= p.price;
      bay.appendChild(btn('wide buy' + (can ? '' : ' poor'), `BUY  ${cash(p.price)}`, () => {
        if (!can) { short(p.price - m); return; }
        popup({
          title: `Buy the ${p.name}?`,
          body: `${cash(p.price)} from ${cash(m)}.`,
          actions: [
            { label: 'Not yet' },
            { label: 'Buy it', kind: 'go', act: () => {
              if (M.buyPlane(save, PLANES, p.id)) {
                M.selectPlane(save, PLANES, p.id);
                selSlot = 0;
                buzz(24);
                toast(`${p.name} delivered`, 'good');
                refreshCoins(ctx); renderBay(); renderPane(); renderBar();
              }
            } },
          ],
        });
      }));
    }
  }

  const PREVIEW_CSS = {
    font: '800 8px/1.5 var(--ui-font)', letterSpacing: '.12em', textTransform: 'uppercase',
    color: 'rgba(255,196,107,.72)', textAlign: 'center', margin: '0 0 3px',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  };

  function step(dir) {
    carouselIdx = (carouselIdx + dir + PLANES.length) % PLANES.length;
    renderBay(); renderPane(); renderBar();
  }

  /**
   * 52 px of picture, 78 x 72 of target. A 44 px box at the edge of a landscape phone is the
   * spec floor and Aaron missed it repeatedly. The pad is a transparent sibling that extends
   * the pressable area outward without moving anything; it must NOT live inside the <button>,
   * because Blink then declines to hit-test the parts of it that overhang in both axes at once
   * and the corners quietly stay dead. Less headroom at the top on purpose — the topbar's back
   * button is directly above.
   */
  function arrow(dir, delta) {
    const b = btn('icon arrow ' + dir, '', () => step(delta), { aria: dir === 'left' ? 'Previous aircraft' : 'Next aircraft' });
    Object.assign(b.style, { width: '52px', minWidth: '52px', height: '52px', minHeight: '52px' });
    const pad = el('span', { style: {
      position: 'absolute', top: '-6px', bottom: '-14px', left: '-13px', right: '-13px',
      borderRadius: '16px', cursor: 'pointer', touchAction: 'manipulation',
    }, 'aria-hidden': 'true' });
    pad.addEventListener('pointerdown', (e) => e.stopPropagation());
    pad.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); buzz(10); step(delta); });
    return el('div.arrow-wrap', { style: {
      position: 'relative', zIndex: '4', display: 'flex', flex: '0 0 auto', touchAction: 'manipulation',
    } }, pad, b);
  }

  /** A horizontal drag across the aeroplane changes aeroplane. Nothing else on the art is tappable. */
  function swipeSource(node) {
    let x0 = 0, y0 = 0, live = false;
    const down = (e) => { live = true; x0 = e.clientX; y0 = e.clientY; };
    const up = (e) => {
      if (!live) return;
      live = false;
      const dx = e.clientX - x0, dy = e.clientY - y0;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.6) { buzz(8); step(dx < 0 ? 1 : -1); }
    };
    node.addEventListener('pointerdown', down);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', () => { live = false; });
    cleanup.push(() => { node.removeEventListener('pointerdown', down); node.removeEventListener('pointerup', up); });
  }

  function statBar(label, v, max) {
    return el('div.sb', {},
      el('span.sb-l', {}, label),
      el('span.sb-t', {}, el('span.sb-f', { style: { width: Math.round(Math.min(1, v / max) * 100) + '%' } }))
    );
  }

  /* ------------------------------------------------------------- the panes */

  function renderPane() {
    pane.textContent = '';
    // Upgrades are global (D31) and apply to the aeroplane in service, so these rows must show
    // its numbers. Bound to the carousel they read out the stats of a plane you cannot fly.
    const p = activePlane();
    pane.appendChild(el('div.pane-h', {}, el('span', {}, 'UPGRADES'), el('span.pane-h-r', {}, p ? p.name : '')));
    const list = el('div.pane-list');
    pane.appendChild(list);
    renderUpgrades(list, p);
  }

  function renderUpgrades(list, p) {
    if (!UPGRADES.length) { list.appendChild(el('div.empty', {}, 'No UPGRADES in data/planes.js')); return; }
    if (!p) { list.appendChild(el('div.empty', {}, 'No aircraft in service')); return; }
    for (const u of UPGRADES) {
      const lvl = M.upgradeLevel(save, p.id, u.id);
      const maxed = lvl >= u.max;
      const price = M.upgradePrice(u, lvl, ECON);
      const st = M.upgradeStat(u, p, lvl, WEAPONS);
      const nx = M.upgradeStat(u, p, Math.min(u.max, lvl + 1), WEAPONS);
      const can = M.getMoney(save) >= price;

      const val = (st.prefix || '') + st.value.toFixed(st.dp);
      const gain = maxed ? '' : ' → ' + (nx.prefix || '') + nx.value.toFixed(nx.dp);

      list.appendChild(el('div.urow' + (maxed ? '.maxed' : ''), {},
        el('div.urow-l', {},
          el('span.urow-name', {}, u.name),
          el('span.pips', {}, pips(lvl, u.max))
        ),
        el('div.urow-m', {},
          el('span.urow-val', {}, val, el('em', {}, ' ' + st.unit)),
          el('span.urow-lvl', {}, maxed ? `${lvl}/${u.max}` : `${lvl}/${u.max}${gain}`)
        ),
        maxed
          ? el('span.urow-max', {}, 'MAX')
          : btn('plus' + (can ? '' : ' poor'), el('span.plus-in', {}, el('b', {}, '+'), el('span', {}, cash(price))), () => {
            if (!can) { short(price - M.getMoney(save)); return; }
            const r = M.buyUpgrade(save, p, u, ECON);
            if (r === 'ok') { buzz(18); refreshCoins(ctx); renderBay(); renderPane(); }
          })
      ));
    }
  }

  function pips(lvl, max) {
    // one element per level gets silly at 20; a segmented bar of 10 reads the same
    const n = Math.min(max, 10);
    const filled = Math.round((lvl / max) * n);
    const out = [];
    for (let i = 0; i < n; i++) out.push(el('i.pip' + (i < filled ? '.on' : '')));
    return out;
  }

  function openArmory() {
    closeArmory();
    const all = M.specialWeapons(WEAPONS);
    const panel = el('div.armoury', { id: 'armoury' },
      el('div.armoury-h', {},
        el('span.armoury-t', {}, 'ARMOURY'),
        el('span.armoury-s', {}, 'Buy ordnance, then drop it on a hardpoint'),
        el('div.spacer'),
        coinChip(ctx),
        btn('icon close', '', closeArmory, { aria: 'Close armoury' })
      )
    );
    const list = el('div.armoury-list');
    panel.appendChild(list);
    if (!all.length) { list.appendChild(el('div.empty', {}, 'No special weapons in data/weapons.js')); }
    else renderArmory(list);
    root.appendChild(panel);
    requestAnimationFrame(() => panel.classList.add('in'));
  }

  function closeArmory() {
    const n = root.querySelector('#armoury');
    if (n) n.remove();
  }

  function renderArmory(list) {
    const all = M.specialWeapons(WEAPONS);
    const grid = el('div.arm-grid');
    for (const w of all) {
      const owned = M.ownsWeapon(save, WEAPONS, w.id);
      const can = M.getMoney(save) >= (w.price || 0);
      const card = el('div.arm-card' + (owned ? '.owned' : ''), {},
        el('div.arm-ico', {}, iconCanvas(w.icon || 'bomb', 30, owned ? GOLD : 'rgba(190,175,150,0.5)')),
        el('div.arm-txt', {},
          el('div.arm-name', {}, w.name),
          el('div.arm-spec', {}, `T${w.tier || 1} · ${w.dmg} dmg · ${w.ammo} rds · ${w.blastR} blast`)
        ),
        owned
          ? btn('mini ok', 'EQUIP', () => { assign(w.id); closeArmory(); })
          : btn('mini buy' + (can ? '' : ' poor'), cash(w.price || 0), () => {
            if (!can) { short((w.price || 0) - M.getMoney(save)); return; }
            if (M.buyWeapon(save, WEAPONS, w.id)) {
              buzz(20); toast(`${w.name} loaded into stores`, 'good');
              refreshCoins(ctx); renderBar();
              assign(w.id);
              openArmory();
            }
          })
      );
      grid.appendChild(card);
    }
    list.appendChild(grid);
  }

  /* ---------------------------------------------------------- loadout bar */

  function assign(weaponId) {
    const p = activePlane();
    const n = M.slotCount(p);
    const l = M.loadout(save);
    let i = selSlot < n ? selSlot : 0;
    if (l[i] && l.slice(0, n).some((x) => !x)) i = l.slice(0, n).findIndex((x) => !x);
    M.setSlot(save, i, weaponId);
    selSlot = Math.min(n - 1, i + 1);
    buzz(12);
    renderBar();
  }

  function renderBar() {
    bar.textContent = '';
    // The hardpoints belong to the aeroplane in service, not the one on the turntable.
    const p = activePlane();
    const n = M.slotCount(p);
    const spill = M.overflowWeapons(save, p);
    const l = M.normaliseLoadout(save, p);
    if (spill.length) {
      const names = spill.map((id) => (WEAPONS[id] || {}).name || id).join(', ');
      toast(`${names} unloaded to stores — ${p ? p.name : 'this airframe'} has ${n} hardpoint${n === 1 ? '' : 's'}`);
    }
    if (selSlot >= n) selSlot = n - 1;
    const owned = M.ownedWeapons(save, WEAPONS);

    const shelf = el('div.shelf');
    shelf.appendChild(el('div.shelf-lab', {}, 'STORES — drag onto a hardpoint'));
    const strip = el('div.shelf-strip');
    strip.appendChild(btn('armoury-open', '+ ARMOURY', openArmory));
    for (const id of owned) {
      const w = WEAPONS[id];
      if (!w) continue;
      const inUse = l.indexOf(id) >= 0;
      const chip = el('div.wchip' + (inUse ? '.used' : ''), { dataWeapon: id },
        iconCanvas(w.icon || 'bomb', 22, inUse ? 'rgba(255,196,107,0.45)' : GOLD),
        el('span', {}, w.name)
      );
      dragSource(chip, id);
      strip.appendChild(chip);
    }
    if (!owned.length) strip.appendChild(el('div.empty.sm', {}, 'Nothing in stores — buy from the Armoury'));
    shelf.appendChild(strip);

    const slots = el('div.slots');
    const selFull = selSlot < n && l[selSlot];
    const head = `${p ? p.name.toUpperCase() + ' ' : ''}LOADOUT ${l.slice(0, n).filter(Boolean).length}/${n}`;
    slots.appendChild(el('div.slots-lab', {}, selFull
      ? `${head} — TAP ${selSlot + 1} TO UNLOAD`
      : head));
    const row = el('div.slots-row');
    for (let i = 0; i < 4; i++) {
      const locked = i >= n;
      const id = l[i];
      const w = id ? WEAPONS[id] : null;
      const s = el('div.slot' + (locked ? '.locked' : '') + (i === selSlot && !locked ? '.sel' : '') + (w ? '.full' : ''),
        { dataSlot: String(i) });
      s.appendChild(el('span.slot-n', {}, String(i + 1)));
      if (locked) {
        s.appendChild(iconCanvas('lock', 20, 'rgba(180,165,140,0.45)'));
      } else if (w) {
        s.appendChild(iconCanvas(w.icon || 'bomb', 26, GOLD));
        s.appendChild(el('span.slot-amm', {}, String(w.ammo)));
      } else {
        s.appendChild(el('span.slot-empty', {}, '—'));
      }
      if (!locked) {
        s.addEventListener('click', () => {
          // Tapping the selected slot again unloads it. setSlot stows the weapon, so it
          // reappears in stores rather than being destroyed.
          if (i === selSlot && l[i]) M.setSlot(save, i, null);
          selSlot = i;
          buzz(8);
          renderBar();
        });
      }
      row.appendChild(s);
    }
    slots.appendChild(row);

    bar.appendChild(shelf);
    bar.appendChild(slots);
  }

  /* ------------------------------------------------------- drag and drop */

  function dragSource(node, weaponId) {
    let ghost = null, startX = 0, startY = 0, moved = false, pid = null;
    const down = (e) => {
      pid = e.pointerId; startX = e.clientX; startY = e.clientY; moved = false;
      try { node.setPointerCapture(pid); } catch { /* capture is a nicety; the drag works without it */ }
      node.addEventListener('pointermove', move);
      node.addEventListener('pointerup', up);
      node.addEventListener('pointercancel', up);
    };
    const move = (e) => {
      if (Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) < 8) return;
      if (!moved) {
        moved = true;
        const w = WEAPONS[weaponId];
        ghost = el('div.drag-ghost', {}, iconCanvas(w.icon || 'bomb', 28, GOLD));
        document.body.appendChild(ghost);
      }
      ghost.style.left = e.clientX + 'px';
      ghost.style.top = e.clientY + 'px';
      const t = slotUnder(e.clientX, e.clientY);
      for (const s of bar.querySelectorAll('.slot')) s.classList.toggle('hover', s === t);
    };
    const up = (e) => {
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', up);
      if (ghost) { ghost.remove(); ghost = null; }
      if (!moved) { assign(weaponId); return; }
      const t = slotUnder(e.clientX, e.clientY);
      if (t && !t.classList.contains('locked')) {
        M.setSlot(save, Number(t.dataset.slot), weaponId);
        buzz(14);
      }
      renderBar();
    };
    node.addEventListener('pointerdown', down);
    cleanup.push(() => node.removeEventListener('pointerdown', down));
  }

  function slotUnder(x, y) {
    for (const s of bar.querySelectorAll('.slot')) {
      const r = s.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return s;
    }
    return null;
  }

  function short(gap) {
    toast(`${cash(gap)} short`, 'bad');
    buzz(6);
  }

  renderBay();
  renderPane();
  renderBar();
}

export function unmount() {
  cleanup.forEach((f) => { try { f(); } catch { /* node already gone */ } });
  cleanup = [];
}
