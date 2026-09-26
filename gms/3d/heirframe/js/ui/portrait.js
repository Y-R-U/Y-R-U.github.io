// Procedural busts. Humans render as holo-calls (cyan projection), robots as polished metal.
let uid = 0;

function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => ((s = (s ^ (s << 13)) >>> 0, s = (s ^ (s >>> 17)) >>> 0, s = (s ^ (s << 5)) >>> 0) % 10000) / 10000;
}

const METAL = {
  gold: ['#fff6cf', '#f1c45a', '#b57a1d', '#4a2c08'],
  chrome: ['#ffffff', '#c9d3de', '#7d8a98', '#1e262f'],
  black: ['#6f7c89', '#252c35', '#0c0f13', '#000000'],
  rental: ['#d9dcdf', '#9aa1a8', '#5c636b', '#262b30'],
  robot: ['#ffffff', '#c9d3de', '#7d8a98', '#1e262f'],
  ghost: ['#9fb2c6', '#3a4756', '#151b23', '#05070a'],
  bulwark: ['#8a96a3', '#262c34', '#0a0c10', '#000000'],
};

function defs(id, hue, metal) {
  const m = METAL[metal] || METAL.chrome;
  const t = metal === 'bulwark' ? METAL.gold : m;
  return `<defs>
  <linearGradient id="h${id}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="hsl(${hue} 100% 86%)" stop-opacity=".95"/>
    <stop offset=".55" stop-color="hsl(${hue} 90% 60%)" stop-opacity=".55"/>
    <stop offset="1" stop-color="hsl(${hue} 90% 40%)" stop-opacity=".1"/>
  </linearGradient>
  <linearGradient id="m${id}" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${m[0]}"/><stop offset=".35" stop-color="${m[1]}"/>
    <stop offset=".7" stop-color="${m[2]}"/><stop offset="1" stop-color="${m[3]}"/>
  </linearGradient>
  <linearGradient id="s${id}" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${t[3]}"/><stop offset=".3" stop-color="${t[1]}"/>
    <stop offset=".55" stop-color="${t[0]}"/><stop offset=".8" stop-color="${t[2]}"/><stop offset="1" stop-color="${t[3]}"/>
  </linearGradient>
  <radialGradient id="g${id}" cx=".5" cy=".42" r=".6">
    <stop offset="0" stop-color="hsl(${hue} 100% 70%)" stop-opacity=".35"/><stop offset="1" stop-color="hsl(${hue} 100% 50%)" stop-opacity="0"/>
  </radialGradient>
  <pattern id="l${id}" width="4" height="3" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#fff" opacity=".13"/></pattern>
</defs>`;
}

function human(id, r, hue) {
  const rx = 17 + r() * 4, ry = 22 + r() * 3, cy = 50;
  const hair = Math.floor(r() * 5);
  const top = cy - ry;
  const hairs = [
    `<path d="M${50 - rx - 1} ${cy - 2}C${50 - rx - 2} ${top - 6} ${50 + rx + 2} ${top - 6} ${50 + rx + 1} ${cy - 2}C${50 + rx - 4} ${top + 8} ${50 - rx + 4} ${top + 6} ${50 - rx - 1} ${cy - 2}z"/>`,
    `<path d="M${50 - rx - 3} ${cy + 26}C${50 - rx - 6} ${top - 4} ${50 + rx + 6} ${top - 4} ${50 + rx + 3} ${cy + 26}L${50 + rx - 3} ${cy + 20}C${50 + rx - 2} ${top + 12} ${50 - rx + 2} ${top + 10} ${50 - rx + 3} ${cy + 20}z"/>`,
    `<circle cx="50" cy="${top - 4}" r="7"/><path d="M${50 - rx} ${cy - 4}C${50 - rx} ${top - 3} ${50 + rx} ${top - 3} ${50 + rx} ${cy - 4}C${50 + rx - 5} ${top + 6} ${50 - rx + 5} ${top + 6} ${50 - rx} ${cy - 4}z"/>`,
    `<path d="M${50 - rx + 2} ${top + 10}C${48 - rx} ${top - 6} ${56 + rx} ${top - 8} ${50 + rx + 2} ${top + 16}L${50 + rx - 2} ${top + 10}C${40} ${top + 2} ${46 - rx} ${top + 8} ${50 - rx + 2} ${top + 10}z"/>`,
    '',
  ][hair];
  const eyeY = cy - 2 + r() * 2;
  return `
  <path d="M6 120C8 104 20 97 36 93l6-6h16l6 6c16 4 28 11 30 27z" fill="url(#h${id})" stroke="hsl(${hue} 100% 80%)" stroke-width=".8" stroke-opacity=".8"/>
  <path d="M36 93l14 16 14-16" fill="none" stroke="hsl(${hue} 100% 85%)" stroke-width=".8" opacity=".7"/>
  <rect x="42" y="${cy + ry - 6}" width="16" height="${95 - cy - ry}" fill="url(#h${id})" opacity=".8"/>
  <ellipse cx="50" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#h${id})" stroke="hsl(${hue} 100% 88%)" stroke-width=".9"/>
  <g fill="hsl(${hue} 100% 82%)" fill-opacity=".55" stroke="hsl(${hue} 100% 90%)" stroke-width=".6">${hairs}</g>
  <g fill="none" stroke="hsl(${hue} 100% 94%)" stroke-width="1.1" stroke-linecap="round" opacity=".85">
    <path d="M${43 - rx * .12} ${eyeY}h6M${51 + rx * .12} ${eyeY}h6"/>
    <path d="M50 ${eyeY + 3}l-1.5 7h3" opacity=".6"/><path d="M45.5 ${cy + ry * .55}q4.5 2 9 0" opacity=".7"/>
  </g>`;
}

function robot(id, r, kind, hue) {
  const eye = kind === 'black' || kind === 'ghost' ? `hsl(${hue} 100% 65%)` : kind === 'bulwark' ? '#ffe7a8' : '#dff6ff';
  const w = 17 + r() * 2;
  return `
  <path d="M4 120C6 104 18 96 34 94l8-5h16l8 5c16 2 28 10 30 26z" fill="url(#m${id})" stroke="#fff" stroke-opacity=".35" stroke-width=".6"/>
  <path d="M22 104c6-4 14-6 20-6M78 104c-6-4-14-6-20-6" fill="none" stroke="#000" stroke-opacity=".35"/>
  <g fill="url(#s${id})" stroke="#000" stroke-opacity=".35" stroke-width=".5">
    <rect x="43" y="72" width="14" height="5" rx="1.5"/><rect x="42" y="78" width="16" height="5" rx="1.5"/><rect x="41" y="84" width="18" height="6" rx="2"/>
  </g>
  <path d="M50 22c${w * .62} 0 ${w} 11 ${w} 25 0 14-5 25-${w} 27-${w - 5}-2-${w}-13-${w}-27 0-14 ${w * .38}-25 ${w}-25z" fill="url(#m${id})" stroke="#fff" stroke-opacity=".5" stroke-width=".7"/>
  <path d="M50 24c-9 0-15 8-16 20" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="1.4" stroke-linecap="round"/>
  <g fill="url(#s${id})" stroke="#000" stroke-opacity=".4" stroke-width=".6">
    <circle cx="${50 - w - 1}" cy="48" r="6.5"/><circle cx="${50 + w + 1}" cy="48" r="6.5"/>
  </g>
  <g fill="none" stroke="#000" stroke-opacity=".45" stroke-width=".8"><circle cx="${50 - w - 1}" cy="48" r="3.4"/><circle cx="${50 + w + 1}" cy="48" r="3.4"/></g>
  <path d="M${50 - w * .62} 47q${w * .62} -4 ${w * 1.24} 0" fill="none" stroke="${eye}" stroke-width="2.4" stroke-linecap="round" filter="url(#b${id})"/>
  <path d="M50 52v9M45 64q5 2 10 0" fill="none" stroke="#000" stroke-opacity=".3" stroke-width=".8"/>
  <filter id="b${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
}

function rental(id) {
  return `
  <path d="M4 120C6 104 16 97 32 95l10-5h16l10 5c16 2 26 9 28 25z" fill="url(#m${id})" stroke="#000" stroke-opacity=".4"/>
  <path d="M14 108h18l-4 12H10zM86 108H68l4 12h18z" fill="#ff7a1a" opacity=".85"/>
  <rect x="42" y="74" width="16" height="16" fill="#3a4047"/><path d="M42 78h16M42 82h16M42 86h16" stroke="#1a1d20"/>
  <rect x="29" y="24" width="42" height="50" rx="7" fill="url(#m${id})" stroke="#000" stroke-opacity=".45"/>
  <rect x="29" y="30" width="42" height="5" fill="#ff7a1a" opacity=".9"/>
  <rect x="32" y="42" width="36" height="12" rx="3" fill="#0b1117" stroke="#000"/>
  <rect x="35" y="46" width="30" height="4" rx="2" fill="#ffb36b" opacity=".85" filter="url(#b${id})"/>
  <path d="M52 42l3 5-2 3 4 4" fill="none" stroke="#e7f1ff" stroke-width=".9" opacity=".9"/>
  <path d="M35 62h30M35 66h22" stroke="#000" stroke-opacity=".35"/>
  <text x="50" y="72" font-size="5.5" font-family="monospace" text-anchor="middle" fill="#1b1f24" opacity=".7">R-1</text>
  <filter id="b${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.1" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
}

function unknown(id, hue) {
  return `
  <path d="M6 120C8 104 20 97 36 93l6-6h16l6 6c16 4 28 11 30 27z" fill="#070b12" stroke="hsl(${hue} 90% 60%)" stroke-opacity=".35" stroke-dasharray="2 2"/>
  <ellipse cx="50" cy="50" rx="19" ry="24" fill="#070b12" stroke="hsl(${hue} 90% 60%)" stroke-opacity=".4" stroke-dasharray="2 2"/>
  <text x="50" y="61" font-size="30" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="hsl(${hue} 100% 75%)" opacity=".55">?</text>`;
}

export function portrait(p = {}) {
  if (typeof p === 'string') return `<img class="hf-portrait-img" src="${p}" alt="">`;
  const id = ++uid;
  const kind = p.kind || 'human';
  const hue = p.hue ?? (kind === 'human' ? 196 : 190);
  const r = rng(p.seed ?? 1);
  const metal = kind === 'robot' ? 'chrome' : kind;
  let body;
  if (kind === 'human') body = human(id, r, hue);
  else if (kind === 'rental') body = rental(id);
  else if (kind === 'unknown') body = unknown(id, hue);
  else body = robot(id, r, kind, hue);
  const holo = kind === 'human';
  return `<svg class="hf-portrait-svg" viewBox="0 0 100 120" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${defs(id, hue, metal)}
  <rect width="100" height="120" fill="url(#g${id})"/>${body}
  ${holo ? `<rect width="100" height="120" fill="url(#l${id})"/>` : ''}</svg>`;
}

const FRAME_KIND = { rental: 'rental', brawler: 'bulwark', gunner: 'chrome', ghost: 'ghost' };
export const framePortrait = (kind, seed = 3) => portrait({ kind: FRAME_KIND[kind] || kind || 'chrome', seed, hue: kind === 'ghost' ? 185 : 195 });
