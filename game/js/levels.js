// levels.js — The 5 Junction Kitchen shifts.
// Each level is a timed shift: serve as much as you can before the last
// train leaves. Stars are earned from coins banked in the shift.

export const LEVELS = [
  {
    n: 1, name: 'Pagi', sub: 'First trains roll in',
    duration: 150, orderEvery: 14, maxOrders: 2, expressChance: 0,
    patienceScale: 1.25, stars: [40, 70, 100],
    unlockText: '3 resep dasar terbuka',
  },
  {
    n: 2, name: 'Siang', sub: 'Lunch rush on platform 2',
    duration: 150, orderEvery: 12, maxOrders: 2, expressChance: 0,
    patienceScale: 1.1, stars: [60, 100, 140],
    unlockText: 'Resep baru: Express Fries + Kentang di pantry. Upgrade Tier 2 terbuka.',
  },
  {
    n: 3, name: 'Sore', sub: 'Commuters, three at a time',
    duration: 165, orderEvery: 11, maxOrders: 3, expressChance: 0.08,
    patienceScale: 1.0, stars: [80, 130, 180],
    unlockText: 'Resep baru: Mushroom Melt + Jamur di pantry. 3 order sekaligus.',
  },
  {
    n: 4, name: 'Malam', sub: 'Express trains start stopping',
    duration: 165, orderEvery: 10, maxOrders: 3, expressChance: 0.18,
    patienceScale: 0.9, stars: [100, 160, 220],
    unlockText: 'Resep baru: Night Express Stew. Express Train muncul. Upgrade Tier 3 terbuka.',
  },
  {
    n: 5, name: 'Tengah Malam', sub: 'Rush hour — the last trains',
    duration: 180, orderEvery: 8, maxOrders: 4, expressChance: 0.30,
    patienceScale: 0.8, stars: [130, 200, 280],
    unlockText: 'Resep signature: Golden Junction Platter. Express Train sering muncul.',
  },
];

export function levelDef(n) {
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, n - 1))];
}
// Stars (0-5) from coins banked in a shift: 1/2/3 from thresholds,
// +1 expert star at 1.5x the 3-star bar, +1 perfect star when the expert
// bar is reached with no failed order.
export function starsFor(level, coins, failedOrders) {
  const t = levelDef(level).stars;
  let s = 0;
  if (coins >= t[0]) s = 1;
  if (coins >= t[1]) s = 2;
  if (coins >= t[2]) s = 3;
  if (coins >= Math.round(t[2] * 1.5)) s = 4;
  if (s === 4 && failedOrders === 0) s = 5;
  return s;
}
