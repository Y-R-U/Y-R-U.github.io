// ============================================================================
// DEAD CODE — Canvas-2D renderer, superseded by the Three.js 2.5D renderer
// (CONTRACTS §14, DECISIONS D12-D16). NOTHING LIVE IMPORTS THIS FILE.
// Kept only because the procedural CLOUD and SKY bakes transfer to 3D as
// textures on planes at negative z. See docs/ART_NOTES.md before reusing.
// Palettes moved on and were restructured: these modules expect the OLD flat
// palette shape (pal.cloudTop, pal.earth, ...), not the current js/gfx/palette.js.
// ============================================================================
// World <-> screen. CONTRACTS §2 plus one addition: a gentle screen-space ground curve so the
// horizon reads as a shallow hilltop arc rather than a ruled line (ART.md §1).

export function makeView() {
  const v = {
    W: 0, H: 0, dpr: 1,
    scale: 1, camX: 0, camY: 0, vw: 1600, vh: 900,
    shakeX: 0, shakeY: 0,
    curveAmp: 0,
    baseY: -170,

    set(W, H, cam, baseY) {
      v.W = W; v.H = H;
      v.scale = cam.scale || H / 900;
      v.camX = cam.x; v.camY = cam.y;
      v.vw = cam.vw; v.vh = cam.vh || 900;
      v.shakeX = cam.shakeX || 0; v.shakeY = cam.shakeY || 0;
      v.curveAmp = H * 0.05;
      if (baseY !== undefined) v.baseY = baseY;
    },

    // Dome offset in screen px: 0 at centre, +curveAmp at both edges.
    curve(sx) {
      const u = (sx / v.W - 0.5) * 2;
      return v.curveAmp * u * u;
    },

    sx(wx) { return (wx - v.camX) * v.scale + v.shakeX; },
    sy(wx, wy) {
      const sx = (wx - v.camX) * v.scale;
      return (v.camY + v.vh - wy) * v.scale + v.curve(sx) + v.shakeY;
    },
    // Screen y ignoring the curve — for sky and cloud layers.
    syFlat(wy) { return (v.camY + v.vh - wy) * v.scale + v.shakeY; },

    toWorld(sx, sy) {
      return {
        x: v.camX + (sx - v.shakeX) / v.scale,
        y: v.camY + v.vh - (sy - v.curve(sx - v.shakeX) - v.shakeY) / v.scale,
      };
    },

    // Parallax helpers. p = 1 is the play plane; smaller is further away.
    bgX(wx, p) { return (wx - v.camX * p) * v.scale + v.shakeX * p; },
    bgY(wy, p) {
      return (v.camY * p + v.vh + v.baseY * (1 - p) - wy) * v.scale + v.shakeY * p;
    },
    bgOff(p) { return -v.camX * p * v.scale; },

    u(n) { return n * v.scale; },       // world units -> css px
    onScreenX(wx, pad = 0) {
      const sx = v.sx(wx);
      return sx > -pad && sx < v.W + pad;
    },
  };
  return v;
}
