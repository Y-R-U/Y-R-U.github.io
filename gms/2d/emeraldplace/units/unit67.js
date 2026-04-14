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
      background: url('../images/unit67_bg.png') center/cover no-repeat;
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      gap:16px;
      font-family:'Courier New',monospace;
      color:#e0d8c8;
      padding:20px;
      position:relative;
    ">
      <div style="position:absolute;inset:0;background:rgba(10,0,20,0.55)"></div>
      <div style="position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:16px">
        <div style="font-size:2rem">🔮</div>
        <h2 style="letter-spacing:0.1em;color:#b07cff;text-shadow:0 0 20px rgba(155,89,182,0.8)">Unit 67</h2>
        <p style="color:rgba(255,255,255,0.6);font-size:0.8rem;text-align:center">
          Magic RPG &mdash; coming soon
        </p>
        <div style="
          border:1px solid rgba(155,89,182,0.5);
          border-radius:6px;
          padding:12px 20px;
          font-size:0.75rem;
          color:rgba(224,216,200,0.7);
          max-width:280px;
          text-align:center;
          background:rgba(26,10,46,0.6);
          backdrop-filter:blur(4px);
        ">
          Roguelite dungeon, spell system,<br>
          mystery narrative — to be implemented.
        </div>
      </div>
    </div>
  `;
}

export function onExit() {}
