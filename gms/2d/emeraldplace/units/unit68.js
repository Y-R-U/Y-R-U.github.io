/**
 * Unit 68 — Horror / Suspense
 *
 * Stub. Find hidden objects in dark room images, jump scares, atmosphere.
 *
 * TODO:
 *   - Hidden object game engine (click on found items)
 *   - Procedural sound atmosphere (creaks, distant sounds)
 *   - Jump scare trigger system (timing + CSS flash)
 *   - Darkness mechanic: start with very little visible, find flashlight
 *   - Outside view: dark, foggy, occasional shadow figure passes
 */

export function init(container, state) {
  container.innerHTML = `
    <div style="
      height:100%;
      background: #000;
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      gap:16px;
      font-family:'Courier New',monospace;
      color:#e0d8c8;
      padding:20px;
    ">
      <div style="font-size:2rem">👁</div>
      <h2 style="letter-spacing:0.1em;color:#c0392b">Unit 68</h2>
      <p style="color:rgba(255,255,255,0.3);font-size:0.8rem;text-align:center">
        Horror &mdash; stub
      </p>
      <div style="
        border:1px solid rgba(192,57,43,0.3);
        border-radius:6px;
        padding:12px 20px;
        font-size:0.75rem;
        color:rgba(224,216,200,0.4);
        max-width:280px;
        text-align:center;
      ">
        Hidden object system, atmosphere,<br>
        jump scares — to be implemented.
      </div>
    </div>
  `;
}

export function onExit() {}
