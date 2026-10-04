// Lane S entry points. Importing this module registers the screens: online, join, host, room, challenge, linkchallenge.
import { go } from '../ui/app.js?v=1';
import './room.js?v=1';
import './join.js?v=1';
import { createChallenge as create, challengeButton } from './challenge.js?v=1';
import { cleanCode } from './util.js?v=1';
import { openLinkChallenge as openLink, linkChallengeShare, createLinkChallenge } from './linkchallenge.js?v=1';
export { registerTransport, getTransport, fallback } from './transport.js?v=1';
export { createLinkChallenge };

export { challengeButton };

// A's results screen calls createChallenge(ctx, { spec, questions, score, answers }); a single results-params object also works.
export function createChallenge(a, b) {
  if (b) {
    const answers = b.answers || [];
    return create({ spec: b.spec, title: b.title || '', choice: b.choice,
      result: { questions: b.questions, score: b.score, answers, correct: b.correct ?? answers.filter(x => x.correct).length, total: (b.questions || []).length } });
  }
  return create(a);
}
export { API } from './api.js?v=1';

// Boot routing: ?join=CODE and ?c=ID.
// A's boot route calls joinRoom(code, ctx) / openChallenge(id, ctx).
export const openJoin = code => go('join', { code: cleanCode(code) });
export const joinRoom = openJoin;
export const openChallenge = id => go('challenge', { id: String(id || '').toLowerCase().trim() });
export const openOnline = () => go('online');
// Host a prepared spec (e.g. a pub quiz built elsewhere): goes to the host screen for a name, then builds + creates.
export const hostRoom = (spec, { title = '' } = {}) => go('host', { spec, title });

// Returns true when the URL asked for a net screen and it was opened.
// Serverless link challenge: the shell routes location.hash '#lc=…' here.
export const openLinkChallenge = hash => openLink(hash || location.hash, go);

// Results screen: "send a link challenge" (no server). Same payload shape as createChallenge(ctx, {...}).
export async function linkChallenge(a, b) {
  const x = b || a;
  const { suggestedName } = await import('./ident.js?v=1');
  const name = (await suggestedName()) || 'Player';
  const answers = x.answers || x.result?.answers || [];
  const out = x.result ? x : { spec: x.spec, title: x.title, choice: x.choice, result: { questions: x.questions, score: x.score, answers, correct: x.correct ?? answers.filter(r => r.correct).length } };
  return linkChallengeShare(out, name);
}

export function routeFromUrl() {
  if (/[#&]lc=/.test(location.hash)) { openLinkChallenge(location.hash); return true; }
  const q = new URLSearchParams(location.search);
  if (q.get('join')) { openJoin(q.get('join')); return true; }
  if (q.get('c')) { openChallenge(q.get('c')); return true; }
  return false;
}
