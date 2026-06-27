// Weapon-pose debug tuner — activated by ?wpose. Two slider groups:
//   • In hand: the CURRENT weapon's model transform (pos / rot / scale) so the
//     gun/axe sits right in the grip.
//   • Aim arm: the firing stance — right shoulder (X/Y/Z), right elbow, and the
//     support arm (left shoulder X/Y/Z + elbow) for two-hand long guns.
// Everything updates live, persists to localStorage, and "Copy for weapons.js"
// emits a paste-ready `hand:` + `aim:` block for EVERY weapon in one click.
// Use ◀ ▶ to switch weapon, "Aim pose" to hold the firing stance while tuning,
// and "–" in the header to fold the panel away to peek at the character.
//
// Nothing here ships in normal play (only loaded when ?wpose is present).

import { WEAPONS } from './weapons.js';
import { qx, qy, qz } from './hero.js';

const KEY = 'deadtown_wpose_v2';
const r3 = (n) => Math.round(n * 1000) / 1000;
const v3 = (a) => `[${a.map(r3).join(', ')}]`;

export function createWposeTuner(player, controls) {
  const rig = player.rig;
  const ids = Object.keys(WEAPONS);
  for (const id of ids) player.giveWeapon(id);     // own them all so we can cycle
  let idx = 0, forceAim = true;

  // default config straight from WEAPONS (deep copy so edits don't mutate defs)
  const fresh = (id) => {
    const w = WEAPONS[id], h = w.hand, a = w.aim;
    return {
      hand: { pos: h.pos.slice(), rot: h.rot.slice(), scale: h.scale ?? 1 },
      aim: { rArm: a.rArm.slice(), rElb: a.rElb, lArm: a.lArm.slice(), lElb: a.lElb },
    };
  };
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}
  const cfg = {};
  for (const id of ids) cfg[id] = (saved[id] && saved[id].hand && saved[id].aim) ? saved[id] : fresh(id);
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch {} };

  // closer camera so the weapon is easy to read
  if (controls) { controls.state.dist = 6.5; controls.state.pitch = 0.5; }

  // ── panel ──
  const style = document.createElement('style');
  style.textContent = `
    #wpose{position:fixed;right:6px;top:6px;width:236px;max-height:94vh;overflow:auto;z-index:60;
      background:rgba(12,14,10,.94);border:1px solid #4a5a3a;border-radius:10px;padding:8px 10px;
      font:12px -apple-system,system-ui,sans-serif;color:#dfe7d2;box-shadow:0 4px 18px #000a;pointer-events:auto}
    #wpose.folded{max-height:none;overflow:visible}
    #wpose.folded .wp-body{display:none}
    #wpose h4{margin:0 0 6px;font-size:13px;display:flex;align-items:center;justify-content:space-between;gap:6px}
    #wpose .nav button,#wpose #wp-fold{background:#26301d;border:1px solid #4a5a3a;color:#dfe7d2;border-radius:6px;
      width:26px;height:24px;font-size:14px}
    #wpose .wn{font-weight:700;color:#ffd24a;margin-bottom:2px}
    #wpose .grp{margin:7px 0 2px;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#9fb087;
      border-top:1px solid #2c361f;padding-top:5px}
    #wpose .row{margin:4px 0}
    #wpose .row label{display:flex;justify-content:space-between;font-size:11px;color:#bcc8ad}
    #wpose .row.off{display:none}
    #wpose input[type=range]{width:100%;margin:1px 0}
    #wpose .btns{display:flex;gap:5px;margin-top:8px}
    #wpose .btns button{flex:1;background:#2e3a22;border:1px solid #5a6e3a;color:#eaf2dd;
      border-radius:7px;padding:6px 4px;font-weight:600}
    #wpose .chk{display:flex;align-items:center;gap:6px;margin-top:7px}
    #wpose textarea{width:100%;height:138px;margin-top:6px;background:#0c0f08;color:#bfe39a;
      border:1px solid #3a4a2a;border-radius:6px;font:10px monospace;resize:vertical}
    #wpose .hint{font-size:10px;color:#8a967c;margin-top:4px}
  `;
  document.head.appendChild(style);

  const el = document.createElement('div');
  el.id = 'wpose';
  el.innerHTML = `
    <h4>
      <span>🔧 Weapon Pose</span>
      <span class="nav"><button id="wp-prev">◀</button> <button id="wp-next">▶</button><button id="wp-fold" title="fold">–</button></span>
    </h4>
    <div class="wn" id="wp-name"></div>
    <div class="wp-body">
      <div class="grp">In hand</div>
      <div id="wp-hand"></div>
      <div class="grp">Aim arm</div>
      <div id="wp-arm"></div>
      <label class="chk"><input type="checkbox" id="wp-aim" checked> Aim pose</label>
      <div class="btns"><button id="wp-reset">Reset</button><button id="wp-copy">Copy all</button></div>
      <textarea id="wp-out" readonly placeholder="Copy output appears here — paste it back to Claude"></textarea>
      <div class="hint">Tune both groups, hit Copy all (every weapon, 1 click), paste back. Saved automatically.</div>
    </div>
  `;
  document.body.appendChild(el);

  // group:'hand' fields are pos/rot/scale; group:'aim' fields are rArm/rElb/lArm/lElb.
  // k = component index (null = scalar). lhand rows hide for one-hand weapons.
  const HAND = [
    { f: 'pos', k: 0, label: 'Pos X', min: -0.5, max: 0.5, step: 0.005 },
    { f: 'pos', k: 1, label: 'Pos Y', min: -0.5, max: 0.5, step: 0.005 },
    { f: 'pos', k: 2, label: 'Pos Z', min: -0.6, max: 0.6, step: 0.005 },
    { f: 'rot', k: 0, label: 'Rot X', min: -3.15, max: 3.15, step: 0.02 },
    { f: 'rot', k: 1, label: 'Rot Y', min: -3.15, max: 3.15, step: 0.02 },
    { f: 'rot', k: 2, label: 'Rot Z', min: -3.15, max: 3.15, step: 0.02 },
    { f: 'scale', k: null, label: 'Scale', min: 0.3, max: 2.5, step: 0.02 },
  ];
  const ARM = [
    { f: 'rArm', k: 0, label: 'R shldr X (raise)', min: -3.15, max: 0.6, step: 0.02 },
    { f: 'rArm', k: 1, label: 'R shldr Y (across)', min: -1.6, max: 1.6, step: 0.02 },
    { f: 'rArm', k: 2, label: 'R shldr Z (roll)', min: -1.6, max: 1.6, step: 0.02 },
    { f: 'rElb', k: null, label: 'R elbow', min: -2.6, max: 0.6, step: 0.02 },
    { f: 'lArm', k: 0, label: 'L shldr X (raise)', min: -3.15, max: 0.6, step: 0.02, lhand: true },
    { f: 'lArm', k: 1, label: 'L shldr Y (across)', min: -1.6, max: 1.6, step: 0.02, lhand: true },
    { f: 'lArm', k: 2, label: 'L shldr Z (roll)', min: -1.6, max: 1.6, step: 0.02, lhand: true },
    { f: 'lElb', k: null, label: 'L elbow', min: -2.6, max: 0.6, step: 0.02, lhand: true },
  ];

  const getV = (c, s) => { const o = c[s.group]; return s.k == null ? o[s.f] : o[s.f][s.k]; };
  const setV = (c, s, v) => { const o = c[s.group]; if (s.k == null) o[s.f] = v; else o[s.f][s.k] = v; };

  const inputs = [];
  function build(host, list, group) {
    for (const s of list) {
      const spec = { ...s, group };
      const row = document.createElement('div'); row.className = 'row';
      const lab = document.createElement('label');
      const nm = document.createElement('span'); nm.textContent = s.label;
      const val = document.createElement('span'); lab.append(nm, val);
      const inp = document.createElement('input');
      inp.type = 'range'; inp.min = s.min; inp.max = s.max; inp.step = s.step;
      inp.addEventListener('input', () => { const v = parseFloat(inp.value); setV(cfg[ids[idx]], spec, v); val.textContent = r3(v); persist(); });
      row.append(lab, inp); host.append(row);
      inputs.push({ spec, inp, val, row });
    }
  }
  build(el.querySelector('#wp-hand'), HAND, 'hand');
  build(el.querySelector('#wp-arm'), ARM, 'aim');

  function syncInputs() {
    const c = cfg[ids[idx]], two = !!WEAPONS[ids[idx]].twoHand;
    for (const { spec, inp, val, row } of inputs) {
      const v = getV(c, spec);
      inp.value = v; val.textContent = r3(v);
      if (spec.lhand) row.classList.toggle('off', !two);   // hide support-arm rows for one-handers
    }
    el.querySelector('#wp-name').textContent = `${WEAPONS[ids[idx]].name}  (${ids[idx]})${two ? '  · two-hand' : ''}`;
  }
  function select(n) { idx = (n + ids.length) % ids.length; player.selectWeapon(ids[idx]); syncInputs(); }

  el.querySelector('#wp-prev').onclick = () => select(idx - 1);
  el.querySelector('#wp-next').onclick = () => select(idx + 1);
  el.querySelector('#wp-fold').onclick = () => {
    el.classList.toggle('folded');
    el.querySelector('#wp-fold').textContent = el.classList.contains('folded') ? '+' : '–';
  };
  el.querySelector('#wp-aim').onchange = (e) => { forceAim = e.target.checked; };
  el.querySelector('#wp-reset').onclick = () => { cfg[ids[idx]] = fresh(ids[idx]); persist(); syncInputs(); };
  el.querySelector('#wp-copy').onclick = () => {
    const out = ids.map(id => {
      const c = cfg[id], h = c.hand, a = c.aim, two = !!WEAPONS[id].twoHand;
      let aim = `aim: { rArm: ${v3(a.rArm)}, rElb: ${r3(a.rElb)}`;
      if (two) aim += `, lArm: ${v3(a.lArm)}, lElb: ${r3(a.lElb)}`;
      aim += ' }';
      return `${id}:\n  hand: { pos: ${v3(h.pos)}, rot: ${v3(h.rot)}, scale: ${r3(h.scale)} },\n  ${aim},`;
    }).join('\n');
    const ta = el.querySelector('#wp-out');
    ta.value = out;
    try { navigator.clipboard?.writeText(out); } catch {}
    ta.focus(); ta.select?.();
    const btn = el.querySelector('#wp-copy'); const old = btn.textContent;
    btn.textContent = 'Copied ✓'; setTimeout(() => { btn.textContent = old; }, 1100);
  };

  // apply every frame (own rAF; runs after the game loop so it wins). Keeps the
  // model transform live and, when enabled, holds the per-weapon firing stance.
  function frame() {
    requestAnimationFrame(frame);
    const c = cfg[ids[idx]], m = rig.currentWeaponModel?.();
    if (m) { m.position.set(c.hand.pos[0], c.hand.pos[1], c.hand.pos[2]); m.rotation.set(c.hand.rot[0], c.hand.rot[1], c.hand.rot[2]); m.scale.setScalar(c.hand.scale); m.visible = true; }
    if (forceAim && rig.parts?.rArm) {
      const a = c.aim, P = rig.parts;
      P.rArm.apply(qx(a.rArm[0]).multiply(qy(a.rArm[1])).multiply(qz(a.rArm[2])).multiply(rig.DOWN_R));
      P.rElb.apply(qx(a.rElb));
      if (WEAPONS[ids[idx]].twoHand) {
        P.lArm.apply(qx(a.lArm[0]).multiply(qy(a.lArm[1])).multiply(qz(a.lArm[2])).multiply(rig.DOWN_L));
        P.lElb.apply(qx(a.lElb));
      }
    }
  }
  select(0); requestAnimationFrame(frame);
  console.log('[wpose] tuner active — In hand + Aim arm sliders; "Copy all" emits every weapon.');
}
