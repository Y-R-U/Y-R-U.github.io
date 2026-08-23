/**
 * The single source of truth for "is this a slow device" (§6.10, §9.3).
 * Read `quality.low` in ONE place per system. An ad-hoc `if (isSlowPhone)`
 * anywhere else is a bug.
 *
 * Auto never flips back UP. A device that dropped frames once will drop them
 * again, and a preset that oscillates is worse than either preset.
 */
export function createQuality(bus, opts = {}) {
  let low = !!opts.low;
  let autoOn = false;
  let acc = 0, frames = 0, window_ = 0;

  const quality = {
    get low() { return low; },
    get autoEnabled() { return autoOn; },
    threshold: 22,      // ms mean frame time
    windowSec: 3,

    set(v) {
      const next = !!v;
      if (next === low) return low;
      low = next;
      if (bus) bus.emit('quality:change', { low });
      return low;
    },

    auto(enabled) {
      autoOn = !!enabled;
      acc = 0; frames = 0; window_ = 0;
    },

    /** Fed by the loop with the REAL frame time. Not part of §6.10 — additive. */
    frame(ms, dtReal) {
      if (!autoOn || low) return;
      acc += ms; frames++; window_ += dtReal || ms / 1000;
      if (window_ < quality.windowSec) return;
      const mean = acc / Math.max(1, frames);
      acc = 0; frames = 0; window_ = 0;
      if (mean > quality.threshold) {
        console.warn(`[quality] mean frame ${mean.toFixed(1)} ms over ${quality.windowSec} s — dropping to the low preset`);
        quality.set(true);
      }
    },
  };

  return quality;
}
