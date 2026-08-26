// Procedural icon + plane-silhouette drawing. No image files anywhere (ART.md D5).
// Used by both the DOM screens (into small <canvas>) and the canvas HUD.

export const GOLD = '#ffc46b';
export const FIRE = '#ff9a3c';
export const STEEL = '#c9d2d8';
export const DARK = '#1a1410';

/* ------------------------------------------------------------------ weapons */

const W = {
  bomb(g, s, c) {
    g.fillStyle = c;
    g.beginPath();
    g.ellipse(s * 0.46, s * 0.54, s * 0.20, s * 0.30, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(s * 0.46, s * 0.16); g.lineTo(s * 0.60, s * 0.30); g.lineTo(s * 0.32, s * 0.30);
    g.closePath(); g.fill();
    g.fillStyle = DARK;
    g.beginPath(); g.ellipse(s * 0.40, s * 0.48, s * 0.05, s * 0.09, -0.3, 0, Math.PI * 2); g.fill();
  },
  bomb2(g, s, c) {
    W.bomb(g, s, c);
    g.strokeStyle = DARK; g.lineWidth = Math.max(1.5, s * 0.05);
    g.beginPath(); g.moveTo(s * 0.28, s * 0.60); g.lineTo(s * 0.64, s * 0.60); g.stroke();
    g.beginPath(); g.moveTo(s * 0.29, s * 0.72); g.lineTo(s * 0.63, s * 0.72); g.stroke();
  },
  cluster(g, s, c) {
    g.fillStyle = c;
    for (const [x, y, r] of [[0.30, 0.68, 0.13], [0.55, 0.74, 0.11], [0.44, 0.44, 0.12], [0.68, 0.48, 0.10]]) {
      g.beginPath(); g.arc(s * x, s * y, s * r, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = c; g.lineWidth = Math.max(1, s * 0.045);
    g.beginPath(); g.moveTo(s * 0.44, s * 0.30); g.lineTo(s * 0.44, s * 0.12); g.stroke();
  },
  rocket(g, s, c) {
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(s * 0.86, s * 0.50); g.lineTo(s * 0.42, s * 0.32); g.lineTo(s * 0.18, s * 0.34);
    g.lineTo(s * 0.18, s * 0.66); g.lineTo(s * 0.42, s * 0.68);
    g.closePath(); g.fill();
    g.beginPath();
    g.moveTo(s * 0.30, s * 0.34); g.lineTo(s * 0.12, s * 0.14); g.lineTo(s * 0.16, s * 0.38);
    g.closePath(); g.fill();
    g.beginPath();
    g.moveTo(s * 0.30, s * 0.66); g.lineTo(s * 0.12, s * 0.86); g.lineTo(s * 0.16, s * 0.62);
    g.closePath(); g.fill();
    g.fillStyle = FIRE;
    g.beginPath(); g.moveTo(s * 0.18, s * 0.42); g.lineTo(s * 0.02, s * 0.50); g.lineTo(s * 0.18, s * 0.58); g.closePath(); g.fill();
  },
  seeker(g, s, c) {
    W.rocket(g, s, c);
    g.strokeStyle = FIRE; g.lineWidth = Math.max(1.2, s * 0.05);
    g.beginPath(); g.arc(s * 0.62, s * 0.44, s * 0.24, -1.1, 0.5); g.stroke();
  },
  fire(g, s, c) {
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(s * 0.50, s * 0.08);
    g.bezierCurveTo(s * 0.86, s * 0.40, s * 0.80, s * 0.72, s * 0.50, s * 0.92);
    g.bezierCurveTo(s * 0.20, s * 0.72, s * 0.14, s * 0.40, s * 0.50, s * 0.08);
    g.fill();
    g.fillStyle = '#fff0c8';
    g.beginPath();
    g.moveTo(s * 0.50, s * 0.42);
    g.bezierCurveTo(s * 0.66, s * 0.58, s * 0.62, s * 0.76, s * 0.50, s * 0.86);
    g.bezierCurveTo(s * 0.38, s * 0.76, s * 0.34, s * 0.58, s * 0.50, s * 0.42);
    g.fill();
  },
  spike(g, s, c) {
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(s * 0.50, s * 0.94); g.lineTo(s * 0.32, s * 0.52); g.lineTo(s * 0.32, s * 0.16);
    g.lineTo(s * 0.68, s * 0.16); g.lineTo(s * 0.68, s * 0.52);
    g.closePath(); g.fill();
    g.fillStyle = DARK;
    g.fillRect(s * 0.32, s * 0.26, s * 0.36, s * 0.06);
    g.fillRect(s * 0.32, s * 0.40, s * 0.36, s * 0.06);
  },
  nuke(g, s, c) {
    g.fillStyle = c;
    g.beginPath(); g.arc(s * 0.50, s * 0.50, s * 0.40, 0, Math.PI * 2); g.fill();
    g.fillStyle = DARK;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.moveTo(s * 0.50, s * 0.50);
      g.arc(s * 0.50, s * 0.50, s * 0.40, i * 2.094 - 0.52, i * 2.094 + 0.52);
      g.closePath(); g.fill();
    }
    g.beginPath(); g.arc(s * 0.50, s * 0.50, s * 0.10, 0, Math.PI * 2); g.fill();
  },
  gun(g, s, c) {
    g.fillStyle = c;
    g.fillRect(s * 0.10, s * 0.42, s * 0.74, s * 0.16);
    g.fillRect(s * 0.16, s * 0.30, s * 0.22, s * 0.40);
    g.fillStyle = FIRE;
    g.beginPath(); g.moveTo(s * 0.84, s * 0.40); g.lineTo(s * 0.98, s * 0.50); g.lineTo(s * 0.84, s * 0.60); g.closePath(); g.fill();
  },
  boomerang(g, s, c) {
    g.strokeStyle = c; g.lineWidth = Math.max(2.4, s * 0.16); g.lineCap = 'round';
    g.beginPath();
    g.moveTo(s * 0.16, s * 0.22);
    g.quadraticCurveTo(s * 0.62, s * 0.46, s * 0.24, s * 0.84);
    g.stroke();
    g.lineCap = 'butt';
  },
  chicken(g, s, c) {
    g.fillStyle = c;
    g.beginPath();
    g.ellipse(s * 0.46, s * 0.60, s * 0.26, s * 0.21, -0.15, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(s * 0.68, s * 0.34, s * 0.13, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(s * 0.80, s * 0.34); g.lineTo(s * 0.94, s * 0.40); g.lineTo(s * 0.80, s * 0.44);
    g.closePath(); g.fill();
    g.beginPath();
    g.moveTo(s * 0.20, s * 0.52); g.lineTo(s * 0.02, s * 0.34); g.lineTo(s * 0.10, s * 0.62);
    g.closePath(); g.fill();
    g.fillStyle = DARK;
    g.beginPath(); g.arc(s * 0.70, s * 0.31, s * 0.030, 0, Math.PI * 2); g.fill();
  },
  confetti(g, s, c) {
    const bits = [[0.20, 0.20, 0.5], [0.62, 0.16, -0.8], [0.34, 0.50, 1.1], [0.74, 0.48, 0.3], [0.18, 0.76, -0.4], [0.56, 0.80, 0.9]];
    for (let i = 0; i < bits.length; i++) {
      const [x, y, r] = bits[i];
      g.save();
      g.translate(s * x, s * y);
      g.rotate(r);
      g.fillStyle = i % 2 ? c : FIRE;
      g.fillRect(-s * 0.075, -s * 0.038, s * 0.15, s * 0.076);
      g.restore();
    }
  },
  disco(g, s, c) {
    g.fillStyle = c;
    g.beginPath(); g.arc(s * 0.50, s * 0.54, s * 0.32, 0, Math.PI * 2); g.fill();
    g.strokeStyle = DARK; g.lineWidth = Math.max(1, s * 0.035);
    for (let i = -2; i <= 2; i++) {
      g.beginPath(); g.moveTo(s * (0.50 + i * 0.115), s * 0.24); g.lineTo(s * (0.50 + i * 0.115), s * 0.84); g.stroke();
    }
    for (let i = -2; i <= 2; i++) {
      g.beginPath(); g.moveTo(s * 0.18, s * (0.54 + i * 0.115)); g.lineTo(s * 0.82, s * (0.54 + i * 0.115)); g.stroke();
    }
    g.strokeStyle = c; g.lineWidth = Math.max(1, s * 0.045);
    g.beginPath(); g.moveTo(s * 0.50, s * 0.20); g.lineTo(s * 0.50, s * 0.04); g.stroke();
  },
  orbital(g, s, c) {
    g.fillStyle = c;
    g.fillRect(s * 0.36, s * 0.06, s * 0.28, s * 0.16);
    g.fillRect(s * 0.14, s * 0.09, s * 0.16, s * 0.10);
    g.fillRect(s * 0.70, s * 0.09, s * 0.16, s * 0.10);
    const grd = g.createLinearGradient(0, s * 0.22, 0, s * 0.98);
    grd.addColorStop(0, c);
    grd.addColorStop(1, 'rgba(255,154,60,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(s * 0.42, s * 0.22); g.lineTo(s * 0.58, s * 0.22);
    g.lineTo(s * 0.82, s * 0.98); g.lineTo(s * 0.18, s * 0.98);
    g.closePath(); g.fill();
  },
  torpedo(g, s, c) {
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(s * 0.92, s * 0.50);
    g.bezierCurveTo(s * 0.78, s * 0.30, s * 0.40, s * 0.32, s * 0.26, s * 0.36);
    g.lineTo(s * 0.26, s * 0.64);
    g.bezierCurveTo(s * 0.40, s * 0.68, s * 0.78, s * 0.70, s * 0.92, s * 0.50);
    g.closePath(); g.fill();
    g.beginPath();
    g.moveTo(s * 0.26, s * 0.36); g.lineTo(s * 0.10, s * 0.18); g.lineTo(s * 0.14, s * 0.42);
    g.closePath(); g.fill();
    g.beginPath();
    g.moveTo(s * 0.26, s * 0.64); g.lineTo(s * 0.10, s * 0.82); g.lineTo(s * 0.14, s * 0.58);
    g.closePath(); g.fill();
    g.strokeStyle = c; g.lineWidth = Math.max(1.2, s * 0.05);
    g.beginPath(); g.moveTo(s * 0.08, s * 0.30); g.lineTo(s * 0.08, s * 0.70); g.stroke();
    g.fillStyle = DARK;
    g.fillRect(s * 0.44, s * 0.44, s * 0.22, s * 0.05);
  },
  lock(g, s, c) {
    g.strokeStyle = c; g.lineWidth = Math.max(1.6, s * 0.09);
    g.beginPath(); g.arc(s * 0.50, s * 0.42, s * 0.20, Math.PI, 0); g.stroke();
    g.fillStyle = c;
    g.fillRect(s * 0.24, s * 0.42, s * 0.52, s * 0.40);
  },
};

/** Draw a weapon icon into the size×size box at the current origin. */
export function drawIcon(g, name, size, color = GOLD) {
  const fn = W[name] || W.bomb;
  g.save();
  fn(g, size, color);
  g.restore();
}

export function hasIcon(name) { return !!W[name]; }

/* ------------------------------------------------------------------- planes */

// Hand-authored side profiles in a 0..1 box, nose to the RIGHT, y down.
// gfx/shapes/*.js owns the real in-flight art; this is the hangar/HUD stand-in.

const BODY_PROP = [
  [.945, .490], [.860, .400], [.660, .362], [.430, .360], [.240, .382],
  [.135, .150], [.055, .146], [.028, .398], [.020, .440],
  [.120, .478], [.260, .512], [.470, .586], [.700, .584], [.880, .545],
];
const BODY_JET = [
  [.985, .485], [.870, .398], [.620, .352], [.360, .360], [.215, .372],
  [.115, .120], [.035, .118], [.020, .380], [.016, .445],
  [.130, .475], [.300, .520], [.520, .578], [.760, .568], [.930, .520],
];

const SHAPES = {
  biplane: {
    body: BODY_PROP, prop: 1, gear: 1, blunt: 1,
    wingFar: [[.360, .462], [.660, .452], [.640, .518], [.340, .524]],
    wingNear: [[.330, .500], [.640, .512], [.600, .650], [.270, .628]],
    upper: [[.290, .190], [.700, .178], [.690, .238], [.280, .250]],
    struts: [[.360, .470, .345, .238], [.590, .478, .580, .230], [.470, .474, .462, .234]],
    tailplane: [[.170, .430], [.020, .392], [.020, .470], [.170, .484]],
    canopy: [[.460, .362], [.520, .300], [.610, .298], [.660, .364]],
    roundel: [.470, .560],
  },
  monoplane: {
    body: BODY_PROP, prop: 1, gear: 1,
    wingFar: [[.365, .458], [.680, .452], [.660, .514], [.345, .520]],
    wingNear: [[.340, .498], [.665, .516], [.615, .655], [.280, .628]],
    tailplane: [[.170, .430], [.020, .392], [.020, .470], [.170, .484]],
    canopy: [[.470, .360], [.535, .296], [.630, .296], [.685, .362]],
    roundel: [.480, .562],
  },
  fighter: {
    body: BODY_PROP, prop: 1,
    wingFar: [[.340, .456], [.700, .448], [.680, .512], [.325, .518]],
    wingNear: [[.315, .496], [.690, .514], [.630, .668], [.255, .632]],
    tailplane: [[.170, .428], [.015, .388], [.015, .472], [.170, .486]],
    canopy: [[.480, .358], [.545, .288], [.650, .288], [.710, .360]],
    roundel: [.470, .566],
  },
  jet: {
    body: BODY_JET, jet: 1,
    wingFar: [[.290, .450], [.640, .440], [.610, .500], [.270, .508]],
    wingNear: [[.250, .492], [.640, .506], [.540, .672], [.180, .620]],
    tailplane: [[.150, .420], [.012, .372], [.012, .462], [.150, .478]],
    canopy: [[.560, .352], [.630, .282], [.740, .286], [.800, .366]],
    roundel: [.420, .556],
  },
  jet2: {
    body: BODY_JET, jet: 1, twin: 1,
    wingFar: [[.250, .448], [.640, .434], [.600, .496], [.230, .506]],
    wingNear: [[.210, .490], [.650, .500], [.520, .690], [.140, .618]],
    tailplane: [[.140, .418], [.010, .366], [.010, .460], [.140, .478]],
    canopy: [[.600, .348], [.670, .272], [.790, .278], [.850, .364]],
    roundel: [.390, .552],
  },
  jet3: {
    body: BODY_JET, jet: 1, twin: 1,
    wingFar: [[.230, .446], [.660, .430], [.615, .494], [.210, .504]],
    wingNear: [[.190, .488], [.680, .498], [.520, .700], [.120, .616]],
    tailplane: [[.135, .416], [.008, .362], [.008, .458], [.135, .476]],
    canopy: [[.620, .346], [.690, .268], [.815, .274], [.875, .362]],
    roundel: [.370, .552],
  },
  stealth: {
    body: [
      [.985, .478], [.760, .404], [.420, .372], [.230, .368],
      [.130, .186], [.060, .190], [.030, .396], [.020, .452],
      [.150, .482], [.340, .528], [.600, .570], [.860, .534],
    ],
    jet: 1,
    wingFar: [[.150, .440], [.600, .424], [.520, .490], [.130, .500]],
    wingNear: [[.100, .484], [.660, .490], [.360, .742], [.045, .604]],
    tailplane: null,
    canopy: [[.640, .358], [.700, .296], [.800, .300], [.860, .366]],
    roundel: [.300, .560],
  },
  delta: {
    body: BODY_JET, jet: 1,
    wingFar: [[.180, .444], [.620, .428], [.560, .492], [.160, .502]],
    wingNear: [[.130, .486], [.680, .494], [.430, .720], [.075, .612]],
    tailplane: null,
    canopy: [[.650, .344], [.720, .266], [.840, .274], [.900, .360]],
    roundel: [.330, .552],
  },
};

const EDGE = '#100e0c';

function path(g, w, h, pts, close = true) {
  g.beginPath();
  g.moveTo(w * pts[0][0], h * pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(w * pts[i][0], h * pts[i][1]);
  if (close) g.closePath();
}

function shade(g, w, h, top, mid, low, outline = true) {
  const grd = g.createLinearGradient(0, h * .18, 0, h * .80);
  grd.addColorStop(0, top); grd.addColorStop(.52, mid); grd.addColorStop(1, low);
  g.fillStyle = grd;
  g.fill();
  if (outline) { g.strokeStyle = EDGE; g.lineWidth = Math.max(1, h * .013); g.stroke(); }
}

/** Draw a plane silhouette filling a w x h box, nose right. */
export function drawPlane(g, shape, w, h) {
  const d = SHAPES[shape] || SHAPES.monoplane;
  g.save();
  g.lineJoin = 'round';
  g.lineCap = 'round';

  if (d.wingFar) { path(g, w, h, d.wingFar); shade(g, w, h, '#2b3037', '#1d2126', '#15181c'); }
  if (d.tailplane) { path(g, w, h, d.tailplane); shade(g, w, h, '#3a4048', '#2a2f35', '#1c2025'); }

  path(g, w, h, d.body);
  shade(g, w, h, '#8a929b', '#4a5058', '#22262b');

  // warm rim light along the spine — the readability law, ART.md §2
  g.strokeStyle = 'rgba(255,201,124,0.92)';
  g.lineWidth = Math.max(1.3, h * .019);
  g.beginPath();
  g.moveTo(w * d.body[1][0], h * d.body[1][1]);
  for (let i = 2; i <= 4; i++) g.lineTo(w * d.body[i][0], h * d.body[i][1]);
  g.stroke();
  g.beginPath();
  g.moveTo(w * d.body[5][0], h * d.body[5][1]);
  g.lineTo(w * d.body[6][0], h * d.body[6][1]);
  g.stroke();

  // panel line
  g.strokeStyle = 'rgba(10,9,8,0.45)';
  g.lineWidth = Math.max(1, h * .010);
  g.beginPath();
  g.moveTo(w * .30, h * .452); g.lineTo(w * .82, h * .440);
  g.stroke();

  if (d.canopy) {
    path(g, w, h, d.canopy, false);
    g.closePath();
    const cg = g.createLinearGradient(0, h * .26, 0, h * .38);
    cg.addColorStop(0, '#d8ecf6'); cg.addColorStop(.6, '#7fa2b8'); cg.addColorStop(1, '#41596b');
    g.fillStyle = cg; g.fill();
    g.strokeStyle = EDGE; g.lineWidth = Math.max(1, h * .011); g.stroke();
  }

  if (d.wingNear) {
    path(g, w, h, d.wingNear);
    shade(g, w, h, '#98a0a8', '#5b6169', '#2e3238');
    g.strokeStyle = 'rgba(255,201,124,0.55)';
    g.lineWidth = Math.max(1, h * .013);
    g.beginPath();
    g.moveTo(w * d.wingNear[0][0], h * d.wingNear[0][1]);
    g.lineTo(w * d.wingNear[1][0], h * d.wingNear[1][1]);
    g.stroke();
  }

  if (d.upper) {
    g.strokeStyle = '#23201d'; g.lineWidth = Math.max(1.1, h * .016);
    for (const [x1, y1, x2, y2] of d.struts || []) {
      g.beginPath(); g.moveTo(w * x1, h * y1); g.lineTo(w * x2, h * y2); g.stroke();
    }
    path(g, w, h, d.upper);
    shade(g, w, h, '#a2aab2', '#646a72', '#33383e');
  }

  if (d.gear) {
    g.strokeStyle = '#1e2127'; g.lineWidth = Math.max(1.3, h * .021);
    g.beginPath(); g.moveTo(w * .460, h * .620); g.lineTo(w * .432, h * .790); g.stroke();
    g.fillStyle = '#14171b';
    g.beginPath(); g.arc(w * .430, h * .812, h * .048, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#3a4048'; g.lineWidth = Math.max(1, h * .010); g.stroke();
  }

  if (d.prop) {
    const hub = .952;
    g.strokeStyle = 'rgba(232,222,204,0.22)';
    g.lineWidth = Math.max(2, h * .030);
    g.beginPath(); g.moveTo(w * hub, h * .295); g.lineTo(w * (hub + .010), h * .690); g.stroke();
    g.strokeStyle = 'rgba(240,232,216,0.55)';
    g.lineWidth = Math.max(1, h * .012);
    g.beginPath(); g.moveTo(w * (hub - .004), h * .320); g.lineTo(w * (hub + .014), h * .665); g.stroke();
    g.fillStyle = '#2b3037';
    g.beginPath(); g.ellipse(w * .938, h * .489, w * .014, h * .052, 0, 0, Math.PI * 2); g.fill();
  }

  if (d.jet) {
    const grd = g.createLinearGradient(w * .02, 0, w * -.12, 0);
    grd.addColorStop(0, 'rgba(255,178,92,0.95)');
    grd.addColorStop(.45, 'rgba(255,120,45,0.42)');
    grd.addColorStop(1, 'rgba(255,120,45,0)');
    g.fillStyle = grd;
    path(g, w, h, [[.030, .400], [-.120, .448], [.030, .490]]);
    g.fill();
  }

  if (d.roundel) {
    const [rx, ry] = d.roundel;
    g.fillStyle = '#b8452f';
    g.beginPath(); g.arc(w * rx, h * ry, h * .034, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ece5d6';
    g.beginPath(); g.arc(w * rx, h * ry, h * .016, 0, Math.PI * 2); g.fill();
  }

  g.restore();
}

/* -------------------------------------------------------------------- misc */

export function drawStar(g, cx, cy, r, filled) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.44 : r;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath();
  if (filled) {
    g.fillStyle = GOLD; g.fill();
    g.strokeStyle = '#8a5a18'; g.lineWidth = 1; g.stroke();
  } else {
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fill();
    g.strokeStyle = 'rgba(255,196,107,0.35)'; g.lineWidth = 1; g.stroke();
  }
}

/* -------------------------------------------------- DOM convenience wrapper */

/** → a <canvas> element with a weapon icon painted on it, DPR-aware. */
export function iconCanvas(name, cssSize, color = GOLD) {
  const dpr = Math.min(2, (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) || 1);
  const c = document.createElement('canvas');
  c.width = Math.round(cssSize * dpr);
  c.height = Math.round(cssSize * dpr);
  c.style.width = cssSize + 'px';
  c.style.height = cssSize + 'px';
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  drawIcon(g, name, cssSize, color);
  return c;
}

/** → a <canvas> element with a plane silhouette painted on it. */
export function planeCanvas(shape, w, h) {
  const dpr = Math.min(2, (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) || 1);
  const c = document.createElement('canvas');
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  c.style.width = w + 'px';
  c.style.height = h + 'px';
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  drawPlane(g, shape, w, h);
  return c;
}
