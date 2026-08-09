import { createWorld } from './world.js';
import { createBarks } from './barks.js';
import { buildLevel, createDemos, groundAt } from './level.js';
import { MATERIAL, MAT, MATERIAL_NAMES, DAMAGE, DAMAGE_NAMES } from './materials.js';
import { STATUS } from './status.js';
import { CELL } from './terrain.js';
import { clamp, damp, lerp } from '../core/math.js';

export { MATERIAL, MAT, MATERIAL_NAMES, DAMAGE, DAMAGE_NAMES, STATUS };
export { createWorld };

const RUIN_X = 4400, RUIN_FADE = 900;

/**
 * Vertical camera lead as a fraction of halfH — how far above the player the
 * camera sits, i.e. how low the horizon lands.
 *
 * Portrait cannot take the landscape value. It shows 1774 world px of height
 * against landscape's 1200, and the `*_fg` occluder band is only 1470 px tall
 * with a hard, unfeathered top edge; lifting the camera in portrait drags that
 * edge down into view as a ruled line across the sky (B1 filed the same defect
 * against `*_near`/`*_fg` and it is still open with art). 0.22 keeps the seam
 * where it already was, so portrait leans on the terrain texturing rather than
 * on reframing. Raise it the moment those bands are feathered or extended.
 */
const LEAD_DEFAULT = 0.38;
const LEAD_PORTRAIT = 0.22;

export async function createPlayScene(ctx) {
  const { R, P, view, bus, LAYER } = ctx;

  if (!ctx.assets.manifest) {
    await ctx.assets.loadManifest('assets/atlas.json');
  }

  const world = createWorld(ctx);
  world.buildCatalogue();
  world.props.loadDefs();
  ctx.world = world;
  // Subscribes to the bus, so it is built once with the scene, not per run.
  const barks = createBarks(world);
  if (typeof window !== 'undefined' && window.__sunderfall) window.__sunderfall.world = world;

  let statics = null;
  let marks = null;
  let demos = null;
  let director = null;

  // Enemies live in their own module and the sim must not hard-depend on them —
  // sim-test.html runs with no AI at all. Loaded here rather than by main.js
  // because the director needs a built world, which only exists after enter().
  const query = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const noEnemies = query.has('noenemies');

  let enemyMod = null;
  try {
    enemyMod = await import('../enemies/index.js');
  } catch (err) {
    console.warn('[sunderfall] enemies module unavailable —', err.message);
  }
  const bandsA = ctx.assets.bands('sunderwood');
  const bandsB = ctx.assets.bands('ruinreach');

  const cam = world.cam;
  let camInit = false;
  let offView = null;

  function sizeView() {
    const z = cam.zoom || 1;
    world.halfW = view.worldW * 0.5 / z;
    world.halfH = view.worldH * 0.5 / z;
  }

  // Ambient is the single biggest lever on how the game reads, and because the
  // renderer squares every colour its effect is not predictable on paper. Expose
  // it so a tuning sweep can be screenshotted and compared rather than argued.
  const leadOverride = query.has('lead') && Number.isFinite(+query.get('lead')) ? +query.get('lead') : null;
  const leadPx = () => world.halfH * (leadOverride !== null ? leadOverride
    : view.mode === 'portrait' ? LEAD_PORTRAIT : LEAD_DEFAULT);

  const triple = (key, fallback) => {
    const v = query.get(key);
    if (!v) return fallback;
    const p = v.split(',').map(Number);
    return p.length === 3 && p.every(n => Number.isFinite(n)) ? p : fallback;
  };
  const rgb = (key, fallback) => {
    const [r, g, b] = triple(key, fallback);
    return { r, g, b };
  };

  const moonKey = rgb('moon', [0.68, 0.76, 1.0]);
  const moonFill = rgb('moonfill', [0.58, 0.66, 0.88]);

  function look() {
    // Ambient carries the whole night. The engine squares colours, so 0.30 here
    // is a far darker 0.09 in linear — it reads as moonlight, not daylight.
    // Blue must not run away from red: at 4:1 the frame collapses to one hue.
    R.setAmbient(...triple('amb', [0.200, 0.226, 0.290]));
    R.setHaze(...triple('haze', [0.30, 0.375, 0.520]));
    R.setClearColor(...triple('clear', [0.042, 0.050, 0.078]));
    R.fx.vignette(Number(query.get('vig') ?? 0.52));
    R.fx.bloom = 0.58;
    R.fx.threshold = 0.86;
    R.fx.knee = 0.30;
    // Saturation > 1 pushes a below-average channel negative and the composite
    // clamps it. On a blue-dominant night frame that lands entirely on red, which
    // is how 86% of pixels ended up at R exactly 0 and the warm soil rendered
    // blue-grey. Keep saturation at or under 1 here and get colour from the art.
    R.fx.contrast = Number(query.get('con') ?? 1.06);
    R.fx.saturation = Number(query.get('sat') ?? 1.0);
    R.fx.grain = 0.020;
    R.setLayer(LAYER.SKY, { haze: 0, shade: 0.42, response: 0.10 });
    R.setLayer(LAYER.BG_FAR, { haze: 0.34, response: 0.20, shade: 0.75, mul: [0.80, 0.84, 0.94] });
    R.setLayer(LAYER.BG_MID, { haze: 0.16, response: 0.40, shade: 0.88, mul: [0.72, 0.76, 0.88] });
    R.setLayer(LAYER.BG_NEAR, { haze: 0.07, response: 0.72, mul: [0.62, 0.66, 0.80] });
    R.setLayer(LAYER.TERRAIN, { response: 1.30 });
    R.setLayer(LAYER.TERRAIN_FRONT, { response: 1.15 });
    R.setLayer(LAYER.FG_OCCLUDE, { response: 0.22, mul: [0.34, 0.38, 0.50] });
  }

  function drawStatics() {
    if (!statics) return;
    for (let i = 0; i < statics.n; i++) {
      R.spriteRaw(statics.tex[i], statics.u0[i], statics.v0[i], statics.u1[i], statics.v1[i],
        statics.x[i], statics.y[i], statics.w[i], statics.h[i], statics.rot[i] || 0,
        statics.r[i], statics.g[i], statics.b[i], statics.a[i], statics.layer[i], false, 1);
    }
  }

  /**
   * A backdrop band's own bottom edge shows as a ruled line the moment the
   * camera drops below it (A1 handoff gotcha 4). Rather than guess a fill
   * colour, re-draw the band's bottom pixel row stretched downward: it
   * continues the art exactly, so the seam cannot exist. Foreground occluders
   * are skipped — extending those would paint over the play area.
   */
  function fillUnder(band, a) {
    if (!band.tex) return;
    const layer = typeof band.layer === 'string' ? LAYER[band.layer] : band.layer;
    if (layer >= LAYER.TERRAIN) return;
    const p = band.parallax === undefined ? 1 : band.parallax;
    const W = band.worldW || band.tex.w;
    const bottom = (band.anchorY === undefined ? -band.worldH : band.anchorY) + (band.worldH || band.tex.h);
    if (cam.y + world.halfH < bottom) return;
    const H = 3200;
    const half = view.worldW * 0.5 + W;
    const i0 = Math.floor((cam.x * p - half) / W), i1 = Math.floor((cam.x * p + half) / W);
    for (let i = i0; i <= i1; i++) {
      R.spriteRaw(band.tex, 0, 0.995, 1, 1, (i + 0.5) * W, bottom + H * 0.5, W, H, 0, 1, 1, 1, a, layer, false, p);
    }
  }

  /**
   * The same defect at the other end, and the one this session's lower horizon
   * exposes: the `*_fg` canopy band is 1470px tall with a hard unfeathered top,
   * so any time the camera rises — portrait always, ruins and high ledges in
   * landscape — its top edge rules a line across the sky (B1 filed this against
   * art and it is still open). Redrawing the band mirrored above itself
   * continues the canopy exactly at the join, and only the mirrored top few
   * hundred px are ever on screen, which is canopy in every set.
   */
  function fillOver(band, a) {
    if (!band.tex) return;
    const layer = typeof band.layer === 'string' ? LAYER[band.layer] : band.layer;
    if (layer !== LAYER.FG_OCCLUDE) return;
    const p = band.parallax === undefined ? 1 : band.parallax;
    const W = band.worldW || band.tex.w;
    const H = band.worldH || band.tex.h;
    const top = band.anchorY === undefined ? -H : band.anchorY;
    if (cam.y * p - world.halfH >= top) return;
    const half = view.worldW * 0.5 + W;
    const i0 = Math.floor((cam.x * p - half) / W), i1 = Math.floor((cam.x * p + half) / W);
    for (let i = i0; i <= i1; i++) {
      // 2px of overlap: the bands wrap in both axes, so a hairline gap at the
      // join samples the band's *bottom* row and shows as a pale rule
      R.spriteRaw(band.tex, 0, 1, 1, 0, (i + 0.5) * W, top - H * 0.5 + 2, W, H, 0, 1, 1, 1, a, layer, false, p);
    }
  }

  function drawBands() {
    const k = clamp((cam.x - RUIN_X) / RUIN_FADE, 0, 1);
    if (k < 1) for (const b of bandsA) { R.backdrop(b, { a: 1 - k }); fillUnder(b, 1 - k); fillOver(b, 1 - k); }
    if (k > 0) for (const b of bandsB) { R.backdrop(b, { a: k }); fillUnder(b, k); fillOver(b, k); }
  }

  /* ---------------- debug overlays ---------------- */
  const edgeBuf = [];
  const RED = { r: 1, g: 0.3, b: 0.25, a: 0.9 };
  const GRN = { r: 0.4, g: 1, b: 0.5, a: 0.55 };
  const CYN = { r: 0.4, g: 0.85, b: 1, a: 0.8 };
  const YEL = { r: 1, g: 0.85, b: 0.35, a: 0.7 };

  function drawDebug() {
    const d = world.debug;
    const UI = LAYER.UI_WORLD;
    if (d.grid) {
      const T = world.terrain;
      const a = T.toCellX(cam.x - world.halfW), b = T.toCellX(cam.x + world.halfW);
      const c = T.toCellY(cam.y - world.halfH), e = T.toCellY(cam.y + world.halfH);
      for (let cy = c; cy <= e; cy++) for (let cx = a; cx <= b; cx++) {
        if (!T.filled(cx, cy)) continue;
        const col = T.oneWay(cx, cy) ? YEL : CYN;
        R.rect(T.cellLeft(cx) + CELL * 0.5, T.cellTop(cy) + CELL * 0.5, CELL, CELL, 1, col, UI);
      }
    }
    if (d.rubble) {
      const rb = world.debris.rubble, T = world.terrain;
      const a = Math.max(0, T.toCellX(cam.x - world.halfW)), b = Math.min(T.cols - 1, T.toCellX(cam.x + world.halfW));
      for (let cx = a; cx <= b; cx++) {
        if (rb[cx] === Infinity) continue;
        R.line(T.cellLeft(cx), rb[cx], T.cellLeft(cx) + CELL, rb[cx], 3, RED, UI);
      }
    }
    if (d.aabb) {
      for (const e of world.entities) R.rect(e.x, e.y, e.w, e.h, 2, CYN, UI);
      for (const p of world.props.props) {
        if (!p.alive || p.state === 'gone') continue;
        R.rect(p.x, p.y, p.w, p.h, 2, p.solid ? GRN : YEL, UI);
      }
    }
    if (d.support) {
      world.props.edges(edgeBuf);
      for (const e of edgeBuf) R.line(e.ax, e.ay, e.bx, e.by, 3, e.stable ? GRN : RED, UI);
      for (const p of world.props.props) {
        if (!p.alive || p.state === 'settled' || p.state === 'gone') continue;
        const col = p.stable ? GRN : RED;
        R.rect(p.x, p.bottom - 6, 18, 12, 3, col, UI);
      }
    }
    if (d.surfaces) {
      for (const [id, k] of world.surfaces.kinds) {
        for (const c of k.cells) {
          R.rect(c.x, c.y, 30, 30, 1, { r: k.color[0], g: k.color[1], b: k.color[2], a: 0.5 + c.amount * 0.5 }, UI);
        }
      }
    }
    if (d.player && world.player) {
      const p = world.player, pd = p.data;
      R.rect(p.x, p.y, p.w, p.h, 2, pd.dashT > 0 ? YEL : CYN, UI);
      if (pd.coyote > 0) R.line(p.x - 30, p.y - 90, p.x - 30 + pd.coyote * 300, p.y - 90, 4, GRN, UI);
      if (pd.buffer > 0) R.line(p.x - 30, p.y - 82, p.x - 30 + pd.buffer * 300, p.y - 82, 4, YEL, UI);
      R.line(p.x, p.y, p.x + p.vx * 0.12, p.y + p.vy * 0.12, 2, RED, UI);
    }
  }

  /* ---------------- scene ---------------- */
  const scene = {
    world,

    async enter() {
      sizeView();
      look();
      // a restart must not inherit a stick that was still held when he died
      if (ctx.input.releaseAll) ctx.input.releaseAll();
      world.reset();
      const built = buildLevel(world);
      statics = built.statics;
      marks = built.marks;
      demos = createDemos(world, marks);
      scene.demos = demos;
      scene.marks = marks;

      const px = 470;
      lastMark = -Infinity;
      barks.reset();
      world.createPlayer(px, groundAt(px) - 120);
      cam.x = px; cam.y = groundAt(px) - 120 - leadPx();
      camInit = true;

      P.setTerrainQuery(world.solidAt);
      view.setCamera(cam);
      // enter() runs again on every restart — one subscription, not one per run
      if (!offView) offView = bus.on('view:change', sizeView);

      // one warm key light per scene, the discipline the art direction asks for
      R.fx.setRays(cam.x + 500, -820, 0.20, 0.955, 1.2);

      if (enemyMod && !noEnemies) {
        enemyMod.initEnemies(world);
        director = enemyMod.createDirector(world, { movement: 'sunderwood' });
        scene.director = director;
        scene.enemies = enemyMod;
      }

      bus.emit('sim:ready', { world });
    },

    update(dt) {
      world.update(dt);
      barks.update(dt);
      if (director) director.update(dt);
      updateCamera(dt);
      checkpoint();
    },

    render(alpha) {
      R.begin(cam);
      drawBands();
      drawStatics();
      world.render(alpha);

      // Moonlight: one huge soft cool source that travels with the view, plus a
      // second wider fill under it. Without this the terrain reads as pure black
      // — ambient alone cannot carry an unlit layer at these albedos.
      //
      // Colours are squared, so (0.46, 0.60, 1) is really (0.21, 0.36, 1) — a 5:1
      // blue-to-red key over a blue ambient, which is what left the warm soil art
      // rendering blue-grey. Moonlight is cool but it is not monochrome.
      R.light({ x: cam.x + 520, y: cam.y - world.halfH * 0.85, radius: 3200, ...moonKey, intensity: 0.55, soft: 1 });
      // The fill sits just above the horizon. At +0.35 it was buried inside the
      // soil, and once the sub-ground was textured that lit the dirt from
      // within — the mass glowed brighter than the sky behind it.
      R.light({ x: cam.x, y: cam.y + world.halfH * 0.06, radius: 2600, ...moonFill, intensity: 0.20, soft: 1 });
      drawDebug();
      R.end();
    },

    exit() {
      P.clear();
    },

    demo(name) { if (demos && demos[name]) demos[name](); },
  };

  /**
   * Rolling checkpoint. Falling in the chasm respawns you, and respawning at the
   * far end of the level after every fall is its own kind of punishment — so the
   * spawn point follows you forward whenever you are standing safely on ground.
   * Forward only: it never moves back, and it never records a spot you were
   * burning or falling in.
   */
  let lastMark = -Infinity;
  function checkpoint() {
    const p = world.player;
    if (!p || !p.alive || p.killed || !p.onGround) return;
    if (p.x < lastMark + 420 || p.y > 200) return;
    if (p.burning > 0 || world.surfaces.amountAt('fire', p.x, p.y) > 0) return;
    lastMark = p.x;
    world.setPlayerSpawn(p.x, p.y);
  }

  function updateCamera(dt) {
    const p = world.player;
    if (!p) return;
    if (!camInit) { cam.x = p.x; cam.y = p.y; camInit = true; }
    // Look-ahead. Portrait shows 820 world px against landscape's 1920, so the
    // same lead is worth less than half as much there and destruction kept
    // happening just outside the frame: it leads harder, and a standing lead off
    // `faceX` means you can see what you are about to walk into before you move.
    const port = view.mode === 'portrait';
    const lookX = clamp(p.vx * (port ? 0.32 : 0.22) + p.faceX * (port ? 60 : 40),
      port ? -280 : -230, port ? 280 : 230);
    // Pull toward whatever is being aimed at — with touch auto-aim that is the
    // thing you are about to blow up, which is exactly what you want in frame.
    const aiming = world.input.lastSource === 'pointer' || world.input.autoTarget;
    const aimPull = aiming ? clamp((world.input.aim.x - p.x) * 0.16, -200, 200) : 0;
    const tx = p.x + lookX + aimPull;
    // Sit the horizon low. At 0.20 the ground line landed ~70% down the frame
    // and the bottom third was nothing but sub-ground; the art is composed for
    // a soil cross-section around a fifth of the frame.
    const lead = leadPx();
    let ty = p.y - lead;
    // Falling still buys a look-down — with the horizon this low there is very
    // little room under the player and you must be able to see what you land on.
    if (!p.onGround) ty = p.y - lead + clamp(p.vy * 0.10, world.halfH * -0.15, world.halfH * 0.34);

    cam.x = damp(cam.x, tx, 0.0022, dt);
    cam.y = damp(cam.y, ty, p.onGround ? 0.006 : 0.02, dt);

    const b = world.bounds;
    const hw = world.halfW, hh = world.halfH;
    if (b.x1 - b.x0 > hw * 2) cam.x = clamp(cam.x, b.x0 + hw, b.x1 - hw);
    else cam.x = (b.x0 + b.x1) * 0.5;
    cam.y = clamp(cam.y, b.y0 + hh, b.y1 - hh);
  }

  // demos can be driven straight off the URL so a headless run reaches the money shot.
  // sim-test.html drives its own, so stand down there.
  if (typeof location !== 'undefined' && !(typeof window !== 'undefined' && window.__simHarness)) {
    const q = new URLSearchParams(location.search);
    const want = q.get('demo');
    if (want) {
      const names = want === 'all'
        ? ['crates', 'tree', 'fire', 'arch', 'bridge', 'acid']
        : want.split(',');
      bus.once('sim:ready', () => {
        let i = 0;
        const step = () => {
          if (i >= names.length) return;
          scene.demo(names[i++]);
          if (i < names.length) setTimeout(step, 2600);
        };
        setTimeout(step, 350);
      });
    }
  }

  return scene;
}
