// All DOM UI: menus, mode screens, skill shop, loadout, modals, HUD wiring.
import { el, esc, fmtMoney, fmtRank, fmtSpeed } from "./util.js";
import { SKILLS, SKILL_ORDER, upgradeCost } from "./skills.js";
import * as career from "./career.js";
import { sfx, initAudio, setMuted, isMuted } from "./audio.js";
import { canUseSkill, useSkill, scoreLine } from "./match.js";
import { CHAPTERS, INTRO, FINALE, storyLevel, CUTSCENES } from "./story.js";
import { TOURNAMENTS, todayStr, dailyMatch } from "./modes.js";

const $ = (id) => document.getElementById(id);
let App = null;   // set by main.js

export function initUI(app) { App = app; }

export function showScreen(id) {
  for (const s of document.querySelectorAll(".screen")) s.classList.add("hidden");
  $("hud").classList.add("hidden");
  if (id === "hud") $("hud").classList.remove("hidden");
  else if (id) $(`scr-${id}`).classList.remove("hidden");
}

export function modal(html, buttons) {
  const root = $("modal-root");
  root.innerHTML = "";
  const box = el("div", "modal", html);
  const row = el("div", "row" + (buttons.length > 2 ? " stack" : ""));
  for (const b of buttons) {
    const btn = el("button", "btn " + (b.cls || ""), b.label);
    btn.onclick = () => { initAudio(); sfx.click(); root.innerHTML = ""; b.fn && b.fn(); };
    row.appendChild(btn);
  }
  box.appendChild(row);
  root.appendChild(box);
}

function hdr(screenEl, title, backFn) {
  const h = el("div", "hdr");
  const back = el("button", "back", "←");
  back.onclick = () => { sfx.click(); backFn(); };
  h.appendChild(back);
  h.appendChild(el("h2", null, title));
  h.appendChild(el("div", "cash", fmtMoney(App.save.money)));
  screenEl.appendChild(h);
}

/* ---------------- Main menu ---------------- */
export function buildMenu() {
  const save = App.save;
  const s = $("scr-menu");
  s.innerHTML = "";
  App.wantDemo && App.wantDemo();   // AI exhibition plays behind the menu

  s.appendChild(el("div", "title-logo mini",
    `<h1>RACKETEER</h1><div class="tag">Cheat your way to World&nbsp;#1 🎾</div>`));
  s.appendChild(el("div", "home-chip left", `🏅 ${fmtRank(save.rank).replace("Rank ", "#")}`));
  s.appendChild(el("div", "home-chip right", `💰 ${fmtMoney(save.money)}`));

  const go = (builder, screen) => { initAudio(); sfx.click(); builder(); showScreen(screen); };
  const qStars = career.quickStars(save);
  const L = [
    { emo: "📖", lab: "STORY", sub: save.storyDone ? "DONE 🏆" : `${Math.min(100, save.story)}/100`,
      fn: () => go(buildStory, "story") },
    { emo: "🤝", lab: "FRIENDLY", sub: `${save.wins}W-${save.losses}L`,
      fn: () => go(buildRanked, "career") },
    { emo: "🏆", lab: "CUPS", sub: `${save.trophies.local + save.trophies.national + save.trophies.world} 🏆`,
      fn: () => go(buildTourn, "tourn") },
  ];
  const dailyDone = save.dailyWin === todayStr();
  const R = [
    { emo: "📅", lab: "DAILY", sub: dailyDone ? "✅" : dailyMatch().mod.emo,
      fn: () => { initAudio(); sfx.click(); confirmDaily(); } },
    { emo: "⚡", lab: "QUICK", sub: qStars ? "vs ★" : "🔒 lv5",
      fn: () => { initAudio(); sfx.click(); pickQuick(); } },
    { emo: "🃏", lab: "SKILLS", sub: "🛒",
      fn: () => go(buildShop, "shop") },
  ];
  for (const [cls, defs] of [["menu-col left", L], ["menu-col right", R]]) {
    const col = el("div", cls);
    for (const d of defs) {
      const b = el("button", "sq-btn",
        `<span class="sq-emo">${d.emo}</span><span class="sq-lab">${d.lab}</span><span class="sq-sub">${d.sub}</span>`);
      b.onclick = d.fn;
      col.appendChild(b);
    }
    s.appendChild(col);
  }

  const bot = el("div", "menu-bot");
  const cog = el("button", "sq-btn small", `<span class="sq-emo">⚙️</span>`);
  cog.onclick = () => { initAudio(); sfx.click(); showSettings(); };
  bot.appendChild(cog);
  if (save.bestSpeed) {
    bot.appendChild(el("div", "chip-btn speed-chip",
      `🚀 <b>${fmtSpeed(save.bestSpeed, save.settings?.units || "kph")}</b>`));
  }
  s.appendChild(bot);
}

function showSettings() {
  const save = App.save;
  if (!save.settings) save.settings = { units: "kph" };
  const units = save.settings.units || "kph";
  modal(`<h2>⚙️ Settings</h2>
    ${save.bestSpeed ? `<p>🚀 All-time top speed: <b>${fmtSpeed(save.bestSpeed, units)}</b></p>` : ""}`,
    [
      { label: `Speed units: ${units === "kph" ? "km/h → switch to mph" : "mph → switch to km/h"}`, cls: "ghost",
        fn: () => { save.settings.units = units === "kph" ? "mph" : "kph"; career.persist(save); showSettings(); } },
      { label: `Default match length: ${(MATCH_LENS.find(l => l.id === (save.settings.matchLen || "1g")) || MATCH_LENS[0]).name}`, cls: "ghost",
        fn: () => {
          const ids = MATCH_LENS.map(l => l.id);
          const cur = save.settings.matchLen || "1g";
          save.settings.matchLen = ids[(ids.indexOf(cur) + 1) % ids.length];
          career.persist(save); showSettings();
        } },
      { label: isMuted() ? "🔇 Sound is OFF — turn on" : "🔊 Sound is ON — mute", cls: "ghost",
        fn: () => { setMuted(!isMuted()); showSettings(); } },
      { label: "❓ How to play", cls: "ghost", fn: showHelp },
      { label: "🗑️ Reset career", cls: "danger",
        fn: () => modal(`<h2>Start over?</h2><p>Everything — story, rank, cash, skills, trophies, top speed — wiped. Gary awaits.</p>`,
          [{ label: "Wipe it", cls: "danger", fn: () => { career.wipe(); App.save = career.load(); buildMenu(); } },
           { label: "Cancel", cls: "ghost", fn: showSettings }]) },
      { label: "Done", fn: () => buildMenu() },
    ]);
}

function showHelp() {
  modal(`<h2>How to play</h2>
    <p style="text-align:left">🎾 <b>You run automatically.</b> When the ball comes, <b>SWIPE</b> — the ring closing on the ball is your timing (green = perfect).</p>
    <p style="text-align:left">👉 Swipe <b>direction</b> aims. Swipe <b>long</b> for deep &amp; hard, short for a drop shot. <b>Bend your swipe</b> to curve the ball 🍌. A simple <b>tap</b> plays a safe return.</p>
    <p style="text-align:left">🚀 <b>Serve:</b> tap to toss, then swipe as the ball peaks.</p>
    <p style="text-align:left">🃏 <b>Skills</b> are one tap: some arm your next shot (💥📢🤸), some fire instantly between points. They come back after a cooldown. Passives always work.</p>
    <p style="text-align:left">🗯️ Getting heckled rattles your composure — your timing ring starts <i>lying to you</i>. Stay calm. Or smash a racket.</p>
    <p style="text-align:left">🔥 <b>Hype</b> multiplies every dollar. Show off constantly.</p>`,
    [{ label: "Got it" }]);
}

/* ---------------- Match length picker ---------------- */
export const MATCH_LENS = [
  { id: "1g",    name: "1 GAME",     sub: "Quick — a single game, you serve" },
  { id: "2g",    name: "2 GAMES",    sub: "First to 2 — one serve each" },
  { id: "set",   name: "1 SET",      sub: "First to 6 games" },
  { id: "match", name: "FULL MATCH", sub: "Best of 3 sets — the real deal" },
];
export function showMatchLen(onPick) {
  const save = App.save;
  const cur = save.settings?.matchLen || "1g";
  modal(`<h2>🎾 Match length</h2><p class="sub">How long do you want this one to be?</p>`,
    MATCH_LENS.map(l => ({
      label: `${l.id === cur ? "▶ " : ""}${l.name} <span class="btn-sub">${l.sub}</span>`,
      cls: l.id === cur ? "" : "ghost",
      fn: () => {
        if (!save.settings) save.settings = {};
        save.settings.matchLen = l.id;
        career.persist(save);
        onPick(l.id);
      },
    })));
}

/* ---------------- Cutscenes ---------------- */
const csLine = (l) => l.who
  ? `<div class="cs-line"><span class="cs-face">${l.face || "🙂"}</span><span class="cs-body"><b class="cs-who">${esc(l.who)}</b>${esc(l.txt)}</span></div>`
  : `<div class="cs-line cs-narr">${esc(l.txt)}</div>`;

// Plays a cutscene one line per tap. onDone fires on the last line or Skip.
export function showCutscene(cs, onDone) {
  if (!cs) return onDone && onDone();
  const done = () => onDone && onDone();
  const render = (i) => {
    const shown = cs.lines.slice(0, i + 1).map(csLine).join("");
    const last = i >= cs.lines.length - 1;
    modal(`<div class="cs-head"><span class="cs-bg">${cs.bg || "🎾"}</span>
        <h2 class="cs-title">${esc(cs.title)}</h2></div>
      <div class="cutscene">${shown}</div>`,
      last ? [{ label: "Continue ▶", fn: done }]
           : [{ label: "▶", fn: () => render(i + 1) },
              { label: "Skip", cls: "ghost", fn: done }]);
    const box = document.querySelector(".cutscene");
    if (box) box.scrollTop = box.scrollHeight;
  };
  render(0);
}

/* ---------------- Storybook (read the tale so far) ---------------- */
export function showStorybook(all) {
  const save = App.save;
  const upto = all || save.storyDone ? 100 : Math.min(100, save.story);
  const scene = (cs) => cs
    ? `<div class="sb-cs"><div class="sb-cs-title">${cs.bg} ${esc(cs.title)}</div>${cs.lines.map(csLine).join("")}</div>`
    : "";
  let html = `<h2>📖 The Story So Far</h2><div class="storybook">`;
  html += `<div class="sb-line sb-intro">${esc(INTRO)}</div>`;
  html += scene(CUTSCENES.start);
  for (let c = 0; c < CHAPTERS.length; c++) {
    const first = c * 10 + 1;
    if (first > upto && !all) break;
    const ch = CHAPTERS[c];
    html += `<div class="sb-ch">${ch.emo} Chapter ${c + 1}: ${esc(ch.name)}</div>`;
    for (let n = first; n < first + 10; n++) {
      if (n > upto && !all) break;
      const lv = storyLevel(n);
      html += `<div class="sb-line">${lv.isBoss ? "⚔️ " : ""}<b>${n}.</b> ${esc(lv.line)}</div>`;
      if (n < upto || all || save.storyDone) html += scene(CUTSCENES[n]);
    }
  }
  if (all || save.storyDone) {
    html += scene(CUTSCENES.end);
    html += `<div class="sb-line sb-intro">${esc(FINALE)}</div>`;
  } else {
    html += `<div class="sb-line sb-more">…to be continued. Win level ${Math.min(100, save.story)} to write the next line.</div>`;
  }
  html += `</div>`;
  modal(html, [{ label: "Close" }]);
}

/* ---------------- Story ---------------- */
export function buildStory() {
  const save = App.save;
  const s = $("scr-story");
  s.innerHTML = "";
  hdr(s, "Story", () => { buildMenu(); showScreen("menu"); });

  if (save.storyDone) {
    s.appendChild(el("div", "card", `<h3>🏆 THE END</h3><div class="sub" style="font-style:italic">${esc(FINALE)}</div>`));
    const replay = el("button", "btn", "REPLAY THE FINAL 🌕");
    replay.onclick = () => { sfx.click(); save.story = 100; career.persist(save); App.playStory(); };
    s.appendChild(replay);
    const book = el("button", "btn ghost", "📖 Read the whole story");
    book.onclick = () => { sfx.click(); showStorybook(true); };
    s.appendChild(book);
    return;
  }

  const n = Math.min(100, save.story);
  const lvl = storyLevel(n);
  const ch = CHAPTERS[lvl.chapter];

  // Progress
  const prog = el("div", "card");
  prog.innerHTML = `<div class="sub">STORY PROGRESS</div>
    <div class="story-prog"><div class="story-fill" style="width:${(n - 1)}%"></div></div>
    <div class="sub" style="margin-top:4px">Level ${n} of 100 · Chapter ${lvl.chapter + 1}: ${ch.emo} ${esc(ch.name)}</div>
    <div class="ch-dots">${CHAPTERS.map((c, i) =>
      `<span class="ch-dot ${i < lvl.chapter ? "done" : i === lvl.chapter ? "now" : ""}" title="${esc(c.name)}">${c.emo}</span>`).join("")}</div>`;
  s.appendChild(prog);

  if (n === 1) s.appendChild(el("div", "card story-card", `<div class="sub" style="font-style:italic">${esc(INTRO)}</div>`));

  // The story beat + opponent
  const beat = el("div", "card story-card");
  beat.innerHTML = `<div class="story-line">${lvl.isBoss ? "⚔️ " : ""}${esc(lvl.line)}</div>
    <div class="sub" style="margin-top:8px">📍 ${esc(lvl.venue)} · Prize ${fmtMoney(lvl.prize)}</div>`;
  s.appendChild(beat);

  const { opp } = App.peekStory();
  const starStr = "★".repeat(Math.round(opp.stars)) + "☆".repeat(Math.max(0, 5 - Math.round(opp.stars)));
  const oc = el("div", "card");
  oc.innerHTML = `<div class="sub" style="margin-bottom:8px">${lvl.isBoss ? "⚠️ CHAPTER BOSS" : "NEXT OPPONENT"}</div>
    <div class="opp-row"><div class="opp-face">${opp.face}</div>
    <div class="opp-info"><div class="nm">${esc(opp.name)}</div><div class="stars">${starStr}</div>
    <div class="bio">${esc(opp.bio)}</div></div></div>`;
  s.appendChild(oc);

  const play = el("button", "btn", lvl.isBoss ? "FIGHT THE BOSS ⚔️" : "PLAY LEVEL " + n + " 🎾");
  play.onclick = () => { sfx.click(); App.playStory(); };
  s.appendChild(play);

  const book = el("button", "btn ghost", "📖 Read the story so far");
  book.onclick = () => { sfx.click(); showStorybook(false); };
  s.appendChild(book);
}

/* ---------------- Friendly ladder (venue tour — doesn't move world rank) ---------------- */
export function buildRanked() {
  const save = App.save;
  const tier = career.currentTier(save);
  const opp = career.nextOpponent(save);
  const s = $("scr-career");
  s.innerHTML = "";
  hdr(s, "Friendly Match", () => { buildMenu(); showScreen("menu"); });

  s.appendChild(el("div", "card", `<div class="sub">Friendlies: cash and bragging rights, no ranking points — climb the world rankings in <b>Story</b> and <b>Cups</b>.</div>
    <div class="sub" style="margin-top:4px">${save.champion ? "🏆 CONQUERED EVERY VENUE" : `Record: ${save.wins}W – ${save.losses}L`}</div>`));

  const tc = el("div", "card");
  tc.innerHTML = `<h3>${esc(tier.name)} ${tier.boss ? "🤖" : ""}</h3>
    <div class="sub">📍 ${esc(tier.venue)} · Match ${Math.min(save.tierMatch + 1, tier.matches)} of ${tier.matches} · Prize ${fmtMoney(tier.prize)}</div>
    <div class="sub" style="margin-top:6px;font-style:italic">${esc(tier.flavour)}</div>`;
  s.appendChild(tc);

  const starStr = "★".repeat(Math.round(opp.stars)) + "☆".repeat(Math.max(0, 5 - Math.round(opp.stars)));
  const oc = el("div", "card");
  oc.innerHTML = `<div class="sub" style="margin-bottom:8px">NEXT OPPONENT</div>
    <div class="opp-row"><div class="opp-face">${opp.face}</div>
    <div class="opp-info"><div class="nm">${esc(opp.name)}</div><div class="stars">${starStr}</div>
    <div class="bio">${esc(opp.bio)}</div></div></div>`;
  s.appendChild(oc);

  const playBtn = el("button", "btn", save.champion ? "EXHIBITION MATCH 🎾" : "PLAY MATCH 🎾");
  playBtn.onclick = () => { sfx.click(); App.playRanked(); };
  s.appendChild(playBtn);
}

/* ---------------- Tournaments ---------------- */
export function buildTourn() {
  const save = App.save;
  const s = $("scr-tourn");
  s.innerHTML = "";
  hdr(s, "Tournaments", () => { buildMenu(); showScreen("menu"); });
  s.appendChild(el("div", "card", `<div class="sub">Knockout cups: three rounds back-to-back, entry fee up front, lose and you're OUT. Winner takes the pot (and the glory, and the kettle).</div>`));

  for (const kind of ["local", "national", "world"]) {
    const t = TOURNAMENTS[kind];
    const won = save.trophies[kind] || 0;
    const card = el("div", "card");
    card.innerHTML = `<h3>${t.emo} ${esc(t.name)} ${won ? `<span class="stars">×${won} 🏆</span>` : ""}</h3>
      <div class="sub">${esc(t.desc)}</div>
      <div class="sub" style="margin-top:6px">Entry ${fmtMoney(t.entry)} · Winner's pot ${fmtMoney(t.prize)}</div>`;
    const enter = el("button", "btn", save.money >= t.entry ? `ENTER — ${fmtMoney(t.entry)}` : `Need ${fmtMoney(t.entry)}`);
    enter.disabled = save.money < t.entry;
    enter.style.marginTop = "10px";
    enter.onclick = () => { sfx.cash(); App.playTournament(kind); };
    card.appendChild(enter);
    s.appendChild(card);
  }
}

export function showTournBracket(tstate, onPlay) {
  const t = TOURNAMENTS[tstate.kind];
  const names = ["QF", "SF", "F"];
  const rows = tstate.opps.map((o, i) => {
    const cls = i < tstate.round ? "beat" : i === tstate.round ? "next" : "";
    return `<div class="brk-row ${cls}"><span class="brk-rnd">${names[i]}</span> ${o.face} ${esc(o.name)} ${i < tstate.round ? "✅" : ""}</div>`;
  }).join("");
  modal(`<h2>${t.emo} ${esc(t.name)}</h2><div class="brk">${rows}</div>`,
    [{ label: tstate.round === 2 ? "PLAY THE FINAL 🏆" : `Play ${names[tstate.round] === "QF" ? "Quarter-Final" : "Semi-Final"} 🎾`, fn: onPlay },
     { label: "Forfeit cup", cls: "ghost", fn: () => { buildTourn(); showScreen("tourn"); } }]);
}

/* ---------------- Daily + Quick ---------------- */
function confirmDaily() {
  const save = App.save;
  const d = dailyMatch();
  const done = save.dailyWin === todayStr();
  modal(`<h2>📅 Daily Challenge</h2><div class="big-emoji">${d.mod.emo}</div>
    <p><b>${esc(d.mod.name)}</b></p><p>${esc(d.mod.desc)}</p>
    <p class="money-pop">${done ? "Already beaten today — replay for fun (small purse)." : "Win today: " + fmtMoney(d.cfg.prize)}</p>`,
    [{ label: "PLAY IT", fn: () => App.playDaily() },
     { label: "Tomorrow", cls: "ghost" }]);
}

function pickQuick() {
  const save = App.save;
  const stars = career.quickStars(save);
  if (!stars) {
    modal(`<h2>⚡ Quick Match</h2><div class="big-emoji">🔒</div>
      <p>Ray shakes his head. <i>"Exhibitions? You've barely left the pub."</i></p>
      <p>Reach <b>story level ${career.STAR_UNLOCKS[0]}</b> to unlock quick matches.</p>`,
      [{ label: "Back to the story 📖", fn: () => { buildStory(); showScreen("story"); } },
       { label: "OK", cls: "ghost" }]);
    return;
  }
  modal(`<h2>⚡ Quick Match</h2><p>Pick your poison. Tougher = richer.</p>`,
    [1, 2, 3, 4, 5].map(st => {
      const locked = st > stars;
      return {
        label: "★".repeat(st) + "☆".repeat(5 - st) +
          (locked ? ` <span class="btn-sub">🔒 Unlock: story lv${career.STAR_UNLOCKS[st - 1]}</span>` : ""),
        cls: (st > 1 ? "ghost" : "") + (locked ? " locked-btn" : ""),
        fn: () => { if (locked) { sfx.boo(); pickQuick(); } else App.playQuick(st + Math.random() * 0.4 - 0.2); },
      };
    }));
}

/* ---------------- Skills shop + loadout ---------------- */
export function buildShop() {
  const save = App.save;
  const s = $("scr-shop");
  s.innerHTML = "";
  hdr(s, "Skills", () => { buildMenu(); showScreen("menu"); });
  const gearBtn = el("button", "btn alt", "🛒 Pro Shop (rackets · shoes · outfits)");
  gearBtn.style.marginBottom = "12px";
  gearBtn.onclick = () => { sfx.click(); buildGear(); showScreen("loadout"); };
  s.appendChild(gearBtn);
  const slots = career.skillSlots(save);
  const nextSlot = career.SLOT_UNLOCKS[slots];
  s.appendChild(el("div", "card", `<div class="sub">Buy &amp; upgrade dirty tricks. You have <b>${slots} skill slot${slots > 1 ? "s" : ""}</b>${nextSlot ? ` (next at story lv${nextSlot})` : " (max)"} — tap ✔ to toggle. Passives are always on. Levels lower cooldowns and raise power.</div>`));

  for (const id of SKILL_ORDER) {
    const def = SKILLS[id];
    const lvl = save.skills[id] || 0;
    const card = el("div", "card skill-card" + (lvl ? "" : " locked"));
    const cost = upgradeCost(id, lvl);
    const equipped = save.loadout.includes(id);
    const cdStr = def.cd && def.cd[0] ? ` · ${def.cd[Math.max(0, lvl - 1)]}s cooldown` : def.uses ? ` · ${def.uses}/match` : "";
    card.innerHTML = `<div class="ico">${def.emo}</div><div class="body">
      <div class="nm">${esc(def.name)} ${def.type === "passive" ? "<span style='font-size:10px;color:#6fd3ff'>PASSIVE</span>" : ""}</div>
      <div class="desc">${esc(def.desc)}</div>
      <div class="lvl">${lvl ? `Level ${lvl}/5${cdStr}` : "LOCKED"}</div></div>`;
    const btns = el("div", null, "");
    btns.style.cssText = "display:flex;flex-direction:column;gap:6px";
    if (cost !== null) {
      const buy = el("button", "buy", lvl ? `⬆ ${fmtMoney(cost)}` : `BUY ${fmtMoney(cost)}`);
      buy.disabled = save.money < cost;
      buy.onclick = () => {
        initAudio();
        save.money -= cost;
        save.skills[id] = lvl + 1;
        if (lvl === 0 && def.type === "active" && save.loadout.length < slots) save.loadout.push(id);
        career.persist(save);
        sfx.cash();
        buildShop();
      };
      btns.appendChild(buy);
    }
    if (lvl && def.type === "active") {
      const eq = el("button", "buy" + (equipped ? " equip-on" : ""), equipped ? "✔ ON" : "EQUIP");
      eq.onclick = () => {
        if (equipped) save.loadout = save.loadout.filter(x => x !== id);
        else if (save.loadout.length < slots) save.loadout.push(id);
        else { sfx.boo(); return; }
        career.persist(save); sfx.click(); buildShop();
      };
      btns.appendChild(eq);
    }
    card.appendChild(btns);
    s.appendChild(card);
  }
}

/* ---------------- Gear shop ---------------- */
export function buildGear() {
  const save = App.save;
  const s = $("scr-loadout");
  s.innerHTML = "";
  hdr(s, "Pro Shop", () => { buildShop(); showScreen("shop"); });

  const kinds = [
    ["racket", "Rackets", "Power & control"],
    ["shoes", "Shoes", "Court speed"],
    ["outfit", "Outfits", "Hype gain (crowd loves a look)"],
  ];
  for (const [kind, title, sub] of kinds) {
    const card = el("div", "card", `<h3>${title}</h3><div class="sub">${sub}</div>`);
    const opts = el("div", "gear-opts");
    for (const g of career.gearList(kind)) {
      const owned = save.owned[kind].includes(g.id);
      const equipped = save[kind] === g.id;
      const chip = el("button", "gear-chip" + (owned ? " owned" : "") + (equipped ? " equipped" : ""),
        `${g.emo} ${esc(g.name)}${owned ? "" : " · " + fmtMoney(g.cost)}`);
      chip.onclick = () => {
        initAudio();
        if (!owned) {
          if (save.money < g.cost) { sfx.boo(); return; }
          save.money -= g.cost;
          save.owned[kind].push(g.id);
          sfx.cash();
        } else sfx.click();
        save[kind] = g.id;
        career.persist(save);
        buildGear();
      };
      opts.appendChild(chip);
    }
    card.appendChild(opts);
    s.appendChild(card);
  }
}

/* ---------------- Match HUD ---------------- */
let tickerTO = null;
export const matchHooks = {
  onHud(m) {
    const sc = scoreLine(m);
    $("sbYouName").textContent = "YOU" + (m.server === "you" ? " 🎾" : "");
    $("sbOppName").textContent = m.opp.name.split(" ")[0] + (m.server === "opp" ? " 🎾" : "");
    $("sbYouGames").textContent = sc.youSets !== undefined ? `${sc.youSets}·${sc.youGames}` : sc.youGames;
    $("sbOppGames").textContent = sc.oppSets !== undefined ? `${sc.oppSets}·${sc.oppGames}` : sc.oppGames;
    $("sbYouPts").textContent = sc.youPts; $("sbOppPts").textContent = sc.oppPts;
    $("mStam").style.width = m.stam + "%";
    $("mComp").style.width = m.comp + "%";
    $("mHype").style.width = m.hype + "%";
  },
  onTicker(str, dur = 2.4) {
    const t = $("ticker");
    t.textContent = str;
    t.classList.add("show");
    clearTimeout(tickerTO);
    tickerTO = setTimeout(() => t.classList.remove("show"), dur * 1000);
  },
  onSkillDock(m) {
    const dock = $("skillDock");
    dock.innerHTML = "";
    const slots = career.skillSlots(m.save);
    for (let i = 0; i < career.SLOT_UNLOCKS.length; i++) {
      if (i >= slots) {
        dock.appendChild(el("button", "skill-btn slot-locked",
          `<span>🔒</span><span class="sk-name">LVL ${career.SLOT_UNLOCKS[i]}</span>`));
        continue;
      }
      const id = m.save.loadout[i];
      if (!id) {
        dock.appendChild(el("button", "skill-btn slot-empty",
          `<span>＋</span><span class="sk-name">EMPTY</span>`));
        continue;
      }
      const def = SKILLS[id];
      const cooling = m.cooldowns[id] && m.time < m.cooldowns[id];
      const badge = cooling ? `<span class="sk-cost">${Math.ceil(m.cooldowns[id] - m.time)}s</span>`
        : def.uses ? `<span class="sk-cost uses">×${m.usesLeft[id] ?? def.uses}</span>` : "";
      const b = el("button", "skill-btn", `<span>${def.emo}</span><span class="sk-name">${def.name.split(" ")[0].toUpperCase()}</span>${badge}`);
      if (!canUseSkill(m, id)) b.classList.add("disabled");
      if (cooling) b.classList.add("cooling");
      if ((id === "power" && m.armedPower) || (id === "outrageous" && m.armedOutrageous) || (id === "grunt" && m.armedGrunt)) b.classList.add("power-armed");
      const useIt = (e) => { e.preventDefault(); e.stopPropagation(); initAudio(); useSkill(m, id); };
      b.addEventListener("touchstart", useIt, { passive: false });
      b.addEventListener("mousedown", useIt);
      dock.appendChild(b);
    }
    if (m.canArgue && !m.argued && m.save.loadout.includes("argue")) {
      matchHooks.onTicker("Point lost! ARGUE IT? 👨‍⚖️ (tap the skill!)", 2.5);
    }
  },
};

/* ---------------- Result modals per mode ---------------- */
const statLine = (m) =>
  `<p style="font-size:12px;opacity:.75">Winners: ${m.stats.winners} · Aces: ${m.stats.aces} · Outrageous: ${m.stats.outrageous} · Longest rally: ${m.stats.longestRally}${m.stats.topSpeed ? ` · 🚀 ${fmtSpeed(m.stats.topSpeed, App.save.settings?.units || "kph")}` : ""}</p>`;

// Story + cup wins are the only things that move the world ranking.
const rankMove = (r) => {
  if (!r || r.newRank === r.oldRank) return "";
  if (r.oldRank === null) return `<p>You are officially ranked!<br><span class="rank-big" style="font-size:26px">${fmtRank(r.newRank)}</span></p>`;
  if (r.newRank > r.oldRank) return `<p style="font-size:12px;opacity:.75">World rank slips to <b>${fmtRank(r.newRank)}</b>.</p>`;
  return `<p>World rank: <b>${fmtRank(r.oldRank)}</b> → <span class="rank-big" style="font-size:26px">${fmtRank(r.newRank)}</span> 🏅</p>`;
};

// Winning story level N takes you to N+1, which may cross an unlock threshold.
function unlockNote(level) {
  const reached = (level || 0) + 1;
  const bits = [];
  const slot = career.SLOT_UNLOCKS.indexOf(reached);
  if (slot > 0) bits.push(`🃏 <b>Skill slot ${slot + 1}</b> unlocked!`);
  const star = career.STAR_UNLOCKS.indexOf(reached);
  if (star >= 0) bits.push(`⚡ Quick Match <b>${"★".repeat(star + 1)}</b> unlocked!`);
  return bits.length ? `<p style="color:#ffd479;font-weight:800">${bits.join("<br>")}</p>` : "";
}

export function showRankedResult(m, s) {
  let html;
  if (m.won) {
    html = `<h2>${s.champion ? "EVERY VENUE CONQUERED!" : "VICTORY!"}</h2>
      <div class="big-emoji">${s.champion ? "🏆" : "🎉"}</div>
      <p>${esc(m.opp.name)} shakes your hand. A friendly — no ranking points, all bragging rights.</p>
      <p class="money-pop">+${fmtMoney(m.earnings)}</p>${statLine(m)}
      ${s.tierUp ? `<p style="color:#7ee6a1;font-weight:800">NEW VENUE: ${esc(career.currentTier(App.save).name)}!</p>` : ""}`;
  } else {
    html = `<h2>Defeat...</h2><div class="big-emoji">😩</div>
      <p>${esc(m.opp.name)} takes it. Only a friendly — your ranking never noticed.</p>
      <p class="money-pop">+${fmtMoney(m.earnings)} <span style="font-size:11px;color:#fff;opacity:.6">(appearance money)</span></p>`;
  }
  modal(html, [
    { label: "Continue", fn: () => { buildMenu(); showScreen("menu"); } },
    { label: "Spend winnings 🛒", cls: "ghost", fn: () => { buildShop(); showScreen("shop"); } },
  ]);
}

export function showStoryResult(m, ctx) {
  if (m.won && ctx.finale) {
    modal(`<h2>WORLD #1 👑</h2><div class="big-emoji">🏆</div>
      <p style="font-style:italic">${esc(FINALE)}</p>
      <p class="money-pop">+${fmtMoney(m.earnings)}</p>`,
      [{ label: "Roll credits 🎾", fn: () => { buildStory(); showScreen("story"); } }]);
    return;
  }
  if (m.won) {
    const nextLvl = storyLevel(Math.min(100, App.save.story));
    const nextCh = CHAPTERS[nextLvl.chapter];
    modal(`<h2>${ctx.wasBoss ? "CHAPTER CLEARED!" : "VICTORY!"}</h2>
      <div class="big-emoji">${ctx.wasBoss ? "⚔️" : "🎉"}</div>
      ${ctx.wasBoss ? `<p style="color:#7ee6a1;font-weight:800">${esc(CHAPTERS[Math.min(9, ctx.newChapter)].emo + " " + CHAPTERS[Math.min(9, ctx.newChapter)].name)} unlocked!</p>` : ""}
      ${unlockNote(ctx.level)}
      ${rankMove(ctx.rank)}
      <p class="money-pop">+${fmtMoney(m.earnings)}</p>${statLine(m)}
      <div class="modal-story"><div class="ms-tag">${nextCh.emo} LEVEL ${nextLvl.n}</div>
        <div class="ms-line">${nextLvl.isBoss ? "⚔️ " : ""}${esc(nextLvl.line)}</div></div>`,
      [{ label: "Continue", fn: () => { buildMenu(); showScreen("menu"); } },
       { label: "NEXT LEVEL ▶", cls: "ghost", fn: () => App.playStory() }]);
  } else {
    modal(`<h2>Defeat...</h2><div class="big-emoji">😩</div>
      <p>${esc(m.opp.name)} halts the story. For now.</p>
      ${rankMove(ctx.rank)}
      <p class="money-pop">+${fmtMoney(m.earnings)}</p>`,
      [{ label: "RETRY ⟳", fn: () => App.playStory() },
       { label: "Menu", cls: "ghost", fn: () => { buildMenu(); showScreen("menu"); } }]);
  }
}

export function showQuickResult(m) {
  modal(`<h2>${m.won ? "VICTORY!" : "Defeat..."}</h2><div class="big-emoji">${m.won ? "🎉" : "😩"}</div>
    <p class="money-pop">+${fmtMoney(m.earnings)}</p>${statLine(m)}`,
    [{ label: "Menu", fn: () => { buildMenu(); showScreen("menu"); } },
     { label: "Again!", cls: "ghost", fn: () => pickQuick() }]);
}

export function showDailyResult(m, ctx) {
  modal(`<h2>${m.won ? "CHALLENGE BEATEN!" : "Not today..."}</h2>
    <div class="big-emoji">${m.won ? "📅" : ctx.mod.emo}</div>
    ${m.won && ctx.firstToday ? `<p style="color:#7ee6a1;font-weight:800">Daily reward claimed!</p>` : ""}
    <p class="money-pop">+${fmtMoney(m.earnings)}</p>
    ${m.won ? "" : `<p style="font-size:12px;opacity:.75">The ${esc(ctx.mod.name)} wins this round. Come back tomorrow (or retry now).</p>`}`,
    [m.won ? { label: "Menu", fn: () => { buildMenu(); showScreen("menu"); } }
           : { label: "RETRY ⟳", fn: () => App.playDaily() },
     { label: m.won ? "Spend it 🛒" : "Menu", cls: "ghost", fn: () => {
       if (m.won) { buildShop(); showScreen("shop"); } else { buildMenu(); showScreen("menu"); } } }]);
}

export function showTournResult(m, ctx) {
  if (!m.won) {
    modal(`<h2>OUT OF THE CUP</h2><div class="big-emoji">🫗</div>
      <p>${esc(m.opp.name)} sends you packing in the ${ctx.roundName}. The entry fee is a fond memory.</p>
      <p class="money-pop">+${fmtMoney(m.earnings)}</p>`,
      [{ label: "Menu", fn: () => { buildMenu(); showScreen("menu"); } }]);
    return;
  }
  if (ctx.champion) {
    modal(`<h2>CUP CHAMPION! ${TOURNAMENTS[ctx.kind].emo}</h2><div class="big-emoji">🏆</div>
      <p>The ${esc(TOURNAMENTS[ctx.kind].name)} is YOURS${ctx.kind === "local" ? " — kettle and all" : ""}!</p>
      ${rankMove(ctx.rank)}
      <p class="money-pop">+${fmtMoney(m.earnings)}</p>${statLine(m)}`,
      [{ label: "GLORIOUS", fn: () => { buildMenu(); showScreen("menu"); } }]);
  } else {
    showTournBracket(ctx.tstate, () => App.playTournRound());
  }
}

export function showPause(m, onResume, onQuit) {
  modal(`<h2>Paused</h2><p>Catch your breath. The umpire certainly is.</p>`, [
    { label: "Resume", fn: onResume },
    { label: "Forfeit", cls: "danger", fn: onQuit },
  ]);
}
