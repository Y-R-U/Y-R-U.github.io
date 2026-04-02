/**
 * Unit 69 — Adult Dating Sim
 *
 * Stub. Age-gate required before content loads.
 *
 * TODO:
 *   - Age verification gate (localStorage flag)
 *   - Extended dating sim system (characters, scenes, choices)
 *   - Content warnings overlay
 */

const AGE_KEY = "ep_u69_age_confirmed";

export function init(container, state) {
  const confirmed = localStorage.getItem(AGE_KEY) === "yes";

  if (!confirmed) {
    renderAgeGate(container);
  } else {
    renderStub(container);
  }
}

function renderAgeGate(container) {
  container.innerHTML = `
    <div style="
      height:100%;
      background:#0a0a0a;
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      gap:16px;
      font-family:'Courier New',monospace;
      color:#e0d8c8;
      padding:20px;
      text-align:center;
    ">
      <h2 style="color:#c0392b">Age Verification</h2>
      <p style="font-size:0.85rem;color:rgba(255,255,255,0.6)">
        This unit contains adult content.<br>
        You must be 18+ to continue.
      </p>
      <button id="age-yes" style="
        background:#c0392b;border:none;border-radius:6px;
        padding:8px 24px;font-family:inherit;font-size:0.9rem;
        color:#fff;cursor:pointer;
      ">I am 18+</button>
      <button id="age-no" style="
        background:transparent;border:1px solid rgba(255,255,255,0.3);
        border-radius:6px;padding:8px 24px;font-family:inherit;
        font-size:0.9rem;color:#ccc;cursor:pointer;
      ">I am under 18</button>
    </div>
  `;

  container.querySelector("#age-yes").addEventListener("click", () => {
    localStorage.setItem(AGE_KEY, "yes");
    renderStub(container);
  });

  container.querySelector("#age-no").addEventListener("click", () => {
    window.EmeraldPlace?.setView("room");
  });
}

function renderStub(container) {
  container.innerHTML = `
    <div style="
      height:100%;
      background:linear-gradient(135deg,#1a0a0a 0%,#2a0a1a 100%);
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      gap:16px;
      font-family:'Courier New',monospace;
      color:#e0d8c8;
      padding:20px;
    ">
      <div style="font-size:2rem">💋</div>
      <h2 style="letter-spacing:0.1em;color:#c0392b">Unit 69</h2>
      <p style="color:rgba(255,255,255,0.5);font-size:0.8rem;text-align:center">
        Adult Dating Sim &mdash; stub
      </p>
      <div style="
        border:1px solid rgba(192,57,43,0.3);
        border-radius:6px;padding:12px 20px;
        font-size:0.75rem;color:rgba(224,216,200,0.6);
        max-width:280px;text-align:center;
      ">
        Extended dialogue system, character scenes,<br>
        choices — to be implemented.
      </div>
    </div>
  `;
}

export function onExit() {}
