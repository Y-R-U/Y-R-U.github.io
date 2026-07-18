// All DOM UI: menus, career hub, skill shop, loadout, modals, HUD wiring.
import { el, esc, fmtMoney, fmtRank, clamp } from "./util.js";
import { TIERS } from "./const.js";
import { SKILLS, SKILL_ORDER, upgradeCost } from "./skills.js";
import * as career from "./career.js";
import { sfx, initAudio, setMuted, isMuted } from "./audio.js";
import { canUseSkill, useSkill, scoreLine } from "./match.js";

const $ = (id) => document.getElementById(id);
let App = null;   // set by main.js: { save, startMatch(), showScreen() }

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
  const row = el("div", "row");
  for (const b of buttons) {
    const btn = el("button", "btn " + (b.cls || ""), b.label);
    btn.onclick = () => { initAudio(); sfx.click(); root.innerHTML = ""; b.fn && b.fn(); };
    row.appendChild(btn);
  }
  box.appendChild(row);
  root.appendChild(box);
}

/* ---------------- Main menu ---------------- */
export function buildMenu() {
  const save = App.save;
  const s = $("scr-menu");
  s.innerHTML = "";
  s.appendChild(el("div", "title-logo",
    `<h1>RACKETEER</h1><div class="tag">Cheat your way from the car park to World&nbsp;#1 🎾</div>`));
  const stack = el("div", "menu-stack");
  const hasSave = save.wins + save.losses > 0 || save.money > 0;
  const play = el("button", "btn", hasSave ? "CONTINUE CAREER" : "START CAREER");
  play.onclick = () => { initAudio(); sfx.click(); buildCareer(); showScreen("career"); };
  stack.appendChild(play);
  if (hasSave) {
    const rk = el("div", "card", `<div class="sub">Career rank</div><div class="rank-big">${fmtRank(save.rank)}</div>
      <div class="sub">${save.wins}W – ${save.losses}L &nbsp;·&nbsp; ${fmtMoney(save.money)}${save.champion ? " · 🏆 CHAMPION" : ""}</div>`);
    stack.appendChild(rk);
    const reset = el("button", "btn ghost", "Reset career");
    reset.onclick = () => modal(`<h2>Start over?</h2><p>Your rank, cash and skills will be wiped. Gary from Accounts awaits.</p>`,
      [{ label: "Wipe it", cls: "danger", fn: () => { career.wipe(); App.save = career.load(); buildMenu(); } },
       { label: "Cancel", cls: "ghost" }]);
    stack.appendChild(reset);
  }
  const mute = el("button", "btn ghost", isMuted() ? "🔇 Sound off" : "🔊 Sound on");
  mute.onclick = () => { setMuted(!isMuted()); mute.textContent = isMuted() ? "🔇 Sound off" : "🔊 Sound on"; };
  stack.appendChild(mute);
  const how = el("button", "btn ghost", "How to play");
  how.onclick = showHelp;
  stack.appendChild(how);
  s.appendChild(stack);
}

function showHelp() {
  modal(`<h2>How to play</h2>
    <p style="text-align:left">🎾 <b>Rally:</b> your player runs automatically. <b>Touch &amp; drag</b> to aim the target ring, <b>release as the shrinking ring closes on the ball</b> — green = perfect.</p>
    <p style="text-align:left">🚀 <b>Serve:</b> tap to toss, tap again in the green zone.</p>
    <p style="text-align:left">🃏 <b>Skills:</b> buttons at the bottom cost <b style="color:#b06cff">MOJO</b> (earned by rallying &amp; winning points). Some work between points, some mid-rally. Opponents fight dirty too.</p>
    <p style="text-align:left">🔥 <b>Hype</b> multiplies every dollar you earn. Show off.</p>`,
    [{ label: "Got it" }]);
}

/* ---------------- Career hub ---------------- */
export function buildCareer() {
  const save = App.save;
  const tier = career.currentTier(save);
  const opp = career.nextOpponent(save);
  const s = $("scr-career");
  s.innerHTML = "";
  const hdr = el("div", "hdr");
  const back = el("button", "back", "←");
  back.onclick = () => { sfx.click(); buildMenu(); showScreen("menu"); };
  hdr.appendChild(back);
  hdr.appendChild(el("h2", null, "Career"));
  hdr.appendChild(el("div", "cash", fmtMoney(save.money)));
  s.appendChild(hdr);

  s.appendChild(el("div", "card", `<div class="sub">World ranking</div><div class="rank-big">${fmtRank(save.rank)}</div>
    <div class="sub">${save.champion ? "🏆 UNDISPUTED CHAMPION OF EVERYTHING" : `${save.wins}W – ${save.losses}L`}</div>`));

  const tc = el("div", "card");
  tc.innerHTML = `<h3>${esc(tier.name)} ${tier.boss ? "🤖" : ""}</h3>
    <div class="sub">📍 ${esc(tier.venue)} · Match ${Math.min(save.tierMatch + 1, tier.matches)} of ${tier.matches} · First to ${tier.games} game${tier.games > 1 ? "s" : ""} · Prize ${fmtMoney(tier.prize)}</div>
    <div class="sub" style="margin-top:6px;font-style:italic">${esc(tier.flavour)}</div>`;
  s.appendChild(tc);

  const oc = el("div", "card");
  const starStr = "★".repeat(Math.round(opp.stars)) + "☆".repeat(Math.max(0, 5 - Math.round(opp.stars)));
  oc.innerHTML = `<div class="sub" style="margin-bottom:8px">NEXT OPPONENT</div>
    <div class="opp-row"><div class="opp-face">${opp.face}</div>
    <div class="opp-info"><div class="nm">${esc(opp.name)}</div><div class="stars">${starStr}</div>
    <div class="bio">${esc(opp.bio)}</div></div></div>`;
  s.appendChild(oc);

  const playBtn = el("button", "btn", save.champion ? "EXHIBITION MATCH 🎾" : "PLAY MATCH 🎾");
  playBtn.onclick = () => { sfx.click(); App.startMatch(); };
  s.appendChild(playBtn);
  s.appendChild(el("div", null, "<div style='height:10px'></div>"));
  const lo = el("button", "btn alt", `Skills &amp; Loadout (${save.loadout.length}/4 equipped)`);
  lo.onclick = () => { sfx.click(); buildShop(); showScreen("shop"); };
  s.appendChild(lo);
  s.appendChild(el("div", null, "<div style='height:10px'></div>"));
  const gear = el("button", "btn alt", "Pro Shop 🛒");
  gear.onclick = () => { sfx.click(); buildGear(); showScreen("loadout"); };
  s.appendChild(gear);
}

/* ---------------- Skills shop + loadout ---------------- */
export function buildShop() {
  const save = App.save;
  const s = $("scr-shop");
  s.innerHTML = "";
  const hdr = el("div", "hdr");
  const back = el("button", "back", "←");
  back.onclick = () => { sfx.click(); buildCareer(); showScreen("career"); };
  hdr.appendChild(back);
  hdr.appendChild(el("h2", null, "Skills"));
  hdr.appendChild(el("div", "cash", fmtMoney(save.money)));
  s.appendChild(hdr);
  s.appendChild(el("div", "card", `<div class="sub">Buy &amp; upgrade dirty tricks. Equip up to <b>4 active skills</b> — tap ✔ to toggle. Passives are always on.</div>`));

  for (const id of SKILL_ORDER) {
    const def = SKILLS[id];
    const lvl = save.skills[id] || 0;
    const card = el("div", "card skill-card" + (lvl ? "" : " locked"));
    const cost = upgradeCost(id, lvl);
    const equipped = save.loadout.includes(id);
    card.innerHTML = `<div class="ico">${def.emo}</div><div class="body">
      <div class="nm">${esc(def.name)} ${def.type === "passive" ? "<span style='font-size:10px;color:#6fd3ff'>PASSIVE</span>" : ""}</div>
      <div class="desc">${esc(def.desc)}</div>
      <div class="lvl">${lvl ? `Level ${lvl}/5` : "LOCKED"}${def.mojo && lvl ? ` · ${def.mojo} mojo` : ""}</div></div>`;
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
  const hdr = el("div", "hdr");
  const back = el("button", "back", "←");
  back.onclick = () => { sfx.click(); buildCareer(); showScreen("career"); };
  hdr.appendChild(back);
  hdr.appendChild(el("h2", null, "Pro Shop"));
  hdr.appendChild(el("div", "cash", fmtMoney(save.money)));
  s.appendChild(hdr);

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
    $("mMojo").style.width = m.mojo + "%";
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
      const b = el("button", "skill-btn", `<span>${def.emo}</span><span class="sk-name">${def.name.split(" ")[0].toUpperCase()}</span>` +
        (def.mojo ? `<span class="sk-cost">${def.mojo}</span>` : ""));
      const usable = canUseSkill(m, id);
      if (!usable) b.classList.add("disabled");
      if (m.cooldowns[id] && m.time < m.cooldowns[id]) b.classList.add("cooling");
      if ((id === "power" && m.armedPower) || (id === "outrageous" && m.armedOutrageous)) b.classList.add("power-armed");
      const useIt = (e) => { e.preventDefault(); e.stopPropagation(); initAudio(); useSkill(m, id); };
      b.addEventListener("touchstart", useIt, { passive: false });
      b.addEventListener("mousedown", useIt);
      dock.appendChild(b);
    }
    // Argue prompt appears contextually even if it's in loadout — flash it
    if (m.canArgue && !m.argued && m.save.loadout.includes("argue")) {
      matchHooks.onTicker("Point lost! ARGUE IT? 👨‍⚖️ (tap the skill!)", 2.5);
    }
  },
};

/* ---------------- Match-over modal ---------------- */
export function showMatchResult(m, summary) {
  const save = App.save;
  const s = summary;
  let html;
  if (m.won) {
    let rankLine;
    if (s.firstRank) rankLine = `You are now officially ranked!<br><span class="rank-big">#1,000,000</span><br><span style="font-size:11px;opacity:.7">(There are 999,999 better players. For now.)</span>`;
    else if (s.champion) rankLine = `<span class="rank-big">WORLD #1 🏆</span><br>THE BALL MACHINE HAS BEEN UNPLUGGED.`;
    else rankLine = `Rank: <b>${fmtRank(s.oldRank)}</b> → <span class="rank-big" style="font-size:26px">${fmtRank(s.newRank)}</span>`;
    html = `<h2>${s.champion ? "CHAMPION!!!" : "VICTORY!"}</h2>
      <div class="big-emoji">${s.champion ? "🏆" : "🎉"}</div>
      <p>${rankLine}</p>
      <p class="money-pop">+${fmtMoney(m.earnings)}</p>
      <p style="font-size:12px;opacity:.75">Winners: ${m.stats.winners} · Aces: ${m.stats.aces} · Outrageous: ${m.stats.outrageous} · Longest rally: ${m.stats.longestRally}</p>
      ${s.tierUp ? `<p style="color:#7ee6a1;font-weight:800">PROMOTED: ${esc(career.currentTier(save).name)}!</p>` : ""}`;
  } else {
    html = `<h2>Defeat...</h2><div class="big-emoji">😩</div>
      <p>${esc(m.opp.name)} takes it. The crowd files out quietly.</p>
      <p class="money-pop">+${fmtMoney(m.earnings)} <span style="font-size:11px;color:#fff;opacity:.6">(appearance money)</span></p>
      <p style="font-size:12px;opacity:.75">Rank slips to <b>${fmtRank(s.newRank)}</b>. Gary would be disappointed.</p>`;
  }
  modal(html, [
    { label: s.champion ? "Bask in glory" : "Continue", fn: () => { buildCareer(); showScreen("career"); } },
    { label: "Spend winnings 🛒", cls: "ghost", fn: () => { buildShop(); showScreen("shop"); } },
  ]);
}

export function showPause(m, onResume, onQuit) {
  modal(`<h2>Paused</h2><p>Catch your breath. The umpire certainly is.</p>`, [
    { label: "Resume", fn: onResume },
    { label: "Forfeit", cls: "danger", fn: onQuit },
  ]);
}
