// D23: burn the RESOLVED configuration into every debug capture — palette key actually used, seed,
// level, size, dpr, fps. Not what was requested; what happened. A shell word-splitting bug once
// produced three identically-wrong stills with correct-looking filenames and only a resolved-state
// readout caught it.
//
// It is drawn as a camera-locked textured quad so it lands INSIDE the WebGL canvas that
// tools/shot.mjs captures — a separate 2D overlay would not be in the picture.

import * as THREE from 'three';

export function makeReadout(camApi) {
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 176;
  const g = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.renderOrder = 5000;
  mesh.frustumCulled = false;
  let lastKey = '';
  let compact = false;

  return {
    mesh,
    setCompact(v) { compact = v; lastKey = ''; cv.height = v ? 40 : 176; },
    set(all) {
      // D23: the RESOLVED configuration is burned into the picture. In photo mode it shrinks to one
      // line but it never disappears — a filename is not evidence of what was actually rendered.
      const lines = compact ? all.slice(0, 1) : all;
      const key = lines.join('|');
      if (key === lastKey) return;
      lastKey = key;
      g.clearRect(0, 0, cv.width, cv.height);
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(0, 0, cv.width, compact ? cv.height : 28 * lines.length + 10);
      g.font = (compact ? '700 26px' : '700 22px') + ' ui-monospace, Menlo, monospace';
      g.textBaseline = 'top';
      lines.forEach((l, i) => {
        g.fillStyle = i === 0 ? '#7ee787' : '#e6edf3';
        g.fillText(l, 10, (compact ? 6 : 8) + i * 28);
      });
      tex.needsUpdate = true;
    },
    fit() {
      const Z = -60;
      const qh = 2 * Math.tan((camApi.cam.fov * Math.PI / 180) / 2) * Math.abs(Z);
      const qw = qh * camApi.cam.aspect;
      const w = qw * (compact ? 0.52 : 0.50), h = w * (cv.height / cv.width);
      mesh.scale.set(w, h, 1);
      mesh.position.set(-qw / 2 + w / 2 + qw * 0.006, qh / 2 - h * 0.62, Z + 2);
    },
    setVisible(v) { mesh.visible = v; },
  };
}
