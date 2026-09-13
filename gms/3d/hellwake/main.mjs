import {
  CHAPTERS,
  WEAPONS,
  PASSIVES,
  SURVIVORS,
  RELICS,
  relicCost,
} from "./content.mjs";
import { loadSave, persistSave, buyRelic, recordRun } from "./progression.mjs";
import { GameEngine } from "./engine.mjs";
import { WorldRenderer } from "./renderer.mjs";
import { GameAudio } from "./audio.mjs";
import { icon } from "./icons.mjs";

const $ = (id) => document.getElementById(id);
const screen = $("screen"),
  overlay = $("overlay"),
  hud = $("hud"),
  canvas = $("world");
let save = loadSave(),
  engine = null,
  renderer = null,
  view = "home",
  currentSheet = null,
  selectedChapter = save.unlockedChapter,
  story = null,
  resultRecorded = false,
  lastPhase = "",
  lastHud = 0,
  lastStamp = 0,
  moved = 0,
  toastTimer = 0;
const audio = new GameAudio(),
  keys = new Set(),
  stick = { id: null, x: 0, y: 0, dx: 0, dy: 0 };
const fmt = (s) =>
  `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(s % 60)
    .toString()
    .padStart(2, "0")}`;
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const glyph = (w) => esc(w?.icon || "✦");
const survivor = () =>
  SURVIVORS.find((s) => s.id === save.selectedSurvivor) || SURVIVORS[0];
const chapterLabel = (id) => String(id + 1).padStart(2, "0");
function storeSave() {
  if (!persistSave(save))
    toast("Storage unavailable. Progress lasts for this session.");
}
function toast(text) {
  $("toast").textContent = text;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 3000);
}
function releaseInput() {
  keys.clear();
  stick.id = null;
  stick.dx = stick.dy = 0;
  $("joystick").hidden = true;
}
function closeOverlay() {
  overlay.hidden = true;
  overlay.innerHTML = "";
  currentSheet = null;
}
function home() {
  view = "home";
  engine = null;
  lastPhase = "";
  releaseInput();
  closeOverlay();
  hud.hidden = true;
  screen.hidden = false;
  renderHome();
}
function renderHome() {
  const c = CHAPTERS[selectedChapter],
    finished = save.completed.includes(5),
    pendingEnding = finished && !save.endingSeen;
  screen.innerHTML = `<div class="home"><div class="home-top"><div class="brand">${icon("skull")} HELLWAKE <span class="version">/ 01</span></div><div class="home-actions"><span class="currency">${icon("fire")}${save.embers}</span><button class="icon-button" data-action="settings" aria-label="Settings">${icon("settings")}</button></div></div><div class="hero-copy"><div class="eyebrow">THE DEAD ARE NOT ALONE</div><h1>HELL<span>WAKE</span></h1><p>A city possessed.<br>A voice worth following.<br>One more night to survive.</p></div><div class="hero-space"><span class="scene-label">${finished ? "THE SIGNAL IS YOURS" : "MERCY DISTRICT · 03:47 AM"}</span></div><div class="home-bottom"><div class="continue-card"><div class="continue-head"><span class="eyebrow">${finished ? "CAMPAIGN COMPLETE" : `CHAPTER ${chapterLabel(c.id)} / 06`}</span><span>${Math.round(c.duration / 60)} MIN · STORY</span></div><h2>${esc(c.title)}</h2><p>${esc(c.subtitle)}</p></div><button class="primary" data-action="${pendingEnding ? "pending-ending" : "start"}">${pendingEnding ? "HEAR THE FINAL TRANSMISSION" : save.stats.runs ? "FOLLOW THE SIGNAL" : "ENTER THE NIGHT"} ${icon("arrow")}</button><nav class="home-nav" aria-label="Game menus"><button data-action="campaign">${icon("map")}<span>CAMPAIGN</span></button><button data-action="arsenal">${icon("arsenal")}<span>ARSENAL</span></button><button data-action="refuge">${icon("refuge")}<span>THE REFUGE</span></button></nav><div class="home-footer">ONE THUMB. A THOUSAND DEAD. <span class="key-hint">WASD / ARROWS · SPACE TO PULSE</span></div></div></div>`;
}
function sheet(title, kicker, body) {
  currentSheet = kicker;
  overlay.hidden = false;
  overlay.innerHTML = `<div class="sheet-backdrop"><section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="sheet-handle"></div><div class="sheet-header"><div><div class="eyebrow">${esc(kicker)}</div><h2>${esc(title)}</h2></div><button class="icon-button" data-action="close-sheet" aria-label="Close">${icon("close")}</button></div>${body}</section></div>`;
  overlay
    .querySelector('[data-action="close-sheet"]')
    ?.focus({ preventScroll: true });
}
function campaign() {
  sheet(
    "Follow the signal",
    "SIX CHAPTERS. ONE LAST DAWN.",
    `<p class="description">Break the demons’ hold on Mercy. Complete each chapter to uncover the next transmission. Your refuge upgrades stay with you.</p><div class="chapter-list">${CHAPTERS.map(
      (c) => {
        const locked = c.id > save.unlockedChapter,
          complete = save.completed.includes(c.id);
        return `<button class="chapter-card ${locked ? "locked" : ""} ${c.id === selectedChapter ? "active" : ""}" data-action="chapter" data-id="${c.id}" ${locked ? "disabled" : ""}><span class="chapter-number">${chapterLabel(c.id)}</span><span class="chapter-copy"><strong>${esc(c.title)}</strong><small>${locked ? "Complete the previous chapter" : esc(c.location)} · ${fmt(c.duration)}</small></span>${icon(locked ? "lock" : complete ? "check" : "chevron")}</button>`;
      },
    ).join(
      "",
    )}</div><div class="subheading">AFTER THE STORY <span>${fmt(save.stats.bestEndless)} BEST</span></div><button class="chapter-card ${save.completed.includes(5) ? "" : "locked"}" data-action="endless" ${save.completed.includes(5) ? "" : "disabled"}><span class="chapter-number">∞</span><span class="chapter-copy"><strong>Endless Afterlight</strong><small>${save.completed.includes(5) ? "All weapons. Escalating demons. Hold the dawn." : "Finish the campaign to unlock"}</small></span>${icon(save.completed.includes(5) ? "chevron" : "lock")}</button>`,
  );
}
function arsenal() {
  sheet(
    "Tools of absolution",
    "BUILD SOMETHING UNHOLY",
    `<p class="description">Carry up to <strong>4 weapons + 4 charms</strong> each run. Collect souls to draft upgrades. Reach weapon rank 5 and its matching charm rank 3 to unlock an evolution.</p><div class="weapon-grid">${WEAPONS.map((w) => `<div class="arsenal-card ${w.unlockChapter > save.unlockedChapter ? "locked" : ""}"><span class="weapon-glyph" style="color:${w.color}">${glyph(w)}</span><strong>${esc(w.name)}</strong><p>${w.unlockChapter > save.unlockedChapter ? `Available in chapter ${chapterLabel(w.unlockChapter)}.` : esc(w.description)}</p><div class="evolution-line">${esc(w.evolution.name)}<br>${esc(PASSIVES.find((p) => p.id === w.evolution.requires)?.name)} III + weapon V</div></div>`).join("")}</div><div class="subheading">CHARMS <span>UP TO 3 RANKS EACH</span></div><div class="weapon-grid">${PASSIVES.map((p) => `<div class="arsenal-card"><span class="weapon-glyph">${glyph(p)}</span><strong>${esc(p.name)}</strong><p>${esc(p.description)}</p></div>`).join("")}</div>`,
  );
}
function refuge() {
  sheet(
    "A little more light",
    "THE REFUGE",
    `<p class="description">Every run leaves embers—even when you fall. Spend them here to strengthen every future run.</p><div class="subheading">YOUR SURVIVOR <span>${icon("fire")} ${save.embers} EMBERS</span></div><div class="survivor-list">${SURVIVORS.map((s, i) => `<button class="survivor-card ${save.selectedSurvivor === s.id ? "selected" : ""}" data-action="survivor" data-id="${s.id}" ${s.unlockChapter > save.unlockedChapter ? "disabled" : ""}><span class="portrait" style="color:${s.color}">${s.unlockChapter > save.unlockedChapter ? icon("lock") : ["M", "E", "V"][i]}</span><strong>${esc(s.name)}</strong><small>${s.unlockChapter > save.unlockedChapter ? `Chapter ${chapterLabel(s.unlockChapter)}` : esc(s.title)}</small></button>`).join("")}</div><p class="description" style="margin-top:12px">${esc(survivor().description)}</p><div class="subheading">PERMANENT RELICS <span>KEPT BETWEEN RUNS</span></div>${RELICS.map(
      (r, i) => {
        const level = save.relics[r.id] || 0,
          cost = relicCost(r, level);
        return `<div class="relic-row"><div class="relic-symbol">${icon(["heart", "arsenal", "pulse", "radio"][i])}</div><div class="relic-copy"><strong>${esc(r.name)}</strong><p>${esc(r.description)}</p><div class="relic-pips">${Array.from({ length: r.max }, (_, n) => `<i class="${n < level ? "on" : ""}"></i>`).join("")}</div></div><button class="buy-button" data-action="buy" data-id="${r.id}" ${level >= r.max || save.embers < cost ? "disabled" : ""}>${level >= r.max ? "MAX" : `${icon("fire")} ${cost}`}</button></div>`;
      },
    ).join(
      "",
    )}<div class="credits">${save.stats.runs} runs · ${save.stats.kills.toLocaleString()} souls freed<br>Progress saves automatically on this device.</div>`,
  );
}
function settings() {
  sheet(
    "Make yourself at home",
    "SETTINGS",
    `<div class="setting-row"><div>Sound<small>Procedural combat audio</small></div><button class="toggle ${save.settings.sound ? "on" : ""}" data-action="sound">${save.settings.sound ? "ON" : "OFF"}</button></div><div class="setting-row"><div>Reduced motion<small>Less camera shake and screen animation</small></div><button class="toggle ${save.settings.reducedMotion ? "on" : ""}" data-action="motion">${save.settings.reducedMotion ? "ON" : "OFF"}</button></div><label class="setting-row"><div>Visual quality<small>Low uses fewer pixels for cooler phones</small></div><select id="quality" aria-label="Visual quality">${["auto", "low", "high"].map((v) => `<option value="${v}" ${save.settings.quality === v ? "selected" : ""}>${v[0].toUpperCase() + v.slice(1)}</option>`).join("")}</select></label><div class="subheading">HOW TO SURVIVE</div><p class="description">Drag on the battlefield to move. Attacks aim and fire automatically. Collect glowing souls to level up. Stand inside marked circles to complete objectives. Your pulse damages nearby enemies and pulls souls toward you.<br><br>On a keyboard: WASD or arrows to move, Space to pulse, Esc to pause. You can lift your thumb whenever an upgrade appears—the battle waits for you.</p><p class="description">Chapters and relics save after each run. Leaving a battle ends that run. For a phone, open in Safari or Chrome and optionally add to your home screen.</p><button class="secondary" data-action="credits">${icon("radio")} The people behind the signal</button>`,
  );
}
function credits() {
  sheet(
    "Keep riding",
    "HELLWAKE",
    `<p class="description">A complete survival story about the people we cannot save, the ones we still can, and knowing when to let the dead go.</p><div class="credits"><strong>Created for Aaron</strong><br>OpenAI Codex / GPT-6<br>Vanilla JavaScript · Three.js<br>Original procedural world and sound<br><br><strong>THE SIGNAL CREW</strong><br>Mara Vale · The Last Runner<br>June Vale · A Voice Beneath the Static<br>Elias Vale · The Field Medic<br>Vesper · The Signal Thief<br><br>Made to fit in the palm of your hand.</div>`,
  );
}
function showStory(chapter, kind, done) {
  releaseInput();
  view = "story";
  hud.hidden = true;
  closeOverlay();
  screen.hidden = false;
  story = { chapter, kind, index: 0, done, lines: CHAPTERS[chapter][kind] };
  renderStory();
}
function renderStory() {
  const c = CHAPTERS[story.chapter],
    line = story.lines[story.index];
  screen.innerHTML = `<section class="story"><div class="story-top"><div class="brand">${icon("radio")} INCOMING TRANSMISSION</div><button class="text-button" data-action="skip-story">Skip</button></div><div class="story-title"><span class="eyebrow">${story.kind === "intro" ? "CHAPTER" : "AFTER THE SIGNAL"} ${chapterLabel(c.id)}</span><h2>${esc(c.title)}</h2><span class="eyebrow muted">${esc(c.location)}</span></div><div class="story-spacer"></div><div class="transmission"><div class="transmission-head">${icon("radio")}${esc(line.speaker)}<span class="signal-bars">${"<i></i>".repeat(9)}</span></div><p class="dialogue">${esc(line.text)}</p><div class="story-progress">${story.lines.map((_, i) => `<i class="${i <= story.index ? "active" : ""}"></i>`).join("")}</div><button class="primary" data-action="next-story">${story.index === story.lines.length - 1 ? (story.kind === "intro" ? "STEP INTO THE NIGHT" : "KEEP GOING") : "LISTEN"} ${icon("arrow")}</button></div></section>`;
}
function nextStory(skip = false) {
  if (!story) return;
  if (skip || ++story.index >= story.lines.length) {
    const done = story.done;
    story = null;
    done();
  } else renderStory();
}
function begin(endless = false) {
  audio.unlock();
  if (endless) {
    launch(5, true);
    return;
  }
  const id = selectedChapter;
  showStory(id, "intro", () => launch(id, false));
}
function launch(chapter, endless) {
  releaseInput();
  closeOverlay();
  screen.hidden = true;
  hud.hidden = false;
  view = "battle";
  resultRecorded = false;
  lastPhase = "";
  moved = 0;
  engine = new GameEngine({
    chapter,
    endless,
    unlockedChapter: save.unlockedChapter,
    survivor: save.selectedSurvivor,
    relics: { ...save.relics },
    seed: Date.now() >>> 0,
    onEvent: gameEvent,
  });
  $("survivor-name").textContent = survivor().name.toUpperCase();
  $("chapter-label").textContent = endless
    ? "ENDLESS AFTERLIGHT"
    : CHAPTERS[chapter].title.toUpperCase();
  $("tutorial").style.opacity = "1";
  updateHud();
}
function gameEvent(e) {
  audio.event(e.type);
  if (e.type === "boss")
    toast(e.text || "The archdemon has found you. Keep moving.");
  if (e.type === "objective")
    toast(e.text || "Anchor broken. The dead are losing their grip.");
  if (e.type === "evolve") toast(e.text || "Weapon awakened.");
  if (e.type === "toast" && e.text) toast(e.text);
}
function upgrade() {
  releaseInput();
  overlay.hidden = false;
  const s = engine.state;
  overlay.innerHTML = `<div class="center-overlay"><section class="modal" role="dialog" aria-modal="true" aria-label="Choose an upgrade"><div class="eyebrow">SOUL LEVEL ${s.level}</div><h2>Become the reckoning.</h2><p class="modal-subtitle">Choose a gift. Make the night yours.</p><div class="draft-list">${s.draft.map((d, i) => `<button class="draft-card ${d.kind === "evolution" ? "evolution" : ""}" data-action="draft" data-id="${i}"><span class="draft-symbol" style="color:${d.color || "var(--mint)"}">${glyph(d)}</span><span class="draft-copy"><small>${d.kind === "evolution" ? "✦ EVOLUTION" : d.kind === "passive" ? "CHARM" : d.kind === "heal" ? "RECOVERY" : s.weapons[d.id] ? `WEAPON · RANK ${(s.weapons[d.id] || 0) + 1}` : "NEW WEAPON"}</small><strong>${esc(d.name)}</strong><p>${esc(d.description)}</p></span>${icon("chevron")}</button>`).join("")}</div><p class="draft-foot">TIME IS PAUSED · YOUR BUILD LASTS THIS RUN</p></section></div>`;
}
function pause() {
  if (!engine || view !== "battle" || engine.state.phase !== "playing") return;
  engine.setPaused(true);
  releaseInput();
  overlay.hidden = false;
  currentSheet = null;
  overlay.innerHTML = `<div class="center-overlay"><section class="modal" role="dialog" aria-modal="true" aria-label="Game paused"><div class="eyebrow">THE NIGHT CAN WAIT</div><h2>Catch your breath.</h2><p class="modal-subtitle">${esc(CHAPTERS[engine.state.chapter].location)} · ${fmt(engine.state.time)}<br>${engine.state.kills} banished · Level ${engine.state.level}</p><div class="pause-build">${Object.keys(
    engine.state.weapons,
  )
    .map((id) => `<span>${glyph(WEAPONS.find((w) => w.id === id))}</span>`)
    .join("")}</div><div class="build-summary">${Object.entries(
    engine.state.passives,
  )
    .map(([id, rank]) => {
      const p = PASSIVES.find((p) => p.id === id);
      return `<span>${glyph(p)} ${esc(p?.name)} <b>${rank}/3</b></span>`;
    })
    .join(
      "",
    )}</div><button class="primary" data-action="resume">${icon("play")} BACK INTO THE NIGHT</button><button class="secondary" data-action="settings">${icon("settings")} Settings</button><button class="text-button" data-action="abandon">Return to refuge</button></section></div>`;
}
function abandon() {
  overlay.innerHTML = `<div class="center-overlay"><section class="modal" role="dialog" aria-modal="true" aria-label="Leave run"><div class="eyebrow">RETREAT TO THE REFUGE</div><h2>Live to fight again.</h2><p class="modal-subtitle">This run will end. Keep your ${engine.state.embers} earned embers; your chapter stays available to retry.</p><button class="primary" data-action="confirm-abandon">RETURN TO THE REFUGE</button><button class="secondary" data-action="resume">Keep fighting</button></section></div>`;
}
function record(result) {
  if (resultRecorded) return { unlocks: [] };
  resultRecorded = true;
  const award = recordRun(save, result);
  storeSave();
  return award;
}
function resultScreen() {
  releaseInput();
  const s = engine.state,
    result = s.result || {
      victory: s.phase === "won",
      chapter: s.chapter,
      kills: s.kills,
      seconds: s.time,
      embers: s.embers,
      endless: s.endless,
    };
  const award = record(result);
  view = "result";
  hud.hidden = true;
  overlay.hidden = false;
  overlay.innerHTML = `<div class="center-overlay"><section class="modal" role="dialog" aria-modal="true" aria-label="Run result"><div class="result-emblem ${result.victory ? "" : "defeat"}">${icon(result.victory ? "pulse" : "skull")}</div><div class="eyebrow">${result.victory ? "THE SIGNAL IS WEAKENING" : s.endless ? "THE DAWN REMEMBERS" : "THIS IS NOT THE END"}</div><h2>${result.victory ? "A little closer to dawn." : "Even ashes hold light."}</h2><p class="modal-subtitle">${result.victory ? esc(CHAPTERS[s.chapter].location) + " is free. Someone is calling." : "Your embers return with you. Strengthen your relics<br>at the refuge, then take the streets back."}</p><div class="result-stats"><div><strong>${fmt(result.seconds)}</strong><small>SURVIVED</small></div><div><strong>${result.kills}</strong><small>BANISHED</small></div><div><strong class="mint">+${result.embers}</strong><small>EMBERS</small></div></div>${award.unlocks.length ? `<div class="reward-line">UNLOCKED<br>${award.unlocks.map(esc).join(" · ")}</div>` : ""}<button class="primary" data-action="${result.victory ? "outro" : "retry"}">${result.victory ? "ANSWER THE RADIO" : "ONE MORE NIGHT"} ${icon("arrow")}</button><button class="secondary" data-action="result-refuge">${icon("refuge")} ${result.victory ? "Visit the refuge" : "Strengthen your relics"}</button></section></div>`;
}
function outro() {
  const id = engine.state.chapter;
  showStory(id, "outro", () => {
    if (id === 5) {
      save.endingSeen = true;
      storeSave();
      ending();
    } else {
      selectedChapter = save.unlockedChapter;
      home();
    }
  });
}
function ending() {
  view = "ending";
  screen.hidden = true;
  overlay.hidden = false;
  engine = null;
  overlay.innerHTML = `<div class="center-overlay"><section class="modal"><div class="result-emblem">${icon("pulse")}</div><div class="eyebrow">MERCY DISTRICT · 06:14 AM</div><h2 class="ending-title">The city<br>breathes again.</h2><p class="modal-subtitle">Six demons. Forty thousand names.<br>One voice that brought you home.<br><br>June is free. The living begin again.</p><div class="reward-line">ENDLESS AFTERLIGHT UNLOCKED<br>All eight weapons. A city worth protecting.</div><button class="primary" data-action="ending-home">KEEP RIDING ${icon("arrow")}</button><button class="secondary" data-action="endless">ENTER ENDLESS AFTERLIGHT</button><div class="credits">Thank you for following the signal.</div></section></div>`;
}
function updateHud() {
  if (!engine) return;
  const s = engine.state,
    c = CHAPTERS[s.chapter];
  $("hp-label").textContent =
    `${Math.ceil(Math.max(0, s.player.hp))} / ${s.player.maxHp}`;
  $("hp-bar").style.width =
    `${Math.max(0, (s.player.hp / s.player.maxHp) * 100)}%`;
  $("hp-bar").style.background =
    s.player.hp / s.player.maxHp < 0.3 ? "var(--red)" : "var(--mint)";
  $("time").textContent = fmt(s.time);
  $("kills").textContent = s.kills;
  $("level").textContent = `LEVEL ${s.level}`;
  $("xp-bar").style.width = `${Math.min(100, (s.xp / s.xpNext) * 100)}%`;
  $("xp-label").textContent = `${Math.floor(s.xp)} / ${s.xpNext} SOULS`;
  $("mission-caption").textContent = s.endless
    ? "PROTECT THE AFTERLIGHT"
    : s.boss
      ? "BREAK THEIR COMMAND"
      : s.objectiveDone >= s.objectiveTotal
        ? "THE ARCHDEMON IS APPROACHING"
        : "BREAK THE POSSESSION";
  $("mission-text").textContent = s.endless
    ? "Survive. Evolve. Hold the dawn."
    : s.boss
      ? "Defeat " + c.boss.name
      : s.objectiveDone >= s.objectiveTotal
        ? `Hold out · ${fmt(Math.max(0, c.duration - s.time))}`
        : c.objective.label;
  $("mission-count").textContent = s.endless
    ? "∞"
    : `${s.objectiveDone}/${s.objectiveTotal}`;
  $("boss-hud").hidden = !s.boss;
  if (s.boss) {
    $("boss-name").textContent = c.boss.name.toUpperCase();
    $("boss-bar").style.width =
      `${Math.max(0, (s.boss.hp / s.boss.maxHp) * 100)}%`;
  }
  const weaponHTML = Object.entries(s.weapons)
    .map(
      ([id, rank]) =>
        `<span class="weapon-slot ${s.evolved[id] ? "evolved" : ""}" title="${esc(WEAPONS.find((w) => w.id === id)?.name)}">${glyph(WEAPONS.find((w) => w.id === id))}<small>${s.evolved[id] ? "✦" : rank}</small></span>`,
    )
    .join("");
  if ($("weapon-slots").innerHTML !== weaponHTML)
    $("weapon-slots").innerHTML = weaponHTML;
  const charged = s.pulseCharge >= 0.999;
  $("pulse").disabled = !charged;
  $("pulse").classList.toggle("ready", charged);
  $("pulse-label").textContent = charged
    ? "PULSE"
    : `${Math.floor(s.pulseCharge * 100)}%`;
  $("pulse").style.borderColor = charged ? "#bbffd1aa" : "#bbffd133";
  let tip = "";
  if (s.chapter === 0 && s.time < 11 && moved < 3)
    tip =
      '<span class="tutorial-icon">↟</span><strong>Drag anywhere to move</strong><small>Your weapon fires automatically.</small>';
  else if (s.chapter === 0 && s.level === 1 && s.time < 28)
    tip =
      '<span class="tutorial-icon">✦</span><strong>Walk into the glowing souls</strong><small>Collect light. Level up. Choose your power.</small>';
  else if (s.chapter === 0 && s.objectiveDone === 0 && s.time < 48)
    tip =
      '<span class="tutorial-icon">◇</span><strong>Stand inside a marked circle</strong><small>Stay close to break the demon’s seal.</small>';
  else if (s.chapter === 0 && s.time > 48 && s.time < 59 && charged)
    tip =
      '<span class="tutorial-icon">✧</span><strong>Surrounded? Tap Pulse</strong><small>Clear space and pull nearby souls to you.</small>';
  $("tutorial").style.opacity = tip ? "1" : "0";
  if (tip && $("tutorial").innerHTML !== tip) $("tutorial").innerHTML = tip;
  const target = s.objectives
    .filter((o) => !o.done)
    .sort(
      (a, b) =>
        Math.hypot(a.x - s.player.x, a.y - s.player.y) -
        Math.hypot(b.x - s.player.x, b.y - s.player.y),
    )[0];
  if (target && Math.hypot(target.x - s.player.x, target.y - s.player.y) > 8) {
    const angle =
      (Math.atan2((target.y - s.player.y) * 0.8, target.x - s.player.x) * 180) /
        Math.PI +
      90;
    $("world-cue").innerHTML =
      `<div class="objective-arrow" style="--angle:${angle}deg"><span>⌃</span></div>`;
  } else $("world-cue").innerHTML = "";
}
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button || button.disabled) return;
  audio.unlock();
  audio.event("ui");
  const action = button.dataset.action,
    id = button.dataset.id;
  if (action === "pending-ending")
    showStory(5, "outro", () => {
      save.endingSeen = true;
      storeSave();
      ending();
    });
  if (action === "start") begin();
  if (action === "campaign") campaign();
  if (action === "arsenal") arsenal();
  if (action === "refuge") refuge();
  if (action === "settings") settings();
  if (action === "credits") credits();
  if (action === "close-sheet") {
    closeOverlay();
    if (engine && view === "battle" && engine.state.paused) pause();
  }
  if (action === "chapter") {
    selectedChapter = Number(id);
    closeOverlay();
    renderHome();
  }
  if (action === "endless" && save.completed.includes(5)) begin(true);
  if (action === "survivor") {
    if (
      SURVIVORS.find((s) => s.id === id)?.unlockChapter <= save.unlockedChapter
    ) {
      save.selectedSurvivor = id;
      storeSave();
      renderHome();
      refuge();
    }
  }
  if (action === "buy") {
    if (buyRelic(save, id)) {
      storeSave();
      renderHome();
      refuge();
      audio.event("level");
    }
  }
  if (action === "sound") {
    save.settings.sound = !save.settings.sound;
    audio.setEnabled(save.settings.sound);
    storeSave();
    settings();
  }
  if (action === "motion") {
    save.settings.reducedMotion = !save.settings.reducedMotion;
    renderer.setReducedMotion(save.settings.reducedMotion);
    document.body.classList.toggle(
      "reduced-motion",
      save.settings.reducedMotion,
    );
    storeSave();
    settings();
  }
  if (action === "next-story") nextStory();
  if (action === "skip-story") nextStory(true);
  if (action === "draft") {
    engine.chooseUpgrade(Number(id));
    closeOverlay();
    lastPhase = "";
  }
  if (action === "resume") {
    engine.setPaused(false);
    closeOverlay();
    releaseInput();
  }
  if (action === "abandon") abandon();
  if (action === "confirm-abandon") {
    const s = engine.state;
    record({
      victory: false,
      chapter: s.chapter,
      kills: s.kills,
      seconds: s.time,
      embers: s.embers,
      endless: s.endless,
    });
    home();
    refuge();
  }
  if (action === "retry") {
    const s = engine.state;
    launch(s.chapter, s.endless);
  }
  if (action === "outro") outro();
  if (action === "result-refuge") {
    if (engine.state.phase === "won") {
      const id = engine.state.chapter;
      showStory(id, "outro", () => {
        if (id === 5) {
          save.endingSeen = true;
          storeSave();
          ending();
        } else {
          selectedChapter = save.unlockedChapter;
          home();
          refuge();
        }
      });
    } else {
      home();
      refuge();
    }
  }
  if (action === "ending-home") {
    selectedChapter = 5;
    home();
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "quality") {
    save.settings.quality = e.target.value;
    renderer.setQuality(save.settings.quality);
    storeSave();
  }
});
$("pause").innerHTML = icon("pause");
$("pulse-icon").innerHTML = icon("pulse");
$("pause").addEventListener("click", pause);
$("pulse").addEventListener("click", () => {
  audio.unlock();
  if (engine?.state.phase === "playing" && !engine.state.paused) engine.pulse();
});
canvas.addEventListener("pointerdown", (e) => {
  if (
    view !== "battle" ||
    engine?.state.phase !== "playing" ||
    engine.state.paused ||
    stick.id !== null
  )
    return;
  audio.unlock();
  stick.id = e.pointerId;
  stick.x = e.clientX;
  stick.y = e.clientY;
  stick.dx = stick.dy = 0;
  canvas.setPointerCapture(e.pointerId);
  $("joystick").hidden = false;
  $("joystick").style.left = e.clientX + "px";
  $("joystick").style.top = e.clientY + "px";
  $("joystick").firstElementChild.style.transform = "translate(0,0)";
});
canvas.addEventListener("pointermove", (e) => {
  if (e.pointerId !== stick.id) return;
  const dx = e.clientX - stick.x,
    dy = e.clientY - stick.y,
    d = Math.hypot(dx, dy),
    r = 36;
  stick.dx = dx / Math.max(d, r);
  stick.dy = dy / Math.max(d, r);
  $("joystick").firstElementChild.style.transform =
    `translate(${stick.dx * r}px,${stick.dy * r}px)`;
});
for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
  canvas.addEventListener(type, (e) => {
    if (e.pointerId === stick.id) releaseInput();
  });
document.addEventListener("keydown", (e) => {
  if (e.target.matches("input,select,textarea")) return;
  const key = e.key.toLowerCase();
  if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key))
    e.preventDefault();
  if (key === "escape") {
    if (engine && view === "battle") {
      if (engine.state.paused) {
        engine.setPaused(false);
        closeOverlay();
      } else pause();
    } else if (currentSheet) closeOverlay();
    return;
  }
  if (
    key === " " &&
    !e.repeat &&
    view === "battle" &&
    engine?.state.phase === "playing" &&
    !engine.state.paused
  ) {
    audio.unlock();
    engine.pulse();
  }
  keys.add(key);
});
document.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener("blur", () => {
  releaseInput();
  pause();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    releaseInput();
    pause();
  }
  lastStamp = 0;
});
function frame(stamp) {
  requestAnimationFrame(frame);
  const dt = lastStamp ? Math.min((stamp - lastStamp) / 1000, 0.05) : 0;
  lastStamp = stamp;
  if (document.hidden) return;
  if (engine && view === "battle") {
    const x =
        stick.dx +
        (keys.has("d") || keys.has("arrowright") ? 1 : 0) -
        (keys.has("a") || keys.has("arrowleft") ? 1 : 0),
      y =
        stick.dy +
        (keys.has("s") || keys.has("arrowdown") ? 1 : 0) -
        (keys.has("w") || keys.has("arrowup") ? 1 : 0);
    if (!engine.state.paused && engine.state.phase === "playing")
      moved += Math.hypot(x, y) * dt;
    engine.update(dt, { x, y });
    const phase = engine.state.phase;
    if (phase !== lastPhase) {
      lastPhase = phase;
      if (phase === "upgrade") upgrade();
      if (phase === "won" || phase === "lost") resultScreen();
    }
    if (stamp - lastHud > 90) {
      updateHud();
      lastHud = stamp;
    }
  }
  audio.tick(
    view === "battle" &&
      engine?.state.phase === "playing" &&
      !engine.state.paused,
    engine?.state.time || 0,
  );
  renderer.render(
    view === "battle" || view === "result" ? engine?.state : null,
    dt,
  );
}
try {
  renderer = new WorldRenderer(canvas, save.settings);
  audio.setEnabled(save.settings.sound);
  document.body.classList.toggle("reduced-motion", save.settings.reducedMotion);
  window.addEventListener("resize", () => {
    renderer.resize();
    releaseInput();
  });
  home();
  $("loading").remove();
  requestAnimationFrame(frame);
  window.hellwake = {
    get metrics() {
      return renderer.stats();
    },
    get status() {
      return {
        view,
        phase: engine?.state.phase,
        chapter: engine?.state.chapter,
        time: engine?.state.time,
        level: engine?.state.level,
        kills: engine?.state.kills,
      };
    },
  };
  if (new URLSearchParams(location.search).has("test"))
    window.hellwakeTest = {
      get engine() {
        return engine;
      },
      get save() {
        return save;
      },
      launch,
      home,
      updateHud,
      renderer,
      storeSave,
      ending,
    };
} catch (error) {
  console.error(error);
  $("loading")?.remove();
  screen.innerHTML = `<div class="error-screen"><div class="eyebrow mint">THE SIGNAL COULD NOT CONNECT</div><h2>We need a little more light.</h2><p>This game needs WebGL. Try opening it in Safari or Chrome with hardware acceleration enabled.</p><button class="primary" onclick="location.reload()">TRY AGAIN</button></div>`;
}
