(function () {
  const Story = window.TheHorrorsStory;
  const Save = window.TheHorrorsSave;
  const Audio = window.TheHorrorsAudio;
  const UI = window.TheHorrorsUI;

  const $ = id => document.getElementById(id);
  const DEBUG_META_KEY = "the_horrors.debugMeta.v1";
  const STATIC_MEDIA_VERSION = "20260515-runtime-media-1";
  let state = normalizeState(Save.loadState());
  let settings = Save.loadSettings();
  let transitionLocked = false;
  let cacheStarted = false;
  let introReady = false;
  let introTimer = 0;
  let introIndex = 0;
  let introCycle = 0;
  let roomMediaToken = 0;
  let transitionSequence = 0;
  let transitionTimer = 0;
  let helperOnline = false;
  let debugTransitions = [];
  let selectedTransition = null;
  let selectedReverseTransition = null;
  let previewedTransition = null;
  let helperPoll = 0;
  let debugFilter = "room";
  let debugMeta = loadDebugMeta();
  const cachedMedia = new Set();
  const helperUrl = "http://127.0.0.1:8788/api";

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
    eventOverlay: $("event-overlay"),
    eventMessage: $("event-message"),
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
    debugPrompt: $("debug-prompt"),
    debugTrimStart: $("debug-trim-start"),
    debugTrimEnd: $("debug-trim-end"),
    debugHelperStatus: $("debug-helper-status"),
    debugRefresh: $("debug-refresh"),
    regenFile: $("regen-file"),
    regenPrompt: $("regen-prompt"),
    regenMoveMessage: $("regen-move-message"),
    regenDelete: $("regen-delete"),
    regenMove: $("regen-move"),
    regenOther: $("regen-other"),
    reverseSummary: $("reverse-summary"),
    reverseMoveMessage: $("reverse-move-message"),
    reverseDelete: $("reverse-delete"),
    reverseMove: $("reverse-move"),
    reverseOther: $("reverse-other"),
    settingsButton: $("settings-button"),
    musicToggle: $("music-toggle"),
    soundToggle: $("sound-toggle"),
    volume: $("volume"),
    runKey: $("run-key"),
    copyRunKey: $("copy-run-key"),
    seedRunKey: $("seed-run-key"),
    startKeyRun: $("start-key-run"),
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
    refreshHelperStatus();
    helperPoll = window.setInterval(refreshHelperStatus, 5000);
    showIntro();
    if (new URLSearchParams(window.location.search).has("debug")) {
      setTimeout(() => UI.openPanel("debug-panel"), 250);
    }
  }

  function normalizeState(nextState) {
    if (!nextState) return null;
    if (nextState.currentRoom === "suspension") nextState.currentRoom = "cryo_room";
    nextState.visitedRooms = Array.isArray(nextState.visitedRooms) ? nextState.visitedRooms : [nextState.currentRoom || "cryo_room"];
    nextState.hiddenRooms = Array.isArray(nextState.hiddenRooms) ? nextState.hiddenRooms : [];
    nextState.goals = Array.isArray(nextState.goals) && nextState.goals.length ? nextState.goals : (Story.goals || []);
    nextState.flags = nextState.flags || {};
    nextState.inventory = Array.isArray(nextState.inventory) ? nextState.inventory : [];
    nextState.history = Array.isArray(nextState.history) ? nextState.history : [];
    nextState.runKey = nextState.runKey || "legacy-run";
    return nextState;
  }

  function loadDebugMeta() {
    try {
      const raw = localStorage.getItem(DEBUG_META_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (err) {
      return {};
    }
  }

  function saveDebugMeta() {
    try {
      localStorage.setItem(DEBUG_META_KEY, JSON.stringify(debugMeta));
    } catch (err) {
      console.warn("Debug metadata save failed", err);
    }
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
    els.debugButton.addEventListener("click", () => {
      refreshHelperStatus();
      UI.openPanel("debug-panel");
    });
    els.debugRefresh.addEventListener("click", refreshHelperStatus);
    document.querySelectorAll("[data-debug-filter]").forEach(button => {
      button.addEventListener("click", () => {
        debugFilter = button.dataset.debugFilter || "room";
        renderDebugList();
      });
    });
    els.debugNote.addEventListener("input", () => savePreviewMessage());
    els.debugTrimStart.addEventListener("change", () => savePreviewTrim(true));
    els.debugTrimEnd.addEventListener("change", () => savePreviewTrim(true));
    els.debugVideo.addEventListener("loadedmetadata", () => seekDebugPreview(false));
    els.debugVideo.addEventListener("play", () => clampDebugPreviewToWindow());
    els.debugVideo.addEventListener("timeupdate", () => clampDebugPreviewToWindow());
    els.regenDelete.addEventListener("click", () => submitRegen("delete"));
    els.regenMove.addEventListener("click", () => submitRegen("move"));
    els.regenOther.addEventListener("click", () => submitRegen("other"));
    els.reverseDelete.addEventListener("click", () => submitReverse("delete"));
    els.reverseMove.addEventListener("click", () => submitReverse("move"));
    els.reverseOther.addEventListener("click", () => submitReverse("other"));
    els.settingsButton.addEventListener("click", () => {
      Audio.prime();
      syncRunKeyUi();
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
    els.copyRunKey.addEventListener("click", () => {
      if (!state || !state.runKey) return UI.toast("No active run key");
      copyText(state.runKey, "Copied run key");
    });
    els.startKeyRun.addEventListener("click", startRunFromKey);
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
      cancelActiveTransition();
      UI.closePanel("settings-panel");
      showIntro(true);
    });
    document.addEventListener("pointerup", event => {
      if (!event.target.closest("button")) return;
      Audio.prime();
      Audio.click();
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
    cancelActiveTransition();
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
      els.introVideo.src = mediaSrc(first.src);
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
        image.src = mediaSrc(entry.src);
        return;
      }
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.addEventListener("loadeddata", done, { once: true });
      video.addEventListener("error", fail, { once: true });
      video.src = mediaSrc(entry.src);
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
    const clipSrc = mediaSrc(clip.src);
    if (els.introVideo.dataset.src !== clipSrc) {
      els.introVideo.dataset.src = clipSrc;
      els.introVideo.src = clipSrc;
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
    const startRoom = Story.rooms[state.currentRoom];
    addHistory(`You woke inside the ${startRoom.name} with no clear memory.`);
    Save.saveState(state);
    renderGame();
  }

  async function startRunFromKey() {
    const key = els.seedRunKey.value.trim();
    if (!key) {
      UI.toast("Enter a run key first");
      return;
    }
    if (Save.hasActiveRun()) {
      const ok = await UI.confirm({
        title: "Start this run key?",
        body: "This replaces the active save, but archived endings remain.",
        confirmLabel: "Start Key",
        cancelLabel: "Cancel",
      });
      if (!ok) return;
    }
    state = Story.createRun("medium", key);
    const startRoom = Story.rooms[state.currentRoom];
    addHistory(`Run key ${state.runKey} woke you inside the ${startRoom.name}.`);
    Save.saveState(state);
    UI.closePanel("settings-panel");
    renderGame();
  }

  function continueRun() {
    Audio.prime();
    state = normalizeState(Save.loadState());
    if (!state) return showIntro(true);
    renderGame();
  }

  function renderGame(message) {
    stopIntroSlideshow();
    UI.showScreen("game-screen");
    rememberRoomVisit(state.currentRoom);
    const room = Story.rooms[state.currentRoom];
    setRoomMedia(room);
    els.roomName.textContent = roomDisplayName(room.id);
    els.turnCount.textContent = `${state.turn} / ${state.turnRange[0]}-${state.turnRange[1]}`;
    els.facilityName.textContent = state.facility;
    els.threatLabel.textContent = `${state.threat.label}: ${distanceLabel()}`;
    els.storyText.textContent = message || currentStoryText(room);
    renderActions();
    renderDetails();
    syncRunKeyUi();
    Save.saveState(state);
  }

  function setRoomMedia(room) {
    const token = ++roomMediaToken;
    clearTimeout(transitionTimer);
    transitionLocked = false;
    els.roomFallback.src = room.poster;
    els.roomFallback.classList.add("visible");
    const idleSrc = mediaSrc(room.idleVideo);
    if (els.roomVideo.dataset.src !== idleSrc) {
      els.roomVideo.dataset.src = idleSrc;
      els.roomVideo.src = idleSrc;
    }
    els.roomVideo.poster = room.poster;
    els.roomVideo.pause();
    try {
      els.roomVideo.currentTime = 0;
    } catch (err) {
      // Some browsers reject seeking before metadata; the load handler below will settle it.
    }
    els.roomVideo.addEventListener("loadeddata", () => {
      if (token !== roomMediaToken) return;
      els.roomFallback.classList.remove("visible");
      try {
        els.roomVideo.currentTime = 0;
      } catch (err) {}
      els.roomVideo.pause();
    }, { once: true });
  }

  function rememberRoomVisit(roomId) {
    if (!state || !roomId) return;
    state.visitedRooms = Array.isArray(state.visitedRooms) ? state.visitedRooms : [];
    if (!state.visitedRooms.includes(roomId)) state.visitedRooms.push(roomId);
  }

  function isRoomNameKnown(roomId) {
    if (!state || roomId === "hallway") return true;
    const hiddenRooms = Array.isArray(state.hiddenRooms) ? state.hiddenRooms : [];
    const visitedRooms = Array.isArray(state.visitedRooms) ? state.visitedRooms : [];
    return !hiddenRooms.includes(roomId) || visitedRooms.includes(roomId) || state.currentRoom === roomId;
  }

  function roomDisplayName(roomId) {
    const room = Story.rooms[roomId];
    if (!room) return "Unknown";
    return isRoomNameKnown(roomId) ? room.name : "Unknown Sector";
  }

  function currentStoryText(room) {
    if (state.currentRoom === "cryo_room" && state.playerRevealed) {
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
      const label = actionDisplayLabel(action);
      button.innerHTML = `${UI.escapeHtml(label.text)}<small>${UI.escapeHtml(label.hint)}</small>`;
      button.addEventListener("click", () => doAction(action));
      (action.side === "sub" ? els.subroomActions : els.exitActions).append(button);
    });
  }

  function actionDisplayLabel(action) {
    if (!action.target || action.target === "hallway") {
      return { text: action.label, hint: action.hint || "" };
    }
    if (!isRoomNameKnown(action.target)) {
      return { text: "Enter Unknown Sector", hint: "unscanned" };
    }
    return { text: action.label, hint: action.hint || "" };
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

    if (action.event === "monster_release" && message) {
      addHistory(message);
      await playMonsterRelease(message);
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

  function isCaught() {
    return state.turn + state.threatPressure >= state.turnLimit;
  }

  function transitionTo(targetRoom) {
    return new Promise(resolve => {
      const token = ++transitionSequence;
      const from = Story.rooms[state.currentRoom];
      const to = Story.rooms[targetRoom];
      const videoSrc = targetRoom === "hallway" ? from.toHallway : to.fromHallway;
      const playbackSrc = mediaSrc(videoSrc);
      const transitionMeta = findTransitionMeta(videoSrc);
      const rawTrim = runtimeTrimFromMeta(transitionMeta);
      transitionLocked = true;
      roomMediaToken += 1;
      clearTimeout(transitionTimer);
      els.roomFallback.src = from.poster;
      els.roomFallback.classList.remove("visible");
      els.roomVideo.poster = from.poster;
      els.roomVideo.dataset.src = playbackSrc;
      els.roomVideo.src = playbackSrc;
      els.roomVideo.load();
      const done = () => {
        if (token !== transitionSequence) return;
        clearTimeout(transitionTimer);
        els.roomVideo.removeEventListener("loadedmetadata", start);
        els.roomVideo.removeEventListener("timeupdate", clamp);
        els.roomVideo.removeEventListener("ended", done);
        els.roomVideo.removeEventListener("error", done);
        state.currentRoom = targetRoom;
        transitionLocked = false;
        resolve();
      };
      const start = () => {
        if (token !== transitionSequence) return;
        const trim = resolveRuntimeTrim(rawTrim, els.roomVideo.duration);
        try {
          els.roomVideo.currentTime = trim.start;
        } catch (err) {}
        els.roomVideo.play().catch(() => {});
        const duration = Number.isFinite(trim.end) ? Math.max(0.25, trim.end - trim.start) : 3.04;
        transitionTimer = setTimeout(done, Math.round((duration + 0.65) * 1000));
      };
      const clamp = () => {
        if (token !== transitionSequence) return;
        const trim = resolveRuntimeTrim(rawTrim, els.roomVideo.duration);
        if (Number.isFinite(trim.end) && els.roomVideo.currentTime >= trim.end) done();
      };
      els.roomVideo.addEventListener("loadedmetadata", start, { once: true });
      els.roomVideo.addEventListener("timeupdate", clamp);
      els.roomVideo.addEventListener("ended", done, { once: true });
      els.roomVideo.addEventListener("error", done, { once: true });
      transitionTimer = setTimeout(done, 4200);
    });
  }

  function cancelActiveTransition() {
    transitionLocked = false;
    transitionSequence += 1;
    clearTimeout(transitionTimer);
    if (els.roomVideo) els.roomVideo.pause();
  }

  function findTransitionMeta(src) {
    const list = Story.transitions || [];
    return list.find(transition => src === transition.src || src.endsWith(transition.src) || src.endsWith(transition.file));
  }

  function mediaSrc(src) {
    if (!src || /^(?:https?:)?\/\//.test(src) || src.startsWith("data:")) return src;
    if (src.startsWith("videos/")) {
      const helperSrc = helperVideoSrc(src);
      if (helperSrc) return helperSrc;
    }
    return appendMediaVersion(src);
  }

  function helperVideoSrc(src) {
    const file = src.split("/").pop().split("?")[0];
    const transition = debugTransitions.find(item => item.file === file && item.src);
    return transition ? transition.src : "";
  }

  function appendMediaVersion(src) {
    const separator = src.includes("?") ? "&" : "?";
    return `${src}${separator}v=${STATIC_MEDIA_VERSION}`;
  }

  function runtimeTrimFromMeta(transition) {
    if (!transition) return { start: 0, end: 3.04 };
    const meta = debugMeta[transition.file] || {};
    return {
      start: typeof meta.trimStart === "number" ? meta.trimStart : (transition.trimStart || 0),
      end: typeof meta.trimEnd === "number" ? meta.trimEnd : (transition.trimEnd || 0),
    };
  }

  function resolveRuntimeTrim(raw, duration) {
    const hasDuration = Number.isFinite(duration) && duration > 0;
    const rawStart = Math.max(0, raw.start || 0);
    const start = hasDuration ? Math.min(rawStart, Math.max(0, duration - 0.05)) : rawStart;
    let end = raw.end || 0;
    if (end < 0 && hasDuration) {
      end = Math.max(0, duration + end);
    } else if (end <= 0) {
      end = hasDuration ? duration : 3.04;
    }
    if (Number.isFinite(end) && end <= start + 0.05) {
      end = hasDuration ? duration : start + 3.04;
    }
    return { start, end };
  }

  async function playMonsterRelease(message) {
    const clip = eventVideoFor("release");
    if (!clip) {
      UI.toast(message);
      return;
    }
    transitionLocked = true;
    roomMediaToken += 1;
    clearTimeout(transitionTimer);
    els.eventMessage.textContent = message;
    els.eventOverlay.classList.add("active");
    els.eventOverlay.classList.remove("video-reveal");
    await delay(900);
    els.roomFallback.src = Story.rooms.hallway.poster;
    els.roomFallback.classList.remove("visible");
    els.roomVideo.poster = Story.rooms.hallway.poster;
    els.roomVideo.dataset.src = mediaSrc(clip);
    els.roomVideo.src = mediaSrc(clip);
    els.roomVideo.load();
    await videoReady(els.roomVideo, 1800);
    try {
      els.roomVideo.currentTime = 0;
    } catch (err) {}
    els.roomVideo.pause();
    els.eventOverlay.classList.add("video-reveal");
    await delay(1000);
    els.roomVideo.play().catch(() => {});
    await waitForVideoWindow(els.roomVideo, 3600);
    els.eventOverlay.classList.remove("video-reveal");
    await delay(520);
    els.eventOverlay.classList.remove("active");
    transitionLocked = false;
  }

  function eventVideoFor(kind) {
    const videos = Story.eventVideos || {};
    if (kind === "victory") {
      const list = Array.isArray(videos.victory) ? videos.victory : [];
      if (!list.length) return "";
      return list[state.turn % list.length];
    }
    const group = videos[kind] || {};
    return group[state.threat && state.threat.id] || group.default || "";
  }

  function videoReady(video, timeoutMs) {
    if (video.readyState > 0) return Promise.resolve();
    return new Promise(resolve => {
      const done = () => {
        clearTimeout(timer);
        video.removeEventListener("loadedmetadata", done);
        video.removeEventListener("error", done);
        resolve();
      };
      const timer = setTimeout(done, timeoutMs);
      video.addEventListener("loadedmetadata", done, { once: true });
      video.addEventListener("error", done, { once: true });
    });
  }

  function waitForVideoWindow(video, timeoutMs) {
    return new Promise(resolve => {
      const done = () => {
        clearTimeout(timer);
        video.removeEventListener("ended", done);
        video.removeEventListener("error", done);
        resolve();
      };
      const timer = setTimeout(done, timeoutMs);
      video.addEventListener("ended", done, { once: true });
      video.addEventListener("error", done, { once: true });
    });
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
    const eventClip = success ? eventVideoFor("victory") : eventVideoFor("attack");
    if (eventClip) els.endingVideo.src = mediaSrc(eventClip);
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
    const goals = Array.isArray(state.goals) && state.goals.length ? state.goals : Story.goals;
    goals.forEach((goal, index) => {
      const visible = index < state.visibleGoals || state.flags.console || state.flags.map;
      const done = !!state.flags[`goal_${goal.id}`] || !!state.flags[goal.requires];
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
      <dt>Run Key</dt><dd>${UI.escapeHtml(state.runKey || "legacy-run")}</dd>
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
    [
      ["cryo_room", "node-top-left"],
      ["med_bay", "node-top-right"],
      ["hallway", "node-center"],
      ["hydroponic_biome", "node-bottom-left"],
      ["reactor_gallery", "node-bottom-right"],
      ["transport", "node-exit"],
    ].forEach(([id, positionClass]) => {
      const node = document.createElement("div");
      const known = id === "transport" ? state.flags.map : isRoomNameKnown(id);
      node.className = `map-node ${positionClass} ${id === state.currentRoom ? "current" : ""} ${known ? "" : "unknown"}`.trim();
      const label = id === "transport" ? "Transport Tube" : roomDisplayName(id);
      node.textContent = label;
      target.append(node);
    });
  }

  function syncRunKeyUi() {
    if (!els.runKey) return;
    els.runKey.value = state && state.runKey ? state.runKey : "";
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
    const transitions = getDebugTransitions();
    els.debugList.innerHTML = "";
    updateFilterButtons();
    const groups = getVisibleDebugGroups();
    groups.forEach(([groupId, label]) => {
      const items = transitions.filter(transition => transition.group === groupId);
      if (!items.length) return;
      const section = document.createElement("section");
      section.className = "debug-section";
      const heading = document.createElement("h3");
      heading.textContent = label;
      section.append(heading);
      items.forEach(transition => {
        const row = document.createElement("div");
        row.className = "debug-row";
        row.classList.toggle("processing", !!transition.processing);
        const pick = document.createElement("button");
        pick.className = "glass-button debug-pick";
        pick.type = "button";
        const tag = transition.processing ? "<b>Processing</b>" : "";
        const fileInfo = transition.fileInfo && transition.fileInfo.label ? transition.fileInfo.label : "";
        pick.innerHTML = `${tag}<strong>${UI.escapeHtml(transition.label)}</strong><small>${UI.escapeHtml(transition.file)}</small><small>${UI.escapeHtml(fileInfo)}</small>`;
        pick.addEventListener("click", () => previewTransition(transition, true));
        const copy = document.createElement("button");
        copy.className = "glass-button slim debug-copy";
        copy.type = "button";
        copy.textContent = "Copy";
        copy.addEventListener("click", () => copyTransitionName(transition.file));
        const redo = document.createElement("button");
        redo.className = "glass-button slim debug-redo";
        redo.type = "button";
        redo.textContent = "Redo";
        redo.disabled = !!transition.processing || !helperOnline || !transition.promptText || transition.group !== "room_transitions";
        redo.addEventListener("click", () => openRegenPanel(transition));
        const reverse = document.createElement("button");
        reverse.className = "glass-button slim debug-reverse";
        reverse.type = "button";
        reverse.textContent = "Reverse";
        reverse.disabled = !!transition.processing || !helperOnline || !transition.canReverse || transition.group !== "room_transitions";
        reverse.addEventListener("click", () => openReversePanel(transition));
        row.append(pick, copy, redo, reverse);
        section.append(row);
      });
      els.debugList.append(section);
    });
    if (!els.debugList.children.length) {
      const empty = document.createElement("p");
      empty.className = "debug-note";
      empty.textContent = "No transitions in this filter.";
      els.debugList.append(empty);
    }
    const visible = groups.flatMap(([groupId]) => transitions.filter(transition => transition.group === groupId));
    if (visible[0] && (!previewedTransition || !visible.some(transition => transition.file === previewedTransition.file))) {
      const first = visible[0];
      els.debugVideo.poster = first.poster;
      renderPreviewText(first);
    }
  }

  function getDebugTransitions() {
    const base = debugTransitions.length ? debugTransitions : (Story.transitions || []);
    return base.map(transition => {
      const meta = debugMeta[transition.file] || {};
      return Object.assign({}, transition, {
        status: meta.status || transition.status,
        trimStart: typeof meta.trimStart === "number" ? meta.trimStart : (transition.trimStart || 0),
        trimEnd: typeof meta.trimEnd === "number" ? meta.trimEnd : (transition.trimEnd || 0),
      });
    });
  }

  function getVisibleDebugGroups() {
    const groups = [
      ["room_transitions", "Room transitions"],
      ["possible_other_transition", "Possible transition videos"],
      ["other_transition", "Other videos"],
      ["ending_video", "Ending videos"],
      ["monster_release", "Monster release videos"],
      ["monster_attack", "Monster attack videos"],
    ];
    if (debugFilter === "all") return groups;
    const map = {
      room: "room_transitions",
      possible: "possible_other_transition",
      other: "other_transition",
      ending: "ending_video",
      release: "monster_release",
      attack: "monster_attack",
    };
    return groups.filter(([groupId]) => groupId === map[debugFilter]);
  }

  function updateFilterButtons() {
    document.querySelectorAll("[data-debug-filter]").forEach(button => {
      button.classList.toggle("active", button.dataset.debugFilter === debugFilter);
    });
  }

  function renderPreviewText(transition) {
    previewedTransition = transition;
    els.debugNote.value = transition.status || "";
    els.debugPrompt.textContent = transition.promptText || "No prompt metadata for this clip.";
    els.debugTrimStart.value = formatSeconds(transition.trimStart || 0);
    els.debugTrimEnd.value = formatSeconds(transition.trimEnd || 0);
  }

  function savePreviewMessage() {
    if (!previewedTransition) return;
    debugMeta[previewedTransition.file] = Object.assign({}, debugMeta[previewedTransition.file], {
      status: els.debugNote.value,
    });
    saveDebugMeta();
  }

  function savePreviewTrim(shouldRestart) {
    if (!previewedTransition) return;
    const trimStart = Math.max(0, parseTrimValue(els.debugTrimStart.value));
    const trimEnd = parseTrimValue(els.debugTrimEnd.value);
    els.debugTrimStart.value = formatSeconds(trimStart);
    els.debugTrimEnd.value = formatSeconds(trimEnd);
    debugMeta[previewedTransition.file] = Object.assign({}, debugMeta[previewedTransition.file], {
      trimStart,
      trimEnd,
    });
    saveDebugMeta();
    previewedTransition = Object.assign({}, previewedTransition, { trimStart, trimEnd });
    if (shouldRestart) seekDebugPreview(true);
  }

  function parseTrimValue(value) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatSeconds(value) {
    return (Number.isFinite(value) ? value : 0).toFixed(2);
  }

  async function refreshHelperStatus() {
    try {
      const result = await helperFetch("/status", { method: "GET" });
      helperOnline = true;
      debugTransitions = Array.isArray(result.transitions) ? result.transitions : [];
      renderHelperStatus(result);
    } catch (err) {
      helperOnline = false;
      debugTransitions = [];
      els.debugHelperStatus.textContent = "Local regen helper: offline";
    }
    renderDebugList();
  }

  function renderHelperStatus(result) {
    const running = result.running;
    if (running) {
      const event = running.ltx_event && running.ltx_event.event ? ` (${running.ltx_event.event})` : "";
      els.debugHelperStatus.textContent = `Local regen helper: ${running.status} ${running.file}${event}`;
      return;
    }
    if (result.queue_depth > 0) {
      els.debugHelperStatus.textContent = `Local regen helper: ${result.queue_depth} queued`;
      return;
    }
    const recent = Array.isArray(result.jobs) ? result.jobs[result.jobs.length - 1] : null;
    els.debugHelperStatus.textContent = recent
      ? `Local regen helper: ready, last ${recent.file} ${recent.status}`
      : "Local regen helper: ready";
  }

  async function helperFetch(path, options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1800);
    try {
      const response = await fetch(`${helperUrl}${path}`, Object.assign({}, options, {
        signal: controller.signal,
        headers: Object.assign({ "Content-Type": "application/json" }, options && options.headers),
      }));
      const data = await response.json();
      if (!response.ok || data.ok === false) throw new Error(data.error || "helper request failed");
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  function openRegenPanel(transition) {
    if (!helperOnline) {
      UI.toast("Start regen_helper.py first");
      return;
    }
    selectedTransition = transition;
    els.regenFile.textContent = transition.file;
    els.regenPrompt.value = transition.promptText || "";
    els.regenMoveMessage.value = transition.status || "";
    UI.openPanel("regen-panel");
  }

  function openReversePanel(transition) {
    if (!helperOnline) {
      UI.toast("Start regen_helper.py first");
      return;
    }
    if (!transition.reverseTarget) {
      UI.toast("No paired reverse target for this transition");
      return;
    }
    selectedReverseTransition = transition;
    els.reverseSummary.textContent = `${transition.file} will be reversed and will replace ${transition.reverseTarget}.`;
    els.reverseMoveMessage.value = `Moved before reverse replacement from ${transition.file}.`;
    UI.openPanel("reverse-panel");
  }

  async function submitRegen(mode) {
    if (!selectedTransition) return;
    const promptText = els.regenPrompt.value.trim();
    if (!promptText) {
      UI.toast("Prompt text is required");
      return;
    }
    const label = mode === "delete" ? "Regen + Delete" : mode === "other" ? "Regen + Other" : "Regen + Possible";
    const ok = await UI.confirm({
      title: `${label}?`,
      body: `Queue a local regeneration for ${selectedTransition.file}.`,
      confirmLabel: "Queue",
      cancelLabel: "Cancel",
      danger: mode === "delete",
    });
    if (!ok) return;
    try {
      const result = await helperFetch("/regen", {
        method: "POST",
        body: JSON.stringify({
          file: selectedTransition.file,
          promptText,
          movedStatus: els.regenMoveMessage.value.trim(),
          mode,
        }),
      });
      UI.closePanel("regen-panel");
      UI.toast(`Queued ${result.job.file}`);
      refreshHelperStatus();
    } catch (err) {
      UI.toast(err.message || "Helper request failed");
    }
  }

  async function submitReverse(mode) {
    if (!selectedReverseTransition) return;
    const label = mode === "delete" ? "Reverse + Delete" : mode === "other" ? "Reverse + Other" : "Reverse + Possible";
    const ok = await UI.confirm({
      title: `${label}?`,
      body: `Reverse ${selectedReverseTransition.file} and replace ${selectedReverseTransition.reverseTarget}.`,
      confirmLabel: "Queue",
      cancelLabel: "Cancel",
      danger: mode === "delete",
    });
    if (!ok) return;
    try {
      const result = await helperFetch("/reverse", {
        method: "POST",
        body: JSON.stringify({
          file: selectedReverseTransition.file,
          movedStatus: els.reverseMoveMessage.value.trim(),
          mode,
        }),
      });
      UI.closePanel("reverse-panel");
      UI.toast(`Queued reverse for ${result.job.targetFile}`);
      refreshHelperStatus();
    } catch (err) {
      UI.toast(err.message || "Helper request failed");
    }
  }

  function previewTransition(transition, shouldCopy) {
    transition = getDebugTransitions().find(item => item.file === transition.file) || transition;
    els.debugVideo.poster = transition.poster;
    if (els.debugVideo.dataset.src !== transition.src) {
      els.debugVideo.dataset.src = transition.src;
      els.debugVideo.src = transition.src;
    }
    renderPreviewText(transition);
    seekDebugPreview(true);
    if (shouldCopy) copyTransitionName(transition.file);
  }

  function seekDebugPreview(shouldPlay) {
    if (!previewedTransition || !els.debugVideo.src) return;
    const video = els.debugVideo;
    const trim = resolveDebugTrim(previewedTransition);
    const seek = () => {
      try {
        video.currentTime = trim.start;
      } catch (err) {
        return;
      }
      if (shouldPlay) video.play().catch(() => {});
    };
    if (video.readyState > 0) {
      seek();
    } else {
      video.addEventListener("loadedmetadata", seek, { once: true });
    }
  }

  function clampDebugPreviewToWindow() {
    if (!previewedTransition || !els.debugVideo.src || els.debugVideo.readyState === 0) return;
    const video = els.debugVideo;
    const trim = resolveDebugTrim(previewedTransition);
    if (video.currentTime < trim.start - 0.05) {
      video.currentTime = trim.start;
      return;
    }
    if (Number.isFinite(trim.end) && video.currentTime >= trim.end) {
      video.pause();
      video.currentTime = trim.start;
    }
  }

  function resolveDebugTrim(transition) {
    const duration = Number.isFinite(els.debugVideo.duration) ? els.debugVideo.duration : 0;
    const rawStart = Math.max(0, transition.trimStart || 0);
    const start = duration > 0 ? Math.min(rawStart, Math.max(0, duration - 0.05)) : rawStart;
    const rawEnd = transition.trimEnd || 0;
    let end = Infinity;
    if (rawEnd < 0 && duration > 0) {
      end = Math.max(0, duration + rawEnd);
    } else if (rawEnd > 0) {
      end = rawEnd;
    } else if (duration > 0) {
      end = duration;
    }
    if (Number.isFinite(end) && end <= start + 0.05) {
      end = duration > start + 0.05 ? duration : Infinity;
    }
    return { start, end };
  }

  function copyTransitionName(name) {
    copyText(name, `Copied ${name}`);
  }

  function copyText(text, message) {
    const done = () => UI.toast(message);
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
      return;
    }
    fallbackCopy(text, done);
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

  function updateGoalsFromFlags() {
    state.mapUnlocked = !!state.flags.map;
    const goals = Array.isArray(state.goals) && state.goals.length ? state.goals : Story.goals;
    goals.forEach(goal => {
      if (goal.requires && state.flags[goal.requires]) state.flags[`goal_${goal.id}`] = true;
    });
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
