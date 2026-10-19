// Inline SVG icon set (24-unit grid, stroke = currentColor).
const S = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;

export const ICONS = {
  tank: S('<path d="M12 2.5 20 5.5v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10v-6z"/><path d="M12 6.5 16.5 8v3.6c0 2.9-1.9 5-4.5 6-2.6-1-4.5-3.1-4.5-6V8z" fill="currentColor" fill-opacity=".35"/>'),
  archer: S('<path d="M5 19 19 5"/><path d="M14 5h5v5"/><path d="M4.5 9.5C6 5.5 10 4 13 4.5M9.5 19.5c4-1.5 5.5-5.5 5-8.5"/><path d="M4 15l5 5"/>'),
  mage: S('<path d="M12 2v5M12 17v5M2 12h5M17 12h5"/><path d="M12 7.5 13.6 10.4 16.5 12 13.6 13.6 12 16.5 10.4 13.6 7.5 12 10.4 10.4z" fill="currentColor" fill-opacity=".4"/><circle cx="12" cy="12" r="8.5" stroke-dasharray="2.5 3"/>'),
  menu: S('<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1.2" fill="currentColor"/><circle cx="3.5" cy="12" r="1.2" fill="currentColor"/><circle cx="3.5" cy="18" r="1.2" fill="currentColor"/>'),
  squad: S('<circle cx="12" cy="7.5" r="3.3" fill="currentColor" fill-opacity=".3"/><path d="M5.5 20c.4-3.8 3-6 6.5-6s6.1 2.2 6.5 6z" fill="currentColor" fill-opacity=".3"/><circle cx="5" cy="9" r="2.3"/><circle cx="19" cy="9" r="2.3"/><path d="M1.5 18c.2-2.3 1.5-3.8 3.4-4.2M22.5 18c-.2-2.3-1.5-3.8-3.4-4.2"/>'),
  info: S('<circle cx="12" cy="12" r="9.5"/><path d="M12 11v6"/><circle cx="12" cy="7.3" r=".9" fill="currentColor"/>'),
  ffwd: S('<path d="M3.5 5.5 11 12l-7.5 6.5zM12.5 5.5 20 12l-7.5 6.5z" fill="currentColor" fill-opacity=".85"/>'),
  auto: S('<path d="M19.5 9A8 8 0 0 0 5 7.3M4.5 15A8 8 0 0 0 19 16.7"/><path d="M5 3.5v4h4M19 20.5v-4h-4"/><path d="M9.3 15.5 12 8.5l2.7 7M10.2 13.3h3.6"/>'),
  credits: S('<circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity=".18"/><circle cx="12" cy="12" r="6"/><path d="M14 9.6a2.8 2.8 0 1 0 0 4.8"/>'),
  cores: S('<path d="M12 2.5 19.5 8 12 21.5 4.5 8z" fill="currentColor" fill-opacity=".3"/><path d="M4.5 8h15M9 8l3 13.5L15 8M8 2.9 9 8M16 2.9 15 8"/>'),
  scrap: S('<path d="M12 3.2 14 5.6l3.1-.5.6 3.1 2.8 1.5-1.4 2.8 1.4 2.8-2.8 1.5-.6 3.1-3.1-.5L12 20.8l-2-2.4-3.1.5-.6-3.1-2.8-1.5L4.9 12 3.5 9.2l2.8-1.5.6-3.1 3.1.5z"/><circle cx="12" cy="12" r="3"/>'),
  token: S('<path d="M12 2.5 20.5 7.5v9L12 21.5 3.5 16.5v-9z" fill="currentColor" fill-opacity=".2"/><path d="M8 9.5 12 7l4 2.5M8 9.5v5L12 17l4-2.5v-5M12 12v5M8 9.5 12 12l4-2.5"/>'),
  xp: S('<path d="M12 2.5 14.6 9H21l-5.2 4 2 6.5L12 15.6 6.2 19.5l2-6.5L3 9h6.4z" fill="currentColor" fill-opacity=".35"/>'),
  star: '<svg viewBox="0 0 24 24"><path d="M12 1.8 15 8.6l7.4.7-5.6 4.9 1.7 7.3L12 17.7l-6.5 3.8 1.7-7.3L1.6 9.3 9 8.6z" fill="currentColor"/></svg>',
  starO: S('<path d="M12 2.5 14.7 8.9l6.8.6-5.2 4.5 1.6 6.7L12 17.2l-5.9 3.5 1.6-6.7-5.2-4.5 6.8-.6z"/>'),
  lock: S('<rect x="5" y="10.5" width="14" height="10" rx="1.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'),
  fs_enter: S('<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" stroke-width="2.2"/>'),
  fs_exit: S('<path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5" stroke-width="2.2"/>'),
  gear: S('<circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>'),
  back: S('<path d="M15 4.5 7.5 12l7.5 7.5"/>'),
  close: S('<path d="M5.5 5.5 18.5 18.5M18.5 5.5 5.5 18.5"/>'),
  check: S('<path d="M4.5 12.5 9.5 17.5 19.5 6.5"/>'),
  plus: S('<path d="M12 5v14M5 12h14"/>'),
  trophy: S('<path d="M7 3.5h10v5a5 5 0 0 1-10 0z" fill="currentColor" fill-opacity=".25"/><path d="M7 5H3.5c0 3 1.5 4.5 3.8 4.8M17 5h3.5c0 3-1.5 4.5-3.8 4.8M12 13.5v4M8 20.5h8M9.5 17.5h5"/>'),
  calendar: S('<rect x="3.5" y="5" width="17" height="15.5" rx="1.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h3v3H8z" fill="currentColor"/>'),
  wrench: S('<path d="M14.5 3.5a5 5 0 0 0-4.6 6.9L3.5 16.8l3.7 3.7 6.4-6.4a5 5 0 0 0 6.9-4.6l-3 3-3-.6-.6-3z"/>'),
  flag: S('<path d="M5 21V3.5"/><path d="M5 4h12.5l-2.5 4 2.5 4H5" fill="currentColor" fill-opacity=".3"/>'),
  hex: S('<path d="M12 2.5 20.2 7.2v9.6L12 21.5l-8.2-4.7V7.2z"/>'),
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.5 19.5 12 7 19.5z" fill="currentColor"/></svg>',
  pause: S('<path d="M8 5v14M16 5v14" stroke-width="3"/>'),
  bolt: S('<path d="M13.5 2 5 13.5h6L10 22l9-12h-6.2z" fill="currentColor" fill-opacity=".45"/>'),
  sword: S('<path d="M14.5 3.5h6v6L10 20l-6-6z"/><path d="M3 21l3-3M7.5 13.5l3 3"/>'),
  map: S('<path d="M3 6.5 9 4l6 2.5 6-2.5v13.5L15 20l-6-2.5L3 20z"/><path d="M9 4v13.5M15 6.5V20"/>'),
  hq: S('<path d="M3 21h18M5 21V9l7-5 7 5v12"/><path d="M9.5 21v-6h5v6M9 11h2M13 11h2"/>'),
  recruit: S('<rect x="4" y="7" width="16" height="13" rx="1"/><path d="M4 11h16M12 7v13M12 7c-1.5-3.5-5.5-3.5-5.5-1.2C6.5 7 9 7 12 7c3 0 5.5 0 5.5-1.2C17.5 3.5 13.5 3.5 12 7"/>'),
  shield: S('<path d="M12 2.5 20 5.5v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10v-6z"/>'),
  heal: S('<path d="M9 3.5h6v5.5h5.5v6H15v5.5H9V15H3.5V9H9z" fill="currentColor" fill-opacity=".35"/>'),
  target: S('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/>'),
  burst: S('<path d="M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3.5 3.5M15.5 15.5 19 19M5 19l3.5-3.5M15.5 8.5 19 5"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/>'),
  emp: S('<circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M7.5 7.5a6.4 6.4 0 0 0 0 9M16.5 7.5a6.4 6.4 0 0 1 0 9M4.6 4.6a10.5 10.5 0 0 0 0 14.8M19.4 4.6a10.5 10.5 0 0 1 0 14.8"/>'),
  beam: S('<path d="M3 21 16 8"/><path d="M14 3l7 7-3.5 1L13 6.5z" fill="currentColor" fill-opacity=".4"/>'),
  drone: S('<circle cx="12" cy="12" r="3"/><path d="M9.5 9.5 6 6M14.5 9.5 18 6M9.5 14.5 6 18M14.5 14.5 18 18"/><circle cx="5" cy="5" r="2.3"/><circle cx="19" cy="5" r="2.3"/><circle cx="5" cy="19" r="2.3"/><circle cx="19" cy="19" r="2.3"/>'),
  missile: S('<path d="M14 3.5c3 0 6.5 0 6.5 0s0 3.5 0 6.5L10 20.5 3.5 14z"/><path d="M7 11 3 11 1.5 14M13 17v4l3-1.5M15 9l.01 0"/>'),
  overdrive: S('<path d="M12 2 21 7v10l-9 5-9-5V7z"/><path d="M13 6.5 8.5 13h4l-1 4.5 4.5-6.5h-4z" fill="currentColor"/>'),
  flame: S('<path d="M12 21.5c-3.9 0-6.5-2.6-6.5-6.2 0-3.4 2.4-5.2 3.6-8.3.9 1.6 1.4 2.8 1.4 4.3 1.3-1.2 2.3-3.6 2-8.8 3.6 2.6 6 6.6 6 11.6 0 4.1-2.6 7.4-6.5 7.4z" fill="currentColor" fill-opacity=".35"/>'),
  spiral: S('<path d="M12 12a1.5 1.5 0 1 1 1.5 1.5A3.5 3.5 0 1 1 17 10a5.5 5.5 0 1 1-5.5-5.5A7.5 7.5 0 1 1 4 12"/>'),
  slow: S('<circle cx="12" cy="13" r="8"/><path d="M12 8.5V13l3 2M9.5 2.5h5"/>'),
  down: S('<path d="M12 4v15M5.5 12.5 12 19l6.5-6.5"/>'),
  crack: S('<path d="M12 2.5 20 5.5v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10v-6z"/><path d="M12 3.5 10 9l3.5 3-2.5 5"/>'),
  taunt: S('<path d="M12 3.5v11"/><circle cx="12" cy="19" r="1.4" fill="currentColor"/><path d="M5 7 3 5M19 7l2-2M4.5 12H2M22 12h-2.5"/>'),
  eyeoff: S('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 20 20 4"/>'),
  swap: S('<path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5"/>'),
  up: S('<path d="M12 20V5M5.5 11.5 12 5l6.5 6.5"/>'),
  chest: S('<path d="M3.5 10.5h17v9h-17z" fill="currentColor" fill-opacity=".25"/><path d="M3.5 10.5V8a4 4 0 0 1 4-4h9a4 4 0 0 1 4 4v2.5M3.5 10.5h17v9h-17zM10 10.5v3h4v-3"/>'),
  user: S('<circle cx="12" cy="8" r="4"/><path d="M4 21c.6-4.4 3.8-7 8-7s7.4 2.6 8 7"/>'),
};

const ROLE_ICON = { tank: 'tank', archer: 'archer', mage: 'mage' };

export function icon(name, cls = '') {
  const span = document.createElement('span');
  span.className = 'ic' + (cls ? ' ' + cls : '');
  span.innerHTML = ICONS[name] || ICONS.hex;
  return span;
}

export function roleBadge(role, enemy = false) {
  const b = document.createElement('span');
  b.className = 'vp-role' + (enemy ? ' enemy' : '');
  b.appendChild(icon(ROLE_ICON[role] || 'hex'));
  b.title = role;
  return b;
}

// Ability -> icon heuristic until abilities carry an explicit icon id.
export function abilityIcon(ab) {
  if (!ab) return 'hex';
  const OK = ['heal', 'shield', 'emp', 'drone', 'beam', 'target', 'missile', 'burst', 'sword', 'bolt', 'overdrive', 'up', 'tank', 'archer', 'mage'];
  if (ab.icon && OK.includes(ab.icon)) return ab.icon;
  const s = ((ab.id || '') + ' ' + (ab.name || '') + ' ' + (ab.kind || ab.type || '')).toLowerCase();
  const map = [['heal', 'heal'], ['repair', 'heal'], ['shield', 'shield'], ['barrier', 'shield'], ['taunt', 'tank'], ['emp', 'emp'],
    ['drone', 'drone'], ['beam', 'beam'], ['laser', 'beam'], ['rail', 'archer'], ['snipe', 'target'], ['mark', 'target'], ['missile', 'missile'],
    ['rocket', 'missile'], ['burst', 'burst'], ['nova', 'burst'], ['slash', 'sword'], ['blade', 'sword'], ['bash', 'tank'], ['overdrive', 'overdrive'],
    ['shock', 'bolt'], ['arc', 'bolt'], ['volt', 'bolt'], ['buff', 'up'], ['boost', 'up']];
  for (const [k, v] of map) if (s.includes(k)) return v;
  return 'bolt';
}
