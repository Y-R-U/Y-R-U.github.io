// The Kokoro-82M voice catalogue, from
// ~/.cache/huggingface/hub/models--hexgrad--Kokoro-82M/snapshots/*/voices/.
// First letter = language (kokoro_say.py passes it straight to KPipeline as lang_code), second =
// f/m. English is what this game is written in; the rest are here so a voice can be auditioned.

export const LANGS = {
  a: { label: 'English (US)', english: true },
  b: { label: 'English (GB)', english: true },
  e: { label: 'Spanish' },
  f: { label: 'French' },
  h: { label: 'Hindi' },
  i: { label: 'Italian' },
  j: { label: 'Japanese', extra: 'needs misaki[ja]' },
  p: { label: 'Portuguese (BR)' },
  z: { label: 'Mandarin', extra: 'needs misaki[zh]' },
};

const RAW = `af_alloy af_aoede af_bella af_heart af_jessica af_kore af_nicole af_nova af_river
af_sarah af_sky am_adam am_echo am_eric am_fenrir am_liam am_michael am_onyx am_puck am_santa
bf_alice bf_emma bf_isabella bf_lily bm_daniel bm_fable bm_george bm_lewis ef_dora em_alex
em_santa ff_siwis hf_alpha hf_beta hm_omega hm_psi if_sara im_nicola jf_alpha jf_gongitsune
jf_nezumi jf_tebukuro jm_kumo pf_dora pm_alex pm_santa zf_xiaobei zf_xiaoni zf_xiaoxiao zf_xiaoyi
zm_yunjian zm_yunxi zm_yunxia zm_yunyang`.trim().split(/\s+/);

// hexgrad's own grades, for the handful worth reaching for first.
const PICK = {
  af_heart: 'best US female', af_bella: 'warm, expressive', af_nicole: 'soft, close-mic',
  am_michael: 'steady US male', am_fenrir: 'gravelly', am_puck: 'bright, young',
  am_echo: 'the player', bf_emma: 'best GB female', bm_fable: 'storyteller',
  bm_george: 'older GB male', bf_alice: 'crisp GB',
};

export const VOICES = RAW.map(id => ({
  id,
  lang: id[0],
  sex: id[1] === 'f' ? 'f' : 'm',
  label: id.slice(3).replace(/^./, c => c.toUpperCase()),
  english: !!LANGS[id[0]]?.english,
  note: PICK[id] || '',
}));

export const VOICE_IDS = new Set(RAW);
export const isVoice = id => VOICE_IDS.has(id);
export const voice = id => VOICES.find(v => v.id === id) || null;

// Same-sex voices first when the character has one, so the list opens on what is likely wanted.
// DEV_CONTRACT §7: this ordering is the only thing `gender` does.
export function voicesFor({ gender = 'x', english = true } = {}) {
  const pool = VOICES.filter(v => (english ? v.english : !v.english));
  const rank = v => (gender !== 'x' && v.sex === gender ? 0 : 1);
  return pool.slice().sort((a, b) => rank(a) - rank(b) || a.lang.localeCompare(b.lang)
    || a.sex.localeCompare(b.sex) || a.id.localeCompare(b.id));
}

export function groupedVoices(opts) {
  const groups = new Map();
  for (const v of voicesFor(opts)) {
    const k = `${LANGS[v.lang]?.label || v.lang} · ${v.sex === 'f' ? 'female' : 'male'}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(v);
  }
  return [...groups];
}

export const AUDITION = [
  'Who fights, when the bell goes?',
  'Bored now.',
  'Did you see that? Over by the well.',
  'Welcome to the Adventurer Academy. Mind the step.',
  'Stand still, would you!',
];
