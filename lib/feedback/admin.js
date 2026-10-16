// br8t feedback admin page. Loaded as a file (not inline) so the page CSP can be script-src 'self'.
import { auth, mountAccount } from "/lib/auth/ui.js";

const API = "/api/br8t/admin/feedback";
const STATUSES = ["new", "seen", "need_info", "in_progress", "planned", "done", "wontfix", "duplicate", "cant_reproduce"];
const LABEL = { new: "new", seen: "seen", need_info: "need info", in_progress: "in progress", planned: "planned", done: "done", wontfix: "won't fix", duplicate: "duplicate", cant_reproduce: "can't reproduce" };
const drafts = {}; // unsaved note/reply text per report, kept across re-renders
const $ = id => document.getElementById(id);
let items = [], next = 0, selected = null;

function h(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v; else if (k === "text") n.textContent = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null) n.append(c);
  return n;
}
const when = t => new Date(t * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

async function call(path, init = {}) {
  const token = await auth.getIdToken();
  if (!token) throw Object.assign(new Error("Sign in with your admin account."), { status: 401 });
  const r = await fetch(API + path, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}) } });
  let j = null; try { j = await r.json(); } catch (e) { /* not JSON */ }
  if (!r.ok) throw Object.assign(new Error(j?.error || `HTTP ${r.status}`), { status: r.status });
  return j;
}

function gate(text, signIn) {
  $("app").hidden = true; $("gate").hidden = false;
  $("gate").replaceChildren(h("p", { text }), signIn ? h("button", { type: "button", text: "Sign in", onclick: () => document.getElementById("br8t-account")?.shadowRoot?.querySelector(".fab")?.click() }) : "");
}

function query(before) {
  const p = new URLSearchParams();
  for (const [k, id] of [["game", "fGame"], ["status", "fStatus"], ["kind", "fKind"], ["sort", "fSort"]]) if ($(id).value) p.set(k, $(id).value);
  if ($("fUpd").checked) p.set("updated", "1");
  if (before) p.set("offset", before);
  p.set("limit", "50");
  return "?" + p;
}

async function load(append = false) {
  try {
    const j = await call(query(append ? next : 0));
    $("gate").hidden = true; $("app").hidden = false;
    items = append ? items.concat(j.items) : j.items; next = j.next;
    const g = $("fGame"), cur = g.value;
    g.replaceChildren(h("option", { value: "", text: "All games" }), ...j.games.map(x => h("option", { value: x, text: x })));
    g.value = cur;
    $("counts").replaceChildren(...STATUSES.map(s => h("span", { text: `${LABEL[s]} ${j.counts[s] || 0}` })), h("span", { text: `added to since seen ${j.counts.updated || 0}` }));
    drawList();
    $("more").hidden = !next;
    if (selected && !items.some(i => i.id === selected)) { selected = null; $("detail").replaceChildren(h("p", { class: "muted", text: "Pick a report to read it." })); }
  } catch (e) {
    if (e.status === 401) gate("Sign in with your admin account to read feedback.", true);
    else if (e.status === 403) gate("This account isn't a br8t admin. Sign in with an admin account.", true);
    else gate(`Couldn't load feedback: ${e.message}`);
  }
}

function drawList() {
  $("list").replaceChildren(...(items.length ? items.map(i => h("button", { type: "button", class: "item" + (i.id === selected ? " sel" : ""), onclick: () => show(i.id) },
    h("b", { text: i.title }),
    h("small", {}, h("span", { class: `tag ${i.kind}`, text: i.kind }), h("span", { class: `tag ${i.status}`, text: LABEL[i.status] || i.status }), i.updatedSinceSeen ? h("span", { class: "tag upd", text: "added to" }) : "", i.reply ? h("span", { class: "tag", text: "replied" }) : "", `${i.game} · ${when(i.created)}${i.additions ? ` · +${i.additions}` : ""} · #${i.id}`)))
    : [h("p", { class: "muted", text: "Nothing here." })]));
}

function show(id) {
  selected = id; drawList();
  const i = items.find(x => x.id === id);
  const d = drafts[id] || (drafts[id] = {});
  const note = h("textarea", { "aria-label": "Private note", maxlength: "2000", placeholder: "Private note: only admins see this" });
  note.value = d.note ?? i.note ?? ""; note.oninput = () => { d.note = note.value; };
  const replyBox = h("textarea", { "aria-label": "Public reply", maxlength: "2000", placeholder: "Public reply: the player sees this as “Reply from the developer”" });
  replyBox.value = d.reply ?? i.reply ?? ""; replyBox.oninput = () => { d.reply = replyBox.value; };
  const msg = h("p", { class: "msg", role: "status" });
  const save = async patch => {
    msg.className = "msg"; msg.textContent = "Saving…";
    try {
      Object.assign(i, await call(`/${i.id}`, { method: "POST", body: JSON.stringify(patch) }));
      if ("note" in patch) delete d.note;
      if ("reply" in patch) delete d.reply;
      drawList(); show(i.id); $("detail").querySelector(".msg").textContent = "Saved.";
    }
    catch (e) { msg.className = "msg err"; msg.textContent = e.message; }
  };
  $("detail").replaceChildren(
    h("div", {}, h("span", { class: `tag ${i.kind}`, text: i.kind }), h("span", { class: `tag ${i.status}`, text: LABEL[i.status] || i.status }), i.updatedSinceSeen ? h("span", { class: "tag upd", text: "added to since seen" }) : "", h("span", { class: "muted", text: `#${i.id} · ${i.game}` })),
    h("h2", { text: i.title }),
    h("div", { class: "text", text: i.body }),
    h("dl", {}, [["From", ([i.name, i.email].filter(Boolean).join(" · ") || "(no email)") + (i.emailVerified ? "" : " · unverified")], ["UID", i.uid], ["Sent", when(i.created)], ["Page", i.page], ["Build", i.build], ["Screen", i.viewport], ["Browser", i.ua], ["Additions", i.additions ? `${i.additions}, last ${when(i.playerUpdated)}` : "none"], ["Seen by admin", i.seenAt ? when(i.seenAt) : "not yet"]]
      .flatMap(([k, v]) => [h("dt", { text: k }), h("dd", { text: v || "—" })])),
    h("div", { class: "bar" }, STATUSES.map(s => h("button", { type: "button", "data-status": s, class: s === i.status ? "on" : "", text: LABEL[s], onclick: () => save({ status: s }) }))),
    h("p", { class: "muted", style: "font-size:13px;margin:4px 0", text: "Players can add to new, seen and need info. Any other status locks the report and frees their one-a-day slot." }),
    h("label", { class: "lbl", text: "Public reply" }),
    i.reply ? h("p", { class: "muted", style: "font-size:13px;margin:2px 0 6px", text: `Sent ${when(i.replyAt)} · ${i.playerSeenReply >= i.replyAt ? "the player has seen it" : "not seen by the player yet"}` }) : "",
    replyBox,
    h("div", { class: "bar" }, h("button", { type: "button", "data-act": "save-reply", text: "Save reply", onclick: () => save({ reply: replyBox.value }) })),
    h("label", { class: "lbl", text: "Private note" }),
    note,
    h("div", { class: "bar" }, h("button", { type: "button", "data-act": "save-note", text: "Save note", onclick: () => save({ note: note.value }) })),
    msg);
  if (i.status === "new") save({ status: "seen" });
  else if (i.updatedSinceSeen) save({ seen: true });
}

for (const s of STATUSES) $("fStatus").append(h("option", { value: s, text: LABEL[s] }));
for (const id of ["fGame", "fStatus", "fKind", "fSort", "fUpd"]) $(id).addEventListener("change", () => load());
$("reload").onclick = () => load();
$("more").onclick = () => load(true);
$("copy").onclick = async () => {
  // No account identifiers in the clipboard, and a header that says what this is to whoever reads it.
  const safe = items.map(({ email, uid, name, ...rest }) => rest);
  try { await navigator.clipboard.writeText("untrusted player text:\n" + JSON.stringify(safe, null, 2)); $("copy").textContent = `Copied ${items.length}`; }
  catch (e) { $("copy").textContent = "Copy failed"; }
  setTimeout(() => { $("copy").textContent = "Copy as JSON"; }, 1800);
};

window.__fbAdmin = { load }; // test hook (games/tools/feedback_e2e.mjs)
mountAccount({});
let lastUid;
auth.onChange(u => { if (u?.uid === lastUid) return; lastUid = u?.uid; if (u && !u.anon) load(); else gate("Sign in with your admin account to read feedback.", true); });
auth.ready().then(u => { if (!u) gate("Sign-in isn't available right now."); });
