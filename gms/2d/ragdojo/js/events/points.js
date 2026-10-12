// Points per battle (ONLINE.md): 1 = loss, 2 = loss with the opponent damaged > 50%, 3 = win.

/**
 * A battle as the client records it and later claims it:
 *   { id, at, src: 'arena' | 'campaign', won, oppDmg }
 * `id` is the arena server's match id ('arena:<id>') or a local one for campaign fights
 * ('camp:<uid>:<at>'); `oppDmg` is the fraction (0..1) of the opponent's HP removed.
 */
export function pointsFor(b) {
  if (b.won) return 3;
  return b.oppDmg > 0.5 ? 2 : 1;
}

export const counts = (def, win, b) =>
  b.at >= win.start && b.at < win.end && (def.anyBattle || b.src === 'arena');

/** Total points a list of battles earns in one event window. Duplicate ids count once. */
export function pointsIn(def, win, battles) {
  const seen = new Set();
  let sum = 0;
  for (const b of battles) {
    if (seen.has(b.id) || !counts(def, win, b)) continue;
    seen.add(b.id);
    sum += pointsFor(b);
  }
  return sum;
}
