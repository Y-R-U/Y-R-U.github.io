// Managers: one per business (data/managers.js). Hiring raises σ (sells more on the spot) and adds the trait.
export function managerFor(data, lineId) {
  return data.managers.find((m) => m.lineId === lineId) || null;
}

export function newManagerState() {
  return { level: 1 };
}
