// Where a bubble goes on screen, given where its speaker is. Pure — no three, no DOM — because
// the part that goes wrong is the clamping in landscape, and that is worth a test.

// How far past the edge the anchor may sit before the bubble stops being a bubble over a person
// and becomes a caption pinned to nothing.
export const OFF_MARGIN = 40;

// `pt` is the projected anchor, `box` the safe rectangle. The bubble sits above the anchor, flips
// below when there is no room, and never leaves the box. `tail` is where the pointer sits along
// the bubble's own width, 0..1, so a clamped bubble still points back at the speaker.
//
// `avoid` is a rectangle the bubble is not allowed to cover — in practice the choice band, which
// lives on a lower layer than a floating bubble and so was being drawn straight over. A speaker
// whose head is behind that band is not somewhere a bubble can point at any more, so the answer
// there is null: dialoguebox.js reads that as "dock", and the line lands above the choices in the
// band's own flex column instead of on top of them.
export function place({ pt, w, h, box, gap = 14, avoid = null }) {
  if (!pt || pt.behind) return null;
  if (pt.x < box.x - OFF_MARGIN || pt.x > box.x + box.w + OFF_MARGIN
    || pt.y < box.y - OFF_MARGIN || pt.y > box.y + box.h + OFF_MARGIN) return null;

  // The bubble hangs off the anchor, so keeping it out of `avoid` is the same question as whether
  // the anchor itself is clear of it. A head level with the band or below it has nowhere left to
  // hang from, and neither has one in a box the band has left shorter than the bubble.
  const top = box.y;
  let bottom = box.y + box.h;
  if (avoid && avoid.h > 0) {
    bottom = Math.min(bottom, avoid.y - gap);
    // Only when there is something to avoid. Without this guard an anchor a few pixels below the
    // safe box — which the OFF_MARGIN test above deliberately still accepts — would dock instead
    // of floating, which is not what the band fix is for.
    if (pt.y > bottom || bottom - top < h) return null;
  }

  const below = pt.y - gap - h < top;
  const y = below ? Math.min(pt.y + gap, bottom - h) : pt.y - gap - h;
  const x = Math.min(Math.max(pt.x - w / 2, box.x), Math.max(box.x, box.x + box.w - w));
  return { x, y, below, tail: w > 0 ? Math.min(1, Math.max(0, (pt.x - x) / w)) : 0.5 };
}
