(function () {
  "use strict";

  const MARKS = ["◆", "▲", "●", "■", "✦", "✕"];
  const CARD_VERSION = "3";

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

  // Mastermind scoring, kept pure so js/puzzles/test-lock.mjs can hammer it.
  // Pass one takes the positional hits out of both sides; pass two counts the
  // multiset intersection of what is left, so one answer mark can never pay out
  // twice and a mark missing from the answer is worth nothing.
  function scoreLock(guess, answer) {
    const slots = Math.min(guess.length, answer.length);
    let exact = 0;
    const leftGuess = [];
    const leftAnswer = [];
    for (let i = 0; i < slots; i += 1) {
      if (guess[i] === answer[i]) exact += 1;
      else { leftGuess.push(guess[i]); leftAnswer.push(answer[i]); }
    }
    let near = 0;
    leftAnswer.forEach(mark => {
      const at = leftGuess.indexOf(mark);
      if (at >= 0) { leftGuess.splice(at, 1); near += 1; }
    });
    return { exact, near };
  }

  const pick = (list, rng) => list[Math.floor(rng() * list.length)];
  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
  const rangeInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

  // Difficulty is a real dial here: every puzzle reads its own block, so
  // "hard" changes board size, tolerance and strike budget, not just the clock.
  const TUNING = {
    easy: {
      seconds: 60, strikes: 3,
      tiles: { grid: 3, scramble: 5, moves: 16 },
      mirror: { grid: 3, wrong: 1, subtle: false },
      steady: { bends: 2, width: 17, strikes: 3 },
      lock: { slots: 3, marks: 4, attempts: 6, seconds: 55 },
      echo: { rounds: 3, start: 2, speed: 580 },
      hold: { passes: 2, span: 20, hold: [8, 10], air: 100, drain: 12, refill: 30, grace: 7 },
      watch: { slots: 6, catches: 4, window: 1600, misses: 3, overlap: false },
      face: { peak: 0.7, size: 0.34, tolerance: 0.2, strikes: 4 },
    },
    medium: {
      seconds: 45, strikes: 3,
      tiles: { grid: 3, scramble: 12, moves: 18 },
      mirror: { grid: 3, wrong: 2, subtle: false },
      steady: { bends: 3, width: 13, strikes: 3 },
      lock: { slots: 3, marks: 5, attempts: 5, seconds: 50 },
      echo: { rounds: 4, start: 3, speed: 460 },
      hold: { passes: 3, span: 26, hold: [8, 11], air: 100, drain: 14, refill: 28, grace: 5 },
      watch: { slots: 6, catches: 5, window: 1100, misses: 3, overlap: false },
      face: { peak: 0.58, size: 0.29, tolerance: 0.16, strikes: 3 },
    },
    hard: {
      seconds: 36, strikes: 2,
      tiles: { grid: 4, scramble: 14, moves: 22 },
      mirror: { grid: 4, wrong: 3, subtle: true },
      steady: { bends: 4, width: 10, strikes: 2 },
      lock: { slots: 3, marks: 6, attempts: 5, seconds: 45 },
      echo: { rounds: 5, start: 3, speed: 360 },
      hold: { passes: 4, span: 33, hold: [9, 13], air: 95, drain: 16, refill: 26, grace: 4 },
      watch: { slots: 9, catches: 6, window: 820, misses: 2, overlap: true },
      face: { peak: 0.44, size: 0.23, tolerance: 0.125, strikes: 3 },
    },
  };

  const tuningFor = id => TUNING[id] || TUNING.medium;

  function normaliseImage(value) {
    if (!value) return null;
    if (typeof value === "string") return { src: value, label: "" };
    if (!value.src) return null;
    return { src: String(value.src), label: value.label ? String(value.label) : "" };
  }

  function imageChoicesFromContext(ctx) {
    const choices = Array.isArray(ctx && ctx.imageChoices) ? ctx.imageChoices : [];
    return choices.map(normaliseImage).filter(Boolean);
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

  /* ------------------------------------------------------------------ *
   * Generators. Everything below returns plain JSON-safe data so that a
   * challenge can sit in localStorage across a reload.
   * ------------------------------------------------------------------ */

  function genImageTiles(seed, image, tune, location) {
    const t = tune.tiles;
    return {
      type: "image_tiles",
      title: "What It Looked Like",
      kicker: location ? String(location) : "recall",
      prompt: `Your picture of ${theLocation(location)} has come apart. Swap the pieces back into place.`,
      image,
      grid: t.grid,
      scramble: t.scramble,
      moves: t.moves,
      seconds: tune.seconds,
      seed: `${seed}:tiles`,
    };
  }

  function genMirrorCheck(seed, image, tune, location) {
    const t = tune.mirror;
    const rng = rngFromSeed(`${seed}:mirror`);
    const count = t.grid * t.grid;
    const wrong = shuffle(Array.from({ length: count }, (_, i) => i), rng)
      .slice(0, t.wrong)
      .map(index => ({ index, mode: t.subtle && rng() < 0.6 ? "turn" : "flip" }));
    return {
      type: "mirror_check",
      title: "Turned Around",
      kicker: location ? String(location) : "look again",
      prompt: `Parts of ${theLocation(location)} are facing the wrong way. Tap only the pieces that are wrong.`,
      image,
      grid: t.grid,
      wrong,
      strikes: tune.strikes,
      seconds: tune.seconds,
      seed: `${seed}:mirror`,
    };
  }

  function genSteadyHand(seed, tune, location) {
    const t = tune.steady;
    const rng = rngFromSeed(`${seed}:steady`);
    const points = [[50, 132]];
    let side = rng() < 0.5 ? -1 : 1;
    for (let i = 1; i <= t.bends; i += 1) {
      const y = 132 - (124 / (t.bends + 1)) * i;
      const spread = 22 + rng() * 12;
      points.push([clamp(50 + side * spread, 16, 84), Math.round(y)]);
      side *= -1;
    }
    points.push([50, 8]);
    return {
      type: "steady_hand",
      title: "Steady Hand",
      kicker: location ? String(location) : "do not shake",
      prompt: `Draw the line through ${theLocation(location)} without touching the walls. Slow is fine. Shaking is not.`,
      path: points.map(p => [Math.round(p[0]), Math.round(p[1])]),
      width: t.width,
      strikes: t.strikes,
      seconds: tune.seconds,
      seed: `${seed}:steady`,
    };
  }

  function genLockDeduce(seed, tune, location) {
    const t = tune.lock;
    const rng = rngFromSeed(`${seed}:lock`);
    const marks = shuffle(MARKS, rng).slice(0, t.marks);
    const answer = shuffle(marks, rngFromSeed(`${seed}:lock:answer`)).slice(0, t.slots);
    return {
      type: "lock_deduce",
      title: "The Cold Lock",
      kicker: location ? String(location) : "guess and listen",
      prompt: `${sentenceCase(theLocation(location))} will not tell you the order. Try a set; it only says how close you were.`,
      marks,
      slots: t.slots,
      answer,
      attempts: t.attempts,
      // Deduction needs more clock per attempt than the reflex puzzles do.
      seconds: t.seconds || tune.seconds,
      seed: `${seed}:lock`,
    };
  }

  function genSignalEcho(seed, tune, threat) {
    const t = tune.echo;
    const rng = rngFromSeed(`${seed}:echo`);
    const length = t.start + t.rounds - 1;
    return {
      type: "signal_echo",
      title: "It Repeats You",
      kicker: (threat && threat.label) || "listen",
      prompt: `${sentenceCase(theThreat(threat))} repeats what it hears. Answer back exactly, or it keeps talking.`,
      whisper: (threat && threat.clue) || "",
      sequence: Array.from({ length }, () => Math.floor(rng() * 4)),
      rounds: t.rounds,
      start: t.start,
      speed: t.speed,
      strikes: tune.strikes,
      seconds: tune.seconds,
      seed: `${seed}:echo`,
    };
  }

  function genHoldStill(seed, tune, threat) {
    const t = tune.hold;
    const rng = rngFromSeed(`${seed}:hold`);
    // A proximity curve built from spaced bumps: each bump is short enough
    // to hold through, each gap is long enough to breathe back.
    const ticks = t.span * 10;
    const samples = new Array(ticks).fill(0.08);
    const span = Array.isArray(t.hold) ? t.hold : [8, 11];
    const slot = Math.floor(ticks / (t.passes + 1));
    for (let i = 0; i < t.passes; i += 1) {
      const centre = slot * (i + 1) + Math.floor((rng() - 0.5) * slot * 0.32);
      const half = span[0] + Math.floor(rng() * (span[1] - span[0] + 1));
      const ramp = 11;
      for (let k = -half - ramp; k <= half + ramp; k += 1) {
        const index = centre + k;
        if (index < 0 || index >= ticks) continue;
        const away = Math.max(0, Math.abs(k) - half);
        const value = away === 0 ? 1 : Math.max(0, 1 - away / ramp);
        samples[index] = Math.max(samples[index], 0.08 + value * 0.9);
      }
    }
    return {
      type: "hold_still",
      title: "Hold Your Breath",
      kicker: (threat && threat.label) || "it is listening",
      prompt: `Hold while ${theThreat(threat)} is close. Breathe when it moves off — but never while it can hear you.`,
      whisper: (threat && threat.clue) || "",
      samples: samples.map(v => Math.round(v * 100) / 100),
      threshold: 0.5,
      air: t.air,
      drain: t.drain,
      refill: t.refill,
      grace: t.grace,
      seconds: t.span + 14,
      seed: `${seed}:hold`,
    };
  }

  function genDontLook(seed, tune, threat) {
    const t = tune.watch;
    const rng = rngFromSeed(`${seed}:watch`);
    const events = [];
    let at = 900;
    let last = -1;
    for (let i = 0; i < t.catches; i += 1) {
      let slot = Math.floor(rng() * t.slots);
      if (slot === last) slot = (slot + 1) % t.slots;
      last = slot;
      events.push({ slot, at, dur: t.window });
      at += t.overlap && rng() < 0.45
        ? Math.round(t.window * 0.55)
        : t.window + rangeInt(rng, 260, 620);
    }
    return {
      type: "dont_look",
      title: "Keep Watch",
      kicker: (threat && threat.label) || "movement",
      prompt: `${sentenceCase(theThreat(threat))} moves between the openings. Tap it the instant it shows — and tap nothing else.`,
      whisper: (threat && threat.clue) || "",
      slots: t.slots,
      events,
      required: t.catches,
      strikes: t.misses,
      seconds: Math.max(tune.seconds, Math.ceil(at / 1000) + 8),
      seed: `${seed}:watch`,
    };
  }

  function genFindTheFace(seed, image, tune, threat) {
    const t = tune.face;
    const rng = rngFromSeed(`${seed}:face`);
    // Same anatomy every time — lit mass, two sockets, a mouth — with seeded
    // proportions, so no two runs draw the same head and all of them read as
    // a head.
    const face = {
      tilt: Math.round((rng() * 11 - 5.5) * 10) / 10,
      squash: Math.round((0.72 + rng() * 0.12) * 100) / 100,
      gap: Math.round((0.19 + rng() * 0.05) * 100) / 100,
      eyeY: Math.round((0.38 + rng() * 0.07) * 100) / 100,
      eye: Math.round((0.17 + rng() * 0.05) * 100) / 100,
      mouthY: Math.round((0.69 + rng() * 0.06) * 100) / 100,
      mouthW: Math.round((0.3 + rng() * 0.14) * 100) / 100,
      mouthH: Math.round((0.07 + rng() * 0.07) * 100) / 100,
    };
    return {
      type: "find_the_face",
      title: "It Is In The Picture",
      kicker: (threat && threat.label) || "somewhere here",
      prompt: `${sentenceCase(theThreat(threat))} is somewhere in this picture. Find it before it finishes finding you.`,
      whisper: (threat && threat.clue) || "",
      image,
      x: Math.round((0.21 + rng() * 0.58) * 100) / 100,
      y: Math.round((0.23 + rng() * 0.54) * 100) / 100,
      size: t.size,
      peak: t.peak,
      tolerance: t.tolerance,
      face,
      strikes: t.strikes,
      seconds: tune.seconds,
      seed: `${seed}:face`,
    };
  }

  /* ------------------------------------------------------------------ *
   * Registry. The 8 built-ins go through the same register() call a pack
   * file uses, so a pack loaded after this module joins the run pools and
   * the ?debug sample list without anything here knowing about it.
   * ------------------------------------------------------------------ */

  const REGISTRY = new Map();
  const POOLS = ["location", "threat", "both"];

  function register(type, def) {
    try {
      if (typeof type !== "string" || !type.trim()) throw new Error("type must be a non-empty string");
      if (REGISTRY.has(type)) throw new Error(`"${type}" is already registered`);
      if (!def || typeof def !== "object") throw new Error(`"${type}" needs a definition object`);
      if (!POOLS.includes(def.pool)) throw new Error(`"${type}" needs pool "location", "threat" or "both"`);
      if (typeof def.generate !== "function") throw new Error(`"${type}" needs generate(seed, tune, ctx)`);
      if (typeof def.render !== "function") throw new Error(`"${type}" needs render(puzzle, api)`);
      REGISTRY.set(type, {
        type,
        pool: def.pool,
        label: String(def.label || type),
        needsImage: !!def.needsImage,
        generate: def.generate,
        render: def.render,
      });
      return true;
    } catch (err) {
      console.error("[HubPuzzles.register]", (err && err.message) || err);
      return false;
    }
  }

  const renderFor = type => {
    const def = REGISTRY.get(type);
    return def ? def.render : null;
  };

  function poolFor(kind, hasImage) {
    const out = [];
    REGISTRY.forEach(def => {
      if (def.pool !== kind && def.pool !== "both") return;
      if (def.needsImage && !hasImage) return;
      out.push(def);
    });
    return out;
  }

  // Descriptors have to survive JSON in localStorage, so the round trip is the
  // contract, not a nicety. A pack that throws or hands back something odd is
  // dropped rather than allowed to cost the player a turn.
  function buildDescriptor(def, seed, tune, genCtx) {
    try {
      const made = def.generate(seed, tune, genCtx);
      if (!made || typeof made !== "object") throw new Error("generate() returned no descriptor");
      const plain = JSON.parse(JSON.stringify(made));
      if (!plain.type) plain.type = def.type;
      if (plain.type !== def.type) throw new Error(`generate() returned type "${plain.type}"`);
      return plain;
    } catch (err) {
      console.error(`[HubPuzzles] ${def.type} could not generate`, err);
      return null;
    }
  }

  /* ------------------------------------------------------------------ *
   * Run challenges
   * ------------------------------------------------------------------ */

  function buildTask(kind, slot, kindSeed, baseSeed, tune, ctx, extra) {
    const images = imageChoicesFromContext(ctx);
    const image = images.length ? pick(images, rngFromSeed(`${baseSeed}:${slot}:image`)) : null;
    const rng = rngFromSeed(kindSeed);
    const genCtx = Object.assign({}, ctx, extra, { image });
    let candidates = poolFor(kind, !!image);
    while (candidates.length) {
      const index = Math.floor(rng() * candidates.length);
      const def = candidates[index];
      const challenge = buildDescriptor(def, `${baseSeed}:${slot}`, tune, genCtx);
      if (challenge) return { label: def.label, challenge };
      candidates = candidates.filter((_, i) => i !== index);
    }
    // Last resort if every registered type refused: the lock needs nothing.
    return { label: "Work out the lock", challenge: genLockDeduce(`${baseSeed}:${slot}`, tune, extra.location) };
  }

  function locationChallenge(location, baseSeed, tune, ctx) {
    const where = sentenceCase(theLocation(location));
    const made = buildTask("location", "location", `${baseSeed}:location:kind`, baseSeed, tune, ctx,
      { location, threat: ctx.threat || {} });
    made.successText = `${where} holds still long enough to let you through. You lose no time.`;
    made.failText = `${where} refuses to line up, and the delay costs you a turn.`;
    return made;
  }

  function monsterChallenge(threat, baseSeed, tune, ctx) {
    const name = theThreat(threat);
    const made = buildTask("threat", "monster", `${baseSeed}:monster:kind:${(threat && threat.id) || "x"}`,
      baseSeed, tune, ctx, { threat, location: ctx.location || ctx.facility || "this place" });
    made.successText = `You get it right. For a while ${name} is somewhere else, and you keep the time you had.`;
    made.failText = `You get it wrong. ${sentenceCase(name)} is nearer than it was, and the mistake costs you a turn.`;
    return made;
  }

  function createChallengeGroups(ctx) {
    const context = ctx || {};
    const gameId = context.gameId || "game";
    const tune = tuningFor(context.difficultyId);
    const location = context.location || context.facility || "this place";
    const threat = context.threat || {};
    const baseSeed = context.runKey || `${gameId}:${Date.now()}`;
    const locationTask = locationChallenge(location, baseSeed, tune, context);
    const monsterTask = monsterChallenge(threat, baseSeed, tune, context);
    return [
      {
        id: "challenge_location",
        mandatory: true,
        label: "Location challenge",
        goalText: `Challenge: get past whatever ${theLocation(location)} is doing to your memory.`,
        steps: [{
          id: "solve_location_challenge",
          label: `Challenge: ${locationTask.label}`,
          roomKind: "any",
          provides: "challenge_location_solved",
          challenge: locationTask.challenge,
          successText: locationTask.successText,
          failText: locationTask.failText,
        }],
      },
      {
        id: "challenge_monster",
        mandatory: true,
        label: "Monster challenge",
        goalText: `Challenge: get one round ahead of ${theThreat(threat)}.`,
        steps: [{
          id: "solve_monster_challenge",
          label: `Challenge: ${monsterTask.label}`,
          roomKind: "any",
          provides: "challenge_monster_solved",
          challenge: monsterTask.challenge,
          successText: monsterTask.successText,
          failText: monsterTask.failText,
        }],
      },
    ];
  }

  function samplePuzzles(ctx = {}) {
    const images = imageChoicesFromContext(ctx);
    const image = images[0] || { src: "images/hallway.jpg", label: "Hallway" };
    const other = images[1] || image;
    const tune = tuningFor(ctx.difficultyId);
    const location = ctx.location || "this place";
    const threat = ctx.threat && ctx.threat.name ? ctx.threat : {
      id: "sample", name: "the presence", label: "presence detected",
      clue: "It has been in every room you have already left.",
    };
    // Everything registered shows up here, so a pack appears in ?debug with
    // no wiring: the sample always gets a still, whatever the host passed in.
    const out = [];
    let n = 0;
    REGISTRY.forEach(def => {
      n += 1;
      const genCtx = Object.assign({}, ctx, {
        location, threat, image: n % 2 ? image : other, imageChoices: [image, other],
      });
      const puzzle = buildDescriptor(def, `sample:${def.type}`, tune, genCtx);
      if (puzzle) out.push({ id: def.type, label: def.label, puzzle });
    });
    return out;
  }

  // Runs saved before this rewrite still hold retired descriptors. Rather
  // than handing the player an empty board that always costs a turn, swap
  // in a live puzzle seeded from the same data.
  const LEGACY = {
    code: "lock_deduce", code_order: "lock_deduce", symbol_equation: "lock_deduce",
    dial_align: "lock_deduce", word_order: "lock_deduce",
    sequence_repeat: "signal_echo", memory_grid: "signal_echo", pressure_order: "signal_echo",
    wire_match: "steady_hand", merge_2048: "steady_hand",
    spot_difference: "mirror_check",
  };

  function migrateLegacy(puzzle) {
    const target = LEGACY[puzzle.type];
    if (!target) return null;
    const seconds = Number(puzzle.seconds) || 45;
    const id = seconds >= 55 ? "easy" : (seconds <= 34 ? "hard" : "medium");
    const tune = tuningFor(id);
    const seed = puzzle.seed || puzzle.type;
    const image = normaliseImage(puzzle.image);
    if (target === "mirror_check" && image) return genMirrorCheck(seed, image, tune, "");
    if (target === "signal_echo") return genSignalEcho(seed, tune, {});
    if (target === "steady_hand") return genSteadyHand(seed, tune, "");
    return genLockDeduce(seed, tune, "");
  }

  /* ------------------------------------------------------------------ *
   * Shell
   * ------------------------------------------------------------------ */

  function ensureModal() {
    let modal = document.getElementById("puzzle-overlay");
    if (modal && modal.dataset.v === CARD_VERSION) return modal;
    if (modal) modal.remove();
    modal = document.createElement("aside");
    modal.id = "puzzle-overlay";
    modal.className = "puzzle-overlay";
    modal.dataset.v = CARD_VERSION;
    modal.innerHTML = `
      <div class="puzzle-card" role="dialog" aria-modal="true" aria-labelledby="puzzle-title">
        <div class="pz-grain" aria-hidden="true"></div>
        <div class="puzzle-head">
          <div class="pz-heading">
            <p class="puzzle-kicker" id="puzzle-kicker"></p>
            <h2 id="puzzle-title"></h2>
          </div>
          <div class="puzzle-timer" id="puzzle-timer" style="--p:1"><span id="puzzle-timer-num">0</span></div>
        </div>
        <p id="puzzle-prompt" class="puzzle-prompt"></p>
        <p id="puzzle-whisper" class="pz-whisper"></p>
        <div id="puzzle-strikes" class="pz-strikes" aria-live="polite"></div>
        <div id="puzzle-body" class="puzzle-body"></div>
        <div id="puzzle-feedback" class="puzzle-feedback" aria-live="polite"></div>
        <div class="puzzle-actions">
          <button id="puzzle-submit" class="glass-button primary" type="button">Submit</button>
          <button id="puzzle-cancel" class="glass-button quiet" type="button">Back out</button>
        </div>
        <div id="puzzle-result" class="pz-result" aria-hidden="true"><span></span></div>
      </div>
    `;
    document.body.append(modal);
    return modal;
  }

  function start(puzzle) {
    let spec = puzzle;
    if (!spec || !spec.type) return Promise.resolve({ success: false, reason: "missing", noPenalty: true });
    if (!renderFor(spec.type)) {
      const migrated = migrateLegacy(spec);
      if (!migrated) return Promise.resolve({ success: false, reason: "unsupported", noPenalty: true });
      spec = migrated;
    }

    const modal = ensureModal();
    const card = modal.querySelector(".puzzle-card");
    const title = modal.querySelector("#puzzle-title");
    const kicker = modal.querySelector("#puzzle-kicker");
    const prompt = modal.querySelector("#puzzle-prompt");
    const whisper = modal.querySelector("#puzzle-whisper");
    const strikeRow = modal.querySelector("#puzzle-strikes");
    const body = modal.querySelector("#puzzle-body");
    const timerEl = modal.querySelector("#puzzle-timer");
    const timerNum = modal.querySelector("#puzzle-timer-num");
    const feedback = modal.querySelector("#puzzle-feedback");
    const submit = modal.querySelector("#puzzle-submit");
    const cancel = modal.querySelector("#puzzle-cancel");
    const result = modal.querySelector("#puzzle-result");

    card.className = "puzzle-card";
    card.dataset.type = spec.type;
    title.textContent = spec.title || "Challenge";
    kicker.textContent = spec.kicker || "challenge task";
    prompt.textContent = spec.prompt || "";
    whisper.textContent = spec.whisper || "";
    whisper.hidden = !spec.whisper;
    feedback.textContent = "";
    feedback.className = "puzzle-feedback";
    body.innerHTML = "";
    body.className = "puzzle-body";
    result.className = "pz-result";
    result.firstElementChild.textContent = "";
    submit.disabled = false;
    submit.hidden = true;
    submit.textContent = "Submit";

    const total = Math.max(10, Number(spec.seconds) || 45);
    let strikesLeft = Math.max(0, Number(spec.strikes) || 0);
    const strikeMax = strikesLeft;

    const drawStrikes = () => {
      if (!strikeMax) { strikeRow.hidden = true; return; }
      strikeRow.hidden = false;
      strikeRow.innerHTML = "";
      for (let i = 0; i < strikeMax; i += 1) {
        const pip = document.createElement("i");
        pip.className = i < strikesLeft ? "pz-pip" : "pz-pip out";
        strikeRow.append(pip);
      }
      const label = document.createElement("span");
      label.textContent = strikesLeft > 0 ? `${strikesLeft} left` : "no room left";
      strikeRow.append(label);
    };
    drawStrikes();

    return new Promise(resolve => {
      let done = false;
      let raf = 0;
      let last = performance.now();
      let elapsed = 0;
      let drain = 1;
      const teardowns = [];

      const settle = (outcome, word, reason) => {
        if (done) return;
        done = true;
        cancelAnimationFrame(raf);
        teardowns.forEach(fn => { try { fn(); } catch (err) { /* ignore */ } });
        submit.removeEventListener("click", onSubmit);
        cancel.removeEventListener("click", onCancel);
        body.classList.add("pz-locked");
        if (outcome === "cancel") {
          modal.classList.remove("open");
          resolve({ success: false, reason: "cancelled", noPenalty: true });
          return;
        }
        result.className = `pz-result show ${outcome === "win" ? "win" : "fail"}`;
        result.firstElementChild.textContent = word;
        card.classList.add(outcome === "win" ? "pz-win" : "pz-fail");
        setTimeout(() => {
          modal.classList.remove("open");
          resolve(outcome === "win"
            ? { success: true, reason: "solved" }
            : { success: false, reason: reason || "failed" });
        }, outcome === "win" ? 760 : 900);
      };

      const api = {
        body,
        win: word => settle("win", word || "CLEAR"),
        lose: (word, reason) => settle("fail", word || "FAILED", reason || "failed"),
        note: (text, tone) => {
          feedback.textContent = text || "";
          feedback.className = `puzzle-feedback${tone ? ` ${tone}` : ""}`;
        },
        shake: () => {
          card.classList.remove("pz-shake");
          void card.offsetWidth;
          card.classList.add("pz-shake");
        },
        strike: (text) => {
          api.shake();
          if (text) api.note(text, "bad");
          if (!strikeMax) return 0;
          strikesLeft = Math.max(0, strikesLeft - 1);
          drawStrikes();
          if (strikesLeft <= 0) settle("fail", "TOO MANY", "strikes");
          return strikesLeft;
        },
        strikesLeft: () => strikesLeft,
        setDrain: value => { drain = Math.max(0, Number(value) || 0); },
        timeFraction: () => clamp(1 - elapsed / (total * 1000), 0, 1),
        teardown: fn => teardowns.push(fn),
        setSubmit: (label, handler) => {
          submit.hidden = false;
          submit.textContent = label;
          submitHandler = handler;
        },
      };

      let submitHandler = null;
      const onSubmit = () => { if (submitHandler) submitHandler(); };
      const onCancel = () => settle("cancel");
      submit.addEventListener("click", onSubmit);
      cancel.addEventListener("click", onCancel);

      try {
        renderFor(spec.type)(spec, api);
      } catch (err) {
        settle("cancel");
        return;
      }

      const frame = now => {
        const dt = Math.min(250, now - last);
        last = now;
        elapsed += dt * drain;
        const left = Math.max(0, total * 1000 - elapsed);
        const frac = left / (total * 1000);
        timerEl.style.setProperty("--p", String(frac));
        timerNum.textContent = String(Math.ceil(left / 1000));
        timerEl.classList.toggle("warn", frac <= 0.4 && frac > 0.18);
        timerEl.classList.toggle("hot", frac <= 0.18);
        card.classList.toggle("pz-panic", frac <= 0.18);
        if (left <= 0) { settle("fail", "TOO SLOW", "timeout"); return; }
        raf = requestAnimationFrame(frame);
      };
      modal.classList.add("open");
      last = performance.now();
      raf = requestAnimationFrame(frame);
    });
  }

  /* ------------------------------------------------------------------ *
   * Renderers
   * ------------------------------------------------------------------ */

  function imageSrc(puzzle) {
    const image = normaliseImage(puzzle.image);
    return (image && image.src) || "images/hallway.jpg";
  }

  function tileBackground(el, src, grid, index) {
    const x = index % grid;
    const y = Math.floor(index / grid);
    el.style.backgroundImage = `url("${src}")`;
    el.style.backgroundSize = `${grid * 100}% ${grid * 100}%`;
    el.style.backgroundPosition = `${(x / (grid - 1)) * 100}% ${(y / (grid - 1)) * 100}%`;
  }

  const RENDERERS = {};

  RENDERERS.image_tiles = function (puzzle, api) {
    const grid = clamp(Number(puzzle.grid) || 3, 2, 4);
    const count = grid * grid;
    const src = imageSrc(puzzle);
    const rng = rngFromSeed(`${puzzle.seed || src}:tiles`);
    const order = Array.from({ length: count }, (_, i) => i);
    for (let i = 0; i < (Number(puzzle.scramble) || 8); i += 1) {
      const a = Math.floor(rng() * count);
      let b = Math.floor(rng() * count);
      if (a === b) b = (b + 1) % count;
      [order[a], order[b]] = [order[b], order[a]];
    }
    if (order.every((v, i) => v === i)) [order[0], order[1]] = [order[1], order[0]];

    let moves = Number(puzzle.moves) || 18;
    let selected = -1;

    api.body.innerHTML = `
      <div class="pz-tilewrap">
        <div class="pz-tiles" style="--g:${grid}"></div>
        <div class="pz-peek" aria-hidden="true"></div>
      </div>
      <div class="pz-bar">
        <span class="pz-count"></span>
        <button class="pz-mini pz-peekbtn" type="button">hold to remember</button>
      </div>`;
    const gridEl = api.body.querySelector(".pz-tiles");
    const peek = api.body.querySelector(".pz-peek");
    const peekBtn = api.body.querySelector(".pz-peekbtn");
    const countEl = api.body.querySelector(".pz-count");
    peek.style.backgroundImage = `url("${src}")`;

    const tiles = [];
    for (let i = 0; i < count; i += 1) {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "pz-tile";
      tile.setAttribute("aria-label", `Piece ${i + 1}`);
      gridEl.append(tile);
      tiles.push(tile);
    }

    const paint = () => {
      order.forEach((value, index) => {
        const tile = tiles[index];
        tileBackground(tile, src, grid, value);
        tile.classList.toggle("sel", selected === index);
        tile.classList.toggle("set", value === index);
      });
      countEl.textContent = `${moves} swap${moves === 1 ? "" : "s"} left`;
      countEl.classList.toggle("low", moves <= 3);
    };

    tiles.forEach((tile, index) => {
      tile.addEventListener("click", () => {
        if (selected < 0) { selected = index; paint(); return; }
        if (selected === index) { selected = -1; paint(); return; }
        [order[selected], order[index]] = [order[index], order[selected]];
        tiles[selected].classList.add("pop");
        tile.classList.add("pop");
        setTimeout(() => { tiles.forEach(t => t.classList.remove("pop")); }, 240);
        selected = -1;
        moves -= 1;
        paint();
        if (order.every((v, i) => v === i)) { api.note("It matches.", "good"); api.win("RESTORED"); return; }
        if (moves <= 0) api.lose("LOST IT", "moves");
      });
    });

    const holdOn = () => { peek.classList.add("show"); api.setDrain(3); };
    const holdOff = () => { peek.classList.remove("show"); api.setDrain(1); };
    peekBtn.addEventListener("pointerdown", holdOn);
    ["pointerup", "pointerleave", "pointercancel"].forEach(ev => peekBtn.addEventListener(ev, holdOff));
    api.teardown(holdOff);
    paint();
  };

  RENDERERS.mirror_check = function (puzzle, api) {
    const grid = clamp(Number(puzzle.grid) || 3, 2, 4);
    const count = grid * grid;
    const src = imageSrc(puzzle);
    const wrong = new Map((Array.isArray(puzzle.wrong) ? puzzle.wrong : [])
      .filter(item => item && item.index >= 0 && item.index < count)
      .map(item => [item.index, item.mode === "turn" ? "turn" : "flip"]));
    if (!wrong.size) wrong.set(0, "flip");
    let found = 0;

    api.body.innerHTML = `
      <div class="pz-tiles pz-mirror" style="--g:${grid}"></div>
      <div class="pz-bar"><span class="pz-count"></span></div>`;
    const gridEl = api.body.querySelector(".pz-tiles");
    const countEl = api.body.querySelector(".pz-count");
    const update = () => { countEl.textContent = `${wrong.size - found} of ${wrong.size} still wrong`; };

    for (let i = 0; i < count; i += 1) {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "pz-tile";
      tile.setAttribute("aria-label", `Piece ${i + 1}`);
      tileBackground(tile, src, grid, i);
      if (wrong.has(i)) tile.classList.add(wrong.get(i) === "turn" ? "turned" : "flipped");
      tile.addEventListener("click", () => {
        if (tile.classList.contains("done")) return;
        if (wrong.has(i)) {
          tile.classList.remove("flipped", "turned");
          tile.classList.add("done", "right");
          found += 1;
          update();
          api.note("That one was backwards.", "good");
          if (found >= wrong.size) api.win("SEEN");
        } else {
          tile.classList.add("done", "wrongpick");
          tile.disabled = true;
          api.strike("That one was fine.");
        }
      });
      gridEl.append(tile);
    }
    update();
  };

  RENDERERS.steady_hand = function (puzzle, api) {
    const path = (Array.isArray(puzzle.path) && puzzle.path.length > 1)
      ? puzzle.path.map(p => [Number(p[0]) || 0, Number(p[1]) || 0])
      : [[50, 132], [50, 8]];
    const width = clamp(Number(puzzle.width) || 13, 6, 30);
    const half = width / 2;
    const d = path.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join(" ");
    const start = path[0];
    const end = path[path.length - 1];

    api.body.innerHTML = `
      <div class="pz-steady">
        <svg viewBox="0 0 100 140" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <path class="pz-wall" d="${d}" stroke-width="${width + 3.4}"></path>
          <path class="pz-lane" d="${d}" stroke-width="${width}"></path>
          <path class="pz-trace" d="${d}" stroke-width="${Math.max(2, width * 0.34)}"></path>
          <circle class="pz-goal" cx="${end[0]}" cy="${end[1]}" r="${half * 0.72}"></circle>
          <circle class="pz-start" cx="${start[0]}" cy="${start[1]}" r="${half * 0.8}"></circle>
          <circle class="pz-dot" cx="${start[0]}" cy="${start[1]}" r="${Math.max(2.4, half * 0.44)}"></circle>
        </svg>
        <div class="pz-bar"><span class="pz-count">press the lit end, then draw</span></div>
      </div>`;
    const wrap = api.body.querySelector(".pz-steady");
    const svg = wrap.querySelector("svg");
    const trace = wrap.querySelector(".pz-trace");
    const dot = wrap.querySelector(".pz-dot");
    const hint = wrap.querySelector(".pz-count");

    const segLengths = [];
    let totalLen = 0;
    for (let i = 1; i < path.length; i += 1) {
      const len = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
      segLengths.push(len);
      totalLen += len;
    }
    // Dash units are viewBox units, so the visible trace is exactly the
    // distance the pointer has covered along the polyline.
    trace.style.strokeDasharray = String(totalLen);
    trace.style.strokeDashoffset = String(totalLen);

    const toVb = event => {
      const rect = svg.getBoundingClientRect();
      return [((event.clientX - rect.left) / rect.width) * 100, ((event.clientY - rect.top) / rect.height) * 140];
    };

    // Nearest point on the polyline: gives both "am I inside" and progress.
    const project = (px, py) => {
      let best = { dist: Infinity, along: 0 };
      let acc = 0;
      for (let i = 1; i < path.length; i += 1) {
        const [ax, ay] = path[i - 1];
        const [bx, by] = path[i];
        const dx = bx - ax;
        const dy = by - ay;
        const len2 = dx * dx + dy * dy || 1;
        const t = clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
        const cx = ax + dx * t;
        const cy = ay + dy * t;
        const dist = Math.hypot(px - cx, py - cy);
        if (dist < best.dist) best = { dist, along: acc + segLengths[i - 1] * t };
        acc += segLengths[i - 1];
      }
      return best;
    };

    let active = false;
    let progress = 0;

    const reset = message => {
      active = false;
      progress = 0;
      dot.setAttribute("cx", String(start[0]));
      dot.setAttribute("cy", String(start[1]));
      wrap.classList.remove("live");
      trace.style.strokeDashoffset = String(totalLen);
      hint.textContent = message || "press the lit end, then draw";
    };

    const onDown = event => {
      const [x, y] = toVb(event);
      if (Math.hypot(x - start[0], y - start[1]) > half * 2.1) return;
      active = true;
      progress = 0;
      wrap.classList.add("live");
      hint.textContent = "do not touch the walls";
      svg.setPointerCapture(event.pointerId);
      event.preventDefault();
    };

    const onMove = event => {
      if (!active) return;
      event.preventDefault();
      const [x, y] = toVb(event);
      const near = project(x, y);
      dot.setAttribute("cx", String(clamp(x, 0, 100)));
      dot.setAttribute("cy", String(clamp(y, 0, 140)));
      if (near.dist > half) {
        wrap.classList.add("bad");
        setTimeout(() => wrap.classList.remove("bad"), 260);
        reset("you touched the wall");
        api.strike("You touched the wall.");
        return;
      }
      // The head of the line is the pointer's own projection, never a
      // high-water mark: pull back and the line pulls back with you.
      progress = near.along;
      trace.style.strokeDashoffset = String(totalLen - progress);
      if (progress >= totalLen - half * 0.6) {
        active = false;
        api.win("THROUGH");
      }
    };

    const onUp = () => { if (active) reset("you let go — start again"); };

    svg.addEventListener("pointerdown", onDown);
    svg.addEventListener("pointermove", onMove);
    svg.addEventListener("pointerup", onUp);
    svg.addEventListener("pointercancel", onUp);
    api.teardown(() => {
      svg.removeEventListener("pointerdown", onDown);
      svg.removeEventListener("pointermove", onMove);
      svg.removeEventListener("pointerup", onUp);
      svg.removeEventListener("pointercancel", onUp);
    });
  };

  RENDERERS.lock_deduce = function (puzzle, api) {
    const marks = (Array.isArray(puzzle.marks) && puzzle.marks.length ? puzzle.marks : MARKS).map(String);
    const answer = (Array.isArray(puzzle.answer) && puzzle.answer.length ? puzzle.answer : marks.slice(0, 3)).map(String);
    const slots = answer.length;
    let attempts = Math.max(1, Number(puzzle.attempts) || 5);
    const guess = answer.map((_, i) => marks[i % marks.length]);

    api.body.innerHTML = `
      <div class="pz-lock" style="--n:${slots}"></div>
      <div class="pz-bar"><span class="pz-count"></span></div>
      <div class="pz-tries"></div>
      <p class="pz-legend"><b>&#9679;</b> right mark, right slot &nbsp; <b>&#9675;</b> right mark, wrong slot${
        new Set(answer).size === answer.length ? "<br>no mark is used twice" : ""}</p>`;
    const lock = api.body.querySelector(".pz-lock");
    const countEl = api.body.querySelector(".pz-count");
    const tries = api.body.querySelector(".pz-tries");

    const dials = guess.map((value, index) => {
      const dial = document.createElement("button");
      dial.type = "button";
      dial.className = "pz-dial";
      dial.textContent = value;
      dial.setAttribute("aria-label", `Slot ${index + 1}`);
      dial.addEventListener("click", () => {
        const next = (marks.indexOf(guess[index]) + 1) % marks.length;
        guess[index] = marks[next];
        dial.textContent = guess[index];
        dial.classList.remove("spin");
        void dial.offsetWidth;
        dial.classList.add("spin");
      });
      lock.append(dial);
      return dial;
    });

    const update = () => { countEl.textContent = `${attempts} ${attempts === 1 ? "try" : "tries"} left`; countEl.classList.toggle("low", attempts <= 2); };
    update();

    api.setSubmit("Try it", () => {
      const { exact, near } = scoreLock(guess, answer);

      if (exact === slots) {
        dials.forEach(d => d.classList.add("open"));
        api.note("It gives.", "good");
        api.win("OPEN");
        return;
      }
      attempts -= 1;
      update();
      const row = document.createElement("div");
      row.className = "pz-try";
      row.innerHTML = `<span class="pz-tryset">${guess.join(" ")}</span>`
        + `<span class="pz-pips">${"●".repeat(exact)}${"○".repeat(near)}${exact + near === 0 ? "&mdash;" : ""}</span>`;
      tries.prepend(row);
      api.shake();
      api.note(exact ? `${exact} in the right slot.` : "Nothing in the right slot.", exact ? "" : "bad");
      if (attempts <= 0) api.lose("JAMMED", "attempts");
    });
  };

  RENDERERS.signal_echo = function (puzzle, api) {
    const full = (Array.isArray(puzzle.sequence) ? puzzle.sequence : [0, 1, 2, 3]).map(v => clamp(Number(v) || 0, 0, 3));
    const rounds = Math.max(1, Number(puzzle.rounds) || 3);
    const startLen = Math.max(1, Number(puzzle.start) || 2);
    const speed = clamp(Number(puzzle.speed) || 460, 180, 900);

    api.body.innerHTML = `
      <div class="pz-echo">
        ${[0, 1, 2, 3].map(i => `<button class="pz-pad p${i}" type="button" aria-label="Pad ${i + 1}"></button>`).join("")}
      </div>
      <div class="pz-bar"><span class="pz-count"></span></div>`;
    const pads = Array.from(api.body.querySelectorAll(".pz-pad"));
    const countEl = api.body.querySelector(".pz-count");

    let round = 0;
    let input = [];
    let playing = true;
    const timers = [];
    const later = (fn, ms) => { timers.push(setTimeout(fn, ms)); };
    api.teardown(() => timers.forEach(clearTimeout));

    const current = () => full.slice(0, startLen + round);

    const flash = (index, on) => pads[index].classList.toggle("lit", on);

    const play = () => {
      playing = true;
      api.body.classList.add("pz-listening");
      countEl.textContent = `round ${round + 1} of ${rounds} · listen`;
      const seq = current();
      seq.forEach((padIndex, i) => {
        later(() => flash(padIndex, true), speed * i + 260);
        later(() => flash(padIndex, false), speed * i + 260 + speed * 0.62);
      });
      later(() => {
        playing = false;
        input = [];
        api.body.classList.remove("pz-listening");
        countEl.textContent = `round ${round + 1} of ${rounds} · answer ${seq.length}`;
      }, speed * seq.length + 320);
    };

    pads.forEach((pad, index) => {
      pad.addEventListener("click", () => {
        if (playing) return;
        pad.classList.add("hit");
        setTimeout(() => pad.classList.remove("hit"), 190);
        input.push(index);
        const seq = current();
        const step = input.length - 1;
        if (input[step] !== seq[step]) {
          input = [];
          playing = true;
          api.strike("Not what it said.");
          if (api.strikesLeft() > 0) later(play, 620);
          return;
        }
        if (input.length === seq.length) {
          playing = true;
          round += 1;
          if (round >= rounds) { api.note("It goes quiet.", "good"); api.win("ANSWERED"); return; }
          api.note("It answers again.", "good");
          later(play, 720);
        }
      });
    });

    play();
  };

  RENDERERS.hold_still = function (puzzle, api) {
    const samples = (Array.isArray(puzzle.samples) && puzzle.samples.length ? puzzle.samples : [0.1, 0.9, 0.1])
      .map(v => clamp(Number(v) || 0, 0, 1));
    const threshold = clamp(Number(puzzle.threshold) || 0.5, 0.1, 0.95);
    const airMax = Math.max(30, Number(puzzle.air) || 100);
    const drain = Math.max(1, Number(puzzle.drain) || 15);
    const refill = Math.max(1, Number(puzzle.refill) || 26);
    let grace = Math.max(1, Number(puzzle.grace) || 5);
    const graceMax = grace;

    api.body.innerHTML = `
      <div class="pz-hold">
        <div class="pz-near"><i class="pz-nearfill"></i><i class="pz-nearmark" style="left:${threshold * 100}%"></i></div>
        <p class="pz-nearlabel">it is far off</p>
        <button class="pz-holdpad" type="button" aria-label="Hold your breath">
          <svg viewBox="0 0 100 100" aria-hidden="true"><circle class="pz-airtrack" cx="50" cy="50" r="44"></circle><circle class="pz-airfill" cx="50" cy="50" r="44"></circle></svg>
          <span>HOLD</span>
        </button>
        <div class="pz-bar"><span class="pz-count"></span></div>
      </div>`;
    const holdWrap = api.body.querySelector(".pz-hold");
    const nearFill = api.body.querySelector(".pz-nearfill");
    const nearLabel = api.body.querySelector(".pz-nearlabel");
    const pad = api.body.querySelector(".pz-holdpad");
    const airFill = api.body.querySelector(".pz-airfill");
    const countEl = api.body.querySelector(".pz-count");
    const circumference = 2 * Math.PI * 44;
    airFill.style.strokeDasharray = String(circumference);

    let holding = false;
    let air = airMax;
    let index = 0;
    let acc = 0;
    let last = performance.now();
    let raf = 0;

    const down = event => { holding = true; pad.classList.add("down"); if (event.preventDefault) event.preventDefault(); };
    const up = () => { holding = false; pad.classList.remove("down"); };
    pad.addEventListener("pointerdown", down);
    ["pointerup", "pointerleave", "pointercancel"].forEach(ev => pad.addEventListener(ev, up));

    const step = now => {
      const dt = Math.min(120, now - last);
      last = now;
      acc += dt;
      while (acc >= 100 && index < samples.length) { acc -= 100; index += 1; }
      if (index >= samples.length) { api.note("It has gone.", "good"); api.win("UNHEARD"); return; }

      const value = samples[index];
      const near = value >= threshold;
      nearFill.style.width = `${Math.round(value * 100)}%`;
      holdWrap.classList.toggle("near", near);
      nearLabel.textContent = near ? "IT IS RIGHT THERE" : (value > threshold * 0.55 ? "something is moving" : "it is far off");

      if (holding) air = Math.max(0, air - drain * (dt / 1000));
      else air = Math.min(airMax, air + refill * (dt / 1000));
      airFill.style.strokeDashoffset = String(circumference * (1 - air / airMax));
      airFill.classList.toggle("low", air < airMax * 0.25);

      if (holding && air <= 0) { api.lose("NO AIR", "air"); return; }
      if (near && !holding) {
        holdWrap.classList.add("caught");
        setTimeout(() => holdWrap.classList.remove("caught"), 200);
        grace -= 1;
        countEl.textContent = `heard ${graceMax - grace} of ${graceMax}`;
        if (grace <= 0) { api.lose("HEARD", "heard"); return; }
      } else {
        countEl.textContent = `${Math.max(0, Math.ceil((samples.length - index) / 10))}s until it passes`;
      }
      raf = requestAnimationFrame(step);
    };

    api.teardown(() => {
      cancelAnimationFrame(raf);
      pad.removeEventListener("pointerdown", down);
      ["pointerup", "pointerleave", "pointercancel"].forEach(ev => pad.removeEventListener(ev, up));
    });
    last = performance.now();
    raf = requestAnimationFrame(step);
  };

  RENDERERS.dont_look = function (puzzle, api) {
    const slots = clamp(Number(puzzle.slots) || 6, 4, 9);
    const cols = 3;
    const events = (Array.isArray(puzzle.events) ? puzzle.events : []).map(e => ({
      slot: clamp(Number(e.slot) || 0, 0, slots - 1),
      at: Math.max(0, Number(e.at) || 0),
      dur: Math.max(300, Number(e.dur) || 1200),
      state: "waiting",
    }));
    const required = Math.max(1, Number(puzzle.required) || events.length || 4);
    let caught = 0;

    api.body.innerHTML = `
      <div class="pz-watch" style="--c:${cols}">
        ${Array.from({ length: slots }, (_, i) => `<button class="pz-slot" type="button" aria-label="Opening ${i + 1}"><span class="pz-figure ${(puzzle.shape || "figure")}"></span></button>`).join("")}
      </div>
      <div class="pz-bar"><span class="pz-count"></span></div>`;
    const cells = Array.from(api.body.querySelectorAll(".pz-slot"));
    const countEl = api.body.querySelector(".pz-count");
    const update = () => { countEl.textContent = `${caught}/${required} caught`; };
    update();

    const startedAt = performance.now();
    let raf = 0;

    const missOne = (cell, text) => {
      if (cell) {
        cell.classList.remove("live");
        cell.classList.add("missed");
        setTimeout(() => cell.classList.remove("missed"), 420);
      }
      api.strike(text || "It moved on before you looked.");
    };

    cells.forEach((cell, index) => {
      cell.addEventListener("click", () => {
        const hit = events.find(e => e.slot === index && e.state === "live");
        if (hit) {
          hit.state = "caught";
          caught += 1;
          cell.classList.remove("live");
          cell.classList.add("got");
          setTimeout(() => cell.classList.remove("got"), 360);
          update();
          if (caught >= required) { api.note("You saw all of it.", "good"); api.win("WATCHED"); }
          return;
        }
        cell.classList.add("empty");
        setTimeout(() => cell.classList.remove("empty"), 300);
        missOne(null, "Nothing was there.");
      });
    });

    const step = now => {
      const t = now - startedAt;
      events.forEach(e => {
        if (e.state === "waiting" && t >= e.at) { e.state = "live"; cells[e.slot].classList.add("live"); }
        else if (e.state === "live" && t > e.at + e.dur) { e.state = "gone"; missOne(cells[e.slot]); }
      });
      if (events.every(e => e.state !== "waiting" && e.state !== "live") && caught < required) {
        api.lose("IT GOT PAST", "missed");
        return;
      }
      raf = requestAnimationFrame(step);
    };
    api.teardown(() => cancelAnimationFrame(raf));
    raf = requestAnimationFrame(step);
  };

  RENDERERS.find_the_face = function (puzzle, api) {
    const src = imageSrc(puzzle);
    const x = clamp(Number(puzzle.x) || 0.5, 0.18, 0.82);
    const y = clamp(Number(puzzle.y) || 0.5, 0.2, 0.8);
    const size = clamp(Number(puzzle.size) || 0.24, 0.1, 0.5);
    const peak = clamp(Number(puzzle.peak) || 0.6, 0.12, 1);
    const tolerance = clamp(Number(puzzle.tolerance) || 0.15, 0.07, 0.3);
    // Descriptors saved before faces had anatomy still land on a valid face.
    const f = puzzle.face && typeof puzzle.face === "object" ? puzzle.face : {};
    const seeded = rngFromSeed(`${puzzle.seed || src}:facefallback`);
    const num = (value, lo, hi) => clamp(Number(value) || (lo + seeded() * (hi - lo)), lo, hi);
    const vars = {
      "--tilt": `${clamp(Number(f.tilt) || 0, -8, 8)}deg`,
      "--squash": String(num(f.squash, 0.68, 0.9)),
      "--gap": String(num(f.gap, 0.16, 0.26)),
      "--eyeY": String(num(f.eyeY, 0.34, 0.48)),
      "--eye": String(num(f.eye, 0.14, 0.24)),
      "--mouthY": String(num(f.mouthY, 0.64, 0.78)),
      "--mouthW": String(num(f.mouthW, 0.26, 0.48)),
      "--mouthH": String(num(f.mouthH, 0.06, 0.16)),
    };

    api.body.innerHTML = `
      <div class="pz-scene" style="--peak:${peak}">
        <div class="pz-photo"></div>
        <span class="pz-face" style="left:${x * 100}%;top:${y * 100}%;width:${size * 100}%">
          <i class="pz-face-skin"></i>
          <i class="pz-face-eye l"></i>
          <i class="pz-face-eye r"></i>
          <i class="pz-face-mouth"></i>
        </span>
        <span class="pz-ring"></span>
      </div>
      <div class="pz-bar"><span class="pz-count">a face is in here, breathing</span></div>`;
    const scene = api.body.querySelector(".pz-scene");
    const photo = api.body.querySelector(".pz-photo");
    const ghost = api.body.querySelector(".pz-face");
    const ring = api.body.querySelector(".pz-ring");
    Object.entries(vars).forEach(([key, value]) => ghost.style.setProperty(key, value));
    const countEl = api.body.querySelector(".pz-count");
    photo.style.backgroundImage = `url("${src}")`;

    let mercy = false;
    const watch = setInterval(() => {
      if (mercy || api.timeFraction() > 0.36) return;
      mercy = true;
      scene.classList.add("warm");
      countEl.textContent = "it is getting bolder";
    }, 400);
    api.teardown(() => clearInterval(watch));

    scene.addEventListener("click", event => {
      const rect = scene.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width;
      const py = (event.clientY - rect.top) / rect.height;
      const dx = (px - x) * rect.width;
      const dy = (py - y) * rect.height;
      if (Math.hypot(dx, dy) <= tolerance * rect.width) {
        scene.classList.add("found");
        api.note("There it is.", "good");
        setTimeout(() => api.win("FOUND"), 340);
        return;
      }
      ring.style.left = `${px * 100}%`;
      ring.style.top = `${py * 100}%`;
      ring.classList.remove("go");
      void ring.offsetWidth;
      ring.classList.add("go");
      api.strike("Nothing there.");
    });
  };

  // The built-ins register exactly the way a pack does.
  register("image_tiles", {
    pool: "location", needsImage: true, label: "Put the room back together",
    generate: (seed, tune, ctx) => genImageTiles(seed, ctx.image, tune, ctx.location),
    render: RENDERERS.image_tiles,
  });
  register("mirror_check", {
    pool: "location", needsImage: true, label: "Find what is turned around",
    generate: (seed, tune, ctx) => genMirrorCheck(seed, ctx.image, tune, ctx.location),
    render: RENDERERS.mirror_check,
  });
  register("steady_hand", {
    pool: "location", label: "Keep your hand steady",
    generate: (seed, tune, ctx) => genSteadyHand(seed, tune, ctx.location),
    render: RENDERERS.steady_hand,
  });
  register("lock_deduce", {
    pool: "location", label: "Work out the lock",
    generate: (seed, tune, ctx) => genLockDeduce(seed, tune, ctx.location),
    render: RENDERERS.lock_deduce,
  });
  register("find_the_face", {
    pool: "threat", needsImage: true, label: "Find it in the picture",
    generate: (seed, tune, ctx) => genFindTheFace(seed, ctx.image, tune, ctx.threat),
    render: RENDERERS.find_the_face,
  });
  register("signal_echo", {
    pool: "threat", label: "Answer what it repeats",
    generate: (seed, tune, ctx) => genSignalEcho(seed, tune, ctx.threat),
    render: RENDERERS.signal_echo,
  });
  register("hold_still", {
    pool: "threat", label: "Hold your breath",
    generate: (seed, tune, ctx) => genHoldStill(seed, tune, ctx.threat),
    render: RENDERERS.hold_still,
  });
  register("dont_look", {
    pool: "threat", label: "Keep watch on the openings",
    generate: (seed, tune, ctx) => genDontLook(seed, tune, ctx.threat),
    render: RENDERERS.dont_look,
  });

  window.HubPuzzles = {
    createChallengeGroups,
    samplePuzzles,
    start,
    register,
    registered: () => Array.from(REGISTRY.keys()),
    scoreLock,
  };
})();
