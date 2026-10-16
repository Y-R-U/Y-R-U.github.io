// br8t games — "Report a bug / suggest an idea", shared by every game.
//
//   const fb = await import("/lib/feedback/feedback.js");
//   settingsRow.append(fb.feedbackButton({ game: "clued", build: BUILD }));
//   fb.openFeedback({ game: "clued", build: BUILD });
//
// Signed-in (non-guest) players only: the server stores the account with each report so
// replies and abuse can be traced. The panel is in a shadow root, has no scrim and never
// blocks the game; × or Escape closes it and the draft survives until it is sent.
// Player text is only ever set with textContent.

const API = "/api/br8t/";
const AUTH_WAIT_MS = 4000;
const TITLE_MAX = 120, BODY_MAX = 4000;
const HOUSE_ACCENT = "#ffb45c";
const KINDS = [
  { id: "bug", label: "Bug", icon: "🐞", title: "What went wrong?", body: "What happened, and what did you expect? Steps to make it happen again help a lot." },
  { id: "idea", label: "Idea", icon: "💡", title: "Your idea in a few words", body: "Tell us more. What would it add, and when would you use it?" },
];

let authP = null, testAuth = null;
let host = null, root = null, opts = {}, unsub = null;
const drafts = {};

function loadAuth() {
  if (testAuth) return Promise.resolve(testAuth);
  return authP || (authP = import("/lib/auth/auth.js").then(m => m.auth).catch(() => null));
}

// Tests only: { user, signedIn, ready(), onChange(fn), getIdToken() }.
export function _setAuthForTest(a) { testAuth = a; }

async function settledAuth() {
  const a = await loadAuth();
  if (!a) return null;
  try { await Promise.race([a.ready(), new Promise(r => setTimeout(r, AUTH_WAIT_MS))]); } catch (e) { /* signed out */ }
  return a;
}

export async function canSendFeedback() {
  const a = await settledAuth();
  return !!(a && a.signedIn);
}

// The account panel if the game mounted one, else Google directly.
export async function openSignIn() {
  const fab = document.getElementById("br8t-account")?.shadowRoot?.querySelector(".fab");
  if (fab) { fab.click(); return "panel"; }
  try { const m = await import("/lib/auth/auth.js"); await m.signInGoogle(); return "google"; } catch (e) { return null; }
}

/* ------------------------------------------------------------------ styles */

const CSS = `
:host { all: initial; --card:#141821; --ink:#eef2f8; --dim:#8b95a6; --line:rgba(255,255,255,.10); --accent:${HOUSE_ACCENT};
  --vvh: 100vh; --vvb: 0px; }
* { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
button:focus-visible, input:focus-visible, textarea:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.sheet {
  position: fixed; z-index: 2147483000; right: max(16px, env(safe-area-inset-right)); bottom: calc(var(--vvb) + 16px);
  width: min(420px, calc(100vw - 32px)); max-height: calc(var(--vvh) - 32px);
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--card); color: var(--ink); border: 1px solid var(--line); border-radius: 18px;
  box-shadow: 0 22px 70px rgba(0,0,0,.6), 0 0 0 1px rgba(0,0,0,.4);
  animation: rise .26s cubic-bezier(.2,.9,.3,1.05) both;
}
@keyframes rise { from { opacity: 0; transform: translateY(12px); } }
@media (prefers-reduced-motion: reduce) { .sheet { animation: none; } }
@media (max-width: 640px) {
  .sheet { left: 0; right: 0; width: auto; bottom: var(--vvb); max-height: calc(var(--vvh) - 8px);
    border-radius: 18px 18px 0 0; padding-bottom: env(safe-area-inset-bottom); }
}
.head { display: flex; align-items: center; gap: 10px; padding: 14px 12px 10px 18px; border-bottom: 1px solid var(--line);
  background: radial-gradient(120% 140% at 100% 0%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 60%); }
.head h2 { margin: 0; font-size: 16px; font-weight: 650; flex: 1; letter-spacing: -.01em; }
.head small { display: block; font-size: 12px; font-weight: 450; color: var(--dim); margin-top: 1px; }
.x { width: 40px; height: 40px; border: 0; border-radius: 50%; background: rgba(255,255,255,.06); color: var(--ink);
  font-size: 22px; line-height: 1; cursor: pointer; display: grid; place-items: center; flex: 0 0 auto; }
.x:hover { background: rgba(255,255,255,.12); }
.body { padding: 14px 18px 16px; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
.chips { display: flex; gap: 8px; margin-bottom: 12px; }
.chip { flex: 1; padding: 10px 12px; border-radius: 11px; border: 1px solid var(--line); background: rgba(255,255,255,.04);
  color: var(--ink); font-size: 14px; font-weight: 600; cursor: pointer; }
.chip[aria-pressed="true"] { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 16%, transparent); }
label { display: block; font-size: 12px; font-weight: 650; color: var(--dim); margin: 0 0 5px; letter-spacing: .02em; }
input, textarea { width: 100%; display: block; padding: 11px 12px; margin: 0 0 10px; font-size: 16px; line-height: 1.4;
  border-radius: 11px; border: 1px solid var(--line); background: rgba(0,0,0,.32); color: var(--ink); }
textarea { min-height: 96px; height: 132px; resize: vertical; }
@media (max-height: 460px) { textarea { height: 72px; min-height: 60px; } .head { padding-top: 8px; padding-bottom: 6px; } }
input::placeholder, textarea::placeholder { color: #667084; }
input:focus, textarea:focus { outline: none; border-color: color-mix(in srgb, var(--accent) 65%, transparent); }
.count { float: right; font-weight: 450; }
details { font-size: 12.5px; color: var(--dim); margin: 2px 0 12px; }
summary { cursor: pointer; }
details ul { margin: 6px 0 0; padding-left: 18px; line-height: 1.6; word-break: break-all; }
p { margin: 0 0 12px; font-size: 13.5px; line-height: 1.5; color: var(--dim); }
.who { font-size: 12.5px; }
.row { display: flex; gap: 8px; align-items: center; }
.act { flex: 1; padding: 12px 14px; border-radius: 11px; border: 1px solid var(--line); background: rgba(255,255,255,.06);
  color: var(--ink); font-size: 15px; font-weight: 600; cursor: pointer; }
.act.primary { background: var(--accent); border-color: var(--accent); color: #0b0d12; }
.act[disabled] { opacity: .55; cursor: default; }
.status { min-height: 1em; margin: 0 0 8px; font-size: 13px; }
.status:empty { display: none; }
.send-row { position: sticky; bottom: -16px; margin: 0 -18px -16px; padding: 10px 18px 16px; background: var(--card); }
.status.err { color: #ff9b9b; }
.rule-note { font-size: 12.5px; padding: 8px 10px; border-radius: 10px; color: var(--ink);
  background: color-mix(in srgb, var(--accent) 10%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent); }
.rep { border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; margin: 0 0 10px; background: rgba(255,255,255,.025); }
.rep.today { border-color: color-mix(in srgb, var(--accent) 45%, transparent); }
.rep-title { display: block; font-size: 15px; margin-bottom: 4px; overflow-wrap: anywhere; overflow: hidden; contain: paint; }
.rep summary { cursor: pointer; font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
.rep summary .sum-status { font-weight: 450; color: var(--dim); }
.rep[open] summary { margin-bottom: 6px; }
.rep-meta { font-size: 12px; color: var(--dim); margin-bottom: 6px; }
.pill { display: inline-block; padding: 1px 8px; border-radius: 999px; font-weight: 650; background: rgba(255,255,255,.08); color: var(--ink); }
.pill.planned, .pill.done { background: rgba(80,200,130,.18); color: #9be3b9; }
.pill.wontfix { background: rgba(255,255,255,.06); color: var(--dim); }
.rep-body { contain: paint; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13.5px; line-height: 1.5; max-height: 180px; overflow-y: auto;
  padding: 8px 10px; border-radius: 9px; background: rgba(0,0,0,.28); margin-bottom: 10px; }
.add textarea { height: 76px; min-height: 60px; }
.closed { font-size: 12.5px; margin: 0; }
.closed.need { color: #ffd38a; margin: 0 0 8px; }
.reply { border-left: 3px solid var(--accent); background: color-mix(in srgb, var(--accent) 8%, transparent); border-radius: 0 9px 9px 0; padding: 8px 10px; margin: 0 0 10px; }
.reply-h { font-size: 12px; color: var(--dim); margin-bottom: 3px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.reply-h b { color: var(--ink); font-size: 12.5px; }
.reply-body { white-space: pre-wrap; overflow-wrap: anywhere; overflow: hidden; contain: paint; font-size: 13.5px; line-height: 1.5; color: var(--ink); }
.dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: #ff5d5d; box-shadow: 0 0 0 3px rgba(255,93,93,.22); margin-right: 6px; flex: 0 0 auto; vertical-align: 1px; }
.pill.in_progress, .pill.need_info { background: rgba(255,200,90,.18); color: #ffd38a; }
.pill.duplicate, .pill.cant_reproduce { background: rgba(255,255,255,.06); color: var(--dim); }
.earlier-h { margin: 14px 0 8px; font-size: 13px; color: var(--dim); font-weight: 650; text-transform: uppercase; letter-spacing: .05em; }
.status.ok { color: #8fe0ad; }
.done { text-align: center; padding: 8px 0 4px; }
.done .big { font-size: 34px; margin-bottom: 6px; }
.done b { display: block; font-size: 16px; margin-bottom: 4px; color: var(--ink); }
`;

/* -------------------------------------------------------------- rendering */

function h(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null) n.append(c);
  return n;
}

function trackViewport() {
  const vv = window.visualViewport;
  const set = () => {
    if (!host) return;
    const hgt = vv ? vv.height : innerHeight;
    const bottom = vv ? Math.max(0, innerHeight - (vv.height + vv.offsetTop)) : 0;
    host.style.setProperty("--vvh", `${Math.round(hgt)}px`);
    host.style.setProperty("--vvb", `${Math.round(bottom)}px`);
  };
  set();
  vv?.addEventListener("resize", set);
  vv?.addEventListener("scroll", set);
  addEventListener("resize", set);
  return () => { vv?.removeEventListener("resize", set); vv?.removeEventListener("scroll", set); removeEventListener("resize", set); };
}
let untrack = null;

function pageURL() {
  // No query or hash: they can carry share codes, room links or sign-in tokens.
  try { const u = new URL(location.href); return (u.origin + u.pathname).slice(0, 500); } catch (e) { return ""; }
}
function viewport() {
  const o = innerWidth > innerHeight ? "landscape" : "portrait";
  return `${innerWidth}x${innerHeight}@${Math.round((devicePixelRatio || 1) * 100) / 100} ${o}`;
}

function onKey(e) { if (e.key === "Escape" && host) { e.stopPropagation(); closeFeedback(); } }

export function closeFeedback() {
  if (!host) return;
  unsub?.(); unsub = null;
  untrack?.(); untrack = null;
  removeEventListener("keydown", onKey, true);
  host.remove();
  host = root = null;
  try { opts.onClose?.(); } catch (e) { /* game callback */ }
}

export function isFeedbackOpen() { return !!host; }

// options: { game (required, e.g. "clued"), build, accent, title, onClose, api }
export function openFeedback(options = {}) {
  if (!options.game) throw new Error("openFeedback needs { game }");
  if (host) closeFeedback();
  opts = options;
  host = document.createElement("div");
  host.id = "br8t-feedback";
  root = host.attachShadow({ mode: "open" });
  let accent = options.accent;
  if (!accent) try { accent = getComputedStyle(document.documentElement).getPropertyValue("--br8t-accent").trim(); } catch (e) { /* odd embeds */ }
  host.style.setProperty("--accent", accent || HOUSE_ACCENT);
  const style = document.createElement("style");
  style.textContent = CSS;
  const body = h("div", { class: "body" });
  const sheet = h("section", { class: "sheet", role: "dialog", "aria-modal": "false", "aria-labelledby": "fb-h" },
    h("div", { class: "head" },
      h("h2", { id: "fb-h" }, "Report a bug or suggest an idea", h("small", { text: options.title || "Goes straight to the developer" })),
      h("button", { class: "x", type: "button", "aria-label": "Close", "data-act": "close", onclick: closeFeedback, text: "×" })),
    body);
  root.append(style, sheet);
  document.body.appendChild(host);
  untrack = trackViewport();
  addEventListener("keydown", onKey, true);
  // Keys typed into the form must not reach game key handlers on window/document.
  sheet.addEventListener("keydown", e => { if (e.key !== "Escape") e.stopPropagation(); });
  sheet.addEventListener("keyup", e => e.stopPropagation());
  // Nor taps: games listen on window/document for input, and some close their own sheets on outside taps.
  for (const t of ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend", "click", "contextmenu"]) sheet.addEventListener(t, e => e.stopPropagation());
  body.append(h("p", { text: "Checking your sign-in…" }));
  settledAuth().then(a => {
    if (!host) return;
    const draw = () => { if (host) render(body, a); };
    draw();
    if (a?.onChange) { let first = true; unsub = a.onChange(() => { if (first) { first = false; return; } if (!body.querySelector("[data-state=form], [data-state=today], [data-state=sent]") || !a.signedIn) draw(); }); }
  });
  return { close: closeFeedback };
}

const STATUS = { new: "Received", seen: "Read", need_info: "Needs more info", in_progress: "In progress", planned: "Planned",
  done: "Done", wontfix: "Won’t fix", duplicate: "Already reported", cant_reproduce: "Couldn’t reproduce" };
const LOCKED = {
  in_progress: "Being worked on, so it’s closed for additions.", planned: "Planned, so it’s closed for additions.",
  done: "Done, so it’s closed for additions.", wontfix: "Closed, so it can’t be added to.",
  duplicate: "Someone reported this already, so it’s closed for additions.", cant_reproduce: "Closed: we couldn’t make it happen. If it’s still happening, send a new report.",
};
const ADD_MAX = 2000;
const addDrafts = {};

function localTime(unix) {
  try { return new Date(unix * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); } catch (e) { return ""; }
}
function shortDate(unix) {
  try { return new Date(unix * 1000).toLocaleDateString([], { day: "numeric", month: "short" }); } catch (e) { return ""; }
}

async function api(a, method, path, payload) {
  let token = null;
  try { token = await a.getIdToken(); } catch (e) { /* below */ }
  if (!token) return { ok: false, status: 401, error: "Your sign-in has expired. Sign in again and try once more." };
  let r;
  try {
    r = await fetch((opts.api || API) + path, {
      method, headers: { Authorization: `Bearer ${token}`, ...(payload ? { "Content-Type": "application/json" } : {}) },
      body: payload ? JSON.stringify(payload) : undefined,
    });
  } catch (e) { return { ok: false, status: 0, error: "Couldn’t reach the server. Check your connection and try again — your text is kept." }; }
  let j = null;
  try { j = await r.json(); } catch (e) { /* not JSON: a static host */ }
  if (r.ok) return { ok: true, status: r.status, data: j };
  const msg = (j && j.error) || "";
  if (r.status === 401) return { ok: false, status: 401, error: "Your sign-in has expired. Sign in again and try once more." };
  if (!msg && r.status < 500) return { ok: false, status: r.status, error: "Feedback can only be sent from games.br8t.com." };
  if (msg) return { ok: false, status: r.status, data: j, error: msg.charAt(0).toUpperCase() + msg.slice(1) + (/[.!?]$/.test(msg) ? "" : ".") };
  return { ok: false, status: r.status, error: "Something went wrong on our side. Please try again in a little while — your text is kept." };
}

async function render(body, a) {
  body.replaceChildren();
  if (!a || !a.signedIn) {
    body.append(
      h("p", { "data-state": "signed-out", text: "You must be signed in to send feedback. It’s free, and it means we can follow up on what you report." }),
      h("div", { class: "row" }, h("button", { class: "act primary", type: "button", "data-act": "signin", onclick: () => openSignIn(), text: a ? "Sign in" : "Sign-in isn’t available right now" })));
    if (!a) body.querySelector("[data-act=signin]").disabled = true;
    return;
  }
  body.append(h("p", { "data-state": "loading", text: "Loading your reports…" }));
  const res = await api(a, "GET", `feedback/mine?game=${encodeURIComponent(opts.game)}`);
  if (!host || !body.isConnected) return;
  const mine = res.ok ? res.data : null;
  const items = (mine && mine.items) || [];
  const today = items.find(i => i.id === mine?.todayId);
  const earlier = items.filter(i => i !== today);
  const resets = mine?.resetsAt ? localTime(mine.resetsAt) : "";
  body.replaceChildren(h("p", { class: "rule-note", "data-note": "one-a-day",
    text: `One open report per game per day — you can add to it any time.${today && resets ? ` A new one opens at ${resets}, or sooner if this one is closed.` : ""}` }));
  if (today) body.append(reportCard(a, today, true, mine.day));
  else body.append(newForm(a, body));
  if (earlier.length) {
    body.append(h("h3", { class: "earlier-h", text: "Your earlier reports" }),
      h("div", { class: "earlier", "data-list": "earlier" }, earlier.map(i => reportCard(a, i, false, mine.day))));
  }
  // The dots have been shown; tell the server so they don't come back next time.
  if (items.some(i => i.newReply)) api(a, "POST", "feedback/replies-seen", { game: opts.game });
}

// One of the player's reports. Today's is shown open; earlier ones are collapsed.
function reportCard(a, item, isToday, day) {
  const kind = KINDS.find(k => k.id === item.kind);
  const icon = kind ? kind.icon + " " : "";
  const text = h("div", { class: "rep-body", text: item.body });
  const kids = [
    h("div", { class: "rep-meta" }, h("span", { class: `pill ${item.status}`, text: STATUS[item.status] || item.status }),
      ` ${item.day === day ? "Today" : shortDate(item.created)}${item.updated ? ` · added to ${shortDate(item.updated)}` : ""}`),
    text,
    item.reply ? h("div", { class: "reply", "data-reply": item.id },
      h("div", { class: "reply-h" }, item.newReply ? h("i", { class: "dot", title: "New reply" }) : null,
        h("b", { text: "Reply from the developer" }), h("span", { text: ` · ${shortDate(item.replyAt)} ${localTime(item.replyAt)}` })),
      h("div", { class: "reply-body", text: item.reply })) : null,
    item.status === "need_info" && item.canAdd ? h("p", { class: "closed need", text: "The developer needs a bit more from you. Add it below." }) : null,
    item.canAdd ? addBox(a, item, text) : h("p", { class: "closed", text: LOCKED[item.status] || "This one is closed, so it can’t be added to." }),
  ];
  if (isToday) {
    return h("div", { class: "rep today", "data-report": item.id, "data-state": "today" },
      h("b", { class: "rep-title" }, icon, h("span", { text: item.title })), ...kids);
  }
  return h("details", { class: "rep", "data-report": item.id, open: item.newReply || null },
    h("summary", {}, item.newReply ? h("i", { class: "dot", title: "New reply" }) : null, icon, h("span", { text: item.title }), h("span", { class: "sum-status", text: ` · ${STATUS[item.status] || item.status}` })),
    ...kids);
}

function addBox(a, item, bodyEl) {
  const ta = h("textarea", { class: "add-text", maxlength: ADD_MAX, rows: 3, placeholder: "Add more: what else happened, or a detail you forgot?", "aria-label": `Add more to “${item.title}”` });
  ta.value = addDrafts[item.id] || "";
  const btn = h("button", { class: "act", type: "button", "data-act": "add", text: "Add to this report" });
  const st = h("p", { class: "status", role: "status", "aria-live": "polite" });
  ta.addEventListener("input", () => { addDrafts[item.id] = ta.value; st.textContent = ""; });
  ta.addEventListener("focus", () => setTimeout(() => ta.scrollIntoView({ block: "nearest" }), 300));
  btn.addEventListener("click", async () => {
    const t = ta.value.trim();
    st.className = "status err";
    if (!t) { st.textContent = "Write something to add first."; ta.focus(); return; }
    btn.disabled = true; btn.textContent = "Adding…"; st.textContent = "";
    const res = await api(a, "POST", `feedback/${item.id}/add`, { text: t });
    if (!host) return;
    btn.disabled = false; btn.textContent = "Add to this report";
    if (res.ok) {
      item.body = res.data?.body || item.body;
      bodyEl.textContent = item.body;
      bodyEl.scrollTop = bodyEl.scrollHeight;
      ta.value = ""; delete addDrafts[item.id];
      st.className = "status ok"; st.textContent = "Added. Thank you!";
      return;
    }
    st.textContent = res.error;
  });
  return h("div", { class: "add" }, ta, st, h("div", { class: "row" }, btn));
}

function newForm(a, body) {
  const d = drafts[opts.game] || (drafts[opts.game] = { kind: "bug", title: "", body: "" });
  const kindOf = () => KINDS.find(k => k.id === d.kind) || KINDS[0];
  const title = h("input", { id: "fb-title", type: "text", maxlength: TITLE_MAX, autocomplete: "off", enterkeyhint: "next", "data-f": "title" });
  const text = h("textarea", { id: "fb-body", maxlength: BODY_MAX, "data-f": "body" });
  const count = h("span", { class: "count" });
  const status = h("p", { class: "status", role: "status", "aria-live": "polite" });
  const send = h("button", { class: "act primary", type: "submit", "data-act": "send", text: "Send" });
  title.value = d.title; text.value = d.body;
  const chips = h("div", { class: "chips", role: "group", "aria-label": "Kind" }, KINDS.map(k =>
    h("button", { class: "chip", type: "button", "data-kind": k.id, "aria-pressed": String(d.kind === k.id),
      onclick: () => { d.kind = k.id; sync(); } }, `${k.icon} ${k.label}`)));
  const sync = () => {
    chips.querySelectorAll(".chip").forEach(c => c.setAttribute("aria-pressed", String(c.dataset.kind === d.kind)));
    title.placeholder = kindOf().title; text.placeholder = kindOf().body;
    count.textContent = `${text.value.length}/${BODY_MAX}`;
  };
  title.addEventListener("input", () => { d.title = title.value; status.textContent = ""; });
  text.addEventListener("input", () => { d.body = text.value; status.textContent = ""; sync(); });
  title.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); text.focus(); } });
  for (const f of [title, text]) f.addEventListener("focus", () => setTimeout(() => f.scrollIntoView({ block: "nearest" }), 300));
  const u = a.user || {};
  const who = u.name || u.email || "your account";
  const tech = [`Page: ${pageURL()}`, `Build: ${opts.build || "unknown"}`, `Screen: ${viewport()}`, `Browser: ${navigator.userAgent}`];
  const form = h("form", { "data-state": "form", novalidate: true },
    chips,
    h("label", { for: "fb-title", text: "Title" }), title,
    h("label", { for: "fb-body" }, "Description", count), text,
    h("details", {}, h("summary", { text: "Technical details are included automatically" }), h("ul", {}, tech.map(t => h("li", { text: t })))),
    h("p", { class: "who", text: `Sent from ${who}. We may reply about what you report.` }),
    status,
    h("div", { class: "row send-row" }, send));
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const t = title.value.trim(), b = text.value.trim();
    status.className = "status err";
    if (!t) { status.textContent = "Add a short title first."; title.focus(); return; }
    if (!b) { status.textContent = "Add a description so we can understand it."; text.focus(); return; }
    send.disabled = true; send.textContent = "Sending…"; status.className = "status"; status.textContent = "";
    const res = await api(a, "POST", "feedback", { game: opts.game, kind: d.kind, title: t, body: b, page: pageURL(), build: String(opts.build || ""), viewport: viewport() });
    if (!host) return;
    if (res.ok) {
      drafts[opts.game] = { kind: d.kind, title: "", body: "" };
      body.replaceChildren(h("div", { class: "done", "data-state": "sent" },
        h("div", { class: "big", text: d.kind === "idea" ? "💡" : "🐞" }),
        h("b", { text: "Thank you, that’s sent." }),
        h("p", { text: "Every report is read. You can add more to it any time while it’s open." }),
        h("div", { class: "row" },
          h("button", { class: "act", type: "button", "data-act": "add-more", onclick: () => render(body, a), text: "Add more" }),
          h("button", { class: "act primary", type: "button", "data-act": "done", onclick: closeFeedback, text: "Close" }))));
      return;
    }
    send.disabled = false; send.textContent = "Send";
    if (res.status === 409) {
      // Already sent one today (another tab or device): move their text into its add box.
      if (res.data?.id) addDrafts[res.data.id] = `${t}\n${b}`;
      drafts[opts.game] = { kind: d.kind, title: "", body: "" };
      await render(body, a);
      const st = body.querySelector(".today .status");
      if (st) { st.className = "status"; st.textContent = "You already sent one today, so your text is ready to add to it."; }
      return;
    }
    status.className = "status err"; status.textContent = res.error;
  });
  sync();
  return form;
}

/* --------------------------------------------------------------- the row */

// A Settings button. Signed out it reads as disabled ("Sign in to send feedback") and a tap
// opens sign-in; signed in it opens the panel. `className` gives it the game's own button
// style; `note` (an element) gets a one-line explanation kept in step with the state;
// `paint(btn, signedIn)` replaces the plain label for games whose rows have inner markup.
export function feedbackButton(options = {}) {
  const { className, label = "Send feedback", signedOutLabel = "Sign in to send feedback", note } = options;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.dataset.br8tFeedback = "loading";
  if (className) btn.className = className;
  else btn.style.cssText = "padding:8px 14px;border-radius:10px;border:1px solid rgba(127,127,127,.45);background:rgba(127,127,127,.12);color:inherit;font:inherit;font-weight:600;cursor:pointer";
  btn.style.whiteSpace = "nowrap";
  btn.textContent = label;
  let signedIn = false;
  const paint = () => {
    btn.dataset.br8tFeedback = signedIn ? "ready" : "signed-out";
    if (options.paint) options.paint(btn, signedIn); else btn.textContent = signedIn ? label : signedOutLabel;
    btn.setAttribute("aria-disabled", String(!signedIn));
    btn.title = signedIn ? "Report a bug or suggest an idea" : "You must be signed in to use this";
    btn.style.opacity = signedIn ? "" : "0.55";
    if (note) note.textContent = signedIn ? "Goes straight to the developer." : "You must be signed in to use this.";
  };
  btn.addEventListener("click", e => {
    e.preventDefault(); e.stopPropagation();
    if (signedIn) openFeedback(options); else openSignIn();
  });
  paint();
  settledAuth().then(a => {
    signedIn = !!(a && a.signedIn); paint();
    if (!a?.onChange) return;
    let off = null;
    off = a.onChange(() => {
      if (!btn.isConnected) { off?.(); return; }
      signedIn = !!a.signedIn; paint();
    });
  });
  return btn;
}
