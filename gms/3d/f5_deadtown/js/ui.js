// HUD for Deadtown: HP bar, ammo counter, the weapon picker, score/kills, the
// medkit + Use buttons, the centre interaction prompt, toasts, damage flash and
// the death screen. Plain DOM driven by main via a small API. Popups only —
// never alert().

import { WEAPONS } from './weapons.js';

const $ = (id) => document.getElementById(id);
let P = null, ACT = null;

export function setBoot(text, frac) {
  const s = $('boot-status'); if (s && text) s.textContent = text;
  const b = $('boot-bar'); if (b && frac != null) b.firstElementChild.style.width = Math.round(frac * 100) + '%';
}
export function hideBoot(showHud = true) { $('boot')?.classList.add('hidden'); if (showHud) $('hud')?.classList.remove('hidden'); }

export function initHud(player, actions) {
  P = player; ACT = actions;
  $('act-med')?.addEventListener('click', () => actions.useMedkit());
  $('act-use')?.addEventListener('click', () => actions.interact());
  $('btn-restart')?.addEventListener('click', () => actions.restart());
  const ammoChip = document.querySelector('.ammo-chip');
  if (ammoChip) { ammoChip.style.pointerEvents = 'auto'; ammoChip.title = 'Reload'; ammoChip.addEventListener('click', () => actions.reload?.()); }
  buildWeapons();
}

export function buildWeapons() {
  const wrap = $('weapons'); if (!wrap || !P) return;
  wrap.innerHTML = '';
  for (const id of P.weapons) {
    const def = WEAPONS[id];
    const b = document.createElement('button');
    b.className = 'wchip' + (id === P.curWeapon ? ' active' : '');
    b.dataset.w = id;
    b.innerHTML = `<span class="wi">${def.icon}</span><span class="wn">${def.name}</span>`;
    b.addEventListener('click', () => ACT.selectWeapon(id));
    wrap.appendChild(b);
  }
}
export function setWeaponActive(id) {
  document.querySelectorAll('#weapons .wchip').forEach(b => b.classList.toggle('active', b.dataset.w === id));
  bars();
}

export function bars() {
  if (!P) return;
  const hpFrac = Math.max(0, P.hp / P.maxHp);
  const hb = $('hp-fill'); if (hb) hb.style.width = (hpFrac * 100) + '%';
  const ht = $('hp-num'); if (ht) ht.textContent = Math.ceil(P.hp);
  const def = P.weaponDef();
  const at = $('ammo'); if (at) at.textContent = def.ammo ? (P.reloading ? '⟳ …' : `${P.curMag()}/${P.ammo[def.ammo] || 0}`) : '∞';
  const ak = $('ammo-kind'); if (ak) ak.textContent = def.kind === 'melee' ? def.icon : '🔫';
  const md = $('med-num'); if (md) md.textContent = P.medkits;
  const sc = $('score'); if (sc) sc.textContent = `${P.kills}`;
}

export function setCombo(n, mult) {
  const el = $('combo'); if (!el) return;
  if (n < 2) { el.classList.add('hidden'); return; }
  el.innerHTML = `<b>${n}</b> KILL STREAK <span>×${mult}</span>`;
  el.classList.remove('hidden');
  el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
}

export function setObjective(text) {
  const el = $('objective'); if (!el) return;
  el.textContent = '🎯 ' + text;
  el.classList.remove('hidden');
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
}

export function prompt(text) {
  const el = $('prompt'); const use = $('act-use');
  if (!el) return;
  if (text) { el.textContent = text; el.classList.remove('hidden'); use?.classList.remove('hidden'); }
  else { el.classList.add('hidden'); use?.classList.add('hidden'); }
}

export function toast(msg) {
  const wrap = $('toasts'); if (!wrap) return;
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  wrap.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 350); }, 2400);
}

export function hurtFlash() {
  const f = $('dmgflash'); if (!f) return;
  f.classList.add('on'); setTimeout(() => f.classList.remove('on'), 180);
}

export function showDeath(stats) {
  const d = $('panel-death'); if (!d) return;
  $('death-stats').textContent = stats;
  d.classList.remove('hidden');
}
export function hideDeath() { $('panel-death')?.classList.add('hidden'); }
