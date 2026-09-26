// Full-body frame schematic for the Warehouse "paper doll".
let uid = 0;

const SPEC = {
  rental: { m: ['#e3e6e9', '#a3aab1', '#5d646c', '#2a2f35'], acc: '#ff7a1a', glow: '#ffb36b', sh: 25, ch: 21, wa: 14, arm: 9.5, leg: 11, head: 'box' },
  brawler: { m: ['#8a96a3', '#262c34', '#0a0c10', '#000'], t: ['#fff6cf', '#f1c45a', '#b57a1d', '#4a2c08'], acc: '#ffcf6a', glow: '#ffe7a8', sh: 34, ch: 27, wa: 15, arm: 14, leg: 14, head: 'dome', fist: 1 },
  gunner: { m: ['#ffffff', '#c9d3de', '#7d8a98', '#1e262f'], acc: '#66d8ff', glow: '#bff0ff', sh: 26, ch: 21, wa: 12, arm: 9, leg: 10.5, head: 'dome', gun: 1, mast: 1 },
  ghost: { m: ['#56616c', '#1c2127', '#0a0c0f', '#000'], acc: '#46e0ff', glow: '#9ff2ff', sh: 22, ch: 18, wa: 10.5, arm: 7.5, leg: 9, head: 'visor', blade: 1, seams: 1 },
};

export function frameFigure(kind = 'rental') {
  const s = SPEC[kind] || SPEC.gunner, id = ++uid, cx = 60;
  const limb = (x1, y1, x2, y2, w, g = 'fm') => {
    const a = (t) => [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
    const [px1, py1] = a(.14), [px2, py2] = a(.86);
    return `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="#14181e" stroke-width="${w * .5}" stroke-linecap="round"/>
      <path d="M${px1} ${py1}L${px2} ${py2}" stroke="url(#${g}${id})" stroke-width="${w}" stroke-linecap="round"/>
      <path d="M${px1} ${py1}L${px2} ${py2}" stroke="#000" stroke-opacity=".35" stroke-width="${w * .22}" stroke-linecap="round" transform="translate(${w * .3} 0)"/>
      <path d="M${px1} ${py1 + 1}L${px2} ${py2 - 2}" stroke="#fff" stroke-opacity=".55" stroke-width="${w * .16}" stroke-linecap="round" transform="translate(${-w * .26} 0)"/>`;
  };
  const joint = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#0b0e12" stroke="${s.acc}" stroke-opacity=".6" stroke-width=".8"/>`;
  const head = s.head === 'box'
    ? `<rect x="${cx - 10}" y="14" width="20" height="22" rx="4" fill="url(#fm${id})"/><rect x="${cx - 8}" y="21" width="16" height="6" rx="2" fill="#0b1117"/><rect x="${cx - 6.5}" y="23" width="13" height="2" rx="1" fill="${s.glow}" filter="url(#fg${id})"/><path d="M${cx + 2} 21l2 3-1 3" stroke="#fff" stroke-width=".6" fill="none"/>`
    : s.head === 'visor'
      ? `<path d="M${cx} 12c8 0 11 6 11 13s-4 12-11 12-11-5-11-12 3-13 11-13z" fill="url(#fm${id})"/><path d="M${cx - 9} 23q9-4 18 0l-1 4q-8-3-16 0z" fill="${s.acc}" filter="url(#fg${id})"/>`
      : `<path d="M${cx} 12c8 0 11 6 11 13s-4 12-11 12-11-5-11-12 3-13 11-13z" fill="url(#fm${id})"/><circle cx="${cx - 11}" cy="25" r="3.2" fill="url(#fm${id})" stroke="#000" stroke-opacity=".4"/><circle cx="${cx + 11}" cy="25" r="3.2" fill="url(#fm${id})" stroke="#000" stroke-opacity=".4"/><path d="M${cx - 6} 24q6-2 12 0" stroke="${s.glow}" stroke-width="1.8" stroke-linecap="round" fill="none" filter="url(#fg${id})"/><path d="M${cx - 4} 15q-4 2-5 8" stroke="#fff" stroke-opacity=".8" fill="none" stroke-linecap="round"/>`;
  const sh = s.sh, lx = cx - sh, rx = cx + sh;
  const gun = s.gun ? `<rect x="${rx + 2}" y="96" width="9" height="30" rx="3" fill="url(#fm${id})" stroke="#000" stroke-opacity=".4"/><rect x="${rx + 4}" y="124" width="5" height="10" fill="#1a2028"/><circle cx="${rx + 6.5}" cy="134" r="2" fill="${s.glow}" filter="url(#fg${id})"/>` : '';
  const fist = r => s.fist ? `<circle cx="${r}" cy="128" r="7.5" fill="url(#fm${id})" stroke="#000" stroke-opacity=".4"/>` : `<circle cx="${r}" cy="126" r="4.5" fill="url(#fm${id})"/>`;
  return `<svg class="hf-figure" viewBox="0 0 120 200" aria-hidden="true"><defs>
    <linearGradient id="fm${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${s.m[0]}"/><stop offset=".35" stop-color="${s.m[1]}"/><stop offset=".7" stop-color="${s.m[2]}"/><stop offset="1" stop-color="${s.m[3]}"/></linearGradient>
    <linearGradient id="ft${id}" x1="0" y1="0" x2="1" y2="1">${(s.t || (kind === 'rental' ? ['#ffd2a8', '#ff8a3a', '#b84e0e', '#4a1e04'] : s.m)).map((c, i) => `<stop offset="${[0, .35, .7, 1][i]}" stop-color="${c}"/>`).join('')}</linearGradient>
    <radialGradient id="fp${id}" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${s.acc}" stop-opacity=".45"/><stop offset="1" stop-color="${s.acc}" stop-opacity="0"/></radialGradient>
    <filter id="fg${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <ellipse cx="${cx}" cy="192" rx="38" ry="5" fill="url(#fp${id})"/>
  <g fill="none">
    ${limb(cx - 9, 112, cx - 12, 148, s.leg)}${limb(cx - 12, 150, cx - 12, 184, s.leg * .9)}
    ${limb(cx + 9, 112, cx + 12, 148, s.leg)}${limb(cx + 12, 150, cx + 12, 184, s.leg * .9)}
    ${limb(lx + 3, 56, lx - 1, 90, s.arm)}${limb(lx - 1, 92, lx - 2, 122, s.arm * .9)}
    ${kind === 'rental' ? `${limb(rx - 3, 56, rx + 1, 90, s.arm * .85, 'ft')}${limb(rx + 1, 92, rx + 2, 122, s.arm * .8, 'ft')}` : `${limb(rx - 3, 56, rx + 1, 90, s.arm)}${limb(rx + 1, 92, rx + 2, 122, s.arm * .9)}`}
  </g>
  <path d="M${cx - 19} 184h12v8h-15zM${cx + 19} 184h-12v8h15z" fill="url(#fm${id})" stroke="#000" stroke-opacity=".4"/>
  ${joint(cx - 12, 149, s.leg * .45)}${joint(cx + 12, 149, s.leg * .45)}${joint(lx - 1, 91, s.arm * .5)}${joint(rx + 1, 91, s.arm * .5)}
  ${fist(lx - 2)}${fist(rx + 2)}${gun}
  <path d="M${cx - 5} 36h10v8h-10z" fill="#1a1f25"/><path d="M${cx - 5} 38h10M${cx - 5} 41h10" stroke="#000" stroke-opacity=".6"/>
  <path d="M${lx} 50Q${cx} 40 ${rx} 50L${cx + s.ch} 86L${cx + s.wa} 104H${cx - s.wa}L${cx - s.ch} 86Z" fill="url(#fm${id})" stroke="#000" stroke-opacity=".35"/>
  <path d="M${lx + 6} 52Q${cx - 6} 45 ${cx - 2} 60" stroke="#fff" stroke-opacity=".75" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <path d="M${cx - s.wa} 104H${cx + s.wa}L${cx + s.wa - 3} 116H${cx - s.wa + 3}Z" fill="url(#fm${id})" stroke="#000" stroke-opacity=".4"/>
  <circle cx="${cx}" cy="72" r="5.5" fill="#0b0f14" stroke="${s.acc}" stroke-width="1.2"/><circle cx="${cx}" cy="72" r="2.8" fill="${s.glow}" filter="url(#fg${id})"/>
  <path d="M${cx - s.ch + 6} 88H${cx + s.ch - 6}" stroke="${s.acc}" stroke-opacity=".55" stroke-width=".9"/>
  ${kind === 'rental' ? `<path d="M${lx + 2} 52l8 -3v6l-8 3z" fill="${s.acc}"/><text x="${cx}" y="98" font-size="6" font-family="monospace" text-anchor="middle" fill="#2a2f35" opacity=".8">HIRE</text>` : ''}
  <circle cx="${lx + 1}" cy="54" r="${sh * .3}" fill="url(#ft${id})" stroke="#000" stroke-opacity=".3"/><circle cx="${rx - 1}" cy="54" r="${sh * .3}" fill="url(#${kind === 'rental' ? 'fm' : 'ft'}${id})" stroke="#000" stroke-opacity=".3"/>
  ${s.t ? `<path d="M${cx - 12} 60L${cx} 66L${cx + 12} 60M${cx - s.ch + 4} 84H${cx + s.ch - 4}" stroke="url(#ft${id})" stroke-width="2" fill="none"/><rect x="${lx - 6}" y="98" width="${8}" height="16" rx="2" fill="url(#ft${id})"/><rect x="${rx - 2}" y="98" width="8" height="16" rx="2" fill="url(#ft${id})"/>` : ''}
  ${s.mast ? `<path d="M${rx - 3} 50L${rx + 4} 20" stroke="url(#fm${id})" stroke-width="2.2"/><circle cx="${rx + 4}" cy="18" r="3.5" fill="#0b1117" stroke="${s.acc}"/><circle cx="${rx + 4}" cy="18" r="1.5" fill="${s.glow}" filter="url(#fg${id})"/>` : ''}
  ${s.blade ? `<path d="M${rx + 2} 104L${rx + 7} 150L${rx + 1} 120Z" fill="${s.glow}" opacity=".9" filter="url(#fg${id})"/>` : ''}
  ${s.seams ? `<path d="M${cx} 44V104M${cx - s.ch + 5} 62L${cx - 4} 98M${cx + s.ch - 5} 62L${cx + 4} 98M${cx - 12} 116L${cx - 12} 184M${cx + 12} 116L${cx + 12} 184M${lx} 60L${lx - 2} 120M${rx} 60L${rx + 2} 120" stroke="${s.acc}" stroke-width=".7" opacity=".9" filter="url(#fg${id})"/>` : ''}
  ${head}
</svg>`;
}
