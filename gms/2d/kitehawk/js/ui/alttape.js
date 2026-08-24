/**
 * The altitude tape — ARCHITECTURE §4.2 mitigation 1, and the first of the two
 * things gate P8 may not run without.
 *
 * Under D26/D28 the playable column is 10,000 wu = 1,500 m = **ten portrait
 * screens tall**. The tape is therefore not a convenience: it is the only thing
 * that shows the ladder at all, and gate P2 rests on it warning of a diving
 * attacker before that attacker can enter the frame.
 *
 * `tapeModel()` is PURE and node-importable. `tools/hudcheck.mjs` measures H6
 * and H7 by driving this exact function against the shipping flight model — it
 * does not re-derive the mapping in the harness, because a harness that
 * re-declares a value the code under test also declares is testing itself (D72).
 *
 * The band SEGMENTS take their colours from the act's own ramp LUT, so the tape
 * can never clash in any act, by construction (ART §10). The MARKS on top of
 * them are the fixed HUD ink, because a marker that changes colour per act is a
 * marker the player has to re-learn five times.
 */

import { BANDS, CEILING_WU, GROUND_WU, CONCORD_LINE_WU, bandAt, altitudeFeet } from '../core/bands.js';
import { METRICS, RANGES } from './layout.js';
import { INK, NEUTRAL_RAMP, mixHex, mark, label, rgba, font } from './theme.js';

const SPAN = GROUND_WU - CEILING_WU;          // 10,000 wu, positive
const EMPTY = [];
const BANDS_MAX_CHARS = BANDS.reduce((n, b) => Math.max(n, b.name.length), 0);

/** y (wu, negative up) -> fraction down the tape, 0 at the ceiling. */
export const tapeFrac = (y) => (y - CEILING_WU) / SPAN;

/* ---------------------------------------------------------------- model --- */

/**
 * `contacts` are world-space facts the play scene already has:
 *   { id, x, y, side, kind }   kind: 'aircraft' | 'crate'
 * `side` is the sim's: 1 is the player's side.
 *
 * A pip is drawn for a contact that is (a) off-screen VERTICALLY and (b) inside
 * `RANGES.PIP_RANGE_WU` horizontally. Both halves matter. Without (a) the tape
 * duplicates the frame; without (b) every contact in a two-kilometre arena is a
 * pip and the tape stops meaning "something is above you" — which is also the
 * difference between H7 measuring a warning and H7 measuring the spawn table.
 *
 * `out` is reused. The caller owns it and nothing else keeps the reference.
 */
export function tapeModel(rect, st, out = null) {
  const m = out || { bands: [], pips: [] };
  const y0 = rect.y, h = rect.h;
  const at = (wy) => y0 + h * tapeFrac(Math.max(CEILING_WU, Math.min(GROUND_WU, wy)));
  m.at = at;
  m.x = rect.x; m.y = y0; m.w = rect.w; m.h = h;

  m.bands.length = 0;
  for (let i = 0; i < BANDS.length; i++) {
    const b = BANDS[i];
    const top = at(b.y1), bot = at(b.y0);
    m.bands.push({ id: b.id, name: b.name, top, bot, mid: (top + bot) * 0.5, t: i / (BANDS.length - 1) });
  }

  m.playerY = at(st.playerY);
  m.playerBand = bandAt(st.playerY).id;
  m.playerFeet = altitudeFeet(st.playerY);

  // DESIGN §2.7's energy chevron: E = alt + v^2/2g, the height you could zoom to.
  m.energyY = st.energyWu === undefined ? null : at(Math.min(GROUND_WU, st.energyWu));

  // what the viewport currently holds, as a bracket on the tape. This is the
  // element that makes "the pip is off-screen" legible rather than asserted.
  m.winTop = at(st.viewTopY);
  m.winBot = at(st.viewBotY);

  // The Concord Line is at -26,667 wu against a -10,000 ceiling. It is NOT drawn
  // to scale — it is drawn detached, above the top of the tape, because D28 made
  // its unreachability mechanical fact and a to-scale tape would either hide it
  // or shrink the playable column to a third of the strip.
  m.concordY = y0 - METRICS.TAPE_CONCORD_H;
  m.concordWu = CONCORD_LINE_WU;

  m.pips.length = 0;
  const cs = st.contacts;
  if (cs) {
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      const offScreen = c.y < st.viewTopY || c.y > st.viewBotY;
      if (!offScreen) continue;
      if (Math.abs(c.x - st.playerX) > RANGES.PIP_RANGE_WU) continue;
      m.pips.push({
        id: c.id, y: at(c.y), kind: c.kind,
        side: c.side, above: c.y < st.viewTopY,
        near: 1 - Math.min(1, Math.abs(c.x - st.playerX) / RANGES.PIP_RANGE_WU),
      });
    }
  }
  return m;
}

/* ---------------------------------------------------------------- paint --- */

/** Each band's signature mark, drawn tiny inside the tape body. */
function icon(g, id, cx, cy, r) {
  g.beginPath();
  switch (id) {
    case 'mud':   g.moveTo(cx - r, cy + r); g.lineTo(cx + r, cy + r); break;                 // the ground line
    case 'belt':  g.moveTo(cx - r, cy); g.lineTo(cx + r, cy); g.moveTo(cx, cy - r); g.lineTo(cx, cy + r); break;  // a burst
    case 'floor': g.moveTo(cx - r, cy); g.lineTo(cx + r, cy); break;
    case 'deck':  g.arc(cx, cy, r, Math.PI, 0); break;                                       // a cloud lobe
    case 'lane':  g.moveTo(cx - r, cy + r * 0.6); g.lineTo(cx, cy - r * 0.6); g.lineTo(cx + r, cy + r * 0.6); break;
    default:      g.moveTo(cx, cy - r); g.lineTo(cx + r, cy); g.lineTo(cx, cy + r); g.lineTo(cx - r, cy); g.closePath();
  }
}

/**
 * The band's own colour, taken from the act ramp: shadow at the bottom of the
 * ladder, fill through the middle, key at the top. Mud is the act's shadow and
 * Blue is its key, in every act, so the ladder always reads bottom-dark.
 */
export function bandColour(ramp, t) {
  const r = ramp || NEUTRAL_RAMP;
  return t < 0.5 ? mixHex(r.shadow, r.fill, t * 2) : mixHex(r.fill, r.key, (t - 0.5) * 2);
}

const hits = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export function drawTape(g, m, opts = {}) {
  const ramp = opts.ramp || NEUTRAL_RAMP;
  const left = opts.side !== 'right';
  const x = m.x, w = m.w;
  const labelX = opts.labelX, align = left ? 'left' : 'right';
  const avoid = opts.avoid || EMPTY;
  const LABEL_W = METRICS.FONT_SMALL * (BANDS_MAX_CHARS * 0.62);

  // body
  g.save();
  g.fillStyle = rgba(INK.tapeBody, INK.tapeBodyA);
  g.fillRect(x, m.y, w, m.h);

  // band segments, from the act's own ramp
  for (const b of m.bands) {
    g.fillStyle = rgba(bandColour(ramp, b.t), INK.tapeBodyA);
    g.fillRect(x, b.top, w, b.bot - b.top);
  }

  // boundaries + signature icon + ratified name (D19, frozen)
  g.font = font(METRICS.FONT_SMALL);
  for (let i = 0; i < m.bands.length; i++) {
    const b = m.bands[i];
    if (i > 0) mark(g, (c) => { c.moveTo(x, b.bot); c.lineTo(x + w, b.bot); },
                    { col: INK.bright, a: INK.tapeMarkA, w: METRICS.TAPE_BAND_LINE });
    mark(g, (c) => icon(c, b.id, x + w * 0.5, b.mid, METRICS.TAPE_ICON_R),
         { col: INK.bright, a: INK.tapeMarkA, w: METRICS.TAPE_BAND_LINE });
    /**
     * A band label is the lowest-priority ink on the screen and it is the one
     * that gets dropped. Two real collisions, both visible in
     * `shots/p7/hud_landscape.png`: the player's own altitude readout sits in
     * the same column and hid DECK, and in landscape the profile puts the
     * special slot on top of the label column. Suppressing the label is right —
     * the band is still named by its position, its colour and its icon, and the
     * one the player is IN is the one their own marker is on.
     */
    const box = { x: left ? labelX : labelX - LABEL_W, y: b.mid - METRICS.FONT_SMALL * 0.5 - METRICS.LABEL_PAD,
                  w: LABEL_W, h: METRICS.FONT_SMALL + METRICS.LABEL_PAD * 2 };
    if (Math.abs(b.mid - m.playerY) < METRICS.FONT_SMALL + METRICS.TAPE_MARK_H) continue;
    if (avoid.some((r) => hits(box, r))) continue;
    label(g, b.name.toUpperCase(), labelX, b.mid, { col: INK.ink, a: INK.tapeMarkA, align });
  }

  // the Concord Line — above the playable top, detached, visibly out of reach
  g.setLineDash([METRICS.TAPE_CONCORD_DASH, METRICS.TAPE_CONCORD_DASH]);
  mark(g, (c) => { c.moveTo(x - METRICS.TAPE_PIP_DX, m.concordY); c.lineTo(x + w + METRICS.TAPE_PIP_DX, m.concordY); },
       { col: INK.friendly, a: INK.tapeMarkA, w: METRICS.TAPE_BAND_LINE });
  g.setLineDash([]);

  // what the viewport holds
  const bx = left ? x + w : x;
  const dir = left ? 1 : -1;
  mark(g, (c) => {
    c.moveTo(bx + dir * METRICS.TAPE_WINDOW_W, m.winTop);
    c.lineTo(bx, m.winTop); c.lineTo(bx, m.winBot);
    c.lineTo(bx + dir * METRICS.TAPE_WINDOW_W, m.winBot);
  }, { col: INK.bright, a: INK.glassA, w: METRICS.TAPE_BAND_LINE });

  // pips for what is off-screen vertically — the warning that beats the frame
  for (const p of m.pips) {
    const col = p.kind === 'crate' ? INK.crate : p.side === 1 ? INK.friendly : INK.hostile;
    const px = opts.pipX;
    mark(g, (c) => {
      if (p.kind === 'crate') c.arc(px, p.y, METRICS.TAPE_PIP_R, 0, Math.PI * 2);
      else {
        // hostiles carry the chevron tab, so colour is never the only channel
        const s = p.side === 1 ? 0 : METRICS.TAPE_PIP_R;
        c.moveTo(px - METRICS.TAPE_PIP_R, p.y + s * 0.5);
        c.lineTo(px, p.y - METRICS.TAPE_PIP_R * 0.5 - s * 0.5);
        c.lineTo(px + METRICS.TAPE_PIP_R, p.y + s * 0.5);
        if (p.side === 1) c.closePath();
      }
    }, { col, a: INK.tapeMarkA * (INK.tapeMarkA + p.near * (1 - INK.tapeMarkA)), w: METRICS.TAPE_BAND_LINE,
         fill: p.kind === 'crate' });
  }

  // the energy chevron: where you could zoom to, DESIGN §2.7
  if (m.energyY !== null && m.energyY !== undefined) {
    mark(g, (c) => {
      c.moveTo(x, m.energyY + METRICS.TAPE_ENERGY_W * 0.5);
      c.lineTo(x + METRICS.TAPE_ENERGY_W, m.energyY);
      c.lineTo(x, m.energyY - METRICS.TAPE_ENERGY_W * 0.5);
    }, { col: INK.brass, a: INK.glassA, w: METRICS.TAPE_BAND_LINE });
  }

  // the player: a brass chevron ON the tape (ART §10)
  mark(g, (c) => {
    c.moveTo(x - METRICS.TAPE_MARK_W * 0.5, m.playerY);
    c.lineTo(x + w * 0.5, m.playerY - METRICS.TAPE_MARK_H * 0.5);
    c.lineTo(x + w + METRICS.TAPE_MARK_W * 0.5, m.playerY);
    c.lineTo(x + w * 0.5, m.playerY + METRICS.TAPE_MARK_H * 0.5);
    c.closePath();
  }, { col: INK.brass, a: 1, w: METRICS.TAPE_BAND_LINE, fill: true });

  // altitude in feet — the one numeral the ribbon carries (ART §10 Type)
  g.font = font(METRICS.FONT_SMALL);
  label(g, Math.round(m.playerFeet).toString(), labelX, m.playerY - METRICS.TAPE_MARK_H - METRICS.FONT_SMALL * 0.5,
        { col: INK.brass, align });
  g.restore();
}
