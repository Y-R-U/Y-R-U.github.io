// The door system writes four fields onto the player — `indoor`, `driven`, `confine`, `floorY` —
// and every one of them is a latch. Doors.update has several early returns, so a frame that takes
// one leaves the last value in place for the rest of the session, and only a reload clears it.
// These two answers are asked on every path, including the ones that return early.

// A peek is a render-only look inside a room and nothing ever cleared it, so pressing a Camera
// shot in the ⚙ panel during play stopped the door system for good — the pitch cap stayed at the
// indoor one and the player stayed confined. A peek only holds while nobody is playing.
export const stalePeek = (peeking, enabled, free) => !!peeking && !!enabled && !free;

// What the player's door state is when no script owns it. null means the script does.
export const idleDoorState = (state, releasing) =>
  (state === 'out' && !releasing) ? { indoor: 0, driven: false, confine: null, floorY: null } : null;
