// Sci-fi Pawn: "Drone". A little hover-droid: a hex-free round landing pad with a glowing
// light-line ring, a glowing hover beam, a pearl (white) / gunmetal (black) teardrop body
// with tucked arm-fins, and a floating egg head with a dark glass visor and two slanted
// glowing eyes. A glowing seam ring crowns the head.
// Overhead read: the smallest footprint; two concentric light rings (pad + head crown)
// around a small round dome.
// The visor is turned 3/4 toward the owning player (YAW, see notes), like fantasy's squire.
import { hsLathe, prep, assemble } from './common.js';

const YAW = 0.55;          // head/arms turned toward model -x = the owner's camera after the side yaw

export function pawn(THREE, kit, { color }) {
  const S = 36;
  const parts = [];

  // ---- landing pad: chamfered disc, recessed light channel, raised trim hub ----
  parts.push(hsLathe(THREE, color, [
    [0, 0, 'dark'], [0.262, 0, 'dark'], [0.285, 0.02, 'shade'], [0.285, 0.046, 'body'],
    [0.27, 0.062, 'trim'], [0.252, 0.062, 'body'],
    [0.252, 0.052, 'dark'], [0.248, 0.05, 'line'], [0.216, 0.05, 'line'], [0.212, 0.052, 'line'], [0.212, 0.064, 'dark'],
    [0.19, 0.068, 'body'], [0.158, 0.07, 'body'], [0.142, 0.088, 'trim'], [0.09, 0.092, 'trim'],
    [0.07, 0.092, 'dark'], [0.07, 0.084, 'dark'], [0, 0.084, 'line'],
  ], { seg: S }));
  // hover beam: a thin glowing column from the pad socket up into the body
  parts.push(prep(THREE, kit.place(new THREE.CylinderGeometry(0.03, 0.045, 0.1, 14, 1, true), { y: 0.13 }), color, 'line'));

  // ---- body: inverted teardrop, a thruster disc under it, one panel-line waist groove ----
  const body = [[0, 0.166, 'lineHi'], [0.05, 0.168, 'lineHi'], [0.058, 0.172, 'trim'], [0.072, 0.18, 'trim']];
  // outer curve (smooth), from the thruster rim to the shoulder
  const curve = (t) => {               // t 0..1 -> [r, y]
    const y = 0.18 + t * 0.215;
    const r = 0.072 + 0.092 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.62) - 0.018 * Math.max(0, t - 0.7) / 0.3;
    return [r, y];
  };
  for (let i = 1; i <= 12; i++) {
    const t = i / 12, [r, y] = curve(t);
    if (i === 5) {                     // waist groove
      body.push([r, y - 0.006, 'body', true], [r - 0.008, y - 0.003, 'dark'], [r - 0.008, y + 0.003, 'dark'], [r, y + 0.006, 'dark']);
    } else body.push([r, y, 'body', i < 12]);
  }
  const top = body[body.length - 1];
  body.push([top[0] - 0.02, top[1] + 0.012, 'trim'], [0, top[1] + 0.012, 'shade']);
  parts.push(hsLathe(THREE, color, body, { seg: S }));
  const bodyTop = top[1] + 0.012;

  // ---- arm fins: slim pearl ellipsoids hugging the body, glowing tips ----
  const turned = [];
  for (const s of [-1, 1]) {
    const fin = prep(THREE, new THREE.SphereGeometry(1, 14, 10), color, 'shade');
    kit.place(fin, { x: s * 0.158, y: 0.285, sx: 0.03, sy: 0.1, sz: 0.058, rz: s * 0.2 });
    turned.push(fin);
    const tip = prep(THREE, new THREE.SphereGeometry(1, 8, 6), color, 'line');
    kit.place(tip, { x: s * 0.142, y: 0.198, s: 0.016 });
    turned.push(tip);
  }

  // ---- floating egg head ----
  const HR = 0.142, HY = 0.9, HC = bodyTop + 0.02 + HR * HY;   // centre y
  // neck: dark spindle in the gap
  parts.push(prep(THREE, kit.place(new THREE.CylinderGeometry(0.035, 0.05, 0.05, 12), { y: bodyTop + 0.02 }), color, 'trim'));
  const head = [];
  const N = 18;
  for (let i = 0; i <= N; i++) {
    const a = -Math.PI / 2 + (i / N) * Math.PI;              // latitude
    const r = Math.max(0, HR * Math.cos(a)), y = HC + HR * HY * Math.sin(a);
    if (i === 15) {                                          // glowing crown seam
      head.push([r + 0.001, y - 0.008, 'body', true], [r - 0.006, y - 0.006, 'line'], [r - 0.006, y + 0.006, 'lineHi'], [r - 0.0005, y + 0.009, 'line']);
    } else head.push([r, y, i === 0 ? 'shade' : 'body', i > 0 && i < N && i !== 16]);
  }
  turned.push(hsLathe(THREE, color, head, { seg: S }));
  // visor: a glass shell over the front (-z), slightly proud of the head
  {
    const v = new THREE.SphereGeometry(HR + 0.003, 22, 12, Math.PI * 1.5 - 0.95, 1.9, 1.02, 0.95);
    v.scale(1, HY, 1); v.translate(0, HC, 0);
    prep(THREE, v, color, 'glass');
    turned.push(v);
    // trim lip around the visor (thin ring sitting where the shell meets the head)
  }
  // eyes: slanted glowing ovals on the visor
  for (const s of [-1, 1]) {
    const az = s * 0.36, el = 0.1;
    const e = new THREE.SphereGeometry(1, 12, 8);
    e.scale(0.03, 0.019, 0.01);
    e.rotateZ(-s * 0.32);
    e.rotateX(el); e.rotateY(-az);
    const R = HR + 0.004;
    e.translate(Math.sin(az) * Math.cos(el) * R, HC + Math.sin(el) * R * HY, -Math.cos(az) * Math.cos(el) * R);
    turned.push(prep(THREE, e, color, 'lineHi'));
  }
  for (const g of turned) { g.rotateY(YAW); parts.push(g); }

  return assemble(kit, color, parts);
}
