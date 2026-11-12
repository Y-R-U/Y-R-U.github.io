// Top-down 2D stand-in that implements the renderer contract. Dev tool and fallback, not the game's look.
const hex = (c) => '#' + c.toString(16).padStart(6, '0');

export function createDebug2D({ canvas, map }) {
  const g = canvas.getContext('2d');
  let W = 1, H = 1, dpr = 1;
  let focus = 0, camX = 0, camZ = 0, scale = 6, punchV = 0;
  let meta = [];
  let frames = 0, fpsT = performance.now(), fps = 0;
  const lerp = (a, b, t) => a + (b - a) * t;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth || window.innerWidth; H = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }
  resize();

  const sx = (x) => W / 2 + (x - camX) * scale;
  const sz = (z) => H / 2 + (z - camZ) * scale;

  function frame(state, events, dt, alpha) {
    frames++;
    const t = performance.now();
    if (t - fpsT > 500) { fps = frames * 1000 / (t - fpsT); frames = 0; fpsT = t; }
    const me = state.crowds[focus] || state.crowds[0];
    const fx = lerp(me.px, me.x, alpha), fz = lerp(me.pz, me.z, alpha);
    const k = Math.min(1, dt * 4);
    camX = lerp(camX, fx, k); camZ = lerp(camZ, fz, k);
    const viewHalf = 22 + me.radius * 2.4;
    const target = Math.min(W, H) / 2 / viewHalf * (1 + punchV * 0.15);
    scale = lerp(scale, target, Math.min(1, dt * 2));
    punchV = Math.max(0, punchV - dt * 2.5);

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#2b3145'; g.fillRect(0, 0, W, H);
    const half = map.size / 2;
    g.fillStyle = '#3e475f';
    g.fillRect(sx(-half), sz(-half), map.size * scale, map.size * scale);
    g.fillStyle = '#4b5672';
    for (const p of map.plazas || []) { g.beginPath(); g.arc(sx(p.x), sz(p.z), p.r * scale, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#8a7a66'; g.strokeStyle = '#2a2420'; g.lineWidth = 1;
    for (const o of map.obstacles) {
      g.beginPath();
      if (o.type === 'rect') g.rect(sx(o.x - o.w / 2), sz(o.z - o.d / 2), o.w * scale, o.d * scale);
      else g.arc(sx(o.x), sz(o.z), o.r * scale, 0, Math.PI * 2);
      g.fill(); g.stroke();
    }
    const N = state.neutrals;
    g.fillStyle = '#e8e6df';
    const pr = Math.max(1, scale * 0.35);
    for (let i = 0; i < N.cap; i++) {
      if (!N.state[i]) continue;
      const x = sx(lerp(N.px[i], N.x[i], alpha)), y = sz(lerp(N.pz[i], N.z[i], alpha));
      if (x < -5 || y < -5 || x > W + 5 || y > H + 5) continue;
      g.fillRect(x - pr, y - pr, pr * 2, pr * 2);
    }
    for (const p of state.pickups) {
      if (!p.active) continue;
      g.fillStyle = p.kind === 'speed' ? '#36b4ff' : p.kind === 'magnet' ? '#ff4a5e' : '#b04dff';
      g.beginPath(); g.arc(sx(p.x), sz(p.z), Math.max(4, 1.6 * scale), 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.font = `bold ${Math.max(9, scale * 1.6)}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(p.kind === 'speed' ? '»' : p.kind === 'magnet' ? 'U' : '×2', sx(p.x), sz(p.z));
    }
    for (const c of state.crowds) {
      if (!c.alive) continue;
      const x = sx(lerp(c.px, c.x, alpha)), y = sz(lerp(c.pz, c.z, alpha)), r = c.radius * scale;
      const col = hex(c.color);
      g.globalAlpha = c.protect > 0 ? 0.3 + 0.2 * Math.sin(t / 60) : 0.55;
      g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1; g.strokeStyle = col; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, Math.max(3, scale * 0.8), 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.sin(c.heading) * (r + 6), y + Math.cos(c.heading) * (r + 6)); g.stroke();
      if (c.index === state.leader) { g.fillStyle = '#ffd23a'; g.font = `${Math.max(14, scale * 3)}px system-ui`; g.textAlign = 'center'; g.fillText('♛', x, y - r - 6); }
    }
  }

  return {
    debug2d: true,
    setCrowds(m) { meta = m; },
    frame,
    setFocus(i) { focus = i; },
    punch(s) { punchV = Math.max(punchV, s); },
    project(x, y, z, out = {}) {
      out.x = sx(x); out.y = sz(z) - y * scale * 0.6;
      out.visible = out.x > -40 && out.y > -40 && out.x < W + 40 && out.y < H + 40;
      return out;
    },
    groundPoint(cx, cy, out = {}) { out.x = (cx - W / 2) / scale + camX; out.z = (cy - H / 2) / scale + camZ; return out; },
    cameraYaw: () => 0,
    resize,
    setQuality() {},
    stats: () => ({ fps, drawCalls: 0, instances: 0 }),
    dispose() {},
    get meta() { return meta; },
  };
}
