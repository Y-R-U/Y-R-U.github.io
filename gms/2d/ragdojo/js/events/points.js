// Points per battle (ONLINE.md): 1 = loss, 2 = loss with the opponent damaged > 50%, 3 = win.

import { CAMPAIGN_CAP } from './calendar.js?v=20261015-evf';

/**
 * A battle as the client records it and later claims it:
 *   { id, at, src: 'arena' | 'campaign', won, oppDmg }
 * `id` is the arena server's match id ('arena:<id>') or a local one for campaign fights
 * ('camp:<uid>:<at>'); `oppDmg` is the fraction (0..1) of the opponent's HP removed — the
 * most-damaged opponent in Last Man Standing, the deciding round in a best of 3.
 */
export function pointsFor(b) {
  if (b.won) return 3;
  return b.oppDmg > 0.5 ? 2 : 1;
}

/** THE TOWER keeps its own W/L list (tower.js) and takes no points. */
export const counts = (def, win, b) =>
  def.kind !== 'tower' && b.at >= win.start && b.at < win.end && (def.anyBattle || b.src === 'arena');

const byTime = (a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * The battles that count for one event window, in the order they were played, with their
 * points. Duplicate ids count once; campaign fights obey `cap` (CAMPAIGN_CAP, or PAID_CAP). This ordered list IS a
 * player's Vines & Ladders turns — each entry is one turn's batch of rolls.
 */
export function counted(def, win, battles, cap = CAMPAIGN_CAP) {
  const seen = new Set(), perDay = new Map(), out = [];
  let lastCamp = -Infinity;
  for (const b of [...battles].sort(byTime)) {
    if (seen.has(b.id) || !counts(def, win, b)) continue;
    if (b.src === 'campaign') {
      const day = new Date(b.at).toISOString().slice(0, 10);
      if ((perDay.get(day) || 0) >= cap.perDay || b.at - lastCamp < cap.gapMs) continue;
      perDay.set(day, (perDay.get(day) || 0) + 1);
      lastCamp = b.at;
    }
    seen.add(b.id);
    out.push({ id: b.id, at: b.at, src: b.src, pts: pointsFor(b) });
  }
  return out;
}

export const pointsIn = (def, win, battles) => counted(def, win, battles).reduce((s, b) => s + b.pts, 0);
