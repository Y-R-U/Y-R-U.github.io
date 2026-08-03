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

/* ────────────────────────────────────────────────────────── boot */

async function boot() {
  const me = await api("/api/me");
  if (!me.user) { showLogin(); return; }
  if (me.user.mustReset) { S.user = me.user; showReset(); return; }

  S.user = me.user;
  S.limits = me.limits || {};
  $("#boot").hidden = true;
  $("#view-login").hidden = true;
  $("#view-reset").hidden = true;
  $("#app").hidden = false;

  $("#who-name").textContent = S.user.username;
  const role = $("#who-role");
  role.textContent = S.user.role;
  role.className = "badge " + S.user.role;

  renderTabs();
  render();
}

function tabsFor() {
  const t = [["projects", "Projects"]];
  if (S.user.role === "lead") t.push(["users", "Users"]);
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

  const work = el("div", { className: "work" });
  work.style.marginTop = "14px";
  // Left column: the file list, with the project's pages listed under it.
  const side = el("div", { className: "sidecol" }, buildTreePanel(), buildPagesPanel());
  work.append(side, buildEditorPanel());
  m.append(work);
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

  // Pages are the lead's to create, so this sits with the other authoring
  // buttons but appears only for them.
  if (S.project.canManage) {
    const addPage = el("button", { className: "btn ghost sm", textContent: "+ Page", title: "Add a page" });
    addPage.onclick = createPageFlow;
    header.append(addPage);
  }

  if (canWrite()) {
    const add = el("button", { className: "btn ghost sm", textContent: "+ File", title: "New file here" });
    add.onclick = () => newEntry("newfile");
    const addDir = el("button", { className: "btn ghost sm", textContent: "+ Folder", title: "New folder here" });
    addDir.onclick = () => newEntry("newfolder");
    // Icon-only: the panel is 300px and the row wraps otherwise.
    const up = el("button", {
      className: "btn ghost sm viewtoggle", textContent: "⬆",
      title: "Upload files here", "aria-label": "Upload files here",
    });
    up.onclick = pickUpload;
    header.append(add, addDir, up);
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
    el("div", { className: "spacer" }));

  const dl = el("button", { className: "btn ghost sm", textContent: "⬇ Download" });
  dl.onclick = () => {
    location.href = `/api/projects/${S.project.id}/files?path=${encodeURIComponent(o.path)}`;
  };
  header.append(dl);

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
  if (!isText(path)) { S.open = { path, text: null, dirty: false }; render(); return; }
  try {
    const r = await api(`/api/projects/${S.project.id}/files?path=${encodeURIComponent(path)}&mode=text`);
    S.open = { path, text: r.content, dirty: false };
  } catch (e) {
    // Too large, or not really text after all — fall back to the preview pane.
    toast(e.message, "bad");
    S.open = { path, text: null, dirty: false };
  }
  render();
}

async function saveOpenFile() {
  const o = S.open;
  if (!o || o.text == null || !o.dirty) return;
  // Re-rendering swaps in a fresh textarea, so remember where the caret was and
  // put it back — saving mid-edit shouldn't throw the user to the top of the file.
  const before = document.querySelector(".editor");
  const caret = before ? [before.selectionStart, before.selectionEnd, before.scrollTop] : null;
  const hadFocus = before && document.activeElement === before;
  try {
    await api(`/api/projects/${S.project.id}/files`, {
      method: "PUT", body: { path: o.path, content: o.text },
    });
    o.dirty = false;
    await loadFiles();
    toast("Saved", "good");
    render();
    const after = document.querySelector(".editor");
    if (after && caret) {
      after.selectionStart = caret[0]; after.selectionEnd = caret[1]; after.scrollTop = caret[2];
      if (hadFocus) after.focus();
    }
  } catch (e) { toast(e.message, "bad"); }
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
        ? "No pages yet. Use “+ Page” above the file list to add one."
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
    ed.oninput = markPageDirty;
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

async function savePage() {
  const g = S.page;
  if (!g || !g.canEdit) return;
  const ed = document.querySelector(".pagedit");
  if (!ed) return;
  const html = sanitizePageHTML(ed.innerHTML);
  try {
    const r = await api(`/api/projects/${S.project.id}/pages/${g.id}`, { method: "PUT", body: { html } });
    g.html = html;
    g.dirty = false;
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
    if (foot) foot.textContent = `Saved ${fmtDate(g.updatedAt)} by ${S.user.username}`;
    toast("Page saved", "good");
  } catch (e) { toast(e.message, "bad"); }
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

/* ─────────────────────────────────────────────────────────── go */

// Guard against losing edits to a stray refresh or back-navigation.
window.addEventListener("beforeunload", e => {
  if (S.open?.dirty || S.page?.dirty) { e.preventDefault(); e.returnValue = ""; }
});

boot().catch(() => showLogin());
