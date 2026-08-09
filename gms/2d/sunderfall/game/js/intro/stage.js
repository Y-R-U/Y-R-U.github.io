/* The stage: art generation, camera, scene presets, cue handling and the frame pipeline.
 *
 * World units: pixels at reference scale, +Y is down, ground sits at y = 0 (ARCHITECTURE §3).
 * The camera is described by the world HEIGHT it shows; portrait shows 1.25x that height and a
 * correspondingly narrow column, so characters stay the same relative size in both orientations
 * instead of shrinking to ants on a phone.
 */

import { createGL, makeProgram, makeTarget, bindTarget, clear, drawQuad, texFromCanvas, makeDynamicTex, BLEND } from './gl.js';
import { createPasses } from './passes.js';
import { ParticleSystem, MODE } from './particles.js';
import * as ART from './art.js';
import { Rook, Vayne } from './chars.js';
import { makeRng, clamp, sat, mix, smoothstep, span, pulse, ease, fbm2 } from './util.js';

const freshState = () => ({
  seam: { open: 0, width: 0.010, glow: 0, amp: 0.10, core: 1, ray: 0, y: 0.30 },
  ward: { amt: 0, crack: 0, break: 0, r: 470, x: 120, y: -30 },
  dark: { rise: 0, eye: 0, flip: 1, focus: 0.5, amt: 0 },
  glyph: { amt: 0, spin: 0 },
  title: { targets: null, formed: 0, tex: null, rect: null, t0: 0, out: 0 },
  exposure: 1, bloom: 1, rays: 1, vig: 0.55,
});

export class Stage {
  constructor(canvas, { lowSpec = false } = {}) {
    this.canvas = canvas;
    this.lowSpec = lowSpec;
    const { gl, floatOK } = createGL(canvas);
    this.gl = gl;
    this.floatOK = floatOK;
    this.passes = createPasses(gl, floatOK);

    this.W = 1; this.H = 1; this.dpr = 1;
    this.portrait = false;

    this.cam = { x: 0, y: -420, h: 1000 };
    this.trauma = 0; this.shakeX = 0; this.shakeY = 0;
    this.waves = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    this.flash = [0, 0, 0];
    this.fade = 1;
    this.chroma = 0;
    this.shimmer = 0;
    this.timeScale = 1;

    this.rook = new Rook();
    this.vayne = new Vayne();
    this.scene = 'battle';
    this.sceneT = 0;
    this.t = 0;

    this.state = freshState();
    this._rng = makeRng(20260809);
    // per-pass kill switches, for bisecting a bad frame from the console
    this.palettes = PALETTE;
    this.dbg = { sky: 1, seam: 1, dark: 1, layers: 1, mist: 1, glyph: 1, ward: 1, chars: 1, parts: 1, front: 1, bloom: 1, rays: 1 };
  }

  /* Rewind everything mutable. Textures and GL objects survive — only the performance restarts. */
  reset() {
    this.cam = { x: 0, y: -420, h: 1000 };
    this.trauma = 0; this.shakeX = 0; this.shakeY = 0;
    this.waves = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    this.flash = [0, 0, 0];
    this.fade = 1; this.chroma = 0; this.shimmer = 0; this.timeScale = 1;
    this._cutting = false;
    this.rook = new Rook();
    this.vayne = new Vayne();
    this.anchorR = this.anchorV = null;
    this.pAdd?.clear(); this.pSoft?.clear();
    this.state = freshState();
    this.t = 0; this.sceneT = 0;
  }

  /* ── build ──────────────────────────────────────────────────────────────── */

  async build(onProgress = () => {}) {
    const gl = this.gl;
    const G = this.lowSpec ? 1536 : 2560;
    const Gh = G >> 2;                       // 4:1 sheets
    this.genW = G; this.genH = Gh;
    const step = async (label, fn) => { onProgress(label); await new Promise((r) => setTimeout(r, 0)); return fn(); };

    const up = (cnv, o) => { const t = texFromCanvas(gl, cnv, o); cnv.width = cnv.height = 0; return t; };
    this._tex = {};
    const T = this._tex;

    T.spark = texFromCanvas(gl, ART.paintSpark(96));

    // groundY is 0.74 on every tree sheet: the bottom quarter of each sheet is the soil the band
    // stands in, painted over the trunks so nothing terminates in open air. See the RECT note.
    T.treeFar = up(await step('far trees', () => ART.paintTrees(G, Gh, {
      seed: 11, count: 34, value: 0.55, groundY: 0.74, hMin: 0.26, hMax: 0.56,
      density: 0.55, foliageScale: 0.85, spread: 0.62, mottle: 1.1,
      clusters: 4, tiers: [0.30, 0.60, 1.0], grass: 0.5, bank: 1,
    })));
    T.treeMid = up(await step('mid trees', () => ART.paintTrees(G, Gh, {
      seed: 23, count: 20, value: 0.42, groundY: 0.74, hMin: 0.46, hMax: 0.80,
      density: 0.85, foliageScale: 1.0, spread: 0.70, mottle: 1.0,
      clusters: 3, tiers: [0.34, 0.66, 1.0], grass: 0.9,
    })));
    T.treeNear = up(await step('near trees', () => ART.paintTrees(G, Gh, {
      seed: 37, count: 12, value: 0.26, groundY: 0.74, hMin: 0.74, hMax: 1.05,
      density: 1.1, foliageScale: 1.25, spread: 0.80, mottle: 0.8, trunkScale: 1.25,
      clusters: 3, tiers: [0.42, 0.72, 1.0], grass: 1.3,
    })));
    T.treeFg = up(await step('foreground', () => ART.paintTrees(G, Gh, {
      seed: 53, count: 7, value: 0.10, groundY: 0.74, hMin: 1.05, hMax: 1.4,
      density: 1.2, foliageScale: 1.5, spread: 0.9, mottle: 0.35, trunkScale: 1.7,
      clusters: 2, tiers: [0.6, 0.85, 1.0], grass: 1.4,
    })));
    T.fgBand = up(await step('undergrowth', () => ART.paintFgBand(G, Gh, { seed: 41, value: 0.085, lip: 0.30 })));
    T.canopy = up(await step('canopy', () => ART.paintCanopy(G, Gh, { seed: 71, value: 0.09, drop: 0.55 })));
    T.groundMid = up(await step('ground', () => ART.paintGround(G, Gh, {
      seed: 5, value: 0.32, topY: 0.30, relief: 0.07, grass: 1.0, ferns: 0.9, rocks: 1,
    })));
    T.groundNear = up(await step('undergrowth', () => ART.paintGround(G, Gh, {
      seed: 91, value: 0.14, topY: 0.26, relief: 0.05, grass: 1.5, ferns: 1.6, rocks: 1.4, grassScale: 1.7,
    })));
    T.burnt = up(await step('scorched ground', () => ART.paintClearingFloor(G, Gh, { seed: 13, value: 0.20 })));
    T.glyph = up(await step('the glyph', () => ART.paintGlyph(this.lowSpec ? 512 : 1024)));

    const vil = await step('Thornmere', () => ART.paintVillage(G, Gh, { seed: 3, value: 0.24, groundY: 0.78 }));
    T.village = up(vil.canvas);
    T.villageE = up(vil.emissive);
    this.villageWindows = vil.windows.map((w) => ({ u: w.x / G, v: w.y / Gh, warm: w.warm }));

    // title masks: one line in landscape, stacked in a narrow column
    const t1 = ART.paintTitle(1600, 320, 'SUNDERFALL', { track: 0.17 });
    const t2 = ART.paintTitle(760, 700, 'SUNDER', { size: 196, track: 0.13 });
    const t2b = ART.paintTitle(760, 700, 'FALL', { size: 196, track: 0.13 });
    {
      const g = t2.getContext('2d');
      g.globalCompositeOperation = 'source-over';
      g.drawImage(t2b, 0, 214);
      g.clearRect(0, 0, 760, 190);
    }
    const N = this.lowSpec ? 2600 : 7000;
    // normalise to the ink's own bounding box so the world mapping is exact
    const fit = (pts, cw, ch) => {
      let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
      for (let i = 0; i < pts.length; i += 2) {
        if (pts[i] < x0) x0 = pts[i]; if (pts[i] > x1) x1 = pts[i];
        if (pts[i + 1] < y0) y0 = pts[i + 1]; if (pts[i + 1] > y1) y1 = pts[i + 1];
      }
      const sx = 1 / Math.max(1e-4, x1 - x0), sy = 1 / Math.max(1e-4, y1 - y0);
      for (let i = 0; i < pts.length; i += 2) { pts[i] = (pts[i] - x0) * sx; pts[i + 1] = (pts[i + 1] - y0) * sy; }
      return { pts, aspect: ((y1 - y0) * ch) / ((x1 - x0) * cw), box: [x0, y0, x1, y1] };
    };
    this.titlePts = { wide: fit(ART.samplePoints(t1, N, 2), 1600, 320), tall: fit(ART.samplePoints(t2, N, 3), 760, 700) };
    T.titleWide = texFromCanvas(gl, t1);
    T.titleTall = texFromCanvas(gl, t2);
    this.titleUv = { wide: this.titlePts.wide.box, tall: this.titlePts.tall.box };
    t1.width = t1.height = t2.width = t2.height = t2b.width = t2b.height = 0;

    // character canvases, re-uploaded each frame
    const CS = this.lowSpec ? 512 : 768;
    this.charSize = CS;
    this.charC = ART.makeCanvas(CS, CS);
    this.charE = ART.makeCanvas(CS, CS);
    this.charTex = makeDynamicTex(gl, this.charC.c);
    this.charTexE = makeDynamicTex(gl, this.charE.c);
    this.charRect = { x: -400, y: -800, w: 800, h: 800 };

    const NA = this.lowSpec ? 9000 : 26000;
    const NS = this.lowSpec ? 3000 : 9000;
    this.pAdd = new ParticleSystem(gl, NA, T.spark);
    this.pSoft = new ParticleSystem(gl, NS, T.spark);

    onProgress('ready');
    this.built = true;
  }

  /* ── viewport ───────────────────────────────────────────────────────────── */

  resize(w, h, dpr) {
    this.W = w; this.H = h; this.dpr = dpr;
    this.portrait = h > w * 1.08;
    const bw = Math.max(2, Math.round(w * dpr)), bh = Math.max(2, Math.round(h * dpr));
    this.canvas.width = bw; this.canvas.height = bh;
    this.passes.resize(bw, bh);
  }

  get aspect() { return this.W / this.H; }
  get viewH() { return this.cam.h * (this.portrait ? 1.25 : 1); }
  get viewW() { return this.viewH * this.aspect; }

  worldToUv(x, y) {
    const cx = this.cam.x + this.shakeX, cy = this.cam.y + this.shakeY;
    return [(x - cx) / this.viewW + 0.5, (y - cy) / this.viewH + 0.5];
  }
  worldToCss(x, y) {
    const uv = this.worldToUv(x, y);
    return [uv[0] * this.W, uv[1] * this.H];
  }

  /* ── cues ───────────────────────────────────────────────────────────────── */

  shake(a) { this.trauma = Math.min(1.4, this.trauma + a); }

  wave(x, y, strength) {
    const uv = this.worldToUv(x, y);
    let slot = 0, best = -1;
    for (let i = 0; i < 3; i++) if (this.waves[i][3] <= 0.001 || this.waves[i][2] > best) { best = this.waves[i][2]; slot = i; }
    this.waves[slot] = [uv[0], 1 - uv[1], 0, strength];
  }

  hit(rgb, a) { this.flash[0] += rgb[0] * a; this.flash[1] += rgb[1] * a; this.flash[2] += rgb[2] * a; }

  cue(name, audio) {
    const S = this.state, R = this.rook, V = this.vayne;
    switch (name) {
      case 'audio.battle': audio?.setBed('battle', 0.6, 1.0); break;
      case 'audio.silence': audio?.setBed(null, 2.2); break;
      case 'audio.dusk': audio?.setBed('dusk', 2.0, 0.8); break;
      case 'audio.thin': audio?.setBed('wood', 2.0, 0.7); break;

      case 'dark.slam': {
        S.dark.amt = Math.min(1, S.dark.amt + 0.35);
        this.shake(0.85);
        this.wave(S.ward.x, S.ward.y - 120, 1.5);
        this.hit([1.0, 0.72, 0.42], 0.42);
        this.chroma = 1.5;
        S.ward.crack = Math.min(1, S.ward.crack + 0.22);
        this.pAdd.emit(this.lowSpec ? 320 : 900, {
          x: S.ward.x, y: S.ward.y - 60, shape: 'ring', radius: S.ward.r * 0.95, squash: 0.62,
          speed: [180, 900], life: [0.5, 1.7], size: [4, 16], sizeEnd: [0, 2],
          color: [1.6, 1.15, 0.55, 1], color2: [1.0, 0.22, 0.05, 0], gravity: 220, drag: 1.4, flow: 90, colorJitter: 0.3,
        });
        audio?.slam(1.0);
        break;
      }
      case 'dark.lash': {
        this.shake(0.5); this.chroma = 1.0;
        S.dark.amt = Math.min(1, S.dark.amt + 0.25);
        this.pSoft.emit(this.lowSpec ? 200 : 520, {
          x: [-500, 500], y: [-1250, -700], speed: [60, 320], angle: 1.4, spread: 1.4,
          life: [1.2, 2.6], size: [40, 150], sizeEnd: [90, 260],
          color: [0.02, 0.02, 0.035, 0.55], color2: [0.0, 0.0, 0.0, 0], gravity: 40, drag: 0.8, flow: 130,
        });
        audio?.slam(0.7);
        break;
      }
      case 'ward.crack':
        S.ward.crack = Math.min(1, S.ward.crack + 0.30);
        audio?.crack(1);
        this.pAdd.emit(this.lowSpec ? 120 : 380, {
          x: S.ward.x, y: S.ward.y - 200, shape: 'ring', radius: S.ward.r * 0.9, squash: 0.7,
          speed: [80, 420], life: [0.6, 1.4], size: [3, 9], sizeEnd: 0,
          color: [1.4, 1.5, 1.8, 1], color2: [0.5, 0.7, 1.2, 0], gravity: 380, drag: 1.0,
        });
        break;
      case 'ward.flicker':
        S.ward.crack = Math.min(1, S.ward.crack + 0.12);
        audio?.crack(0.5);
        break;
      case 'ward.collapse':
        S.ward.break = 1;
        this.shake(0.7);
        audio?.crack(1.4);
        this.pAdd.emit(this.lowSpec ? 400 : 1400, {
          x: S.ward.x, y: S.ward.y - 180, shape: 'ring', radius: S.ward.r, squash: 0.75,
          speed: [40, 260], life: [1.0, 2.6], size: [4, 14], sizeEnd: 0,
          color: [1.2, 1.35, 1.9, 1], color2: [0.3, 0.4, 0.9, 0], gravity: 620, drag: 0.5,
        });
        break;

      case 'vayne.surge':
        V.armPose = 'beckon';
        V.staffGlow = 1.35;
        audio?.surge(1.6);
        // his own life burning off into the ward
        this.pAdd.emit(this.lowSpec ? 300 : 900, {
          x: V.x, y: -140, shape: 'disc', radius: 90, targets: null,
          speed: [10, 60], life: [0.8, 1.8], size: [3, 10], sizeEnd: 0,
          vy: -260, color: [1.5, 1.3, 0.9, 1], color2: [1.0, 0.5, 0.15, 0], drag: 0.5, flow: 60,
        });
        break;
      case 'vayne.knee':
        V.slump = 0.55;
        audio?.breath();
        break;
      case 'vayne.commit':
        V.armPose = 'press';
        V.staffGlow = 1.8;
        audio?.surge(2.4);
        break;
      case 'vayne.collapse':
        V.slump = 0.92; V.armPose = 'fall'; V.staffGlow = 0.35;
        audio?.breath();
        break;
      case 'vayne.beckon':
        V.armPose = 'beckon';
        break;
      case 'vayne.die':
        V.breath = 0; V.armPose = 'fall'; V.slump = 1.0; V.staffGlow = 0;
        audio?.chime(146.8, 0.16, 5.0);
        break;

      case 'seal.charge':
        V.staffGlow = 2.4;
        audio?.surge(1.4);
        this.pAdd.emit(this.lowSpec ? 600 : 2200, {
          x: S.ward.x, y: S.ward.y - 200, shape: 'disc', radius: 1500, squash: 0.8,
          mode: MODE.ATTRACT, tx: S.ward.x, ty: S.ward.y - 120, attract: 5.5,
          life: [1.2, 1.7], size: [3, 12], sizeEnd: [0, 3],
          color: [1.4, 1.2, 0.8, 1], color2: [1.8, 1.5, 1.1, 0.9], drag: 0.3, flow: 40,
        });
        break;
      case 'seal.detonate': {
        this.shake(1.4);
        this.wave(S.ward.x, S.ward.y - 120, 3.2);
        this.hit([1, 0.97, 0.92], 3.0);
        this.chroma = 2.4;
        S.ward.crack = 0; S.dark.amt = 0;
        audio?.detonate();
        this.pAdd.emit(this.lowSpec ? 1000 : 3400, {
          x: S.ward.x, y: S.ward.y - 120, shape: 'disc', radius: 60,
          speed: [400, 2600], life: [0.7, 2.8], size: [3, 12], sizeEnd: [0, 2],
          color: [2.2, 1.9, 1.4, 1], color2: [1.4, 0.42, 0.10, 0], gravity: 160, drag: 1.15, flow: 140, colorJitter: 0.25,
        });
        this.pSoft.emit(this.lowSpec ? 200 : 560, {
          x: S.ward.x, y: S.ward.y - 60, shape: 'disc', radius: 200,
          speed: [200, 950], life: [1.8, 4.2], size: [50, 140], sizeEnd: [170, 380],
          color: [0.20, 0.16, 0.15, 0.32], color2: [0.04, 0.04, 0.055, 0], gravity: -20, drag: 1.3, flow: 90,
        });
        break;
      }

      case 'title.form': {
        const wide = !this.portrait;
        const T = wide ? this.titlePts.wide : this.titlePts.tall;
        const tw = this.viewW * (wide ? 0.84 : 0.80);
        const th = tw * T.aspect;
        const cx = this.cam.x, cy = this.cam.y - this.viewH * 0.06;
        const pts = T.pts;
        const targets = new Float32Array(pts.length);
        for (let i = 0; i < pts.length; i += 2) {
          targets[i] = cx + (pts[i] - 0.5) * tw;
          targets[i + 1] = cy + (pts[i + 1] - 0.5) * th;
        }
        S.title.targets = targets;
        // the mask itself, so the word is legible however the swarm settles
        const uv = wide ? this.titleUv.wide : this.titleUv.tall;
        const fullW = tw / Math.max(1e-4, uv[2] - uv[0]);
        const fullH = th / Math.max(1e-4, uv[3] - uv[1]);
        S.title.rect = {
          x: cx - tw / 2 - uv[0] * fullW, y: cy - th / 2 - uv[1] * fullH, w: fullW, h: fullH,
        };
        S.title.tex = wide ? 'titleWide' : 'titleTall';
        S.title.t0 = this.t;
        this.pAdd.retarget(targets, MODE.ATTRACT, 11.0);
        this.pAdd.forEach((d, i) => { d[i + 7] = Math.max(d[i + 7], d[i + 6] + 3.8); d[i + 19] = 5.0; });
        this.pAdd.emit(this.lowSpec ? 2600 : 7000, {
          x: [cx - this.viewW * 0.75, cx + this.viewW * 0.75],
          y: [cy - this.viewH * 0.75, cy + this.viewH * 0.75],
          targets, mode: MODE.ATTRACT, attract: [7, 14],
          speed: [0, 120], life: [3.4, 4.4], size: [2.2, 5.2], sizeEnd: [1.4, 3.2],
          color: [2.0, 1.35, 0.62, 1], color2: [1.7, 0.85, 0.30, 1], drag: 5.0, colorJitter: 0.22,
        });
        S.title.formed = 1;
        audio?.chime(392, 0.07, 3.4);
        break;
      }
      case 'title.scatter':
        S.title.formed = 0;
        S.title.out = this.t;
        this.pAdd.retarget(null, MODE.FREE, 0);
        this.pAdd.forEach((d, i) => { d[i + 18] = 130; d[i + 19] = 0.9; d[i + 3] += 40 + Math.random() * 130; d[i + 2] += (Math.random() - 0.5) * 200; });
        break;

      case 'rook.walk': R.speed = 132; R.armPose = 'walk'; break;
      case 'rook.exit': R.speed = 150; break;
      case 'rook.stop': R.speed = 0; R.armPose = 'sulk'; break;
      case 'wood.wrongLight': break;
      case 'wood.push': break;
      case 'clearing.reveal': audio?.chime(65.4, 0.13, 6.0); break;

      case 'stone.reveal':
        V.stone = 1; V.armPose = 'beckon';
        audio?.chime(659.3, 0.05, 2.6);
        break;
      case 'stone.press':
        V.armPose = 'press';
        R.armPose = 'shield';
        break;
      case 'stone.meld': {
        const cx = R.x, cy = -R.h * 0.62;
        V.stone = 0;
        R.glow = 1;
        R.armPose = 'reel';
        R.buildVeins(9);
        this.shake(1.35);
        this.wave(cx, cy, 3.6);
        this.hit([1, 0.95, 0.86], 3.2);
        this.chroma = 2.6;
        this.timeScale = 0.12;
        audio?.meld();
        this.pAdd.emit(this.lowSpec ? 1100 : 3600, {
          x: cx, y: cy, shape: 'disc', radius: 34,
          speed: [500, 3000], life: [0.6, 2.6], size: [3, 11], sizeEnd: [0, 1.5],
          color: [2.6, 2.1, 1.5, 1], color2: [1.5, 0.35, 0.06, 0], gravity: 120, drag: 1.2, flow: 160, colorJitter: 0.3,
        });
        this.pAdd.emit(this.lowSpec ? 300 : 1100, {
          x: cx, y: cy, shape: 'ring', radius: 40, squash: 1,
          mode: MODE.ORBIT, tx: cx, ty: cy, attract: 3.0,
          speed: [60, 200], life: [1.4, 3.4], size: [3, 11], sizeEnd: 0,
          color: [2.0, 1.5, 0.9, 1], color2: [1.0, 0.2, 0.05, 0], drag: 0.4,
        });
        this.pSoft.emit(this.lowSpec ? 220 : 620, {
          x: cx, y: cy, shape: 'disc', radius: 120,
          speed: [260, 1200], life: [1.6, 3.8], size: [50, 150], sizeEnd: [190, 430],
          color: [0.22, 0.17, 0.16, 0.34], color2: [0.04, 0.035, 0.05, 0], gravity: -30, drag: 1.3, flow: 80,
        });
        this.pAdd.push(cx, cy, 900, 900, 2400);
        this.pSoft.push(cx, cy, 700, 700, 2400);
        break;
      }
      case 'stone.veins': R.veins = 0.001; break;
      case 'stone.settle': R.armPose = 'sulk'; break;

      case 'darkness.enter':
        S.dark.flip = 0; S.dark.rise = 0.001; S.dark.eye = 1;
        this.shake(0.5);
        audio?.setBed('dark', 1.0, 1.0);
        audio?.slam(1.3);
        break;
      case 'cut.black': this._cutting = true; break;
      default: break;
    }
  }

  /* ── update ─────────────────────────────────────────────────────────────── */

  update(t, dt, shot, audio) {
    this.t = t;
    this.scene = shot.scene;
    this.sceneT = t - shot.t;
    this.shotDur = shot.dur;
    const S = this.state;

    // camera + scene state
    this[`_sc_${this.scene}`]?.(this.sceneT, dt, audio);

    // decay
    this.trauma = Math.max(0, this.trauma - dt * 1.05);
    const tr = this.trauma * this.trauma;
    const n = (k) => fbm2(t * 26 + k, k * 3.7, 2) - 0.5;
    this.shakeX = n(1) * tr * this.viewW * 0.055;
    this.shakeY = n(9) * tr * this.viewH * 0.055;
    this.chroma = Math.max(0, this.chroma - dt * 6);
    for (let i = 0; i < 3; i++) {
      const w = this.waves[i];
      if (w[3] > 0.001) { w[2] += dt * 1.35; w[3] *= Math.exp(-dt * 2.4); if (w[2] > 1.6) w[3] = 0; }
    }
    for (let i = 0; i < 3; i++) this.flash[i] = Math.max(0, this.flash[i] - dt * 9 * (0.4 + this.flash[i]));
    this.timeScale = Math.min(1, this.timeScale + dt * 2.6);

    this.rook.update(dt);
    this.vayne.update(dt);
    if (this.rook.veins > 0) this.rook.veins = Math.min(1.35, this.rook.veins + dt * 0.42);

    this.pAdd.update(dt, 14);
    this.pSoft.update(dt, 8);
  }

  /* ── scenes ─────────────────────────────────────────────────────────────── */

  _sc_battle(lt, dt, audio) {
    const S = this.state;
    const k = sat(lt / 11);
    this.cam.h = mix(940, 820, ease.inOutCubic(k));
    this.cam.x = mix(70, 120, k) + Math.sin(lt * 0.31) * 18;
    this.cam.y = mix(-295, -265, k);
    S.ward.x = 120; S.ward.y = -20; S.ward.r = mix(430, 370, k);
    S.ward.amt = 0.82;
    S.ward.crack = Math.min(1, S.ward.crack + dt * 0.012);
    S.dark.flip = 1;
    S.dark.rise = mix(0.155, 0.215, k);
    S.dark.amt = Math.max(0.45, S.dark.amt - dt * 0.30);
    S.dark.eye = 0.55;
    S.dark.focus = 0.5 + Math.sin(lt * 0.5) * 0.06;
    S.seam.open = 1.1;
    S.seam.width = 0.044 + 0.010 * Math.sin(lt * 1.7);
    S.seam.glow = 2.7;
    S.seam.amp = 0.115;
    S.seam.core = 1.5;
    S.seam.ray = 1.1;
    S.seam.y = 0.135;
    S.glyph.amt = 0.9; S.glyph.spin = lt * 0.06;
    S.exposure = 1.18; S.bloom = 1.2; S.rays = 1.05; S.vig = 0.64;
    this.vayne.x = 70; this.vayne.y = 0; this.vayne.face = 1; this.vayne.h = 300;
    this.vayne.slump = mix(0.14, 0.60, sat((lt - 6.5) / 3.5));
    this.rook.x = 99999;   // he is nowhere near this
    this.shimmer = 0.10;
    audio?.crackle(0.9);

    // constant ember rain off the ward, plus ash falling through the frame
    if (Math.random() < 0.9) this.pAdd.emit(this.lowSpec ? 2 : 6, {
      x: S.ward.x, y: S.ward.y - 120, shape: 'ring', radius: S.ward.r * 0.98, squash: 0.66,
      speed: [20, 140], life: [0.8, 2.2], size: [3, 9], sizeEnd: 0,
      color: [1.5, 1.0, 0.45, 1], color2: [1.0, 0.2, 0.04, 0], gravity: 300, drag: 1.0, flow: 70,
    });
    this._ash(0.9);
  }

  /* Three depth tiers rather than one uniform blizzard. Size, opacity and speed all key off depth,
   * and the near tier avoids a column around the subject so the ash never buries whoever is
   * speaking. Without this the field reads as noise laid over the picture instead of air in it. */
  _ash(rate, cx = null) {
    const sx = cx ?? this.cam.x;
    const T = [
      // [chance, count, size, sizeEnd, alpha, speed, gravity, keepClear]
      [0.85, 4, [5, 14], [7, 18], 0.24, [4, 16], 12, 0],
      [0.55, 2, [16, 40], [22, 54], 0.40, [10, 34], 24, 0],
      [0.30, 1, [46, 96], [66, 140], 0.52, [22, 60], 40, 240],
    ];
    for (const [ch, n, size, sizeEnd, al, sp, gv, clear] of T) {
      if (Math.random() > ch * rate) continue;
      let x0 = sx - this.viewW * 0.62, x1 = sx + this.viewW * 0.62;
      if (clear) {
        // push the near tier out to one side of the subject, leaving a hole around it
        const left = Math.random() < 0.5;
        if (left) x1 = Math.min(x1, this._focusX() - clear);
        else x0 = Math.max(x0, this._focusX() + clear);
        if (x1 <= x0) continue;
      }
      this.pSoft.emit(this.lowSpec ? 1 : n, {
        x: [x0, x1], y: this.cam.y - this.viewH * 0.62,
        speed: sp, life: [4, 9], size, sizeEnd,
        color: [0.11, 0.11, 0.15, al], color2: [0.04, 0.04, 0.06, 0], gravity: gv, drag: 0.4, flow: 90,
      });
    }
  }

  _focusX() {
    const R = this.rook, V = this.vayne;
    if (Math.abs(R.x) < 9000) return R.x;
    if (Math.abs(V.x) < 9000) return V.x;
    return this.cam.x;
  }

  _sc_seal(lt, dt, audio) {
    const S = this.state;
    const k = sat(lt / 7.4);
    const det = sat((lt - 1.6) / 0.35);
    this.cam.h = mix(1000, 1320, ease.outCubic(sat((lt - 1.6) / 4)));
    this.cam.x = 120; this.cam.y = mix(-325, -400, k);
    S.ward.x = 120; S.ward.y = -20; S.ward.r = 540;
    S.ward.amt = mix(1, 0, sat((lt - 1.6) / 1.2)) + sat((lt - 1.6) / 0.2) * 0 ;
    S.ward.crack = Math.max(0, S.ward.crack * (1 - dt * 3));
    S.dark.amt = Math.max(0, S.dark.amt - dt * (lt > 1.6 ? 3.0 : 0.4));
    S.dark.rise = Math.max(0, S.dark.rise - dt * (lt > 1.6 ? 0.55 : 0));
    S.dark.eye = Math.max(0, S.dark.eye - dt * 1.5);
    S.seam.open = mix(1.1, 0.0, ease.outQuint(sat((lt - 1.6) / 2.6)));
    S.seam.glow = mix(1.5, 4.5, sat(lt / 1.6)) * (1 - sat((lt - 1.6) / 2.2));
    S.seam.width = 0.016 * (1 - sat((lt - 1.6) / 2.0)) + 0.002;
    S.seam.core = 2.5; S.seam.ray = 1.6 * (1 - sat((lt - 1.6) / 2.4));
    S.glyph.amt = mix(0.9, 3.5, sat(lt / 1.6)) * (1 - sat((lt - 2.2) / 3.0));
    S.exposure = mix(1.18, 1.42, sat(lt / 1.6)) * mix(1, 0.85, sat((lt - 3) / 4));
    S.bloom = mix(1.15, 1.7, sat(lt / 1.6)) * mix(1, 0.9, sat((lt - 3) / 4));
    S.rays = mix(0.95, 2.4, sat(lt / 1.8)) * (1 - sat((lt - 2.5) / 3.5) * 0.7);
    S.vig = mix(0.62, 0.8, sat((lt - 3) / 4));
    this.vayne.x = 70; this.vayne.face = 1; this.vayne.h = 250;
    this.shimmer = 0.10 * (1 - sat((lt - 2) / 2));
    if (lt > 2.6) audio?.crackle(0.35 * (1 - sat((lt - 3) / 4)));

    // the afterglow: embers hanging in the air, which become the title
    if (lt > 1.7 && lt < 2.6 && Math.random() < 0.9) this.pAdd.emit(this.lowSpec ? 6 : 22, {
      x: [this.cam.x - this.viewW * 0.6, this.cam.x + this.viewW * 0.6],
      y: [this.cam.y - this.viewH * 0.55, this.cam.y + this.viewH * 0.4],
      speed: [5, 60], life: [4.5, 8.0], size: [3, 11], sizeEnd: [1, 4],
      color: [1.7, 1.1, 0.5, 1], color2: [1.0, 0.28, 0.06, 0], gravity: -12, drag: 0.5, flow: 55, colorJitter: 0.25,
    });
  }

  _sc_village(lt, dt, audio) {
    const S = this.state;
    const k = sat(lt / 8);
    this.cam.h = 900;
    this.cam.x = mix(-330, 380, ease.inOutCubic(sat((lt - 0.4) / 7.2)));
    this.cam.y = -338 + Math.sin(lt * 0.6) * 6;
    S.ward.amt = 0; S.dark.amt = 0; S.dark.rise = 0; S.seam.open = 0; S.seam.glow = 0; S.glyph.amt = 0;
    S.exposure = 1.06; S.bloom = 0.95; S.rays = 0.85; S.vig = 0.48;
    this.shimmer = 0;
    this.vayne.x = 99999;
    this.rook.y = 0; this.rook.face = 1; this.rook.h = 196;
    this.rook.x = -520 + (lt > 0.2 ? (lt - 0.2) * 132 : 0);
    this.rook.slouch = 1;
    if (lt > 0.4) this.rook.speed = 132;
    // hearth smoke
    if (Math.random() < 0.5) this.pSoft.emit(1, {
      x: [-820, 620], y: -560, speed: [5, 25], angle: -1.5, spread: 0.8,
      life: [3, 6], size: [22, 60], sizeEnd: [90, 190],
      color: [0.30, 0.24, 0.22, 0.30], color2: [0.10, 0.10, 0.12, 0], gravity: -35, drag: 0.4, flow: 70,
    });
    // fireflies
    if (Math.random() < 0.35) this.pAdd.emit(1, {
      x: [this.cam.x - 900, this.cam.x + 900], y: [-380, -20],
      speed: [4, 20], life: [3, 7], size: [3, 7], sizeEnd: 0,
      color: [1.5, 1.2, 0.45, 1], color2: [1.0, 0.6, 0.15, 0], gravity: -6, drag: 0.9, flow: 40,
    });
  }

  _sc_wood(lt, dt, audio) {
    const S = this.state;
    const k = sat(lt / 6);
    this.cam.h = mix(880, 800, k);
    this.cam.x = mix(-260, 220, ease.inOutCubic(k));
    this.cam.y = -308;
    S.exposure = 0.95; S.bloom = 1.0; S.rays = mix(0.5, 1.6, sat((lt - 2.2) / 3.2)); S.vig = 0.62;
    S.ward.amt = 0; S.seam.open = 0; S.seam.glow = 0; S.dark.amt = 0; S.glyph.amt = 0;
    this.shimmer = 0;
    this.vayne.x = 99999;
    this.rook.y = 0; this.rook.face = 1; this.rook.h = 196;
    this.rook.x = -420 + lt * 108;
    this.rook.speed = 108;
    this.rook.slouch = mix(1, 0.45, sat((lt - 2.6) / 2));
    if (Math.random() < 0.5) this.pAdd.emit(1, {
      x: [this.cam.x - 800, this.cam.x + 800], y: [-620, -40],
      speed: [3, 14], life: [4, 8], size: [2.5, 6], sizeEnd: 0,
      color: [0.55, 0.85, 1.2, 0.85], color2: [0.2, 0.4, 0.9, 0], gravity: -3, drag: 0.9, flow: 26,
    });
  }

  _sc_clearing(lt, dt, audio) {
    const S = this.state;
    const arrive = this.scene === 'clearing' && this.shotDur < 8;   // the 'arrive' shot
    const gt = this.t - 32.4;   // seconds since we first saw the clearing
    const k = sat(gt / 6);
    this.cam.h = mix(900, 700, ease.outCubic(sat(gt / 9)));
    this.cam.x = mix(-120, 20, ease.outCubic(sat(gt / 9)));
    this.cam.y = mix(-345, -250, ease.outCubic(sat(gt / 9))) + Math.sin(this.t * 0.4) * 5;
    S.ward.x = 150; S.ward.y = -30; S.ward.r = 430;
    S.ward.amt = 0.55 + 0.12 * Math.sin(this.t * 2.1);
    S.ward.crack = clamp(0.45 + (this.t - 32) * 0.012, 0, 0.95);
    S.ward.break = 0;
    S.dark.amt = 0; S.dark.rise = 0; S.seam.open = 0; S.seam.glow = 0;
    S.glyph.amt = 0.75 + 0.15 * Math.sin(this.t * 1.3);
    S.exposure = 1.0; S.bloom = 1.15; S.rays = 1.2; S.vig = 0.66;
    this.shimmer = 0.10;
    this.vayne.x = 150; this.vayne.y = 0; this.vayne.face = -1; this.vayne.h = 240;
    this.vayne.slump = 0.90;
    this.rook.y = 0; this.rook.h = 196; this.rook.face = 1;
    const walkIn = sat((gt - 0.3) / 2.6);
    // portrait shows a much narrower column, and at -175 he was half off the left edge
    this.rook.x = mix(-620, this.portrait ? -105 : -175, ease.outCubic(walkIn));
    this.rook.speed = walkIn < 1 ? 165 * (1 - walkIn * walkIn) : 0;
    this.rook.slouch = mix(0.35, 0.85, sat((gt - 6) / 6));
    if (this.rook.speed < 4) this.rook.armPose = 'sulk';
    audio?.crackle(0.45);
    if (Math.random() < 0.85) this.pAdd.emit(this.lowSpec ? 1 : 3, {
      x: [S.ward.x - 330, S.ward.x + 330], y: [-30, 10],
      speed: [10, 70], angle: -1.57, spread: 1.1,
      life: [1.4, 3.4], size: [3, 9], sizeEnd: 0,
      color: [1.5, 0.85, 0.30, 1], color2: [0.9, 0.15, 0.03, 0], gravity: -70, drag: 0.7, flow: 55,
    });
    if (Math.random() < 0.5) this.pSoft.emit(1, {
      x: [S.ward.x - 500, S.ward.x + 500], y: [-20, 0],
      speed: [5, 30], angle: -1.57, spread: 1.0, life: [3, 6], size: [30, 90], sizeEnd: [110, 240],
      color: [0.26, 0.22, 0.22, 0.24], color2: [0.06, 0.06, 0.08, 0], gravity: -40, drag: 0.5, flow: 60,
    });
    this._ash(0.45);
  }

  _sc_meld(lt, dt, audio) {
    const S = this.state;
    const g = this.t;
    this._sc_clearing(lt, dt, null);
    // push in hard for the meld, then ease back out
    const push = smoothstep(0, 1.6, g - 56.0) * (1 - smoothstep(0, 3.5, g - 63.5) * 0.55);
    if (this.portrait) {
      // A 430-high frame is ~250 world px WIDE in portrait — narrower than the
      // gap between Rook (-105) and Vayne (150), so the push-in that reads in
      // landscape put Rook completely off the left edge for the whole meld,
      // which is the one shot he has to be in. Push in less, and centre between
      // the two of them rather than on Vayne.
      this.cam.h = mix(700, 620, push);
      this.cam.x = mix(20, 10, push);
      this.cam.y = mix(-250, -212, push);
    } else {
      this.cam.h = mix(700, 430, push);
      this.cam.x = mix(20, 40, push);
      this.cam.y = mix(-250, -196, push);
    }
    const det = g - 58.2;
    if (det > 0 && det < 3.0) {
      S.exposure = 1.0 + 0.75 * Math.exp(-det * 2.6);
      S.bloom = 1.15 + 0.9 * Math.exp(-det * 1.8);
      S.vig = 0.66 - 0.35 * Math.exp(-det * 2.0);
    }
    audio?.crackle(0.5 + (this.rook.glow > 0 ? 0.6 : 0));
    if (this.rook.glow > 0 && Math.random() < 0.9) this.pAdd.emit(this.lowSpec ? 1 : 4, {
      x: this.rook.x, y: -this.rook.h * 0.62, shape: 'disc', radius: 26,
      speed: [30, 150], life: [0.7, 1.8], size: [3, 9], sizeEnd: 0,
      color: [2.0, 1.4, 0.7, 1], color2: [1.2, 0.25, 0.05, 0], gravity: -110, drag: 0.8, flow: 90,
    });
  }

  _sc_collapse(lt, dt, audio) {
    const S = this.state;
    this._sc_clearing(lt, dt, null);
    this.cam.h = mix(560, 900, ease.inOutCubic(sat(lt / 3.2)));
    this.cam.x = mix(40, 110, sat(lt / 3.2));
    this.cam.y = mix(-215, -318, sat(lt / 3.2));
    const dead = sat((this.t - 72.2) / 1.2);
    S.ward.amt = mix(0.55, 0.0, sat((this.t - 73.1) / 1.0));
    S.glyph.amt = mix(0.8, 0.05, dead);
    S.exposure = mix(1.0, 0.78, dead);
    S.vig = mix(0.66, 0.9, dead);
    if (S.dark.rise > 0) S.dark.rise = Math.min(1.1, S.dark.rise + dt * 0.55);
    if (this._cutting) this.fade = Math.max(0, this.fade - dt * 3.2);
    this.rook.armPose = 'shield';
    this.rook.glow = 1;
  }

  /* ── layer helpers ──────────────────────────────────────────────────────── */

  _layer(tex, rect, par, o) {
    const gl = this.gl, P = this.passes.prog.layer;
    const cx = this.cam.x + this.shakeX, cy = this.cam.y + this.shakeY;
    const zx = 2 / this.viewW, zy = -2 / this.viewH;
    P.use()
      .v4('uRect', rect.x, rect.y, rect.w, rect.h)
      .v4('uCam', cx, cy, zx, zy)
      .v2('uPar', par, o.parY ?? par)
      .v2('uOffset', o.ox || 0, o.oy || 0)
      .tex('uTex', tex, 0)
      .v3('uBase', o.base[0], o.base[1], o.base[2])
      .v3('uFog', o.fog[0], o.fog[1], o.fog[2])
      .v3('uLightCol', o.light[0], o.light[1], o.light[2])
      .v3('uAmbCol', o.ambCol ? o.ambCol[0] : 1, o.ambCol ? o.ambCol[1] : 1, o.ambCol ? o.ambCol[2] : 1)
      .f('uFogAmt', o.fogAmt ?? 0)
      .f('uRim', o.rim ?? 0)
      .f('uScatter', o.scatter ?? 0)
      .f('uAmb', o.amb ?? 1)
      .f('uValue', o.value ?? 0.2)
      .f('uRimStep', o.rimStep ?? 2.2)
      .f('uAlpha', o.alpha ?? 1)
      .f('uLightR', o.lightR ?? 900)
      .v2('uLightW', o.lx, o.ly)
      .v2('uKeyDir', o.kdx ?? 0, o.kdy ?? -1)
      .f('uKeyMode', o.keyMode ?? 0)
      .f('uFeather', o.feather ?? 0)
      .v2('uTexel', o.texelX ?? (1 / this.genW), o.texelY ?? (1 / this.genH));
    if (o.emis) { P.tex('uEmis', o.emis, 1).f('uHasEmis', 1).f('uEmisI', o.emisI ?? 1); }
    else P.f('uHasEmis', 0).f('uEmisI', 0);
    this.passes.bindVao();
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  _mist(rect, par, o) {
    const gl = this.gl, P = this.passes.prog.mist;
    const cx = this.cam.x + this.shakeX, cy = this.cam.y + this.shakeY;
    P.use()
      .v4('uRect', rect.x, rect.y, rect.w, rect.h)
      .v4('uCam', cx, cy, 2 / this.viewW, -2 / this.viewH)
      .v2('uPar', par, 1).v2('uOffset', 0, 0)
      .v3('uCol', o.col[0], o.col[1], o.col[2])
      .f('uTime', this.t).f('uAmt', o.amt).f('uScale', o.scale ?? 0.0022)
      .f('uSharp', o.sharp ?? 0.30).f('uTop', o.top ?? 0.0).f('uBot', o.bot ?? 1.0)
      .v2('uLightW', o.lx, o.ly).f('uLightR', o.lightR ?? 800)
      .v3('uLightCol', o.light[0], o.light[1], o.light[2]);
    this.passes.bindVao();
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  /* ── characters ─────────────────────────────────────────────────────────── */

  _drawChars() {
    const R = this.rook, V = this.vayne;
    const list = [];
    if (Math.abs(R.x) < 9000) list.push(R.bounds());
    if (Math.abs(V.x) < 9000) list.push(V.bounds());
    if (!list.length) return false;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const b of list) { x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const size = Math.max(x1 - x0, y1 - y0, 420);
    this.charRect = { x: cx - size / 2, y: cy - size / 2, w: size, h: size };

    const CS = this.charSize;
    const g = this.charC.g, e = this.charE.g;
    g.setTransform(1, 0, 0, 1, 0, 0); e.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, CS, CS); e.clearRect(0, 0, CS, CS);
    const s = CS / size;
    g.setTransform(s, 0, 0, s, -this.charRect.x * s, -this.charRect.y * s);
    e.setTransform(s, 0, 0, s, -this.charRect.x * s, -this.charRect.y * s);
    e.globalCompositeOperation = 'lighter';
    if (Math.abs(V.x) < 9000) this.anchorV = V.draw(g, e, this.t);
    if (Math.abs(R.x) < 9000) this.anchorR = R.draw(g, e, this.t);
    e.globalCompositeOperation = 'source-over';
    this.charTex.update();
    this.charTexE.update();
    return true;
  }

  /* ── render ─────────────────────────────────────────────────────────────── */

  render() {
    const gl = this.gl, S = this.state, P = this.passes;
    const sc = this.scene;
    const pal = PALETTE[sc] || PALETTE.clearing;
    const lx = pal.lightX ?? S.ward.x, ly = pal.lightY ?? (S.ward.y - 60);

    // ── sky, at a third resolution — it has no detail above that anyway
    const sunUv = pal.sunUv ? pal.sunUv : this.worldToUv(lx, ly);
    BLEND.none(gl);
    bindTarget(gl, P.atmos);
    P.bindVao();
    if (this.dbg.sky) { P.prog.sky.use()
      .v2('uRes', P.atmos.w, P.atmos.h).f('uTime', this.t)
      .f('uStars', pal.stars).f('uCloud', pal.cloud).f('uHaze', pal.haze)
      .f('uSunI', pal.sunI).f('uBandY', pal.bandY).f('uHorizon', pal.horizon)
      .v2('uSun', sunUv[0], sunUv[1])
      .v3('uTop', ...pal.skyTop).v3('uMid', ...pal.skyMid).v3('uLow', ...pal.skyLow)
      .v3('uSunCol', ...pal.sunCol)
      .v2('uScroll', this.cam.x * 0.00012, this.cam.y * 0.00012);
      drawQuad(gl);
    } else clear(gl, 0, 0, 0, 1);

    bindTarget(gl, P.scene);
    clear(gl, 0, 0, 0, 1);
    P.prog.blit.use().tex('uTex', P.atmos.tex, 0).f('uScale', 1);
    drawQuad(gl);

    BLEND.add(gl);
    // ── the Darkness pouring down through it
    if (S.dark.rise > 0.001 && S.dark.amt > 0.001 && this.dbg.dark) {
      BLEND.alpha(gl);
      P.bindVao();
      P.prog.dark.use()
        .v2('uRes', P.W, P.H).f('uTime', this.t)
        .f('uRise', S.dark.rise * S.dark.amt).f('uEye', S.dark.eye)
        .f('uFlip', S.dark.flip).f('uFocus', S.dark.focus).f('uReach', 0.55);
      drawQuad(gl);
    }


    BLEND.add(gl);
    // ── the seam, high in the sky, behind everything
    if (S.seam.glow > 0.01 && S.seam.open > 0.001 && this.dbg.seam) {
      P.bindVao();
      P.prog.seam.use()
        .v2('uRes', P.W, P.H).f('uTime', this.t)
        .f('uOpen', S.seam.open).f('uWidth', S.seam.width).f('uGlow', S.seam.glow)
        .f('uAmp', S.seam.amp).f('uCore', S.seam.core).f('uRayI', S.seam.ray).f('uY', S.seam.y);
      drawQuad(gl);
    }
    BLEND.alpha(gl);
    // ONE key per shot. Rim lights are computed against this direction, not against whatever local
    // light happens to be nearest, which is why adjacent trunks used to disagree about where the
    // light was. Layers that opt into keyMode use the local point light instead.
    const kd = pal.keyDir || [-0.62, -0.78];
    const kl = Math.hypot(kd[0], kd[1]) || 1;
    const L = { lx, ly, lightR: pal.lightR, light: pal.lightCol, fog: pal.fog, ambCol: pal.ambCol,
      kdx: kd[0] / kl, kdy: kd[1] / kl };
    if (this.dbg.layers) for (const spec of pal.layers) {
      const tex = this._tex[spec.tex];
      if (!tex) continue;
      this._layer(tex, RECT[spec.rect], spec.par, {
        ...L, ...spec,
        base: spec.base || pal.base,
        emis: spec.emisTex ? this._tex[spec.emisTex] : null,
        emisI: (spec.emisI ?? 1) * (pal.emisI ?? 1),
      });
      if (spec.mistAfter && this.dbg.mist) this._mist(RECT.mist, spec.par * 0.96, { ...L, ...spec.mistAfter });
    }

    // ── glyph on the ground, projected flat
    if (S.glyph.amt > 0.01 && this.dbg.glyph) {
      BLEND.add(gl);
      this._layer(this._tex.glyph, RECT.glyph, 1, {
        ...L, base: [1, 1, 1], amb: 0, rim: 0, scatter: 0, fogAmt: 0, value: 0,
        emis: this._tex.glyph, emisI: S.glyph.amt * 0.55, alpha: 1, feather: 0.06,
        ox: S.ward.x, oy: -10,
      });
      BLEND.alpha(gl);
    }

    // ── ward dome (behind the figures)
    if (S.ward.amt > 0.01 && this.dbg.ward) {
      BLEND.add(gl);
      const gl2 = this.gl, PW = P.prog.ward;
      PW.use()
        .v4('uRect', RECT.ward.x, RECT.ward.y, RECT.ward.w, RECT.ward.h)
        .v4('uCam', this.cam.x + this.shakeX, this.cam.y + this.shakeY, 2 / this.viewW, -2 / this.viewH)
        .v2('uPar', 1, 1).v2('uOffset', S.ward.x, S.ward.y)
        .v2('uCentre', S.ward.x, S.ward.y).f('uR', S.ward.r)
        .f('uTime', this.t).f('uAmt', S.ward.amt).f('uCrack', S.ward.crack)
        .f('uBreak', S.ward.break).f('uSeed', 3.7)
        .v3('uCol', ...pal.wardCol);
      P.bindVao();
      gl2.drawArrays(gl2.TRIANGLES, 0, 6);
      BLEND.alpha(gl);
    }

    // ── characters
    if (this.dbg.chars && this._drawChars()) {
      this._layer(this.charTex.tex, this.charRect, 1, {
        ...L, base: pal.charBase || pal.base, value: 0.10,
        amb: pal.charAmb ?? 1, rim: pal.charRim ?? 2.4, scatter: pal.charScatter ?? 0.35,
        fogAmt: 0, rimStep: 1.6, keyMode: pal.charKeyMode ?? 0,
        // the character sheet is square, not 4:1 — using the parallax texel here made the rim
        // gradient four times wider vertically than horizontally
        texelX: 1 / this.charSize, texelY: 1 / this.charSize,
        emis: this.charTexE.tex, emisI: 0.85,
      });
    }

    // ── particles
    const zx = 2 / this.viewW, zy = -2 / this.viewH;
    const ccx = this.cam.x + this.shakeX, ccy = this.cam.y + this.shakeY;
    BLEND.alpha(gl);
    if (this.dbg.parts) { this.pSoft.draw(ccx, ccy, zx, zy); BLEND.add(gl); this.pAdd.draw(ccx, ccy, zx, zy); }
    BLEND.add(gl);

    // ── the title, if the seal is forming it
    let titleA = 0;
    if (S.title.tex && S.title.rect) {
      const inK = sat((this.t - S.title.t0 - 0.55) / 0.9);
      const outK = S.title.out ? 1 - sat((this.t - S.title.out) / 0.7) : 1;
      const a = inK * outK;
      titleA = a;
      if (a > 0.003) {
        BLEND.add(gl);
        this._layer(this._tex[S.title.tex], S.title.rect, 1, {
          ...L, base: [1, 1, 1], amb: 0, rim: 0, scatter: 0, fogAmt: 0, value: 0,
          emis: this._tex[S.title.tex], emisI: a * 0.85, alpha: 1,
        });
      }
    }

    // ── foreground occluders, in front of everything
    //
    // The title is one line wide in landscape and a stacked column in portrait,
    // and the portrait column runs straight up into the canopy — the near tree
    // ate the S of SUNDER. Rather than move the word off the composition it was
    // designed for, the occluders go part-transparent while it is up: the canopy
    // stays as a scrim over the letterforms instead of a hole punched in them.
    BLEND.alpha(gl);
    const frontFade = this.portrait ? 1 - 0.68 * titleA : 1;
    if (this.dbg.front) for (const spec of pal.front || []) {
      const tex = this._tex[spec.tex];
      if (!tex) continue;
      this._layer(tex, RECT[spec.rect], spec.par, {
        ...L, ...spec, base: spec.base || pal.base,
        alpha: (spec.alpha ?? 1) * frontFade,
      });
    }

    // ── the thing coming through, in front of the treeline
    if (S.dark.flip < 0.5 && S.dark.rise > 0.001) {
      BLEND.alpha(gl);
      P.bindVao();
      P.prog.dark.use()
        .v2('uRes', P.W, P.H).f('uTime', this.t)
        .f('uRise', S.dark.rise).f('uEye', S.dark.eye).f('uFlip', 0).f('uFocus', 0.5).f('uReach', 0.40);
      drawQuad(gl);
    }

    // ── post
    BLEND.none(gl);
    const bloomTex = P.bloom(pal.bloomThresh ?? 1.0, 0.55, 1.2);
    const rayTex = P.godrays([sunUv[0], 1 - sunUv[1]], 0.95, 0.945, 1.0, pal.rayThresh ?? 1.2);

    bindTarget(gl, null);
    P.bindVao();
    P.prog.comp.use()
      .tex('uScene', P.scene.tex, 0).tex('uBloom', bloomTex.tex, 1).tex('uRays', rayTex.tex, 2)
      .v2('uRes', P.W, P.H).f('uTime', this.t)
      .f('uExposure', S.exposure).f('uBloomI', (pal.bloomI ?? 0.85) * S.bloom * this.dbg.bloom)
      .f('uRayI', (pal.rayI ?? 0.5) * S.rays * this.dbg.rays)
      .f('uVig', S.vig).f('uGrain', 0.020).f('uChroma', this.chroma)
      .f('uFade', this.fade).f('uShimmer', this.shimmer)
      .v3('uFlash', this.flash[0], this.flash[1], this.flash[2])
      .v3('uLift', ...pal.lift).v3('uGain', ...pal.gain)
      .f('uSat', pal.sat ?? 1.05).f('uContrast', pal.contrast ?? 1.07)
      .v4('uWave0', ...this.waves[0]).v4('uWave1', ...this.waves[1]).v4('uWave2', ...this.waves[2]);
    drawQuad(gl);
  }

  dispose() {
    const gl = this.gl;
    try {
      this.pAdd?.free(); this.pSoft?.free();
      this.charTex?.free(); this.charTexE?.free();
      for (const k in this._tex) gl.deleteTexture(this._tex[k]);
      this.passes.freeAll();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {}
  }
}

/* ── world rects for each layer ───────────────────────────────────────────── */

/* Every layer is drawn with parY = 1, so a world y is the SAME screen y in every band. That is the
 * whole trick behind "things touch the ground": the horizon can no longer drift between layers as
 * the camera moves. The recession is staged explicitly instead — each band's ground line sits at a
 * different world y, far highest, foreground lowest.
 *
 *   band     ground line (world y)
 *   far        -125      tree sheets carry their own soil at groundY = 0.74 of the sheet,
 *   mid         -72      so rect.y = groundLine - 0.74*h and the join cannot come apart.
 *   near        -12
 *   fgBand      +10      (paintFgBand lip = 0.30 of the sheet)
 *   fg          +85
 */
const RECT = {
  far:     { x: -2258, y: -960,  w: 4516, h: 1129 },
  mid:     { x: -2558, y: -1018, w: 5116, h: 1279 },
  near:    { x: -3036, y: -1135, w: 6071, h: 1518 },
  fg:      { x: -3466, y: -1197, w: 6933, h: 1733 },
  fgBand:  { x: -1700, y: -220,  w: 3400, h: 850 },
  canopy:  { x: -2200, y: -1680, w: 4400, h: 1100 },
  groundM: { x: -2000, y: -372,  w: 4000, h: 1000 },
  groundN: { x: -1640, y: -225,  w: 3280, h: 820 },
  burnt:   { x: -2100, y: -429,  w: 4200, h: 1050 },
  village: { x: -1700, y: -735,  w: 3400, h: 850 },
  glyph:   { x: -430,  y: -125,  w: 860,  h: 250 },
  ward:    { x: -1300, y: -1400, w: 2600, h: 1500 },
  mist:    { x: -2600, y: -1200, w: 5200, h: 1400 },
};

/* ── palettes ─────────────────────────────────────────────────────────────── */

/* parY: 1 on every band — see the RECT note. `keyMode: 1` hands the rim over to the local point
 * light instead of the shot's directional key; only the two nearest bands in the two scenes that
 * have a big practical light in frame (the ward) get it. */
const forestBack = (mistCol, localNear = false) => ([
  { tex: 'treeFar', rect: 'far', par: 0.30, parY: 1, value: 0.24, amb: 0.30, rim: 0.16, scatter: 0.04, fogAmt: 0.80, rimStep: 1.4,
    mistAfter: mistCol ? { col: mistCol, amt: 0.13, scale: 0.0011, top: 0.30, bot: 1.0, sharp: 0.40 } : null },
  { tex: 'treeMid', rect: 'mid', par: 0.50, parY: 1, value: 0.18, amb: 0.26, rim: 0.34, scatter: 0.04, fogAmt: 0.48, rimStep: 1.6 },
  { tex: 'groundMid', rect: 'groundM', par: 0.74, parY: 1, value: 0.18, amb: 0.34, rim: 0.22, scatter: 0.03, fogAmt: 0.22 },
  { tex: 'treeNear', rect: 'near', par: 0.86, parY: 1, value: 0.12, amb: 0.22, rim: 0.68, scatter: 0.03, fogAmt: 0.12, rimStep: 1.8, keyMode: localNear ? 1 : 0 },
  { tex: 'groundNear', rect: 'groundN', par: 1.0, parY: 1, value: 0.09, amb: 0.20, rim: 0.24, scatter: 0.02, fogAmt: 0.04, keyMode: localNear ? 1 : 0 },
]);

const canopySpec = { tex: 'canopy', rect: 'canopy', par: 1.22, parY: 1, value: 0.03, amb: 0.11, rim: 0.15, scatter: 0.012, fogAmt: 0 };
const fgTreeSpec = { tex: 'treeFg', rect: 'fg', par: 1.34, parY: 1, value: 0.02, amb: 0.07, rim: 0.17, scatter: 0.010, fogAmt: 0 };
// the band every vertical in the picture runs down behind, and the reason the lower fifth is no
// longer flat black
const fgBandSpec = { tex: 'fgBand', rect: 'fgBand', par: 1.16, parY: 1, value: 0.015, amb: 0.06, rim: 0.11, scatter: 0.008, fogAmt: 0, rimStep: 2.0 };

const canopyFront = [canopySpec, fgTreeSpec, fgBandSpec];
const openFront = [fgTreeSpec, fgBandSpec];

const PALETTE = {
  battle: {
    skyTop: [0.030, 0.022, 0.055], skyMid: [0.085, 0.045, 0.085], skyLow: [0.16, 0.07, 0.06],
    sunCol: [1.9, 0.62, 0.20], sunI: 0.0, bandY: 0.34, horizon: 0.0, stars: 0.55, cloud: 0.13, haze: 0.03,
    sunUv: [0.5, 0.17],
    keyDir: [-0.60, -0.80],
    base: [1.0, 0.62, 0.42], fog: [0.036, 0.040, 0.072], ambCol: [0.30, 0.37, 0.66],
    lightCol: [2.4, 1.05, 0.38], lightR: 1900, lightX: 120, lightY: -880,
    wardCol: [0.30, 0.50, 1.15],
    charBase: [1.0, 0.7, 0.5], charRim: 1.00, charKeyMode: 1, charScatter: 0.10, charAmb: 0.50,
    lift: [0.010, 0.016, 0.046], gain: [1.08, 0.99, 0.96], sat: 1.14, contrast: 1.12,
    bloomI: 0.30, rayI: 0.14, bloomThresh: 1.60, rayThresh: 2.1,
    layers: forestBack([0.24, 0.20, 0.30], true), front: openFront,
  },
  seal: {
    skyTop: [0.045, 0.035, 0.075], skyMid: [0.12, 0.07, 0.10], skyLow: [0.22, 0.11, 0.07],
    sunCol: [1.7, 0.85, 0.40], sunI: 0.30, bandY: 0.44, horizon: 0.0, stars: 0.25, cloud: 0.24, haze: 0.08,
    keyDir: [-0.60, -0.80],
    base: [1.0, 0.68, 0.46], fog: [0.070, 0.070, 0.105], ambCol: [0.34, 0.40, 0.70],
    lightCol: [2.2, 1.25, 0.55], lightR: 1400, lightY: -220,
    wardCol: [0.40, 0.62, 1.30],
    charBase: [1.0, 0.75, 0.55], charRim: 1.05, charKeyMode: 1, charScatter: 0.11, charAmb: 0.54,
    lift: [0.016, 0.022, 0.052], gain: [1.07, 1.0, 0.97], sat: 1.06, contrast: 1.08,
    bloomI: 0.38, rayI: 0.20, bloomThresh: 1.45, rayThresh: 1.9,
    layers: forestBack([0.28, 0.26, 0.32], true), front: openFront,
  },
  village: {
    skyTop: [0.045, 0.055, 0.11], skyMid: [0.22, 0.16, 0.24], skyLow: [0.62, 0.32, 0.18],
    sunCol: [1.5, 0.75, 0.35], sunI: 0.42, bandY: 0.52, horizon: 0.0, stars: 0.45, cloud: 0.55, haze: 0.10,
    sunUv: [0.80, 0.60],
    keyDir: [-0.62, -0.78],
    base: [1.0, 0.72, 0.48], fog: [0.105, 0.100, 0.140], ambCol: [0.36, 0.42, 0.72],
    lightCol: [1.9, 1.05, 0.45], lightR: 1500, lightX: -160, lightY: -260,
    wardCol: [0.6, 0.8, 1.8],
    charBase: [1.0, 0.72, 0.5], charRim: 0.86, charScatter: 0.075, charAmb: 0.34,
    lift: [0.024, 0.030, 0.062], gain: [1.05, 1.0, 0.98], sat: 1.10, contrast: 1.05,
    bloomI: 0.32, rayI: 0.14, bloomThresh: 1.50, rayThresh: 2.0, emisI: 1.05,
    layers: [
      { tex: 'treeFar', rect: 'far', par: 0.28, parY: 1, value: 0.24, amb: 0.28, rim: 0.14, scatter: 0.04, fogAmt: 0.82, rimStep: 1.4,
        mistAfter: { col: [0.18, 0.16, 0.22], amt: 0.10, scale: 0.0011, top: 0.35, bot: 1.0, sharp: 0.45 } },
      { tex: 'village', rect: 'village', par: 0.55, parY: 1, value: 0.14, amb: 0.24, rim: 0.42, scatter: 0.05, fogAmt: 0.16,
        emisTex: 'villageE', emisI: 1.0 },
      { tex: 'groundMid', rect: 'groundM', par: 0.75, parY: 1, value: 0.16, amb: 0.30, rim: 0.20, scatter: 0.06, fogAmt: 0.16 },
      { tex: 'treeNear', rect: 'near', par: 0.86, parY: 1, value: 0.11, amb: 0.18, rim: 0.30, scatter: 0.04, fogAmt: 0.09, rimStep: 1.8 },
      { tex: 'groundNear', rect: 'groundN', par: 1.0, parY: 1, value: 0.08, amb: 0.17, rim: 0.22, scatter: 0.03, fogAmt: 0.02 },
    ],
    front: canopyFront,
  },
  wood: {
    skyTop: [0.020, 0.035, 0.065], skyMid: [0.055, 0.085, 0.12], skyLow: [0.10, 0.13, 0.15],
    sunCol: [1.2, 0.55, 0.22], sunI: 0.22, bandY: 0.40, horizon: 0.0, stars: 0.30, cloud: 0.22, haze: 0.10,
    sunUv: [0.30, 0.26],
    keyDir: [-0.66, -0.75],
    base: [0.72, 0.85, 1.0], fog: [0.030, 0.046, 0.072], ambCol: [0.30, 0.44, 0.66],
    lightCol: [1.9, 0.85, 0.32], lightR: 1500, lightX: -900, lightY: -900,
    wardCol: [0.6, 0.8, 1.8],
    charBase: [0.8, 0.88, 1.0], charRim: 0.80, charScatter: 0.070, charAmb: 0.34,
    lift: [0.014, 0.030, 0.060], gain: [1.0, 1.0, 1.03], sat: 1.0, contrast: 1.10,
    bloomI: 0.34, rayI: 0.26, bloomThresh: 1.45, rayThresh: 1.8,
    layers: forestBack([0.18, 0.26, 0.34]), front: canopyFront,
  },
  clearing: {
    skyTop: [0.028, 0.030, 0.062], skyMid: [0.07, 0.06, 0.10], skyLow: [0.16, 0.10, 0.10],
    sunCol: [1.6, 0.70, 0.28], sunI: 0.16, bandY: 0.40, horizon: 0.0, stars: 0.40, cloud: 0.18, haze: 0.10,
    keyDir: [-0.58, -0.81],
    base: [1.0, 0.66, 0.42], fog: [0.036, 0.040, 0.070], ambCol: [0.29, 0.36, 0.64],
    lightCol: [2.0, 0.92, 0.34], lightR: 850, lightX: 150, lightY: -70,
    wardCol: [0.32, 0.52, 1.20],
    charBase: [1.0, 0.70, 0.46], charRim: 1.00, charKeyMode: 1, charScatter: 0.10, charAmb: 0.50,
    lift: [0.014, 0.022, 0.054], gain: [1.06, 1.0, 0.97], sat: 1.08, contrast: 1.09,
    bloomI: 0.34, rayI: 0.18, bloomThresh: 1.50, rayThresh: 1.95,
    layers: [
      { tex: 'treeFar', rect: 'far', par: 0.30, parY: 1, value: 0.24, amb: 0.26, rim: 0.16, scatter: 0.04, fogAmt: 0.82, rimStep: 1.4,
        mistAfter: { col: [0.15, 0.14, 0.22], amt: 0.15, scale: 0.0011, top: 0.30, bot: 1.0, sharp: 0.40 } },
      { tex: 'treeMid', rect: 'mid', par: 0.50, parY: 1, value: 0.16, amb: 0.22, rim: 0.36, scatter: 0.04, fogAmt: 0.50, rimStep: 1.6 },
      { tex: 'burnt', rect: 'burnt', par: 0.84, parY: 1, value: 0.20, amb: 0.40, rim: 0.30, scatter: 0.05, fogAmt: 0.09 },
      { tex: 'treeNear', rect: 'near', par: 0.90, parY: 1, value: 0.10, amb: 0.18, rim: 0.80, scatter: 0.03, fogAmt: 0.08, rimStep: 1.8, keyMode: 1 },
      // without this the near trunks were the last thing drawn before the characters and stood on
      // nothing — this is the layer that buries their bases in the scorched floor
      { tex: 'groundNear', rect: 'groundN', par: 1.0, parY: 1, value: 0.085, amb: 0.18, rim: 0.26, scatter: 0.03, fogAmt: 0.03, keyMode: 1 },
    ],
    front: openFront,
  },
};
PALETTE.meld = PALETTE.clearing;
PALETTE.collapse = PALETTE.clearing;

export { PALETTE, RECT };
