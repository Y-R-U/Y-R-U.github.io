// br8t files — single-page front end. No framework, no build step.
//
// State lives in `S`; every view is a render function that writes into #main.
// Anything destructive goes through confirmDanger() rather than window.confirm.

const S = {
  user: null,
  limits: {},
  tab: "projects",
  project: null,   // active project record
  files: [],       // FileEntry[] for the active project
  dirs: [],        // folder paths, incl. empty ones (they aren't in `files`)
  cwd: "",         // folder being browsed; "" is the project root
  // "browse" shows one folder at a time; "tree" shows the whole nested
  // structure. Both share S.cwd as the target for new files and uploads.
  view: localStorage.getItem("fs_view") === "tree" ? "tree" : "browse",
  expanded: new Set(),  // tree view: which folders are open
  open: null,      // { path, text, dirty }  — the open file
  pages: [],       // rich-text pages belonging to the project (metadata only)
  page: null,      // { id, name, access, html, dirty, canEdit } — the open page
  ownerFilter: "", // admin: filter projects by lead
  // Admin only. `realRole` is what the account actually is; `acting` says it has
  // switched into lead mode, in which case S.user.role already reads "lead".
  realRole: "",
  acting: false,
  here: [],        // other people in this project, from the heartbeat
  behind: null,    // a newer save landed while this client had unsaved edits
  beatSeconds: 8,
};

/* ─────────────────────────────────────────────────────── helpers */

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids.flat()) if (k != null) n.append(k);
  return n;
};

function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Extension of a path's final segment, lowercased ("" when there isn't one).
// A bare lastIndexOf(".") on the whole path picks up dots in parent folder
// names, and returns -1 for extension-less names — slicing off the last
// character instead of nothing. Matches Go's path.Ext, including ".gitignore".
function extOf(p) {
  const base = String(p).slice(String(p).lastIndexOf("/") + 1);
  const i = base.lastIndexOf(".");
  return i >= 0 ? base.slice(i).toLowerCase() : "";
}

function fmtBytes(n) {
  if (n == null) return "—";
  if (n < 1024) return n + " B";
  const u = ["KB", "MB", "GB", "TB"];
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return (n < 10 ? n.toFixed(1) : Math.round(n)) + " " + u[i];
}

function fmtDate(sec) {
  if (!sec) return "—";
  const d = new Date(sec * 1000);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { day: "numeric", month: "short", year: "2-digit" });
}

function toast(msg, kind = "") {
  const t = el("div", { className: "toast " + kind, textContent: msg });
  $("#toasts").append(t);
  setTimeout(() => {
    t.style.transition = "opacity .3s"; t.style.opacity = "0";
    setTimeout(() => t.remove(), 300);
  }, kind === "bad" ? 6000 : 3200);
}

/* ─────────────────────────────────────────────────────────── api */

async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: opts.body ? { "Content-Type": "application/json" } : {},
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty body is fine */ }

  if (res.status === 401) { S.user = null; showLogin(); throw new Error("signed out"); }
  // The server flags a forced reset with a code rather than a status alone.
  if (res.status === 403 && data.code === "must_reset") { showReset(); throw new Error("reset required"); }
  if (!res.ok) throw new Error(data.error || `request failed (${res.status})`);
  return data;
}

/* ───────────────────────────────────────────────────────── modal */

// Renders a modal and resolves with the caller's chosen value (null on cancel).
function modal(build) {
  return new Promise(resolve => {
    const host = $("#modal-host"), box = $("#modal");
    let done = false;
    const close = v => {
      if (done) return;
      done = true;
      host.hidden = true; box.innerHTML = "";
      document.removeEventListener("keydown", onKey);
      resolve(v);
    };
    const onKey = e => { if (e.key === "Escape") close(null); };

    box.innerHTML = "";
    build(box, close);
    host.hidden = false;
    document.addEventListener("keydown", onKey);
    host.querySelector("[data-close]").onclick = () => close(null);
    const first = box.querySelector("input, textarea, button.primary, button");
    if (first) setTimeout(() => first.focus(), 40);
  });
}

// A styled replacement for window.confirm, used for anything destructive.
// When `typeToConfirm` is set the user must type that exact text to arm the button.
function confirmDanger({ title, warning, detail, confirmLabel = "Delete", typeToConfirm = null }) {
  return modal((box, close) => {
    box.innerHTML = `
      <h3>${esc(title)}</h3>
      <div class="danger-head">
        <div class="mark">⚠️</div>
        <div><strong>${esc(warning)}</strong><span>${detail ? esc(detail) : ""}</span></div>
      </div>
      ${typeToConfirm ? `
        <div class="confirmbox">
          <label style="margin:0">Type <b class="mono">${esc(typeToConfirm)}</b> to confirm
            <input id="dc-input" autocomplete="off" spellcheck="false" placeholder="${esc(typeToConfirm)}">
          </label>
        </div>` : ""}
      <div class="actions">
        <button class="btn" id="dc-cancel">Cancel</button>
        <button class="btn danger solid" id="dc-ok">${esc(confirmLabel)}</button>
      </div>`;
    const ok = $("#dc-ok", box);
    $("#dc-cancel", box).onclick = () => close(null);
    ok.onclick = () => close(true);
    if (typeToConfirm) {
      const inp = $("#dc-input", box);
      ok.disabled = true;
      inp.oninput = () => { ok.disabled = inp.value.trim() !== typeToConfirm; };
      inp.onkeydown = e => { if (e.key === "Enter" && !ok.disabled) close(true); };
    }
  });
}

function promptModal({ title, label, value = "", placeholder = "", okLabel = "Save" }) {
  return modal((box, close) => {
    box.innerHTML = `
      <h3>${esc(title)}</h3>
      <label>${esc(label)}<input id="pm-input" value="${esc(value)}" placeholder="${esc(placeholder)}" spellcheck="false"></label>
      <div class="actions">
        <button class="btn" id="pm-cancel">Cancel</button>
        <button class="btn primary" id="pm-ok">${esc(okLabel)}</button>
      </div>`;
    const inp = $("#pm-input", box);
    const submit = () => { const v = inp.value.trim(); if (v) close(v); };
    $("#pm-cancel", box).onclick = () => close(null);
    $("#pm-ok", box).onclick = submit;
    inp.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); submit(); } };
  });
}

// Shows a generated password once, with a copy button.
function showPassword(username, password) {
  return modal((box, close) => {
    box.innerHTML = `
      <h3>Account ready</h3>
      <p><b>${esc(username)}</b> can sign in with this password. It is shown
         <b>once</b> — copy it now and pass it on. They must change it at first login.</p>
      <div class="pwbox" id="pw-val">${esc(password)}</div>
      <div class="actions">
        <button class="btn" id="pw-copy">Copy password</button>
        <button class="btn primary" id="pw-done">Done</button>
      </div>`;
    $("#pw-copy", box).onclick = async () => {
      try { await navigator.clipboard.writeText(password); toast("Password copied", "good"); }
      catch { toast("Select the password and copy it manually", "bad"); }
    };
    $("#pw-done", box).onclick = () => close(true);
  });
}

/* ─────────────────────────────────────────────────── auth screens */

function showLogin(msg) {
  $("#boot").hidden = true;
  $("#app").hidden = true;
  $("#view-reset").hidden = true;
  $("#view-login").hidden = false;
  const e = $("#login-err");
  e.hidden = !msg; e.textContent = msg || "";
}

function showReset() {
  $("#boot").hidden = true;
  $("#app").hidden = true;
  $("#view-login").hidden = true;
  $("#view-reset").hidden = false;
}

$("#login-form").addEventListener("submit", async e => {
  e.preventDefault();
  const btn = $("#login-form button");
  btn.disabled = true;
  try {
    const r = await api("/api/login", {
      method: "POST",
      body: { username: $("#login-user").value, password: $("#login-pass").value },
    });
    $("#login-pass").value = "";
    S.user = r.user;
    if (S.user.mustReset) { showReset(); return; }
    await boot();
  } catch (err) {
    showLogin(err.message);
  } finally {
    btn.disabled = false;
  }
});

$("#reset-form").addEventListener("submit", async e => {
  e.preventDefault();
  const err = $("#reset-err");
  err.hidden = true;
  const cur = $("#reset-current").value, a = $("#reset-new").value, b = $("#reset-new2").value;
  if (a !== b) { err.hidden = false; err.textContent = "The new passwords don't match."; return; }
  const btn = $("#reset-form button");
  btn.disabled = true;
  try {
    await api("/api/password", { method: "POST", body: { current: cur, new: a } });
    $("#reset-form").reset();
    toast("Password set", "good");
    await boot();
  } catch (e2) {
    err.hidden = false; err.textContent = e2.message;
  } finally {
    btn.disabled = false;
  }
});

$("#btn-logout").onclick = async () => {
  await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
  S.user = null;
  location.reload();
};

$("#btn-changepw").onclick = () => modal((box, close) => {
  box.innerHTML = `
    <h3>Change password</h3>
    <label>Current password<input type="password" id="cp-cur" autocomplete="current-password"></label>
    <label>New password<input type="password" id="cp-new" autocomplete="new-password"></label>
    <label>Confirm new password<input type="password" id="cp-new2" autocomplete="new-password"></label>
    <p class="err" id="cp-err" hidden></p>
    <div class="actions">
      <button class="btn" id="cp-cancel">Cancel</button>
      <button class="btn primary" id="cp-ok">Change password</button>
    </div>`;
  const err = $("#cp-err", box);
  $("#cp-cancel", box).onclick = () => close(null);
  $("#cp-ok", box).onclick = async () => {
    const a = $("#cp-new", box).value, b = $("#cp-new2", box).value;
    if (a !== b) { err.hidden = false; err.textContent = "The new passwords don't match."; return; }
    try {
      await api("/api/password", { method: "POST", body: { current: $("#cp-cur", box).value, new: a } });
      close(true); toast("Password changed", "good");
    } catch (e) { err.hidden = false; err.textContent = e.message; }
  };
});

$("#nav-home").onclick = () => { S.project = null; S.tab = "projects"; render(); };
$("#who-name").onclick = changeNameFlow;

/* ────────────────────────────────────────────────────────── boot */

async function boot() {
  const me = await api("/api/me");
  if (!me.user) { showLogin(); return; }
  if (me.user.mustReset) { S.user = me.user; showReset(); return; }

  S.user = me.user;
  S.limits = me.limits || {};
  S.acting = !!me.user.actingAsLead;
  S.realRole = me.user.realRole || me.user.role;
  $("#boot").hidden = true;
  $("#view-login").hidden = true;
  $("#view-reset").hidden = true;
  $("#app").hidden = false;
  $("#app").classList.toggle("acting", S.acting);

  $("#who-name").textContent = S.user.displayName || S.user.username;
  const role = $("#who-role");
  role.textContent = S.user.role;
  role.className = "badge " + S.user.role;

  renderRoleSwitch();
  renderTabs();
  render();
  startHeartbeat();
}

// The admin's ADMIN / LEAD switch. Admin can see everything and change almost
// nothing, so testing anything real means being a lead: this puts the account
// in a lead's shoes for the session, with the switch itself the only thing a
// lead wouldn't have.
function renderRoleSwitch() {
  const host = $("#role-switch");
  host.hidden = S.realRole !== "admin";
  if (host.hidden) return;
  host.innerHTML = "";
  for (const [mode, label, title] of [
    ["admin", "Admin", "Your own account: sees every project, changes none of them"],
    ["lead", "Lead", "Act as a lead: create and edit your own projects, pages and users"],
  ]) {
    const on = (mode === "lead") === S.acting;
    const b = el("button", { className: on ? "on" : "", textContent: label, title });
    b.onclick = () => setActing(mode === "lead");
    host.append(b);
  }
}

async function setActing(asLead) {
  if (S.acting === asLead) return;
  if (!(await confirmDiscard())) return;
  try {
    await api("/api/acting", { method: "POST", body: { asLead } });
    S.project = null; S.open = null; S.page = null;
    S.tab = "projects"; S.ownerFilter = "";
    await boot();
    toast(asLead
      ? "Acting as a lead — projects you create here are your own"
      : "Back to your admin account", "good");
  } catch (e) { toast(e.message, "bad"); }
}

function tabsFor() {
  const t = [["projects", "Projects"]];
  if (S.user.role === "lead") t.push(["users", "Users"], ["people", "People"]);
  if (S.user.role === "admin") t.push(["users", "Leads"], ["admin", "Server"]);
  return t;
}

function renderTabs() {
  const nav = $("#tabs");
  nav.innerHTML = "";
  for (const [id, label] of tabsFor()) {
    const b = el("button", { textContent: label, className: S.tab === id ? "on" : "" });
    b.onclick = () => { S.tab = id; S.project = null; render(); };
    nav.append(b);
  }
}

function render() {
  renderTabs();
  const m = $("#main");
  m.innerHTML = "";
  if (S.project) return renderProject(m);
  if (S.tab === "people") return renderPeople(m);
  if (S.tab === "users") return renderUsers(m);
  if (S.tab === "admin") return renderAdmin(m);
  return renderProjects(m);
}

/* ──────────────────────────────────────────────── projects list */

async function renderProjects(m) {
  m.append(el("div", { className: "empty", textContent: "Loading projects…" }));
  let data;
  try {
    const q = S.user.role === "admin" && S.ownerFilter ? `?owner=${S.ownerFilter}` : "";
    data = await api("/api/projects" + q);
  } catch (e) { m.innerHTML = ""; m.append(el("p", { className: "err", textContent: e.message })); return; }

  m.innerHTML = "";
  const head = el("div", { className: "page-head" }, el("h2", { textContent: "Projects" }));
  head.append(el("div", { className: "spacer" }));

  // Admin: narrow the all-projects view to a single lead.
  if (S.user.role === "admin" && data.leads) {
    const sel = el("select");
    sel.style.width = "auto";
    sel.append(el("option", { value: "", textContent: `All leads (${data.leads.length})` }));
    for (const l of data.leads) {
      sel.append(el("option", {
        value: String(l.id), textContent: `${l.username} — ${l.projects} project${l.projects === 1 ? "" : "s"}`,
        selected: String(l.id) === S.ownerFilter,
      }));
    }
    sel.onchange = () => { S.ownerFilter = sel.value; render(); };
    head.append(sel);
  }

  if (data.canCreate) {
    const b = el("button", { className: "btn primary", textContent: "+ New project" });
    b.onclick = createProject;
    head.append(b);
  }
  m.append(head);

  if (S.acting) {
    m.append(el("p", { className: "hint" },
      "You're acting as a lead, so this is only the projects you own — switch back to Admin in the top bar to see everyone's."));
  }

  if (!data.projects.length) {
    m.append(el("div", { className: "empty" },
      data.canCreate ? "No projects yet. Create one to start uploading files."
      : S.user.role === "admin"
        ? (S.ownerFilter ? "That lead hasn't created any projects yet."
                         : "No projects on the server yet. Create a lead, and they'll create the projects.")
        : "You don't have access to any projects yet. Ask your lead to add you."));
    return;
  }

  const grid = el("div", { className: "grid" });
  for (const p of data.projects) {
    const pct = p.quotaBytes ? Math.min(100, (p.usedBytes / p.quotaBytes) * 100) : 0;
    const tile = el("button", { className: "tile" });
    tile.innerHTML = `
      <h3>${esc(p.name)}</h3>
      <div class="meta">${p.fileCount} file${p.fileCount === 1 ? "" : "s"} · owned by ${esc(p.ownerName)}</div>
      <div class="bar ${pct > 90 ? "full" : pct > 75 ? "warn" : ""}"><i style="width:${pct}%"></i></div>
      <div class="meta">${fmtBytes(p.usedBytes)} of ${fmtBytes(p.quotaBytes)}</div>`;
    tile.onclick = () => openProject(p.id);
    grid.append(tile);
  }
  m.append(grid);
}

async function createProject() {
  const name = await promptModal({
    title: "New project", label: "Project name",
    placeholder: "My Addon", okLabel: "Create",
  });
  if (!name) return;
  try {
    const r = await api("/api/projects", { method: "POST", body: { name } });
    toast(`Created “${r.project.name}”`, "good");
    openProject(r.project.id);
  } catch (e) { toast(e.message, "bad"); }
}

async function openProject(id) {
  try {
    const r = await api(`/api/projects/${id}`);
    S.project = r.project;
    S.project.canManage = r.canManage;
    S.open = null;
    S.page = null;
    S.cwd = "";
    await Promise.all([loadFiles(), loadPages()]);
    render();
  } catch (e) { toast(e.message, "bad"); }
}

async function loadFiles() {
  const r = await api(`/api/projects/${S.project.id}/files`);
  S.files = r.files;
  S.dirs = r.dirs || [];
  if (r.project) Object.assign(S.project, r.project);
  // The folder being browsed may have just been deleted or renamed out from
  // under us; walk back up until we land somewhere that still exists.
  while (S.cwd && !S.dirs.includes(S.cwd)) S.cwd = parentOf(S.cwd);
}

async function loadPages() {
  const r = await api(`/api/projects/${S.project.id}/pages`);
  S.pages = r.pages || [];
}

/* ───────────────────────────────────────────── project workspace */

const canWrite = () => S.user.role !== "admin";

function renderProject(m) {
  const p = S.project;
  const pct = p.quotaBytes ? Math.min(100, (p.usedBytes / p.quotaBytes) * 100) : 0;

  const head = el("div", { className: "page-head" });
  const back = el("button", { className: "btn ghost sm", textContent: "← Projects" });
  back.onclick = () => { S.project = null; render(); };
  head.append(back, el("h2", { textContent: p.name }),
    el("span", { className: "crumb", textContent: `${fmtBytes(p.usedBytes)} / ${fmtBytes(p.quotaBytes)}` }),
    el("div", { className: "spacer" }));

  const zipBtn = el("button", { className: "btn sm", textContent: "⬇ Download .zip" });
  zipBtn.onclick = () => { location.href = `/api/projects/${p.id}/zip`; };
  head.append(zipBtn);

  if (canWrite()) {
    const impBtn = el("button", { className: "btn sm", textContent: "⬆ Upload .zip" });
    impBtn.onclick = importZip;
    head.append(impBtn);
  }
  if (p.canManage) {
    const usersBtn = el("button", { className: "btn sm", textContent: "👥 Access" });
    usersBtn.onclick = manageAccess;
    const delBtn = el("button", { className: "btn danger sm", textContent: "Delete project" });
    delBtn.onclick = deleteProjectFlow;
    head.append(usersBtn, delBtn);
  }
  m.append(head);

  const barWrap = el("div", { className: `bar ${pct > 90 ? "full" : pct > 75 ? "warn" : ""}` },
    el("i", { style: `width:${pct}%` }));
  m.append(barWrap);

  if (S.user.role === "admin") {
    m.append(el("p", { className: "hint", style: "margin:8px 0 0",
      textContent: "You're signed in as admin — this view is read-only. Files are managed by the project's lead and users." }));
  }

  // Filled in by the heartbeat rather than by render(), so it can update while
  // somebody is typing.
  m.append(el("div", { className: "here", id: "here", hidden: true }));

  const work = el("div", { className: "work" });
  work.style.marginTop = "14px";
  // Left column: the file list, with the project's pages listed under it.
  const side = el("div", { className: "sidecol" }, buildTreePanel(), buildPagesPanel());
  work.append(side, buildEditorPanel());
  m.append(work);
  renderHere();
}

/* ---- file browser ---- */

// Everything below works on S.cwd, the folder currently being browsed ("" is
// the project root). Paths sent to the API are always full and project-relative.
const joinPath = (dir, name) => (dir ? `${dir}/${name}` : name);
const parentOf = p => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");

// The immediate children of S.cwd: subfolders first, then files.
function currentEntries() {
  const cwd = S.cwd;
  const prefix = cwd ? cwd + "/" : "";

  const dirs = new Set();
  // Folders come from both the on-disk list (so empty ones show up) and from
  // the paths of files, which covers any folder the walk somehow missed.
  for (const d of S.dirs) {
    if (!d.startsWith(prefix)) continue;
    const rest = d.slice(prefix.length);
    if (rest && !rest.includes("/")) dirs.add(rest);
  }
  const files = [];
  for (const f of S.files) {
    if (!f.path.startsWith(prefix)) continue;
    const rest = f.path.slice(prefix.length);
    if (!rest) continue;
    if (rest.includes("/")) dirs.add(rest.slice(0, rest.indexOf("/")));
    else files.push({ ...f, name: rest });
  }
  return {
    dirs: [...dirs].sort((a, b) => a.localeCompare(b)),
    files: files.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

// Navigates to a folder, clearing it if it no longer exists.
function goTo(dir) {
  S.cwd = dir || "";
  render();
}

function setView(v) {
  S.view = v;
  localStorage.setItem("fs_view", v);
  // Moving to the tree, open the path down to wherever the user was, so the
  // folder they were just in is on screen rather than collapsed away.
  if (v === "tree" && S.cwd) {
    let acc = "";
    for (const seg of S.cwd.split("/")) { acc = joinPath(acc, seg); S.expanded.add(acc); }
  }
  render();
}

// All folders in the project, nested — built from the on-disk dir list plus
// any folder implied by a file path.
function buildTreeModel() {
  const root = { dirs: new Map(), files: [] };
  const ensure = segs => {
    let node = root;
    for (const s of segs) {
      if (!node.dirs.has(s)) node.dirs.set(s, { dirs: new Map(), files: [] });
      node = node.dirs.get(s);
    }
    return node;
  };
  for (const d of S.dirs) ensure(d.split("/"));
  for (const f of S.files) {
    const parts = f.path.split("/");
    ensure(parts.slice(0, -1)).files.push({ ...f, name: parts[parts.length - 1] });
  }
  return root;
}

function renderTreeNode(host, node, prefix, depth) {
  for (const [name, child] of [...node.dirs.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const full = joinPath(prefix, name);
    const isOpen = S.expanded.has(full);
    const row = el("button", { className: "row" + (S.cwd === full ? " target" : "") });
    row.style.paddingLeft = `${8 + depth * 14}px`;
    row.innerHTML = `<span class="ico">${isOpen ? "📂" : "📁"}</span>
                     <span class="nm">${esc(name)}</span>
                     <span class="sz">${dirSummary(full)}</span>`;
    // One click both expands and makes this the target folder, so "+ File" and
    // uploads land where the user is looking — same meaning as in browse view.
    row.onclick = () => {
      if (isOpen && S.cwd === full) S.expanded.delete(full);
      else S.expanded.add(full);
      goTo(full);
    };
    if (canWrite()) row.oncontextmenu = e => { e.preventDefault(); entryMenu(full, true); };
    host.append(row);
    if (isOpen) renderTreeNode(host, child, full, depth + 1);
  }
  for (const f of node.files.sort((a, b) => a.name.localeCompare(b.name))) {
    const row = el("button", { className: "row" + (S.open?.path === f.path ? " on" : "") });
    row.style.paddingLeft = `${8 + depth * 14}px`;
    row.innerHTML = `<span class="ico">${iconFor(f.name)}</span>
                     <span class="nm">${esc(f.name)}</span>
                     <span class="sz">${fmtBytes(f.size)}</span>`;
    row.onclick = () => openFile(f.path);
    if (canWrite()) row.oncontextmenu = e => { e.preventDefault(); entryMenu(f.path, false); };
    host.append(row);
  }
}

function buildBreadcrumb() {
  const bar = el("div", { className: "crumbs" });
  const parts = S.cwd ? S.cwd.split("/") : [];

  const root = el("button", { className: "crumb-btn" + (parts.length ? "" : " on"), textContent: "📦 " + S.project.name });
  root.onclick = () => goTo("");
  bar.append(root);

  let acc = "";
  parts.forEach((seg, i) => {
    acc = joinPath(acc, seg);
    const target = acc;
    bar.append(el("span", { className: "crumb-sep", textContent: "›" }));
    const b = el("button", {
      className: "crumb-btn" + (i === parts.length - 1 ? " on" : ""),
      textContent: seg,
    });
    b.onclick = () => goTo(target);
    bar.append(b);
  });
  return bar;
}

function iconFor(name) {
  const ext = extOf(name);
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".tga", ".bmp"].includes(ext)) return "🖼";
  if ([".mp4", ".webm", ".mov", ".mkv"].includes(ext)) return "🎬";
  if ([".mp3", ".ogg", ".wav", ".m4a", ".fsb"].includes(ext)) return "🎵";
  if ([".zip", ".mcaddon", ".mcpack", ".mcworld", ".mctemplate"].includes(ext)) return "📦";
  if ([".doc", ".docx", ".pdf", ".odt"].includes(ext)) return "📄";
  if (ext === ".json") return "🔧";
  return "📃";
}

function buildTreePanel() {
  const panel = el("div", { className: "panel" });
  const header = el("header", {}, el("span", { textContent: "Files" }));

  const isTree = S.view === "tree";
  const toggle = el("button", {
    className: "btn ghost sm viewtoggle",
    title: isTree ? "Switch to folder view" : "Switch to tree view",
    "aria-label": isTree ? "Switch to folder view" : "Switch to tree view",
    textContent: isTree ? "🌳" : "🗂",
  });
  toggle.onclick = () => setView(isTree ? "browse" : "tree");
  header.append(toggle, el("div", { className: "spacer" }));

  // All icon-only: the panel is 300px, and labelled buttons wrapped the header
  // onto a second row. The tooltip and aria-label carry the meaning.
  const iconBtn = (glyph, label, fn) => {
    const b = el("button", {
      className: "btn ghost sm iconbtn", title: label, "aria-label": label,
    });
    b.innerHTML = `<span class="plus">+</span>${glyph}`;
    b.onclick = fn;
    return b;
  };

  // Pages are the lead's to create, so this sits with the other authoring
  // buttons but appears only for them.
  if (S.project.canManage) {
    header.append(iconBtn("📝", "Add a page", createPageFlow));
  }
  if (canWrite()) {
    header.append(
      iconBtn("📄", "New file here", () => newEntry("newfile")),
      iconBtn("📁", "New folder here", () => newEntry("newfolder")));
    const up = el("button", {
      className: "btn ghost sm viewtoggle", textContent: "⬆",
      title: "Upload files here", "aria-label": "Upload files here",
    });
    up.onclick = pickUpload;
    header.append(up);
  }
  panel.append(header);
  panel.append(buildBreadcrumb());

  const list = el("div", { className: "tree" });

  if (isTree) {
    if (!S.files.length && !S.dirs.length) {
      list.append(el("div", { className: "empty", style: "padding:26px 12px" },
        canWrite() ? "No files yet — upload or create one." : "No files yet."));
    } else {
      renderTreeNode(list, buildTreeModel(), "", 0);
    }
    panel.append(list);
    const treeDz = buildDropzone();
    if (treeDz) panel.append(treeDz);
    return panel;
  }

  const { dirs, files } = currentEntries();

  // "Up one level" — the counterpart to clicking a folder to descend.
  if (S.cwd) {
    const up = el("button", { className: "row up" });
    up.innerHTML = `<span class="ico">↩</span><span class="nm">..</span>`;
    up.onclick = () => goTo(parentOf(S.cwd));
    list.append(up);
  }

  for (const name of dirs) {
    const full = joinPath(S.cwd, name);
    const row = el("button", { className: "row" });
    row.innerHTML = `<span class="ico">📁</span><span class="nm">${esc(name)}</span>
                     <span class="sz">${dirSummary(full)}</span>`;
    row.onclick = () => goTo(full);
    if (canWrite()) row.oncontextmenu = e => { e.preventDefault(); entryMenu(full, true); };
    list.append(row);
  }

  for (const f of files) {
    const row = el("button", { className: "row" + (S.open?.path === f.path ? " on" : "") });
    row.innerHTML = `<span class="ico">${iconFor(f.name)}</span>
                     <span class="nm">${esc(f.name)}</span>
                     <span class="sz">${fmtBytes(f.size)}</span>`;
    row.onclick = () => openFile(f.path);
    if (canWrite()) row.oncontextmenu = e => { e.preventDefault(); entryMenu(f.path, false); };
    list.append(row);
  }

  if (!dirs.length && !files.length) {
    list.append(el("div", { className: "empty", style: "padding:26px 12px" },
      S.cwd
        ? (canWrite() ? "This folder is empty — upload or create something here." : "This folder is empty.")
        : (canWrite() ? "No files yet — upload or create one." : "No files yet.")));
  }
  panel.append(list);
  const dz = buildDropzone();
  if (dz) panel.append(dz);
  return panel;
}

// Shared by both views. Returns null for read-only accounts, which append()
// simply ignores.
function buildDropzone() {
  if (!canWrite()) return null;
  const dz = el("div", { className: "dropzone" });
  dz.textContent = S.cwd ? `Drop files here → ${S.cwd}` : "Drop files here to upload";
  dz.style.margin = "0 12px 12px";
  dz.ondragover = e => { e.preventDefault(); dz.classList.add("over"); };
  dz.ondragleave = () => dz.classList.remove("over");
  dz.ondrop = e => {
    e.preventDefault(); dz.classList.remove("over");
    // Dropped files land in the current folder, not the project root.
    if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files, S.cwd);
  };
  return dz;
}

// "3 files" / "empty" for a folder row — counts everything nested beneath it.
function dirSummary(dir) {
  const prefix = dir + "/";
  const n = S.files.filter(f => f.path.startsWith(prefix)).length;
  return n ? `${n} file${n === 1 ? "" : "s"}` : "empty";
}

/* ---- editor / preview ---- */

const TEXT_EXT = new Set([".json", ".txt", ".md", ".js", ".mjs", ".ts", ".css", ".html", ".htm",
  ".xml", ".yml", ".yaml", ".mcfunction", ".lang", ".properties", ".csv", ".ini", ".cfg",
  ".conf", ".sh", ".py", ".go", ".toml", ".gitignore", ".env", ".log", ".material",
  ".fragment", ".vertex", ".glsl", ".svg"]);

const isText = p => TEXT_EXT.has(extOf(p));

function buildEditorPanel() {
  // A page and a file are never open at once — both live in this panel.
  if (S.page) return buildPageEditor();
  pageSaveBtn = null;

  const panel = el("div", { className: "panel" });
  if (!S.open) {
    panel.append(el("header", {}, el("span", { textContent: "Editor" })));
    panel.append(el("div", { className: "empty", style: "border:0" },
      "Select a file or a page on the left to view or edit it."));
    return panel;
  }

  const o = S.open;
  const header = el("header", {},
    el("span", { className: "mono", textContent: o.path }),
    presenceNote("file", o.path),
    el("div", { className: "spacer" }));

  const dl = el("button", { className: "btn ghost sm", textContent: "⬇ Download" });
  dl.onclick = () => {
    location.href = `/api/projects/${S.project.id}/files?path=${encodeURIComponent(o.path)}`;
  };
  header.append(dl);
  if (o.text != null) {
    const hist = el("button", { className: "btn ghost sm", textContent: "🕘 History", title: "Earlier versions" });
    hist.onclick = () => openHistory("file", o.path, o.path);
    header.append(hist);
  }

  // Held so the textarea's input handler can flip it without a re-render —
  // re-rendering here would replace the textarea mid-keystroke and drop input.
  let saveBtn = null;
  if (o.text != null && canWrite()) {
    saveBtn = el("button", { className: "btn primary sm", textContent: o.dirty ? "Save •" : "Save" });
    saveBtn.disabled = !o.dirty;
    saveBtn.onclick = saveOpenFile;
    header.append(saveBtn);
  }
  if (canWrite()) {
    const del = el("button", { className: "btn danger sm", textContent: "Delete" });
    del.onclick = () => deleteEntry(o.path, false);
    header.append(del);
  }
  panel.append(header);

  if (o.text != null) {
    panel.append(el("div", { className: "behind", hidden: true }));
    const ta = el("textarea", { className: "editor", value: o.text, spellcheck: false });
    const markDirty = () => {
      if (o.dirty || !saveBtn) return;
      o.dirty = true;
      saveBtn.disabled = false;
      saveBtn.textContent = "Save •";
    };
    ta.oninput = () => { o.text = ta.value; markDirty(); };
    // Tab should indent rather than move focus — this is a code editor.
    ta.onkeydown = e => {
      if (e.key === "Tab") {
        e.preventDefault();
        const s = ta.selectionStart, en = ta.selectionEnd;
        ta.value = ta.value.slice(0, s) + "  " + ta.value.slice(en);
        ta.selectionStart = ta.selectionEnd = s + 2;
        o.text = ta.value; markDirty();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); saveOpenFile(); }
    };
    panel.append(ta);
  } else {
    panel.append(buildPreview(o.path));
  }
  return panel;
}

function buildPreview(path) {
  const url = `/api/projects/${S.project.id}/files?path=${encodeURIComponent(path)}&inline=1`;
  const ext = extOf(path);
  const wrap = el("div", { className: "preview" });

  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"].includes(ext)) {
    wrap.append(el("img", { src: url, alt: path }));
  } else if ([".mp4", ".webm", ".mov"].includes(ext)) {
    wrap.append(el("video", { src: url, controls: true }));
  } else if ([".mp3", ".ogg", ".wav", ".m4a"].includes(ext)) {
    wrap.append(el("audio", { src: url, controls: true }));
  } else {
    wrap.append(el("p", { className: "dim",
      textContent: "This file type can't be previewed or edited in the browser — download it instead." }));
  }
  return wrap;
}

// Both editors share the panel, so anything that replaces what's in it has to
// clear whichever of the two is holding unsaved work.
async function confirmDiscard() {
  const what = S.open?.dirty ? S.open.path : S.page?.dirty ? S.page.name : null;
  if (!what) return true;
  return !!(await confirmDanger({
    title: "Discard unsaved changes?",
    warning: `“${what}” has unsaved edits.`,
    detail: "Opening something else will discard them.",
    confirmLabel: "Discard changes",
  }));
}

async function openFile(path) {
  if (!(await confirmDiscard())) return;
  S.page = null;
  S.behind = null;
  const at = S.files.find(f => f.path === path)?.updatedAt || 0;
  if (!isText(path)) { S.open = { path, text: null, dirty: false, at }; render(); return; }
  try {
    const r = await api(`/api/projects/${S.project.id}/files?path=${encodeURIComponent(path)}&mode=text`);
    S.open = { path, text: r.content, dirty: false, at };
  } catch (e) {
    // Too large, or not really text after all — fall back to the preview pane.
    toast(e.message, "bad");
    S.open = { path, text: null, dirty: false, at };
  }
  render();
}

async function saveOpenFile(force) {
  const o = S.open;
  if (!o || o.text == null || !o.dirty) return;
  // Re-rendering swaps in a fresh textarea, so remember where the caret was and
  // put it back — saving mid-edit shouldn't throw the user to the top of the file.
  const before = document.querySelector(".editor");
  const caret = before ? [before.selectionStart, before.selectionEnd, before.scrollTop] : null;
  const hadFocus = before && document.activeElement === before;
  try {
    const r = await api(`/api/projects/${S.project.id}/files`, {
      method: "PUT", body: { path: o.path, content: o.text, base: o.at || 0, force: !!force },
    });
    o.dirty = false;
    o.at = r.at || o.at;
    S.behind = null;
    await loadFiles();
    toast("Saved", "good");
    render();
    const after = document.querySelector(".editor");
    if (after && caret) {
      after.selectionStart = caret[0]; after.selectionEnd = caret[1]; after.scrollTop = caret[2];
      if (hadFocus) after.focus();
    }
  } catch (e) {
    if (await askedToOverwrite(e)) saveOpenFile(true);
    else toast(e.message, "bad");
  }
}

// A 409 means somebody else saved while this editor was open. Rather than
// picking a winner, ask — the other version is one click away in History either
// way, so neither answer loses anything permanently.
async function askedToOverwrite(err) {
  if (!/saved this (file|page)/.test(err.message)) return false;
  return !!(await confirmDanger({
    title: "Someone else saved first",
    warning: err.message,
    detail: "Saving yours now replaces theirs. Their version stays in History, and you can cancel and reload instead.",
    confirmLabel: "Save mine anyway",
  }));
}

/* ---- file mutations ---- */

async function newEntry(action) {
  const isDir = action === "newfolder";
  const where = S.cwd ? ` in ${S.cwd}` : "";
  const name = await promptModal({
    title: (isDir ? "New folder" : "New file") + where,
    label: "Name (you can still use / to nest deeper)",
    placeholder: isDir ? "textures" : "manifest.json",
    okLabel: "Create",
  });
  if (!name) return;
  // Names are relative to the folder being browsed, so creating "textures"
  // inside "pack" makes "pack/textures" rather than a second root folder.
  const full = joinPath(S.cwd, name);
  try {
    await api(`/api/projects/${S.project.id}/files`, { method: "POST", body: { action, path: full } });
    await loadFiles();
    if (isDir) { goTo(full); toast("Folder created", "good"); }
    else { await openFile(full); toast("File created", "good"); }
  } catch (e) { toast(e.message, "bad"); }
}

async function entryMenu(path, isDir) {
  const choice = await modal((box, close) => {
    box.innerHTML = `
      <h3>${esc(path.split("/").pop())}</h3>
      <p class="mono dim">${esc(path)}</p>
      <div class="actions" style="justify-content:flex-start">
        <button class="btn" id="em-rename">Rename / move</button>
        ${isDir ? "" : `<button class="btn" id="em-dl">Download</button>`}
        <button class="btn danger" id="em-del">Delete</button>
      </div>`;
    $("#em-rename", box).onclick = () => close("rename");
    $("#em-del", box).onclick = () => close("delete");
    if (!isDir) $("#em-dl", box).onclick = () => close("download");
  });

  if (choice === "rename") {
    const to = await promptModal({ title: "Rename or move", label: "New path", value: path, okLabel: "Rename" });
    if (!to || to === path) return;
    try {
      await api(`/api/projects/${S.project.id}/files`, {
        method: "POST", body: { action: "rename", path, to },
      });
      // Renaming a folder moves the open file with it — without remapping the
      // prefix a later save would write back to the old, now-gone path.
      if (S.open?.path === path) S.open.path = to;
      else if (S.open?.path.startsWith(path + "/")) S.open.path = to + S.open.path.slice(path.length);
      await loadFiles(); render(); toast("Renamed", "good");
    } catch (e) { toast(e.message, "bad"); }
  } else if (choice === "delete") {
    deleteEntry(path, isDir);
  } else if (choice === "download") {
    location.href = `/api/projects/${S.project.id}/files?path=${encodeURIComponent(path)}`;
  }
}

async function deleteEntry(path, isDir) {
  const ok = await confirmDanger({
    title: isDir ? "Delete folder" : "Delete file",
    warning: isDir
      ? `“${path}” and everything inside it will be deleted.`
      : `“${path}” will be deleted.`,
    detail: "This can't be undone. Download the project as a .zip first if you want a copy.",
    confirmLabel: isDir ? "Delete folder" : "Delete file",
  });
  if (!ok) return;
  try {
    await api(`/api/projects/${S.project.id}/files?path=${encodeURIComponent(path)}&dir=${isDir ? 1 : 0}`,
      { method: "DELETE" });
    if (S.open && (S.open.path === path || S.open.path.startsWith(path + "/"))) S.open = null;
    await loadFiles(); render(); toast("Deleted", "good");
  } catch (e) { toast(e.message, "bad"); }
}

/* ---- pages ---- */
//
// A page is a rich-text document stored in the database rather than on disk, so
// it never shows up in the file list. The lead who owns the project creates,
// renames and deletes them; each page's own access setting says what the
// project's other users may do with it.

const ACCESS = {
  lead: { icon: "🔒", short: "Only me", label: "Only me",
          hint: "Nobody else on the project can see this page." },
  view: { icon: "📝", short: "Read-only", label: "Users can read",
          hint: "Everyone with access to this project can read it, but only you can change it." },
  edit: { icon: "📝", short: "Editable", label: "Users can read and edit",
          hint: "Everyone with access to this project can read and change it." },
};

function buildPagesPanel() {
  const panel = el("div", { className: "panel" });
  const header = el("header", {},
    el("span", { textContent: "Pages" }),
    el("div", { className: "spacer" }));
  if (S.pages.length) {
    header.append(el("span", { className: "dim", style: "font-weight:400;font-size:12px",
      textContent: `${S.pages.length} page${S.pages.length === 1 ? "" : "s"}` }));
  }
  panel.append(header);

  const list = el("div", { className: "tree pages" });
  if (!S.pages.length) {
    list.append(el("div", { className: "empty", style: "padding:20px 12px;font-size:13px" },
      S.project.canManage
        ? "No pages yet. Use the 📝 button above the file list to add one."
        : "No pages have been shared with you."));
  }
  for (const g of S.pages) {
    const row = el("button", { className: "row" + (S.page?.id === g.id ? " on" : "") });
    row.dataset.page = g.id;
    row.innerHTML = `<span class="ico">${ACCESS[g.access]?.icon || "📝"}</span>
                     <span class="nm">${esc(g.name)}</span>
                     <span class="sz">${fmtDate(g.updatedAt)}</span>`;
    row.onclick = () => openPage(g.id);
    list.append(row);
  }
  panel.append(list);
  return panel;
}

async function createPageFlow() {
  if (!(await confirmDiscard())) return;
  const name = await promptModal({
    title: "New page", label: "Page name",
    placeholder: "Design notes", okLabel: "Create page",
  });
  if (!name) return;
  try {
    const r = await api(`/api/projects/${S.project.id}/pages`, { method: "POST", body: { name } });
    await loadPages();
    S.open = null;
    S.page = { ...r.page, dirty: false };
    render();
    toast(`Created “${r.page.name}”`, "good");
  } catch (e) { toast(e.message, "bad"); }
}

async function openPage(id) {
  if (S.page?.id === id) return;
  if (!(await confirmDiscard())) return;
  try {
    const r = await api(`/api/projects/${S.project.id}/pages/${id}`);
    S.open = null;
    S.page = { ...r.page, dirty: false };
    render();
  } catch (e) { toast(e.message, "bad"); }
}

// Held so the editor's input handler can flip it without a re-render, which
// would swap in a fresh contenteditable and drop the caret mid-word.
let pageSaveBtn = null;
let autosaveTimer = null;

// Pages autosave a few seconds after you stop typing. Prose doesn't want a
// save button, and every save is a history entry, so nothing is lost by it.
// Files deliberately don't do this: half-typed JSON shouldn't land on someone
// else's screen.
function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  if (!S.page?.canEdit) return;
  autosaveTimer = setTimeout(() => { if (S.page?.dirty) savePage(false, true); }, 4000);
}

function markPageDirty() {
  const g = S.page;
  if (!g || !g.canEdit || g.dirty) return;
  g.dirty = true;
  if (pageSaveBtn) { pageSaveBtn.disabled = false; pageSaveBtn.textContent = "Save •"; }
}

function buildPageEditor() {
  const g = S.page;
  const panel = el("div", { className: "panel" });
  const header = el("header", {},
    el("span", { className: "ico", textContent: ACCESS[g.access]?.icon || "📝" }),
    el("span", { textContent: g.name }),
    presenceNote("page", g.id),
    el("div", { className: "spacer" }));

  pageSaveBtn = null;
  if (g.canEdit) {
    pageSaveBtn = el("button", { className: "btn primary sm", textContent: g.dirty ? "Save •" : "Save" });
    pageSaveBtn.disabled = !g.dirty;
    pageSaveBtn.onclick = savePage;
    header.append(pageSaveBtn);
  }
  if (S.project.canManage) {
    const share = el("button", {
      className: "btn ghost sm", textContent: ACCESS[g.access]?.short || "Sharing",
      title: "Who else can use this page",
    });
    share.onclick = sharePageFlow;
    const ren = el("button", { className: "btn ghost sm", textContent: "Rename" });
    ren.onclick = renamePageFlow;
    const del = el("button", { className: "btn danger sm", textContent: "Delete" });
    del.onclick = deletePageFlow;
    header.append(share, ren, del);
  }
  const hist = el("button", { className: "btn ghost sm", textContent: "🕘 History", title: "Earlier versions" });
  hist.onclick = () => openHistory("page", String(g.id), g.name);
  header.append(hist);

  const close = el("button", {
    className: "btn ghost sm viewtoggle", textContent: "✕",
    title: "Close this page", "aria-label": "Close this page",
  });
  close.onclick = async () => {
    if (!(await confirmDiscard())) return;
    S.page = null; render();
  };
  header.append(close);
  panel.append(header);

  if (g.canEdit) panel.append(buildPageToolbar());
  panel.append(el("div", { className: "behind", hidden: true }));

  const ed = el("div", { className: "pagedit" + (g.canEdit ? "" : " ro") });
  ed.contentEditable = g.canEdit ? "true" : "false";
  ed.spellcheck = true;
  // Sanitised before it goes anywhere near the live DOM — the markup came from
  // whoever last edited the page, not necessarily from this browser.
  ed.innerHTML = sanitizePageHTML(g.html || "");
  if (g.canEdit) {
    // Left genuinely empty rather than seeded with a paragraph, so the CSS
    // :empty placeholder shows until there's something to read.
    if (!ed.innerHTML.trim()) ed.innerHTML = "";
    ed.dataset.placeholder = "Start typing…";
    ed.oninput = () => { markPageDirty(); scheduleAutosave(); };
    ed.onpaste = e => {
      // Paste is the one way markup this editor can't produce gets in, so it is
      // filtered on the way rather than left for the save to reject.
      e.preventDefault();
      const html = e.clipboardData.getData("text/html");
      if (html) document.execCommand("insertHTML", false, sanitizePageHTML(html));
      else document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
      markPageDirty();
    };
    ed.onkeydown = e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); savePage(); }
    };
    // Tags rather than inline styles, so what the toolbar produces matches what
    // the server will accept.
    try { document.execCommand("styleWithCSS", false, false); } catch { /* not fatal */ }
  }
  panel.append(ed);

  const foot = el("div", { className: "pagefoot" });
  foot.append(el("span", { textContent: g.canEdit
    ? `Saved ${fmtDate(g.updatedAt)}${g.updatedBy ? ` by ${g.updatedBy}` : ""}`
    : "You can read this page but not change it." }));
  if (g.canEdit) foot.append(el("span", { className: "dim", textContent: "Saves itself a few seconds after you stop typing" }));
  if (S.project.canManage) foot.append(el("span", { className: "dim", textContent: ACCESS[g.access]?.hint || "" }));
  panel.append(foot);
  return panel;
}

const PAGE_CMDS = [
  ["bold", "B", "Bold", "b"],
  ["italic", "I", "Italic", "i"],
  ["underline", "U", "Underline", "u"],
  ["strikeThrough", "S", "Strikethrough", "s"],
];

function buildPageToolbar() {
  const bar = el("div", { className: "ptoolbar" });
  const add = (label, title, fn, cls = "") => {
    const b = el("button", { className: "pbtn " + cls, textContent: label, title, type: "button" });
    // Keep the selection: without this the button steals focus first and the
    // command applies to nothing.
    b.onmousedown = e => e.preventDefault();
    b.onclick = fn;
    bar.append(b);
    return b;
  };
  for (const [cmd, label, title, cls] of PAGE_CMDS) add(label, title, () => pageCmd(cmd), "f-" + cls);
  bar.append(el("span", { className: "psep" }));
  add("H1", "Big heading", () => pageCmd("formatBlock", "<h1>"));
  add("H2", "Heading", () => pageCmd("formatBlock", "<h2>"));
  add("¶", "Normal text", () => pageCmd("formatBlock", "<p>"));
  bar.append(el("span", { className: "psep" }));
  add("• List", "Bulleted list", () => pageCmd("insertUnorderedList"));
  add("1. List", "Numbered list", () => pageCmd("insertOrderedList"));
  add("❝", "Quote", () => pageCmd("formatBlock", "<blockquote>"));
  bar.append(el("span", { className: "psep" }));
  add("🔗", "Add a link", pageLink);
  add("⌫", "Remove formatting", () => pageCmd("removeFormat"));
  return bar;
}

function pageCmd(cmd, arg) {
  const ed = document.querySelector(".pagedit");
  if (!ed) return;
  ed.focus();
  try { document.execCommand(cmd, false, arg); } catch { /* unsupported: nothing to do */ }
  markPageDirty();
}

async function pageLink() {
  const ed = document.querySelector(".pagedit");
  if (!ed) return;
  // Opening the modal moves focus out of the editor and drops the selection, so
  // it has to be remembered and put back afterwards.
  const sel = window.getSelection();
  const saved = sel && sel.rangeCount && ed.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;

  const url = await promptModal({
    title: "Add a link", label: "Link address",
    placeholder: "https://example.com", okLabel: "Add link",
  });
  if (!url) return;
  if (!safeHref(url)) {
    toast("Links must start with https://, http:// or mailto:", "bad");
    return;
  }
  ed.focus();
  if (saved) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(saved); }
  if (saved && !saved.collapsed) document.execCommand("createLink", false, url);
  else document.execCommand("insertHTML", false, `<a href="${esc(url)}">${esc(url)}</a>`);
  markPageDirty();
}

async function savePage(force, auto) {
  const g = S.page;
  if (!g || !g.canEdit) return;
  const ed = document.querySelector(".pagedit");
  if (!ed) return;
  clearTimeout(autosaveTimer);
  const html = sanitizePageHTML(ed.innerHTML);
  try {
    const r = await api(`/api/projects/${S.project.id}/pages/${g.id}`, {
      method: "PUT", body: { html, base: g.updatedAt || 0, force: !!force },
    });
    g.html = html;
    g.dirty = false;
    S.behind = null;
    if (r.page) { g.updatedAt = r.page.updatedAt; g.updatedBy = r.page.updatedBy; }
    if (pageSaveBtn) { pageSaveBtn.disabled = true; pageSaveBtn.textContent = "Save"; }
    // Deliberately not a re-render: it would rebuild the contenteditable and
    // throw the caret to the top. Only the two bits of text that went stale are
    // patched in place.
    const listed = S.pages.find(x => x.id === g.id);
    if (listed) listed.updatedAt = g.updatedAt;
    const row = document.querySelector(`.pages .row[data-page="${g.id}"] .sz`);
    if (row) row.textContent = fmtDate(g.updatedAt);
    const foot = document.querySelector(".pagefoot span");
    if (foot) foot.textContent = `Saved ${fmtDate(g.updatedAt)} by ${S.user.displayName}`;
    if (!auto) toast("Page saved", "good");
  } catch (e) {
    if (auto) {
      // An autosave that clashes must not throw a dialog at somebody mid-
      // sentence; the strip says they're behind and Save asks properly.
      S.page.dirty = true;
      if (/saved this page/.test(e.message)) markBehind();
      return;
    }
    if (await askedToOverwrite(e)) savePage(true);
    else toast(e.message, "bad");
  }
}

async function renamePageFlow() {
  const g = S.page;
  const name = await promptModal({
    title: "Rename page", label: "Page name", value: g.name, okLabel: "Rename",
  });
  if (!name || name === g.name) return;
  try {
    const r = await api(`/api/projects/${S.project.id}/pages/${g.id}`, { method: "PATCH", body: { name } });
    S.page = { ...r.page, dirty: g.dirty, html: g.html };
    await loadPages();
    render();
    toast("Page renamed", "good");
  } catch (e) { toast(e.message, "bad"); }
}

// The per-page setting that decides what the project's users may do with it.
async function sharePageFlow() {
  const g = S.page;
  const choice = await modal((box, close) => {
    box.innerHTML = `
      <h3>Who can use “${esc(g.name)}”</h3>
      <p>You can always read and edit your own pages. This is what everyone else
         with access to <b>${esc(S.project.name)}</b> can do with this one.</p>
      <div id="sp-list"></div>
      <div class="actions"><button class="btn" id="sp-cancel">Cancel</button></div>`;
    const list = $("#sp-list", box);
    for (const key of ["lead", "view", "edit"]) {
      const a = ACCESS[key];
      const row = el("div", { className: "checkrow" });
      const rb = el("input", { type: "radio", name: "sp", id: `sp-${key}`, checked: g.access === key });
      rb.onchange = () => close(key);
      row.append(rb, el("label", { htmlFor: `sp-${key}` },
        el("b", { textContent: `${a.icon} ${a.label}` }),
        el("span", { className: "dim", style: "display:block;font-size:12.5px", textContent: a.hint })));
      list.append(row);
    }
    $("#sp-cancel", box).onclick = () => close(null);
  });
  if (!choice || choice === g.access) return;
  try {
    const r = await api(`/api/projects/${S.project.id}/pages/${g.id}`, { method: "PATCH", body: { access: choice } });
    S.page = { ...r.page, dirty: g.dirty, html: g.html };
    await loadPages();
    render();
    toast(`“${g.name}” — ${ACCESS[choice].label.toLowerCase()}`, "good");
  } catch (e) { toast(e.message, "bad"); }
}

async function deletePageFlow() {
  const g = S.page;
  const ok = await confirmDanger({
    title: `Delete “${g.name}”`,
    warning: "This page and everything written on it will be deleted.",
    detail: "Pages aren't in the project's .zip, so there's no backup copy — copy anything you need out first.",
    confirmLabel: "Delete page",
  });
  if (!ok) return;
  try {
    await api(`/api/projects/${S.project.id}/pages/${g.id}`, { method: "DELETE" });
    S.page = null;
    await loadPages();
    render();
    toast("Page deleted", "good");
  } catch (e) { toast(e.message, "bad"); }
}

/* ---- page markup filter ---- */

// What the editor is allowed to produce. Anything else is unwrapped (its words
// are kept, its tag is dropped); the few tags that would carry code with them
// are removed outright.
const PAGE_TAGS = new Set(["P", "BR", "DIV", "SPAN", "B", "STRONG", "I", "EM", "U", "S",
  "STRIKE", "DEL", "H1", "H2", "H3", "UL", "OL", "LI", "BLOCKQUOTE", "PRE", "CODE", "A", "HR"]);
const PAGE_DROP = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "TEMPLATE",
  "LINK", "META", "NOSCRIPT", "SVG", "MATH", "CANVAS", "AUDIO", "VIDEO", "IMG", "INPUT",
  "BUTTON", "SELECT", "TEXTAREA"]);

// Word and Google Docs paste inline styles instead of tags; mapping them back
// keeps the formatting the user can see rather than stripping it on save.
const STYLE_TAGS = [
  [/font-weight\s*:\s*(bold|[6-9]00)/i, "b"],
  [/font-style\s*:\s*italic/i, "i"],
  [/text-decoration[^;]*underline/i, "u"],
  [/text-decoration[^;]*line-through/i, "s"],
];

function safeHref(v) {
  // Browsers ignore control characters inside a URL, so "java\nscript:" has to
  // be judged with them removed.
  const s = String(v).replace(/[\u0000-\u0020]/g, "").toLowerCase();
  return /^(https?:\/\/|mailto:|[/#])/.test(s);
}

// Filters page markup against the allow-list above. Run on load, on paste and
// again before saving. DOMParser builds an inert document, so nothing in the
// markup can run while it is being cleaned.
function sanitizePageHTML(html) {
  const doc = new DOMParser().parseFromString("<body>" + String(html || ""), "text/html");

  const walk = node => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) continue;                       // text
      if (child.nodeType !== 1) { child.remove(); continue; }   // comments, PIs
      const tag = child.tagName.toUpperCase();

      if (PAGE_DROP.has(tag)) { child.remove(); continue; }
      if (!PAGE_TAGS.has(tag)) {
        // Unknown but harmless (tables, fonts, headers from a paste): keep the
        // words, drop the tag.
        walk(child);
        const frag = doc.createDocumentFragment();
        while (child.firstChild) frag.append(child.firstChild);
        child.replaceWith(frag);
        continue;
      }

      const style = child.getAttribute("style") || "";
      const wraps = STYLE_TAGS.filter(([re]) => re.test(style)).map(([, t]) => t);
      for (const a of [...child.attributes]) {
        const keep = tag === "A" && a.name.toLowerCase() === "href" && safeHref(a.value);
        if (!keep) child.removeAttribute(a.name);
      }
      if (tag === "A") {
        if (!child.getAttribute("href")) {
          // A link with nothing usable left on it is just text.
          walk(child);
          const frag = doc.createDocumentFragment();
          while (child.firstChild) frag.append(child.firstChild);
          child.replaceWith(frag);
          continue;
        }
        child.setAttribute("target", "_blank");
        child.setAttribute("rel", "noopener noreferrer");
      }
      walk(child);

      if (wraps.length) {
        const outer = doc.createElement(wraps[0]);
        let inner = outer;
        for (const t of wraps.slice(1)) { const n = doc.createElement(t); inner.append(n); inner = n; }
        while (child.firstChild) inner.append(child.firstChild);
        child.append(outer);
      }
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

/* ---- uploads ---- */

function pickUpload() {
  const inp = el("input", { type: "file", multiple: true });
  inp.style.display = "none";
  document.body.append(inp);
  inp.onchange = () => { if (inp.files.length) uploadFiles(inp.files, S.cwd); inp.remove(); };
  inp.click();
}

// Uploads via XHR rather than fetch so we can show real progress on big files.
function uploadFiles(fileList, dest = "") {
  const fd = new FormData();
  if (dest) fd.append("dest", dest);
  let total = 0;
  for (const f of fileList) { fd.append("f", f, f.name); total += f.size; }

  const max = S.limits.maxUpload || Infinity;
  const tooBig = [...fileList].find(f => f.size > max);
  if (tooBig) { toast(`“${tooBig.name}” is larger than the ${fmtBytes(max)} upload limit`, "bad"); return; }

  return runUpload(`/api/projects/${S.project.id}/upload`, fd,
    `Uploading ${fileList.length} file${fileList.length === 1 ? "" : "s"} (${fmtBytes(total)})`);
}

function importZip() {
  const inp = el("input", { type: "file", accept: ".zip,.mcaddon,.mcpack,.mcworld,.mctemplate" });
  inp.style.display = "none";
  document.body.append(inp);
  inp.onchange = async () => {
    const f = inp.files[0]; inp.remove();
    if (!f) return;
    const dest = await modal((box, close) => {
      box.innerHTML = `
        <h3>Upload &amp; extract</h3>
        <p><b>${esc(f.name)}</b> (${fmtBytes(f.size)}) will be extracted into this project.
           Existing files with the same paths will be overwritten.</p>
        <label>Extract into folder <span class="dim">(optional)</span>
          <input id="iz-dest" value="${esc(S.cwd)}" placeholder="leave empty for the project root" spellcheck="false"></label>
        <div class="actions">
          <button class="btn" id="iz-cancel">Cancel</button>
          <button class="btn primary" id="iz-ok">Upload &amp; extract</button>
        </div>`;
      $("#iz-cancel", box).onclick = () => close(null);
      $("#iz-ok", box).onclick = () => close({ dest: $("#iz-dest", box).value.trim() });
    });
    if (!dest) return;
    const fd = new FormData();
    if (dest.dest) fd.append("dest", dest.dest);
    fd.append("zip", f, f.name);
    runUpload(`/api/projects/${S.project.id}/import`, fd, `Extracting ${f.name} (${fmtBytes(f.size)})`);
  };
  inp.click();
}

// Shared XHR upload with a progress modal.
function runUpload(url, fd, label) {
  return modal((box, close) => {
    box.innerHTML = `
      <h3>${esc(label)}</h3>
      <p id="up-status">Starting…</p>
      <div class="progress"><i id="up-bar"></i></div>
      <div class="actions"><button class="btn" id="up-cancel">Cancel</button></div>`;
    const bar = $("#up-bar", box), status = $("#up-status", box);
    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = e => {
      if (!e.lengthComputable) return;
      const pct = (e.loaded / e.total) * 100;
      bar.style.width = pct + "%";
      status.textContent = `${fmtBytes(e.loaded)} of ${fmtBytes(e.total)} — ${Math.round(pct)}%`;
    };
    xhr.upload.onload = () => { status.textContent = "Processing on the server…"; };

    xhr.onload = async () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch {}
      // loadFiles() rejects on a dropped session; without a catch that surfaces
      // as an unhandled rejection and the toast below never fires.
      if (xhr.status >= 200 && xhr.status < 300) {
        close(true);
        try { await loadFiles(); render(); } catch { /* api() has already routed to login */ }
        toast(data.extracted != null ? `Extracted ${data.extracted} file(s)` : "Upload complete", "good");
      } else {
        close(null);
        toast(data.error || `Upload failed (${xhr.status})`, "bad");
        try { await loadFiles(); render(); } catch { /* as above */ }
      }
    };
    xhr.onerror = () => { close(null); toast("Upload failed — connection lost", "bad"); };
    xhr.onabort  = () => { close(null); toast("Upload cancelled"); };

    $("#up-cancel", box).onclick = () => xhr.abort();
    xhr.open("POST", url);
    xhr.withCredentials = true;
    xhr.send(fd);
  });
}

/* ---- project management ---- */

async function deleteProjectFlow() {
  const p = S.project;
  const ok = await confirmDanger({
    title: `Delete “${p.name}”`,
    warning: `All ${p.fileCount} file${p.fileCount === 1 ? "" : "s"} (${fmtBytes(p.usedBytes)}) will be permanently deleted.`,
    detail: "Everyone's access to this project is removed too. This cannot be undone — download a .zip backup first if you might need the files.",
    confirmLabel: "Delete project forever",
    typeToConfirm: p.name,
  });
  if (!ok) return;
  try {
    await api(`/api/projects/${p.id}`, { method: "DELETE" });
    S.project = null; S.open = null;
    toast("Project deleted", "good");
    render();
  } catch (e) { toast(e.message, "bad"); }
}

// The lead's per-project access checkboxes.
async function manageAccess() {
  let data;
  try { data = await api(`/api/projects/${S.project.id}/members`); }
  catch (e) { toast(e.message, "bad"); return; }

  await modal((box, close) => {
    box.className = "modal";
    box.innerHTML = `
      <h3>Who can use “${esc(S.project.name)}”</h3>
      <p>Tick the users who may upload and edit files in this project.
         You always have access as its lead.</p>
      <div id="ma-list"></div>
      <div class="actions"><button class="btn primary" id="ma-done">Done</button></div>`;
    const list = $("#ma-list", box);

    if (!data.members.length) {
      list.append(el("div", { className: "empty" },
        "You haven't created any users yet. Add them from the Users tab, then grant access here."));
    }
    for (const mem of data.members) {
      const row = el("div", { className: "checkrow" });
      const cb = el("input", { type: "checkbox", checked: mem.granted, id: `ma-${mem.id}` });
      cb.onchange = async () => {
        cb.disabled = true;
        try {
          await api(`/api/projects/${S.project.id}/members`, {
            method: "POST", body: { userId: mem.id, granted: cb.checked },
          });
          toast(cb.checked ? `${mem.username} can now access this project` : `${mem.username} removed`, "good");
        } catch (e) { cb.checked = !cb.checked; toast(e.message, "bad"); }
        cb.disabled = false;
      };
      row.append(cb, el("label", {
        htmlFor: `ma-${mem.id}`,
        textContent: mem.username + (mem.disabled ? " (disabled)" : ""),
      }));
      list.append(row);
    }
    $("#ma-done", box).onclick = () => close(true);
  });
}

/* ──────────────────────────────────────────────────────── users */

async function renderUsers(m) {
  let data;
  try { data = await api("/api/users"); }
  catch (e) { m.append(el("p", { className: "err", textContent: e.message })); return; }

  const isAdmin = S.user.role === "admin";
  const noun = isAdmin ? "lead" : "user";

  const head = el("div", { className: "page-head" },
    el("h2", { textContent: isAdmin ? "Lead users" : "Users" }),
    el("div", { className: "spacer" }));
  const add = el("button", { className: "btn primary", textContent: `+ New ${noun}` });
  add.onclick = () => createUserFlow(noun);
  head.append(add);
  m.append(head);

  m.append(el("p", { className: "hint" }, isAdmin
    ? "Leads create their own projects and their own users. You can't see or manage their users."
    : "Users you create can upload and edit files in the projects you grant them."));

  if (!data.users.length) {
    m.append(el("div", { className: "empty" },
      `No ${noun}s yet. Create one — you'll get a temporary password to hand over.`));
    return;
  }

  const wrap = el("div", { className: "tablewrap" });
  const table = el("table");
  table.innerHTML = `<thead><tr>
      <th>Username</th><th>Email</th><th>Status</th><th>Last login</th><th class="right">Actions</th>
    </tr></thead>`;
  const tb = el("tbody");

  for (const u of data.users) {
    const tr = el("tr");
    tr.append(
      el("td", {}, el("b", { textContent: u.username })),
      el("td", { className: "dim", textContent: u.email || "—" }),
      el("td", {}, el("span", {
        className: "badge",
        textContent: u.disabled ? "disabled" : u.mustReset ? "awaiting first login" : "active",
      })),
      el("td", { className: "dim nowrap", textContent: fmtDate(u.lastLogin) }));

    const actions = el("td", { className: "right nowrap" });

    const reset = el("button", { className: "btn ghost sm", textContent: "Reset password" });
    reset.onclick = async () => {
      const ok = await confirmDanger({
        title: `Reset ${u.username}'s password`,
        warning: "Their current password stops working immediately.",
        detail: "They'll be signed out everywhere and given a new temporary password to change at next login.",
        confirmLabel: "Reset password",
      });
      if (!ok) return;
      try {
        const r = await api(`/api/users/${u.id}/reset`, { method: "POST" });
        await showPassword(u.username, r.password);
        render();
      } catch (e) { toast(e.message, "bad"); }
    };

    const toggle = el("button", { className: "btn ghost sm", textContent: u.disabled ? "Enable" : "Disable" });
    toggle.onclick = async () => {
      if (!u.disabled) {
        const ok = await confirmDanger({
          title: `Disable ${u.username}`,
          warning: "They'll be signed out immediately and won't be able to sign in.",
          detail: "Their account and files stay exactly as they are — you can re-enable them at any time.",
          confirmLabel: "Disable account",
        });
        if (!ok) return;
      }
      try {
        await api(`/api/users/${u.id}`, { method: "PATCH", body: { disabled: !u.disabled } });
        toast(u.disabled ? `${u.username} enabled` : `${u.username} disabled`, "good");
        render();
      } catch (e) { toast(e.message, "bad"); }
    };

    const del = el("button", { className: "btn danger sm", textContent: "Delete" });
    del.onclick = async () => {
      const ok = await confirmDanger({
        title: `Delete ${u.username}`,
        warning: "This permanently removes the account.",
        detail: isAdmin
          ? "Any projects they own must be deleted first. Files already uploaded are not removed. Consider disabling instead if this might be temporary."
          : "They lose access to every project immediately. Files they uploaded stay in the project. Consider disabling instead if this might be temporary.",
        confirmLabel: "Delete account",
        typeToConfirm: u.username,
      });
      if (!ok) return;
      try {
        await api(`/api/users/${u.id}`, { method: "DELETE" });
        toast(`${u.username} deleted`, "good");
        render();
      } catch (e) { toast(e.message, "bad"); }
    };

    actions.append(reset, toggle, del);
    tr.append(actions);
    tb.append(tr);
  }
  table.append(tb);
  wrap.append(table);
  m.append(wrap);
}

async function createUserFlow(noun) {
  const info = await modal((box, close) => {
    box.innerHTML = `
      <h3>New ${esc(noun)}</h3>
      <p>The account is created with a temporary password. They'll be asked to
         choose their own the first time they sign in.</p>
      <label>Username<input id="nu-name" spellcheck="false" autocapitalize="none" placeholder="jane"></label>
      <label>Email <span class="dim">(optional, for your reference)</span>
        <input id="nu-email" spellcheck="false" autocapitalize="none" placeholder="jane@example.com"></label>
      <label>Temporary password <span class="dim">(leave empty to generate one)</span>
        <input id="nu-pw" spellcheck="false" placeholder="generated automatically"></label>
      <p class="err" id="nu-err" hidden></p>
      <div class="actions">
        <button class="btn" id="nu-cancel">Cancel</button>
        <button class="btn primary" id="nu-ok">Create ${esc(noun)}</button>
      </div>`;
    const err = $("#nu-err", box);
    $("#nu-cancel", box).onclick = () => close(null);
    $("#nu-ok", box).onclick = async () => {
      const body = {
        username: $("#nu-name", box).value.trim(),
        email: $("#nu-email", box).value.trim(),
        password: $("#nu-pw", box).value,
      };
      if (!body.username) { err.hidden = false; err.textContent = "Pick a username."; return; }
      try {
        const r = await api("/api/users", { method: "POST", body });
        close(r);
      } catch (e) { err.hidden = false; err.textContent = e.message; }
    };
  });
  if (!info) return;
  await showPassword(info.user.username, info.password);
  render();
}

/* ──────────────────────────────────────────────────── admin view */

async function renderAdmin(m) {
  let stats, settings;
  try {
    [stats, settings] = await Promise.all([api("/api/admin/stats"), api("/api/admin/settings")]);
  } catch (e) { m.append(el("p", { className: "err", textContent: e.message })); return; }

  m.append(el("div", { className: "page-head" }, el("h2", { textContent: "Server" })));

  /* --- storage summary --- */
  const capPct = settings.globalCap ? Math.min(100, (stats.totalUsed / settings.globalCap) * 100) : 0;
  const summary = el("div", { className: "panel" });
  summary.append(el("header", {}, el("span", { textContent: "Storage" })));
  const sbody = el("div", { className: "body" });
  sbody.innerHTML = `
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
      <div><div class="dim" style="font-size:12px">Used by projects</div>
           <div style="font-size:22px;font-weight:600">${fmtBytes(stats.totalUsed)}</div></div>
      <div><div class="dim" style="font-size:12px">Global cap</div>
           <div style="font-size:22px;font-weight:600">${fmtBytes(stats.globalCap)}</div></div>
      <div><div class="dim" style="font-size:12px">Free on disk</div>
           <div style="font-size:22px;font-weight:600">${fmtBytes(stats.diskFree)}</div></div>
      <div><div class="dim" style="font-size:12px">Projects / leads</div>
           <div style="font-size:22px;font-weight:600">${stats.projects.length} / ${stats.leads}</div></div>
    </div>
    <div class="bar ${capPct > 90 ? "full" : capPct > 75 ? "warn" : ""}" style="margin-top:14px"><i style="width:${capPct}%"></i></div>
    <div class="dim" style="font-size:12.5px">${Math.round(capPct)}% of the global cap used.
      Disk total ${fmtBytes(stats.diskTotal)}.</div>`;
  summary.append(sbody);
  m.append(summary);

  /* --- limits --- */
  const limits = el("div", { className: "panel" });
  limits.style.marginTop = "14px";
  limits.append(el("header", {}, el("span", { textContent: "Limits" })));
  const lbody = el("div", { className: "body" });
  lbody.innerHTML = `
    <p class="hint" style="margin-top:0">Values are in megabytes. The default limit applies to
       newly created projects; change an individual project's limit in the table below.</p>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr))">
      <label>Default per-project limit (MB)<input type="number" min="1" id="set-default" value="${Math.round(settings.defaultQuota / 1048576)}"></label>
      <label>Global cap across all projects (MB)<input type="number" min="1" id="set-cap" value="${Math.round(settings.globalCap / 1048576)}"></label>
      <label>Largest single upload (MB)<input type="number" min="1" id="set-upload" value="${Math.round(settings.maxUpload / 1048576)}"></label>
    </div>`;
  const saveBtn = el("button", { className: "btn primary", textContent: "Save limits" });
  saveBtn.onclick = async () => {
    const MB = 1048576;
    try {
      await api("/api/admin/settings", {
        method: "POST",
        body: {
          defaultQuota: Math.round(Number($("#set-default").value) * MB),
          globalCap: Math.round(Number($("#set-cap").value) * MB),
          maxUpload: Math.round(Number($("#set-upload").value) * MB),
        },
      });
      toast("Limits saved", "good");
      render();
    } catch (e) { toast(e.message, "bad"); }
  };
  lbody.append(saveBtn);
  limits.append(lbody);
  m.append(limits);

  /* --- per-project table --- */
  const wrap = el("div", { className: "tablewrap" });
  wrap.style.marginTop = "14px";
  const table = el("table");
  table.innerHTML = `<thead><tr>
      <th>Project</th><th>Lead</th><th class="right">Files</th>
      <th class="right">Used</th><th class="right">Limit</th><th class="right">Set limit</th>
    </tr></thead>`;
  const tb = el("tbody");
  for (const p of stats.projects) {
    const tr = el("tr");
    const setBtn = el("button", { className: "btn ghost sm", textContent: "Change" });
    setBtn.onclick = async () => {
      const v = await promptModal({
        title: `Storage limit for “${p.name}”`,
        label: "Limit in megabytes",
        value: String(Math.round(p.quotaBytes / 1048576)),
        okLabel: "Set limit",
      });
      if (!v) return;
      const mb = Number(v);
      if (!Number.isFinite(mb) || mb < 1) { toast("Enter a number of megabytes (at least 1)", "bad"); return; }
      try {
        await api(`/api/projects/${p.id}`, { method: "PATCH", body: { quota: Math.round(mb * 1048576) } });
        toast("Limit updated", "good"); render();
      } catch (e) { toast(e.message, "bad"); }
    };
    tr.append(
      el("td", {}, el("b", { textContent: p.name })),
      el("td", { className: "dim", textContent: p.ownerName }),
      el("td", { className: "right", textContent: String(p.fileCount) }),
      el("td", { className: "right", textContent: fmtBytes(p.usedBytes) }),
      el("td", { className: "right dim", textContent: fmtBytes(p.quotaBytes) }),
      el("td", { className: "right" }, setBtn));
    tb.append(tr);
  }
  if (!stats.projects.length) {
    tb.append(el("tr", {}, el("td", { colSpan: 6, className: "dim", textContent: "No projects yet." })));
  }
  table.append(tb);
  wrap.append(table);
  m.append(wrap);

  /* --- recent activity --- */
  const aw = el("div", { className: "tablewrap" });
  aw.style.marginTop = "14px";
  const at = el("table");
  at.innerHTML = `<thead><tr><th>When</th><th>Who</th><th>Action</th><th>Detail</th></tr></thead>`;
  const atb = el("tbody");
  for (const a of stats.audit) {
    atb.append(el("tr", {},
      el("td", { className: "dim nowrap", textContent: fmtDate(a.at) }),
      el("td", { textContent: a.username || "—" }),
      el("td", { className: "mono", textContent: a.action }),
      el("td", { className: "dim", textContent: a.detail })));
  }
  if (!stats.audit.length) {
    atb.append(el("tr", {}, el("td", { colSpan: 4, className: "dim", textContent: "Nothing yet." })));
  }
  at.append(atb);
  aw.append(at);
  m.append(el("div", { className: "page-head", style: "margin:22px 0 0" },
    el("h2", { textContent: "Recent activity", style: "font-size:17px" })));
  m.append(aw);
}

/* ─────────────────────────────────────────────── your name */

// Everyone can change what they're called. The username is the sign-in handle,
// so it is only offered while it is still doing double duty as the display
// name — and then with a warning, because it changes what they type to log in.
function changeNameFlow() {
  const sameAsLogin = S.user.displayName === S.user.username;
  return modal((box, close) => {
    box.innerHTML = `
      <h3>Your name</h3>
      <p>This is what everyone else sees next to your files, pages and edits.</p>
      <label>Display name<input id="nm-name" value="${esc(S.user.displayName)}" maxlength="40" spellcheck="false"></label>
      ${sameAsLogin ? `
        <div class="checkrow" style="border:0;padding:0 0 4px">
          <input type="checkbox" id="nm-login">
          <label for="nm-login">Change the username I sign in with too</label>
        </div>
        <div class="danger-head" id="nm-warn" hidden>
          <div class="mark">⚠️</div>
          <div><strong>You'll sign in with the new name from now on.</strong>
            <span>Your password doesn't change. If you forget the new username, your
                  lead can look it up.</span></div>
        </div>` : `
        <p class="hint">You sign in as <b class="mono">${esc(S.user.username)}</b>. That doesn't change.</p>`}
      <p class="err" id="nm-err" hidden></p>
      <div class="actions">
        <button class="btn" id="nm-cancel">Cancel</button>
        <button class="btn primary" id="nm-ok">Save</button>
      </div>`;
    const err = $("#nm-err", box), inp = $("#nm-name", box);
    const login = $("#nm-login", box);
    if (login) login.onchange = () => { $("#nm-warn", box).hidden = !login.checked; };
    $("#nm-cancel", box).onclick = () => close(null);
    $("#nm-ok", box).onclick = async () => {
      try {
        const r = await api("/api/profile", {
          method: "POST",
          body: { displayName: inp.value, changeUsername: !!(login && login.checked) },
        });
        S.user = { ...S.user, ...r.user };
        close(true);
        toast(login && login.checked
          ? `You're now “${r.user.displayName}” and sign in as ${r.user.username}`
          : `You're now “${r.user.displayName}”`, "good");
        await boot();
      } catch (e) { err.hidden = false; err.textContent = e.message; }
    };
    inp.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); $("#nm-ok", box).click(); } };
  });
}

/* ────────────────────────────────────── presence, orders, live updates */
//
// One heartbeat carries all three: it says where this client is, brings back
// who else is in the project, and picks up anything a lead has sent — a kick, a
// move, or news that the open document has been saved by somebody else.

let beatTimer = null;

function currentSpot() {
  if (!S.project) return { projectId: 0, area: "", ref: "", editing: false };
  if (S.page) return { projectId: S.project.id, area: "page", ref: String(S.page.id), editing: !!S.page.dirty };
  if (S.open) return { projectId: S.project.id, area: "file", ref: S.open.path, editing: !!S.open.dirty };
  return { projectId: S.project.id, area: "project", ref: "", editing: false };
}

function watchTarget() {
  if (!S.project) return null;
  if (S.page) return { kind: "page", ref: String(S.page.id) };
  if (S.open && S.open.text != null) return { kind: "file", ref: S.open.path };
  return null;
}

function startHeartbeat() {
  clearTimeout(beatTimer);
  const beat = async () => {
    try { await heartbeat(); } catch { /* offline or signed out; the next one retries */ }
    beatTimer = setTimeout(beat, (S.beatSeconds || 8) * 1000);
  };
  beat();
}

async function heartbeat() {
  if (!S.user) return;
  const r = await api("/api/presence", {
    method: "POST", body: { ...currentSpot(), watch: watchTarget() },
  });
  S.beatSeconds = r.interval || 8;
  S.here = r.people || [];
  renderHere();
  if (r.watch) noteRemoteSave(r.watch);
  if (r.order) await handleOrder(r.order);
  // The people console is a live view, so it refreshes itself — but never
  // while a modal is open on top of it.
  if (S.tab === "people" && !S.project && $("#modal-host").hidden) renderPeople($("#main"), true);
}

// Someone else's save landed. If this client has nothing unsaved, take it
// silently; if it does, flag it rather than throwing away what they've typed.
async function noteRemoteSave(watch) {
  const mineAt = S.page ? S.page.updatedAt : S.open?.at;
  if (!watch.at || !mineAt || watch.at <= mineAt) return;
  const dirty = S.page?.dirty || S.open?.dirty;
  if (dirty) {
    S.behind = watch;
    markBehind();
    return;
  }
  await pullDoc(watch);
}

async function pullDoc(watch) {
  try {
    if (watch.kind === "page" && S.page && String(S.page.id) === watch.ref) {
      const r = await api(`/api/projects/${S.project.id}/pages/${S.page.id}`);
      S.page = { ...r.page, dirty: false };
      const ed = document.querySelector(".pagedit");
      if (ed) ed.innerHTML = sanitizePageHTML(S.page.html || "");
      else render();
    } else if (watch.kind === "file" && S.open && S.open.path === watch.ref) {
      const r = await api(`/api/projects/${S.project.id}/files?path=${encodeURIComponent(watch.ref)}&mode=text`);
      S.open.text = r.content;
      S.open.at = watch.at;
      const ta = document.querySelector(".editor");
      if (ta) { const top = ta.scrollTop; ta.value = r.content; ta.scrollTop = top; }
      else render();
    } else return;
    S.behind = null;
    await loadFiles().catch(() => {});
    // Your own restore, or your own save in another tab, doesn't need announcing.
    if (watch.by && watch.by !== S.user.displayName) toast(`Updated by ${watch.by}`);
  } catch { /* it'll come round again on the next beat */ }
}

// The "you're behind" strip, flipped in place — re-rendering would take the
// unsaved edits it exists to protect.
function markBehind() {
  const foot = document.querySelector(".behind");
  if (!foot || !S.behind) return;
  foot.hidden = false;
  foot.innerHTML = `<b>${esc(S.behind.by || "Someone")}</b> saved a newer version while you were editing.`;
  const btn = el("button", { className: "btn sm", textContent: "Discard mine & load theirs" });
  btn.onclick = async () => {
    if (S.page) S.page.dirty = false; else if (S.open) S.open.dirty = false;
    await pullDoc(S.behind);
    render();
  };
  foot.append(btn);
}

// Who else is in this project, and what they have open.
function renderHere() {
  const host = document.querySelector("#here");
  if (!host) return;
  const people = S.here || [];
  host.hidden = !people.length;
  host.innerHTML = "";
  for (const p of people) {
    const what = p.area === "file" ? p.ref
      : p.area === "page" ? (S.pages.find(g => String(g.id) === p.ref)?.name || "a page")
      : "browsing";
    const chip = el("div", { className: "chip who-chip" + (p.editing ? " editing" : "") });
    chip.innerHTML = `<span class="dot"></span><b>${esc(p.name)}</b>
      <span class="dim">${p.editing ? "editing" : "in"} ${esc(what)}</span>`;
    host.append(chip);
  }
}

// Same information, but on the document itself: who else has this open.
function othersOn(kind, ref) {
  return (S.here || []).filter(p => p.area === kind && p.ref === String(ref));
}

function presenceNote(kind, ref) {
  const others = othersOn(kind, ref);
  if (!others.length) return null;
  const names = others.map(p => p.name).join(", ");
  const editing = others.some(p => p.editing);
  return el("span", {
    className: "here-note" + (editing ? " editing" : ""),
    textContent: `${names} ${others.length > 1 ? "are" : "is"} ${editing ? "editing this" : "here"}`,
  });
}

/* ---- orders from a lead ---- */

async function handleOrder(o) {
  const lostWork = S.open?.dirty || S.page?.dirty;
  if (o.type === "move") {
    S.open = null; S.page = null;
    if (S.project?.id !== o.projectId) await openProject(o.projectId);
    if (o.area === "file" && o.ref) await openFile(o.ref);
    else if (o.area === "page" && o.ref) await openPage(Number(o.ref));
    else render();
    await noticeModal("You've been moved", o,
      "Your lead has sent you here.", lostWork);
    return;
  }
  // kick
  if (o.area === "file" || o.area === "page") { S.open = null; S.page = null; }
  else { S.project = null; S.open = null; S.page = null; }
  render();
  await noticeModal("You've been asked to leave that", o,
    o.area === "project" ? "Your lead has closed this project for you."
                         : "Your lead has closed that document for you.", lostWork);
}

function noticeModal(title, o, lead, lostWork) {
  return modal((box, close) => {
    box.innerHTML = `
      <h3>${esc(title)}</h3>
      <p>${esc(lead)}${o.from ? ` — from <b>${esc(o.from)}</b>.` : ""}</p>
      ${o.reason ? `<div class="confirmbox" style="margin-bottom:14px">${esc(o.reason)}</div>`
                 : `<p class="hint">No reason was given.</p>`}
      ${lostWork ? `<p class="err">Anything you hadn't saved there is gone.</p>` : ""}
      <div class="actions"><button class="btn primary" id="ok">OK</button></div>`;
    $("#ok", box).onclick = () => close(true);
  });
}

/* ────────────────────────────────────────────────────── history */

// Snapshots of a document, at most one a minute, for the last two days.
async function openHistory(kind, ref, label) {
  let data;
  try {
    data = await api(`/api/projects/${S.project.id}/history?kind=${kind}&ref=${encodeURIComponent(ref)}`);
  } catch (e) { toast(e.message, "bad"); return; }

  await modal((box, close) => {
    box.className = "modal wide";
    box.innerHTML = `
      <h3>History of ${esc(label)}</h3>
      <p>Saved versions from the last ${Math.round((data.keptHours || 48) / 24)} days,
         one a minute at most. Older ones are removed automatically.</p>
      <div class="histwrap"><div class="histlist" id="h-list"></div>
        <div class="histview" id="h-view"><p class="dim">Pick a version to see it.</p></div></div>
      <div class="actions">
        <button class="btn" id="h-close">Close</button>
        <button class="btn primary" id="h-restore" disabled>Restore this version</button>
      </div>`;
    const list = $("#h-list", box), view = $("#h-view", box), restore = $("#h-restore", box);
    let picked = null;

    if (!data.revisions.length) {
      list.append(el("div", { className: "dim", style: "padding:12px",
        textContent: "No versions yet — history starts at the next save." }));
    }
    for (const rev of data.revisions) {
      const row = el("button", { className: "row" });
      row.innerHTML = `<span class="nm">${esc(fmtWhen(rev.at))}</span>
                       <span class="sz">${esc(rev.by || "—")} · ${fmtBytes(rev.size)}</span>`;
      row.onclick = async () => {
        [...list.children].forEach(c => c.classList?.remove("on"));
        row.classList.add("on");
        view.innerHTML = `<p class="dim">Loading…</p>`;
        try {
          const one = await api(`/api/projects/${S.project.id}/history?kind=${kind}&ref=${encodeURIComponent(ref)}&rev=${rev.id}`);
          picked = rev.id;
          restore.disabled = false;
          view.innerHTML = "";
          if (kind === "page") {
            const wrap = el("div", { className: "pagedit ro", style: "min-height:0;max-height:46vh" });
            wrap.innerHTML = sanitizePageHTML(one.revision.content || "");
            view.append(wrap);
          } else {
            view.append(el("pre", { className: "mono", textContent: one.revision.content }));
          }
        } catch (e) { view.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
      };
      list.append(row);
    }
    $("#h-close", box).onclick = () => close(null);
    restore.onclick = async () => {
      if (!picked) return;
      restore.disabled = true;
      try {
        await api(`/api/projects/${S.project.id}/history`, {
          method: "POST", body: { kind, ref, rev: picked },
        });
        close(true);
        toast("Version restored", "good");
        if (kind === "page" && S.page) { S.page.dirty = false; await openPageForce(S.page.id); }
        else if (S.open) { S.open.dirty = false; await openFile(S.open.path); }
        await loadFiles().catch(() => {});
        render();
      } catch (e) { restore.disabled = false; toast(e.message, "bad"); }
    };
  });
}

// openPage refuses to reopen what is already open; a restore needs it to.
async function openPageForce(id) {
  const keep = S.page;
  S.page = null;
  await openPage(id);
  if (!S.page && keep) S.page = keep;
}

function fmtWhen(sec) {
  const d = new Date(sec * 1000);
  const today = new Date().toDateString() === d.toDateString();
  return (today ? "Today" : d.toLocaleDateString([], { day: "numeric", month: "short" })) +
    " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/* ──────────────────────────────────────────────── people (lead) */

const AREA_LABEL = p => p.area === "file" ? `📄 ${p.ref}`
  : p.area === "page" ? "📝 a page"
  : p.area === "project" ? "browsing files" : "";

async function renderPeople(m, quiet) {
  let data;
  try { data = await api("/api/people"); }
  catch (e) { if (!quiet) m.append(el("p", { className: "err", textContent: e.message })); return; }
  // The live refresh runs every few seconds; rebuilding the table when nothing
  // has moved would fight with the mouse.
  const sig = JSON.stringify(data);
  if (quiet && sig === S.peopleSig) return;
  S.peopleSig = sig;

  m.innerHTML = "";
  m.append(el("div", { className: "page-head" },
    el("h2", { textContent: "People" }),
    el("span", { className: "crumb", textContent: "live · refreshes itself" })));
  m.append(el("p", { className: "hint" },
    "Everyone you've created, and anyone signed in to one of your projects. You can move them out of an area, send them somewhere else, or block them from it."));

  const wrap = el("div", { className: "tablewrap" });
  const table = el("table");
  table.innerHTML = `<thead><tr>
      <th>Person</th><th>Where they are</th><th class="right">Actions</th></tr></thead>`;
  const tb = el("tbody");
  for (const p of data.people) {
    const tr = el("tr");
    const who = el("td", {}, el("b", { textContent: p.name }));
    if (p.username && p.username !== p.name) {
      who.append(el("div", { className: "dim mono", style: "font-size:12px", textContent: p.username }));
    }
    const whereText = !p.online ? "offline"
      : p.elsewhere ? "signed in, in someone else's project"
      : p.projectName ? `${p.projectName}${p.area && p.area !== "project" ? " · " : " · "}${AREA_LABEL(p)}`
      : "signed in";
    const where = el("td", {},
      el("span", { className: "statusdot" + (p.online ? " on" : "") }),
      el("span", { textContent: whereText }));
    if (p.online && p.editing) where.append(el("span", { className: "badge", style: "margin-left:8px", textContent: "editing" }));

    const acts = el("td", { className: "right nowrap" });
    const kick = el("button", { className: "btn ghost sm", textContent: "Move out" });
    kick.onclick = () => kickFlow(p);
    kick.disabled = !p.online || !p.projectId;
    const move = el("button", { className: "btn ghost sm", textContent: "Send to…" });
    move.onclick = () => moveFlow(p, data.projects);
    const ban = el("button", { className: "btn danger sm", textContent: "Block" });
    ban.onclick = () => banFlow(p, data.projects);
    acts.append(kick, move, ban);

    tr.append(who, where, acts);
    tb.append(tr);
  }
  if (!data.people.length) {
    tb.append(el("tr", {}, el("td", { colSpan: 3, className: "dim", textContent: "No users yet — create some in the Users tab." })));
  }
  table.append(tb);
  wrap.append(table);
  m.append(wrap);

  /* --- blocks --- */
  m.append(el("div", { className: "page-head", style: "margin:22px 0 0" },
    el("h2", { textContent: "Blocks", style: "font-size:17px" })));
  const bw = el("div", { className: "tablewrap" });
  const bt = el("table");
  bt.innerHTML = `<thead><tr>
      <th>Person</th><th>Blocked from</th><th>Reason</th><th>Until</th><th class="right">Actions</th></tr></thead>`;
  const btb = el("tbody");
  for (const b of data.bans) {
    const what = b.scope === "project" ? `all of ${b.projectName}`
      : b.scope === "file" ? `📄 ${b.ref} in ${b.projectName}`
      : `📝 a page in ${b.projectName}`;
    const tr = el("tr");
    const acts = el("td", { className: "right nowrap" });
    const time = el("button", { className: "btn ghost sm", textContent: b.until ? "Change time limit" : "Set a time limit" });
    time.onclick = () => banTimeFlow(b);
    const un = el("button", { className: "btn ghost sm", textContent: "Unblock" });
    un.onclick = async () => {
      try {
        await api("/api/people/unban", { method: "POST", body: { banId: b.id } });
        toast(`${b.userName} unblocked`, "good");
        renderPeople($("#main"));
      } catch (e) { toast(e.message, "bad"); }
    };
    acts.append(time, un);
    tr.append(
      el("td", {}, el("b", { textContent: b.userName })),
      el("td", { textContent: what }),
      el("td", { className: "dim", textContent: b.reason || "—" }),
      el("td", { className: "nowrap", textContent: b.until ? fmtWhen(b.until) : "no limit" }),
      acts);
    btb.append(tr);
  }
  if (!data.bans.length) {
    btb.append(el("tr", {}, el("td", { colSpan: 5, className: "dim", textContent: "Nobody is blocked." })));
  }
  bt.append(btb);
  bw.append(bt);
  m.append(bw);
}

// Shared by the kick and block dialogs: what exactly are we acting on.
function scopeChoices(p) {
  const out = [["project", `The whole ${p.projectName || "project"}`]];
  if (p.area === "file" && p.ref) out.unshift(["file", `Just 📄 ${p.ref}`]);
  if (p.area === "page" && p.ref) out.unshift(["page", "Just the page they have open"]);
  return out;
}

async function kickFlow(p) {
  const choices = scopeChoices(p);
  const res = await modal((box, close) => {
    box.innerHTML = `
      <h3>Move ${esc(p.name)} out</h3>
      <p>They'll be taken out of it straight away — within a few seconds — and told why.
         Anything they hadn't saved there is lost.</p>
      <div id="k-scope"></div>
      <label>Reason <span class="dim">(they'll see this)</span>
        <input id="k-reason" placeholder="I need to reorganise this folder" maxlength="300"></label>
      <div class="actions">
        <button class="btn" id="k-cancel">Cancel</button>
        <button class="btn primary" id="k-ok">Move them out</button>
      </div>`;
    const host = $("#k-scope", box);
    choices.forEach(([v, label], i) => {
      const row = el("div", { className: "checkrow" });
      row.append(el("input", { type: "radio", name: "kscope", id: "ks-" + v, value: v, checked: i === 0 }),
        el("label", { htmlFor: "ks-" + v, textContent: label }));
      host.append(row);
    });
    $("#k-cancel", box).onclick = () => close(null);
    $("#k-ok", box).onclick = () => close({
      scope: box.querySelector("input[name=kscope]:checked").value,
      reason: $("#k-reason", box).value,
    });
  });
  if (!res) return;
  try {
    await api("/api/people/kick", {
      method: "POST",
      body: { userId: p.userId, projectId: p.projectId, scope: res.scope, ref: p.ref, reason: res.reason },
    });
    toast(`${p.name} is being moved out`, "good");
    renderPeople($("#main"));
  } catch (e) { toast(e.message, "bad"); }
}

async function moveFlow(p, projects) {
  if (!projects.length) { toast("You have no projects to send them to", "bad"); return; }
  const res = await modal((box, close) => {
    box.innerHTML = `
      <h3>Send ${esc(p.name)} somewhere</h3>
      <p>Their screen will open this. They need access to the project already —
         grant it from the project's <b>Access</b> button if they don't.</p>
      <label>Project<select id="mv-project"></select></label>
      <label>Where in it<select id="mv-where"><option value="">The file list</option></select></label>
      <label>Reason <span class="dim">(optional, they'll see it)</span>
        <input id="mv-reason" maxlength="300" placeholder="Have a look at this instead"></label>
      <div class="actions">
        <button class="btn" id="mv-cancel">Cancel</button>
        <button class="btn primary" id="mv-ok">Send them there</button>
      </div>`;
    const sel = $("#mv-project", box), where = $("#mv-where", box);
    for (const pr of projects) sel.append(el("option", { value: String(pr.id), textContent: pr.name }));
    if (p.projectId) sel.value = String(p.projectId);

    // The destinations inside a project are only fetched when one is chosen.
    const loadWhere = async () => {
      where.innerHTML = "";
      where.append(el("option", { value: "", textContent: "The file list" }));
      try {
        const [f, g] = await Promise.all([
          api(`/api/projects/${sel.value}/files`),
          api(`/api/projects/${sel.value}/pages`),
        ]);
        for (const file of f.files) {
          where.append(el("option", { value: "file:" + file.path, textContent: "📄 " + file.path }));
        }
        for (const page of g.pages) {
          where.append(el("option", { value: "page:" + page.id, textContent: "📝 " + page.name }));
        }
      } catch { /* the file list is still a valid destination */ }
    };
    sel.onchange = loadWhere;
    loadWhere();

    $("#mv-cancel", box).onclick = () => close(null);
    $("#mv-ok", box).onclick = () => {
      const [area, ...rest] = (where.value || "").split(":");
      close({
        projectId: Number(sel.value), area: area || "project", ref: rest.join(":"),
        reason: $("#mv-reason", box).value,
      });
    };
  });
  if (!res) return;
  try {
    await api("/api/people/move", { method: "POST", body: { userId: p.userId, ...res } });
    toast(`${p.name} is being sent there`, "good");
    renderPeople($("#main"));
  } catch (e) { toast(e.message, "bad"); }
}

const DURATIONS = [[0, "No time limit"], [15, "15 minutes"], [60, "1 hour"],
  [240, "4 hours"], [1440, "1 day"], [10080, "1 week"]];

async function banFlow(p, projects) {
  const choices = p.projectId ? scopeChoices(p) : [["project", "The whole project"]];
  const res = await modal((box, close) => {
    box.innerHTML = `
      <h3>Block ${esc(p.name)}</h3>
      <p>They won't be able to open it until you unblock them, and they'll be
         taken out of it now if they're in there.</p>
      ${p.projectId ? "" : `<label>Project<select id="b-project"></select></label>`}
      <div id="b-scope"></div>
      <label>For how long<select id="b-mins"></select></label>
      <label>Reason <span class="dim">(they'll see this)</span>
        <input id="b-reason" maxlength="300" placeholder="Stop moving the texture files"></label>
      <div class="actions">
        <button class="btn" id="b-cancel">Cancel</button>
        <button class="btn danger solid" id="b-ok">Block them</button>
      </div>`;
    const psel = $("#b-project", box);
    if (psel) for (const pr of projects) psel.append(el("option", { value: String(pr.id), textContent: pr.name }));
    const host = $("#b-scope", box);
    choices.forEach(([v, label], i) => {
      const row = el("div", { className: "checkrow" });
      row.append(el("input", { type: "radio", name: "bscope", id: "bs-" + v, value: v, checked: i === 0 }),
        el("label", { htmlFor: "bs-" + v, textContent: label }));
      host.append(row);
    });
    const mins = $("#b-mins", box);
    for (const [v, label] of DURATIONS) mins.append(el("option", { value: String(v), textContent: label }));
    $("#b-cancel", box).onclick = () => close(null);
    $("#b-ok", box).onclick = () => close({
      projectId: psel ? Number(psel.value) : p.projectId,
      scope: box.querySelector("input[name=bscope]:checked").value,
      ref: p.ref, minutes: Number(mins.value), reason: $("#b-reason", box).value,
    });
  });
  if (!res) return;
  try {
    await api("/api/people/ban", { method: "POST", body: { userId: p.userId, ...res } });
    toast(`${p.name} blocked`, "good");
    renderPeople($("#main"));
  } catch (e) { toast(e.message, "bad"); }
}

async function banTimeFlow(b) {
  const mins = await modal((box, close) => {
    box.innerHTML = `
      <h3>Time limit</h3>
      <p>How much longer <b>${esc(b.userName)}</b> stays blocked, counting from now.</p>
      <label>Duration<select id="bt-mins"></select></label>
      <div class="actions">
        <button class="btn" id="bt-cancel">Cancel</button>
        <button class="btn primary" id="bt-ok">Save</button>
      </div>`;
    const sel = $("#bt-mins", box);
    for (const [v, label] of DURATIONS) sel.append(el("option", { value: String(v), textContent: label }));
    $("#bt-cancel", box).onclick = () => close(null);
    $("#bt-ok", box).onclick = () => close(Number(sel.value));
  });
  if (mins === null) return;
  try {
    await api("/api/people/bantime", { method: "POST", body: { banId: b.id, minutes: mins } });
    toast(mins ? "Time limit set" : "Time limit removed", "good");
    renderPeople($("#main"));
  } catch (e) { toast(e.message, "bad"); }
}

/* ─────────────────────────────────────────────────────────── go */

// Guard against losing edits to a stray refresh or back-navigation.
window.addEventListener("beforeunload", e => {
  if (S.open?.dirty || S.page?.dirty) { e.preventDefault(); e.returnValue = ""; }
});

boot().catch(() => showLogin());
