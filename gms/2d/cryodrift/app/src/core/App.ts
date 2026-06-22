import { Application } from 'pixi.js';

/**
 * Boots the PixiJS v8 application (WebGPU with automatic WebGL fallback).
 * devicePixelRatio is capped at 2 — the single biggest mobile fill-rate lever.
 */
export async function createApp(mount: HTMLElement): Promise<Application> {
  const app = new Application();
  await app.init({
    background: '#050A14',
    antialias: true,
    resizeTo: window,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
    preference: 'webgpu', // falls back to webgl automatically
  });
  mount.appendChild(app.canvas);
  return app;
}
