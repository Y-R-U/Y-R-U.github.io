import * as THREE from '../../vendor/three/three.module.js';

// Bobbing golden paw sprite over the level's current goal (shown after the first hint, and in the tutorial).
let tex = null;
function pawTexture() {
  if (tex) return tex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 8, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,230,150,0.9)'); grad.addColorStop(0.55, 'rgba(255,190,70,0.35)'); grad.addColorStop(1, 'rgba(255,170,40,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#fff4dc'; g.strokeStyle = '#b5641c'; g.lineWidth = 5;
  const blob = (x, y, rx, ry) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); g.stroke(); };
  blob(64, 76, 22, 18); blob(38, 52, 9, 11); blob(54, 40, 9, 11); blob(74, 40, 9, 11); blob(90, 52, 9, 11);
  tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createMarker(ctx) {
  const mat = new THREE.SpriteMaterial({ map: pawTexture(), depthTest: false, depthWrite: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.setScalar(0.24);
  sprite.renderOrder = 20;
  sprite.visible = false;
  ctx.world.scene.add(sprite);
  let getPos = null, h = 0.55, t = 0;
  const p = new THREE.Vector3();
  const m = {
    visible: true,
    set(fn, opts = {}) { getPos = fn; h = opts.height ?? 0.55; },
    get active() { return !!getPos; },
    update(dt) {
      t += dt;
      if (!getPos || !m.visible) { sprite.visible = false; return; }
      const q = getPos(p);
      if (!q) { sprite.visible = false; return; }
      sprite.position.set(q.x, q.y + h + Math.sin(t * 3.2) * 0.06, q.z);
      // fade out when the camera is right on top of it so it never blocks the view
      const cam = ctx.camera?.camera;
      const near = cam ? cam.position.distanceTo(sprite.position) : 9;
      const fade = Math.min(1, Math.max(0, (near - 0.9) / 0.8));
      sprite.visible = fade > 0.02;
      sprite.material.opacity = (0.75 + Math.sin(t * 5) * 0.2) * fade;
    },
    dispose() { sprite.parent?.remove(sprite); mat.dispose(); },
  };
  return m;
}
