// Top-down minimap for the CURRENT level: bounds frame (the sealed barrier),
// roads, labelled buildings, exits as green diamonds, loot dots, zombie blips
// and the player triangle. Everything comes from the level bundle — nothing
// hardcoded, so editor-authored levels map correctly. North-up, whole level
// fitted (letterboxed for non-square bounds).

export function createMinimap(canvas) {
  const g = canvas.getContext('2d');
  const SZ = canvas.width;                 // square canvas

  const PK = { weapon: '#ffd24a', ammo: '#6fd0ff', medkit: '#7aff8a' };
  const HS = { exit: '#6fe08a', dialog: '#6fb9ff', item: '#ffd24a', note: '#9a9a90' };

  return {
    update({ player, zombies, level, pickups }) {
      g.clearRect(0, 0, SZ, SZ);
      if (!level) return;
      const HX = level.bounds.hx, HZ = level.bounds.hz;
      const span = Math.max(HX, HZ) * 2;
      const s = SZ / span;
      const ox = (SZ - HX * 2 * s) / 2, oy = (SZ - HZ * 2 * s) / 2;
      const mx = (x) => ox + (x + HX) * s;
      const my = (z) => oy + (z + HZ) * s;
      const ms = (d) => d * s;

      // ground + sealed bounds
      g.fillStyle = '#23251f';
      g.fillRect(mx(-HX), my(-HZ), ms(HX * 2), ms(HZ * 2));
      g.strokeStyle = '#6a3a30'; g.lineWidth = 2;
      g.strokeRect(mx(-HX), my(-HZ), ms(HX * 2), ms(HZ * 2));

      // roads
      const R = level.doc.roads;
      if (R) {
        g.fillStyle = '#3c3e36';
        for (const x of (R.vert || [])) g.fillRect(mx(x) - ms(R.half), my(-HZ), ms(R.half * 2), ms(HZ * 2));
        for (const z of (R.horiz || [])) g.fillRect(mx(-HX), my(z) - ms(R.half), ms(HX * 2), ms(R.half * 2));
      }

      // buildings
      for (const b of (level.buildings || [])) {
        g.fillStyle = 'rgba(150,150,140,0.55)';
        g.fillRect(mx(b.x - b.hx), my(b.z - b.hz), ms(b.hx * 2), ms(b.hz * 2));
      }

      // hotspots (triggers stay hidden — they're ambushes)
      for (const hs of (level.hotspots || [])) {
        const h = hs.h;
        if (h.type === 'trigger' || hs.fired) continue;
        const x = mx(h.x), y = my(h.z);
        if (h.type === 'exit') {
          g.fillStyle = HS.exit;
          g.beginPath(); g.moveTo(x, y - 4.6); g.lineTo(x + 4.6, y); g.lineTo(x, y + 4.6); g.lineTo(x - 4.6, y); g.closePath(); g.fill();
        } else {
          g.fillStyle = HS[h.type] || '#fff';
          g.beginPath(); g.arc(x, y, 2.6, 0, 7); g.fill();
        }
      }

      // loot pickups
      for (const p of (pickups || [])) {
        if (p.taken) continue;
        g.fillStyle = PK[p.kind] || '#fff';
        g.fillRect(mx(p.pos.x) - 2, my(p.pos.z) - 2, 4, 4);
      }

      // zombies
      g.fillStyle = '#ff4536';
      for (const z of (zombies || [])) {
        if (!z.alive) continue;
        g.beginPath(); g.arc(mx(z.group.position.x), my(z.group.position.z), 2.2, 0, 7); g.fill();
      }

      // player (triangle pointing along facing; map: +x→right, +z→down)
      if (player) {
        const px = mx(player.pos.x), py = my(player.pos.z), r = 5.5;
        const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
        const ex = fz, ez = -fx;
        const bx = px - fx * r * 0.7, by = py - fz * r * 0.7;
        g.fillStyle = '#ffe24a'; g.strokeStyle = '#1a1a14'; g.lineWidth = 1;
        g.beginPath();
        g.moveTo(px + fx * r, py + fz * r);
        g.lineTo(bx + ex * r * 0.7, by + ez * r * 0.7);
        g.lineTo(bx - ex * r * 0.7, by - ez * r * 0.7);
        g.closePath(); g.fill(); g.stroke();
      }
    },
  };
}
