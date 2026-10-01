// ?auto=1 soak driver: wanders, jumps obstacles, places and breaks blocks, flips scale in build mode.

export function createAuto(ctx) {
  let phase = 'walk', timer = 2, turn = 0.4, stuckT = 0, lastPos = null, n = 0, home = null;
  const stats = { places: 0, breaks: 0, dist: 0, phases: 0 };
  ctx.bus?.on?.('block:place', () => stats.places++);
  ctx.bus?.on?.('block:break', () => stats.breaks++);

  const next = () => {
    const order = ['walk', 'place', 'walk', 'dig', 'walk', 'scale'];
    phase = order[n++ % order.length];
    timer = phase === 'walk' ? 2.5 + Math.random() * 2.5 : phase === 'dig' ? 2.2 : phase === 'place' ? 1.6 : 0.2;
    stats.phases++;
  };

  return {
    stats,
    drive(inp, dt) {
      const p = ctx.player;
      if (!p?.ready || ctx.session?.paused) return;
      timer -= dt;
      const pitchTo = target => inp.addLook(0, (p.pitch - target) * Math.min(1, dt * 4));
      inp.setHeld('primary', 'auto', false);
      inp.setHeld('secondary', 'auto', false);
      inp.setHeld('jump', 'auto', false);

      if (p.inWater) {
        inp.setHeld('jump', 'auto', true);
        inp.move.y = 1;
        if ((this._waterT = (this._waterT || 0) + dt) > 1.5) { inp.addLook(Math.PI * 0.6, 0); this._waterT = 0; }
        return;
      }
      if (phase === 'walk') {
        inp.move.y = 1; inp.move.x = 0;
        if (Math.random() < dt * 0.4) turn = (Math.random() - 0.5) * 1.6;
        inp.addLook(turn * dt, 0);
        pitchTo(-0.15);
        if (lastPos) {
          const d = Math.hypot(p.pos.x - lastPos[0], p.pos.z - lastPos[1]);
          stats.dist += d;
          stuckT = d < dt * 0.5 ? stuckT + dt : 0;
          if (stuckT > 0.8) { inp.addLook(1.4, 0); stuckT = 0; inp.setHeld('jump', 'auto', true); }
        }
        lastPos = [p.pos.x, p.pos.z];
        // Keep within ~24 m of where the soak began so it stays in loaded chunks.
        home ||= [p.pos.x, p.pos.z];
        const hx = home[0] - p.pos.x, hz = home[1] - p.pos.z;
        if (Math.hypot(hx, hz) > 24) inp.addLook(-Math.sign(Math.sin(Math.atan2(-hx, -hz) - p.yaw)) * dt * 2, 0);
      } else if (phase === 'place') {
        pitchTo(-0.75);
        const inv = ctx.game?.inv;
        if (inv && !inv.held()?.block) {
          const i = inv.slots.slice(0, 9).findIndex(sl => sl && ctx.game.items?.get?.(sl.id)?.block);
          if (i >= 0) inv.select(i);
        }
        const k = Math.floor(timer / 0.4);
        inp.setHeld('secondary', 'auto', k % 2 === 0 && timer < 1.4);
      } else if (phase === 'dig') {
        pitchTo(-0.9);
        inp.setHeld('primary', 'auto', true);
      } else if (phase === 'scale' && ctx.session?.mode === 'build') {
        const s = [0.25, 0.5, 1, 2][Math.floor(Math.random() * 4)];
        ctx.brush?.setScale?.(s);
      }
      if (timer <= 0) next();
    },
  };
}
