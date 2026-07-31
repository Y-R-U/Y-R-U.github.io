// br8t games hub — render the line-up and hang the shared account chrome in
// the corner. Signing in here signs you into every game on this origin, since
// they all sit under games.br8t.com and share one localStorage.

import { GAMES } from "./games.js";

const grid = document.getElementById("grid");

grid.innerHTML = GAMES.map(g => {
  const soon = !!g.soon;
  const tag = soon ? "Coming soon" : "Play now";
  const el = soon ? "div" : "a";
  const href = soon ? "" : ` href="${g.path}"`;
  return `
    <${el} class="card${soon ? " soon" : ""}"${href} style="--accent:${g.accent}">
      <span class="flag">${tag}</span>
      <div class="shot"><img src="/assets/screenshots/${g.shot}.jpg" alt="${g.name}" loading="lazy" decoding="async"></div>
      <div class="body">
        <h2>${g.name}</h2>
        <span class="tag">${g.tag}</span>
        <p>${g.blurb}</p>
      </div>
    </${el}>`;
}).join("");

// The hub has no progress of its own — no gameId, so no save wiring, just the
// avatar and the sign-in panel. It is also the front door, and nothing here is
// ever mid-match, so the nudge is always welcome.
import("/lib/auth/ui.js")
  .then(m => m.mountAccount({ nudge: "callout", canPester: () => true }))
  .catch(e => console.warn("[hub] account layer unavailable", e));
