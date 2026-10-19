import * as THREE from 'three';

// DOM layer over the battle canvas: floating damage/heal/crit numbers, overhead HP bars with role icons,
// and cinematic banners (ROUND n/N, overdrive callouts, VICTORY/DEFEAT). Pointer-events none throughout.
const CSS = `
.vpb-ov{position:absolute;inset:0;pointer-events:none;overflow:hidden;font-family:"Orbitron","Rajdhani","Segoe UI",system-ui,sans-serif;contain:strict}
.vpb-num{position:absolute;left:0;top:0;font-weight:800;white-space:nowrap;will-change:transform,opacity;
  text-shadow:0 0 6px rgba(0,0,0,.9),0 2px 0 rgba(0,0,0,.8);letter-spacing:.02em}
.vpb-num.dmg{color:#fff;font-size:12px}
.vpb-num.edmg{color:#ffffff;font-size:12px}
.vpb-num.crit{color:#ffe14d;font-size:16px;z-index:2;text-shadow:0 0 10px rgba(255,140,0,.9),0 2px 0 #000}
.vpb-num.crit::after{content:"CRIT";display:block;font-size:7px;letter-spacing:.2em;text-align:center;margin-top:-3px}
.vpb-num.heal{color:#5dff9a;font-size:12px;text-shadow:0 0 8px rgba(0,255,120,.6),0 2px 0 #000}
.vpb-num.shield{color:#7fd8ff;font-size:11px}
.vpb-num.status{color:#d8a8ff;font-size:10px;font-weight:700;letter-spacing:.08em}
.vpb-num.dot{color:#ff9a3a;font-size:11px}
.vpb-num.pierce{color:#c48cff;font-size:12px}
.vpb-num.shield{color:#5fe8ff}
.vpb-num.adv::before{content:"▲";font-size:10px;color:#ff9a3a;margin-right:2px;vertical-align:middle}
.vpb-bar{position:absolute;left:0;top:0;display:flex;align-items:center;gap:2px;will-change:transform}
.vpb-bar .ic{width:11px;height:11px;border-radius:2px;display:grid;place-items:center;font-size:8px;line-height:1;font-weight:900;color:#fff;
  background:rgba(8,16,36,.9);border:1px solid currentColor;box-shadow:0 0 4px currentColor}
.vpb-bar .hp{width:36px;height:4px;background:rgba(5,10,24,.85);border:1px solid rgba(160,200,255,.35);position:relative;overflow:hidden;
  border-radius:1px}
.vpb-bar .hp i{position:absolute;inset:0;transform-origin:0 50%;background:repeating-linear-gradient(90deg,var(--c) 0 3px,transparent 3px 4px)}
.vpb-bar .hp b{position:absolute;inset:0;transform-origin:0 50%;background:rgba(255,255,255,.75)}
.vpb-bar .hp s{position:absolute;inset:0;transform-origin:0 50%;background:rgba(140,220,255,.55);text-decoration:none}
.vpb-bar.dead{opacity:0;transition:opacity .4s}
.vpb-bar{transition:opacity .25s}.vpb-bar.off{opacity:0}
.vpb-bar{flex-wrap:wrap;width:56px}
.vpb-bar .note{flex-basis:100%;font-size:7.5px;font-weight:700;letter-spacing:.1em;color:#d8b8ff;text-shadow:0 0 4px #000,0 1px 0 #000;
  opacity:0;transition:opacity .25s;white-space:nowrap}
.vpb-bar .note.on{opacity:1}
.vpb-od{position:absolute;top:70px;max-width:94%;padding:5px 12px 6px;background:linear-gradient(90deg,rgba(4,10,26,.92),rgba(4,10,26,.72));
  border:1px solid currentColor;box-shadow:0 0 12px currentColor,inset 0 0 10px rgba(0,0,0,.6);opacity:0;pointer-events:none}
.vpb-od{left:var(--cx,50%);text-align:center;--x0:-160%;transform:translateX(var(--x0))}
.vpb-od.player{border-left-width:4px}
.vpb-od.enemy{border-right-width:4px;--x0:60%}
.vpb-od .s{font-size:9px;letter-spacing:.18em;color:#9fc8ff;white-space:nowrap}
.vpb-od .t{font-size:16px;font-weight:900;letter-spacing:.08em;color:#fff;white-space:nowrap}
.vpb-od.go{animation:vpbOd 2.1s cubic-bezier(.2,.9,.3,1) forwards}
@keyframes vpbOd{0%{opacity:0}10%{opacity:1;transform:translateX(-50%)}82%{opacity:1;transform:translateX(-50%)}100%{opacity:0;transform:translateX(-50%)}}
.vpb-ot{position:absolute;left:var(--cx,50%);transform:translateX(-50%) scale(.8);padding:2px 12px 3px;font-size:11px;font-weight:900;letter-spacing:.32em;color:#ffd0d0;background:linear-gradient(90deg,rgba(60,0,8,0),rgba(90,6,16,.85) 20%,rgba(90,6,16,.85) 80%,rgba(60,0,8,0));border-top:1px solid #ff3a4a;border-bottom:1px solid #ff3a4a;text-shadow:0 0 8px #ff2030;opacity:0;transition:opacity .4s,transform .4s;pointer-events:none;white-space:nowrap}
.vpb-ot.on{opacity:1;transform:translateX(-50%) scale(1);animation:vpbOt 1.1s ease-in-out infinite}
.vpb-ot small{font-size:9px;letter-spacing:.12em;margin-left:8px;color:#ff9aa4}
@keyframes vpbOt{50%{box-shadow:0 0 18px rgba(255,40,60,.55)}}
.vpb-banner{position:absolute;left:0;right:0;top:40%;display:flex;flex-direction:column;align-items:center;text-align:center;opacity:0;transform:scale(.9);color:#e8f6ff;
  font-weight:900;letter-spacing:.14em;text-shadow:0 0 14px #29a8ff,0 0 3px #fff}
.vpb-banner .t{font-size:clamp(28px,9vw,44px)}
.vpb-banner .s{font-size:clamp(11px,3.4vw,15px);letter-spacing:.3em;color:#9fd6ff;margin-top:4px}
.vpb-banner.od .t{font-size:clamp(17px,5.6vw,26px)}
.vpb-banner.od{top:33%;padding:6px 0 8px;background:linear-gradient(90deg,transparent,rgba(3,8,22,.62) 18%,rgba(3,8,22,.62) 82%,transparent)}
.vpb-banner.od .s{order:-1;margin:0 0 2px}
.vpb-banner.show{animation:vpbIn 1.6s ease-out forwards}
.vpb-banner.hold{animation:vpbHold 2.4s ease-out forwards}
.vpb-banner .bar{height:2px;margin:6px auto 0;width:60%;background:linear-gradient(90deg,transparent,currentColor,transparent)}
@keyframes vpbIn{0%{opacity:0;transform:scale(1.25)}12%{opacity:1;transform:scale(1)}75%{opacity:1}100%{opacity:0;transform:scale(.98)}}
@keyframes vpbHold{0%{opacity:0;transform:scale(1.3)}15%{opacity:1;transform:scale(1)}100%{opacity:1;transform:scale(1)}}
`;
const ROLE_IC = { tank: '⛨', archer: '➶', mage: '✦' };
const ROLE_COL = { tank: '#7fd0ff', archer: '#7fffd2', mage: '#d39cff' };

export function createOverlay(container, camera, { maxNums = 48, bars = true } = {}) {
  if (!document.getElementById('vpb-css')) {
    const st = document.createElement('style'); st.id = 'vpb-css'; st.textContent = CSS; document.head.appendChild(st);
  }
  const root = document.createElement('div');
  root.className = 'vpb-ov';
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  container.appendChild(root);
  const v = new THREE.Vector3();
  let W = 1, H = 1;
  const nums = [];
  for (let i = 0; i < maxNums; i++) {
    const el = document.createElement('div'); el.className = 'vpb-num'; el.style.opacity = '0';
    root.appendChild(el); nums.push({ el, t: 1, life: 1, x: 0, y: 0, z: 0, on: false, dx: 0 });
  }
  let ni = 0;
  const unitBars = new Map();
  const banner = document.createElement('div'); banner.className = 'vpb-banner'; root.appendChild(banner);
  const odEl = document.createElement('div'); odEl.className = 'vpb-od'; root.appendChild(odEl);
  const otEl = document.createElement('div'); otEl.className = 'vpb-ot'; otEl.style.top = '70px'; root.appendChild(otEl);
  let lifeK = 1, topPx = 64, plateY = null;
  const frame = { left: 0, right: 0 };
  const MAX_PER_TARGET = 1; // battle-3: one number per target (ref_02 clutter); a new hit merges or replaces it

  function project(x, y, z) {
    v.set(x, y, z).project(camera);
    return [(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H, v.z];
  }
  const O = {
    root,
    resize() { W = container.clientWidth || 1; H = container.clientHeight || 1; if (frame.left || frame.right) O.setFrame(frame); },
    // kind: dmg | edmg | crit | heal | shield | status | dot. value: number (mergeable) or string.
    // opts.key (target id) stacks numbers per target in free rows so they never overlap; rapid same-kind numbers on
    // one target (DoT ticks, multi-hits) merge into one rising total instead of spawning new ones.
    number(pos, value, kind = 'dmg', { adv = false, key = null, prefix = '' } = {}) {
      const mergeable = typeof value === 'number' && kind !== 'crit';
      if (key != null && mergeable) {
        for (const n of nums) {
          if (n.on && n.key === key && n.kind === kind && n.t < 0.32) {
            n.value += value; n.el.textContent = prefix + n.value; n.t = Math.min(n.t, 0.06); n.pop = 0; return;
          }
        }
      }
      if (key != null) {
        // one live number per target (MAX_PER_TARGET): a new hit replaces it, except that a fresh crit is never replaced by a plain hit
        let live = 0;
        for (const n of nums) if (n.on && n.key === key) live++;
        if (live >= MAX_PER_TARGET) {
          if (kind !== 'crit' && nums.some((n) => n.on && n.key === key && n.kind === 'crit' && n.t < n.life * 0.6)) return; // a fresh crit wins
          for (const n of nums) if (n.on && n.key === key) { n.on = false; n.el.style.opacity = '0'; } // other kind: replace
        }
      }
      let row = 0;
      if (key != null) {
        const used = new Set();
        for (const n of nums) if (n.on && n.key === key && n.t < n.life * 0.75) used.add(n.row);
        while (used.has(row)) row++;
      }
      const n = nums[ni++ % nums.length];
      n.el.className = 'vpb-num ' + kind + (adv ? ' adv' : '');
      n.el.textContent = prefix + value;
      n.value = typeof value === 'number' ? value : 0; n.kind = kind; n.key = key; n.row = row; n.pop = 0;
      n.x = pos.x; n.y = pos.y; n.z = pos.z; n.t = 0; n.life = (kind === 'crit' ? 1.2 : kind === 'status' ? 1.1 : 0.9) * lifeK; n.on = true;
      n.dx = (row % 2 ? 1 : -1) * (6 + row * 4) + (Math.random() - 0.5) * 8; n.big = kind === 'crit';
    },
    addBar(id, { role, color, side }) {
      if (!bars) return;
      const el = document.createElement('div'); el.className = 'vpb-bar';
      const c = side === 'enemy' ? '#ff3b4a' : '#3dff8a';
      el.innerHTML = `<span class="ic" style="color:${ROLE_COL[role] || color}">${ROLE_IC[role] || '•'}</span><span class="hp" style="--c:${c}"><b></b><i></i><s></s></span>`;
      root.appendChild(el);
      const [b, i, s] = el.querySelectorAll('.hp > *');
      const note = document.createElement('span'); note.className = 'note'; el.appendChild(note);
      unitBars.set(id, { el, b, i, s, note, noteT: 0, hp: 1, lag: 1, sh: 0, anchor: null, visible: true });
    },
    setBar(id, hpPct, shieldPct = 0) { const B = unitBars.get(id); if (B) { B.hp = hpPct; B.sh = shieldPct; } },
    showBar(id, on) { const B = unitBars.get(id); if (B) B.el.classList.toggle('off', !on); },
    barAnchor(id, obj) { const B = unitBars.get(id); if (B) B.anchor = obj; },
    killBar(id) { const B = unitBars.get(id); if (B) B.el.classList.add('dead'); },
    removeBar(id) { const B = unitBars.get(id); if (B) { B.el.remove(); unitBars.delete(id); } },
    setSpeed(sp) { lifeK = sp >= 4 ? 0.6 : sp >= 2 ? 0.78 : 1; },
    // BATTLE-L: centre the OD callout, OVERTIME plate and banners on the board band between the side HUD bands (CSS px)
    setFrame({ left = 0, right = 0 } = {}) {
      left = +left || 0; right = +right || 0;
      if (!left && !right) { frame.left = frame.right = 0; root.style.removeProperty('--cx'); banner.style.left = banner.style.right = ''; return; }
      root.style.setProperty('--cx', Math.round((left + W - right) / 2) + 'px');
      banner.style.left = left + 'px'; banner.style.right = right + 'px';
      frame.left = left; frame.right = right;
    },
    setTop(px) { topPx = px; if (plateY == null) odEl.style.top = (px + 30) + 'px'; otEl.style.top = (px + 6) + 'px'; },
    // battle-4: the OD callout sits in the dark deck band between the back barrier and the floor's far edge (centre y, CSS px),
    // clear of the league screen and of the top HUD whatever its height
    setPlateY(y) { plateY = y; if (y != null) odEl.style.top = Math.max(topPx + 4, Math.round(y - 18)) + 'px'; },
    // OVERTIME plate under the top HUD: on = bool, mult = current damage multiplier
    overtime(on, mult = 1) {
      otEl.classList.toggle('on', !!on);
      if (on) otEl.innerHTML = `OVERTIME<small>DMG ×${mult.toFixed(2)} · HEALS ½</small>`;
    },
    // small passive-proc caption under a unit's HP bar
    barNote(id, text) { const B = unitBars.get(id); if (!B) return; B.note.textContent = text; B.note.classList.add('on'); B.noteT = 1.3; },
    // compact Overdrive callout under the top HUD bar, sliding in from the caster's side
    odPlate(title, sub, color, side = 'player') {
      odEl.className = 'vpb-od ' + side;
      odEl.style.color = color;
      odEl.innerHTML = `<div class="s">${sub}</div><div class="t">${title}</div>`;
      void odEl.offsetWidth;
      odEl.classList.add('go');
    },
    banner(title, sub = '', { cls = '', color = '#29a8ff', hold = false } = {}) {
      banner.className = 'vpb-banner ' + cls;
      banner.style.color = color;
      banner.innerHTML = `<div class="t">${title}</div>${sub ? `<div class="s">${sub}</div>` : ''}<div class="bar"></div>`;
      banner.querySelector('.t').style.textShadow = `0 0 16px ${color}, 0 0 3px #fff`;
      void banner.offsetWidth;
      banner.classList.add(hold ? 'hold' : 'show');
    },
    clearBanner() { banner.className = 'vpb-banner'; },
    update(dt) {
      for (const n of nums) {
        if (!n.on) continue;
        n.t += dt;
        const k = n.t / n.life;
        if (k >= 1) { n.on = false; n.el.style.opacity = '0'; continue; }
        const [sx, sy, sz] = project(n.x, n.y, n.z);
        const rise = -34 * (1 - Math.pow(1 - k, 2)) - 6 - n.row * 22;
        const pop = n.big ? (k < 0.12 ? 1.6 - k * 5 : 1) : (k < 0.1 ? 1.25 - k * 2.5 : 1);
        n.el.style.opacity = String(sz > 1 ? 0 : k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3);
        n.el.style.transform = `translate3d(${(sx + n.dx * (0.4 + k * 0.6)) | 0}px,${(sy + rise) | 0}px,0) translate(-50%,-50%) scale(${pop.toFixed(2)})`;
      }
      for (const B of unitBars.values()) {
        if (!B.anchor) continue;
        B.anchor.getWorldPosition(v);
        const [sx, sy] = project(v.x, v.y, v.z);
        B.lag += (B.hp - B.lag) * Math.min(1, dt * 3);
        if (B.noteT > 0) { B.noteT -= dt; if (B.noteT <= 0) B.note.classList.remove('on'); }
        if (B.lag < B.hp) B.lag = B.hp;
        B.el.style.transform = `translate3d(${(sx - 25) | 0}px,${(sy - 8) | 0}px,0)`;
        B.i.style.transform = `scaleX(${B.hp.toFixed(3)})`;
        B.b.style.transform = `scaleX(${B.lag.toFixed(3)})`;
        B.s.style.transform = `scaleX(${Math.min(1, B.sh).toFixed(3)})`;
      }
    },
    dispose() { root.remove(); },
  };
  O.resize();
  return O;
}
