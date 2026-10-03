export function newLineState() {
  return { lv: 0, thr: 0, sto: 0, boost: 0, stock: 0, mgr: null, cyc: 0, earned: 0 };
}

export function stepLine(ls, d, h) {
  if (ls.lv <= 0) return 0;
  const made = d.P * h;
  const sold = made * d.sigma;
  if (ls.stock >= d.cap - 1e-9) {
    ls.stock = Math.min(ls.stock, d.cap);
    if (d.sigma <= 0) return 0;
  } else {
    ls.stock = Math.min(d.cap, ls.stock + made - sold);
  }
  ls.cyc += h * d.speed / d.cycleSec;
  return sold;
}

export function sellPile(ls, mult = 1) {
  const cash = ls.stock * mult;
  ls.stock = 0;
  return cash;
}
