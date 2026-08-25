(() => {
  const DATA = window.DRK_DATA;
  const SAVE_KEY = "drk_v01_save";
  const MANIFEST_URL = "data/media_manifest.json";
  const STAT_LABELS = {
    cash: "CASH",
    debt: "DEBT",
    energy: "EN",
    mood: "MOOD",
    charm: "CHR",
    fitness: "FIT",
    intelligence: "INT",
    reputation: "REP",
    risk: "RISK"
  };

  const els = {};
  let state;
  let manifest = null;
  let currentMedia = null;
  let casino = null;
  let objectiveGuard = false;
  let pendingEvent = null;
  let topMetric = 0; // 0 cash, 1 debt, 2 net worth (cycled by tapping the chip)
  let storyCollapsed = true;

  const START_DEBT = DATA.startingState.debt || 2800;
  const NET_GOAL = 15000;
  const SKILL_GOAL = 60;
  const EVENT_CHANCE = 0.6;

  // Goals give the run direction. The three "freedom" goals together are the win condition.
  const OBJECTIVES = [
    {
      id: "debt",
      label: "Clear the debt",
      freedom: true,
      reward: { mood: 12 },
      done: () => state.debt <= 0,
      progress: () => clamp((START_DEBT - state.debt) / START_DEBT, 0, 1)
    },
    {
      id: "wealth",
      label: `Reach ${money(NET_GOAL)} net worth`,
      freedom: true,
      reward: { mood: 12 },
      done: () => netWorth() >= NET_GOAL,
      progress: () => clamp(netWorth() / NET_GOAL, 0, 1)
    },
    {
      id: "romance",
      label: "Win a partner (stage 2)",
      freedom: true,
      reward: { mood: 14 },
      done: () => maxStage() >= 2,
      progress: () => clamp(maxStage() / 2, 0, 1)
    },
    {
      id: "skill",
      label: `Raise a core skill to ${SKILL_GOAL}`,
      reward: { cash: 400 },
      done: () => topSkill() >= SKILL_GOAL,
      progress: () => clamp(topSkill() / SKILL_GOAL, 0, 1)
    }
  ];

  function netWorth() {
    return roundCents(state.cash + portfolioValue() - state.debt);
  }

  function maxStage() {
    return Math.max(0, ...Object.values(state.relationships || {}).map((rel) => rel.stage || 0));
  }

  function topSkill() {
    return Math.max(state.charm, state.fitness, state.intelligence, state.reputation);
  }

  // ---------- fx bridge (no-ops if fx.js absent) ----------
  function fx(name) { if (window.DRKFX) window.DRKFX.play(name); }
  function fxFloat(text, tone, anchor) { if (window.DRKFX) window.DRKFX.floatText(text, tone, anchor); }
  function fxFlash(tone) { if (window.DRKFX) window.DRKFX.flash(tone); }
  function fxConfetti(n) { if (window.DRKFX) window.DRKFX.confetti(n); }
  function fxShake(el) { if (window.DRKFX) window.DRKFX.shake(el); }

  // ---------- gifts (money -> romance) ----------
  const GIFTS = [
    { id: "flowers", name: "Fresh flowers", cost: 40, affection: 5, heat: 2, trust: 1 },
    { id: "dinner", name: "Surprise dinner", cost: 120, affection: 7, heat: 5, trust: 2 },
    { id: "jewelry", name: "Fine jewelry", cost: 260, affection: 6, heat: 10, trust: 1 }
  ];

  // ---------- random city events (fire on a new day) ----------
  const EVENTS = [
    {
      id: "found_cash",
      weight: 3,
      title: "Lucky find",
      text: "A fat envelope of cash is wedged behind a cafe bench. No name on it, and nobody is looking.",
      choices: [
        { label: "Pocket it", hint: "Fast money, small guilt", run: () => {
          const amount = randInt(120, 260);
          state.cash = roundCents(state.cash + amount);
          state.reputation = clamp(state.reputation - 2);
          fx("cash"); fxFloat(`+${money(amount)}`, "good", "metric-chip");
          return `You pocket ${money(amount)}. Nobody saw. Probably.`;
        } },
        { label: "Hand it in", hint: "REP +4 / MOOD +4", run: () => {
          state.reputation = clamp(state.reputation + 4);
          state.mood = clamp(state.mood + 4);
          return "You hand it to the staff. The owner remembers your face — warmly.";
        } }
      ]
    },
    {
      id: "mugging",
      weight: 2,
      title: "Back-alley shakedown",
      text: "Someone steps out of the dark, eyeing your jacket. \"Wallet. Now.\"",
      choices: [
        { label: "Hand it over", hint: "Lose some cash, stay safe", run: () => {
          const loss = Math.min(state.cash, randInt(60, 180));
          state.cash = roundCents(state.cash - loss);
          state.mood = clamp(state.mood - 6);
          fx("lose"); fxFloat(`-${money(loss)}`, "bad", "metric-chip");
          return `You give up ${money(loss)} and walk away rattled.`;
        } },
        { label: "Fight back", hint: "Fitness decides this", run: () => {
          const odds = clamp(0.25 + state.fitness / 130, 0.25, 0.85);
          if (Math.random() < odds) {
            state.reputation = clamp(state.reputation + 5);
            state.mood = clamp(state.mood + 6);
            state.fitness = clamp(state.fitness + 1);
            fx("win"); fxFlash("good");
            return "You drop him with two clean shots. Word gets around.";
          }
          const loss = Math.min(state.cash, randInt(80, 220));
          state.cash = roundCents(state.cash - loss);
          state.mood = clamp(state.mood - 8);
          fx("lose"); fxShake("media-frame");
          return `It goes badly. He takes ${money(loss)} and your pride.`;
        } }
      ]
    },
    {
      id: "hot_tip",
      weight: 3,
      title: "A whisper on the floor",
      text: "A jittery contact swears NOVA pops at tomorrow's open. \"Catalyst drops overnight.\"",
      choices: [
        { label: "Ride the tip", hint: "Bias NOVA up overnight", run: () => {
          state.tipAsset = "nova";
          state.risk = clamp(state.risk + 3);
          return "You note it. The open will tell you if the whisper was worth anything.";
        } },
        { label: "Trust the numbers", hint: "INT +2", run: () => {
          state.intelligence = clamp(state.intelligence + 2);
          return "You ignore the noise and trust your own read of the tape.";
        } }
      ]
    },
    {
      id: "late_text",
      weight: 3,
      title: "11:47 PM",
      focus: true,
      text: (c, rel) => {
        const bank = (DATA.lateText[c.id] && (DATA.lateText[c.id][String(rel.stage || 0)] || DATA.lateText[c.id]["0"])) || [];
        return pickLine(bank) || `${c.name}: "still awake?"`;
      },
      choices: [
        { label: "Say something real", hint: "Affection +6", run: () => {
          const rel = state.relationships[state.focusId];
          rel.affection = clamp(rel.affection + 6);
          fx("click");
          return lateReply("sweet");
        } },
        { label: "Play it cool", hint: "Heat +6 / Trust -1", run: () => {
          const rel = state.relationships[state.focusId];
          rel.heat = clamp(rel.heat + 6);
          rel.trust = clamp(rel.trust - 1);
          return lateReply("cool");
        } },
        { label: "Leave on read", hint: "Drama +5", run: () => {
          const rel = state.relationships[state.focusId];
          rel.drama = clamp(rel.drama + 5);
          rel.affection = clamp(rel.affection - 2);
          return lateReply("ignore");
        } }
      ]
    },
    {
      id: "gala",
      weight: 2,
      title: "Gala invite",
      text: "An industry gala tonight. Tickets aren't cheap, but everyone who matters will be in the room.",
      choices: [
        { label: "Buy in ($300)", hint: "REP +8 / CHR +2", req: { cash: 300 }, run: () => {
          state.cash = roundCents(state.cash - 300);
          state.reputation = clamp(state.reputation + 8);
          state.charm = clamp(state.charm + 2);
          fx("cash");
          return "You work the room like you belong there. By midnight, you do.";
        } },
        { label: "Stay in", hint: "No cost", run: () => {
          state.mood = clamp(state.mood + 2);
          return "You skip it. Quiet night, clear head.";
        } }
      ]
    },
    {
      id: "loan_pressure",
      weight: 2,
      title: "The lender calls",
      text: "Your lender 'reminds' you the rate climbs the longer the balance lingers.",
      choices: [
        { label: "Pay $300 down", hint: "DEBT -$300", req: { cash: 300 }, run: () => {
          state.cash = roundCents(state.cash - 300);
          state.debt = roundCents(Math.max(0, state.debt - 300));
          state.mood = clamp(state.mood + 3);
          fx("cash");
          return "You knock $300 off the balance. The voice on the phone softens.";
        } },
        { label: "Stall again", hint: "Debt grows", run: () => {
          const bump = roundCents(state.debt * 0.03);
          state.debt = roundCents(state.debt + bump);
          state.mood = clamp(state.mood - 3);
          return `You buy time. The balance climbs ${money(bump)}.`;
        } }
      ]
    },
    {
      id: "street_dice",
      weight: 2,
      title: "Three-card hustle",
      text: "A guy with a folding table offers double-or-nothing on $60. \"Easy money, my friend.\"",
      choices: [
        { label: "Play ($60)", hint: "~45% to double", req: { cash: 60 }, run: () => {
          if (Math.random() < 0.45) {
            state.cash = roundCents(state.cash + 60);
            state.risk = clamp(state.risk + 4);
            fx("win"); fxFloat("+$60", "good", "metric-chip");
            return "You actually win. He grins like he let you.";
          }
          state.cash = roundCents(state.cash - 60);
          state.risk = clamp(state.risk + 4);
          fx("lose"); fxFloat("-$60", "bad", "metric-chip");
          return "The card was never where you thought. Down $60.";
        } },
        { label: "Walk on", hint: "INT +1", run: () => {
          state.intelligence = clamp(state.intelligence + 1);
          return "You know better. You keep walking.";
        } }
      ]
    },
    {
      id: "good_day",
      weight: 2,
      title: "Small mercy",
      text: "Sun's out, the coffee's on the house, and a stranger holds the door.",
      choices: [
        { label: "Soak it in", hint: "MOOD +8 / EN +6", run: () => {
          state.mood = clamp(state.mood + 8);
          state.energy = clamp(state.energy + 6);
          return "For once the city isn't trying to take anything from you.";
        } }
      ]
    }
  ];

  function rollEvent() {
    const total = EVENTS.reduce((sum, ev) => sum + (ev.weight || 1), 0);
    let pick = Math.random() * total;
    for (const ev of EVENTS) {
      pick -= ev.weight || 1;
      if (pick <= 0) return ev;
    }
    return EVENTS[0];
  }

  function eventText(ev, focus, rel) {
    let t = ev.text;
    if (typeof t === "function") t = t(focus, rel);
    if (Array.isArray(t)) t = pickLine(t);
    return fillTemplate(t || "", convoCtx(focus, rel));
  }

  function triggerEvent(id) {
    const ev = EVENTS.find((item) => item.id === id);
    if (!ev || state.won) return;
    closePlayPanel();
    pendingEvent = ev;
    const focus = characterById(state.focusId);
    const rel = state.relationships[focus.id];
    const text = eventText(ev, focus, rel);
    const choices = ev.choices.map((choice, index) => {
      const missing = choice.req ? missingText(choice.req) : "";
      return `
        <button class="choice-button ${missing ? "locked" : ""}" type="button" data-event-choice="${index}">
          <strong>${choice.label}</strong>
          ${choice.req ? reqBadges(choice.req) : ""}
          <span>${choice.hint || ""}${missing ? ` / Missing ${missing}` : ""}</span>
        </button>
      `;
    }).join("");
    openModal(ev.title, `<p>${text}</p><div class="choice-grid panel-gap">${choices}</div>`);
    fx("tab");
  }

  function resolveEvent(index) {
    if (!pendingEvent) return;
    const choice = pendingEvent.choices[index];
    if (!choice) return;
    if (choice.req) {
      const missing = missingText(choice.req);
      if (missing) {
        showToast(`Missing ${missing}.`);
        fx("error");
        return;
      }
    }
    const ev = pendingEvent;
    pendingEvent = null;
    const focus = characterById(state.focusId);
    const rel = state.relationships[focus.id];
    const result = fillTemplate(choice.run() || "", convoCtx(focus, rel));
    addHistory(`${ev.title}: ${result}`);
    saveState();
    render();
    openModal(ev.title, `
      <p>${result}</p>
      <button class="primary-button wide-button panel-gap" type="button" id="event-done">Continue</button>
    `);
  }

  function clamp(value, min = 0, max = 100) {
    return Math.max(min, Math.min(max, value));
  }

  function roundCents(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  function money(value, decimals = 0) {
    const number = Number(value) || 0;
    const sign = number < 0 ? "-" : "";
    const amount = Math.abs(number).toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
    return `${sign}$${amount}`;
  }

  function marketMoney(value) {
    return money(value, Math.abs(Number(value) || 0) >= 1000 ? 0 : 2);
  }

  function pct(value) {
    const number = Number(value) || 0;
    const sign = number > 0 ? "+" : "";
    return `${sign}${(number * 100).toFixed(1)}%`;
  }

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function slug(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "scene";
  }

  function freshState() {
    const base = JSON.parse(JSON.stringify(DATA.startingState));
    base.relationships = {};
    DATA.characters.forEach((character, index) => {
      base.relationships[character.id] = {
        affection: 18 + index * 4,
        trust: 14 + index * 3,
        heat: 8 + index * 2,
        drama: 4,
        stage: 0
      };
    });
    migrateState(base, true);
    return base;
  }

  function migrateState(target, isFresh = false) {
    target.relationships = target.relationships || {};
    DATA.characters.forEach((character) => {
      if (!target.relationships[character.id]) {
        target.relationships[character.id] = { affection: 12, trust: 10, heat: 5, drama: 6, stage: 0 };
      }
      if (typeof target.relationships[character.id].stage !== "number") {
        target.relationships[character.id].stage = 0;
      }
    });

    target.portfolio = target.portfolio || {};
    target.portfolio.assets = target.portfolio.assets || {};
    const hadCostBasis = Boolean(target.portfolio.avgCost);
    target.portfolio.avgCost = target.portfolio.avgCost || {};
    target.portfolio.lastPrices = target.portfolio.lastPrices || {};
    target.portfolio.dividendsEarned = Number(target.portfolio.dividendsEarned) || 0;
    target.prices = target.prices || {};
    target.marketChanges = target.marketChanges || {};

    DATA.marketAssets.forEach((asset) => {
      if (typeof target.portfolio.assets[asset.id] !== "number") target.portfolio.assets[asset.id] = 0;
      if (typeof target.portfolio.avgCost[asset.id] !== "number") target.portfolio.avgCost[asset.id] = 0;
      if (typeof target.prices[asset.id] !== "number" || (!hadCostBasis && !isFresh)) {
        target.prices[asset.id] = asset.startPrice;
      }
      if (typeof target.portfolio.lastPrices[asset.id] !== "number") {
        target.portfolio.lastPrices[asset.id] = target.prices[asset.id];
      }
      if (!hadCostBasis && target.portfolio.assets[asset.id] > 0) {
        target.portfolio.avgCost[asset.id] = target.prices[asset.id];
      }
      if (typeof target.marketChanges[asset.id] !== "number") target.marketChanges[asset.id] = 0;
    });

    target.history = Array.isArray(target.history) ? target.history : [];
    target.risk = typeof target.risk === "number" ? target.risk : 20;
    target.sceneName = target.sceneName || "character_card";
    target.backgroundId = target.backgroundId || "loft";
    target.focusId = target.focusId || "mara";
    target.mediaCharacterId = target.mediaCharacterId || target.focusId || "mara";
    target.objectivesDone = target.objectivesDone && typeof target.objectivesDone === "object" ? target.objectivesDone : {};
    target.won = Boolean(target.won);
    target.tipAsset = target.tipAsset || null;
    target.giftLog = target.giftLog && typeof target.giftLog === "object" ? target.giftLog : {};
    target.beatsSeen = target.beatsSeen && typeof target.beatsSeen === "object" ? target.beatsSeen : {};
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
      state = saved && saved.version === DATA.version ? saved.state : freshState();
    } catch {
      state = freshState();
    }
    migrateState(state);
  }

  function saveState() {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: DATA.version, state }));
  }

  async function refreshMediaManifest() {
    try {
      const response = await fetch(`${MANIFEST_URL}?v=${Date.now()}`, { cache: "no-store" });
      if (response.ok) {
        manifest = await response.json();
      }
    } catch {
      manifest = null;
    }
    renderMedia();
    return manifest;
  }

  function characterById(id) {
    return DATA.characters.find((character) => character.id === id) || DATA.characters[0];
  }

  function backgroundById(id) {
    return DATA.backgrounds.find((background) => background.id === id) || DATA.backgrounds[0];
  }

  function assetById(id) {
    return DATA.marketAssets.find((asset) => asset.id === id) || DATA.marketAssets[0];
  }

  function manifestCharacter(id) {
    return manifest && manifest.characters ? manifest.characters[id] : null;
  }

  function manifestBackground(id) {
    return manifest && manifest.backgrounds ? manifest.backgrounds[id] : null;
  }

  function getScene(characterId, sceneName = "character_card") {
    const fromManifest = manifestCharacter(characterId);
    if (fromManifest && fromManifest.scenes && fromManifest.scenes[sceneName]) {
      return fromManifest.scenes[sceneName];
    }
    if (sceneName === "character_card") {
      const person = characterId === DATA.player.id ? DATA.player : characterById(characterId);
      return { type: "image", path: person.image, prompt: person.prompt };
    }
    return null;
  }

  function sceneExists(characterId, sceneName) {
    return Boolean(getScene(characterId, sceneName));
  }

  function routeSceneForSpot(characterId, spotId) {
    const sceneMap = {
      coffee: "cafe_date",
      roofbar: "rooftop_scene",
      gallery: characterId === "mara" ? "market_scene" : "cafe_date",
      training: "rooftop_scene"
    };
    const candidate = sceneMap[spotId] || "character_card";
    return sceneExists(characterId, candidate) ? candidate : "character_card";
  }

  function getBackground(id) {
    const fromManifest = manifestBackground(id);
    if (fromManifest) return fromManifest;
    const fromData = backgroundById(id);
    return { name: fromData.name, path: fromData.image, prompt: fromData.prompt };
  }

  function sceneKey(ctx) {
    return `${ctx.characterId}:${ctx.sceneName || "character_card"}`;
  }

  function findTransition(fromCtx, toCtx) {
    if (!manifest || !Array.isArray(manifest.transitionVideos) || !fromCtx || !toCtx) return null;
    const from = sceneKey(fromCtx);
    const to = sceneKey(toCtx);
    return manifest.transitionVideos.find((item) => item.from === from && item.to === to && item.path);
  }

  function setMediaElement(type, path, title, kicker, bgPath) {
    els.mediaBg.style.backgroundImage = bgPath ? `url("${bgPath}")` : "";
    els.sceneKicker.textContent = kicker;
    els.sceneTitle.textContent = title;

    els.transitionVideo.classList.add("hidden");
    els.transitionVideo.removeAttribute("src");

    if (type === "video" && path) {
      els.sceneImage.classList.add("hidden");
      els.sceneVideo.classList.remove("hidden");
      if (els.sceneVideo.getAttribute("src") !== path) {
        els.sceneVideo.src = path;
      }
      els.sceneVideo.loop = true;
      els.sceneVideo.muted = true;
      els.sceneVideo.play().catch(() => {});
      return;
    }

    els.sceneVideo.pause();
    els.sceneVideo.classList.add("hidden");
    els.sceneVideo.removeAttribute("src");
    els.sceneImage.classList.remove("hidden");
    els.sceneImage.src = path || "";
    els.sceneImage.alt = title;
  }

  function showTargetMedia(ctx) {
    const isPlayer = ctx.characterId === DATA.player.id;
    const person = isPlayer ? DATA.player : characterById(ctx.characterId);
    const scene = getScene(ctx.characterId, ctx.sceneName);
    const background = getBackground(ctx.backgroundId || person.backgroundId || "loft");
    // if the player's home-base image hasn't been generated yet, show the room itself
    const fallbackPath = isPlayer && background ? background.path : person.image;
    const mediaPath = (scene && (scene.loopVideo || scene.path)) || fallbackPath;
    const mediaType = scene && scene.loopVideo ? "video" : "image";
    const homeScene = isPlayer && ctx.sceneName && ctx.sceneName.startsWith("home");
    const title = homeScene ? "Home base" : person.name;
    const kicker = homeScene ? "Your loft" : (ctx.sceneName || "character_card").replace(/_/g, " ");
    currentMedia = { ...ctx };
    state.mediaCharacterId = ctx.characterId;
    state.focusId = isPlayer ? state.focusId : ctx.characterId;
    state.sceneName = ctx.sceneName || "character_card";
    state.backgroundId = ctx.backgroundId || state.backgroundId;
    setMediaElement(mediaType, mediaPath, title, kicker, background && background.path);
    renderCharacterStrip();
    renderDateCard();
    saveState();
  }

  function switchMedia(nextCtx) {
    const transition = findTransition(currentMedia, nextCtx);
    if (!transition) {
      showTargetMedia(nextCtx);
      return;
    }

    const fallback = window.setTimeout(() => showTargetMedia(nextCtx), 5200);
    els.transitionVideo.classList.remove("hidden");
    els.transitionVideo.loop = false;
    els.transitionVideo.muted = true;
    els.transitionVideo.src = transition.path;
    els.transitionVideo.onended = () => {
      window.clearTimeout(fallback);
      showTargetMedia(nextCtx);
    };
    els.transitionVideo.onerror = () => {
      window.clearTimeout(fallback);
      showTargetMedia(nextCtx);
    };
    els.transitionVideo.play().catch(() => {
      window.clearTimeout(fallback);
      showTargetMedia(nextCtx);
    });
  }

  function renderMedia() {
    const mediaId = state.mediaCharacterId || state.focusId;
    const person = mediaId === DATA.player.id ? DATA.player : characterById(mediaId);
    showTargetMedia({
      characterId: mediaId,
      sceneName: state.sceneName || "character_card",
      backgroundId: state.backgroundId || person.backgroundId || "loft"
    });
  }

  function showHomeBase() {
    const scene = state.slot === 3 && sceneExists(DATA.player.id, "home_night") ? "home_night" : "home_base";
    switchMedia({ characterId: DATA.player.id, sceneName: scene, backgroundId: "loft" });
    render();
  }

  function portfolioValue() {
    return DATA.marketAssets.reduce((total, asset) => (
      total + (state.portfolio.assets[asset.id] || 0) * state.prices[asset.id]
    ), 0);
  }

  function portfolioCost() {
    return DATA.marketAssets.reduce((total, asset) => (
      total + (state.portfolio.assets[asset.id] || 0) * (state.portfolio.avgCost[asset.id] || 0)
    ), 0);
  }

  function dividendEstimate() {
    return DATA.marketAssets.reduce((total, asset) => (
      total + (state.portfolio.assets[asset.id] || 0) * state.prices[asset.id] * asset.dividendYield
    ), 0);
  }

  function renderTopbar() {
    const net = netWorth();
    const metrics = [
      ["Cash", money(state.cash), state.cash < 0 ? "warn" : ""],
      ["Debt", money(state.debt), state.debt > 0 ? "warn" : "good"],
      ["Net worth", money(net), net >= 0 ? "good" : "warn"]
    ];
    const [label, value, tone] = metrics[topMetric % metrics.length];
    els.metricLabel.textContent = label;
    els.metricValue.textContent = value;
    els.metricChip.classList.remove("warn", "good");
    if (tone) els.metricChip.classList.add(tone);

    const en = clamp(Math.round(state.energy));
    els.topEnergy.textContent = en;
    els.topEnergyBar.style.width = `${en}%`;
    els.topEnergyChip.classList.toggle("low", en < 30 && en >= 15);
    els.topEnergyChip.classList.toggle("critical", en < 15);
  }

  function renderActionBar() {
    document.querySelectorAll(".action-button[data-en]").forEach((btn) => {
      const need = Number(btn.dataset.en) || 0;
      btn.classList.toggle("cant-afford", state.energy < need);
    });
    // rest button: cool blue when fresh, warming to amber/yellow as energy drops
    const rest = document.querySelector(".rest-button");
    if (rest) {
      const en = state.energy;
      rest.classList.toggle("rest-tired", en < 40 && en >= 18);
      rest.classList.toggle("rest-spent", en < 18);
    }
  }

  function renderStatus() {
    const holdings = portfolioValue();
    const net = netWorth();
    els.netLabel.textContent = `Net ${money(net)}`;

    const resources = [
      ["Cash", money(state.cash), ""],
      ["Debt", money(state.debt), state.debt > 0 ? "warn" : "good"],
      ["Holdings", marketMoney(holdings), ""],
      ["Net worth", money(net), net >= 0 ? "good" : "warn"]
    ];
    els.resourceGrid.innerHTML = resources.map(([label, value, tone]) => `
      <div class="resource-cell ${tone}">
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    `).join("");

    const attributes = [
      ["Energy", state.energy],
      ["Mood", state.mood],
      ["Charm", state.charm],
      ["Fitness", state.fitness],
      ["Intellect", state.intelligence],
      ["Reputation", state.reputation]
    ];
    els.attrList.innerHTML = attributes.map(([label, value]) => {
      const v = clamp(Math.round(value));
      return `
        <div class="attr-row">
          <span>${label}</span>
          <div class="meter"><i style="width:${v}%"></i></div>
          <b>${v}</b>
        </div>
      `;
    }).join("");
  }

  function renderObjectives() {
    const done = state.objectivesDone || {};
    els.objectiveList.innerHTML = OBJECTIVES.map((obj) => {
      const complete = Boolean(done[obj.id]) || obj.done();
      const progress = Math.round((obj.progress ? obj.progress() : (complete ? 1 : 0)) * 100);
      return `
        <div class="objective-row ${complete ? "done" : ""}">
          <div class="objective-top"><span>${complete ? "✓ " : ""}${obj.label}</span><b>${progress}%</b></div>
          <div class="meter"><i style="width:${progress}%"></i></div>
        </div>
      `;
    }).join("");
    const completed = OBJECTIVES.filter((obj) => Boolean(done[obj.id]) || obj.done()).length;
    els.goalProgress.textContent = `${completed}/${OBJECTIVES.length}`;
  }

  function checkObjectives() {
    if (objectiveGuard) return;
    state.objectivesDone = state.objectivesDone || {};
    let changed = false;
    OBJECTIVES.forEach((obj) => {
      if (!state.objectivesDone[obj.id] && obj.done()) {
        state.objectivesDone[obj.id] = true;
        changed = true;
        if (obj.reward) {
          if (obj.reward.cash) state.cash = roundCents(state.cash + obj.reward.cash);
          if (obj.reward.mood) state.mood = clamp(state.mood + obj.reward.mood);
        }
        const bonus = obj.reward && obj.reward.cash ? ` (+${money(obj.reward.cash)})` : "";
        showToast(`Goal complete: ${obj.label}${bonus}`);
        fx("goal");
        fxFlash("good");
        fxFloat(`✓ ${obj.label}`, "good");
        pulseEdge("goals");
      }
    });
    const freedom = OBJECTIVES.filter((obj) => obj.freedom);
    if (!state.won && freedom.length && freedom.every((obj) => state.objectivesDone[obj.id])) {
      state.won = true;
      changed = true;
      showVictory();
    }
    if (changed) {
      saveState();
      objectiveGuard = true;
      renderTopbar();
      renderStatus();
      renderObjectives();
      objectiveGuard = false;
    }
  }

  function showVictory() {
    fx("bigwin");
    fxConfetti(180);
    openModal("Freedom", `
      <div class="victory-block">
        <div class="victory-mark">🏙️</div>
        <p>Debt cleared. ${money(NET_GOAL)}+ in the bank. Someone who actually wants you waiting at the door.</p>
        <p>${DATA.player.name} made it out of the hole and into the life they were pitching. The city finally feels like yours.</p>
        <button class="primary-button wide-button" type="button" id="victory-continue">Keep building</button>
      </div>
    `);
  }

  function showIntro() {
    openModal("DRK — Desire, Risk & Kapital", `
      <div class="intro-block">
        <p><strong>You wake up in your loft.</strong> Twenty-seven, sharp, and ${money(START_DEBT)} in the hole — two weeks to rent and a whole city of ways to get rich or get humbled.</p>
        <p>Turn ${money(DATA.startingState.cash)} into <strong>freedom, status, and a real love life.</strong></p>
        <ul class="intro-list">
          <li><b>Bottom bar</b> — Work, Trade, Gamble, Train, Date, Rest. Each spends energy and a slice of the day.</li>
          <li><b>Left tabs</b> (You · Goals · Her) — tap them, or swipe in from the left edge, for your stats, goals, and who you're seeing.</li>
          <li><b>Energy</b> up top runs almost everything — Rest or Sleep to recover.</li>
        </ul>
        <button class="primary-button wide-button" type="button" id="intro-begin">Start the day</button>
      </div>
    `);
  }

  function tickerHtml() {
    const pills = DATA.marketAssets.map((asset) => {
      const change = state.marketChanges[asset.id] || 0;
      return `
        <button class="ticker-pill ${change >= 0 ? "up" : "down"}" type="button" data-ticker="${asset.id}">
          <strong>${asset.name}</strong> ${marketMoney(state.prices[asset.id])}
          <em>${pct(change)}</em>
          <span>x ${state.portfolio.assets[asset.id] || 0}</span>
        </button>
      `;
    }).join("");
    return `<div class="ticker">${pills}</div>`;
  }

  function renderNotchFocus() {
    document.querySelectorAll(".edge-tab[data-girl]").forEach((tab) => {
      tab.classList.toggle("focus", tab.dataset.girl === state.focusId);
    });
  }

  function renderCharacterStrip() {
    if (!els.characterStrip) return;
    els.focusLabel.textContent = `Focus: ${characterById(state.focusId).name}`;
    els.characterStrip.innerHTML = DATA.characters.map((character) => {
      const rel = state.relationships[character.id];
      const active = character.id === state.focusId ? "active" : "";
      return `
        <button class="character-chip ${active}" type="button" data-character="${character.id}">
          <img src="${character.image}" alt="${character.name}">
          <span>
            <strong>${character.name}</strong>
            <span>${relationshipLabel(rel)} · ${rel.affection}♥</span>
          </span>
        </button>
      `;
    }).join("");
  }

  function rewardsForCharacter(characterId) {
    return DATA.galleryRewards[characterId] || DATA.galleryRewards.default || [];
  }

  function renderRewardGallery(character, rel) {
    const debugPreview = document.body.classList.contains("debug-enabled");
    const rewards = rewardsForCharacter(character.id);
    const cards = rewards.map((reward) => {
      const scene = getScene(character.id, reward.sceneName);
      const unlocked = rel.stage >= reward.stage && Boolean(scene);
      const canPreview = unlocked || debugPreview;
      const locked = unlocked ? "" : "locked";
      const badge = scene && scene.loopVideo ? "LOOP" : "IMG";
      const requirement = scene ? `Stage ${reward.stage}` : "Not generated";
      const status = unlocked ? "Unlocked" : (debugPreview ? "Debug preview" : requirement);
      const thumb = scene && scene.path && canPreview
        ? `<img src="${scene.path}" alt="${reward.label}">`
        : `<span class="reward-placeholder">${reward.stage}</span>`;
      return `
        <button class="reward-card ${locked}" type="button"
          data-reward-character="${character.id}"
          data-reward-scene="${reward.sceneName}"
          data-reward-stage="${reward.stage}"
          data-reward-preview="${canPreview ? "1" : "0"}">
          ${thumb}
          <span><b>${reward.label}</b><small>${badge} / ${status}</small></span>
        </button>
      `;
    }).join("");
    return `
      <div class="reward-section">
        <div class="block-header"><span>Won Media</span><span class="muted-label">${character.name}</span></div>
        <div class="reward-grid">${cards}</div>
      </div>
    `;
  }

  function renderDateCard() {
    const character = characterById(state.focusId);
    const rel = state.relationships[character.id];
    els.dateCard.innerHTML = `
      <h2>${character.name}</h2>
      <div class="muted-label">${character.age} / ${character.role}</div>
      <p>${character.vibe}</p>
      ${relGridHtml(rel)}
      ${renderRewardGallery(character, rel)}
    `;
  }

  function render() {
    els.dayLabel.textContent = `Day ${state.day}`;
    els.slotLabel.textContent = DATA.slots[state.slot] || DATA.slots[0];
    document.body.dataset.slot = String(state.slot);
    els.playerName.textContent = DATA.player.name;
    els.storyText.textContent = state.story;
    els.storyBlock.classList.toggle("collapsed", storyCollapsed);
    if (els.storyToggle) {
      els.storyToggle.textContent = storyCollapsed ? "▾" : "▴";
      els.storyToggle.setAttribute("aria-label", storyCollapsed ? "Expand" : "Minimize");
    }
    renderTopbar();
    renderActionBar();
    renderStatus();
    renderObjectives();
    renderNotchFocus();
    renderCharacterStrip();
    renderDateCard();
    checkObjectives();
  }

  function addHistory(text) {
    state.history.unshift({ day: state.day, slot: DATA.slots[state.slot], text });
    state.history = state.history.slice(0, 30);
    state.story = text;
    storyCollapsed = false; // a fresh beat auto-expands Latest; the player can minimize it
    if (els.storyBlock) {
      els.storyBlock.classList.add("just-updated");
      window.clearTimeout(addHistory._glow);
      addHistory._glow = window.setTimeout(() => {
        if (els.storyBlock) els.storyBlock.classList.remove("just-updated");
      }, 2400);
    }
  }

  function payDailyDividends() {
    const dividends = roundCents(dividendEstimate());
    if (dividends > 0) {
      state.cash = roundCents(state.cash + dividends);
      state.portfolio.dividendsEarned = roundCents(state.portfolio.dividendsEarned + dividends);
    }
    return dividends;
  }

  function advanceMarkets() {
    const tip = state.tipAsset;
    DATA.marketAssets.forEach((asset) => {
      const oldPrice = Number(state.prices[asset.id]) || asset.startPrice;
      const [minMove, maxMove] = asset.volatility;
      const isTipped = asset.id === tip;
      const move = isTipped ? Math.max(maxMove, 0.12) : minMove + Math.random() * (maxMove - minMove);
      const moodBias = (state.mood - 50) / 500;
      const upChance = clamp(0.5 + moodBias, 0.35, 0.65);
      const direction = isTipped ? 1 : (Math.random() < upChance ? 1 : -1);
      const nextPrice = Math.max(0.5, oldPrice * (1 + direction * move));
      state.portfolio.lastPrices[asset.id] = oldPrice;
      state.prices[asset.id] = roundCents(nextPrice);
      state.marketChanges[asset.id] = direction * move;
    });
    if (tip) state.tipAsset = null;
  }

  function advanceTurn(text, options = {}) {
    const energyCost = Number(options.energyCost) || 0;
    const moodCost = options.moodCost === undefined ? 1 : Number(options.moodCost);
    if (energyCost > 0 && !spendEnergy(energyCost)) return false;

    addHistory(text);
    state.mood = clamp(state.mood - moodCost);
    state.slot += 1;

    let dayRolled = false;
    if (state.slot >= DATA.slots.length) {
      dayRolled = true;
      state.slot = 0;
      state.day += 1;
      state.energy = clamp(state.energy + 38);
      state.mood = clamp(state.mood + 5);
      const dividends = payDailyDividends();
      const interest = state.debt > 0 ? Math.max(1, roundCents(state.debt * 0.006)) : 0;
      state.debt = roundCents(state.debt + interest);
      advanceMarkets();
      const dividendText = dividends > 0 ? ` Dividends paid ${money(dividends, 2)}.` : "";
      const debtText = interest > 0 ? ` Debt interest added ${money(interest)}.` : "";
      addHistory(`${text} A new day starts. Prices moved overnight.${dividendText}${debtText}`);
    }

    saveState();
    render();

    if (dayRolled) {
      fx("newday");
      if (!state.won && !pendingEvent && Math.random() < EVENT_CHANCE) {
        const ev = rollEvent();
        window.setTimeout(() => triggerEvent(ev.id), 70);
      }
    }
    return true;
  }

  function openModal(title, html) {
    closeAllDrawers();
    els.modalTitle.textContent = title;
    els.modalBody.innerHTML = html;
    els.gameModal.classList.remove("hidden");
  }

  function closeModal() {
    els.gameModal.classList.add("hidden");
    els.modalBody.innerHTML = "";
  }

  function setPlayPanelMinimized(value) {
    els.playPanel.classList.toggle("minimized", Boolean(value));
    els.playPanelCollapse.textContent = value ? "Expand" : "Minimize";
  }

  function openPlayPanel(kicker, title, html, options = {}) {
    closeModal();
    closeAllDrawers();
    els.playPanelKicker.textContent = kicker;
    els.playPanelTitle.textContent = title;
    els.playPanelBody.innerHTML = html;
    els.playPanel.classList.remove("hidden");
    document.body.classList.add("panel-open");
    setPlayPanelMinimized(Boolean(options.minimized));
  }

  function closePlayPanel() {
    els.playPanel.classList.add("hidden");
    els.playPanelBody.innerHTML = "";
    document.body.classList.remove("panel-open");
  }

  // ---------- mobile side drawers (You / Goals / Her) ----------
  function closeAllDrawers() {
    document.querySelectorAll("[data-drawer-panel]").forEach((panel) => panel.classList.remove("open"));
    document.querySelectorAll(".edge-tab").forEach((tab) => tab.classList.remove("active"));
    if (els.drawerBackdrop) els.drawerBackdrop.classList.remove("show");
  }

  function toggleDrawer(name) {
    const panel = document.querySelector(`[data-drawer-panel="${name}"]`);
    if (!panel) return;
    const willOpen = !panel.classList.contains("open");
    closeAllDrawers();
    if (willOpen) {
      panel.classList.add("open");
      const tab = document.querySelector(`.edge-tab[data-drawer="${name}"]`);
      if (tab) {
        tab.classList.add("active");
        tab.classList.remove("pulse");
      }
      if (els.drawerBackdrop) els.drawerBackdrop.classList.add("show");
      fx("tab");
    }
  }

  function pulseEdge(name) {
    let tab = document.querySelector(`.edge-tab[data-drawer="${name}"]`);
    if (name === "her") tab = document.querySelector(`.edge-tab[data-girl="${state.focusId}"]`);
    if (tab && window.matchMedia("(max-width: 759px)").matches) {
      tab.classList.add("pulse");
      window.setTimeout(() => tab.classList.remove("pulse"), 2600);
    }
  }

  function openNamedDrawer(name) {
    closeAllDrawers();
    const panel = document.querySelector(`[data-drawer-panel="${name}"]`);
    if (!panel) return;
    panel.classList.add("open");
    if (els.drawerBackdrop) els.drawerBackdrop.classList.add("show");
    const tab = document.querySelector(`.edge-tab[data-drawer="${name}"]`);
    if (tab) tab.classList.add("active");
    fx("tab");
  }

  function setFocusGirl(id) {
    const character = characterById(id);
    switchMedia({ characterId: id, sceneName: "character_card", backgroundId: character.backgroundId });
    render();
  }

  // a girl notch focuses her (big on the stage) and opens her detail drawer; tap again to close
  function onGirlNotch(id) {
    const herPanel = document.querySelector('[data-drawer-panel="her"]');
    const herOpen = herPanel && herPanel.classList.contains("open");
    if (state.focusId === id && herOpen) {
      closeAllDrawers();
      return;
    }
    setFocusGirl(id);
    openNamedDrawer("her");
  }

  function settingsHtml() {
    const sound = window.DRKFX ? !window.DRKFX.isMuted() : true;
    const music = window.DRKFX ? window.DRKFX.isMusic() : false;
    return `
      <div class="settings-block">
        <div class="block-header"><span>Audio</span></div>
        <div class="choice-grid two-col">
          <button class="choice-button toggle-row ${sound ? "on" : ""}" type="button" data-toggle="sound">
            <strong>Sound effects</strong><span class="toggle-state">${sound ? "On" : "Off"}</span>
          </button>
          <button class="choice-button toggle-row ${music ? "on" : ""}" type="button" data-toggle="music">
            <strong>Music</strong><span class="toggle-state">${music ? "On" : "Off"}</span>
          </button>
        </div>
        <div class="block-header panel-gap"><span>Game</span></div>
        <button class="danger-button wide-button" type="button" id="settings-reset">Reset game</button>
        <p class="muted-label panel-gap">DRK v0.1 — tap the DRK logo to toggle debug (dev only).</p>
      </div>
    `;
  }

  function openSettings() {
    openModal("Settings", settingsHtml());
  }

  function renderSettings() {
    if (!els.gameModal.classList.contains("hidden")) {
      els.modalBody.innerHTML = settingsHtml();
    }
  }

  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 3000);
  }

  function spendEnergy(cost) {
    if (state.energy < cost) {
      showToast(`Need EN ${cost}; you have EN ${Math.round(state.energy)}. Try Rest.`);
      fx("error");
      return false;
    }
    state.energy = clamp(state.energy - cost);
    return true;
  }

  function currentReqValue(key) {
    if (key === "cash") return state.cash;
    return Number(state[key]) || 0;
  }

  function unmetReqs(req = {}) {
    return Object.entries(req).filter(([key, needed]) => currentReqValue(key) < needed);
  }

  function reqBadges(req = {}) {
    return `
      <div class="req-badges">
        ${Object.entries(req).map(([key, needed]) => {
          const current = currentReqValue(key);
          const met = current >= needed;
          const display = key === "cash"
            ? `${money(current)}/${money(needed)}`
            : `${Math.floor(current)}/${needed}`;
          return `<span class="req-badge ${met ? "met" : "missing"}"><b>${STAT_LABELS[key] || key.toUpperCase()}</b> ${display}</span>`;
        }).join("")}
      </div>
    `;
  }

  function missingText(req = {}) {
    const missing = unmetReqs(req);
    if (!missing.length) return "";
    return missing.map(([key, needed]) => {
      const current = currentReqValue(key);
      return `${STAT_LABELS[key] || key.toUpperCase()} ${key === "cash" ? money(current) : Math.floor(current)}/${key === "cash" ? money(needed) : needed}`;
    }).join(", ");
  }

  function openWorkPanel() {
    const jobs = DATA.jobs.map((job) => {
      const missing = missingText(job.req);
      const locked = missing ? "locked" : "";
      const gainText = Object.entries(job.stats || {})
        .map(([key, value]) => `${STAT_LABELS[key] || key.toUpperCase()} ${value > 0 ? "+" : ""}${value}`)
        .join(" / ");
      return `
        <button class="choice-button job-choice ${locked}" type="button" data-job="${job.id}">
          <strong>${job.name} / ${money(job.pay[0])}-${money(job.pay[1])}</strong>
          ${reqBadges(job.req)}
          <span>${gainText || "No stat change"}${missing ? ` / Missing ${missing}` : ""}</span>
        </button>
      `;
    }).join("");
    openPlayPanel("Work", "Pick a shift", `<div class="choice-grid">${jobs}</div>`);
  }

  function takeJob(jobId) {
    const job = DATA.jobs.find((item) => item.id === jobId);
    if (!job) return;
    const missing = missingText(job.req);
    if (missing) {
      showToast(`Cannot take ${job.name}. Missing ${missing}.`);
      openWorkPanel();
      return;
    }
    if (!spendEnergy(job.energy)) return;
    const pay = randInt(job.pay[0], job.pay[1]) + Math.floor(state.reputation * 0.8);
    state.cash = roundCents(state.cash + pay);
    Object.entries(job.stats || {}).forEach(([key, value]) => {
      state[key] = clamp((state[key] || 0) + value);
    });
    state.jobId = job.id;
    fx("cash");
    fxFloat(`+${money(pay)}`, "good", "metric-chip");
    closePlayPanel();
    advanceTurn(`You worked ${job.name} and cleared ${money(pay)}. Requirements were met, so the shift paid out cleanly.`, { moodCost: 1 });
  }

  function marketSummary() {
    const value = portfolioValue();
    const cost = portfolioCost();
    const profit = value - cost;
    return `
      <div class="market-summary">
        <div><span>Cash</span><strong>${money(state.cash)}</strong></div>
        <div><span>Holdings</span><strong>${marketMoney(value)}</strong></div>
        <div><span>P/L</span><strong class="${profit >= 0 ? "positive" : "negative"}">${marketMoney(profit)}</strong></div>
        <div><span>Dividend/day</span><strong>${money(dividendEstimate(), 2)}</strong></div>
        <div><span>Debt</span><strong>${money(state.debt)}</strong></div>
        <div><span>Paid dividends</span><strong>${money(state.portfolio.dividendsEarned, 2)}</strong></div>
      </div>
    `;
  }

  function openTradePanel() {
    const rows = DATA.marketAssets.map((asset) => {
      const owned = state.portfolio.assets[asset.id] || 0;
      const price = state.prices[asset.id];
      const avg = state.portfolio.avgCost[asset.id] || 0;
      const positionValue = owned * price;
      const positionCost = owned * avg;
      const profit = positionValue - positionCost;
      const change = state.marketChanges[asset.id] || 0;
      const maxBuy = Math.floor(state.cash / price);
      return `
        <article class="market-row" id="market-row-${asset.id}">
          <div class="market-row-head">
            <div>
              <strong>${asset.name}</strong>
              <span>${asset.sector} / ${asset.risk} risk</span>
            </div>
            <div class="market-price">
              <strong>${marketMoney(price)}</strong>
              <span class="${change >= 0 ? "positive" : "negative"}">${pct(change)}</span>
            </div>
          </div>
          <p>${asset.desc}</p>
          <div class="holding-grid">
            <div><span>Owned</span><strong>${owned}</strong></div>
            <div><span>Value</span><strong>${marketMoney(positionValue)}</strong></div>
            <div><span>Avg cost</span><strong>${owned ? marketMoney(avg) : "-"}</strong></div>
            <div><span>P/L</span><strong class="${profit >= 0 ? "positive" : "negative"}">${owned ? marketMoney(profit) : "-"}</strong></div>
            <div><span>Dividend/day</span><strong>${owned ? money(positionValue * asset.dividendYield, 2) : "$0.00"}</strong></div>
            <div><span>Can buy</span><strong>${maxBuy}</strong></div>
          </div>
          <div class="inline-actions">
            <button class="primary-button" type="button" data-buy="${asset.id}">Buy 1</button>
            <button class="ghost-button" type="button" data-buy-max="${asset.id}">Buy max</button>
            <button class="ghost-button" type="button" data-sell="${asset.id}">Sell 1</button>
            <button class="ghost-button" type="button" data-sell-all="${asset.id}">Sell all</button>
          </div>
        </article>
      `;
    }).join("");

    openPlayPanel("Trade", "Market board", `
      <div class="form-grid">
        <div class="trade-ticker">${tickerHtml()}</div>
        <p>Tap a ticker to jump to it. Advancing the market costs EN 1; each stock moves ~2-20% by risk band. Dividends pay at the start of each new day.</p>
        ${marketSummary()}
        <div class="debt-panel">
          <strong>Debt payoff</strong>
          <span>Debt interest hits overnight. Pay it down from cash whenever you want.</span>
          <div class="inline-actions">
            <button class="primary-button" type="button" data-pay-debt="100">Pay $100</button>
            <button class="ghost-button" type="button" data-pay-debt="max">Pay max</button>
          </div>
        </div>
        <div class="market-board">${rows}</div>
        <button class="primary-button wide-button" type="button" data-advance-market="1">Advance market 1 time slot / EN 1</button>
      </div>
    `);
  }

  function buyAsset(assetId, qty = 1) {
    const asset = assetById(assetId);
    const price = state.prices[asset.id];
    const maxQty = Math.floor(state.cash / price);
    const buyQty = Math.min(Math.max(1, qty), maxQty);
    if (buyQty <= 0) {
      showToast(`Need ${marketMoney(price)} cash to buy 1 ${asset.name}.`);
      return;
    }
    const oldQty = state.portfolio.assets[asset.id] || 0;
    const oldCost = oldQty * (state.portfolio.avgCost[asset.id] || 0);
    const newCost = price * buyQty;
    state.cash = roundCents(state.cash - newCost);
    state.portfolio.assets[asset.id] = oldQty + buyQty;
    state.portfolio.avgCost[asset.id] = roundCents((oldCost + newCost) / state.portfolio.assets[asset.id]);
    fx("buy");
    saveState();
    render();
    openTradePanel();
  }

  function sellAsset(assetId, qty = 1) {
    const asset = assetById(assetId);
    const owned = state.portfolio.assets[asset.id] || 0;
    const sellQty = Math.min(Math.max(1, qty), owned);
    if (sellQty <= 0) {
      showToast(`You do not own ${asset.name}.`);
      return;
    }
    const proceeds = state.prices[asset.id] * sellQty;
    state.portfolio.assets[asset.id] = owned - sellQty;
    if (state.portfolio.assets[asset.id] <= 0) {
      state.portfolio.assets[asset.id] = 0;
      state.portfolio.avgCost[asset.id] = 0;
    }
    state.cash = roundCents(state.cash + proceeds);
    fx("sell");
    fxFloat(`+${marketMoney(proceeds)}`, "good", "metric-chip");
    saveState();
    render();
    openTradePanel();
  }

  function payDebt(amount) {
    const payment = amount === "max" ? Math.min(state.cash, state.debt) : Math.min(Number(amount) || 0, state.cash, state.debt);
    if (payment <= 0) {
      showToast("No available cash to pay debt.");
      return;
    }
    state.cash = roundCents(state.cash - payment);
    state.debt = roundCents(Math.max(0, state.debt - payment));
    fx("cash");
    fxFloat(`-${money(payment)} debt`, "good", "metric-chip");
    addHistory(`You paid ${money(payment)} toward the debt. Less pressure, less overnight bleed.`);
    saveState();
    render();
    openTradePanel();
  }

  function advanceMarketTick() {
    if (!spendEnergy(1)) return;
    advanceMarkets();
    advanceTurn("You advanced the market one time slot. The board repriced and your holdings marked to market.", { moodCost: 0 });
    openTradePanel();
  }

  function openGamblePanel() {
    casino = casino || { game: null, result: "" };
    openPlayPanel("Casino", "Gamble", gambleHomeHtml());
  }

  function gambleHomeHtml() {
    const games = [
      ["hilo", "Higher / Lower", 4, "Call the next card. Even money, fast."],
      ["blackjack", "Blackjack", 6, "Hit or stand to 21. Blackjack pays 3:2."],
      ["dice", "Street Dice", 4, "Bet the total of two dice. Lucky 7 pays 5x."],
      ["slots", "Lucky Spin", 5, "Match three symbols. Jackpot pays 12x."],
      ["coin", "Double or Nothing", 3, "Heads doubles the pot. Cash out any time."]
    ];
    const cards = games.map(([id, name, en, desc]) => `
      <button class="choice-button" type="button" data-game-open="${id}">
        <strong>${name}</strong>
        ${reqBadges({ cash: Math.min(50, Math.max(10, state.cash)), energy: en })}
        <span>${desc}</span>
      </button>
    `).join("");
    return `
      <div class="casino-panel">
        <p>Five playable games. Energy is charged when a hand starts, the wager is locked, and the turn advances when it resolves.</p>
        <div class="form-row">
          <label for="wager-input">Default wager</label>
          <input id="wager-input" inputmode="numeric" type="number" min="10" step="10" value="${casino && casino.wager ? casino.wager : 50}">
        </div>
        <div class="choice-grid two-col">${cards}</div>
        ${casino && casino.result ? `<div class="casino-result">${casino.result}</div>` : ""}
      </div>
    `;
  }

  function readWager() {
    const input = els.playPanelBody.querySelector("#wager-input");
    const fallback = casino && casino.wager ? casino.wager : 0;
    const wager = Math.max(10, Math.round(Number(input ? input.value : fallback) || 0));
    if (wager > state.cash) {
      showToast(`You have ${money(state.cash)} cash. Lower the wager.`);
      return 0;
    }
    return wager;
  }

  function reserveWager(wager, energyCost) {
    if (!wager) return false;
    if (state.cash < wager) {
      showToast(`Need ${money(wager)} cash for that wager.`);
      return false;
    }
    if (!spendEnergy(energyCost)) return false;
    state.cash = roundCents(state.cash - wager);
    return true;
  }

  function drawCard() {
    return randInt(2, 14);
  }

  function cardLabel(card) {
    return ({ 11: "J", 12: "Q", 13: "K", 14: "A" })[card] || String(card);
  }

  function cardValue(card) {
    if (card === 14) return 11;
    return Math.min(card, 10);
  }

  function handValue(cards) {
    let total = cards.reduce((sum, card) => sum + cardValue(card), 0);
    let aces = cards.filter((card) => card === 14).length;
    while (total > 21 && aces > 0) {
      total -= 10;
      aces -= 1;
    }
    return total;
  }

  function cardHtml(card, hidden = false) {
    return `<span class="playing-card ${hidden ? "hidden-card" : ""}">${hidden ? "?" : cardLabel(card)}</span>`;
  }

  function openHighLowGame() {
    casino = { game: "hilo", wager: casino && casino.wager ? casino.wager : 50, hilo: null, result: "" };
    renderHighLowGame();
  }

  function renderHighLowGame() {
    const hand = casino && casino.hilo;
    const body = hand ? `
      <div class="casino-table">
        <div class="card-row">
          ${cardHtml(hand.first)}
          ${hand.second ? cardHtml(hand.second) : cardHtml(0, true)}
        </div>
        <div class="casino-status">${hand.result || `Wager ${money(casino.wager)} locked. Choose the next card.`}</div>
        ${hand.resolved ? `
          <button class="primary-button" type="button" data-hilo-start="1">Play another hand</button>
        ` : `
          <div class="inline-actions">
            <button class="primary-button" type="button" data-hilo-choice="higher">Higher</button>
            <button class="primary-button" type="button" data-hilo-choice="lower">Lower</button>
          </div>
        `}
      </div>
    ` : `
      <div class="casino-table">
        <p>Energy cost EN 4. The wager is held before the first card appears.</p>
        <div class="form-row">
          <label for="wager-input">Wager</label>
          <input id="wager-input" inputmode="numeric" type="number" min="10" step="10" value="${casino.wager}">
        </div>
        <button class="primary-button" type="button" data-hilo-start="1">Deal first card / EN 4</button>
      </div>
    `;
    openPlayPanel("Casino", "Higher / Lower", `${body}<button class="ghost-button" type="button" data-panel="gamble">Back to casino</button>`);
  }

  function startHighLow() {
    const wager = readWager();
    if (!reserveWager(wager, 4)) return;
    fx("deal");
    casino = { game: "hilo", wager, hilo: { first: drawCard(), second: null, resolved: false, result: "" }, result: "" };
    saveState();
    render();
    renderHighLowGame();
  }

  function resolveHighLow(choice) {
    if (!casino || !casino.hilo || casino.hilo.resolved) return;
    const hand = casino.hilo;
    fx("deal");
    hand.second = drawCard();
    const won = choice === "higher" ? hand.second > hand.first : hand.second < hand.first;
    const push = hand.second === hand.first;
    if (won) state.cash = roundCents(state.cash + casino.wager * 2);
    if (push) state.cash = roundCents(state.cash + casino.wager);
    if (won) { fx("win"); fxFlash("good"); fxFloat(`+${money(casino.wager * 2)}`, "good", "metric-chip"); }
    else if (push) fx("click");
    else { fx("lose"); fxFloat(`-${money(casino.wager)}`, "bad", "metric-chip"); }
    state.risk = clamp(state.risk + (won ? 3 : 5));
    state.mood = clamp(state.mood + (won ? 7 : push ? 1 : -6));
    state.relationships.sienna.heat = clamp(state.relationships.sienna.heat + (won ? 2 : 1));
    hand.resolved = true;
    hand.result = push
      ? `Push. ${cardLabel(hand.second)} matched ${cardLabel(hand.first)}, so your wager came back.`
      : `${won ? "Win" : "Loss"}. You called ${choice}; ${cardLabel(hand.second)} followed ${cardLabel(hand.first)}.`;
    casino.result = hand.result;
    advanceTurn(`Higher / Lower: ${hand.result}`, { moodCost: 0 });
    renderHighLowGame();
  }

  function openBlackjackGame() {
    casino = { game: "blackjack", wager: casino && casino.wager ? casino.wager : 50, blackjack: null, result: "" };
    renderBlackjackGame();
  }

  function renderBlackjackGame() {
    const game = casino && casino.blackjack;
    const dealerCards = game ? game.dealer.map((card, index) => cardHtml(card, !game.resolved && index === 1)).join("") : "";
    const playerCards = game ? game.player.map((card) => cardHtml(card)).join("") : "";
    const body = game ? `
      <div class="casino-table">
        <div class="table-hand">
          <span>Dealer ${game.resolved ? handValue(game.dealer) : "showing " + cardValue(game.dealer[0])}</span>
          <div class="card-row">${dealerCards}</div>
        </div>
        <div class="table-hand">
          <span>You ${handValue(game.player)}</span>
          <div class="card-row">${playerCards}</div>
        </div>
        <div class="casino-status">${game.result || `Wager ${money(casino.wager)} locked. Hit or stand.`}</div>
        ${game.resolved ? `
          <button class="primary-button" type="button" data-blackjack-start="1">Play another hand</button>
        ` : `
          <div class="inline-actions">
            <button class="primary-button" type="button" data-blackjack-hit="1">Hit</button>
            <button class="primary-button" type="button" data-blackjack-stand="1">Stand</button>
          </div>
        `}
      </div>
    ` : `
      <div class="casino-table">
        <p>Energy cost EN 6. Dealer draws to 17. Blackjack pays 3:2.</p>
        <div class="form-row">
          <label for="wager-input">Wager</label>
          <input id="wager-input" inputmode="numeric" type="number" min="10" step="10" value="${casino.wager}">
        </div>
        <button class="primary-button" type="button" data-blackjack-start="1">Deal blackjack / EN 6</button>
      </div>
    `;
    openPlayPanel("Casino", "Blackjack", `${body}<button class="ghost-button" type="button" data-panel="gamble">Back to casino</button>`);
  }

  function startBlackjack() {
    const wager = readWager();
    if (!reserveWager(wager, 6)) return;
    fx("deal");
    casino = {
      game: "blackjack",
      wager,
      blackjack: {
        player: [drawCard(), drawCard()],
        dealer: [drawCard(), drawCard()],
        resolved: false,
        result: ""
      },
      result: ""
    };
    if (handValue(casino.blackjack.player) === 21) finishBlackjack("blackjack");
    saveState();
    render();
    renderBlackjackGame();
  }

  function hitBlackjack() {
    if (!casino || !casino.blackjack || casino.blackjack.resolved) return;
    fx("deal");
    casino.blackjack.player.push(drawCard());
    if (handValue(casino.blackjack.player) > 21) {
      finishBlackjack("bust");
      return;
    }
    renderBlackjackGame();
  }

  function standBlackjack() {
    if (!casino || !casino.blackjack || casino.blackjack.resolved) return;
    const game = casino.blackjack;
    while (handValue(game.dealer) < 17) {
      game.dealer.push(drawCard());
    }
    const player = handValue(game.player);
    const dealer = handValue(game.dealer);
    if (dealer > 21 || player > dealer) finishBlackjack("win");
    else if (player === dealer) finishBlackjack("push");
    else finishBlackjack("loss");
  }

  function finishBlackjack(outcome) {
    const game = casino.blackjack;
    if (!game || game.resolved) return;
    const player = handValue(game.player);
    const dealer = handValue(game.dealer);
    let payout = 0;
    if (outcome === "blackjack") payout = casino.wager * 2.5;
    if (outcome === "win") payout = casino.wager * 2;
    if (outcome === "push") payout = casino.wager;
    if (payout > 0) state.cash = roundCents(state.cash + payout);
    const won = outcome === "blackjack" || outcome === "win";
    state.risk = clamp(state.risk + (won ? 4 : 5));
    state.mood = clamp(state.mood + (won ? 8 : outcome === "push" ? 1 : -7));
    state.relationships.sienna.heat = clamp(state.relationships.sienna.heat + (won ? 2 : 1));
    if (outcome === "blackjack") { fx("bigwin"); fxFlash("good"); fxConfetti(60); fxFloat(`+${money(payout)}`, "good", "metric-chip"); }
    else if (won) { fx("win"); fxFlash("good"); fxFloat(`+${money(payout)}`, "good", "metric-chip"); }
    else if (outcome === "push") fx("click");
    else { fx("lose"); fxFloat(`-${money(casino.wager)}`, "bad", "metric-chip"); }
    game.resolved = true;
    game.result = {
      blackjack: `Blackjack. You had 21 against dealer ${dealer}; payout ${money(payout - casino.wager)} profit.`,
      win: `Win. You had ${player}; dealer had ${dealer}.`,
      push: `Push. You and dealer both had ${player}; wager returned.`,
      loss: `Loss. You had ${player}; dealer had ${dealer}.`,
      bust: `Bust. You went over 21 before the dealer needed to move.`
    }[outcome];
    casino.result = game.result;
    advanceTurn(`Blackjack: ${game.result}`, { moodCost: 0 });
    renderBlackjackGame();
  }

  // ---------- Street Dice (over/under 7) ----------
  function diceFace(n) {
    return ({ 1: "⚀", 2: "⚁", 3: "⚂", 4: "⚃", 5: "⚄", 6: "⚅" })[n] || "?";
  }

  function openDiceGame() {
    casino = { game: "dice", wager: casino && casino.wager ? casino.wager : 50, dice: null, result: "" };
    renderDiceGame();
  }

  function renderDiceGame() {
    const hand = casino && casino.dice;
    const body = hand ? `
      <div class="casino-table">
        <div class="dice-row">
          <span class="die">${diceFace(hand.a)}</span>
          <span class="die">${diceFace(hand.b)}</span>
        </div>
        <div class="casino-status">${hand.result}</div>
        <button class="primary-button" type="button" data-dice-bet="${hand.bet}">Roll ${hand.bet} again</button>
      </div>
    ` : `
      <div class="casino-table">
        <p>Bet the total of two dice. Under 7 and Over 7 pay 2x. Exactly 7 pays 5x. EN 4.</p>
        <div class="form-row">
          <label for="wager-input">Wager</label>
          <input id="wager-input" inputmode="numeric" type="number" min="10" step="10" value="${casino.wager}">
        </div>
        <div class="inline-actions casino-bets">
          <button class="primary-button" type="button" data-dice-bet="under">Under 7</button>
          <button class="primary-button" type="button" data-dice-bet="seven">Lucky 7</button>
          <button class="primary-button" type="button" data-dice-bet="over">Over 7</button>
        </div>
      </div>
    `;
    openPlayPanel("Casino", "Street Dice", `${body}<button class="ghost-button" type="button" data-panel="gamble">Back to casino</button>`);
  }

  function playDice(bet) {
    const wager = readWager();
    if (!reserveWager(wager, 4)) return;
    fx("deal");
    const a = randInt(1, 6);
    const b = randInt(1, 6);
    const sum = a + b;
    let mult = 0;
    if (bet === "under" && sum < 7) mult = 2;
    else if (bet === "over" && sum > 7) mult = 2;
    else if (bet === "seven" && sum === 7) mult = 5;
    const won = mult > 0;
    if (won) state.cash = roundCents(state.cash + wager * mult);
    state.risk = clamp(state.risk + (won ? 3 : 5));
    state.mood = clamp(state.mood + (won ? 6 : -5));
    state.relationships.sienna.heat = clamp(state.relationships.sienna.heat + (won ? 2 : 1));
    const result = won
      ? `Win ${money(wager * mult)}! Total ${sum} on ${bet}.`
      : `Loss. Total ${sum} missed your ${bet} bet.`;
    casino = { game: "dice", wager, dice: { a, b, bet, result }, result };
    if (won) { fx(mult >= 5 ? "bigwin" : "win"); fxFlash("good"); fxFloat(`+${money(wager * mult)}`, "good", "metric-chip"); }
    else { fx("lose"); fxFloat(`-${money(wager)}`, "bad", "metric-chip"); }
    advanceTurn(`Street Dice: ${result}`, { moodCost: 0 });
    renderDiceGame();
  }

  // ---------- Lucky Spin (slots) ----------
  const SLOT_SYMBOLS = ["🍒", "🔔", "⭐", "💎", "7️⃣"];

  function openSlotsGame() {
    casino = { game: "slots", wager: casino && casino.wager ? casino.wager : 50, slots: null, result: "" };
    renderSlotsGame();
  }

  function renderSlotsGame() {
    const s = casino && casino.slots;
    const reels = s ? s.reels : ["❔", "❔", "❔"];
    const body = `
      <div class="casino-table">
        <div class="slot-reels">${reels.map((sym) => `<span class="slot-reel">${sym}</span>`).join("")}</div>
        <div class="casino-status">${s ? s.result : "7️⃣ 7️⃣ 7️⃣ pays 12x, three 💎 pays 8x, any triple 5x, any pair 2x. EN 5."}</div>
        <div class="form-row">
          <label for="wager-input">Wager</label>
          <input id="wager-input" inputmode="numeric" type="number" min="10" step="10" value="${casino.wager}">
        </div>
        <button class="primary-button wide-button" type="button" data-slots-spin="1">Spin / EN 5</button>
        <button class="ghost-button" type="button" data-panel="gamble">Back to casino</button>
      </div>
    `;
    openPlayPanel("Casino", "Lucky Spin", body);
  }

  function spinSlots() {
    const wager = readWager();
    if (!reserveWager(wager, 5)) return;
    fx("spin");
    const reels = [0, 1, 2].map(() => SLOT_SYMBOLS[randInt(0, SLOT_SYMBOLS.length - 1)]);
    const [a, b, c] = reels;
    let mult = 0;
    if (a === b && b === c) mult = a === SLOT_SYMBOLS[4] ? 12 : a === SLOT_SYMBOLS[3] ? 8 : 5;
    else if (a === b || b === c || a === c) mult = 2;
    const won = mult > 0;
    if (won) state.cash = roundCents(state.cash + wager * mult);
    state.risk = clamp(state.risk + (won ? 3 : 4));
    state.mood = clamp(state.mood + (won ? 6 : -5));
    const result = won ? `Win ${money(wager * mult)}! ${mult}x payout.` : `No match. -${money(wager)}.`;
    casino = { game: "slots", wager, slots: { reels, result }, result };
    if (mult >= 8) { fx("bigwin"); fxFlash("good"); fxConfetti(80); }
    else if (won) { fx("win"); fxFlash("good"); }
    else fx("lose");
    if (won) fxFloat(`+${money(wager * mult)}`, "good", "metric-chip");
    else fxFloat(`-${money(wager)}`, "bad", "metric-chip");
    advanceTurn(`Lucky Spin: ${result}`, { moodCost: 0 });
    renderSlotsGame();
  }

  // ---------- Double or Nothing (coin ladder) ----------
  function openCoinGame() {
    casino = { game: "coin", wager: casino && casino.wager ? casino.wager : 50, coin: null, result: "" };
    renderCoinGame();
  }

  function renderCoinGame() {
    const c = casino && casino.coin;
    let body;
    if (!c) {
      body = `
        <div class="casino-table">
          <p>Heads doubles your pot. Tails loses it all. Cash out whenever you like. EN 3 to start.</p>
          <div class="form-row">
            <label for="wager-input">Stake</label>
            <input id="wager-input" inputmode="numeric" type="number" min="10" step="10" value="${casino.wager}">
          </div>
          <button class="primary-button wide-button" type="button" data-coin-start="1">Flip / EN 3</button>
        </div>
      `;
    } else if (!c.resolved) {
      body = `
        <div class="casino-table">
          <div class="coin-face">🪙</div>
          <div class="casino-status">Pot ${money(c.pot)} after ${c.flips} flip${c.flips === 1 ? "" : "s"}. Push your luck?</div>
          <div class="inline-actions">
            <button class="primary-button" type="button" data-coin-flip="1">Flip again</button>
            <button class="primary-button" type="button" data-coin-cash="1">Cash out ${money(c.pot)}</button>
          </div>
        </div>
      `;
    } else {
      body = `
        <div class="casino-table">
          <div class="coin-face">🪙</div>
          <div class="casino-status">${c.result}</div>
          <button class="primary-button" type="button" data-coin-start="1">New ladder</button>
        </div>
      `;
    }
    openPlayPanel("Casino", "Double or Nothing", `${body}<button class="ghost-button" type="button" data-panel="gamble">Back to casino</button>`);
  }

  function startCoin() {
    const wager = readWager();
    if (!reserveWager(wager, 3)) return;
    casino = { game: "coin", wager, coin: { pot: wager, flips: 0, resolved: false, last: null, result: "" }, result: "" };
    flipCoin();
  }

  function flipCoin() {
    if (!casino || !casino.coin || casino.coin.resolved) return;
    const c = casino.coin;
    fx("spin");
    const heads = Math.random() < 0.5;
    c.flips += 1;
    c.last = heads ? "H" : "T";
    if (heads) {
      c.pot = roundCents(c.pot * 2);
      state.mood = clamp(state.mood + 2);
      fx("win"); fxFlash("good");
    } else {
      c.resolved = true;
      c.result = `Tails. The ${money(c.pot)} pot is gone.`;
      state.risk = clamp(state.risk + 5);
      state.mood = clamp(state.mood - 7);
      fx("lose"); fxShake("media-frame");
      advanceTurn(`Double or Nothing: ${c.result}`, { moodCost: 0 });
    }
    renderCoinGame();
  }

  function cashCoin() {
    if (!casino || !casino.coin || casino.coin.resolved) return;
    const c = casino.coin;
    state.cash = roundCents(state.cash + c.pot);
    c.resolved = true;
    c.result = `Cashed out ${money(c.pot)} after ${c.flips} flip${c.flips === 1 ? "" : "s"}.`;
    state.mood = clamp(state.mood + 5);
    fx("cash"); fxFloat(`+${money(c.pot)}`, "good", "metric-chip");
    advanceTurn(`Double or Nothing: ${c.result}`, { moodCost: 0 });
    renderCoinGame();
  }

  function openCasinoGame(id) {
    if (id === "hilo") openHighLowGame();
    else if (id === "blackjack") openBlackjackGame();
    else if (id === "dice") openDiceGame();
    else if (id === "slots") openSlotsGame();
    else if (id === "coin") openCoinGame();
  }

  function openTrainPanel() {
    openPlayPanel("Train", "Build stats", `
      <div class="choice-grid">
        <button class="choice-button" type="button" data-train="study"><strong>Study markets</strong>${reqBadges({ energy: 12 })}<span>INT +5 / REP +1</span></button>
        <button class="choice-button" type="button" data-train="gym"><strong>Gym and recovery</strong>${reqBadges({ energy: 14 })}<span>FIT +5 / MOOD +2</span></button>
        <button class="choice-button" type="button" data-train="social"><strong>Work the room</strong>${reqBadges({ energy: 15 })}<span>CHR +4 / REP +3</span></button>
      </div>
    `);
  }

  function train(kind) {
    const config = {
      study: { cost: 12, stats: { intelligence: 5, reputation: 1 }, text: "You spent the slot reading filings and tracking rumor flow. The charts start making cleaner sense." },
      gym: { cost: 14, stats: { fitness: 5, mood: 2 }, text: "You trained until your shirt stuck to your back. The mirror was kinder afterwards." },
      social: { cost: 15, stats: { charm: 4, reputation: 3 }, text: "You worked the room, remembered names, and left with two warmer contacts." }
    }[kind];
    if (!config || !spendEnergy(config.cost)) return;
    Object.entries(config.stats).forEach(([key, value]) => {
      state[key] = clamp((state[key] || 0) + value);
    });
    const primary = Object.keys(config.stats)[0];
    fx("click");
    fxFloat(`+${config.stats[primary]} ${STAT_LABELS[primary] || primary.toUpperCase()}`, "good");
    closePlayPanel();
    advanceTurn(config.text, { moodCost: 0 });
  }

  function giftsHtml(character) {
    const usedToday = state.giftLog[character.id] === state.day;
    const rows = GIFTS.map((gift) => {
      const missing = missingText({ cash: gift.cost });
      const locked = Boolean(missing) || usedToday;
      return `
        <button class="choice-button gift-choice ${locked ? "locked" : ""}" type="button" data-gift-id="${gift.id}" ${usedToday ? "disabled" : ""}>
          <strong>${gift.name} / ${money(gift.cost)}</strong>
          <span>Affection +${gift.affection} / Heat +${gift.heat}${usedToday ? " / Already gifted today" : (missing ? ` / Missing ${missing}` : "")}</span>
        </button>
      `;
    }).join("");
    return `
      <div class="block-header panel-gap"><span>Bring a gift</span><span class="muted-label">Once a day</span></div>
      <div class="choice-grid two-col">${rows}</div>
    `;
  }

  function buyGift(giftId) {
    const character = characterById(state.focusId);
    const gift = GIFTS.find((item) => item.id === giftId);
    if (!gift) return;
    if (state.giftLog[character.id] === state.day) {
      showToast(`${character.name} already got a gift today.`);
      return;
    }
    const missing = missingText({ cash: gift.cost });
    if (missing) {
      showToast(`Missing ${missing}.`);
      fx("error");
      return;
    }
    state.cash = roundCents(state.cash - gift.cost);
    state.giftLog[character.id] = state.day;
    const rel = state.relationships[character.id];
    const bonus = (character.likes || []).some((like) => like === "cash" || like === "reputation") ? 2 : 0;
    rel.affection = clamp(rel.affection + gift.affection);
    rel.heat = clamp(rel.heat + gift.heat + bonus);
    rel.trust = clamp(rel.trust + (gift.trust || 0));
    fx("cash");
    fxFloat(`-${money(gift.cost)}`, "warn", "metric-chip");
    showToast(`${character.name} liked the ${gift.name.toLowerCase()}.`);
    pulseEdge("her");
    saveState();
    render();
    openDatePanel();
  }

  // ---------- conversation engine: templated, stage- and choice-aware ----------
  function fillTemplate(str, ctx) {
    ctx = ctx || {};
    return String(str).replace(/\{([^{}]+)\}/g, (match, key) => {
      if (key.includes("|")) {
        const opts = key.split("|");
        return opts[randInt(0, opts.length - 1)];
      }
      if (key in ctx) return ctx[key];
      const pool = (DATA.pools || {})[key];
      if (pool && pool.length) return pool[randInt(0, pool.length - 1)];
      return match;
    });
  }

  function pickLine(arr) {
    return Array.isArray(arr) && arr.length ? arr[randInt(0, arr.length - 1)] : "";
  }

  function convoFor(character) {
    return (DATA.conversations || {})[character.id] || {};
  }

  function convoCtx(character, rel) {
    const c = convoFor(character);
    const stage = String(rel.stage || 0);
    return { name: character.name, player: DATA.player.name, nick: (c.nick && c.nick[stage]) || "" };
  }

  function relationshipLabel(rel) {
    if (rel.stage >= 2) return "Together";
    if (rel.stage >= 1) return rel.affection >= 64 ? "Falling for you" : "Seeing each other";
    if (rel.affection >= 50) return "Flirting";
    if (rel.affection >= 32) return "Warming up";
    if (rel.affection >= 18) return "Acquaintance";
    return "Stranger";
  }

  function dateGreeting(character, rel) {
    const c = convoFor(character);
    const stage = String(rel.stage || 0);
    const bank = (c.greet && (c.greet[stage] || c.greet["0"])) || [];
    return fillTemplate(pickLine(bank) || `${character.name} meets your eye.`, convoCtx(character, rel));
  }

  function dateMeetLine(character, rel, spot) {
    const ctx = convoCtx(character, rel);
    ctx.spot = spot.name;
    return fillTemplate(pickLine(convoFor(character).meet) || `You meet {name} at ${spot.name}.`, ctx);
  }

  function noticeFlavor(character, ctx) {
    const c = convoFor(character);
    if (!c.notice) return "";
    const checks = {
      intelligence: state.intelligence >= 50,
      reputation: state.reputation >= 50,
      charm: state.charm >= 50,
      fitness: state.fitness >= 50,
      mood: state.mood >= 62,
      risk: state.risk >= 45,
      cash: state.cash >= 1500
    };
    const hits = (character.likes || []).filter((key) => c.notice[key] && checks[key]);
    if (!hits.length) return "";
    return fillTemplate(c.notice[hits[randInt(0, hits.length - 1)]], ctx);
  }

  function dateReaction(character, rel, success, approach) {
    const c = convoFor(character);
    const ctx = convoCtx(character, rel);
    const bank = (success ? c.win : c.lose) || {};
    const arr = (bank[approach] && bank[approach].length) ? bank[approach] : bank.any;
    let line = fillTemplate(pickLine(arr) || (success ? "That worked." : "Not quite."), ctx);
    if (success) {
      const notice = noticeFlavor(character, ctx);
      if (notice) line += ` ${notice}`;
    }
    return line;
  }

  function progressLine(kind, character, rel) {
    const global = (DATA.conversations && DATA.conversations.global) || {};
    return fillTemplate(pickLine(global[kind]) || "", convoCtx(character, rel));
  }

  function relGridHtml(rel) {
    return `
      <div class="rel-status">${relationshipLabel(rel)}</div>
      <div class="relationship-grid">
        <div><span>Affection</span><strong>${rel.affection}</strong></div>
        <div><span>Trust</span><strong>${rel.trust}</strong></div>
        <div><span>Heat</span><strong>${rel.heat}</strong></div>
      </div>`;
  }

  function lateReply(kind) {
    const focus = characterById(state.focusId);
    const rel = state.relationships[focus.id];
    const bank = (DATA.lateReply[focus.id] && DATA.lateReply[focus.id][kind]) || [];
    return fillTemplate(pickLine(bank) || "", convoCtx(focus, rel));
  }

  // signature one-off scene the first time a relationship crosses a milestone
  function maybeShowBeat(character, stage) {
    state.beatsSeen = state.beatsSeen || {};
    const key = `${character.id}:${stage}`;
    if (state.beatsSeen[key]) return;
    const beat = DATA.storyBeats[character.id] && DATA.storyBeats[character.id][String(stage)];
    if (!beat) return;
    state.beatsSeen[key] = true;
    saveState();
    window.setTimeout(() => showBeat(character, beat), 520);
  }

  function showBeat(character, beat) {
    fx("goal");
    pulseEdge("her");
    openModal(beat.title, `
      <div class="beat-block">
        <div class="muted-label">A moment with ${character.name}</div>
        <p>${fillTemplate(beat.text, convoCtx(character, state.relationships[character.id]))}</p>
        <button class="primary-button wide-button" type="button" id="beat-done">Continue</button>
      </div>
    `);
  }

  function openDatePanel() {
    const character = characterById(state.focusId);
    const rel = state.relationships[character.id];
    const spots = DATA.dateSpots.map((spot) => {
      const req = { cash: spot.cost, energy: spot.energy };
      const missing = missingText(req);
      return `
        <button class="choice-button ${missing ? "locked" : ""}" type="button" data-date-spot="${spot.id}">
          <strong>${spot.name} / ${money(spot.cost)}</strong>
          ${reqBadges(req)}
          <span>${spot.goodFor.includes(character.id) ? "This fits her mood." : "Could still work if your approach is right."}${missing ? ` / Missing ${missing}` : ""}</span>
        </button>
      `;
    }).join("");
    openPlayPanel("Dating", `Date ${character.name}`, `
      <p>${dateGreeting(character, rel)}</p>
      ${relGridHtml(rel)}
      ${giftsHtml(character)}
      <div class="block-header panel-gap"><span>Plan a date</span></div>
      <div class="choice-grid">${spots}</div>
    `);
  }

  function startDate(spotId) {
    const character = characterById(state.focusId);
    const spot = DATA.dateSpots.find((item) => item.id === spotId);
    if (!spot) return;
    const req = { cash: spot.cost, energy: spot.energy };
    const missing = missingText(req);
    if (missing) {
      showToast(`Cannot start ${spot.name}. Missing ${missing}.`);
      openDatePanel();
      return;
    }
    if (!spendEnergy(spot.energy)) return;
    state.cash = roundCents(state.cash - spot.cost);
    state.backgroundId = spot.backgroundId;
    switchMedia({ characterId: character.id, sceneName: routeSceneForSpot(character.id, spot.id), backgroundId: spot.backgroundId });
    render();
    saveState();

    const rel = state.relationships[character.id];
    const prefs = DATA.approachPrefs[character.id] || [];
    const knowsHer = rel.trust >= 40; // once you know her, the game hints what lands
    const choices = [
      ["listen", "Listen first", "Ask what she wants and do not interrupt."],
      ["spark", "Create spark", "Tease, flirt, and make the night feel less predictable."],
      ["status", "Show status", "Talk ambition, money moves, and the life you are building."],
      ["honest", "Be honest", "Drop the performance and admit what scares you."]
    ].map(([id, title, text]) => {
      const hint = knowsHer && prefs.includes(id) ? ` <em class="pref-hint">· suits her</em>` : "";
      return `
        <button class="choice-button" type="button" data-date-choice="${id}" data-spot="${spot.id}">
          <strong>${title}${hint}</strong><span>${text}</span>
        </button>
      `;
    }).join("");

    const flavor = pickLine(spot.flavor);
    const meet = dateMeetLine(character, rel, spot) + (flavor ? ` ${fillTemplate(flavor, convoCtx(character, rel))}` : "");
    const minimized = window.matchMedia("(max-width: 779px)").matches;
    openPlayPanel("Date", `${spot.name}: choose approach`, `
      <p>${meet}</p>
      <div class="choice-grid">${choices}</div>
    `, { minimized });
    if (minimized) {
      window.setTimeout(() => {
        if (!els.playPanel.classList.contains("hidden")) setPlayPanelMinimized(false);
      }, 3200);
    }
  }

  function resolveDate(choiceId, spotId) {
    const character = characterById(state.focusId);
    const spot = DATA.dateSpots.find((item) => item.id === spotId);
    if (!spot) return;
    const rel = state.relationships[character.id];
    const prevStage = rel.stage;
    const statScore = {
      listen: state.intelligence + state.mood,
      spark: state.charm + state.risk,
      status: state.reputation + Math.min(80, state.cash / 25),
      honest: state.mood + rel.trust
    }[choiceId] || 0;
    const preference = DATA.approachPrefs[character.id] || [];
    const fit = preference.includes(choiceId) ? 18 : 0;
    const spotFit = spot.goodFor.includes(character.id) ? 10 : 0;
    const score = statScore / 5 + fit + spotFit + randInt(-8, 10);
    const success = score >= 24;
    const gains = spot.gains;
    rel.affection = clamp(rel.affection + (success ? gains.affection : 2));
    rel.trust = clamp(rel.trust + (success ? gains.trust : -1));
    rel.heat = clamp(rel.heat + (success ? gains.heat : 1));
    rel.drama = clamp(rel.drama + (success ? -1 : 4));
    state.charm = clamp(state.charm + 1);
    state.mood = clamp(state.mood + (success ? 5 : -3));

    let text = dateReaction(character, rel, success, choiceId);
    if (success) { fx("win"); fxFlash("good"); } else { fx("lose"); }
    if (rel.affection >= 72 && rel.trust >= 55 && rel.heat >= 62) {
      rel.stage = Math.max(rel.stage, 2);
      text += ` ${progressLine("kiss", character, rel)}`;
      if (prevStage < 2) { fx("bigwin"); fxConfetti(120); }
      if (sceneExists(character.id, "bedroom_fadeout")) {
        switchMedia({ characterId: character.id, sceneName: "bedroom_fadeout", backgroundId: "loft" });
      }
    } else if (rel.affection >= 48 && rel.heat >= 38) {
      if (rel.stage < 1) { fx("goal"); }
      rel.stage = Math.max(rel.stage, 1);
      text += ` ${progressLine("linger", character, rel)}`;
    }
    advanceTurn(text, { moodCost: 0 });
    pulseEdge("her");
    openPlayPanel("Date result", character.name, `
      <p>${text}</p>
      ${relGridHtml(rel)}
      <button class="primary-button wide-button panel-gap" type="button" data-panel="date">Plan another date</button>
    `);
    // first time you cross a milestone, play that girl's signature beat
    if (rel.stage >= 2 && prevStage < 2) maybeShowBeat(character, 2);
    else if (rel.stage >= 1 && prevStage < 1) maybeShowBeat(character, 1);
  }

  function previewReward(characterId, sceneName, stageNeeded, canPreview) {
    const character = characterById(characterId);
    const rel = state.relationships[character.id];
    const scene = getScene(character.id, sceneName);
    if (!scene) {
      showToast(`${character.name} ${sceneName} has not been generated yet.`);
      return;
    }
    if (!canPreview && rel.stage < stageNeeded) {
      showToast(`Locked: win ${character.name} to stage ${stageNeeded}. Current stage ${rel.stage}.`);
      return;
    }
    switchMedia({
      characterId: character.id,
      sceneName,
      backgroundId: scene.backgroundId || character.backgroundId
    });
    render();
  }

  function openRestPanel() {
    openPlayPanel("Rest", "Recover", `
      <div class="choice-grid">
        <button class="choice-button" type="button" data-rest="quick">
          <strong>Quick rest</strong>
          <span>+46 energy, +10 mood. Uses one time slot.</span>
        </button>
        <button class="choice-button" type="button" data-rest="sleep">
          <strong>Sleep till morning</strong>
          <span>Skip the rest of today and wake fully restored. Markets move, debt accrues, and dividends pay overnight.</span>
        </button>
      </div>
    `);
  }

  function rest() {
    state.energy = clamp(state.energy + 46);
    state.mood = clamp(state.mood + 10);
    fx("rest");
    fxFloat("+46 EN", "good");
    closePlayPanel();
    advanceTurn("You took the quiet route: shower, clean food, phone on silent. Tomorrow can be ambitious again.", { moodCost: 0 });
  }

  function sleepTillMorning() {
    fx("rest");
    closePlayPanel();
    state.slot = DATA.slots.length - 1; // the turn below rolls the day over
    advanceTurn("You called it a night and slept straight through to morning.", { moodCost: 0 });
    state.energy = clamp(state.energy + 16);
    fxFloat("Slept in", "good");
    saveState();
    render();
  }

  function openResetPanel() {
    openModal("Reset Game", `
      <p>This clears the DRK v0.1 save in this browser.</p>
      <div class="inline-actions">
        <button class="danger-button" type="button" id="confirm-reset">Reset save</button>
        <button class="ghost-button" type="button" id="cancel-reset">Cancel</button>
      </div>
    `);
  }

  function handleGameButton(target) {
    if (target.dataset.panel === "work") openWorkPanel();
    if (target.dataset.panel === "trade") openTradePanel();
    if (target.dataset.panel === "gamble") openGamblePanel();
    if (target.dataset.panel === "train") openTrainPanel();
    if (target.dataset.panel === "date") openDatePanel();
    if (target.dataset.job) takeJob(target.dataset.job);
    if (target.dataset.buy) buyAsset(target.dataset.buy, 1);
    if (target.dataset.buyMax) {
      const price = state.prices[target.dataset.buyMax];
      buyAsset(target.dataset.buyMax, Math.floor(state.cash / price));
    }
    if (target.dataset.sell) sellAsset(target.dataset.sell, 1);
    if (target.dataset.sellAll) sellAsset(target.dataset.sellAll, state.portfolio.assets[target.dataset.sellAll] || 0);
    if (target.dataset.payDebt) payDebt(target.dataset.payDebt);
    if (target.dataset.ticker) {
      const row = els.playPanelBody.querySelector(`#market-row-${target.dataset.ticker}`);
      if (row) row.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (target.dataset.advanceMarket) advanceMarketTick();
    if (target.dataset.gameOpen) openCasinoGame(target.dataset.gameOpen);
    if (target.dataset.hiloStart) startHighLow();
    if (target.dataset.hiloChoice) resolveHighLow(target.dataset.hiloChoice);
    if (target.dataset.blackjackStart) startBlackjack();
    if (target.dataset.blackjackHit) hitBlackjack();
    if (target.dataset.blackjackStand) standBlackjack();
    if (target.dataset.diceBet) playDice(target.dataset.diceBet);
    if (target.dataset.slotsSpin) spinSlots();
    if (target.dataset.coinStart) startCoin();
    if (target.dataset.coinFlip) flipCoin();
    if (target.dataset.coinCash) cashCoin();
    if (target.dataset.giftId) buyGift(target.dataset.giftId);
    if (target.dataset.train) train(target.dataset.train);
    if (target.dataset.rest) {
      if (target.dataset.rest === "sleep") sleepTillMorning();
      else rest();
    }
    if (target.dataset.dateSpot) startDate(target.dataset.dateSpot);
    if (target.dataset.dateChoice) resolveDate(target.dataset.dateChoice, target.dataset.spot);
    if (target.dataset.rewardScene) {
      previewReward(
        target.dataset.rewardCharacter,
        target.dataset.rewardScene,
        Number(target.dataset.rewardStage || 0),
        target.dataset.rewardPreview === "1"
      );
    }
  }

  function bindEvents() {
    document.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.action;
        fx("click");
        if (action === "work") openWorkPanel();
        if (action === "trade") openTradePanel();
        if (action === "gamble") openGamblePanel();
        if (action === "train") openTrainPanel();
        if (action === "date") openDatePanel();
        if (action === "rest") openRestPanel();
      });
    });

    els.characterStrip.addEventListener("click", (event) => {
      const button = event.target.closest("[data-character]");
      if (!button) return;
      fx("tab");
      const character = characterById(button.dataset.character);
      switchMedia({ characterId: character.id, sceneName: "character_card", backgroundId: character.backgroundId });
      render();
    });

    els.playPanelBody.addEventListener("click", (event) => {
      const target = event.target.closest("button");
      if (target) handleGameButton(target);
    });

    els.dateCard.addEventListener("click", (event) => {
      const target = event.target.closest("button");
      if (target) handleGameButton(target);
    });

    els.modalBody.addEventListener("click", (event) => {
      const target = event.target.closest("button");
      if (!target) return;
      if (target.id === "confirm-reset") {
        localStorage.removeItem(SAVE_KEY);
        state = freshState();
        closeModal();
        closePlayPanel();
        render();
        renderMedia();
      }
      if (target.id === "cancel-reset") closeModal();
      if (target.id === "victory-continue") closeModal();
      if (target.id === "intro-begin") closeModal();
      if (target.id === "beat-done") closeModal();
      if (target.id === "event-done") closeModal();
      if (target.id === "settings-reset") openResetPanel();
      if (target.dataset.toggle === "sound" && window.DRKFX) { window.DRKFX.setMuted(!window.DRKFX.isMuted()); renderSettings(); }
      if (target.dataset.toggle === "music" && window.DRKFX) { window.DRKFX.setMusic(!window.DRKFX.isMusic()); renderSettings(); }
      if (target.dataset.eventChoice !== undefined) resolveEvent(Number(target.dataset.eventChoice));
    });

    els.playPanelClose.addEventListener("click", closePlayPanel);
    els.playPanelCollapse.addEventListener("click", () => {
      setPlayPanelMinimized(!els.playPanel.classList.contains("minimized"));
    });
    els.modalClose.addEventListener("click", closeModal);
    els.gameModal.addEventListener("click", (event) => {
      if (event.target === els.gameModal) closeModal();
    });
    els.mediaDebugHotspot.addEventListener("click", () => {
      if (window.DRKDebug) window.DRKDebug.open(getMediaContext());
    });

    els.metricChip.addEventListener("click", () => {
      topMetric = (topMetric + 1) % 3;
      fx("tab");
      renderTopbar();
    });
    if (els.cogDesktop) els.cogDesktop.addEventListener("click", openSettings);
    if (els.brandToggle) {
      els.brandToggle.addEventListener("click", () => {
        if (window.DRKDebug && window.DRKDebug.toggle) window.DRKDebug.toggle();
      });
    }
    if (els.storyToggle) {
      els.storyToggle.addEventListener("click", () => {
        storyCollapsed = !storyCollapsed;
        els.storyBlock.classList.toggle("collapsed", storyCollapsed);
        els.storyToggle.textContent = storyCollapsed ? "▾" : "▴";
      });
    }

    els.edgeNav.addEventListener("click", (event) => {
      const cog = event.target.closest("[data-cog]");
      if (cog) { openSettings(); return; }
      const girl = event.target.closest("[data-girl]");
      if (girl) { onGirlNotch(girl.dataset.girl); return; }
      const tab = event.target.closest("[data-drawer]");
      if (tab) toggleDrawer(tab.dataset.drawer);
    });
    els.drawerBackdrop.addEventListener("click", closeAllDrawers);
    document.querySelectorAll("[data-drawer-close]").forEach((btn) => {
      btn.addEventListener("click", closeAllDrawers);
    });

    els.homeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      fx("tab");
      showHomeBase();
    });

    // tap the portrait to peek at the relevant side panel (mobile)
    els.mediaFrame.addEventListener("click", (event) => {
      if (document.body.classList.contains("debug-enabled")) return;
      if (event.target.closest("#home-button")) return;
      if (event.target.closest("#media-caption")) return;
      if (document.body.classList.contains("immersive")) return;
      if (!window.matchMedia("(max-width: 759px)").matches) return;
      const showingPlayer = (state.mediaCharacterId || state.focusId) === DATA.player.id;
      toggleDrawer(showingPlayer ? "you" : "her");
    });

    // tap the scene name to drop into a clean, full-screen view of the media
    if (els.mediaCaption) {
      els.mediaCaption.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!window.matchMedia("(max-width: 759px)").matches) return;
        dismissFsHint();
        setImmersive(true);
      });
    }

    setupSwipe();
  }

  // immersive view: hide every overlay so only the image/video shows; any tap restores it
  function setImmersive(on) {
    document.body.classList.toggle("immersive", Boolean(on));
    if (on) {
      fx("tab");
      // defer so the tap that opened immersive doesn't immediately close it
      window.setTimeout(() => {
        document.addEventListener("click", exitImmersive, { capture: true, once: true });
      }, 0);
    }
  }

  function exitImmersive(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    document.body.classList.remove("immersive");
  }

  function maybeShowFsHint() {
    try {
      if (localStorage.getItem("drk_fs_hint") === "1") return;
    } catch {
      return;
    }
    if (!window.matchMedia("(max-width: 759px)").matches) return;
    const hint = document.createElement("div");
    hint.className = "fs-hint";
    hint.id = "fs-hint";
    hint.textContent = "Tap the name ⤢ for a full view";
    document.body.appendChild(hint);
    window.setTimeout(dismissFsHint, 5200);
  }

  function dismissFsHint() {
    try {
      localStorage.setItem("drk_fs_hint", "1");
    } catch {
      /* ignore */
    }
    const hint = document.getElementById("fs-hint");
    if (!hint) return;
    hint.classList.add("out");
    window.setTimeout(() => hint.remove(), 420);
  }

  // edge-swipe to open / swipe to close the mobile drawers
  function setupSwipe() {
    let sx = 0;
    let sy = 0;
    let tracking = false;
    const mobile = () => window.matchMedia("(max-width: 759px)").matches;
    document.addEventListener("touchstart", (event) => {
      if (!mobile() || event.touches.length !== 1) return;
      sx = event.touches[0].clientX;
      sy = event.touches[0].clientY;
      tracking = true;
    }, { passive: true });
    document.addEventListener("touchend", (event) => {
      if (!tracking || !mobile()) return;
      tracking = false;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - sx;
      const dy = touch.clientY - sy;
      if (Math.abs(dx) < 55 || Math.abs(dy) > Math.abs(dx)) return;
      const anyOpen = document.querySelector("[data-drawer-panel].open");
      if (dx > 0 && sx < 42 && !anyOpen) toggleDrawer("you");
      else if (dx < 0 && anyOpen) closeAllDrawers();
    }, { passive: true });
  }

  function getMediaContext() {
    const mediaId = state.mediaCharacterId || state.focusId;
    const person = mediaId === DATA.player.id ? DATA.player : characterById(mediaId);
    return {
      characterId: mediaId,
      sceneName: state.sceneName || "character_card",
      backgroundId: state.backgroundId || person.backgroundId || "loft",
      key: sceneKey({
        characterId: mediaId,
        sceneName: state.sceneName || "character_card"
      })
    };
  }

  function cacheElements() {
    Object.assign(els, {
      dayLabel: document.getElementById("day-label"),
      slotLabel: document.getElementById("slot-label"),
      playerAvatar: document.getElementById("player-avatar"),
      playerName: document.getElementById("player-name"),
      playerSummary: document.getElementById("player-summary"),
      metricChip: document.getElementById("metric-chip"),
      metricLabel: document.getElementById("metric-label"),
      metricValue: document.getElementById("metric-value"),
      topEnergy: document.getElementById("top-energy"),
      topEnergyBar: document.getElementById("top-energy-bar"),
      topEnergyChip: document.getElementById("top-energy-chip"),
      edgeNav: document.getElementById("edge-nav"),
      drawerBackdrop: document.getElementById("drawer-backdrop"),
      brandToggle: document.getElementById("brand-toggle"),
      cogDesktop: document.getElementById("cog-desktop"),
      netLabel: document.getElementById("net-label"),
      resourceGrid: document.getElementById("resource-grid"),
      attrList: document.getElementById("attr-list"),
      objectiveList: document.getElementById("objective-list"),
      goalProgress: document.getElementById("goal-progress"),
      storyText: document.getElementById("story-text"),
      storyBlock: document.getElementById("story-block"),
      storyToggle: document.getElementById("story-toggle"),
      focusLabel: document.getElementById("focus-label"),
      characterStrip: document.getElementById("character-strip"),
      mediaFrame: document.getElementById("media-frame"),
      homeButton: document.getElementById("home-button"),
      sceneImage: document.getElementById("scene-image"),
      sceneVideo: document.getElementById("scene-video"),
      transitionVideo: document.getElementById("transition-video"),
      mediaBg: document.getElementById("media-bg"),
      sceneKicker: document.getElementById("scene-kicker"),
      sceneTitle: document.getElementById("scene-title"),
      mediaCaption: document.getElementById("media-caption"),
      dateCard: document.getElementById("date-card"),
      playPanel: document.getElementById("play-panel"),
      playPanelKicker: document.getElementById("play-panel-kicker"),
      playPanelTitle: document.getElementById("play-panel-title"),
      playPanelBody: document.getElementById("play-panel-body"),
      playPanelClose: document.getElementById("play-panel-close"),
      playPanelCollapse: document.getElementById("play-panel-collapse"),
      gameModal: document.getElementById("game-modal"),
      modalTitle: document.getElementById("modal-title"),
      modalBody: document.getElementById("modal-body"),
      modalClose: document.getElementById("modal-close"),
      mediaDebugHotspot: document.getElementById("media-debug-hotspot")
    });
  }

  function init() {
    cacheElements();
    loadState();
    bindEvents();
    render();
    refreshMediaManifest();
    if (new URLSearchParams(location.search).has("debug")) {
      document.body.classList.add("debug-enabled");
    }
    try {
      if (!localStorage.getItem("drk_intro")) {
        localStorage.setItem("drk_intro", "1");
        showHomeBase();
        showIntro();
      } else {
        maybeShowFsHint();
      }
    } catch {
      /* ignore */
    }
  }

  window.DRKGame = {
    getState: () => state,
    getData: () => DATA,
    getManifest: () => manifest,
    getMediaContext,
    refreshMediaManifest,
    switchMedia,
    render,
    showToast,
    slug
  };

  document.addEventListener("DOMContentLoaded", init);
})();
