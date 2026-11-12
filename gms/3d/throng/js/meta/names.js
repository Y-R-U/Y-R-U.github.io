import { hash32 } from './hash.js';

const REGIONS = [
  { w: 26, flags: ['🇺🇸', '🇬🇧', '🇨🇦', '🇦🇺', '🇳🇿', '🇮🇪'], names: ['Jake', 'Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'Mason', 'Chloe', 'Ethan', 'Grace', 'Tyler', 'Ruby', 'Jack', 'Lily', 'Owen', 'Zoe', 'Riley', 'Harper', 'Connor', 'Maddie'] },
  { w: 16, flags: ['🇧🇷', '🇲🇽', '🇪🇸', '🇦🇷', '🇨🇱', '🇨🇴', '🇵🇹'], names: ['Mateo', 'Lucia', 'Diego', 'Sofia', 'Joao', 'Camila', 'Pablo', 'Valentina', 'Rafa', 'Isabela', 'Thiago', 'Mariana', 'Javi', 'Bruna', 'Nico', 'Paula'] },
  { w: 16, flags: ['🇩🇪', '🇫🇷', '🇮🇹', '🇳🇱', '🇵🇱', '🇸🇪', '🇳🇴', '🇺🇦'], names: ['Lukas', 'Lea', 'Hugo', 'Chloé', 'Marco', 'Giulia', 'Daan', 'Sanne', 'Kuba', 'Zofia', 'Erik', 'Elsa', 'Jonas', 'Anouk', 'Luca', 'Mila', 'Oskar', 'Inès'] },
  { w: 12, flags: ['🇯🇵', '🇰🇷'], names: ['Haruto', 'Yui', 'Sota', 'Aoi', 'Ren', 'Hina', 'Minjun', 'Seoyeon', 'Jiho', 'Yuna', 'Kaito', 'Sakura'] },
  { w: 14, flags: ['🇮🇩', '🇵🇭', '🇻🇳', '🇹🇭', '🇲🇾', '🇸🇬'], names: ['Budi', 'Putri', 'Miguel', 'Andrea', 'Minh', 'Linh', 'Niran', 'Ploy', 'Aiman', 'Nurul', 'Wei', 'Jia'] },
  { w: 8, flags: ['🇮🇳'], names: ['Arjun', 'Priya', 'Rohan', 'Ananya', 'Vikram', 'Isha', 'Kabir', 'Diya', 'Aditya', 'Meera'] },
  { w: 8, flags: ['🇹🇷', '🇪🇬', '🇿🇦', '🇳🇬'], names: ['Emre', 'Zeynep', 'Omar', 'Layla', 'Thabo', 'Naledi', 'Tunde', 'Amara', 'Yusuf', 'Elif'] },
];
const W_TOTAL = REGIONS.reduce((a, r) => a + r.w, 0);

const ADJ = ['Shadow', 'Neon', 'Turbo', 'Pixel', 'Mega', 'Ultra', 'Crazy', 'Silent', 'Lucky', 'Frosty', 'Hyper', 'Cosmic',
  'Rapid', 'Golden', 'Iron', 'Night', 'Sneaky', 'Wild', 'Mighty', 'Tiny', 'Salty', 'Spicy', 'Lazy', 'Epic', 'Rogue',
  'Fluffy', 'Atomic', 'Crimson', 'Savage', 'Sleepy', 'Funky', 'Grumpy', 'Royal', 'Stealthy', 'Chunky', 'Sly'];
const NOUN = ['Wolf', 'Fox', 'Ninja', 'Tiger', 'Panda', 'Dragon', 'Ghost', 'Viper', 'Falcon', 'Bear', 'Shark', 'Llama',
  'Otter', 'Goose', 'Knight', 'Wizard', 'Pirate', 'Raven', 'Cobra', 'Moose', 'Taco', 'Noodle', 'Potato', 'Waffle',
  'Pickle', 'Badger', 'Hawk', 'Comet', 'Rocket', 'Mango', 'Yeti', 'Gecko', 'Penguin', 'Kraken', 'Biscuit', 'Hamster'];
const SOLO = ['TheCrowdFather', 'MobBoss', 'CrowdSurfer', 'PeoplePleaser', 'HerdNerd', 'FlashMob', 'RushHour',
  'StreetKing', 'BusyBee', 'ParadeLeader', 'SquadGoals', 'BigCrowdEnergy', 'NoChill', 'GGnoRE', 'JustVibing',
  'Mr Waddles', 'dr. noodle', 'Captain K', 'Sir Lancelot', 'Lil Boss', 'popcorn', 'beans', 'snek', 'hopper', 'OGsteve'];
const CLAN = ['GG', 'TRX', 'ZEN', 'MOB', '404', 'OG', 'KRW', 'FLX', 'NVA', 'RIP', 'BRB', 'WOW', 'SKY', 'AFK'];

function region(h) {
  let x = h % W_TOTAL;
  for (const r of REGIONS) { if (x < r.w) return r; x -= r.w; }
  return REGIONS[0];
}

const digits = (h) => [String(h % 100).padStart(2, '0'), String(1990 + (h % 20)), String(h % 1000), String(h % 10)][(h >>> 7) % 4];

// One believable player for any key (a ladder rank, a lobby slot). Different hash streams pick each part.
export function playerFor(key) {
  const h0 = hash32('n0:' + key), h1 = hash32('n1:' + key), h2 = hash32('n2:' + key), h3 = hash32('n3:' + key);
  const reg = region(h0);
  const flag = reg.flags[h1 % reg.flags.length];
  const style = h2 % 100;
  let name;
  if (style < 34) {
    const a = ADJ[h1 % ADJ.length], n = NOUN[h3 % NOUN.length];
    const v = (h2 >>> 8) % 6;
    name = v === 0 ? a + n : v === 1 ? `${a.toLowerCase()}_${n.toLowerCase()}` : v === 2 ? `x${a}${n}x` : v === 3 ? a + n + digits(h3 >>> 3) : v === 4 ? `${a}_${n}` : `${a}.${n}`;
  } else if (style < 74) {
    const f = reg.names[h3 % reg.names.length];
    const v = (h2 >>> 8) % 6;
    name = v === 0 ? f : v === 1 ? `${f.toLowerCase()}_${digits(h1 >>> 5)}` : v === 2 ? `${f} ${String.fromCharCode(65 + (h1 >>> 9) % 26)}` : v === 3 ? f + digits(h0 >>> 3) : v === 4 ? f.toLowerCase() + f.slice(-1).toLowerCase() : `${f}${NOUN[(h1 >>> 4) % NOUN.length]}`;
  } else if (style < 88) {
    const tag = CLAN[h3 % CLAN.length];
    const base = (h1 >>> 3) % 2 ? reg.names[(h0 >>> 5) % reg.names.length] : NOUN[(h0 >>> 5) % NOUN.length] + digits(h2 >>> 11);
    name = `[${tag}] ${base}`;
  } else {
    name = SOLO[h3 % SOLO.length] + ((h1 >>> 6) % 3 ? '' : digits(h0 >>> 9));
  }
  return { name: name.slice(0, 16), flag };
}

export const POOL_SIZE = REGIONS.reduce((a, r) => a + r.names.length * 6, 0) + ADJ.length * NOUN.length * 6 + CLAN.length * 60 + SOLO.length * 4;
