/**
 * ARCHITECTURE §6.8's facade. The engine and the facade were built by the audio
 * agent under `js/audio/` (DECISIONS D45); this file is the §5.1 name the rest
 * of the game imports, and R-15 transfers ownership of it to P15.
 *
 * Import THIS, never `js/audio/*` directly.
 */
export { createAudio, createAudio as default, KEYS } from '../audio/facade.js';
