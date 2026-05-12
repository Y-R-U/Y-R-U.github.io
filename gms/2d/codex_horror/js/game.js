(function () {
  const Story = window.BlackGlassStory;
  const Save = window.BlackGlassSave;
  const Audio = window.BlackGlassAudio;
  const UI = window.BlackGlassUI;

  let state = Save.loadState();
  let settings = Save.loadSettings();
  let typeTimer = null;
  let endingVideoTimer = null;
  let lastRoomId = "";
  let wokeThisSession = false;
  const endingVideoStillMs = 1500;
  const mapRoomIds = [
    "cot_room",
    "artery_hall",
    "washroom",
    "nursery",
    "stairwell",
    "kitchen",
    "archive",
    "chapel",
    "conservatory",
    "engine_room",
    "cellar",
    "observatory",
    "black_door",
  ];

  const $ = id => document.getElementById(id);

  const els = {
    wakeButton: $("wake-button"),
    wakeLine: $("wake-line"),
    wakeCount: $("wake-count"),
    newGame: $("new-game"),
    continueGame: $("continue-game"),
    titleJournal: $("title-journal"),
    toolJournal: $("tool-journal"),
    toolSettings: $("tool-settings"),
    roomImage: $("room-image"),
    roomKicker: $("room-kicker"),
    roomTitle: $("room-title"),
    roomText: $("room-text"),
    effectLine: $("effect-line"),
    choices: $("choices"),
    roomCount: $("room-count"),
    clueCount: $("clue-count"),
    dreadValue: $("dread-value"),
    dreadStat: document.querySelector(".dread-stat"),
    openMap: $("open-map"),
    openEvidence: $("open-evidence"),
    endingImage: $("ending-image"),
    endingVideo: $("ending-video"),
    endingKind: $("ending-kind"),
    endingTitle: $("ending-title"),
    endingText: $("ending-text"),
    endingRestart: $("ending-restart"),
    endingJournal: $("ending-journal"),
    musicToggle: $("music-toggle"),
    volume: $("volume"),
    textSpeed: $("text-speed"),
    resetRun: $("reset-run"),
    historyList: $("history-list"),
    endingBadges: $("ending-badges"),
    evidenceList: $("evidence-list"),
    mapList: $("map-list"),
    music: $("music"),
  };

  function init() {
    UI.init();
    Audio.init(els.music, settings);
    syncSettings();
    wireEvents();
    if (Save.hasActiveRun()) {
      showTitle();
    } else {
      startWakeSequence(() => {
        wokeThisSession = true;
        showTitle();
      });
    }
  }

  function wireEvents() {
    els.newGame.addEventListener("click", async () => {
      Audio.prime();
      if (Save.hasActiveRun()) {
        const ok = await UI.confirm({
          title: "Begin again?",
          body: "This replaces your current route through the house. Endings stay in the journal.",
          confirmLabel: "Begin",
          cancelLabel: "Keep Run",
        });
        if (!ok) return;
      }
      if (wokeThisSession) {
        beginRun();
      } else {
        startWakeSequence(() => {
          wokeThisSession = true;
          beginRun();
        });
      }
    });
    els.continueGame.addEventListener("click", () => {
      Audio.prime();
      enterRoom(state.currentRoom);
    });
    els.titleJournal.addEventListener("click", openJournal);
    els.toolJournal.addEventListener("click", openJournal);
    els.endingJournal.addEventListener("click", openJournal);
    els.endingRestart.addEventListener("click", () => startWakeSequence(() => {
      wokeThisSession = true;
      beginRun();
    }));
    els.toolSettings.addEventListener("click", () => {
      UI.openPanel("settings-panel");
      Audio.prime();
    });
    els.openEvidence.addEventListener("click", openEvidence);
    els.openMap.addEventListener("click", openMap);
    els.musicToggle.addEventListener("click", () => {
      settings.music = !settings.music;
      Save.saveSettings(settings);
      syncSettings();
      Audio.apply(settings);
      if (settings.music) Audio.prime();
    });
    els.volume.addEventListener("input", () => {
      settings.volume = parseInt(els.volume.value, 10) / 100;
      Save.saveSettings(settings);
      Audio.apply(settings);
    });
    els.textSpeed.addEventListener("change", () => {
      settings.textSpeed = els.textSpeed.value;
      Save.saveSettings(settings);
    });
    els.resetRun.addEventListener("click", async () => {
      const ok = await UI.confirm({
        title: "Reset current run?",
        body: "You will wake at the start again. Collected endings stay saved.",
        confirmLabel: "Reset",
        cancelLabel: "Cancel",
        danger: true,
      });
      if (!ok) return;
      Save.clearState();
      state = Save.freshState();
      UI.closePanel("settings-panel");
      showTitle();
    });
  }

  function syncSettings() {
    els.musicToggle.setAttribute("aria-pressed", settings.music ? "true" : "false");
    els.volume.value = Math.round(settings.volume * 100);
    els.textSpeed.value = settings.textSpeed;
  }

  function showTitle() {
    stopEndingVideo();
    UI.showScreen("title-screen");
    els.continueGame.hidden = !Save.hasActiveRun();
    els.titleJournal.hidden = !hasAnyJournal();
    els.toolJournal.hidden = !hasAnyJournal();
  }

  function startWakeSequence(done) {
    UI.showScreen("wake-screen");
    let taps = 0;
    const lines = [
      "tap to wake",
      "again",
      "harder",
      "hear the rain",
      "feel the tile",
      "open one eye",
      "do not sleep",
      "count the lights",
      "wake cleanly",
    ];

    els.wakeLine.textContent = lines[0];
    els.wakeCount.textContent = "0 / 9";
    els.wakeButton.style.transform = "scale(1)";

    const onTap = () => {
      Audio.prime();
      taps += 1;
      els.wakeLine.textContent = lines[Math.min(taps, lines.length - 1)];
      els.wakeCount.textContent = `${Math.min(taps, 9)} / 9`;
      els.wakeButton.animate([
        { transform: "scale(1)" },
        { transform: `scale(${1 + taps * 0.01})` },
        { transform: "scale(1)" },
      ], { duration: 150 });
      document.documentElement.style.setProperty("--wake-open", String(taps / 9));
      if (taps >= 9) {
        els.wakeButton.removeEventListener("click", onTap);
        settings.introSeen = true;
        Save.saveSettings(settings);
        setTimeout(done, 220);
      }
    };

    els.wakeButton.addEventListener("click", onTap);
  }

  function beginRun() {
    stopEndingVideo();
    state = Save.freshState();
    state.active = true;
    Save.saveState(state);
    enterRoom(Story.start);
  }

  function enterRoom(roomId, choiceLabel = "") {
    const room = Story.rooms[roomId];
    if (!room) {
      console.warn("Unknown room", roomId);
      return;
    }

    if (choiceLabel) addHistory("choice", choiceLabel);
    state.currentRoom = roomId;
    state.active = true;
    state.lastEffect = "";

    if (!room.ending) {
      if (!state.visited.includes(roomId)) state.visited.push(roomId);
      if (lastRoomId !== roomId) addHistory("room", room.title);
    }

    applyRoomEffects(room);

    if (state.dread >= 10 && !room.ending) {
      enterRoom(Story.panicEnding);
      return;
    }

    if (room.ending) {
      showEnding(room);
      return;
    }

    Save.saveState(state);
    renderRoom(room, roomId);
    lastRoomId = roomId;
  }

  function applyRoomEffects(room) {
    const effects = [];
    if (Array.isArray(room.gain)) {
      room.gain.forEach(id => {
        if (!state.inventory.includes(id)) {
          state.inventory.push(id);
          effects.push(`Found: ${Story.items[id].name}`);
          addHistory("clue", Story.items[id].name);
          UI.toast(`Clue found: ${Story.items[id].name}`);
        }
      });
    }
    if (Array.isArray(room.set)) {
      room.set.forEach(flag => {
        if (!state.flags[flag]) effects.push(flag === "power" ? "The house has power again." : "A truth settled into place.");
        state.flags[flag] = true;
      });
    }
    if (room.dread) {
      state.dread = clamp(state.dread + room.dread, 0, 10);
      effects.push(`Dread +${room.dread}`);
    }
    if (room.reduceDread) {
      const before = state.dread;
      state.dread = clamp(state.dread - room.reduceDread, 0, 10);
      if (before !== state.dread) effects.push(`Dread -${before - state.dread}`);
    }
    if (room.history && !state.history.some(entry => entry.text === room.history)) {
      addHistory("note", room.history);
    }
    state.lastEffect = effects.join("  ");
  }

  function renderRoom(room, roomId) {
    UI.showScreen("game-screen");
    els.toolJournal.hidden = false;
    if (room.image) {
      els.roomImage.classList.remove("loaded");
      const img = new Image();
      img.onload = () => {
        els.roomImage.src = room.image;
        requestAnimationFrame(() => els.roomImage.classList.add("loaded"));
      };
      img.src = room.image;
    }
    els.roomKicker.textContent = room.kicker || "Room";
    els.roomTitle.textContent = room.title;
    els.effectLine.hidden = !state.lastEffect;
    els.effectLine.textContent = state.lastEffect;
    updateStats();
    typeText(room.text || "");
    renderChoices(room, roomId);
  }

  function renderChoices(room) {
    els.choices.innerHTML = "";
    (room.choices || []).forEach(choice => {
      if (choice.hideIfFlag && choice.hideIfFlag.some(flag => state.flags[flag])) return;
      const allowed = canChoose(choice);
      const button = document.createElement("button");
      button.className = `choice${allowed.ok ? "" : " locked"}`;
      button.type = "button";
      button.innerHTML = `<span><strong>${choice.label}</strong>${choice.hint ? `<br><small>${choice.hint}</small>` : ""}</span>`;
      button.addEventListener("click", () => {
        Audio.prime();
        if (!allowed.ok) {
          UI.toast(allowed.reason);
          return;
        }
        const nextDread = choice.dread ? clamp(state.dread + choice.dread, 0, 10) : state.dread;
        state.dread = nextDread;
        enterRoom(choice.target, choice.label);
      });
      els.choices.appendChild(button);
    });
  }

  function canChoose(choice) {
    const missing = [];
    (choice.requires || []).forEach(id => {
      if (!state.inventory.includes(id)) missing.push(Story.items[id].name);
    });
    (choice.requiresFlag || []).forEach(flag => {
      if (!state.flags[flag]) missing.push(flag === "power" ? "power restored" : flag);
    });
    (choice.requiresNotFlag || []).forEach(flag => {
      if (state.flags[flag]) missing.push(flag === "power" ? "power already restored" : `${flag} not set`);
    });
    if (choice.maxDread !== undefined && state.dread > choice.maxDread) {
      missing.push(`dread ${choice.maxDread} or lower`);
    }
    if (choice.requiresAny && !choice.requiresAny.some(id => state.inventory.includes(id))) {
      missing.push("one more hard truth");
    }
    return missing.length ? { ok: false, reason: `Needs ${missing.join(", ")}` } : { ok: true };
  }

  function showEnding(room) {
    const ending = Story.endings[room.ending];
    state.ended = true;
    state.active = false;
    addHistory("ending", ending.title);
    Save.saveState(state);
    Save.recordEnding(room.ending);
    UI.showScreen("ending-screen");
    els.toolJournal.hidden = false;
    els.endingImage.src = room.image || "images/horror.png";
    els.endingKind.textContent = `${ending.kind} ending`;
    els.endingTitle.textContent = ending.title;
    els.endingText.textContent = room.text;
    prepareEndingVideo(room.video || "");
    Audio.playEnding(room.ending, ending.kind);
  }

  function prepareEndingVideo(src) {
    stopEndingVideo();
    if (!src) return;

    const video = els.endingVideo;
    video.src = src;
    video.load();

    const playOnce = () => {
      video.classList.add("active");
      video.play().catch(() => video.classList.remove("active"));
    };

    const pauseOnStill = () => {
      video.classList.remove("active");
      try {
        video.currentTime = 0;
      } catch (err) {
        console.warn("Ending video rewind failed", err);
      }
      endingVideoTimer = window.setTimeout(playOnce, endingVideoStillMs);
    };

    video.onloadeddata = () => {
      pauseOnStill();
    };
    video.onended = pauseOnStill;
    video.onerror = () => {
      stopEndingVideo();
    };
  }

  function stopEndingVideo() {
    if (endingVideoTimer) {
      window.clearTimeout(endingVideoTimer);
      endingVideoTimer = null;
    }
    if (!els.endingVideo) return;
    els.endingVideo.pause();
    els.endingVideo.removeAttribute("src");
    els.endingVideo.classList.remove("active");
    els.endingVideo.onloadeddata = null;
    els.endingVideo.onended = null;
    els.endingVideo.onerror = null;
    els.endingVideo.load();
  }

  function updateStats() {
    els.roomCount.textContent = String(state.visited.length);
    els.clueCount.textContent = `${state.inventory.length}/${Object.keys(Story.items).length}`;
    els.dreadValue.textContent = String(state.dread);
    els.dreadStat.dataset.danger = state.dread >= 7 ? "high" : "low";
  }

  function typeText(text) {
    clearInterval(typeTimer);
    els.roomText.textContent = "";
    const speeds = { instant: 0, fast: 7, normal: 16, slow: 28 };
    const delay = speeds[settings.textSpeed] ?? 16;
    if (!delay || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      els.roomText.textContent = text;
      return;
    }
    let index = 0;
    typeTimer = setInterval(() => {
      index += 1;
      els.roomText.textContent = text.slice(0, index);
      if (index >= text.length) clearInterval(typeTimer);
    }, delay);
  }

  function addHistory(kind, text) {
    const latest = state.history[state.history.length - 1];
    if (latest && latest.kind === kind && latest.text === text) return;
    state.history.push({ kind, text, at: Date.now() });
    if (state.history.length > 80) state.history.shift();
  }

  function openJournal() {
    renderJournal();
    UI.openPanel("journal-panel");
  }

  function renderJournal() {
    const endings = Save.loadEndings();
    els.endingBadges.innerHTML = "";
    if (endings.length) {
      endings.forEach(id => {
        const badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = Story.endings[id]?.title || id;
        els.endingBadges.appendChild(badge);
      });
    } else {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "No endings yet";
      els.endingBadges.appendChild(badge);
    }

    els.historyList.innerHTML = "";
    if (!state.history.length) {
      const li = document.createElement("li");
      li.textContent = "The journal is blank.";
      els.historyList.appendChild(li);
      return;
    }
    state.history.forEach(entry => {
      const li = document.createElement("li");
      li.textContent = labelHistory(entry);
      els.historyList.appendChild(li);
    });
  }

  function openEvidence() {
    els.evidenceList.innerHTML = "";
    Object.entries(Story.items).forEach(([id, item]) => {
      const found = state.inventory.includes(id);
      const div = document.createElement("div");
      div.className = `evidence-card${found ? "" : " locked"}`;
      div.innerHTML = `<h4>${found ? item.name : "Unknown clue"}</h4><p>${found ? item.clue : "A blank space in the evidence drawer."}</p>`;
      els.evidenceList.appendChild(div);
    });
    UI.openPanel("evidence-panel");
  }

  function openMap() {
    els.mapList.innerHTML = "";
    mapRoomIds
      .forEach(id => {
        const room = Story.rooms[id];
        const seen = state.visited.includes(id);
        const div = document.createElement("div");
        div.className = `map-card${seen ? "" : " locked"}${state.currentRoom === id ? " current" : ""}`;
        div.innerHTML = `<h4>${seen ? room.title : "Unmapped room"}</h4><p>${seen ? room.kicker || "Visited" : "Not yet visited."}</p>`;
        els.mapList.appendChild(div);
      });
    UI.openPanel("map-panel");
  }

  function labelHistory(entry) {
    const prefixes = {
      room: "Entered",
      choice: "Chose",
      clue: "Found",
      note: "Noted",
      ending: "Reached",
    };
    return `${prefixes[entry.kind] || "Wrote"}: ${entry.text}`;
  }

  function hasAnyJournal() {
    return state.history.length > 0 || Save.loadEndings().length > 0;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  document.addEventListener("DOMContentLoaded", init);
})();
