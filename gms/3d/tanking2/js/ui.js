import { SPECIES, ABILITIES, MODES, RELICS, compatibility } from "./data.js";
const $ = (id) => document.getElementById(id),
  esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    ),
  fmt = (v) => Math.floor(Number(v) || 0).toLocaleString();
const icons = {
  feed: '<path d="M6 15c3-5 8-5 11-1l4-3v8l-4-3c-4 4-8 4-11-1Z"/><path d="M6 3v4m5-3v3m5-5v4"/>',
  fish: '<path d="M2 12c5-8 12-8 16-2l4-4v12l-4-4c-5 6-12 5-16-2Z"/><circle cx="7" cy="11" r=".7"/>',
  care: '<path d="M12 3C9 8 5 11 5 15a7 7 0 0 0 14 0c0-4-4-7-7-12Z"/><path d="M8 15c0 3 2 4 4 4"/>',
  journal:
    '<path d="M4 4h13a3 3 0 0 1 3 3v14H7a3 3 0 0 1-3-3V4Zm3 0v17m3-12h7m-7 4h5"/>',
  adventures:
    '<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6 6-2Z"/>',
  photo:
    '<path d="M3 7h5l2-3h4l2 3h5v13H3V7Z"/><circle cx="12" cy="13" r="4"/>',
};
const svg = (id) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[id] || icons.fish}</svg>`;
let artId = 0;
export function fishArt(s) {
  const id = "f" + ++artId,
    color = typeof s.color === "string" ? s.color : "#c87545",
    isBetta = s.id === "betta",
    angel = /angel|discus/.test(s.id),
    shrimp = /shrimp/.test(s.id),
    snail = /snail|nerite/.test(s.id),
    gold = /gold|clown/.test(s.id);
  return `<svg class="specimen-art" viewBox="0 0 120 72" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0.4" y2="1"><stop stop-color="${esc(color)}"/><stop offset=".5" stop-color="${isBetta ? "#c98553" : gold ? "#eaad53" : "#79a5a2"}"/><stop offset="1" stop-color="${isBetta ? "#344f68" : "#4a7069"}"/></linearGradient></defs>${snail ? `<path d="M24 52q30-15 58 0l16 3H22Z" fill="#849072"/><circle cx="58" cy="36" r="21" fill="#b6955f"/><path d="M56 52c-25-6-15-39 5-33 20 7 12 27-1 24-10-2-8-15 0-13" fill="none" stroke="#63593c" stroke-width="3"/>` : shrimp ? `<path d="M26 36Q45 15 71 32l18 14-13 10-6-18Q42 31 26 36Z" fill="#b97563"/><path d="m32 37 13 14m-1-17 12 19m0-18 9 16M30 32 12 13m20 19L10 25m33 15-4 18" fill="none" stroke="#c89379" stroke-width="1.5"/>` : `<path d="M76 34Q93 ${isBetta ? "0" : "18"} 109 17Q101 37 112 59Q89 ${isBetta ? "72" : "55"} 75 44" fill="url(#${id})" opacity=".8"/><path d="M47 29Q55 ${angel ? "-1" : "7"} 76 17l-6 17M43 45Q60 ${angel ? "78" : "63"} 79 53L68 40" fill="url(#${id})" opacity=".65"/><path d="M15 37C28 ${angel ? "2" : "14"} 64 ${angel ? "1" : "20"} 82 35L82 42C55 ${angel ? "78" : "59"} 27 ${angel ? "70" : "55"} 15 37Z" fill="url(#${id})"/><path d="M38 26q-9 11 0 21" fill="none" stroke="#f0d8a055"/><path d="m42 35 13 12-3-16Z" fill="#b9ccaf55"/>${/neon|cardinal/.test(s.id) ? '<path d="m24 35 46 1" stroke="#8dddcc" stroke-width="3"/><path d="m48 42 28-1" stroke="#bf755a" stroke-width="4"/>' : ""}${s.id === "clown" ? '<path d="m35 26-2 23m25-23-1 24m15-18-1 12" stroke="#f2ecda" stroke-width="6"/>' : ""}<circle cx="25" cy="34" r="3.8" fill="#d9d6a2"/><circle cx="25" cy="34" r="2.5" fill="#263632"/><circle cx="24.2" cy="33.2" r=".7" fill="#fff"/>${isBetta ? '<path d="M83 34 103 24m-19 14 19 1m-20 4 19 12M63 22l2-7m-8 8v-7m-5 10-2-8" stroke="#e6bb7855" stroke-width=".7"/>' : ""}`}</svg>`;
}
const chapterCopy = [
  [
    "A little life.",
    "A whole world.",
    "Every beautiful aquarium begins with one small inhabitant. This one begins with you.",
  ],
  [
    "Another tank.",
    "A new beginning.",
    "Your first little world is still living, still earning. Now give a new school somewhere to belong.",
  ],
  [
    "Plant something.",
    "Watch it grow.",
    "A little green does a lot of good. Roots make cleaner water, and a quieter place to call home.",
  ],
  [
    "Better together.",
    "Different by nature.",
    "A beautiful tank has more than one rhythm. Find a neighbour who brings something of their own.",
  ],
  [
    "A little help.",
    "Room to wander.",
    "Give the everyday care a helping hand. Your tanks can thrive while you follow your curiosity.",
  ],
  [
    "Follow a current.",
    "Bring something back.",
    "Try a short expedition. Your collection keeps growing at home, and every journey leaves a gift.",
  ],
  [
    "A different blue.",
    "A whole new world.",
    "Your first reef is ready. Find a small, bright partnership among its branching corals.",
  ],
  [
    "Find the balance.",
    "Let it settle.",
    "Give this new ecosystem a moment. A healthy reef is a living thing built from little kindnesses.",
  ],
  [
    "A second chance.",
    "In capable hands.",
    "Some worlds need a little help finding their balance. Bring one back from the edge.",
  ],
  [
    "Let them see.",
    "What you have grown.",
    "Open the doors for a little celebration. Keep your guests delighted and your fish comfortable.",
  ],
  [
    "More little lives.",
    "A brighter future.",
    "A safe home can become a nursery. Give the next generation a gentle beginning.",
  ],
  [
    "A shared current.",
    "A different day.",
    "One daily challenge, the same starting point for everyone. See what your care can make of it.",
  ],
  [
    "Keep a little world.",
    "Grow something wonderful.",
    "You began with one fish. Everything here grew from that first small kindness.",
  ],
];
export class AquariumUI {
  constructor(game, scene, audio) {
    this.game = game;
    this.scene = scene;
    this.audio = audio;
    this.panel = null;
    this.followId = null;
    this.photo = false;
    this.night = false;
    this.lastPanelKey = "";
    this.lastRail = "";
    this.lastDock = "";
    this.lastChoice = "";
    this.lastMission = "";
    this.bind();
    this.render(true);
  }
  bind() {
    $("missionAction").onclick = () => {
      const m = this.game.state.mission;
      if (m.action === "wait") return;
      this.action(m.action, {
        species: m.species,
        id: m.upgrade || m.mode,
        theme: m.theme,
        mission: true,
      });
    };
    $("soundButton").onclick = async () => {
      const enabled = await this.audio.toggle();
      $("soundButton").setAttribute(
        "aria-label",
        enabled ? "Turn ambient sound off" : "Turn ambient sound on",
      );
      $("soundButton").title = enabled
        ? "Turn ambient sound off"
        : "Turn ambient sound on";
      $("soundButton").innerHTML = enabled
        ? '<svg viewBox="0 0 24 24"><path d="M10 5 5 9H2v6h3l5 4V5Zm5 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>'
        : '<svg viewBox="0 0 24 24"><path d="M10 5 5 9H2v6h3l5 4V5Zm5 4 6 6m0-6-6 6"/></svg>';
    };
    $("settingsButton").onclick = () => this.open("settings");
    $("closeDrawer").onclick = () => this.close();
    $("drawerBackdrop").onclick = () => this.close();
    $("unfollow").onclick = () => this.follow(null);
    $("rehomeFish").onclick = () => {
      if (this.followId && this.action("rehome", { uid: this.followId }))
        this.follow(null);
    };
    $("dock").onclick = (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.action) this.action(b.dataset.action);
      else if (b.dataset.panel) this.open(b.dataset.panel);
    };
    $("tankRail").onclick = (e) => {
      const b = e.target.closest("[data-tank]");
      if (b) {
        this.close();
        this.follow(null);
        this.action("selectTank", { index: Number(b.dataset.tank) });
      }
    };
    $("drawerBody").onclick = (e) => {
      const b = e.target.closest("button");
      if (!b || b.disabled) return;
      if (b.dataset.buy) this.action("buy", { species: b.dataset.buy });
      if (b.dataset.action)
        this.action(b.dataset.action, {
          id: b.dataset.id,
          theme: b.dataset.theme,
        });
      if (b.dataset.mode) {
        this.close();
        this.action("startMode", { id: b.dataset.mode });
      }
      if (b.dataset.draft) this.action("draft", { species: b.dataset.draft });
      if (b.dataset.speed)
        this.action("setSpeed", { speed: Number(b.dataset.speed) });
      if (b.dataset.follow) {
        this.close();
        this.follow(b.dataset.follow);
      }
      if (b.dataset.photo) this.enterPhoto();
      if (b.dataset.export) this.exportSave();
      if (b.dataset.import) $("importSave").click();
      if (b.dataset.reset) {
        this.showReport(
          "Begin a new collection?",
          '<p>This replaces the Tanking 2 collection saved on this device. Export a backup first if you would like to keep it.</p><button class="small-primary" id="confirmReset">Start again with one fish</button>',
        );
        $("confirmReset").onclick = () => {
          this.action("reset");
          $("reportDialog").close();
          this.close();
        };
      }
    };
    $("drawerBody").onchange = (e) => {
      if (e.target.id === "importSave") this.importSave(e.target.files[0]);
    };
    $("choiceCards").onclick = (e) => {
      const b = e.target.closest("[data-choice]");
      if (b) {
        this.action("choose", { id: b.dataset.choice });
        if (!this.game.state.choices?.length) $("choiceDialog").close();
      }
    };
    $("choiceDialog").addEventListener("cancel", (e) => e.preventDefault());
    $("reportClose").onclick = () => {
      $("reportDialog").close();
      if (this.reportAction) {
        const next = this.reportAction;
        this.reportAction = null;
        next();
      } else this.game.act("acknowledgeOffline");
    };
    $("modeBanner").onclick = (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.draft) this.action("draft", { species: b.dataset.draft });
      if (b.dataset.action) this.action(b.dataset.action);
    };
    $("photoNight").onclick = () => {
      this.night = !this.night;
      this.scene.setNight(this.night);
      $("photoNight").textContent = this.night ? "Daylight" : "Moonlight";
    };
    $("takePhoto").onclick = () => {
      const url = this.scene.capture();
      if (url) {
        const a = document.createElement("a");
        a.href = url;
        a.download = `tanking-2-${new Date().toISOString().slice(0, 10)}.png`;
        a.click();
      }
    };
    $("exitPhoto").onclick = () => this.exitPhoto();
    document.addEventListener("keydown", (e) => {
      if (e.key === "Tab" && this.panel) {
        const buttons = [
            ...$("drawer").querySelectorAll(
              "button:not(:disabled),input:not([hidden])",
            ),
          ].filter((el) => el.offsetParent !== null),
          first = buttons[0],
          last = buttons.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
      if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === "Escape") {
        if (this.photo) this.exitPhoto();
        else if (this.panel) this.close();
        else this.follow(null);
      }
      if (
        e.key.toLowerCase() === "f" &&
        this.has("feed") &&
        !this.panel &&
        !document.querySelector("dialog[open]")
      )
        this.action("feed");
      if (
        e.code === "Space" &&
        this.has("speed") &&
        !this.panel &&
        !document.querySelector("dialog[open]")
      ) {
        e.preventDefault();
        this.action("setSpeed", { speed: this.game.state.speed === 0 ? 1 : 0 });
      }
    });
  }
  has(id) {
    return this.game.state.abilities.includes(id);
  }
  get tank() {
    return this.game.state.tanks[this.game.state.activeTank];
  }
  get wallet() {
    return this.game.state.mode && this.tank.temporary
      ? this.game.state.mode
      : this.game.state;
  }
  price(action, payload = {}) {
    return this.game.quote(action, payload);
  }
  action(type, payload = {}) {
    const result = this.game.act(type, payload);
    if (!result?.ok) {
      this.toast(
        result?.reason || "Give this little world a moment.",
        "warning",
      );
      return false;
    }
    if (
      type === "claim" ||
      type === "newTank" ||
      type === "startMode" ||
      type === "endMode"
    ) {
      this.follow(null);
      this.close();
    }
    this.lastPanelKey = "";
    this.render(true);
    window.dispatchEvent(new Event("tanking2-save"));
    return true;
  }
  render(force = false) {
    const s = this.game.state,
      t = this.tank;
    if (!t) return;
    document.body.classList.toggle("has-mode", !!s.mode);
    $("mission").hidden = !!s.mode;
    const m = s.mission || {},
      early = s.chapter === 0,
      fish = t.fish || [];
    document.body.classList.toggle(
      "has-tanks",
      s.tanks.filter((t) => !t.temporary).length > 1,
    );
    const dock =
      this.has("care") || this.has("collection") || this.has("plant");
    document.body.classList.toggle("has-dock", dock);
    $("coins").textContent = fmt(this.wallet.coins);
    const inc = s.tanks
      .filter((t) => !t.temporary)
      .reduce((a, t) => a + (t.income || 0), 0);
    $("income").textContent =
      inc > 0 ? `+${Math.round(inc * 60)} / min` : "A SMALL BEGINNING";
    $("pearlBalance").hidden = !s.pearls;
    $("pearls").textContent = fmt(s.pearls);
    $("settingsButton").hidden = s.chapter < 1;
    $("tankVitals").hidden = early;
    $("healthLabel").textContent =
      t.health >= 85
        ? "Thriving"
        : t.health >= 65
          ? "Finding balance"
          : "Needs your care";
    $("healthLabel").style.color = t.health < 65 ? "#e5ad85" : "";
    $("tankIncome").textContent = `+${Math.round((t.income || 0) * 60)} / min`;
    $("worldCaption").textContent =
      `${t.name.toUpperCase()} / ${t.theme === "reef" ? "SALTWATER REEF" : t.theme === "moon" ? "MOONLIT GARDEN" : "PLANTED FRESHWATER"}`;
    const copy = chapterCopy[Math.min(s.chapter, chapterCopy.length - 1)];
    $("chapterLabel").textContent =
      `${String(s.chapter + 1).padStart(2, "0")} / ${early ? "A FIRST RIPPLE" : s.mode ? "AN EXCURSION" : t.name.toUpperCase()}`;
    const intro =
      early && fish.length
        ? [
            "Hello,",
            "little one.",
            "A new home is a big adventure. A tiny meal will help your betta settle in.",
          ]
        : copy;
    $("sceneTitle").innerHTML =
      esc(intro[0]) + "<br><em>" + esc(intro[1]) + "</em>";
    $("sceneCopy").textContent = intro[2];
    $("chapterProgress").hidden = early;
    $("chapterProgressBar").style.width =
      Math.min(100, (s.chapter / 12) * 100) + "%";
    $("missionSeal").textContent = String(s.chapter + 1).padStart(2, "0");
    $("missionKicker").textContent = m.complete
      ? "A LITTLE WORLD, A LITTLE BIGGER"
      : early
        ? "YOUR FIRST SMALL STEP"
        : s.mode
          ? "YOUR JOURNEY CONTINUES"
          : "ONE SMALL THING";
    $("missionTitle").textContent = m.title || "Keep growing";
    $("missionText").textContent = m.text || "";
    $("missionAction").textContent = m.label || "Continue";
    if (
      ["buy", "plant", "upgrade", "clean", "newTank"].includes(m.action) &&
      m.tankIndex === s.activeTank
    )
      $("missionAction").textContent = $("missionAction").textContent.replace(
        / · \d+$/,
        " · " +
          this.price(m.action, { species: m.species, id: m.upgrade }) +
          " ◈",
      );
    $("missionAction").disabled = m.action === "wait";
    $("missionTrack").hidden = !(
      m.target > 1 &&
      m.progress >= 0 &&
      !m.complete
    );
    $("missionTrackBar").style.width =
      Math.min(100, (100 * (m.progress || 0)) / (m.target || 1)) + "%";
    const rail = s.tanks
      .map(
        (tank, i) =>
          `<button data-tank="${i}" ${s.mode && !tank.temporary ? "disabled" : ""} class="${i === s.activeTank ? "active" : ""}" aria-label="Visit ${esc(tank.name)}" aria-current="${i === s.activeTank ? "true" : "false"}"><span class="tank-number">${String(i + 1).padStart(2, "0")}</span>${esc(tank.name)}<span class="tank-status" style="background:${tank.health < 65 ? "#dcaa82" : "#c6dfa7"}"></span></button>`,
      )
      .join("");
    $("tankRail").hidden = s.tanks.length < 2;
    if (rail !== this.lastRail) {
      $("tankRail").innerHTML = rail;
      this.lastRail = rail;
    }
    const buttons = [
      { id: "feed", action: "feed", label: "Feed", show: this.has("feed") },
      {
        id: "fish",
        panel: "species",
        label: "Fish",
        show: this.has("collection"),
      },
      {
        id: "care",
        panel: "care",
        label: "Care",
        show: this.has("care") || this.has("plant"),
      },
      {
        id: "journal",
        panel: "journal",
        label: "Journal",
        show: this.has("collection"),
      },
      {
        id: "adventures",
        panel: "adventures",
        label: "Explore",
        show: this.has("adventures"),
      },
    ].filter((b) => b.show);
    const dockHTML = buttons
      .map(
        (b) =>
          `<button ${b.action ? `data-action="${b.action}"` : `data-panel="${b.panel}"`} class="${this.panel === b.panel ? "active" : ""}" aria-label="${b.label}">${svg(b.id)}<span class="dock-label">${b.label}</span></button>`,
      )
      .join("");
    $("dock").hidden = !dock;
    if (dockHTML !== this.lastDock) {
      $("dock").innerHTML = dockHTML;
      this.lastDock = dockHTML;
    }
    if (this.panel) this.renderPanel(force);
    this.renderChoices();
    this.renderMode();
    if (this.followId) {
      const f = fish.find((f) => String(f.uid) === String(this.followId));
      $("rehomeFish").hidden = !this.has("collection");
      if (!f) this.follow(null);
      else
        $("followDetail").textContent =
          `${Math.round(f.health)}% health · ${f.hunger > 55 ? "Ready for a little meal" : "Settled into their little world"}`;
    }
  }
  renderChoices() {
    const choices = this.game.state.choices || [];
    if (!choices.length) {
      if ($("choiceDialog").open) $("choiceDialog").close();
      return;
    }
    const key = JSON.stringify(choices);
    if (key !== this.lastChoice) {
      $("choiceCards").innerHTML = choices
        .map((entry, i) => {
          const id = typeof entry === "string" ? entry : entry.id,
            r = RELICS[id] || entry;
          return `<button class="choice-card" data-choice="${esc(id)}"><span class="relic-icon">${["❧", "◌", "✧"][i]}</span><strong>${esc(r.name)}</strong><p>${esc(r.description)}</p><span class="choose-label">CARRY THIS WITH YOU ↗</span></button>`;
        })
        .join("");
      this.lastChoice = key;
    }
    if (!$("choiceDialog").open && !$("reportDialog").open)
      $("choiceDialog").showModal();
  }
  renderMode() {
    const m = this.game.state.mode;
    $("modeBanner").hidden = !m;
    if (!m) return;
    const remain = Math.max(0, Math.ceil((m.duration || 0) - (m.time || 0)));
    let html = `<span class="eyebrow">${m.id === "zen" ? "TIME TO SIMPLY BE" : "AN EXCURSION"}</span><h3>${esc(m.title || MODES[m.id]?.name)}</h3><p>${m.duration ? `${Math.floor(remain / 60)}:${String(remain % 60).padStart(2, "0")} remaining · ` : ""}${m.progress != null ? `${Math.floor(m.progress)} / ${m.target || "—"}` : ""}</p>`;
    if (m.choices?.length)
      html +=
        "<p>Choose who joins this journey.</p>" +
        m.choices
          .map(
            (id) =>
              `<button data-draft="${id}">${esc(SPECIES[id]?.name || id)} ↗</button>`,
          )
          .join(" ");
    else
      html += `<p>${esc(m.complete ? "A journey well cared for." : m.failed ? "A little wiser for the next journey." : MODES[m.id]?.description || "Your home tanks keep growing.")}</p>`;
    html += `<button data-action="endMode">${m.complete ? "Bring your rewards home" : m.failed ? "Return home" : "Return to your gallery"} ↗</button>`;
    if ($("modeBanner").innerHTML !== html) $("modeBanner").innerHTML = html;
  }
  open(panel) {
    if (this.panel === panel) {
      this.close();
      return;
    }
    this.returnFocus = document.activeElement;
    this.returnPanel = document.activeElement?.dataset.panel;
    this.returnId = document.activeElement?.id;
    this.panel = panel;
    this.lastPanelKey = "";
    $("drawer").hidden = false;
    $("drawerBackdrop").hidden = false;
    this.renderPanel(true);
    this.render();
    $("closeDrawer").focus();
  }
  close() {
    if (this.panel) {
      const target = this.returnFocus?.isConnected
        ? this.returnFocus
        : this.returnPanel
          ? document.querySelector(`[data-panel="${this.returnPanel}"]`)
          : this.returnId
            ? document.getElementById(this.returnId)
            : null;
      target?.focus({ preventScroll: true });
    }
    this.panel = null;
    $("drawer").hidden = true;
    $("drawerBackdrop").hidden = true;
    this.lastPanelKey = "";
  }
  renderPanel(force) {
    const s = this.game.state,
      t = this.tank;
    let key = JSON.stringify([
      this.panel,
      s.chapter,
      Math.floor(this.wallet.coins),
      s.unlockedSpecies,
      s.abilities,
      s.relics,
      t.id,
      t.fish.map((f) => [f.uid, f.species]),
      t.plants,
      t.filter,
      t.autofeeder,
      s.speed,
      Math.floor(t.health),
      Math.floor(t.ammonia * 10),
      Math.floor(t.food),
      s.mode?.round,
    ]);
    if (key === this.lastPanelKey && !force) return;
    this.lastPanelKey = key;
    const titles = {
      species: ["A LITTLE MORE LIFE", "Find a new neighbour"],
      care: ["SMALL KINDNESSES", "Care for this world"],
      journal: ["YOUR GROWING COLLECTION", "A keeper’s journal"],
      adventures: ["FOLLOW YOUR CURIOSITY", "Beyond the glass"],
      settings: ["AT YOUR OWN PACE", "A quiet moment"],
    };
    const title = titles[this.panel];
    $("drawerKicker").textContent = title[0];
    $("drawerTitle").textContent = title[1];
    let html = "";
    if (this.panel === "species") html = this.speciesPanel();
    if (this.panel === "care") html = this.carePanel();
    if (this.panel === "journal") html = this.journalPanel();
    if (this.panel === "adventures") html = this.adventuresPanel();
    if (this.panel === "settings") html = this.settingsPanel();
    const top = $("drawerBody").scrollTop,
      focusIndex = [
        ...$("drawerBody").querySelectorAll("button,input"),
      ].indexOf(document.activeElement);
    $("drawerBody").innerHTML = html;
    if (focusIndex >= 0)
      $("drawerBody")
        .querySelectorAll("button,input")
        [focusIndex]?.focus({ preventScroll: true });
    $("drawerBody").scrollTop = top;
  }
  speciesPanel() {
    const s = this.game.state,
      t = this.tank;
    const ids = s.mode?.id === "zen" ? Object.keys(SPECIES) : s.unlockedSpecies;
    let html = `<p>Every new neighbour changes the balance. Schooling fish arrive together, so nobody has to be brave alone.</p>`;
    for (const id of ids) {
      const f = SPECIES[id],
        c = compatibility(s, id, t),
        owned = t.fish.filter((f) => f.species === id).length;
      html += `<article class="specimen"><div class="specimen-head">${fishArt(f)}<div><h3>${esc(f.name)}</h3><p class="latin">${esc(f.latin || "")}</p></div></div><p>${esc(f.description)}</p><div class="traits"><span>${f.water === "salt" ? "Saltwater" : "Freshwater"}</span><span>${esc(f.temperament)}</span><span>${esc(f.zone)}</span><span>${esc(f.size)} cm</span></div><div class="compatibility ${c.level}">${esc(c.reason)}</div><div class="buy-row"><span>${owned ? `${owned} living here` : `${f.count > 1 ? "A school of " + f.count : "One little life"}`}</span><button class="small-primary" data-buy="${id}" ${c.level === "red" || this.wallet.coins < this.price("buy", { species: id }) ? "disabled" : ""}>${f.count > 1 ? "Add school" : "Bring home"} · ${this.price("buy", { species: id })} ◈</button></div></article>`;
    }
    const next = Object.values(SPECIES).find((f) => !ids.includes(f.id));
    if (next)
      html += `<div class="locked-specimen"><span class="lock-mark">◇</span><div><strong>There are more little lives to meet.</strong><small>Continue your chapter to discover your next species.</small></div></div>`;
    return html;
  }
  carePanel() {
    const t = this.tank;
    let html = `<p>Good care is a rhythm, not a race. All your tanks keep living and earning while you’re here.${t.caretaker ? " Your first fish has a keeper who quietly handles its meals." : ""}</p><div class="care-readouts"><div class="readout ${t.health < 65 ? "bad" : ""}"><span>ECOSYSTEM</span><strong>${Math.round(t.health)}% healthy</strong></div><div class="readout"><span>WATER</span><strong>${Number(t.temp).toFixed(1)}°C</strong></div><div class="readout ${t.oxygen < 5 ? "bad" : ""}"><span>OXYGEN</span><strong>${Number(t.oxygen).toFixed(1)} mg/L</strong></div><div class="readout ${t.ammonia > 0.4 ? "bad" : ""}"><span>AMMONIA</span><strong>${Number(t.ammonia).toFixed(2)} ppm</strong></div></div>`;
    const action = (
      label,
      desc,
      act,
      price,
      id = "",
      symbol = "✧",
      disabled = false,
    ) =>
      `<button class="care-action" data-action="${act}" data-id="${id}" ${disabled ? "disabled" : ""}><span class="action-icon">${symbol}</span><div><strong>${label}</strong><small>${desc}</small></div><span class="price">${price}</span></button>`;
    html += action(
      "A tiny meal",
      "A little goes a long way.",
      "feed",
      "Free",
      "",
      "·",
    );
    if (this.has("targetFeed"))
      html += action(
        "Patient feeding",
        "A careful meal for slower seahorses.",
        "targetFeed",
        "Free",
        "",
        "·",
      );
    if (this.has("plant"))
      html += action(
        "Plant a little garden",
        `${t.plants} planted clusters · cleaner water & shelter`,
        "plant",
        this.price("plant") + " ◈",
        "",
        "❧",
      );
    if (this.has("clean"))
      html += action(
        "Freshen the water",
        "A gentle water change reduces waste and toxins.",
        "clean",
        this.price("clean") ? this.price("clean") + " ◈" : "Free",
        "",
        "◒",
      );
    for (const [id, name, desc, price, symbol] of [
      [
        "filter",
        "Improve the filter",
        "Helps your helpful bacteria keep up.",
        65,
        "≋",
      ],
      [
        "autofeeder",
        "A helping hand",
        "Tiny meals, automatically. Your fish stay fed.",
        100,
        "◷",
      ],
      [
        "anemone",
        "An anemone home",
        "A soft refuge for your clownfish.",
        65,
        "✺",
      ],
      ["skimmer", "Protein skimmer", "A cleaner, more stable reef.", 100, "♧"],
      ["uv", "UV sterilizer", "Keeps disease and algae in check.", 140, "☼"],
      [
        "chiller",
        "Precision chiller",
        "Stable temperatures, even during events.",
        120,
        "❄",
      ],
      [
        "lighting",
        "A little more light",
        "Brighter plants and more delighted visitors.",
        125,
        "☼",
      ],
    ])
      if (this.has(id)) {
        const installed = id === "filter" ? t.filter >= 5 : !!t[id];
        html += action(
          name,
          desc,
          "upgrade",
          installed ? "Installed" : this.price("upgrade", { id }) + " ◈",
          id,
          symbol,
          installed,
        );
      }
    if (this.has("release"))
      html += action(
        "Release young fish",
        `${t.young || 0} young ready for a new beginning.`,
        "release",
        "Reputation",
        "",
        "↗",
        !(t.young > 0),
      );
    html += `<p class="muted-note" style="margin-top:20px">Nitrite ${Number(t.nitrite).toFixed(2)} ppm · Nitrate ${Number(t.nitrate).toFixed(1)} ppm · pH ${Number(t.ph).toFixed(1)}<br>Care is compressed for play. Your gallery gets a caretaker while you’re away.</p>`;
    return html;
  }
  journalPanel() {
    const s = this.game.state;
    let html = `<div class="collection-stats"><div><strong>${s.unlockedSpecies.length}</strong><span>SPECIES FOUND</span></div><div><strong>${s.tanks.filter((t) => !t.temporary).length}</strong><span>LIVING WORLDS</span></div><div><strong>${s.relics.length}</strong><span>KEEPSAKES</span></div></div><p>Small beginnings become something worth keeping. Your discoveries and keepsakes belong to the whole collection.</p>`;
    if (s.chapter >= 6)
      html += `<button class="care-action" data-action="keepsake" ${s.pearls < 20 ? "disabled" : ""}><span class="action-icon">✧</span><div><strong>A new keepsake</strong><small>Spend your adventure pearls. Choose a permanent gift.</small></div><span class="price">20 ◌</span></button>`;
    if (s.relics.length) {
      html += '<div class="section-label">Things you carry with you</div>';
      for (const entry of s.relics) {
        const r = RELICS[typeof entry === "string" ? entry : entry.id] || entry;
        html += `<article class="entry"><h3>❧ ${esc(r.name)}</h3><p>${esc(r.description)}</p></article>`;
      }
    }
    html +=
      '<div class="section-label">Lives in this tank <span>Tap to follow</span></div>';
    for (const f of this.tank.fish) {
      const sp = SPECIES[f.species];
      html += `<button class="care-action" data-follow="${esc(f.uid)}">${fishArt(sp)}<div><strong>${esc(sp.name)}</strong><small>${Math.round(f.health)}% health · ${f.hunger > 55 ? "Ready for a meal" : "Settled and swimming"}</small></div><span class="price">↗</span></button>`;
    }
    if (s.discoveries?.length) {
      html += '<div class="section-label">Field notes</div>';
      for (const d of s.discoveries)
        html += `<article class="entry"><p>${esc(typeof d === "string" ? d : d.text || d.description)}</p></article>`;
    }
    if (s.modeHistory?.length) {
      html += '<div class="section-label">Stories brought home</div>';
      for (const run of s.modeHistory.slice(-3).reverse())
        html += `<article class="entry"><span class="eyebrow">${run.success ? "A JOURNEY WELL CARED FOR" : "A LITTLE WISER"}</span><h3>${esc(MODES[run.id]?.name || run.id)}</h3><p>${run.score ? fmt(run.score.total) + " points · " : ""}${esc(run.date || "")}</p></article>`;
    }
    html += `<div class="section-label">Your story so far</div><div class="entry"><p>${fmt(s.stats.feeds)} little meals · ${fmt(s.stats.visitors)} visitors<br>${fmt(s.stats.earned)} coins earned · ${Math.floor(s.time / 60)} minutes of growing</p></div>`;
    if (this.has("newTank") && s.tanks.length < 6)
      html += `<button class="care-action" data-action="newTank" data-theme="forest"><span class="action-icon">＋</span><div><strong>Room for another world</strong><small>A freshwater garden joins your gallery.</small></div><span class="price">${this.price("newTank")} ◈</span></button>`;
    if (
      this.has("newTank") &&
      s.unlockedSpecies.includes("clownfish") &&
      s.tanks.length < 6
    )
      html += `<button class="care-action" data-action="newTank" data-theme="reef"><span class="action-icon">＋</span><div><strong>Another shade of blue</strong><small>A separate reef for new personalities.</small></div><span class="price">${this.price("newTank")} ◈</span></button>`;
    return html;
  }
  adventuresPanel() {
    const s = this.game.state;
    let html =
      "<p>Little journeys with something to bring home. Your gallery keeps living while you explore, and returning never removes your home tanks.</p>";
    let shownLocked = false;
    for (const [id, m] of Object.entries(MODES)) {
      const open = s.modes.includes(id);
      if (!open && shownLocked) continue;
      if (!open) shownLocked = true;
      html += `<article class="mode-card ${open ? "" : "locked"}"><span class="eyebrow">${open ? "READY WHEN YOU ARE" : "A FUTURE DISCOVERY"}</span><h3>${esc(m.name)}</h3><p>${esc(m.description)}</p>${open ? `<button class="small-primary" data-mode="${id}" ${s.mode ? "disabled" : ""}>${id === "zen" ? "Take a quiet moment" : "Follow this current"} <span>↗</span></button>` : "<p>Keep growing through your chapters to open this journey.</p>"}</article>`;
    }
    return html;
  }
  settingsPanel() {
    const s = this.game.state;
    let html =
      "<p>Take this world at your own pace. Your collection saves automatically on this device.</p>";
    if (this.has("speed"))
      html +=
        '<div class="section-label">The pace of things</div><div class="settings-row">' +
        [
          [0, "Pause"],
          [1, "1×"],
          [3, "3×"],
        ]
          .map(
            ([v, l]) =>
              `<button data-speed="${v}" class="${s.speed === v ? "selected" : ""}">${l}</button>`,
          )
          .join("") +
        "</div>";
    if (this.has("photo"))
      html +=
        '<button class="care-action" data-photo="true"><span class="action-icon">◎</span><div><strong>Keep a moment</strong><small>A quiet camera, moonlight, and a photograph to save.</small></div><span class="price">↗</span></button>';
    html +=
      '<button class="care-action" data-export="true"><span class="action-icon">↓</span><div><strong>Save a backup</strong><small>Take a copy of your collection with you.</small></div></button><button class="care-action" data-import="true"><span class="action-icon">↑</span><div><strong>Restore a backup</strong><small>Replace this collection with a saved one.</small></div></button><input type="file" id="importSave" accept=".json,application/json" hidden><p class="muted-note" style="margin-top:24px">Away time: up to eight hours of earnings, with a caretaker keeping your gallery safe. No purchases or online account.<br><br>Drag to orbit · tap a fish to follow · F to feed · Space to pause once unlocked.</p><button class="text-button" data-reset="true" style="color:#8e927e;margin-top:25px">Begin a new collection…</button>';
    return html;
  }
  follow(uid) {
    this.followId = uid;
    this.scene.follow(uid);
    $("followCard").hidden = !uid;
    if (uid) {
      const f = this.tank.fish.find((f) => String(f.uid) === String(uid));
      if (f)
        $("followName").textContent =
          SPECIES[f.species]?.name || "A little life";
      this.render();
    }
  }
  toast(text, type = "") {
    if (!text) return;
    const el = document.createElement("div");
    el.className = "toast " + type;
    el.textContent = text;
    $("toasts").append(el);
    while ($("toasts").children.length > 3) $("toasts").firstChild.remove();
    setTimeout(() => {
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 500);
    }, 5200);
  }
  processEvents() {
    const events = this.game.drainEvents();
    let rewardSound = false;
    const unlocked = [];
    for (const e of events) {
      if (e.type === "splash") {
        this.scene.splash();
        this.audio.splash();
      } else if (e.type === "feed") {
        this.scene.feed();
        this.audio.feed();
      } else if (e.type === "reward") {
        rewardSound = true;
        this.toast(e.text, "reward");
      } else if (e.type === "unlock") {
        rewardSound = true;
        if (e.kind) unlocked.push(e.text);
        else this.toast(e.text, "reward");
      } else if (e.type === "warning") this.toast(e.text, "warning");
      else if (e.type === "modeEnd") {
        const score = e.score || {};
        this.showReport(
          e.success ? "A journey worth keeping." : "Every current teaches.",
          `<p>${esc(e.text)}</p>${[
            ["Ecosystem health", score.health],
            ["Visitors welcomed", score.visitors],
            ["Variety of life", score.diversity],
            ["Thoughtful care", score.care],
            ["Your total", score.total],
          ]
            .map(
              ([k, v]) =>
                `<div class="report-row"><span>${k}</span><strong>${fmt(v)}</strong></div>`,
            )
            .join(
              "",
            )}<p class="muted-note" style="margin-top:18px">${e.id === "daily" ? "Shared daily seed: " + esc(score.seed) : "Your gallery has kept earning throughout this journey."}</p>`,
          () => this.action("endMode"),
          "Bring this story home ↗",
        );
        rewardSound = !!e.success;
      } else if (e.type === "offline") {
        const o = this.game.state.offline || e;
        this.showReport(
          "Welcome back, keeper.",
          `<p>A caretaker kept your worlds comfortable while you were away. Your little collection has been quietly growing.</p><div class="report-row"><span>Coins earned while away</span><strong>+${fmt(o.coins || o.earned || e.coins)} ◈</strong></div>`,
        );
      } else if (e.text) this.toast(e.text);
    }
    if (unlocked.length)
      this.toast("Discovered: " + unlocked.join(" · "), "reward");
    if (rewardSound) this.audio.reward();
  }
  showReport(
    title,
    body,
    onClose = null,
    label = "Lovely. Let’s keep growing",
  ) {
    this.reportAction = onClose;
    $("reportClose").textContent = label;
    $("reportTitle").textContent = title;
    $("reportBody").innerHTML = body;
    if (!$("reportDialog").open) $("reportDialog").showModal();
  }
  enterPhoto() {
    if (!this.has("photo")) return;
    this.close();
    this.photo = true;
    $("interface").hidden = true;
    $("photoBar").hidden = false;
    document.body.classList.add("photo-mode");
    this.scene.setPhoto(true);
  }
  exitPhoto() {
    this.photo = false;
    $("interface").hidden = false;
    $("photoBar").hidden = true;
    document.body.classList.remove("photo-mode");
    this.scene.setPhoto(false);
    this.scene.setNight(null);
    this.night = false;
    $("photoNight").textContent = "Moonlight";
  }
  exportSave() {
    const blob = new Blob(
        [
          JSON.stringify(
            { format: "tanking2", save: this.game.save() },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "tanking-2-collection.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  async importSave(file) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (
        data.format !== "tanking2" ||
        data.save?.version !== 2 ||
        !Array.isArray(data.save.tanks) ||
        !data.save.tanks.length
      )
        throw Error("Choose a Tanking 2 collection backup.");
      window.dispatchEvent(
        new CustomEvent("tanking2-import", { detail: data.save }),
      );
    } catch (e) {
      this.toast(e.message, "warning");
    }
  }
}
