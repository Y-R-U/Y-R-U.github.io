// All DOM UI: menus, mode screens, skill shop, loadout, modals, HUD wiring.
import { el, esc, fmtMoney, fmtRank } from "./util.js";
import { SKILLS, SKILL_ORDER, upgradeCost } from "./skills.js";
import * as career from "./career.js";
import { sfx, initAudio, setMuted, isMuted } from "./audio.js";
import { canUseSkill, useSkill, scoreLine } from "./match.js";
import { CHAPTERS, INTRO, FINALE, storyLevel } from "./story.js";
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
  s.appendChild(el("div", "title-logo",
    `<h1>RACKETEER</h1><div class="tag">Cheat your way from the car park to World&nbsp;#1 🎾</div>`));
  const stack = el("div", "menu-stack");

  const story = el("button", "btn", save.storyDone
    ? "📖 STORY — COMPLETE 🏆"
    : `📖 STORY MODE <span class="btn-sub">Level ${Math.min(100, save.story)}/100</span>`);
  story.onclick = () => { go(buildStory, "story"); };
  stack.appendChild(story);

  const ranked = el("button", "btn alt", `🏅 RANKED CAREER <span class="btn-sub">${fmtRank(save.rank)}</span>`);
  ranked.onclick = () => { go(buildRanked, "career"); };
  stack.appendChild(ranked);

  const tourn = el("button", "btn alt", `🏆 TOURNAMENTS <span class="btn-sub">${save.trophies.local + save.trophies.national + save.trophies.world} trophies</span>`);
  tourn.onclick = () => { go(buildTourn, "tourn"); };
  stack.appendChild(tourn);

  const dailyDone = save.dailyWin === todayStr();
  const daily = el("button", "btn alt", dailyDone
    ? `📅 DAILY CHALLENGE <span class="btn-sub">✅ beaten today</span>`
    : `📅 DAILY CHALLENGE <span class="btn-sub">${dailyMatch().mod.emo} ${esc(dailyMatch().mod.name)}</span>`);
  daily.onclick = () => { initAudio(); sfx.click(); confirmDaily(); };
  stack.appendChild(daily);

  const quick = el("button", "btn alt", "⚡ QUICK MATCH");
  quick.onclick = () => { initAudio(); sfx.click(); pickQuick(); };
  stack.appendChild(quick);

  stack.appendChild(el("div", null, "<div style='height:4px'></div>"));
  const shop = el("button", "btn ghost", `🃏 Skills &amp; Loadout · 🛒 Pro Shop`);
  shop.onclick = () => { go(buildShop, "shop"); };
  stack.appendChild(shop);

  const foot = el("div", "menu-foot");
  const mute = el("button", "chip-btn", isMuted() ? "🔇" : "🔊");
  mute.onclick = () => { setMuted(!isMuted()); mute.textContent = isMuted() ? "🔇" : "🔊"; };
  const how = el("button", "chip-btn", "❓ How to play");
  how.onclick = showHelp;
  const reset = el("button", "chip-btn", "🗑️ Reset");
  reset.onclick = () => modal(`<h2>Start over?</h2><p>Everything — story, rank, cash, skills, trophies — wiped. Gary awaits.</p>`,
    [{ label: "Wipe it", cls: "danger", fn: () => { career.wipe(); App.save = career.load(); buildMenu(); } },
     { label: "Cancel", cls: "ghost" }]);
  foot.append(mute, how, reset);
  stack.appendChild(foot);
  s.appendChild(stack);

  function go(builder, screen) { initAudio(); sfx.click(); builder(); showScreen(screen); }
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
    <div class="sub" style="margin-top:8px">📍 ${esc(lvl.venue)} · First to ${lvl.games} game${lvl.games > 1 ? "s" : ""} · Prize ${fmtMoney(lvl.prize)}</div>`;
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
}

/* ---------------- Ranked (the original career ladder) ---------------- */
export function buildRanked() {
  const save = App.save;
  const tier = career.currentTier(save);
  const opp = career.nextOpponent(save);
  const s = $("scr-career");
  s.innerHTML = "";
  hdr(s, "Ranked", () => { buildMenu(); showScreen("menu"); });

  s.appendChild(el("div", "card", `<div class="sub">World ranking</div><div class="rank-big">${fmtRank(save.rank)}</div>
    <div class="sub">${save.champion ? "🏆 UNDISPUTED CHAMPION OF EVERYTHING" : `${save.wins}W – ${save.losses}L`}</div>`));

  const tc = el("div", "card");
  tc.innerHTML = `<h3>${esc(tier.name)} ${tier.boss ? "🤖" : ""}</h3>
    <div class="sub">📍 ${esc(tier.venue)} · Match ${Math.min(save.tierMatch + 1, tier.matches)} of ${tier.matches} · First to ${tier.games} game${tier.games > 1 ? "s" : ""} · Prize ${fmtMoney(tier.prize)}</div>
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
  modal(`<h2>⚡ Quick Match</h2><p>Pick your poison. Tougher = richer.</p>`,
    [1, 2, 3, 4, 5].map(st => ({
      label: "★".repeat(st) + "☆".repeat(5 - st),
      cls: st > 1 ? "ghost" : "",
      fn: () => App.playQuick(st + Math.random() * 0.4 - 0.2),
    })));
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
  s.appendChild(el("div", "card", `<div class="sub">Buy &amp; upgrade dirty tricks. Equip up to <b>4 active skills</b> — tap ✔ to toggle. Passives are always on. Levels lower cooldowns and raise power.</div>`));

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
        if (lvl === 0 && def.type === "active" && save.loadout.length < 4) save.loadout.push(id);
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
        else if (save.loadout.length < 4) save.loadout.push(id);
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
    $("sbYouGames").textContent = sc.youGames; $("sbOppGames").textContent = sc.oppGames;
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
    for (const id of m.save.loadout) {
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
  `<p style="font-size:12px;opacity:.75">Winners: ${m.stats.winners} · Aces: ${m.stats.aces} · Outrageous: ${m.stats.outrageous} · Longest rally: ${m.stats.longestRally}</p>`;

export function showRankedResult(m, s) {
  let html;
  if (m.won) {
    let rankLine;
    if (s.firstRank) rankLine = `You are now officially ranked!<br><span class="rank-big">#1,000,000</span><br><span style="font-size:11px;opacity:.7">(There are 999,999 better players. For now.)</span>`;
    else if (s.champion) rankLine = `<span class="rank-big">WORLD #1 🏆</span><br>THE BALL MACHINE HAS BEEN UNPLUGGED.`;
    else rankLine = `Rank: <b>${fmtRank(s.oldRank)}</b> → <span class="rank-big" style="font-size:26px">${fmtRank(s.newRank)}</span>`;
    html = `<h2>${s.champion ? "CHAMPION!!!" : "VICTORY!"}</h2>
      <div class="big-emoji">${s.champion ? "🏆" : "🎉"}</div>
      <p>${rankLine}</p>
      <p class="money-pop">+${fmtMoney(m.earnings)}</p>${statLine(m)}
      ${s.tierUp ? `<p style="color:#7ee6a1;font-weight:800">PROMOTED: ${esc(career.currentTier(App.save).name)}!</p>` : ""}`;
  } else {
    html = `<h2>Defeat...</h2><div class="big-emoji">😩</div>
      <p>${esc(m.opp.name)} takes it. The crowd files out quietly.</p>
      <p class="money-pop">+${fmtMoney(m.earnings)} <span style="font-size:11px;color:#fff;opacity:.6">(appearance money)</span></p>
      <p style="font-size:12px;opacity:.75">Rank slips to <b>${fmtRank(s.newRank)}</b>.</p>`;
  }
  modal(html, [
    { label: "Continue", fn: () => { buildRanked(); showScreen("career"); } },
    { label: "Spend winnings 🛒", cls: "ghost", fn: () => { buildShop(); showScreen("shop"); } },
  ]);
}

export function showStoryResult(m, ctx) {
  if (m.won && ctx.finale) {
    modal(`<h2>WORLD #1 🌕</h2><div class="big-emoji">🏆</div>
      <p style="font-style:italic">${esc(FINALE)}</p>
      <p class="money-pop">+${fmtMoney(m.earnings)}</p>`,
      [{ label: "Roll credits 🎾", fn: () => { buildStory(); showScreen("story"); } }]);
    return;
  }
  if (m.won) {
    const nextLvl = storyLevel(Math.min(100, App.save.story));
    modal(`<h2>${ctx.wasBoss ? "CHAPTER CLEARED!" : "VICTORY!"}</h2>
      <div class="big-emoji">${ctx.wasBoss ? "⚔️" : "🎉"}</div>
      ${ctx.wasBoss ? `<p style="color:#7ee6a1;font-weight:800">${esc(CHAPTERS[Math.min(9, ctx.newChapter)].emo + " " + CHAPTERS[Math.min(9, ctx.newChapter)].name)} unlocked!</p>` : ""}
      <p class="money-pop">+${fmtMoney(m.earnings)}</p>${statLine(m)}
      <p style="font-size:12px;font-style:italic;opacity:.85">Next: ${esc(nextLvl.line)}</p>`,
      [{ label: "NEXT LEVEL ▶", fn: () => App.playStory() },
       { label: "Story map", cls: "ghost", fn: () => { buildStory(); showScreen("story"); } }]);
  } else {
    modal(`<h2>Defeat...</h2><div class="big-emoji">😩</div>
      <p>${esc(m.opp.name)} halts the story. For now.</p>
      <p class="money-pop">+${fmtMoney(m.earnings)}</p>`,
      [{ label: "RETRY ⟳", fn: () => App.playStory() },
       { label: "Story map", cls: "ghost", fn: () => { buildStory(); showScreen("story"); } }]);
  }
}

export function showQuickResult(m) {
  modal(`<h2>${m.won ? "VICTORY!" : "Defeat..."}</h2><div class="big-emoji">${m.won ? "🎉" : "😩"}</div>
    <p class="money-pop">+${fmtMoney(m.earnings)}</p>${statLine(m)}`,
    [{ label: "Again!", fn: () => pickQuick() },
     { label: "Menu", cls: "ghost", fn: () => { buildMenu(); showScreen("menu"); } }]);
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
      [{ label: "Tournaments", fn: () => { buildTourn(); showScreen("tourn"); } }]);
    return;
  }
  if (ctx.champion) {
    modal(`<h2>CUP CHAMPION! ${TOURNAMENTS[ctx.kind].emo}</h2><div class="big-emoji">🏆</div>
      <p>The ${esc(TOURNAMENTS[ctx.kind].name)} is YOURS${ctx.kind === "local" ? " — kettle and all" : ""}!</p>
      <p class="money-pop">+${fmtMoney(m.earnings)}</p>${statLine(m)}`,
      [{ label: "GLORIOUS", fn: () => { buildTourn(); showScreen("tourn"); } }]);
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
