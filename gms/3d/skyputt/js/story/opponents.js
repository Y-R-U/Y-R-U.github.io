// Bridge between the story and the AI golfers (js/ai/, owned by the `ai` agent).
//
// INTERFACE the story expects from js/ai/index.js (hand this to the ai agent):
//
//   export async function simulateRound({ holes, golfer, seed })
//     holes  : hole definitions (js/course/holes/*.js), played in order
//     golfer : { id, name, personality: 'careful'|'power'|'banks'|'lucky'|'pro', skill: 0..1 }
//     seed   : integer; same seed + same inputs → same result (ghost replays later)
//   → { scores: [{ strokes, picked, shots?: [{ vx, vz, t0 }] }] }   one entry per hole
//     strokes follow the game rules: +1 per out of bounds, picked up at par + 4 (D10).
//     `shots` (optional) lets the game replay the AI as a ghost ball on the same hole later.
//
// Until that module exists (or if it throws), a deterministic stub stands in, so story events are
// fully playable now. The result says which one ran (`source: 'ai' | 'stub'`).

const SPREAD = { careful: 0.55, power: 1.0, banks: 0.75, lucky: 1.2, pro: 0.45 };

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

export function stubRound({ holes, golfer, seed }) {
  const r = mulberry(seed ^ hash(golfer.id || golfer.name));
  const sd = SPREAD[golfer.personality] ?? 0.8;
  return {
    scores: holes.map(h => {
      const g = Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r());
      let s = Math.round(h.par + 1.25 - 1.7 * golfer.skill + g * sd);
      if (golfer.personality === 'lucky' && r() < 0.06) s = 1;   // Lou's famous flukes
      const max = h.par + 4;
      return { strokes: Math.max(1, Math.min(max, s)), picked: s >= max };
    }),
  };
}

let aiMod; // undefined = not tried, null = unavailable
async function ai() {
  if (aiMod !== undefined) return aiMod;
  try { const m = await import('../ai/index.js'); aiMod = typeof m.simulateRound === 'function' ? m : null; }
  catch { aiMod = null; }
  return aiMod;
}

// Play every golfer through the holes. → [{ id, name, colour, scores: [strokes], total, source }]
export async function playField(golfers, holes, seed) {
  const m = await ai();
  const out = [];
  for (const g of golfers) {
    let res = null, source = 'stub';
    if (m) { try { res = await m.simulateRound({ holes, golfer: g, seed }); source = 'ai'; } catch (e) { console.warn('[skyputt] ai simulateRound failed, using stub', e); } }
    if (!res || !Array.isArray(res.scores) || res.scores.length !== holes.length) { res = stubRound({ holes, golfer: g, seed }); source = 'stub'; }
    const scores = res.scores.map(s => s.strokes);
    out.push({ id: g.id, name: g.name, colour: g.colour, scores, total: scores.reduce((a, b) => a + b, 0), source, shots: res.scores.map(s => s.shots || null) });
  }
  return out;
}
