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

let host = null, root = null, cfg = {};

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

    // Nothing to weigh up — one side is empty.
    if (!remoteData || !localData || !cfg.describe) {
      if (!remoteData && localData && cfg.gameId) cloud.game(cfg.gameId).save(localData);
      else if (remoteData && cfg.applyRemote) safe(() => cfg.applyRemote(remoteData));
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

// Call this from the results / summary screen — never mid-match. Counts completed
// matches per game, and asks exactly once, on the PROMPT_AFTER'th one.
export function matchCompleted(gameId = cfg.gameId) {
  if (!gameId) return;
  const s = promptState(gameId);
  if (s.done) return;
  s.n++;
  if (s.n < PROMPT_AFTER || (auth.user && !auth.user.anon)) { setPromptState(gameId, s); return; }
  s.done = true;                       // asked once, never again
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

  auth.onChange(() => renderFab());
  renderFab();

  auth.ready().then(async () => {
    renderFab();
    // An email link that landed while signed out resolves during ready().
    const parked = auth.takeConflict();
    if (parked) { resolveConflict(parked); return; }
    if (auth.user && !auth.user.anon) { await cloud.touchProfile(); await afterSignIn(); }
  }).catch(e => console.warn("[auth-ui] init", e));

  return { open: openPanel };
}

export { auth, cloud };
