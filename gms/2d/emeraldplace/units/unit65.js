/**
 * Unit 65 — Dating Sim
 * Chat-based dialogue with 3 characters. Runs on the laptop screen.
 * Alex (photographer), Sam (barista), Quinn (bookworm).
 */

// ─── Character Definitions ──────────────────────────────────

const CHARS = {
  alex:  { name: "Alex",  emoji: "🎨", color: "#9b59b6", tagline: "Photographer · floor above" },
  sam:   { name: "Sam",   emoji: "☕", color: "#e67e22", tagline: "Barista · ground floor café" },
  quinn: { name: "Quinn", emoji: "📚", color: "#27ae60", tagline: "Bibliophile · next door" },
};

// ─── Scene Tree ─────────────────────────────────────────────

const SCENES = {
  // ── ALEX ──────────────────────────────────────────────────
  alex_intro: {
    speaker: "alex",
    text: "Oh hey — you're the new one in 65, right? I'm Alex. I'm above you.",
    choices: [
      { text: "Nice to finally meet you.",            effects: { trust: 3 },              next: "alex_intro_2" },
      { text: "Hope my music wasn't too loud earlier.", effects: { trust: 5, affection: 2 }, next: "alex_intro_2" },
      { text: "You always hang out in the corridor?", effects: { affection: 3 },           next: "alex_intro_2" },
    ],
  },
  alex_intro_2: {
    speaker: "alex",
    text: "This building's got a vibe. Like everyone's living a whole life behind their door.",
    choices: [
      { text: "Ha. What's happening behind yours?", effects: { affection: 5, trust: 2 }, next: "alex_number" },
      { text: "That's kind of poetic.",              effects: { affection: 3 },           next: "alex_number" },
      { text: "I mostly just hear pipes.",           effects: { trust: 4 },              next: "alex_number" },
    ],
  },
  alex_number: {
    speaker: "alex",
    text: "Anyway — I'll let you get back to it. Maybe I'll text you sometime.",
    note: "Alex shared their number.",
    choices: [
      { text: "I'd like that.",   effects: { affection: 5 }, next: "alex_msg1", unlockChar: "sam" },
      { text: "Sure, why not.",   effects: { affection: 2 }, next: "alex_msg1", unlockChar: "sam" },
    ],
  },
  alex_msg1: {
    speaker: "alex",
    text: "Hey. The light on your window is nice in the evening. Don't take those curtains down.",
    requires: { minDay: 2 },
    choices: [
      { text: "Do you watch my window often? 😄", effects: { affection: 5, trust: 3 }, next: "alex_msg1_r" },
      { text: "That's... oddly specific.",         effects: { trust: 5 },              next: "alex_msg1_r" },
      { text: "Ha. I'll keep that in mind.",       effects: { affection: 2 },          next: "alex_msg1_r" },
    ],
  },
  alex_msg1_r: {
    speaker: "alex",
    text: "I'm a photographer. I notice things. Speaking of — there's a night market Saturday. You should come.",
    choices: [
      { text: "That sounds fun. It's a date.",      effects: { affection: 8, trust: 3 },  next: "alex_date_confirm" },
      { text: "Maybe. Send me the details.",        effects: { affection: 3, trust: 3 },  next: "alex_date_confirm" },
      { text: "I'm usually pretty busy on weekends.", effects: { affection: -2 },          next: "alex_date_maybe" },
    ],
  },
  alex_date_maybe: {
    speaker: "alex",
    text: "No pressure. I'll be there if you change your mind.",
    choices: [
      { text: "Actually, yeah. Count me in.", effects: { affection: 5 }, next: "alex_date_confirm" },
      { text: "Maybe next time.",             effects: { trust: 2 },    next: "alex_holding" },
    ],
  },
  alex_date_confirm: {
    speaker: "alex",
    text: "Great. Meet outside at 7? I'll bring my camera.",
    note: "📅 Saturday · Night Market added to calendar.",
    choices: [
      { text: "See you then! 👋", effects: { affection: 3 }, next: "alex_holding" },
      { text: "Can't wait.",       effects: { affection: 5 }, next: "alex_holding" },
    ],
  },
  alex_holding: { speaker: "alex", text: "", isHolding: true },

  // ── SAM ───────────────────────────────────────────────────
  sam_intro: {
    speaker: "sam",
    text: "Hi! You're from upstairs? Unit 65? I'm Sam — I run the café on the ground floor.",
    choices: [
      { text: "Oh! I didn't know there was a café here.",    effects: { affection: 3 },           next: "sam_intro_2" },
      { text: "The coffee place? I've been meaning to try it.", effects: { affection: 5 },        next: "sam_intro_2" },
      { text: "Yep. Just moved in.",                         effects: { trust: 2 },              next: "sam_intro_2" },
    ],
  },
  sam_intro_2: {
    speaker: "sam",
    text: "Come in anytime! First coffee's on me. It's the best way to meet the neighbours.",
    choices: [
      { text: "That's really sweet, thanks.",  effects: { affection: 5, trust: 3 }, next: "sam_number" },
      { text: "I'll take you up on that.",     effects: { affection: 3, trust: 2 }, next: "sam_number" },
      { text: "Is that how you meet everyone?", effects: { trust: 5, affection: 2 }, next: "sam_number" },
    ],
  },
  sam_number: {
    speaker: "sam",
    text: "I open at 7. Usually means I'm up at 5:30. Message me if you want me to save you a seat!",
    note: "Sam shared their number.",
    choices: [
      { text: "5:30? That's dedication.",          effects: { affection: 3 }, next: "sam_msg1", unlockChar: "quinn" },
      { text: "I'll definitely take you up on that.", effects: { affection: 5 }, next: "sam_msg1", unlockChar: "quinn" },
    ],
  },
  sam_msg1: {
    speaker: "sam",
    text: "Hey ☀️ I've got your usual ready. Well — I guessed. Hope you like oat flat whites?",
    requires: { minDay: 3 },
    choices: [
      { text: "Oat flat white is exactly right. 👀",   effects: { affection: 8 },           next: "sam_holding" },
      { text: "Actually I'm a long black person.",     effects: { trust: 3, affection: 3 }, next: "sam_holding" },
      { text: "On my way down!",                       effects: { affection: 5 },           next: "sam_holding" },
    ],
  },
  sam_holding: { speaker: "sam", text: "", isHolding: true },

  // ── QUINN ─────────────────────────────────────────────────
  quinn_intro: {
    speaker: "quinn",
    text: "Oh — hi. I'm Quinn. Next door. 67. Sorry, I'm just trying to get this package inside.",
    choices: [
      { text: "Need a hand?",            effects: { affection: 5, trust: 3 }, next: "quinn_intro_2" },
      { text: "Hey Quinn! I'm next door.", effects: { trust: 3 },             next: "quinn_intro_2" },
      { text: "Take your time!",         effects: { affection: 2 },          next: "quinn_intro_2" },
    ],
  },
  quinn_intro_2: {
    speaker: "quinn",
    text: "Thanks. It's books. Obviously. I maybe ordered too many this month.",
    choices: [
      { text: "Is there such a thing as too many books?", effects: { affection: 5, trust: 3 }, next: "quinn_number" },
      { text: "What are you reading?",                   effects: { trust: 5 },              next: "quinn_number" },
      { text: "Ha. Just a little.",                      effects: { trust: 2, affection: 2 }, next: "quinn_number" },
    ],
  },
  quinn_number: {
    speaker: "quinn",
    text: "...You're not going to make fun of me for the books?",
    note: "Quinn shared their number.",
    choices: [
      { text: "Never. What's the last great one?",     effects: { affection: 8, trust: 5 }, next: "quinn_msg1" },
      { text: "I mean, I have questions, but no.",     effects: { trust: 5 },              next: "quinn_msg1" },
      { text: "Maybe a little. In a good way.",        effects: { affection: 3, trust: 3 }, next: "quinn_msg1" },
    ],
  },
  quinn_msg1: {
    speaker: "quinn",
    text: "Hey. Do you know if there's a library card situation for residents? The one I had expired.",
    requires: { minDay: 4 },
    choices: [
      { text: "I'll check at the desk with you if you want.", effects: { affection: 8, trust: 5 }, next: "quinn_holding" },
      { text: "I think the city library is 10 mins walk?",    effects: { trust: 3 },              next: "quinn_holding" },
      { text: "No idea, but let me know if you find out.",    effects: { affection: 2 },          next: "quinn_holding" },
    ],
  },
  quinn_holding: { speaker: "quinn", text: "", isHolding: true },
};

// Stage labels
const STAGE_LABELS = ["Stranger", "Acquaintance", "Close friend", "Romantic interest"];
const STAGE_THRESHOLDS = [0, 15, 40, 70];

// ─── State ──────────────────────────────────────────────────

const SAVE_KEY = "ep_u65";

function defaultState() {
  return {
    chars: {
      alex:  { affection: 0, trust: 0, stage: 0, scene: "alex_intro",  history: [], unlocked: true  },
      sam:   { affection: 0, trust: 0, stage: 0, scene: "sam_intro",   history: [], unlocked: false },
      quinn: { affection: 0, trust: 0, stage: 0, scene: "quinn_intro", history: [], unlocked: false },
    },
    activeChar: "alex",
    day: 1,
  };
}

function loadState() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || defaultState(); }
  catch { return defaultState(); }
}

function saveState() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(s));
}

let s = loadState();
let _container = null;

// ─── Stage / Effect Helpers ──────────────────────────────────

function applyEffects(charId, effects) {
  const ch = s.chars[charId];
  for (const [key, val] of Object.entries(effects)) {
    ch[key] = Math.min(100, Math.max(0, ch[key] + val));
  }
  // Check stage advance
  let newStage = ch.stage;
  for (let i = STAGE_THRESHOLDS.length - 1; i >= 0; i--) {
    if (ch.affection >= STAGE_THRESHOLDS[i]) { newStage = i; break; }
  }
  if (newStage > ch.stage) {
    ch.stage = newStage;
    window.EmeraldPlace?.notify(`${CHARS[charId].name}: ${STAGE_LABELS[newStage]}`, "unlock");
    window.EmeraldPlace?.addLog(`Day ${s.day}`, `${CHARS[charId].emoji} ${CHARS[charId].name} now considers you a ${STAGE_LABELS[newStage].toLowerCase()}.`);
  }
  // Sync mood stat to average affection
  const chars = Object.values(s.chars);
  const avgAffection = chars.reduce((a, c) => a + c.affection, 0) / chars.length;
  window.EmeraldPlace?.setStat("mood", Math.round(avgAffection));
}

function unlockChar(charId) {
  if (!s.chars[charId].unlocked) {
    s.chars[charId].unlocked = true;
    window.EmeraldPlace?.notify(`${CHARS[charId].emoji} ${CHARS[charId].name} wants to chat!`, "unlock");
    window.EmeraldPlace?.addLog(`Day ${s.day}`, `${CHARS[charId].emoji} ${CHARS[charId].name} is now available to talk.`);
  }
}

function canPlayScene(scene) {
  if (!scene || scene.isHolding) return false;
  if (scene.requires?.minDay && s.day < scene.requires.minDay) return false;
  return true;
}

// ─── History Helpers ─────────────────────────────────────────

function pushHistory(charId, speaker, text, note) {
  const entry = { speaker, text, note: note || null };
  s.chars[charId].history.push(entry);
  // Keep last 40 entries to avoid unbounded growth
  if (s.chars[charId].history.length > 40) s.chars[charId].history.shift();
}

// ─── Make Choice ─────────────────────────────────────────────

function makeChoice(charId, choice) {
  const scene = SCENES[s.chars[charId].scene];
  // Add NPC message + note to history
  pushHistory(charId, charId, scene.text, scene.note);
  // Add player response to history
  pushHistory(charId, "player", choice.text, null);
  // Apply effects
  applyEffects(charId, choice.effects || {});
  // Unlock another char?
  if (choice.unlockChar) unlockChar(choice.unlockChar);
  // Advance scene
  s.chars[charId].scene = choice.next;
  saveState();
  renderCharView(_container, charId);
}

// ─── Render ──────────────────────────────────────────────────

export function init(container, state) {
  _container = container;
  // Inject scoped styles
  const style = document.createElement("style");
  style.textContent = CSS;
  container.innerHTML = "";
  container.appendChild(style);

  const root = document.createElement("div");
  root.className = "u65-root";
  container.appendChild(root);

  buildUI(root);
  renderCharView(root, s.activeChar);

  // Listen for sleep events to advance day
  document.addEventListener("ep:sleep", onSleep);
}

function buildUI(root) {
  root.innerHTML = `
    <div class="u65-tabs" id="u65-tabs"></div>
    <div class="u65-statbar" id="u65-statbar"></div>
    <div class="u65-history" id="u65-history"></div>
    <div class="u65-choices" id="u65-choices"></div>
  `;
  rebuildTabs(root);
}

function rebuildTabs(root) {
  const tabBar = root.querySelector("#u65-tabs") || document.getElementById("u65-tabs");
  if (!tabBar) return;
  tabBar.innerHTML = "";
  for (const [charId, char] of Object.entries(CHARS)) {
    const ch = s.chars[charId];
    const btn = document.createElement("button");
    btn.className = "u65-tab" + (charId === s.activeChar ? " active" : "") + (!ch.unlocked ? " locked" : "");
    btn.dataset.char = charId;
    btn.style.setProperty("--char-color", char.color);
    // New message indicator
    const scene = SCENES[ch.scene];
    const hasNew = ch.unlocked && canPlayScene(scene);
    btn.innerHTML = `${ch.unlocked ? char.emoji : "🔒"} ${char.name}${hasNew ? '<span class="u65-new">●</span>' : ""}`;
    btn.addEventListener("click", () => {
      if (!ch.unlocked) return;
      s.activeChar = charId;
      saveState();
      renderCharView(_container?.querySelector(".u65-root") || _container, charId);
    });
    tabBar.appendChild(btn);
  }
}

function renderCharView(root, charId) {
  s.activeChar = charId;
  const ch = s.chars[charId];
  const char = CHARS[charId];
  const scene = SCENES[ch.scene];

  // Stat bar
  const statBar = root.querySelector("#u65-statbar");
  if (statBar) {
    statBar.innerHTML = `
      <div class="u65-stat">
        <span class="u65-stat-lbl">❤️</span>
        <div class="u65-bar-bg"><div class="u65-bar-fill" style="width:${ch.affection}%;background:${char.color}"></div></div>
        <span class="u65-stat-val">${ch.affection}</span>
      </div>
      <div class="u65-stat">
        <span class="u65-stat-lbl">🤝</span>
        <div class="u65-bar-bg"><div class="u65-bar-fill" style="width:${ch.trust}%;background:#53d8fb"></div></div>
        <span class="u65-stat-val">${ch.trust}</span>
      </div>
      <span class="u65-stage">${STAGE_LABELS[ch.stage]}</span>
    `;
  }

  // Chat history
  const hist = root.querySelector("#u65-history");
  if (hist) {
    hist.innerHTML = "";
    for (const entry of ch.history) {
      const isPlayer = entry.speaker === "player";
      const div = document.createElement("div");
      div.className = "u65-msg " + (isPlayer ? "u65-msg--player" : "u65-msg--npc");
      if (!isPlayer) div.style.setProperty("--char-color", char.color);
      div.innerHTML = `
        ${!isPlayer ? `<span class="u65-msg-who">${char.emoji} ${char.name}</span>` : ""}
        <span class="u65-bubble">${entry.text}</span>
        ${entry.note ? `<em class="u65-note">${entry.note}</em>` : ""}
      `;
      hist.appendChild(div);
    }
    // If there's a current scene text ready, show it as pending
    if (scene && !scene.isHolding && canPlayScene(scene) && ch.history.at(-1)?.speaker !== charId) {
      const pending = document.createElement("div");
      pending.className = "u65-msg u65-msg--npc u65-msg--pending";
      pending.style.setProperty("--char-color", char.color);
      pending.innerHTML = `
        <span class="u65-msg-who">${char.emoji} ${char.name}</span>
        <span class="u65-bubble">${scene.text}</span>
        ${scene.note ? `<em class="u65-note">${scene.note}</em>` : ""}
      `;
      hist.appendChild(pending);
    }
    hist.scrollTop = hist.scrollHeight;
  }

  // Choices
  const choicesEl = root.querySelector("#u65-choices");
  if (choicesEl) {
    choicesEl.innerHTML = "";
    if (!ch.unlocked) {
      choicesEl.innerHTML = `<p class="u65-waiting">🔒 Not yet available.</p>`;
    } else if (!scene || scene.isHolding) {
      const waitMsg = scene?.requires?.minDay && s.day < scene.requires.minDay
        ? `Check back tomorrow…` : `Nothing new — sleep to pass time.`;
      choicesEl.innerHTML = `<p class="u65-waiting">${waitMsg}</p>`;
    } else if (!canPlayScene(scene)) {
      choicesEl.innerHTML = `<p class="u65-waiting">Check back on day ${scene.requires.minDay}…</p>`;
    } else {
      for (const choice of scene.choices) {
        const btn = document.createElement("button");
        btn.className = "u65-choice-btn";
        btn.textContent = choice.text;
        btn.addEventListener("click", () => makeChoice(charId, choice));
        choicesEl.appendChild(btn);
      }
    }
  }

  // Refresh tabs (new message indicators may change)
  rebuildTabs(root);
}

function onSleep(e) {
  s.day = (e.detail?.day) || s.day + 1;
  saveState();
  // Re-render active view to unlock newly available scenes
  if (_container) {
    const root = _container.querySelector(".u65-root");
    if (root) renderCharView(root, s.activeChar);
  }
}

export function onExit() {
  document.removeEventListener("ep:sleep", onSleep);
  saveState();
}

// ─── CSS ────────────────────────────────────────────────────

const CSS = `
.u65-root {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(160deg, #0e0b1a 0%, #1a1030 100%);
  font-family: 'Courier New', Courier, monospace;
  color: #e0d8c8;
  overflow: hidden;
}

/* Tabs */
.u65-tabs {
  display: flex;
  gap: 0;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(255,255,255,0.07);
}
.u65-tab {
  flex: 1;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: rgba(224,216,200,0.4);
  font-family: inherit;
  font-size: 0.65rem;
  letter-spacing: 0.06em;
  padding: 7px 4px;
  cursor: pointer;
  transition: all 0.18s;
  white-space: nowrap;
  position: relative;
}
.u65-tab.active {
  color: var(--char-color, #e0d8c8);
  border-bottom-color: var(--char-color, #e0d8c8);
}
.u65-tab.locked { cursor: default; opacity: 0.4; }
.u65-new {
  color: #e94560;
  font-size: 0.5rem;
  position: absolute;
  top: 5px; right: 5px;
}

/* Stat bar */
.u65-statbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  background: rgba(0,0,0,0.2);
}
.u65-stat {
  display: flex;
  align-items: center;
  gap: 5px;
  flex: 1;
}
.u65-stat-lbl { font-size: 0.75rem; }
.u65-bar-bg {
  flex: 1;
  height: 4px;
  background: rgba(255,255,255,0.08);
  border-radius: 2px;
  overflow: hidden;
}
.u65-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.5s ease;
}
.u65-stat-val { font-size: 0.58rem; color: rgba(224,216,200,0.5); width: 20px; }
.u65-stage {
  font-size: 0.55rem;
  color: rgba(224,216,200,0.35);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  flex-shrink: 0;
}

/* Chat history */
.u65-history {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}
.u65-history::-webkit-scrollbar { width: 3px; }
.u65-history::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

.u65-msg { display: flex; flex-direction: column; max-width: 85%; gap: 2px; }
.u65-msg--npc { align-self: flex-start; align-items: flex-start; }
.u65-msg--player { align-self: flex-end; align-items: flex-end; }

.u65-msg-who {
  font-size: 0.58rem;
  color: var(--char-color, rgba(224,216,200,0.5));
  letter-spacing: 0.05em;
  margin-bottom: 1px;
}

.u65-bubble {
  background: rgba(255,255,255,0.07);
  border-radius: 10px 10px 10px 2px;
  padding: 7px 10px;
  font-size: 0.72rem;
  line-height: 1.45;
  border: 1px solid rgba(255,255,255,0.06);
}
.u65-msg--npc .u65-bubble {
  border-color: rgba(var(--char-color), 0.2);
  background: rgba(255,255,255,0.06);
}
.u65-msg--player .u65-bubble {
  background: rgba(74,111,165,0.35);
  border-radius: 10px 10px 2px 10px;
  border-color: rgba(74,111,165,0.4);
}
.u65-msg--pending .u65-bubble {
  opacity: 0.6;
  border-style: dashed;
}

.u65-note {
  font-size: 0.58rem;
  color: rgba(224,216,200,0.4);
  font-style: italic;
  margin-top: 2px;
  padding-left: 4px;
}

/* Choices */
.u65-choices {
  flex-shrink: 0;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  border-top: 1px solid rgba(255,255,255,0.06);
  background: rgba(0,0,0,0.25);
  max-height: 45%;
  overflow-y: auto;
}
.u65-choice-btn {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 6px;
  color: #e0d8c8;
  font-family: inherit;
  font-size: 0.7rem;
  padding: 7px 12px;
  text-align: left;
  cursor: pointer;
  line-height: 1.4;
  transition: all 0.15s;
}
.u65-choice-btn:hover {
  background: rgba(233,69,96,0.15);
  border-color: rgba(233,69,96,0.4);
  color: #fff;
}
.u65-waiting {
  font-size: 0.68rem;
  color: rgba(224,216,200,0.3);
  text-align: center;
  padding: 10px;
  font-style: italic;
}
`;
