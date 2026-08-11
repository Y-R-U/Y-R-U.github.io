// Monster clip selection, jump-scare punch-in, and the debug Monsters browser.
//
// Byte-identical in awake/ and the_horrors/ — everything project-specific comes
// from js/variants.js, which gen_monsters.py writes. Loaded before game.js.
//
// Three jobs:
//   1. resolve which of a monster's rendered clip variants the game plays
//   2. run the tap-to-zoom punch-in at the end of a scare clip
//   3. render the Monsters tab of the debug panel (monster → release/attack →
//      every variant, tick the one to use)
//
// Everything works with no local helper: picks and zoom settings fall back to
// localStorage so the deployed site is fully reviewable off the home network.
// The helper, when present, writes the same values back into js/variants.js so
// they can be committed.
(function () {
  "use strict";

  const data = window.MonsterVariants || { game: "", monsters: [], clips: {}, zoom: {} };
  const GAME = data.game || "hub";
  const PICKS_KEY = `${GAME}.monsterPicks.v1`;
  const ZOOM_KEY = `${GAME}.monsterZoom.v1`;
  const KINDS = ["release", "attack"];

  const DEFAULT_ZOOM = { enabled: false, x: 0.5, y: 0.42, scale: 2.4, lead: 0.9, fade: 0.45 };

  function readStore(key) {
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  function writeStore(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      /* private mode / quota — the in-memory copy still drives this session */
    }
  }

  let localPicks = readStore(PICKS_KEY);
  let localZoom = readStore(ZOOM_KEY);

  // Set by game.js once it knows whether the regen helper answered. When it is
  // a function, edits are also pushed to the helper so they land in git.
  let helperPost = null;

  const key = (kind, id) => `${kind}:${id}`;

  function entry(kind, id) {
    return data.clips[key(kind, id)] || { selected: "", variants: [] };
  }

  function monsters() {
    return Array.isArray(data.monsters) ? data.monsters : [];
  }

  function variants(kind, id) {
    return entry(kind, id).variants.slice();
  }

  function clip(kind, id) {
    const picked = localPicks[key(kind, id)];
    const list = entry(kind, id).variants;
    if (picked && list.some(item => item.src === picked)) return picked;
    const selected = entry(kind, id).selected;
    if (selected && list.some(item => item.src === selected)) return selected;
    return list.length ? list[list.length - 1].src : "";
  }

  function select(kind, id, src) {
    localPicks[key(kind, id)] = src;
    writeStore(PICKS_KEY, localPicks);
    if (helperPost) {
      helperPost("/api/variant_select", { kind, monster: id, src })
        .catch(() => {});
    }
  }

  function zoomFor(src) {
    const stored = localZoom[src] || data.zoom[src] || {};
    return Object.assign({}, DEFAULT_ZOOM, stored);
  }

  function setZoom(src, config) {
    const next = Object.assign({}, zoomFor(src), config);
    localZoom[src] = next;
    writeStore(ZOOM_KEY, localZoom);
    if (helperPost) helperPost("/api/variant_zoom", { src, zoom: next }).catch(() => {});
    return next;
  }

  function exportPicks() {
    return JSON.stringify({ picks: localPicks, zoom: localZoom }, null, 2);
  }

  function clearLocal() {
    localPicks = {};
    localZoom = {};
    writeStore(PICKS_KEY, localPicks);
    writeStore(ZOOM_KEY, localZoom);
  }

  // ── jump-scare punch-in ─────────────────────────────────────────────
  // LTX clips rarely land the creature right at the lens on the last frame —
  // it usually stops a step or two short. The punch rescues that: near the end
  // of playback the video scales toward a point the reviewer tapped, then fades
  // out, so the clip ends on the face instead of on a mid-corridor stall.
  function punch(video, src, options) {
    const config = zoomFor(src);
    if (!video || !config.enabled) return () => {};
    const settings = Object.assign({}, config, options || {});
    let fadeEl = null;
    let armed = false;
    let cleaned = false;

    const parent = video.parentElement;
    let resetTimer = 0;
    const reset = () => {
      clearTimeout(resetTimer);
      video.style.transition = "";
      video.style.transform = "";
      video.style.transformOrigin = "";
      if (fadeEl && fadeEl.parentElement) fadeEl.parentElement.removeChild(fadeEl);
      fadeEl = null;
    };
    // Anything already on screen from a previous punch on this element.
    if (parent) parent.querySelectorAll(".scare-punch-fade").forEach(node => node.remove());

    const fire = () => {
      if (armed) return;
      armed = true;
      const duration = Math.max(0.15, settings.lead);
      video.style.transformOrigin = `${(settings.x * 100).toFixed(2)}% ${(settings.y * 100).toFixed(2)}%`;
      video.style.transition = `transform ${duration}s cubic-bezier(0.55, 0, 0.85, 0.35)`;
      video.style.transform = `scale(${settings.scale})`;
      if (parent) {
        fadeEl = document.createElement("div");
        fadeEl.className = "scare-punch-fade";
        parent.appendChild(fadeEl);
        const fadeDelay = Math.max(0, duration - settings.fade);
        fadeEl.style.transition = `opacity ${settings.fade}s ease-in ${fadeDelay}s`;
        requestAnimationFrame(() => { fadeEl.style.opacity = "1"; });
      }
    };

    const onTime = () => {
      const duration = video.duration;
      if (!Number.isFinite(duration) || duration <= 0) return;
      if (video.currentTime >= duration - settings.lead) fire();
    };

    // Hold the punched frame for a beat before unwinding: the fade is opaque by
    // then, so the reset happens behind black instead of snapping the creature
    // back to its starting size on screen. `immediate` skips the hold when the
    // element is being reused for something else.
    const stop = immediate => {
      if (cleaned) return;
      cleaned = true;
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("ended", onEnd);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("emptied", onEmptied);
      if (!armed || immediate === true) reset();
      else resetTimer = setTimeout(reset, 500);
    };
    const onEnd = () => stop(false);
    const onEmptied = () => stop(true);
    // The debug preview clamps playback by pausing at the trim end, so `ended`
    // never fires there — treat a pause inside the punch window as the finish.
    const onPause = () => { if (armed) stop(false); };

    video.addEventListener("timeupdate", onTime);
    video.addEventListener("ended", onEnd);
    video.addEventListener("pause", onPause);
    video.addEventListener("emptied", onEmptied);
    return stop;
  }

  // Play a clip in a preview element with the punch applied, from the start.
  function previewPunch(video, src) {
    const stop = punch(video, src, {});
    try { video.currentTime = 0; } catch (err) {}
    const play = video.play();
    if (play && play.catch) play.catch(() => {});
    return stop;
  }

  // ── zoom-point editor ───────────────────────────────────────────────
  // Arm it, tap the spot on the preview that should end up filling the screen,
  // then scrub scale/lead until the punch lands. Writes straight through to the
  // same store the runtime reads.
  function mountZoomEditor(video, host, ctx) {
    let current = "";
    let armed = false;
    let marker = null;
    let stopPreview = () => {};

    host.innerHTML =
      '<div class="zoom-editor-row">' +
      '<label class="regen-checkbox"><input type="checkbox" data-zoom="enabled"> <span>Zoom punch-in</span></label>' +
      '<button class="glass-button slim" type="button" data-zoom="pick">Tap a spot</button>' +
      '<button class="glass-button slim" type="button" data-zoom="test">Test</button>' +
      "</div>" +
      '<div class="zoom-editor-sliders">' +
      '<label><span>Zoom <b data-zoom="scale-value">2.4×</b></span>' +
      '<input type="range" min="1.2" max="5" step="0.1" data-zoom="scale"></label>' +
      '<label><span>Starts <b data-zoom="lead-value">0.90s</b> before the end</span>' +
      '<input type="range" min="0.2" max="2.5" step="0.05" data-zoom="lead"></label>' +
      "</div>" +
      '<p class="debug-note" data-zoom="hint">Select a monster clip to set its jump-scare zoom.</p>';

    const field = name => host.querySelector(`[data-zoom="${name}"]`);
    const enabled = field("enabled");
    const scale = field("scale");
    const lead = field("lead");

    // The preview element has native controls, so an armed tap has to land on a
    // layer above them or half the frame is unreachable on a phone.
    function syncPickLayer() {
      const parent = video.parentElement;
      if (!parent) return;
      let layer = parent.querySelector(".zoom-pick-layer");
      if (!armed) {
        if (layer) layer.remove();
        return;
      }
      if (layer) return;
      layer = document.createElement("div");
      layer.className = "zoom-pick-layer";
      layer.addEventListener("click", pickAt);
      parent.appendChild(layer);
    }

    function syncMarker(config) {
      if (!marker) {
        marker = document.createElement("div");
        marker.className = "zoom-marker";
        if (video.parentElement) video.parentElement.appendChild(marker);
      }
      marker.style.left = `${config.x * 100}%`;
      marker.style.top = `${config.y * 100}%`;
      marker.hidden = !config.enabled;
    }

    function sync() {
      const config = zoomFor(current);
      enabled.checked = !!config.enabled;
      scale.value = config.scale;
      lead.value = config.lead;
      field("scale-value").textContent = `${Number(config.scale).toFixed(1)}×`;
      field("lead-value").textContent = `${Number(config.lead).toFixed(2)}s`;
      field("hint").textContent = current
        ? (armed ? "Tap the video where the scare should land." : "Tap a spot, then Test to check the punch.")
        : "Select a monster clip to set its jump-scare zoom.";
      host.classList.toggle("armed", armed);
      host.classList.toggle("disabled", !current);
      syncMarker(config);
      syncPickLayer();
    }

    function pickAt(event) {
      if (!current) return;
      const rect = video.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
      armed = false;
      change({ x, y, enabled: true });
      stopPreview();
      stopPreview = previewPunch(video, current);
    }

    function change(patch) {
      if (!current) return;
      setZoom(current, patch);
      sync();
      if (ctx && ctx.onZoomChange) ctx.onZoomChange(current);
    }

    enabled.addEventListener("change", () => change({ enabled: enabled.checked }));
    scale.addEventListener("input", () => change({ scale: parseFloat(scale.value) }));
    lead.addEventListener("input", () => change({ lead: parseFloat(lead.value) }));
    field("pick").addEventListener("click", () => {
      armed = !armed;
      sync();
    });
    field("test").addEventListener("click", () => {
      if (!current) return;
      stopPreview();
      stopPreview = previewPunch(video, current);
    });
    video.addEventListener("click", event => {
      if (armed && current) pickAt(event);
    });

    return {
      setClip(src) {
        current = src || "";
        armed = false;
        stopPreview();
        stopPreview = () => {};
        sync();
      },
    };
  }

  // ── debug browser ───────────────────────────────────────────────────
  // ctx: { onPreview(src, transitionLike), onRegen(kind, monster), helperOnline,
  //        escapeHtml(text), toast(text) }
  let view = { monster: "", kind: "release", zoomArmed: false };

  function esc(ctx, value) {
    return ctx.escapeHtml ? ctx.escapeHtml(String(value == null ? "" : value)) : String(value == null ? "" : value);
  }

  function sizeLabel(bytes) {
    if (!bytes) return "missing";
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    return `${Math.round(bytes / 1024)} KB`;
  }

  function renderBrowser(host, ctx) {
    host.innerHTML = "";
    if (!monsters().length) {
      const empty = document.createElement("p");
      empty.className = "debug-note";
      empty.textContent = "No monster manifest. Run gen_monsters.py seed to build js/variants.js.";
      host.append(empty);
      return;
    }
    if (!view.monster) return renderGrid(host, ctx);
    renderDetail(host, ctx);
  }

  function renderGrid(host, ctx) {
    const section = document.createElement("section");
    section.className = "debug-section";
    const heading = document.createElement("h3");
    heading.textContent = "Monsters";
    section.append(heading);
    const grid = document.createElement("div");
    grid.className = "monster-grid";
    monsters().forEach(monster => {
      const card = document.createElement("button");
      card.className = "monster-card";
      card.type = "button";
      const counts = KINDS.map(kind => `${kind[0].toUpperCase()}${variants(kind, monster.id).length}`).join(" · ");
      card.innerHTML =
        `<img src="${esc(ctx, monster.ref || "")}" alt="" loading="lazy">` +
        `<span><strong>${esc(ctx, monster.name || monster.id)}</strong>` +
        `<small>${esc(ctx, monster.id)}</small><small>${esc(ctx, counts)}</small></span>`;
      card.addEventListener("click", () => {
        view.monster = monster.id;
        view.kind = "release";
        renderBrowser(host, ctx);
        const first = clip(view.kind, monster.id);
        if (first && ctx.onPreview) ctx.onPreview(first, previewMeta(monster, view.kind, first));
      });
      grid.append(card);
    });
    section.append(grid);
    host.append(section);
  }

  function previewMeta(monster, kind, src) {
    const found = variants(kind, monster.id).find(item => item.src === src);
    return {
      file: src.split("/").pop(),
      src,
      group: `monster_${kind}`,
      label: `${monster.name || monster.id} ${kind}`,
      poster: (kind === "attack" ? monster.attackRef : monster.ref) || "images/hallway.jpg",
      promptText: (found && found.prompt) || "",
      status: (found && found.note) || "",
      monsterId: monster.id,
      kind,
    };
  }

  function renderDetail(host, ctx) {
    const monster = monsters().find(item => item.id === view.monster);
    if (!monster) {
      view.monster = "";
      return renderBrowser(host, ctx);
    }
    const section = document.createElement("section");
    section.className = "debug-section monster-detail";

    const head = document.createElement("div");
    head.className = "monster-detail-head";
    const back = document.createElement("button");
    back.className = "glass-button slim";
    back.type = "button";
    back.textContent = "‹ All monsters";
    back.addEventListener("click", () => {
      view.monster = "";
      renderBrowser(host, ctx);
    });
    const title = document.createElement("h3");
    title.textContent = monster.name || monster.id;
    head.append(back, title);
    section.append(head);

    const refs = document.createElement("div");
    refs.className = "monster-refs";
    [["Reference", monster.ref], ["Attack close-up", monster.attackRef]].forEach(([label, src]) => {
      const figure = document.createElement("figure");
      figure.className = "monster-ref";
      figure.innerHTML = src
        ? `<img src="${esc(ctx, src)}" alt="" loading="lazy"><figcaption>${esc(ctx, label)}</figcaption>`
        : `<div class="monster-ref-missing">no image</div><figcaption>${esc(ctx, label)}</figcaption>`;
      refs.append(figure);
    });
    section.append(refs);

    const tabs = document.createElement("div");
    tabs.className = "segmented-buttons monster-kind-tabs";
    KINDS.forEach(kind => {
      const button = document.createElement("button");
      button.className = `filter-chip${kind === view.kind ? " active" : ""}`;
      button.type = "button";
      button.textContent = `${kind.toUpperCase()} (${variants(kind, monster.id).length})`;
      button.addEventListener("click", () => {
        view.kind = kind;
        renderBrowser(host, ctx);
        const current = clip(kind, monster.id);
        if (current && ctx.onPreview) ctx.onPreview(current, previewMeta(monster, kind, current));
      });
      tabs.append(button);
    });
    section.append(tabs);

    const list = document.createElement("div");
    list.className = "variant-list";
    const rows = variants(view.kind, monster.id);
    const chosen = clip(view.kind, monster.id);
    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "debug-note";
      empty.textContent = "No renders yet for this beat.";
      list.append(empty);
    }
    rows.forEach(item => {
      const row = document.createElement("div");
      row.className = `variant-row${item.src === chosen ? " chosen" : ""}`;
      const pick = document.createElement("button");
      pick.className = "glass-button variant-pick";
      pick.type = "button";
      const zoomOn = zoomFor(item.src).enabled ? " · zoom" : "";
      pick.innerHTML =
        `<strong>v${esc(ctx, item.n)}${item.note ? ` — ${esc(ctx, item.note)}` : ""}</strong>` +
        `<small>${esc(ctx, item.file)}</small>` +
        `<small>${esc(ctx, sizeLabel(item.bytes))} | ${esc(ctx, item.created || "")}${esc(ctx, zoomOn)}</small>`;
      pick.addEventListener("click", () => {
        if (ctx.onPreview) ctx.onPreview(item.src, previewMeta(monster, view.kind, item.src));
      });
      const use = document.createElement("button");
      use.className = `glass-button slim variant-use${item.src === chosen ? " active" : ""}`;
      use.type = "button";
      use.textContent = item.src === chosen ? "✓ In use" : "Use";
      use.addEventListener("click", () => {
        select(view.kind, monster.id, item.src);
        renderBrowser(host, ctx);
        if (ctx.toast) ctx.toast(`${monster.name || monster.id} ${view.kind}: v${item.n} selected`);
      });
      row.append(pick, use);
      list.append(row);
    });
    section.append(list);

    const actions = document.createElement("div");
    actions.className = "monster-actions";
    if (ctx.onRegen) {
      const regen = document.createElement("button");
      regen.className = "glass-button primary";
      regen.type = "button";
      regen.textContent = "Render another variant";
      regen.disabled = !ctx.helperOnline;
      regen.title = ctx.helperOnline ? "" : "Needs the local regen helper";
      regen.addEventListener("click", () => ctx.onRegen(view.kind, monster));
      actions.append(regen);
    }
    const copy = document.createElement("button");
    copy.className = "glass-button slim";
    copy.type = "button";
    copy.textContent = "Copy my picks";
    copy.addEventListener("click", () => {
      const text = exportPicks();
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text);
      if (ctx.toast) ctx.toast("Picks + zoom settings copied as JSON");
    });
    actions.append(copy);
    section.append(actions);

    host.append(section);
  }

  window.MonsterKit = {
    ready: () => monsters().length > 0,
    game: GAME,
    monsters,
    variants,
    clip,
    select,
    zoomFor,
    setZoom,
    punch,
    previewPunch,
    mountZoomEditor,
    exportPicks,
    clearLocal,
    renderBrowser,
    view,
    setHelper(post) { helperPost = post || null; },
    // Merge the helper's authoritative manifest (it re-reads js/variants.js on
    // disk) so a redo queued in one tab shows up in another without a reload.
    merge(next) {
      if (!next || typeof next !== "object") return;
      if (Array.isArray(next.monsters)) data.monsters = next.monsters;
      if (next.clips) data.clips = next.clips;
      if (next.zoom) data.zoom = next.zoom;
    },
  };
})();
