import { KokoroTTS, TextSplitterStream } from 'https://esm.sh/kokoro-js@1.2.1';

export { TextSplitterStream };

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const ENGLISH_PREFIXES = ['af_', 'am_', 'bf_', 'bm_'];
const GRADE_ORDER = { 'A+': 0, 'A': 1, 'A-': 2, 'B+': 3, 'B': 4, 'B-': 5, 'C+': 6, 'C': 7, 'C-': 8, 'D+': 9, 'D': 10, 'D-': 11, 'F+': 12, 'F': 13 };

export const DEVICE_OPTIONS = [
  { id: 'auto', label: 'Auto (WebGPU if available)' },
  { id: 'webgpu', label: 'WebGPU (fast, may be buggy on mobile)' },
  { id: 'wasm', label: 'WASM (slow, most compatible)' },
];
export const DTYPE_OPTIONS = [
  { id: 'q4', label: 'q4 (smallest, lower quality)' },
  { id: 'q8', label: 'q8 (default)' },
  { id: 'fp16', label: 'fp16' },
  { id: 'fp32', label: 'fp32 (largest, best quality)' },
];

let tts = null;
let loading = null;
let currentConfig = null;

export function isLoaded() { return tts !== null; }
export function currentOptions() { return currentConfig; }

function webgpuAvailable() {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

function resolveDevice(device) {
  if (device === 'webgpu' || device === 'wasm') return device;
  return webgpuAvailable() ? 'webgpu' : 'wasm';
}

export async function initTTS({ device = 'auto', dtype = 'q8' } = {}, onProgress) {
  const resolvedDevice = resolveDevice(device);
  if (tts && currentConfig && currentConfig.device === resolvedDevice && currentConfig.dtype === dtype) {
    return tts;
  }
  if (tts) unload();
  if (loading) return loading;
  loading = (async () => {
    tts = await KokoroTTS.from_pretrained(MODEL_ID, {
      dtype,
      device: resolvedDevice,
      progress_callback: (p) => { if (onProgress) onProgress(p); },
    });
    currentConfig = { device: resolvedDevice, dtype };
    return tts;
  })();
  try { return await loading; } finally { loading = null; }
}

export function unload() {
  tts = null;
  currentConfig = null;
}

export function getDevice() {
  return currentConfig?.device ?? (webgpuAvailable() ? 'webgpu' : 'wasm');
}

export function getDtype() {
  return currentConfig?.dtype ?? 'q8';
}

export function hasWebGPU() { return webgpuAvailable(); }

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
