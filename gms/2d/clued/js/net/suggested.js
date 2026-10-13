// Suggested sets: ready-made online round lists, per mode (kids has its own). Read-only; loading one pre-fills the host
// screen, and Save set turns an edited copy into the player's own set. tools/suggest_test.mjs checks every round builds.
const R = (title, format, packs, opts = {}, difficulty = 0) => ({ title, format, packs, count: 10, opts, difficulty });
const LISTEN = { clip: 10, art: 'off', ask: 'auto', answers: 4 };

export const SUGGESTED = [
  { id: 'pub', name: 'Classic Pub Quiz', blurb: 'The Friday-night five: general, history, map, sport, theme tunes.', timing: { answerSec: 15, gapSec: 5 }, rounds: [
    R('General knowledge', 'mc', ['general'], { answers: 4, source: 'mix' }),
    R('History', 'mc', ['history', 'general~history'], { answers: 4, source: 'mix' }),
    R('Geography: name the country', 'map-click', 'all', { region: 'world', ask: 'name' }, 2),
    R('Sport', 'mc', ['sport'], { answers: 4, source: 'mix' }),
    R('Music & screen', 'listen', ['screen-themes', 'hits-1980s', 'hits-1990s', 'hits-2000s'], LISTEN),
  ] },
  { id: 'music', name: 'Music Night', blurb: 'Clips from six decades, one-hit wonders and theme tunes.', timing: { answerSec: 15, gapSec: 5 }, rounds: [
    R('Classic hits: 60s to 80s', 'listen', ['hits-1960s', 'hits-1970s', 'hits-1980s'], LISTEN),
    R('Modern hits: 90s to now', 'listen', ['hits-1990s', 'hits-2000s', 'hits-2010s', 'hits-2020s'], LISTEN),
    R('One-hit wonders', 'listen', ['one-hit-wonders'], LISTEN),
    R('Theme tunes', 'listen', ['screen-themes'], LISTEN),
    R('Artists', 'mc', ['music-artists', 'general~music'], { answers: 4, source: 'mix' }),
  ] },
  { id: 'world', name: 'Around the World', blurb: 'Flags, capitals, the map, landmarks and a pick-all round, all well-known places.', timing: { answerSec: 15, gapSec: 5 }, rounds: [
    R('Flags', 'reveal', ['flags'], { mode: 'full', answers: 4 }, 1),
    R('Capital cities', 'mc', ['capitals'], { answers: 4, source: 'questions' }, 1),
    R('Name the country', 'map-click', 'all', { region: 'world', ask: 'name' }, 2),
    R('Landmarks', 'reveal', ['landmarks'], { mode: 'full', answers: 4 }, 1),
    R('Pick all the right ones', 'pickall', ['countries', 'capitals', 'landmarks', 'general~geography'], { tiles: 6 }, 1),
  ] },
  { id: 'screen', name: 'Movie & TV Night', blurb: 'Guess the film from a scene, theme tunes, actors, quotes and telly.', timing: { answerSec: 15, gapSec: 5 }, rounds: [
    R('Movie moments', 'reveal', ['movie-moments'], { mode: 'full', answers: 4 }),
    R('Theme tunes', 'listen', ['screen-themes'], LISTEN),
    R('Actors', 'reveal', ['actors'], { mode: 'full', answers: 4 }),
    R('Famous lines', 'quote', ['movies', 'tv'], { answers: 4 }),
    R('TV', 'mc', ['tv', 'general~screen'], { answers: 4, source: 'mix' }),
  ] },
  { id: 'science', name: 'Science & Nature', blurb: 'Science trivia, space, animal pictures, the body and animal calls.', timing: { answerSec: 15, gapSec: 5 }, rounds: [
    R('Science', 'mc', ['general~science'], { answers: 4, source: 'mix' }),
    R('Space', 'mc', ['space'], { answers: 4, source: 'mix' }),
    R('Animal pictures', 'reveal', ['mammals', 'birds', 'sea'], { mode: 'full', answers: 4 }),
    R('The human body', 'mc', ['body', 'elements'], { answers: 4, source: 'mix' }),
    R('Animal calls', 'listen', ['birds', 'mammals'], { clip: 10, art: 'off', ask: 'auto', answers: 4 }),
  ] },
  { id: 'quick', name: 'Quick Quiz', blurb: 'Three short rounds for a ten-minute game.', timing: { answerSec: 10, gapSec: 5 }, rounds: [
    R('General knowledge', 'mc', ['general'], { answers: 4, source: 'mix' }),
    R('Flags', 'reveal', ['flags'], { mode: 'full', answers: 4 }, 1),
    R('Hits', 'listen', ['hits-1980s', 'hits-1990s', 'hits-2000s'], LISTEN),
  ] },
];

const K = (title, format, packs, opts = {}) => ({ title, format, packs, count: 10, opts, difficulty: 1 });
const KLISTEN = { clip: 10, answers: 3 };

export const SUGGESTED_KIDS = [
  { id: 'kparty', name: 'Kids Party', blurb: 'Animals, cartoon songs, nursery rhymes, the map and a quiz.', timing: { answerSec: 20, gapSec: 5 }, rounds: [
    K('Animals', 'reveal', ['mammals', 'dogs', 'cats', 'sea'], { mode: 'full', answers: 3 }),
    K('Film & TV songs', 'listen', ['kids-film-tv'], { ...KLISTEN, ask: 'title' }),
    K('Nursery rhymes', 'listen', ['nursery-rhymes'], KLISTEN),
    K('Find the country', 'map-click', 'all', { region: 'world', ask: 'tap' }),
    K('Kids quiz', 'mc', ['kids'], { answers: 3, source: 'mix' }),
  ] },
  { id: 'ksafari', name: 'Animal Safari', blurb: 'Pictures, calls, dinosaurs and sea creatures.', timing: { answerSec: 20, gapSec: 5 }, rounds: [
    K('Who is this?', 'reveal', ['mammals', 'birds'], { mode: 'full', answers: 3 }),
    K('Animal calls', 'listen', ['mammals', 'birds'], KLISTEN),
    K('Dinosaurs', 'reveal', ['dinosaurs'], { mode: 'full', answers: 3 }),
    K('Under the sea', 'mc', ['sea', 'sharks'], { answers: 3, source: 'pictures' }),
    K('Nature quiz', 'mc', ['kids-nature'], { answers: 3, source: 'mix' }),
  ] },
  { id: 'kworld', name: 'World Explorer', blurb: 'The biggest, best-known countries: map, flags, continents, landmarks.', timing: { answerSec: 20, gapSec: 5 }, rounds: [
    K('Find the country', 'map-click', 'all', { region: 'world', ask: 'tap' }),
    K('Flag on the map', 'flag-map', 'all', { region: 'world' }),
    K('Which continent?', 'continent', 'all', { what: 'countries', answers: 3, map: 'yes' }),
    K('Famous places', 'reveal', ['landmarks'], { mode: 'full', answers: 3 }),
  ] },
];

export const getSuggested = kids => (kids ? SUGGESTED_KIDS : SUGGESTED);
