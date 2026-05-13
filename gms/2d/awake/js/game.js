(function () {
  const Story = window.CodexHorrorStory;
  const Save = window.CodexHorrorSave;
  const Audio = window.CodexHorrorAudio;
  const UI = window.CodexHorrorUI;

  const $ = id => document.getElementById(id);
  let state = Save.loadState();
  let settings = Save.loadSettings();
  let transitionLocked = false;
  let cacheStarted = false;
  let introReady = false;
  let introTimer = 0;
  let introIndex = 0;
  let introCycle = 0;
  const cachedMedia = new Set();

  const els = {
    introVideo: $("intro-video"),
    introName: $("intro-name"),
    introStatus: $("intro-status"),
    cacheFill: $("cache-fill"),
    introNewGame: $("intro-new-game"),
    introContinue: $("intro-continue"),
    introHistory: $("intro-history"),
    titleLoop: $("title-loop"),
    titleName: $("title-name"),
    newGame: $("new-game"),
    continueGame: $("continue-game"),
    titleHistory: $("title-history"),
    roomVideo: $("room-video"),
    roomFallback: $("room-fallback"),
    roomName: $("room-name"),
    turnCount: $("turn-count"),
    detailsMobile: $("details-mobile"),
    mapMobile: $("map-mobile"),
    subroomActions: $("subroom-actions"),
    exitActions: $("exit-actions"),
    threatFlash: $("threat-flash"),
    facilityName: $("facility-name"),
    threatLabel: $("threat-label"),
    storyText: $("story-text"),
    openDetails: $("open-details"),
    openHistory: $("open-history"),
    desktopMap: $("desktop-map"),
    mapStatus: $("map-status"),
    inventoryList: $("inventory-list"),
    debugButton: $("debug-button"),
    debugVideo: $("debug-video"),
    debugList: $("debug-list"),
    debugNote: $("debug-note"),
    settingsButton: $("settings-button"),
    musicToggle: $("music-toggle"),
    soundToggle: $("sound-toggle"),
    volume: $("volume"),
    resetRun: $("reset-run"),
    helpButton: $("help-button"),
    goalsList: $("goals-list"),
    detailsInventoryList: $("details-inventory-list"),
    runStats: $("run-stats"),
    popupMap: $("popup-map"),
    historyList: $("history-list"),
    endingVideo: $("ending-video"),
    endingKind: $("ending-kind"),
    endingTitle: $("ending-title"),
    endingText: $("ending-text"),
    restartGame: $("restart-game"),
    endingHistory: $("ending-history"),
    music: $("music"),
  };

  function init() {
    UI.init();
    Audio.init(els.music, settings);
    wireEvents();
    syncSettings();
    renderDebugList();
    showIntro();
  }

  function wireEvents() {
    els.introNewGame.addEventListener("click", () => {
      Audio.prime();
      UI.openPanel("difficulty-panel");
    });
    els.introContinue.addEventListener("click", continueRun);
    els.introHistory.addEventListener("click", openHistory);
    els.newGame.addEventListener("click", () => {
      Audio.prime();
      UI.openPanel("difficulty-panel");
    });
    document.querySelectorAll(".difficulty-choice").forEach(button => {
      button.addEventListener("click", () => startNewRun(button.dataset.difficulty || "medium"));
    });
    els.continueGame.addEventListener("click", continueRun);
    els.titleHistory.addEventListener("click", openHistory);
    els.openDetails.addEventListener("click", openDetails);
    els.detailsMobile.addEventListener("click", openDetails);
    els.openHistory.addEventListener("click", openHistory);
    els.mapMobile.addEventListener("click", openDetails);
    els.endingHistory.addEventListener("click", openHistory);
    els.restartGame.addEventListener("click", () => showIntro(true));
    els.debugButton.addEventListener("click", () => UI.openPanel("debug-panel"));
    els.settingsButton.addEventListener("click", () => {
      Audio.prime();
      UI.openPanel("settings-panel");
    });
    els.helpButton.addEventListener("click", () => UI.openPanel("help-panel"));
    els.musicToggle.addEventListener("click", () => updateSetting("music", !settings.music));
    els.soundToggle.addEventListener("click", () => updateSetting("sound", !settings.sound));
    els.volume.addEventListener("input", () => {
      settings.volume = parseInt(els.volume.value, 10) / 100;
      Save.saveSettings(settings);
      Audio.apply(settings);
    });
    els.resetRun.addEventListener("click", async () => {
      const ok = await UI.confirm({
        title: "Reset this run?",
        body: "Your current route will be erased. Archived endings and history snapshots stay saved.",
        confirmLabel: "Reset",
        cancelLabel: "Keep Run",
        danger: true,
      });
      if (!ok) return;
      Save.clearState();
      state = null;
      UI.closePanel("settings-panel");
      showIntro(true);
    });
  }

  function syncSettings() {
    els.musicToggle.setAttribute("aria-pressed", settings.music ? "true" : "false");
    els.soundToggle.setAttribute("aria-pressed", settings.sound ? "true" : "false");
    els.volume.value = Math.round(settings.volume * 100);
    Audio.apply(settings);
  }

  function updateSetting(key, value) {
    settings[key] = value;
    Save.saveSettings(settings);
    syncSettings();
    if (value) Audio.prime();
  }

  function showIntro(force = false) {
    UI.showScreen("intro-screen");
    els.introName.textContent = randomTitle();
    els.introContinue.hidden = !Save.hasActiveRun();
    els.introHistory.hidden = Save.loadArchive().length === 0;
    if (force) {
      els.introVideo.currentTime = 0;
      els.introVideo.pause();
    }
    startMediaCache();
    if (introReady) startIntroSlideshow();
  }

  function showTitle() {
    UI.showScreen("title-screen");
    els.titleLoop.play().catch(() => {});
    els.titleName.textContent = randomTitle();
    els.continueGame.hidden = !Save.hasActiveRun();
    els.titleHistory.hidden = Save.loadArchive().length === 0;
  }

  function randomTitle() {
    return Story.gameNames[Math.floor(Math.random() * Story.gameNames.length)];
  }

  function startMediaCache() {
    updateCacheUi();
    if (cacheStarted) {
      maybeEnableIntro();
      return;
    }
    cacheStarted = true;
    const manifest = Story.mediaManifest || [];
    manifest.forEach(entry => {
      preloadMedia(entry)
        .then(() => markCached(entry, true))
        .catch(() => markCached(entry, false));
    });
    if (Story.introPlaylist && Story.introPlaylist.length) {
      const first = Story.introPlaylist[0];
      els.introVideo.poster = first.poster;
      els.introVideo.src = first.src;
      els.introVideo.load();
      els.introVideo.addEventListener("loadeddata", () => {
        els.introVideo.currentTime = 0;
        els.introVideo.pause();
      }, { once: true });
    }
  }

  function preloadMedia(entry) {
    return new Promise((resolve, reject) => {
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      const fail = () => {
        clearTimeout(timer);
        reject(new Error(`Failed to cache ${entry.src}`));
      };
      const timer = setTimeout(done, 12000);
      if (entry.type === "image") {
        const image = new Image();
        image.onload = done;
        image.onerror = fail;
        image.src = entry.src;
        return;
      }
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.addEventListener("loadeddata", done, { once: true });
      video.addEventListener("error", fail, { once: true });
      video.src = entry.src;
      video.load();
    });
  }

  function markCached(entry, ok) {
    if (ok) cachedMedia.add(entry.src);
    entry.failed = !ok;
    updateCacheUi();
    maybeEnableIntro();
  }

  function updateCacheUi() {
    const manifest = Story.mediaManifest || [];
    const loaded = manifest.filter(entry => cachedMedia.has(entry.src) || entry.failed).length;
    const percent = manifest.length ? Math.round((loaded / manifest.length) * 100) : 100;
    els.cacheFill.style.width = `${percent}%`;
    const next = manifest.find(entry => !cachedMedia.has(entry.src) && !entry.failed);
    if (introReady) {
      els.introStatus.textContent = loaded >= manifest.length
        ? "All current room feeds cached."
        : `Ready. Background caching ${loaded}/${manifest.length}.`;
      return;
    }
    els.introStatus.textContent = next
      ? `Caching ${next.label.toLowerCase()}... ${loaded}/${manifest.length}`
      : "Preparing room feed.";
  }

  function maybeEnableIntro() {
    const required = (Story.mediaManifest || []).filter(entry => entry.required);
    const ready = required.every(entry => cachedMedia.has(entry.src) || entry.failed);
    if (!ready || introReady) return;
    introReady = true;
    els.introNewGame.disabled = false;
    els.introContinue.disabled = false;
    els.introHistory.disabled = false;
    updateCacheUi();
    startIntroSlideshow();
  }

  function startIntroSlideshow() {
    clearTimeout(introTimer);
    introCycle += 1;
    if (!Story.introPlaylist || !Story.introPlaylist.length) return;
    playIntroClip(introCycle);
  }

  function playIntroClip(cycle) {
    if (cycle !== introCycle) return;
    if (!document.getElementById("intro-screen").classList.contains("active")) return;
    const playlist = Story.introPlaylist;
    const clip = playlist[introIndex % playlist.length];
    introIndex += 1;
    els.introVideo.poster = clip.poster;
    if (els.introVideo.dataset.src !== clip.src) {
      els.introVideo.dataset.src = clip.src;
      els.introVideo.src = clip.src;
    }
    els.introVideo.currentTime = 0;
    els.introVideo.pause();
    introTimer = setTimeout(() => {
      if (cycle !== introCycle || !document.getElementById("intro-screen").classList.contains("active")) return;
      els.introVideo.play().catch(() => {});
    }, 1800);
    const next = () => {
      els.introVideo.removeEventListener("ended", next);
      if (cycle !== introCycle) return;
      introTimer = setTimeout(() => playIntroClip(cycle), 2600);
    };
    els.introVideo.addEventListener("ended", next, { once: true });
  }

  async function startNewRun(difficulty) {
    Audio.prime();
    UI.closePanel("difficulty-panel");
    if (Save.hasActiveRun()) {
      const ok = await UI.confirm({
        title: "Begin a new run?",
        body: "This replaces the active save, but archived endings remain.",
        confirmLabel: "Begin",
        cancelLabel: "Continue",
      });
      if (!ok) return;
    }
    state = Story.createRun(difficulty);
    addHistory("You woke inside the suspension room with no clear memory.");
    Save.saveState(state);
    renderGame();
  }

  function continueRun() {
    Audio.prime();
    state = Save.loadState();
    if (!state) return showIntro(true);
    renderGame();
  }

  function renderGame(message) {
    stopIntroSlideshow();
    UI.showScreen("game-screen");
    const room = Story.rooms[state.currentRoom];
    setRoomMedia(room);
    els.roomName.textContent = room.name;
    els.turnCount.textContent = `${state.turn} / ${state.turnRange[0]}-${state.turnRange[1]}`;
    els.facilityName.textContent = state.facility;
    els.threatLabel.textContent = `${state.threat.label}: ${distanceLabel()}`;
    els.storyText.textContent = message || currentStoryText(room);
    renderActions();
    renderDetails();
    Save.saveState(state);
  }

  function setRoomMedia(room) {
    els.roomFallback.src = room.poster;
    els.roomFallback.classList.add("visible");
    if (els.roomVideo.dataset.src !== room.idleVideo) {
      els.roomVideo.dataset.src = room.idleVideo;
      els.roomVideo.src = room.idleVideo;
    }
    els.roomVideo.poster = room.poster;
    els.roomVideo.currentTime = 0;
    els.roomVideo.pause();
    els.roomVideo.addEventListener("loadeddata", () => {
      els.roomFallback.classList.remove("visible");
      els.roomVideo.currentTime = 0;
      els.roomVideo.pause();
    }, { once: true });
  }

  function currentStoryText(room) {
    if (state.currentRoom === "suspension" && state.playerRevealed) {
      return `${room.text} The wrist band insists you are ${state.playerName}.`;
    }
    if (state.currentRoom === "hallway" && state.flags.map) {
      return `${room.text} The route cache marks a transport tube at the far end.`;
    }
    return room.text;
  }

  function renderActions() {
    const actions = Story.actions[state.currentRoom] || [];
    els.subroomActions.innerHTML = "";
    els.exitActions.innerHTML = "";
    actions.forEach(action => {
      if (action.once && state.flags[action.id]) return;
      const button = document.createElement("button");
      button.className = "tag tag-action";
      button.type = "button";
      button.innerHTML = `${UI.escapeHtml(action.label)}<small>${UI.escapeHtml(action.hint || "")}</small>`;
      button.addEventListener("click", () => doAction(action));
      (action.side === "sub" ? els.subroomActions : els.exitActions).append(button);
    });
  }

  async function doAction(action) {
    if (transitionLocked || !state || state.ended) return;
    Audio.prime();
    spendTurns(action.turns || 1);
    let message = "";
    if (action.run) message = action.run(state);
    if (action.once) state.flags[action.id] = true;
    updateGoalsFromFlags();

    if (state.ending) {
      addHistory(message);
      return finishRun(state.ending);
    }

    if (isCaught()) {
      addHistory("The hunter reached the central hallway before you could leave.");
      return finishRun("caught");
    }

    if (action.target) {
      addHistory(`${Story.rooms[state.currentRoom].name}: ${action.label}.`);
      await transitionTo(action.target);
      renderGame(message);
      return;
    }

    if (message) {
      addHistory(message);
      UI.toast(message);
    }
    renderGame(message);
  }

  function spendTurns(count) {
    state.turn += count;
    if (state.currentRoom === "hallway") state.threatPressure += 1;
    Audio.tick();
  }

  function updateGoalsFromFlags() {
    state.mapUnlocked = !!state.flags.map;
    if (state.flags.identity) state.flags.goal_identity = true;
    if (state.flags.map) state.flags.goal_map = true;
  }

  function isCaught() {
    return state.turn + state.threatPressure >= state.turnLimit;
  }

  function transitionTo(targetRoom) {
    return new Promise(resolve => {
      const from = Story.rooms[state.currentRoom];
      const videoSrc = state.currentRoom === "suspension" ? from.toHallway : from.toRoom;
      transitionLocked = true;
      els.roomVideo.src = videoSrc;
      els.roomVideo.currentTime = 0;
      els.roomVideo.play().catch(() => {});
      const done = () => {
        els.roomVideo.removeEventListener("ended", done);
        state.currentRoom = targetRoom;
        transitionLocked = false;
        resolve();
      };
      els.roomVideo.addEventListener("ended", done, { once: true });
      setTimeout(() => {
        if (transitionLocked) done();
      }, 8000);
    });
  }

  function finishRun(kind) {
    state.active = false;
    state.ended = true;
    state.ending = kind;
    const success = kind === "escape";
    if (success) {
      state.flags.goal_escape = true;
      Audio.success();
    } else {
      Audio.danger();
    }
    Save.recordArchive({
      kind,
      facility: state.facility,
      player: state.playerRevealed ? state.playerName : "Unknown",
      turns: state.turn,
      history: state.history.slice(-12),
    });
    Save.saveState(state);
    renderEnding(kind);
  }

  function renderEnding(kind) {
    stopIntroSlideshow();
    const success = kind === "escape";
    UI.showScreen("ending-screen");
    els.endingKind.textContent = success ? "successful escape" : "bad ending";
    els.endingTitle.textContent = success ? "Transport Burn" : "Caught In The Hallway";
    els.endingText.textContent = success
      ? `The transport tube fires. ${state.facility} becomes a thin scar of light behind you. Your memory has not returned, but your name has.`
      : `The hallway lights go out in order. The ${state.threat.name} reaches you before the next door opens.`;
    els.endingVideo.currentTime = 0;
    els.endingVideo.play().catch(() => {});
  }

  function renderDetails() {
    renderGoals();
    renderInventory(els.inventoryList);
    renderInventory(els.detailsInventoryList);
    renderStats();
    renderMap(els.desktopMap);
    renderMap(els.popupMap);
    els.mapStatus.textContent = state.mapUnlocked ? "online" : "offline";
  }

  function renderGoals() {
    els.goalsList.innerHTML = "";
    Story.goals.forEach((goal, index) => {
      const visible = index < state.visibleGoals || state.flags.console || state.flags.map;
      const done = !!state.flags[`goal_${goal.id}`];
      const li = document.createElement("li");
      li.className = `${done ? "done" : ""} ${visible ? "" : "hidden-goal"}`.trim();
      li.textContent = visible ? `${done ? "Complete: " : ""}${goal.text}` : "Hidden goal: restore a console or route cache.";
      els.goalsList.append(li);
    });
  }

  function renderInventory(target) {
    target.innerHTML = "";
    const items = state.inventory.length ? state.inventory : ["empty"];
    items.forEach(item => {
      const li = document.createElement("li");
      li.textContent = item;
      target.append(li);
    });
  }

  function renderStats() {
    const name = state.playerRevealed ? state.playerName : "unresolved";
    els.runStats.innerHTML = `
      <dt>Identity</dt><dd>${UI.escapeHtml(name)}</dd>
      <dt>Facility</dt><dd>${UI.escapeHtml(state.facility)}</dd>
      <dt>Difficulty</dt><dd>${UI.escapeHtml(state.difficultyLabel)}</dd>
      <dt>Threat</dt><dd>${UI.escapeHtml(state.threat.name)}</dd>
      <dt>Turns</dt><dd>${state.turn} / ${state.turnRange[0]}-${state.turnRange[1]}</dd>
    `;
  }

  function renderMap(target) {
    target.innerHTML = "";
    target.classList.toggle("offline", !state.mapUnlocked);
    if (!state.mapUnlocked) {
      target.textContent = "offline";
      return;
    }
    ["Suspension Room", "Central Hallway", "Transport Tube"].forEach(label => {
      const node = document.createElement("div");
      node.className = `map-node ${label.toLowerCase().includes(state.currentRoom === "suspension" ? "suspension" : "hallway") ? "current" : ""}`;
      node.textContent = label;
      target.append(node);
    });
  }

  function openDetails() {
    if (!state) return;
    renderDetails();
    UI.openPanel("details-panel");
  }

  function openHistory() {
    const archive = Save.loadArchive();
    els.historyList.innerHTML = "";
    const currentItems = state && state.history ? state.history : [];
    const rows = currentItems.length ? currentItems : archive.map(entry => `${entry.facility}: ${entry.kind} after ${entry.turns} turns.`);
    if (!rows.length) rows.push("No history recorded yet.");
    rows.forEach(row => {
      const li = document.createElement("li");
      li.textContent = row;
      els.historyList.append(li);
    });
    UI.openPanel("history-panel");
  }

  function renderDebugList() {
    els.debugList.innerHTML = "";
    (Story.transitions || []).forEach(transition => {
      const row = document.createElement("div");
      row.className = "debug-row";
      const pick = document.createElement("button");
      pick.className = "glass-button debug-pick";
      pick.type = "button";
      pick.innerHTML = `${UI.escapeHtml(transition.file)}<small>${UI.escapeHtml(transition.label)}</small>`;
      pick.addEventListener("click", () => previewTransition(transition, true));
      const copy = document.createElement("button");
      copy.className = "glass-button slim debug-copy";
      copy.type = "button";
      copy.textContent = "Copy";
      copy.addEventListener("click", () => copyTransitionName(transition.file));
      row.append(pick, copy);
      els.debugList.append(row);
    });
    if (Story.transitions && Story.transitions[0]) {
      const first = Story.transitions[0];
      els.debugVideo.poster = first.poster;
      els.debugNote.textContent = first.status || first.label;
    }
  }

  function previewTransition(transition, shouldCopy) {
    els.debugVideo.poster = transition.poster;
    if (els.debugVideo.dataset.src !== transition.src) {
      els.debugVideo.dataset.src = transition.src;
      els.debugVideo.src = transition.src;
    }
    els.debugVideo.currentTime = 0;
    els.debugVideo.play().catch(() => {});
    els.debugNote.textContent = transition.status || transition.label;
    if (shouldCopy) copyTransitionName(transition.file);
  }

  function copyTransitionName(name) {
    const done = () => UI.toast(`Copied ${name}`);
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(name).then(done).catch(() => fallbackCopy(name, done));
      return;
    }
    fallbackCopy(name, done);
  }

  function fallbackCopy(name, done) {
    const input = document.createElement("input");
    input.value = name;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.select();
    try {
      document.execCommand("copy");
      done();
    } catch (err) {
      UI.toast(name);
    }
    input.remove();
  }

  function stopIntroSlideshow() {
    introCycle += 1;
    clearTimeout(introTimer);
    if (els.introVideo) els.introVideo.pause();
  }

  function addHistory(line) {
    if (!state || !line) return;
    state.history.push(line);
    if (state.history.length > 40) state.history = state.history.slice(-40);
  }

  function distanceLabel() {
    const remaining = state.turnLimit - state.turn - state.threatPressure;
    if (remaining < 8) {
      els.threatFlash.classList.add("active");
      setTimeout(() => els.threatFlash.classList.remove("active"), 560);
      return "at the door";
    }
    if (remaining < 20) return "near";
    if (remaining < 40) return "closing";
    return "distant";
  }

  document.addEventListener("DOMContentLoaded", init);
})();
