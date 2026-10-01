// One place that decides "is this a phone" and the effective render quality.
// Query flags win (?q=low|med|high, ?lite=1), then the saved setting, then the device default.
export const isMobile = (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches)
  || (typeof navigator !== 'undefined' && /Android|iPhone|iPad/i.test(navigator.userAgent));

const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const forced = Q.get('q') || (Q.get('lite') === '1' ? 'low' : null);

export function defaultQuality() { return isMobile ? 'med' : 'high'; }

export function resolveQuality(settings) {
  return forced || settings?.get?.('quality') || defaultQuality();
}
