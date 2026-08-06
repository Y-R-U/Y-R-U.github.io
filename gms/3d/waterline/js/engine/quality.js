// Quality presets + a live-tunable knob registry.
// Any module can register a knob; anything that wants panel UI builds it from the schemas.
//
// Preset fields that no knob claims are still readable with quality.get() — they are the budgets
// world modules size themselves against (ocean tessellation, light counts, particle caps).

// Values are BUILD_PLAN §6's ladder. Placeholders until Wave C retunes them against a real scene —
// nobody else edits this table; register a knob from your own module instead.
const PRESETS = {
  potato: {
    label: 'Potato', dprCap: 1, renderScale: 0.6, shadows: 'off', shadowMap: 512, shadowDist: 60,
    oceanSegs: 48, oceanRings: 2, bridgeLights: 2, vfxCap: 60, smokeCards: 2, texCap: 512, aniso: 1,
  },
  low: {
    label: 'Low', dprCap: 1.5, renderScale: 0.75, shadows: 'hard', shadowMap: 1024, shadowDist: 90,
    oceanSegs: 64, oceanRings: 2, bridgeLights: 3, vfxCap: 120, smokeCards: 3, texCap: 512, aniso: 2,
  },
  medium: {
    label: 'Medium', dprCap: 2, renderScale: 1.0, shadows: 'soft', shadowMap: 1024, shadowDist: 140,
    oceanSegs: 96, oceanRings: 3, bridgeLights: 5, vfxCap: 220, smokeCards: 5, texCap: 1024, aniso: 4,
  },
  high: {
    label: 'High', dprCap: 2, renderScale: 1.0, shadows: 'soft', shadowMap: 2048, shadowDist: 200,
    oceanSegs: 128, oceanRings: 3, bridgeLights: 7, vfxCap: 400, smokeCards: 8, texCap: 1024, aniso: 8,
  },
  ultra: {
    label: 'Ultra', dprCap: 2, renderScale: 1.25, shadows: 'softhigh', shadowMap: 4096, shadowDist: 300,
    oceanSegs: 192, oceanRings: 4, bridgeLights: 9, vfxCap: 700, smokeCards: 12, texCap: 2048, aniso: 16,
  },
};

// Mid-range phone reference profile. The perf gate is measured here, landscape.
export const MOBILE_PROFILE = { preset: 'medium', dprCap: 1, width: 844, height: 390 };

export class Quality {
  constructor(preset = 'medium') {
    this.knobs = new Map();
    this.listeners = new Set();
    this.settings = { ...PRESETS[preset] };
    this.presetName = preset;
  }

  static get presets() { return PRESETS; }

  // schema: {key, label, type:'range'|'toggle'|'select'|'color', min,max,step,options, default, group}
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
