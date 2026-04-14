/**
 * Unit 66 — Rags to Riches
 * Idle clicker. Starts outside (homeless). Earns income, buys upgrades,
 * eventually rents a room. Outside panorama shifts as wealth grows.
 */

// ─── Tiers ──────────────────────────────────────────────────

const TIERS = [
  { label: "Cardboard Box", threshold: 0,      scrollX: 1070, emoji: "📦", desc: "The rain started an hour ago." },
  { label: "Bicycle",       threshold: 100,    scrollX: 1650, emoji: "🚲", desc: "Faster delivery. Things are moving." },
  { label: "Used Car",      threshold: 1000,   scrollX: 1300, emoji: "🚗", desc: "The world just got bigger." },
  { label: "Luxury Car",    threshold: 10000,  scrollX: 1720, emoji: "🏎️", desc: "People look at you differently." },
  { label: "Yacht",         threshold: 100000, scrollX: 2080, emoji: "⛵", desc: "You barely remember the box." },
];

// ─── Upgrades ────────────────────────────────────────────────

const UPGRADES = [
  { id: "coffee",  emoji: "☕", label: "Buy a coffee",         cost: 10,    bonus: 0.5,  desc: "Stay awake, work longer"       },
  { id: "library", emoji: "📚", label: "Library card",         cost: 50,    bonus: 1.5,  desc: "Learn marketable skills"       },
  { id: "phone",   emoji: "📱", label: "Prepaid phone",        cost: 200,   bonus: 5,    desc: "Find gig work online"          },
  { id: "laptop",  emoji: "💻", label: "Second-hand laptop",   cost: 500,   bonus: 15,   desc: "Remote freelance work"         },
  { id: "office",  emoji: "🏢", label: "Co-working desk",      cost: 2000,  bonus: 50,   desc: "Look professional"             },
  { id: "staff",   emoji: "👔", label: "Hire an assistant",    cost: 8000,  bonus: 200,  desc: "Delegate and scale"            },
  { id: "invest",  emoji: "📈", label: "Investments",          cost: 30000, bonus: 800,  desc: "Money makes money"             },
];

// ─── Milestones ──────────────────────────────────────────────

const MILESTONES = [
  { at: 1,      text: "You earned your first dollar. It's a start." },
  { at: 10,     text: "Ten dollars. A coffee is possible." },
  { at: 100,    text: "A hundred dollars. The bike delivery job is yours." },
  { at: 500,    text: "Five hundred. Enough for first month's rent and deposit." },
  { at: 1000,   text: "A thousand dollars. Things are moving fast now." },
  { at: 10000,  text: "Ten thousand. You don't recognise yourself in the mirror." },
  { at: 100000, text: "A hundred thousand. The box is a distant memory." },
];

const RENT_COST = 500;

// ─── State ──────────────────────────────────────────────────

const SAVE_KEY = "ep_u66";

function defaultState() {
  return { income: 0, owned: [], milestonesDone: [], hasRoom: false };
}

function loadState() {
  try { return { ...defaultState(), ...JSON.parse(localStorage.getItem(SAVE_KEY) || "{}") }; }
  catch { return defaultState(); }
}

function saveState() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(s));
}

let s = loadState();
let _container = null;
let _tickId = null;

// ─── Computed Values ─────────────────────────────────────────

function incomePerSec() {
  return s.owned.reduce((sum, id) => {
    const u = UPGRADES.find(x => x.id === id);
    return sum + (u ? u.bonus : 0);
  }, 0.5); // base 0.5/s
}

function clickValue() {
  return 1 + s.owned.length * 0.5;
}

function currentTier() {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (s.income >= TIERS[i].threshold) return i;
  }
  return 0;
}

function nextTier() {
  const ci = currentTier();
  return ci < TIERS.length - 1 ? TIERS[ci + 1] : null;
}

// ─── Game Logic ──────────────────────────────────────────────

function earn(amount) {
  s.income += amount;
  checkMilestones();
  checkTierChange();
  updateDisplay();
  saveState();
}

function buyUpgrade(id) {
  const upg = UPGRADES.find(u => u.id === id);
  if (!upg || s.owned.includes(id) || s.income < upg.cost) return;
  s.income -= upg.cost;
  s.owned.push(id);
  window.EmeraldPlace?.notify(`${upg.emoji} ${upg.label} purchased!`, "unlock");
  window.EmeraldPlace?.addLog("Upgrade", `${upg.emoji} Bought: ${upg.label}. Now earning +$${incomePerSec().toFixed(1)}/s.`);
  window.EmeraldPlace?.setStat("cash", Math.round(s.income));
  checkMilestones();
  checkTierChange();
  saveState();
  rerenderUpgrades();
  updateDisplay();
}

function rentRoom() {
  if (s.income < RENT_COST || s.hasRoom) return;
  s.income -= RENT_COST;
  s.hasRoom = true;
  saveState();
  window.EmeraldPlace?.unlockRoomStart(66);
  window.EmeraldPlace?.addLog("Day 1 (home)", "You handed over the deposit. The room is yours. You stand in the doorway for a long moment.");
  window.EmeraldPlace?.notify("🏠 Welcome home.", "milestone");
  window.EmeraldPlace?.setStat("mood", 80);
  window.EmeraldPlace?.setStat("energy", 75);
  window.EmeraldPlace?.setStat("cash", Math.round(s.income));
  setTimeout(() => window.EmeraldPlace?.setView("room"), 1200);
}

function checkMilestones() {
  for (const m of MILESTONES) {
    if (!s.milestonesDone.includes(m.at) && s.income >= m.at) {
      s.milestonesDone.push(m.at);
      window.EmeraldPlace?.addLog(`$${m.at.toLocaleString()}`, m.text);
      if (m.at >= 100) window.EmeraldPlace?.notify(`$${m.at.toLocaleString()} reached!`, "milestone");
    }
  }
}

let _lastTier = -1;
function checkTierChange() {
  const ti = currentTier();
  if (ti !== _lastTier) {
    _lastTier = ti;
    const tier = TIERS[ti];
    window.EmeraldPlace?.setOutsideScroll(tier.scrollX);
    if (ti > 0) {
      window.EmeraldPlace?.notify(`${tier.emoji} ${tier.label}!`, "milestone");
    }
    // Update the tier header and emoji
    const headerEl = _container?.querySelector(".u66-tier-label");
    if (headerEl) headerEl.textContent = `${tier.emoji} ${tier.label}`;
    const descEl = _container?.querySelector(".u66-tier-desc");
    if (descEl) descEl.textContent = tier.desc;
    // Show/hide rent banner
    syncRentBanner();
    window.EmeraldPlace?.setStat("cash", Math.round(s.income));
  }
}

function syncRentBanner() {
  const banner = _container?.querySelector(".u66-rent-banner");
  if (!banner) return;
  banner.style.display = (s.income >= RENT_COST && !s.hasRoom) ? "block" : "none";
}

// ─── Display Update ──────────────────────────────────────────

function updateDisplay() {
  if (!_container) return;
  const incEl = _container.querySelector(".u66-income");
  if (incEl) incEl.textContent = fmtMoney(s.income);

  const rateEl = _container.querySelector(".u66-rate");
  if (rateEl) rateEl.textContent = `+$${incomePerSec().toFixed(1)}/s`;

  const clickEl = _container.querySelector(".u66-click-val");
  if (clickEl) clickEl.textContent = `+$${clickValue().toFixed(1)}`;

  // Progress bar to next tier
  const nt = nextTier();
  const ct = TIERS[currentTier()];
  const progEl = _container.querySelector(".u66-progress-fill");
  if (progEl && nt) {
    const pct = Math.min(100, ((s.income - ct.threshold) / (nt.threshold - ct.threshold)) * 100);
    progEl.style.width = pct + "%";
  }
  const progLblEl = _container.querySelector(".u66-progress-label");
  if (progLblEl && nt) {
    const remaining = Math.max(0, nt.threshold - s.income);
    progLblEl.textContent = `${nt.emoji} $${fmtMoney(remaining)} to go`;
  } else if (progLblEl && !nt) {
    progLblEl.textContent = "Maximum tier reached";
  }

  syncRentBanner();
  // Sync affordability highlight on upgrades
  _container.querySelectorAll(".u66-upg-row").forEach(row => {
    const id = row.dataset.id;
    const upg = UPGRADES.find(u => u.id === id);
    const btn = row.querySelector(".u66-buy-btn");
    if (!upg || !btn) return;
    const owned = s.owned.includes(id);
    const canAfford = s.income >= upg.cost;
    btn.disabled = owned || !canAfford;
    row.classList.toggle("u66-affordable", canAfford && !owned);
    row.classList.toggle("u66-owned", owned);
  });
}

function rerenderUpgrades() {
  const list = _container?.querySelector(".u66-upgrades");
  if (!list) return;
  list.innerHTML = "";
  for (const upg of UPGRADES) {
    const owned = s.owned.includes(upg.id);
    const canAfford = s.income >= upg.cost;
    const row = document.createElement("div");
    row.className = `u66-upg-row${canAfford && !owned ? " u66-affordable" : ""}${owned ? " u66-owned" : ""}`;
    row.dataset.id = upg.id;
    row.innerHTML = `
      <div class="u66-upg-info">
        <span class="u66-upg-title">${upg.emoji} ${upg.label}</span>
        <span class="u66-upg-desc">${upg.desc}</span>
      </div>
      <div class="u66-upg-right">
        <span class="u66-upg-rate">+$${upg.bonus}/s</span>
        <button class="u66-buy-btn" ${owned || !canAfford ? "disabled" : ""}>
          ${owned ? "✓" : "$" + fmtMoney(upg.cost)}
        </button>
      </div>
    `;
    if (!owned) {
      row.querySelector(".u66-buy-btn").addEventListener("click", () => buyUpgrade(upg.id));
    }
    list.appendChild(row);
  }
}

function fmtMoney(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(2) + "M";
  if (n >= 1000)    return (n / 1000).toFixed(1) + "k";
  return n.toFixed(2);
}

// ─── Render ──────────────────────────────────────────────────

export function init(container, state) {
  _container = container;
  s = loadState();
  _lastTier = currentTier(); // set to current so first checkTierChange doesn't fire redundantly

  const style = document.createElement("style");
  style.textContent = CSS;
  container.innerHTML = "";
  container.appendChild(style);

  const tier = TIERS[currentTier()];
  const nt = nextTier();

  container.insertAdjacentHTML("beforeend", `
    <div class="u66-root">
      <div class="u66-header">
        <div class="u66-tier-label">${tier.emoji} ${tier.label}</div>
        <div class="u66-income">${fmtMoney(s.income)}</div>
        <div class="u66-rate">+$${incomePerSec().toFixed(1)}/s</div>
        <div class="u66-progress-wrap">
          <div class="u66-progress-bg">
            <div class="u66-progress-fill" style="width:0%"></div>
          </div>
          <span class="u66-progress-label">${nt ? `${nt.emoji} $${fmtMoney(nt.threshold - s.income)} to go` : "Max tier"}</span>
        </div>
        <div class="u66-tier-desc">${tier.desc}</div>
      </div>

      <div class="u66-body">
        <div class="u66-section-title">UPGRADES</div>
        <div class="u66-upgrades"></div>
      </div>

      <div class="u66-rent-banner" style="display:none">
        🏠 You can afford first month's rent!
        <button class="u66-rent-btn">Move in — $${RENT_COST}</button>
      </div>

      <div class="u66-footer">
        <button class="u66-hustle-btn">
          <span>💪 HUSTLE</span>
          <span class="u66-click-val">+$${clickValue().toFixed(1)}</span>
        </button>
      </div>
    </div>
  `);

  rerenderUpgrades();
  updateDisplay();

  // HUSTLE click
  container.querySelector(".u66-hustle-btn").addEventListener("click", (e) => {
    earn(clickValue());
    // Quick visual feedback
    const btn = e.currentTarget;
    btn.classList.add("u66-hustle-pop");
    setTimeout(() => btn.classList.remove("u66-hustle-pop"), 100);
  });

  // Rent button
  container.querySelector(".u66-rent-btn").addEventListener("click", rentRoom);

  // Idle tick every 500ms
  _tickId = setInterval(() => {
    earn(incomePerSec() / 2);
  }, 500);

  // Kick off first scroll sync
  window.EmeraldPlace?.setOutsideScroll(tier.scrollX);
}

export function onExit() {
  clearInterval(_tickId);
  saveState();
}

// ─── CSS ────────────────────────────────────────────────────

const CSS = `
.u66-root {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: url('../images/unit66_bg.png') center/cover no-repeat;
  font-family: 'Courier New', Courier, monospace;
  color: #e0d8c8;
  overflow: hidden;
  position: relative;
}
.u66-root::before {
  content: "";
  position: absolute;
  inset: 0;
  background: rgba(10, 8, 0, 0.72);
  pointer-events: none;
  z-index: 0;
}
.u66-header, .u66-body, .u66-footer, .u66-rent-banner {
  position: relative;
  z-index: 1;
}

/* Header */
.u66-header {
  flex-shrink: 0;
  padding: 10px 12px 6px;
  border-bottom: 1px solid rgba(201,162,39,0.15);
  background: rgba(0,0,0,0.3);
}
.u66-tier-label {
  font-size: 0.85rem;
  color: #c9a227;
  letter-spacing: 0.08em;
  margin-bottom: 2px;
}
.u66-income {
  font-size: 1.6rem;
  color: #fff;
  letter-spacing: 0.04em;
  line-height: 1.1;
}
.u66-rate {
  font-size: 0.65rem;
  color: rgba(201,162,39,0.6);
  margin-bottom: 6px;
}
.u66-progress-wrap { margin-bottom: 4px; }
.u66-progress-bg {
  height: 3px;
  background: rgba(255,255,255,0.07);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 3px;
}
.u66-progress-fill {
  height: 100%;
  background: #c9a227;
  border-radius: 2px;
  transition: width 0.4s ease;
}
.u66-progress-label {
  font-size: 0.58rem;
  color: rgba(224,216,200,0.35);
}
.u66-tier-desc {
  font-size: 0.62rem;
  color: rgba(224,216,200,0.3);
  font-style: italic;
}

/* Body / upgrades */
.u66-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
  min-height: 0;
}
.u66-body::-webkit-scrollbar { width: 3px; }
.u66-body::-webkit-scrollbar-thumb { background: rgba(201,162,39,0.2); border-radius: 2px; }

.u66-section-title {
  font-size: 0.55rem;
  letter-spacing: 0.15em;
  color: rgba(201,162,39,0.4);
  padding: 4px 12px 6px;
  text-transform: uppercase;
}

.u66-upg-row {
  display: flex;
  align-items: center;
  padding: 7px 12px;
  gap: 8px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  opacity: 0.45;
  transition: opacity 0.2s, background 0.2s;
}
.u66-upg-row.u66-affordable { opacity: 1; }
.u66-upg-row.u66-affordable:hover { background: rgba(201,162,39,0.06); }
.u66-upg-row.u66-owned { opacity: 0.6; }

.u66-upg-info { flex: 1; min-width: 0; }
.u66-upg-title { display: block; font-size: 0.7rem; margin-bottom: 1px; }
.u66-upg-desc  { display: block; font-size: 0.58rem; color: rgba(224,216,200,0.35); }

.u66-upg-right { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; flex-shrink: 0; }
.u66-upg-rate  { font-size: 0.58rem; color: rgba(201,162,39,0.6); }

.u66-buy-btn {
  background: rgba(201,162,39,0.15);
  border: 1px solid rgba(201,162,39,0.3);
  color: #c9a227;
  font-family: inherit;
  font-size: 0.62rem;
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.u66-buy-btn:hover:not(:disabled) { background: rgba(201,162,39,0.3); border-color: #c9a227; }
.u66-buy-btn:disabled { opacity: 0.4; cursor: default; color: rgba(224,216,200,0.3); border-color: rgba(255,255,255,0.08); background: transparent; }
.u66-owned .u66-buy-btn { color: #27ae60; border-color: rgba(39,174,96,0.3); background: rgba(39,174,96,0.1); }

/* Rent banner */
.u66-rent-banner {
  flex-shrink: 0;
  margin: 0 10px 4px;
  border: 1px solid rgba(201,162,39,0.5);
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 0.7rem;
  color: #c9a227;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: rgba(201,162,39,0.05);
}
.u66-rent-btn {
  background: #c9a227;
  border: none;
  border-radius: 5px;
  color: #000;
  font-family: inherit;
  font-size: 0.65rem;
  font-weight: bold;
  padding: 4px 10px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}
.u66-rent-btn:hover { background: #e0b530; }

/* Footer / hustle */
.u66-footer {
  flex-shrink: 0;
  padding: 8px 12px;
  padding-bottom: 10px;
  border-top: 1px solid rgba(201,162,39,0.1);
  background: rgba(0,0,0,0.3);
}
.u66-hustle-btn {
  width: 100%;
  background: rgba(201,162,39,0.15);
  border: 1px solid rgba(201,162,39,0.4);
  border-radius: 8px;
  color: #c9a227;
  font-family: inherit;
  font-size: 0.9rem;
  font-weight: bold;
  letter-spacing: 0.1em;
  padding: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  transition: all 0.1s;
}
.u66-hustle-btn:hover { background: rgba(201,162,39,0.25); border-color: #c9a227; }
.u66-hustle-btn:active, .u66-hustle-pop { transform: scale(0.96); background: rgba(201,162,39,0.35); }
.u66-click-val { font-size: 0.7rem; opacity: 0.7; font-weight: normal; }
`;
