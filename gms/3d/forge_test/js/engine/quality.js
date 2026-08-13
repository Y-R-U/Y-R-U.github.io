// Quality presets + a live-tunable knob registry.
// Any module can register a knob; the editor panel builds its UI from the schema.

const PRESETS = {
  potato: {
    label: 'Potato', renderScale: 0.6, shadows: 'off', shadowMap: 512, shadowDist: 40,
    aniso: 1, texCap: 512, foliage: 0.15, viewDist: 90, lightCap: 8,
  },
  low: {
    label: 'Low', renderScale: 0.75, shadows: 'hard', shadowMap: 1024, shadowDist: 60,
    aniso: 2, texCap: 512, foliage: 0.35, viewDist: 130, lightCap: 16,
  },
  medium: {
    label: 'Medium', renderScale: 1.0, shadows: 'soft', shadowMap: 1024, shadowDist: 80,
    aniso: 4, texCap: 1024, foliage: 0.6, viewDist: 180, lightCap: 24,
  },
  high: {
    label: 'High', renderScale: 1.0, shadows: 'soft', shadowMap: 2048, shadowDist: 120,
    aniso: 8, texCap: 1024, foliage: 1.0, viewDist: 260, lightCap: 40,
  },
  ultra: {
    label: 'Ultra', renderScale: 1.25, shadows: 'softhigh', shadowMap: 4096, shadowDist: 180,
    aniso: 16, texCap: 2048, foliage: 1.4, viewDist: 400, lightCap: 64,
  },
};

// Mid-range phone reference profile. The hard gate in the brief is measured here.
export const MOBILE_PROFILE = { preset: 'medium', dprCap: 1, width: 844, height: 390 };

export class Quality {
  constructor(preset = 'medium') {
    this.knobs = new Map();
    this.listeners = new Set();
    this.settings = { ...PRESETS[preset] };
    this.presetName = preset;
  }

  static get presets() { return PRESETS; }

  // schema: {key, label, type:'range'|'toggle'|'select'|'color', min,max,step,options, group}
  register(schema, apply) {
    this.knobs.set(schema.key, { schema, apply });
    if (schema.default !== undefined && !(schema.key in this.settings)) {
      this.settings[schema.key] = schema.default;
    }
    apply(this.settings[schema.key], this.settings);
  }

  set(key, value) {
    this.settings[key] = value;
    const k = this.knobs.get(key);
    if (k) k.apply(value, this.settings);
    this.emit(key);
  }

  usePreset(name) {
    if (!PRESETS[name]) return;
    this.presetName = name;
    Object.assign(this.settings, PRESETS[name]);
    for (const { schema, apply } of this.knobs.values()) {
      apply(this.settings[schema.key], this.settings);
    }
    this.emit('*');
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(key) { for (const fn of this.listeners) fn(key, this.settings); }

  get(key) { return this.settings[key]; }
  groups() {
    const out = new Map();
    for (const { schema } of this.knobs.values()) {
      const g = schema.group || 'General';
      if (!out.has(g)) out.set(g, []);
      out.get(g).push(schema);
    }
    return out;
  }
}
