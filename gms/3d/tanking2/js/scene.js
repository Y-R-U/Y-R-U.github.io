import * as THREE from "../vendor/three.module.js";
import { makeFishGeometry, makeFishMaterial, FISH_SCALE } from "./fish.js";
import { AquariumPost } from "./post.js";

const clamp = THREE.MathUtils.clamp,
  mix = THREE.MathUtils.lerp;
const TAU = Math.PI * 2;
function random(seed = 39491) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const dummy = new THREE.Object3D(),
  temp = new THREE.Vector3();
const color = new THREE.Color();
const causticGLSL = `
 float caustic(vec2 p,float t){
   vec2 q=p*2.8+vec2(sin(p.y*1.5+t*.36),cos(p.x*1.7-t*.29))*.7;
   float a=abs(sin(q.x+sin(q.y+t*.3))*cos(q.y-sin(q.x-t*.21)));
   float b=abs(sin(q.x*1.21+t*.15)*cos(q.y*1.31-t*.18));
   return pow(1.0-min(a,b),19.0);
 }`;

function terrainHeight(x, z) {
  const path = Math.sin(z * 0.62) * 1.1 + 0.28;
  const bank = 1 - Math.exp(-Math.pow(Math.abs(x - path) / 1.25, 2));
  return (
    0.045 +
    bank * (0.27 + 0.55 * (z < 0 ? Math.min(1, -z / 2.3) : 0.05)) +
    0.027 * Math.sin(x * 2.7 + z * 3.1) * bank
  );
}

function leafGeometry(type = "leaf") {
  const p = [],
    uv = [],
    idx = [],
    segments = 10;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const width =
      type === "grass"
        ? 0.055 * Math.sin(t * Math.PI) ** 0.65
        : 0.135 * Math.sin(t * Math.PI) ** 0.75;
    const curve =
      type === "grass" ? t * t * 0.25 : Math.sin(t * Math.PI) * 0.058;
    for (let j = -1; j <= 1; j++) {
      p.push(
        j * width,
        t * (type === "grass" ? 1 : 0.55),
        curve - Math.abs(j) * 0.022 * Math.sin(t * Math.PI),
      );
      uv.push((j + 1) / 2, t);
    }
    if (i < segments)
      for (let j = 0; j < 2; j++) {
        const a = i * 3 + j;
        idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function plantMaterial(time, grass = false) {
  const m = new THREE.MeshStandardMaterial({
    color: "#f7ffe2",
    roughness: 0.72,
    metalness: 0.01,
    side: THREE.DoubleSide,
  });
  m.onBeforeCompile = (s) => {
    s.uniforms.uTime = time;
    s.vertexShader = s.vertexShader.replace(
      "#include <common>",
      "#include <common>\nuniform float uTime; varying vec2 vLeafUV; varying vec3 vPlantWorld;",
    );
    s.vertexShader = s.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vLeafUV=uv;
      vec4 anchor=instanceMatrix*vec4(0.,0.,0.,1.);
      transformed.x+=sin(uTime*.75+anchor.x*1.5+anchor.z+position.y*2.)*uv.y*uv.y*${grass ? ".10" : ".055"};
      transformed.z+=sin(uTime*.6+anchor.z*1.8+anchor.x)*uv.y*uv.y*.035;
      vPlantWorld=(modelMatrix*instanceMatrix*vec4(transformed,1.)).xyz;`,
    );
    s.fragmentShader = s.fragmentShader.replace(
      "#include <common>",
      `#include <common>
      varying vec2 vLeafUV; varying vec3 vPlantWorld; uniform float uTime; ${causticGLSL}`,
    );
    s.fragmentShader = s.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      float mid=1.-smoothstep(.008,.028,abs(vLeafUV.x-.5));
      float veins=pow(max(0.,cos((vLeafUV.y+abs(vLeafUV.x-.5)*.53)*80.)),16.)*.085;
      diffuseColor.rgb*=.84+vLeafUV.y*.22+mid*.13+veins;
      diffuseColor.rgb+=vec3(.07,.10,.04)*caustic(vPlantWorld.xz,uTime)*.6;`,
    );
  };
  m.customProgramCacheKey = () => `plant-${grass}`;
  return m;
}

export class AquariumScene {
  constructor(canvas, { onFish = () => {}, onReady = () => {} } = {}) {
    this.canvas = canvas;
    this.onFish = onFish;
    this.time = { value: 0 };
    this.elapsed = 0;
    this.motionTime = 0;
    this.tank = null;
    this.tankId = null;
    this.fishMeshes = new Map();
    this.animals = new Map();
    this.followed = null;
    this.night = false;
    this.nightOverride = null;
    this.photo = false;
    this.particleBursts = [];
    this.rng = random();
    this.metrics = { drawCalls: 0, triangles: 0, fish: 0 };
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#30332e");
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 90);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    });
    this.basePixelRatio = Math.min(
      devicePixelRatio,
      innerWidth < 900 ? 1.4 : 1.6,
    );
    this.qualityScale = 1;
    this.qualityMode = "auto";
    this.qualityClock = 0;
    this.qualityFrames = 0;
    this.lastQualityChange = 0;
    this.renderer.setPixelRatio(this.basePixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.add(new THREE.HemisphereLight("#cde3d6", "#44372a", 0.65));
    this.sun = new THREE.DirectionalLight("#fff0d1", 1.05);
    this.sun.position.set(-8, 12, 7);
    this.scene.add(this.sun);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, {
      left: -8,
      right: 8,
      top: 8,
      bottom: -8,
      near: 0.5,
      far: 32,
    });
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.035;
    // Hardscape shadows are cached; the very small shader leaf motion does not
    // justify redrawing thousands of leaves into a 2048px map every frame.
    this.sun.shadow.autoUpdate = false;
    this.sun.shadow.needsUpdate = true;
    this.fill = new THREE.DirectionalLight("#a6e6e0", 0.65);
    this.fill.position.set(6, 6, -4);
    this.scene.add(this.fill);
    this.lampLight = new THREE.SpotLight("#e4ffd7", 150, 20, 0.8, 0.8, 1.6);
    this.lampLight.position.set(0, 6.4, 0.2);
    this.lampLight.target.position.set(0, 0, 0);
    this.scene.add(this.lampLight, this.lampLight.target);
    this.plantMeshes = [];
    this.branchMeshes = [];
    this.environment();
    this.room();
    this.aquarium();
    this.landscape();
    this.plants();
    this.reefGarden();
    this.atmosphere();
    this.angle = 0.36;
    this.elevation = 0.18;
    this.zoom = 1;
    this.focus = new THREE.Vector3(0, 1.5, 0);
    this.desiredFocus = this.focus.clone();
    this.post = new AquariumPost(this.renderer, this.camera);
    this.bind();
    this.resize();
    onReady();
  }

  environment() {
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color("#343c35");
    const panel = (x, y, z, w, h, c, intensity = 1) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(c).multiplyScalar(intensity),
          side: THREE.DoubleSide,
        }),
      );
      m.position.set(x, y, z);
      envScene.add(m);
      return m;
    };
    panel(0, 6, -3, 12, 3, "#fff4cf", 1.1);
    panel(-7, 2, 1, 4, 8, "#ffffff", 1.1).rotation.y = Math.PI / 2;
    panel(3, 2, 8, 5, 5, "#849c90", 0.6);
    const gen = new THREE.PMREMGenerator(this.renderer);
    this.environmentMap = gen.fromScene(envScene, 0.05).texture;
    this.scene.environment = this.environmentMap;
    gen.dispose();
    envScene.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) o.material.dispose();
    });
  }

  mesh(geometry, material, position = [0, 0, 0], parent = this.scene) {
    const o = new THREE.Mesh(geometry, material);
    o.position.set(...position);
    parent.add(o);
    return o;
  }
  box(w, h, d, material, position, parent) {
    return this.mesh(
      new THREE.BoxGeometry(w, h, d),
      material,
      position,
      parent,
    );
  }

  room() {
    const wall = new THREE.MeshStandardMaterial({
      color: "#25332f",
      roughness: 0.94,
    });
    this.mesh(new THREE.PlaneGeometry(70, 30), wall, [0, 9, -6.5]);
    const floor = this.mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshStandardMaterial({ color: "#30372f", roughness: 0.66 }),
      [0, -1.75, 0],
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    const trim = new THREE.MeshStandardMaterial({
      color: "#242b24",
      roughness: 0.72,
    });
    this.box(70, 0.16, 0.14, trim, [0, -1.66, -6.4]);
    // Tall architectural window: actual geometry gives the glass something to reflect.
    const windowGroup = new THREE.Group();
    windowGroup.position.set(-23.5, 3.7, -6.25);
    this.scene.add(windowGroup);
    const lit = new THREE.MeshBasicMaterial({
      color: "#b9bea4",
      toneMapped: false,
    });
    this.box(3.5, 9, 0.06, lit, [0, 0, 0], windowGroup);
    for (const x of [-1.8, 0, 1.8])
      this.box(0.06, 9.3, 0.08, trim, [x, 0, 0.05], windowGroup);
    for (const y of [-4.6, -1.6, 1.5, 4.6])
      this.box(3.7, 0.06, 0.08, trim, [0, y, 0.05], windowGroup);
    const wood = new THREE.MeshStandardMaterial({
      color: "#514238",
      roughness: 0.48,
      metalness: 0.025,
    });
    wood.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vWood;")
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvWood=position;",
        );
      s.fragmentShader = s.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vWood;")
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
        float grain=sin(vWood.x*97.+sin(vWood.y*2.+vWood.z*5.)*1.3);
        float fine=sin(vWood.x*380.+sin(vWood.y*13.)*.5);
        diffuseColor.rgb*=.89+grain*.07+fine*.025;`,
        );
    };
    const stand = this.box(10.35, 1.48, 5.28, wood, [0, -0.89, 0]);
    stand.castShadow = true;
    stand.receiveShadow = true;
    this.box(
      10.1,
      0.17,
      5.12,
      new THREE.MeshStandardMaterial({ color: "#232923", roughness: 0.7 }),
      [0, -1.68, 0],
    );
    this.box(
      10.3,
      0.07,
      5.22,
      new THREE.MeshStandardMaterial({ color: "#211f1a", roughness: 0.5 }),
      [0, -0.125, 0],
    );
    const seamMat = new THREE.MeshBasicMaterial({ color: "#353126" });
    for (const x of [-2.58, 0, 2.58])
      this.box(0.018, 1.38, 0.008, seamMat, [x, -0.9, 2.646]);
    const plate = this.box(
      0.85,
      0.2,
      0.014,
      new THREE.MeshStandardMaterial({
        color: "#b5a685",
        metalness: 0.68,
        roughness: 0.3,
      }),
      [3.6, -0.5, 2.651],
    );
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const c = canvas.getContext("2d");
    c.fillStyle = "#b5a685";
    c.fillRect(0, 0, 512, 128);
    c.fillStyle = "#443e2d";
    c.font = "24px serif";
    c.textAlign = "center";
    c.fillText("T A N K I N G   /   I I", 256, 78);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    plate.material = new THREE.MeshStandardMaterial({
      map: tex,
      metalness: 0.28,
      roughness: 0.55,
    });
  }

  aquarium() {
    const glass = new THREE.MeshPhysicalMaterial({
      color: "#b5ece4",
      metalness: 0.1,
      roughness: 0.065,
      transparent: true,
      opacity: 0.055,
      side: THREE.DoubleSide,
      depthWrite: false,
      envMapIntensity: 0.6,
    });
    this.water = new THREE.Group();
    this.scene.add(this.water);
    this.mesh(
      new THREE.PlaneGeometry(10, 4.95),
      glass,
      [0, 2.475, 2.5],
      this.water,
    );
    this.mesh(
      new THREE.PlaneGeometry(10, 4.95),
      glass.clone(),
      [0, 2.475, -2.5],
      this.water,
    );
    for (const x of [-5, 5]) {
      const side = this.mesh(
        new THREE.PlaneGeometry(5, 4.95),
        glass.clone(),
        [x, 2.475, 0],
        this.water,
      );
      side.rotation.y = Math.PI / 2;
      side.material.opacity = 0.09;
    }
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(10.02, 4.97, 5.02)),
      new THREE.LineBasicMaterial({
        color: "#b2ddd2",
        transparent: true,
        opacity: 0.22,
      }),
    );
    edges.position.y = 2.48;
    this.water.add(edges);
    const rim = new THREE.MeshPhysicalMaterial({
      color: "#c2f1df",
      roughness: 0.1,
      metalness: 0.25,
      transparent: true,
      opacity: 0.27,
    });
    for (const z of [-2.5, 2.5])
      this.box(10.06, 0.037, 0.065, rim, [0, 4.965, z], this.water);
    for (const x of [-5, 5])
      this.box(0.065, 0.037, 5.06, rim, [x, 4.965, 0], this.water);
    const waterBackMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTint: { value: new THREE.Color("#185f68") },
        uAlgae: { value: 0 },
      },
      vertexShader:
        "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader:
        "varying vec2 vUv;uniform vec3 uTint;uniform float uAlgae;void main(){gl_FragColor=vec4(mix(uTint,vec3(.3,.38,.16),uAlgae),.30+(1.-vUv.y)*.09);}",
    });
    this.waterBackMat = waterBackMat;
    this.mesh(
      new THREE.PlaneGeometry(9.96, 4.75),
      waterBackMat,
      [0, 2.42, -2.49],
      this.water,
    );
    const surfaceMat = new THREE.MeshPhysicalMaterial({
      color: "#a6d8c1",
      roughness: 0.055,
      metalness: 0.4,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
      envMapIntensity: 0.8,
    });
    surfaceMat.onBeforeCompile = (s) => {
      s.uniforms.uTime = this.time;
      s.vertexShader = s.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uTime;")
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\ntransformed.z+=sin(position.x*5.+uTime*.8)*sin(position.y*4.+uTime*.6)*.007;",
        );
    };
    this.surface = this.mesh(
      new THREE.PlaneGeometry(9.96, 4.96, 50, 26),
      surfaceMat,
      [0, 4.75, 0],
      this.water,
    );
    this.surface.rotation.x = -Math.PI / 2;
    // A very slim suspended light and its two cable drops.
    const lamp = new THREE.Group();
    lamp.position.set(0, 6.05, 0);
    this.scene.add(lamp);
    const lampBody = new THREE.MeshStandardMaterial({
      color: "#292e29",
      metalness: 0.7,
      roughness: 0.23,
    });
    this.box(8.1, 0.095, 0.46, lampBody, [0, 0, 0], lamp);
    this.box(
      7.86,
      0.022,
      0.36,
      new THREE.MeshBasicMaterial({ color: "#f1ffde", toneMapped: false }),
      [0, -0.054, 0],
      lamp,
    );
    for (const x of [-3.05, 3.05])
      this.box(0.013, 8, 0.013, lampBody, [x, 4, 0], lamp);
  }

  landscape() {
    const geo = new THREE.PlaneGeometry(9.94, 4.94, 120, 64);
    geo.rotateX(-Math.PI / 2);
    const positions = geo.attributes.position,
      colors = [];
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i),
        z = positions.getZ(i),
        y = terrainHeight(x, z);
      positions.setY(i, y);
      const center = Math.sin(z * 0.62) * 1.1 + 0.28,
        width = 0.58 + (z + 2.5) * 0.2;
      const planted = clamp((Math.abs(x - center) - width) * 2, 0, 1);
      color.set("#d6c5a5").lerp(new THREE.Color("#494c33"), planted);
      color.multiplyScalar(0.94 + this.rng() * 0.14);
      colors.push(color.r, color.g, color.b);
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const sand = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.91,
    });
    sand.onBeforeCompile = (s) => {
      s.uniforms.uTime = this.time;
      s.vertexShader = s.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vSand;")
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvSand=position;",
        );
      s.fragmentShader = s.fragmentShader.replace(
        "#include <common>",
        `#include <common>\nvarying vec3 vSand;uniform float uTime;${causticGLSL}`,
      );
      s.fragmentShader = s.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float grain=fract(sin(dot(floor(vSand.xz*240.),vec2(127.1,311.7)))*43758.5453);
        diffuseColor.rgb*=.90+grain*.18;
        diffuseColor.rgb+=vec3(.10,.13,.08)*caustic(vSand.xz,uTime);`,
      );
    };
    const bed = this.mesh(geo, sand);
    bed.receiveShadow = true;
    this.sand = bed;
    this.sandColors = colors.slice();
    // The visible substrate layers ground the aquarium rather than making a floating diorama.
    const soil = new THREE.MeshStandardMaterial({
      color: "#514838",
      roughness: 1,
    });
    this.box(9.96, 0.1, 4.97, soil, [0, -0.015, 0]);
    const rockMat = new THREE.MeshStandardMaterial({
      color: "#68705b",
      roughness: 0.94,
    });
    this.rockMaterial = rockMat;
    rockMat.onBeforeCompile = (s) => {
      s.uniforms.uTime = this.time;
      s.vertexShader = s.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vRock;")
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvRock=(modelMatrix*vec4(position,1.)).xyz;",
        );
      s.fragmentShader = s.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>\nvarying vec3 vRock;uniform float uTime;${causticGLSL}`,
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
        float seam=pow(abs(sin(vRock.y*30.+vRock.x*8.+sin(vRock.z*8.)*.7)),10.);
        diffuseColor.rgb*=.75+seam*.26;diffuseColor.rgb+=vec3(.045,.06,.035)*caustic(vRock.xz,uTime);`,
        );
    };
    const rockPositions = [
      [-2.85, 0.0, -0.6, 1.05, 0.85, 0.76],
      [-1.65, 0, -1.65, 0.72, 0.66, 0.5],
      [-3.9, 0, -1.58, 0.8, 1.1, 0.65],
      [2.6, 0, -0.76, 0.75, 0.55, 0.55],
      [3.62, 0, -1.6, 1.02, 0.92, 0.7],
      [2.0, 0, 1.15, 0.45, 0.28, 0.34],
      [-1.35, 0, 1.35, 0.34, 0.25, 0.24],
    ];
    for (const [x, _, z, sx, sy, sz] of rockPositions) {
      const g = new THREE.SphereGeometry(1, 26, 18),
        a = g.attributes.position;
      for (let i = 0; i < a.count; i++) {
        temp.fromBufferAttribute(a, i);
        temp.multiplyScalar(
          0.9 + 0.1 * Math.sin(temp.x * 8 + temp.y * 6) * Math.cos(temp.z * 7),
        );
        a.setXYZ(i, temp.x, temp.y, temp.z);
      }
      g.computeVertexNormals();
      const rock = this.mesh(g, rockMat, [
        x,
        terrainHeight(x, z) + sy * 0.45,
        z,
      ]);
      rock.scale.set(sx, sy, sz);
      rock.rotation.set(0.15, this.rng() * 3, 0.15);
      rock.castShadow = true;
      rock.receiveShadow = true;
    }
    const pebble = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ color: "#bdb79b", roughness: 0.95 }),
      450,
    );
    for (let i = 0; i < 450; i++) {
      const x = (this.rng() - 0.5) * 9.8,
        z = (this.rng() - 0.5) * 4.7,
        s = 0.013 + this.rng() * 0.036;
      dummy.position.set(x, terrainHeight(x, z) + s * 0.23, z);
      dummy.rotation.set(this.rng() * 3, this.rng() * 3, this.rng() * 3);
      dummy.scale.set(s, s * 0.5, s * 0.8);
      dummy.updateMatrix();
      pebble.setMatrixAt(i, dummy.matrix);
      pebble.setColorAt(
        i,
        color.setHSL(0.1 + this.rng() * 0.05, 0.14, 0.32 + this.rng() * 0.23),
      );
    }
    pebble.receiveShadow = true;
    this.scene.add(pebble);
    this.driftwood();
  }

  driftwood() {
    const mat = new THREE.MeshStandardMaterial({
      color: "#65533b",
      roughness: 0.88,
    });
    mat.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec2 vBark;")
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvBark=uv;",
        );
      s.fragmentShader = s.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec2 vBark;")
        .replace(
          "#include <color_fragment>",
          "#include <color_fragment>\nfloat lines=sin(vBark.y*75.+sin(vBark.x*18.)*.8);diffuseColor.rgb*=.83+lines*.10+sin(vBark.y*250.)*.03;",
        );
    };
    const branches = [
      [
        [-3, 0.65, -0.8],
        [-2.7, 1.1, -0.7],
        [-2.4, 1.8, -0.8],
        [-2.15, 2.6, -0.95],
        [-1.9, 3.4, -1.2],
      ],
      [
        [-2.7, 0.8, -0.7],
        [-1.8, 1.0, -0.8],
        [-0.9, 1.65, -1.35],
        [0.1, 2.5, -1.7],
        [0.75, 2.9, -1.65],
      ],
      [
        [-2.4, 1.7, -0.8],
        [-3, 2.3, -1.0],
        [-3.4, 3.1, -0.9],
        [-3.45, 3.8, -1.3],
      ],
      [
        [-1.8, 1.12, -0.8],
        [-1.1, 1.55, -0.25],
        [-0.4, 2.15, -0.45],
        [0.3, 2.23, -0.7],
      ],
      [
        [-2.15, 2.6, -0.95],
        [-1.5, 2.9, -0.6],
        [-1.2, 3.6, -0.7],
      ],
      [
        [-3, 0.62, -0.8],
        [-3.4, 0.5, -0.15],
        [-3.8, 0.35, 0.5],
        [-4.3, 0.3, 0.8],
      ],
      [
        [-3, 0.62, -0.8],
        [-2.7, 0.35, 0.0],
        [-2.0, 0.23, 0.5],
        [-1.45, 0.18, 0.75],
      ],
      [
        [-3.2, 0.7, -1.2],
        [-3.9, 1.4, -1.45],
        [-4.3, 2.2, -1.5],
        [-4.55, 2.5, -1.8],
      ],
      [
        [3.6, 0.7, -1.3],
        [3.0, 1.0, -1.0],
        [2.8, 1.8, -1.2],
        [3.1, 2.5, -1.6],
      ],
      [
        [3.0, 1, -1.0],
        [2.2, 1.3, -1.1],
        [1.8, 1.8, -1.7],
        [1.25, 2.0, -2.0],
      ],
    ];
    branches.forEach((points, k) => {
      const curve = new THREE.CatmullRomCurve3(
        points.map((p) => new THREE.Vector3(...p)),
      );
      const g = new THREE.TubeGeometry(
          curve,
          32,
          k === 0 ? 0.19 : k === 1 ? 0.15 : k < 4 ? 0.1 : 0.065,
          7,
          false,
        ),
        a = g.attributes.position;
      const centers = curve.getPoints(32);
      for (let i = 0; i < a.count; i++) {
        const segment = Math.floor(i / 8),
          center = centers[Math.min(segment, 32)],
          t = segment / 32;
        temp
          .fromBufferAttribute(a, i)
          .sub(center)
          .multiplyScalar(1 - t * 0.86)
          .add(center);
        a.setXYZ(i, temp.x, temp.y, temp.z);
      }
      g.computeVertexNormals();
      const branch = this.mesh(g, mat);
      branch.castShadow = true;
      branch.receiveShadow = true;
      this.branchMeshes.push(branch);
      // Splitting tips give the wood fine root structure without dense fat tubes.
      if (k < 5)
        for (let j = 0; j < 2; j++) {
          const t = 0.55 + j * 0.2,
            p = curve.getPoint(t);
          const tip = p
            .clone()
            .add(
              new THREE.Vector3(0.4 * (k % 2 ? 1 : -1), 0.45 + j * 0.17, 0.23),
            );
          const twig = this.mesh(
            new THREE.TubeGeometry(
              new THREE.CatmullRomCurve3([
                p,
                p
                  .clone()
                  .lerp(tip, 0.55)
                  .add(new THREE.Vector3(0.08, 0, 0.08)),
                tip,
              ]),
              8,
              0.022,
              4,
            ),
            mat,
          );
          twig.castShadow = true;
          this.branchMeshes.push(twig);
        }
    });
  }

  plants() {
    const leaves = [],
      grass = [],
      stems = [];
    const addPlant = (x, z, height, hue = 0.25) => {
      const y = terrainHeight(x, z),
        phase = this.rng() * TAU;
      const leanX = (this.rng() - 0.5) * 0.3,
        leanZ = (this.rng() - 0.5) * 0.2;
      stems.push({
        x: x + leanX * 0.5,
        y: y + height * 0.5,
        z: z + leanZ * 0.5,
        h: height,
        leanX,
        leanZ,
      });
      const tiers = Math.floor(height / 0.2);
      for (let i = 1; i <= tiers; i++)
        for (let j = 0; j < 2; j++) {
          const t = i / tiers,
            a = phase + i * 2.38 + j * Math.PI;
          leaves.push({
            x: x + leanX * t,
            y: y + height * t,
            z: z + leanZ * t,
            ry: a,
            rz: (j ? 1 : -1) * (0.72 + this.rng() * 0.5),
            rx: 0,
            s: (0.52 + this.rng() * 0.35) * (1 - t * 0.35),
            hue,
            light: 0.16 + this.rng() * 0.13,
          });
        }
    };
    // Layered stem plants: tiny individual leaves rather than wide ribbons.
    for (let i = 0; i < 185; i++) {
      const side = this.rng() < 0.56 ? -1 : 1,
        x = side * (1.3 + this.rng() * 3.45),
        z = -2.25 + this.rng() * 2.35;
      if (Math.abs(x - (Math.sin(z * 0.62) * 1.1 + 0.28)) < 1.0) continue;
      const height = Math.max(
        0.35,
        0.45 +
          this.rng() * 0.85 +
          (z < -0.9 ? 1.3 : 0) +
          (side === -1 ? 0.38 : -0.7),
      );
      addPlant(
        x,
        z,
        Math.min(3.8 - terrainHeight(x, z), height),
        side === -1 ? 0.29 : x > 3.3 && z < -1 ? 0.085 : 0.27,
      );
    }
    // Broad, low Anubias attached to stone and root, and front crypt rosettes.
    for (let i = 0; i < 65; i++) {
      const side = i % 2 ? -1 : 1,
        x = side * (1.6 + this.rng() * 2.9),
        z = 0.15 + this.rng() * 1.98;
      for (let j = 0; j < 7; j++) {
        const a = (j / 7) * TAU + this.rng() * 0.3;
        leaves.push({
          x,
          y: terrainHeight(x, z) + 0.05,
          z,
          ry: a,
          rz: 0.75 + this.rng() * 0.65,
          rx: 0,
          s: 0.48 + this.rng() * 0.45,
          hue: 0.29 + this.rng() * 0.025,
          light: 0.13 + this.rng() * 0.08,
        });
      }
    }
    for (let i = 0; i < 680; i++) {
      const side = this.rng() < 0.57 ? -1 : 1,
        x = side * (1.6 + this.rng() * 3.2),
        z = (this.rng() - 0.5) * 4.65;
      if (Math.abs(x - (Math.sin(z * 0.62) * 1.1 + 0.28)) < 1.0) continue;
      grass.push({
        x,
        y: terrainHeight(x, z),
        z,
        ry: this.rng() * TAU,
        s: 0.25 + this.rng() * 0.55 + (z < -0.8 ? 0.65 : 0),
        hue: 0.22 + this.rng() * 0.06,
      });
    }
    const lm = new THREE.InstancedMesh(
      leafGeometry(),
      plantMaterial(this.time),
      leaves.length,
    );
    leaves.forEach((l, i) => {
      dummy.position.set(l.x, l.y, l.z);
      dummy.rotation.set(l.rx, l.ry, l.rz);
      dummy.scale.setScalar(l.s);
      dummy.updateMatrix();
      lm.setMatrixAt(i, dummy.matrix);
      lm.setColorAt(
        i,
        color
          .setHSL(l.hue, 0.48 + this.rng() * 0.18, l.light)
          .multiplyScalar(0.45),
      );
    });
    lm.castShadow = true;
    lm.receiveShadow = true;
    this.scene.add(lm);
    this.leaves = lm;
    const gm = new THREE.InstancedMesh(
      leafGeometry("grass"),
      plantMaterial(this.time, true),
      grass.length,
    );
    grass.forEach((l, i) => {
      dummy.position.set(l.x, l.y, l.z);
      dummy.rotation.set(0, l.ry, 0);
      dummy.scale.setScalar(l.s);
      dummy.updateMatrix();
      gm.setMatrixAt(i, dummy.matrix);
      gm.setColorAt(
        i,
        color
          .setHSL(l.hue, 0.52, 0.15 + this.rng() * 0.08)
          .multiplyScalar(0.55),
      );
    });
    gm.castShadow = true;
    gm.receiveShadow = true;
    this.scene.add(gm);
    const sm = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.009, 0.012, 1, 4),
      new THREE.MeshStandardMaterial({ color: "#526645", roughness: 0.88 }),
      stems.length,
    );
    stems.forEach((s, i) => {
      dummy.position.set(s.x, s.y, s.z);
      dummy.rotation.set(s.leanZ / s.h, 0, -s.leanX / s.h);
      dummy.scale.set(1, s.h, 1);
      dummy.updateMatrix();
      sm.setMatrixAt(i, dummy.matrix);
    });
    this.scene.add(sm);
    const carpet = new THREE.InstancedMesh(
      leafGeometry(),
      plantMaterial(this.time),
      1300,
    );
    for (let i = 0; i < 1300; i++) {
      const x = (this.rng() < 0.5 ? -1 : 1) * (1.5 + this.rng() * 3.3),
        z = 0.1 + this.rng() * 2.27;
      dummy.position.set(x, terrainHeight(x, z) + 0.018, z);
      dummy.rotation.set(
        this.rng() * 0.6,
        this.rng() * TAU,
        0.7 + this.rng() * 0.5,
      );
      dummy.scale.setScalar(0.12 + this.rng() * 0.17);
      dummy.updateMatrix();
      carpet.setMatrixAt(i, dummy.matrix);
      carpet.setColorAt(
        i,
        color.setHSL(
          0.26 + this.rng() * 0.045,
          0.58,
          0.045 + this.rng() * 0.025,
        ),
      );
    }
    carpet.receiveShadow = true;
    this.scene.add(carpet);
    this.carpet = carpet;
    this.plantMeshes.push(lm, gm, sm, carpet);
  }

  reefGarden() {
    this.reef = new THREE.Group();
    this.reef.visible = false;
    this.scene.add(this.reef);
    const rng = random(99174),
      branches = [],
      caps = [],
      up = new THREE.Vector3(0, 1, 0);
    const coralColors = ["#d4b88b", "#bd8e8e", "#839eaa", "#b99871", "#b69cbd"];
    const grow = (start, dir, length, radius, depth, tone) => {
      const end = start.clone().addScaledVector(dir, length);
      branches.push({ start, end, radius, tone });
      caps.push({ p: end, r: radius * 0.8, tone });
      if (depth <= 0) return;
      for (let j = 0; j < 3; j++) {
        const az = (j / 3) * TAU + rng() * 1.5,
          v = new THREE.Vector3(
            Math.cos(az) * (0.36 + rng() * 0.25),
            0.55 + rng() * 0.25,
            Math.sin(az) * (0.36 + rng() * 0.25),
          );
        v.addScaledVector(dir, 0.35).normalize();
        grow(
          end,
          v,
          length * (0.56 + rng() * 0.16),
          radius * 0.61,
          depth - 1,
          tone,
        );
      }
    };
    for (let i = 0; i < 21; i++) {
      const side = i % 2 ? -1 : 1,
        x = side * (1.6 + rng() * 2.7),
        z = -1.9 + rng() * 2.3,
        y = terrainHeight(x, z) + 0.13;
      grow(
        new THREE.Vector3(x, y, z),
        new THREE.Vector3(
          (rng() - 0.5) * 0.35,
          1,
          (rng() - 0.5) * 0.3,
        ).normalize(),
        0.45 + rng() * 0.5,
        0.055 + rng() * 0.035,
        3,
        coralColors[i % coralColors.length],
      );
    }
    const coralMat = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      roughness: 0.77,
      metalness: 0.03,
    });
    this.coralMaterial = coralMat;
    coralMat.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vCoral;")
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvCoral=(instanceMatrix*vec4(position,1.)).xyz;",
        );
      s.fragmentShader = s.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vCoral;")
        .replace(
          "#include <color_fragment>",
          "#include <color_fragment>\nfloat polyp=sin(vCoral.x*139.)*sin(vCoral.y*156.)*sin(vCoral.z*149.);diffuseColor.rgb*=.88+polyp*.13;",
        );
    };
    const stalks = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.74, 1, 1, 7),
      coralMat,
      branches.length,
    );
    branches.forEach((b, i) => {
      const delta = b.end.clone().sub(b.start);
      dummy.position.copy(b.start).add(b.end).multiplyScalar(0.5);
      dummy.quaternion.setFromUnitVectors(up, delta.clone().normalize());
      dummy.scale.set(b.radius, delta.length(), b.radius);
      dummy.updateMatrix();
      stalks.setMatrixAt(i, dummy.matrix);
      stalks.setColorAt(i, color.set(b.tone));
    });
    stalks.castShadow = true;
    stalks.receiveShadow = true;
    this.reef.add(stalks);
    const tips = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 7, 5),
      coralMat,
      caps.length,
    );
    caps.forEach((c, i) => {
      dummy.position.copy(c.p);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(c.r);
      dummy.updateMatrix();
      tips.setMatrixAt(i, dummy.matrix);
      tips.setColorAt(
        i,
        color.set(c.tone).lerp(new THREE.Color("#fbecd7"), 0.16),
      );
    });
    this.reef.add(tips);
    const plates = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 28, 10),
      coralMat,
      18,
    );
    for (let i = 0; i < 18; i++) {
      const row = Math.floor(i / 6),
        a = (i % 6) * 1.4;
      dummy.position.set(
        3.25 + Math.cos(a) * 0.45,
        0.65 + row * 0.31,
        -0.8 + Math.sin(a) * 0.65,
      );
      dummy.rotation.set((rng() - 0.5) * 0.15, rng() * 3, (rng() - 0.5) * 0.1);
      dummy.scale.set(0.38 + rng() * 0.38, 0.055, 0.3 + rng() * 0.3);
      dummy.updateMatrix();
      plates.setMatrixAt(i, dummy.matrix);
      plates.setColorAt(i, color.set(i % 2 ? "#a59992" : "#b99a79"));
    }
    plates.castShadow = true;
    plates.receiveShadow = true;
    this.reef.add(plates);
    this.anemone = new THREE.Group();
    this.anemone.position.set(1.8, 0.47, 0.95);
    this.reef.add(this.anemone);
    const tentacleCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.06, 0.2, 0),
      new THREE.Vector3(0.08, 0.38, 0.045),
      new THREE.Vector3(0.14, 0.52, 0.055),
    ]);
    const tentacleMat = new THREE.MeshStandardMaterial({
      color: "#c29c81",
      roughness: 0.45,
      emissive: "#6e3955",
      emissiveIntensity: 0.12,
    });
    tentacleMat.onBeforeCompile = (s) => {
      s.uniforms.uTime = this.time;
      s.vertexShader = s.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uTime;")
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\ntransformed.x+=sin(uTime*.9+instanceMatrix[3].x*7.+instanceMatrix[3].z*5.)*position.y*.18;transformed.z+=cos(uTime*.8+instanceMatrix[3].z*9.)*position.y*.1;",
        );
    };
    const tentacles = new THREE.InstancedMesh(
      new THREE.TubeGeometry(tentacleCurve, 8, 0.021, 5, false),
      tentacleMat,
      130,
    );
    for (let i = 0; i < 130; i++) {
      const a = rng() * TAU,
        r = Math.sqrt(rng()) * 0.58;
      dummy.position.set(Math.cos(a) * r, -r * 0.24, Math.sin(a) * r);
      dummy.rotation.set(0, a, (rng() - 0.5) * 0.4);
      dummy.scale.setScalar(0.72 + rng() * 0.6);
      dummy.updateMatrix();
      tentacles.setMatrixAt(i, dummy.matrix);
    }
    this.anemone.add(tentacles);
    const base = this.mesh(
      new THREE.SphereGeometry(1, 24, 12),
      new THREE.MeshStandardMaterial({ color: "#857d65", roughness: 0.7 }),
      [0, -0.12, 0],
      this.anemone,
    );
    base.scale.set(0.6, 0.17, 0.6);
    const brainGeometry = new THREE.SphereGeometry(1, 36, 24),
      brainPos = brainGeometry.attributes.position;
    for (let i = 0; i < brainPos.count; i++) {
      temp.fromBufferAttribute(brainPos, i);
      temp.multiplyScalar(
        1 +
          0.035 *
            Math.sin(
              temp.x * 19 + Math.sin(temp.z * 22) * 0.8 + Math.sin(temp.y * 17),
            ),
      );
      brainPos.setXYZ(i, temp.x, temp.y, temp.z);
    }
    brainGeometry.computeVertexNormals();
    const brainMat = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      roughness: 0.78,
    });
    brainMat.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vBrain;")
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvBrain=position;",
        );
      s.fragmentShader = s.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vBrain;")
        .replace(
          "#include <color_fragment>",
          "#include <color_fragment>\nfloat fold=sin(vBrain.x*19.+sin(vBrain.z*22.)*.8+sin(vBrain.y*17.));diffuseColor.rgb*=.65+smoothstep(-.5,.6,fold)*.48;",
        );
    };
    const brains = new THREE.InstancedMesh(brainGeometry, brainMat, 11);
    for (let i = 0; i < 11; i++) {
      const side = i % 2 ? -1 : 1,
        x = side * (1.9 + rng() * 2.5),
        z = 0.2 + rng() * 1.25,
        s = 0.28 + rng() * 0.26;
      dummy.position.set(x, terrainHeight(x, z) + s * 0.43, z);
      dummy.rotation.set(0, rng() * TAU, 0);
      dummy.scale.set(s, s * 0.66, s * 0.78);
      dummy.updateMatrix();
      brains.setMatrixAt(i, dummy.matrix);
      brains.setColorAt(i, color.set(["#b7986a", "#929774", "#9c858d"][i % 3]));
    }
    brains.castShadow = true;
    brains.receiveShadow = true;
    this.reef.add(brains);
  }

  applyTheme(theme) {
    const salt = ["reef", "moon"].includes(theme);
    this.plantMeshes.forEach((m) => (m.visible = !salt));
    this.branchMeshes.forEach((m) => (m.visible = !salt));
    this.reef.visible = salt;
    const tint =
      { river: "#185f68", forest: "#164c49", reef: "#134d74", moon: "#17345e" }[
        theme
      ] || "#185f68";
    this.waterBackMat.uniforms.uTint.value.set(tint);
    this.rockMaterial.color.set(salt ? "#a8a293" : "#68705b");
    this.leaves.scale.y = theme === "forest" ? 1.09 : 1;
    const values = this.sand.geometry.attributes.color;
    for (let i = 0; i < values.count; i++) {
      if (salt) {
        color.set("#c8c6b3").multiplyScalar(0.93 + (i % 13) * 0.008);
        values.setXYZ(i, color.r, color.g, color.b);
      } else
        values.setXYZ(
          i,
          this.sandColors[i * 3],
          this.sandColors[i * 3 + 1],
          this.sandColors[i * 3 + 2],
        );
    }
    values.needsUpdate = true;
    this.lampLight.color.set(salt ? "#bedcff" : "#e4ffd7");
    this.coralMaterial.emissive.set(theme === "moon" ? "#394a68" : "#000000");
    this.coralMaterial.emissiveIntensity = theme === "moon" ? 0.22 : 0;
    this.sun.shadow.needsUpdate = true;
  }

  atmosphere() {
    const count = 270,
      p = new Float32Array(count * 3),
      seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      p[i * 3] = (this.rng() - 0.5) * 9.6;
      p[i * 3 + 1] = 0.2 + this.rng() * 4.4;
      p[i * 3 + 2] = (this.rng() - 0.5) * 4.8;
      seeds[i] = this.rng();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    g.setAttribute("seed", new THREE.BufferAttribute(seeds, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: this.time,
        uRatio: { value: this.renderer.getPixelRatio() },
      },
      vertexShader: `attribute float seed;uniform float uTime;uniform float uRatio;varying float vSeed;void main(){vSeed=seed;vec3 p=position;p.y=mod(p.y+uTime*(.035+seed*.07),4.4)+.18;p.x+=sin(uTime*.3+seed*63.)*.065;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=(seed>.9?24.:9.)*uRatio/-mv.z;}`,
      fragmentShader:
        "varying float vSeed;void main(){float d=length(gl_PointCoord-.5);float a=(1.-smoothstep(.1,.5,d))*.35;if(vSeed>.9)a=(1.-smoothstep(.03,.09,abs(d-.32)))*.22;gl_FragColor=vec4(.72,.93,.83,a);}",
    });
    this.scene.add(new THREE.Points(g, m));
    const rayMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: this.time },
      vertexShader:
        "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader:
        "varying vec2 vUv;uniform float uTime;void main(){float a=pow(max(0.,1.-abs(vUv.x-.5)*2.),3.);a*=pow(vUv.y,.5)*(.025+.007*sin(uTime*.3+vUv.x*13.));gl_FragColor=vec4(.72,.92,.69,a);}",
    });
    for (let i = 0; i < 6; i++) {
      const ray = this.mesh(
        new THREE.PlaneGeometry(0.65 + this.rng() * 0.75, 4.5),
        rayMat,
        [i * 1.45 - 3.8, 2.45, -0.8 + this.rng()],
      );
      ray.rotation.z = -0.2;
      ray.rotation.y = -0.15;
    }
    this.rayMaterial = rayMat;
    const burstGeo = new THREE.BufferGeometry();
    this.burstPositions = new Float32Array(240 * 3);
    this.burstAlpha = new Float32Array(240);
    burstGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(this.burstPositions, 3),
    );
    burstGeo.setAttribute(
      "alpha",
      new THREE.BufferAttribute(this.burstAlpha, 1),
    );
    this.burstMesh = new THREE.Points(
      burstGeo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uRatio: { value: this.renderer.getPixelRatio() } },
        vertexShader:
          "attribute float alpha;uniform float uRatio;varying float vAlpha;void main(){vAlpha=alpha;vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=55.*uRatio/-mv.z;}",
        fragmentShader:
          "varying float vAlpha;void main(){float d=length(gl_PointCoord-.5);gl_FragColor=vec4(.93,.86,.59,(1.-smoothstep(.25,.5,d))*vAlpha);}",
      }),
    );
    this.scene.add(this.burstMesh);
  }

  setTank(tank) {
    if (!tank) return;
    if (this.tankId !== tank.id) {
      this.tankId = tank.id;
      this.animals.clear();
      this.followed = null;
      this.zoom = 1;
      this.focus.set(0, 1.5, 0);
      for (const mesh of this.fishMeshes.values()) mesh.count = 0;
      this.applyTheme(tank.theme || "river");
    }
    this.tank = tank;
    this.anemone.visible = !!tank.anemone;
    this.carpet.count = Math.min(
      1300,
      Math.round(650 + (tank.plants || 0) * 140),
    );
  }

  syncFish() {
    if (!this.tank) return;
    const present = new Set();
    this.tank.fish.forEach((fish, i) => {
      present.add(fish.uid);
      if (!this.animals.has(fish.uid)) {
        const r = random(
            (Number(fish.uid) || i + 1) * 3137 + String(fish.uid).length * 127,
          ),
          bottom = ["cory", "snail", "shrimp"].includes(fish.species);
        this.animals.set(fish.uid, {
          uid: fish.uid,
          species: fish.species,
          phase: r() * TAU,
          index: i,
          position: new THREE.Vector3(
            (r() - 0.5) * 4,
            bottom ? 0.4 : 2.3 + r() * 1.5,
            0.3 + r() * 1.1,
          ),
          velocity: new THREE.Vector3(1, 0, 0),
          direction: 1,
          angle: 0,
          scale: FISH_SCALE[fish.species] || 0.5,
          bottom,
          seed: r(),
        });
      }
      this.animals.get(fish.uid).huntTime = fish.huntTime || 0;
      if (!this.fishMeshes.has(fish.species)) {
        const g = makeFishGeometry(fish.species);
        g.setAttribute(
          "swimPhase",
          new THREE.InstancedBufferAttribute(new Float32Array(40), 1),
        );
        const mesh = new THREE.InstancedMesh(
          g,
          makeFishMaterial(fish.species, { time: this.time }),
          40,
        );
        mesh.count = 0;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        mesh.userData.species = fish.species;
        this.fishMeshes.set(fish.species, mesh);
        this.scene.add(mesh);
      }
    });
    for (const uid of this.animals.keys())
      if (!present.has(uid)) this.animals.delete(uid);
  }

  updateFish(dt, state) {
    const counts = {};
    const speed = state?.speed ?? 1;
    this.motionTime += dt * speed;
    const residents = [...this.animals.values()];
    for (const a of residents) {
      const t = this.motionTime,
        school = ["neon", "rasbora", "chromis", "cardinal"].includes(a.species);
      const base = speed === 0 ? 0 : 1,
        phase = a.phase;
      // Soft, repeatable paths are visual only; gameplay simulation remains in state.js.
      let x, y, z;
      if (a.species === "betta") {
        x = Math.sin(t * 0.14 + phase) * 2.1;
        y = 2.5 + Math.sin(t * 0.2 + phase) * 0.4;
        z = 1.25 + Math.cos(t * 0.13 + phase) * 0.2;
      } else if (school) {
        const j = a.index % 6;
        x =
          Math.sin(t * 0.18 + Math.floor(a.index / 6)) * 2.5 +
          Math.sin(phase) * 0.45 +
          j * 0.16;
        y = 2.3 + Math.sin(t * 0.22) * 0.45 + Math.cos(phase) * 0.33;
        z = 0.45 + Math.sin(t * 0.15) * 0.55 + Math.sin(phase * 3) * 0.35;
      } else {
        x = Math.sin(t * (a.bottom ? 0.08 : 0.115) + phase) * 3.45;
        z = a.bottom
          ? 0.6 + Math.sin(t * 0.09 + phase) * 1.5
          : Math.cos(t * 0.085 + phase) * 1.3;
        y = a.bottom
          ? terrainHeight(x, z) + 0.2
          : 1.5 + a.seed * 1.5 + Math.sin(t * 0.19 + phase) * 0.45;
      }
      if (this.feedUntil > this.elapsed && !a.bottom) {
        x = mix(x, 0.5, 0.25);
        y = mix(y, 4.0, 0.28);
      }
      if (a.huntTime > 0) {
        const prey = residents.find(
          (p) =>
            p.uid !== a.uid &&
            (a.species === "angelfish"
              ? p.species === "neon"
              : a.species === "puffer"
                ? ["snail", "shrimp"].includes(p.species)
                : p.scale < 0.55),
        );
        if (prey) {
          const stalk = clamp(a.huntTime / 35, 0.25, 0.88);
          x = mix(x, prey.position.x - 0.5, stalk);
          y = mix(y, prey.position.y, stalk);
          z = mix(z, prey.position.z + 0.18, stalk);
        }
      }
      // A soft boid separation term keeps the documentary paths from passing
      // through one another. It changes presentation, never the care simulation.
      for (const other of residents) {
        if (other === a) continue;
        const dx = a.position.x - other.position.x,
          dy = a.position.y - other.position.y,
          dz = a.position.z - other.position.z;
        const distance = Math.hypot(dx, dy, dz),
          space = (a.scale + other.scale) * 0.46;
        if (distance < space && distance > 0.0001) {
          const push = ((space - distance) / distance) * 0.55;
          x += dx * push;
          y += dy * push;
          z += dz * push;
        }
      }
      x = clamp(x, -4.3, 4.3);
      y = clamp(y, a.bottom ? 0.18 : 1.1, 4.25);
      z = clamp(z, -1.9, 1.95);
      const old = a.position.clone();
      a.position.lerp(temp.set(x, y, z), 1 - Math.exp(-dt * base * 1.4));
      const dx = a.position.x - old.x,
        dz = a.position.z - old.z;
      if (Math.abs(dx) + Math.abs(dz) > 0.0001) {
        const target = Math.atan2(-dz, dx);
        let diff = target - a.angle;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        a.angle += diff * Math.min(1, dt * 2.2);
      }
      const i = counts[a.species] || 0;
      counts[a.species] = i + 1;
      const mesh = this.fishMeshes.get(a.species);
      dummy.position.copy(a.position);
      dummy.rotation.set(0, a.angle, Math.sin(t * 0.7 + phase) * 0.02);
      dummy.scale.setScalar(a.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.geometry.attributes.swimPhase.setX(i, phase);
      a.instanceId = i;
    }
    for (const [id, mesh] of this.fishMeshes) {
      mesh.count = counts[id] || 0;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.geometry.attributes.swimPhase.needsUpdate = true;
    }
  }

  bind() {
    this.pointer = { down: false, x: 0, y: 0, startX: 0, startY: 0, moved: 0 };
    this.pointers = new Map();
    this.listeners = [];
    const listen = (node, name, fn, opts) => {
      node.addEventListener(name, fn, opts);
      this.listeners.push(() => node.removeEventListener(name, fn, opts));
    };
    listen(this.canvas, "pointerdown", (e) => {
      if (e.button > 0) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.pointer = {
        down: true,
        x: e.clientX,
        y: e.clientY,
        startX: e.clientX,
        startY: e.clientY,
        moved: 0,
      };
      this.canvas.setPointerCapture(e.pointerId);
    });
    listen(this.canvas, "pointermove", (e) => {
      if (!this.pointer.down) return;
      const old = this.pointers.get(e.pointerId);
      if (!old) return;
      if (this.pointers.size === 2) {
        const other = [...this.pointers.entries()].find(
          ([id]) => id !== e.pointerId,
        )?.[1];
        if (other) {
          const before = Math.hypot(old.x - other.x, old.y - other.y),
            after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
          this.zoom = clamp(
            (this.zoom * before) / Math.max(after, 1),
            0.6,
            1.7,
          );
          this.pointer.moved = 30;
        }
      } else {
        const dx = e.clientX - this.pointer.x,
          dy = e.clientY - this.pointer.y;
        this.angle = clamp(this.angle - dx * 0.004, -1.18, 1.18);
        this.elevation = clamp(this.elevation + dy * 0.003, -0.01, 0.7);
        this.pointer.moved += Math.abs(dx) + Math.abs(dy);
        this.followed = null;
      }
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
    });
    const end = (e) => {
      this.pointers.delete(e.pointerId);
      if (this.pointer.down && this.pointer.moved < 8) {
        const rect = this.canvas.getBoundingClientRect();
        const ndc = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          (-(e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        const ray = new THREE.Raycaster();
        ray.setFromCamera(ndc, this.camera);
        const hits = ray.intersectObjects([...this.fishMeshes.values()], false);
        let fish =
          hits[0] &&
          [...this.animals.values()].find(
            (a) =>
              a.species === hits[0].object.userData.species &&
              a.instanceId === hits[0].instanceId,
          );
        if (!fish) {
          let nearest = 38;
          for (const a of this.animals.values()) {
            const p = a.position.clone().project(this.camera);
            const d = Math.hypot(
              (p.x - ndc.x) * rect.width * 0.5,
              (p.y - ndc.y) * rect.height * 0.5,
            );
            if (d < nearest) {
              nearest = d;
              fish = a;
            }
          }
        }
        if (fish) {
          this.follow(fish.uid);
          this.onFish(fish.uid);
        }
      }
      this.pointer.down = this.pointers.size > 0;
    };
    listen(this.canvas, "pointerup", end);
    listen(this.canvas, "pointercancel", () => {
      this.pointer.down = false;
      this.pointers.clear();
    });
    listen(
      this.canvas,
      "wheel",
      (e) => {
        e.preventDefault();
        this.zoom = clamp(this.zoom * Math.exp(e.deltaY * 0.001), 0.57, 1.7);
      },
      { passive: false },
    );
    listen(window, "resize", () => this.resize());
  }

  resize() {
    const w = this.canvas.clientWidth || innerWidth,
      h = this.canvas.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.post?.resize(
      Math.round(w * this.renderer.getPixelRatio()),
      Math.round(h * this.renderer.getPixelRatio()),
    );
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.width = w;
    this.height = h;
    // Optical centre moves into the quiet area beside the editorial guide.
    this.camera.clearViewOffset();
    if (w > 900 && !this.photo)
      this.camera.setViewOffset(w, h, -w * 0.11, -h * 0.015, w, h);
    else this.camera.setViewOffset(w, h, 0, h * 0.015, w, h);
    const halfFov = THREE.MathUtils.degToRad(18),
      usable = w > 900 && !this.photo ? 0.73 : 0.92;
    this.distance = Math.max(
      8.7 / (2 * Math.tan(halfFov)),
      12.3 / (2 * Math.tan(halfFov) * this.camera.aspect * usable),
    );
  }

  follow(uid) {
    this.followed = uid;
    if (uid) this.zoom = 0.63;
    else this.zoom = 1;
  }
  setPhoto(value) {
    this.photo = !!value;
    this.renderer.toneMappingExposure = this.photo ? 1.1 : 1;
    this.resize();
  }
  setNight(value) {
    this.night = !!value;
    this.nightOverride = value === null ? null : !!value;
  }
  setQuality(value = "auto") {
    this.qualityMode = value;
    this.qualityScale =
      value === "low" ? 0.65 : value === "balanced" ? 0.82 : 1;
    this.renderer.setPixelRatio(this.basePixelRatio * this.qualityScale);
    this.resize();
  }
  splash() {
    this.burst(false);
  }
  feed() {
    this.feedUntil = this.elapsed + 9;
    this.burst(true);
  }
  burst(food) {
    const rng = this.rng;
    for (let i = 0; i < (food ? 35 : 60); i++)
      this.particleBursts.push({
        x: (rng() - 0.5) * 0.6,
        y: 4.7,
        z: 1 + (rng() - 0.5) * 0.6,
        vx: (rng() - 0.5) * (food ? 0.1 : 2),
        vy: food ? -0.1 : 0.6 + rng(),
        vz: (rng() - 0.5) * (food ? 0.1 : 1),
        life: food ? 12 : 1.8,
        age: 0,
        food,
      });
  }

  updateBursts(dt) {
    this.burstAlpha.fill(0);
    this.particleBursts = this.particleBursts
      .filter((p) => p.age < p.life)
      .slice(-240);
    this.particleBursts.forEach((p, i) => {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (!p.food) p.vy -= dt * 1.4;
      this.burstPositions[i * 3] = p.x;
      this.burstPositions[i * 3 + 1] = p.y;
      this.burstPositions[i * 3 + 2] = p.z;
      this.burstAlpha[i] = Math.max(0, 1 - p.age / p.life) * 0.9;
    });
    this.burstMesh.geometry.attributes.position.needsUpdate = true;
    this.burstMesh.geometry.attributes.alpha.needsUpdate = true;
  }

  update(dt, gameState) {
    dt = Math.min(dt, 0.1);
    this.elapsed += dt;
    this.time.value += dt * (gameState?.speed === 0 ? 0 : 1);
    this.syncFish();
    this.updateFish(dt, gameState);
    this.updateBursts(dt);
    if (this.qualityMode === "auto" && this.elapsed > 6) {
      this.qualityClock += dt;
      this.qualityFrames++;
      if (this.qualityClock > 3) {
        const fps = this.qualityFrames / this.qualityClock;
        if (
          fps < 48 &&
          this.qualityScale > 0.66 &&
          this.elapsed - this.lastQualityChange > 6
        ) {
          this.qualityScale = Math.max(0.65, this.qualityScale * 0.86);
          this.renderer.setPixelRatio(this.basePixelRatio * this.qualityScale);
          this.resize();
          this.lastQualityChange = this.elapsed;
        }
        this.qualityClock = 0;
        this.qualityFrames = 0;
      }
    }
    const cycle = Math.cos(((gameState?.time || 0) / 720) * TAU);
    const day =
      this.nightOverride === null
        ? THREE.MathUtils.smoothstep(cycle, -0.35, 0.45)
        : this.nightOverride
          ? 0
          : 1;
    this.sun.intensity = mix(
      this.sun.intensity,
      mix(0.12, 1.05, day),
      dt * 0.8,
    );
    this.fill.intensity = mix(
      this.fill.intensity,
      mix(0.6, 0.65, day),
      dt * 0.8,
    );
    this.lampLight.intensity = mix(
      this.lampLight.intensity,
      mix(48, 150, day),
      dt * 0.8,
    );
    this.sun.color.lerp(
      color.set("#7194db").lerp(new THREE.Color("#fff0d1"), day),
      dt * 0.8,
    );
    this.fill.color.lerp(
      color.set("#5a80dd").lerp(new THREE.Color("#a6e6e0"), day),
      dt * 0.8,
    );
    this.waterBackMat.uniforms.uAlgae.value =
      clamp(this.tank?.algae || 0, 0, 1) * 0.5;
    const followed = this.animals.get(this.followed);
    this.desiredFocus.copy(followed ? followed.position : temp.set(0, 1.5, 0));
    this.focus.lerp(this.desiredFocus, 1 - Math.exp(-dt * 2));
    const dist = this.distance * this.zoom;
    const desired = temp.set(
      this.focus.x + Math.sin(this.angle) * Math.cos(this.elevation) * dist,
      this.focus.y + Math.sin(this.elevation) * dist,
      this.focus.z + Math.cos(this.angle) * Math.cos(this.elevation) * dist,
    );
    if (!this.cameraReady) {
      this.camera.position.copy(desired);
      this.cameraReady = true;
    } else this.camera.position.lerp(desired, 1 - Math.exp(-dt * 5));
    this.camera.lookAt(this.focus);
    const metrics = this.post.render(
      this.scene,
      this.photo,
      this.camera.position.distanceTo(this.focus),
    );
    this.metrics.drawCalls = metrics.drawCalls;
    this.metrics.triangles = metrics.triangles;
    this.metrics.fish = this.animals.size;
    this.metrics.pixelRatio = this.renderer.getPixelRatio();
  }

  capture() {
    const ratio = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(Math.max(ratio, this.basePixelRatio));
    this.resize();
    this.post.render(
      this.scene,
      this.photo,
      this.camera.position.distanceTo(this.focus),
    );
    const png = this.canvas.toDataURL("image/png");
    this.renderer.setPixelRatio(ratio);
    this.resize();
    return png;
  }
  dispose() {
    this.listeners.forEach((fn) => fn());
    this.scene.traverse((o) => {
      o.geometry?.dispose();
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        m?.dispose();
    });
    this.environmentMap.dispose();
    this.post.dispose();
    this.renderer.dispose();
  }
}
