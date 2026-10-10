const svg = (vb, body, cls = '') => `<svg class="ico ${cls}" viewBox="${vb}" aria-hidden="true">${body}</svg>`;

export const lock = () => svg('0 0 64 76', `
  <g class="lock-shackle"><path d="M18 36V24a14 14 0 0 1 28 0v12" fill="none" stroke="#6b4a1f" stroke-width="9" stroke-linecap="round"/>
  <path d="M18 36V24a14 14 0 0 1 28 0v12" fill="none" stroke="#c9cfd6" stroke-width="5" stroke-linecap="round"/></g>
  <g class="lock-body"><rect x="6" y="32" width="52" height="40" rx="12" fill="#6b4a1f"/>
  <rect x="9" y="34" width="46" height="35" rx="10" fill="#ffc83d"/>
  <rect x="12" y="36" width="40" height="9" rx="4.5" fill="#ffe08a" opacity=".85"/>
  <circle cx="32" cy="51" r="5.5" fill="#6b4a1f"/><path d="M29.5 53h5l1.5 9h-8z" fill="#6b4a1f"/></g>`, 'ico-lock');

export const sparkle = () => svg('0 0 40 40', `<path d="M20 2l4 13 14 5-14 5-4 13-4-13-14-5 14-5z" fill="#fff6c8" stroke="#ffb627" stroke-width="2" stroke-linejoin="round"/>`, 'ico-sparkle');

export const steak = () => svg('0 0 100 80', `
  <ellipse cx="50" cy="50" rx="47" ry="26" fill="#d9c9b0"/><ellipse cx="50" cy="46" rx="45" ry="24" fill="#fffaf0"/>
  <ellipse cx="50" cy="46" rx="35" ry="17" fill="none" stroke="#ecdcc0" stroke-width="2"/>
  <path d="M14 46c-2-12 10-20 26-19 13 1 20 6 22 13 2 9-8 15-22 16-15 1-24-2-26-10z" fill="#7a3a1c"/>
  <path d="M16 43c0-10 11-15 24-14 12 1 18 5 19 11 1 7-8 12-20 13-13 1-22-3-23-10z" fill="#a8532a"/>
  <path d="M22 37l22 10M28 33l22 10M22 44l14 6" stroke="#5c2a12" stroke-width="3" stroke-linecap="round" opacity=".8"/>
  <path d="M20 40c4-6 14-8 22-6" stroke="#d98a5c" stroke-width="2.5" fill="none" stroke-linecap="round" opacity=".7"/>
  <path d="M62 32c4-8 22-8 24 2 3 6-3 12-12 12-9 0-15-6-12-14z" fill="#fff3d6"/>
  <path d="M64 34c3-5 16-6 19 0" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M67 37c4 3 10 3 14-1 1 4-3 6-7 6s-7-2-7-5z" fill="#a0612e"/>
  <g fill="#5fae3a" stroke="#3e7d23" stroke-width="1.2"><circle cx="64" cy="54" r="4"/><circle cx="72" cy="57" r="4"/><circle cx="70" cy="50" r="3.6"/><circle cx="79" cy="52" r="4"/><circle cx="77" cy="59" r="3.6"/><circle cx="85" cy="56" r="3.4"/></g>
  <g fill="#b9eb8f"><circle cx="63" cy="53" r="1.2"/><circle cx="71" cy="56" r="1.2"/><circle cx="78" cy="51" r="1.2"/></g>`, 'ico-food');

export const lasagna = () => svg('0 0 100 80', `
  <ellipse cx="50" cy="62" rx="44" ry="13" fill="#d9c9b0"/><ellipse cx="50" cy="59" rx="42" ry="12" fill="#fffaf0"/>
  <path d="M18 34l46-12 20 10-46 13z" fill="#f2b33d"/>
  <path d="M18 34l20 11v24l-20-11z" fill="#c9561f"/>
  <path d="M38 45l46-13v24l-46 13z" fill="#e06a2c"/>
  <g fill="#ffd56b"><path d="M38 50l46-13v4l-46 13z"/><path d="M38 60l46-13v4l-46 13z"/><path d="M18 39l20 11v4l-20-11z"/><path d="M18 49l20 11v4l-20-11z"/></g>
  <g fill="#b8321c"><path d="M38 54l46-13v3l-46 13z"/><path d="M18 43l20 11v3l-20-11z"/></g>
  <path d="M20 33c8-3 18 1 26-4 6-3 12 2 18-6 6 3 12 5 19 9-8 2-12 6-20 6-7 0-10 5-18 6-8 1-14-3-25-11z" fill="#ffcf57"/>
  <path d="M40 46c1 4 0 7 2 9M58 41c1 3 0 6 1 8M74 37c0 3 1 6 0 8" stroke="#ffcf57" stroke-width="3.5" stroke-linecap="round"/>
  <g fill="#e2481f"><circle cx="40" cy="30" r="2.6"/><circle cx="56" cy="29" r="2.2"/><circle cx="66" cy="33" r="2.4"/><circle cx="48" cy="35" r="1.8"/></g>
  <path d="M57 25c3-4 8-3 9 0-3 2-6 2-9 0z" fill="#4f9a2e"/>`, 'ico-food');

export const meatloaf = () => svg('0 0 100 80', `
  <ellipse cx="50" cy="60" rx="46" ry="15" fill="#d9c9b0"/><ellipse cx="50" cy="57" rx="44" ry="14" fill="#fffaf0"/>
  <path d="M10 52c0-18 12-26 36-26s38 6 38 22c0 10-12 14-36 14S10 62 10 52z" fill="#6d3517"/>
  <path d="M12 47c2-14 14-19 34-19s34 4 36 16c-6 6-20 6-34 6s-30 2-36-3z" fill="#a33a1f"/>
  <path d="M18 40c8-6 18-7 30-7 10 0 22 1 28 5" stroke="#d65b33" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8"/>
  <path d="M66 32c8 2 15 6 16 14 1 8-3 13-10 15-6-6-8-20-6-29z" fill="#8a4a26"/>
  <path d="M68 35c6 2 11 6 12 12 0 6-2 9-7 11-4-6-6-15-5-23z" fill="#b26a3c"/>
  <g fill="#7a3f1e" opacity=".7"><circle cx="72" cy="44" r="1.6"/><circle cx="76" cy="50" r="1.4"/><circle cx="71" cy="53" r="1.5"/><circle cx="75" cy="40" r="1.2"/></g>
  <path d="M24 34c4-2 6 0 9-2" stroke="#ff9a6a" stroke-width="2.5" stroke-linecap="round" opacity=".7"/>
  <path d="M30 26c2-4 6-4 8 0" stroke="#4f9a2e" stroke-width="3" fill="none" stroke-linecap="round"/>`, 'ico-food');

export const food = (kind) => ({ steak, lasagna, meatloaf }[kind] || steak)();

export const claw = () => svg('0 0 64 64', `
  <g class="claw-nails" fill="#fffaf0" stroke="#5a3418" stroke-width="2.4" stroke-linejoin="round">
    <path d="M16 22C12 12 14 5 19 1c0 7 2 12 6 17z"/><path d="M29 17c-2-10 1-16 6-19-1 7 0 12 3 17z"/><path d="M42 20c0-10 5-15 11-16-3 6-3 11-2 18z"/></g>
  <g fill="#f7931e" stroke="#5a3418" stroke-width="3" stroke-linejoin="round">
    <ellipse cx="32" cy="45" rx="17" ry="14"/><ellipse cx="15" cy="27" rx="7" ry="8"/><ellipse cx="31" cy="22" rx="7" ry="8.5"/><ellipse cx="47" cy="27" rx="7" ry="8"/></g>
  <g fill="#ffd2a6"><ellipse cx="32" cy="47" rx="9" ry="7"/></g>
  <path d="M22 37c3-3 5-3 8-2M36 36c3-1 5 0 7 2" stroke="#3b2314" stroke-width="2.5" stroke-linecap="round" fill="none"/>`, 'ico-claw');

export const paw = (fill = '#e8711a') => svg('0 0 64 64', `<g fill="${fill}">
  <ellipse cx="32" cy="42" rx="15" ry="13"/><ellipse cx="14" cy="27" rx="6.5" ry="8"/><ellipse cx="26" cy="17" rx="6.5" ry="8.5"/>
  <ellipse cx="39" cy="17" rx="6.5" ry="8.5"/><ellipse cx="51" cy="27" rx="6.5" ry="8"/></g>`, 'ico-paw');

export const jump = () => svg('0 0 64 64', `
  <path d="M32 6L12 30h12v14h16V30h12z" fill="#fffaf0" stroke="#5a3418" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M16 52c6 4 26 4 32 0" stroke="#5a3418" stroke-width="4" stroke-linecap="round" fill="none"/>
  <path d="M22 59c4 2 16 2 20 0" stroke="#5a3418" stroke-width="3" stroke-linecap="round" fill="none" opacity=".55"/>`, 'ico-jump');

export const hand = () => svg('0 0 64 64', `
  <path d="M20 34V14a4.5 4.5 0 0 1 9 0v16-20a4.5 4.5 0 0 1 9 0v20-16a4.5 4.5 0 0 1 9 0v20-10a4.5 4.5 0 0 1 9 0v18c0 14-9 22-21 22-9 0-14-4-19-11l-8-11a4.5 4.5 0 0 1 7-6z"
   fill="#fffaf0" stroke="#5a3418" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>`, 'ico-hand');

export const pause = () => svg('0 0 40 40', `<rect x="9" y="7" width="8" height="26" rx="3" fill="currentColor"/><rect x="23" y="7" width="8" height="26" rx="3" fill="currentColor"/>`);
export const gear = () => svg('0 0 40 40', `<path fill="currentColor" d="M17 3h6l1 5 4 2 4-3 4 4-3 4 2 4 5 1v6l-5 1-2 4 3 4-4 4-4-3-4 2-1 5h-6l-1-5-4-2-4 3-4-4 3-4-2-4-5-1v-6l5-1 2-4-3-4 4-4 4 3 4-2z"/><circle cx="20" cy="20" r="6" fill="var(--ico-hole, #fff4dc)"/>`);
export const fullscreen = () => svg('0 0 40 40', `<path d="M6 15V6h9M25 6h9v9M34 25v9h-9M15 34H6v-9" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`);
export const back = () => svg('0 0 40 40', `<path d="M24 7L11 20l13 13" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`);
export const play = () => svg('0 0 40 40', `<path d="M12 7l22 13-22 13z" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>`);
export const replay = () => svg('0 0 40 40', `<path d="M31 21a11 11 0 1 1-4-9" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M29 4v10H19" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`);
export const home = () => svg('0 0 40 40', `<path d="M6 19L20 7l14 12M10 16v16h7v-9h6v9h7V16" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>`);
export const rotate = () => svg('0 0 80 80', `
  <rect x="26" y="8" width="28" height="48" rx="6" fill="#fffaf0" stroke="#5a3418" stroke-width="4"/>
  <circle cx="40" cy="50" r="2.5" fill="#5a3418"/>
  <path d="M12 60a30 30 0 0 0 46 12" fill="none" stroke="#f7931e" stroke-width="5" stroke-linecap="round"/>
  <path d="M58 64l1 9-9 0" fill="none" stroke="#f7931e" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`, 'ico-rotate');
export const check = () => svg('0 0 24 24', `<path d="M5 12.5l4.5 4.5L19 7" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>`);
export const clock = () => svg('0 0 40 40', `<circle cx="20" cy="22" r="14" fill="#fffaf0" stroke="currentColor" stroke-width="4"/><path d="M20 14v8l5 4" stroke="currentColor" stroke-width="4" stroke-linecap="round" fill="none"/><path d="M15 4h10" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>`);
export const speaker = () => svg('0 0 40 40', `<path d="M6 15h7l9-8v26l-9-8H6z" fill="currentColor"/><path d="M27 13c3 4 3 10 0 14M31 9c5 6 5 16 0 22" stroke="currentColor" stroke-width="3.5" fill="none" stroke-linecap="round"/>`);

export const belly = () => svg('0 0 64 64', `
  <defs><clipPath id="bellyClip"><circle cx="32" cy="34" r="25"/></clipPath></defs>
  <circle cx="32" cy="34" r="27.5" fill="#3b2314"/>
  <circle cx="32" cy="34" r="25" fill="#fff4dc"/>
  <g clip-path="url(#bellyClip)">
   <g class="belly-lvl"><rect x="0" y="0" width="64" height="70" fill="#f7931e"/>
    <path d="M-16 0q8-5 16 0t16 0 16 0 16 0 16 0 16 0v6h-96z" fill="#ffb347" class="belly-wave"/></g>
   <g stroke="#3b2314" stroke-width="3.2" stroke-linecap="round" fill="none" opacity=".8"><path d="M9 26q4 8 0 16"/><path d="M15 21q3 6 1 11"/><path d="M55 26q-4 8 0 16"/><path d="M49 21q-3 6-1 11"/></g>
   <path d="M30 42q2 4 4 0" stroke="#7a3f1e" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M29 42q3-2 6 0" stroke="#7a3f1e" stroke-width="1.6" fill="none" opacity=".6"/>
   <ellipse cx="21" cy="20" rx="8" ry="4.5" fill="#fff" opacity=".5" transform="rotate(-30 21 20)"/></g>
  <circle cx="32" cy="34" r="25" fill="none" stroke="#3b2314" stroke-width="1" opacity=".3"/>`, 'ico-belly');

export const fork = () => svg('0 0 24 64', `<path d="M4 4v16a8 8 0 0 0 6 7.7V60a2 2 0 0 0 4 0V27.7A8 8 0 0 0 20 20V4M9 4v14M15 4v14" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>`, 'ico-fork');

// Original cartoon fat-cat head that peeks over the logo (lids blink via .cat-lids).
export const peekCat = () => svg('0 0 200 150', `
  <g stroke="#3b2314" stroke-width="5" stroke-linejoin="round">
    <path d="M46 62C34 40 34 18 40 6c16 6 32 18 42 32z" fill="#f7931e"/><path d="M154 62c12-22 12-44 6-56-16 6-32 18-42 32z" fill="#f7931e"/>
    <path d="M50 52c-6-14-6-28-4-36 10 5 19 13 25 22z" fill="#ffb08a" stroke-width="0"/><path d="M150 52c6-14 6-28 4-36-10 5-19 13-25 22z" fill="#ffb08a" stroke-width="0"/>
    <ellipse cx="100" cy="96" rx="78" ry="60" fill="#f7931e"/>
  </g>
  <g stroke="#3b2314" stroke-width="5" stroke-linecap="round" fill="none"><path d="M88 40l3 13M100 37v15M112 40l-3 13"/><path d="M26 96h14M24 110l15-3M174 96h-14M176 110l-15-3"/></g>
  <ellipse cx="86" cy="122" rx="24" ry="17" fill="#ffd27a"/><ellipse cx="114" cy="122" rx="24" ry="17" fill="#ffd27a"/>
  <g stroke="#3b2314" stroke-width="4.5"><ellipse cx="78" cy="84" rx="23" ry="28" fill="#fff"/><ellipse cx="122" cy="84" rx="23" ry="28" fill="#fff"/></g>
  <circle class="cat-pupil" cx="86" cy="97" r="7" fill="#1d120a"/><circle class="cat-pupil" cx="114" cy="97" r="7" fill="#1d120a"/>
  <g class="cat-lids" stroke="#3b2314" stroke-width="4.5" stroke-linejoin="round">
    <path d="M55 84a23 28 0 0 1 46 0c-11 3-35 3-46 0z" fill="#f7931e"/><path d="M99 84a23 28 0 0 1 46 0c-11 3-35 3-46 0z" fill="#f7931e"/></g>
  <ellipse cx="100" cy="110" rx="9" ry="6" fill="#ff8f86" stroke="#3b2314" stroke-width="3"/>
  <path d="M100 116c-2 9-14 12-22 6M100 116c2 9 14 12 22 6" stroke="#3b2314" stroke-width="4" fill="none" stroke-linecap="round"/>
  <g fill="#c4572b"><circle cx="74" cy="124" r="2.2"/><circle cx="82" cy="130" r="2.2"/><circle cx="118" cy="130" r="2.2"/><circle cx="126" cy="124" r="2.2"/></g>`, 'ico-cat');

export const catPaws = () => svg('0 0 200 40', `
  <g fill="#f7931e" stroke="#3b2314" stroke-width="4.5"><ellipse cx="44" cy="20" rx="26" ry="16"/><ellipse cx="156" cy="20" rx="26" ry="16"/></g>
  <g stroke="#3b2314" stroke-width="3.5" stroke-linecap="round"><path d="M36 26v8M48 26v8M148 26v8M160 26v8"/></g>`, 'ico-catpaws');
export const forkKnife = () => svg('0 0 64 64', `
  <g fill="#fffaf0" stroke="#5a3418" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round">
    <path d="M14 6v16a7 7 0 0 0 5 6.7V58a3.5 3.5 0 0 0 7 0V28.7A7 7 0 0 0 31 22V6M20.5 6v14M24.5 6v14"/>
    <path d="M46 58V36c-5-2-8-8-8-16 0-9 4-14 8-15a3 3 0 0 1 4 3v50a2 2 0 0 1-4 0z"/></g>`, 'ico-forkknife');
export const dog = () => svg('0 0 100 100', `
  <ellipse cx="22" cy="52" rx="13" ry="27" fill="#8a5a2e" transform="rotate(14 22 52)"/>
  <ellipse cx="78" cy="52" rx="13" ry="27" fill="#8a5a2e" transform="rotate(-14 78 52)"/>
  <ellipse cx="50" cy="48" rx="30" ry="32" fill="#f2c94c"/>
  <ellipse cx="50" cy="68" rx="20" ry="15" fill="#f8dc84"/>
  <circle cx="39" cy="42" r="6.5" fill="#fff"/><circle cx="61" cy="42" r="6.5" fill="#fff"/>
  <circle cx="40" cy="43" r="3.2" fill="#2b1a10"/><circle cx="60" cy="43" r="3.2" fill="#2b1a10"/>
  <ellipse cx="50" cy="58" rx="7" ry="5" fill="#2b1a10"/>
  <path d="M42 68q8 6 16 0" fill="none" stroke="#2b1a10" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M51 70q1 16 9 15q7-1 4-15z" fill="#ff7a8a" stroke="#c94a5a" stroke-width="1.5"/>`);
export const mystery = () => svg('0 0 100 100', `
  <circle cx="50" cy="50" r="34" fill="#a8977c"/>
  <text x="50" y="68" text-anchor="middle" font-size="52" font-weight="800" fill="#fffaf0" font-family="sans-serif">?</text>`);
