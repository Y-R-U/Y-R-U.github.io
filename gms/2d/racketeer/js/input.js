// Pointer input → match. Normalised coords (0..1).
import { inputPress, inputMove, inputRelease, inputCancel } from "./match.js";
import { initAudio } from "./audio.js";

export function bindInput(canvas, getMatch) {
  let down = false;
  let touchId = null;     // the finger that owns the gesture; others are ignored
  const norm = (t) => ({ x: t.clientX / window.innerWidth, y: t.clientY / window.innerHeight });
  const mine = (e) => {
    if (!e.changedTouches) return e;
    for (const t of e.changedTouches) if (t.identifier === touchId) return t;
    return null;
  };
  const press = (e) => {
    initAudio();
    if (e.changedTouches) {
      e.preventDefault();
      if (touchId !== null) return;
    }
    const m = getMatch(); if (!m) return;
    const t = e.changedTouches ? e.changedTouches[0] : e;
    if (e.changedTouches) touchId = t.identifier;
    down = true;
    const p = norm(t);
    inputPress(m, p.x, p.y);
    e.preventDefault();
  };
  const move = (e) => {
    if (!down) return;
    const t = mine(e); if (!t) return;
    const m = getMatch(); if (!m) return;
    const p = norm(t);
    inputMove(m, p.x, p.y);
    e.preventDefault();
  };
  const up = (e) => {
    if (!down || !mine(e)) return;
    down = false; touchId = null;
    const m = getMatch(); if (!m) return;
    inputRelease(m);
    e.preventDefault();
  };
  const cancel = (e) => {
    if (!down || !mine(e)) return;
    down = false; touchId = null;
    const m = getMatch(); if (m) inputCancel(m);
  };
  canvas.addEventListener("touchstart", press, { passive: false });
  canvas.addEventListener("touchmove", move, { passive: false });
  canvas.addEventListener("touchend", up, { passive: false });
  canvas.addEventListener("touchcancel", cancel);
  canvas.addEventListener("mousedown", press);
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", up);
}
