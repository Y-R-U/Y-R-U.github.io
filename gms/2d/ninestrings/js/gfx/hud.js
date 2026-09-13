// The HUD. Canvas, not DOM (D5), because it has to sit INSIDE the post pass -
// the health bar should bloom and flash with everything else.
//
// Portrait phone layout (DESIGN 8.5): status pinned to the top under the safe
// area, nothing in the bottom half where the thumb lives, and nothing so thin
// it disappears on a 5-inch screen.

const PAD = 12;

export function makeHud(renderer, viewport) {
  // Reused, so the per-frame path never allocates a string it can avoid.
  let lastTime = -1, timeStr = '0:00';

  function fmt(t) {
    const s = t | 0;
    if (s === lastTime) return timeStr;
    lastTime = s;
    const m = (s / 60) | 0;
    const r = s % 60;
    timeStr = m + ':' + (r < 10 ? '0' : '') + r;
    return timeStr;
  }

  return {
    draw(w, ns) {
      if (!w || !renderer.text) return;
      const vp = ns.viewport;
      const W = vp.w, H = vp.h;
      const top = vp.safe.top + PAD;
      const p = w.player;

      renderer.layer('ui');

      // ---- XP: a full-width hairline at the very top. It is the one number a
      // player checks constantly, so it gets the whole width and no chrome.
      const xpF = Math.max(0, Math.min(1, p.xp / (p.xpNext || 1)));
      renderer.quad(W / 2, top + 2, W, 4, 0, 0.08, 0.09, 0.13, 1);
      if (xpF > 0) {
        renderer.quad(xpF * W / 2, top + 2, xpF * W, 4, 0, 0.55, 0.85, 1, 1);
        renderer.layer('add');
        renderer.quad(xpF * W / 2, top + 2, xpF * W, 4, 0, 0.2, 0.5, 0.8, 0.7);
        renderer.layer('ui');
      }

      // ---- level, timer, kills
      const row = top + 20;
      renderer.text('LV ' + p.level, PAD, row, 13, 0.9, 0.93, 1, 0.95, 'left');
      renderer.text(fmt(w.time), W / 2, row, 17, 1, 1, 1, 0.96, 'center');
      renderer.text(w.kills + ' killed', W - PAD, row, 12, 0.6, 0.65, 0.8, 0.9, 'right');

      // ---- threads cut: this game's signature counter, so it gets its own
      // line and the thread colour rather than being buried in a stats screen.
      if (w.cuts > 0) {
        renderer.text(w.cuts + ' cut', W - PAD, row + 16, 12, 0.56, 0.89, 1, 0.95, 'right');
      }

      // ---- health, directly under the timer
      const hpF = Math.max(0, Math.min(1, p.hp / (p.maxHp || 1)));
      const hw = Math.min(210, W - PAD * 2);
      const hy = row + 20;
      renderer.quad(W / 2, hy, hw, 7, 0, 0.1, 0.03, 0.05, 1);
      if (hpF > 0) {
        // green -> amber -> red, so the state reads without reading a number
        const r = hpF > 0.5 ? 1 - (hpF - 0.5) * 1.2 : 1;
        const g = hpF > 0.3 ? 0.75 : hpF * 1.6;
        renderer.quad(W / 2 - hw / 2 + hpF * hw / 2, hy, hpF * hw, 7, 0, r, g, 0.3, 1);
      }

      // ---- weapons: a compact row of tags, bottom-LEFT but above the thumb
      //      zone, so it can be glanced at without covering the play area.
      const wy = H - vp.safe.bottom - 18;
      let wx = PAD;
      for (let i = 0; i < p.weapons.length; i++) {
        const it = p.weapons[i];
        const c = (it.def && it.def.colour) || [1, 1, 1];
        const tag = (it.def && it.def.tag) || '?';
        renderer.text(tag, wx, wy, 11, c[0], c[1], c[2], 0.85, 'left');
        renderer.text('' + it.level, wx + renderer.measure(tag, 11) + 3, wy, 9,
                      0.7, 0.74, 0.85, 0.75, 'left');
        wx += renderer.measure(tag, 11) + 18;
      }

      // ---- boss bar
      const b = w.boss;
      if (b && b.alive && !b.dying) {
        const f = Math.max(0, Math.min(1, b.hp / (b.maxHp || 1)));
        const bw = W - PAD * 2;
        const by = top + 58;
        renderer.text((b.def && b.def.name) || 'CHOIRMASTER', W / 2, by - 6, 12,
                      1, 0.8, 0.85, 0.95, 'center');
        renderer.quad(W / 2, by + 8, bw, 8, 0, 0.12, 0.04, 0.07, 1);
        if (f > 0) renderer.quad(W / 2 - bw / 2 + f * bw / 2, by + 8, f * bw, 8, 0, 0.88, 0.15, 0.3, 1);
      }

      // ---- Chorus banner: the set piece needs to announce itself
      if (w.chorus && w.chorus.active) {
        renderer.layer('add');
        renderer.text('CHORUS', W / 2, H * 0.3, 26, 1, 0.9, 0.95, 0.9, 'center');
        renderer.layer('ui');
      }

      // ---- the virtual stick, drawn only while a thumb is down
      const st = ns.input && ns.input.stick;
      if (st && st.held) {
        renderer.layer('add');
        ring(renderer, st.ox, st.oy, 40, 0.5, 0.55, 0.7, 0.18);
        ring(renderer, st.x, st.y, 17, 0.8, 0.86, 1, 0.34);
        renderer.layer('ui');
      }
    },
  };
}

// A ring from short quads. The renderer has no circle primitive and adding one
// for two HUD elements would not pay for itself.
function ring(r, cx, cy, rad, cr, cg, cb, a) {
  const N = 18;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    r.quad(cx + Math.cos(t) * rad, cy + Math.sin(t) * rad, 3, 3, 0, cr, cg, cb, a);
  }
}
