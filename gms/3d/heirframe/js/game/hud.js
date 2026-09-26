import * as THREE from 'three';
import { RARITY_COLOR } from './fx.js';

// HUD sync (throttled), minimap, objective marker and screen projection.
export function createHudSync(ctx) {
  const { ui, sim, world, player } = ctx;
  const cam = world.camera;
  const v = new THREE.Vector3();
  let t = 0, mmT = 0;

  function project(p) {
    v.copy(p).project(cam);
    const W = innerWidth, H = innerHeight;
    const behind = v.z > 1;
    let x = (v.x + 1) / 2 * W, y = (1 - v.y) / 2 * H;
    if (behind) { x = W - x; y = H - y; }
    return { x, y, on: !behind && x >= 0 && x <= W && y >= 0 && y <= H };
  }

  function drawMinimap(obj) {
    const c = ui.hud.minimap;
    if (!c || !c.clientWidth) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const W = Math.round(c.clientWidth * dpr), H = Math.round(c.clientHeight * dpr);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const g = c.getContext('2d');
    g.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2, range = 42, s = R / range;
    const P = player.pos;
    const to = (x, z) => [cx + (x - P.x) * s, cy + (z - P.z) * s];
    g.save();
    g.beginPath(); g.arc(cx, cy, R - 1, 0, Math.PI * 2); g.clip();
    // district bounds
    const b = world.district.bounds;
    const [x0, y0] = to(b.x0, b.z0), [x1, y1] = to(b.x1, b.z1);
    g.strokeStyle = 'rgba(160,228,255,.25)'; g.lineWidth = 1.5 * dpr; g.strokeRect(x0, y0, x1 - x0, y1 - y0);
    const dot = (x, z, r, col) => { const [px, py] = to(x, z); g.fillStyle = col; g.beginPath(); g.arc(px, py, r * dpr, 0, Math.PI * 2); g.fill(); };
    for (const it of world.interactables) dot(it.x, it.z, 3.2, it.id === 'contracts' ? '#ffd27a' : it.id === 'warehouse' ? '#8fe8ff' : '#b8c8ff');
    if (ctx.crowd) for (const m of ctx.crowd.members) if (Math.abs(m.pos.x - P.x) < range && Math.abs(m.pos.z - P.z) < range) dot(m.pos.x, m.pos.z, 1.3, 'rgba(255,255,255,.45)');
    for (const e of ctx.enemies.list) if (e.state !== 'dead') dot(e.pos.x, e.pos.z, e.nonCombat ? 2.4 : 2.2, e.nonCombat ? '#ffd27a' : e.state === 'idle' ? '#ff9a6a' : '#ff4a4a');
    for (const o of ctx.props.loot) dot(o.pos.x, o.pos.z, 1.8, '#' + (o.credits ? 0xffc850 : RARITY_COLOR[o.item?.rarity] || 0xffffff).toString(16).padStart(6, '0'));
    g.restore();
    if (obj) {
      let [ox, oy] = to(obj.x, obj.z);
      const dx = ox - cx, dy = oy - cy, d = Math.hypot(dx, dy);
      if (d > R - 6 * dpr) { ox = cx + dx / d * (R - 6 * dpr); oy = cy + dy / d * (R - 6 * dpr); }
      g.fillStyle = '#ffd27a'; g.strokeStyle = '#3a2a10'; g.lineWidth = dpr;
      g.beginPath(); g.moveTo(ox, oy - 5 * dpr); g.lineTo(ox + 5 * dpr, oy); g.lineTo(ox, oy + 5 * dpr); g.lineTo(ox - 5 * dpr, oy); g.closePath(); g.fill(); g.stroke();
    }
    // player arrow (yaw 0 = facing +Z = down the map)
    g.save(); g.translate(cx, cy); g.rotate(-player.yaw + Math.PI);
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(0, -6 * dpr); g.lineTo(4.5 * dpr, 5 * dpr); g.lineTo(0, 2.5 * dpr); g.lineTo(-4.5 * dpr, 5 * dpr); g.closePath(); g.fill();
    g.restore();
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
      const p = new THREE.Vector3(objective.x, world.groundAt(objective.x, objective.z) + 2.2, objective.z);
      const s = project(p);
      const d = Math.hypot(objective.x - player.pos.x, objective.z - player.pos.z);
      ui.marker.set(s.x, s.y, s.on, objective.label || '', Math.round(d));
    } else ui.marker.hide();
  }

  return { update, project, drawMinimap };
}
