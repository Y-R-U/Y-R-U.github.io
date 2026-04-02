/**
 * Unit (other floor) — Bird Photography
 *
 * Look out the window and photograph birds for rare bird magazines.
 * Score based on: bird rarity, zoom/framing (how centred + zoomed the bird is).
 *
 * TODO:
 *   - Bird sprite system (common → rare, animated flight paths)
 *   - Camera viewfinder overlay on window view
 *   - Framing score: distance from bird to centre of frame + size
 *   - Rare bird triggers: date-based (migration seasons), easter egg cross-unit birds
 *   - Magazine submission mechanic → earn score/money
 *   - Binoculars upgrade: increases zoom multiplier
 */

const BIRDS = [
  { id: "sparrow",     rarity: 1,  points: 10,  emoji: "🐦", label: "House Sparrow"   },
  { id: "pigeon",      rarity: 1,  points: 8,   emoji: "🕊", label: "Feral Pigeon"    },
  { id: "crow",        rarity: 2,  points: 20,  emoji: "🐦‍⬛", label: "Crow"           },
  { id: "parrot",      rarity: 3,  points: 50,  emoji: "🦜", label: "Rainbow Lorikeet"},
  { id: "heron",       rarity: 4,  points: 120, emoji: "🦢", label: "White Heron"     },
  { id: "eagle",       rarity: 5,  points: 300, emoji: "🦅", label: "Wedge-tail Eagle"},
  { id: "rare_cross",  rarity: 6,  points: 999, emoji: "✨", label: "???"             }, // Easter egg: cross-unit bird
];

let score = 0;
let photos = [];
let activeBird = null;
let spawnTimer = null;

export function init(container, state) {
  score = Number(localStorage.getItem("ep_birds_score") || "0");
  render(container, state);
  scheduleNextBird(container);
}

function scheduleNextBird(container) {
  const delay = 2000 + Math.random() * 4000;
  spawnTimer = setTimeout(() => {
    spawnBird(container);
    scheduleNextBird(container);
  }, delay);
}

function spawnBird(container) {
  const roll = Math.random();
  // Weighted rarity
  let bird;
  if (roll < 0.40) bird = BIRDS[0];       // sparrow
  else if (roll < 0.65) bird = BIRDS[1];  // pigeon
  else if (roll < 0.80) bird = BIRDS[2];  // crow
  else if (roll < 0.92) bird = BIRDS[3];  // parrot
  else if (roll < 0.97) bird = BIRDS[4];  // heron
  else if (roll < 0.995) bird = BIRDS[5]; // eagle
  else bird = BIRDS[6];                   // rare cross-unit easter egg

  activeBird = bird;
  const birdEl = container.querySelector("#active-bird");
  if (birdEl) {
    birdEl.textContent = bird.emoji;
    birdEl.style.opacity = "1";
    birdEl.style.left = (10 + Math.random() * 70) + "%";
    birdEl.style.top  = (10 + Math.random() * 50) + "%";
    setTimeout(() => { if (birdEl) birdEl.style.opacity = "0"; activeBird = null; }, 3000);
  }
}

function render(container, state) {
  container.innerHTML = `
    <div style="
      height:100%;
      background:linear-gradient(to bottom, #2e6da4 0%, #87ceeb 70%, #4a7c59 100%);
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      gap:12px;
      font-family:'Courier New',monospace;
      color:#1a1a1a;
      padding:20px;
      position:relative;
      overflow:hidden;
    ">
      <!-- Viewfinder overlay -->
      <div style="
        position:absolute;inset:0;
        border:40px solid rgba(0,0,0,0.4);
        box-shadow:inset 0 0 0 2px rgba(255,255,255,0.3);
        pointer-events:none;
      "></div>
      <!-- Crosshair -->
      <div style="
        position:absolute;
        top:50%;left:50%;
        width:30px;height:30px;
        transform:translate(-50%,-50%);
        border:2px solid rgba(255,255,255,0.6);
        border-radius:50%;
        pointer-events:none;
      "></div>

      <!-- Bird spawn area -->
      <div id="active-bird" style="
        position:absolute;
        font-size:2rem;
        opacity:0;
        transition:opacity 0.3s;
        cursor:crosshair;
        user-select:none;
      ">🐦</div>

      <!-- Score HUD -->
      <div style="
        position:absolute;top:12px;left:12px;
        background:rgba(0,0,0,0.5);
        color:#fff;
        padding:4px 10px;
        border-radius:4px;
        font-size:0.75rem;
      ">📷 Score: <span id="bird-score">${score}</span></div>

      <!-- Stub note -->
      <div style="
        position:absolute;bottom:16px;
        background:rgba(0,0,0,0.5);
        color:rgba(255,255,255,0.6);
        padding:6px 16px;
        border-radius:4px;
        font-size:0.7rem;
        text-align:center;
      ">
        Bird photography &mdash; stub<br>
        Click a bird to photograph it!
      </div>
    </div>
  `;

  // Click handler on bird
  container.querySelector("#active-bird").addEventListener("click", () => {
    if (!activeBird) return;
    const pts = activeBird.points;
    score += pts;
    localStorage.setItem("ep_birds_score", String(score));
    container.querySelector("#bird-score").textContent = score;
    showPhotoFeedback(container, activeBird, pts);
    activeBird = null;
    container.querySelector("#active-bird").style.opacity = "0";
  });
}

function showPhotoFeedback(container, bird, pts) {
  const el = document.createElement("div");
  el.textContent = `📸 ${bird.label} +${pts}pts`;
  el.style.cssText = `
    position:absolute;
    top:40%;left:50%;
    transform:translate(-50%,-50%);
    background:rgba(0,0,0,0.8);
    color:#ffd700;
    padding:8px 16px;
    border-radius:6px;
    font-family:'Courier New',monospace;
    font-size:0.85rem;
    animation:floatUp 1.2s ease forwards;
    pointer-events:none;
    white-space:nowrap;
  `;
  container.firstElementChild.appendChild(el);
  el.addEventListener("animationend", () => el.remove());
}

export function onExit() {
  clearTimeout(spawnTimer);
  localStorage.setItem("ep_birds_score", String(score));
}
