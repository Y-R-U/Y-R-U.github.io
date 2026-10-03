// Small chibi portraits (inline SVG) in the crowd rig's palette, so people read as people, not perk icons.
const SKIN = ['#f6d2b5', '#e9b48f', '#c98c62', '#8d5a3b'];
const HAIR = ['#3b2a20', '#6b4228', '#d9a441', '#a3412c', '#1f1f27', '#8a5a3a'];
const TOPS = ['#7d9ad6', '#e8776a', '#6fb7a8', '#f2b84b', '#9bc66b', '#e58fb0', '#a98ad9'];
const NS = 'http://www.w3.org/2000/svg';

function hash(s) {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  return h >>> 0;
}

export function lookFor(seed, over = {}) {
  const h = hash(seed);
  return { skin: SKIN[h % 4], hair: HAIR[(h >>> 3) % 6], top: TOPS[(h >>> 7) % 7], style: (h >>> 11) % 4, ...over };
}

const HAIRS = [
  'M14 30 Q14 10 32 10 Q50 10 50 30 Q46 20 32 19 Q18 20 14 30Z',
  'M12 34 Q10 8 32 8 Q54 8 52 34 L50 44 Q50 22 32 20 Q16 22 14 44Z',
  'M14 30 Q14 10 32 10 Q50 10 50 30 Q40 16 22 22 Q17 24 14 30Z M46 14 Q58 8 56 24 Q52 18 46 18Z',
  'M13 31 Q13 9 32 9 Q51 9 51 31 L51 52 Q47 50 47 30 Q40 18 32 18 Q24 18 17 30 Q17 50 13 52Z',
];

export function face(look, { size = 44, age = 'adult' } = {}) {
  const k = age === 'baby' ? 0.82 : age === 'kid' ? 0.9 : 1;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('face');
  const style = age === 'baby' ? -1 : look.style;
  svg.innerHTML =
    `<g transform="translate(32 34) scale(${k}) translate(-32 -34)">` +
    `<path d="M10 64 Q12 46 32 46 Q52 46 54 64Z" fill="${look.top}"/>` +
    `<circle cx="32" cy="30" r="18" fill="${look.skin}"/>` +
    (style >= 0 ? `<path d="${HAIRS[style]}" fill="${look.hair}"/>` : `<path d="M30 12 Q34 6 36 13" stroke="${look.hair}" stroke-width="3" fill="none" stroke-linecap="round"/>`) +
    `<circle cx="25.5" cy="32" r="2.4" fill="#2a2230"/><circle cx="38.5" cy="32" r="2.4" fill="#2a2230"/>` +
    `<circle cx="22" cy="37" r="3" fill="#f08f86" opacity=".45"/><circle cx="42" cy="37" r="3" fill="#f08f86" opacity=".45"/>` +
    `<path d="M28.5 38.5 Q32 41.5 35.5 38.5" stroke="#2a2230" stroke-width="1.8" fill="none" stroke-linecap="round"/>` +
    `</g>`;
  return svg;
}
