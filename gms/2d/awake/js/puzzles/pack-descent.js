/* Descent pack — two arcade mini-games registered onto window.HubPuzzles.
 *
 *   soft_landing  a weight on a line lowered into the dark; hold to take the
 *                 weight, let go and it falls, set it down under the mark.
 *   interceptor   pieces of the threat come down; catch each one before it
 *                 reaches the lights you have left.
 *
 * Both are rope-and-lamp framed rather than machine framed, so the same file
 * reads straight in a sci-fi facility and in a plain haunted house. Everything
 * drawn is a line, a band or a lit mote taken from the host theme.
 */
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

  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
  const round2 = value => Math.round(value * 100) / 100;

  // Every delayed callback in the pack goes through one of these so an
  // abandoned puzzle leaves nothing ticking behind the hub.
  function timers() {
    const ids = [];
    return {
      later(fn, ms) { ids.push(setTimeout(fn, ms)); },
      clear() { ids.forEach(clearTimeout); ids.length = 0; },
    };
  }

  const ARTICLED = /^(the|a|an|this|that|these|those|your|its|their|his|her)\s/i;

  function theLocation(location) {
    const text = String(location || "this place").trim();
    return ARTICLED.test(text) ? text : `the ${text}`;
  }

  function theThreat(threat) {
    const name = String((threat && threat.name) || "the presence").trim();
    return ARTICLED.test(name) ? name : `the ${name}`;
  }

  function sentenceCase(text) {
    const s = String(text || "");
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /* Difficulty is structural in both games: the descent changes gravity, hold
     reserve, the quiet threshold and how many loads; the interception changes
     how many lights you keep, how fast and how often pieces fall, and how big
     a catch counts. The clock is the host's, not the dial. */
  const TUNING = {
    easy: {
      descent: {
        loads: 1, gravity: 13, brake: 30, grip: 6, threshold: 22,
        drop: [6, 14], gusts: 0, gustMult: 1.5,
      },
      intercept: {
        lights: 4, motes: 8, fall: 3.4, gap: 1.5, radius: 0.13,
        drift: 0.1, tough: 0, missLock: 260,
      },
    },
    medium: {
      descent: {
        loads: 2, gravity: 17, brake: 35, grip: 5, threshold: 15,
        drop: [6, 16], gusts: 1, gustMult: 1.5,
      },
      intercept: {
        lights: 3, motes: 12, fall: 2.8, gap: 1.15, radius: 0.11,
        drift: 0.16, tough: 0, missLock: 340,
      },
    },
    hard: {
      descent: {
        loads: 2, gravity: 21, brake: 48, grip: 6, threshold: 12,
        drop: [4, 12], gusts: 2, gustMult: 1.5,
      },
      intercept: {
        lights: 3, motes: 16, fall: 2.3, gap: 0.85, radius: 0.095,
        drift: 0.22, tough: 4, missLock: 420,
      },
    },
  };

  // The host hands the whole tuning block, not its name, so read difficultyId
  // when the context carries it and fall back to the clock band it came from.
  function levelFor(tune, ctx) {
    const id = String((ctx && ctx.difficultyId) || "").toLowerCase();
    if (TUNING[id]) return TUNING[id];
    const seconds = Number(tune && tune.seconds) || 45;
    if (seconds >= 55) return TUNING.easy;
    if (seconds <= 40) return TUNING.hard;
    return TUNING.medium;
  }

  /* ------------------------------------------------------------------ *
   * Generators — plain JSON only, so a descriptor survives localStorage.
   * ------------------------------------------------------------------ */

  function genSoftLanding(seed, tune, ctx) {
    const t = levelFor(tune, ctx).descent;
    const location = ctx && ctx.location;
    const rng = rngFromSeed(`${seed}:descent`);
    const loads = [];
    // A gust must never out-pull the hold, or the descent stops being solvable.
    const gustMult = Math.min(t.gustMult, round2((t.brake * 0.75) / t.gravity));
    for (let i = 0; i < t.loads; i += 1) {
      const gusts = [];
      for (let g = 0; g < t.gusts; g += 1) {
        gusts.push({
          at: round2(0.7 + rng() * 1.2 + g * 1.3),
          dur: round2(0.7 + rng() * 0.5),
          mult: gustMult,
        });
      }
      loads.push({
        start: Math.round(t.drop[0] + rng() * (t.drop[1] - t.drop[0])),
        v0: round2(rng() * 4),
        gusts,
      });
    }
    return {
      type: "soft_landing",
      title: "Set It Down",
      kicker: location ? String(location) : "lower away",
      prompt: `Something has to go down into ${theLocation(location)} and arrive quiet. Hold to take the weight. Let go and it falls.`,
      loads,
      gravity: t.gravity,
      brake: t.brake,
      grip: t.grip,
      threshold: t.threshold,
      strikes: Math.max(1, Number(tune && tune.strikes) || 3),
      seconds: Number(tune && tune.seconds) || 45,
      seed: `${seed}:descent`,
    };
  }

  function genInterceptor(seed, tune, ctx) {
    const t = levelFor(tune, ctx).intercept;
    const threat = (ctx && ctx.threat) || {};
    const rng = rngFromSeed(`${seed}:intercept`);
    const toughAt = {};
    for (let i = 0; i < t.tough; i += 1) {
      toughAt[Math.floor(2 + rng() * (t.motes - 2))] = true;
    }
    const motes = [];
    for (let i = 0; i < t.motes; i += 1) {
      const x0 = round2(0.12 + rng() * 0.76);
      motes.push({
        at: round2(0.55 + i * t.gap + (rng() - 0.5) * t.gap * 0.36),
        x0,
        x1: round2(clamp(x0 + (rng() - 0.5) * 2 * t.drift, 0.08, 0.92)),
        dur: round2(t.fall * (0.9 + rng() * 0.2)),
        hits: toughAt[i] ? 2 : 1,
      });
    }
    return {
      type: "interceptor",
      title: "Nothing Gets Through",
      kicker: (threat && threat.label) || "it is coming apart",
      prompt: `${sentenceCase(theThreat(threat))} is coming apart above you. Catch every piece before it reaches the lights.`,
      whisper: (threat && threat.clue) || "",
      lights: t.lights,
      motes,
      radius: t.radius,
      missLock: t.missLock,
      // The lights on the floor are the life meter, so no pip row.
      strikes: 0,
      seconds: Number(tune && tune.seconds) || 45,
      seed: `${seed}:intercept`,
    };
  }

  /* ------------------------------------------------------------------ *
   * Renderers
   * ------------------------------------------------------------------ */

  function renderSoftLanding(puzzle, api) {
    const loads = (Array.isArray(puzzle.loads) && puzzle.loads.length ? puzzle.loads : [{ start: 8, v0: 0, gusts: [] }])
      .map(load => ({
        start: clamp(Number(load.start) || 8, 0, 40),
        v0: clamp(Number(load.v0) || 0, 0, 20),
        gusts: (Array.isArray(load.gusts) ? load.gusts : []).map(g => ({
          at: Math.max(0, Number(g.at) || 0),
          dur: Math.max(0.2, Number(g.dur) || 0.6),
          mult: clamp(Number(g.mult) || 1.5, 1, 3),
        })),
      }));
    const gravity = clamp(Number(puzzle.gravity) || 34, 8, 90);
    const brake = clamp(Number(puzzle.brake) || 66, gravity + 12, 160);
    const gripMax = clamp(Number(puzzle.grip) || 3.2, 0.8, 12);
    const threshold = clamp(Number(puzzle.threshold) || 19, 5, 60);
    const scale = threshold * 3;

    api.body.innerHTML = `
      <div class="pz-descent">
        <div class="pd-shaft" aria-label="Hold to take the weight">
          <i class="pd-rail l"></i>
          <i class="pd-rail r"></i>
          <i class="pd-line"></i>
          <i class="pd-load"></i>
          <i class="pd-floor"></i>
          <span class="pd-gust">the air is going down with it</span>
          <span class="pd-tag"></span>
        </div>
        <div class="pd-gauges">
          <div class="pd-gauge speed"><i></i><b style="left:33.33%"></b><em>speed</em></div>
          <div class="pd-gauge grip"><i></i><em>hold left</em></div>
        </div>
        <button class="pd-hold" type="button">HOLD</button>
        <div class="pz-bar"><span class="pz-count"></span></div>
      </div>`;

    const wrap = api.body.querySelector(".pz-descent");
    const shaft = wrap.querySelector(".pd-shaft");
    const tag = wrap.querySelector(".pd-tag");
    const speedFill = wrap.querySelector(".pd-gauge.speed i");
    const gripFill = wrap.querySelector(".pd-gauge.grip i");
    const holdBtn = wrap.querySelector(".pd-hold");
    const countEl = wrap.querySelector(".pz-count");

    const clock = timers();
    let index = 0;
    let y = loads[0].start;
    let v = loads[0].v0;
    let grip = gripMax;
    let loadClock = 0;
    let holding = false;
    let settling = false;
    let spent = false;
    let stopped = false;
    let raf = 0;
    let last = performance.now();

    const label = () => {
      countEl.textContent = `load ${index + 1} of ${loads.length} · land under the mark`;
      tag.textContent = `${index + 1}/${loads.length}`;
    };

    const arm = () => {
      const load = loads[index];
      y = load.start;
      v = load.v0;
      grip = gripMax;
      loadClock = 0;
      settling = false;
      holding = false;
      spent = false;
      holdBtn.classList.remove("down");
      shaft.classList.remove("down", "gust", "hard", "soft");
      label();
    };
    arm();

    const down = event => {
      if (settling) return;
      holding = true;
      holdBtn.classList.add("down");
      shaft.classList.add("down");
      if (event && event.preventDefault) event.preventDefault();
    };
    const up = () => {
      holding = false;
      holdBtn.classList.remove("down");
      shaft.classList.remove("down");
    };

    [shaft, holdBtn].forEach(el => {
      el.addEventListener("pointerdown", down);
      ["pointerup", "pointerleave", "pointercancel"].forEach(ev => el.addEventListener(ev, up));
    });

    const paint = () => {
      shaft.style.setProperty("--y", String(clamp(y / 100, 0, 1)));
      const shown = clamp(Math.abs(v) / scale, 0, 1);
      speedFill.style.width = `${shown * 100}%`;
      speedFill.classList.toggle("over", v > threshold);
      gripFill.style.width = `${clamp(grip / gripMax, 0, 1) * 100}%`;
      gripFill.classList.toggle("low", grip <= gripMax * 0.25);
    };
    paint();

    const land = () => {
      settling = true;
      holding = false;
      y = 100;
      paint();
      if (v <= threshold) {
        shaft.classList.add("soft");
        index += 1;
        if (index >= loads.length) {
          api.note("Down, and nothing heard it.", "good");
          api.win("SET DOWN");
          return;
        }
        api.note("Down soft. Next one.", "good");
        clock.later(() => { if (stopped) return; arm(); paint(); }, 520);
        return;
      }
      shaft.classList.add("hard");
      api.strike("It knocked. Everything down there knows.");
      clock.later(() => { if (stopped) return; arm(); paint(); }, 520);
    };

    const step = now => {
      if (stopped) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      raf = requestAnimationFrame(step);
      if (settling) { return; }

      loadClock += dt;
      const gust = loads[index].gusts.find(g => loadClock >= g.at && loadClock < g.at + g.dur);
      shaft.classList.toggle("gust", !!gust);
      const g = gravity * (gust ? gust.mult : 1);

      let accel = g;
      if (holding && grip > 0) {
        grip = Math.max(0, grip - dt);
        accel = g - brake;
        if (grip <= 0 && !spent) { spent = true; api.note("Your hold is gone.", "bad"); }
      }
      v += accel * dt;
      y += v * dt;
      if (y <= 0) { y = 0; v = Math.max(v, 0); }
      paint();
      if (y >= 100) land();
    };

    api.teardown(() => {
      stopped = true;
      cancelAnimationFrame(raf);
      clock.clear();
      [shaft, holdBtn].forEach(el => {
        el.removeEventListener("pointerdown", down);
        ["pointerup", "pointerleave", "pointercancel"].forEach(ev => el.removeEventListener(ev, up));
      });
    });
    last = performance.now();
    raf = requestAnimationFrame(step);
  }

  function renderInterceptor(puzzle, api) {
    const lights = clamp(Number(puzzle.lights) || 3, 1, 6);
    const radius = clamp(Number(puzzle.radius) || 0.11, 0.05, 0.25);
    const missLock = clamp(Number(puzzle.missLock) || 340, 0, 900);
    const motes = (Array.isArray(puzzle.motes) ? puzzle.motes : []).map((m, i) => ({
      id: i,
      at: Math.max(0, Number(m.at) || 0) * 1000,
      x0: clamp(Number(m.x0) || 0.5, 0.05, 0.95),
      x1: clamp(Number(m.x1) || Number(m.x0) || 0.5, 0.05, 0.95),
      dur: Math.max(600, (Number(m.dur) || 2.8) * 1000),
      hits: clamp(Number(m.hits) || 1, 1, 3),
      state: "waiting",
      el: null,
      x: 0,
      p: 0,
    }));

    api.body.innerHTML = `
      <div class="pz-intercept">
        <div class="pi-field">
          <i class="pi-hair"></i>
          <div class="pi-lights">${Array.from({ length: lights }, () => '<i class="pi-light"></i>').join("")}</div>
        </div>
        <div class="pz-bar"><span class="pz-count"></span></div>
      </div>`;

    const wrap = api.body.querySelector(".pz-intercept");
    const field = wrap.querySelector(".pi-field");
    const lightEls = Array.from(wrap.querySelectorAll(".pi-light"));
    const countEl = wrap.querySelector(".pz-count");

    const clock = timers();
    let alive = lights;
    let caught = 0;
    let lockedUntil = 0;
    let stopped = false;
    let raf = 0;
    const startedAt = performance.now();

    const label = () => {
      countEl.textContent = `${caught}/${motes.length} caught · ${alive} still lit`;
      countEl.classList.toggle("low", alive <= 1);
    };
    label();

    const place = mote => {
      // Lights sit on the 92% line; a piece starts just above the frame.
      mote.x = mote.x0 + (mote.x1 - mote.x0) * mote.p;
      mote.el.style.left = `${mote.x * 100}%`;
      mote.el.style.top = `${(-6 + mote.p * 98)}%`;
    };

    const spawn = mote => {
      const el = document.createElement("i");
      el.className = `pi-mote${mote.hits > 1 ? " tough" : ""}`;
      mote.el = el;
      mote.state = "live";
      field.append(el);
      place(mote);
    };

    const kill = (mote, why) => {
      mote.state = why;
      if (mote.el) {
        mote.el.classList.add(why === "caught" ? "gone" : "landed");
        const el = mote.el;
        clock.later(() => el.remove(), 320);
        mote.el = null;
      }
    };

    const douse = mote => {
      kill(mote, "landed");
      // Whatever it lands on, the dark takes the nearest light still burning.
      let best = -1;
      let bestDist = Infinity;
      lightEls.forEach((el, i) => {
        if (el.classList.contains("out")) return;
        const centre = (i + 0.5) / lights;
        const dist = Math.abs(centre - mote.x);
        if (dist < bestDist) { bestDist = dist; best = i; }
      });
      if (best >= 0) {
        lightEls[best].classList.add("out");
        alive -= 1;
      }
      label();
      field.classList.add("hit");
      clock.later(() => field.classList.remove("hit"), 260);
      if (alive <= 0) { api.lose("DARK", "dark"); return; }
      api.strike("One got through.");
    };

    const onDown = event => {
      const now = performance.now();
      if (now < lockedUntil) return;
      const rect = field.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width;
      const py = (event.clientY - rect.top) / rect.height;
      let best = null;
      let bestDist = Infinity;
      motes.forEach(mote => {
        if (mote.state !== "live") return;
        const my = (-6 + mote.p * 98) / 100;
        if (my < 0) return; // still above the frame: not visible, not catchable
        const dx = (mote.x - px) * rect.width;
        const dy = (my - py) * rect.height;
        const dist = Math.hypot(dx, dy);
        if (dist < bestDist) { bestDist = dist; best = mote; }
      });
      if (best && bestDist <= radius * rect.width) {
        best.hits -= 1;
        if (best.hits > 0) {
          best.el.classList.remove("tough");
          best.el.classList.add("cracked");
          api.note("It came apart again. Hit it once more.", "");
          return;
        }
        kill(best, "caught");
        caught += 1;
        label();
        return;
      }
      lockedUntil = now + missLock;
      field.classList.add("miss");
      clock.later(() => field.classList.remove("miss"), Math.max(160, missLock));
      api.strike("You swiped at nothing.");
    };

    field.addEventListener("pointerdown", onDown);

    const step = now => {
      if (stopped) return;
      raf = requestAnimationFrame(step);
      const t = now - startedAt;
      motes.forEach(mote => {
        if (stopped) return;
        if (mote.state === "waiting" && t >= mote.at) spawn(mote);
        if (mote.state !== "live") return;
        mote.p = (t - mote.at) / mote.dur;
        if (mote.p >= 1) { mote.p = 1; place(mote); douse(mote); return; }
        place(mote);
      });
      if (!stopped && motes.every(m => m.state === "caught" || m.state === "landed")) {
        api.note("Nothing else is coming down.", "good");
        api.win("HELD");
      }
    };

    api.teardown(() => {
      stopped = true;
      cancelAnimationFrame(raf);
      clock.clear();
      field.removeEventListener("pointerdown", onDown);
    });
    raf = requestAnimationFrame(step);
  }

  /* ------------------------------------------------------------------ *
   * Registration
   * ------------------------------------------------------------------ */

  function install() {
    const hub = window.HubPuzzles;
    if (!hub || typeof hub.register !== "function") return false;
    hub.register("soft_landing", {
      pool: "location",
      label: "Set the weight down",
      generate: genSoftLanding,
      render: renderSoftLanding,
    });
    hub.register("interceptor", {
      pool: "threat",
      label: "Catch what falls",
      generate: genInterceptor,
      render: renderInterceptor,
    });
    return true;
  }

  // The host normally loads puzzles.js first; poll briefly in case a page
  // orders the tags the other way round.
  if (!install()) {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (install() || tries > 60) clearInterval(timer);
    }, 50);
  }
})();
