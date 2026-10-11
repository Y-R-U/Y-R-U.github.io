// Published picture names are opaque so a file name can't give the film away: media/moments/<hash>.webp.
import { createHash } from 'node:crypto';
export const momentFile = key => createHash('sha1').update('clued-moment:' + key).digest('hex').slice(0, 12) + '.webp';
