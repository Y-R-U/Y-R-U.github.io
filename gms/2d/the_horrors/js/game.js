(function () {
  const Story = window.TheHorrorsStory;
  const Save = window.TheHorrorsSave;
  const Audio = window.TheHorrorsAudio;
  const UI = window.TheHorrorsUI;

  const $ = id => document.getElementById(id);
  const DEBUG_META_KEY = "the_horrors.debugMeta.v1";
  // Appended as ?v= to every media URL via mediaSrc(). New filenames bust
  // cache themselves (so adding a new room doesn't require a bump). BUMP
  // THIS when an existing file is overwritten in place — i.e. anytime the
  // regen helper's Redo/Reverse swaps the contents of an mp4 the player
  // may have already cached. Format: YYYYMMDD-shortnote.
  const STATIC_MEDIA_VERSION = "20260517-v03";
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
  let taskCompleteTimer = 0;
  let preRevealTimer = 0;
  let helperOnline = false;
  let debugTransitions = [];
  let selectedTransition = null;
  let selectedReverseTransition = null;
  let selectedMarkerTransition = null;
  let helperMarkers = [];
  let selectedRegenMarker = "";
  let regenRenderOptions = { width: 384, height: 640, numFrames: 73 };
  let regenMode = "video";
  let imageRedoInfo = null;
  let imagePreviewToken = "";
  let imagePollTimer = 0;
  let previewedTransition = null;
  let helperPoll = 0;
  let debugFilter = "room";
  let debugMeta = loadDebugMeta();
  const cachedMedia = new Set();
  // Helper URL — derived from the page location so the same code works
  // whether you're on http://127.0.0.1:8788/the_horrors/?debug
  // (helper-served, same origin) or your own static server at
  // http://localhost:8778/gms/2d/the_horrors/ (helper is cross-origin,
  // CORS handles it). The helper now hosts every project under its own
  // slug, so we extract the slug from the URL path.
  const helperUrl = (function () {
    const m = location.pathname.match(/\/gms\/2d\/([^\/]+)\//)
           || location.pathname.replace(/^\//, "").match(/^([^\/]+)/);
    const slug = (m && m[1]) || "the_horrors";
    const sameOrigin = location.port === "8788";
    const origin = sameOrigin ? location.origin : "http://127.0.0.1:8788";
    return `${origin}/${slug}/api`;
  })();

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
    mediaPane: document.querySelector(".media-pane"),
    roomVideo: $("room-video"),
    roomFallback: $("room-fallback"),
    roomName: $("room-name"),
    taskCompleteOverlay: $("task-complete-overlay"),
    taskCompleteText: $("task-complete-text"),
    turnCount: $("turn-count"),
    turnBar: $("turn-bar"),
    eventOverlay: $("event-overlay"),
    eventMessage: $("event-message"),
    eventContinue: $("event-continue"),
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
    regenTitle: $("regen-title"),
    regenFile: $("regen-file"),
    regenCurrentRef: $("regen-current-ref"),
    regenCurrentRefImg: $("regen-current-ref-img"),
    regenCurrentRefCaption: $("regen-current-ref-caption"),
    regenPrompt: $("regen-prompt"),
    regenMoveMessage: $("regen-move-message"),
    regenFrames: $("regen-frames"),
    regenFrameSeconds: $("regen-frame-seconds"),
    regenMarkerWrap: $("regen-marker-wrap"),
    regenMarkerToggle: $("regen-marker-toggle"),
    regenMarkerClear: $("regen-marker-clear"),
    regenMarkerList: $("regen-marker-list"),
    regenDelete: $("regen-delete"),
    regenMove: $("regen-move"),
    regenOther: $("regen-other"),
    regenModeToggle: $("regen-mode-toggle"),
    regenVideoMode: $("regen-video-mode"),
    regenImageMode: $("regen-image-mode"),
    regenImagePrompt: $("regen-image-prompt"),
    regenMonsterWrap: $("regen-monster-wrap"),
    regenUseRef: $("regen-use-ref"),
    regenRefThumb: $("regen-ref-thumb"),
    regenRerollRef: $("regen-reroll-ref"),
    regenRefPromptWrap: $("regen-ref-prompt-wrap"),
    regenRefPrompt: $("regen-ref-prompt"),
    regenGenerateImage: $("regen-generate-image"),
    regenPreviewWrap: $("regen-preview-wrap"),
    regenPreviewImg: $("regen-preview-img"),
    regenRegenImage: $("regen-regen-image"),
    regenImageNote: $("regen-image-note"),
    reverseSummary: $("reverse-summary"),
    reverseMoveMessage: $("reverse-move-message"),
    reverseDelete: $("reverse-delete"),
    reverseMove: $("reverse-move"),
    reverseOther: $("reverse-other"),
    markerSummary: $("marker-summary"),
    markerName: $("marker-name"),
    markerSave: $("marker-save"),
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
    runStatsSide: $("run-stats-side"),
    popupMap: $("popup-map"),
    historyList: $("history-list"),
    endingScreen: $("ending-screen"),
    endingVideo: $("ending-video"),
    endingKind: $("ending-kind"),
    endingTitle: $("ending-title"),
    endingText: $("ending-text"),
    endingReplay: $("ending-replay"),
    endingRunKey: $("ending-run-key"),
    endingCopyKey: $("ending-copy-key"),
    restartGame: $("restart-game"),
    endingHistory: $("ending-history"),
    sceneFade: $("scene-fade"),
    music: $("music"),
  };

  function init() {
    UI.init();
    Audio.init(els.music, settings);
    wireEvents();
    syncSettings();
    renderDebugList();
    // Helper poll is intentionally NOT started here — it only fires
    // while the debug panel is open. See startHelperPoll below.
    showIntro();
    if (new URLSearchParams(window.location.search).has("debug")) {
      setTimeout(() => UI.openPanel("debug-panel"), 250);
    }
  }

  function startHelperPoll() {
    if (helperPoll) return;
    refreshHelperStatus();
    helperPoll = window.setInterval(refreshHelperStatus, 5000);
  }
  function stopHelperPoll() {
    if (!helperPoll) return;
    clearInterval(helperPoll);
    helperPoll = 0;
  }

  function normalizeState(nextState) {
    if (!nextState) return null;
    nextState.visitedRooms = Array.isArray(nextState.visitedRooms) ? nextState.visitedRooms : [nextState.currentRoom || "bedroom"];
    // runRooms didn't exist on older saves — treat them as "all rooms in
    // this run" so the player isn't suddenly locked out of half the map.
    if (!Array.isArray(nextState.runRooms) || !nextState.runRooms.length) {
      nextState.runRooms = Object.keys(Story.rooms).filter(id => id !== "hallway");
    }
    // runLayout was added with the v0.3 dynamic-layout pass. Older
    // saves get one built deterministically here (Math.random rng so
    // the visual order isn't stable across reloads, but the gameplay
    // adjacency still works).
    if (!Array.isArray(nextState.runLayout) || !nextState.runLayout.length) {
      if (typeof Story.buildRunLayout === "function") {
        nextState.runLayout = Story.buildRunLayout(nextState.runRooms, Math.random);
      } else {
        nextState.runLayout = Story.roomLayout || [];
      }
    }
    nextState.goals = Array.isArray(nextState.goals) && nextState.goals.length ? nextState.goals : (Story.goals || []);
    nextState.goals = nextState.goals
      .filter(goal => goal && goal.id !== "map")
      .map(goal => {
        if (goal.id === "chain_identity_find") return { ...goal, text: "Discover your identity." };
        const prefix = "Follow a clue trail somewhere in the building: ";
        if (typeof goal.text === "string" && goal.text.startsWith(prefix)) {
          return { ...goal, text: goal.text.slice(prefix.length) };
        }
        return goal;
      });
    nextState.mapUnlocked = true;
    nextState.flags = nextState.flags || {};
    nextState.inventory = Array.isArray(nextState.inventory) ? nextState.inventory : [];
    nextState.history = Array.isArray(nextState.history) ? nextState.history : [];
    nextState.runKey = nextState.runKey || "legacy-run";
    // placedActions is a map of roomId → [{groupId, stepId}]. Older
    // saves (or runs created before task groups existed) just see an
    // empty map — no chains for that run, but everything else works.
    nextState.placedActions = nextState.placedActions && typeof nextState.placedActions === "object" ? nextState.placedActions : {};
    nextState.challengeGroups = Array.isArray(nextState.challengeGroups) ? nextState.challengeGroups : [];
    if (typeof Story.ensureChallengeTasks === "function") {
      nextState = Story.ensureChallengeTasks(nextState) || nextState;
    }
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
    els.openHistory.addEventListener("click", openHistory);
    els.mapMobile.addEventListener("click", openDetails);
    els.endingHistory.addEventListener("click", openHistory);
    els.restartGame.addEventListener("click", () => showIntro(true));
    els.debugButton.addEventListener("click", () => {
      startHelperPoll();
      UI.openPanel("debug-panel");
    });
    els.debugRefresh.addEventListener("click", refreshHelperStatus);
    // The debug panel close button uses [data-close="debug-panel"]; UI
    // calls our closePanel via that. We can't easily wedge a hook in
    // there, so poll explicitly when the panel transitions to hidden.
    const debugPanel = document.getElementById("debug-panel");
    if (debugPanel) {
      const observer = new MutationObserver(() => {
        const open = debugPanel.classList.contains("open");
        if (open) startHelperPoll();
        else stopHelperPoll();
      });
      observer.observe(debugPanel, { attributes: true, attributeFilter: ["class"] });
    }
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
    els.regenDelete.addEventListener("click", () => submitRedo("delete"));
    els.regenMove.addEventListener("click", () => submitRedo("move"));
    els.regenOther.addEventListener("click", () => submitRedo("other"));
    els.regenModeToggle.addEventListener("click", () => setRegenMode(regenMode === "image" ? "video" : "image"));
    els.regenGenerateImage.addEventListener("click", () => generateImage(false));
    els.regenRegenImage.addEventListener("click", () => generateImage(false));
    els.regenRerollRef.addEventListener("click", () => generateImage(true));
    els.regenUseRef.addEventListener("change", updateMonsterRefControls);
    document.querySelectorAll("[data-regen-resolution]").forEach(button => {
      button.addEventListener("click", () => setRegenResolution(button.dataset.regenResolution));
    });
    document.querySelectorAll("[data-regen-duration]").forEach(button => {
      button.addEventListener("click", () => setRegenFrames(parseInt(button.dataset.regenDuration, 10)));
    });
    els.regenFrames.addEventListener("input", () => setRegenFrames(parseInt(els.regenFrames.value, 10), false));
    els.regenMarkerToggle.addEventListener("click", toggleMarkerList);
    els.regenMarkerClear.addEventListener("click", () => selectRegenMarker(""));
    els.markerSave.addEventListener("click", saveMarkerFrame);
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
    els.endingCopyKey.addEventListener("click", () => {
      const key = (els.endingRunKey && els.endingRunKey.value) || (state && state.runKey) || "";
      if (!key) return UI.toast("No replay code");
      copyText(key, "Copied replay code");
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
    Audio.stopHeartbeat();
    clearIdleTimer();
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
    const meter = document.getElementById("cache-meter");
    if (loaded >= manifest.length) {
      if (els.introStatus && els.introStatus.dataset.cacheDone !== "1") {
        els.introStatus.dataset.cacheDone = "1";
        els.introStatus.textContent = "Caching finished";
        // Brief beat to let the user see the success message, then fade
        // status + meter together. CSS handles the opacity transition.
        setTimeout(() => {
          if (els.introStatus) els.introStatus.classList.add("cache-gone");
          if (meter) meter.classList.add("cache-gone");
        }, 900);
      }
    } else {
      els.introStatus.textContent = "Caching game data";
    }
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
    if (!challengeSystemReady()) {
      UI.toast("Challenge puzzles did not load. Refresh the page before starting a new run.");
      return;
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
    if (!challengeSystemReady()) {
      UI.toast("Challenge puzzles did not load. Refresh the page before starting a new run.");
      return;
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
    if (!challengeSystemReady()) {
      UI.toast("Challenge puzzles did not load. Refresh the page if challenge tasks are missing.");
    }
    renderGame();
  }

  function challengeSystemReady() {
    return !!(window.HubPuzzles
      && typeof window.HubPuzzles.createChallengeGroups === "function"
      && typeof window.HubPuzzles.start === "function");
  }

  function renderGame(message) {
    stopIntroSlideshow();
    UI.showScreen("game-screen");
    rememberRoomVisit(state.currentRoom);
    const room = Story.rooms[state.currentRoom];
    setRoomMedia(room);
    els.roomName.textContent = roomDisplayName(room.id);
    renderTurnBar();
    els.facilityName.textContent = state.facility;
    els.threatLabel.textContent = `${state.threat.label}: ${distanceLabel()}`;
    els.storyText.textContent = message || currentStoryText(room);
    renderActions();
    renderDetails();
    syncRunKeyUi();
    Save.saveState(state);
    updateTensionAudio();
    resetIdleTimer();
  }

  // Heartbeat intensity scales with how close we are to the turn limit
  // and whether the monster has already been revealed. Pure audio cue,
  // no visual flash. Set bpm=0 to stop.
  function updateTensionAudio() {
    if (!state || state.ended) {
      Audio.stopHeartbeat();
      return;
    }
    const progress = state.turnLimit > 0 ? state.turn / state.turnLimit : 0;
    const revealed = !!state.flags.monster_revealed;
    let bpm = 0;
    if (progress >= 0.75 || (revealed && progress >= 0.55)) bpm = 84;
    else if (progress >= 0.5 || revealed) bpm = 56;
    Audio.startHeartbeat(bpm);
  }

  // Soft "are you still there?" pulse if the player hasn't clicked
  // anything for IDLE_PROMPT_MS. Re-arms itself so it can fire again.
  let idleTimer = 0;
  const IDLE_PROMPT_MS = 30000;
  function resetIdleTimer() {
    clearTimeout(idleTimer);
    if (!state || state.ended) return;
    idleTimer = setTimeout(function pulse() {
      if (!state || state.ended) return;
      Audio.idlePulse();
      idleTimer = setTimeout(pulse, IDLE_PROMPT_MS);
    }, IDLE_PROMPT_MS);
  }
  function clearIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = 0;
  }

  // Tracks the AbortController of the most recent setRoomMedia call so
  // we can hard-cancel any pending load/loadeddata handlers it attached
  // (previously these piled up — harmless because of the token guard,
  // but a real leak over a long session).
  let roomMediaAbort = null;

  function setRoomMedia(room) {
    const token = ++roomMediaToken;
    clearTimeout(transitionTimer);
    transitionLocked = false;
    if (roomMediaAbort) roomMediaAbort.abort();
    const ac = new AbortController();
    roomMediaAbort = ac;
    const signal = ac.signal;
    // The fallback img is what bridges the gap while the new idle
    // video loads. It must already be displaying the NEW room's
    // poster before we flip .visible — otherwise we briefly show the
    // previous room (e.g. hallway flicker after hallway→room). When
    // we get here straight from a transitionTo, preRevealMs already
    // started loading to.poster, so this is usually instant.
    const idleSrc = mediaSrc(room.idleVideo);
    // Intentionally NOT setting roomVideo.poster — when video.src
    // changes the element may render the poster image at intrinsic
    // ratio (object-fit on video posters isn't reliable), which
    // briefly letterboxes ("video gets thinner then expands"). The
    // fallback img above provides a reliable bridge instead.
    const showFallback = () => {
      if (token !== roomMediaToken) return;
      els.roomFallback.classList.add("visible");
    };
    if (els.roomFallback.getAttribute("src") !== room.poster) {
      els.roomFallback.classList.remove("visible");
      els.roomFallback.addEventListener("load", showFallback, { once: true, signal });
      els.roomFallback.src = room.poster;
      // Safety: if the img is already cached the load event may not
      // fire; check complete after assignment.
      if (els.roomFallback.complete && els.roomFallback.naturalWidth > 0) showFallback();
    } else if (els.roomFallback.complete && els.roomFallback.naturalWidth > 0) {
      showFallback();
    } else {
      els.roomFallback.classList.remove("visible");
      els.roomFallback.addEventListener("load", showFallback, { once: true, signal });
    }
    if (els.roomVideo.dataset.src !== idleSrc) {
      els.roomVideo.dataset.src = idleSrc;
      els.roomVideo.src = idleSrc;
    }
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
    }, { once: true, signal });
  }

  function rememberRoomVisit(roomId) {
    if (!state || !roomId) return;
    state.visitedRooms = Array.isArray(state.visitedRooms) ? state.visitedRooms : [];
    if (!state.visitedRooms.includes(roomId)) state.visitedRooms.push(roomId);
  }

  // A room participates in the current run if it's in state.runRooms.
  // Hallway is always in. Defaults to all rooms if runRooms isn't set
  // (legacy save fallback handled in normalizeState too).
  function isRoomInRun(roomId) {
    if (!roomId) return false;
    if (roomId === "hallway") return true;
    if (!state || !Array.isArray(state.runRooms) || !state.runRooms.length) return true;
    return state.runRooms.includes(roomId);
  }

  // The per-run mini-map / nearby layout. state.runLayout is built at
  // createRun for the picked subset (compact 2-column grid). Falls back
  // to Story.roomLayout for legacy saves that predate runLayout.
  function currentLayout() {
    if (state && Array.isArray(state.runLayout) && state.runLayout.length) return state.runLayout;
    return Story.roomLayout || [];
  }
  function nearbyForCurrent() {
    if (!state || !Story || typeof Story.nearbyRooms !== "function") return [];
    return Story.nearbyRooms(state.currentRoom, currentLayout());
  }

  function isRoomNameKnown(roomId) {
    // Hallway is always known. Every other room stays "???" until the
    // player visits it.
    if (!state || roomId === "hallway") return true;
    const visitedRooms = Array.isArray(state.visitedRooms) ? state.visitedRooms : [];
    return visitedRooms.includes(roomId) || state.currentRoom === roomId;
  }

  function roomDisplayName(roomId) {
    const room = Story.rooms[roomId];
    if (!room) return "???";
    return isRoomNameKnown(roomId) ? room.name : "???";
  }

  function currentStoryText(room) {
    if (state.currentRoom === "bedroom" && state.playerRevealed) {
      return `${room.text} The diary insists you are ${state.playerName}.`;
    }
    if (state.currentRoom === "hallway" && state.flags.map) {
      return `${room.text} The folded plan marks the front door at the far end.`;
    }
    return room.text;
  }

  function renderActions() {
    const actions = Story.actions[state.currentRoom] || [];
    els.subroomActions.innerHTML = "";
    els.exitActions.innerHTML = "";
    const inHallway = state.currentRoom === "hallway";
    actions.forEach(action => {
      // Hallway: skip inline "enter_X" exits — we generate them below
      //   from Story.roomLayout so they live on the matching side.
      // Other rooms: also skip inline "enter_X" — nearby exits below.
      if (action.side === "exit" && action.target && action.target !== "hallway") return;
      if (action.once && state.flags[action.id]) return;
      if (typeof action.guard === "function" && !action.guard(state)) return;
      const button = document.createElement("button");
      button.className = "tag tag-action";
      button.type = "button";
      const label = actionDisplayLabel(action);
      button.textContent = label.text;
      button.addEventListener("click", () => doAction(action));
      (action.side === "sub" ? els.subroomActions : els.exitActions).append(button);
    });
    // Placed task-group steps for this room (chain puzzles). Locked
    // steps (requires not yet held) still render but are disabled with
    // a "(locked)" suffix so the player knows there's a puzzle here.
    const placedRefs = (state.placedActions && state.placedActions[state.currentRoom]) || [];
    placedRefs.forEach(ref => {
      const step = typeof Story.resolveStep === "function" ? Story.resolveStep(ref, state) : null;
      if (!step) return;
      if (state.flags[`done_${ref.groupId}_${ref.stepId}`]) return;
      const button = document.createElement("button");
      button.className = "tag tag-action";
      button.type = "button";
      const locked = step.requires && !state.flags[step.requires];
      button.textContent = locked ? `${step.label} (locked)` : step.label;
      button.disabled = locked;
      if (!locked) button.addEventListener("click", () => doPlacedStep(ref, step));
      els.subroomActions.append(button);
    });
    if (inHallway) {
      // Hallway exits: iterate the PER-RUN layout (compact subset)
      // and split left/right based on the dynamic side assignment.
      currentLayout().forEach(entry => {
        if (!isRoomInRun(entry.id)) return;
        const button = document.createElement("button");
        button.className = "tag tag-action";
        button.type = "button";
        button.textContent = roomDisplayName(entry.id);
        button.addEventListener("click", () => doHallwayToRoom(entry.id));
        if (entry.side === "right") els.exitActions.append(button);
        else els.subroomActions.append(button);
      });
    } else {
      // Non-hallway rooms get up to 3 nearby-room exits (1-turn moves).
      nearbyForCurrent().forEach(targetId => {
        if (!Story.rooms[targetId] || !isRoomInRun(targetId)) return;
        const button = document.createElement("button");
        button.className = "tag tag-action";
        button.type = "button";
        button.textContent = roomDisplayName(targetId);
        button.addEventListener("click", () => doNearbyMove(targetId));
        els.exitActions.append(button);
      });
      // Hallway-back exit: auto-generated unless the room's own actions
      // already declare one. Without this, v0.3 rooms (master_bedroom,
      // greenhouse, etc.) had no declared exit and stranded the player.
      const hasHallwayExit = actions.some(a => a.side === "exit" && a.target === "hallway");
      if (!hasHallwayExit) {
        const button = document.createElement("button");
        button.className = "tag tag-action";
        button.type = "button";
        button.textContent = "Step into the hallway";
        button.addEventListener("click", () => doAction({
          id: `auto_${state.currentRoom}_to_hallway`,
          side: "exit",
          target: "hallway",
          label: "Step into the hallway",
          turns: 1,
        }));
        els.exitActions.append(button);
      }
    }
  }

  async function doHallwayToRoom(targetRoom) {
    if (transitionLocked || !state || state.ended) return;
    if (targetRoom === state.currentRoom) return;
    Audio.prime();
    if (await maybeForcedReveal(1)) return;
    spendTurns(1);
    if (state.ending) return finishRun(state.ending);
    if (isCaught()) {
      addHistory(`${state.threat ? state.threat.name : "Something"} reached the hallway before you could leave.`);
      return finishRun("caught");
    }
    addHistory(`Hallway → ${Story.rooms[targetRoom].name}.`);
    await transitionTo(targetRoom);
    await afterTurn("");
  }

  async function doNearbyMove(targetRoom) {
    if (transitionLocked || !state || state.ended) return;
    if (targetRoom === state.currentRoom) return;
    Audio.prime();
    if (await maybeForcedReveal(1)) return;
    spendTurns(1);
    if (state.ending) return finishRun(state.ending);
    if (isCaught()) {
      addHistory(`${state.threat ? state.threat.name : "Something"} reached the hallway before you could leave.`);
      return finishRun("caught");
    }
    const fromName = Story.rooms[state.currentRoom].name;
    const toName = Story.rooms[targetRoom].name;
    addHistory(`${fromName} → ${toName}.`);
    // Play current → hallway, brief beat, hallway → target. Spends a
    // single turn even though two clips play (this is the "nearby" cost).
    // Skip the action-tray reveal on the first leg so buttons don't
    // flash in midway between the two clips.
    await transitionTo("hallway", { skipRevealAtEnd: true });
    await delay(150);
    await transitionTo(targetRoom);
    await afterTurn("");
  }

  async function doFarMove(targetRoom) {
    // Two-turn move: stop in the hallway between rooms. Used by the map
    // when the player picks a non-nearby room directly.
    if (transitionLocked || !state || state.ended) return;
    if (targetRoom === state.currentRoom) return;
    Audio.prime();
    if (await maybeForcedReveal(1)) return;
    spendTurns(1);
    if (state.ending) return finishRun(state.ending);
    if (isCaught()) {
      addHistory(`${state.threat ? state.threat.name : "Something"} reached the hallway before you could leave.`);
      return finishRun("caught");
    }
    addHistory(`${Story.rooms[state.currentRoom].name} → Hallway.`);
    await transitionTo("hallway", { skipRevealAtEnd: true });
    spendTurns(1);
    if (isCaught()) {
      addHistory(`${state.threat ? state.threat.name : "Something"} reached the hallway before you could leave.`);
      return finishRun("caught");
    }
    addHistory(`Hallway → ${Story.rooms[targetRoom].name}.`);
    await transitionTo(targetRoom);
    await afterTurn("");
  }

  // Auto-reveal: once the timer is due, intercept the next attempted
  // room change instead of firing during an item click.
  async function maybeForcedReveal(projectedTurnCost = 0) {
    if (!state || state.ended) return false;
    if (state.flags.monster_revealed) return false;
    const revealAt = Number.isFinite(state.revealTurn) ? state.revealTurn : 5;
    if (state.turn + projectedTurnCost < revealAt) return false;
    spendTurns(1);
    if (isCaught()) {
      // Caught before the cutscene fires — don't mark monster_revealed
      // (the reveal didn't actually happen, archived run shouldn't
      // claim it did).
      addHistory(`${state.threat ? state.threat.name : "Something"} reached you before the alarm finished.`);
      finishRun("caught");
      return true;
    }
    state.flags.monster_revealed = true;
    const peek = state.currentRoom === "hallway"
      ? `A sound rolls down the hall. ${state.threat.name.toUpperCase()} released during evacuation.`
      : `You hear a noise and peek toward the hallway. ${state.threat.name.toUpperCase()} released during evacuation.`;
    addHistory(peek);
    await playMonsterRelease(peek);
    renderGame("You close the door and wait for the hallway to clear.");
    return true;
  }

  async function afterTurn(message) {
    renderGame(message);
  }

  function actionDisplayLabel(action) {
    if (!action.target || action.target === "hallway") {
      return { text: action.label };
    }
    if (!isRoomNameKnown(action.target)) {
      return { text: "Enter ???" };
    }
    return { text: action.label };
  }

  async function doAction(action) {
    if (transitionLocked || !state || state.ended) return;
    Audio.prime();
    // Actions can opt out of consuming a turn after some condition is
    // met (e.g. a discovery clue that's already been seen). When noopIf
    // matches, just show its message and bail before spendTurns.
    if (typeof action.noopIf === "function" && action.noopIf(state)) {
      if (action.noopMessage) UI.toast(action.noopMessage);
      return;
    }
    if (action.target && await maybeForcedReveal(action.turns || 1)) return;
    spendTurns(action.turns || 1);
    let message = "";
    if (action.run) message = action.run(state);
    if (action.once) state.flags[action.id] = true;
    updateGoalsFromFlags();

    if (state.ending) {
      const ending = state.ending;
      addHistory(message);
      if (ending === "escape") await playEscapePrelude();
      return finishRun(ending);
    }

    if (isCaught()) {
      addHistory(`${state.threat ? state.threat.name : "Something"} reached the hallway before you could leave.`);
      return finishRun("caught");
    }

    if (action.target) {
      addHistory(`${Story.rooms[state.currentRoom].name}: ${action.label}.`);
      await transitionTo(action.target);
      await afterTurn(message);
      return;
    }

    if (action.event === "monster_release" && message) {
      state.flags.monster_revealed = true;
      addHistory(message);
      await playMonsterRelease(message);
      await afterTurn(message);
      return;
    }

    // Look actions: fade to black, show the message text large for
    // 1.5s (or play the lookVideo if it actually exists on disk),
    // then fade back. Marked in story.js with action.look = true.
    if (action.look && message) {
      addHistory(message);
      await playLookCutscene(action, message);
      await afterTurn(message);
      return;
    }

    if (message) {
      addHistory(message);
      UI.toast(message);
    }
    await afterTurn(message);
  }

  // Run one step of a placed task group. Mirrors doAction but skips
  // transitions (placed steps never move the player). Honours noopIf
  // (don't burn a turn if a precondition has flipped) and event hooks.
  async function doPlacedStep(ref, step) {
    if (transitionLocked || !state || state.ended) return;
    Audio.prime();
    if (step.requires && !state.flags[step.requires]) return; // safety
    if (typeof step.noopIf === "function" && step.noopIf(state)) {
      if (step.noopMessage) UI.toast(step.noopMessage);
      return;
    }
    if (step.challenge) return runChallengeStep(ref, step);
    spendTurns(step.turns || 1);
    const message = typeof step.run === "function" ? step.run(state) : "";
    if (step.provides) state.flags[step.provides] = true;
    state.flags[`done_${ref.groupId}_${ref.stepId}`] = true;
    updateGoalsFromFlags();
    if (state.ending) {
      const ending = state.ending;
      addHistory(message);
      if (ending === "escape") await playEscapePrelude();
      return finishRun(ending);
    }
    if (isCaught()) {
      addHistory(`${state.threat ? state.threat.name : "Something"} reached the hallway before you could leave.`);
      return finishRun("caught");
    }
    if (step.event === "monster_release" && message) {
      state.flags.monster_revealed = true;
      addHistory(message);
      await playMonsterRelease(message);
      await afterTurn(message);
      return;
    }
    if (message) {
      addHistory(message);
      UI.toast(message);
    }
    await afterTurn(message);
  }

  async function runChallengeStep(ref, step) {
    if (!window.HubPuzzles || typeof window.HubPuzzles.start !== "function") {
      UI.toast("Challenge system is unavailable.");
      return;
    }
    transitionLocked = true;
    const result = await window.HubPuzzles.start(step.challenge);
    transitionLocked = false;
    if (result && result.success) {
      const message = step.successText || "Challenge solved.";
      if (step.provides) state.flags[step.provides] = true;
      state.flags[`done_${ref.groupId}_${ref.stepId}`] = true;
      updateGoalsFromFlags();
      addHistory(message);
      UI.toast(message);
      await afterTurn(message);
      return;
    }
    if (result && result.noPenalty) {
      UI.toast("Challenge paused.");
      return;
    }
    const failMessage = step.failText || "The challenge fails. The delay costs you a turn.";
    spendTurns(step.turns || 1);
    updateGoalsFromFlags();
    addHistory(failMessage);
    if (isCaught()) {
      addHistory(`${state.threat ? state.threat.name : "Something"} reached the hallway before you could leave.`);
      return finishRun("caught");
    }
    UI.toast(failMessage);
    await afterTurn(failMessage);
  }

  function addInventoryItem(item) {
    state.inventory = Array.isArray(state.inventory) ? state.inventory : [];
    if (!state.inventory.includes(item)) state.inventory.push(item);
  }

  async function playLookCutscene(action, text) {
    const overlay = document.getElementById("cutscene-overlay");
    const videoEl = document.getElementById("cutscene-video");
    const textEl = document.getElementById("cutscene-text");
    if (!overlay) return;
    transitionLocked = true;
    overlay.setAttribute("aria-hidden", "false");
    textEl.textContent = text;
    overlay.classList.remove("has-video");
    // If action.lookVideo names a real cached clip, play it; otherwise
    // just hold the text for 1.5s on a black field. (Placeholder shell —
    // drop a real mp4 in videos/ and the same code path picks it up.)
    const lookSrc = action.lookVideo ? mediaSrc(action.lookVideo) : "";
    const lookExists = !!lookSrc && cachedMedia.has(action.lookVideo);
    if (lookExists) {
      overlay.classList.add("has-video");
      videoEl.src = lookSrc;
      videoEl.load();
      try { videoEl.currentTime = 0; } catch (err) {}
    }
    requestAnimationFrame(() => overlay.classList.add("visible"));
    if (lookExists) {
      try { await videoEl.play(); } catch (err) {}
      await new Promise(resolve => {
        const done = () => {
          videoEl.removeEventListener("ended", done);
          resolve();
        };
        videoEl.addEventListener("ended", done, { once: true });
        // safety: longest realistic look-clip is 5s
        setTimeout(done, 5500);
      });
    } else {
      await delay(1500);
    }
    overlay.classList.remove("visible");
    await delay(420);
    overlay.setAttribute("aria-hidden", "true");
    if (videoEl.src) { try { videoEl.pause(); } catch (err) {} videoEl.removeAttribute("src"); videoEl.load(); }
    transitionLocked = false;
  }

  function spendTurns(count) {
    state.turn += count;
    if (state.currentRoom === "hallway") state.threatPressure += 1;
    Audio.tick();
  }

  function isCaught() {
    return state.turn + state.threatPressure >= state.turnLimit;
  }

  function transitionTo(targetRoom, opts = {}) {
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
      clearTimeout(preRevealTimer);
      // Keep the FROM room covered by the fallback img while the new
      // clip loads. Removing .visible later (after the video actually
      // starts playing) bridges the brief blank that follows a
      // video.src swap — the source of the inter-room flicker.
      if (els.roomFallback.getAttribute("src") !== from.poster) {
        els.roomFallback.src = from.poster;
      }
      els.roomFallback.classList.add("visible");
      els.roomVideo.dataset.src = playbackSrc;
      els.roomVideo.src = playbackSrc;
      els.roomVideo.load();
      // Drop the action trays while the transition video plays. Both
      // sides go opaque-to-invisible in 220ms (.tag-stack transition).
      hideActionTrays();
      let fallbackDropped = false;
      const dropFallback = () => {
        if (fallbackDropped) return;
        fallbackDropped = true;
        els.roomFallback.classList.remove("visible");
      };
      const done = () => {
        if (token !== transitionSequence) return;
        clearTimeout(transitionTimer);
        clearTimeout(preRevealTimer);
        els.roomVideo.removeEventListener("loadedmetadata", start);
        els.roomVideo.removeEventListener("timeupdate", clamp);
        els.roomVideo.removeEventListener("ended", done);
        els.roomVideo.removeEventListener("error", done);
        // Pause on the transition's last good frame so the player
        // doesn't see the clip play past the trim point (or stutter
        // back to its first frame) between rooms.
        try { els.roomVideo.pause(); } catch (err) {}
        dropFallback();
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
        // play() resolves once playback has actually started — by then
        // a frame has been committed, so we can fade the fallback out
        // without exposing the post-src-swap blank.
        els.roomVideo.play()
          .then(() => requestAnimationFrame(dropFallback))
          .catch(() => dropFallback());
        const duration = Number.isFinite(trim.end) ? Math.max(0.25, trim.end - trim.start) : 3.04;
        // 0.5s before the clip ends, swap the fallback img + the video
        // poster to the destination room. The img is async-loaded so
        // having it ready before setRoomMedia flips .visible kills the
        // "stale poster of the previous room" flicker. Also bring the
        // action trays back in unless the caller is chaining a second
        // transition (in which case skipRevealAtEnd avoids a flash).
        const preRevealMs = Math.max(0, Math.round((duration - 0.5) * 1000));
        preRevealTimer = setTimeout(() => {
          if (token !== transitionSequence) return;
          els.roomFallback.src = to.poster;
          if (!opts.skipRevealAtEnd) showActionTrays();
        }, preRevealMs);
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
    clearTimeout(preRevealTimer);
    if (els.roomVideo) els.roomVideo.pause();
    showActionTrays();
  }

  function hideActionTrays() {
    if (els.subroomActions) {
      els.subroomActions.classList.remove("tags-fading-in");
      els.subroomActions.classList.add("tags-hidden");
    }
    if (els.exitActions) {
      els.exitActions.classList.remove("tags-fading-in");
      els.exitActions.classList.add("tags-hidden");
    }
  }

  function showActionTrays() {
    [els.subroomActions, els.exitActions].forEach(tray => {
      if (!tray) return;
      // slower fade-in than fade-out so it feels gentle
      tray.classList.add("tags-fading-in");
      tray.classList.remove("tags-hidden");
    });
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

  // Clips with a defined end-frame (room transitions, success clips with an
  // end-image) carry ~0.4s of unreliable tail riding on that end-frame, so cut
  // it and hold the destination still. A negative trimEnd means "this many
  // seconds before the natural end". Clips with no end-frame animate freely and
  // are left whole. An explicit per-clip trim in the debug panel still wins.
  function defaultTrimEndFor(transition) {
    return transition && transition.endImage ? -0.4 : 0;
  }

  function runtimeTrimFromMeta(transition) {
    if (!transition) return { start: 0, end: 3.04 };
    const meta = debugMeta[transition.file] || {};
    const explicitEnd = typeof meta.trimEnd === "number" ? meta.trimEnd
      : (typeof transition.trimEnd === "number" ? transition.trimEnd : null);
    return {
      start: typeof meta.trimStart === "number" ? meta.trimStart : (transition.trimStart || 0),
      end: explicitEnd !== null ? explicitEnd : defaultTrimEndFor(transition),
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

  function setEventVideoChromeHidden(hidden) {
    if (els.mediaPane) els.mediaPane.classList.toggle("event-video-playing", !!hidden);
  }

  function hideEndingButtonsDuringPlayback() {
    if (!els.endingScreen || !els.endingVideo) return;
    let timer = 0;
    const clear = () => {
      clearTimeout(timer);
      els.endingScreen.classList.remove("event-video-playing");
      els.endingVideo.removeEventListener("ended", clear);
      els.endingVideo.removeEventListener("error", clear);
      els.endingVideo.removeEventListener("loadedmetadata", schedule);
    };
    const schedule = () => {
      clearTimeout(timer);
      const duration = Number.isFinite(els.endingVideo.duration) && els.endingVideo.duration > 0
        ? Math.round((els.endingVideo.duration + 0.35) * 1000)
        : 7000;
      timer = setTimeout(clear, duration);
    };
    els.endingScreen.classList.add("event-video-playing");
    els.endingVideo.addEventListener("loadedmetadata", schedule);
    els.endingVideo.addEventListener("ended", clear);
    els.endingVideo.addEventListener("error", clear);
    schedule();
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
    els.eventOverlay.classList.remove("settling", "video-reveal");
    // Pre-load the reveal video underneath while the player reads the
    // message — so when they hit "click to continue" the video can start
    // immediately. The element stays paused until we explicitly play().
    els.roomFallback.src = Story.rooms.hallway.poster;
    els.roomFallback.classList.remove("visible");
    els.roomVideo.dataset.src = mediaSrc(clip);
    els.roomVideo.src = mediaSrc(clip);
    els.roomVideo.load();
    const ready = videoReady(els.roomVideo, 4200);
    // Hold the fade-to-black + message for a beat (≈3× the old 900ms)
    // so the player actually reads the line before being asked to click.
    await delay(2000);
    await awaitContinue(7000);
    await ready;
    try { els.roomVideo.currentTime = 0; } catch (err) {}
    els.roomVideo.pause();
    els.eventOverlay.classList.add("video-reveal");
    setEventVideoChromeHidden(true);
    await delay(1000);
    els.roomVideo.play().catch(() => {});
    await waitForVideoWindow(els.roomVideo, 3600);
    setEventVideoChromeHidden(false);
    els.eventOverlay.classList.remove("video-reveal");
    els.eventMessage.textContent = "You close the door and wait for the hallway to clear.";
    setRoomMedia(Story.rooms[state.currentRoom]);
    transitionLocked = true;
    await delay(1800);
    els.eventOverlay.classList.add("settling");
    els.eventOverlay.classList.remove("active");
    await delay(900);
    els.eventOverlay.classList.remove("settling");
    // Pause on the last frame so renderGame's setRoomMedia doesn't
    // briefly catch the monster clip still playing on swap.
    try { els.roomVideo.pause(); } catch (err) {}
    transitionLocked = false;
  }

  async function playEscapePrelude() {
    const variantKey = pickEscapeVariant();
    const messages = {
      default: "The last memory returns. The front door key was never hidden; you left it in the one place you would have to pass.",
      wine_cellar: "The last memory returns. There is a passage behind the wine racks, and the latch opens only after the house believes you are leaving by the front.",
      attic: "The last memory returns. The round attic window faces the road, and someone was told to watch for your signal.",
      greenhouse: "The last memory returns. The greenhouse glass was already cracked from the outside; it only needed pressure from within.",
      chapel: "The last memory returns. The chapel was built after the first disappearance, and the thing in the halls has never crossed its threshold.",
    };
    const endings = (Story.eventVideos && Story.eventVideos.endings) || {};
    const escapeMap = endings.escape || {};
    const clip = escapeMap[variantKey] || escapeMap.default || "";
    await playMessageVideoEvent(messages[variantKey] || messages.default, clip, 4300);
  }

  async function playMessageVideoEvent(message, clip, videoMs = 3600) {
    transitionLocked = true;
    roomMediaToken += 1;
    clearTimeout(transitionTimer);
    els.eventMessage.textContent = message;
    els.eventOverlay.classList.add("active");
    els.eventOverlay.classList.remove("settling", "video-reveal");
    let ready = Promise.resolve();
    if (clip) {
      els.roomFallback.src = Story.rooms.hallway.poster;
      els.roomFallback.classList.remove("visible");
      els.roomVideo.dataset.src = mediaSrc(clip);
      els.roomVideo.src = mediaSrc(clip);
      els.roomVideo.load();
      ready = videoReady(els.roomVideo, 4200);
    }
    await delay(1800);
    await awaitContinue(9000);
    await ready;
    if (clip) {
      try { els.roomVideo.currentTime = 0; } catch (err) {}
      els.roomVideo.pause();
      els.eventOverlay.classList.add("video-reveal");
      setEventVideoChromeHidden(true);
      await delay(700);
      els.roomVideo.play().catch(() => {});
      await waitForVideoWindow(els.roomVideo, videoMs);
      setEventVideoChromeHidden(false);
      els.eventOverlay.classList.remove("video-reveal");
    }
    await delay(520);
    els.eventOverlay.classList.remove("active");
    await delay(520);
    transitionLocked = false;
  }

  // Show the "click to continue" prompt after the reading pause, then
  // wait for either a click on it OR the fallback timeout. Used by any
  // message+video event so the player controls the pace from message
  // → cutscene rather than the engine guessing how fast they read.
  function awaitContinue(timeoutMs) {
    const btn = els.eventContinue;
    if (!btn) return delay(Math.max(0, timeoutMs - 1000));
    btn.hidden = false;
    els.eventOverlay.classList.add("continue-ready");
    // Two frames so the transition has something to transition FROM.
    requestAnimationFrame(() => requestAnimationFrame(() => btn.classList.add("visible")));
    return new Promise(resolve => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        btn.removeEventListener("click", finish);
        els.eventOverlay.removeEventListener("click", overlayClick);
        els.eventOverlay.classList.remove("continue-ready");
        btn.classList.remove("visible");
        // Hide after the fade-out completes so it doesn't snap back.
        setTimeout(() => { btn.hidden = true; }, 480);
        resolve();
      };
      // Tapping anywhere on the dimmed overlay also continues — feels
      // more natural on touch.
      const overlayClick = ev => { if (ev.target !== btn) finish(); };
      const timer = setTimeout(finish, timeoutMs);
      btn.addEventListener("click", finish);
      els.eventOverlay.addEventListener("click", overlayClick);
    });
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
    Audio.stopHeartbeat();
    clearIdleTimer();
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

  // Per-room success ending copy. Keys match Story.eventVideos.endings.escape.
  const ESCAPE_VARIANTS = {
    default: {
      title: "The Door Opens",
      text: state => `The front door of ${state.facility} swings open. Outside, the air is colder than you remember air being. You do not look back.`,
    },
    wine_cellar: {
      title: "The Cellar Passage",
      text: state => `Behind the wine racks of ${state.facility}, a low stone passage opens onto wet earth. You follow it until the dark thins into pale daylight.`,
    },
    attic: {
      title: "Headlights At The Window",
      text: state => `From the attic of ${state.facility}, you see distant headlights turn off the road. They grow steadily brighter until they fill the round window with warm rescue light.`,
    },
    greenhouse: {
      title: "The Glass Breaks Outward",
      text: state => `In the greenhouse of ${state.facility}, a cracked pane finally gives. You step out through the opening into the open garden, the house silent behind you.`,
    },
    chapel: {
      title: "Sunrise Through The Chapel",
      text: state => `You wait in the chapel of ${state.facility} until the stained glass fills with warm gold light. Whatever was in the house with you does not come into the chapel.`,
    },
  };

  function pickEscapeVariant() {
    const endings = (Story.eventVideos && Story.eventVideos.endings) || {};
    const escapeMap = endings.escape || {};
    const variants = Object.keys(escapeMap).filter(k => k !== "default");
    // Prefer an explicit room marker if the game sets one in the future.
    if (state.escapeRoom && escapeMap[state.escapeRoom]) return state.escapeRoom;
    // Otherwise rotate by run key so the same seed always lands on the same
    // success clip — keeps replay codes deterministic.
    if (!variants.length) return "default";
    const seed = (state.runKey || "").split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    return variants[seed % variants.length];
  }

  function renderEnding(kind) {
    stopIntroSlideshow();
    const endings = (Story.eventVideos && Story.eventVideos.endings) || {};
    const isSuccess = kind === "escape";
    let kindLabel = "bad ending";
    let title = "Caught In The Hallway";
    let text = `The hallway lights go out one by one. ${state.threat.name} reaches you before the next door opens.`;
    let eventClip = eventVideoFor("attack") || endings.caught || "";
    if (isSuccess) {
      const variantKey = pickEscapeVariant();
      const variant = ESCAPE_VARIANTS[variantKey] || ESCAPE_VARIANTS.default;
      const escapeMap = endings.escape || {};
      kindLabel = "successful escape";
      title = variant.title;
      text = typeof variant.text === "function" ? variant.text(state) : variant.text;
      eventClip = escapeMap[variantKey] || escapeMap.default || "";
    } else if (kind === "window") {
      kindLabel = "bad ending";
      title = "She Waved Back";
      text = `Outside the bedroom window, ${state.threat.name} pressed her hand against the glass. The garden is empty when you finally turn to call for help, but the handprint stays.`;
      eventClip = endings.window || "";
    }

    const paint = () => {
      els.endingKind.textContent = kindLabel;
      els.endingTitle.textContent = title;
      els.endingText.textContent = text;
      if (els.endingReplay) {
        if (state.runKey) {
          els.endingRunKey.value = state.runKey;
          els.endingRunKey.setAttribute("value", state.runKey);
          els.endingReplay.hidden = false;
        } else {
          els.endingRunKey.value = "";
          els.endingRunKey.removeAttribute("value");
          els.endingReplay.hidden = true;
        }
      }
      if (eventClip) els.endingVideo.src = mediaSrc(eventClip);
      els.endingVideo.currentTime = 0;
      if (eventClip) hideEndingButtonsDuringPlayback();
      els.endingVideo.play().catch(() => {});
      UI.showScreen("ending-screen");
    };

    // Success deserves a deliberate fade-to-black; death keeps the snappier
    // existing swap so the jump scare lands.
    if (isSuccess && els.sceneFade) {
      els.sceneFade.classList.add("active");
      setTimeout(() => {
        paint();
        // Let the ending screen + clip mount before fading back in.
        setTimeout(() => els.sceneFade.classList.remove("active"), 80);
      }, 850);
    } else {
      paint();
    }
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
      // Synthetic chain goals are always visible — that's the whole
      // point (player needs to know the chain exists, just not where).
      const isChain = !!goal.synthetic;
      const visible = isChain || index < state.visibleGoals || state.flags.console || state.flags.map || state.flags.chart;
      const done = !!state.flags[`goal_${goal.id}`] || !!state.flags[goal.requires];
      const li = document.createElement("li");
      li.className = `${done ? "done" : ""} ${visible ? "" : "hidden-goal"} ${isChain ? "chain-goal" : ""}`.trim();
      li.textContent = visible ? goal.text : "Hidden goal: find a personal record or a clue in the building.";
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

  // Drives the headline progress bar (replaces the old "1 / 100-120"
  // text). Bar width = state.turn / state.turnLimit. The exact limit is
  // hidden — the player only sees the bar fill and shift colour, so
  // running out of time is a tightening feeling rather than a deadline
  // number. Threshold bands match the CSS pulse animations.
  function renderTurnBar() {
    const bar = els.turnBar;
    const label = els.turnCount;
    if (!bar || !label) return;
    const limit = Math.max(1, Number(state.turnLimit) || 1);
    const ratio = Math.min(1, Math.max(0, (state.turn - 1) / limit));
    const pct = Math.round(ratio * 100);
    bar.style.setProperty("--turn-pct", `${pct}%`);
    bar.setAttribute("aria-valuenow", String(pct));
    let band = "calm";
    if (ratio >= 0.9) band = "critical";
    else if (ratio >= 0.75) band = "urgent";
    else if (ratio >= 0.5) band = "warm";
    bar.classList.remove("calm", "warm", "urgent", "critical");
    bar.classList.add(band);
    label.textContent = String(state.turn);
  }

  function renderStats() {
    const name = state.playerRevealed ? state.playerName : "unresolved";
    // Turns moved to the headline progress bar (turn-count), so it's
    // omitted here to avoid duplicating that info in the stats list.
    const html = `
      <dt>Identity</dt><dd>${UI.escapeHtml(name)}</dd>
      <dt>Facility</dt><dd>${UI.escapeHtml(state.facility)}</dd>
      <dt>Run Key</dt><dd>${UI.escapeHtml(state.runKey || "legacy-run")}</dd>
      <dt>Difficulty</dt><dd>${UI.escapeHtml(state.difficultyLabel)}</dd>
      <dt>Threat</dt><dd>${UI.escapeHtml(state.threat.name)}</dd>
    `;
    // Render to BOTH locations — popup copy (mobile-only on desktop)
    // and side-panel copy (desktop only). Either may be absent on older
    // saved markup, so guard each set.
    if (els.runStats) els.runStats.innerHTML = html;
    if (els.runStatsSide) els.runStatsSide.innerHTML = html;
  }

  function renderMap(target) {
    target.innerHTML = "";
    target.classList.toggle("offline", !state.mapUnlocked);
    if (!state.mapUnlocked) {
      target.textContent = "offline";
      return;
    }
    // Use the per-run dynamic layout (built at createRun for the
    // picked subset). Falls back to Story.roomLayout for legacy saves.
    const runLayoutEntries = currentLayout();
    const layout = runLayoutEntries
      .map(entry => [entry.id, entry.pos])
      .concat([["hallway", "node-center"], ["exit", "node-exit"]]);
    const nearby = state.currentRoom === "hallway"
      ? new Set(runLayoutEntries.map(e => e.id))
      : new Set(nearbyForCurrent());
    layout.forEach(([id, positionClass]) => {
      const node = document.createElement("button");
      node.type = "button";
      const known = id === "exit" ? true : isRoomNameKnown(id);
      const isCurrent = id === state.currentRoom;
      const cost = mapMoveCost(id, nearby);
      node.className = `map-node ${positionClass} ${isCurrent ? "current" : ""} ${known ? "" : "unknown"} ${cost ? `cost-${cost}` : ""}`.trim();
      const label = id === "exit" ? "Front Door" : roomDisplayName(id);
      // Append move cost ("1" or "2") as a tiny suffix so the player
      // sees how many turns each click costs from where they are now.
      node.innerHTML = cost
        ? `<span class="map-label">${UI.escapeHtml(label)}</span><span class="map-cost">${cost}</span>`
        : `<span class="map-label">${UI.escapeHtml(label)}</span>`;
      node.disabled = !cost || isCurrent || state.ended || transitionLocked;
      node.addEventListener("click", () => handleMapClick(id));
      target.append(node);
    });
  }

  function mapMoveCost(id, nearbySet) {
    if (id === state.currentRoom) return 0;
    if (id === "exit") return null; // exit is reached via the hallway action, not the map click
    if (state.currentRoom === "hallway") return 1;
    if (id === "hallway") return 1;
    return nearbySet.has(id) ? 1 : 2;
  }

  async function handleMapClick(targetId) {
    if (!state || state.ended || transitionLocked) return;
    if (targetId === state.currentRoom) return;
    if (targetId === "exit") return; // not navigable via map
    UI.closePanel("details-panel");
    if (targetId === "hallway") {
      // Same as the existing "step into hallway" exit action.
      Audio.prime();
      if (await maybeForcedReveal(1)) return;
      spendTurns(1);
      if (state.ending) return finishRun(state.ending);
      if (isCaught()) {
        addHistory(`${state.threat ? state.threat.name : "Something"} reached the hallway before you could leave.`);
        return finishRun("caught");
      }
      addHistory(`${Story.rooms[state.currentRoom].name} → Hallway.`);
      await transitionTo("hallway");
      await afterTurn("");
      return;
    }
    const nearby = new Set(nearbyForCurrent());
    if (state.currentRoom === "hallway") {
      // Hallway → room: same as one-turn exit action.
      Audio.prime();
      if (await maybeForcedReveal(1)) return;
      spendTurns(1);
      if (isCaught()) {
        addHistory(`${state.threat ? state.threat.name : "Something"} reached the hallway before you could leave.`);
        return finishRun("caught");
      }
      addHistory(`Hallway → ${Story.rooms[targetId].name}.`);
      await transitionTo(targetId);
      await afterTurn("");
      return;
    }
    if (nearby.has(targetId)) return doNearbyMove(targetId);
    return doFarMove(targetId);
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
    els.debugList.innerHTML = "";
    updateFilterButtons();
    if (debugFilter === "mini") {
      renderMiniGameList();
      return;
    }
    const transitions = getDebugTransitions();
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
        redo.disabled = !canRedoTransition(transition);
        redo.addEventListener("click", () => openRegenPanel(transition));
        const reverse = document.createElement("button");
        reverse.className = "glass-button slim debug-reverse";
        reverse.type = "button";
        if (isEventTransition(transition)) {
          reverse.textContent = "Marker";
          reverse.disabled = !canSaveMarker(transition);
          reverse.addEventListener("click", () => openMarkerPanel(transition));
        } else {
          reverse.textContent = "Reverse";
          reverse.disabled = !canReverseTransition(transition);
          reverse.addEventListener("click", () => openReversePanel(transition));
        }
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

  function renderMiniGameList() {
    if (!window.HubPuzzles || typeof window.HubPuzzles.samplePuzzles !== "function" || typeof window.HubPuzzles.start !== "function") {
      const empty = document.createElement("p");
      empty.className = "debug-note";
      empty.textContent = "Mini-game samples did not load.";
      els.debugList.append(empty);
      return;
    }
    els.debugHelperStatus.textContent = "Mini-game test mode";
    els.debugNote.value = "Choose a mini-game sample to play it in the same challenge popup used by real runs.";
    els.debugPrompt.textContent = "These examples do not affect the current run.";
    const section = document.createElement("section");
    section.className = "debug-section";
    const heading = document.createElement("h3");
    heading.textContent = "Mini-game samples";
    section.append(heading);
    getMiniGameSamples().forEach(sample => {
      const row = document.createElement("div");
      row.className = "debug-row mini-game-row";
      const pick = document.createElement("button");
      pick.className = "glass-button debug-pick";
      pick.type = "button";
      pick.innerHTML = `<strong>${UI.escapeHtml(sample.label)}</strong><small>${UI.escapeHtml(sample.puzzle.type)}</small>`;
      pick.addEventListener("click", () => startMiniGameSample(sample));
      const play = document.createElement("button");
      play.className = "glass-button slim mini-game-launch";
      play.type = "button";
      play.textContent = "Play";
      play.addEventListener("click", () => startMiniGameSample(sample));
      row.append(pick, play);
      section.append(row);
    });
    els.debugList.append(section);
  }

  function getMiniGameSamples() {
    const imageChoices = Object.entries(Story.rooms || {})
      .filter(([id, room]) => id !== "hallway" && room && room.poster)
      .slice(0, 4)
      .map(([id, room]) => ({ src: room.poster, label: room.name || id }));
    return window.HubPuzzles.samplePuzzles({
      gameId: "the_horrors",
      imageChoices,
    });
  }

  function startMiniGameSample(sample) {
    UI.closePanel("debug-panel");
    window.HubPuzzles.start(sample.puzzle).then(result => {
      const status = result && result.success ? "solved" : (result && result.reason ? result.reason : "closed");
      UI.toast(`${sample.label}: ${status}`);
    });
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

  function isEventTransition(transition) {
    return ["ending_video", "monster_release", "monster_attack"].includes(transition.group);
  }

  function canRedoTransition(transition) {
    if (!helperOnline || !!transition.processing || !transition.promptText) return false;
    if (transition.group === "room_transitions") return transition.canRedo !== false;
    if (isEventTransition(transition)) return transition.canRedo === true;
    return false;
  }

  function canReverseTransition(transition) {
    return helperOnline && !transition.processing && transition.group === "room_transitions" && !!transition.canReverse;
  }

  function canSaveMarker(transition) {
    return helperOnline && !transition.processing && isEventTransition(transition) && !!transition.exists;
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
      helperMarkers = Array.isArray(result.markers) ? result.markers : [];
      renderHelperStatus(result);
    } catch (err) {
      helperOnline = false;
      debugTransitions = [];
      helperMarkers = [];
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

  function setRegenResolution(value) {
    const [width, height] = String(value || "384x640").split("x").map(Number);
    regenRenderOptions.width = width === 576 && height === 960 ? 576 : 384;
    regenRenderOptions.height = width === 576 && height === 960 ? 960 : 640;
    document.querySelectorAll("[data-regen-resolution]").forEach(button => {
      button.classList.toggle("active", button.dataset.regenResolution === `${regenRenderOptions.width}x${regenRenderOptions.height}`);
    });
  }

  function setRegenFrames(frames, syncInput = true) {
    const next = Number.isFinite(frames) && frames > 0 ? Math.round(frames) : 73;
    regenRenderOptions.numFrames = next;
    if (syncInput) els.regenFrames.value = String(next);
    els.regenFrameSeconds.textContent = `${(next / 24).toFixed(2)}s`;
    document.querySelectorAll("[data-regen-duration]").forEach(button => {
      button.classList.toggle("active", parseInt(button.dataset.regenDuration, 10) === next);
    });
  }

  function setupRegenOptions(transition) {
    setRegenResolution("384x640");
    setRegenFrames(transition.numFrames || (isEventTransition(transition) && transition.group === "ending_video" ? 121 : 73));
    selectedRegenMarker = "";
    const canUseMarkers = isEventTransition(transition);
    els.regenMarkerWrap.hidden = !canUseMarkers;
    els.regenMarkerList.hidden = true;
    renderMarkerList();
    selectRegenMarker("");
  }

  function renderMarkerList() {
    els.regenMarkerList.innerHTML = "";
    if (!helperMarkers.length) {
      const empty = document.createElement("p");
      empty.className = "debug-note";
      empty.textContent = "No saved marker frames yet.";
      els.regenMarkerList.append(empty);
      return;
    }
    helperMarkers.forEach(marker => {
      const button = document.createElement("button");
      button.className = "glass-button marker-choice";
      button.type = "button";
      button.innerHTML = `<img src="${UI.escapeHtml(marker.src)}" alt=""><span><strong>${UI.escapeHtml(marker.name)}</strong><small>${UI.escapeHtml(marker.modified || "")}</small></span>`;
      button.addEventListener("click", () => {
        selectRegenMarker(marker.file);
        els.regenMarkerList.hidden = true;
      });
      els.regenMarkerList.append(button);
    });
  }

  function selectRegenMarker(file) {
    selectedRegenMarker = file || "";
    const marker = helperMarkers.find(item => item.file === selectedRegenMarker);
    els.regenMarkerToggle.textContent = marker ? marker.name : "No marker selected";
  }

  function toggleMarkerList() {
    els.regenMarkerList.hidden = !els.regenMarkerList.hidden;
  }

  function defaultMarkerName(transition) {
    const stem = (transition.file || "").replace(/\.mp4$/i, "");
    if (stem.startsWith("monster_release_")) return `${stem.replace("monster_release_", "")}_release`;
    if (stem.startsWith("monster_attack_")) return `${stem.replace("monster_attack_", "")}_attack`;
    return stem || "marker";
  }

  function openRegenPanel(transition) {
    if (!helperOnline) {
      UI.toast("Start regen_helper.py first");
      return;
    }
    selectedTransition = transition;
    imageRedoInfo = transition.imageRedo || null;
    els.regenFile.textContent = transition.file;
    els.regenPrompt.value = transition.promptText || "";
    els.regenMoveMessage.value = transition.status || "";
    setupRegenOptions(transition);
    setupImageRedo();
    setRegenMode("video");
    UI.openPanel("regen-panel");
  }

  function setupImageRedo() {
    clearTimeout(imagePollTimer);
    imagePreviewToken = "";
    els.regenModeToggle.hidden = !imageRedoInfo;
    els.regenPreviewWrap.hidden = true;
    els.regenPreviewImg.removeAttribute("src");
    updateCurrentRefDisplay();
    if (!imageRedoInfo) return;
    els.regenImagePrompt.value = imageRedoInfo.imagePrompt || "";
    const isMonster = String(imageRedoInfo.kind || "").startsWith("monster_");
    els.regenMonsterWrap.hidden = !isMonster;
    if (isMonster) {
      els.regenUseRef.checked = true;
      els.regenRefPrompt.value = imageRedoInfo.monsterRefPrompt || "";
      if (imageRedoInfo.monsterRefExists && imageRedoInfo.monsterRefSrc) {
        els.regenRefThumb.src = imageRedoInfo.monsterRefSrc;
        els.regenRefThumb.hidden = false;
      } else {
        els.regenRefThumb.hidden = true;
      }
      updateMonsterRefControls();
    }
  }

  function updateMonsterRefControls() {
    const useRef = els.regenUseRef.checked;
    els.regenRefPromptWrap.hidden = !useRef;
    els.regenRerollRef.hidden = !useRef;
  }

  function updateCurrentRefDisplay() {
    if (!els.regenCurrentRef) return;
    const info = imageRedoInfo;
    const isMonster = info && String(info.kind || "").startsWith("monster_");
    if (!isMonster) {
      els.regenCurrentRef.hidden = true;
      els.regenCurrentRefImg.removeAttribute("src");
      return;
    }
    els.regenCurrentRef.hidden = false;
    if (info.monsterRefExists && info.monsterRefSrc) {
      els.regenCurrentRefImg.src = info.monsterRefSrc;
      els.regenCurrentRefImg.hidden = false;
      els.regenCurrentRefCaption.textContent = `Monster reference: ${info.monsterRefFile}`;
    } else if (info.monsterMarkerSrc) {
      els.regenCurrentRefImg.src = info.monsterMarkerSrc;
      els.regenCurrentRefImg.hidden = false;
      els.regenCurrentRefCaption.textContent = `No reference yet — showing marker: ${info.monsterMarkerFile}`;
    } else {
      els.regenCurrentRefImg.hidden = true;
      els.regenCurrentRefImg.removeAttribute("src");
      els.regenCurrentRefCaption.textContent = "No monster reference or marker saved yet.";
    }
  }

  function setRegenMode(mode) {
    regenMode = mode === "image" && imageRedoInfo ? "image" : "video";
    const isImage = regenMode === "image";
    els.regenVideoMode.hidden = isImage;
    els.regenImageMode.hidden = !isImage;
    els.regenImageNote.hidden = !isImage;
    els.regenTitle && (els.regenTitle.textContent = isImage ? "Redo Image" : "Redo Transition");
    els.regenModeToggle.textContent = isImage ? "Redo Video" : "Redo Image";
    const verb = isImage ? "Accept" : "Regen";
    els.regenDelete.textContent = `${verb} + Delete`;
    els.regenMove.textContent = `${verb} + Possible`;
    els.regenOther.textContent = `${verb} + Other`;
    // The marker picker only applies to the video (no-ref) path.
    if (els.regenMarkerWrap && isImage) els.regenMarkerWrap.hidden = true;
    else if (els.regenMarkerWrap && selectedTransition) els.regenMarkerWrap.hidden = !isEventTransition(selectedTransition);
    updateImageActionState();
  }

  function updateImageActionState() {
    if (regenMode !== "image") {
      [els.regenDelete, els.regenMove, els.regenOther].forEach(b => { b.disabled = false; });
      return;
    }
    const ready = !!imagePreviewToken;
    [els.regenDelete, els.regenMove, els.regenOther].forEach(b => { b.disabled = !ready; });
  }

  async function generateImage(rerollRef) {
    if (!selectedTransition || !imageRedoInfo) return;
    const promptText = els.regenImagePrompt.value.trim();
    if (!promptText) { UI.toast("Image prompt is required"); return; }
    setImageBusy(true, rerollRef ? "Re-rolling reference…" : "Generating image…");
    try {
      const result = await helperFetch("/image_preview", {
        method: "POST",
        body: JSON.stringify({
          file: selectedTransition.file,
          promptText,
          useMonsterRef: els.regenUseRef.checked,
          monsterRefPrompt: els.regenRefPrompt.value.trim(),
          rerollRef: !!rerollRef,
        }),
      });
      pollImageJob(result.job.id);
    } catch (err) {
      setImageBusy(false);
      UI.toast(err.message || "Helper request failed");
    }
  }

  function pollImageJob(jobId) {
    clearTimeout(imagePollTimer);
    const tick = async () => {
      let job = null;
      try {
        const status = await helperFetch("/status", { method: "GET" });
        const jobs = Array.isArray(status.jobs) ? status.jobs : [];
        job = jobs.find(item => item.id === jobId);
      } catch (err) {
        imagePollTimer = setTimeout(tick, 2500);
        return;
      }
      if (!job) { imagePollTimer = setTimeout(tick, 2500); return; }
      if (job.status === "image_ready") {
        imagePreviewToken = job.preview || "";
        els.regenPreviewImg.src = job.previewSrc || "";
        els.regenPreviewWrap.hidden = false;
        if (job.monsterRefSrc) {
          els.regenRefThumb.src = job.monsterRefSrc;
          els.regenRefThumb.hidden = false;
          if (imageRedoInfo) {
            imageRedoInfo.monsterRefExists = true;
            imageRedoInfo.monsterRefSrc = job.monsterRefSrc;
          }
          updateCurrentRefDisplay();
        }
        setImageBusy(false);
        updateImageActionState();
        UI.toast("Image ready — accept to redo the video(s)");
        return;
      }
      if (job.status === "failed") {
        setImageBusy(false);
        UI.toast(job.error || "Image generation failed");
        return;
      }
      els.regenGenerateImage.textContent = job.status ? job.status.replace(/_/g, " ") + "…" : "Working…";
      imagePollTimer = setTimeout(tick, 2500);
    };
    tick();
  }

  function setImageBusy(busy, label) {
    els.regenGenerateImage.disabled = busy;
    els.regenRegenImage.disabled = busy;
    els.regenRerollRef.disabled = busy;
    els.regenGenerateImage.textContent = busy ? (label || "Working…") : "Generate Image";
    if (busy) updateImageActionState();
  }

  function submitRedo(mode) {
    if (regenMode === "image") return submitImageCommit(mode);
    return submitRegen(mode);
  }

  async function submitImageCommit(mode) {
    if (!selectedTransition || !imagePreviewToken) {
      UI.toast("Generate an image first");
      return;
    }
    const label = mode === "delete" ? "Accept + Delete" : mode === "other" ? "Accept + Other" : "Accept + Possible";
    const videoCount = (imageRedoInfo.videoFiles || []).length || 1;
    const ok = await UI.confirm({
      title: `${label}?`,
      body: `Save the new still and redo ${videoCount} video(s) for ${selectedTransition.file}.`,
      confirmLabel: "Queue",
      cancelLabel: "Cancel",
      danger: mode === "delete",
    });
    if (!ok) return;
    try {
      const result = await helperFetch("/image_commit", {
        method: "POST",
        body: JSON.stringify({
          file: selectedTransition.file,
          preview: imagePreviewToken,
          movedStatus: els.regenMoveMessage.value.trim(),
          width: regenRenderOptions.width,
          height: regenRenderOptions.height,
          numFrames: regenRenderOptions.numFrames,
          videoPromptText: els.regenPrompt.value.trim(),
          mode,
        }),
      });
      UI.closePanel("regen-panel");
      const n = Array.isArray(result.jobs) ? result.jobs.length : 1;
      UI.toast(`Queued ${n} video redo(s)`);
      refreshHelperStatus();
    } catch (err) {
      UI.toast(err.message || "Helper request failed");
    }
  }

  function openMarkerPanel(transition) {
    if (!helperOnline) {
      UI.toast("Start regen_helper.py first");
      return;
    }
    selectedMarkerTransition = transition;
    const time = Number.isFinite(els.debugVideo.currentTime) ? els.debugVideo.currentTime : 0;
    els.markerSummary.textContent = `Save a marker from ${transition.file} at ${time.toFixed(2)}s.`;
    els.markerName.value = defaultMarkerName(transition);
    UI.openPanel("marker-panel");
    els.markerName.focus();
    els.markerName.select();
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
          width: regenRenderOptions.width,
          height: regenRenderOptions.height,
          numFrames: regenRenderOptions.numFrames,
          marker: selectedRegenMarker,
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

  async function saveMarkerFrame() {
    if (!selectedMarkerTransition) return;
    const name = els.markerName.value.trim();
    if (!name) {
      UI.toast("Marker name is required");
      return;
    }
    try {
      const result = await helperFetch("/marker", {
        method: "POST",
        body: JSON.stringify({
          file: selectedMarkerTransition.file,
          name,
          time: Number.isFinite(els.debugVideo.currentTime) ? els.debugVideo.currentTime : 0,
        }),
      });
      UI.closePanel("marker-panel");
      UI.toast(`Queued marker ${result.job.name}`);
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

  function showTaskComplete(goal) {
    if (!goal || goal.id === "escape" || !els.taskCompleteOverlay || !els.taskCompleteText) return;
    clearTimeout(taskCompleteTimer);
    els.taskCompleteText.textContent = goal.text || "Task completed.";
    els.taskCompleteOverlay.classList.remove("active");
    els.taskCompleteOverlay.setAttribute("aria-hidden", "false");
    void els.taskCompleteOverlay.offsetWidth;
    els.taskCompleteOverlay.classList.add("active");
    taskCompleteTimer = setTimeout(() => {
      els.taskCompleteOverlay.classList.remove("active");
      els.taskCompleteOverlay.setAttribute("aria-hidden", "true");
    }, 1600);
  }

  function updateGoalsFromFlags() {
    const goals = Array.isArray(state.goals) && state.goals.length ? state.goals : Story.goals;
    goals.forEach(goal => {
      if (!goal.requires || !state.flags[goal.requires]) return;
      const goalFlag = `goal_${goal.id}`;
      const wasDone = !!state.flags[goalFlag];
      state.flags[goalFlag] = true;
      if (!wasDone) showTaskComplete(goal);
    });
  }

  function distanceLabel() {
    // Pure label only — no DOM side-effects. End-game tension is the
    // heartbeat's job (no continual visual flashes per user request).
    const remaining = state.turnLimit - state.turn - state.threatPressure;
    if (remaining < 8) return "at the door";
    if (remaining < 20) return "near";
    if (remaining < 40) return "closing";
    return "distant";
  }

  document.addEventListener("DOMContentLoaded", init);
})();
