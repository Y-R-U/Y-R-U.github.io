/* SUNDERFALL — the in-world cutscene runner.
 *
 *   import { createStoryRunner } from '../story/runner.js';
 *   const story = createStoryRunner(ctx, world);
 *
 *   await story.play('stones');   // resolves when the scene ends or is skipped
 *   story.playing  story.current  story.skip()
 *   story.update(dt)              // from the play scene, BEFORE world.update
 *   story.render(alpha)           // letterbox, fades, the skip chevron
 *   story.reset()                 // on a level rebuild
 *
 * This is the intro's job done inside the running game: `intro/` owns its own canvas and
 * its own GL context and nothing here may touch it. What is shared is the *data* shape —
 * a scene is beats + cues on a clock, exactly like `story/script.js`, so `ui.say()` eats a
 * beat unchanged.
 *
 * Three things about this file are load-bearing and none of them are obvious.
 *
 * **Control comes back on every path.** finish/skip/error/teardown all land in one
 * `finish()` whose restoring half is a `finally`. An early return that misses
 * `playerControl = true` soft-locks the game with no way out but a refresh, so the shape
 * is what stops it happening, not the care of the next person to edit it.
 *
 * **Held input does not survive the boundary.** `input.pressed` is a rising edge off
 * `raw`, so an action held at the moment control is taken away can never fire again —
 * the stick stays owned, the direction bit stays set, and the keyboard fallback stays
 * suppressed. `input.releaseAll()` exists for exactly that and is called on entry *and*
 * on exit (HANDOFF playtest-fixes-14).
 *
 * **Skipping is state-equivalent.** Skip runs every cue that has not fired yet, in order,
 * immediately, in `fast` mode — walks complete, fades snap, the gate still opens. A player
 * who taps through the fire scene must not end up locked outside act two.
 */

import { createNPCs } from '../sim/npc.js';
import { propBlocked } from '../sim/physics.js';
import { clamp, damp, smootherstep } from '../core/math.js';

/* SCENES is SF-SCRIPT's file and may not exist at all — the game boots and every other
   system works without it, so it is imported lazily and its absence is one warning. */
let SCENES = null;
let scenesJob = null;
function loadScenes() {
  if (SCENES) return Promise.resolve(SCENES);
  if (scenesJob) return scenesJob;
  scenesJob = import('./scenes.js')
    .then((m) => { SCENES = m.SCENES || m.default || {}; return SCENES; })
    .catch((e) => {
      console.warn('[story] scenes.js unavailable — cutscenes will be skipped:', e.message || e);
      SCENES = {};
      return SCENES;
    });
  return scenesJob;
}

const SKIP_ARM = 0.55;      // a tap in the first half second is the tap that started it
const LB_SPEED = 3.2;       // letterbox bars in/out, fraction of screen per second
const WALK_AX = 0.55;       // scripted-walk stick deflection: a walk, not a sprint

export function createStoryRunner(ctx, world, opts = {}) {
  const { R, bus, view, input } = ctx;
  const L = ctx.LAYER || (R && R.LAYER);
  const cam = world.cam;

  if (!opts.scenes) loadScenes();

  // The runner is often the first thing that wants NPCs — story-test.html has no
  // sim/index.js at all. Owning the creation, not the driving, keeps that working.
  if (!world.npcs) world.npcs = createNPCs(world);

  const baseAmbient = R && R.getAmbient ? [...R.getAmbient()] : null;

  let A = null;                 // the scene in flight, or null
  let offTap = null, keyHook = null;
  const played = new Set();
  const warned = new Set();

  function warnOnce(key, msg) {
    if (warned.has(key)) return;
    warned.add(key);
    console.warn(msg);
  }

  /* ---- geometry ------------------------------------------------------- */

  /* Parallax 0 is locked to the camera, and in that space the screen is exactly
     ±halfW/±halfH about the origin — which is how the letterbox stays put through a
     shake (shake is folded into cam, and cam is multiplied by parallax). */
  function halfW() { return (view.worldW || 1920) * 0.5 / (cam.zoom || 1); }
  function halfH() { return (view.worldH || 1080) * 0.5 / (cam.zoom || 1); }

  /* world.halfW/halfH are derived from zoom by sim/index.js's sizeView(), which only
     runs on a view change — so anything that moves the zoom has to keep them honest or
     culling and the rubble query quietly work to the wrong frame. */
  function sizeWorld() {
    world.halfW = halfW();
    world.halfH = halfH();
  }

  /* ---- scene lifecycle ------------------------------------------------ */

  async function play(id) {
    if (A) {
      if (A.id === id) return A.promise;
      skip();
    }
    if (!opts.scenes) await loadScenes();
    const scene = (opts.scenes || SCENES || {})[id];
    if (!scene) {
      console.warn('[story] no scene "' + id + '"');
      return false;
    }

    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    A = {
      id, scene, promise, resolve,
      t: 0, cueIdx: 0, beatIdx: 0, done: false, skipped: false,
      cast: [],
      fired: [],
      lb: 0, lbTarget: scene.letterbox || 0,
      fade: 0, fadeTo: 0, fadeSpeed: 1,
      camFrom: { x: cam.x, y: cam.y }, camTo: null, camT: 0, camDur: 1,
      zoom0: cam.zoom || 1, zoomTo: (scene.cam && scene.cam.zoom) || cam.zoom || 1,
      rookWalk: null, kneel: false,
      seam: 0, seamAt: { x: 0, y: 0 },
    };

    try {
      world.playerControl = false;
      world.camLock = true;
      if (input.releaseAll) input.releaseAll();
      if (ctx.audio && ctx.audio.stopVoice) ctx.audio.stopVoice(0.1);

      spawnCast(scene);
      panTo(scene.cam || { x: cam.x, y: cam.y }, 1 / Math.max(0.05, (scene.cam && scene.cam.ease) || 1));
      armSkip();

      if (ctx.ui && ctx.ui.toast) ctx.ui.toast('Tap to skip', { kind: 'info', value: 'SKIP', life: 2.6 });
      bus.emit('story:scene', { id });
    } catch (e) {
      console.error('[story] scene setup failed', e);
      finish();
      return false;
    }
    return promise;
  }

  /**
   * `enter` is not decoration. `stand` is "already there when the scene fades up";
   * `west`/`east` is "off stage until a cue sends you on", and the arrival is the beat —
   * Ostrick standing in the victory shot from frame one kills the whole ending before
   * anybody speaks. Off-stage means genuinely off: parked a screen and a half out at the
   * scene's own zoom, facing the stage, and not drawn until an arrive cue lets him in.
   */
  function spawnCast(scene) {
    const list = scene.cast || [];
    const sc = scene.cam || {};
    const hw = (view.worldW || 1920) * 0.5 / (sc.zoom || 1);
    for (const c of list) {
      const enter = c.enter || 'stand';
      const wings = enter === 'west' ? -1 : enter === 'east' ? 1 : 0;
      let x = c.x;
      let face = c.face;
      if (wings) {
        const edge = (sc.x == null ? cam.x : sc.x) + wings * (hw + 420);
        x = wings < 0 ? Math.min(c.x, edge) : Math.max(c.x, edge);
        face = -wings;                      // looking at the stage he is about to walk on to
      }
      const n = world.npcs.spawn(c.who, x, c.y == null ? null : c.y, { face, pose: c.pose });
      n.enter = enter;
      n.hidden = !!wings;
      n.homeX = c.x;
      A.cast.push(n);
    }
  }

  /** Every exit from a scene is this function. The restoring half cannot be skipped. */
  function finish(skipped) {
    if (!A) return;
    const a = A;
    A = null;                       // first, so a cue that re-enters cannot recurse
    try {
      disarmSkip();
      for (const n of a.cast) { if (n.alive) n.despawn(); }
      if (ctx.audio && ctx.audio.stopVoice) ctx.audio.stopVoice(0.15);
    } catch (e) {
      console.error('[story] scene teardown failed', e);
    } finally {
      world.playerControl = true;
      world.camLock = false;
      cam.zoom = a.zoom0;
      sizeWorld();
      if (input.releaseAll) input.releaseAll();
      if (input.axisX !== undefined) input.axisX = 0;
      played.add(a.id);
      a.done = true;
      lastFired = a.fired;
      bus.emit('story:done', { id: a.id, skipped: !!skipped });
      a.resolve(true);
    }
  }

  let lastFired = [];

  function skip() {
    if (!A) return;
    A.skipped = true;
    // Everything the rest of the scene would have done to the world, done now, in order.
    const cues = A.scene.cues || [];
    while (A && A.cueIdx < cues.length) {
      const c = cues[A.cueIdx++];
      runCue(c, true);
    }
    if (ctx.ui && ctx.ui.bubbles) ctx.ui.bubbles.clear();
    for (const n of (A ? A.cast : [])) if (n.alive) n.settle();
    finish(true);
  }

  /* ---- skip input ----------------------------------------------------- */

  function armSkip() {
    disarmSkip();
    if (input.onTap) offTap = input.onTap(() => requestSkip());
    keyHook = () => requestSkip();
    window.addEventListener('keydown', keyHook, { passive: true });
  }
  function disarmSkip() {
    if (offTap) { offTap(); offTap = null; }
    if (keyHook) { window.removeEventListener('keydown', keyHook); keyHook = null; }
  }
  function requestSkip() {
    if (!A || A.t < SKIP_ARM) return;
    if (ctx.ui && ctx.ui.blocked) return;
    skip();
  }

  /* ---- camera --------------------------------------------------------- */

  /**
   * Keep the ground in frame.
   *
   * A scene's `cam.y` is an absolute world coordinate written against a level that did
   * not exist yet, and the road climbs: at the stones the terrain sits near y = -2000
   * while `scenes.js` asks for -180. Left alone that frames eighteen hundred pixels of
   * sky with the entire cast standing off the top of it — the scene "plays", correctly,
   * invisibly. So the authored value is honoured wherever it can be and clamped to a
   * window around the actual ground where it cannot, which also means a corrected
   * `cam.y` is never shifted twice. It warns once, because the data is still wrong.
   */

  /**
   * The level's authored ground profile, not a raycast.
   *
   * This used to probe down with `world.groundY` from 1200px above the player, and an
   * overhang answers that probe: the rock face west of the stones has a brow hanging
   * from about y=-1200 to -2100 across x 7380–7900, so entering the scene mid-jump
   * returned -1376 as "the ground" and clamped a perfectly correct cam.y a thousand
   * pixels into the sky. `act.js` starts the stones scene on `player.x > 7440`, which
   * is one hop away from that — an intermittently sky-framed cutscene. `groundAt` is
   * the profile the level was built from, so it cannot see a ceiling at all.
   */
  function groundUnder(x) {
    if (world.groundAt) return world.groundAt(x);
    // pre-buildLevel (story-test fixtures): probe from far above and accept the raycast
    return world.groundY(x, -2400, 7000);
  }
  function frameY(x, y) {
    const g = groundUnder(x);
    if (!Number.isFinite(g)) return y;
    const hh = halfH();
    const lo = g - hh * 0.92, hi = g + hh * 0.35;
    if (y >= lo && y <= hi) return y;
    warnOnce('camy:' + Math.round(x),
      '[story] scene "' + (A ? A.id : '?') + '" camera y=' + Math.round(y) + ' at x=' + Math.round(x) +
      ' leaves the ground (' + Math.round(g) + ') off screen — clamped. Fix cam.y in story/scenes.js.');
    return clamp(y, lo, hi);
  }

  function panTo(to, dur) {
    if (!A) return;
    A.camFrom.x = cam.x; A.camFrom.y = cam.y;
    const tx = to.x == null ? cam.x : to.x;
    A.camTo = { x: tx, y: frameY(tx, to.y == null ? cam.y : to.y) };
    A.camT = 0;
    A.camDur = Math.max(0.001, dur || 1);
  }

  function driveCamera(dt, fast) {
    if (!A || !A.camTo) return;
    A.camT = Math.min(A.camDur, A.camT + (fast ? A.camDur : dt));
    const k = smootherstep(0, 1, A.camT / A.camDur);
    cam.x = A.camFrom.x + (A.camTo.x - A.camFrom.x) * k;
    cam.y = A.camFrom.y + (A.camTo.y - A.camFrom.y) * k;
    // zoom rides the first pan only, and is damped rather than keyed: a keyed zoom
    // against a keyed pan reads as a lens change, which is not what this camera is
    cam.zoom = damp(cam.zoom || 1, A.zoomTo, 0.02, fast ? 1 : dt);
    sizeWorld();
  }

  /* ---- beats ---------------------------------------------------------- */

  function anchorFor(beat) {
    const who = beat.anchor || beat.who;
    if (who === 'rook' || who === 'player') {
      return () => {
        const p = world.player;
        return p ? { x: p.x, y: p.y - p.h * 0.42 } : { x: cam.x, y: cam.y };
      };
    }
    if (who === 'world') return null;
    const n = world.npcs.get(who);
    if (n) return () => n.anchor;
    // A cast member that has already left, or a scene that names somebody who was never
    // spawned. Point at the camera rather than at (0,0), which is a screen away.
    return () => ({ x: cam.x, y: cam.y - 120 });
  }

  function sayBeat(b) {
    const ui = ctx.ui;
    const anchor = anchorFor(b);
    const o = {
      who: b.who, text: b.text, dur: b.dur, size: b.size,
      ax: anchor ? (b.ax || 0) : 0,
      ay: anchor ? (b.ay == null ? -140 : b.ay) : -120,
    };
    if (anchor) o.anchor = anchor;
    else { o.x = b.ax || 0; o.y = b.ay || 0; }     // anchor:'world' — ax/ay are world coords
    if (ui && ui.say) ui.say(o);
    else bus.emit('story:beat', o);

    if (b.vo && ctx.audio && ctx.audio.voice) {
      ctx.audio.voice(b.vo[0], b.vo[1], { take: b.take || 'barks' });
    }
    bus.emit('story:beat-fired', { id: A ? A.id : '', who: b.who, text: b.text });
  }

  /* ---- cues ----------------------------------------------------------- */

  /**
   * Every stage direction a scene can give (contract §3.3). `fast` is skip mode: the
   * world must end up where a full play would have left it, so movement completes,
   * fades snap and the camera arrives — nothing waits for a clock that is no longer
   * running. An unknown cue is a warning and a no-op: a typo in a script must never
   * throw inside a cutscene.
   */
  function runCue(c, fast) {
    // Logged before it runs, not after: a cue that threw was still *attempted*, and
    // the skip-equivalence test compares these two ledgers.
    if (A) A.fired.push(c.fx);
    try {
      cueBody(c, !!fast);
    } catch (e) {
      console.error('[story] cue "' + c.fx + '" threw', e);
    }
  }

  function cueBody(c, fast) {
    const p = world.player;
    switch (c.fx) {
      case 'cam.hold': {
        const s = A.scene.cam || {};
        panTo(s, 1 / Math.max(0.05, s.ease || 1));
        if (fast) driveCamera(0, true);
        break;
      }
      case 'cam.to':
        panTo({ x: c.x, y: c.y }, c.dur || 1.2);
        if (fast) driveCamera(0, true);
        break;
      case 'cam.shake':
        if (!fast && R.fx) R.fx.shake(c.a == null ? 6 : c.a, c.d == null ? 0.6 : c.d);
        break;

      case 'ostrick.leave': {
        const n = world.npcs.get('ostrick');
        if (!n) { warnOnce('noostrick', '[story] ostrick.leave with no Ostrick on stage'); break; }
        n.leave(c.dir || -1, c.speed);
        if (fast) n.settle();
        break;
      }
      case 'ostrick.arrive': {
        let n = world.npcs.get('ostrick');
        const toX = c.x != null ? c.x : (p ? p.x - 150 : cam.x - 150);
        if (!n) n = world.npcs.spawn('ostrick', toX - 700, null, { face: 1 });
        n.hidden = false;                    // this is the moment `enter: 'west'` waited for
        // Start him just outside the frame whatever the orientation and wherever the
        // scene parked him: portrait sees 820 world px and landscape 1920, so a fixed
        // entry point is either a long boring walk or a pop-in, depending on the phone.
        enterFromWings(n, toX);
        n.walkTo(toX, c.speed || 190);
        if (fast) n.settle();
        if (A && A.cast.indexOf(n) < 0) A.cast.push(n);
        break;
      }
      case 'elders.arrive': {
        // The elders are the cue's, not the cast's — deliberately, so they cannot be on
        // screen before Ostrick is. They arrive behind him and then are scenery.
        const baseX = c.x != null ? c.x : (p ? p.x - 300 : cam.x - 300);
        for (let i = 0; i < 3; i++) {
          const n = world.npcs.spawn('elder', baseX - 1000, null, { face: 1 });
          enterFromWings(n, baseX - i * 92, 150 + i * 90);
          n.walkTo(baseX - i * 92, 168 + i * 6);
          if (fast) n.settle();
          if (A) A.cast.push(n);
        }
        break;
      }

      case 'rook.walk':
        if (!p) break;
        A.kneel = false;
        A.rookWalk = { x: c.x == null ? p.x : c.x };
        if (fast) {
          // Skip mode has no clock to walk on, so he is moved there outright — but
          // marched, not teleported: a walk that a crate or a wall would have stopped
          // has to stop a skip in the same place, or skipping becomes a way through
          // scenery and the two paths stop agreeing about where Rook is standing.
          marchTo(p, A.rookWalk.x);
          A.rookWalk = null;
          world.playerControl = false;
        }
        break;
      case 'rook.kneel':
        A.rookWalk = null;
        A.kneel = true;
        if (p) { p.vx = 0; p.faceX = c.face || p.faceX; }
        break;

      case 'fire.snuff':
        snuffBrazier(fast);
        break;

      case 'gate.crack': {
        const g = markOf('gate');
        const gx = c.x != null ? c.x : (g ? g.x : cam.x + 200);
        const gy = c.y != null ? c.y : (g ? g.y - 200 : cam.y);
        if (!fast) {
          world.P.emit({
            x: gx, y: gy, count: 46, vx: -1, vy: -0.2, vSpread: 1.5, speed: 130, speedVar: 190,
            life: 1.9, lifeVar: 1.1, size: 26, sizeEnd: 96, color: [0.36, 0.33, 0.31, 0.5],
            color2: [0.10, 0.09, 0.11, 0], gravity: -22, drag: 1.9, fadeIn: 0.2,
          });
          if (R.fx) R.fx.shake(c.a == null ? 5 : c.a, 0.7);
          world.sfx('rock_crack', gx, gy);
        }
        break;
      }
      case 'gate.open':
        if (typeof world.openGate === 'function') world.openGate();
        else warnOnce('nogate', '[story] gate.open: world.openGate() is not wired yet (sim/level.js)');
        bus.emit('act:gate-open', {});
        break;

      case 'seam.speak':
        A.seam = 1;
        A.seamAt.x = c.x != null ? c.x : cam.x + 60;
        A.seamAt.y = c.y != null ? c.y : cam.y - 90;
        if (!fast && R.fx) R.fx.chroma(0.22, 0.5);
        break;
      case 'seam.reveal':
        A.seamReveal = true;
        A.seamAt.x = c.x != null ? c.x : cam.x + 120;
        A.seamAt.y = c.y != null ? c.y : cam.y - 140;
        if (fast) applyViolet(1);
        break;

      case 'boss.start':
        bus.emit('act:boss', { from: A.id });
        break;

      case 'staff.take': {
        const n = world.npcs.get('staff');
        if (!n) break;
        n.taken = true;
        if (!fast) {
          world.P.emit({
            x: n.x, y: n.y - 140, count: 26, vx: 0, vy: -1, vSpread: 0.7, speed: 90, speedVar: 90,
            life: 1.5, lifeVar: 0.8, size: 9, sizeEnd: 1, color: [1, 0.66, 0.3, 0.9],
            color2: [0.4, 0.12, 0.05, 0], gravity: -60, drag: 1.6, add: true, glow: 0.3,
          });
          world.sfx('ui.pickup', n.x, n.y);
        }
        n.despawn();
        break;
      }

      case 'fade.out':
        A.fadeTo = 1; A.fadeSpeed = 1 / Math.max(0.05, c.dur || 1.2);
        if (fast) A.fade = 1;
        break;
      case 'fade.in':
        A.fadeTo = 0; A.fadeSpeed = 1 / Math.max(0.05, c.dur || 1.2);
        if (fast) A.fade = 0;
        break;

      case 'audio.cue':
        if (ctx.audio && ctx.audio.music) ctx.audio.music(c.key || 'explore');
        break;

      default:
        warnOnce('cue:' + c.fx, '[story] unknown cue "' + c.fx + '" — ignored');
    }
  }

  /** Move the player toward x, stopping at the first thing a walk would have hit. */
  function marchTo(p, targetX) {
    const step = 10;
    const dir = Math.sign(targetX - p.x) || 1;
    const w = p.w * 0.6, h = p.h * 0.86;
    let x = p.x;
    for (let i = 0; i < 400 && Math.abs(targetX - x) > step; i++) {
      const nx = x + dir * step;
      if (world.terrain.solidBox(nx, p.y, w, h)) break;
      if (propBlocked(world, nx, p.y, w, h)) break;
      x = nx;
    }
    p.x = x; p.px = x; p.vx = 0;
  }

  /**
   * Park an arriving NPC just past the frame edge on the side it is coming from.
   * Clamped to the level: portrait sees 820 world px and landscape 1920, so a fixed
   * entry point is either a pop-in or a walk long enough to miss its own cue — and an
   * entry point outside `world.bounds` is a walk in from a place with no ground in it.
   */
  function enterFromWings(n, toX, extra) {
    const dir = n.x <= toX ? -1 : 1;
    const b = world.bounds;
    let edge = toX + dir * (halfW() * 0.92 + 90 + (extra || 0));
    edge = clamp(edge, b.x0 + 60, b.x1 - 60);
    if (Math.abs(n.x - toX) > Math.abs(edge - toX)) n.placeAt(edge);
  }

  function markOf(name) {
    const m = world.marks || (ctx.scene && ctx.scene.marks) || null;
    return m ? m[name] : null;
  }

  /**
   * Put the brazier out. The light is read off `prop.def.light` and the def is shared by
   * every prop of that type, so it is replaced with a per-instance copy — snuffing this
   * brazier must not blow out the one back at the village.
   */
  function snuffBrazier(fast) {
    const st = markOf('stones');
    let b = st && st.brazier;
    if (!b || !b.alive) {
      // The harness and any level that has not landed yet: take the nearest lit one.
      let best = null, bd = 1e9;
      for (const p of world.props.props) {
        if (!p.alive || !p.def || !p.def.light) continue;
        const d = Math.abs(p.x - cam.x);
        if (d < bd) { bd = d; best = p; }
      }
      b = best;
    }
    if (!b) { warnOnce('nobrazier', '[story] fire.snuff: no brazier — world.marks.stones.brazier'); return; }

    b.def = Object.assign({}, b.def, { light: null });
    b.burn = 0;
    b.tint = [0.55, 0.52, 0.50];
    if (!fast) {
      world.P.emit({
        x: b.x, y: b.bottom - b.h * 0.6, count: 34, vx: 0, vy: -1, vSpread: 0.9, speed: 60, speedVar: 70,
        life: 2.4, lifeVar: 1.2, size: 20, sizeEnd: 86, color: [0.28, 0.27, 0.29, 0.55],
        color2: [0.06, 0.06, 0.08, 0], gravity: -34, drag: 1.7, fadeIn: 0.25,
      });
      // one last gulp of embers going the wrong way — inward, because something is
      // drinking it. That is the read the scene is written for.
      world.P.emit({
        x: b.x, y: b.bottom - b.h * 0.55, count: 16, vx: 0, vy: -1, vSpread: 1.4, speed: 40, speedVar: 40,
        life: 0.6, lifeVar: 0.3, size: 7, sizeEnd: 0.5, color: [1, 0.6, 0.24, 0.9],
        color2: [0.3, 0.06, 0.02, 0], gravity: 40, drag: 3.2, add: true, glow: 0.2,
      });
      world.sfx('whoosh.small', b.x, b.y);
    }
    bus.emit('story:fire-out', { x: b.x, y: b.y });
  }

  /** The arena going violet under the reveal. Deliberately not restored on finish. */
  function applyViolet(k) {
    if (!R.setAmbient || !baseAmbient) return;
    const v = [0.19, 0.13, 0.30];
    R.setAmbient(
      baseAmbient[0] + (v[0] - baseAmbient[0]) * k,
      baseAmbient[1] + (v[1] - baseAmbient[1]) * k,
      baseAmbient[2] + (v[2] - baseAmbient[2]) * k);
  }

  /* ---- tick ----------------------------------------------------------- */

  function update(dt) {
    // A cutscene talking under the pause menu is a bug nobody sees until somebody else
    // finds it. main.js already stops the sim here; the runner stops with it.
    if (!A || (ctx.ui && ctx.ui.blocked)) return;

    A.t += dt;
    const s = A.scene;

    const cues = s.cues || [];
    while (A && A.cueIdx < cues.length && cues[A.cueIdx].t <= A.t) runCue(cues[A.cueIdx++], false);
    if (!A) return;

    const beats = s.beats || [];
    for (let i = A.beatIdx; i < beats.length; i++) {
      if (beats[i].t > A.t) break;
      sayBeat(beats[i]);
      A.beatIdx = i + 1;
    }

    driveCamera(dt, false);
    driveRook(dt);

    A.lb += clamp(A.lbTarget - A.lb, -LB_SPEED * dt, LB_SPEED * dt);
    A.fade += clamp(A.fadeTo - A.fade, -A.fadeSpeed * dt, A.fadeSpeed * dt);
    if (A.seam > 0) A.seam = Math.max(0, A.seam - dt * 0.42);   // one Seam line is 2.4s
    if (A.seamReveal && A.violet !== 1) {
      A.violet = Math.min(1, (A.violet || 0) + dt * 0.5);
      applyViolet(A.violet);
    }

    // NPCs must be driven by somebody. sim/index.js is that somebody; this is the
    // fallback that keeps story-test.html and a mis-wired integration honest.
    world.npcs.update(dt, 'story');
    if (A.t > 2 && !world.npcs.driven) {
      warnOnce('npcs', '[story] nothing but the runner is driving world.npcs — sim/index.js ' +
        'should call world.npcs.update(dt) and world.npcs.render(alpha). See docs/handoff/SF-STORY.md');
    }

    if (A.t >= (s.duration || 0)) finish(false);
  }

  /** Rook under the runner's control: a scripted walk, and a held kneel. */
  function driveRook(dt) {
    const p = world.player;
    if (!p) return;
    if (A.rookWalk) {
      const dx = A.rookWalk.x - p.x;
      if (Math.abs(dx) < 20) {
        A.rookWalk = null;
        world.playerControl = false;
        input.axisX = 0;
        p.vx *= 0.2;
        return;
      }
      /* Drive the real controller rather than teleporting: the walk gets the acceleration,
         the footsteps, the facing and the leg IK for free. The player's own input is
         swallowed for these frames — a skip tap must not also cast a spell. */
      world.playerControl = true;
      input.axisX = Math.sign(dx) * WALK_AX;
      if (input.consume) { input.consume('jump'); input.consume('dash'); input.consume('cast'); }
    } else if (A.kneel) {
      p.vx = 0;
      p.data.squash = 0.8;      // no kneel pose in player.js; the squash reads as one
    }
  }

  /* ---- draw ----------------------------------------------------------- */

  function render(alpha) {
    if (!A) return;
    world.npcs.render(alpha, 'story');
    const hw = halfW(), hh = halfH();
    const UI = L.UI_WORLD;

    if (A.lb > 0.001) {
      const bar = hh * 2 * A.lb;
      R.spriteRaw(R.white, 0, 0, 1, 1, 0, -hh + bar * 0.5, hw * 2.2, bar, 0, 0, 0, 0, 1, UI, false, 0);
      R.spriteRaw(R.white, 0, 0, 1, 1, 0, hh - bar * 0.5, hw * 2.2, bar, 0, 0, 0, 0, 1, UI, false, 0);
    }

    if (A.seam > 0.01) {
      const k = A.seam;
      R.spriteRaw(R.blob, 0, 0, 1, 1, A.seamAt.x, A.seamAt.y, 130 + 260 * (1 - k), 420 + 200 * (1 - k), 0,
        0.62, 0.30, 0.95, 0.30 * k, L.FX, true, 1);
      R.light({ x: A.seamAt.x, y: A.seamAt.y, radius: 620 * (0.6 + k * 0.6), r: 0.55, g: 0.24, b: 0.95, intensity: 1.5 * k, flicker: 0.2 });
    }
    if (A.seamReveal) {
      const t = world.time;
      const k = A.violet || 0;
      // the tear itself, on the horizon: a thin violet vertical that breathes
      const w = 26 + Math.sin(t * 1.7) * 6;
      R.spriteRaw(R.blob, 0, 0, 1, 1, A.seamAt.x, A.seamAt.y - 120, w, 520, 0, 0.66, 0.32, 1, 0.5 * k, L.FX, true, 1);
      R.spriteRaw(R.blob, 0, 0, 1, 1, A.seamAt.x, A.seamAt.y - 120, w * 5, 620, 0, 0.36, 0.16, 0.7, 0.20 * k, L.FX, true, 1);
    }

    if (A.fade > 0.001) {
      R.spriteRaw(R.white, 0, 0, 1, 1, 0, 0, hw * 2.2, hh * 2.2, 0, 0, 0, 0, A.fade, UI, false, 0);
    }

    // "tap to skip", drawn rather than written: two chevrons in the bottom bar, breathing.
    if (A.t > SKIP_ARM) {
      const a = 0.34 + Math.sin(world.time * 3.4) * 0.12;
      const bx = hw - 74, by = hh - Math.max(26, hh * A.lb * 0.5);
      for (let i = 0; i < 2; i++) {
        const ox = i * 15;
        R.spriteRaw(R.white, 0, 0, 1, 1, bx + ox - 4, by - 4, 14, 3.4, 0.72, 0.82, 0.80, 0.76, a, UI, false, 0);
        R.spriteRaw(R.white, 0, 0, 1, 1, bx + ox - 4, by + 4, 14, 3.4, -0.72, 0.82, 0.80, 0.76, a, UI, false, 0);
      }
    }
  }

  /* ---- public --------------------------------------------------------- */

  const api = {
    play,
    skip,
    update,
    render,

    get playing() { return !!A; },
    get current() { return A ? A.id : null; },
    get time() { return A ? A.t : 0; },
    get played() { return played; },
    /** Which cues the last scene actually ran, in order — the skip-equivalence probe. */
    get fired() { return A ? A.fired.slice() : lastFired.slice(); },
    has(id) { return !!((opts.scenes || SCENES || {})[id]); },
    scenes() { return Object.keys(opts.scenes || SCENES || {}); },
    ready() { return loadScenes(); },

    /** Wipe on a level rebuild. Restores control on the way out, like every other path. */
    reset() {
      if (A) finish(false);
      world.npcs.clear();
      played.clear();
      if (baseAmbient && R.setAmbient) R.setAmbient(baseAmbient[0], baseAmbient[1], baseAmbient[2]);
      world.camLock = false;
      world.playerControl = true;
    },

    /* Test hook: run the scene forward to `t` in fixed steps without waiting for a
       clock. Deterministic — everything in update() is a function of dt. */
    scrub(t, step = 1 / 60) {
      let guard = 0;
      while (A && A.t < t && guard++ < 20000) {
        const dt = Math.min(step, t - A.t);
        update(dt);
        /* The world has to be stepped too, in the order sim/index.js uses. `rook.walk`
           drives the real controller, so without a world tick the scripted walk does
           nothing at all — and a skip, which teleports him, would then look like the
           only path that moves him. */
        try { world.update(dt); } catch (e) { console.warn('[story] scrub world.update', e); }
        world.npcs.update(dt, 'force');
        // Bubbles are aged inside ui.render() off the wall clock, not by ui.update(dt) —
        // so a scrub that does not age them itself ends with every line of the scene
        // stacked on screen at once. They are part of the state at `t`.
        if (ctx.ui && ctx.ui.bubbles) ctx.ui.bubbles.update(dt);
      }
      return A ? A.t : t;
    },
  };

  return api;
}

export default createStoryRunner;
