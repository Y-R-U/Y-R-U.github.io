(() => {
  const DATA = window.DRK_DATA;
  const helperParam = new URLSearchParams(location.search).get("helper");
  const localHost = location.hostname === "127.0.0.1" || location.hostname === "localhost";
  const helperCandidates = helperParam
    ? [helperParam]
    : (localHost ? ["", "http://127.0.0.1:8788"] : ["http://127.0.0.1:8788"]);
  let activeHelperBase = helperCandidates[0];

  const els = {};
  let enabled = false;
  let activeTab = "character";
  let activeContext = null;
  let status = null;
  let pollTimer = null;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function request(path, options = {}) {
    return fetch(`${activeHelperBase}${path}`, {
      cache: "no-store",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
  }

  async function loadStatus() {
    let lastError = "helper unavailable";
    for (const candidate of helperCandidates) {
      activeHelperBase = candidate;
      try {
        const response = await request("/api/status");
        if (!response.ok) throw new Error(`helper returned ${response.status}`);
        const json = await response.json();
        if (!json.ok || !json.services || json.services.image_model !== "flux2-klein-9b-mlx-4bit") {
          throw new Error(json.error || "not the DRK helper");
        }
        status = json;
        return status;
      } catch (error) {
        lastError = error.message;
      }
    }
    status = { ok: false, offline: true, error: lastError, jobs: [], manifest: window.DRKGame.getManifest() };
    return status;
  }

  async function postJob(path, payload) {
    const response = await request(path, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json.ok === false) {
      throw new Error(json.error || `request failed: ${response.status}`);
    }
    window.DRKGame.showToast(`Queued ${json.job ? json.job.id : "job"}`);
    await loadStatus();
    render();
    startPolling();
  }

  function manifest() {
    return (status && status.manifest) || window.DRKGame.getManifest() || { characters: {}, backgrounds: {}, transitionVideos: [], loopingVideos: {} };
  }

  function allCharacters() {
    return [DATA.player, ...DATA.characters];
  }

  function sceneOptions(selected) {
    const rows = [];
    const man = manifest();
    allCharacters().forEach((person) => {
      const scenes = (man.characters && man.characters[person.id] && man.characters[person.id].scenes) || {
        character_card: { path: person.image, prompt: person.prompt }
      };
      Object.keys(scenes).forEach((sceneName) => {
        const value = `${person.id}:${sceneName}`;
        rows.push(`<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(person.name)} / ${escapeHtml(sceneName)}</option>`);
      });
    });
    return rows.join("");
  }

  function backgroundOptions(selected) {
    const man = manifest();
    const entries = Object.entries(man.backgrounds || {});
    if (!entries.length) {
      DATA.backgrounds.forEach((background) => entries.push([background.id, background]));
    }
    return entries.map(([id, background]) => (
      `<option value="${escapeHtml(id)}" ${id === selected ? "selected" : ""}>${escapeHtml(background.name || id)}</option>`
    )).join("");
  }

  function characterOptions(selected) {
    return allCharacters().map((person) => (
      `<option value="${person.id}" ${person.id === selected ? "selected" : ""}>${escapeHtml(person.name)}</option>`
    )).join("");
  }

  function selectedPerson() {
    const id = activeContext && activeContext.characterId ? activeContext.characterId : DATA.characters[0].id;
    return allCharacters().find((person) => person.id === id) || DATA.characters[0];
  }

  function selectedScene() {
    const person = selectedPerson();
    const sceneName = activeContext && activeContext.sceneName ? activeContext.sceneName : "character_card";
    const man = manifest();
    const scene = man.characters && man.characters[person.id] && man.characters[person.id].scenes
      ? man.characters[person.id].scenes[sceneName]
      : null;
    return scene || { path: person.image, prompt: person.prompt };
  }

  function tabs() {
    const labels = [
      ["character", "Character / Scene"],
      ["background", "Background"],
      ["loop", "Loop Video"],
      ["transition", "Transition"]
    ];
    return `<div class="debug-tabs">${labels.map(([id, label]) => (
      `<button class="debug-tab ${activeTab === id ? "active" : ""}" type="button" data-debug-tab="${id}">${label}</button>`
    )).join("")}</div>`;
  }

  function videoControls(prefix, includeEnd) {
    const currentKey = activeContext ? `${activeContext.characterId}:${activeContext.sceneName || "character_card"}` : "";
    return `
      <div class="form-row">
        <label for="${prefix}-name">Video name</label>
        <input id="${prefix}-name" value="${prefix === "transition" ? "transition_" : "loop_"}${escapeHtml(Date.now().toString().slice(-5))}">
      </div>
      <div class="form-row">
        <label for="${prefix}-first">First frame</label>
        <select id="${prefix}-first">${sceneOptions(currentKey)}</select>
      </div>
      <div class="form-row">
        <label for="${prefix}-end">${includeEnd ? "Last frame" : "Optional end frame"}</label>
        <select id="${prefix}-end">
          <option value="">None</option>
          ${sceneOptions("")}
        </select>
      </div>
      <div class="form-row">
        <label for="${prefix}-prompt">Prompt</label>
        <textarea id="${prefix}-prompt">${includeEnd ? "smooth cinematic transition between the selected first and last frame, mature dating sim atmosphere, no readable text, no watermark" : "subtle breathing motion and elegant camera drift, mature dating sim character loop, preserve identity and outfit, no readable text, no watermark"}</textarea>
      </div>
      <div class="form-row">
        <label for="${prefix}-type">Type</label>
        <select id="${prefix}-type">
          <option value="${includeEnd ? "TRANSITION" : "LOOPING"}">${includeEnd ? "TRANSITION" : "LOOPING"}</option>
          <option value="${includeEnd ? "LOOPING" : "TRANSITION"}">${includeEnd ? "LOOPING" : "TRANSITION"}</option>
        </select>
      </div>
      <div class="form-row">
        <label for="${prefix}-size">Size</label>
        <select id="${prefix}-size">
          <option value="192x320">192x320</option>
          <option value="320x512">320x512</option>
          <option value="576x1024" selected>576x1024</option>
        </select>
      </div>
      <div class="form-row">
        <label for="${prefix}-frames">Frames</label>
        <input id="${prefix}-frames" type="number" min="9" max="257" step="8" value="25">
      </div>
      <div class="form-row">
        <label for="${prefix}-seed">Seed blank = random</label>
        <input id="${prefix}-seed" inputmode="numeric" placeholder="random">
      </div>
    `;
  }

  function characterPanel() {
    const person = selectedPerson();
    const scene = selectedScene();
    const backgroundId = activeContext && activeContext.backgroundId ? activeContext.backgroundId : (person.backgroundId || "loft");
    return `
      <div class="debug-grid">
        <div class="form-grid">
          <div class="form-row">
            <label for="dbg-character">Character</label>
            <select id="dbg-character">${characterOptions(person.id)}</select>
          </div>
          <div class="form-row">
            <label for="dbg-image-name">Image name</label>
            <input id="dbg-image-name" value="${escapeHtml(activeContext && activeContext.sceneName ? activeContext.sceneName : "character_card")}">
          </div>
          <div class="form-row">
            <label for="dbg-background">Background reference</label>
            <select id="dbg-background">${backgroundOptions(backgroundId)}</select>
          </div>
          <div class="form-row">
            <label for="dbg-character-prompt">Editable prompt</label>
            <textarea id="dbg-character-prompt">${escapeHtml(scene.prompt || person.prompt || "")}</textarea>
          </div>
          <button class="primary-button" type="button" data-debug-action="character-image">Generate character image</button>
          <p class="muted-label">Use character_card for the primary card. Any other image name creates a character scene using the character card plus selected background as references.</p>
        </div>
        <div>
          ${previewThumb(scene.path, `${person.name} / ${activeContext && activeContext.sceneName ? activeContext.sceneName : "character_card"}`)}
          <div class="job-list">${jobRows()}</div>
        </div>
      </div>
    `;
  }

  function backgroundPanel() {
    const bg = (activeContext && activeContext.backgroundId) || "loft";
    const current = manifest().backgrounds && manifest().backgrounds[bg] ? manifest().backgrounds[bg] : {};
    return `
      <div class="debug-grid">
        <div class="form-grid">
          <div class="form-row">
            <label for="dbg-bg-name">Background image name</label>
            <input id="dbg-bg-name" value="${escapeHtml(bg)}">
          </div>
          <div class="form-row">
            <label for="dbg-bg-prompt">Editable prompt</label>
            <textarea id="dbg-bg-prompt">${escapeHtml(current.prompt || "vertical 576x1024 cinematic realistic dating sim background, elegant city location, no people, no readable text, no watermark")}</textarea>
          </div>
          <button class="primary-button" type="button" data-debug-action="background-image">Generate background image</button>
        </div>
        <div class="debug-preview-grid">
          ${Object.entries(manifest().backgrounds || {}).map(([id, item]) => previewThumb(item.path, item.name || id)).join("")}
        </div>
      </div>
    `;
  }

  function loopPanel() {
    return `
      <div class="debug-grid">
        <div class="form-grid">
          ${videoControls("loop", false)}
          <button class="primary-button" type="button" data-debug-action="loop-video">Generate LTX video</button>
        </div>
        <div>
          <p>LOOPING videos replace a scene image and loop until the player chooses an option or a transition starts.</p>
          <div class="job-list">${jobRows()}</div>
        </div>
      </div>
    `;
  }

  function transitionPanel() {
    return `
      <div class="debug-grid">
        <div class="form-grid">
          ${videoControls("transition", true)}
          <button class="primary-button" type="button" data-debug-action="transition-video">Generate transition video</button>
        </div>
        <div>
          <p>TRANSITION videos play once between two scene media keys. If no matching transition exists, gameplay skips straight to the next image or loop.</p>
          <div class="job-list">${jobRows()}</div>
        </div>
      </div>
    `;
  }

  function previewThumb(path, label) {
    if (!path) return `<div class="debug-thumb"><span>${escapeHtml(label)} missing</span></div>`;
    const isVideo = /\.mp4($|\?)/.test(path);
    return `
      <div class="debug-thumb">
        ${isVideo ? `<video src="${escapeHtml(path)}" muted playsinline loop></video>` : `<img src="${escapeHtml(path)}" alt="${escapeHtml(label)}">`}
        <span>${escapeHtml(label)}</span>
      </div>
    `;
  }

  function jobRows() {
    const jobs = (status && status.jobs ? status.jobs : []).slice(-8).reverse();
    if (!jobs.length) return `<div class="job-row">No helper jobs yet.</div>`;
    return jobs.map((job) => `
      <div class="job-row">
        <strong>${escapeHtml(job.task || "job")}</strong> ${escapeHtml(job.status || "queued")}
        <br>${escapeHtml(job.label || job.target || job.id)}
        ${job.error ? `<br><span>${escapeHtml(job.error)}</span>` : ""}
      </div>
    `).join("");
  }

  function render() {
    const offline = status && status.offline;
    const panel = activeTab === "character" ? characterPanel()
      : activeTab === "background" ? backgroundPanel()
        : activeTab === "loop" ? loopPanel()
          : transitionPanel();
    els.debugBody.innerHTML = `
      ${tabs()}
      ${offline ? `<div class="job-row"><strong>Helper offline.</strong> Run <code>python3 regen_helper.py</code> in this folder and open <code>http://127.0.0.1:8788/?debug</code>.</div>` : ""}
      ${panel}
    `;
    els.debugBody.querySelectorAll("video").forEach((video) => video.play().catch(() => {}));
  }

  function parseScene(value) {
    const [characterId, sceneName] = String(value || "").split(":");
    return { characterId, sceneName: sceneName || "character_card" };
  }

  function videoPayload(prefix, forceType) {
    const [width, height] = document.getElementById(`${prefix}-size`).value.split("x").map(Number);
    const first = parseScene(document.getElementById(`${prefix}-first`).value);
    const endValue = document.getElementById(`${prefix}-end`).value;
    const seedRaw = document.getElementById(`${prefix}-seed`).value.trim();
    return {
      name: document.getElementById(`${prefix}-name`).value,
      type: forceType || document.getElementById(`${prefix}-type`).value,
      firstFrame: first,
      endFrame: endValue ? parseScene(endValue) : null,
      prompt: document.getElementById(`${prefix}-prompt`).value,
      width,
      height,
      numFrames: Number(document.getElementById(`${prefix}-frames`).value || 25),
      seed: seedRaw ? Number(seedRaw) : null
    };
  }

  async function handleAction(action) {
    try {
      if (action === "character-image") {
        const characterId = document.getElementById("dbg-character").value;
        const imageName = document.getElementById("dbg-image-name").value;
        await postJob("/api/character-image", {
          characterId,
          imageName,
          backgroundId: document.getElementById("dbg-background").value,
          prompt: document.getElementById("dbg-character-prompt").value
        });
      }
      if (action === "background-image") {
        await postJob("/api/background-image", {
          name: document.getElementById("dbg-bg-name").value,
          prompt: document.getElementById("dbg-bg-prompt").value
        });
      }
      if (action === "loop-video") {
        await postJob("/api/video", videoPayload("loop", "LOOPING"));
      }
      if (action === "transition-video") {
        await postJob("/api/video", videoPayload("transition", "TRANSITION"));
      }
    } catch (error) {
      window.DRKGame.showToast(error.message);
    }
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = window.setInterval(async () => {
      await loadStatus();
      if (status && status.manifest) {
        await window.DRKGame.refreshMediaManifest();
      }
      if (!els.debugModal.classList.contains("hidden")) render();
      const running = status && status.jobs && status.jobs.some((job) => ["queued", "running", "generating", "polling"].includes(job.status));
      if (!running) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
    }, 3500);
  }

  async function open(ctx) {
    activeContext = ctx || window.DRKGame.getMediaContext();
    await loadStatus();
    els.debugModal.classList.remove("hidden");
    render();
    startPolling();
  }

  function close() {
    els.debugModal.classList.add("hidden");
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    document.body.classList.toggle("debug-enabled", enabled);
    if (window.DRKGame) window.DRKGame.render();
    if (window.DRKGame && window.DRKGame.showToast) {
      window.DRKGame.showToast(enabled ? "Debug on. Tap the media to edit it." : "Debug off.");
    }
    if (!enabled) close();
  }

  function bindEvents() {
    els.debugClose.addEventListener("click", close);
    els.debugModal.addEventListener("click", (event) => {
      if (event.target === els.debugModal) close();
    });
    els.debugBody.addEventListener("click", (event) => {
      const tab = event.target.closest("[data-debug-tab]");
      if (tab) {
        activeTab = tab.dataset.debugTab;
        render();
        return;
      }
      const action = event.target.closest("[data-debug-action]");
      if (action) handleAction(action.dataset.debugAction);
    });
    els.debugBody.addEventListener("change", (event) => {
      if (event.target.id === "dbg-character") {
        activeContext = {
          ...activeContext,
          characterId: event.target.value,
          sceneName: "character_card"
        };
        render();
      }
    });
  }

  function init() {
    Object.assign(els, {
      debugModal: document.getElementById("debug-modal"),
      debugBody: document.getElementById("debug-body"),
      debugClose: document.getElementById("debug-close")
    });
    bindEvents();
    // DEV ONLY: debug is toggled by tapping the DRK logo (see game.js brand handler) or ?debug.
    // Remove the logo-debug toggle before any public deployment.
    if (new URLSearchParams(location.search).has("debug")) setEnabled(true);
  }

  // toggle() is what the DRK logo calls
  window.DRKDebug = { open, close, loadStatus, toggle: () => setEnabled(!enabled) };
  document.addEventListener("DOMContentLoaded", init);
})();
