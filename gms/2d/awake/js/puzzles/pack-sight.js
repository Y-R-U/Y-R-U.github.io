/* pack-sight — three mini-games built on the room stills the game already
   generates. They register through window.HubPuzzles.register() and share
   nothing with puzzles.js beyond that hook, so this file can be dropped or
   loaded on its own.

   blink_change  compare  — the room changes while the light is out
   light_seam    time     — stop a travelling seam of light on the mark
   dark_sweep    explore  — sweep a failing light across a dark room

   All three draw their own targets over the still, so a plain off-white
   Horrors wall is as playable as a cluttered Awake lab, and a still that
   404s only costs atmosphere. */
(function () {
  "use strict";

  function hashText(text) {
    let hash = 2166136261;
    String(text || "").split("").forEach(ch => {
      hash ^= ch.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    });
    return hash >>> 0;
  }

  function rngFromSeed(seed) {
    let t = hashText(seed) || 1;
    return function next() {
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(list, rng) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
  const pick = (list, rng) => list[Math.floor(rng() * list.length)];
  const rangeInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const series = n => Array.from({ length: n }, (_, i) => i);
  const r2 = value => Math.round(value * 100) / 100;

  const ARTICLED = /^(the|a|an|this|that|these|those|your|its|their|his|her)\s/i;
  const theLocation = location => {
    const text = String(location || "this place").trim();
    return ARTICLED.test(text) ? text : `the ${text}`;
  };
  const theThreat = threat => {
    const name = String((threat && threat.name) || "the presence").trim();
    return ARTICLED.test(name) ? name : `the ${name}`;
  };
  const sentenceCase = text => String(text || "").charAt(0).toUpperCase() + String(text || "").slice(1);

  function normaliseImage(value) {
    if (!value) return null;
    if (typeof value === "string") return { src: value, label: "" };
    if (!value.src) return null;
    return { src: String(value.src), label: value.label ? String(value.label) : "" };
  }

  function otherImage(ctx, chosen) {
    const list = Array.isArray(ctx && ctx.imageChoices) ? ctx.imageChoices : [];
    const src = chosen && chosen.src;
    for (let i = 0; i < list.length; i += 1) {
      const image = normaliseImage(list[i]);
      if (image && image.src !== src) return image;
    }
    return null;
  }

  /* Difficulty lives here rather than in the host TUNING table because a pack
     cannot edit it. ctx.difficultyId is the real signal; the clock length is a
     fallback for samples and old saves. */
  const PACK_TUNING = {
    easy: {
      blink: { grid: 3, marks: 3, rounds: 2, study: 1500, blind: 620, kinds: ["new", "move"], strikes: 3 },
      seam: { rounds: 2, band: 0.09, period: 4200, speedup: 0.94, slit: 0.062, strikes: 4, seconds: 15 },
      sweep: { marks: 2, radius: 0.3, tolerance: 0.105, drain: 5.5 },
    },
    medium: {
      blink: { grid: 4, marks: 4, rounds: 3, study: 1250, blind: 480, kinds: ["new", "move", "gone"], strikes: 3 },
      seam: { rounds: 3, band: 0.07, period: 3400, speedup: 0.9, slit: 0.055, strikes: 3, seconds: 15 },
      sweep: { marks: 3, radius: 0.24, tolerance: 0.09, drain: 6.8 },
    },
    hard: {
      blink: { grid: 5, marks: 5, rounds: 4, study: 1000, blind: 360, kinds: ["move", "gone", "new"], strikes: 2 },
      seam: { rounds: 4, band: 0.055, period: 2800, speedup: 0.9, slit: 0.05, strikes: 3, seconds: 15 },
      sweep: { marks: 4, radius: 0.19, tolerance: 0.075, drain: 8 },
    },
  };

  function packTune(tune, ctx) {
    const id = ctx && PACK_TUNING[ctx.difficultyId] ? ctx.difficultyId : null;
    if (id) return PACK_TUNING[id];
    const seconds = Number(tune && tune.seconds) || 45;
    if (seconds >= 55) return PACK_TUNING.easy;
    if (seconds <= 40) return PACK_TUNING.hard;
    return PACK_TUNING.medium;
  }

  const seconds = tune => Math.max(20, Number(tune && tune.seconds) || 45);

  /* ---------------------------------------------------------------- *
   * Generators — plain JSON only, images stored as {src,label}.
   * ---------------------------------------------------------------- */

  function genBlinkChange(seed, image, tune, ctx) {
    const t = packTune(tune, ctx).blink;
    const rng = rngFromSeed(`${seed}:blink`);
    const cells = t.grid * t.grid;
    const bag = shuffle(series(cells), rng);
    const live = bag.slice(0, t.marks).map(cell => ({ cell, glyph: rangeInt(rng, 0, 2) }));
    const marks = live.map(m => ({ cell: m.cell, glyph: m.glyph }));
    const rounds = [];

    for (let i = 0; i < t.rounds; i += 1) {
      const used = new Set(live.map(m => m.cell));
      const free = series(cells).filter(c => !used.has(c));
      let kind = pick(t.kinds, rng);
      if (kind === "new" && !free.length) kind = "move";
      if (kind === "gone" && live.length <= 2) kind = "move";
      if (kind === "move" && !free.length) kind = "gone";
      if (kind === "new") {
        const to = pick(free, rng);
        const glyph = rangeInt(rng, 0, 2);
        rounds.push({ kind, to, glyph, answer: to });
        live.push({ cell: to, glyph });
      } else if (kind === "gone") {
        const index = Math.floor(rng() * live.length);
        const from = live[index].cell;
        rounds.push({ kind, from, answer: from });
        live.splice(index, 1);
      } else {
        const index = Math.floor(rng() * live.length);
        const from = live[index].cell;
        const to = pick(free, rng);
        rounds.push({ kind: "move", from, to, answer: to });
        live[index] = { cell: to, glyph: live[index].glyph };
      }
    }

    const threat = (ctx && ctx.threat) || {};
    return {
      type: "blink_change",
      title: "While The Light Was Out",
      kicker: threat.label || "it moved",
      prompt: `${sentenceCase(theThreat(threat))} shifts one mark in ${theLocation(ctx && ctx.location)} every time the dark comes. When the room returns, tap where the change is now.`,
      whisper: threat.clue || "",
      image,
      grid: t.grid,
      marks,
      rounds,
      study: t.study,
      blind: t.blind,
      strikes: t.strikes,
      seconds: seconds(tune),
      seed: `${seed}:blink`,
    };
  }

  function genLightSeam(seed, image, tune, ctx) {
    const t = packTune(tune, ctx).seam;
    const rng = rngFromSeed(`${seed}:seam`);
    const seams = [];
    for (let guard = 0; guard < 400 && seams.length < t.rounds; guard += 1) {
      const y = 0.16 + rng() * 0.68;
      if (seams.every(s => Math.abs(s - y) > t.band * 2.4)) seams.push(r2(y));
    }
    if (!seams.length) seams.push(0.5);
    const alt = otherImage(ctx, image);
    return {
      type: "light_seam",
      title: "Let The Light In",
      kicker: ctx && ctx.location ? String(ctx.location) : "hold it open",
      prompt: `A seam of light crawls across ${theLocation(ctx && ctx.location)}. Tap the picture to stop it on a mark; every hit holds that strip open. Open them all and you can see the room again.`,
      image,
      alt: alt || null,
      wrongStrip: alt ? rangeInt(rng, 0, Math.max(0, seams.length - 2)) : -1,
      seams,
      band: t.band,
      slit: t.slit,
      period: t.period,
      speedup: t.speedup,
      strikes: t.strikes,
      seconds: t.seconds || seconds(tune),
      seed: `${seed}:seam`,
    };
  }

  function genDarkSweep(seed, image, tune, ctx) {
    const t = packTune(tune, ctx).sweep;
    const rng = rngFromSeed(`${seed}:sweep`);
    const marks = [];
    for (let guard = 0; guard < 300 && marks.length < t.marks; guard += 1) {
      const x = 0.14 + rng() * 0.72;
      const y = 0.12 + rng() * 0.76;
      const clear = marks.every(m => Math.hypot(m.x - x, (m.y - y) * 1.3) > 0.26);
      if (clear) marks.push({ x: r2(x), y: r2(y), glyph: rangeInt(rng, 0, 2) });
    }
    if (!marks.length) marks.push({ x: 0.5, y: 0.5, glyph: 0 });
    const threat = (ctx && ctx.threat) || {};
    return {
      type: "dark_sweep",
      title: "What It Left Behind",
      kicker: threat.label || "press for light",
      prompt: `${sentenceCase(theThreat(threat))} came through ${theLocation(ctx && ctx.location)} and touched things. Press and drag to keep the light on — the marks only show when it is near, and the light is nearly spent.`,
      whisper: threat.clue || "",
      image,
      marks,
      radius: t.radius,
      tolerance: t.tolerance,
      drain: t.drain,
      battery: 100,
      strikes: 0,
      seconds: seconds(tune),
      seed: `${seed}:sweep`,
    };
  }

  /* ---------------------------------------------------------------- *
   * Shared render scaffolding
   * ---------------------------------------------------------------- */

  const srcOf = puzzle => {
    const image = normaliseImage(puzzle && puzzle.image);
    return (image && image.src) || "";
  };

  // The still is a layer that fades in if it arrives. Nothing waits on it, so
  // a 404 leaves a dark drawn room and a fully playable board. A null layer
  // just probes the file (light_seam paints its own strips).
  function loadStill(src, layer, api, onFail, onOk) {
    if (!src) { if (onFail) onFail(); return; }
    const img = new Image();
    let settled = false;
    img.onload = () => {
      if (settled) return;
      settled = true;
      if (layer) {
        layer.style.backgroundImage = `url("${src}")`;
        layer.classList.add("on");
      }
      if (onOk) onOk();
    };
    img.onerror = () => {
      if (settled) return;
      settled = true;
      api.note("The picture will not come. Go by feel.", "");
      if (onFail) onFail();
    };
    api.teardown(() => { img.onload = null; img.onerror = null; settled = true; });
    img.src = src;
  }

  function timers(api) {
    const ids = [];
    api.teardown(() => ids.forEach(clearTimeout));
    return (ms, fn) => { ids.push(setTimeout(fn, ms)); };
  }

  function pointerAt(event, el) {
    const rect = el.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / Math.max(1, rect.width),
      y: (event.clientY - rect.top) / Math.max(1, rect.height),
      aspect: rect.height / Math.max(1, rect.width),
    };
  }

  const RENDER = {};

  /* --- blink_change ------------------------------------------------ */

  RENDER.blink_change = function (puzzle, api) {
    const grid = clamp(Number(puzzle.grid) || 4, 2, 6);
    const cells = grid * grid;
    const valid = c => Number.isFinite(c) && c >= 0 && c < cells;
    const live = new Map();
    (Array.isArray(puzzle.marks) ? puzzle.marks : []).forEach(m => {
      if (m && valid(m.cell)) live.set(m.cell, clamp(Number(m.glyph) || 0, 0, 2));
    });
    let rounds = (Array.isArray(puzzle.rounds) ? puzzle.rounds : [])
      .filter(r => r && valid(r.answer));
    if (!rounds.length) {
      // Corrupt descriptor: build one honest round instead of a dead board.
      const rng = rngFromSeed(`${puzzle.seed || "blink"}:repair`);
      const free = series(cells).filter(c => !live.has(c));
      const to = free.length ? pick(free, rng) : 0;
      rounds = [{ kind: "new", to, glyph: 0, answer: to }];
    }
    const study = clamp(Number(puzzle.study) || 1250, 500, 3000);
    const blind = clamp(Number(puzzle.blind) || 480, 180, 1200);
    const wait = timers(api);

    api.body.innerHTML = `
      <div class="pz-sight sg-blink">
        <div class="sg-stage" style="--g:${grid}">
          <div class="sg-still"></div>
          <div class="sg-cells"></div>
          <div class="sg-black"></div>
        </div>
        <div class="pz-bar"><span class="pz-count">look at it</span><span class="sg-step"></span></div>
      </div>`;
    const stage = api.body.querySelector(".sg-stage");
    const cellWrap = api.body.querySelector(".sg-cells");
    const countEl = api.body.querySelector(".pz-count");
    const stepEl = api.body.querySelector(".sg-step");
    loadStill(srcOf(puzzle), api.body.querySelector(".sg-still"), api);

    const buttons = [];
    for (let i = 0; i < cells; i += 1) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "sg-cell";
      cell.setAttribute("aria-label", `Spot ${i + 1}`);
      cellWrap.append(cell);
      buttons.push(cell);
    }

    const paint = () => {
      buttons.forEach((cell, i) => {
        const has = live.has(i);
        cell.classList.toggle("has", has);
        cell.innerHTML = has ? `<i class="sg-mark g${live.get(i)}"></i>` : "";
      });
    };

    let index = 0;
    let phase = "study";
    stepEl.textContent = `change 1 of ${rounds.length}`;
    paint();

    const applyRound = round => {
      if (round.kind === "gone") live.delete(round.from);
      else if (round.kind === "move") {
        const glyph = live.get(round.from);
        live.delete(round.from);
        live.set(round.to, glyph === undefined ? 0 : glyph);
      } else live.set(round.to, clamp(Number(round.glyph) || 0, 0, 2));
      paint();
    };

    const runRound = () => {
      phase = "blind";
      countEl.textContent = "the light goes";
      stage.classList.add("blind");
      wait(blind, () => {
        applyRound(rounds[index]);
        stage.classList.remove("blind");
        phase = "answer";
        countEl.textContent = "tap what changed";
        countEl.classList.add("low");
      });
    };

    buttons.forEach((cell, i) => {
      cell.addEventListener("click", () => {
        if (phase !== "answer") return;
        const round = rounds[index];
        if (i !== round.answer) {
          cell.classList.add("miss");
          wait(500, () => cell.classList.remove("miss"));
          api.strike("That one was always there.");
          return;
        }
        phase = "hold";
        cell.classList.add("got");
        countEl.classList.remove("low");
        index += 1;
        if (index >= rounds.length) {
          api.note("You caught it.", "good");
          api.win("SEEN");
          return;
        }
        api.note(round.kind === "gone" ? "Something is missing." : "There it is.", "good");
        stepEl.textContent = `change ${index + 1} of ${rounds.length}`;
        countEl.textContent = "look again";
        wait(720, () => {
          cell.classList.remove("got");
          runRound();
        });
      });
    });

    wait(study, runRound);
  };

  /* --- light_seam --------------------------------------------------- */

  RENDER.light_seam = function (puzzle, api) {
    const src = srcOf(puzzle);
    const alt = normaliseImage(puzzle.alt);
    const seams = (Array.isArray(puzzle.seams) ? puzzle.seams : [0.5])
      .map(v => clamp(Number(v) || 0.5, 0.12, 0.88));
    const band = clamp(Number(puzzle.band) || 0.07, 0.02, 0.16);
    const slitH = clamp(Number(puzzle.slit) || 0.055, 0.03, 0.14);
    const speedup = clamp(Number(puzzle.speedup) || 0.9, 0.6, 1);
    const wrongStrip = Number(puzzle.wrongStrip);
    const top = 0.06;
    const bottom = 0.94;

    api.body.innerHTML = `
      <div class="pz-sight sg-seam">
        <div class="sg-stage">
          <div class="sg-full sg-still"></div>
          <div class="sg-strips"></div>
          <div class="sg-slit"><div class="sg-in"></div></div>
          <div class="sg-aim"><i class="sg-notch l"></i><i class="sg-notch r"></i></div>
          <button class="sg-tap" type="button" aria-label="Stop the light"></button>
        </div>
        <div class="pz-bar"><span class="pz-count">tap to stop the light</span><span class="sg-step"></span></div>
      </div>`;
    const stage = api.body.querySelector(".sg-stage");
    const still = api.body.querySelector(".sg-full");
    const strips = api.body.querySelector(".sg-strips");
    const slit = api.body.querySelector(".sg-slit");
    const slitIn = api.body.querySelector(".sg-in");
    const aim = api.body.querySelector(".sg-aim");
    const tap = api.body.querySelector(".sg-tap");
    const countEl = api.body.querySelector(".pz-count");
    const stepEl = api.body.querySelector(".sg-step");

    let stillOk = false;
    still.style.backgroundImage = src ? `url("${src}")` : "";
    loadStill(src, null, api, () => { stage.classList.add("nostill"); }, () => { stillOk = true; });

    // A strip is a window on to a full-size copy of the still, so the revealed
    // bands line up with the final reveal exactly.
    const addStrip = (t, h, useAlt) => {
      const strip = document.createElement("div");
      strip.className = `sg-open${useAlt ? " wrong" : ""}`;
      strip.style.top = `${t * 100}%`;
      strip.style.height = `${h * 100}%`;
      const inner = document.createElement("div");
      inner.className = "sg-in";
      inner.style.height = `${(1 / h) * 100}%`;
      inner.style.top = `${(-t / h) * 100}%`;
      const use = useAlt && alt ? alt.src : src;
      if (use) inner.style.backgroundImage = `url("${use}")`;
      strip.append(inner);
      strips.append(strip);
    };

    let round = 0;
    // One period is a full down-and-back, so the seam crosses at half this rate.
    let period = clamp(Number(puzzle.period) || 3400, 1200, 9000);
    let anchor = performance.now();
    let running = true;
    let raf = 0;
    let centre = top;

    const showSeam = () => {
      const y = seams[Math.min(round, seams.length - 1)];
      aim.style.top = `${y * 100}%`;
      aim.style.height = `${band * 200}%`;
      stepEl.textContent = `${round + 1} of ${seams.length} strips`;
    };

    const frame = now => {
      if (!running) return;
      const phase = ((now - anchor) % period) / period;
      const tri = phase < 0.5 ? phase * 2 : 2 - phase * 2;
      centre = top + tri * (bottom - top);
      const t = clamp(centre - slitH / 2, 0, 1 - slitH);
      slit.style.top = `${t * 100}%`;
      slit.style.height = `${slitH * 100}%`;
      slitIn.style.height = `${(1 / slitH) * 100}%`;
      slitIn.style.top = `${(-t / slitH) * 100}%`;
      raf = requestAnimationFrame(frame);
    };
    if (src) slitIn.style.backgroundImage = `url("${src}")`;
    api.teardown(() => { running = false; cancelAnimationFrame(raf); });

    tap.addEventListener("click", () => {
      if (!running) return;
      const y = seams[Math.min(round, seams.length - 1)];
      if (Math.abs(centre - y) > band) {
        aim.classList.remove("near");
        void aim.offsetWidth;
        aim.classList.add("near");
        api.strike("The light went past it.");
        return;
      }
      const useAlt = round === wrongStrip && !!alt;
      addStrip(clamp(y - band, 0, 1), Math.min(band * 2, 1 - clamp(y - band, 0, 1)), useAlt);
      round += 1;
      if (useAlt) api.note(`That strip is not this room. It is ${alt.label || "somewhere else"}.`, "bad");
      else api.note("The strip holds open.", "good");
      if (round >= seams.length) {
        running = false;
        cancelAnimationFrame(raf);
        slit.style.opacity = "0";
        aim.style.opacity = "0";
        stage.classList.add("lit");
        if (stillOk && src) still.classList.add("on");
        countEl.textContent = "the room is open";
        api.win("LIT");
        return;
      }
      period = Math.max(1100, period * speedup);
      anchor = performance.now();
      showSeam();
      countEl.textContent = "again, faster";
    });

    showSeam();
    raf = requestAnimationFrame(frame);
  };

  /* --- dark_sweep --------------------------------------------------- */

  RENDER.dark_sweep = function (puzzle, api) {
    const marks = (Array.isArray(puzzle.marks) ? puzzle.marks : [])
      .filter(m => m && Number.isFinite(Number(m.x)) && Number.isFinite(Number(m.y)))
      .map(m => ({
        x: clamp(Number(m.x), 0.06, 0.94),
        y: clamp(Number(m.y), 0.06, 0.94),
        glyph: clamp(Number(m.glyph) || 0, 0, 2),
        got: false,
      }));
    if (!marks.length) marks.push({ x: 0.5, y: 0.5, glyph: 0, got: false });
    const radius = clamp(Number(puzzle.radius) || 0.24, 0.1, 0.45);
    const tolerance = clamp(Number(puzzle.tolerance) || 0.09, 0.04, 0.16);
    const drain = clamp(Number(puzzle.drain) || 6.8, 1, 30);
    let battery = clamp(Number(puzzle.battery) || 100, 10, 100);

    api.body.innerHTML = `
      <div class="pz-sight sg-sweep">
        <div class="sg-stage">
          <div class="sg-still"></div>
          <div class="sg-marks"></div>
          <div class="sg-lamp"></div>
        </div>
        <div class="sg-meters">
          <div class="sg-meter cell"><span>light</span><i class="sg-track"><b class="sg-fill lamp"></b></i></div>
          <div class="sg-meter warm"><span>near</span><i class="sg-track"><b class="sg-fill heat"></b></i></div>
        </div>
        <div class="pz-bar"><span class="pz-count">press and drag</span><span class="sg-step"></span></div>
      </div>`;
    const stage = api.body.querySelector(".sg-stage");
    const lamp = api.body.querySelector(".sg-lamp");
    const wrap = api.body.querySelector(".sg-marks");
    const cellFill = api.body.querySelector(".sg-fill.lamp");
    const heatFill = api.body.querySelector(".sg-fill.heat");
    const countEl = api.body.querySelector(".pz-count");
    const stepEl = api.body.querySelector(".sg-step");
    loadStill(srcOf(puzzle), api.body.querySelector(".sg-still"), api);

    const nodes = marks.map(m => {
      const el = document.createElement("i");
      el.className = `sg-mark g${m.glyph}`;
      el.style.left = `${m.x * 100}%`;
      el.style.top = `${m.y * 100}%`;
      wrap.append(el);
      return el;
    });

    let on = false;
    let px = 0.5;
    let py = 0.5;
    let aspect = 1.33;
    let found = 0;
    let last = performance.now();
    let raf = 0;
    let running = true;
    const step = () => { stepEl.textContent = `${found} of ${marks.length} found`; };
    step();

    // The pool of light is an ellipse in percentages, so its vertical radius
    // has to be re-derived whenever the stage box changes shape.
    const measure = () => {
      const rect = stage.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      aspect = rect.height / rect.width;
      lamp.style.setProperty("--rx", `${radius * 100}%`);
      lamp.style.setProperty("--ry", `${(radius / aspect) * 100}%`);
    };
    window.addEventListener("resize", measure);
    api.teardown(() => window.removeEventListener("resize", measure));

    const move = event => {
      const at = pointerAt(event, stage);
      px = clamp(at.x, 0, 1);
      py = clamp(at.y, 0, 1);
      aspect = at.aspect || aspect;
      lamp.style.setProperty("--x", `${px * 100}%`);
      lamp.style.setProperty("--y", `${py * 100}%`);
    };

    const lightOn = event => {
      if (!running) return;
      on = true;
      stage.classList.add("on");
      measure();
      move(event);
      if (stage.setPointerCapture && event.pointerId !== undefined) {
        try { stage.setPointerCapture(event.pointerId); } catch (err) { /* ignore */ }
      }
    };
    const lightOff = () => { on = false; stage.classList.remove("on"); };

    stage.addEventListener("pointerdown", lightOn);
    stage.addEventListener("pointermove", event => { if (on) move(event); });
    ["pointerup", "pointercancel", "pointerleave"].forEach(ev => stage.addEventListener(ev, lightOff));
    api.teardown(() => { running = false; cancelAnimationFrame(raf); });

    const frame = now => {
      if (!running) return;
      const dt = Math.min(120, now - last);
      last = now;
      if (on) battery = Math.max(0, battery - (drain * dt) / 1000);
      cellFill.style.width = `${battery}%`;
      cellFill.classList.toggle("low", battery <= 30);

      let nearest = 9;
      marks.forEach((m, i) => {
        const d = Math.hypot(m.x - px, (m.y - py) * aspect);
        if (!m.got && d < nearest) nearest = d;
        if (m.got) { nodes[i].style.opacity = "0.92"; return; }
        nodes[i].style.opacity = on ? String(clamp(1.15 - d / radius, 0, 1)) : "0";
        if (on && d <= tolerance) {
          m.got = true;
          found += 1;
          nodes[i].classList.add("got");
          step();
          api.note(found >= marks.length ? "That is all of them." : "You feel one under your hand.", "good");
        }
      });

      const heat = on ? clamp(1 - nearest / (radius * 2), 0, 1) : 0;
      heatFill.style.width = `${Math.round(heat * 100)}%`;
      heatFill.classList.toggle("hot", heat > 0.72);
      if (on) countEl.textContent = heat > 0.72 ? "it is right here" : (heat > 0.35 ? "closer" : "nothing here");
      else countEl.textContent = battery <= 30 ? "the light is nearly gone" : "press and drag";

      if (found >= marks.length) {
        running = false;
        cancelAnimationFrame(raf);
        stage.classList.add("done");
        api.win("FOUND");
        return;
      }
      if (battery <= 0) {
        running = false;
        cancelAnimationFrame(raf);
        lightOff();
        api.lose("DARK", "light");
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    measure();
    raf = requestAnimationFrame(frame);
  };

  /* ---------------------------------------------------------------- *
   * Registration
   * ---------------------------------------------------------------- */

  const DEFS = [
    ["blink_change", {
      pool: "threat", needsImage: true, label: "Spot what moved in the dark",
      generate: (seed, tune, ctx) => genBlinkChange(seed, normaliseImage(ctx && ctx.image), tune, ctx || {}),
      render: RENDER.blink_change,
    }],
    ["light_seam", {
      pool: "location", needsImage: true, label: "Stop the light on the mark",
      generate: (seed, tune, ctx) => genLightSeam(seed, normaliseImage(ctx && ctx.image), tune, ctx || {}),
      render: RENDER.light_seam,
    }],
    ["dark_sweep", {
      pool: "threat", needsImage: true, label: "Sweep the dark for its marks",
      generate: (seed, tune, ctx) => genDarkSweep(seed, normaliseImage(ctx && ctx.image), tune, ctx || {}),
      render: RENDER.dark_sweep,
    }],
  ];

  function boot() {
    const host = window.HubPuzzles;
    if (!host || typeof host.register !== "function") return false;
    DEFS.forEach(([type, def]) => host.register(type, def));
    return true;
  }

  if (!boot()) {
    let tries = 0;
    const poll = setInterval(() => {
      if (boot() || (tries += 1) > 100) clearInterval(poll);
    }, 60);
  }
})();
