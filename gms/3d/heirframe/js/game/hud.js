import * as THREE from 'three';
import { RARITY_COLOR } from './fx.js';

// HUD sync (throttled), minimap, objective marker and screen projection.
export function createHudSync(ctx) {
  const { ui, sim, world, player } = ctx;
  const cam = world.camera;
  const v = new THREE.Vector3(), v2 = new THREE.Vector3();
  let t = 0, mmT = 0;

  function project(p) {
    v.copy(p).project(cam);
    const W = innerWidth, H = innerHeight;
    const behind = v.z > 1;
    let x = (v.x + 1) / 2 * W, y = (1 - v.y) / 2 * H;
    if (behind) { x = W - x; y = H - y; }
    return { x, y, on: !behind && x >= 0 && x <= W && y >= 0 && y <= H };
  }

  // heading-up minimap: screen-up = camera forward; the UI's .me arrow shows the player's facing
  let meEl = null;
  function drawMinimap(obj) {
    const c = ui.hud.minimap;
    if (!c || !c.clientWidth) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const W = Math.round(c.clientWidth * dpr), H = Math.round(c.clientHeight * dpr);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const g = c.getContext('2d');
    g.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2, range = 42, s = R / range;
    const P = player.pos, yaw = ctx.rig.yaw;
    g.save();
    g.beginPath(); g.arc(cx, cy, R - 1, 0, Math.PI * 2); g.clip();
    g.translate(cx, cy); g.rotate(yaw);
    // district bounds
    const b = world.district.bounds;
    g.strokeStyle = 'rgba(160,228,255,.25)'; g.lineWidth = 1.5 * dpr; g.strokeRect((b.x0 - P.x) * s, (b.z0 - P.z) * s, (b.x1 - b.x0) * s, (b.z1 - b.z0) * s);
    const dot = (x, z, r, col) => { g.fillStyle = col; g.beginPath(); g.arc((x - P.x) * s, (z - P.z) * s, r * dpr, 0, Math.PI * 2); g.fill(); };
    for (const it of world.interactables) dot(it.x, it.z, 3.2, it.id === 'contracts' ? '#ffd27a' : it.id === 'warehouse' ? '#8fe8ff' : '#b8c8ff');
    if (ctx.crowd) for (const m of ctx.crowd.members) if (Math.abs(m.pos.x - P.x) < range && Math.abs(m.pos.z - P.z) < range) dot(m.pos.x, m.pos.z, 1.3, 'rgba(255,255,255,.45)');
    for (const e of ctx.enemies.list) if (e.state !== 'dead') dot(e.pos.x, e.pos.z, e.nonCombat ? 2.4 : 2.2, e.nonCombat ? '#ffd27a' : e.state === 'idle' ? '#ff9a6a' : '#ff4a4a');
    for (const o of ctx.props.loot) dot(o.pos.x, o.pos.z, 1.8, '#' + (o.credits ? 0xffc850 : RARITY_COLOR[o.item?.rarity] || 0xffffff).toString(16).padStart(6, '0'));
    if (obj) {
      let ox = (obj.x - P.x) * s, oy = (obj.z - P.z) * s;
      const d = Math.hypot(ox, oy), lim = R - 6 * dpr;
      if (d > lim) { ox = ox / d * lim; oy = oy / d * lim; }
      g.translate(ox, oy); g.rotate(-yaw);
      g.fillStyle = '#ffd27a'; g.strokeStyle = '#3a2a10'; g.lineWidth = dpr;
      g.beginPath(); g.moveTo(0, -5 * dpr); g.lineTo(5 * dpr, 0); g.lineTo(0, 5 * dpr); g.lineTo(-5 * dpr, 0); g.closePath(); g.fill(); g.stroke();
    }
    g.restore();
    // player facing relative to the camera (yaw 0 = +Z = toward the camera)
    meEl ||= c.parentElement?.querySelector('.me');
    if (meEl) meEl.style.transform = `rotate(${(Math.PI - player.yaw + yaw).toFixed(3)}rad)`;
  }

  function update(dt, { objective, show = true }) {
    t -= dt; mmT -= dt;
    if (!show) return;
    if (t <= 0) {
      t = 0.1;
      const h = sim.hud();
      if (ctx.goalOverride) h.goal = ctx.goalOverride();
      ui.hud.set(h);
      ui.skills.set(sim.skillsHud());
    }
    if (mmT <= 0) { mmT = 0.1; drawMinimap(objective); }
    if (objective) {
      const p = v2.set(objective.x, world.groundAt(objective.x, objective.z) + 2.2, objective.z);
      const s = project(p);
      const d = Math.hypot(objective.x - player.pos.x, objective.z - player.pos.z);
      // a visible nearby enemy needs no diamond on its head (it hid the rats)
      if (objective.enemy && s.on && d < 11) ui.marker.hide();
      else ui.marker.set(s.x, s.y, s.on, objective.label || '', Math.round(d));
    } else ui.marker.hide();
  }

  return { update, project, drawMinimap };
}
