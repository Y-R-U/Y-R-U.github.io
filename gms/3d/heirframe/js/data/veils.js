// D30 Veils: how each human presents over the Link. Faceless by choice (STORY §3, codex "Veils").
// style: [scanlines, gold filigree, wire lattice, glitch]; shard: fracture holes; glass: how much of the body reads
// as solid smoked glass; head: extra veil piece; mask: emblem drawn on the faceplate; pose: bust bone offsets.
export const VEILS = {
  mara: {
    tag: 'LINK · VEILED', tint: 0xffb24a, body: 0x120c08, plate: 0x0d0a08, style: [0.25, 1, 0, 0], glass: 1, shard: 0,
    head: 'hood', mask: 'quill', turn: -0.6, pose: { head: [0.22, -0.12, 0.05], neck: [0.06, 0, 0] }, sway: 0.4,
  },
  fenn: {
    tag: 'LINK · VEILED', tint: 0xf0cf96, body: 0x2a2014, plate: 0x3a2e20, style: [0.55, 0.45, 0, 0], glass: 0.6, shard: 0,
    head: null, mask: 'leaf', turn: -0.3, pose: { chest: [0.18, 0, 0], neck: [0.12, 0, 0], head: [0.1, -0.08, 0.06] }, sway: 0.5,
  },
  jun: {
    tag: 'SPOOFED · VEILED', tint: 0x7dff8a, body: 0x04120a, plate: 0x061208, style: [0.35, 0, 1, 0.75], glass: 0.25, shard: 0,
    head: 'ears', mask: 'grin', turn: -0.15, pose: { head: [-0.04, 0.12, -0.2] }, sway: 1.4,
  },
  tomas: {
    tag: 'SHARD · VEILED', tint: 0xbfe2ff, body: 0x0a1626, plate: 0x0c1a2c, style: [0.7, 0, 0, 0.3], glass: 0.4, shard: 1,
    head: null, mask: 'star', turn: -0.25, pose: { head: [0.08, 0.05, 0.04] }, sway: 0.7,
  },
  elena: {
    tag: 'ARCHIVE · LOG', tint: 0xffc070, body: 0x1c1206, plate: 0x24180a, style: [1, 0.2, 0, 0.15], glass: 0.5, shard: 0.35,
    head: 'cap', mask: 'ark', turn: -0.1, pose: { head: [-0.05, 0, 0], chest: [-0.05, 0, 0] }, sway: 0.25,
  },
};
// any other human who calls in
export const VEIL_DEFAULT = { tag: 'LINK · VEILED', tint: 0x5fd8ff, body: 0x0c2a3a, plate: 0x0c2030, style: [0.6, 0, 0, 0], glass: 0.4, shard: 0, head: null, mask: 'ring', turn: -0.3, pose: {}, sway: 1 };

// the one face the game ever shows (A6 closing call): assets/portraits/<id>.mp4 / .jpg
export const UNVEILED = { mara: 'assets/portraits/mara' };
