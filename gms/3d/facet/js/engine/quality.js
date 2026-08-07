// Quality presets + a live-tunable knob registry.
// Any module can register a knob; the editor panel builds its UI from the schema.
//
// The dials here are not FORGE's. With no textures in the project there is nothing to cap and
// no anisotropy to set — what costs money is shadow resolution, scatter density and view distance.

const PRESETS = {
  potato: {
    label: 'Potato', renderScale: 0.6, shadows: 'off', shadowMap: 512, shadowDist: 40,
    scatter: 0.2, detail: 0, viewDist: 90, life: 0,
  },
  low: {
    label: 'Low', renderScale: 0.75, shadows: 'hard', shadowMap: 1024, shadowDist: 55,
    scatter: 0.45, detail: 0, viewDist: 130, life: 0.4,
  },
  medium: {
    label: 'Medium', renderScale: 1.0, shadows: 'soft', shadowMap: 1024, shadowDist: 70,
    scatter: 0.75, detail: 1, viewDist: 180, life: 0.8,
  },
  high: {
    label: 'High', renderScale: 1.0, shadows: 'soft', shadowMap: 2048, shadowDist: 95,
    scatter: 1.0, detail: 1, viewDist: 240, life: 1.0,
  },
  ultra: {
    label: 'Ultra', renderScale: 1.25, shadows: 'softhigh', shadowMap: 4096, shadowDist: 130,
    scatter: 1.35, detail: 2, viewDist: 340, life: 1.0,
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
    for (const { schema, apply } of this.knobs.values()) apply(this.settings[schema.key], this.settings);
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
