// Pointer input → match. Normalised coords (0..1).
import { inputPress, inputMove, inputRelease } from "./match.js";
import { initAudio } from "./audio.js";

export function bindInput(canvas, getMatch) {
  let down = false;
  const norm = (e) => {
    const t = e.changedTouches ? e.changedTouches[0] : e;
    return { x: t.clientX / window.innerWidth, y: t.clientY / window.innerHeight };
  };
  const press = (e) => {
    initAudio();
    const m = getMatch(); if (!m) return;
    down = true;
    const p = norm(e);
    inputPress(m, p.x, p.y);
    e.preventDefault();
  };
  const move = (e) => {
    if (!down) return;
    const m = getMatch(); if (!m) return;
    const p = norm(e);
    inputMove(m, p.x, p.y);
    e.preventDefault();
  };
  const up = (e) => {
    if (!down) return;
    down = false;
    const m = getMatch(); if (!m) return;
    inputRelease(m);
    e.preventDefault();
  };
  canvas.addEventListener("touchstart", press, { passive: false });
  canvas.addEventListener("touchmove", move, { passive: false });
  canvas.addEventListener("touchend", up, { passive: false });
  canvas.addEventListener("mousedown", press);
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", up);
}
