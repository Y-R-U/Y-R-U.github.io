/* tools.js – tool definitions */

export const TOOLS = {
  brush:     { name: 'Brush',     icon: '\u270F',  cursor: 'crosshair', shortcut: 'b' },
  eraser:    { name: 'Eraser',    icon: '\u2395',  cursor: 'crosshair', shortcut: 'e' },
  fill:      { name: 'Fill',      icon: '\u25A7',  cursor: 'crosshair', shortcut: 'f' },
  select:    { name: 'Select',    icon: '\u25A1',  cursor: 'default',   shortcut: 's' },
  object:    { name: 'Object',    icon: '\u2316',  cursor: 'crosshair', shortcut: 'o' },
  collision: { name: 'Collision', icon: '\u25A8',  cursor: 'crosshair', shortcut: 'c' },
  pan:       { name: 'Pan',       icon: '\u2726',  cursor: 'grab',      shortcut: 'h' },
};

export const COLLISION_TYPES = {
  0: { name: 'None',     color: 'transparent' },
  1: { name: 'Solid',    color: 'rgba(255,60,60,0.45)' },
  2: { name: 'Platform', color: 'rgba(60,100,255,0.45)' },
  3: { name: 'Trigger',  color: 'rgba(60,255,60,0.45)' },
};
