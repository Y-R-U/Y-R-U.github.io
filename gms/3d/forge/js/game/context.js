// Which of the things in reach the context button points at. Pure: positions in, one target out.

// Nearest wins, on distance alone — unlike `acquire`, which also pays for the angle off the
// camera, because the bolt is aimed and the button is not. `self` is the exception: it sits on the
// player at zero distance and would win every tie, so a target with `yields` set is only offered
// when nothing else is in reach — otherwise dialling Hearth beside a fire offers a meal instead of
// the cooking, and standing in an area you owe a delivery to hides the fire, the seams and the
// stall you are standing on.
export function pickContext(list, pos) {
  if (!pos) return null;
  let best = null, cost = Infinity, fallback = null;
  for (const t of list) {
    if (!t) continue;
    const d = Math.hypot(t.x - pos.x, t.z - pos.z);
    if (d > (t.range ?? 4)) continue;
    if (t.yields) { fallback = fallback || t; continue; }
    const c = d * 0.06;
    if (c < cost) { cost = c; best = t; }
  }
  return best || fallback;
}
