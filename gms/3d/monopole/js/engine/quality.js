// Quality presets + a live-tunable knob registry.
// Any module can register a knob; the settings panel builds its UI from the schema.

// `viewDist` is the camera far plane in metres. `nebulaRes` is the width of the baked equirect
// backdrop; height is half of it. There is no shadow rig in space — nothing casts one yet.
const PRESETS = {
  potato: {
    label: 'Potato', renderScale: 0.6, aniso: 1, texCap: 512,
    nebulaRes: 512, stars: 0.35, viewDist: 14000, nebDetail: 0,
  },
  low: {
    label: 'Low', renderScale: 0.75, aniso: 2, texCap: 512,
    nebulaRes: 768, stars: 0.5, viewDist: 18000, nebDetail: 0.16,
  },
  medium: {
    label: 'Medium', renderScale: 1.0, aniso: 4, texCap: 1024,
    nebulaRes: 1024, stars: 0.75, viewDist: 24000, nebDetail: 0.30,
  },
  high: {
    label: 'High', renderScale: 1.0, aniso: 8, texCap: 1024,
    nebulaRes: 3072, stars: 1.0, viewDist: 34000, nebDetail: 0.42,
  },
  ultra: {
    label: 'Ultra', renderScale: 1.25, aniso: 16, texCap: 2048,
    nebulaRes: 3072, stars: 1.4, viewDist: 48000, nebDetail: 0.52,
  },
};

// Mid-range phone reference profile. The hard gate in CLAUDE.md is measured here.
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

  // Knobs with a schema default only. The preset-driven ones (renderScale, texCap, viewDist…)
  // have none and stay where the preset put them.
  resetDefaults() {
    for (const { schema, apply } of this.knobs.values()) {
      if (schema.default === undefined) continue;
      this.settings[schema.key] = schema.default;
      apply(schema.default, this.settings);
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
