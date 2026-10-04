import { CHARACTERS, hatForTier, hatForPomfrey } from '../kit/crowd.js?v=20261004g';

// Who plays whom. Named characters wear lane A's costumes (kit.CHARACTERS via crowd.dress); bit parts get a look in
// the same vocabulary (acc / stache / hat names). hat = [type, scale, color] or {type, scale, color}.
const D = (dress) => ({ dress, hat: { type: CHARACTERS[dress]?.hat ?? -1, scale: CHARACTERS[dress]?.hatScale ?? 1, color: CHARACTERS[dress]?.hatColor || 'tan' } });
const L = (k, look, hat, s = 1.05) => ({ look: { k, ...look }, hat, s });
export const CHARS = {
  mabel: D('mabel'), pickles: D('pickles'), pomfrey: D('pomfrey'), wendell: D('wendell'), mortimer: D('mortimer'),
  fingers: D('fingers'), bart: D('bart'), stranger: D('you'), pete: D('pete'), lulu: D('lulu'), wife: D('wife'),
  longjohns: D('longjohns'), mulligan: D('mulligan1'), mulligan2: D('mulligan2'), nubbin: D('nubbin'), thrupp: D('thrupp'),
  hortense: D('hortense'), duster: D('stranger'),
  drunk: L('drunk', { top: '#e9e4da', bot: '#4a5878', skin: 2, hair: 5, style: 1, acc: ['bottle', 'scarf'], stache: 'chops' }, ['droopy', 1, 'brown']),
  cowboy: L('cowboy', { top: '#d9545e', bot: '#4a5878', skin: 3, hair: 0, style: 0, acc: ['gunbelt', 'scarf'], stache: 'walrus' }, ['stetson', 1.2, 'tan']),
  cardsharp: L('cardsharp', { top: '#2f3e66', bot: '#2b2230', skin: 0, hair: 8, style: 2, acc: ['vest', 'cigar'], stache: 'pencil' }, ['bowler', 1, 'black']),
  goon: L('goon', { top: '#7a4f5a', bot: '#5b5f66', skin: 3, hair: 1, style: 0, acc: ['mask', 'gunbelt'], stache: 'beard' }, ['derby', 1.05, 'grey']),
  hiredgun: L('hiredgun', { top: '#5b5f66', bot: '#3f4452', skin: 4, hair: 0, style: 0, acc: ['duster', 'gunbelt', 'cigar'], stache: 'handlebar' }, ['stetson', 1.35, 'dark'], 1.15),
  nephew: L('nephew', { top: '#2b2230', bot: '#46343c', skin: 5, hair: 4, style: 0, acc: ['tails', 'gunbelt'], stache: -1, legs: 1.2 }, ['stovepipe', 0.62, 'black'], 1.0),
  nun: L('nun', { top: '#2b2230', bot: '#2b2230', skin: 0, hair: 0, style: 0, acc: ['dress', 'gunbelt'], stache: 'walrus' }, ['bonnet', 1.15, 'black'], 1.1),
};
export const EJECT_LOOK = { drunk: 'drunk', cowboy: 'cowboy', cardsharp: 'cardsharp', dentist: 'pete', sheriff: 'wendell', pianist: 'fingers' };
export const OPPONENTS = ['bart', 'hiredgun', 'nephew', 'nun'];
const PASSENGER_HATS = [['stovepipe', 1.45, 'red'], ['feathered', 1.5, '#7ec2d6'], ['boater', 1.6, 'straw'], ['bonnet', 1.35, 'pink'], ['bowler', 1.7, '#7fbf5a']];
const TOPS = ['#e8776a', '#d9a441', '#5e8f8c', '#7d8fa3', '#c98b7e', '#8fa27a', '#e9e4da', '#c98a4a', '#8a5a6e', '#4f86a8'];
const BOTS = ['#4a5878', '#6b5a7d', '#3f6b74', '#8a6a52', '#5b5f66', '#2f4a66'];
const TOWN_HATS = [['stetson', 1.1, 'tan'], ['derby', 1, 'brown'], ['bowler', 1, 'black'], ['boater', 1, 'straw'], ['bonnet', 1, 'white'], ['stetson', 1.3, 'brown'], ['cap', 1, 'grey'], ['ten', 0.9, 'cream']];
const ACCS = [['vest'], ['scarf'], [], ['apron'], ['gunbelt'], ['vest', 'cigar']];
const STACHES = [-1, 'walrus', -1, 'handlebar', 'beard', -1, 'chops', 'pencil'];

export function townsfolk(i, silly = false) {
  const k = (silly ? 'pass' : 'town') + i;
  const hat = silly ? PASSENGER_HATS[i % PASSENGER_HATS.length] : TOWN_HATS[i % TOWN_HATS.length];
  return { look: { k, top: TOPS[(i * 5) % TOPS.length], bot: BOTS[(i * 3) % BOTS.length], skin: i % 6, hair: (i * 7) % 10, style: i % 5, acc: silly ? ['dress'] : ACCS[i % ACCS.length], stache: silly && i % 2 ? -1 : STACHES[i % STACHES.length] }, hat, s: 1 };
}

// Your hat for a tier (HATS row) and Pomfrey's (POMFREY_HATS row), from lane A's hat ladder.
export const hatFor = (def) => hatForTier(def);
export const pomfreyHat = (def) => hatForPomfrey(def);
