// Line glyphs, 24x24, drawn as strokes so one CSS colour drives all of them.
// No icon font, no sprite sheet, nothing to fetch.

export const GLYPH = {
  play:    '<path d="M8 5.2 19 12 8 18.8Z" style="fill:currentColor;stroke:none"/>',
  grid:    '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
  gear:    '<path d="M3.4 7.2h17.2M3.4 16.8h17.2"/><circle cx="9" cy="7.2" r="2.5"/><circle cx="15.6" cy="16.8" r="2.5"/>',
  spark:   '<path d="M12 2.8 13.9 9 20 10.9 13.9 12.8 12 19l-1.9-6.2L4 10.9 10.1 9Z"/><path d="M18.4 16.2 19.2 18.6 21.6 19.4 19.2 20.2 18.4 22.6 17.6 20.2 15.2 19.4 17.6 18.6Z"/>',
  pause:   '<path d="M9 5v14M15 5v14" stroke-width="2.1"/>',
  close:   '<path d="M6 6l12 12M18 6 6 18"/>',
  back:    '<path d="M15 5 8 12l7 7"/>',
  home:    '<path d="M4 10.6 12 4l8 6.6V19a1.4 1.4 0 0 1-1.4 1.4H5.4A1.4 1.4 0 0 1 4 19Z"/>',
  again:   '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 3.6V8h-4.4"/>',
  // No inline fill: every star on screen is a FILL, and a path-level
  // fill:currentColor outranks the .on class that decides whether it is earned.
  // That is not a style nit — it drew three gold stars on a level nobody had
  // played, on the very first screenshot of the picker.
  star:    '<path d="M12 3.1l2.65 5.86 6.35.62-4.8 4.3 1.4 6.28L12 16.9l-5.6 3.26 1.4-6.28-4.8-4.3 6.35-.62Z"/>',
  lock:    '<rect x="4.6" y="10.4" width="14.8" height="9.8" rx="2.6"/><path d="M8.2 10.4V7.8a3.8 3.8 0 0 1 7.6 0v2.6"/>',
  // An L-tromino: the thing a level GIVES you a countable number of. Drawn as
  // three cells rather than one block so it cannot be read as a generic chip —
  // the counter beside it has to say "pieces" at a glance and never "seconds".
  piece:   '<rect x="4.4" y="4.4" width="6.6" height="6.6" rx="1.4"/><rect x="4.4" y="13" width="6.6" height="6.6" rx="1.4"/><rect x="13" y="13" width="6.6" height="6.6" rx="1.4"/>',
};

// One per mode. Each says something true about how the mode plays: FLOW is a
// falling stream, TIDE is a waterline, HOURGLASS is gravity on a timer.
export const MODE_GLYPH = {
  flow:      '<path d="M12 2.6c-3.4 4.2 3.4 6.6 0 10.8s2.6 6.4 0 8"/><circle cx="7.4" cy="8.6" r="1.05" style="fill:currentColor;stroke:none"/><circle cx="16.8" cy="15.4" r="1.05" style="fill:currentColor;stroke:none"/>',
  tide:      '<path d="M2.6 13.4q2.35-2.9 4.7 0t4.7 0 4.7 0 4.7 0"/><path d="M2.6 18.2q2.35-2.9 4.7 0t4.7 0 4.7 0 4.7 0"/><path d="M8.4 8V3.4M12 8.6V5M15.6 8V3.4"/>',
  jelly:     '<path d="M12 3.6c4.6 0 7.6 3.1 7.6 7.4 0 4.5-2.8 9.4-7.6 9.4S4.4 15.5 4.4 11c0-4.3 3-7.4 7.6-7.4Z"/><path d="M8.7 8.4c.5-1.4 1.8-2.2 3.1-2.3"/>',
  hourglass: '<path d="M6.4 3h11.2M6.4 21h11.2"/><path d="M7.6 3c0 4.8 4.4 5.9 4.4 9s-4.4 4.2-4.4 9"/><path d="M16.4 3c0 4.8-4.4 5.9-4.4 9s4.4 4.2 4.4 9"/><path d="M9.6 18.4h4.8"/>',
  alchemy:   '<path d="M9.6 3v6.2L4.5 17.9A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-3.1L14.4 9.2V3"/><path d="M8.4 3h7.2M7.6 15.2h8.8"/>',
  zen:       '<circle cx="12" cy="12" r="8.6" opacity=".38"/><circle cx="12" cy="12" r="5.2" opacity=".7"/><circle cx="12" cy="12" r="1.9" style="fill:currentColor;stroke:none"/>',
};

export const MODE_ACCENT = {
  flow: '#f2b33d', tide: '#41e8c4', jelly: '#ff7fb0',
  hourglass: '#ff8a3c', alchemy: '#b189d6', zen: '#a8d8c6',
};
