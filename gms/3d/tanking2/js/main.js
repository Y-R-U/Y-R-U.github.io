import { createGame } from "./state.js";
import { AquariumScene } from "./scene.js";
import { AquariumUI } from "./ui.js";
import { AquariumAudio } from "./audio.js";
import { SPECIES, ABILITIES, MODES, RELICS, compatibility } from "./data.js";
const STORAGE_KEY = "tanking2.save.v1";
let saved = null,
  storageAvailable = true;
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) saved = JSON.parse(raw);
} catch {
  storageAvailable = false;
}
let game = createGame(saved),
  scene,
  ui;
const audio = new AquariumAudio();
const save = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(game.save()));
  } catch {
    if (storageAvailable) {
      storageAvailable = false;
      ui?.toast(
        "Your browser could not save locally. Export a backup from settings to keep this collection.",
        "warning",
      );
    }
  }
};
try {
  scene = new AquariumScene(document.getElementById("aquarium"), {
    onFish: (uid) => ui?.follow(uid),
  });
  scene.setTank(game.state.tanks[game.state.activeTank]);
  ui = new AquariumUI(game, scene, audio);
  const loading = document.getElementById("loading");
  loading.style.opacity = "0";
  setTimeout(() => loading.remove(), 650);
  let then = performance.now(),
    uiTime = 0,
    saveTime = 0;
  const frameTimes = [];
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - then) / 1000);
    then = now;
    if (document.hidden) return;
    game.tick(dt);
    scene.setTank(game.state.tanks[game.state.activeTank]);
    scene.update(dt, game.state);
    ui.processEvents();
    uiTime += dt;
    saveTime += dt;
    if (uiTime >= 0.25) {
      uiTime = 0;
      ui.render();
    }
    if (saveTime >= 5) {
      saveTime = 0;
      save();
    }
    if (dt > 0) {
      frameTimes.push(dt);
      if (frameTimes.length > 120) frameTimes.shift();
    }
  }
  requestAnimationFrame(frame);
  document.addEventListener("visibilitychange", () => {
    audio.visibility(document.hidden);
    if (document.hidden) save();
    else {
      try {
        const current = localStorage.getItem(STORAGE_KEY);
        if (current) {
          game = createGame(JSON.parse(current));
          ui.game = game;
          ui.render(true);
        }
      } catch {}
      then = performance.now();
    }
  });
  window.addEventListener("pagehide", save);
  window.addEventListener("tanking2-save", save);
  window.addEventListener("tanking2-import", (e) => {
    try {
      const replacement = createGame(e.detail);
      game = replacement;
      ui.game = game;
      ui.follow(null);
      ui.close();
      ui.render(true);
      save();
      ui.toast("Your collection is home again.");
    } catch {
      ui.toast(
        "This backup could not be restored. Your current collection is safe.",
        "warning",
      );
    }
  });
  window.tanking2 = {
    get state() {
      return game.state;
    },
    get metrics() {
      return {
        ...scene.metrics,
        fps: frameTimes.length / (frameTimes.reduce((a, b) => a + b, 0) || 1),
      };
    },
    get scene() {
      return scene;
    },
    get ui() {
      return ui;
    },
    get audio() {
      return audio;
    },
    SPECIES,
    ABILITIES,
    MODES,
    RELICS,
    compatibility: (id) =>
      compatibility(game.state, id, game.state.tanks[game.state.activeTank]),
    act: (type, payload) => ui.action(type, payload),
    step: (seconds) => {
      for (let left = seconds; left > 0; left -= 0.1)
        game.tick(Math.min(0.1, left));
      ui.processEvents();
      ui.render(true);
    },
    save,
    exportState: () => game.save(),
    load: (data) => {
      game = createGame(data);
      ui.game = game;
      ui.render(true);
    },
  };
} catch (error) {
  document.getElementById("loading")?.remove();
  document.getElementById("fatal").hidden = false;
  document.getElementById("fatalDetail").textContent = error.message;
  console.error(error);
}
