// Where a bubble goes on screen, given where its speaker is. Pure — no three, no DOM — because
// the part that goes wrong is the clamping in landscape, and that is worth a test.

// How far past the edge the anchor may sit before the bubble stops being a bubble over a person
// and becomes a caption pinned to nothing.
export const OFF_MARGIN = 40;

// `pt` is the projected anchor, `box` the safe rectangle. The bubble sits above the anchor, flips
// below when there is no room, and never leaves the box. `tail` is where the pointer sits along
// the bubble's own width, 0..1, so a clamped bubble still points back at the speaker.
export function place({ pt, w, h, box, gap = 14 }) {
  if (!pt || pt.behind) return null;
  if (pt.x < box.x - OFF_MARGIN || pt.x > box.x + box.w + OFF_MARGIN
    || pt.y < box.y - OFF_MARGIN || pt.y > box.y + box.h + OFF_MARGIN) return null;

  const below = pt.y - gap - h < box.y;
  const y = below ? Math.min(pt.y + gap, box.y + box.h - h) : pt.y - gap - h;
  const x = Math.min(Math.max(pt.x - w / 2, box.x), Math.max(box.x, box.x + box.w - w));
  return { x, y, below, tail: w > 0 ? Math.min(1, Math.max(0, (pt.x - x) / w)) : 0.5 };
}
