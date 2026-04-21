import { KokoroTTS, TextSplitterStream } from 'https://esm.sh/kokoro-js@1.2.1';

export { TextSplitterStream };

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const ENGLISH_PREFIXES = ['af_', 'am_', 'bf_', 'bm_'];
const GRADE_ORDER = { 'A+': 0, 'A': 1, 'A-': 2, 'B+': 3, 'B': 4, 'B-': 5, 'C+': 6, 'C': 7, 'C-': 8, 'D+': 9, 'D': 10, 'D-': 11, 'F+': 12, 'F': 13 };

let tts = null;
let loading = null;

export function isLoaded() { return tts !== null; }

export async function initTTS(onProgress) {
  if (tts) return tts;
  if (loading) return loading;
  loading = (async () => {
    tts = await KokoroTTS.from_pretrained(MODEL_ID, {
      dtype: 'q8',
      device: webgpuAvailable() ? 'webgpu' : 'wasm',
      progress_callback: (p) => { if (onProgress) onProgress(p); },
    });
    return tts;
  })();
  try { return await loading; } finally { loading = null; }
}

function webgpuAvailable() {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

export function getDevice() {
  return webgpuAvailable() ? 'webgpu' : 'wasm';
}

export async function generate(text, voice, speed) {
  if (!tts) throw new Error('TTS not initialised');
  return tts.generate(text, { voice, speed });
}

function gradeClass(grade) {
  if (!grade) return '';
  const c = grade[0].toUpperCase();
  return `grade-${c}`;
}

export function getEnglishVoices() {
  if (!tts) return { female: [], male: [] };
  const voices = tts.voices;
  const items = [];
  for (const [id, info] of Object.entries(voices)) {
    if (!ENGLISH_PREFIXES.some((p) => id.startsWith(p))) continue;
    items.push({
      id,
      name: info.name || id,
      gender: info.gender || (id[1] === 'f' ? 'Female' : 'Male'),
      region: id[0] === 'a' ? 'American' : 'British',
      traits: info.traits || '',
      grade: info.overallGrade || '',
      gradeClass: gradeClass(info.overallGrade),
    });
  }
  const sortFn = (a, b) => {
    const ga = GRADE_ORDER[a.grade] ?? 99;
    const gb = GRADE_ORDER[b.grade] ?? 99;
    if (ga !== gb) return ga - gb;
    return a.name.localeCompare(b.name);
  };
  return {
    female: items.filter((v) => v.gender === 'Female').sort(sortFn),
    male: items.filter((v) => v.gender === 'Male').sort(sortFn),
  };
}
