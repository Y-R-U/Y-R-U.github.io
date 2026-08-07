// Every DOM panel: status bars, the inventory grid, equipment, skills, toasts, take-control.
// Renders off 'change', never off the frame loop — update() only lerps the bars.

import { SKILLS, xpBand } from './state.js';
import { SLOTS, SLOT_LABEL, item, fitsSlot } from './items.js';

const SIZES = [5, 10, 25, 50];

const DOLL = [
  ['head', 'neck', 'earL', 'earR', 'shoulders'],
  ['handL', 'back', 'torso', 'gloves', 'handR'],
  ['braceletL', 'waist', 'braceletR'],
  ['ring1', 'ring2', 'ring3', 'ring4', 'ring5'],
  ['ring6', 'ring7', 'ring8', 'ring9', 'ring10'],
  ['legs', 'feet', 'ammo'],
];

const ABBR = {
  earL: 'L ear', earR: 'R ear', shoulders: 'Shldr',
  handL: 'L hand', handR: 'R hand', braceletL: 'L wrist', braceletR: 'R wrist',
};
const shortLabel = k => ABBR[k] || SLOT_LABEL[k];

const esc = s => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

export function mount(game, app) {
  const root = document.getElementById('game');
  if (!root) return { update() {} };

  root.innerHTML = `
    <div class="f-bars">
      <div class="f-bar f-hp"><i></i><s></s></div>
      <div class="f-bar f-mp"><i></i><s></s></div>
    </div>
    <div class="f-toasts"></div>
    <button class="f-take" type="button">Take control</button>
    <div class="f-dock">
      <div class="f-body"></div>
      <div class="f-tabs">
        <button type="button" data-tab="inv" class="on">Inventory</button>
        <button type="button" data-tab="eq">Equipment</button>
        <button type="button" data-tab="sk">Skills</button>
      </div>
    </div>
    <div class="f-ghost"></div>`;

  const $ = s => root.querySelector(s);
  const bars = {
    hp: $('.f-hp > i'), hpT: $('.f-hp > s'),
    mp: $('.f-mp > i'), mpT: $('.f-mp > s'),
  };
  const body = $('.f-body'), tabs = $('.f-tabs'), toasts = $('.f-toasts');
  const take = $('.f-take'), ghost = $('.f-ghost');

  let tab = 'inv';
  let forced = null;          // testing override of the visible grid size
  let held = null;            // item id under the finger mid-drag
  let drag = null;
  let dirty = false;

  // The perf HUD sits top-left too, and it is populated after we mount. Measure it — offsetParent
  // is always null on a fixed element, so height is the only usable "is it showing" test.
  const hud = document.getElementById('hud');
  const reflow = () => {
    const r = hud && hud.getBoundingClientRect();
    const on = r && r.height > 0;
    root.style.setProperty('--f-top', `${on ? r.bottom + 8 : 8}px`);
    root.style.setProperty('--f-left', `${on ? r.right + 8 : 8}px`);
  };
  reflow();
  addEventListener('resize', reflow);
  if (hud && window.ResizeObserver) new ResizeObserver(reflow).observe(hud);

  function schedule() {
    if (dirty || drag) return;
    dirty = true;
    requestAnimationFrame(() => { dirty = false; render(); });
  }

  function applyForced(n) {
    forced = n;
    game.inv.setSize(n);
  }

  function slotHTML(i) {
    const inv = game.inv;
    const s = inv.slots[i];
    const it = s && item(s.id);
    const zone = i < inv.beltSize ? 'f-belt' : 'f-pack';
    return `<button type="button" class="f-slot ${zone}${it ? '' : ' f-empty'}" data-i="${i}"`
      + `${it ? ` title="${esc(it.name)}" style="--tint:${it.tint}"` : ''}>`
      + (it ? `<em>${it.glyph}</em>${s.qty > 1 ? `<b>${s.qty}</b>` : ''}` : '')
      + `</button>`;
  }

  function invHTML() {
    const inv = game.inv;
    let h = `<div class="f-head">
      <button type="button" class="f-cycle" title="Cycle visible slots — test affordance">
        <span>🎒</span><b>${inv.size}</b><u>slots</u><i>⟳</i></button>
      <button type="button" class="f-trash" data-drop="1" title="Drag here to drop">✕</button>
    </div><div class="f-grid">`;
    h += `<div class="f-cap">Belt<i>${inv.beltSize}</i></div>`;
    for (let i = 0; i < inv.beltSize; i++) h += slotHTML(i);
    if (inv.packSize > 0) {
      h += `<div class="f-cap f-cap-pack">Pack<i>${inv.packSize}</i></div>`;
      for (let i = inv.beltSize; i < inv.size; i++) h += slotHTML(i);
    }
    return h + `</div>`;
  }

  function eqHTML() {
    let h = '<div class="f-doll">';
    for (const row of DOLL) {
      h += '<div class="f-drow">';
      for (const k of row) {
        const it = item(game.equip.slots[k]);
        const bad = held && !fitsSlot(held, k);
        h += `<button type="button" class="f-eq${it ? '' : ' f-empty'}${bad ? ' f-no' : ''}"`
          + ` data-slot="${k}" title="${esc(SLOT_LABEL[k])}${it ? ' — ' + esc(it.name) : ''}">`
          + `<span>${it ? `<em>${it.glyph}</em>` : ''}</span>`
          + `<i>${esc(shortLabel(k))}</i></button>`;
      }
      h += '</div>';
    }
    return h + `</div><div class="f-foot">Armour<b>${game.player.armour | 0}</b>`
      + `<s>${SLOTS.filter(k => game.equip.slots[k]).length}/${SLOTS.length} worn</s></div>`;
  }

  function skHTML() {
    let h = '<div class="f-skills">';
    for (const [k, name] of SKILLS) {
      const b = xpBand(game.skills[k] || 0);
      h += `<div class="f-sk"><span>${name}<b>${b.level}</b></span>`
        + `<u><i style="width:${(b.frac * 100).toFixed(1)}%"></i></u></div>`;
    }
    return h + '</div>';
  }

  function render() {
    body.dataset.tab = tab;
    body.innerHTML = tab === 'inv' ? invHTML() : tab === 'eq' ? eqHTML() : skHTML();
    for (const b of tabs.children) b.classList.toggle('on', b.dataset.tab === tab);
    take.style.display = game.controlled ? 'none' : '';
  }

  function toast(text, cls) {
    const el = document.createElement('div');
    el.className = 'f-toast' + (cls ? ' ' + cls : '');
    el.textContent = text;
    el.addEventListener('pointerdown', () => el.remove());
    toasts.appendChild(el);
    while (toasts.children.length > 4) toasts.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 2600);
  }

  const targetAt = (x, y) => {
    const el = document.elementFromPoint(x, y);
    return el && el.closest('[data-i],[data-slot],[data-drop]');
  };

  function endDrag(x, y) {
    ghost.classList.remove('on');
    body.querySelectorAll('.f-over, .f-no').forEach(e => e.classList.remove('f-over', 'f-no'));
    const d = drag; drag = null; held = null;
    if (!d || !d.moved) return d;
    const t = targetAt(x, y);
    if (t && t.dataset.drop) dropAt(d.from);
    else if (t && d.kind === 'inv' && t.dataset.i != null) game.inv.moveTo(d.from, +t.dataset.i);
    else if (t && d.kind === 'eq' && t.dataset.slot && t.dataset.slot !== d.from) {
      const to = t.dataset.slot;
      if (fitsSlot(d.id, to) && !game.equip.slots[to]) {
        game.equip.take(d.from);
        game.equip.put(to, d.id);
      }
    }
    schedule();
    return d;
  }

  function dropAt(i) {
    const s = game.inv.slots[i];
    if (!s) return;
    game.inv.dropAt(i);
    toast('Dropped ' + (item(s.id)?.name || s.id));
  }

  body.addEventListener('pointerdown', e => {
    const el = e.target.closest('[data-i],[data-slot]');
    if (!el) return;
    e.preventDefault();
    const isInv = el.dataset.i != null;
    const from = isInv ? +el.dataset.i : el.dataset.slot;
    const id = isInv ? game.inv.slots[from]?.id : game.equip.slots[from];
    if (!id) return;
    drag = {
      kind: isInv ? 'inv' : 'eq', from, id, moved: false,
      x: e.clientX, y: e.clientY, pid: e.pointerId,
      hold: setTimeout(() => {
        if (!drag || drag.moved) return;
        const d = drag;
        if (d.kind !== 'inv') return;
        drag = null;
        ghost.classList.remove('on');
        dropAt(d.from);
      }, 550),
    };
    try { el.setPointerCapture(e.pointerId); } catch {}
  });

  body.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.pid) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 9) return;
    if (!drag.moved) {
      drag.moved = true;
      clearTimeout(drag.hold);
      held = drag.id;
      const it = item(drag.id);
      ghost.innerHTML = `<em>${it.glyph}</em>`;
      ghost.classList.add('on');
      // Toggled in place, never re-rendered: rebuilding here detaches the element holding the
      // pointer capture and the drag dies on the next move.
      for (const el of body.querySelectorAll('[data-slot]')) {
        el.classList.toggle('f-no', !fitsSlot(held, el.dataset.slot));
      }
    }
    ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    const t = targetAt(e.clientX, e.clientY);
    body.querySelectorAll('.f-over').forEach(x => { if (x !== t) x.classList.remove('f-over'); });
    if (t && !t.classList.contains('f-no')) t.classList.add('f-over');
  });

  body.addEventListener('pointerup', e => {
    if (!drag || e.pointerId !== drag.pid) return;
    clearTimeout(drag.hold);
    const d = endDrag(e.clientX, e.clientY);
    if (!d || d.moved) return;
    if (d.kind === 'inv') game.inv.useAt(d.from);
    else {
      const id = game.equip.take(d.from);
      if (id && !game.inv.add(id, 1)) { game.equip.put(d.from, id); toast('Inventory full'); }
    }
    schedule();
  });

  body.addEventListener('pointercancel', () => {
    if (drag) clearTimeout(drag.hold);
    endDrag(-1, -1);
  });

  body.addEventListener('click', e => {
    const c = e.target.closest('.f-cycle');
    if (!c) return;
    const cur = forced ?? game.inv.size;
    applyForced(SIZES[(SIZES.indexOf(cur) + 1) % SIZES.length] ?? 5);
    toast('Grid → ' + game.inv.size + ' slots');
    render();
  });

  tabs.addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    tab = b.dataset.tab;
    render();
  });

  take.addEventListener('click', () => { game.control?.takeControl?.(); render(); });

  // Nothing under the panels may reach the canvas and walk the character.
  for (const el of [$('.f-dock'), take]) {
    el.addEventListener('pointerdown', e => e.stopPropagation());
    el.addEventListener('pointerup', e => e.stopPropagation());
  }

  game.on('change', schedule);
  game.on('toast', d => toast(d?.text || String(d)));
  game.on('levelup', d => toast(`${SKILLS.find(s => s[0] === d.skill)?.[1] || d.skill} level ${d.level}`, 'up'));
  // The test override must survive an equip, which recomputes belt and pack from the gear.

  render();

  const shown = { hp: game.player.hp, mp: game.player.mp };
  let wasControlled = game.controlled;

  return {
    update(dt) {
      const p = game.player;
      const k = Math.min(1, dt * 7);
      shown.hp += (p.hp - shown.hp) * k;
      shown.mp += (p.mp - shown.mp) * k;
      bars.hp.style.width = `${Math.max(0, Math.min(1, shown.hp / p.hpMax)) * 100}%`;
      bars.mp.style.width = `${Math.max(0, Math.min(1, shown.mp / p.mpMax)) * 100}%`;
      bars.hpT.textContent = `${Math.max(0, Math.round(p.hp))}/${p.hpMax}`;
      bars.mpT.textContent = `${Math.max(0, Math.round(p.mp))}/${p.mpMax}`;
      if (game.controlled !== wasControlled) {
        wasControlled = game.controlled;
        take.style.display = game.controlled ? 'none' : '';
      }
    },
  };
}
