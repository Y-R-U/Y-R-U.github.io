const paths = {
  skull:
    '<path d="M8 17H6v-6a6 6 0 0 1 12 0v6h-2v4H8z"/><path d="M10 18v3m4-3v3m-4-6h.01M14 15h.01M10 11h.01M14 11h.01"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  play: '<path d="m8 5 11 7-11 7z"/>',
  pulse:
    '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z"/>',
  map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16"/>',
  arsenal:
    '<path d="m5 3 12 12m-2-12L3 15m12 0 3 3m-1-1 3-3m-2 4 2 2M3 3l3 1-2 2zM3 18l3 3m-2-1 6-6"/>',
  refuge: '<path d="m3 11 9-8 9 8v10H3zM9 21v-7h6v7"/>',
  settings:
    '<path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1"/><circle cx="12" cy="12" r="5"/>',
  sound:
    '<path d="M4 9h4l5-4v14l-5-4H4zM16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  fire: '<path d="M13 2c1 6-5 6-3 11 2 0 4-2 5-4 6 8 2 13-3 13S3 19 4 14c0-5 7-7 9-12Z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  radio:
    '<path d="M12 12v9m-4 0h8M8.5 8.5a5 5 0 0 0 0 7m7-7a5 5 0 0 1 0 7M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/><circle cx="12" cy="12" r="1"/>',
  heart:
    '<path d="M20 5c-3-3-7-1-8 2-1-3-5-5-8-2s-2 6 1 9l7 7 7-7c3-3 4-6 1-9Z"/>',
};
export const icon = (name, cls = "") =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.pulse}</svg>`;
