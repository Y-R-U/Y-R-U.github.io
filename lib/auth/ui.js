// br8t games — the account chrome: a persistent avatar button plus the panel
// behind it. Rendered into a shadow root so no game's stylesheet can reach it
// and it can't reach into any game.
//
//   import { mountAccount } from "/lib/auth/ui.js";
//   mountAccount({
//     gameId: "racketeer",
//     getLocal:    () => save,               // current local progress (for conflicts)
//     applyRemote: data => adopt(data),      // take a cloud save over the local one
//     describe:    data => ["Story 14/100", "3 trophies"],   // human summary
//   });
//
// Every option is optional. With none of them it's a plain sign-in widget,
// which is all the hub page needs.

import { auth, AccountConflict } from "./auth.js";
import { cloud } from "./cloud.js";

const PROMPT_KEY = id => `br8t_saveprompt_${id}`;
const PROMPT_AFTER = 3;              // completed matches before we ask

// Opt in per game with `nudge: "callout"`; without it a game keeps the old modal.
const PESTER_KEY = "br8t_pester";          // shared across every game on the origin
const PESTER_HOLD_MS = 14000;              // how long it stays before it gives up
const PESTER_SCROLL_MS = 6500;             // long message ticks past in this
const PESTER_SECOND_AFTER = 3;             // games between the 1st pester and the 2nd
const PESTER_EVERY = 5;                    // and between every one after that
const PESTER_AWAY_MS = 60 * 60 * 1000;     // away this long and the next visit asks again
const PESTER_WATCH_MS = 2500;              // how often we look for a safe moment
const AUTH_WAIT_MS = 4000;                 // longest we wait to learn who the player is

// Each game's colour, straight from the hub line-up in games/js/games.js, so the
// panel wears whichever game it has been dropped into instead of introducing a
// twelfth colour of its own. Keep in step when a game is added there. A game can
// override with mountAccount({ accent }) or by setting --br8t-accent on :root;
// the hub page itself, and anything not listed, gets the house amber.
const ACCENTS = {
  racketeer: "#3ecf6d", ironhail: "#d8823c", hexpire: "#f0a52c",
  grudgebugs: "#8fd14f", sundayleague: "#7ee081", paperant: "#e8d36a",
  sudoku: "#4a90e2", snakeeee: "#4CAF50", crazyspace: "#39c0ed",
  murderroyale: "#c2603a", outpace: "#6ea8ff", voidcast: "#b489ff",
};
const HOUSE_ACCENT = "#ffb45c";

let host = null, root = null, cfg = {};
let pesterTimer = 0, watchTimer = 0;
let authSettled = false, authWaited = false;

/* ------------------------------------------------------------------ styles */

// The hub's own tokens (games/css/style.css), so the account chrome looks like
// part of br8t rather than a browser dialog that wandered in. --accent is set
// per game on the host element at mount; amber is the house colour it falls
// back to, and the one the hub itself uses.
const CSS = `
:host {
  all: initial;
  --card: #141821;
  --ink:  #eef2f8;
  --dim:  #8b95a6;
  --line: rgba(255,255,255,.10);
  --accent: #ffb45c;
  --glow: color-mix(in srgb, var(--accent) 26%, transparent);
}
* { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
button:focus-visible, input:focus-visible {
  outline: 2px solid var(--accent); outline-offset: 2px;
}

.fab {
  position: fixed; z-index: 2147483000;
  top: max(10px, env(safe-area-inset-top)); right: max(10px, env(safe-area-inset-right));
  width: 40px; height: 40px; border-radius: 50%;
  border: 1px solid rgba(255,255,255,.28);
  background: rgba(12,14,18,.62); color: #fff;
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  display: grid; place-items: center; cursor: pointer; padding: 0;
  font-size: 15px; font-weight: 600; letter-spacing: .02em;
  box-shadow: 0 2px 14px rgba(0,0,0,.45);
  transition: transform .18s ease, border-color .3s, box-shadow .3s;
}
.fab:hover { transform: scale(1.06); }
.fab img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
/* Signed in wears the game's colour; a guest stays neutral, so the difference
   is legible at a glance without a word of copy. */
.fab.in { border-color: color-mix(in srgb, var(--accent) 70%, transparent); }
.fab.in:hover { box-shadow: 0 2px 14px rgba(0,0,0,.45), 0 0 0 4px color-mix(in srgb, var(--accent) 18%, transparent); }
.fab.hint { animation: pulse 2.2s ease-in-out infinite; }
@keyframes pulse {
  0%,100% { box-shadow: 0 2px 14px rgba(0,0,0,.45), 0 0 0 0 var(--glow); }
  50%     { box-shadow: 0 2px 14px rgba(0,0,0,.45), 0 0 0 9px transparent; }
}
@media (prefers-reduced-motion: reduce) { .fab.hint { animation: none; border-color: var(--accent); } }

/* Deliberately not a scrim: it hangs off the avatar and blocks nothing. */
.pester {
  position: fixed; z-index: 2147483000;
  top: max(10px, env(safe-area-inset-top));
  right: calc(max(10px, env(safe-area-inset-right)) + 48px);
  height: 40px; display: flex; align-items: center;
  animation: pester-in .34s cubic-bezier(.2,.9,.3,1.2) both;
}
.pester.out { animation: pester-out .28s ease forwards; }
@keyframes pester-in  { from { opacity: 0; transform: translateX(14px) scale(.9); } to { opacity: 1; transform: none; } }
@keyframes pester-out { to { opacity: 0; transform: translateX(10px) scale(.94); } }

/* On the row, not the pill: the pill clips its overflow for the ticker. */
.pester::after {
  content: ""; position: absolute; right: -5px; top: 50%;
  width: 8px; height: 8px; margin-top: -4px;
  background: rgba(12,14,18,.86);
  border-right: 1px solid color-mix(in srgb, var(--accent) 55%, transparent);
  border-top: 1px solid color-mix(in srgb, var(--accent) 55%, transparent);
  transform: rotate(45deg);
}

.pester .body {
  position: relative; height: 32px; width: 146px; padding: 0 10px;
  display: flex; align-items: center; overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--accent) 55%, transparent); border-radius: 9px;
  background: rgba(12,14,18,.88); color: var(--ink);
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 2px 14px rgba(0,0,0,.5);
  font-size: 12.5px; font-weight: 600; letter-spacing: .01em;
  cursor: pointer; white-space: nowrap;
}
.pester .track { display: inline-flex; }   /* JS animates this; see showPester */
.pester .long { padding-right: 16px; }
/* The pill's inner width, so the short label parks centred. */
.pester .short { width: 126px; text-align: center; font-weight: 700; color: var(--accent); }

.pester .x {
  width: 22px; height: 22px; margin-right: 6px; padding: 0;
  border: 0; border-radius: 50%; cursor: pointer;
  background: rgba(12,14,18,.7); color: #8d97a6;
  font-size: 14px; line-height: 1; display: grid; place-items: center;
}
.pester .x:hover { color: #e9edf3; }

@media (prefers-reduced-motion: reduce) { .pester { animation: none; } }

.scrim {
  position: fixed; inset: 0; z-index: 2147483001;
  background: rgba(4,6,10,.66);
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  display: grid; place-items: center; padding: 18px;
  animation: fade .22s ease both;
}
@keyframes fade { from { opacity: 0; } }

.card {
  position: relative; isolation: isolate;
  width: min(400px, 100%); max-height: 86vh; overflow: auto;
  background: var(--card); color: var(--ink);
  border: 1px solid var(--line); border-radius: 18px;
  padding: 22px 22px 18px;
  box-shadow: 0 26px 80px rgba(0,0,0,.66), 0 0 0 1px rgba(0,0,0,.4);
  animation: rise .3s cubic-bezier(.2,.9,.3,1.05) both;
}
/* The hub's drifting colour fields, distilled to one soft bloom in the corner
   the avatar came from. Purely decorative — never sits over text. */
.card::before {
  content: ""; position: absolute; z-index: -1; inset: -1px; border-radius: inherit;
  background: radial-gradient(120% 78% at 88% -18%, var(--glow), transparent 62%);
  pointer-events: none;
}
@keyframes rise { from { opacity: 0; transform: translateY(10px) scale(.975); } }
@media (prefers-reduced-motion: reduce) {
  .scrim, .card { animation: none; }
}

h2 { margin: 0 0 5px; font-size: 18px; font-weight: 650; letter-spacing: -.012em; }
p  { margin: 0 0 15px; font-size: 13.5px; line-height: 1.55; color: var(--dim); }

.who { display: flex; align-items: center; gap: 12px; margin-bottom: 15px; }
.who .av {
  width: 46px; height: 46px; border-radius: 50%; flex: 0 0 auto;
  background: #232936; color: var(--ink);
  display: grid; place-items: center; font-size: 18px; font-weight: 600;
  overflow: hidden; box-shadow: 0 0 0 1px var(--line);
}
.who .av img { width: 100%; height: 100%; object-fit: cover; }
.who.in .av {
  background: color-mix(in srgb, var(--accent) 20%, #232936);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent);
}
.who .txt { min-width: 0; }
.who b {
  display: block; font-size: 15px; font-weight: 600; letter-spacing: -.008em;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.who span {
  display: block; font-size: 12.5px; color: var(--dim);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* Sync status. The dot is the whole message; the words are for confirmation. */
.sync {
  display: inline-flex; align-items: center; gap: 7px;
  margin: -6px 0 15px; padding: 5px 10px 5px 8px;
  border: 1px solid var(--line); border-radius: 999px;
  background: rgba(255,255,255,.03);
  font-size: 12px; color: var(--dim);
}
.sync .dot { width: 7px; height: 7px; border-radius: 50%; background: #46c97e; flex: 0 0 auto; }
.sync.off .dot { background: #6b7484; }

button.act {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  width: 100%; margin-bottom: 8px; padding: 12px 14px;
  font-size: 14px; font-weight: 550; cursor: pointer;
  border-radius: 11px; border: 1px solid var(--line);
  background: rgba(255,255,255,.055); color: var(--ink);
  transition: background .16s ease, border-color .16s ease, transform .16s ease;
}
button.act:hover { background: rgba(255,255,255,.1); border-color: rgba(255,255,255,.18); }
button.act:active { transform: translateY(1px); }
button.act svg { flex: 0 0 auto; }
/* Google's mark is four saturated colours and it goes muddy sitting straight on
   an accent button. A white chip is also what Google's own button guidance asks
   for, so this is correctness as much as taste. */
button.act .g {
  flex: 0 0 auto; display: grid; place-items: center;
  width: 22px; height: 22px; border-radius: 5px; background: #fff;
}

/* Accent buttons carry dark ink: every game accent is a light, saturated colour
   and white on top of them fails contrast. */
button.act.primary {
  background: var(--accent); border-color: var(--accent); color: #0b0d12;
  font-weight: 640;
  box-shadow: 0 6px 20px color-mix(in srgb, var(--accent) 22%, transparent);
}
button.act.primary:hover {
  background: color-mix(in srgb, var(--accent) 88%, #fff);
  border-color: color-mix(in srgb, var(--accent) 88%, #fff);
}
button.act.quiet {
  background: none; border-color: transparent; color: var(--dim);
  font-weight: 450; padding: 9px 14px; margin-bottom: 2px;
}
button.act.quiet:hover { background: rgba(255,255,255,.05); color: var(--ink); }
button.act.danger:hover { color: #ff9d9d; background: rgba(255,90,90,.09); }
button.act[disabled] { opacity: .5; cursor: default; transform: none; }

/* A hairline above the last-resort actions, so "sign out" never sits at the
   same weight as the thing the player actually came to do. */
.rule { height: 1px; margin: 12px 0 10px; background: var(--line); border: 0; }

input {
  width: 100%; padding: 12px 13px; margin-bottom: 9px; font-size: 14px;
  border-radius: 11px; border: 1px solid var(--line);
  background: rgba(0,0,0,.32); color: var(--ink);
}
input::placeholder { color: #667084; }
input:focus { border-color: color-mix(in srgb, var(--accent) 60%, transparent); }

.err  { color: #ff8f8f; font-size: 12.5px; margin: 0 0 10px; }
.note { color: #7fd6a0; font-size: 12.5px; margin: 0 0 10px; }

.cmp { display: grid; gap: 10px; margin-bottom: 15px; }
.cmp .side {
  border: 1px solid var(--line); border-radius: 13px; padding: 13px 14px;
  background: rgba(255,255,255,.025);
}
.cmp .side h3 {
  margin: 0 0 7px; font-size: 11px; font-weight: 700;
  text-transform: uppercase; letter-spacing: .07em; color: var(--dim);
}
.cmp .side ul { margin: 0; padding-left: 17px; font-size: 13px; color: var(--ink); line-height: 1.65; }
.cmp .side.pick { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 7%, transparent); }
`;

/* -------------------------------------------------------------- rendering */

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function initials(u) {
  const s = (u && (u.name || u.email)) || "";
  return s.trim() ? s.trim()[0].toUpperCase() : "";
}

function accentFor() {
  if (cfg.accent) return cfg.accent;
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--br8t-accent").trim();
    if (v) return v;
  } catch (e) { /* getComputedStyle can throw in odd embedding cases */ }
  return ACCENTS[cfg.gameId] || HOUSE_ACCENT;
}

// How the account got here, for when there's no display name to show instead.
function providerLabel(u) {
  const p = (u && u.providers) || [];
  if (p.includes("google.com")) return "Google account";
  if (p.includes("password") || p.includes("emailLink")) return "Email sign-in";
  return "Signed in";
}

function ago(t) {
  if (!t) return null;
  const s = Math.max(0, Date.now() - t) / 1000;
  if (s < 45)    return "just now";
  if (s < 90)    return "a minute ago";
  if (s < 3600)  return `${Math.round(s / 60)} minutes ago`;
  if (s < 7200)  return "an hour ago";
  if (s < 86400) return `${Math.round(s / 3600)} hours ago`;
  if (s < 172800) return "yesterday";
  return `${Math.round(s / 86400)} days ago`;
}

const ICON_GOOGLE = `<span class="g"><svg width="15" height="15" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-2.7-.4-4H24v7.3h12.1c-.2 2-1.6 5-4.6 7l-.1.3 6.7 5.2.5.1c4.2-3.9 6.5-9.6 6.5-15.9"/><path fill="#34A853" d="M24 46c6.1 0 11.2-2 14.9-5.5l-7.1-5.5c-1.9 1.3-4.5 2.2-7.8 2.2-6 0-11-3.9-12.8-9.3l-.3.1-6.9 5.4-.1.3C7.6 40.9 15.2 46 24 46"/><path fill="#FBBC05" d="M11.2 27.9c-.5-1.4-.7-2.9-.7-4.4s.3-3 .7-4.4v-.3l-7-5.5-.3.1C2.5 16.4 1.7 20.1 1.7 23.5s.8 7.1 2.2 10.1z"/><path fill="#EA4335" d="M24 9.7c4.3 0 7.1 1.8 8.8 3.4l6.4-6.2C35.2 3.4 30.1 1 24 1 15.2 1 7.6 6.1 3.9 13.4l7.3 5.7C13 13.6 18 9.7 24 9.7"/></svg></span>`;
const ICON_MAIL = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><path d="m3 7 8.1 5.6a1.6 1.6 0 0 0 1.8 0L21 7"/></svg>`;

function avatarHTML(u) {
  if (u && u.photo) return `<img src="${u.photo}" alt="">`;
  const i = initials(u);
  return i || `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c1.2-4 4-6 7.5-6s6.3 2 7.5 6"/></svg>`;
}

function renderFab() {
  const u = auth.user;
  const fab = root.querySelector(".fab");
  fab.innerHTML = avatarHTML(u);
  fab.classList.toggle("hint", auth.shouldHint);
  fab.classList.toggle("in", !!(u && !u.anon));
  fab.title = u && !u.anon ? (u.name || u.email || "Account") : "Sign in to save your progress";
}

function closeModal() {
  const s = root.querySelector(".scrim");
  if (s) s.remove();
}

function openModal(build) {
  closeModal();
  const scrim = el(`<div class="scrim"><div class="card"></div></div>`);
  scrim.addEventListener("click", e => { if (e.target === scrim) closeModal(); });
  root.appendChild(scrim);
  build(scrim.querySelector(".card"));
  return scrim.querySelector(".card");
}

/* ------------------------------------------------------------ the account panel */

function openPanel() {
  auth.markHinted();
  renderFab();
  openModal(card => {
    const u = auth.user;
    const signedIn = u && !u.anon;

    // The subtitle must never repeat the line above it. With no display name —
    // which is every email-link account, and plenty of Google ones — the title
    // falls back to the email address, and showing the email again underneath
    // read as a rendering bug.
    const title = signedIn ? (u.name || u.email || "Signed in") : "Playing as guest";
    const sub = !signedIn ? "Progress is saved on this device only"
      : (u.name && u.email) ? u.email
      : providerLabel(u);

    card.innerHTML = `
      <div class="who${signedIn ? " in" : ""}">
        <div class="av">${avatarHTML(u)}</div>
        <div class="txt"><b>${esc(title)}</b><span>${esc(sub)}</span></div>
      </div>`;

    if (!signedIn) {
      card.append(el(`<p>Sign in to keep your progress across devices — everything you've played so far comes with you.</p>`));
      card.append(actionButton(`${ICON_GOOGLE}Continue with Google`, "primary", doGoogle));
      card.append(actionButton(`${ICON_MAIL}Email me a sign-in link`, "", openEmail));
      card.append(el(`<hr class="rule">`));
      card.append(actionButton("Keep playing as guest", "quiet", closeModal));
      // Here because the panel is one tap from the avatar in every game.
      if (cfg.nudge === "callout") {
        card.append(actionButton(
          pesterEnabled() ? "Stop asking me to sign in" : "Asking is off — turn it back on",
          "quiet",
          btn => { setPesterEnabled(!pesterEnabled()); btn.textContent = pesterEnabled() ? "Stop asking me to sign in" : "Asking is off — turn it back on"; },
        ));
      }
    } else {
      const synced = cfg.gameId ? ago(cloud.lastSync(cfg.gameId)) : null;
      card.append(el(synced
        ? `<div class="sync"><i class="dot"></i>Saved to your account ${synced}</div>`
        : `<div class="sync off"><i class="dot"></i>Nothing to save yet</div>`));
      card.append(el(`<p>Your progress follows you to every game on br8t — and survives clearing this browser.</p>`));
      card.append(actionButton("Done", "primary", closeModal));
      card.append(el(`<hr class="rule">`));
      card.append(actionButton("Switch account", "quiet", async btn => {
        btn.disabled = true;
        await auth.signOut();
        try { await doGoogle(btn); } catch (e) { /* surfaced by doGoogle */ }
      }));
      card.append(actionButton("Sign out", "quiet danger", async btn => {
        btn.disabled = true;
        await auth.signOut();
        closeModal();
      }));
    }
  });
}

// Display names and email addresses land in innerHTML. Neither is ours.
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function actionButton(label, cls, fn) {
  const b = el(`<button class="act ${cls}">${label}</button>`);
  b.addEventListener("click", () => fn(b));
  return b;
}

function showError(card, msg) {
  card.querySelectorAll(".err").forEach(n => n.remove());
  card.insertBefore(el(`<p class="err">${msg}</p>`), card.querySelector("button.act"));
}

async function doGoogle(btn) {
  const card = btn.closest(".card");
  btn.disabled = true;
  try {
    await auth.signInGoogle();
    await cloud.touchProfile();
    await afterSignIn();
    closeModal();
  } catch (e) {
    btn.disabled = false;
    if (e instanceof AccountConflict) { resolveConflict(e); return; }
    if (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request") return;
    showError(card, e.code === "auth/unauthorized-domain"
      ? "This domain isn't authorised for sign-in yet."
      : "Sign-in failed. Please try again.");
  }
}

function openEmail() {
  openModal(card => {
    card.innerHTML = `<h2>Sign in by email</h2><p>We'll send you a link. No password to remember — open it on this device and you're in.</p>`;
    const input = el(`<input type="email" inputmode="email" autocomplete="email" placeholder="you@example.com">`);
    card.append(input);
    card.append(actionButton("Send link", "primary", async btn => {
      const email = input.value.trim();
      if (!email || !email.includes("@")) { showError(card, "That doesn't look like an email address."); return; }
      btn.disabled = true;
      try {
        await auth.sendEmailLink(email);
        card.querySelectorAll(".err").forEach(n => n.remove());
        card.insertBefore(el(`<p class="note">Link sent to ${esc(email)} — check your inbox.</p>`), btn);
        btn.textContent = "Sent";
      } catch (e) {
        btn.disabled = false;
        showError(card, "Couldn't send the link. Please try again.");
      }
    }));
    card.append(el(`<hr class="rule">`));
    card.append(actionButton("Back", "quiet", openPanel));
    input.focus();
  });
}

/* ---------------------------------------------------- the two-saves problem */

// The player already has an account with a save on it, and a different save on
// this device. Show both and let them pick — never silently discard either.
function resolveConflict(conflict) {
  const localData = cfg.getLocal ? safe(cfg.getLocal) : null;

  // With nothing local at stake — the hub page, or a player who simply signed
  // out and back in — this isn't a conflict at all, it's an ordinary sign-in.
  // Don't alarm them with talk of existing accounts.
  const stakes = !!(localData && cfg.gameId && cfg.describe);

  openModal(async card => {
    card.innerHTML = stakes
      ? `<h2>You already have an account</h2><p>Checking what's saved to it…</p>`
      : `<h2>Signing you in…</h2><p>One moment.</p>`;
    let remote = null, adopted = null;
    try {
      adopted = await conflict.adopt();
      if (cfg.gameId) remote = await cloud.game(cfg.gameId).load();
    } catch (e) {
      card.innerHTML = `<h2>Sign-in failed</h2><p>We couldn't open that account. Your progress on this device is untouched.</p>`;
      card.append(actionButton("Close", "quiet", closeModal));
      return;
    }

    const remoteData = remote ? remote.data : null;

    // Two saves that describe identically are the same save as far as the
    // player is concerned — usually this very device's progress coming back
    // down from the cloud. Asking them to choose between two matching lists is
    // just alarming. Keep the newer and say nothing.
    const same = remoteData && localData && cfg.describe &&
      JSON.stringify(safe(() => cfg.describe(localData))) ===
      JSON.stringify(safe(() => cfg.describe(remoteData)));

    // Nothing to weigh up: one side is empty, no way to describe them, or the
    // two are the same progress.
    if (!remoteData || !localData || !cfg.describe || same) {
      // When they match, keep what's already loaded. Calling applyRemote here
      // would hand the game a save it already has — and in Racketeer that
      // costs a page reload for no reason.
      if (same || (localData && !remoteData)) {
        if (cfg.gameId) cloud.game(cfg.gameId).save(localData);
      } else if (remoteData && cfg.applyRemote) {
        safe(() => cfg.applyRemote(remoteData));
      }
      await cloud.touchProfile();
      closeModal();
      return;
    }

    const lines = d => (safe(() => cfg.describe(d)) || []).map(s => `<li>${s}</li>`).join("");
    card.innerHTML = `
      <h2>Two saves, one account</h2>
      <p>You've been playing on this device, and <b>${esc(adopted.name || adopted.email || "your account")}</b> already has progress saved. Pick the one to keep — the other is discarded.</p>
      <div class="cmp">
        <div class="side"><h3>On this device</h3><ul>${lines(localData)}</ul></div>
        <div class="side"><h3>On your account</h3><ul>${lines(remoteData)}</ul></div>
      </div>`;
    card.append(actionButton("Keep this device's progress", "primary", async btn => {
      btn.disabled = true;
      if (cfg.gameId) {
        cloud.game(cfg.gameId).save(localData);
        await cloud.game(cfg.gameId).flush();
      }
      await cloud.touchProfile();
      closeModal();
    }));
    card.append(actionButton("Keep my account's progress", "", async btn => {
      btn.disabled = true;
      if (cfg.applyRemote) safe(() => cfg.applyRemote(remoteData));
      await cloud.touchProfile();
      closeModal();
    }));
  });
}

function safe(fn) { try { return fn(); } catch (e) { console.warn("[auth-ui]", e); return null; } }

/* ------------------------------------------------- post-sign-in reconciliation */

// Straightforward case: an anonymous player linked an account that had no save
// on it, so the local progress simply becomes the cloud save.
async function afterSignIn() {
  if (!cfg.gameId) return;
  const slot = cloud.game(cfg.gameId);
  const local = cfg.getLocal ? safe(cfg.getLocal) : null;
  const remote = await slot.load();
  if (!remote && local) slot.save(local);
  else if (remote && !local && cfg.applyRemote) safe(() => cfg.applyRemote(remote.data));
}

/* --------------------------------------------------- "save your progress?" nudge */

function promptState(id) {
  try { return JSON.parse(localStorage.getItem(PROMPT_KEY(id))) || { n: 0, done: false }; }
  catch (e) { return { n: 0, done: false }; }
}
function setPromptState(id, s) {
  try { localStorage.setItem(PROMPT_KEY(id), JSON.stringify(s)); } catch (e) { /* private mode */ }
}

// Call from the results screen, never mid-match. Asks on the PROMPT_AFTER'th.
// `nudge: "callout"` games get the recurring non-blocking pill instead.
export function matchCompleted(gameId = cfg.gameId) {
  if (!gameId) return;
  if (cfg.nudge === "callout") {
    const p = pesterState();
    p.games = (p.games || 0) + 1;
    p.seen = Date.now();      // a finished match is proof they are still here
    setPesterState(p);
    offerSignIn();
    return;
  }
  const s = promptState(gameId);
  s.n++;
  setPromptState(gameId, s);
  if (s.n < PROMPT_AFTER || (auth.user && !auth.user.anon)) return;
  if (s.done) return;
  s.done = true;                       // the modal asks once, never again
  setPromptState(gameId, s);
  openSavePrompt();
}

function openSavePrompt() {
  openModal(card => {
    card.innerHTML = `
      <h2>Don't lose this</h2>
      <p>You're a few matches in. Sign in and your progress follows you to any device — clearing your browser won't wipe it.</p>`;
    card.append(actionButton(`${ICON_GOOGLE}Continue with Google`, "primary", doGoogle));
    card.append(actionButton(`${ICON_MAIL}Email me a sign-in link`, "", openEmail));
    card.append(el(`<hr class="rule">`));
    card.append(actionButton("Not now", "quiet", closeModal));
  });
}

/* ------------------------------------------------------- the callout nudge */

// `games` counts completed matches across every game on the origin; `at` is the
// count when the pester last appeared, `shown` how many times it has.
function pesterState() {
  try { return JSON.parse(localStorage.getItem(PESTER_KEY)) || {}; }
  catch (e) { return {}; }
}
function setPesterState(s) {
  try { localStorage.setItem(PESTER_KEY, JSON.stringify(s)); } catch (e) { /* private mode */ }
}

// First visit asks straight away, then 3 games later, then every 5 — plus once
// more whenever the player comes back after an hour away.
function pesterDue(s) {
  if (!s.shown || s.due) return true;
  const since = (s.games || 0) - (s.at || 0);
  return since >= (s.shown === 1 ? PESTER_SECOND_AFTER : PESTER_EVERY);
}

// Called when the page is opened and whenever it comes back to the foreground.
function noteVisit() {
  const s = pesterState();
  if (s.seen && Date.now() - s.seen > PESTER_AWAY_MS) s.due = true;
  s.seen = Date.now();
  setPesterState(s);
}

// Exported so a game can offer this in its own settings screen.
export function pesterEnabled() { return !pesterState().off; }
export function setPesterEnabled(on) {
  const s = pesterState();
  s.off = !on;
  setPesterState(s);
  if (!on) hidePester(true);
}

// Every gate lives here, so no caller can nudge at a bad moment by mistake.
// The watcher below calls this on a timer; a game may also call it directly as
// a menu comes up to skip the wait. Either way it decides whether one is due.
export function offerSignIn() {
  if (!root || cfg.nudge !== "callout") return false;
  // A returning player may be signed in already, so wait to find out — but not
  // for ever: with Firebase unreachable auth never settles, and the nudge would
  // be the one thing an offline player never sees working.
  if (!authSettled) {
    if (!authWaited) {
      authWaited = true;
      Promise.race([auth.ready().catch(() => {}), new Promise(r => setTimeout(r, AUTH_WAIT_MS))])
        .then(() => { authSettled = true; offerSignIn(); });
    }
    return false;
  }
  if (auth.user && !auth.user.anon) return false;
  const s = pesterState();
  if (s.off) return false;                                  // switched off for good
  if (root.querySelector(".pester") || root.querySelector(".scrim")) return false;
  if (cfg.canPester && !safeBool(cfg.canPester)) return false;
  if (!pesterDue(s)) return false;
  s.shown = (s.shown || 0) + 1;
  s.at = s.games || 0;
  s.due = false;
  s.seen = Date.now();
  setPesterState(s);
  showPester();
  return true;
}

function safeBool(fn) { try { return !!fn(); } catch (e) { return false; } }

// Every gate in offerSignIn is cheap and re-checked at show time, so the layer
// can simply keep looking for a safe moment rather than making each game find
// every menu and results screen and call checkpoint() from all of them. Ten
// games wired that way is ten chances to miss one — and a nudge nobody ever
// sees, which is exactly what happened before. `canPester` stays the veto.
function watchForMoment() {
  window.clearInterval(watchTimer);
  watchTimer = window.setInterval(offerSignIn, PESTER_WATCH_MS);
}

function showPester() {
  const node = el(`
    <div class="pester" role="status">
      <button class="x" type="button" aria-label="Not now">&times;</button>
      <button class="body" type="button">
        <span class="track"><span class="long">Save your progress</span><b class="short">Login now!</b></span>
      </button>
    </div>`);
  root.appendChild(node);

  // Two frames, not one: at one frame the shadow stylesheet has not been
  // applied and the measurement comes back 14px short.
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const track = node.querySelector(".track");
    const short = node.querySelector(".short");
    if (!track || !short) return;
    const tick = Math.ceil(short.getBoundingClientRect().left - track.getBoundingClientRect().left) + 3;
    if (reduced) { track.style.transform = `translateX(-${tick}px)`; return; }
    track.animate(
      [{ transform: "translateX(0)", offset: 0 },
       { transform: "translateX(0)", offset: 0.12 },
       { transform: `translateX(-${tick}px)`, offset: 1 }],
      { duration: PESTER_SCROLL_MS, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" },
    );
  }));

  node.querySelector(".body").addEventListener("click", () => { hidePester(true); openPanel(); });
  node.querySelector(".x").addEventListener("click", () => hidePester(true));
  window.clearTimeout(pesterTimer);
  pesterTimer = window.setTimeout(() => hidePester(false), PESTER_HOLD_MS);
}

function hidePester(immediate) {
  window.clearTimeout(pesterTimer);
  const node = root && root.querySelector(".pester");
  if (!node) return;
  if (immediate) { node.remove(); return; }
  node.classList.add("out");
  window.setTimeout(() => node.remove(), 300);
}

/* ------------------------------------------------------------------- mount */

export function mountAccount(options = {}) {
  cfg = options;
  if (host) return { open: openPanel };

  host = document.createElement("div");
  host.id = "br8t-account";
  root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = CSS;
  // Inline on the host, which beats the :host fallback. Custom properties are
  // not touched by `all: initial`, so this reaches everything in the shadow root.
  host.style.setProperty("--accent", accentFor());
  root.append(style, el(`<button class="fab" aria-label="Account"></button>`));
  root.querySelector(".fab").addEventListener("click", openPanel);
  document.body.appendChild(host);

  // Tell the host page how much top-right room the avatar occupies, so games
  // can shift their own corner furniture out from under it:
  //
  //   .my-top-right-chip { right: calc(10px + var(--br8t-account-space, 0px)); }
  //
  // Games that don't use it are unaffected, and one that reads it works with or
  // without the account layer loaded, because of the 0px fallback.
  document.documentElement.style.setProperty("--br8t-account-space", "52px");

  auth.onChange(() => { renderFab(); if (auth.user && !auth.user.anon) hidePester(true); });
  renderFab();

  if (options.nudge === "callout") {
    noteVisit();
    watchForMoment();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      noteVisit();
      offerSignIn();      // self-gating: mid-match it just marks itself due
    });
  }

  auth.ready().then(async () => {
    authSettled = true;
    renderFab();
    // An email link that landed while signed out resolves during ready().
    const parked = auth.takeConflict();
    if (parked) { resolveConflict(parked); return; }
    if (auth.user && !auth.user.anon) { await cloud.touchProfile(); await afterSignIn(); }
  }).catch(e => { authSettled = true; console.warn("[auth-ui] init", e); });

  return { open: openPanel };
}

export { auth, cloud };
