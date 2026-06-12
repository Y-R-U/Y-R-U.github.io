// Debug panel (🐞 top right): lists every registered object grouped by
// category with live position + triangle counts, renderer stats, and
// wireframe / collider / pause toggles. Focus flies the camera to an object.

import * as THREE from 'three';
import { registry, countTris } from './registry.js';
import { groundHeight } from './world.js';

const CATEGORY_ORDER = ['Characters', 'Animals', 'Buildings', 'Props', 'Pickups', 'Environment'];

export const debugFlags = { paused: false };

export function initDebug({ scene, renderer, controls, getFps, playerGroups = [] }) {
  const panel = document.getElementById('debug-panel');
  const btn = document.getElementById('debug-btn');
  let open = false, statsTimer = null;
  let colliderGroup = null, wireframe = false, collidersOn = false;
  let highlight = null, highlightT = null;

  // ── panel skeleton ──
  panel.innerHTML = `
    <div class="dbg-header">
      <span class="dbg-title">🐞 Scene Objects</span>
      <button class="dbg-close" aria-label="Close">✕</button>
    </div>
    <div class="dbg-stats"></div>
    <div class="dbg-toggles">
      <button class="dbg-toggle" data-t="wire">Wireframe</button>
      <button class="dbg-toggle" data-t="coll">Colliders</button>
      <button class="dbg-toggle" data-t="pause">Pause</button>
    </div>
    <div class="dbg-list"></div>`;

  const statsEl = panel.querySelector('.dbg-stats');
  const listEl = panel.querySelector('.dbg-list');

  function buildList() {
    listEl.innerHTML = '';
    for (const cat of CATEGORY_ORDER) {
      const entries = registry.filter(e => e.category === cat);
      if (!entries.length) continue;
      const head = document.createElement('div');
      head.className = 'dbg-cat';
      head.textContent = `${cat} (${entries.length})`;
      listEl.appendChild(head);
      for (const e of entries) {
        if (e.tris === undefined) e.tris = countTris(e.object);
        const row = document.createElement('div');
        row.className = 'dbg-row' + (e.dead ? ' dead' : '');
        row.dataset.id = e.id;
        row.innerHTML = `
          <span class="icon">${e.icon}</span>
          <div class="info">
            <div class="nm">${e.name}</div>
            <div class="meta"></div>
            ${e.note ? `<div class="meta">${e.note}</div>` : ''}
          </div>
          <button class="focus">${e.focusLabel || 'Focus'}</button>`;
        row.querySelector('.focus').addEventListener('click', () => focusEntry(e));
        listEl.appendChild(row);
      }
    }
    updateRows();
  }

  function updateRows() {
    const v = new THREE.Vector3();
    for (const row of listEl.querySelectorAll('.dbg-row')) {
      const e = registry[+row.dataset.id];
      row.classList.toggle('dead', e.dead);
      e.object.getWorldPosition(v);
      const extra = e.pickup ? (e.dead ? ' · collected ✓' : ` · ${e.pickup.kind}`) : '';
      const coll = e.collider ? (e.collider.r ? ` · r=${e.collider.r.toFixed(2)}` : ` · ${e.collider.points.length} pts`) : '';
      const status = e.object.userData.status ? ` · ${e.object.userData.status}` : '';
      row.querySelector('.meta').textContent =
        `${e.tris.toLocaleString()} tris · (${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)})${coll}${extra}${status}`;
    }
  }

  function updateStats() {
    const info = renderer.info.render;
    const errs = (window.__errors || []).length;
    statsEl.innerHTML =
      `fps ${getFps().toFixed(0).padStart(3)} · draw calls ${info.calls} · tris ${info.triangles.toLocaleString()}\n` +
      `objects ${registry.length} · geometries ${renderer.info.memory.geometries} · textures ${renderer.info.memory.textures}` +
      (errs ? `\n<span class="err">⚠ ${errs} JS error(s) — see console</span>` : '');
    updateRows();
  }

  function focusEntry(e) {
    let obj = e.object;
    if (e.onFocus) {
      const r = e.onFocus(); // e.g. hero switch returns the now-active group
      if (r && r.isObject3D) obj = r;
    }
    controls.focus(obj);
    if (highlight) { scene.remove(highlight); clearTimeout(highlightT); }
    highlight = new THREE.BoxHelper(obj, 0xffe06a);
    highlight.material.userData.noWire = true;
    scene.add(highlight);
    highlightT = setTimeout(() => { scene.remove(highlight); highlight = null; }, 2600);
    setOpen(false); // close the panel so the object is visible (esp. mobile)
  }

  // ── toggles ──
  function setWireframe(on) {
    wireframe = on;
    scene.traverse(o => {
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        if ('wireframe' in m && !m.userData.noWire && !o.isSprite) m.wireframe = on;
      }
    });
  }

  const allRings = [];
  function buildColliders() {
    colliderGroup = new THREE.Group();
    const ringGeo = (r) => {
      const pts = [];
      for (let i = 0; i <= 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
      }
      return new THREE.BufferGeometry().setFromPoints(pts);
    };
    const mat = new THREE.LineBasicMaterial({ color: 0xff5a5a });
    mat.userData.noWire = true;
    for (const e of registry) {
      if (!e.collider) continue;
      if (e.collider.r) {
        const ring = new THREE.Line(ringGeo(e.collider.r), mat);
        ring.position.y = 0.06;
        e.object.add(ring);           // follows dynamic objects
        allRings.push(ring);
      } else {
        for (const p of e.collider.points) {
          const ring = new THREE.Line(ringGeo(p.r), mat);
          ring.position.set(p.x, groundHeight(p.x, p.z) + 0.06, p.z);
          colliderGroup.add(ring);
        }
      }
    }
    // player radius (both hero rigs, so the ring survives switching)
    const prMat = new THREE.LineBasicMaterial({ color: 0x6ab8ff });
    prMat.userData.noWire = true;
    for (const grp of playerGroups) {
      const pr = new THREE.Line(ringGeo(0.35), prMat);
      pr.position.y = 0.06;
      grp.add(pr);
      allRings.push(pr);
    }
    scene.add(colliderGroup);
  }

  function setColliders(on) {
    collidersOn = on;
    if (on && !colliderGroup) buildColliders();
    if (colliderGroup) colliderGroup.visible = on;
    for (const ring of allRings) ring.visible = on;
  }

  panel.querySelectorAll('.dbg-toggle').forEach(b => {
    b.addEventListener('click', () => {
      const t = b.dataset.t;
      const on = !b.classList.contains('on');
      b.classList.toggle('on', on);
      if (t === 'wire') setWireframe(on);
      if (t === 'coll') setColliders(on);
      if (t === 'pause') debugFlags.paused = on;
    });
  });

  function setOpen(o) {
    open = o;
    panel.classList.toggle('hidden', !open);
    clearInterval(statsTimer);
    if (open) {
      buildList();
      updateStats();
      statsTimer = setInterval(updateStats, 500);
    }
  }

  btn.addEventListener('click', () => setOpen(!open));
  panel.querySelector('.dbg-close').addEventListener('click', () => setOpen(false));
}
