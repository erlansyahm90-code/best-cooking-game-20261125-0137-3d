// stations.js — The 3D kitchen layout: where every station stands,
// what it does, and how the chef interacts with it.
// Floor plane: x in [-6.5, 6.5], z in [-4.2, 3.8]. Stations hug the back
// wall (z = -3.2); the serving window and warming rack are on the right.

export const STATIONS = [
  {
    id: 'pantry', name: 'Pantry', key: 'P',
    x: -5.3, z: -3.2, w: 2.2, d: 1.1, topY: 1.05,
    color: [0.55, 0.38, 0.22], topColor: [0.72, 0.52, 0.30],
    hint: 'Ambil bahan (E)',
  },
  {
    id: 'chopping', name: 'Chopping Board', key: 'C',
    x: -2.7, z: -3.2, w: 2.2, d: 1.1, topY: 1.05,
    color: [0.60, 0.45, 0.30], topColor: [0.85, 0.68, 0.45],
    hint: 'Chop bahan (E)',
  },
  {
    id: 'stove', name: 'Stove', key: 'S',
    x: 0.1, z: -3.2, w: 2.4, d: 1.1, topY: 1.05,
    color: [0.25, 0.25, 0.28], topColor: [0.15, 0.15, 0.18],
    hint: 'Masak di kompor (E)',
  },
  {
    id: 'plating', name: 'Plating Counter', key: 'L',
    x: 3.0, z: -3.2, w: 2.2, d: 1.1, topY: 1.05,
    color: [0.75, 0.75, 0.78], topColor: [0.92, 0.92, 0.95],
    hint: 'Rakit hidangan (E)',
  },
  {
    id: 'serving', name: 'Serving Window', key: 'V',
    x: 5.6, z: -2.0, w: 1.2, d: 2.0, topY: 1.05,
    color: [0.20, 0.45, 0.65], topColor: [0.30, 0.60, 0.85],
    hint: 'Sajikan (E) • Teh (T)',
  },
  {
    id: 'warming', name: 'Warming Station', key: 'W',
    x: 5.6, z: 0.9, w: 1.2, d: 1.6, topY: 1.05,
    color: [0.65, 0.30, 0.15], topColor: [0.85, 0.45, 0.20],
    hint: 'Tahan masakan (E)',
    needsUpgrade: 'warming',
  },
];

// Passenger platform (Cooking Dash layout lesson: customers wait at a
// counter with their ticket + patience meter above their heads).
// The platform runs down the LEFT side; each waiting order gets one
// passenger figure standing here, facing the kitchen.
export const PASSENGER_SPOTS = [
  { x: -6.0, z: -1.4 },
  { x: -6.0, z: -0.1 },
  { x: -6.0, z: 1.2 },
  { x: -6.0, z: 2.5 },
];
// A locked slot (upgrade not bought yet) shows a padlock marker.
export const LOCK_COLOR = [0.15, 0.15, 0.18];

// Burner slots on the stove, in world coords (relative to stove centre).
export function burnerSlots(burnerCount) {
  const cx = 0.1, cz = -3.2;
  if (burnerCount >= 3) return [{ x: cx - 0.75, z: cz }, { x: cx, z: cz }, { x: cx + 0.75, z: cz }];
  return [{ x: cx - 0.55, z: cz }, { x: cx + 0.55, z: cz }];
}
// Plate slots on the plating counter.
export function plateSlots(slotCount) {
  const cx = 3.0, cz = -3.2;
  const out = [];
  for (let i = 0; i < slotCount; i++) {
    out.push({ x: cx - 0.7 + (i * 1.4) / Math.max(1, slotCount - 1), z: cz });
  }
  return out;
}
export function stationById(id) {
  return STATIONS.find((s) => s.id === id) || null;
}
// Nearest station within reach of a point (chef position).
export function nearestStation(x, z, reach) {
  let best = null, bestD = reach;
  for (const s of STATIONS) {
    const dx = x - s.x, dz = z - s.z;
    const d = Math.hypot(dx, dz);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}
// Clamp a point to the walkable floor.
export function clampFloor(x, z) {
  return [
    Math.max(-6.2, Math.min(6.2, x)),
    Math.max(-2.2, Math.min(3.5, z)),
  ];
}
