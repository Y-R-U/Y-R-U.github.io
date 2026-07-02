// Hotspots: the typed interaction points that levels are built from (the ONLY
// way between levels is an `exit` hotspot). Each type gets a coloured pulsing
// ground ring + a floating icon chip so they read on screen; `trigger` spots
// are invisible in-game (ambushes) but still fire on entry — the editor shows
// them. Dialog and note/item text run through the DOM overlays here (popup
// cards — never alert()); both pause the sim via the onPause hook.

import * as THREE from 'three';

export const HOTSPOT_STYLE = {
  exit:    { color: 0x6fe08a, icon: '➜',  verb: (h) => `🚪 ${h.label || 'Exit'}` },
  dialog:  { color: 0x6fb9ff, icon: '💬', verb: (h) => `💬 ${h.label || 'Talk'}` },
  item:    { color: 0xffd24a, icon: '🔍', verb: (h) => `🔍 Search ${h.label || ''}` },
  note:    { color: 0xcfcfc2, icon: '📄', verb: (h) => `📄 Read ${h.label || 'note'}` },
  trigger: { color: 0xff6a5a, icon: '⚠', verb: () => '' },
};

// ── 3D marker ────────────────────────────────────────────────────────────────
function iconSprite(icon, color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(8,12,8,0.72)';
  g.beginPath(); g.arc(64, 64, 56, 0, 7); g.fill();
  g.strokeStyle = '#' + new THREE.Color(color).getHexString();
  g.lineWidth = 6; g.beginPath(); g.arc(64, 64, 53, 0, 7); g.stroke();
  g.font = '58px -apple-system, "Segoe UI", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(icon, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(0.72, 0.72, 1);
  return sp;
}

export function makeHotspotMarker(h, fired, editorMode = false) {
  const st = HOTSPOT_STYLE[h.type] || HOTSPOT_STYLE.note;
  const group = new THREE.Group();
  group.position.set(h.x, 0, h.z);
  const mats = [];

  // triggers are ambushes: invisible in the game, visible in the editor
  if (h.type === 'trigger' && !editorMode) { group.visible = false; return { group, mats, tick() {} }; }

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(Math.max(0.5, h.r - 0.34), h.r, 36).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: st.color, transparent: true, opacity: fired ? 0.10 : 0.5, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  ring.material.userData.noWire = true;
  ring.position.y = 0.05;
  group.add(ring); mats.push(ring.material);

  let icon = null;
  if (!fired) {
    icon = iconSprite(st.icon, st.color);
    icon.position.y = 1.7;
    group.add(icon); mats.push(icon.material);
  }

  return {
    group, mats,
    setFired() {
      ring.material.opacity = 0.10;
      if (icon) { icon.visible = false; }
    },
    tick(t) {
      if (icon?.visible) {
        icon.position.y = 1.7 + Math.sin(t * 2 + h.x) * 0.12;
        ring.material.opacity = 0.35 + (Math.sin(t * 2.6) * 0.5 + 0.5) * 0.3;
      }
    },
  };
}

export const hotspotVerb = (h, flags) => {
  const st = HOTSPOT_STYLE[h.type] || HOTSPOT_STYLE.note;
  if (h.type === 'exit' && h.requires && !flags.has(h.requires)) return `🔒 ${h.label || 'Locked'}`;
  return st.verb(h);
};

// ── dialog overlay (speaker + typed text, tap/E to advance) ─────────────────
let typeTimer = null;
export function runDialog(lines, { onPause } = {}) {
  const box = document.getElementById('dialog');
  const who = document.getElementById('dlg-who');
  const txt = document.getElementById('dlg-text');
  if (!box || !lines?.length) return Promise.resolve();
  onPause?.(true);
  box.classList.remove('hidden');

  let i = 0, typing = false, resolveFn;
  const promise = new Promise(r => resolveFn = r);

  function show(n) {
    const L = lines[n];
    who.textContent = L.speaker || '';
    txt.textContent = '';
    typing = true;
    let k = 0;
    clearInterval(typeTimer);
    typeTimer = setInterval(() => {
      k++;
      txt.textContent = L.text.slice(0, k);
      if (k >= L.text.length) { typing = false; clearInterval(typeTimer); }
    }, 18);
  }
  function advance() {
    if (typing) { clearInterval(typeTimer); txt.textContent = lines[i].text; typing = false; return; }
    i++;
    if (i >= lines.length) { close(); return; }
    show(i);
  }
  function close() {
    clearInterval(typeTimer);
    box.classList.add('hidden');
    box.removeEventListener('pointerdown', tap);
    removeEventListener('keydown', key);
    onPause?.(false);
    resolveFn();
  }
  const tap = (e) => { e.stopPropagation(); advance(); };
  const key = (e) => { const k = e.key.toLowerCase(); if (k === 'e' || k === ' ' || k === 'enter') { e.preventDefault(); advance(); } };
  box.addEventListener('pointerdown', tap);
  addEventListener('keydown', key);
  show(0);
  return promise;
}

// ── note / found-item card ───────────────────────────────────────────────────
export function showCard(title, text, { onPause } = {}) {
  const card = document.getElementById('card');
  const tt = document.getElementById('card-title');
  const tx = document.getElementById('card-text');
  if (!card) return Promise.resolve();
  onPause?.(true);
  tt.textContent = title || '';
  tx.textContent = text || '';
  card.classList.remove('hidden');
  return new Promise(r => {
    const close = (e) => {
      e?.stopPropagation();
      card.classList.add('hidden');
      card.removeEventListener('pointerdown', close);
      removeEventListener('keydown', key);
      onPause?.(false);
      r();
    };
    const key = (e) => { const k = e.key.toLowerCase(); if (k === 'e' || k === ' ' || k === 'enter' || k === 'escape') { e.preventDefault(); close(); } };
    card.addEventListener('pointerdown', close);
    addEventListener('keydown', key);
  });
}
