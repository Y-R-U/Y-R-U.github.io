import { LINES } from './lines.js?v=20261004c';

const ROSTER = [
  ['lemonade', 'Lola Lemon', '👧', 'Zesty', 'speed', 0.1, 'Works 10% faster'],
  ['foodtruck', 'Taco Tom', '🧔', 'Showman', 'harvest', 0.25, 'Return harvest ×1.75'],
  ['barber', 'Sal Snips', '💇', 'Smooth Talker', 'sigma', 0.1, 'Sells 10% more on the spot'],
  ['cafe', 'Bea Barista', '👩‍🦰', 'Early Bird', 'morning', 0.25, '+25% from 06:00 to 12:00'],
  ['carwash', 'Duke Suds', '👨‍🔧', 'Hoarder', 'shelf', 0.5, 'Shelf ×1.5'],
  ['petsalon', 'Pip Paws', '🧑‍🦱', 'Animal Magnet', 'dog', 0.25, '+25% if the family has a dog'],
  ['fishchips', 'Mo Batter', '👨‍🍳', 'Night Owl', 'offline', 3600, 'Offline cap +1 h'],
  ['ferry', 'Captain Rosa', '👩‍✈️', 'Punctual', 'speed', 0.1, 'Works 10% faster'],
  ['boatyard', 'Hank Hull', '👷', 'Penny Pincher', 'cost', 0.05, 'Levels 5% cheaper here'],
  ['boutique', 'Vivi Velvet', '💃', 'Trendsetter', 'events', 0.5, 'Event rewards ×1.5'],
  ['bistro', 'Chef Gus', '👨‍🍳', 'Perfectionist', 'star', 0.5, '+50% once Lv 50'],
  ['appstudio', 'Dev Kai', '🧑‍💻', 'Automator', 'autopile', 1, 'Sells the full pile itself'],
];

export const MANAGERS = [
  ...ROSTER.map(([lineId, name, emoji, trait, kind, value, text]) => {
    const line = LINES.find((l) => l.id === lineId);
    return { id: 'm_' + lineId, lineId, name, emoji, trait, kind, value, text, hireCost: line.managerCost };
  }),
  { id: 'm_cuppula', lineId: 'cafe', name: 'Count Cuppula', emoji: '🧛', trait: 'Nocturnal', kind: 'night', value: 0.5, text: '+50% from 18:00 to 06:00 · offline +2 h', offline: 7200, seasonal: 'hollows-eve' },
];

export const MANAGER_LEVELS = {
  max: 5,
  mult: [1, 1.1, 1.2, 1.3, 1.4],
  cash: [0, 20, 200, 2e3, 2e4],
  tickets: [0, 2, 4, 7, 10],
  slots: [1, 1, 2, 2, 2],
};
