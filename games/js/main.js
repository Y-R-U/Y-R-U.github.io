// br8t games hub — render the line-up and hang the shared account chrome in
// the corner. Signing in here signs you into every game on this origin, since
// they all sit under games.br8t.com and share one localStorage.

import { GAMES } from "./games.js";

const grid = document.getElementById("grid");

// The card is an <article> with a stretched link rather than one big <a>, so the
// "More" button can sit inside it without being a button inside a link.
grid.innerHTML = GAMES.map(g => {
  const soon = !!g.soon;
  const tag = soon ? "Coming soon" : "Play now";
  const title = soon ? g.name : `<a class="hit" href="${g.path}">${g.name}</a>`;
  const more = g.short && g.short !== g.blurb;
  return `
    <article class="card${soon ? " soon" : ""}" style="--accent:${g.accent}">
      <span class="flag">${tag}</span>
      <div class="shot"><img src="/assets/screenshots/${g.shot}.jpg" alt="" loading="lazy" decoding="async"></div>
      <div class="body">
        <h2>${title}</h2>
        <span class="tag">${g.tag}</span>
        <p class="short">${g.short || g.blurb}</p>${more ? `
        <p class="full" id="more-${g.id}" hidden>${g.blurb}</p>
        <button class="more" type="button" aria-expanded="false" aria-controls="more-${g.id}">More</button>` : ""}
      </div>
    </article>`;
}).join("");

grid.addEventListener("click", e => {
  const btn = e.target.closest(".more");
  if (!btn) return;
  const full = document.getElementById(btn.getAttribute("aria-controls"));
  const open = btn.getAttribute("aria-expanded") !== "true";
  btn.setAttribute("aria-expanded", String(open));
  btn.textContent = open ? "Less" : "More";
  full.hidden = !open;
  btn.closest(".card").querySelector(".short").hidden = open;
});

// The hub has no progress of its own — no gameId, so no save wiring, just the
// avatar and the sign-in panel. It is also the front door, and nothing here is
// ever mid-match, so the nudge is always welcome.
import("/lib/auth/ui.js")
  .then(m => m.mountAccount({ nudge: "callout", canPester: () => true }))
  .catch(e => console.warn("[hub] account layer unavailable", e));
