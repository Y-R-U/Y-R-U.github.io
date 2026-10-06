export const QUALITY = {
  high:   { dprCap: 2,    shadows: true, shadowSize: 2048, bloom: true,  msaa: 4 },
  medium: { dprCap: 1.5,  shadows: true, shadowSize: 1024, bloom: false, msaa: 0 },
  low:    { dprCap: 1,    shadows: false, shadowSize: 512, bloom: false, msaa: 0 },
};

export const isTouch = () => new URLSearchParams(location.search).get('touch') === '1'
  || matchMedia('(pointer: coarse)').matches;

export function detectQuality(setting = 'auto') {
  const q = new URLSearchParams(location.search).get('q');
  const map = { low: 'low', med: 'medium', medium: 'medium', high: 'high' };
  if (q && map[q]) return map[q];
  if (setting && setting !== 'auto' && QUALITY[setting]) return setting;
  const mem = navigator.deviceMemory || 8, cores = navigator.hardwareConcurrency || 8;
  if (mem <= 2 || cores <= 2) return 'low';
  if (isTouch()) return Math.min(screen.width, screen.height) < 500 ? 'low' : 'medium';
  return 'high';
}
