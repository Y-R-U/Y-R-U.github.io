// Reflow Oven state + tick (pure). Slots hold whole items: { id, n }.
import { SMELT_TIME, smeltResult, fuelValue } from '../../data/recipes.js';

export const newOven = () => ({ type: 'oven', in: null, fuel: null, out: null, burn: 0, burnMax: 0, prog: 0 });

export function ovenTick(o, dt, items) {
  let t = dt;
  while (t > 1e-9) {
    const step = Math.min(t, 0.5);
    t -= step;
    const res = o.in ? smeltResult(items, o.in.id) : null;
    const room = res != null && (!o.out || (o.out.id === res && o.out.n < 64));
    if (o.burn <= 0 && room && o.fuel) {
      const v = fuelValue(items, o.fuel.id);
      if (v) {
        o.burn = o.burnMax = v * SMELT_TIME;
        if (--o.fuel.n <= 0) o.fuel = null;
      }
    }
    if (o.burn > 0) {
      o.burn = Math.max(0, o.burn - step);
      if (room) {
        o.prog += step;
        if (o.prog >= SMELT_TIME - 1e-9) {
          o.prog = 0;
          if (--o.in.n <= 0) o.in = null;
          o.out = o.out ? { id: res, n: o.out.n + 1 } : { id: res, n: 1 };
        }
      } else o.prog = 0;
    } else o.prog = Math.max(0, o.prog - step * 2);
  }
  return o;
}

export const ovenActive = (o) => o.burn > 0;
