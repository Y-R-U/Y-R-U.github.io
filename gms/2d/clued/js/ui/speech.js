// Read-aloud through the Web Speech API. Silent no-op where it isn't available.
const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
let voice = null;

function pickVoice() {
  if (!synth) return null;
  const vs = synth.getVoices();
  return vs.find(v => /en-GB/i.test(v.lang) && /female|serena|kate|libby|sonia/i.test(v.name))
    || vs.find(v => /^en-GB/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang)) || null;
}
if (synth) { voice = pickVoice(); synth.addEventListener?.('voiceschanged', () => { voice = pickVoice(); }); }

export const canSpeak = () => !!synth;

export function speak(text, { rate = 0.95, pitch = 1.05, kids = false } = {}) {
  if (!synth || !text) return;
  try {
    synth.cancel();
    const u = new SpeechSynthesisUtterance(String(text).replace(/[“”"]/g, ''));
    if (voice) u.voice = voice;
    u.lang = voice?.lang || 'en-GB';
    u.rate = kids ? 0.88 : rate;
    u.pitch = kids ? 1.15 : pitch;
    synth.speak(u);
  } catch (e) {}
}

export function stopSpeaking() { try { synth && synth.cancel(); } catch (e) {} }

// What to read for a question: the prompt, plus text answers (never picture answers, that would give it away).
export function questionSpeech(q) {
  let s = q.prompt || '';
  if (q.format === 'tf') s += '. True, or false?';
  else if (Array.isArray(q.options) && q.data?.layout !== 'images' && q.options.every(o => o && (o.text || typeof o === 'string'))) {
    s += '. ' + q.options.map((o, i) => `${i + 1}: ${o.text || o}`).join('. ');
  }
  return s;
}
