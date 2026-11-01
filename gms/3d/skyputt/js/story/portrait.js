// Procedural character portraits (SVG strings) from a few params, so new characters are data.
// p = { skin, hair: bun|short|spiky|long|bald|cap, hairColor, outfit, accent, glasses, visor, beard, mood }

const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k))));
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
};

export function portraitSVG(p = {}, { size = 120, bg = true } = {}) {
  const skin = p.skin || '#e9b48f', hair = p.hairColor || '#4a3020', outfit = p.outfit || '#3b6fd6', acc = p.accent || '#fff';
  const skinD = shade(skin, -0.18), hairD = shade(hair, -0.25), outD = shade(outfit, -0.3);
  const mood = p.mood || 'happy';
  const id = 'pg' + Math.random().toString(36).slice(2, 8);
  let back = '', front = '';
  switch (p.hair) {
    case 'bun':
      back = `<circle cx="60" cy="18" r="13" fill="${hair}"/><circle cx="60" cy="18" r="13" fill="url(#${id}h)"/>`;
      front = `<path d="M31 50c0-20 12-31 29-31s29 11 29 31c-6-9-15-14-29-14s-23 5-29 14z" fill="${hair}"/>`;
      break;
    case 'short':
      front = `<path d="M30 52c-2-22 11-34 30-34s32 12 30 34c-4-10-9-15-14-16-6 4-24 5-34-2-6 3-10 9-12 18z" fill="${hair}"/>`;
      break;
    case 'spiky':
      front = `<path d="M30 50l-2-20 9 6 2-14 9 9 6-13 6 13 9-9 2 14 9-6-2 20c-8-8-18-12-30-12s-22 4-28 12z" fill="${hair}"/>`;
      break;
    case 'long':
      back = `<path d="M28 48c-2 26 2 44 10 54h44c8-10 12-28 10-54z" fill="${hairD}"/>`;
      front = `<path d="M30 52c0-21 12-33 30-33s30 12 30 33c-8-12-18-17-30-17s-22 5-30 17z" fill="${hair}"/>`;
      break;
    case 'cap':
      front = `<path d="M30 46c0-17 13-28 30-28s30 11 30 28z" fill="${outfit}"/><path d="M58 42h40c3 0 3 6-1 6H58z" fill="${outD}"/>
        <circle cx="60" cy="19" r="3" fill="${acc}"/><path d="M31 47c2 4 5 6 8 6v-7z" fill="${hair}"/>`;
      break;
    default: break; // bald
  }
  const eyeY = 60;
  const eyes = mood === 'smug'
    ? `<path d="M44 ${eyeY}q5 -3 10 0M66 ${eyeY}q5 -3 10 0" stroke="#2a1c14" stroke-width="2.6" fill="none" stroke-linecap="round"/>`
    : `<ellipse cx="49" cy="${eyeY}" rx="3.4" ry="4.2" fill="#2a1c14"/><ellipse cx="71" cy="${eyeY}" rx="3.4" ry="4.2" fill="#2a1c14"/>
       <circle cx="50.2" cy="${eyeY - 1.4}" r="1.1" fill="#fff"/><circle cx="72.2" cy="${eyeY - 1.4}" r="1.1" fill="#fff"/>`;
  const brows = mood === 'wry'
    ? `<path d="M43 51l11 1M66 50l11-2" stroke="${hairD}" stroke-width="2.6" stroke-linecap="round"/>`
    : `<path d="M43 52q6-3 11 0M66 52q6-3 11 0" stroke="${hairD}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
  const mouth = { happy: 'M50 76q10 9 20 0', wry: 'M51 77q9 4 18-2', smug: 'M52 77q8 3 16-1', sad: 'M51 79q9-5 18 0' }[mood] || 'M50 76q10 9 20 0';
  const glasses = p.glasses ? `<g fill="none" stroke="#3b2a20" stroke-width="2"><circle cx="49" cy="${eyeY}" r="8"/><circle cx="71" cy="${eyeY}" r="8"/><path d="M57 ${eyeY}h6M41 ${eyeY - 1}l-8-2M79 ${eyeY - 1}l8-2"/></g>` : '';
  const visor = p.visor ? `<path d="M31 42c8-6 19-8 29-8s21 2 29 8l-2 5c-8-4-17-6-27-6s-19 2-27 6z" fill="${p.visor}"/><path d="M60 41c14 0 30 4 38 10-10-2-24-3-38-3z" fill="${shade(p.visor, -0.25)}"/>` : '';
  const beard = p.beard ? `<path d="M38 66c2 18 12 26 22 26s20-8 22-26c-6 8-14 10-22 10s-16-2-22-10z" fill="${hair}"/>` : '';
  return `<svg viewBox="0 0 120 120" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <radialGradient id="${id}b" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="#5b8fd8"/><stop offset="1" stop-color="#1c2d5c"/></radialGradient>
    <linearGradient id="${id}h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".25"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
  </defs>
  ${bg ? `<rect width="120" height="120" rx="22" fill="url(#${id}b)"/>` : ''}
  ${back}
  <path d="M18 120c2-22 18-32 42-32s40 10 42 32z" fill="${outfit}"/>
  <path d="M48 90l12 14 12-14" fill="${acc}"/>
  <rect x="52" y="78" width="16" height="14" rx="6" fill="${skinD}"/>
  <ellipse cx="60" cy="60" rx="29" ry="31" fill="${skin}"/>
  <ellipse cx="31" cy="63" rx="4.5" ry="7" fill="${skinD}"/><ellipse cx="89" cy="63" rx="4.5" ry="7" fill="${skinD}"/>
  <ellipse cx="44" cy="71" rx="5" ry="3" fill="#ff8a7a" opacity=".35"/><ellipse cx="76" cy="71" rx="5" ry="3" fill="#ff8a7a" opacity=".35"/>
  ${beard}
  ${brows}${eyes}${glasses}
  <path d="M58 64q2 6 4 0" stroke="${skinD}" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="${mouth}" stroke="#7a2e22" stroke-width="2.6" fill="none" stroke-linecap="round"/>
  ${front}${visor}
</svg>`;
}
