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
const AUTH_WAIT_MS = 4000;                 // longest we wait to learn who the player is

let host = null, root = null, cfg = {};
let pesterTimer = 0;
let authSettled = false, authWaited = false;

/* ------------------------------------------------------------------ styles */

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }

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
  transition: transform .18s ease, border-color .3s;
}
.fab:hover { transform: scale(1.06); }
.fab img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
.fab.hint { animation: pulse 2.2s ease-in-out infinite; }
@keyframes pulse {
  0%,100% { box-shadow: 0 2px 14px rgba(0,0,0,.45), 0 0 0 0 rgba(120,200,255,.55); }
  50%     { box-shadow: 0 2px 14px rgba(0,0,0,.45), 0 0 0 9px rgba(120,200,255,0); }
}
@media (prefers-reduced-motion: reduce) { .fab.hint { animation: none; border-color: rgba(120,200,255,.85); } }

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
  border-right: 1px solid rgba(120,200,255,.5); border-top: 1px solid rgba(120,200,255,.5);
  transform: rotate(45deg);
}

.pester .body {
  position: relative; height: 32px; width: 146px; padding: 0 10px;
  display: flex; align-items: center; overflow: hidden;
  border: 1px solid rgba(120,200,255,.5); border-radius: 8px;
  background: rgba(12,14,18,.86); color: #eaf4ff;
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 2px 14px rgba(0,0,0,.5);
  font-size: 12.5px; font-weight: 600; letter-spacing: .01em;
  cursor: pointer; white-space: nowrap;
}
.pester .track { display: inline-flex; }   /* JS animates this; see showPester */
.pester .long { padding-right: 16px; }
/* The pill's inner width, so the short label parks centred. */
.pester .short { width: 126px; text-align: center; font-weight: 700; color: #9fd4ff; }

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
  background: rgba(4,6,10,.62); backdrop-filter: blur(3px);
  display: grid; place-items: center; padding: 18px;
}
.card {
  width: min(420px, 100%); max-height: 86vh; overflow: auto;
  background: #14171d; color: #e9edf3;
  border: 1px solid rgba(255,255,255,.12); border-radius: 16px;
  padding: 20px; box-shadow: 0 24px 70px rgba(0,0,0,.6);
}
h2 { margin: 0 0 4px; font-size: 17px; font-weight: 650; }
p  { margin: 0 0 14px; font-size: 13.5px; line-height: 1.5; color: #a9b3c1; }
.who { display: flex; align-items: center; gap: 11px; margin-bottom: 16px; }
.who .av { width: 42px; height: 42px; border-radius: 50%; background: #2a303a; display: grid; place-items: center; font-size: 17px; overflow: hidden; flex: 0 0 auto; }
.who .av img { width: 100%; height: 100%; object-fit: cover; }
.who b { display: block; font-size: 14.5px; }
.who span { font-size: 12px; color: #8d97a6; }

button.act {
  display: flex; align-items: center; justify-content: center; gap: 9px;
  width: 100%; margin-bottom: 9px; padding: 11px 14px;
  font-size: 14px; font-weight: 550; cursor: pointer;
  border-radius: 10px; border: 1px solid rgba(255,255,255,.16);
  background: rgba(255,255,255,.06); color: #e9edf3;
}
button.act:hover { background: rgba(255,255,255,.12); }
button.act.primary { background: #3d7dff; border-color: #3d7dff; color: #fff; }
button.act.primary:hover { background: #5a8fff; }
button.act.quiet { background: none; border-color: transparent; color: #8d97a6; font-weight: 450; }
button.act[disabled] { opacity: .5; cursor: default; }

input {
  width: 100%; padding: 11px 13px; margin-bottom: 9px; font-size: 14px;
  border-radius: 10px; border: 1px solid rgba(255,255,255,.16);
  background: rgba(0,0,0,.3); color: #e9edf3;
}
.err  { color: #ff8f8f; font-size: 12.5px; margin: 0 0 10px; }
.note { color: #7fd6a0; font-size: 12.5px; margin: 0 0 10px; }

.cmp { display: grid; gap: 10px; margin-bottom: 14px; }
.cmp .side { border: 1px solid rgba(255,255,255,.14); border-radius: 12px; padding: 12px 13px; }
.cmp .side h3 { margin: 0 0 6px; font-size: 13px; font-weight: 650; }
.cmp .side ul { margin: 0; padding-left: 17px; font-size: 12.5px; color: #a9b3c1; line-height: 1.6; }
.cmp .side.pick { border-color: #3d7dff; }
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
    card.innerHTML = `
      <div class="who">
        <div class="av">${avatarHTML(u)}</div>
        <div>
          <b>${signedIn ? (u.name || u.email || "Signed in") : "Playing as guest"}</b>
          <span>${signedIn ? (u.email || "") : "Progress is saved on this device only"}</span>
        </div>
      </div>`;

    if (!signedIn) {
      card.append(el(`<p>Sign in to keep your progress across devices — everything you've played so far comes with you.</p>`));
      card.append(actionButton("Continue with Google", "primary", doGoogle));
      card.append(actionButton("Email me a sign-in link", "", openEmail));
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
      card.append(el(`<p>Your progress syncs automatically.</p>`));
      card.append(actionButton("Sign out", "", async btn => {
        btn.disabled = true;
        await auth.signOut();
        closeModal();
      }));
      card.append(actionButton("Switch account", "quiet", async btn => {
        btn.disabled = true;
        await auth.signOut();
        try { await doGoogle(btn); } catch (e) { /* surfaced by doGoogle */ }
      }));
      card.append(actionButton("Close", "quiet", closeModal));
    }
  });
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
        card.insertBefore(el(`<p class="note">Link sent to ${email} — check your inbox.</p>`), btn);
        btn.textContent = "Sent";
      } catch (e) {
        btn.disabled = false;
        showError(card, "Couldn't send the link. Please try again.");
      }
    }));
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
      <p>You've been playing on this device, and <b>${adopted.name || adopted.email || "your account"}</b> already has progress saved. Pick the one to keep — the other is discarded.</p>
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
    card.append(actionButton("Continue with Google", "primary", doGoogle));
    card.append(actionButton("Email me a sign-in link", "", openEmail));
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
// Safe to call from any menu / results screen; it decides whether one is due.
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
