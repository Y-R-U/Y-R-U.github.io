/* input.js – unified mouse/touch/keyboard input, gestures */

import { clamp } from './utils.js';

let canvas;
const callbacks = {
  pointerDown: [], pointerMove: [], pointerUp: [],
  zoom: [], pan: [], keyDown: [],
};

// Gesture state
let pointers = new Map();
let lastPinchDist = 0;
let lastPanCenter = null;
let gestureActive = false;  // true when 2+ fingers detected

export function init(canvasEl) {
  canvas = canvasEl;

  // Pointer events (unified mouse + touch)
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  // Prevent default touch behaviors on canvas
  canvas.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
  canvas.addEventListener('touchmove', e => e.preventDefault(), { passive: false });

  // Mouse wheel zoom
  canvas.addEventListener('wheel', onWheel, { passive: false });

  // Keyboard
  window.addEventListener('keydown', onKeyDown);
}

// ── Callback registration ──
export function onPointerDownCB(fn) { callbacks.pointerDown.push(fn); }
export function onPointerMoveCB(fn) { callbacks.pointerMove.push(fn); }
export function onPointerUpCB(fn)   { callbacks.pointerUp.push(fn); }
export function onZoomCB(fn)        { callbacks.zoom.push(fn); }
export function onPanCB(fn)         { callbacks.pan.push(fn); }
export function onKeyDownCB(fn)     { callbacks.keyDown.push(fn); }

function getCanvasPos(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

// ── Pointer events ──
function onPointerDown(e) {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size >= 2) {
    gestureActive = true;
    initGesture();
    return;
  }

  if (!gestureActive) {
    const pos = getCanvasPos(e);
    const button = e.button; // 0=left, 1=middle, 2=right
    callbacks.pointerDown.forEach(fn => fn(pos.x, pos.y, button));
  }
}

function onPointerMove(e) {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (gestureActive && pointers.size >= 2) {
    handleGesture();
    return;
  }

  if (!gestureActive) {
    const pos = getCanvasPos(e);
    const buttons = e.buttons; // bitmask: 1=left, 4=middle
    callbacks.pointerMove.forEach(fn => fn(pos.x, pos.y, buttons));
  }
}

function onPointerUp(e) {
  pointers.delete(e.pointerId);

  if (pointers.size < 2) {
    if (gestureActive) {
      gestureActive = false;
      lastPinchDist = 0;
      lastPanCenter = null;
      return; // swallow the up event after gesture
    }
  }

  if (!gestureActive) {
    const pos = getCanvasPos(e);
    callbacks.pointerUp.forEach(fn => fn(pos.x, pos.y));
  }
}

// ── Pinch/Pan gesture ──
function initGesture() {
  const pts = Array.from(pointers.values());
  lastPinchDist = dist(pts[0], pts[1]);
  lastPanCenter = midpoint(pts[0], pts[1]);
}

function handleGesture() {
  const pts = Array.from(pointers.values());
  if (pts.length < 2) return;

  const d = dist(pts[0], pts[1]);
  const center = midpoint(pts[0], pts[1]);

  // Zoom
  if (lastPinchDist > 0) {
    const factor = d / lastPinchDist;
    if (Math.abs(factor - 1) > 0.005) {
      callbacks.zoom.forEach(fn => fn(factor, center.x, center.y));
    }
  }
  lastPinchDist = d;

  // Pan
  if (lastPanCenter) {
    const dx = center.x - lastPanCenter.x;
    const dy = center.y - lastPanCenter.y;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      callbacks.pan.forEach(fn => fn(dx, dy));
    }
  }
  lastPanCenter = center;
}

function dist(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }
function midpoint(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }

// ── Mouse wheel ──
function onWheel(e) {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;
  const factor = e.deltaY < 0 ? 1.1 : 0.9;
  callbacks.zoom.forEach(fn => fn(factor, cx, cy));
}

// ── Keyboard ──
function onKeyDown(e) {
  // Don't capture when typing in inputs
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  callbacks.keyDown.forEach(fn => fn(e));
}
