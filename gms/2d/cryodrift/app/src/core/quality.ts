import type { Renderer } from '../render/Renderer';
import { settings, type QualityTier } from './settings';

/**
 * Quality tiers (build plan §7/§9). Auto-detects from device hints, or honors a
 * manual override. Scales particle density now; filter passes + parallax depth are
 * gated against `currentTier` in the render layer (P3/P4).
 */
export let currentTier: QualityTier = 'high';

export function detectTier(): QualityTier {
  if (settings.quality !== 'auto') return settings.quality;
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 4;
  const dpr = window.devicePixelRatio || 1;
  const px = window.innerWidth * window.innerHeight * dpr * dpr;
  let score = 0;
  if (cores >= 8) score += 2;
  else if (cores >= 6) score += 1;
  if (mem >= 8) score += 2;
  else if (mem >= 4) score += 1;
  if (px < 1_400_000) score += 1; // smaller framebuffer = easier
  if (score >= 4) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
}

const DENSITY: Record<QualityTier, number> = { high: 1, medium: 0.6, low: 0.32 };

export function applyQuality(renderer: Renderer): void {
  currentTier = detectTier();
  renderer.setQuality(currentTier, DENSITY[currentTier]);
}
