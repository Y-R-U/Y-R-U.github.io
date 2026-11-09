// The bundled event schedule (works offline; a server can add more later).
// events3: these are yearly *series*; js/events/calendar.js turns each into one dated run per year
// (`${series}-${year}`) and fills the weekends between them with data/weekends.js.
import spooky from './spooky_open.js';
import frost from './frost_fair.js';
// events2: 2027 events (Festival Isles holes mixed with Sky Isles ones)
import lunar from './lunar_lanterns.js';
import candy from './candy_carnival.js';
import eggs from './egg_hunt.js';
import games from './sky_games.js';
// events4: Deep Dive (Sunken Reef, June) and the Battle Royale Cup (ball hits, September)
import deep from './deep_dive.js';
import battle from './battle_royale.js';

export const SERIES = [spooky, frost, lunar, candy, eggs, games, deep, battle];
