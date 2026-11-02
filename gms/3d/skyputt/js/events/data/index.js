// The bundled event schedule (works offline; a server can add more later).
import spooky from './spooky_open.js';
import frost from './frost_fair.js';
// events2: 2027 events (Festival Isles holes mixed with Sky Isles ones)
import lunar from './lunar_lanterns.js';
import candy from './candy_carnival.js';
import eggs from './egg_hunt.js';
import games from './sky_games.js';

export const EVENTS = [spooky, frost, lunar, candy, eggs, games];
