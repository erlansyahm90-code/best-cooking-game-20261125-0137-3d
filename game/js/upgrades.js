// upgrades.js — The coin shop: 8 upgrades, 3 tiers each.
// Effects are real gameplay numbers; the shop opens between levels and
// can also be opened mid-shift (it pauses the game).

export const UPGRADES = [
  {
    id: 'knife', name: 'Pisau & Talnan', icon: '🔪',
    desc: 'Chop lebih cepat di talnan.',
    tiers: [
      { price: 25, chopTime: 1.2 },
      { price: 50, chopTime: 0.7 },
      { price: 90, chopTime: 0.4 },
    ],
    base: { chopTime: 2.0 },
  },
  {
    id: 'stove', name: 'Kompor', icon: '🔥',
    desc: 'Masak lebih cepat, api membesar. Tier 3: +1 burner.',
    tiers: [
      { price: 30, cookMult: 0.8, burners: 2, flame: 1.3 },
      { price: 60, cookMult: 0.6, burners: 2, flame: 1.7 },
      { price: 110, cookMult: 0.45, burners: 3, flame: 2.2 },
    ],
    base: { cookMult: 1.0, burners: 2, flame: 1.0 },
  },
  {
    id: 'plating', name: 'Meja Plating', icon: '🍽️',
    desc: 'Plating lebih cepat, slot piring bertambah.',
    tiers: [
      { price: 25, plateTime: 1.2, plateSlots: 3 },
      { price: 50, plateTime: 0.8, plateSlots: 4 },
      { price: 90, plateTime: 0.5, plateSlots: 5 },
    ],
    base: { plateTime: 1.8, plateSlots: 2 },
  },
  {
    id: 'window', name: 'Jendela Serving', icon: '🪟',
    desc: 'Tip naik: pelanggan bayar lebih.',
    tiers: [
      { price: 30, tipMult: 1.25 },
      { price: 60, tipMult: 1.5 },
      { price: 110, tipMult: 2.0 },
    ],
    base: { tipMult: 1.0 },
  },
  {
    id: 'shoes', name: 'Sepatu Chef', icon: '👟',
    desc: 'Chef bergerak lebih cepat antar stasiun.',
    tiers: [
      { price: 20, speedMult: 1.15 },
      { price: 40, speedMult: 1.3 },
      { price: 80, speedMult: 1.5 },
    ],
    base: { speedMult: 1.0 },
  },
  {
    id: 'pantry', name: 'Pantry', icon: '🧺',
    desc: 'Ambil bahan lebih cepat.',
    tiers: [
      { price: 20, pickupTime: 0.5 },
      { price: 40, pickupTime: 0.3 },
      { price: 80, pickupTime: 0.15 },
    ],
    base: { pickupTime: 0.8 },
  },
  {
    id: 'quality', name: 'Kualitas Bahan', icon: '✨',
    desc: 'Bahan lebih segar: tip naik + bonus perfect-cook lebih besar.',
    tiers: [
      { price: 35, qualityTip: 2, perfectBonus: 4 },
      { price: 70, qualityTip: 4, perfectBonus: 8 },
      { price: 120, qualityTip: 7, perfectBonus: 12 },
    ],
    base: { qualityTip: 0, perfectBonus: 2 },
  },
  {
    id: 'warming', name: 'Warming Station', icon: '♨️',
    desc: 'Rak pemanas: hidangan masak ditahan tanpa gosong.',
    tiers: [
      { price: 40, warmingSlots: 1 },
      { price: 80, warmingSlots: 2 },
      { price: 130, warmingSlots: 3 },
    ],
    base: { warmingSlots: 0 },
  },
  {
    id: 'waiter', name: 'Pelayan', icon: '🤵',
    desc: 'Pelayan antar hidangan siap ke penumpang. Tier 2: jalan 50% lebih cepat. Tier 3: 2 pelayan.',
    tiers: [
      { price: 50, waiters: 1, speedMult: 1.0 },
      { price: 100, waiters: 1, speedMult: 1.5 },
      { price: 160, waiters: 2, speedMult: 1.5 },
    ],
    base: { waiters: 0, speedMult: 1.0 },
  },
];

// Tier 2 needs level 2, tier 3 needs level 4.
export function tierUnlockLevel(tierIndex) {
  return tierIndex === 0 ? 1 : tierIndex === 1 ? 2 : 4;
}
export function upgradeById(id) {
  return UPGRADES.find((u) => u.id === id) || null;
}
// Effective stats from a state object {knife:0..3, stove:0..3, ...}.
export function effectiveStats(state) {
  const out = {};
  for (const u of UPGRADES) {
    const tier = state[u.id] || 0;
    const eff = { ...u.base };
    if (tier > 0) Object.assign(eff, u.tiers[tier - 1]);
    out[u.id] = eff;
  }
  return out;
}
export function upgradeCost(id, tierIndex) {
  const u = upgradeById(id);
  if (!u || tierIndex < 0 || tierIndex >= u.tiers.length) return null;
  return u.tiers[tierIndex].price;
}
export function canBuy(id, tierIndex, level, coins) {
  if (level < tierUnlockLevel(tierIndex)) return { ok: false, why: 'locked' };
  const cost = upgradeCost(id, tierIndex);
  if (cost === null) return { ok: false, why: 'max' };
  if (coins < cost) return { ok: false, why: 'coins' };
  return { ok: true, cost };
}
