// Temporary floating joystick, used only when js/ui/ui.js is unavailable.
export function createDevpad(root) {
  const el = document.createElement('div');
  el.className = 'devpad';
  el.style.cssText = 'position:fixed;left:0;bottom:0;width:40vw;height:60vh;z-index:6;touch-action:none;';
  const ring = document.createElement('div');
  ring.style.cssText = 'position:absolute;width:120px;height:120px;margin:-60px 0 0 -60px;border-radius:50%;border:2px solid rgba(220,240,255,.35);background:radial-gradient(circle,rgba(120,200,255,.12),rgba(0,0,0,.15));display:none;pointer-events:none;';
  const nub = document.createElement('div');
  nub.style.cssText = 'position:absolute;width:52px;height:52px;margin:-26px 0 0 -26px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff7e0,#d6a64f 70%);box-shadow:0 0 18px #9fd8ff88;display:none;pointer-events:none;';
  el.append(ring, nub);
  (root || document.body).appendChild(el);
  const pad = { move: { x: 0, y: 0 }, active: false };
  let id = null, cx = 0, cy = 0;
  const set = (x, y) => {
    let dx = x - cx, dy = y - cy; const l = Math.hypot(dx, dy), R = 55;
    if (l > R) { dx *= R / l; dy *= R / l; }
    nub.style.left = cx + dx + 'px'; nub.style.top = cy + dy + 'px';
    pad.move.x = dx / R; pad.move.y = -dy / R;
  };
  el.addEventListener('pointerdown', (e) => {
    if (id !== null) return;
    id = e.pointerId; el.setPointerCapture(id);
    const r = el.getBoundingClientRect(); cx = e.clientX - r.left; cy = e.clientY - r.top;
    ring.style.left = cx + 'px'; ring.style.top = cy + 'px';
    ring.style.display = nub.style.display = 'block'; pad.active = true; set(cx, cy);
  });
  el.addEventListener('pointermove', (e) => { if (e.pointerId !== id) return; const r = el.getBoundingClientRect(); set(e.clientX - r.left, e.clientY - r.top); });
  const up = (e) => { if (e.pointerId !== id) return; id = null; pad.active = false; pad.move.x = pad.move.y = 0; ring.style.display = nub.style.display = 'none'; };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  return pad;
}
