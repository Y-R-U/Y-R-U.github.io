/**
 * Emerald Place - Core Game Engine
 *
 * Architecture:
 *   - RoomEngine: manages state, view transitions, clickable zones
 *   - UnitConfig: per-unit data (scroll offset, floor, active micro-game)
 *   - Views: "room" | "window" | "laptop" | "sleep"
 *
 * Micro-games are lazily loaded per unit via dynamic import.
 */

// ─── Unit Configuration ────────────────────────────────────────────────────

const UNITS = {
  65: {
    name: "Unit 65",
    floor: 2,
    outsideScrollX: 400,   // px offset into outside.svg panorama
    outsideScrollY: 0,
    microGame: "units/unit65.js",
    theme: "#4a6fa5",
  },
  66: {
    name: "Unit 66",
    floor: 2,
    outsideScrollX: 500,
    outsideScrollY: 0,
    microGame: "units/unit66.js",
    theme: "#c9a227",
    startsOutside: true,   // starts in window-zoomed mode looking at street
  },
  67: {
    name: "Unit 67",
    floor: 2,
    outsideScrollX: 600,
    outsideScrollY: 0,
    microGame: "units/unit67.js",
    theme: "#6b2fa0",
  },
  68: {
    name: "Unit 68",
    floor: 2,
    outsideScrollX: 700,
    outsideScrollY: 0,
    microGame: "units/unit68.js",
    theme: "#1a1a2e",
  },
  69: {
    name: "Unit 69",
    floor: 2,
    outsideScrollX: 800,
    outsideScrollY: 0,
    microGame: "units/unit69.js",
    theme: "#c0392b",
  },
};

// Floor offset: each floor shifts Y by this amount in the outside panorama
const FLOOR_Y_OFFSET = 80; // px per floor

// ─── State ─────────────────────────────────────────────────────────────────

const State = {
  currentUnit: 65,
  view: "room",         // "room" | "window" | "laptop" | "sleep"
  date: new Date(),
  microGameActive: false,
  microGameInstance: null,
  easterEggsUnlocked: [],  // unit IDs whose easter eggs are visible
};

// ─── DOM References ─────────────────────────────────────────────────────────

let canvas, ctx;
let roomImg, outsideImg;
let outsideLoaded = false;
let roomLoaded = false;

// ─── View Transition ────────────────────────────────────────────────────────

const TRANSITION_MS = 400;

function setView(newView) {
  const overlay = document.getElementById("transition-overlay");
  overlay.classList.add("fade-in");

  setTimeout(() => {
    State.view = newView;
    renderCurrentView();
    overlay.classList.remove("fade-in");
    overlay.classList.add("fade-out");
    setTimeout(() => overlay.classList.remove("fade-out"), TRANSITION_MS);
  }, TRANSITION_MS / 2);
}

// ─── Rendering ──────────────────────────────────────────────────────────────

function renderCurrentView() {
  switch (State.view) {
    case "room":
      renderRoom();
      break;
    case "window":
      renderWindow();
      break;
    case "laptop":
      renderLaptop();
      break;
    case "sleep":
      renderSleep();
      break;
  }
  updateHUD();
}

function renderRoom() {
  const roomView = document.getElementById("room-view");
  const windowView = document.getElementById("window-view");
  const laptopView = document.getElementById("laptop-view");
  const sleepView = document.getElementById("sleep-view");

  roomView.classList.remove("hidden");
  windowView.classList.add("hidden");
  laptopView.classList.add("hidden");
  sleepView.classList.add("hidden");

  // Update room number sign
  const unit = UNITS[State.currentUnit];
  document.getElementById("room-label").textContent = unit.name;
}

function renderWindow() {
  const roomView = document.getElementById("room-view");
  const windowView = document.getElementById("window-view");

  roomView.classList.add("hidden");
  windowView.classList.remove("hidden");

  const unit = UNITS[State.currentUnit];
  const scrollX = unit.outsideScrollX + (unit.floor - 1) * 0;
  const scrollY = unit.outsideScrollY + (unit.floor - 1) * FLOOR_Y_OFFSET;

  const outsideContainer = document.getElementById("outside-container");
  outsideContainer.style.transform = `translate(-${scrollX}px, -${scrollY}px)`;
}

function renderLaptop() {
  document.getElementById("room-view").classList.add("hidden");
  document.getElementById("window-view").classList.add("hidden");
  document.getElementById("laptop-view").classList.remove("hidden");

  // Lazy-load the micro-game for this unit
  if (!State.microGameActive) {
    loadMicroGame(State.currentUnit);
  }
}

function renderSleep() {
  document.getElementById("room-view").classList.add("hidden");
  document.getElementById("sleep-view").classList.remove("hidden");

  // Advance time by 8 hours (game mechanic hook)
  const sleepEvent = new CustomEvent("ep:sleep", { detail: { unit: State.currentUnit } });
  document.dispatchEvent(sleepEvent);

  setTimeout(() => setView("room"), 2000);
}

// ─── HUD ────────────────────────────────────────────────────────────────────

function updateHUD() {
  const unit = UNITS[State.currentUnit];
  document.getElementById("hud-unit").textContent = unit.name;
  document.getElementById("hud-date").textContent = formatDate(State.date);
  document.getElementById("hud-view").textContent = State.view;
}

function formatDate(d) {
  return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}

// ─── Click Zones (Room View) ─────────────────────────────────────────────────

// These are normalised [0–1] coords of the room.svg viewBox (800x600)
const CLICK_ZONES = [
  {
    id: "window",
    label: "Look outside",
    // rect in SVG coords
    x: 290, y: 110, w: 220, h: 190,
    action: () => setView("window"),
  },
  {
    id: "laptop",
    label: "Use laptop",
    x: 520, y: 250, w: 120, h: 90,
    action: () => setView("laptop"),
  },
  {
    id: "bed",
    label: "Sleep",
    x: 25, y: 295, w: 245, h: 185,
    action: () => setView("sleep"),
  },
  {
    id: "calendar",
    label: "Check calendar",
    x: 170, y: 125, w: 85, h: 100,
    action: () => showCalendarOverlay(),
  },
];

function initRoomClicks() {
  const roomEl = document.getElementById("room-view");
  roomEl.addEventListener("click", (e) => {
    if (State.view !== "room") return;
    const rect = roomEl.getBoundingClientRect();
    // Map click to SVG coordinate space
    const svgW = 800, svgH = 600;
    const scaleX = svgW / rect.width;
    const scaleY = svgH / rect.height;
    const svgX = (e.clientX - rect.left) * scaleX;
    const svgY = (e.clientY - rect.top) * scaleY;

    for (const zone of CLICK_ZONES) {
      if (svgX >= zone.x && svgX <= zone.x + zone.w &&
          svgY >= zone.y && svgY <= zone.y + zone.h) {
        showClickFeedback(e.clientX, e.clientY, zone.label);
        zone.action();
        return;
      }
    }
  });

  // Hover cursor feedback
  roomEl.addEventListener("mousemove", (e) => {
    if (State.view !== "room") return;
    const rect = roomEl.getBoundingClientRect();
    const scaleX = 800 / rect.width;
    const scaleY = 600 / rect.height;
    const svgX = (e.clientX - rect.left) * scaleX;
    const svgY = (e.clientY - rect.top) * scaleY;

    const hit = CLICK_ZONES.some(z =>
      svgX >= z.x && svgX <= z.x + z.w &&
      svgY >= z.y && svgY <= z.y + z.h
    );
    roomEl.style.cursor = hit ? "pointer" : "default";
  });
}

// ─── Window View Controls ────────────────────────────────────────────────────

function initWindowControls() {
  document.getElementById("btn-back-from-window").addEventListener("click", () => {
    setView("room");
  });

  // Scroll hint animation runs automatically via CSS
}

// ─── Laptop View Controls ────────────────────────────────────────────────────

function initLaptopControls() {
  document.getElementById("btn-back-from-laptop").addEventListener("click", () => {
    if (State.microGameInstance?.onExit) State.microGameInstance.onExit();
    State.microGameActive = false;
    State.microGameInstance = null;
    document.getElementById("micro-game-container").innerHTML = "";
    setView("room");
  });
}

// ─── Micro-Game Loader ───────────────────────────────────────────────────────

async function loadMicroGame(unitId) {
  const unit = UNITS[unitId];
  if (!unit?.microGame) return;

  const container = document.getElementById("micro-game-container");
  container.innerHTML = `<div class="loading-screen">Loading ${unit.name}...</div>`;

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
        <h2>${unit.name}</h2>
        <p class="stub-note">[ micro-game stub — coming soon ]</p>
        <p>Unit theme: <span style="color:${unit.theme}">${unit.name}</span></p>
      </div>
    `;
  }
}

// ─── Calendar Overlay ────────────────────────────────────────────────────────

function showCalendarOverlay() {
  const overlay = document.getElementById("calendar-overlay");
  overlay.classList.remove("hidden");
  const d = State.date;
  document.getElementById("cal-month-year").textContent =
    d.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
  // Simple day highlight
  document.getElementById("cal-today").textContent = d.getDate();
}

function initCalendarOverlay() {
  document.getElementById("cal-close").addEventListener("click", () => {
    document.getElementById("calendar-overlay").classList.add("hidden");
  });
}

// ─── Click Feedback ──────────────────────────────────────────────────────────

function showClickFeedback(x, y, label) {
  const el = document.createElement("div");
  el.className = "click-feedback";
  el.textContent = label;
  el.style.left = x + "px";
  el.style.top = y + "px";
  document.body.appendChild(el);
  el.addEventListener("animationend", () => el.remove());
}

// ─── Unit Switcher (dev/menu) ────────────────────────────────────────────────

function switchUnit(unitId) {
  if (!UNITS[unitId]) return;
  State.currentUnit = unitId;
  State.view = UNITS[unitId].startsOutside ? "window" : "room";
  State.microGameActive = false;
  State.microGameInstance = null;
  document.getElementById("micro-game-container").innerHTML = "";
  renderCurrentView();
}

// ─── Easter Egg Check ────────────────────────────────────────────────────────

/**
 * Called when loading unit to determine which easter egg sprites
 * should appear in the outside view based on completed stories.
 */
function checkEasterEggs() {
  // Stub: read from localStorage which units have been completed
  const completed = JSON.parse(localStorage.getItem("ep_completed") || "[]");
  State.easterEggsUnlocked = completed;
  // TODO: inject sprite overlays into outside view based on current date
}

// ─── Init ────────────────────────────────────────────────────────────────────

function init() {
  checkEasterEggs();
  initRoomClicks();
  initWindowControls();
  initLaptopControls();
  initCalendarOverlay();

  // Build unit selector buttons
  const selector = document.getElementById("unit-selector");
  Object.keys(UNITS).forEach(id => {
    const btn = document.createElement("button");
    btn.textContent = UNITS[id].name;
    btn.className = "unit-btn";
    btn.style.borderColor = UNITS[id].theme;
    btn.addEventListener("click", () => switchUnit(Number(id)));
    selector.appendChild(btn);
  });

  // Start in current unit
  renderCurrentView();
}

document.addEventListener("DOMContentLoaded", init);

// ─── Public API (for micro-games to call back into engine) ───────────────────

window.EmeraldPlace = {
  setView,
  getState: () => State,
  getUnit: () => UNITS[State.currentUnit],
  advanceDate: (days = 1) => {
    State.date.setDate(State.date.getDate() + days);
    updateHUD();
  },
  unlockEasterEgg: (unitId) => {
    if (!State.easterEggsUnlocked.includes(unitId)) {
      State.easterEggsUnlocked.push(unitId);
      localStorage.setItem("ep_completed", JSON.stringify(State.easterEggsUnlocked));
    }
  },
};
