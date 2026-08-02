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
  open: null,      // { path, text, dirty }
  expanded: new Set(),
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
        <div><strong>${esc(warning)}</strong><span>${detail || ""}</span></div>
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
    S.expanded = new Set();
    await loadFiles();
    render();
  } catch (e) { toast(e.message, "bad"); }
}

async function loadFiles() {
  const r = await api(`/api/projects/${S.project.id}/files`);
  S.files = r.files;
  if (r.project) Object.assign(S.project, r.project);
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
  work.append(buildTreePanel(), buildEditorPanel());
  m.append(work);
}

/* ---- file tree ---- */

// Builds a nested tree from the flat path list the API returns.
function buildTree(files) {
  const root = { dirs: new Map(), files: [] };
  for (const f of files) {
    const parts = f.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node.dirs.has(parts[i])) node.dirs.set(parts[i], { dirs: new Map(), files: [] });
      node = node.dirs.get(parts[i]);
    }
    node.files.push({ ...f, name: parts[parts.length - 1] });
  }
  return root;
}

function iconFor(name) {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
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
  const header = el("header", {}, el("span", { textContent: "Files" }), el("div", { className: "spacer" }));

  if (canWrite()) {
    const add = el("button", { className: "btn ghost sm", textContent: "+ File", title: "New file" });
    add.onclick = () => newEntry("newfile");
    const addDir = el("button", { className: "btn ghost sm", textContent: "+ Folder", title: "New folder" });
    addDir.onclick = () => newEntry("newfolder");
    const up = el("button", { className: "btn ghost sm", textContent: "⬆ Upload" });
    up.onclick = pickUpload;
    header.append(add, addDir, up);
  }
  panel.append(header);

  const tree = el("div", { className: "tree" });
  if (!S.files.length) {
    tree.append(el("div", { className: "empty", style: "padding:26px 12px",
      textContent: canWrite() ? "No files yet — upload or create one." : "No files yet." }));
  } else {
    renderNode(tree, buildTree(S.files), "", 0);
  }
  panel.append(tree);

  if (canWrite()) {
    const dz = el("div", { className: "dropzone", textContent: "Drop files here to upload" });
    dz.style.margin = "0 12px 12px";
    dz.ondragover = e => { e.preventDefault(); dz.classList.add("over"); };
    dz.ondragleave = () => dz.classList.remove("over");
    dz.ondrop = e => {
      e.preventDefault(); dz.classList.remove("over");
      if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
    };
    panel.append(dz);
  }
  return panel;
}

function renderNode(host, node, prefix, depth) {
  for (const [name, child] of [...node.dirs.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const full = prefix ? `${prefix}/${name}` : name;
    const isOpen = S.expanded.has(full);
    const row = el("button", { className: "row" });
    row.style.paddingLeft = `${8 + depth * 13}px`;
    row.innerHTML = `<span class="ico">${isOpen ? "📂" : "📁"}</span><span class="nm">${esc(name)}</span>`;
    row.onclick = () => { isOpen ? S.expanded.delete(full) : S.expanded.add(full); render(); };
    if (canWrite()) row.oncontextmenu = e => { e.preventDefault(); entryMenu(full, true); };
    host.append(row);
    if (isOpen) renderNode(host, child, full, depth + 1);
  }
  for (const f of node.files.sort((a, b) => a.name.localeCompare(b.name))) {
    const row = el("button", { className: "row" + (S.open?.path === f.path ? " on" : "") });
    row.style.paddingLeft = `${8 + depth * 13}px`;
    row.innerHTML = `<span class="ico">${iconFor(f.name)}</span>
                     <span class="nm">${esc(f.name)}</span>
                     <span class="sz">${fmtBytes(f.size)}</span>`;
    row.onclick = () => openFile(f.path);
    if (canWrite()) row.oncontextmenu = e => { e.preventDefault(); entryMenu(f.path, false); };
    host.append(row);
  }
}

/* ---- editor / preview ---- */

const TEXT_EXT = new Set([".json", ".txt", ".md", ".js", ".mjs", ".ts", ".css", ".html", ".htm",
  ".xml", ".yml", ".yaml", ".mcfunction", ".lang", ".properties", ".csv", ".ini", ".cfg",
  ".conf", ".sh", ".py", ".go", ".toml", ".gitignore", ".env", ".log", ".material",
  ".fragment", ".vertex", ".glsl", ".svg"]);

const isText = p => TEXT_EXT.has(p.slice(p.lastIndexOf(".")).toLowerCase());

function buildEditorPanel() {
  const panel = el("div", { className: "panel" });
  if (!S.open) {
    panel.append(el("header", {}, el("span", { textContent: "Editor" })));
    panel.append(el("div", { className: "empty", style: "border:0" },
      "Select a file on the left to view or edit it."));
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
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
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

async function openFile(path) {
  if (S.open?.dirty) {
    const go = await confirmDanger({
      title: "Discard unsaved changes?",
      warning: `“${S.open.path}” has unsaved edits.`,
      detail: "Opening another file will discard them.",
      confirmLabel: "Discard changes",
    });
    if (!go) return;
  }
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
  const name = await promptModal({
    title: isDir ? "New folder" : "New file",
    label: "Path (use / for folders)",
    placeholder: isDir ? "textures/items" : "manifest.json",
    okLabel: "Create",
  });
  if (!name) return;
  try {
    await api(`/api/projects/${S.project.id}/files`, { method: "POST", body: { action, path: name } });
    await loadFiles();
    if (!isDir) await openFile(name); else { S.expanded.add(name); render(); }
    toast(isDir ? "Folder created" : "File created", "good");
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
      if (S.open?.path === path) S.open.path = to;
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

/* ---- uploads ---- */

function pickUpload() {
  const inp = el("input", { type: "file", multiple: true });
  inp.style.display = "none";
  document.body.append(inp);
  inp.onchange = () => { if (inp.files.length) uploadFiles(inp.files); inp.remove(); };
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
          <input id="iz-dest" placeholder="leave empty for the project root" spellcheck="false"></label>
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
      if (xhr.status >= 200 && xhr.status < 300) {
        close(true);
        await loadFiles(); render();
        toast(data.extracted != null ? `Extracted ${data.extracted} file(s)` : "Upload complete", "good");
      } else {
        close(null);
        toast(data.error || `Upload failed (${xhr.status})`, "bad");
        await loadFiles(); render();
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
  if (S.open?.dirty) { e.preventDefault(); e.returnValue = ""; }
});

boot().catch(() => showLogin());
