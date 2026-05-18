(function () {
  const SYMBOLS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
  const GLYPHS = ["A", "B", "C", "D", "E", "F"];

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

  function phraseForThreat(threat) {
    const label = threat && (threat.label || threat.name) ? (threat.label || threat.name) : "the presence";
    return `seal ${label} away`;
  }

  function locationChallenge(location, baseSeed, seconds) {
    const rng = rngFromSeed(`${baseSeed}:location:kind`);
    if (rng() < 0.5) {
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

  function monsterChallenge(threat, baseSeed, seconds) {
    const threatName = threat.name || "the hunter";
    const rng = rngFromSeed(`${baseSeed}:monster:kind:${threatName}`);
    if (rng() < 0.5) {
      const phrase = phraseForThreat(threat);
      const phraseWords = phrase.split(/\s+/);
      return {
        label: "Arrange the ward phrase",
        challenge: {
          type: "word_order",
          title: `${threatName} Ward Phrase`,
          prompt: "Tap the words in the right order to arm the ward.",
          answer: phraseWords,
          tiles: shuffle(phraseWords, rngFromSeed(`${baseSeed}:monster:${threatName}`)),
          seconds,
          seed: `${baseSeed}:monster:words`,
        },
        successText: `The ward phrase locks in. For a moment, ${threatName} feels farther away.`,
        failText: `The ward phrase breaks apart. The mistake costs you a turn.`,
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
    const locationTask = locationChallenge(location, baseSeed, seconds);
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
    start,
  };
})();
