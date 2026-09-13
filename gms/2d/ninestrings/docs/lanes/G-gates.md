# Lane G-gates — status

Owner updates THIS file only.

Status: PARTIAL (manager built G0; G1/G2/G3/G4 still open)

## Log

**G0 `tools/portrait.mjs` — DONE (manager).** The mobile-first gate. Boots the
game on three real phones (390x844 @2, 360x640 @2, 430x932 @3) and asserts:
exactly 420 world units visible across on every one (D7 — the balance is not
portable otherwise), no horizontal overflow, no vertical page scroll, canvas
fills the viewport in CSS px, backing store matches the clamped DPR, and the
play area is taller than it is wide. `--shots` captures one PNG per device;
`--falsify` corrupts `viewport.zoom` and 3 checks correctly go red.

Note: `viewport.js` clamps DPR at 2.5, so the 430x932 @3 device is backed at
2.5x by design. The gate checks the backing store against the *clamped* value,
which is the real requirement.

**`tools/boot.mjs` — DONE (manager).** Boot + soak + lit-canvas + console-error
gate at 390x844. Arms: `--falsify boot|module|frozen|blank`, `--gpu`,
`--soak`, `--allow-placeholder`. Drop `--allow-placeholder` once the real
renderer lands — it exists so a syntax error in `renderer.js` cannot produce a
green gate over the Canvas2D stand-in.

**`tools/cdp.mjs`** — copied verbatim from SILT. Proven harness; do not write a
second one. Note its Gotcha 4: capture composites every canvas in document
order, because capturing one canvas silently drops stacked layers.

## Still open
- **G1** `tools/sim.mjs` — node balance harness. Needs Lane B-core's `world.js`.
- **G2** `tools/uishot.mjs` — real taps, the >=44px hit gate, screen captures. Needs Lane D.
- **G3** more falsify arms once the real subsystems exist.
- **G4** perf gate: 400 enemies @ 60fps, DPR2, portrait, `--gpu`.
