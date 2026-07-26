// A turntable of your actual car for the garage. Its own tiny renderer, so it
// can sit inside a scrolling DOM screen without fighting the race for the
// main canvas.

import * as THREE from 'three';
import { buildCar } from './carfactory.js';
import { LIVERY } from './config.js';
import { profile } from './save.js';

let renderer = null;
let scene = null;
let camera = null;
let car = null;
let raf = 0;
let host = null;
let angle = 0.7;

export function mountPreview(node) {
  if (!node) return;
  host = node;
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(37, 2, 0.1, 100);

    scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x2a2b30, 1.15));
    const key = new THREE.DirectionalLight(0xfff2dc, 2.1);
    key.position.set(4, 6, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xff8a4a, 1.5);
    rim.position.set(-5, 2.5, -4);
    scene.add(rim);

    // A dark disc so the car is standing on something.
    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(4.6, 40),
      new THREE.MeshBasicMaterial({ color: 0x11151c })
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = -0.02;
    scene.add(pad);
  }
  node.appendChild(renderer.domElement);
  renderer.domElement.style.cssText = 'width:100%;height:100%;display:block';
  rebuild();
  resize();
  if (!raf) tick();
}

export function unmountPreview() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  if (renderer && renderer.domElement.parentNode) {
    renderer.domElement.parentNode.removeChild(renderer.domElement);
  }
  host = null;
}

export function rebuild() {
  if (!scene) return;
  if (car) {
    scene.remove(car);
    car.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material.__owned) o.material.dispose();
    });
  }
  const liv = LIVERY[profile.livery % LIVERY.length];
  car = buildCar({ style: 'muscle', body: liv.body, trim: liv.trim, partHp: 1 });
  scene.add(car);
}

function resize() {
  if (!renderer || !host) return;
  const w = host.clientWidth || 320;
  const h = host.clientHeight || 160;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}

function tick() {
  raf = requestAnimationFrame(tick);
  if (!host || !host.isConnected) { unmountPreview(); return; }
  resize();
  angle += 0.006;
  const r = 7.3;
  camera.position.set(Math.cos(angle) * r, 2.35, Math.sin(angle) * r);
  camera.lookAt(0, 0.78, 0);
  renderer.render(scene, camera);
}
