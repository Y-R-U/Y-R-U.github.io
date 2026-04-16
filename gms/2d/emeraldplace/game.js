/**
 * Emerald Place — Core Game Engine
 *
 * Architecture:
 *   RoomEngine  — state, view transitions, click zones
 *   PanelSystem — drawer / side-panel open/close (responsive)
 *   UnitConfig  — per-unit scroll offsets, themes, micro-game paths
 *   MicroLoader — lazy import of unit JS modules
 */

// ─── Unit Config ────────────────────────────────────────────

const UNITS = {
  65: {
    name: "Unit 65",
    emoji: "💌",
    floor: 2,
    outsideScrollX: 400,
    outsideScrollY: 0,
    microGame: "units/unit65.js",
    theme: "#4a6fa5",
    char: { name: "???", portrait: "images/alex.png" },
    stats: { mood: 70, energy: 55, cash: 0 },
  },
  66: {
    name: "Unit 66",
    emoji: "📦",
    floor: 2,
    outsideScrollX: 500,
    outsideScrollY: 0,
    microGame: "units/unit66.js",
    theme: "#c9a227",
    startsOutside: true,
    char: { name: "???", portrait: "images/char_66.png" },
    stats: { mood: 30, energy: 40, cash: 0 },
  },
  67: {
    name: "Unit 67",
    emoji: "🔮",
    floor: 2,
    outsideScrollX: 600,
    outsideScrollY: 0,
    microGame: "units/unit67.js",
    theme: "#9b59b6",
    char: { name: "???", portrait: "images/char_67.png" },
    stats: { mood: 60, energy: 80, cash: 50 },
  },
  68: {
    name: "Unit 68",
    emoji: "👁",
    floor: 2,
    outsideScrollX: 700,
    outsideScrollY: 0,
    microGame: "units/unit68.js",
    theme: "#c0392b",
    char: { name: "???", portrait: "images/char_68.png" },
    stats: { mood: 20, energy: 35, cash: 30 },
  },
  69: {
    name: "Unit 69",
    emoji: "💋",
    floor: 2,
    outsideScrollX: 800,
    outsideScrollY: 0,
    microGame: "units/unit69.js",
    theme: "#e91e8c",
    char: { name: "???", portrait: "images/char_69.png" },
    stats: { mood: 90, energy: 70, cash: 200 },
  },
};

const FLOOR_Y_OFFSET = 60; // px per floor in outside panorama

// ─── State ──────────────────────────────────────────────────

const State = {
  currentUnit: 65,
  view: "room",   // "room" | "window" | "laptop" | "sleep"
  date: new Date(2026, 3, 2),  // April 2nd 2026
  microGameActive: false,
  microGameInstance: null,
  easterEggsUnlocked: [],
  settings: {
    sfx: true,
    music: true,
    notifications: false,
    dev: false,
  },
};

// ─── View Transitions ────────────────────────────────────────

const TRANS_MS = 350;

function setView(newView) {
  const overlay = document.getElementById("transition-overlay");
  overlay.classList.add("fade-in");
  setTimeout(() => {
    State.view = newView;
    applyView();
    overlay.classList.remove("fade-in");
    overlay.classList.add("fade-out");
    setTimeout(() => overlay.classList.remove("fade-out"), TRANS_MS);
  }, TRANS_MS / 2);
}

function applyView() {
  const views = ["room-view", "window-view", "laptop-view", "sleep-view"];
  views.forEach(id => document.getElementById(id).classList.add("hidden"));

  switch (State.view) {
    case "room":   showRoom();   break;
    case "window": showWindow(); break;
    case "laptop": showLaptop(); break;
    case "sleep":  showSleep();  break;
  }
  updateHUD();
}

function showRoom() {
  document.getElementById("room-view").classList.remove("hidden");
  const unit = UNITS[State.currentUnit];
  // Per-unit background image
  document.getElementById("room-scene").style.backgroundImage =
    `url('images/unit${State.currentUnit}_bg.png')`;
  // Window thumbnail: show outside panorama at this unit's horizontal offset
  const thumb = document.getElementById("room-win-thumb");
  if (thumb) {
    thumb.style.backgroundPositionX = `-${unit.outsideScrollX}px`;
  }
  // Room number tag
  const tag = document.getElementById("room-number-display");
  if (tag) tag.textContent = `UNIT ${State.currentUnit}`;
}

function showWindow() {
  document.getElementById("window-view").classList.remove("hidden");
  const unit = UNITS[State.currentUnit];
  const x = unit.outsideScrollX;
  const y = unit.outsideScrollY + (unit.floor - 1) * FLOOR_Y_OFFSET;
  document.getElementById("outside-container").style.transform =
    `translate(-${x}px, -${y}px)`;
}

function showLaptop() {
  document.getElementById("laptop-view").classList.remove("hidden");
  if (!State.microGameActive) loadMicroGame(State.currentUnit);
}

function showSleep() {
  document.getElementById("sleep-view").classList.remove("hidden");
  // Advance the in-game date by one day
  State.date.setDate(State.date.getDate() + 1);
  document.dispatchEvent(new CustomEvent("ep:sleep", {
    detail: { unit: State.currentUnit, day: getDay() }
  }));
  setTimeout(() => setView("room"), 2200);
}

// ─── HUD ─────────────────────────────────────────────────────

function updateHUD() {
  const unit = UNITS[State.currentUnit];
  document.getElementById("hud-unit").textContent = unit.name;
  document.getElementById("hud-date").textContent = fmtDate(State.date);
  // Sync desktop character panel
  syncCharPanel(unit);
}

function syncCharPanel(unit) {
  const char = unit.char;
  const stats = unit.stats;
  // Desktop left panel
  setIfExists("char-name", char.name);
  setIfExists("char-unit-tag", `${unit.name} · Floor ${unit.floor}`);
  setPortrait("char-portrait", char.portrait);
  setStatBar("stat-mood",   stats.mood);
  setStatBar("stat-energy", stats.energy);
  setCashBar("stat-cash",   stats.cash);
  // Mobile drawer mirrors
  setIfExists("m-char-name", char.name);
  setIfExists("m-char-unit", `${unit.name} · Floor ${unit.floor}`);
  setStatBar("m-stat-mood",   stats.mood);
  setStatBar("m-stat-energy", stats.energy);
  setCashBar("m-stat-cash",   stats.cash);
}

function setStatBar(id, val) {
  const fill = document.getElementById(id);
  if (fill) {
    fill.style.width = Math.min(100, Math.max(0, val)) + "%";
    const valEl = document.getElementById(id + "-val");
    if (valEl) valEl.textContent = val;
  }
}

function setCashBar(id, val) {
  const fill = document.getElementById(id);
  if (fill) {
    // Cash bar uses log scale so it doesn't pin at 0 forever
    const pct = Math.min(100, (Math.log10(Math.max(1, val)) / 4) * 100);
    fill.style.width = pct + "%";
    const valEl = document.getElementById(id + "-val");
    if (valEl) valEl.textContent = "$" + (val >= 1000 ? (val / 1000).toFixed(1) + "k" : val);
  }
}

function setIfExists(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function setPortrait(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  if (val && (val.startsWith("images/") || val.startsWith("http") || val.endsWith(".png") || val.endsWith(".jpg") || val.endsWith(".webp"))) {
    el.innerHTML = `<img src="${val}" alt="portrait" style="width:100%;height:100%;object-fit:cover;display:block;">`;
  } else {
    el.textContent = val;
  }
}

function fmtDate(d) {
  return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}

// ─── Room Click Zones ────────────────────────────────────────
// DOM-based — each zone is a .room-zone div with data-action

const ZONE_LABELS = {
  window:   "Look outside",
  calendar: "Check calendar",
  sleep:    "Sleep",
  laptop:   "Use computer",
};

function initRoomClicks() {
  document.querySelectorAll(".room-zone").forEach(zone => {
    zone.addEventListener("click", (e) => {
      if (State.view !== "room") return;
      const action = zone.dataset.action;
      const label = ZONE_LABELS[action] ?? action;
      showClickFeedback(e.clientX, e.clientY, label);
      if (action === "window")   setView("window");
      else if (action === "calendar") showCalendarOverlay();
      else if (action === "laptop")   setView("laptop");
      else if (action === "sleep")    setView("sleep");
    });
  });
}

// ─── Micro-Game Loader ───────────────────────────────────────

async function loadMicroGame(unitId) {
  const unit = UNITS[unitId];
  if (!unit?.microGame) return;
  const container = document.getElementById("micro-game-container");
  container.innerHTML = `<div class="loading-screen">Loading ${unit.name}…</div>`;

  try {
    const mod = await import(`./${unit.microGame}`);
    State.microGameInstance = mod.default ?? mod;
    State.microGameActive = true;
    if (State.microGameInstance?.init) {
      State.microGameInstance.init(container, State);
    }
  } catch (err) {
    console.warn(`Micro-game for unit ${unitId} not yet implemented.`, err);
    container.innerHTML = `
      <div class="stub-game">
        <div style="font-size:2rem">${unit.emoji}</div>
        <h2>${unit.name}</h2>
        <p class="stub-note">[ micro-game stub — coming soon ]</p>
      </div>
    `;
  }
}

// ─── Calendar Overlay ────────────────────────────────────────

function showCalendarOverlay() {
  const overlay = document.getElementById("calendar-overlay");
  overlay.classList.remove("hidden");
  document.getElementById("cal-month-year").textContent =
    State.date.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
  document.getElementById("cal-today").textContent = State.date.getDate();
}

// ─── Notify Toast ────────────────────────────────────────────

function notify(text, type = "info") {
  const el = document.createElement("div");
  el.className = `ep-notify ep-notify--${type}`;
  el.textContent = text;
  const stage = document.getElementById("game-stage");
  stage.appendChild(el);
  el.addEventListener("animationend", () => el.remove());
}

// ─── Day Counter ─────────────────────────────────────────────

function getDay() {
  const start = new Date(2026, 3, 2); // April 2nd, day 1
  return Math.max(1, Math.floor((State.date - start) / 86400000) + 1);
}

// ─── Click Feedback ──────────────────────────────────────────

function showClickFeedback(x, y, label) {
  const el = document.createElement("div");
  el.className = "click-feedback";
  el.textContent = label;
  el.style.left = x + "px";
  el.style.top  = y + "px";
  document.body.appendChild(el);
  el.addEventListener("animationend", () => el.remove());
}

// ─── Story Log ───────────────────────────────────────────────

function addLogEntry(time, text) {
  const entry = `
    <div class="log-entry">
      <div class="log-time">${time}</div>
      ${text}
    </div>
  `;
  ["story-log", "story-log-mobile"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.insertAdjacentHTML("afterbegin", entry);
  });
}

// ─── Panel / Drawer System ───────────────────────────────────

const Drawers = {
  active: null,

  open(id) {
    if (this.active) this.close(this.active);
    const el = document.getElementById(id);
    const backdrop = document.getElementById("drawer-backdrop");
    el?.classList.add("open");
    backdrop.classList.add("visible");
    this.active = id;
    // Mark active nav btn
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    const btn = document.querySelector(`[data-drawer="${id}"]`);
    btn?.classList.add("active");
  },

  close(id) {
    document.getElementById(id)?.classList.remove("open");
    document.getElementById("drawer-backdrop").classList.remove("visible");
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    if (this.active === id) this.active = null;
  },

  toggle(id) {
    this.active === id ? this.close(id) : this.open(id);
  },
};

function initPanelSystem() {
  // Mobile bottom nav
  const navMap = {
    "btn-nav-char":     "drawer-char",
    "btn-nav-units":    "drawer-char",   // units section is inside char drawer
    "btn-nav-log":      "drawer-log",
    "btn-nav-settings": "drawer-settings",
  };

  Object.entries(navMap).forEach(([btnId, drawerId]) => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.dataset.drawer = drawerId;
      btn.addEventListener("click", () => Drawers.toggle(drawerId));
    }
  });

  // Mobile top bar icon buttons
  document.getElementById("btn-open-log")?.addEventListener("click",
    () => Drawers.toggle("drawer-log"));
  document.getElementById("btn-open-settings")?.addEventListener("click",
    () => Drawers.toggle("drawer-settings"));

  // Drawer close buttons
  ["drawer-settings", "drawer-char", "drawer-log"].forEach(id => {
    document.getElementById(`${id}-close`)?.addEventListener("click",
      () => Drawers.close(id));
  });

  // Backdrop closes active drawer
  document.getElementById("drawer-backdrop").addEventListener("click",
    () => { if (Drawers.active) Drawers.close(Drawers.active); });

  // Settings toggles (sync desktop ↔ mobile)
  initToggle("toggle-sfx",    "m-toggle-sfx",    "sfx");
  initToggle("toggle-music",  "m-toggle-music",  "music");
  initToggle("toggle-notif",  "m-toggle-notif",  "notifications");
  initToggle("toggle-dev",    "m-toggle-dev",    "dev");
}

function initToggle(desktopId, mobileId, key) {
  const sync = (val) => {
    [desktopId, mobileId].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle("on", val);
    });
    State.settings[key] = val;
  };

  [desktopId, mobileId].forEach(id => {
    document.getElementById(id)?.addEventListener("click", () => {
      sync(!State.settings[key]);
    });
  });
}

// ─── Unit Switcher ───────────────────────────────────────────

function switchUnit(unitId) {
  if (!UNITS[unitId]) return;
  State.currentUnit = unitId;
  State.view = UNITS[unitId].startsOutside ? "window" : "room";
  State.microGameActive = false;
  State.microGameInstance = null;
  document.getElementById("micro-game-container").innerHTML = "";
  // Highlight active unit btn everywhere
  document.querySelectorAll(".unit-btn").forEach(b => {
    b.classList.toggle("active", Number(b.dataset.unit) === unitId);
  });
  applyView();
  addLogEntry(fmtDate(State.date), `Entered ${UNITS[unitId].name}.`);
}

function buildUnitButtons(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";
  Object.entries(UNITS).forEach(([id, unit]) => {
    const btn = document.createElement("button");
    btn.className = "unit-btn" + (Number(id) === State.currentUnit ? " active" : "");
    btn.dataset.unit = id;
    btn.style.borderColor = unit.theme + "66";
    btn.innerHTML = `
      <span class="unit-dot" style="background:${unit.theme}"></span>
      <span>${unit.emoji} ${unit.name}</span>
    `;
    btn.addEventListener("click", () => {
      switchUnit(Number(id));
      // Close drawer on mobile after selecting
      if (Drawers.active) Drawers.close(Drawers.active);
    });
    container.appendChild(btn);
  });
}

// ─── Easter Eggs ─────────────────────────────────────────────

function checkEasterEggs() {
  State.easterEggsUnlocked = JSON.parse(
    localStorage.getItem("ep_completed") || "[]"
  );
}

// ─── Back Buttons ────────────────────────────────────────────

function initBackButtons() {
  document.getElementById("btn-back-from-window")?.addEventListener("click",
    () => setView("room"));

  document.getElementById("btn-back-from-laptop")?.addEventListener("click", () => {
    State.microGameInstance?.onExit?.();
    State.microGameActive = false;
    State.microGameInstance = null;
    document.getElementById("micro-game-container").innerHTML = "";
    setView("room");
  });

  document.getElementById("cal-close")?.addEventListener("click", () => {
    document.getElementById("calendar-overlay").classList.add("hidden");
  });
}

// ─── Init ─────────────────────────────────────────────────────

function init() {
  // Restore persistent flags (e.g. unit 66 earned a room)
  if (localStorage.getItem("ep_u66_hasroom") === "1") {
    UNITS[66].startsOutside = false;
  }
  checkEasterEggs();
  initRoomClicks();
  initBackButtons();
  initPanelSystem();
  buildUnitButtons("unit-selector-panel");
  buildUnitButtons("unit-selector-drawer");
  applyView();
  updateHUD();
}

document.addEventListener("DOMContentLoaded", init);

// ─── Public API ───────────────────────────────────────────────

window.EmeraldPlace = {
  setView,
  notify,
  getState:   () => State,
  getUnit:    () => UNITS[State.currentUnit],
  getDay,
  addLog: (time, text) => addLogEntry(time, text),
  advanceDate: (days = 1) => {
    State.date.setDate(State.date.getDate() + days);
    updateHUD();
  },
  setStat: (key, val) => {
    UNITS[State.currentUnit].stats[key] = val;
    syncCharPanel(UNITS[State.currentUnit]);
  },
  setOutsideScroll: (x, y) => {
    const unit = UNITS[State.currentUnit];
    if (x !== undefined) unit.outsideScrollX = x;
    if (y !== undefined) unit.outsideScrollY = y;
    if (State.view === "window") showWindow();
  },
  unlockRoomStart: (unitId) => {
    if (UNITS[unitId]) {
      UNITS[unitId].startsOutside = false;
      localStorage.setItem(`ep_u${unitId}_hasroom`, "1");
    }
  },
  unlockEasterEgg: (unitId) => {
    if (!State.easterEggsUnlocked.includes(unitId)) {
      State.easterEggsUnlocked.push(unitId);
      localStorage.setItem("ep_completed", JSON.stringify(State.easterEggsUnlocked));
    }
  },
};
