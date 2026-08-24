/**
 * The HUD — assembly, the coaming, and the screen-locked 2D layer everything
 * else draws into.
 *
 * ART §10's governing principle is the whole design: **the HUD is on the glass
 * or on the aeroplane; it is never floating in the sky.** So there is no panel,
 * no rounded rectangle and no drop shadow anywhere in `js/ui/` — the coaming is
 * a painted strip at the very bottom in the thumb dead-zone, and everything else
 * is a mark on the glass drawn by `theme.mark`.
 *
 * WHY A SECOND CANVAS. ART's `GLASS` is explicitly "not a world layer — screen
 * locked UI, drawn by js/ui/". A 2D overlay in css pixels makes gate H4 ("the
 * HUD does not zoom") true by CONSTRUCTION rather than by discipline: there is
 * no code path by which `cam.zoom` could reach a HUD coordinate. `?hudbug=zoom`
 * ships the forbidden version — the whole layer scaled about its centre by the
 * live zoom — so the gate can be shown to go red (D47).
 *
 * WHAT IS NOT HERE. There is no damage bar, no damage diagram and no health
 * number: R11 is accepted in full (DESIGN §2.7) and the only instrument is the
 * engine gauge creeping into the red. Damage is read off the aeroplane.
 */

import { resolveLayout, METRICS, TIMING, RANGES } from './layout.js';
import { INK, mark, label, font, rgba, NEUTRAL_RAMP } from './theme.js';
import { tapeModel, drawTape } from './alttape.js';
import { chevronModel, drawChevrons, threatModel, drawBrackets, drawGlyphs, drawLeadPip, drawCratePips } from './overlay.js';
import { createStick } from './stick.js';
import { createCards } from './cards.js';
import { M_PER_WU } from '../core/math.js';
// Every threshold below is IMPORTED, never re-typed. A harness or a widget that
// keeps a second copy of a value the code under test also declares is testing
// itself, and D72 cost a whole gate to exactly that.
import { G_SI, STRESS } from '../data/tables.js';
import { HULL_M, ENGINE_LADDER } from '../sim/damage.js';

const TAU = Math.PI * 2;

/** The default frame state, so a scene that fills half of it still draws. */
function blankState() {
  return {
    playerY: 0, playerX: 0, viewTopY: 0, viewBotY: 0, energyWu: undefined,
    contacts: [], crates: [], hostiles: [], player: null,
    lead: null, leadInCone: false,
    speedSI: 0, vne: 0, stress: 0, engine: 1, ammo: 0, ammoMax: 1,
    special: '', specialAmmo: 0, specialAmmoMax: 0, specialGlyph: '', engage: '',
    objective: '', wind: 0, windShear: 0, ramp: NEUTRAL_RAMP, hullPx: 0,
  };
}

export function createHUD(ctx, opts = {}) {
  const view = ctx.view;
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const BUG = opts.bug || q.get('hudbug') || '';

  const canvas = document.createElement('canvas');
  canvas.id = 'hud';
  canvas.setAttribute('aria-hidden', 'true');
  /**
   * THE HUD NEVER TAKES INPUT. `css/game.css` sets `#ui > * { pointer-events:
   * auto }`, so a canvas mounted in `#ui` sits on top of `#gl` and eats every
   * touch — the stick then never activates and the aeroplane cannot be flown at
   * all. Measured, not guessed: H12 read 0 css px of thumb travel over a 60 s
   * run and H11's swept union read 0.00%, both because `input.stick.active` was
   * never true. A screenshot of that build looks perfect.
   */
  canvas.style.pointerEvents = BUG === 'input' ? 'auto' : 'none';
  (opts.mount || (ctx.dom && ctx.dom.ui) || document.body).appendChild(canvas);
  const g = canvas.getContext('2d');

  const layout = {};
  const tape = { bands: [], pips: [] };
  const chevrons = [];
  const avoid = [null];
  const threats = [];
  // owned here and handed to nobody: a retained shared reference is D85's defect
  const threatState = new Map();
  const threatOpts = { state: threatState, dt: 0 };
  const st = blankState();
  const scr = { x: 0, y: 0, w: 0, h: 0 };
  const pt = { x: 0, y: 0 };

  const cards = createCards(ctx, { speakers: opts.speakers });
  const stick = createStick(ctx, { onSpecial: opts.onSpecial, onEngage: opts.onEngage });

  ctx.layout = layout;

  function relayout() {
    resolveLayout(view, layout, opts.tapeSide ? { side: opts.tapeSide } : null);
    canvas.style.width = view.w + 'px';
    canvas.style.height = view.h + 'px';
    canvas.width = Math.round(view.w * view.dpr);
    canvas.height = Math.round(view.h * view.dpr);
    scr.x = layout.play.x; scr.y = layout.play.y; scr.w = layout.play.w; scr.h = layout.play.h;
  }
  relayout();
  const offResize = ctx.bus ? ctx.bus.on('view:change', relayout) : null;

  const toScreen = (wx, wy, out) => view.toScreen(wx, wy, out);

  /* ------------------------------------------------------------ coaming --- */

  function drawCoaming(L, s) {
    // The painted strip. One asset at P16; a flat doped-canvas value until then,
    // and it is the only opaque thing in the HUD because it is a physical
    // object in front of the pilot, not a panel over the sky.
    for (const r of [L.coaming, L.coaming2]) {
      if (!r) continue;
      g.fillStyle = rgba(INK.tapeBody, INK.coamA);
      g.fillRect(r.x, r.y, r.w, r.h);
      mark(g, (p) => { p.moveTo(r.x, r.y); p.lineTo(r.x + r.w, r.y); },
           { col: INK.brass, a: INK.stickA, w: METRICS.HAIRLINE, cap: 'butt' });
    }

    /* --- the speed arc, and the ghost energy needle --------------------- */
    const a = L.arc;
    const vmax = METRICS.ARC_VMAX;
    const ang = (v) => Math.PI + Math.PI * Math.min(1, Math.max(0, v / vmax));

    mark(g, (p) => p.arc(a.cx, a.cy, a.r, Math.PI, TAU),
         { col: INK.brass, a: INK.stickA, w: METRICS.ARC_W, cap: 'butt' });
    // the redline, painted in — over it the rigging howls and the wings die
    if (s.vne > 0) {
      mark(g, (p) => p.arc(a.cx, a.cy, a.r, ang(s.vne), TAU),
           { col: INK.danger, a: INK.tapeMarkA, w: METRICS.ARC_W, cap: 'butt' });
    }
    for (let v = 0; v <= vmax; v += vmax / METRICS.ARC_TICKS) {
      const t = ang(v), c = Math.cos(t), sn = Math.sin(t);
      mark(g, (p) => {
        p.moveTo(a.cx + c * (a.r - METRICS.ARC_TICK), a.cy + sn * (a.r - METRICS.ARC_TICK));
        p.lineTo(a.cx + c * a.r, a.cy + sn * a.r);
      }, { col: INK.brass, a: INK.stickA, w: METRICS.HAIRLINE });
    }

    /**
     * The second needle. ART §10: "a ghost needle showing total energy (speed
     * traded against altitude) so the player learns the trade by watching the
     * two diverge. That single second needle teaches the entire flight model
     * without a tutorial line."
     *
     * It reads the speed you would have after spending ONE PORTRAIT SCREEN of
     * sky (150 m, `ARC_DIVE_M`) — bounded, so it never pins the arc, and it is
     * a trade the player can actually make in about nine seconds (D31).
     */
    const hAvail = Math.min(s.altM || 0, METRICS.ARC_DIVE_M);
    const vE = Math.sqrt(s.speedSI * s.speedSI + 2 * G_SI * hAvail);
    const gt = ang(vE);
    mark(g, (p) => {
      p.moveTo(a.cx, a.cy);
      p.lineTo(a.cx + Math.cos(gt) * METRICS.ARC_NEEDLE, a.cy + Math.sin(gt) * METRICS.ARC_NEEDLE);
    }, { col: INK.ink, a: INK.stickA, w: METRICS.ARC_GHOST_W });

    const nt = ang(s.speedSI);
    mark(g, (p) => {
      p.moveTo(a.cx, a.cy);
      p.lineTo(a.cx + Math.cos(nt) * METRICS.ARC_NEEDLE, a.cy + Math.sin(nt) * METRICS.ARC_NEEDLE);
    }, { col: INK.brass, a: 1, w: METRICS.ARC_GHOST_W });

    /* --- the ammo belt: not a number, a belt that empties -------------- */
    const b = L.belt;
    const n = METRICS.BELT_TICKS;
    const step = b.w / n;
    const left = Math.round(n * Math.min(1, s.ammo / Math.max(1, s.ammoMax)));
    const low = left <= n * METRICS.BELT_LOW_FRAC;
    for (let i = 0; i < left; i++) {
      const x = b.x + b.w - (i + 1) * step;
      mark(g, (p) => { p.moveTo(x, b.y); p.lineTo(x, b.y + b.h); },
           { col: low ? (s.ramp && s.ramp.accent) || INK.warn : INK.brass, a: INK.tapeMarkA,
             w: METRICS.BELT_TICK_W, cap: 'butt' });
    }

    /* --- STRESS, never G (R-07 / D77) ---------------------------------- */
    const sr = L.stress;
    g.font = font(METRICS.FONT_SMALL);
    label(g, 'STRESS', sr.x, sr.y - METRICS.FONT_SMALL * 0.5, { col: INK.ink, a: INK.glassA });
    mark(g, (p) => { p.moveTo(sr.x, sr.y + sr.h * 0.5); p.lineTo(sr.x + sr.w, sr.y + sr.h * 0.5); },
         { col: INK.ink, a: INK.stickA, w: sr.h, cap: 'butt' });
    const sv = Math.min(1, s.stress);
    const scol = s.stress >= BLACKOUT ? INK.danger : s.stress >= GREYOUT ? INK.warn : INK.brass;
    mark(g, (p) => { p.moveTo(sr.x, sr.y + sr.h * 0.5); p.lineTo(sr.x + sr.w * sv, sr.y + sr.h * 0.5); },
         { col: scol, a: 1, w: sr.h, cap: 'butt' });
    for (const t of [GREYOUT, BLACKOUT]) {
      mark(g, (p) => { p.moveTo(sr.x + sr.w * t, sr.y); p.lineTo(sr.x + sr.w * t, sr.y + sr.h); },
           { col: INK.bright, a: INK.glassA, w: METRICS.HAIRLINE, cap: 'butt' });
    }

    /* --- the engine gauge: the only damage instrument there is --------- */
    const e = L.engine;
    mark(g, (p) => { p.moveTo(e.x, e.y + e.h * 0.5); p.lineTo(e.x + e.w, e.y + e.h * 0.5); },
         { col: INK.ink, a: INK.stickA, w: e.h, cap: 'butt' });
    const eh = Math.max(0, Math.min(1, s.engine));
    mark(g, (p) => { p.moveTo(e.x, e.y + e.h * 0.5); p.lineTo(e.x + e.w * eh, e.y + e.h * 0.5); },
         { col: eh < ENG_WEAK ? INK.danger : eh < ENG_WARN ? INK.warn : INK.brass, a: 1, w: e.h, cap: 'butt' });
  }

  /** ARCHITECTURE §3.4's greyout / blackout, on D77's stress scale — the sim's own. */
  const GREYOUT = STRESS.greyOn, BLACKOUT = STRESS.blackOn;
  /** DESIGN §3.2's engine ladder — the damage module's own. */
  const ENG_WARN = ENGINE_LADDER.warn, ENG_WEAK = ENGINE_LADDER.weak;

  /* -------------------------------------------------------------- top --- */

  function drawTop(L, s) {
    if (s.objective) {
      g.font = font(METRICS.FONT_BANNER);
      label(g, s.objective.toUpperCase(), L.banner.x + L.banner.w * 0.5, L.banner.y + L.banner.h * 0.5,
            { col: INK.objective, a: INK.glassA, align: 'center' });
    }
    // wind: an arrow and a number, plus a second smaller arrow if there is shear
    const w = L.wind;
    const cy = w.y + w.h * 0.5;
    const dir = s.wind < 0 ? -1 : 1;
    mark(g, (p) => {
      const x1 = w.x + METRICS.WIND_ARROW * 2;
      p.moveTo(w.x, cy); p.lineTo(x1, cy);
      const tip = dir > 0 ? x1 : w.x;
      p.moveTo(tip, cy); p.lineTo(tip - dir * METRICS.WIND_ARROW, cy - METRICS.WIND_ARROW * 0.5);
      p.moveTo(tip, cy); p.lineTo(tip - dir * METRICS.WIND_ARROW, cy + METRICS.WIND_ARROW * 0.5);
    }, { col: INK.ink, a: INK.glassA, w: METRICS.HAIRLINE });
    g.font = font(METRICS.FONT_SMALL);
    label(g, Math.abs(Math.round(s.wind)) + '', w.x + w.w, cy, { col: INK.ink, a: INK.glassA, align: 'right' });
    if (s.windShear) {
      mark(g, (p) => {
        p.moveTo(w.x, cy + METRICS.WIND_ARROW);
        p.lineTo(w.x + METRICS.WIND_ARROW * (s.windShear < 0 ? -1 : 1), cy + METRICS.WIND_ARROW);
      }, { col: INK.warn, a: INK.stickA, w: METRICS.HAIRLINE });
    }
  }

  /* ----------------------------------------------------------- render --- */

  function update(dt) {
    threatOpts.dt = dt;
    stick.update(dt);
    cards.update(dt);
  }

  /**
   * `only: 'chrome'` draws the screen-locked HUD and skips the world-anchored
   * overlay. It exists because gate H4 measures two things DESIGN §2.9a
   * deliberately separates: the HUD's geometry, which must not change with
   * zoom, and the fixed-SIZE markers pinned to world points, whose POSITION
   * must. Measured together, a chevron drifting through the special slot's
   * padded region reads as the HUD scaling. It is not a way to hide anything:
   * `bboxesWide()` measures the overlay too and its movement is reported.
   */
  function render(s0, only) {
    const s = s0 || st;
    const L = layout;
    g.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    g.clearRect(0, 0, view.w, view.h);

    // The forbidden implementation, shipped alongside so the gate can be shown
    // to catch it. No shipped build ever sets ?hudbug= (P2_NOTES §10's rule).
    if (BUG === 'zoom') {
      const z = (view.cam && view.cam.zoom) || 1;
      g.translate(view.w * 0.5, view.h * 0.5);
      g.scale(z, z);
      g.translate(-view.w * 0.5, -view.h * 0.5);
    }

    // world-anchored, fixed screen size — under the HUD furniture, over the world
    if (only !== 'chrome') {
      drawCratePips(g, s.crates, toScreen);
      drawGlyphs(g, s.contacts, toScreen);
      if (s.lead) drawLeadPip(g, s.lead, toScreen, s.leadInCone);
      if (BUG !== 'nobracket') {
        threatModel(s.player, s.hostiles, threats, threatOpts);
        drawBrackets(g, threats, toScreen, s.hullPx);
      }
    }

    // The chevrons are a screen-EDGE element with a world-anchored y: which
    // contact they point at is the whole feature, so their vertical position
    // moves with the camera exactly as the overlay's does. Their SIZE is zoom-
    // free (it is a function of world distance), which is what §2.9a requires.
    if (BUG !== 'nochev' && only !== 'chrome') {
      chevronModel(s.contacts, scr, toScreen, chevrons);
      drawChevrons(g, chevrons, scr, RANGES.CHEV_RANGE_WU);
    }
    if (BUG !== 'notape') {
      tapeModel(L.tape, s, tape);
      if (BUG === 'framepip') {
        // the believable-wrong tape: pips only for what is nearly on screen
        const keep = tape.pips.filter((p) => Math.abs(p.y - tape.playerY) < METRICS.CHEV_MERGE_PX);
        tape.pips.length = 0; tape.pips.push(...keep);
      }
      avoid[0] = L.special;
      drawTape(g, tape, { ramp: s.ramp, side: L.tape.side, labelX: L.tape.labelX,
                          pipX: L.tape.pipX, avoid });
    }

    drawCoaming(L, s);
    drawTop(L, s);
    stick.draw(g, L, s);
    cards.draw(g, L);
  }

  return {
    canvas, layout, cards, stick, state: st,
    update, render, relayout,
    get tape() { return tape; },
    get chevrons() { return chevrons; },
    get threats() { return threats; },
    elements: () => layout.elements,
    destroy() {
      stick.destroy();
      if (offResize) offResize();
      canvas.remove();
    },
  };
}

/**
 * Build a frame state from the shipping sim objects. Both `tools/pages/hud.html`
 * and P10's play scene call THIS — a second version of it in the harness is how
 * a HUD gate ends up measuring the harness (D72).
 */
export function hudState(out, world, player, cam, view, extra = {}) {
  const s = out;
  const pf = player && player.flight;
  s.player = player;
  s.playerX = pf ? pf.sx / M_PER_WU : 0;
  s.playerY = pf ? pf.sy / M_PER_WU : 0;
  const halfH = (view.worldH / ((cam && cam.zoom) || 1)) * 0.5;
  s.viewTopY = (cam ? cam.y : 0) - halfH;
  s.viewBotY = (cam ? cam.y : 0) + halfH;

  // DESIGN §2.7's energy chevron: E = alt + v^2/2g, the height you could zoom to
  const v = pf ? Math.hypot(pf.svx, pf.svy) : 0;
  const altM = pf ? -pf.sy : 0;
  s.altM = altM;
  s.speedSI = v;
  s.energyWu = -(altM + (v * v) / (2 * G_SI)) / M_PER_WU;

  s.contacts.length = 0;
  s.hostiles.length = 0;
  s.crates.length = 0;
  if (world) {
    for (let i = 0; i < world.live.length; i++) {
      const e = world.live[i];
      if (e === player || !e.alive) continue;
      const f = e.flight;
      const x = f.sx / M_PER_WU, y = f.sy / M_PER_WU;
      const dx = x - s.playerX, dy = y - s.playerY;
      const d = Math.hypot(dx, dy);
      const rvx = (f.svx - (pf ? pf.svx : 0)) / M_PER_WU, rvy = (f.svy - (pf ? pf.svy : 0)) / M_PER_WU;
      s.contacts.push({
        id: e.id, x, y, side: e.side, kind: 'aircraft', dist: d,
        closing: d > 0 ? -(rvx * dx + rvy * dy) / d : 0,
        mark: e.type && e.type.mark ? e.type.mark : '',
      });
      if (e.side !== player.side) s.hostiles.push(e);
    }
    if (world.crates) {
      for (const c of world.crates.crates) {
        if (!c.alive) continue;
        // crateX/crateY carry the pendulum offset; c.sx/c.sy are the DRAG BODY.
        // The pip must sit on the box the player is trying to fly through.
        const cx = world.crates.crateX(c) / M_PER_WU, cy = world.crates.crateY(c) / M_PER_WU;
        // The predicted impact is `field.predict` — the same integration the sim
        // and the AI use. P6_NOTES §13.1: do not write a second one.
        let impact = null;
        if (extra.predictImpact && world.crates.predict) {
          world.crates.predict(c, TIMING.PREDICT_SECS, extra.windErr || 0, PRED);
          impact = { x: PRED.x / M_PER_WU, y: PRED.y / M_PER_WU };
        }
        s.crates.push({
          x: cx, y: cy, mark: c.kind ? c.kind[0].toUpperCase() : '',
          enemySide: c.owner === 'enemy', impact,
        });
        s.contacts.push({
          id: 'crate:' + (c.id || ''), x: cx, y: cy, side: 0, kind: 'crate',
          dist: Math.hypot(cx - s.playerX, cy - s.playerY), closing: 0,
        });
      }
    }
  }

  const gun = player && player.gun;
  s.ammo = gun ? gun.ammo : 0;
  s.ammoMax = gun && gun.tier ? gun.tier.ammo : 1;
  s.vne = player && player.af ? player.af.vne : 0;
  s.stress = pf ? pf.stress : 0;
  s.engine = player ? player.hp.engine / Math.max(1, player.hpMax.engine) : 1;
  s.hullPx = HULL_WU * view.scale * ((cam && cam.zoom) || 1);
  s.special = player ? player.special : '';
  s.specialAmmo = player ? player.specialAmmo : 0;
  for (const k in extra) s[k] = extra[k];
  return s;
}

const PRED = { x: 0, y: 0, t: 0, grounded: false };

/** R-10's drawn hull. The sim declares it in metres; this is the same number. */
const HULL_WU = HULL_M / M_PER_WU;

export { TIMING };
