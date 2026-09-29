// P4 day and night: one 24-minute shift = one day, and the shift starts at 06:00:00 exactly, so the sun always rises on
// the dot (a clue: STORY R5). Harmony schedules the weather: some shifts rain from 14:00 to 16:00. "After Dark" / "Rain"
// contract modifiers (and A3-M3's after-hours visit) force their own sky for the job. Enemies see 35% less far at night
// and 20% less in rain (only under an open sky). Drives world.setSky; the world only moves light, fog and sky uniforms.
const SHIFT_HOURS = 24;

export function hourOf(shiftClock, shiftSeconds) { return (6 + shiftClock / shiftSeconds * SHIFT_HOURS) % 24; }

export function nightAt(h) {
  if (h >= 6 && h < 19) return 0;
  if (h >= 19 && h < 20.5) return (h - 19) / 1.5;
  if (h >= 5 && h < 6) return 6 - h;          // dawn: fully day at exactly 06:00
  return 1;
}

// deterministic per shift: ~1 shift in 3 has scheduled rain
export function rainScheduled(seed, shiftIndex) {
  let x = 2166136261;
  for (const ch of `${seed}|rain|${shiftIndex}`) x = Math.imul(x ^ ch.charCodeAt(0), 16777619);
  return ((x >>> 0) % 1000) / 1000 < 0.34;
}
export function rainAt(h, scheduled) {
  if (!scheduled || h < 13.75 || h >= 16.25) return 0;
  return Math.min(1, (h - 13.75) / 0.25, (16.25 - h) / 0.25);
}

export function createDayNight(G, { world, audio, SHIFT_SECONDS }) {
  const D = { night: 0, rain: 0, hour: 6, override: null, rainOverride: null, lastHour: null };
  const ease = (a, b, k) => a + (b - a) * Math.min(1, k);

  function targets() {
    const S = G.sim.state;
    const h = D.override ?? hourOf(S.shiftClock, SHIFT_SECONDS);
    let n = nightAt(h), r = D.rainOverride ?? rainAt(h, rainScheduled(S.seed, S.shiftIndex));
    const m = S.contract?.mission;
    if (m?.night || m?.modifiers?.includes('night')) n = 1;
    if (m?.modifiers?.includes('rain')) r = 1;
    return { h, n, r };
  }

  function update(dt) {
    if (!G.sim || !world.setSky) return;
    const t = targets();
    D.hour = t.h;
    D.night = ease(D.night, t.n, dt * 0.6);
    D.rain = ease(D.rain, t.r, dt * 0.5);
    world.setSky({ night: D.night, rain: D.rain });
    // Harmony's schedule announcements (open-sky districts, free roam only)
    const hh = Math.floor(t.h);
    if (D.lastHour != null && hh !== D.lastHour && world.sky?.open && G.state === 'free' && !G.sim.state.contract) {
      if (hh === 20) audio.bark(['pa_night_01'], { force: true });
      else if (hh === 6) audio.bark(['pa_dawn_01'], { force: true });
      else if (hh === 13 && rainScheduled(G.sim.state.seed, G.sim.state.shiftIndex)) audio.bark(['pa_weather_01'], { force: true });
    }
    D.lastHour = hh;
  }

  // detection range multiplier for enemies.js (DESIGN §11: 12 m by day, 8 m by night)
  const detectMult = () => (world.sky?.open ? (1 - 0.35 * D.night) * (1 - 0.2 * D.rain) : 1);
  const clock = () => { const m = Math.floor(D.hour * 60) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };

  return Object.assign(D, { update, detectMult, clock, setHour(h) { D.override = h; }, setRain(r) { D.rainOverride = r; } });
}
