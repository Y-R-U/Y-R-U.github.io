// Published picture names are opaque so a file name can't give the film away: media/moments/<hash>.webp.
import { createHash } from 'node:crypto';
export const momentFile = key => createHash('sha1').update('clued-moment:' + key).digest('hex').slice(0, 12) + '.webp';

// Scenes marked `cand: true` are unapproved: their file lives in media/cand/<pack>/ (gitignored, shipped to the server
// for review.html only) and they go to data/candidates/<pack>.json, never to the live pack. tools/img_promote.mjs moves them.
export const PACKS = {
  'movie-moments': { prompts: 'tools/mv_prompts.json', media: 'media/moments', kind: 'film' },
  'book-moments': { prompts: 'tools/mv_prompts_books.json', media: 'media/book-moments', kind: 'novel' },
  'tv-moments': { prompts: 'tools/mv_prompts_tv.json', media: 'media/tv-moments', kind: 'TV series' },
  'song-pictures': { prompts: 'tools/mv_prompts_songs.json', media: 'media/song-pictures', kind: 'song title (drawn literally)' },
};
export const candDir = packId => `media/cand/${packId}`;
export const sceneRel = (packId, key, sc) => `${sc?.cand ? candDir(packId) : PACKS[packId].media}/${momentFile(key)}`;
export const candRef = (packId, key) => `${packId}:new/${key}`;
// A candidate whose title already has a live picture is offered as an extra picture ("…: second pictures" on review.html)
// under its own ref, so verdict rows left on its old ":new/" ref (e.g. an OK cleared when a sibling was picked) never count.
export const moreRef = (packId, key) => `${packId}:more/${key}`;
export const hasLive = (exists, packId, f) => f.scenes.some((sc, i) => !sc.cand && !sc.drop && exists(sceneRel(packId, `${f.id}-${i + 1}`, sc)));
export const refFor = (packId, key, live) => (live ? moreRef : candRef)(packId, key);
