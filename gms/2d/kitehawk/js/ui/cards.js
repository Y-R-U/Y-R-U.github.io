/**
 * The radio card — ARCHITECTURE §7.5. The widget only; P12 fills it with
 * `data/script.json`.
 *
 * Four rules, and every one of them is a rule because breaking it has a name:
 *
 * 1. **Duration is computed from the TEXT, always.** Deriving it from the audio
 *    gives a 0 ms card the moment a take is missing, which is exactly how
 *    "playable with the audio folder empty" (D7) ships broken while still
 *    passing a boot test. Audio may only ever EXTEND a card.
 * 2. **A `kind: "radio"` line over 44 characters fails the LOAD**, in the
 *    console and in the debug overlay — at author time, not at play time. A
 *    wrapped radio line in a portrait top-third band eats two lines of sky.
 * 3. **It never wraps.** `fillText` does not wrap; if a line still overruns its
 *    slot that is recorded as a load error rather than silently clipped.
 * 4. **It never takes input, never pauses, never becomes a modal** (§10 rule 2).
 *    There is no dismiss affordance here on purpose.
 */

import { METRICS, TIMING } from './layout.js';
import { INK, mark, label, font, rgba } from './theme.js';

/** §7.5, verbatim. ~13.5 chars/s is about 160 wpm. */
export const cardDuration = (text) =>
  Math.max(TIMING.CARD_MIN, Math.min(TIMING.CARD_MAX, TIMING.CARD_BASE + text.length / TIMING.CARD_CPS));

/**
 * Validate a loaded script. Returns the error list; also writes it to the
 * console, once per offending line, because "fails the load in the console" is
 * the contract and a silent validator is not one.
 */
export function validateScript(script) {
  const errs = [];
  const lines = (script && script.lines) || {};
  for (const id of Object.keys(lines)) {
    const l = lines[id];
    if (!l || typeof l.text !== 'string') { errs.push({ id, why: 'no text' }); continue; }
    if (l.kind === 'radio' && l.text.length > METRICS.CARD_MAX_CHARS) {
      errs.push({ id, why: `radio line is ${l.text.length} chars, cap is ${METRICS.CARD_MAX_CHARS}`, text: l.text });
    }
  }
  for (const e of errs) console.error(`[script] ${e.id}: ${e.why}`);
  return errs;
}

export function createCards(ctx, opts = {}) {
  const speakers = opts.speakers || {};
  const queue = [];
  let live = null, t = 0;
  const errors = [];

  /**
   * `audioLen` is advisory and may only lengthen the card. It is a separate
   * argument rather than a lookup so this module never has to know whether the
   * audio layer exists — H10 stubs the whole layer out and nothing here changes.
   */
  function push(line) {
    const text = String(line.text || '');
    if (line.kind === 'radio' && text.length > METRICS.CARD_MAX_CHARS) {
      const e = { id: line.id || '?', why: `radio line is ${text.length} chars, cap is ${METRICS.CARD_MAX_CHARS}`, text };
      errors.push(e);
      console.error(`[script] ${e.id}: ${e.why}`);
      return null;                      // refused. It does not render wrapped, it does not render.
    }
    const dur = cardDuration(text);
    const card = {
      id: line.id || '', text, kind: line.kind || 'radio',
      speaker: line.speaker || '', dur,
      shown: line.audioLen ? Math.max(dur, line.audioLen) : dur,
    };
    queue.push(card);
    return card;
  }

  function update(dt) {
    if (!live) { live = queue.shift() || null; t = 0; }
    if (!live) return;
    t += dt;
    if (t >= live.shown) { live = null; t = 0; }
  }

  function draw(g, L) {
    if (!live) return;
    const r = L.card;
    const a = Math.min(1, Math.min(t, live.shown - t) / TIMING.CARD_FADE);
    if (a <= 0) return;
    const sp = speakers[live.speaker] || null;
    const col = (sp && sp.colour) || INK.ink;

    const h = METRICS.FONT_LABEL + METRICS.CARD_PAD_Y * 2;
    const y = r.y + (r.h - h) * 0.5;
    const w = r.w - METRICS.CARD_PAD_X * 2;
    const x = r.x + METRICS.CARD_PAD_X;

    // marks on the glass, not a floating rectangle: a rule in the speaker's
    // colour and a hairline under the text. No panel, no drop shadow.
    mark(g, (p) => { p.moveTo(x, y); p.lineTo(x, y + h); },
         { col, a: a * INK.tapeMarkA, w: METRICS.CARD_RULE, cap: 'butt' });
    mark(g, (p) => { p.moveTo(x, y + h); p.lineTo(x + w, y + h); },
         { col, a: a * INK.stickA, w: METRICS.HAIRLINE, cap: 'butt' });

    g.font = font(METRICS.FONT_LABEL);
    const tx = x + METRICS.CARD_PAD_X;
    if (sp && sp.name) {
      label(g, sp.name.toUpperCase(), tx, y + METRICS.CARD_PAD_Y, { col, a: a * INK.glassA });
      label(g, live.text, tx, y + h - METRICS.CARD_PAD_Y, { col: INK.bright, a });
    } else {
      label(g, live.text, tx, y + h * 0.5, { col: INK.bright, a });
    }

    // it never wraps; an overrun is a load error, recorded once
    const wide = g.measureText(live.text).width;
    if (wide > r.x + r.w - tx && !live.flagged) {
      live.flagged = true;
      const e = { id: live.id, why: `card overruns its slot by ${Math.ceil(wide - (r.x + r.w - tx))} px` };
      errors.push(e);
      console.error(`[script] ${e.id}: ${e.why}`);
    }
    void rgba;
  }

  return {
    push, update, draw, validate: validateScript,
    errors,
    get live() { return live; },
    get pending() { return queue.length; },
    clear() { queue.length = 0; live = null; t = 0; },
  };
}
