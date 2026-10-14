// THE TOWER: twelve floors, a pyramid drawn in ink. A floor fight won goes up one, lost goes
// down one (never below 1). Winning floor 12 is reaching the TOP; after that you defend it.
// A player is their ordered W/L list and nothing else: the floor is always recomputed, so a
// server can check it from the same list (server/events.go towerOf).

export const FLOORS = 12;
/** A tower fight takes longer than this, and nobody fights the tower all day long. */
export const TOWER_CAP = { gapMs: 8000, perDay: 120 };
export const TOP_INK = 600;

const byTime = (a, b) => a[2] - b[2] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
const utc = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * Rows `[id, won (1|0), at]` -> the ones that count, in play order: inside the window, one per
 * id, at least `gapMs` after the last one kept, at most `perDay` a UTC day.
 */
export function towerCounted(win, rows, cap = TOWER_CAP) {
  const seen = new Set(), perDay = new Map(), out = [];
  let last = -Infinity;
  for (const r of [...rows].sort(byTime)) {
    const [id, won, at] = r;
    if (seen.has(id) || !(at >= win.start && at < win.end) || at - last < cap.gapMs) continue;
    const d = utc(at);
    if ((perDay.get(d) || 0) >= cap.perDay) continue;
    perDay.set(d, (perDay.get(d) || 0) + 1);
    seen.add(id); last = at;
    out.push([id, won ? 1 : 0, at]);
  }
  return out;
}

/** Floor, tops (wins ON floor 12), best floor reached, fights and wins, from the ordered list. */
export function towerOf(rows) {
  let floor = 1, tops = 0, best = 1, wins = 0;
  for (const r of rows) {
    if (r[1]) {
      wins++;
      if (floor === FLOORS) tops++;
      else floor++;
    } else floor = Math.max(1, floor - 1);
    best = Math.max(best, floor);
  }
  return { floor, tops, best, fights: rows.length, wins };
}

/** What a win or a loss on `floor` does. */
export const nextFloor = (floor, won) => (won ? Math.min(FLOORS, floor + 1) : Math.max(1, floor - 1));

/** The TOP pays once per tower: ink, and its picture as a backdrop prize. */
export function rewardsOwed(st) {
  const t = towerOf(st.t || []);
  const out = [];
  if (t.tops > 0) out.push({ id: 'top', kind: 'ink', amount: TOP_INK }, { id: 'topbg', kind: 'arenaBackground' });
  return out.filter((r) => !(st.claimed || []).includes(r.id));
}

/** ~10 rivals: friends first, then the nearest floors (more tops first on a tie), then uid. */
export function selectRivals(rivals, me, { friends = new Set(), max = 10 } = {}) {
  const mine = towerOf(me.t).floor;
  const seen = rivals.filter((r) => r.uid !== me.uid && r.t.length).map((r) => ({ uid: r.uid, name: r.name, ...towerOf(r.t) }));
  const near = (a, b) => Math.abs(a.floor - mine) - Math.abs(b.floor - mine) || b.tops - a.tops || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0);
  const fr = seen.filter((r) => friends.has(r.uid)).sort(near).map((r) => ({ ...r, friend: true }));
  const rest = seen.filter((r) => !friends.has(r.uid)).sort(near);
  return [...fr, ...rest].slice(0, max);
}
