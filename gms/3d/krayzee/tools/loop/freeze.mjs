// FREEZE detector for test-loop's watch() (FLIGHTFIX6). A sample is { t, p: [x, z, alt, gnd, kt, crashed, act, vtol], ai }
// (act = the player aircraft's own physics clock). Returns null or { player, ai } once the window spans >= 6 s sim.
// Player frozen = its physics clock stood still while the sim clock ran (step() not running), or it sat within 0.3 m
// while airborne in EVERY sample of the window. Not frozen: a wreck (crashes are reported on their own), a jet-borne
// hover (holds its spot by design), or a plane that was on the ground in an older sample (a VTO lifting off 0.2 m
// after a long sample gap read as "static in the air").
const moved = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]);

export function freezeCheck(samples, s) {
  const a = samples[0];
  if (!a || s.simT - a.t < 6 || s.paused) return null;
  const p = s.p;
  let pStatic = false, why = 'static in the air';
  if (p && !p.crashed && a.p) {
    const win = samples.filter((x) => x.p);
    const clockStopped = p.act != null && win.every((x) => x.p[6] != null && Math.abs(x.p[6] - p.act) < 1e-6);
    const airborne = !p.gnd && win.every((x) => !x.p[3] && !x.p[5]);
    const hover = (p.vtol ?? 0) > 0.5 || win.some((x) => (x.p[7] ?? 0) > 0.5);
    const still = win.every((x) => moved(x.p, [p.x, p.z, p.alt]) < 0.3);
    pStatic = clockStopped || (airborne && !hover && still);
    if (clockStopped) why = 'physics clock stopped';
  }
  const prevAI = new Map(a.ai.map((x) => [x[0], x]));
  const air = s.ai.filter((x) => !x[4] && !x[5] && prevAI.has(x[0]) && !prevAI.get(x[0])[4]);
  const aiStatic = air.length >= 1 && air.every((x) => { const o = prevAI.get(x[0]); return Math.hypot(x[1] - o[1], x[2] - o[2], x[3] - o[3]) < 0.3; });
  if (!pStatic && !aiStatic) return null;
  return { player: pStatic ? why : 'moving', ai: aiStatic ? `${air.length} airborne AI static` : 'moving' };
}
export const sampleOf = (s) => ({ t: s.simT, p: s.p && [s.p.x, s.p.z, s.p.alt, s.p.gnd, s.p.kt, !!s.p.crashed, s.p.act ?? null, s.p.vtol ?? 0], ai: s.ai });
