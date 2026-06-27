// Weapon-pose debug tuner — activated by ?wpose. Drag sliders to align the
// CURRENT weapon's in-hand model (position / rotation / scale) to the hand &
// arm; it updates live, persists to localStorage, and the "Copy for weapons.js"
// button emits a paste-ready `hand:` block for every weapon. Use the on-screen
// ◀ ▶ to switch weapon, and "Aim pose" to lock the firing pose while tuning.
//
// Nothing here ships in normal play (only loaded when ?wpose is present).

import { WEAPONS } from './weapons.js';
import { qx } from './hero.js';

const KEY = 'deadtown_wpose_v1';
const r3 = (n) => Math.round(n * 1000) / 1000;

export function createWposeTuner(player, controls) {
  const rig = player.rig;
  const ids = Object.keys(WEAPONS);
  for (const id of ids) player.giveWeapon(id);     // own them all so we can cycle
  let idx = 0, forceAim = true;

  // load saved overrides, else start from the defaults in WEAPONS
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}
  const cfg = {};
  for (const id of ids) {
    const h = WEAPONS[id].hand, s = saved[id];
    cfg[id] = s ? { pos: s.pos.slice(), rot: s.rot.slice(), scale: s.scale }
                : { pos: h.pos.slice(), rot: h.rot.slice(), scale: h.scale ?? 1 };
  }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch {} };

  // closer camera so the weapon is easy to read
  if (controls) { controls.state.dist = 6.5; controls.state.pitch = 0.5; }

  // ── panel ──
  const style = document.createElement('style');
  style.textContent = `
    #wpose{position:fixed;right:6px;top:6px;width:230px;max-height:94vh;overflow:auto;z-index:60;
      background:rgba(12,14,10,.94);border:1px solid #4a5a3a;border-radius:10px;padding:8px 10px;
      font:12px -apple-system,system-ui,sans-serif;color:#dfe7d2;box-shadow:0 4px 18px #000a;pointer-events:auto}
    #wpose h4{margin:0 0 6px;font-size:13px;display:flex;align-items:center;justify-content:space-between}
    #wpose .nav button{background:#26301d;border:1px solid #4a5a3a;color:#dfe7d2;border-radius:6px;
      width:26px;height:24px;font-size:14px}
    #wpose .wn{font-weight:700;color:#ffd24a}
    #wpose .row{margin:5px 0}
    #wpose .row label{display:flex;justify-content:space-between;font-size:11px;color:#bcc8ad}
    #wpose input[type=range]{width:100%;margin:1px 0}
    #wpose .btns{display:flex;gap:5px;margin-top:7px}
    #wpose .btns button{flex:1;background:#2e3a22;border:1px solid #5a6e3a;color:#eaf2dd;
      border-radius:7px;padding:6px 4px;font-weight:600}
    #wpose .chk{display:flex;align-items:center;gap:6px;margin-top:6px}
    #wpose textarea{width:100%;height:88px;margin-top:6px;background:#0c0f08;color:#bfe39a;
      border:1px solid #3a4a2a;border-radius:6px;font:10px monospace;resize:vertical}
    #wpose .hint{font-size:10px;color:#8a967c;margin-top:4px}
  `;
  document.head.appendChild(style);

  const el = document.createElement('div');
  el.id = 'wpose';
  el.innerHTML = `
    <h4><span>🔧 Weapon Pose</span><span class="nav"><button id="wp-prev">◀</button> <button id="wp-next">▶</button></span></h4>
    <div class="wn" id="wp-name"></div>
    <div id="wp-sliders"></div>
    <label class="chk"><input type="checkbox" id="wp-aim" checked> Aim pose</label>
    <div class="btns"><button id="wp-reset">Reset</button><button id="wp-copy">Copy for weapons.js</button></div>
    <textarea id="wp-out" readonly placeholder="Copy output appears here — paste it back to Claude"></textarea>
    <div class="hint">Tune each weapon, hit Copy, paste the block back. Saved automatically.</div>
  `;
  document.body.appendChild(el);

  const SLIDERS = [
    ['pos', 0, 'Pos X', -0.5, 0.5, 0.005],
    ['pos', 1, 'Pos Y', -0.5, 0.5, 0.005],
    ['pos', 2, 'Pos Z', -0.6, 0.6, 0.005],
    ['rot', 0, 'Rot X', -3.15, 3.15, 0.02],
    ['rot', 1, 'Rot Y', -3.15, 3.15, 0.02],
    ['rot', 2, 'Rot Z', -3.15, 3.15, 0.02],
    ['scale', null, 'Scale', 0.3, 2.5, 0.02],
  ];
  const slidersHost = el.querySelector('#wp-sliders');
  const inputs = [];
  for (const [field, k, label, min, max, step] of SLIDERS) {
    const row = document.createElement('div'); row.className = 'row';
    const lab = document.createElement('label');
    const name = document.createElement('span'); name.textContent = label;
    const val = document.createElement('span');
    lab.append(name, val);
    const inp = document.createElement('input');
    inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step;
    inp.addEventListener('input', () => {
      const v = parseFloat(inp.value);
      if (field === 'scale') cfg[ids[idx]].scale = v; else cfg[ids[idx]][field][k] = v;
      val.textContent = r3(v); persist();
    });
    row.append(lab, inp); slidersHost.append(row);
    inputs.push({ field, k, inp, val });
  }

  function syncInputs() {
    const c = cfg[ids[idx]];
    for (const { field, k, inp, val } of inputs) {
      const v = field === 'scale' ? c.scale : c[field][k];
      inp.value = v; val.textContent = r3(v);
    }
    el.querySelector('#wp-name').textContent = `${WEAPONS[ids[idx]].name}  (${ids[idx]})`;
  }
  function select(n) { idx = (n + ids.length) % ids.length; player.selectWeapon(ids[idx]); syncInputs(); }

  el.querySelector('#wp-prev').onclick = () => select(idx - 1);
  el.querySelector('#wp-next').onclick = () => select(idx + 1);
  el.querySelector('#wp-aim').onchange = (e) => { forceAim = e.target.checked; };
  el.querySelector('#wp-reset').onclick = () => {
    const h = WEAPONS[ids[idx]].hand;
    cfg[ids[idx]] = { pos: h.pos.slice(), rot: h.rot.slice(), scale: h.scale ?? 1 };
    persist(); syncInputs();
  };
  el.querySelector('#wp-copy').onclick = () => {
    const lines = ids.map(id => {
      const c = cfg[id];
      return `  ${id}: hand: { pos: [${c.pos.map(r3).join(', ')}], rot: [${c.rot.map(r3).join(', ')}], scale: ${r3(c.scale)} },`;
    });
    const out = lines.join('\n');
    el.querySelector('#wp-out').value = out;
    try { navigator.clipboard?.writeText(out); } catch {}
    el.querySelector('#wp-out').select?.();
  };

  // apply every frame (own rAF; runs after the game loop so it wins). Keeps the
  // model transform live and, when enabled, holds the firing-arm pose.
  function frame() {
    requestAnimationFrame(frame);
    const c = cfg[ids[idx]], m = rig.currentWeaponModel?.();
    if (m) { m.position.set(c.pos[0], c.pos[1], c.pos[2]); m.rotation.set(c.rot[0], c.rot[1], c.rot[2]); m.scale.setScalar(c.scale); m.visible = true; }
    if (forceAim && rig.parts?.rArm) {
      rig.parts.rArm.apply(qx(-1.5).multiply(rig.DOWN_R));
      if (WEAPONS[ids[idx]].twoHand) rig.parts.lArm.apply(qx(-1.25).multiply(rig.DOWN_L));
    }
  }
  select(0); requestAnimationFrame(frame);
  console.log('[wpose] weapon-pose tuner active — adjust sliders, then "Copy for weapons.js"');
}
