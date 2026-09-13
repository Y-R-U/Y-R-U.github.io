import * as THREE from "../vendor/three.module.js";

// Every animal is a single indexed, vertex-coloured mesh. Fins and body share a
// shader, so a full school costs one draw call rather than a call per appendage.
const palette = {
  betta: ["#285f80", "#64b3b1", "#e19859"],
  neon: ["#164960", "#43ddff", "#ed4a40"],
  rasbora: ["#b98256", "#f2a960", "#2d2930"],
  cory: ["#d6cbb0", "#7c8b7a", "#292d2a"],
  guppy: ["#456e91", "#4ac3c4", "#ff9550"],
  angelfish: ["#bfbda4", "#e7cd81", "#333c3c"],
  goldfish: ["#e79131", "#ffc965", "#e77732"],
  discus: ["#385d64", "#66bfb4", "#c79968"],
  clownfish: ["#f28c3b", "#ffbd55", "#f3e7ce"],
  chromis: ["#2c9cc4", "#94eef1", "#4386a6"],
  shrimp: ["#cb6b52", "#e8ad82", "#f6e9bf"],
  puffer: ["#c6ba70", "#e5ddba", "#626b48"],
  seahorse: ["#d69c64", "#e8be80", "#ab6850"],
  cardinal: ["#9bacc1", "#ddd6b8", "#2c3542"],
  lionfish: ["#936756", "#d3b79a", "#4a3430"],
  snail: ["#9e7149", "#c8a273", "#453832"],
};

function builder() {
  const p = [],
    n = [],
    c = [],
    uv = [],
    fin = [],
    idx = [];
  let count = 0;
  function add(pos, col, u = 0, v = 0, f = 0) {
    p.push(...pos);
    c.push(col.r, col.g, col.b);
    uv.push(u, v);
    fin.push(f);
    return count++;
  }
  function tri(a, b, d) {
    idx.push(a, b, d);
  }
  function sphere(center, radii, color, lat = 12, lon = 18) {
    const start = count;
    for (let i = 0; i <= lat; i++)
      for (let j = 0; j <= lon; j++) {
        const a = (i / lat) * Math.PI,
          b = (j / lon) * Math.PI * 2;
        add(
          [
            center[0] + Math.sin(a) * Math.cos(b) * radii[0],
            center[1] + Math.cos(a) * radii[1],
            center[2] + Math.sin(a) * Math.sin(b) * radii[2],
          ],
          color,
          j / lon,
          i / lat,
        );
      }
    for (let i = 0; i < lat; i++)
      for (let j = 0; j < lon; j++) {
        const a = start + i * (lon + 1) + j;
        tri(a, a + lon + 1, a + 1);
        tri(a + 1, a + lon + 1, a + lon + 2);
      }
  }
  function tube(points, radius, color, sides = 5) {
    const start = count;
    points.forEach((point, i) => {
      for (let j = 0; j < sides; j++) {
        const a = (j / sides) * Math.PI * 2,
          r = radius * (1 - (i / points.length) * 0.75);
        add(
          [point[0], point[1] + Math.sin(a) * r, point[2] + Math.cos(a) * r],
          color,
          i / points.length,
          j / sides,
          (i / points.length) * 0.35,
        );
      }
    });
    for (let i = 0; i < points.length - 1; i++)
      for (let j = 0; j < sides; j++) {
        const a = start + i * sides + j,
          b = start + i * sides + ((j + 1) % sides);
        tri(a, b, a + sides);
        tri(b, b + sides, a + sides);
      }
  }
  function finish() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(c, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute("finWeight", new THREE.Float32BufferAttribute(fin, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  return { add, tri, sphere, tube, finish };
}

export function makeFishGeometry(id) {
  const b = builder(),
    cols = (palette[id] || palette.neon).map((c) => new THREE.Color(c));
  const round = id === "discus" || id === "angelfish" || id === "cardinal";
  const h =
    id === "discus"
      ? 0.63
      : id === "angelfish"
        ? 0.55
        : id === "puffer"
          ? 0.39
          : round
            ? 0.4
            : 0.28;
  const w = id === "puffer" ? 0.37 : round ? 0.12 : 0.17;
  const bodyLength = id === "cory" ? 0.68 : 0.66;
  if (id === "snail") {
    b.sphere([0, -0.14, 0], [0.48, 0.1, 0.25], cols[2]);
    for (let k = 0; k < 42; k++) {
      const a = (k / 42) * Math.PI * 5.6,
        r = 0.27 * (1 - k / 52);
      b.sphere(
        [Math.cos(a) * r - 0.06, Math.sin(a) * r + 0.13, k / 260],
        [0.065, 0.068, 0.19 * (1 - k / 55)],
        cols[k % 7 < 2 ? 2 : 0],
        6,
        8,
      );
    }
    b.tube(
      [
        [0.25, -0.08, -0.09],
        [0.42, 0.1, -0.17],
        [0.55, 0.16, -0.22],
      ],
      0.012,
      cols[1],
    );
    b.tube(
      [
        [0.25, -0.08, 0.09],
        [0.42, 0.1, 0.17],
        [0.55, 0.16, 0.22],
      ],
      0.012,
      cols[1],
    );
    return b.finish();
  }
  if (id === "seahorse") {
    b.sphere([-0.06, 0.0, 0], [0.15, 0.45, 0.14], cols[0]);
    b.sphere([0.08, 0.49, 0], [0.23, 0.16, 0.13], cols[1]);
    b.tube(
      [
        [0.2, 0.48, 0],
        [0.4, 0.44, 0],
        [0.52, 0.43, 0],
      ],
      0.07,
      cols[0],
    );
    const tail = [];
    for (let i = 0; i < 25; i++) {
      const a = (i / 24) * 5.3,
        r = 0.22 * (1 - i / 32);
      tail.push([
        -0.03 + Math.sin(a) * r,
        -0.35 - i / 90 + Math.cos(a) * r * 0.5,
        0,
      ]);
    }
    b.tube(tail, 0.05, cols[0]);
    for (let i = 0; i < 9; i++)
      b.sphere(
        [-0.15, 0.33 - i * 0.075, 0],
        [0.07, 0.027, 0.16],
        cols[1],
        5,
        8,
      );
    for (const z of [-0.12, 0.12]) {
      b.sphere(
        [0.12, 0.54, z],
        [0.041, 0.043, 0.017],
        new THREE.Color("#131c20"),
        8,
        12,
      );
      b.sphere(
        [0.13, 0.556, z * 1.06],
        [0.013, 0.013, 0.009],
        new THREE.Color("white"),
        6,
        8,
      );
    }
    return b.finish();
  }
  if (id === "shrimp") {
    for (let i = 0; i < 8; i++)
      b.sphere(
        [0.35 - i * 0.095, Math.sin(i * 0.4) * 0.08, 0],
        [0.1, 0.13 * (1 - i * 0.07), 0.12 * (1 - i * 0.07)],
        cols[i % 2],
        8,
        10,
      );
    for (let s of [-1, 1])
      for (let i = 0; i < 6; i++) {
        const x = 0.2 - i * 0.08;
        b.tube(
          [
            [x, -0.04, s * 0.08],
            [x + 0.05, -0.19, s * 0.22],
            [x + 0.17, -0.25, s * 0.27],
          ],
          0.012,
          cols[1],
        );
      }
    for (let s of [-1, 1])
      b.tube(
        [
          [0.42, 0.08, s * 0.05],
          [0.58, 0.16, s * 0.2],
          [0.79, 0.29, s * 0.28],
          [1, 0.36, s * 0.25],
        ],
        0.007,
        cols[2],
      );
    for (const z of [-0.08, 0.08])
      b.sphere(
        [0.44, 0.1, z],
        [0.026, 0.032, 0.025],
        new THREE.Color("#171c1d"),
        6,
        8,
      );
    return b.finish();
  }
  // Lathed cross-sections narrow smoothly to a distinct caudal peduncle.
  const rows = 34,
    around = 28;
  let previous = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows,
      x = -bodyLength + t * bodyLength * 2;
    let radius = Math.pow(Math.sin(Math.PI * t), 0.58);
    radius *= 0.65 + 0.45 * t;
    const thisRow = [];
    for (let j = 0; j <= around; j++) {
      const a = (j / around) * Math.PI * 2,
        y = Math.cos(a) * h * radius,
        z = Math.sin(a) * w * radius;
      let col = cols[0]
        .clone()
        .lerp(
          cols[1],
          Math.max(0, Math.sin(a)) * 0.18 + Math.max(0, -Math.cos(a)) * 0.3,
        );
      const scales = Math.sin(i * 2.8 + j * 1.7) * Math.sin(i * 1.1 - j * 2.3);
      col.multiplyScalar(0.9 + scales * 0.08 + Math.max(0, Math.cos(a)) * 0.22);
      if (id === "neon") {
        if (y > -0.04 && y < 0.055) col.copy(cols[1]);
        else if (y < -0.045 && x < 0.18) col.copy(cols[2]);
      }
      if (
        id === "rasbora" &&
        x < 0.06 &&
        x > -0.43 &&
        Math.abs(y) < (0.06 - x) * 0.45
      )
        col.copy(cols[2]);
      if (
        ["angelfish", "cardinal", "lionfish"].includes(id) &&
        Math.sin(t * (id === "lionfish" ? 34 : 22)) > 0.35
      )
        col.copy(cols[2]);
      if (
        id === "clownfish" &&
        [0.24, 0.52, 0.79].some((k) => Math.abs(t - k) < 0.052)
      )
        col.copy(cols[2]);
      if (id === "cory" && (Math.abs(x - 0.4) < 0.12 || x < -0.3))
        col.copy(cols[2]);
      if (id === "discus")
        col.lerp(
          cols[2],
          Math.pow(Math.max(0, Math.sin(t * 49 + j * 0.55)), 8) * 0.7,
        );
      if (id === "puffer" && Math.sin(i * 7.3 + j * 5.2) > 0.91)
        col.copy(cols[2]);
      if (id === "betta")
        col.lerp(
          cols[2],
          0.08 + Math.pow(Math.max(0, Math.sin(i * 0.7 + j * 0.47)), 4) * 0.38,
        );
      const k = b.add([x, y, z], col, t, j / around);
      thisRow.push(k);
      if (i && j) {
        b.tri(previous[j - 1], k, thisRow[j - 1]);
        b.tri(previous[j - 1], previous[j], k);
      }
    }
    previous = thisRow;
  }
  function fan(root, outline, base, edge, size = 1) {
    const rN = 11,
      aN = 44;
    let prev = [];
    for (let i = 0; i <= rN; i++) {
      let cur = [];
      for (let j = 0; j <= aN; j++) {
        const u = j / aN,
          r = i / rN,
          o = outline(u),
          rip = 0.018 * Math.sin(u * 78) * r * r;
        const pos = [
          root[0] + (o[0] - root[0]) * r,
          root[1] + (o[1] - root[1]) * r,
          root[2] + (o[2] - root[2]) * r + rip,
        ];
        const ray =
          0.72 + Math.pow(Math.abs(Math.cos(u * Math.PI * 24)), 12) * 0.36;
        const color = base
          .clone()
          .lerp(edge, Math.pow(r, 3) * 0.92)
          .multiplyScalar(ray);
        const k = b.add(pos, color, u, r, r * size);
        cur.push(k);
        if (i && j) {
          b.tri(prev[j - 1], cur[j - 1], k);
          b.tri(prev[j - 1], k, prev[j]);
        }
      }
      prev = cur;
    }
  }
  const big = id === "betta" || id === "guppy",
    tailLen = big ? 0.86 : id === "goldfish" ? 0.65 : 0.42,
    tailH = big ? 0.67 : id === "goldfish" ? 0.46 : 0.3;
  fan(
    [-0.54, 0, 0],
    (u) => {
      const a = -1.03 + u * 2.06;
      return [
        -0.58 - Math.cos(a) * tailLen,
        Math.sin(a) * tailH * (big ? 1.16 : 1),
        0.006,
      ];
    },
    cols[0],
    cols[2],
    1,
  );
  fan(
    [-0.04, h * 0.48, 0],
    (u) => [
      -0.55 + u * 0.89,
      h * (0.88 + 0.34 * Math.sin(u * Math.PI)) +
        (id === "angelfish" ? 0.72 : big ? 0.4 : 0.12) * Math.sin(u * Math.PI),
      0,
    ],
    cols[0],
    cols[2],
    0.6,
  );
  fan(
    [0.04, -h * 0.49, 0],
    (u) => [
      -0.58 + u * 0.94,
      -h * (0.8 + 0.18 * Math.sin(u * Math.PI)) -
        (id === "angelfish" ? 0.74 : big ? 0.35 : 0.12) * Math.sin(u * Math.PI),
      0,
    ],
    cols[0],
    cols[2],
    0.65,
  );
  for (const s of [-1, 1])
    fan(
      [0.26, -0.08, s * w * 0.78],
      (u) => [
        0.02 - 0.21 * Math.sin(u * Math.PI),
        -0.11 - 0.19 * Math.sin(u * Math.PI),
        s * (w + 0.29 * Math.sin(u * Math.PI)),
      ],
      cols[1],
      cols[2],
      0.9,
    );
  if (id === "betta" || id === "angelfish")
    for (const s of [-1, 1])
      b.tube(
        [
          [0.22, -0.16, s * 0.04],
          [0.1, -0.4, s * 0.05],
          [-0.09, -0.76, s * 0.02],
        ],
        0.018,
        cols[2],
      );
  if (id === "lionfish")
    for (const s of [-1, 1])
      for (let i = 0; i < 9; i++)
        b.tube(
          [
            [0.28 - i * 0.06, 0.03, s * 0.12],
            [
              -0.05 - i * 0.1,
              0.15 + Math.sin(i * 0.5) * 0.3,
              s * (0.58 + i * 0.02),
            ],
            [
              -0.12 - i * 0.13,
              0.25 + Math.sin(i * 0.5) * 0.45,
              s * (0.7 + i * 0.02),
            ],
          ],
          0.019,
          i % 2 ? cols[1] : cols[2],
        );
  // The iris, pupil and tiny corneal highlight make a fish read as an animal.
  const eyeX = 0.46,
    eyeY = h * 0.23;
  for (const s of [-1, 1]) {
    b.sphere(
      [eyeX, eyeY, s * w * 0.72],
      [0.066, 0.071, 0.039],
      new THREE.Color("#bcaa6c"),
      10,
      14,
    );
    b.sphere(
      [eyeX + 0.012, eyeY, s * w * 0.89],
      [0.044, 0.048, 0.019],
      new THREE.Color("#101919"),
      10,
      14,
    );
    b.sphere(
      [eyeX + 0.018, eyeY + 0.02, s * w * 0.97],
      [0.013, 0.015, 0.008],
      new THREE.Color("#fff8dc"),
      6,
      8,
    );
  }
  return b.finish();
}

export function makeFishMaterial(id, uniforms) {
  const m = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    metalness: id === "betta" ? 0.48 : 0.25,
    roughness: 0.38,
    clearcoat: 0.8,
    clearcoatRoughness: 0.18,
    side: THREE.DoubleSide,
    emissive: new THREE.Color(palette[id]?.[1] || "#6aa7a0"),
    emissiveIntensity: id === "neon" ? 0.14 : 0.025,
  });
  m.onBeforeCompile = (s) => {
    s.uniforms.uSwim = uniforms.time;
    s.vertexShader = s.vertexShader.replace(
      "#include <common>",
      "#include <common>\nuniform float uSwim; attribute float finWeight; attribute float swimPhase; varying float vFin;",
    );
    s.vertexShader = s.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      float tail = (1.0-smoothstep(-1.3,0.4,position.x));
      float wave = sin(uSwim*3.9+swimPhase+position.x*4.2);
      transformed.z += wave * (tail*tail*0.11 + finWeight*0.11);
      transformed.y += sin(uSwim*3.5+swimPhase+position.x*3.0)*finWeight*0.035;
      vFin=finWeight;`,
    );
    s.fragmentShader = s.fragmentShader.replace(
      "#include <common>",
      "#include <common>\nvarying float vFin;",
    );
    s.fragmentShader = s.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      diffuseColor.rgb *= 1.0 + vFin*0.13;`,
    );
  };
  m.customProgramCacheKey = () => `fish-wave-${id}`;
  return m;
}

export const FISH_SCALE = {
  betta: 0.82,
  neon: 0.31,
  rasbora: 0.36,
  cory: 0.48,
  snail: 0.37,
  guppy: 0.49,
  angelfish: 0.68,
  goldfish: 0.72,
  discus: 0.76,
  clownfish: 0.61,
  chromis: 0.4,
  shrimp: 0.4,
  puffer: 0.64,
  seahorse: 0.6,
  cardinal: 0.54,
  lionfish: 0.67,
};
