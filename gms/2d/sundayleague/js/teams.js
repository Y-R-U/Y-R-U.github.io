// ---- team & squad data: 4 divisions of clubs, nations, name generation ----
import { mulberry32, strSeed } from './util.js';
import { SKINS, HAIRS } from './sprites.js';

const K = (shirt, sleeve, shorts, socks) => ({ shirt, sleeve, shorts, socks });

// ---------------- clubs (div 4 = bottom). User replaces the last div-4 club.
export const CLUBS = [
  // Division 1 — The Crown League
  { name: 'Redbridge City',   short: 'RED', kit: K('#d21f2b', '#ffffff', '#ffffff', '#d21f2b'), rating: 91, div: 1 },
  { name: 'Albion Athletic',  short: 'ALB', kit: K('#1b4fa0', '#ffffff', '#ffffff', '#1b4fa0'), rating: 88, div: 1 },
  { name: 'Kingsholm United', short: 'KNG', kit: K('#2b2b2b', '#e8b33a', '#2b2b2b', '#e8b33a'), rating: 86, div: 1 },
  { name: 'Sporting Vale',    short: 'SPV', kit: K('#0a8a4a', '#ffffff', '#ffffff', '#0a8a4a'), rating: 84, div: 1 },
  { name: 'Northgate FC',     short: 'NOR', kit: K('#7a1fa0', '#ffffff', '#ffffff', '#7a1fa0'), rating: 82, div: 1 },
  { name: 'Merton Orient',    short: 'MER', kit: K('#e86a10', '#1b1b1b', '#1b1b1b', '#e86a10'), rating: 80, div: 1 },
  { name: 'Harbour Rovers',   short: 'HBR', kit: K('#18a0b8', '#ffffff', '#18344a', '#18a0b8'), rating: 79, div: 1 },
  { name: 'Westfield Wed.',   short: 'WSF', kit: K('#ffffff', '#d21f2b', '#d21f2b', '#ffffff'), rating: 78, div: 1 },
  // Division 2 — National League
  { name: 'Ironworks Town',   short: 'IRN', kit: K('#8a8f98', '#d21f2b', '#2b2b2b', '#8a8f98'), rating: 74, div: 2 },
  { name: 'Saltmarsh FC',     short: 'SLT', kit: K('#1b7ab8', '#e8e33a', '#1b344a', '#1b7ab8'), rating: 72, div: 2 },
  { name: 'Coppergate FC',    short: 'CPG', kit: K('#b06a2a', '#ffffff', '#ffffff', '#b06a2a'), rating: 70, div: 2 },
  { name: 'Foxton Forest',    short: 'FOX', kit: K('#c8481f', '#ffffff', '#ffffff', '#c8481f'), rating: 68, div: 2 },
  { name: 'Millhouse United', short: 'MIL', kit: K('#3a3f8a', '#e8b33a', '#ffffff', '#3a3f8a'), rating: 66, div: 2 },
  { name: 'Griffin Park',     short: 'GRF', kit: K('#d21f6a', '#ffffff', '#2b2b2b', '#d21f6a'), rating: 65, div: 2 },
  { name: 'Eastdock Albion',  short: 'EDA', kit: K('#0a6a3a', '#e8e33a', '#ffffff', '#0a6a3a'), rating: 64, div: 2 },
  { name: 'Wanderers 88',     short: 'W88', kit: K('#e8e8e8', '#1b4fa0', '#1b4fa0', '#e8e8e8'), rating: 62, div: 2 },
  // Division 3 — County League
  { name: 'Bricklayers FC',   short: 'BRK', kit: K('#a84a3a', '#e8dcc8', '#e8dcc8', '#a84a3a'), rating: 58, div: 3 },
  { name: 'Thornbury Swifts', short: 'THS', kit: K('#e8e33a', '#2b2b2b', '#2b2b2b', '#e8e33a'), rating: 56, div: 3 },
  { name: 'Old Colliery',     short: 'OLC', kit: K('#2b2b2b', '#ffffff', '#ffffff', '#2b2b2b'), rating: 54, div: 3 },
  { name: 'Ferryman Rovers',  short: 'FER', kit: K('#1b8a8a', '#ffffff', '#ffffff', '#1b8a8a'), rating: 52, div: 3 },
  { name: 'Hobble Hill',      short: 'HOB', kit: K('#6a8a2a', '#ffffff', '#2b2b2b', '#6a8a2a'), rating: 51, div: 3 },
  { name: 'Victoria Steam',   short: 'VIC', kit: K('#8a2a4a', '#e8b33a', '#e8b33a', '#8a2a4a'), rating: 50, div: 3 },
  { name: 'Padlock United',   short: 'PAD', kit: K('#4a6a9a', '#e8e8e8', '#e8e8e8', '#4a6a9a'), rating: 49, div: 3 },
  { name: 'Crowfield FC',     short: 'CRW', kit: K('#3a3a4a', '#8a8f98', '#8a8f98', '#3a3a4a'), rating: 48, div: 3 },
  // Division 4 — Sunday Park League
  { name: 'Muddy Lane Wdrs',  short: 'MUD', kit: K('#6a5a3a', '#e8dcc8', '#e8dcc8', '#6a5a3a'), rating: 44, div: 4 },
  { name: 'The Dog & Whistle',short: 'DOG', kit: K('#8a6a1a', '#2b2b2b', '#2b2b2b', '#8a6a1a'), rating: 42, div: 4 },
  { name: 'Real Alehouse',    short: 'ALE', kit: K('#c89a2a', '#ffffff', '#ffffff', '#c89a2a'), rating: 41, div: 4 },
  { name: 'Puddleton United', short: 'PUD', kit: K('#4a8ab8', '#e8e8e8', '#e8e8e8', '#4a8ab8'), rating: 40, div: 4 },
  { name: 'Bench Warmers FC', short: 'BEN', kit: K('#9a4a8a', '#e8e8e8', '#2b2b2b', '#9a4a8a'), rating: 38, div: 4 },
  { name: 'Crusty Sports',    short: 'CRS', kit: K('#b8b83a', '#6a3a1a', '#6a3a1a', '#b8b83a'), rating: 37, div: 4 },
  { name: 'Sunday Slackers',  short: 'SLK', kit: K('#5a5a5a', '#d21f2b', '#2b2b2b', '#5a5a5a'), rating: 36, div: 4 },
  { name: 'Park Rangers',     short: 'PKR', kit: K('#2a7a5a', '#e8e8e8', '#e8e8e8', '#2a7a5a'), rating: 35, div: 4 }, // replaced by user team
];

export const DIV_NAMES = { 1: 'Crown League', 2: 'National League', 3: 'County League', 4: 'Sunday Park League' };

// ---------------- world cup nations
export const NATIONS = [
  { name: 'Brazil',      short: 'BRA', kit: K('#e8d02a', '#1b7a3a', '#1b4fa0', '#e8e8e8'), rating: 93, region: 'latin' },
  { name: 'Argentina',   short: 'ARG', kit: K('#8ac8e8', '#ffffff', '#1b1b4a', '#8ac8e8'), rating: 92, region: 'latin' },
  { name: 'France',      short: 'FRA', kit: K('#1b2a6a', '#ffffff', '#ffffff', '#d21f2b'), rating: 91, region: 'euro' },
  { name: 'England',     short: 'ENG', kit: K('#ffffff', '#1b2a6a', '#1b2a6a', '#ffffff'), rating: 88, region: 'uk' },
  { name: 'Spain',       short: 'ESP', kit: K('#c8102a', '#e8b33a', '#1b1b4a', '#c8102a'), rating: 89, region: 'latin' },
  { name: 'Germany',     short: 'GER', kit: K('#ffffff', '#1b1b1b', '#1b1b1b', '#ffffff'), rating: 88, region: 'euro' },
  { name: 'Italy',       short: 'ITA', kit: K('#1b5ab8', '#ffffff', '#ffffff', '#1b5ab8'), rating: 87, region: 'euro' },
  { name: 'Netherlands', short: 'NED', kit: K('#e8681a', '#ffffff', '#ffffff', '#e8681a'), rating: 86, region: 'euro' },
  { name: 'Portugal',    short: 'POR', kit: K('#8a1b2a', '#1b7a3a', '#1b7a3a', '#8a1b2a'), rating: 87, region: 'latin' },
  { name: 'Japan',       short: 'JPN', kit: K('#1b2a8a', '#ffffff', '#ffffff', '#1b2a8a'), rating: 82, region: 'asian' },
  { name: 'USA',         short: 'USA', kit: K('#ffffff', '#d21f2b', '#1b2a6a', '#ffffff'), rating: 80, region: 'uk' },
  { name: 'Mexico',      short: 'MEX', kit: K('#1b7a3a', '#ffffff', '#ffffff', '#d21f2b'), rating: 81, region: 'latin' },
  { name: 'Nigeria',     short: 'NGA', kit: K('#1b9a4a', '#ffffff', '#1b9a4a', '#ffffff'), rating: 80, region: 'african' },
  { name: 'Egypt',       short: 'EGY', kit: K('#d21f2b', '#ffffff', '#ffffff', '#1b1b1b'), rating: 78, region: 'african' },
  { name: 'South Korea', short: 'KOR', kit: K('#d2102a', '#1b1b1b', '#1b1b1b', '#d2102a'), rating: 79, region: 'asian' },
  { name: 'Australia',   short: 'AUS', kit: K('#e8b31a', '#1b7a3a', '#1b7a3a', '#e8b31a'), rating: 77, region: 'uk' },
];

// ---------------- champions cup giants (career endgame)
export const GIANTS = [
  { name: 'Real Madrona',    short: 'RMA', kit: K('#ffffff', '#e8b33a', '#ffffff', '#ffffff'), rating: 95, region: 'latin' },
  { name: 'FC Barcelunar',   short: 'BCL', kit: K('#a01b4a', '#1b4fa0', '#1b1b4a', '#a01b4a'), rating: 94, region: 'latin' },
  { name: 'Bayern Moonchen', short: 'BAY', kit: K('#d21f2b', '#ffffff', '#d21f2b', '#d21f2b'), rating: 93, region: 'euro' },
  { name: 'Juvental',        short: 'JUV', kit: K('#ffffff', '#1b1b1b', '#1b1b1b', '#ffffff'), rating: 92, region: 'euro' },
  { name: 'Ajaxo Dam',       short: 'AJX', kit: K('#ffffff', '#d21f2b', '#ffffff', '#d21f2b'), rating: 90, region: 'euro' },
  { name: 'Boca Palmeras',   short: 'BOC', kit: K('#1b2a6a', '#e8b33a', '#1b2a6a', '#e8b33a'), rating: 91, region: 'latin' },
  { name: 'Porto Galactico', short: 'PRT', kit: K('#1b4fa0', '#ffffff', '#1b4fa0', '#1b4fa0'), rating: 90, region: 'latin' },
];

// kit palette for the team creator
export const KIT_CHOICES = [
  '#d21f2b', '#1b4fa0', '#0a8a4a', '#e8d02a', '#e8681a', '#7a1fa0',
  '#18a0b8', '#d21f6a', '#ffffff', '#2b2b2b', '#8a8f98', '#8ac8e8',
];

// GK kits, picked to clash with neither team
const GK_KITS = [
  K('#c8e81a', '#1b1b1b', '#1b1b1b', '#c8e81a'),
  K('#e8681a', '#1b1b1b', '#1b1b1b', '#e8681a'),
  K('#18b8a0', '#1b1b1b', '#1b1b1b', '#18b8a0'),
  K('#e81bb8', '#1b1b1b', '#1b1b1b', '#e81bb8'),
  K('#8a8f98', '#1b1b1b', '#1b1b1b', '#8a8f98'),
];

function hexRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function colorDist(a, b) {
  const [r1, g1, b1] = hexRgb(a), [r2, g2, b2] = hexRgb(b);
  return Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
}

// if shirts clash, flip away team to an alt kit; then pick GK kits
export function resolveKits(kitA, kitB) {
  let away = kitB;
  if (colorDist(kitA.shirt, kitB.shirt) < 190) {
    // change kit: head-to-toe single colour so teams never blur together
    const alt = colorDist(kitA.shirt, kitB.shorts) >= 190 ? kitB.shorts
      : colorDist(kitA.shirt, '#ffffff') >= 190 ? '#ffffff' : '#2b2b2b';
    away = K(alt, kitB.shirt, alt, alt);
  }
  const gks = [];
  for (const gk of GK_KITS) {
    if (colorDist(gk.shirt, kitA.shirt) >= 150 && colorDist(gk.shirt, away.shirt) >= 150) gks.push(gk);
    if (gks.length === 2) break;
  }
  while (gks.length < 2) gks.push(GK_KITS[gks.length]);
  return { home: kitA, away, gkHome: gks[0], gkAway: gks[1] };
}

// ---------------- name generation
const FIRST = 'ABCDEFGHIJKLMNOPRSTVW';
const SURNAMES = {
  uk: ['Smith', 'Jones', 'Hodge', 'Barnes', 'Clarke', 'Wright', 'Potts', 'Higgins', 'Shaw', 'Cole', 'Dobbs', 'Mercer', 'Flint', 'Ogden', 'Pryce', 'Wick', 'Tanner', 'Brook', 'Hale', 'Judd'],
  latin: ['Silva', 'Santos', 'Gomez', 'Ruiz', 'Costa', 'Vega', 'Morales', 'Delgado', 'Ramos', 'Ortiz', 'Cruz', 'Batista', 'Pinto', 'Rocha', 'Vidal', 'Sosa'],
  euro: ['Muller', 'Weber', 'Novak', 'Dubois', 'Rossi', 'Janssen', 'Bakker', 'Fischer', 'Moreau', 'Conti', 'Visser', 'Keller', 'Lang', 'Roth', 'Bruno', 'Peeters'],
  african: ['Okafor', 'Mensah', 'Diallo', 'Traore', 'Adebayo', 'Kamara', 'Sow', 'Keita', 'Osei', 'Nwosu', 'Abdi', 'Toure', 'Chukwu', 'Banda', 'Moyo', 'Salah'],
  asian: ['Tanaka', 'Kim', 'Sato', 'Park', 'Nakamura', 'Lee', 'Suzuki', 'Choi', 'Yamada', 'Kang', 'Ito', 'Han', 'Mori', 'Song', 'Endo', 'Yun'],
};
const REGION_MIX = { // squads mostly of their region, with imports
  uk: ['uk', 'uk', 'uk', 'african', 'euro', 'latin'],
  latin: ['latin', 'latin', 'latin', 'latin', 'euro', 'african'],
  euro: ['euro', 'euro', 'euro', 'african', 'latin', 'uk'],
  african: ['african', 'african', 'african', 'african', 'uk', 'latin'],
  asian: ['asian', 'asian', 'asian', 'asian', 'euro', 'latin'],
};

// deterministic 11-man squad for a team def
export function genSquad(def) {
  const rng = mulberry32(strSeed(def.name));
  const region = def.region || 'uk';
  const used = new Set();
  const squad = [];
  for (let i = 0; i < 11; i++) {
    const pool = SURNAMES[REGION_MIX[region][(rng() * 6) | 0]];
    let last = pool[(rng() * pool.length) | 0];
    let guard = 0;
    while (used.has(last) && guard++ < 20) last = pool[(rng() * pool.length) | 0];
    used.add(last);
    squad.push({
      name: FIRST[(rng() * FIRST.length) | 0] + '. ' + last,
      num: i === 0 ? 1 : (i + 1),
      skin: SKINS[(rng() * SKINS.length) | 0],
      hair: HAIRS[(rng() * HAIRS.length) | 0],
      style: (rng() * 4) | 0,
      pace: 0.93 + rng() * 0.14,          // personal speed multiplier
      skill: 0.9 + rng() * 0.2,           // personal accuracy multiplier
    });
  }
  // one star player up front
  squad[9 + ((rng() * 2) | 0)].pace += 0.06;
  return squad;
}

// normalise any club/nation/user-career object into a match team def
export function teamDef(src) {
  return {
    name: src.name, short: src.short,
    kit: src.kit, rating: src.rating,
    region: src.region || 'uk',
    badge: src.badge ?? null,
    user: !!src.user,
  };
}
