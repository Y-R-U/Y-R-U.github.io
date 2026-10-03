const q = new URLSearchParams(location.search);
const num = (k) => (q.has(k) && q.get(k) !== '' && !isNaN(+q.get(k)) ? +q.get(k) : null);
const on = (k) => q.has(k) && q.get(k) !== '0' && q.get(k) !== 'false';

export const flags = {
  seed: num('seed'),
  dpr: num('dpr'),
  tier: q.get('tier') || 'auto',
  fast: num('fast') || (on('fast') ? 10 : 1),
  reset: on('reset'),
  nosave: on('nosave'),
  debug: on('debug'),
  demo: on('demo'),
  presenter: q.get('presenter') || 'blit',
  break: q.get('break') || '',
  focus: q.get('focus') || null,
};
