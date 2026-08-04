/* Volley pack — two arcade-shaped challenges that share one code path.
   Nothing here names a technology or an era: swarm_line is "a mass coming
   down at you", breach_wall is "a way that has been walled over". All of the
   flavour arrives through ctx, so Awake and The Horrors read differently
   without a per-game branch. Drawing is geometry only. */
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

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rangeInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const round2 = v => Math.round(v * 100) / 100;

  const ARTICLED = /^(the|a|an|this|that|these|those|your|its|their|his|her)\s/i;
  const theLocation = location => {
    const text = String(location || "this place").trim();
    return ARTICLED.test(text) ? text : `the ${text}`;
  };
  const theThreat = threat => {
    const name = String((threat && threat.name) || "the presence").trim();
    return ARTICLED.test(name) ? name : `the ${name}`;
  };
  const sentenceCase = text => {
    const s = String(text || "");
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  /* Difficulty is structural: formation size, descent, fire rate, wall size,
     ball speed, paddle width and strike budget all move. The host passes the
     whole TUNING block rather than the id, so the band is read back off its
     clock the same way puzzles.js migrates a legacy descriptor. */
  const PACK = {
    easy: {
      swarm: {
        cols: 4, rows: 3, sway: 6, period: 5.2, descent: 2.4, urgency: 0.03,
        fire: 480, shot: 210, shots: 2, paddle: 22,
        dives: 2, diveSpeed: 34, drops: 4, dropSpeed: 30,
        strikes: 3, seconds: 46,
      },
      breach: {
        cols: 5, rows: 3, holes: 2, speed: 92, gain: 1.6, paddle: 26,
        jitter: 4.5, settle: 9, settles: 3, strikes: 3, seconds: 55,
      },
    },
    medium: {
      swarm: {
        cols: 5, rows: 3, sway: 8, period: 4.4, descent: 2.8, urgency: 0.035,
        fire: 430, shot: 210, shots: 2, paddle: 18,
        dives: 4, diveSpeed: 42, drops: 7, dropSpeed: 36,
        strikes: 3, seconds: 40,
      },
      breach: {
        cols: 5, rows: 4, holes: 3, speed: 106, gain: 2.0, paddle: 21,
        jitter: 4, settle: 8, settles: 3, strikes: 3, seconds: 46,
      },
    },
    hard: {
      swarm: {
        cols: 6, rows: 3, sway: 9, period: 3.6, descent: 3.6, urgency: 0.04,
        fire: 400, shot: 220, shots: 2, paddle: 15,
        dives: 6, diveSpeed: 50, drops: 10, dropSpeed: 42,
        strikes: 2, seconds: 36,
      },
      breach: {
        cols: 6, rows: 4, holes: 5, speed: 126, gain: 2.4, paddle: 17,
        jitter: 3.5, settle: 7, settles: 3, strikes: 2, seconds: 42,
      },
    },
  };

  function bandFor(tune) {
    const seconds = Number(tune && tune.seconds) || 45;
    if (seconds >= 55) return "easy";
    if (seconds <= 40) return "hard";
    return "medium";
  }

  const packFor = tune => PACK[bandFor(tune)] || PACK.medium;

  /* ------------------------------------------------------------------ *
   * Generators — plain JSON only, so a descriptor survives localStorage.
   * ------------------------------------------------------------------ */

  function genSwarmLine(seed, tune, threat) {
    const t = packFor(tune).swarm;
    const rng = rngFromSeed(`${seed}:swarm`);
    const cells = [];
    for (let r = 0; r < t.rows; r += 1) {
      for (let c = 0; c < t.cols; c += 1) cells.push({ c, r });
    }
    const dives = [];
    let at = 3000 + rangeInt(rng, 0, 900);
    for (let i = 0; i < t.dives; i += 1) {
      dives.push({ at, col: Math.floor(rng() * t.cols), swirl: round2(rng() * 2 - 1) });
      at += rangeInt(rng, 2500, 4200);
    }
    const drops = [];
    let dat = 1600 + rangeInt(rng, 0, 700);
    for (let i = 0; i < t.drops; i += 1) {
      drops.push({ at: dat, col: Math.floor(rng() * t.cols) });
      dat += rangeInt(rng, 1150, 2200);
    }
    return {
      type: "swarm_line",
      title: "It Comes Down In Pieces",
      kicker: (threat && threat.label) || "it is coming down",
      prompt: `${sentenceCase(theThreat(threat))} breaks apart and comes down at you. Slide along the bottom and knock every piece back up. Nothing reaches the line.`,
      whisper: (threat && threat.clue) || "",
      cols: t.cols,
      rows: t.rows,
      cells,
      sway: t.sway,
      period: t.period,
      phase: round2(rng() * Math.PI * 2),
      descent: t.descent,
      urgency: t.urgency,
      fire: t.fire,
      shotSpeed: t.shot,
      maxShots: t.shots,
      paddle: t.paddle,
      diveSpeed: t.diveSpeed,
      dropSpeed: t.dropSpeed,
      dives,
      drops,
      strikes: t.strikes,
      seconds: t.seconds,
      seed: `${seed}:swarm`,
    };
  }

  function genBreachWall(seed, tune, location) {
    const t = packFor(tune).breach;
    const rng = rngFromSeed(`${seed}:breach`);
    const total = t.cols * t.rows;
    const all = Array.from({ length: total }, (_, i) => i);
    // Holes are cut from the two lowest rows only, so the wall always keeps a
    // solid cap and the ball can never start with a free lane to the ceiling.
    const cuttable = all.filter(i => Math.floor(i / t.cols) >= Math.max(1, t.rows - 2));
    const holes = shuffle(cuttable, rng).slice(0, Math.min(t.holes, cuttable.length)).sort((a, b) => a - b);
    return {
      type: "breach_wall",
      title: "Walled Over",
      kicker: location ? String(location) : "no way through",
      prompt: `${sentenceCase(theLocation(location))} has closed the way with a wall. You have one loose piece and something flat to hit it with. Take the whole wall out.`,
      cols: t.cols,
      rows: t.rows,
      holes,
      speed: t.speed,
      gain: t.gain,
      paddle: t.paddle,
      launch: rng() < 0.5 ? -1 : 1,
      lean: round2(0.42 + rng() * 0.2),
      jitter: t.jitter,
      settle: t.settle,
      settles: t.settles,
      strikes: t.strikes,
      seconds: t.seconds,
      seed: `${seed}:breach`,
    };
  }

  /* ------------------------------------------------------------------ *
   * Shared field: a virtual-unit canvas, a fixed-step loop and one-thumb
   * horizontal drag. Both games sit on top of this.
   * ------------------------------------------------------------------ */

  const STEP = 1 / 120;

  function readColours(el) {
    const cs = getComputedStyle(el);
    const get = (name, fallback) => {
      const value = cs.getPropertyValue(name).trim();
      return value || fallback;
    };
    return {
      ink: get("--pzv-ink", "#f2f6fb"),
      accent: get("--pzv-accent", "#8deeff"),
      bad: get("--pzv-bad", "#ff5574"),
      line: get("--pzv-line", "rgba(255, 255, 255, 0.24)"),
      deep: get("--pzv-deep", "#05070b"),
      dim: get("--pzv-dim", "rgba(240, 245, 250, 0.48)"),
    };
  }

  function mountField(api, kind, vw, vh, hintText) {
    const wrap = document.createElement("div");
    wrap.className = `pz-vol pz-vol-${kind}`;
    wrap.innerHTML = `
      <div class="pz-volfield"><canvas class="pz-volcanvas"></canvas></div>
      <div class="pz-bar"><span class="pz-count"></span><span class="pz-volhint"></span></div>`;
    api.body.append(wrap);

    const cv = wrap.querySelector(".pz-volcanvas");
    const g = cv.getContext("2d");
    cv.style.aspectRatio = `${vw} / ${vh}`;
    wrap.querySelector(".pz-volhint").textContent = hintText;

    let scale = 1;
    const fit = () => {
      const dpr = clamp(window.devicePixelRatio || 1, 1, 3);
      const wantW = Math.max(120, Math.round((cv.clientWidth || 300) * dpr));
      const wantH = Math.round(wantW * (vh / vw));
      if (cv.width !== wantW || cv.height !== wantH) {
        cv.width = wantW;
        cv.height = wantH;
      }
      scale = cv.width / vw;
    };
    fit();

    const colours = readColours(wrap);

    return {
      wrap, cv, g, colours,
      count: wrap.querySelector(".pz-count"),
      fit,
      scale: () => scale,
      fieldX: clientX => {
        const rect = cv.getBoundingClientRect();
        if (!rect.width) return vw / 2;
        return clamp(((clientX - rect.left) / rect.width) * vw, 0, vw);
      },
    };
  }

  // One thumb anywhere on the field drives the bar; a mouse tracks without a
  // button so desktop play needs no click-and-hold; arrows work too.
  function bindSlide(field, api, vw, state) {
    const cv = field.cv;
    let down = false;
    const keys = new Set();

    const setFrom = event => { state.target = field.fieldX(event.clientX); };
    const onDown = event => {
      down = true;
      state.started = true;
      setFrom(event);
      if (cv.setPointerCapture) { try { cv.setPointerCapture(event.pointerId); } catch (err) { /* ignore */ } }
      event.preventDefault();
    };
    const onMove = event => {
      if (!down && event.pointerType !== "mouse") return;
      if (down) event.preventDefault();
      state.started = true;
      setFrom(event);
    };
    const onUp = () => { down = false; };
    const onKeyDown = event => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      keys.add(event.key);
      state.started = true;
      event.preventDefault();
    };
    const onKeyUp = event => keys.delete(event.key);

    cv.addEventListener("pointerdown", onDown);
    cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerup", onUp);
    cv.addEventListener("pointercancel", onUp);
    cv.addEventListener("pointerleave", onUp);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    api.teardown(() => {
      cv.removeEventListener("pointerdown", onDown);
      cv.removeEventListener("pointermove", onMove);
      cv.removeEventListener("pointerup", onUp);
      cv.removeEventListener("pointercancel", onUp);
      cv.removeEventListener("pointerleave", onUp);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      keys.clear();
    });

    return dt => {
      if (keys.size) {
        const dir = (keys.has("ArrowRight") ? 1 : 0) - (keys.has("ArrowLeft") ? 1 : 0);
        state.target = clamp(state.target + dir * 78 * dt, 0, vw);
      }
    };
  }

  // Fixed timestep: a 120Hz display runs the same number of sim steps per
  // second of wall clock as a 60Hz one, so the outcome is skill, not refresh.
  function runLoop(api, state, sim, draw) {
    let raf = 0;
    let acc = 0;
    let last = performance.now();
    const frame = now => {
      const delta = Math.max(0, (now - last) / 1000);
      last = now;
      acc = Math.min(0.25, acc + delta);
      while (acc >= STEP && !state.over) { acc -= STEP; sim(STEP); }
      draw();
      if (!state.over) raf = requestAnimationFrame(frame);
    };
    api.teardown(() => { state.over = true; cancelAnimationFrame(raf); });
    raf = requestAnimationFrame(frame);
  }

  function roundRect(g, x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + rad, y);
    g.arcTo(x + w, y, x + w, y + h, rad);
    g.arcTo(x + w, y + h, x, y + h, rad);
    g.arcTo(x, y + h, x, y, rad);
    g.arcTo(x, y, x + w, y, rad);
    g.closePath();
  }

  /* ------------------------------------------------------------------ *
   * swarm_line
   * ------------------------------------------------------------------ */

  const SW = 100;
  const SH = 142;
  const S_LINE = 130;
  const S_BAR_Y = 133;
  const S_TOP = 20;
  const S_ROW = 12;

  function renderSwarmLine(puzzle, api) {
    const cols = clamp(Number(puzzle.cols) || 5, 2, 8);
    const rows = clamp(Number(puzzle.rows) || 3, 1, 5);
    const paddleW = clamp(Number(puzzle.paddle) || 18, 8, 40);
    const sway = clamp(Number(puzzle.sway) || 8, 0, 12);
    const period = clamp(Number(puzzle.period) || 4.4, 1.5, 12);
    const phase = Number(puzzle.phase) || 0;
    const descent = clamp(Number(puzzle.descent) || 2.8, 0.4, 12);
    const urgency = clamp(Number(puzzle.urgency) || 0.03, 0, 0.2);
    const fireEvery = clamp(Number(puzzle.fire) || 300, 120, 900) / 1000;
    const shotSpeed = clamp(Number(puzzle.shotSpeed) || 210, 60, 400);
    const maxShots = clamp(Number(puzzle.maxShots) || 2, 1, 4);
    const diveSpeed = clamp(Number(puzzle.diveSpeed) || 42, 12, 110);
    const dropSpeed = clamp(Number(puzzle.dropSpeed) || 36, 12, 110);
    const stepX = cols > 1 ? 74 / (cols - 1) : 0;
    const slotX = c => (cols > 1 ? 13 + c * stepX : SW / 2);
    const slotY = r => S_TOP + r * S_ROW;

    const cells = Array.isArray(puzzle.cells) && puzzle.cells.length
      ? puzzle.cells
      : Array.from({ length: cols * rows }, (_, i) => ({ c: i % cols, r: Math.floor(i / cols) }));

    const field = mountField(api, "swarm", SW, SH, "drag along the bottom");
    const g = field.g;
    const col = field.colours;

    const state = {
      over: false, started: false, t: 0, drift: 0, fall: 0, target: SW / 2, x: SW / 2,
      kills: 0, fireAt: 0.35, flash: 0, shots: [], drops: [],
      marks: cells.map(cell => ({
        c: clamp(Number(cell.c) || 0, 0, cols - 1),
        r: clamp(Number(cell.r) || 0, 0, rows - 1),
        alive: true, mode: 0, x: 0, y: 0, sx: 0, sy: 0, targetX: 50, swirl: 0,
      })),
    };
    state.marks.forEach(m => { m.x = slotX(m.c); m.y = slotY(m.r); });
    const total = state.marks.length;
    const dives = (Array.isArray(puzzle.dives) ? puzzle.dives : []).map(d => ({
      at: Math.max(0, Number(d.at) || 0) / 1000,
      col: clamp(Number(d.col) || 0, 0, cols - 1),
      swirl: clamp(Number(d.swirl) || 0, -1, 1),
      used: false,
    }));
    const drops = (Array.isArray(puzzle.drops) ? puzzle.drops : []).map(d => ({
      at: Math.max(0, Number(d.at) || 0) / 1000,
      col: clamp(Number(d.col) || 0, 0, cols - 1),
      used: false,
    }));

    const pump = bindSlide(field, api, SW, state);
    // Read by the headless play test; the game never touches it.
    field.cv.__pzState = state;

    const paint = () => {
      field.count.textContent = `${total - state.kills} left of ${total}`;
      field.count.classList.toggle("low", total - state.kills <= 2);
    };
    paint();

    const strike = text => {
      state.flash = 0.3;
      if (api.strike(text) <= 0) state.over = true;
    };

    const lowestIn = column => {
      let best = null;
      state.marks.forEach(m => {
        if (!m.alive || m.mode !== 0) return;
        if (m.c !== column) return;
        if (!best || m.r > best.r) best = m;
      });
      if (best) return best;
      const any = state.marks.filter(m => m.alive && m.mode === 0);
      if (!any.length) return null;
      return any.reduce((a, b) => (b.r > a.r ? b : a));
    };

    const sim = dt => {
      pump(dt);
      state.t += dt;
      state.x = clamp(state.target, paddleW / 2 + 1, SW - paddleW / 2 - 1);
      if (state.flash > 0) state.flash = Math.max(0, state.flash - dt);

      state.drift = sway * Math.sin((state.t * Math.PI * 2) / period + phase);
      state.fall += descent * (1 + urgency * state.kills) * dt;

      state.marks.forEach(m => {
        if (!m.alive) return;
        if (m.mode === 0) {
          m.x = slotX(m.c) + state.drift;
          m.y = slotY(m.r) + state.fall;
        } else if (m.mode === 1) {
          m.y += diveSpeed * dt;
          const span = Math.max(1, (SH + 8) - m.sy);
          const p = clamp((m.y - m.sy) / span, 0, 1);
          const eased = p * p * (3 - 2 * p);
          m.x = m.sx + (m.targetX - m.sx) * eased + m.swirl * 13 * Math.sin(p * Math.PI * 2);
          if (m.y > SH + 6) { m.mode = 2; m.y = -10; }
        } else {
          m.y += 62 * dt;
          const home = slotX(m.c) + state.drift;
          m.x += (home - m.x) * Math.min(1, dt * 5);
          if (m.y >= slotY(m.r) + state.fall) m.mode = 0;
        }
      });

      dives.forEach(d => {
        if (d.used || state.t < d.at) return;
        d.used = true;
        const mark = lowestIn(d.col);
        if (!mark) return;
        mark.mode = 1;
        mark.sx = mark.x;
        mark.sy = mark.y;
        mark.targetX = state.x;
        mark.swirl = d.swirl;
      });

      drops.forEach(d => {
        if (d.used || state.t < d.at) return;
        d.used = true;
        const mark = lowestIn(d.col);
        if (!mark) return;
        state.drops.push({ x: mark.x, y: mark.y + 4 });
      });

      state.fireAt -= dt;
      if (state.fireAt <= 0 && state.shots.length < maxShots) {
        state.fireAt = fireEvery;
        state.shots.push({ x: state.x, y: S_BAR_Y - 4 });
      }

      state.shots.forEach(s => { s.y -= shotSpeed * dt; });
      state.drops.forEach(d => { d.y += dropSpeed * dt; });

      state.shots = state.shots.filter(s => {
        if (s.y < -4) return false;
        const dropAt = state.drops.findIndex(d => Math.abs(d.x - s.x) < 3.4 && Math.abs(d.y - s.y) < 4);
        if (dropAt >= 0) { state.drops.splice(dropAt, 1); return false; }
        const mark = state.marks.find(m => m.alive && Math.abs(m.x - s.x) < 4.6 && Math.abs(m.y - s.y) < 4.6);
        if (!mark) return true;
        mark.alive = false;
        state.kills += 1;
        paint();
        return false;
      });

      const half = paddleW / 2 + 1.5;
      state.drops = state.drops.filter(d => {
        if (d.y > SH) return false;
        if (d.y >= S_BAR_Y - 3 && d.y <= S_BAR_Y + 4 && Math.abs(d.x - state.x) <= half) {
          strike("It got through.");
          return false;
        }
        return true;
      });

      state.marks.forEach(m => {
        if (!m.alive || m.mode !== 1) return;
        if (m.y >= S_BAR_Y - 4 && m.y <= S_BAR_Y + 5 && Math.abs(m.x - state.x) <= half + 2) {
          m.mode = 2;
          m.y = -10;
          strike("One of them reached you.");
        }
      });

      if (state.over) return;

      if (state.kills >= total) {
        state.over = true;
        api.note("Nothing left of it.", "good");
        api.win("HELD");
        return;
      }
      const landed = state.marks.some(m => m.alive && m.mode === 0 && m.y >= S_LINE - 4);
      if (landed) {
        state.over = true;
        api.lose("IT LANDED", "landed");
      }
    };

    const draw = () => {
      field.fit();
      const s = field.scale();
      g.setTransform(s, 0, 0, s, 0, 0);
      g.clearRect(0, 0, SW, SH);

      g.fillStyle = col.deep;
      g.fillRect(0, 0, SW, SH);
      g.globalAlpha = 0.16;
      g.strokeStyle = col.line;
      g.lineWidth = 0.3;
      for (let y = 12; y < S_LINE; y += 16) {
        g.beginPath();
        g.moveTo(4, y);
        g.lineTo(SW - 4, y);
        g.stroke();
      }
      g.globalAlpha = 1;

      // the line you are holding
      g.strokeStyle = col.bad;
      g.globalAlpha = state.flash > 0 ? 0.85 : 0.34;
      g.lineWidth = 0.7;
      g.setLineDash([3, 3]);
      g.beginPath();
      g.moveTo(3, S_LINE);
      g.lineTo(SW - 3, S_LINE);
      g.stroke();
      g.setLineDash([]);
      g.globalAlpha = 1;

      state.marks.forEach(m => {
        if (!m.alive) return;
        const diving = m.mode === 1;
        const size = diving ? 5.6 : 5;
        g.save();
        g.translate(m.x, m.y);
        g.rotate(Math.PI / 4);
        g.strokeStyle = diving ? col.bad : col.accent;
        g.fillStyle = diving ? col.bad : col.accent;
        g.globalAlpha = m.mode === 2 ? 0.3 : 0.16;
        g.fillRect(-size / 2, -size / 2, size, size);
        g.globalAlpha = m.mode === 2 ? 0.45 : 0.92;
        g.lineWidth = 0.85;
        g.strokeRect(-size / 2, -size / 2, size, size);
        g.restore();
        if (!diving) {
          g.globalAlpha = 0.5;
          g.fillStyle = col.accent;
          g.fillRect(m.x - 0.5, m.y - 0.5, 1, 1);
        }
        g.globalAlpha = 1;
      });

      g.fillStyle = col.bad;
      state.drops.forEach(d => {
        g.globalAlpha = 0.9;
        g.beginPath();
        g.arc(d.x, d.y, 1.5, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 0.25;
        g.fillRect(d.x - 0.5, d.y - 5, 1, 5);
      });
      g.globalAlpha = 1;

      g.strokeStyle = col.ink;
      g.lineWidth = 1.1;
      g.lineCap = "round";
      state.shots.forEach(s => {
        g.globalAlpha = 0.9;
        g.beginPath();
        g.moveTo(s.x, s.y);
        g.lineTo(s.x, s.y + 4.5);
        g.stroke();
      });
      g.globalAlpha = 1;

      const half = paddleW / 2;
      g.strokeStyle = state.flash > 0 ? col.bad : col.accent;
      g.lineWidth = 2.6;
      g.globalAlpha = 0.22;
      g.beginPath();
      g.moveTo(state.x - half, S_BAR_Y + 2);
      g.quadraticCurveTo(state.x, S_BAR_Y - 6, state.x + half, S_BAR_Y + 2);
      g.stroke();
      g.globalAlpha = 1;
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(state.x - half, S_BAR_Y);
      g.quadraticCurveTo(state.x, S_BAR_Y - 7, state.x + half, S_BAR_Y);
      g.stroke();
      g.lineCap = "butt";

      if (!state.started) {
        g.globalAlpha = 0.5;
        g.fillStyle = col.dim;
        g.font = "5px system-ui, sans-serif";
        g.textAlign = "center";
        g.fillText("drag anywhere", SW / 2, SH - 4);
        g.globalAlpha = 1;
      }
    };

    runLoop(api, state, sim, draw);
  }

  /* ------------------------------------------------------------------ *
   * breach_wall
   * ------------------------------------------------------------------ */

  const BW = 100;
  const BH = 118;
  const B_PAD_Y = 104;
  const B_PAD_H = 3.6;
  const B_TOP = 14;
  const B_BRICK_H = 5.4;
  const B_ROW = 7.6;
  const B_AREA_X = 8;
  const B_AREA_W = 84;
  const B_R = 1.9;
  const B_MIN_Y = 0.32;
  const B_MIN_X = 0.26;

  function renderBreachWall(puzzle, api) {
    const cols = clamp(Number(puzzle.cols) || 5, 2, 8);
    const rows = clamp(Number(puzzle.rows) || 4, 1, 6);
    const paddleW = clamp(Number(puzzle.paddle) || 21, 8, 44);
    const baseSpeed = clamp(Number(puzzle.speed) || 106, 40, 220);
    const gain = clamp(Number(puzzle.gain) || 2, 0, 8);
    const lean = clamp(Number(puzzle.lean) || 0.5, 0.2, 0.8);
    const jitterAfter = clamp(Number(puzzle.jitter) || 4, 1.5, 12);
    const settleAfter = clamp(Number(puzzle.settle) || 8, 3, 20);
    const maxSettles = clamp(Number(puzzle.settles) || 3, 0, 6);
    const holes = new Set((Array.isArray(puzzle.holes) ? puzzle.holes : []).map(Number));
    const cellW = B_AREA_W / cols;
    const brickW = cellW - 1.8;
    const nudge = rngFromSeed(`${puzzle.seed || "breach"}:nudge`);

    const field = mountField(api, "breach", BW, BH, "drag along the bottom");
    const g = field.g;
    const col = field.colours;

    const bricks = [];
    for (let i = 0; i < cols * rows; i += 1) {
      if (holes.has(i)) continue;
      bricks.push({
        x: B_AREA_X + (i % cols) * cellW + 0.9,
        y: B_TOP + Math.floor(i / cols) * B_ROW,
        w: brickW,
        h: B_BRICK_H,
        row: Math.floor(i / cols),
        alive: true,
      });
    }
    const total = bricks.length;

    const state = {
      over: false, started: false, target: BW / 2, x: BW / 2, broken: 0, settles: 0,
      sinceBreak: 0, drop: 0, life: 0, flash: 0, trail: [],
      ball: { x: BW / 2, y: B_PAD_Y - 8, vx: 0, vy: 0, speed: baseSpeed, sx: 1, sy: -1 },
    };

    const launch = dir => {
      const b = state.ball;
      b.speed = baseSpeed + gain * state.broken;
      b.x = state.x;
      b.y = B_PAD_Y - B_R - 2;
      const angle = -Math.PI / 2 + dir * (Math.PI / 5);
      b.vx = Math.cos(angle) * b.speed;
      b.vy = Math.sin(angle) * b.speed;
      b.sx = dir;
      b.sy = -1;
      state.trail.length = 0;
    };
    launch(Number(puzzle.launch) < 0 ? -1 : 1);

    const pump = bindSlide(field, api, BW, state);
    field.cv.__pzState = state;

    const paint = () => {
      field.count.textContent = `${total - state.broken} left of ${total}`;
      field.count.classList.toggle("low", total - state.broken <= 2);
    };
    paint();

    // Every bounce ends here: constant speed, never flat enough to loop across
    // the field forever, never vertical enough to tunnel a single column.
    const guard = () => {
      const b = state.ball;
      const speed = Math.hypot(b.vx, b.vy) || b.speed;
      let ux = b.vx / speed;
      let uy = b.vy / speed;
      if (ux !== 0) b.sx = ux > 0 ? 1 : -1;
      if (uy !== 0) b.sy = uy > 0 ? 1 : -1;
      if (Math.abs(uy) < B_MIN_Y) uy = b.sy * B_MIN_Y;
      if (Math.abs(ux) < B_MIN_X) ux = b.sx * B_MIN_X;
      const norm = Math.hypot(ux, uy) || 1;
      b.vx = (ux / norm) * b.speed;
      b.vy = (uy / norm) * b.speed;
    };

    // The deadlock answer. Centring the bar under the piece is the natural
    // instinct and it sends the piece back up the same narrow channel every
    // time, which can miss the last few blocks forever. If nothing has broken
    // for a while the next rebound is aimed at a surviving block instead of
    // being mirrored, so contact is guaranteed rather than hoped for.
    const aimAtSurvivor = fromX => {
      const alive = bricks.filter(br => br.alive);
      if (!alive.length) return null;
      let best = alive[0];
      let bestScore = Infinity;
      alive.forEach(br => {
        const cx = br.x + br.w / 2;
        const score = Math.abs(cx - fromX) - (br.y + state.drop) * 0.35 + nudge() * 12;
        if (score < bestScore) { bestScore = score; best = br; }
      });
      const tx = best.x + best.w / 2;
      const ty = best.y + state.drop + best.h / 2;
      const angle = Math.atan2(ty - B_PAD_Y, tx - fromX);
      return clamp(angle, -Math.PI + 0.35, -0.35);
    };

    const strike = text => {
      state.flash = 0.3;
      if (api.strike(text) <= 0) { state.over = true; return true; }
      return false;
    };

    const sim = dt => {
      pump(dt);
      state.x = clamp(state.target, paddleW / 2 + 2, BW - paddleW / 2 - 2);
      if (state.flash > 0) state.flash = Math.max(0, state.flash - dt);
      const b = state.ball;
      b.speed = baseSpeed + gain * state.broken;

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (b.x - B_R < 2) { b.x = 2 + B_R; b.vx = Math.abs(b.vx); guard(); }
      if (b.x + B_R > BW - 2) { b.x = BW - 2 - B_R; b.vx = -Math.abs(b.vx); guard(); }
      if (b.y - B_R < 2) { b.y = 2 + B_R; b.vy = Math.abs(b.vy); guard(); }

      for (let i = 0; i < bricks.length; i += 1) {
        const br = bricks[i];
        if (!br.alive) continue;
        const top = br.y + state.drop;
        const nx = clamp(b.x, br.x, br.x + br.w);
        const ny = clamp(b.y, top, top + br.h);
        const dx = b.x - nx;
        const dy = b.y - ny;
        if (dx * dx + dy * dy >= B_R * B_R) continue;
        const cx = br.x + br.w / 2;
        const cy = top + br.h / 2;
        const overX = (br.w / 2 + B_R) - Math.abs(b.x - cx);
        const overY = (br.h / 2 + B_R) - Math.abs(b.y - cy);
        if (overX < overY) {
          b.x += (b.x < cx ? -1 : 1) * overX;
          b.vx = (b.x < cx ? -1 : 1) * Math.abs(b.vx);
        } else {
          b.y += (b.y < cy ? -1 : 1) * overY;
          b.vy = (b.y < cy ? -1 : 1) * Math.abs(b.vy);
        }
        br.alive = false;
        state.broken += 1;
        state.sinceBreak = 0;
        guard();
        paint();
        break;
      }

      if (state.broken >= total) {
        state.over = true;
        api.note("The wall is open.", "good");
        api.win("THROUGH");
        return;
      }

      if (b.vy > 0 && b.y + B_R >= B_PAD_Y && b.y - B_R <= B_PAD_Y + B_PAD_H
          && Math.abs(b.x - state.x) <= paddleW / 2 + B_R) {
        const rel = clamp((b.x - state.x) / (paddleW / 2), -1, 1);
        let angle = -Math.PI / 2 + rel * (Math.PI * lean * 0.72);
        if (state.sinceBreak >= jitterAfter) {
          const aimed = aimAtSurvivor(b.x);
          if (aimed !== null) { angle = aimed; state.sinceBreak = 0; }
        }
        b.vx = Math.cos(angle) * b.speed;
        b.vy = Math.sin(angle) * b.speed;
        b.y = B_PAD_Y - B_R - 0.2;
        guard();
      }

      // Backstop for the case where the piece keeps coming back but the blocks
      // left are too few to be found: the wall itself leans a row closer.
      state.sinceBreak += dt;
      if (state.sinceBreak >= settleAfter && state.settles < maxSettles) {
        state.settles += 1;
        state.drop += B_ROW;
        state.sinceBreak = 0;
        api.note("The wall leans in.", "bad");
        field.wrap.classList.add("lean");
        setTimeout(() => field.wrap.classList.remove("lean"), 320);
      }

      if (b.y - B_R > BH) {
        state.life += 1;
        if (strike("You lost it.")) return;
        launch(state.life % 2 ? -1 : 1);
      }

      state.trail.push(b.x, b.y);
      if (state.trail.length > 16) state.trail.splice(0, state.trail.length - 16);
    };

    const draw = () => {
      field.fit();
      const s = field.scale();
      g.setTransform(s, 0, 0, s, 0, 0);
      g.clearRect(0, 0, BW, BH);
      g.fillStyle = col.deep;
      g.fillRect(0, 0, BW, BH);

      g.strokeStyle = col.line;
      g.globalAlpha = 0.45;
      g.lineWidth = 0.5;
      g.beginPath();
      g.moveTo(2, 2);
      g.lineTo(BW - 2, 2);
      g.moveTo(2, 2);
      g.lineTo(2, BH - 4);
      g.moveTo(BW - 2, 2);
      g.lineTo(BW - 2, BH - 4);
      g.stroke();
      g.globalAlpha = 1;

      bricks.forEach(br => {
        if (!br.alive) return;
        const y = br.y + state.drop;
        roundRect(g, br.x, y, br.w, br.h, 1.1);
        g.fillStyle = col.accent;
        g.globalAlpha = 0.1 + 0.06 * (rows - br.row);
        g.fill();
        g.globalAlpha = 0.7;
        g.strokeStyle = col.accent;
        g.lineWidth = 0.6;
        g.stroke();
      });
      g.globalAlpha = 1;

      g.strokeStyle = col.accent;
      g.lineCap = "round";
      for (let i = 2; i < state.trail.length; i += 2) {
        g.globalAlpha = 0.06 + 0.18 * (i / state.trail.length);
        g.lineWidth = 1.4;
        g.beginPath();
        g.moveTo(state.trail[i - 2], state.trail[i - 1]);
        g.lineTo(state.trail[i], state.trail[i + 1]);
        g.stroke();
      }
      g.lineCap = "butt";
      g.globalAlpha = 1;

      g.fillStyle = col.ink;
      g.beginPath();
      g.arc(state.ball.x, state.ball.y, B_R, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 0.22;
      g.fillStyle = col.accent;
      g.beginPath();
      g.arc(state.ball.x, state.ball.y, B_R * 2.1, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;

      g.globalAlpha = 0.3;
      g.strokeStyle = col.bad;
      g.lineWidth = 0.6;
      g.setLineDash([3, 3]);
      g.beginPath();
      g.moveTo(3, BH - 3);
      g.lineTo(BW - 3, BH - 3);
      g.stroke();
      g.setLineDash([]);
      g.globalAlpha = 1;

      roundRect(g, state.x - paddleW / 2, B_PAD_Y, paddleW, B_PAD_H, 1.8);
      g.fillStyle = state.flash > 0 ? col.bad : col.accent;
      g.globalAlpha = 0.85;
      g.fill();
      g.globalAlpha = 0.3;
      roundRect(g, state.x - paddleW / 2 - 1.4, B_PAD_Y - 1.4, paddleW + 2.8, B_PAD_H + 2.8, 2.4);
      g.strokeStyle = state.flash > 0 ? col.bad : col.accent;
      g.lineWidth = 0.6;
      g.stroke();
      g.globalAlpha = 1;

      if (!state.started) {
        g.globalAlpha = 0.5;
        g.fillStyle = col.dim;
        g.font = "5px system-ui, sans-serif";
        g.textAlign = "center";
        g.fillText("drag anywhere", BW / 2, BH - 6);
        g.globalAlpha = 1;
      }
    };

    runLoop(api, state, sim, draw);
  }

  /* ------------------------------------------------------------------ *
   * Registration
   * ------------------------------------------------------------------ */

  function install() {
    const hub = window.HubPuzzles;
    if (!hub || typeof hub.register !== "function") return false;
    hub.register("swarm_line", {
      pool: "threat",
      label: "Keep it off the line",
      generate: (seed, tune, ctx) => genSwarmLine(seed, tune, ctx && ctx.threat),
      render: renderSwarmLine,
    });
    hub.register("breach_wall", {
      pool: "location",
      label: "Knock the wall out",
      generate: (seed, tune, ctx) => genBreachWall(seed, tune, ctx && ctx.location),
      render: renderBreachWall,
    });
    return true;
  }

  if (!install()) {
    let tries = 0;
    const wait = setInterval(() => {
      tries += 1;
      if (install() || tries > 40) clearInterval(wait);
      if (tries > 40) console.warn("[pack-volley] HubPuzzles.register never appeared");
    }, 50);
  }
})();
