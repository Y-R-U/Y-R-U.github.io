// Published picture names are opaque so a file name can't give the film away: media/moments/<hash>.webp.
import { createHash } from 'node:crypto';
export const momentFile = key => createHash('sha1').update('clued-moment:' + key).digest('hex').slice(0, 12) + '.webp';

// Scenes marked `cand: true` are unapproved: their file lives in media/cand/<pack>/ (gitignored, shipped to the server
// for review.html only) and they go to data/candidates/<pack>.json, never to the live pack. tools/img_promote.mjs moves them.
export const PACKS = {
  'movie-moments': { prompts: 'tools/mv_prompts.json', media: 'media/moments', kind: 'film' },
  'book-moments': { prompts: 'tools/mv_prompts_books.json', media: 'media/book-moments', kind: 'novel' },
  'song-pictures': { prompts: 'tools/mv_prompts_songs.json', media: 'media/song-pictures', kind: 'song title (drawn literally)' },
};
export const candDir = packId => `media/cand/${packId}`;
export const sceneRel = (packId, key, sc) => `${sc?.cand ? candDir(packId) : PACKS[packId].media}/${momentFile(key)}`;
export const candRef = (packId, key) => `${packId}:new/${key}`;
