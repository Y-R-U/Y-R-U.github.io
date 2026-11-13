const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const VIEW = 105; // metres from centre to rim
const HORDE = '#a4ff1a';

export function createMinimap(canvas) {
  const g = canvas.getContext('2d');
  let size = 0, dpr = 1, base = null, map = null, frame = 0;

  function resize() {
    dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const s = canvas.clientWidth || 100;
    if (s === size && canvas.width === Math.round(s * dpr)) return;
    size = s;
    canvas.width = canvas.height = Math.round(s * dpr);
  }

  function setMap(m) {
    map = m;
    const px = 2, S = Math.ceil(m.size * px);
    base = document.createElement('canvas');
    base.width = base.height = S;
    const b = base.getContext('2d');
    b.fillStyle = '#5b6681'; b.fillRect(0, 0, S, S);
    b.fillStyle = '#6f7b98';
    for (const p of m.plazas || []) { b.beginPath(); b.arc((p.x + m.size / 2) * px, (p.z + m.size / 2) * px, p.r * px, 0, Math.PI * 2); b.fill(); }
    b.fillStyle = '#2c3349';
    for (const o of m.obstacles) {
      b.beginPath();
      if (o.type === 'rect') b.rect((o.x - o.w / 2 + m.size / 2) * px, (o.z - o.d / 2 + m.size / 2) * px, o.w * px, o.d * px);
      else b.arc((o.x + m.size / 2) * px, (o.z + m.size / 2) * px, o.r * px, 0, Math.PI * 2);
      b.fill();
    }
    resize();
  }

  function draw(state, me, yaw, alpha, zones = []) {
    if (!map || !size) { resize(); if (!size) return; }
    if ((frame++ & 1) === 1) return;
    const W = canvas.width, R = W / 2, k = R / VIEW;
    const c0 = state.crowds[me];
    const cx = c0.px + (c0.x - c0.px) * alpha, cz = c0.pz + (c0.z - c0.pz) * alpha;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, W);
    g.save();
    g.beginPath(); g.arc(R, R, R, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#1d2336'; g.fillRect(0, 0, W, W);
    g.translate(R, R); g.rotate(yaw); g.scale(k, k); g.translate(-cx, -cz);
    g.globalAlpha = 0.9;
    g.drawImage(base, -map.size / 2, -map.size / 2, map.size, map.size);
    g.globalAlpha = 1;
    for (const p of state.pickups) {
      if (!p.active) continue;
      g.fillStyle = p.kind === 'speed' ? '#5cc8ff' : p.kind === 'magnet' ? '#ff5d6c' : '#c27bff';
      g.beginPath(); g.arc(p.x, p.z, 2.6, 0, Math.PI * 2); g.fill();
    }
    for (const z of zones) {
      g.beginPath(); g.arc(z.x, z.z, z.r, 0, Math.PI * 2);
      if (z.style === 'safe') {
        g.save(); g.fillStyle = 'rgba(255,60,80,0.28)'; g.beginPath(); g.rect(-400, -400, 800, 800); g.arc(z.x, z.z, z.r, 0, Math.PI * 2, true); g.fill('evenodd'); g.restore();
        g.beginPath(); g.arc(z.x, z.z, z.r, 0, Math.PI * 2);
      }
      if (z.style === 'crown') { g.fillStyle = 'rgba(255,210,58,0.28)'; g.fill(); }
      g.setLineDash(z.style === 'next' || z.style === 'safe-next' ? [6 / k, 5 / k] : []);
      g.strokeStyle = '#' + z.color.toString(16).padStart(6, '0'); g.lineWidth = 2.2 * dpr / k; g.stroke();
      g.setLineDash([]);
    }
    g.restore();

    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const toScreen = (x, z) => {
      const dx = x - cx, dz = z - cz;
      return [R + (cs * dx - sn * dz) * k, R + (sn * dx + cs * dz) * k];
    };
    for (const c of state.crowds) {
      if (!c.alive || c.index === me) continue;
      let [x, y] = toScreen(c.px + (c.x - c.px) * alpha, c.pz + (c.z - c.pz) * alpha);
      const d = Math.hypot(x - R, y - R), rim = R - 5 * dpr;
      let r = Math.max(3 * dpr, c.radius * k * 1.25);
      if (d > rim) { x = R + (x - R) / d * rim; y = R + (y - R) / d * rim; r = 3.2 * dpr; }
      const col = c.horde ? HORDE : hex(c.color);
      g.fillStyle = col;
      g.globalAlpha = 0.35; g.beginPath(); g.arc(x, y, r * 1.6, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      if (c.index === state.leader) { g.fillStyle = '#ffd23a'; g.beginPath(); g.arc(x, y - r - 2.5 * dpr, 2.2 * dpr, 0, Math.PI * 2); g.fill(); }
    }
    if (c0.alive) {
      const r = Math.max(3 * dpr, c0.radius * k * 1.25);
      g.fillStyle = c0.horde ? HORDE : hex(c0.color);
      g.globalAlpha = 0.4; g.beginPath(); g.arc(R, R, r * 1.5, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
      const h = c0.heading, hx = Math.sin(h), hz = Math.cos(h);
      const ax = cs * hx - sn * hz, ay = sn * hx + cs * hz;
      const L = 8 * dpr, Wd = 5.5 * dpr;
      g.fillStyle = '#ffffff'; g.strokeStyle = hex(c0.color); g.lineWidth = 2 * dpr;
      g.beginPath();
      g.moveTo(R + ax * L, R + ay * L);
      g.lineTo(R - ax * L * 0.6 - ay * Wd, R - ay * L * 0.6 + ax * Wd);
      g.lineTo(R - ax * L * 0.25, R - ay * L * 0.25);
      g.lineTo(R - ax * L * 0.6 + ay * Wd, R - ay * L * 0.6 - ax * Wd);
      g.closePath(); g.stroke(); g.fill();
    }
  }

  window.addEventListener('resize', resize);
  return { setMap, draw, resize };
}
