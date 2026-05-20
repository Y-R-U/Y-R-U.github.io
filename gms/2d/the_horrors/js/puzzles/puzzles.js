(function () {
  const SYMBOLS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
  const GLYPHS = ["A", "B", "C", "D", "E", "F"];
  const CODE_WORDS = ["CODE", "EXE", "START", "WAKE", "LOCK", "OPEN", "EXIT", "SYNC", "NODE", "VOID", "SAFE", "SIGNAL"];

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

  function secondsForDifficulty(difficultyId) {
    if (difficultyId === "hard") return 30;
    if (difficultyId === "easy") return 60;
    return 45;
  }

  function codeFromText(text, seed) {
    const rng = rngFromSeed(`${text}:${seed}:code`);
    return Array.from({ length: 4 }, () => String(Math.floor(rng() * 10))).join("");
  }

  function pick(list, rng) {
    return list[Math.floor(rng() * list.length)];
  }

  function digits(rng, length) {
    return Array.from({ length }, () => String(Math.floor(rng() * 10))).join("");
  }

  function codeTokenSet(text, seed) {
    const rng = rngFromSeed(`${text}:${seed}:code-tokens`);
    const words = shuffle(CODE_WORDS, rng).slice(0, 3);
    const patterns = [
      word => `${digits(rng, 3)}-${word}`,
      word => `${digits(rng, 1)}XX-${word}-${digits(rng, 2)}`,
      word => `${digits(rng, 2)}-${word}`,
    ];
    return words.map((word, index) => patterns[index % patterns.length](word));
  }

  function imageChoicesFromContext(ctx) {
    const choices = Array.isArray(ctx.imageChoices) ? ctx.imageChoices : [];
    return choices
      .map(choice => {
        if (typeof choice === "string") return { src: choice, label: "" };
        if (!choice || !choice.src) return null;
        return {
          src: String(choice.src),
          label: choice.label ? String(choice.label) : "",
        };
      })
      .filter(choice => choice && choice.src);
  }

  function sequenceFromText(text, seed) {
    const rng = rngFromSeed(`${text}:${seed}:sequence`);
    const symbols = shuffle(GLYPHS, rng).slice(0, 4);
    const sequence = Array.from({ length: 5 }, () => pick(symbols, rng));
    return { symbols, sequence };
  }

  function equationFromText(text, seed) {
    const rng = rngFromSeed(`${text}:${seed}:equation`);
    const a = Math.floor(rng() * 5) + 2;
    const b = Math.floor(rng() * 5) + 2;
    const c = Math.floor(rng() * 4) + 1;
    const symbols = shuffle(GLYPHS, rng).slice(0, 3);
    return {
      clues: [
        `${symbols[0]} = ${a}`,
        `${symbols[1]} = ${b}`,
        `${symbols[0]} + ${symbols[1]} - ${symbols[2]} = ${a + b - c}`,
      ],
      target: symbols[2],
      answer: String(c),
      symbols,
    };
  }

  function memoryPatternFromText(text, seed) {
    const rng = rngFromSeed(`${text}:${seed}:memory-grid`);
    return shuffle(Array.from({ length: 9 }, (_, index) => index), rng).slice(0, 4);
  }

  function imagePuzzleChoice(ctx, baseSeed, suffix) {
    const imageChoices = imageChoicesFromContext(ctx || {});
    if (!imageChoices.length) return null;
    return pick(imageChoices, rngFromSeed(`${baseSeed}:${suffix}:image-choice`));
  }

  function wirePuzzleFromText(text, seed) {
    const rng = rngFromSeed(`${text}:${seed}:wire-match`);
    const symbols = shuffle(["A", "B", "C", "D", "E", "F"], rng).slice(0, 4);
    const pairs = {};
    const right = shuffle(symbols, rngFromSeed(`${text}:${seed}:wire-right`));
    symbols.forEach(symbol => { pairs[symbol] = symbol; });
    return { left: symbols, right, pairs };
  }

  function pressurePuzzleFromText(text, seed) {
    const rng = rngFromSeed(`${text}:${seed}:pressure-order`);
    const controls = shuffle(["I", "II", "III", "IV"], rng);
    return {
      controls,
      answer: shuffle(controls, rngFromSeed(`${text}:${seed}:pressure-answer`)),
    };
  }

  function dialPuzzleFromText(text, seed) {
    const rng = rngFromSeed(`${text}:${seed}:dial-align`);
    const symbols = ["A", "B", "C", "D"];
    return {
      symbols,
      answer: Array.from({ length: 3 }, () => pick(symbols, rng)),
      start: Array.from({ length: 3 }, () => pick(symbols, rng)),
    };
  }

  function locationChallenge(location, baseSeed, seconds, ctx) {
    const rng = rngFromSeed(`${baseSeed}:location:kind`);
    const image = imagePuzzleChoice(ctx, baseSeed, "location");
    const roll = rng();
    if (image && roll < 0.2) {
      return {
        label: "Restore the local image lock",
        challenge: {
          type: "image_tiles",
          title: `${location} Image Lock`,
          prompt: "Swap the image tiles until the picture is restored.",
          image,
          grid: 3,
          seconds,
          seed: `${baseSeed}:location:image-tiles:${image.src}`,
        },
        successText: `The ${location} image lock resolves and unlocks a safer route.`,
        failText: `The ${location} image lock stays scrambled. The delay costs you a turn.`,
      };
    }
    if (image && roll < 0.36) {
      return {
        label: "Find the image fault",
        challenge: {
          type: "spot_difference",
          title: `${location} Image Fault`,
          prompt: "Find the altered tile in the room image.",
          image,
          seconds,
          seed: `${baseSeed}:location:spot-difference:${image.src}`,
        },
        successText: `The ${location} image fault resolves and the panel grants access.`,
        failText: `The ${location} image fault stays hidden. The delay costs you a turn.`,
      };
    }
    if (roll < 0.54) {
      const code = codeFromText(location, baseSeed);
      return {
        label: "Solve the local access code",
        challenge: {
          type: "code",
          title: `${location} Access Code`,
          prompt: "Memorise the four-digit code, then enter it before the timer expires.",
          code,
          seconds,
          seed: `${baseSeed}:location:code`,
        },
        successText: `The ${location} access relay accepts the code and unlocks a safer route.`,
        failText: `The ${location} relay rejects the attempt. The delay costs you a turn.`,
      };
    }
    if (roll < 0.74) {
      const sequence = sequenceFromText(location, baseSeed);
      return {
        label: "Repeat the local signal",
        challenge: {
          type: "sequence_repeat",
          title: `${location} Signal Pattern`,
          prompt: "Watch the signal pattern, then repeat it before the timer expires.",
          seconds,
          symbols: sequence.symbols,
          sequence: sequence.sequence,
          seed: `${baseSeed}:location:sequence`,
        },
        successText: `The ${location} signal repeats cleanly and the panel grants access.`,
        failText: `The ${location} signal falls out of sync. The delay costs you a turn.`,
      };
    }
    const pattern = memoryPatternFromText(location, baseSeed);
    return {
      label: "Repeat the local grid",
      challenge: {
        type: "memory_grid",
        title: `${location} Memory Grid`,
        prompt: "Watch the lit cells, then repeat them before the timer expires.",
        seconds,
        pattern,
        seed: `${baseSeed}:location:memory-grid`,
      },
      successText: `The ${location} grid repeats cleanly and the panel grants access.`,
      failText: `The ${location} grid falls out of sync. The delay costs you a turn.`,
    };
  }

  function monsterChallenge(threat, baseSeed, seconds) {
    const threatName = threat.name || "the hunter";
    const rng = rngFromSeed(`${baseSeed}:monster:kind:${threatName}`);
    const roll = rng();
    if (roll < 0.25) {
      const codes = codeTokenSet(threatName, baseSeed);
      const answer = shuffle(codes, rngFromSeed(`${baseSeed}:monster:${threatName}:answer`));
      return {
        label: "Arrange the ward codes",
        challenge: {
          type: "code_order",
          title: `${threatName} Ward Codes`,
          prompt: "Memorise the three-code order, then place the codes before the timer expires.",
          answer,
          tiles: shuffle(codes, rngFromSeed(`${baseSeed}:monster:${threatName}:tiles`)),
          seconds: 10,
          seed: `${baseSeed}:monster:codes`,
        },
        successText: `The ward codes lock in. For a moment, ${threatName} feels farther away.`,
        failText: `The ward codes scramble. The mistake costs you a turn.`,
      };
    }
    if (roll < 0.46) {
      const puzzle = pressurePuzzleFromText(threatName, baseSeed);
      return {
        label: "Set the ward pressure",
        challenge: {
          type: "pressure_order",
          title: `${threatName} Pressure Order`,
          prompt: "Memorise the valve order, then press the controls before the timer expires.",
          seconds: 16,
          controls: puzzle.controls,
          answer: puzzle.answer,
          seed: `${baseSeed}:monster:pressure-order`,
        },
        successText: `The ward pressure locks in. For a moment, ${threatName} feels farther away.`,
        failText: `The ward pressure vents in the wrong order. The mistake costs you a turn.`,
      };
    }
    if (roll < 0.66) {
      const puzzle = dialPuzzleFromText(threatName, baseSeed);
      return {
        label: "Align the ward dials",
        challenge: {
          type: "dial_align",
          title: `${threatName} Dial Align`,
          prompt: "Rotate each dial until the symbols match the target.",
          seconds,
          symbols: puzzle.symbols,
          start: puzzle.start,
          answer: puzzle.answer,
          seed: `${baseSeed}:monster:dial-align`,
        },
        successText: `The ward dials align. For a moment, ${threatName} feels farther away.`,
        failText: `The ward dials slip out of alignment. The mistake costs you a turn.`,
      };
    }
    if (roll < 0.82) {
      const puzzle = wirePuzzleFromText(threatName, baseSeed);
      return {
        label: "Match the ward wires",
        challenge: {
          type: "wire_match",
          title: `${threatName} Wire Match`,
          prompt: "Select a left terminal, then select its matching right terminal.",
          seconds,
          left: puzzle.left,
          right: puzzle.right,
          pairs: puzzle.pairs,
          seed: `${baseSeed}:monster:wire-match`,
        },
        successText: `The ward wires pair cleanly. For a moment, ${threatName} feels farther away.`,
        failText: `The ward wires spark apart. The mistake costs you a turn.`,
      };
    }
    const equation = equationFromText(threatName, baseSeed);
    return {
      label: "Solve the ward equation",
      challenge: {
        type: "symbol_equation",
        title: `${threatName} Ward Equation`,
        prompt: `Use the clues to find the value of ${equation.target}.`,
        seconds,
        clues: equation.clues,
        target: equation.target,
        answer: equation.answer,
        symbols: equation.symbols,
        seed: `${baseSeed}:monster:equation`,
      },
      successText: `The ward equation balances. For a moment, ${threatName} feels farther away.`,
      failText: `The ward equation collapses. The mistake costs you a turn.`,
    };
  }

  function createChallengeGroups(ctx) {
    const gameId = ctx.gameId || "game";
    const difficultyId = ctx.difficultyId || "medium";
    const seconds = secondsForDifficulty(difficultyId);
    const location = ctx.location || ctx.facility || "the site";
    const threat = ctx.threat || {};
    const threatName = threat.name || "the hunter";
    const baseSeed = ctx.runKey || `${gameId}:${Date.now()}`;
    const locationTask = locationChallenge(location, baseSeed, seconds, ctx);
    const monsterTask = monsterChallenge(threat, baseSeed, seconds);
    return [
      {
        id: "challenge_location",
        mandatory: true,
        label: "Location challenge",
        goalText: `Challenge: solve the ${location} access puzzle.`,
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
        goalText: `Challenge: solve a ward puzzle keyed to ${threatName}.`,
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
    const imageChoices = imageChoicesFromContext(ctx);
    const image = imageChoices[0] || { src: "images/hallway.jpg", label: "Hallway" };
    return [
      {
        id: "code",
        label: "Access Code",
        puzzle: {
          type: "code",
          title: "Sample Access Code",
          prompt: "Memorise the four-digit code, then enter it before the timer expires.",
          code: "3816",
          seconds: 20,
          seed: "sample:code",
        },
      },
      {
        id: "sequence_repeat",
        label: "Signal Repeat",
        puzzle: {
          type: "sequence_repeat",
          title: "Sample Signal Pattern",
          prompt: "Watch the signal pattern, then repeat it before the timer expires.",
          symbols: ["A", "B", "C", "D"],
          sequence: ["B", "D", "A", "C", "B"],
          seconds: 20,
          seed: "sample:sequence",
        },
      },
      {
        id: "code_order",
        label: "Code Order",
        puzzle: {
          type: "code_order",
          title: "Sample Ward Codes",
          prompt: "Memorise the three-code order, then place the codes before the timer expires.",
          answer: ["122-CODE", "1XX-EXE-22", "55-START"],
          tiles: ["55-START", "122-CODE", "1XX-EXE-22"],
          seconds: 10,
          seed: "sample:code-order",
        },
      },
      {
        id: "symbol_equation",
        label: "Ward Equation",
        puzzle: {
          type: "symbol_equation",
          title: "Sample Ward Equation",
          prompt: "Use the clues to find the value of C.",
          clues: ["A = 4", "B = 3", "A + B - C = 5"],
          target: "C",
          answer: "2",
          symbols: ["A", "B", "C"],
          seconds: 25,
          seed: "sample:equation",
        },
      },
      {
        id: "image_tiles",
        label: "Image Tiles",
        puzzle: {
          type: "image_tiles",
          title: "Sample Image Lock",
          prompt: "Swap the image tiles until the picture is restored.",
          image,
          grid: 3,
          seconds: 45,
          seed: `sample:image:${image.src}`,
        },
      },
      {
        id: "word_order",
        label: "Word Order Legacy",
        puzzle: {
          type: "word_order",
          title: "Sample Word Phrase",
          prompt: "Tap the words in the right order.",
          answer: ["open", "the", "sealed", "door"],
          tiles: ["door", "open", "sealed", "the"],
          seconds: 20,
          seed: "sample:word-order",
        },
      },
      {
        id: "wire_match",
        label: "Wire Match",
        puzzle: {
          type: "wire_match",
          title: "Sample Wire Match",
          prompt: "Select a left terminal, then select its matching right terminal.",
          left: ["A", "B", "C", "D"],
          right: ["C", "A", "D", "B"],
          pairs: { A: "A", B: "B", C: "C", D: "D" },
          seconds: 25,
          seed: "sample:wire-match",
        },
      },
      {
        id: "pressure_order",
        label: "Pressure Order",
        puzzle: {
          type: "pressure_order",
          title: "Sample Pressure Order",
          prompt: "Memorise the valve order, then press the controls before the timer expires.",
          controls: ["I", "II", "III", "IV"],
          answer: ["III", "I", "IV", "II"],
          seconds: 16,
          seed: "sample:pressure-order",
        },
      },
      {
        id: "spot_difference",
        label: "Spot Difference",
        puzzle: {
          type: "spot_difference",
          title: "Sample Image Fault",
          prompt: "Find the altered tile in the room image.",
          image,
          seconds: 25,
          seed: `sample:spot:${image.src}`,
        },
      },
      {
        id: "memory_grid",
        label: "Memory Grid",
        puzzle: {
          type: "memory_grid",
          title: "Sample Memory Grid",
          prompt: "Watch the lit cells, then repeat them before the timer expires.",
          pattern: [0, 4, 6, 8],
          seconds: 20,
          seed: "sample:memory-grid",
        },
      },
      {
        id: "dial_align",
        label: "Dial Align",
        puzzle: {
          type: "dial_align",
          title: "Sample Dial Align",
          prompt: "Rotate each dial until the symbols match the target.",
          symbols: ["A", "B", "C", "D"],
          start: ["D", "A", "C"],
          answer: ["B", "D", "A"],
          seconds: 25,
          seed: "sample:dial-align",
        },
      },
    ];
  }

  function ensureModal() {
    let modal = document.getElementById("puzzle-overlay");
    if (modal) return modal;
    modal = document.createElement("aside");
    modal.id = "puzzle-overlay";
    modal.className = "puzzle-overlay";
    modal.innerHTML = `
      <div class="puzzle-card" role="dialog" aria-modal="true" aria-labelledby="puzzle-title">
        <div class="puzzle-head">
          <div>
            <p class="puzzle-kicker">challenge task</p>
            <h2 id="puzzle-title"></h2>
          </div>
          <div id="puzzle-timer" class="puzzle-timer">0</div>
        </div>
        <p id="puzzle-prompt" class="puzzle-prompt"></p>
        <div id="puzzle-body" class="puzzle-body"></div>
        <div id="puzzle-feedback" class="puzzle-feedback" aria-live="polite"></div>
        <div class="puzzle-actions">
          <button id="puzzle-submit" class="glass-button primary" type="button">Submit</button>
          <button id="puzzle-cancel" class="glass-button quiet" type="button">Back out</button>
        </div>
      </div>
    `;
    document.body.append(modal);
    return modal;
  }

  function start(puzzle) {
    if (!puzzle || !puzzle.type) return Promise.resolve({ success: false, reason: "missing" });
    const modal = ensureModal();
    const title = modal.querySelector("#puzzle-title");
    const prompt = modal.querySelector("#puzzle-prompt");
    const body = modal.querySelector("#puzzle-body");
    const timerEl = modal.querySelector("#puzzle-timer");
    const feedback = modal.querySelector("#puzzle-feedback");
    const submit = modal.querySelector("#puzzle-submit");
    const cancel = modal.querySelector("#puzzle-cancel");
    let teardown = null;
    let check = () => false;
    title.textContent = puzzle.title || "Challenge";
    prompt.textContent = puzzle.prompt || "";
    feedback.textContent = "";
    body.innerHTML = "";
    submit.disabled = false;
    if (puzzle.type === "code") {
      const code = String(puzzle.code || "0000");
      body.innerHTML = `
        <div class="puzzle-code-preview">${code}</div>
        <input class="puzzle-code-input" inputmode="numeric" maxlength="${code.length}" autocomplete="off" aria-label="Enter code">
        <div class="puzzle-keypad"></div>
      `;
      const input = body.querySelector(".puzzle-code-input");
      const preview = body.querySelector(".puzzle-code-preview");
      const keypad = body.querySelector(".puzzle-keypad");
      SYMBOLS.forEach(symbol => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = symbol;
        btn.addEventListener("click", () => {
          if (input.value.length < code.length) input.value += symbol;
        });
        keypad.append(btn);
      });
      const clear = document.createElement("button");
      clear.type = "button";
      clear.textContent = "clear";
      clear.addEventListener("click", () => { input.value = ""; });
      keypad.append(clear);
      const hideTimer = setTimeout(() => { preview.textContent = "????"; }, 3200);
      teardown = () => clearTimeout(hideTimer);
      input.focus({ preventScroll: true });
      check = () => input.value === code;
    } else if (puzzle.type === "word_order") {
      const answer = (puzzle.answer || []).map(String);
      const picked = [];
      body.innerHTML = `<div class="puzzle-word-target"></div><div class="puzzle-word-bank"></div>`;
      const target = body.querySelector(".puzzle-word-target");
      const bank = body.querySelector(".puzzle-word-bank");
      const render = () => {
        target.textContent = picked.length ? picked.join(" ") : "tap words below";
        bank.innerHTML = "";
        (puzzle.tiles || answer).forEach((word, index) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = word;
          btn.disabled = picked.includes(`${index}:${word}`);
          btn.addEventListener("click", () => {
            picked.push(`${index}:${word}`);
            render();
          });
          bank.append(btn);
        });
        if (picked.length) {
          const undo = document.createElement("button");
          undo.type = "button";
          undo.textContent = "undo";
          undo.addEventListener("click", () => {
            picked.pop();
            render();
          });
          bank.append(undo);
        }
      };
      render();
      check = () => picked.map(item => item.slice(item.indexOf(":") + 1)).join(" ") === answer.join(" ");
    } else if (puzzle.type === "code_order") {
      const answer = (puzzle.answer || []).map(String).slice(0, 3);
      const tiles = (puzzle.tiles || answer).map(String).slice(0, 3);
      const picked = Array.from({ length: answer.length }, () => "");
      body.innerHTML = `
        <div class="puzzle-code-order-preview"></div>
        <div class="puzzle-code-slots"></div>
        <div class="puzzle-code-bank"></div>
      `;
      const preview = body.querySelector(".puzzle-code-order-preview");
      const slots = body.querySelector(".puzzle-code-slots");
      const bank = body.querySelector(".puzzle-code-bank");
      const targetText = answer.join("  ");
      const render = () => {
        slots.innerHTML = "";
        picked.forEach((value, index) => {
          const slot = document.createElement("button");
          slot.type = "button";
          slot.className = value ? "filled" : "";
          slot.textContent = value || `spot ${index + 1}`;
          slot.setAttribute("aria-label", value ? `Clear ${value}` : `Empty spot ${index + 1}`);
          slot.addEventListener("click", () => {
            picked[index] = "";
            render();
          });
          slots.append(slot);
        });
        bank.innerHTML = "";
        tiles.forEach(code => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = code;
          btn.disabled = picked.includes(code);
          btn.addEventListener("click", () => {
            const openIndex = picked.findIndex(value => !value);
            if (openIndex >= 0) picked[openIndex] = code;
            render();
          });
          bank.append(btn);
        });
        const clearAll = document.createElement("button");
        clearAll.type = "button";
        clearAll.className = "utility";
        clearAll.textContent = "Clear all";
        clearAll.addEventListener("click", () => {
          picked.fill("");
          render();
        });
        bank.append(clearAll);
      };
      preview.textContent = targetText;
      const hideTimer = setTimeout(() => { preview.textContent = "match the hidden three-code order"; }, 2600);
      teardown = () => clearTimeout(hideTimer);
      render();
      check = () => picked.join(" ") === answer.join(" ");
    } else if (puzzle.type === "sequence_repeat") {
      const sequence = (puzzle.sequence || []).map(String);
      const picked = [];
      body.innerHTML = `
        <div class="puzzle-sequence-preview"></div>
        <div class="puzzle-sequence-bank"></div>
      `;
      const preview = body.querySelector(".puzzle-sequence-preview");
      const bank = body.querySelector(".puzzle-sequence-bank");
      const showPreview = () => { preview.textContent = sequence.join(" "); };
      const hidePreview = () => { preview.textContent = "repeat the hidden pattern"; };
      showPreview();
      const hideTimer = setTimeout(hidePreview, 3600);
      teardown = () => clearTimeout(hideTimer);
      const render = () => {
        bank.innerHTML = "";
        (puzzle.symbols || GLYPHS.slice(0, 4)).forEach(symbol => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = symbol;
          btn.addEventListener("click", () => {
            picked.push(symbol);
            preview.textContent = picked.join(" ") || "repeat the hidden pattern";
          });
          bank.append(btn);
        });
        const undo = document.createElement("button");
        undo.type = "button";
        undo.textContent = "undo";
        undo.addEventListener("click", () => {
          picked.pop();
          preview.textContent = picked.join(" ") || "repeat the hidden pattern";
        });
        bank.append(undo);
      };
      render();
      check = () => picked.join(" ") === sequence.join(" ");
    } else if (puzzle.type === "symbol_equation") {
      const answer = String(puzzle.answer || "");
      body.innerHTML = `
        <div class="puzzle-equation-clues"></div>
        <div class="puzzle-equation-target">${puzzle.target || "?"} = ?</div>
        <input class="puzzle-code-input" inputmode="numeric" maxlength="2" autocomplete="off" aria-label="Enter symbol value">
        <div class="puzzle-keypad"></div>
      `;
      const clues = body.querySelector(".puzzle-equation-clues");
      const input = body.querySelector(".puzzle-code-input");
      const keypad = body.querySelector(".puzzle-keypad");
      (puzzle.clues || []).forEach(clue => {
        const row = document.createElement("div");
        row.textContent = clue;
        clues.append(row);
      });
      SYMBOLS.forEach(symbol => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = symbol;
        btn.addEventListener("click", () => {
          if (input.value.length < 2) input.value += symbol;
        });
        keypad.append(btn);
      });
      const clear = document.createElement("button");
      clear.type = "button";
      clear.textContent = "clear";
      clear.addEventListener("click", () => { input.value = ""; });
      keypad.append(clear);
      input.focus({ preventScroll: true });
      check = () => input.value === answer;
    } else if (puzzle.type === "image_tiles") {
      const grid = Math.max(2, Math.min(3, Number(puzzle.grid) || 3));
      const count = grid * grid;
      const image = typeof puzzle.image === "string" ? { src: puzzle.image, label: "" } : (puzzle.image || {});
      const src = image.src || "images/hallway.jpg";
      const rng = rngFromSeed(`${puzzle.seed || src}:image-tiles`);
      const solved = Array.from({ length: count }, (_, index) => index);
      let order = shuffle(solved, rng);
      if (order.every((value, index) => value === index)) order = order.slice(1).concat(order[0]);
      let selected = -1;
      body.innerHTML = `
        <div class="puzzle-image-wrap">
          <div class="puzzle-image-reference" aria-hidden="true"></div>
          <div class="puzzle-image-grid" role="group" aria-label="Image tile puzzle"></div>
        </div>
      `;
      const reference = body.querySelector(".puzzle-image-reference");
      const gridEl = body.querySelector(".puzzle-image-grid");
      reference.style.backgroundImage = `url("${src}")`;
      if (image.label) reference.setAttribute("title", image.label);
      gridEl.style.setProperty("--puzzle-grid", String(grid));
      const render = () => {
        gridEl.innerHTML = "";
        order.forEach((tileIndex, index) => {
          const tile = document.createElement("button");
          const x = tileIndex % grid;
          const y = Math.floor(tileIndex / grid);
          tile.type = "button";
          tile.className = selected === index ? "selected" : "";
          tile.style.backgroundImage = `url("${src}")`;
          tile.style.backgroundSize = `${grid * 100}% ${grid * 100}%`;
          tile.style.backgroundPosition = `${grid === 1 ? 0 : (x / (grid - 1)) * 100}% ${grid === 1 ? 0 : (y / (grid - 1)) * 100}%`;
          tile.setAttribute("aria-label", `Tile ${index + 1}`);
          tile.addEventListener("click", () => {
            if (selected < 0) {
              selected = index;
            } else if (selected === index) {
              selected = -1;
            } else {
              [order[selected], order[index]] = [order[index], order[selected]];
              selected = -1;
            }
            render();
          });
          gridEl.append(tile);
        });
      };
      render();
      check = () => order.every((value, index) => value === index);
    } else if (puzzle.type === "wire_match") {
      const left = (puzzle.left || ["A", "B", "C"]).map(String);
      const right = (puzzle.right || left).map(String);
      const pairs = puzzle.pairs || {};
      const matched = {};
      let selected = "";
      body.innerHTML = `
        <div class="puzzle-wire-board">
          <div class="puzzle-wire-column puzzle-wire-left"></div>
          <div class="puzzle-wire-column puzzle-wire-right"></div>
        </div>
      `;
      const leftCol = body.querySelector(".puzzle-wire-left");
      const rightCol = body.querySelector(".puzzle-wire-right");
      const render = () => {
        leftCol.innerHTML = "";
        rightCol.innerHTML = "";
        left.forEach(symbol => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = symbol;
          btn.className = selected === symbol ? "selected" : "";
          btn.disabled = !!matched[symbol];
          btn.addEventListener("click", () => {
            selected = selected === symbol ? "" : symbol;
            render();
          });
          leftCol.append(btn);
        });
        right.forEach(symbol => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = symbol;
          btn.disabled = Object.values(matched).includes(symbol);
          btn.addEventListener("click", () => {
            if (!selected) return;
            matched[selected] = symbol;
            selected = "";
            render();
          });
          rightCol.append(btn);
        });
      };
      render();
      check = () => left.every(symbol => matched[symbol] === (pairs[symbol] || symbol));
    } else if (puzzle.type === "pressure_order") {
      const controls = (puzzle.controls || ["I", "II", "III", "IV"]).map(String);
      const answer = (puzzle.answer || controls).map(String);
      const picked = [];
      body.innerHTML = `
        <div class="puzzle-pressure-preview"></div>
        <div class="puzzle-pressure-picked"></div>
        <div class="puzzle-pressure-bank"></div>
      `;
      const preview = body.querySelector(".puzzle-pressure-preview");
      const pickedEl = body.querySelector(".puzzle-pressure-picked");
      const bank = body.querySelector(".puzzle-pressure-bank");
      preview.textContent = answer.join("  ");
      const hideTimer = setTimeout(() => { preview.textContent = "repeat the hidden valve order"; }, 2600);
      teardown = () => clearTimeout(hideTimer);
      const render = () => {
        pickedEl.textContent = picked.length ? picked.join("  ") : "no valves pressed";
        bank.innerHTML = "";
        controls.forEach(control => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = control;
          btn.disabled = picked.includes(control);
          btn.addEventListener("click", () => {
            picked.push(control);
            render();
          });
          bank.append(btn);
        });
        const clearAll = document.createElement("button");
        clearAll.type = "button";
        clearAll.className = "utility";
        clearAll.textContent = "Clear all";
        clearAll.addEventListener("click", () => {
          picked.length = 0;
          render();
        });
        bank.append(clearAll);
      };
      render();
      check = () => picked.join(" ") === answer.join(" ");
    } else if (puzzle.type === "spot_difference") {
      const image = typeof puzzle.image === "string" ? { src: puzzle.image, label: "" } : (puzzle.image || {});
      const src = image.src || "images/hallway.jpg";
      const grid = 3;
      const rng = rngFromSeed(`${puzzle.seed || src}:spot-difference`);
      const oddIndex = Math.floor(rng() * 9);
      let selected = -1;
      body.innerHTML = `<div class="puzzle-spot-grid" role="group" aria-label="Spot difference puzzle"></div>`;
      const gridEl = body.querySelector(".puzzle-spot-grid");
      const render = () => {
        gridEl.innerHTML = "";
        Array.from({ length: 9 }, (_, index) => index).forEach(index => {
          const x = index % grid;
          const y = Math.floor(index / grid);
          const tile = document.createElement("button");
          tile.type = "button";
          tile.className = `${index === oddIndex ? "odd" : ""} ${selected === index ? "selected" : ""}`.trim();
          tile.style.backgroundImage = `url("${src}")`;
          tile.style.backgroundSize = `${grid * 100}% ${grid * 100}%`;
          tile.style.backgroundPosition = `${(x / (grid - 1)) * 100}% ${(y / (grid - 1)) * 100}%`;
          tile.setAttribute("aria-label", `Image tile ${index + 1}`);
          tile.addEventListener("click", () => {
            selected = index;
            render();
          });
          gridEl.append(tile);
        });
      };
      render();
      check = () => selected === oddIndex;
    } else if (puzzle.type === "memory_grid") {
      const pattern = (puzzle.pattern || [0, 4, 8]).map(Number).filter(index => index >= 0 && index < 9);
      const picked = new Set();
      let hidden = false;
      body.innerHTML = `<div class="puzzle-memory-grid" role="group" aria-label="Memory grid puzzle"></div>`;
      const grid = body.querySelector(".puzzle-memory-grid");
      const render = () => {
        grid.innerHTML = "";
        Array.from({ length: 9 }, (_, index) => index).forEach(index => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = [
            !hidden && pattern.includes(index) ? "lit" : "",
            picked.has(index) ? "picked" : "",
          ].filter(Boolean).join(" ");
          btn.setAttribute("aria-label", `Grid cell ${index + 1}`);
          btn.addEventListener("click", () => {
            hidden = true;
            if (picked.has(index)) picked.delete(index);
            else picked.add(index);
            render();
          });
          grid.append(btn);
        });
      };
      const hideTimer = setTimeout(() => {
        hidden = true;
        render();
      }, 2400);
      teardown = () => clearTimeout(hideTimer);
      render();
      check = () => pattern.length === picked.size && pattern.every(index => picked.has(index));
    } else if (puzzle.type === "dial_align") {
      const symbols = (puzzle.symbols || ["A", "B", "C", "D"]).map(String);
      const answer = (puzzle.answer || symbols.slice(0, 3)).map(String).slice(0, 3);
      const values = (puzzle.start || answer).map(String).slice(0, answer.length);
      while (values.length < answer.length) values.push(symbols[0]);
      body.innerHTML = `
        <div class="puzzle-dial-target"></div>
        <div class="puzzle-dials"></div>
      `;
      const target = body.querySelector(".puzzle-dial-target");
      const dials = body.querySelector(".puzzle-dials");
      target.textContent = answer.join("  ");
      const render = () => {
        dials.innerHTML = "";
        values.forEach((value, index) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = value;
          btn.setAttribute("aria-label", `Dial ${index + 1}`);
          btn.addEventListener("click", () => {
            const current = symbols.indexOf(values[index]);
            values[index] = symbols[(current + 1 + symbols.length) % symbols.length];
            render();
          });
          dials.append(btn);
        });
      };
      render();
      check = () => values.join(" ") === answer.join(" ");
    }

    return new Promise(resolve => {
      let done = false;
      let remaining = Math.max(10, Number(puzzle.seconds) || 45);
      const finish = result => {
        if (done) return;
        done = true;
        clearInterval(interval);
        if (teardown) teardown();
        submit.removeEventListener("click", onSubmit);
        cancel.removeEventListener("click", onCancel);
        modal.classList.remove("open");
        resolve(result);
      };
      const tick = () => {
        timerEl.textContent = String(remaining);
        remaining -= 1;
        if (remaining < 0) finish({ success: false, reason: "timeout" });
      };
      const onSubmit = () => {
        if (check()) {
          feedback.textContent = "Accepted.";
          submit.disabled = true;
          setTimeout(() => finish({ success: true, reason: "solved" }), 350);
        } else {
          feedback.textContent = "Not quite.";
        }
      };
      const onCancel = () => finish({ success: false, reason: "cancelled", noPenalty: true });
      submit.addEventListener("click", onSubmit);
      cancel.addEventListener("click", onCancel);
      modal.classList.add("open");
      tick();
      const interval = setInterval(tick, 1000);
    });
  }

  window.HubPuzzles = {
    createChallengeGroups,
    samplePuzzles,
    start,
  };
})();
