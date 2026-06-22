/** Player settings, persisted to localStorage. Read directly by input/quality/audio. */
export type QualityTier = 'high' | 'medium' | 'low';

export interface Settings {
  swapSticks: boolean;
  sensitivity: number; // 0.5..1.5
  quality: QualityTier | 'auto';
  volume: number; // 0..1
  reduceMotion: boolean;
  intro: boolean; // play cinematic intro
}

const KEY = 'cryodrift.settings';

const defaults: Settings = {
  swapSticks: false,
  sensitivity: 1,
  quality: 'auto',
  volume: 0.8,
  reduceMotion: false,
  intro: true,
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...defaults };
}

export const settings: Settings = load();

export function saveSettings(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}
