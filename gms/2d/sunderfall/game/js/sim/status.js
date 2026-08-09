export const STATUS = {
  BURN: 0,
  ACID: 1,
  SLOW: 2,
  STUN: 3,
  ROOT: 4,
  SHIELD: 5,
  HASTE: 6,
  WET: 7,
  CORRODE: 8,
  MARK: 9,
};
export const STATUS_NAMES = ['burn', 'acid', 'slow', 'stun', 'root', 'shield', 'haste', 'wet', 'corrode', 'mark'];
export const STATUS_COUNT = 10;

const BY_NAME = new Map();
for (let i = 0; i < STATUS_NAMES.length; i++) BY_NAME.set(STATUS_NAMES[i], i);

export function statusId(s) {
  if (typeof s === 'number') return s;
  const v = BY_NAME.get(s);
  return v === undefined ? -1 : v;
}
