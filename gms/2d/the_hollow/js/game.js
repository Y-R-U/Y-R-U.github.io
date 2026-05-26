// THE HOLLOW — procedural liminal-horror crawler.
// Pure client-side: generate a dungeon from a seed, descend, survive the stalker.
(function () {
  "use strict";
  const IMG = (k) => "images/" + k + ".jpg";
  const DIR_KEYS = ["N", "E", "S", "W"];
  const DIR_ARROW = { N: "↑", E: "→", S: "↓", W: "←" };
  const RITUAL_KINDS = { ritual: 1 };

  const MODES = {
    easy: { label: "Easy", target: 2 },
    medium: { label: "Medium", target: 5 },
    hard: { label: "Hard", target: 10 },
    endless: { label: "Endless", target: Infinity },
  };

  const S = {
    screen: "title",
    seed: "", depth: 1,
    mode: "easy", target: 2, moves: 0,
    dungeon: null, pos: null,
    light: 100, sanity: 100, keys: 0,
    explored: 0, entityId: null,
    busy: false, mapBig: false,
  };

  let el = {};
  function $(id) { return document.getElementById(id); }

  function cacheEls() {
    el = {
      title: $("screen-title"), play: $("screen-play"), over: $("screen-over"),
      seedInput: $("seed-input"), best: $("best-depth"), modeRow: $("mode-row"),
      btnDescendStart: $("btn-start"), btnRandom: $("btn-random"),
      roomA: $("room-a"), roomB: $("room-b"),
      grain: $("grain"), darkness: $("darkness"), danger: $("danger"),
      jumpscare: $("jumpscare"),
      hudDepth: $("hud-depth"), lightBar: $("light-bar"), sanityBar: $("sanity-bar"),
      hudKeys: $("hud-keys"),
      doors: $("doors"), action: $("action-btn"),
      roomName: $("room-name"), toast: $("toast"),
      map: $("map"), mapWrap: $("map-wrap"),
      overTitle: $("over-title"), overStats: $("over-stats"), overImg: $("over-img"),
      btnRetry: $("btn-retry"),
      btnMap: $("btn-map"), btnMute: $("btn-mute"),
    };
  }

  // ── flow ───────────────────────────────────────────────────────────────
  function showTitle() {
    S.screen = "title";
    el.title.classList.add("active");
    el.play.classList.remove("active");
    el.over.classList.remove("active");
    el.over.classList.remove("win");
    if (!el.seedInput.value) el.seedInput.value = HollowRNG.randomSeed();
    renderModes();
    updateBest();
  }

  function renderModes() {
    el.modeRow.innerHTML = "";
    for (const k of ["easy", "medium", "hard", "endless"]) {
      const m = MODES[k];
      const b = document.createElement("button");
      b.className = "mode-btn" + (k === S.mode ? " active" : "");
      b.innerHTML = m.label + "<span class='goal'>" +
        (m.target === Infinity ? "∞ levels" : m.target + " levels") + "</span>";
      b.onclick = () => { S.mode = k; renderModes(); updateBest(); };
      el.modeRow.appendChild(b);
    }
  }

  function bestScore() { return parseInt(localStorage.getItem("hollow_score_" + S.mode) || "0", 10); }

  function updateBest() {
    const won = localStorage.getItem("hollow_win_" + S.mode);
    const sc = bestScore();
    el.best.innerHTML = (won && S.mode !== "endless" ? "<b class='ok'>escaped ✓</b> · " : "") +
      "best score: <b>" + sc + "</b>";
  }

  function startGame(seed) {
    Audio.start();
    S.seed = (seed || "").trim() || HollowRNG.randomSeed();
    S.target = MODES[S.mode].target;
    S.depth = 1; S.moves = 0; S.light = 100; S.sanity = 100; S.keys = 0; S.explored = 0;
    el.title.classList.remove("active");
    el.over.classList.remove("active");
    el.over.classList.remove("win");
    el.play.classList.add("active");
    S.screen = "play";
    newLevel();
  }

  function newLevel() {
    S.dungeon = HollowDungeon.generate(S.seed, S.depth);
    S.pos = S.dungeon.startId;
    S.entityId = S.dungeon.entityId;
    S.dungeon.rooms[S.pos].seen = true;
    S.explored = 1;
    toast("DEPTH " + S.depth, 1400, "big");
    render(true);
  }

  function curRoom() { return S.dungeon.rooms[S.pos]; }

  function move(dir) {
    if (S.busy || S.screen !== "play") return;
    const room = curRoom();
    const targetId = room.doors[dir];
    if (!targetId) return;
    S.busy = true;

    // cost light; moving in the dark costs sanity instead
    if (S.light > 0) S.light = Math.max(0, S.light - (6 + S.depth));
    else S.sanity = Math.max(0, S.sanity - 9);

    S.pos = targetId;
    S.moves++;
    const nr = curRoom();
    if (!nr.seen) { nr.seen = true; S.explored++; }
    if (RITUAL_KINDS[nr.kind]) S.sanity = Math.max(0, S.sanity - 5);

    entityTurn();
    if (S.screen !== "play") { S.busy = false; return; }

    Audio.step();
    render(true);
    if (S.light <= 0 && S.sanity <= 0) { return gameOver("consumed"); }
    setTimeout(() => { S.busy = false; }, 200);
  }

  // entity walks one (sometimes two) graph steps toward the player
  function entityTurn() {
    const wasAdjacent = isEntityAdjacent();
    let steps = 1;
    if (S.light <= 0 && Math.random() < 0.5) steps = 2;
    const pRandom = clamp(0.42 - S.depth * 0.04 - (S.sanity < 30 ? 0.2 : 0) - (S.light <= 0 ? 0.2 : 0), 0.04, 0.42);
    for (let i = 0; i < steps; i++) {
      const hops = S.dungeon.neighbors(S.entityId);
      if (!hops.length) break;
      let nextId;
      if (Math.random() < pRandom) {
        nextId = hops[Math.floor(Math.random() * hops.length)].id;
      } else {
        nextId = nextHopToward(S.entityId, S.pos) || hops[Math.floor(Math.random() * hops.length)].id;
      }
      S.entityId = nextId;
      if (S.entityId === S.pos) return gameOver("caught");
    }
    if (!wasAdjacent && isEntityAdjacent()) {
      S.sanity = Math.max(0, S.sanity - 10);
      jumpscare();
    }
  }

  function nextHopToward(from, to) {
    const prev = new Map([[from, null]]);
    const q = [from];
    while (q.length) {
      const cur = q.shift();
      if (cur === to) break;
      for (const n of S.dungeon.neighbors(cur)) {
        if (!prev.has(n.id)) { prev.set(n.id, cur); q.push(n.id); }
      }
    }
    if (!prev.has(to)) return null;
    let cur = to, parent = prev.get(to);
    while (parent !== null && parent !== from) { cur = parent; parent = prev.get(cur); }
    return parent === from ? cur : null;
  }

  function isEntityAdjacent() {
    return S.dungeon.neighbors(S.pos).some((n) => n.id === S.entityId);
  }

  // ── contextual action (collect / descend) ───────────────────────────────
  function primaryAction() {
    if (S.busy || S.screen !== "play") return;
    const room = curRoom();
    if (room.id === S.dungeon.exitId) {
      if (S.keys >= 1) {
        S.keys -= 1;
        if (S.target !== Infinity && S.depth >= S.target) { return win(); }
        S.depth++; Audio.descend(); descendFlash();
      } else toast("LOCKED — find the key", 1500);
      return;
    }
    if (room.item) {
      const it = room.item;
      if (it === "key") { S.keys++; toast("Key recovered", 1300); Audio.pickup(); }
      else if (it === "battery") { S.light = Math.min(100, S.light + 45); toast("Light restored (+45)", 1300); Audio.pickup(); }
      else if (it === "note") { S.sanity = Math.max(0, S.sanity - 4); toast(room.noteText || "...", 3200, "note"); Audio.pickup(); }
      room.item = null;
      render(false);
    }
  }

  function descendFlash() {
    S.busy = true;
    el.darkness.style.transition = "opacity .5s";
    el.darkness.style.opacity = "1";
    setTimeout(() => { newLevel(); el.darkness.style.transition = ""; S.busy = false; }, 520);
  }

  // levels cleared reward depth heavily; efficiency (fewer moves) breaks ties
  function score() { return Math.max(0, S.depth * 1000 + S.explored * 20 - S.moves * 5); }

  function saveBest(sc) {
    if (sc > bestScore()) localStorage.setItem("hollow_score_" + S.mode, String(sc));
  }

  function endScreen(won, title) {
    S.screen = "over";
    el.over.classList.toggle("win", won);
    el.overTitle.textContent = title;
    el.overImg.src = IMG(won ? "stairs_down" : "caught");
    el.play.classList.remove("active");
    el.over.classList.add("active");
  }

  function win() {
    Audio.descend();
    localStorage.setItem("hollow_win_" + S.mode, "1");
    const sc = score(); saveBest(sc);
    endScreen(true, "ESCAPED");
    el.overStats.innerHTML =
      "Survived all <b>" + S.target + " level" + (S.target > 1 ? "s" : "") + "</b> · " + MODES[S.mode].label + "<br>" +
      S.explored + " rooms · " + S.moves + " moves<br><b>score " + sc + "</b><br>" +
      "<span class='dim'>seed: " + S.seed + "</span>";
  }

  function gameOver(cause) {
    Audio.scream();
    const sc = score(); const prev = bestScore(); saveBest(sc);
    endScreen(false, cause === "caught" ? "TAKEN" : "CONSUMED BY THE DARK");
    el.overStats.innerHTML =
      "Reached <b>Depth " + S.depth + (S.target !== Infinity ? "/" + S.target : "") + "</b> · " + MODES[S.mode].label + "<br>" +
      S.explored + " rooms · " + S.moves + " moves<br><b>score " + sc + "</b><br>" +
      "<span class='dim'>seed: " + S.seed + "</span><br>best score: " + Math.max(sc, prev);
  }

  // ── rendering ────────────────────────────────────────────────────────────
  let frontLayer = "A";
  function render(animate) {
    const room = curRoom();
    const imgKind = room.item ? "shrine_item" : room.kind;
    const src = IMG(imgKind);

    if (animate) {
      const front = frontLayer === "A" ? el.roomA : el.roomB;
      const back = frontLayer === "A" ? el.roomB : el.roomA;
      back.src = src;
      back.onload = () => {
        back.classList.add("front");
        front.classList.remove("front");
        frontLayer = frontLayer === "A" ? "B" : "A";
      };
      if (back.complete) back.onload();
    } else {
      (frontLayer === "A" ? el.roomA : el.roomB).src = src;
    }

    // HUD
    el.hudDepth.textContent = "D" + S.depth + (S.target !== Infinity ? "/" + S.target : "");
    el.lightBar.style.width = S.light + "%";
    el.sanityBar.style.width = S.sanity + "%";
    el.lightBar.classList.toggle("low", S.light < 25);
    el.sanityBar.classList.toggle("low", S.sanity < 25);
    el.hudKeys.textContent = "🗝 " + S.keys;

    // darkness scales with missing light; sanity adds murk
    const dark = (1 - S.light / 100) * 0.82 + (1 - S.sanity / 100) * 0.12;
    el.darkness.style.opacity = clamp(dark, 0, 0.94).toFixed(3);

    // grain rises as sanity falls
    grainOpacity = 0.05 + (1 - S.sanity / 100) * 0.45;
    el.play.classList.toggle("insane", S.sanity < 30);

    // danger when the entity is one room away
    const danger = isEntityAdjacent();
    el.danger.classList.toggle("on", danger);
    if (danger && navigator.vibrate) navigator.vibrate(60);
    Audio.heartbeat(danger);

    renderDoors(room);
    renderAction(room);
    renderRoomName(room, animate);
    drawMap();
  }

  function renderDoors(room) {
    el.doors.innerHTML = "";
    for (const dir of DIR_KEYS) {
      if (!room.doors[dir]) continue;
      const b = document.createElement("button");
      b.className = "door-btn";
      b.innerHTML = "<span class='arr'>" + DIR_ARROW[dir] + "</span>";
      b.setAttribute("aria-label", "Go " + dir);
      b.onclick = () => move(dir);
      el.doors.appendChild(b);
    }
  }

  function renderAction(room) {
    let label = "", show = false, cls = "";
    if (room.id === S.dungeon.exitId) {
      show = true;
      label = S.keys >= 1 ? "▼ DESCEND" : "🔒 LOCKED";
      cls = S.keys >= 1 ? "go" : "locked";
    } else if (room.item === "key") { show = true; label = "Take the Key"; cls = "go"; }
    else if (room.item === "battery") { show = true; label = "Take Battery"; cls = "go"; }
    else if (room.item === "note") { show = true; label = "Read"; cls = "go"; }
    el.action.style.display = show ? "" : "none";
    el.action.textContent = label;
    el.action.className = "action-btn " + cls;
  }

  let nameTimer = 0;
  function renderRoomName(room, animate) {
    if (!animate) return;
    el.roomName.textContent = room.id === S.dungeon.exitId ? "the descent"
      : room.id === S.dungeon.startId ? "where you woke" : room.title;
    el.roomName.classList.add("show");
    clearTimeout(nameTimer);
    nameTimer = setTimeout(() => el.roomName.classList.remove("show"), 2200);
  }

  // ── minimap ────────────────────────────────────────────────────────────
  function drawMap() {
    const d = S.dungeon, c = el.map, ctx = c.getContext("2d");
    const size = d.size;
    const big = S.mapBig;
    const cell = big ? Math.floor(Math.min(window.innerWidth, window.innerHeight) * 0.7 / size) : Math.floor(120 / size);
    const pad = Math.max(2, Math.floor(cell * 0.18));
    c.width = size * cell; c.height = size * cell;
    el.mapWrap.classList.toggle("big", big);
    ctx.clearRect(0, 0, c.width, c.height);

    // door connectors first
    ctx.strokeStyle = "rgba(120,130,150,.5)";
    ctx.lineWidth = Math.max(1, cell * 0.08);
    for (const id in d.rooms) {
      const r = d.rooms[id];
      if (!r.seen) continue;
      const cx = r.x * cell + cell / 2, cy = r.y * cell + cell / 2;
      for (const dir of ["E", "S"]) {
        const nid = r.doors[dir];
        if (nid && d.rooms[nid] && d.rooms[nid].seen) {
          const nr = d.rooms[nid];
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(nr.x * cell + cell / 2, nr.y * cell + cell / 2);
          ctx.stroke();
        }
      }
    }
    // rooms
    for (const id in d.rooms) {
      const r = d.rooms[id];
      if (!r.seen) continue;
      let fill = "#3a4150";
      if (id === d.exitId && (r.seen)) fill = "#3ad29a";
      if (id === S.pos) fill = "#7dd3fc";
      ctx.fillStyle = fill;
      ctx.fillRect(r.x * cell + pad, r.y * cell + pad, cell - pad * 2, cell - pad * 2);
    }
    // entity shown only if adjacent (a hint, not full reveal)
    if (isEntityAdjacent()) {
      const e = d.rooms[S.entityId];
      ctx.fillStyle = "#f87171";
      const ex = e.x * cell + cell / 2, ey = e.y * cell + cell / 2;
      ctx.beginPath(); ctx.arc(ex, ey, Math.max(2, cell * 0.16), 0, 7); ctx.fill();
    }
  }

  function toggleMap() { S.mapBig = !S.mapBig; drawMap(); }

  // ── effects ──────────────────────────────────────────────────────────────
  function toast(msg, ms, cls) {
    el.toast.textContent = msg;
    el.toast.className = "toast show " + (cls || "");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.toast.classList.remove("show"), ms || 1500);
  }
  function jumpscare() {
    el.jumpscare.src = IMG("entity");
    el.jumpscare.classList.add("flash");
    clearTimeout(jumpscare._t);
    jumpscare._t = setTimeout(() => el.jumpscare.classList.remove("flash"), 520);
  }

  // animated film grain
  let grainOpacity = 0.08, grainCtx, grainCv, lastGrain = 0;
  function initGrain() {
    grainCv = el.grain;
    grainCtx = grainCv.getContext("2d");
    grainCv.width = 160; grainCv.height = 280;
    requestAnimationFrame(grainLoop);
  }
  function grainLoop(t) {
    if (t - lastGrain > 70) {
      lastGrain = t;
      const w = grainCv.width, h = grainCv.height;
      const img = grainCtx.createImageData(w, h);
      const data = img.data;
      for (let i = 0; i < data.length; i += 4) {
        const v = (Math.random() * 255) | 0;
        data[i] = data[i + 1] = data[i + 2] = v;
        data[i + 3] = 255;
      }
      grainCtx.putImageData(img, 0, 0);
      grainCv.style.opacity = grainOpacity.toFixed(3);
    }
    requestAnimationFrame(grainLoop);
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // ── procedural audio (WebAudio, started on first interaction) ────────────
  const Audio = (function () {
    let ctx = null, drone = null, droneGain = null, hbOn = false, muted = false, started = false;
    function ensure() {
      if (ctx || muted) return;
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    }
    function start() {
      if (started || muted) return;
      ensure(); if (!ctx) return;
      started = true;
      drone = ctx.createOscillator(); droneGain = ctx.createGain();
      drone.type = "sawtooth"; drone.frequency.value = 42;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 180;
      droneGain.gain.value = 0.04;
      drone.connect(lp); lp.connect(droneGain); droneGain.connect(ctx.destination);
      drone.start();
    }
    function blip(freq, dur, type, vol) {
      if (!ctx || muted) return;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || "sine"; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(vol || 0.12, ctx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (dur || 0.15));
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + (dur || 0.15) + 0.02);
    }
    let hbTimer = 0;
    function heartbeat(on) {
      if (on === hbOn) return;
      hbOn = on;
      clearInterval(hbTimer);
      if (on && !muted) {
        const beat = () => { blip(60, 0.12, "sine", 0.22); setTimeout(() => blip(48, 0.14, "sine", 0.18), 170); };
        beat(); hbTimer = setInterval(beat, 900);
      }
    }
    return {
      start,
      step() { blip(120 + Math.random() * 20, 0.05, "triangle", 0.04); },
      pickup() { blip(660, 0.12, "sine", 0.12); setTimeout(() => blip(990, 0.12, "sine", 0.1), 90); },
      descend() { blip(80, 0.5, "sawtooth", 0.12); },
      scream() { blip(220, 0.6, "sawtooth", 0.25); setTimeout(() => blip(90, 0.8, "square", 0.2), 100); },
      heartbeat,
      toggle() {
        muted = !muted;
        if (droneGain) droneGain.gain.value = muted ? 0 : 0.04;
        if (muted) heartbeat(false);
        return muted;
      },
    };
  })();

  // ── input ────────────────────────────────────────────────────────────────
  function keydown(e) {
    if (S.screen !== "play") return;
    const k = e.key.toLowerCase();
    if (k === "arrowup" || k === "w") move("N");
    else if (k === "arrowdown" || k === "s") move("S");
    else if (k === "arrowleft" || k === "a") move("W");
    else if (k === "arrowright" || k === "d") move("E");
    else if (k === " " || k === "enter") { e.preventDefault(); primaryAction(); }
    else if (k === "m") toggleMap();
    else if (k === "escape") showTitle();
  }

  function init() {
    cacheEls();
    el.btnDescendStart.onclick = () => startGame(el.seedInput.value);
    el.btnRandom.onclick = () => { el.seedInput.value = HollowRNG.randomSeed(); };
    el.action.onclick = primaryAction;
    el.btnRetry.onclick = showTitle;
    el.btnMap.onclick = toggleMap;
    el.mapWrap.onclick = () => { if (S.mapBig) toggleMap(); };
    el.btnMute.onclick = () => { el.btnMute.textContent = Audio.toggle() ? "🔇" : "🔊"; };
    document.addEventListener("keydown", keydown);
    // preload the title backdrop
    el.roomA.src = IMG("title_bg");
    initGrain();
    showTitle();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
