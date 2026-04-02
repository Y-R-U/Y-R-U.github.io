/**
 * Unit 67 — Magic RPG / Mystery
 *
 * Stub. RPG elements, mystery story, roguelite dungeon on laptop.
 *
 * TODO:
 *   - Procedural floor generator (roguelite)
 *   - Spell casting mini-game
 *   - Mystery narrative system (clues, notes found in room)
 *   - Stats: HP, Mana, Lore
 *   - Easter egg: certain moon phases visible outside trigger events
 */

export function init(container, state) {
  container.innerHTML = `
    <div style="
      height:100%;
      background: radial-gradient(ellipse at center, #1a0a2e 0%, #0a0a0f 100%);
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      gap:16px;
      font-family:'Courier New',monospace;
      color:#e0d8c8;
      padding:20px;
    ">
      <div style="font-size:2rem">🔮</div>
      <h2 style="letter-spacing:0.1em;color:#9b59b6">Unit 67</h2>
      <p style="color:rgba(255,255,255,0.5);font-size:0.8rem;text-align:center">
        Magic RPG &mdash; stub
      </p>
      <div style="
        border:1px solid rgba(155,89,182,0.3);
        border-radius:6px;
        padding:12px 20px;
        font-size:0.75rem;
        color:rgba(224,216,200,0.6);
        max-width:280px;
        text-align:center;
      ">
        Roguelite dungeon, spell system,<br>
        mystery narrative — to be implemented.
      </div>
    </div>
  `;
}

export function onExit() {}
