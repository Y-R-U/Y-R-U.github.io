import { Assets, Texture } from 'pixi.js';
import hazeFarUrl from '../assets/textures/haze_far.png';
import hazeNearUrl from '../assets/textures/haze_near.png';
import dishHeroUrl from '../assets/textures/dish_hero.png';

export interface GameTextures {
  hazeFar: Texture;
  hazeNear: Texture;
  noise: Texture;
  vignette: Texture;
}

/** Smooth value-noise tile for the membrane displacement filter (organic wobble). */
function makeNoiseTexture(size = 256): Texture {
  const low = 32;
  const small = document.createElement('canvas');
  small.width = small.height = low;
  const sc = small.getContext('2d')!;
  const img = sc.createImageData(low, low);
  for (let i = 0; i < low * low; i++) {
    const v = Math.random() * 255;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = Math.random() * 255;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  sc.putImageData(img, 0, 0);

  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  // upscale a couple times for smooth blobs
  ctx.drawImage(small, 0, 0, low, low, 0, 0, size, size);
  ctx.globalAlpha = 0.5;
  ctx.drawImage(cv, -size * 0.12, size * 0.07, size * 1.2, size * 1.2);
  ctx.globalAlpha = 1;

  const tex = Texture.from(cv);
  tex.source.addressMode = 'repeat';
  return tex;
}

/** Radial vignette (transparent centre → dark edge) for the microscope look. */
function makeVignetteTexture(size = 512): Texture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.28, size / 2, size / 2, size * 0.52);
  g.addColorStop(0, 'rgba(5,10,20,0)');
  g.addColorStop(0.7, 'rgba(5,10,20,0.35)');
  g.addColorStop(1, 'rgba(2,5,11,0.92)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return Texture.from(cv);
}

let cache: GameTextures | null = null;

export async function loadGameTextures(): Promise<GameTextures> {
  if (cache) return cache;
  const [hazeFar, hazeNear] = await Promise.all([Assets.load(hazeFarUrl), Assets.load(hazeNearUrl)]);
  hazeFar.source.addressMode = 'repeat';
  hazeNear.source.addressMode = 'repeat';
  cache = { hazeFar, hazeNear, noise: makeNoiseTexture(), vignette: makeVignetteTexture() };
  return cache;
}

export function loadIntroTexture(): Promise<Texture> {
  return Assets.load(dishHeroUrl);
}
