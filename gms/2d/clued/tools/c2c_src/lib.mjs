// Compact question constructors for the C2c banks. t = topic key, d = difficulty.
export const M = (t, d, p, a, w, e, x = {}) => ({ kind: 'mc', t, d, p, a, w, e, ...x });
export const T = (t, d, p, a, e, x = {}) => ({ kind: 'tf', t, d, p, a, e, ...x });
export const N = (t, d, p, a, unit, tol, e, x = {}) => ({ kind: 'number', t, d, p, a, unit, tol, e, ...x });
export const O = (t, d, p, a, label, e, x = {}) => ({ kind: 'order', t, d, p, a, label, e, ...x });

// topic key -> [theme id (CONTRACT THEMES), topic label]
export const TOPICS = {
  sci: ['science', 'science'], space: ['science', 'space'], body: ['science', 'body'], math: ['science', 'maths'],
  tech: ['science', 'technology'], geo: ['geography', 'geography'], his: ['history', 'history'], art: ['art', 'arts'],
  mus: ['music', 'music'], lit: ['books', 'literature'], lang: ['books', 'language'], nat: ['nature', 'nature'],
  ani: ['animals', 'animals'], pop: ['screen', 'pop culture'], food: ['food', 'food'], sport: ['sport', 'sport'],
  colour: ['kids', 'colours'], shape: ['kids', 'shapes'], weather: ['nature', 'weather'], tale: ['books', 'fairy tales'],
  count: ['science', 'counting'], world: ['geography', 'world'], rules: ['sport', 'rules'], olympics: ['sport', 'olympics'],
  football: ['sport', 'football'], athletes: ['sport', 'athletes'], records: ['sport', 'records'],
};
