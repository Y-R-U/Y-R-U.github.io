/**
 * Unit 66 — Rags to Riches
 *
 * Starts in "outside / window zoomed" mode — player is in a cardboard box
 * on the street. Idle clicker on laptop screen drives income.
 * Outside view reflects wealth progression:
 *   box → bicycle → car → luxury car → yacht
 *
 * Outside scroll offset also moves right as wealth increases,
 * revealing the harbour / luxury section of outside.svg.
 *
 * TODO:
 *   - Idle clicker engine (income/sec, upgrades, milestones)
 *   - Wealth tier thresholds → trigger EmeraldPlace.setOutsideScroll(x)
 *   - Unlock "rent a room" event → switches from window-start to room-start
 *   - Sound fx: coin clink, milestone fanfare
 */

const TIERS = [
  { label: "Cardboard Box",  threshold: 0,      scrollX: 1070, emoji: "📦" },
  { label: "Bicycle",        threshold: 100,    scrollX: 1650, emoji: "🚲" },
  { label: "Used Car",       threshold: 1000,   scrollX: 1300, emoji: "🚗" },
  { label: "Luxury Car",     threshold: 10000,  scrollX: 1720, emoji: "🏎️" },
  { label: "Yacht",          threshold: 100000, scrollX: 2080, emoji: "⛵" },
];

let income = 0;
let incomePerSec = 0.5;
let tier = 0;
let intervalId = null;

export function init(container, state) {
  income = Number(localStorage.getItem("ep_u66_income") || "0");
  tier   = Number(localStorage.getItem("ep_u66_tier")   || "0");

  render(container, state);
  intervalId = setInterval(() => tick(container, state), 1000);
}

function tick(container, state) {
  income += incomePerSec;
  localStorage.setItem("ep_u66_income", String(income));
  checkTier(state);
  updateDisplay(container);
}

function checkTier(state) {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (income >= TIERS[i].threshold && tier < i) {
      tier = i;
      localStorage.setItem("ep_u66_tier", String(tier));
      // Shift outside panorama to reflect wealth
      const unit = window.EmeraldPlace?.getUnit?.();
      if (unit) unit.outsideScrollX = TIERS[tier].scrollX;
      // Unlock room rental at bicycle tier
      if (tier >= 1) {
        const ep = window.EmeraldPlace;
        if (ep && ep.getState().view === "window") {
          showRentRoomPrompt(ep);
        }
      }
    }
  }
}

function showRentRoomPrompt(ep) {
  const banner = document.getElementById("u66-rent-banner");
  if (banner) banner.style.display = "block";
}

function updateDisplay(container) {
  const el = container.querySelector("#u66-income");
  if (el) el.textContent = `$${income.toFixed(2)}`;
  const tierEl = container.querySelector("#u66-tier");
  if (tierEl) tierEl.textContent = `${TIERS[tier].emoji} ${TIERS[tier].label}`;
}

function render(container, state) {
  const current = TIERS[tier];
  container.innerHTML = `
    <div style="
      height:100%;
      background: linear-gradient(135deg, #0a0a0a 0%, #1a1200 100%);
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      gap:12px;
      font-family:'Courier New',monospace;
      color:#e0d8c8;
      padding:20px;
    ">
      <div style="font-size:2.5rem" id="u66-tier-icon">${current.emoji}</div>
      <h2 style="letter-spacing:0.1em;color:#c9a227">Unit 66</h2>
      <div id="u66-tier" style="font-size:0.9rem;color:#c9a227">${current.emoji} ${current.label}</div>
      <div style="font-size:1.4rem;color:#fff" id="u66-income">$${income.toFixed(2)}</div>
      <div style="color:rgba(255,255,255,0.4);font-size:0.7rem">+$${incomePerSec}/sec (idle)</div>

      <button id="u66-click-btn" style="
        margin-top:8px;
        background:#c9a227;
        border:none;
        border-radius:6px;
        padding:8px 24px;
        font-family:inherit;
        font-size:0.9rem;
        cursor:pointer;
        color:#000;
        font-weight:bold;
      ">HUSTLE (+$1)</button>

      <div id="u66-rent-banner" style="
        display:${tier >= 1 ? 'block' : 'none'};
        margin-top:8px;
        border:1px solid #c9a227;
        border-radius:6px;
        padding:8px 16px;
        font-size:0.75rem;
        color:#c9a227;
        text-align:center;
        cursor:pointer;
      ">🏠 You can afford a room! [click to move in]</div>
    </div>
  `;

  container.querySelector("#u66-click-btn").addEventListener("click", () => {
    income += 1;
    checkTier(state);
    updateDisplay(container);
  });

  container.querySelector("#u66-rent-banner")?.addEventListener("click", () => {
    // Transition: leave window view, arrive in room view
    window.EmeraldPlace?.setView("room");
  });
}

export function onExit() {
  clearInterval(intervalId);
  localStorage.setItem("ep_u66_income", String(income));
}
