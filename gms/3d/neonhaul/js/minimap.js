// §8.6 — the minimap. **Circular, 2D canvas, not a render target**, and that is the whole reason
// it costs nothing: it draws from the chunk DESCRIPTORS the CPU already holds (`cityR.live` →
// `rec.desc.buildings`), so there is no second scene traversal, no second cull, no second upload
// and no second fog/grade pass. §8.7 prices the render-target alternative at 35–45 % of a frame.
//
// It is also, per §8.6, the thing that makes the authored core (DECISIONS decision 3) pay: a
// minimap of a purely seeded field has nothing on it a player could navigate by from memory, so
// the three named districts get a label at their centroid and the landmarks draw at 1.6× edge
// alpha.
//
// ── two rules that shape everything below ──────────────────────────────────
//
//  1. **It never takes a touch.** The map lives in #hud, which is `pointer-events: none`, and it
//     must stay that way — the right half of the screen is the look thumb and the map sits in it.
//     gates_p6 asserts `elementFromPoint` at the map's own centre returns the CONTROLS layer, and
//     falsifies that by turning pointer-events on and watching the same check fail.
//  2. **Redrawn at 15 fps (8 on LOW), not per frame.** A 256² canvas with ~700 rects is cheap but
//     it is not free, and nothing on it changes meaningfully in 16 ms.
//
// Colour is never the only identifier (§7.1): every zone dot carries its type glyph. Zones are
// P7a's, so this file takes them as DATA through `setZones()` and draws nothing when there are
// none — the drawing path is exercised by the gate with injected zones, which is the difference
// between "graceful absence" and "untested code".

import { clamp } from './utils.js';
import { ZONE_TYPES, FLIGHT as F } from './config.js';
import { ALT as LANE_ALT } from './traffic.js';

export const MAP_RANGE = 620;          // metres from the player to the rim
const RIM = 0.90;                      // fraction of the half-size the city disc occupies
const REAR_DEG = 120;                  // §8.6's rear arc

// `glyphs` is separable from `zones` on purpose. §7.1's rule is that colour is NEVER the only
// identifier, and the only way to prove the glyph is actually on the dot is to draw the dot without
// it and difference the canvas — otherwise "the glyph is there" is a claim about source code.
const LAYERS = ['footprints', 'landmarks', 'labels', 'zones', 'glyphs', 'rear', 'traffic',
  'chevrons', 'altring', 'player'];

export class Minimap {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.size = opts.size || 256;                     // backing pixels
    canvas.width = canvas.height = this.size;
    this.hz = opts.hz || 15;
    // §2.5 — LOW is a different map, not the same map drawn less often. It reaches 460 m instead
    // of 620 (which is 45 % fewer footprints, because the count goes with the area) and drops the
    // per-building district-tint outline entirely. Measured: the LOW preset was drawing HIGH's
    // full 412 footprints WITH edges and costing 0.78 ms a redraw — more than HIGH, because
    // nothing about the map had been told the preset existed.
    this.low = !!opts.low;
    this.range = opts.range || (this.low ? 460 : MAP_RANGE);
    this.edges = !this.low;
    this.rotate = opts.rotate !== false;              // §8.6 setting: rotate-with-heading (default)
    this.zones = [];
    this.target = null;                               // { x, z, type, name } — the active job's drop
    this.acc = 1e9;                                   // draw on the first update, not 66 ms into it
    this.frames = 0;
    // A TRUE mean (total / count), not an exponential moving average. The EWMA form read anywhere
    // between 0.48 and 0.64 ms for the same work depending on which redraw happened to be last
    // before the sample, which is a 33 % swing on a number a gate asserts against — the same class
    // of weak instrument as a max-of-N wall-clock timing. `resetPerf()` clears it.
    this.msWorst = 0; this.msTotal = 0; this.msN = 0;
    this.counts = { footprints: 0, landmarks: 0, labels: 0, zones: 0, glyphs: 0, traffic: 0, chevrons: 0 };
    this.layers = Object.fromEntries(LAYERS.map(k => [k, true]));
    this.last = null;                                 // the pose the last redraw used
  }

  setHz(hz) { this.hz = hz; return this.hz; }
  resetPerf() { this.msTotal = 0; this.msN = 0; this.msWorst = 0; return true; }
  setRotate(on) { this.rotate = !!on; this.acc = 1e9; return this.rotate; }
  setZones(list) { this.zones = Array.isArray(list) ? list : []; this.acc = 1e9; return this.zones.length; }
  setTarget(t) { this.target = t || null; this.acc = 1e9; return this.target; }
  // Isolation, in the spirit of setSignVisible: the only way to prove a layer is on the canvas is
  // to difference the canvas with it off. Returns null for an unknown name so a gate cannot
  // silently toggle nothing — this is obligation T10's rule applied to a new hook.
  setLayer(name, on) {
    if (!(name in this.layers)) return null;
    this.layers[name] = !!on;
    this.acc = 1e9;
    return this.layers[name];
  }

  // World → canvas. Exported through __game so the gate can assert a KNOWN world point lands on a
  // KNOWN pixel instead of eyeballing a 128 px disc.
  project(x, z, pose = this.last) {
    if (!pose) return null;
    const h = this.rotate ? pose.heading : 0;
    const dx = x - pose.x, dz = z - pose.z;
    const s = Math.sin(h), c = Math.cos(h);
    const ar = dx * c - dz * s;                       // along the craft's right
    const af = -(dx * s + dz * c);                    // along the craft's forward
    const k = (this.size / 2) * RIM / this.range;
    return { u: this.size / 2 + ar * k, v: this.size / 2 - af * k, r: Math.hypot(ar, af) / this.range,
      bearing: Math.atan2(ar, af) };
  }

  // The same arithmetic with the sin/cos hoisted and no object allocated. The footprint loop runs
  // it ~400 times per redraw at 15 Hz; `project()` above allocates a result object and calls
  // `Math.hypot` and `Math.atan2` for each, neither of which the footprint pass uses. Writes
  // [u, v, r²] into caller-owned scratch and returns it.
  _proj(x, z, s, c, k, out) {
    const dx = x - this.last.x, dz = z - this.last.z;
    const ar = dx * c - dz * s, af = -(dx * s + dz * c);
    out[0] = this.size / 2 + ar * k;
    out[1] = this.size / 2 - af * k;
    out[2] = (ar * ar + af * af) / (this.range * this.range);
    return out;
  }

  update(dt, ctx) {
    this.acc += dt;
    if (this.acc < 1 / this.hz) return false;
    this.acc = 0;
    const t0 = performance.now();
    this.draw(ctx);
    const ms = performance.now() - t0;
    this.msWorst = Math.max(this.msWorst, ms);
    this.msTotal += ms; this.msN++;
    this.frames++;
    return true;
  }

  draw({ x, z, alt, heading, cityR, city, traffic, vehT = 0, t = 0 }) {
    const g = this.g, S = this.size, R = S / 2;
    this.last = { x, z, alt, heading };
    for (const k of Object.keys(this.counts)) this.counts[k] = 0;

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, S, S);

    // the disc
    g.save();
    g.beginPath(); g.arc(R, R, R * RIM, 0, 6.2832); g.clip();
    g.fillStyle = '#050810';
    g.fillRect(0, 0, S, S);

    // §8.6's rear arc — the 120° wedge behind the player, 6 % darker. It is a traffic indicator
    // and nothing more (§8.7: nothing in this game pursues you).
    if (this.layers.rear) {
      g.fillStyle = 'rgba(0,0,0,0.34)';
      g.beginPath();
      g.moveTo(R, R);
      const a0 = Math.PI / 2 - (REAR_DEG / 2) * Math.PI / 180;
      g.arc(R, R, R * RIM, a0, a0 + REAR_DEG * Math.PI / 180);
      g.closePath(); g.fill();
    }

    // ── building footprints ──────────────────────────────────────────────
    // Alpha scales with height, so tall towers read stronger — §8.6's "this is what makes the map
    // LOOK like a city" and the reason it is worth drawing 700 rects rather than a blur.
    //
    // **Batched into BANDS, not drawn one at a time.** ~380 footprints are in range at any moment
    // and a fillRect + strokeRect each is 760 canvas state changes at 15 Hz — measured at 0.38 ms
    // of the minimap's budget on its own. Quantising the height-driven alpha into `BANDS` steps
    // turns that into `BANDS` fills and `BANDS` strokes over accumulated paths. The visible
    // difference is nil: the alpha ramp had 8-bit resolution over a 5 px rect.
    if (cityR && this.layers.footprints) {
      const k = R * RIM / this.range;
      // ONE fill path for every footprint, and the height cue carried entirely by the EDGE.
      // The fills were previously banded into five alpha steps, which cost five full-canvas fill
      // operations to express a difference between rgba(12,17,26,0.61) and rgba(12,17,26,0.80)
      // over a #050810 disc — invisible. The district-tint outline is what actually reads as "this
      // one is tall", so that keeps its banding and the fill collapses to a single path.
      const BANDS = 2;                       // edge bands only: tall, and taller
      const fill = new Path2D();
      const edges = [new Path2D(), new Path2D()];
      let tint = 0x9fb8d8;
      const h = this.rotate ? heading : 0;
      const sh = Math.sin(h), ch = Math.cos(h);
      const p = this._p || (this._p = [0, 0, 0]);
      const range2 = (this.range + 200) * (this.range + 200);
      for (const rec of cityR.live.values()) {
        if (!rec.desc) continue;
        const cdx = rec.desc.cxWorld - x, cdz = rec.desc.czWorld - z;
        if (cdx * cdx + cdz * cdz > range2) continue;                // whole-chunk reject first
        for (const b of rec.desc.buildings) {
          if (b.landmark) continue;                                  // drawn below, brighter
          this._proj(b.x, b.z, sh, ch, k, p);
          if (p[2] > 1.0816) continue;                               // 1.04², squared to skip a sqrt
          const w = Math.max(1.2, b.w * k), d = Math.max(1.2, b.d * k);
          fill.rect(p[0] - w / 2, p[1] - d / 2, w, d);
          // Only genuinely tall buildings get an outline. §8.6 wants tall towers to read stronger,
          // and a 1 px tint outline on a 5 px rect at low alpha was stroke work for nothing.
          if (this.edges && b.h > 180 && w > 3 && d > 3) {
            edges[b.h > 320 ? 1 : 0].rect(p[0] - w / 2 + 0.5, p[1] - d / 2 + 0.5, w - 1, d - 1);
          }
          tint = tintOf(b);
          this.counts.footprints++;
        }
      }
      g.fillStyle = 'rgba(12,17,26,0.78)';
      g.fill(fill);
      if (this.edges) {
        g.lineWidth = 1;
        for (let i = 0; i < BANDS; i++) {
          g.strokeStyle = hexa(tint, i ? 0.62 : 0.34);
          g.stroke(edges[i]);
        }
      }
    }

    // ── the authored core (decision 3) ───────────────────────────────────
    if (city && this.layers.landmarks) {
      const k = R * RIM / this.range;
      for (const l of city.landmarks) {
        for (const part of l.parts) {
          const p = this.project(part.x, part.z);
          if (!p || p.r > 1.04) continue;
          const w = Math.max(2, part.w * k), d = Math.max(2, part.d * k);
          g.fillStyle = hexa(l.tint, 0.30);
          g.fillRect(p.u - w / 2, p.v - d / 2, w, d);
          g.strokeStyle = hexa(l.tint, 0.96);                        // 1.6x the field's edge alpha
          g.lineWidth = 1;
          g.strokeRect(p.u - w / 2 + 0.5, p.v - d / 2 + 0.5, Math.max(1, w - 1), Math.max(1, d - 1));
          this.counts.landmarks++;
        }
      }
    }

    if (city && this.layers.labels) {
      g.font = '600 9px ui-monospace, Menlo, monospace';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const r of city.coreRects) {
        const [x0, z0, x1, z1] = r.rect;
        const cx = ((x0 + x1 + 1) / 2) * 256, cz = ((z0 + z1 + 1) / 2) * 256;
        const p = this.project(cx, cz);
        if (!p || p.r > 0.95) continue;
        g.fillStyle = 'rgba(180,205,230,0.34)';
        g.fillText(r.name.toUpperCase(), p.u, p.v);
        this.counts.labels++;
      }
    }

    // ── traffic in the rear arc (§8.6 / §8.7's fallback) ─────────────────
    if (traffic && this.layers.traffic) {
      // The NEAR set only — see traffic.nearList(). §8.6 asks for "near traffic in the rear arc",
      // and walking the whole population to find it cost more than the rest of the map together.
      const list = traffic.nearList(vehT, { x, y: alt, z }, this._traf || (this._traf = []));
      for (const v of list) {
        if (v.d > this.range) continue;
        const p = this.project(v.x, v.z);
        if (!p || p.r > 1.0) continue;
        const behind = Math.abs(p.bearing) > Math.PI - (REAR_DEG / 2) * Math.PI / 180;
        if (!behind) continue;                       // the arc is the point; the rest is clutter
        g.save();
        g.translate(p.u, p.v);
        g.rotate(Math.atan2(v.dx, -v.dz) - (this.rotate ? heading : 0));
        g.fillStyle = 'rgba(255,178,56,0.85)';
        g.beginPath(); g.moveTo(0, -3); g.lineTo(2.2, 2.4); g.lineTo(-2.2, 2.4); g.closePath(); g.fill();
        g.restore();
        this.counts.traffic++;
      }
    }

    // ── zones (§7.1) — colour is never the only identifier ───────────────
    if (this.layers.zones) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 0.8 * 6.2832);
      for (const zdef of this.zones) {
        const ty = ZONE_TYPES[zdef.type] || ZONE_TYPES.PICKUP;
        const p = this.project(zdef.x, zdef.z);
        if (!p || p.r > 1.0) continue;
        const active = !!(this.target && zdef.x === this.target.x && zdef.z === this.target.z);
        const rr = 5 + (active ? pulse * 2.6 : pulse * 1.3);
        g.fillStyle = hexa(ty.color, 0.30 + pulse * 0.28);
        g.beginPath(); g.arc(p.u, p.v, rr, 0, 6.2832); g.fill();
        if (active) {
          g.strokeStyle = hexa(ty.color, 0.9); g.lineWidth = 1.4;
          g.beginPath(); g.arc(p.u, p.v, rr + 3.5, 0, 6.2832); g.stroke();
        }
        if (this.layers.glyphs) {
          g.fillStyle = '#04060b';
          g.font = '700 8px system-ui, sans-serif';
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText(ty.glyph, p.u, p.v + 0.5);
          this.counts.glyphs++;
        }
        this.counts.zones++;
      }
    }
    g.restore();                                     // end disc clip

    // ── off-map targets: a chevron on the rim + km ───────────────────────
    if (this.layers.chevrons) {
      const off = [];
      if (this.target) off.push({ ...this.target, kind: 'target' });
      for (const zdef of this.zones) if (zdef.rim) off.push(zdef);
      for (const o of off) {
        const p = this.project(o.x, o.z);
        if (!p || p.r <= 1.0) continue;
        const ty = ZONE_TYPES[o.type] || ZONE_TYPES.DROP;
        const ang = p.bearing;
        const ux = R + Math.sin(ang) * R * (RIM - 0.06), uy = R - Math.cos(ang) * R * (RIM - 0.06);
        g.save();
        g.translate(ux, uy); g.rotate(ang);
        g.fillStyle = hexa(ty.color, 0.95);
        g.beginPath(); g.moveTo(0, -5); g.lineTo(4, 3); g.lineTo(-4, 3); g.closePath(); g.fill();
        g.restore();
        const km = (p.r * this.range / 1000);
        g.fillStyle = hexa(ty.color, 0.8);
        g.font = '600 8px ui-monospace, Menlo, monospace';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(km.toFixed(1) + 'km', R + Math.sin(ang) * R * (RIM - 0.22), R - Math.cos(ang) * R * (RIM - 0.22));
        this.counts.chevrons++;
      }
    }

    // ── rim, north tick, altitude ring ───────────────────────────────────
    g.strokeStyle = 'rgba(53,230,255,0.42)'; g.lineWidth = 1.4;
    g.beginPath(); g.arc(R, R, R * RIM, 0, 6.2832); g.stroke();

    // North tick: with rotate-with-heading on, this is the only thing telling you which way is up.
    const nAng = this.rotate ? -heading : 0;
    g.save(); g.translate(R, R); g.rotate(nAng);
    g.fillStyle = 'rgba(207,226,245,0.8)';
    g.beginPath(); g.moveTo(0, -R * RIM); g.lineTo(3, -R * RIM + 6); g.lineTo(-3, -R * RIM + 6); g.closePath(); g.fill();
    g.restore();

    // §8.6: "in a vertical city a 2D map without altitude is a lie". A 260° arc outside the rim,
    // filled to the player's fraction of §6.2's 4–760 m band, with the traffic lanes as ticks so
    // "am I level with a lane" is answerable at a glance.
    if (this.layers.altring) {
      const rA = R * RIM + 3.2;
      const A0 = -Math.PI * 0.72, A1 = Math.PI * 0.72;
      g.strokeStyle = 'rgba(53,230,255,0.16)'; g.lineWidth = 3;
      g.beginPath(); g.arc(R, R, rA, A0 - Math.PI / 2, A1 - Math.PI / 2); g.stroke();
      const k = clamp((alt - F.ALT_MIN) / (F.ALT_MAX - F.ALT_MIN), 0, 1);
      g.strokeStyle = alt > F.ALT_WARN ? 'rgba(255,178,56,0.95)' : 'rgba(53,230,255,0.8)';
      g.lineWidth = 3;
      g.beginPath(); g.arc(R, R, rA, A0 - Math.PI / 2, A0 + (A1 - A0) * k - Math.PI / 2); g.stroke();
      g.strokeStyle = 'rgba(207,226,245,0.45)'; g.lineWidth = 1;
      for (const la of LANE_ALT) {
        const kk = clamp((la - F.ALT_MIN) / (F.ALT_MAX - F.ALT_MIN), 0, 1);
        const a = A0 + (A1 - A0) * kk - Math.PI / 2;
        g.beginPath();
        g.moveTo(R + Math.cos(a) * (rA - 2.6), R + Math.sin(a) * (rA - 2.6));
        g.lineTo(R + Math.cos(a) * (rA + 2.6), R + Math.sin(a) * (rA + 2.6));
        g.stroke();
      }
    }

    // ── the player ───────────────────────────────────────────────────────
    if (this.layers.player) {
      g.save(); g.translate(R, R);
      if (!this.rotate) g.rotate(heading);
      g.fillStyle = '#eaf6ff';
      g.beginPath(); g.moveTo(0, -6); g.lineTo(4.4, 5); g.lineTo(0, 2.6); g.lineTo(-4.4, 5); g.closePath(); g.fill();
      g.restore();
    }
    return true;
  }

  state() {
    return { hz: this.hz, rotate: this.rotate, range: this.range, low: this.low,
      edges: this.edges, frames: this.frames,
      size: this.size, ms: +(this.msN ? this.msTotal / this.msN : 0).toFixed(3),
      msWorst: +this.msWorst.toFixed(3), samples: this.msN,
      counts: { ...this.counts }, layers: { ...this.layers },
      zones: this.zones.length, target: !!this.target };
  }
}

// The district window tint, as a minimap edge colour. Falls back rather than throwing on a
// descriptor that predates the field.
function tintOf(b) { return b.tint || 0x9fb8d8; }

function hexa(hex, a) {
  return `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${clamp(a, 0, 1).toFixed(3)})`;
}
