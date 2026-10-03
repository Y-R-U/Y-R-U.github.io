export function offlineClosedForm(derived, state, seconds) {
  const report = { awaySec: seconds, creditedSec: seconds, cash: 0, lines: {}, piles: 0 };
  for (const id in derived) {
    const d = derived[id], ls = state.lines[id];
    if (!ls || ls.lv <= 0) continue;
    const P = d.Pbase;
    const toShelf = (1 - d.sigma) * P * seconds;
    let cash = d.sigma * P * seconds;
    if (d.auto) cash += toShelf;
    else ls.stock = Math.min(d.cap, ls.stock + toShelf);
    ls.earned += cash;
    report.cash += cash;
    report.lines[id] = cash;
    report.piles += ls.stock;
  }
  return report;
}
