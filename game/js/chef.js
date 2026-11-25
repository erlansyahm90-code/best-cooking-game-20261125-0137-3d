// chef.js — The chef: movement, facing, and two hand slots.
// The chef carries up to 2 items at once. Each carried item is one
// ingredient in a prep state (raw / chopped / cooked / ready-to-plate).

export const HAND_SLOTS = 2;
export const BASE_SPEED = 4.2; // world units per second

export function makeChef() {
  return {
    x: 0, z: 1.6, facing: Math.PI, // facing the stations (north)
    vx: 0, vz: 0,
    hands: [null, null], // each: { ing, chopped, cooked, perfect, forRecipe, compIndex } | null
    moving: false,
    bob: 0,
  };
}

export function freeHand(chef) {
  return chef.hands.findIndex((h) => h === null);
}
export function handCount(chef) {
  return chef.hands.filter((h) => h !== null).length;
}
export function giveItem(chef, item) {
  const i = freeHand(chef);
  if (i < 0) return false;
  chef.hands[i] = item;
  return true;
}
export function takeItem(chef, handIndex) {
  const item = chef.hands[handIndex];
  chef.hands[handIndex] = null;
  return item;
}
// Find a carried item matching an ingredient id (any prep state).
export function findCarried(chef, ing) {
  return chef.hands.findIndex((h) => h && h.ing === ing);
}
// Move the chef by input axes (ix, iz in -1..1), dt seconds.
export function moveChef(chef, ix, iz, dt, speedMult) {
  const len = Math.hypot(ix, iz);
  if (len < 0.01) { chef.moving = false; chef.vx = 0; chef.vz = 0; return; }
  const sp = BASE_SPEED * (speedMult || 1);
  const nx = ix / len, nz = iz / len;
  chef.x += nx * sp * dt;
  chef.z += nz * sp * dt;
  chef.facing = Math.atan2(nx, nz);
  chef.moving = true;
  chef.bob += dt * 10;
}
