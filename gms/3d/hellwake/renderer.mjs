import * as THREE from "../../lib/three/0.160.0/three.module.js";

const INK = 0x08131b,
  MINT = 0x83ffce,
  CORAL = 0xff586b;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function random(seed = 934) {
  return () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function canvasTexture(size, draw) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function glowTexture() {
  return canvasTexture(128, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.14, "rgba(255,255,255,.85)");
    g.addColorStop(0.4, "rgba(255,255,255,.23)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  });
}
function streetTexture() {
  return canvasTexture(1024, (c, s) => {
    const rng = random(419);
    c.fillStyle = "#21343e";
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < 40000; i++) {
      const a = rng() * 0.055;
      c.fillStyle = `rgba(154,181,170,${a})`;
      c.fillRect(rng() * s, rng() * s, 1 + rng() * 3, 1 + rng() * 3);
    }
    c.fillStyle = "#2b414a";
    c.fillRect(0, 0, 180, s);
    c.fillRect(844, 0, 180, s);
    c.strokeStyle = "#284149";
    c.lineWidth = 2;
    for (let i = 0; i < 24; i++) {
      let v = (i * s) / 24;
      c.beginPath();
      c.moveTo(0, v);
      c.lineTo(180, v);
      c.moveTo(844, v);
      c.lineTo(s, v);
      c.stroke();
    }
    c.strokeStyle = "#50706b";
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(180, 0);
    c.lineTo(180, s);
    c.moveTo(844, 0);
    c.lineTo(844, s);
    c.stroke();
    c.strokeStyle = "rgba(141,162,133,.24)";
    c.lineWidth = 3;
    c.setLineDash([55, 54]);
    c.beginPath();
    c.moveTo(510, 0);
    c.lineTo(510, s);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = "rgba(159,183,170,.15)";
    for (let i = 0; i < 8; i++) c.fillRect(220 + i * 77, 740, 45, 82);
    for (let i = 0; i < 64; i++) {
      let x = rng() * s,
        y = rng() * s;
      c.strokeStyle = "rgba(0,7,11,.4)";
      c.lineWidth = 1 + rng() * 2;
      c.beginPath();
      c.moveTo(x, y);
      for (let j = 0; j < 5; j++) {
        x += rng() * 30 - 15;
        y += rng() * 30;
        c.lineTo(x, y);
      }
      c.stroke();
    }
    for (let i = 0; i < 14; i++) {
      const x = rng() * s,
        y = rng() * s,
        g = c.createRadialGradient(x, y, 0, x, y, 30 + rng() * 70);
      g.addColorStop(0, "rgba(3,13,19,.33)");
      g.addColorStop(1, "rgba(3,13,19,0)");
      c.fillStyle = g;
      c.fillRect(x - 120, y - 120, 240, 240);
    }
  });
}
function chapterFloorTexture(chapter) {
  return canvasTexture(1024, (c, size) => {
    const rng = random(715 + chapter * 143),
      accent = [
        "#779d92",
        "#cb9e77",
        "#9b85bc",
        "#71a9c3",
        "#c391b0",
        "#b55e76",
      ][chapter];
    const line = (x1, y1, x2, y2, color, width = 2) => {
      c.strokeStyle = color;
      c.lineWidth = width;
      c.beginPath();
      c.moveTo(x1, y1);
      c.lineTo(x2, y2);
      c.stroke();
    };
    // Embedded ground detail is deliberately flat and traversable.
    for (let i = 0; i < 100; i++) {
      const x = rng() * size,
        y = rng() * size;
      c.save();
      c.translate(x, y);
      c.rotate(rng() * 6);
      c.fillStyle = i % 6 === 0 ? "rgba(128,151,147,.16)" : "rgba(4,14,20,.35)";
      c.fillRect(0, 0, 2 + rng() * 6, 2 + rng() * 9);
      c.restore();
    }
    for (let i = 0; i < 30; i++) {
      const x = (i % 2 === 0 ? 180 : 780) + rng() * 65,
        y = rng() * size;
      line(
        x,
        y,
        x + 20 + rng() * 30,
        y + rng() * 6,
        "rgba(145,183,177,.15)",
        1,
      );
    }
    c.strokeStyle = accent;
    c.fillStyle = accent;
    c.globalAlpha = 0.34;
    if (chapter === 0) {
      for (const x of [220, 804]) {
        for (let y = 40; y < size; y += 190) {
          c.save();
          c.translate(x, y);
          c.rotate(0.15);
          for (let i = 0; i < 6; i++)
            line(i * 5, 0, i * 5 + 12, 12, "#b6a367", 3);
          c.restore();
        }
      }
      c.textAlign = "center";
      c.font = "bold 28px monospace";
      c.fillText("EVAC", 512, 730);
      line(512, 660, 512, 703, accent, 4);
      line(512, 660, 497, 677, accent, 4);
      line(512, 660, 527, 677, accent, 4);
      c.font = "bold 14px monospace";
      c.fillText("MERCY EMERGENCY ROUTE", 512, 760);
    }
    if (chapter === 1) {
      for (const x of [235, 785])
        for (let y = 100; y < 1000; y += 250) {
          c.fillRect(x - 5, y - 22, 10, 44);
          c.fillRect(x - 22, y - 5, 44, 10);
        }
      c.setLineDash([25, 15]);
      c.strokeStyle = "#bf9272";
      c.lineWidth = 3;
      c.strokeRect(315, 355, 394, 310);
      c.setLineDash([]);
      c.font = "bold 24px monospace";
      c.textAlign = "center";
      c.fillText("TRIAGE  /  02", 512, 650);
      for (let i = 0; i < 48; i++) {
        const x = rng() * 1024,
          y = rng() * 1024;
        c.fillStyle = "#c4baa1";
        c.globalAlpha = 0.12 + rng() * 0.14;
        c.save();
        c.translate(x, y);
        c.rotate(rng() * 3);
        c.fillRect(-2, -3, 5, 7);
        c.restore();
      }
    }
    if (chapter === 2) {
      c.globalAlpha = 0.2;
      for (let x = 0; x < 1024; x += 64) line(x, 0, x, 1024, accent, 1);
      for (let y = 0; y < 1024; y += 64) line(0, y, 1024, y, accent, 1);
      for (const x of [205, 819])
        for (let y = 160; y < 1000; y += 320) {
          c.strokeStyle = accent;
          c.lineWidth = 2;
          for (const r of [33, 44, 52]) {
            c.beginPath();
            c.arc(x, y, r, 0, TAU);
            c.stroke();
          }
          for (let k = 0; k < 8; k++) {
            const a = (k * TAU) / 8;
            line(
              x + Math.cos(a) * 20,
              y + Math.sin(a) * 20,
              x + Math.cos(a) * 51,
              y + Math.sin(a) * 51,
              accent,
              1,
            );
          }
        }
    }
    if (chapter === 3) {
      for (let i = 0; i < 18; i++) {
        const x = rng() * 1024,
          y = rng() * 1024;
        c.globalAlpha = 0.11;
        c.fillStyle = "#7fbfd6";
        c.beginPath();
        c.ellipse(x, y, 30 + rng() * 75, 12 + rng() * 32, rng() * 3, 0, TAU);
        c.fill();
        for (let j = 0; j < 5; j++)
          line(x - 15, y + j * 3, x + 20 + rng() * 25, y + j * 3, "#8bd8e3", 1);
      }
      c.globalAlpha = 0.34;
      for (const x of [260, 754]) {
        line(x, 0, x, 420, "#aa9b63", 3);
        line(x, 420, x - 50, 490, "#aa9b63", 3);
        line(x - 50, 490, x - 50, 1024, "#aa9b63", 3);
      }
      c.font = "bold 24px monospace";
      c.textAlign = "center";
      c.fillStyle = accent;
      c.fillText("HIGH VOLTAGE", 512, 690);
    }
    if (chapter === 4) {
      c.globalAlpha = 0.23;
      for (const x of [208, 816])
        for (let y = 60; y < 1000; y += 120) {
          c.strokeStyle = accent;
          c.strokeRect(x - 35, y - 32, 70, 64);
          c.font = "7px monospace";
          c.textAlign = "center";
          c.fillStyle = accent;
          c.fillText("WE REMEMBER", x, y - 8);
          c.fillText("EVERY NAME", x, y + 5);
          for (let j = 0; j < 3; j++)
            line(x - 20, y + 13 + j * 6, x + 20, y + 13 + j * 6, accent, 1);
        }
      c.font = "bold 20px monospace";
      c.textAlign = "center";
      c.fillText("NOBODY LEAVES FORGOTTEN", 512, 730);
    }
    if (chapter === 5) {
      c.globalAlpha = 0.3;
      for (const r of [130, 160, 270, 290]) {
        c.strokeStyle = accent;
        c.lineWidth = 2;
        c.beginPath();
        c.arc(512, 350, r, 0, TAU);
        c.stroke();
      }
      for (let i = 0; i < 12; i++) {
        const a = (i * TAU) / 12;
        line(
          512 + Math.cos(a) * 165,
          350 + Math.sin(a) * 165,
          512 + Math.cos(a) * 268,
          350 + Math.sin(a) * 268,
          accent,
          2,
        );
      }
      for (let i = 0; i < 9; i++) {
        let x = i % 2 ? 100 : 924,
          y = rng() * size;
        c.strokeStyle = "#d6586b";
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(x, y);
        for (let j = 0; j < 9; j++) {
          x += (i % 2 ? 1 : -1) * rng() * 15;
          y += rng() * 22 - 7;
          c.lineTo(x, y);
        }
        c.stroke();
      }
    }
  });
}
function mesh(geo, mat, parent, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  parent.add(m);
  return m;
}

class Batch {
  constructor(scene, geometry, material, max) {
    this.mesh = new THREE.InstancedMesh(geometry, material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.max = max;
    this.n = 0;
    this.obj = new THREE.Object3D();
    this.color = new THREE.Color();
  }
  clear() {
    this.n = 0;
  }
  add(x, y, z, sx, sy, sz, color, rx = 0, ry = 0, rz = 0) {
    if (this.n >= this.max) return;
    this.obj.position.set(x, y, z);
    this.obj.rotation.set(rx, ry, rz);
    this.obj.scale.set(sx, sy, sz);
    this.obj.updateMatrix();
    this.mesh.setMatrixAt(this.n, this.obj.matrix);
    if (color !== undefined)
      this.mesh.setColorAt(this.n, this.color.set(color));
    this.n++;
  }
  flush() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

export class WorldRenderer {
  constructor(canvas, { quality = "auto", reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.quality = quality;
    this.reducedMotion = reducedMotion;
    this.elapsed = 0;
    this.follow = new THREE.Vector3();
    this.hasRun = false;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(INK);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(INK);
    this.scene.fog = new THREE.FogExp2(INK, 0.008);
    this.camera = new THREE.OrthographicCamera(-11, 11, 24, -24, 0.1, 160);
    this.scene.add(new THREE.HemisphereLight(0xb1e9e7, 0x16242e, 2.15));
    const moon = new THREE.DirectionalLight(0xa5ceef, 2.7);
    moon.position.set(-8, 16, 7);
    this.scene.add(moon);
    const hell = new THREE.DirectionalLight(CORAL, 1.45);
    hell.position.set(8, 7, -12);
    this.scene.add(hell);
    this.box = new THREE.BoxGeometry(1, 1, 1);
    this.sphere = new THREE.IcosahedronGeometry(1, 1);
    this.octa = new THREE.OctahedronGeometry(1);
    this.plane = new THREE.PlaneGeometry(1, 1);
    this.ringGeo = new THREE.RingGeometry(0.92, 1, 48);
    this.cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
    this.mats = {
      body: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.8,
        metalness: 0.15,
      }),
      dark: new THREE.MeshStandardMaterial({
        color: 0x152b35,
        roughness: 0.75,
        metalness: 0.4,
      }),
      hero: new THREE.MeshStandardMaterial({
        color: 0xe4e5cf,
        roughness: 0.65,
      }),
      teal: new THREE.MeshStandardMaterial({
        color: 0x83dfc4,
        roughness: 0.45,
        metalness: 0.45,
      }),
      red: new THREE.MeshStandardMaterial({
        color: 0x813a50,
        roughness: 0.65,
        metalness: 0.2,
      }),
      black: new THREE.MeshStandardMaterial({
        color: 0x0b131e,
        roughness: 0.65,
      }),
      emissive: new THREE.MeshBasicMaterial({ color: 0xffffff }),
      glow: new THREE.MeshBasicMaterial({
        color: 0xffffff,
        map: glowTexture(),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.64,
        side: THREE.DoubleSide,
      }),
      ring: new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.67,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      shadow: new THREE.MeshBasicMaterial({
        map: glowTexture(),
        color: 0x000007,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    };
    this.batches = {
      body: new Batch(this.scene, this.box, this.mats.body, 500),
      limbs: new Batch(this.scene, this.box, this.mats.body, 1800),
      head: new Batch(this.scene, this.box, this.mats.body, 400),
      eyes: new Batch(this.scene, this.box, this.mats.emissive, 850),
      gems: new Batch(this.scene, this.octa, this.mats.emissive, 650),
      bullets: new Batch(this.scene, this.octa, this.mats.emissive, 500),
      glow: new Batch(this.scene, this.plane, this.mats.glow, 750),
      rings: new Batch(this.scene, this.ringGeo, this.mats.ring, 160),
      shadows: new Batch(this.scene, this.plane, this.mats.shadow, 400),
    };
    this.makeWorld();
    this.makeChapterScenery();
    this.makeHero();
    this.makeBoss();
    this.makePortal();
    this.makeAtmosphere();
    this.demo = {
      player: { x: 0, y: 0, angle: -Math.PI / 2, hp: 100, maxHp: 100 },
      enemies: Array.from({ length: 38 }, (_, i) => {
        const a = i * 2.399,
          r = 6 + (i % 7) * 1.3;
        return {
          id: i,
          x: Math.cos(a) * r,
          y: Math.sin(a) * r,
          angle: a + Math.PI,
          type: i % 11 === 0 ? "brute" : i % 4 === 0 ? "runner" : "walker",
          hp: 100,
          maxHp: 100,
          radius: 0.5,
        };
      }),
      gems: Array.from({ length: 14 }, (_, i) => ({
        id: i,
        x: Math.sin(i * 1.7) * 6,
        y: Math.cos(i * 1.3) * 7,
        value: i % 4 === 0 ? 5 : 1,
      })),
      objectives: [
        {
          id: 0,
          x: 4,
          y: -8,
          radius: 2.1,
          progress: 0.4,
          done: false,
          type: "seal",
        },
      ],
      projectiles: [],
      effects: [],
      zones: [],
      weapons: { pistol: 1, orbit: 2 },
      evolved: {},
      time: 0,
    };
    this.resize();
  }
  makeWorld() {
    const groundMat = new THREE.MeshStandardMaterial({
      map: streetTexture(),
      color: 0xb1d0cb,
      roughness: 0.84,
      metalness: 0.22,
    });
    groundMat.map.wrapS = groundMat.map.wrapT = THREE.RepeatWrapping;
    groundMat.map.repeat.set(4.7, 3);
    const ground = mesh(
      new THREE.PlaneGeometry(150, 150),
      groundMat,
      this.scene,
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    const rng = random(76),
      buildings = new Batch(this.scene, this.box, this.mats.body, 180),
      windows = new Batch(this.scene, this.box, this.mats.emissive, 1500),
      details = new Batch(this.scene, this.box, this.mats.body, 500);
    for (let side = -1; side <= 1; side += 2) {
      for (let j = 0; j < 17; j++) {
        const x = side * (28 + rng() * 7),
          z = -64 + j * 8,
          w = 4 + rng() * 5,
          h = 4 + rng() * 15,
          d = 5 + rng() * 3;
        buildings.add(x, h / 2, z, w, h, d, side > 0 ? 0x1a2730 : 0x203744);
        buildings.add(x, h + 0.15, z, w + 0.3, 0.3, d + 0.3, 0x34434a);
        buildings.add(
          x - side * w * 0.51,
          h * 0.52,
          z,
          0.12,
          h * 0.98,
          d * 0.93,
          0x101e29,
        );
        for (let wy = 1; wy < h - 1; wy += 1.8)
          for (let wz = -d * 0.35; wz < d * 0.4; wz += 1.3) {
            if (rng() < 0.5) continue;
            windows.add(
              x - side * (w * 0.51 + 0.02),
              wy,
              z + wz,
              0.06,
              0.75,
              0.53,
              rng() > 0.8 ? 0xba574f : 0x406a73,
            );
          }
        if (j % 3 === 0) {
          windows.add(
            x - side * (w * 0.52 + 0.1),
            2.8,
            z,
            0.15,
            0.12,
            d * 0.7,
            j % 2 === 0 ? 0x89ffd7 : 0xff4963,
          );
          details.add(x - side * w * 0.58, 1, z, 0.5, 2, d * 0.5, 0x131c22);
        }
      }
    }
    for (let i = 0; i < 110; i++) {
      const side = i % 2 === 0 ? -1 : 1,
        x = side * (20 + rng() * 14),
        z = rng() * 110 - 55;
      details.add(
        x,
        0.12 + rng() * 0.3,
        z,
        0.25 + rng() * 1.2,
        0.2 + rng() * 0.5,
        0.3 + rng() * 0.8,
        0x304048,
        0,
        rng() * 6,
        0.05,
      );
    }
    // Street furniture is peripheral, keeping the combat floor visually clear.
    for (let i = -4; i <= 4; i++)
      for (const side of [-1, 1]) {
        const x = side * 22,
          z = i * 12;
        details.add(x, 2.1, z, 0.12, 4.2, 0.12, 0x344954);
        details.add(x - side * 0.6, 4.2, z, 1.4, 0.1, 0.12, 0x4b5e65);
        windows.add(x - side * 1.1, 4.15, z, 0.52, 0.1, 0.25, 0x84ffe0);
        details.add(x, 0.2, z, 1.1, 0.4, 1.1, 0x253a40);
      }
    buildings.flush();
    windows.flush();
    details.flush();
    this.titleCity = new THREE.Group();
    this.scene.add(this.titleCity);
    const titleBuildings = new Batch(
        this.titleCity,
        this.box,
        this.mats.body,
        40,
      ),
      titleWindows = new Batch(
        this.titleCity,
        this.box,
        this.mats.emissive,
        100,
      );
    for (const side of [-1, 1])
      for (let i = 0; i < 4; i++) {
        const x = side * (10.5 + i * 0.6),
          z = -23 + i * 5,
          h = 6 + (i % 3) * 2;
        titleBuildings.add(x, h / 2, z, 3.7, h, 3.8, 0x203744);
        titleBuildings.add(x, h + 0.15, z, 4, 0.3, 4.1, 0x324b59);
        for (let j = 1; j < h; j += 1.5)
          titleWindows.add(
            x - side * 1.88,
            j,
            z,
            0.03,
            0.65,
            2.3,
            i % 2 === 0 ? 0x477c86 : 0x896164,
          );
      }
    titleBuildings.flush();
    titleWindows.flush();
    for (const x of [-9.8, 9.8])
      for (let z = -24; z < 24; z += 4)
        windows.add(x, 0.021, z, 0.055, 0.015, 1.8, 0x233b45);
    for (const side of [-1, 1]) {
      windows.add(side * 24, 0.025, 0, 0.05, 0.02, 48, 0x593644);
      windows.add(0, 0.025, side * 24, 48, 0.02, 0.05, 0x593644);
    }
    windows.flush();
    this.staticBatches = [buildings, windows, details];
    // Thin, broken red conduits lead into the abyss at the north end.
    const conduitMat = new THREE.MeshBasicMaterial({ color: 0x71313f });
    for (const x of [-9, 9])
      mesh(this.box, conduitMat, this.scene, x, 0.015, -32, 0.045, 0.02, 28);
    const mark = canvasTexture(256, (c, s) => {
      c.strokeStyle = "#456568";
      c.lineWidth = 4;
      c.strokeRect(16, 16, 224, 224);
      c.font = "bold 40px monospace";
      c.textAlign = "center";
      c.fillStyle = "#648583";
      c.fillText("ZONE", 128, 111);
      c.font = "bold 70px monospace";
      c.fillText("06", 128, 184);
    });
    const stamp = mesh(
      new THREE.PlaneGeometry(3, 3),
      new THREE.MeshBasicMaterial({
        map: mark,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
      }),
      this.scene,
      -7,
      0.012,
      8,
    );
    stamp.rotation.x = -Math.PI / 2;
  }
  makeChapterScenery() {
    this.chapterScenes = [];
    for (let chapter = 0; chapter < 6; chapter++) {
      const group = new THREE.Group();
      this.scene.add(group);
      this.chapterScenes.push(group);
      const solids = new Batch(group, this.box, this.mats.body, 600),
        neon = new Batch(group, this.box, this.mats.emissive, 900);
      const accent = [
          0x7eb9a6, 0xff9d7c, 0xb095e5, 0x7ad4ed, 0xe8a2ce, 0xff5f83,
        ][chapter],
        stone = [0x32434a, 0x647573, 0x454256, 0x3c5662, 0x4d4757, 0x2e2538][
          chapter
        ];
      const block = (x, y, z, w, h, d, col = stone, rz = 0) =>
        solids.add(x, y, z, w, h, d, col, 0, 0, rz);
      const strip = (x, y, z, w, h, d, col = accent, rz = 0) =>
        neon.add(x, y, z, w, h, d, col, 0, 0, rz);
      const cross = (x, y, z, scale, col = 0xff726e) => {
        strip(x, y, z, 0.23 * scale, 1 * scale, 0.08, col);
        strip(x, y, z, 0.8 * scale, 0.23 * scale, 0.09, col);
      };
      const floor = mesh(
        new THREE.PlaneGeometry(48, 48),
        new THREE.MeshBasicMaterial({
          map: chapterFloorTexture(chapter),
          transparent: true,
          depthWrite: false,
          opacity: 0.9,
        }),
        group,
        0,
        0.018,
        0,
      );
      floor.rotation.x = -Math.PI / 2;
      // Low inset curb lights, broken paving and drains never suggest a solid obstacle.
      const rng = random(123 + chapter);
      for (const side of [-1, 1])
        for (let j = 0; j < 12; j++) {
          const z = -22 + j * 4,
            x = side * (9.8 + rng() * 0.6);
          block(x, 0.055, z, 0.55, 0.08, 0.85, 0x344d56);
          strip(x - side * 0.2, 0.103, z, 0.025, 0.015, 0.58, accent);
          if (j % 3 === 0) {
            block(x - side * 0.75, 0.03, z + 0.5, 0.52, 0.035, 0.75, 0x14232c);
            for (let k = 0; k < 5; k++)
              strip(
                x - side * 0.75,
                0.051,
                z + 0.25 + k * 0.11,
                0.46,
                0.008,
                0.021,
                0x4b6265,
              );
          }
        }
      if (chapter === 0) {
        // District checkpoint: ruined police canopy and emergency broadcast antenna.
        for (const x of [-7, 7]) {
          block(x, 1.5, -25, 0.28, 3, 0.28);
          block(x, 3, -25, 5, 0.22, 1.9);
          strip(x, 2.87, -24.04, 4.5, 0.08, 0.04);
          for (const side of [-1, 1]) {
            block(x + side * 1.6, 0.42, -24.8, 0.8, 0.84, 0.4, 0x4c5960);
            strip(x + side * 1.6, 0.48, -24.55, 0.55, 0.12, 0.06, 0xb6a36d);
          }
        }
        block(0, 4, -27, 0.2, 8, 0.2, 0x4f636b);
        for (let i = 0; i < 4; i++) {
          block(0, 4.5 + i * 0.85, -27, 2.8 - i * 0.45, 0.075, 0.075);
          strip(0, 8.1, -27, 0.16, 0.16, 0.16, 0xff6b78);
        }
      }
      if (chapter === 1) {
        block(0, 3.3, -28, 16, 6.6, 3.5, 0x47555b);
        block(0, 1.6, -26.2, 4, 3.2, 0.1, 0x182b34);
        block(0, 4.55, -26.1, 6, 0.8, 0.15, 0x24313d);
        cross(0, 4.7, -25.99, 1.5);
        for (const x of [-5.5, 5.5])
          for (let y = 1.6; y < 6; y += 1.5) {
            strip(x, y, -26.22, 3, 0.68, 0.035, 0x859c92);
          }
        for (const x of [-6, 6]) {
          block(x, 0.65, -24.9, 1.8, 1.3, 3.6, 0x91a199);
          block(x, 0.95, -23.04, 1.57, 0.42, 0.05, 0x213741);
          block(x, 0.65, -23.01, 1.55, 0.15, 0.05, 0xc45659);
          strip(x - 0.4, 1.36, -24.05, 0.45, 0.15, 0.3, 0xff6472);
          strip(x + 0.4, 1.36, -24.05, 0.45, 0.15, 0.3, 0x83d4ff);
          cross(x, 1.32, -24.4, 0.6);
          for (const dx of [-0.85, 0.85])
            for (const dz of [-1.15, 1.15])
              block(x + dx, 0.26, -24.9 + dz, 0.21, 0.48, 0.49, 0x18232c);
        }
      }
      if (chapter === 2) {
        for (const x of [-7, 7]) {
          block(x, 3.8, -26.3, 3.4, 7.6, 3.6);
          block(x, 8.05, -26.3, 2.3, 0.9, 2.5);
          block(x, 8.9, -26.3, 0.45, 1.4, 0.45);
          cross(x, 9.5, -26.3, 0.9, 0xb9ab9c);
          for (const dx of [-0.8, 0.8])
            strip(x + dx, 4, -24.48, 0.14, 4.5, 0.05);
        }
        for (const side of [-1, 1]) {
          block(side * 2.4, 2, -25.2, 0.65, 4, 1);
          block(side * 1.25, 4.55, -25.2, 0.65, 3.3, 1, stone, -side * 0.72);
          strip(side * 2.04, 2, -24.65, 0.055, 3.6, 0.055);
          strip(
            side * 1.08,
            4.35,
            -24.65,
            0.055,
            2.8,
            0.055,
            accent,
            -side * 0.72,
          );
        }
        for (const x of [-24.5, 24.5])
          for (let z = -17; z < 20; z += 9) {
            block(x, 1.3, z, 0.7, 2.6, 0.7);
            block(x, 2.75, z, 1.1, 0.25, 1.1);
          }
      }
      if (chapter === 3) {
        for (const x of [-6, 0, 6]) {
          block(x, 1.2, -25.6, 3.2, 2.4, 2.5);
          block(x, 2.55, -25.6, 3.6, 0.3, 2.8);
          for (const dx of [-1, 0, 1]) {
            block(x + dx, 3.1, -25.6, 0.23, 0.9, 0.23, 0x819d9e);
            for (let k = 0; k < 4; k++)
              block(x + dx, 2.8 + k * 0.19, -25.6, 0.4, 0.065, 0.4, 0x5d7581);
          }
          strip(x, 1.35, -24.32, 2.45, 0.09, 0.04);
          for (let k = 0; k < 6; k++)
            block(x - 1.1 + k * 0.44, 1.5, -24.33, 0.055, 1.2, 0.1, 0x192c39);
        }
        for (const x of [-10, 10]) {
          block(x, 4.7, -26, 0.18, 9.4, 0.18);
          strip(x, 9.4, -26, 0.24, 0.22, 0.24);
          block(x, 7.9, -26, 3, 0.12, 0.12);
          block(x, 7, -26, 1.8, 0.12, 0.12);
        }
        for (const x of [-24.5, 24.5])
          for (let z = -15; z < 21; z += 7) {
            block(x, 0.55, z, 1.2, 1.1, 1.4);
            strip(x, 0.7, z, 0.15, 0.6, 1.42);
          }
      }
      if (chapter === 4) {
        for (let i = -3; i <= 3; i++) {
          const x = i * 3.2,
            h = i === 0 ? 5.8 : 3.7;
          block(x, h / 2, -25.5, 1.5, h, 1);
          block(x, 0.16, -25.5, 2.3, 0.32, 1.7);
          strip(x, h * 0.72, -24.98, 0.055, h * 0.35, 0.04);
          for (let j = 0; j < 7; j++)
            strip(x, 0.7 + j * 0.23, -24.98, 0.8, 0.025, 0.02, 0x9a8399);
          for (const dx of [-0.65, 0.65]) {
            block(x + dx, 0.38, -24.6, 0.14, 0.4, 0.14, 0xb6a0a2);
            strip(x + dx, 0.61, -24.6, 0.07, 0.12, 0.07, 0xffd4a6);
          }
        }
        for (const x of [-24.4, 24.4])
          for (let z = -15; z < 21; z += 6) {
            block(x, 0.8, z, 0.65, 1.6, 0.65);
            strip(x, 1.75, z, 0.09, 0.2, 0.09);
          }
      }
      if (chapter === 5) {
        for (let i = 0; i < 7; i++) {
          const w = 5.5 - i * 0.62;
          block(0, i * 1.7 + 0.85, -28, w, 1.7, w, 0x242537);
          for (const side of [-1, 1])
            strip(
              side * (w / 2 - 0.13),
              i * 1.7 + 0.85,
              -28 + w / 2 + 0.01,
              0.055,
              1.6,
              0.035,
              accent,
            );
        }
        for (const side of [-1, 1]) {
          block(side * 6, 3.3, -25.8, 1.8, 6.6, 2.1, 0x33263b);
          block(side * 6, 7, -25.8, 0.65, 0.8, 0.7, 0x55334e);
          strip(side * 6, 3.5, -24.72, 0.08, 5.8, 0.035);
          for (let i = 0; i < 4; i++)
            block(
              side * (3.9 - i * 0.8),
              2.3 + i * 0.62,
              -25.9,
              1.6,
              0.4,
              1,
              0x342c42,
              side * 0.3,
            );
        }
        for (const x of [-24.5, 24.5])
          for (let z = -18; z < 20; z += 8) {
            block(x, 1.5, z, 0.8, 3, 0.8, 0x292739);
            strip(x, 1.6, z, 0.07, 2.4, 0.83);
          }
      }
      solids.flush();
      neon.flush();
      group.visible = chapter === 0;
    }
  }
  makeHero() {
    const g = (this.hero = new THREE.Group());
    this.scene.add(g);
    g.scale.setScalar(1.15);
    this.heroLegs = [];
    for (const side of [-1, 1]) {
      const leg = mesh(
        this.box,
        this.mats.dark,
        g,
        side * 0.19,
        0.4,
        0,
        0.23,
        0.76,
        0.28,
      );
      this.heroLegs.push(leg);
      mesh(
        this.box,
        this.mats.black,
        g,
        side * 0.19,
        0.1,
        0.13,
        0.28,
        0.21,
        0.44,
      );
    }
    mesh(this.box, this.mats.hero, g, 0, 1.04, 0, 0.72, 0.76, 0.4);
    mesh(this.box, this.mats.dark, g, 0, 1.14, 0.215, 0.42, 0.6, 0.08);
    const coat = mesh(
      new THREE.CylinderGeometry(0.32, 0.52, 0.66, 5, 1, true),
      this.mats.hero,
      g,
      0,
      0.57,
      -0.02,
    );
    coat.rotation.y = Math.PI / 5;
    mesh(this.box, this.mats.dark, g, 0, 1.66, 0, 0.49, 0.46, 0.43);
    mesh(this.box, this.mats.black, g, 0, 1.68, 0.23, 0.53, 0.2, 0.07);
    mesh(
      this.box,
      new THREE.MeshBasicMaterial({ color: MINT }),
      g,
      0,
      1.7,
      0.275,
      0.39,
      0.065,
      0.025,
    );
    mesh(this.box, this.mats.teal, g, -0.48, 1.23, 0, 0.27, 0.42, 0.39);
    mesh(this.box, this.mats.hero, g, 0.48, 1.19, 0.04, 0.25, 0.49, 0.3);
    const gun = new THREE.Group();
    gun.position.set(0.47, 1.05, 0.37);
    g.add(gun);
    mesh(this.box, this.mats.dark, gun, 0, 0, 0.25, 0.2, 0.2, 0.8);
    mesh(this.box, this.mats.teal, gun, 0, 0.03, 0.56, 0.15, 0.13, 0.22);
    mesh(
      this.box,
      new THREE.MeshBasicMaterial({ color: MINT }),
      gun,
      0,
      0,
      0.68,
      0.11,
      0.085,
      0.03,
    );
    mesh(this.box, this.mats.dark, g, 0, 1.13, -0.3, 0.43, 0.61, 0.22);
    mesh(
      this.box,
      new THREE.MeshBasicMaterial({ color: MINT }),
      g,
      0,
      1.16,
      -0.42,
      0.12,
      0.34,
      0.035,
    );
    this.heroCoat = coat;
  }
  makeBoss() {
    const g = (this.bossModel = new THREE.Group());
    g.visible = false;
    this.scene.add(g);
    mesh(this.box, this.mats.dark, g, 0, 1.5, 0, 1.65, 1.95, 1);
    mesh(this.sphere, this.mats.red, g, 0, 2, 0, 1.1, 0.86, 0.65);
    mesh(
      this.octa,
      new THREE.MeshBasicMaterial({ color: CORAL }),
      g,
      0,
      2.03,
      0.62,
      0.32,
      0.42,
      0.17,
    );
    mesh(this.box, this.mats.black, g, 0, 3.05, 0, 0.9, 0.92, 0.71);
    mesh(
      this.box,
      new THREE.MeshBasicMaterial({ color: 0xffb382 }),
      g,
      0,
      3.2,
      0.37,
      0.73,
      0.12,
      0.03,
    );
    for (const side of [-1, 1]) {
      mesh(this.box, this.mats.dark, g, side * 0.55, 0.5, 0, 0.58, 1, 0.7);
      mesh(
        this.box,
        this.mats.red,
        g,
        side * 1.14,
        1.65,
        0.1,
        0.56,
        1.68,
        0.62,
      );
      const horn = mesh(
        new THREE.ConeGeometry(0.25, 1.2, 5),
        this.mats.hero,
        g,
        side * 0.64,
        3.75,
        -0.05,
      );
      horn.rotation.z = -side * 0.46;
      mesh(this.octa, this.mats.red, g, side * 1.05, 2.66, 0, 0.49, 0.68, 0.5);
    }
    this.bossHalo = mesh(
      new THREE.TorusGeometry(1.65, 0.033, 4, 64),
      new THREE.MeshBasicMaterial({ color: CORAL }),
      g,
      0,
      2.5,
      -0.45,
    );
    this.bossHalo.rotation.z = 0.4;
  }
  makePortal() {
    const g = (this.portal = new THREE.Group());
    g.position.set(0, 0, -20);
    this.scene.add(g);
    const portalMat = new THREE.MeshBasicMaterial({ color: CORAL });
    this.portalRing = mesh(
      new THREE.TorusGeometry(3.3, 0.075, 6, 80),
      portalMat,
      g,
      0,
      3.8,
      0,
    );
    this.portalInner = mesh(
      new THREE.TorusGeometry(2.9, 0.024, 4, 64),
      new THREE.MeshBasicMaterial({ color: 0xffb092 }),
      g,
      0,
      3.8,
      -0.04,
    );
    const disk = mesh(
      new THREE.CircleGeometry(3.2, 64),
      new THREE.MeshBasicMaterial({ color: 0x200e20, side: THREE.DoubleSide }),
      g,
      0,
      3.8,
      -0.12,
    );
    disk.renderOrder = 0;
    mesh(
      new THREE.PlaneGeometry(12, 12),
      new THREE.MeshBasicMaterial({
        map: this.mats.glow.map,
        color: CORAL,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      g,
      0,
      3.8,
      0.02,
    );
    const rng = random(212);
    for (let i = 0; i < 12; i++) {
      const a = (i * TAU) / 12;
      const shard = mesh(
        this.box,
        this.mats.dark,
        g,
        Math.sin(a) * 3.9,
        3.8 + Math.cos(a) * 3.9,
        0,
        0.5,
        1,
        0.7,
      );
      shard.rotation.z = -a;
      mesh(this.box, portalMat, shard, 0, 0, 0.52, 0.28, 0.7, 0.05);
    }
    const rune = mesh(
      new THREE.TorusGeometry(4.6, 0.035, 4, 64),
      portalMat,
      g,
      0,
      0.05,
      0,
    );
    rune.rotation.x = Math.PI / 2;
  }
  makeAtmosphere() {
    const rng = random(546),
      positions = new Float32Array(180 * 3),
      colors = new Float32Array(180 * 3);
    for (let i = 0; i < 180; i++) {
      positions[i * 3] = rng() * 75 - 37.5;
      positions[i * 3 + 1] = rng() * 9 + 0.2;
      positions[i * 3 + 2] = rng() * 100 - 50;
      const c = new THREE.Color(i % 4 === 0 ? CORAL : 0x6fa4ac);
      c.toArray(colors, i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.motes = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.065,
        vertexColors: true,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.scene.add(this.motes);
    this.boltPositions = new Float32Array(7200);
    const boltsGeo = new THREE.BufferGeometry();
    boltsGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(this.boltPositions, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    boltsGeo.setDrawRange(0, 0);
    this.bolts = new THREE.LineSegments(
      boltsGeo,
      new THREE.LineBasicMaterial({
        color: 0xa4f8ff,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.bolts.frustumCulled = false;
    this.scene.add(this.bolts);
  }
  resize() {
    const width = this.canvas.clientWidth || window.innerWidth,
      height = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio || 1,
        this.quality === "low" ? 1 : this.quality === "high" ? 2 : 1.5,
      ),
    );
    this.renderer.setSize(width, height, false);
    const aspect = width / height,
      w = aspect < 0.8 ? 22 : Math.max(22, 30 * aspect),
      h = w / aspect;
    this.camera.left = -w / 2;
    this.camera.right = w / 2;
    this.camera.top = h / 2;
    this.camera.bottom = -h / 2;
    this.camera.updateProjectionMatrix();
  }
  setQuality(value) {
    this.quality = value;
    this.resize();
    this.motes.visible = value !== "low";
  }
  setReducedMotion(value) {
    this.reducedMotion = !!value;
  }
  render(state, dt = 1 / 60) {
    this.elapsed += Math.min(dt, 0.1);
    const t = this.elapsed,
      motion = this.reducedMotion ? 0 : 1,
      s = state || this.demo,
      p = s.player,
      b = this.batches;
    for (const batch of Object.values(b)) batch.clear();
    this.titleCity.visible = !state;
    if (this.lastChapter !== s.chapter || this.activeChapter === undefined) {
      this.lastChapter = s.chapter;
      this.activeChapter = s.chapter || 0;
      const chapterColor = [
        0xff586b, 0xffa47c, 0xb095e5, 0x83d5ff, 0xe8a2ce, 0xff4270,
      ][this.activeChapter];
      this.portalRing.material.color.setHex(chapterColor);
      this.portalInner.material.color.setHex(chapterColor);
      for (let i = 0; i < this.chapterScenes.length; i++)
        this.chapterScenes[i].visible = i === this.activeChapter;
      this.portal.visible = [0, 2, 5].includes(this.activeChapter);
      this.scene.fog.color.setHex(
        [0x08131b, 0x15191e, 0x121020, 0x091925, 0x171420, 0x170e1c][
          this.activeChapter
        ],
      );
      this.scene.background.copy(this.scene.fog.color);
    }
    if (!state) {
      this.demo.time = t;
      this.demo.player.angle = Math.PI / 2 + Math.sin(t * 0.2) * 0.25;
    }
    if (state && !this.hasRun) {
      this.follow.set(p.x, 0, p.y);
      this.hasRun = true;
    }
    if (!state) this.hasRun = false;
    const followRate = this.reducedMotion
      ? 1
      : 1 - Math.exp(-Math.min(dt, 0.1) * 8);
    this.follow.x += (p.x - this.follow.x) * followRate;
    this.follow.z += (p.y - this.follow.z) * followRate;
    const sway = state ? 0 : Math.sin(t * 0.14) * 0.8 * motion;
    this.camera.position.set(this.follow.x + sway, 31, this.follow.z + 30);
    this.camera.lookAt(this.follow.x, 0, this.follow.z - 1.1);
    const px = p.x || 0,
      pz = p.y || 0,
      heading = Math.PI / 2 - (p.angle || 0);
    this.hero.position.set(px, Math.sin(t * 9) * 0.018 * motion, pz);
    this.hero.rotation.y = heading;
    // Keep the survivor trackable on a small screen during invulnerability.
    this.hero.visible = true;
    this.hero.scale.setScalar(p.invincible > 0 ? 1.18 : 1.15);
    const moved = this.lastPlayer
      ? Math.hypot(px - this.lastPlayer.x, pz - this.lastPlayer.y) > 0.005
      : false;
    this.lastPlayer = { x: px, y: pz };
    for (let i = 0; i < 2; i++)
      this.heroLegs[i].rotation.x = moved
        ? Math.sin(t * 15 + i * Math.PI) * 0.35 * motion
        : 0;
    this.heroCoat.rotation.x = moved ? -0.1 : 0;
    b.shadows.add(px, 0.025, pz, 2.4, 2.4, 1, undefined, -Math.PI / 2);
    b.glow.add(px, 0.035, pz, 4, 4, 1, MINT, -Math.PI / 2);
    b.rings.add(px, 0.045, pz, 0.8, 0.8, 1, 0x69ac9b, -Math.PI / 2);
    for (const e of s.enemies || []) {
      if (e.type === "boss") continue;
      this.drawEnemy(e, t, motion, b);
    }
    const boss = (s.enemies || []).find((e) => e.type === "boss") || s.boss;
    this.bossModel.visible = !!boss;
    if (boss) {
      this.bossModel.position.set(
        boss.x,
        Math.sin(t * 3) * 0.06 * motion,
        boss.y,
      );
      this.bossModel.rotation.y = Math.PI / 2 - (boss.angle || 0);
      this.bossHalo.rotation.z = t * 0.4;
      const r = boss.radius || 1.3;
      b.shadows.add(
        boss.x,
        0.03,
        boss.y,
        r * 3.5,
        r * 3.5,
        1,
        undefined,
        -Math.PI / 2,
      );
      b.glow.add(boss.x, 0.05, boss.y, 7, 7, 1, CORAL, -Math.PI / 2);
      b.rings.add(
        boss.x,
        0.06,
        boss.y,
        r * 1.4,
        r * 1.4,
        1,
        CORAL,
        -Math.PI / 2,
      );
    }
    for (const gem of s.gems || []) {
      const sz = gem.value >= 5 ? 0.2 : 0.13,
        y = 0.22 + Math.sin(t * 3 + gem.id) * 0.07 * motion,
        col = gem.value >= 5 ? 0xf5cf83 : 0x8aefd2;
      b.gems.add(gem.x, y, gem.y, sz, sz * 1.5, sz, col, 0, t + gem.id, 0);
      if (this.quality !== "low" && b.glow.n < 350)
        b.glow.add(gem.x, 0.06, gem.y, 0.78, 0.78, 1, col, -Math.PI / 2);
    }
    for (const shot of s.projectiles || []) {
      const r = shot.radius || 0.1,
        col =
          shot.color ||
          (shot.type === "enemy"
            ? CORAL
            : shot.type === "flame"
              ? 0xffa264
              : shot.type === "frost"
                ? 0x8fdbff
                : MINT),
        ang = shot.angle || 0;
      const enemy =
        shot.hostile || /enemy|spit|boss|acid|hellfire/.test(shot.type);
      b.bullets.add(
        shot.x,
        0.75,
        shot.y,
        enemy ? r * 1.4 : r * 0.6,
        enemy ? r * 1.4 : r * 0.6,
        enemy ? r * 1.4 : Math.max(0.33, r * 3),
        col,
        0,
        Math.PI / 2 - ang,
      );
      b.glow.add(
        shot.x,
        0.72,
        shot.y,
        enemy ? 1.3 : 0.8,
        enemy ? 1.3 : 0.8,
        1,
        col,
        -Math.PI / 2,
      );
    }
    for (const o of s.objectives || []) this.drawObjective(o, t, b);
    for (const zone of s.zones || []) {
      const col =
          zone.color ||
          (zone.type === "frost"
            ? 0x8bd7ff
            : zone.type === "flame"
              ? 0xffa365
              : CORAL),
        r = zone.radius || 2;
      b.rings.add(zone.x, 0.07, zone.y, r, r, 1, col, -Math.PI / 2, 0, t * 0.2);
      b.glow.add(zone.x, 0.055, zone.y, r * 2, r * 2, 1, col, -Math.PI / 2);
      if (zone.type === "warning") {
        const q = 1 - clamp(zone.life / (zone.maxLife || 1), 0, 1);
        b.rings.add(
          zone.x,
          0.085,
          zone.y,
          r * q,
          r * q,
          1,
          0xff9e87,
          -Math.PI / 2,
        );
      }
      if (zone.type === "flame" || zone.type === "frost")
        for (let i = 0; i < 10; i++) {
          const a = i * 2.399 + zone.id,
            rr = r * (0.25 + (i % 4) * 0.17),
            flicker = 0.35 + Math.sin(t * 13 + i) * 0.2;
          b.gems.add(
            zone.x + Math.cos(a) * rr,
            flicker,
            zone.y + Math.sin(a) * rr,
            0.09,
            zone.type === "flame" ? flicker : 0.24,
            0.09,
            col,
            0,
            a,
          );
        }
    }
    let boltN = 0;
    for (const effect of s.effects || []) {
      const life = clamp(effect.life / (effect.maxLife || 1), 0, 1),
        r = effect.radius || 1,
        col =
          effect.color || (/hit|death|kill/.test(effect.type) ? CORAL : MINT),
        scale = r * (0.4 + (1 - life) * 0.9);
      if (/lightning|bolt/.test(effect.type)) {
        const fx = effect.fromX ?? effect.x,
          fz = effect.fromY ?? effect.y,
          tx = effect.toX ?? effect.x,
          tz = effect.toY ?? effect.y;
        let x = fx,
          z = fz,
          y = effect.fromX === undefined ? 8 : 1;
        for (let j = 0; j < 6 && boltN < 2398; j++) {
          const q = (j + 1) / 6,
            jitter = j === 5 ? 0 : Math.sin(j * 3 + t * 50) * 0.38,
            nx = fx + (tx - fx) * q + jitter,
            nz = fz + (tz - fz) * q - jitter,
            ny = effect.fromX === undefined ? 8 - q * 7.2 : 1;
          this.boltPositions.set([x, y, z, nx, ny, nz], boltN * 3);
          boltN += 2;
          x = nx;
          y = ny;
          z = nz;
        }
        b.glow.add(effect.x, 0.08, effect.y, 3, 3, 1, col, -Math.PI / 2);
      } else if (/hit|kill|death/.test(effect.type)) {
        for (let j = 0; j < 3; j++) {
          const a = j * 2.1 + effect.id,
            sz = 0.045 + life * 0.06;
          b.gems.add(
            effect.x + Math.cos(a) * (1 - life) * 0.75,
            0.4 + life * 0.5,
            effect.y + Math.sin(a) * (1 - life) * 0.75,
            sz,
            sz,
            sz,
            col,
          );
        }
      } else {
        b.rings.add(
          effect.x,
          0.09,
          effect.y,
          scale,
          scale,
          1,
          col,
          -Math.PI / 2,
        );
        b.glow.add(
          effect.x,
          0.08,
          effect.y,
          scale * 2.2 * life,
          scale * 2.2 * life,
          1,
          col,
          -Math.PI / 2,
        );
      }
    }
    this.bolts.geometry.setDrawRange(0, boltN);
    this.bolts.geometry.attributes.position.needsUpdate = true;
    const orbitLevel = s.weapons?.orbit || 0;
    if (orbitLevel) {
      const count = 2 + Math.floor(orbitLevel / 2) + (s.evolved?.orbit ? 2 : 0),
        r = (2 + orbitLevel * 0.1) * (1 + (s.passives?.reach || 0) * 0.15);
      for (let i = 0; i < count; i++) {
        const a = (s.time || t) * 2.3 + (i * TAU) / count,
          x = px + Math.cos(a) * r,
          z = pz + Math.sin(a) * r;
        b.bullets.add(x, 0.8, z, 0.11, 0.07, 0.5, MINT, 0, -a);
        b.glow.add(x, 0.12, z, 1.4, 1.4, 1, MINT, -Math.PI / 2);
      }
    }
    if (s.weapons?.drone) {
      for (let i = 0; i < (s.evolved?.drone ? 4 : 2); i++) {
        const a =
            (s.time || t) * 0.8 + (i * Math.PI) / (s.evolved?.drone ? 2 : 1),
          x = px + Math.cos(a) * 1.4,
          z = pz + Math.sin(a) * 1.4;
        b.body.add(x, 2.5, z, 0.45, 0.17, 0.34, 0xa1c4c2, 0, -a);
        b.eyes.add(x, 2.51, z, 0.12, 0.08, 0.4, MINT);
      }
    }
    for (const batch of Object.values(b)) batch.flush();
    this.portalRing.rotation.z = t * 0.07 * motion;
    this.portalInner.rotation.z = -t * 0.12 * motion;
    this.portal.scale.setScalar(1 + Math.sin(t * 1.1) * 0.015 * motion);
    this.motes.position.z = Math.sin(t * 0.1) * 2 * motion;
    this.motes.position.y = Math.sin(t * 0.2) * 0.4 * motion;
    this.renderer.render(this.scene, this.camera);
  }
  drawEnemy(e, t, motion, b) {
    const brute = e.type === "brute",
      runner = e.type === "runner",
      spitter = e.type === "spitter",
      scale = brute ? 1.4 : runner ? 0.85 : 1,
      col =
        e.hit > 0
          ? 0xffecd8
          : brute
            ? 0x77566a
            : spitter
              ? 0x548879
              : runner
                ? 0x6d6178
                : 0x527a7b,
      skin = e.hit > 0 ? 0xffffff : 0x94aba1,
      eye = spitter ? 0xc3ff8b : CORAL;
    const angle = Math.PI / 2 - (e.angle || 0),
      cs = Math.cos(angle),
      sn = Math.sin(angle),
      bob = Math.sin(t * (runner ? 14 : 8) + e.id) * 0.035 * motion,
      tilt = runner ? 0.2 : 0.08;
    const part = (batch, lx, y, lz, sx, sy, sz, c, rx = 0) =>
      batch.add(
        e.x + (lx * cs + lz * sn) * scale,
        y * scale + bob,
        e.y + (-lx * sn + lz * cs) * scale,
        sx * scale,
        sy * scale,
        sz * scale,
        c,
        rx,
        angle,
        0,
      );
    part(b.body, 0, 0.92, 0, 0.6, 0.65, 0.36, col, tilt);
    part(b.head, 0, 1.46, 0.09, 0.43, 0.44, 0.41, skin, 0.08);
    for (const side of [-1, 1]) {
      const step =
        Math.sin(t * (runner ? 14 : 8) + e.id + side * 1.57) * 0.24 * motion;
      part(
        b.limbs,
        side * 0.16,
        0.32,
        step * 0.3,
        0.18,
        0.58,
        0.23,
        0x263641,
        step,
      );
      part(
        b.limbs,
        side * 0.39,
        0.97,
        0.21,
        0.15,
        0.53,
        0.19,
        col,
        -0.58 + step * 0.3,
      );
      part(b.eyes, side * 0.105, 1.5, 0.302, 0.1, 0.075, 0.028, eye);
    }
    if (brute) {
      part(b.body, 0, 1.18, -0.2, 0.75, 0.3, 0.18, 0x382438);
      part(b.eyes, 0, 0.97, 0.194, 0.14, 0.31, 0.025, CORAL);
    }
    if (spitter) part(b.gems, 0, 0.99, 0.24, 0.2, 0.2, 0.2, 0xb2e381);
    b.shadows.add(
      e.x,
      0.022,
      e.y,
      1.8 * scale,
      1.8 * scale,
      1,
      undefined,
      -Math.PI / 2,
    );
  }
  drawObjective(o, t, b) {
    const r = o.radius || 2,
      col = o.done
        ? MINT
        : o.type === "rescue"
          ? 0xffd08a
          : o.type === "seal"
            ? CORAL
            : MINT,
      progress = clamp(o.progress || 0, 0, 1);
    b.rings.add(o.x, 0.06, o.y, r, r, 1, o.done ? 0x386a59 : col, -Math.PI / 2);
    b.rings.add(
      o.x,
      0.065,
      o.y,
      r * 0.77,
      r * 0.77,
      1,
      o.done ? 0x386a59 : col,
      -Math.PI / 2,
      0,
      t * 0.15,
    );
    b.glow.add(o.x, 0.055, o.y, r * 2.7, r * 2.7, 1, col, -Math.PI / 2);
    const segments = 32;
    for (let i = 0; i < segments; i++) {
      const a = (i * TAU) / segments;
      const active = i / segments < progress;
      b.eyes.add(
        o.x + Math.cos(a) * r * 1.08,
        0.075,
        o.y + Math.sin(a) * r * 1.08,
        active ? 0.22 : 0.09,
        0.025,
        0.065,
        active ? MINT : 0x344b55,
        0,
        -a,
      );
    }
    if (o.done) {
      b.gems.add(o.x, 0.45, o.y, 0.16, 0.24, 0.16, MINT, 0, t * 0.3);
      return;
    }
    if (o.type === "rescue") {
      b.body.add(o.x, 0.66, o.y, 0.4, 0.7, 0.3, 0x9c8d68);
      b.head.add(o.x, 1.23, o.y, 0.34, 0.35, 0.33, 0xe2c8a2);
      b.eyes.add(o.x, 1.9 + Math.sin(t * 3) * 0.07, o.y, 0.07, 0.4, 0.07, col);
      b.eyes.add(o.x, 1.9 + Math.sin(t * 3) * 0.07, o.y, 0.3, 0.07, 0.07, col);
    } else {
      b.body.add(o.x, 0.3, o.y, 0.6, 0.6, 0.6, 0x283b50, 0, Math.PI / 4);
      b.gems.add(
        o.x,
        1.02 + Math.sin(t * 2) * 0.12,
        o.y,
        0.26,
        0.51,
        0.26,
        col,
        0,
        t * 0.5,
      );
      b.glow.add(o.x, 1.15, o.y, 2.4, 2.4, 1, col, 0);
    }
  }
  stats() {
    return {
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      pixelRatio: this.renderer.getPixelRatio(),
    };
  }
  dispose() {
    const geometries = new Set(),
      materials = new Set(),
      textures = new Set();
    this.scene.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      if (o.material)
        for (const m of Array.isArray(o.material) ? o.material : [o.material])
          materials.add(m);
    });
    for (const m of materials) {
      for (const value of Object.values(m))
        if (value?.isTexture) textures.add(value);
      m.dispose();
    }
    for (const t of textures) t.dispose();
    for (const g of geometries) g.dispose();
    this.renderer.dispose();
  }
}
