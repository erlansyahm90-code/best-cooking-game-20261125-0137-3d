// waiter.js — The waiter (Pelayan) upgrade: a visible runner who picks a
// READY plate up from the serving window and delivers it to the matching
// passenger. Distinct from the sous-chef (who auto-chops): the waiter
// only carries and serves. Pure helpers here so the logic is unit-testable;
// the frame-by-frame state machine lives in main.js.

export const WAITER_BASE_SPEED = 2.2; // world units per second
export const WAITER_HOME = [4.4, 0.8]; // idle spot by the serving window
export const WAITER_PICKUP = [5.6, -0.6]; // in front of the serving window

export function makeWaiter(home, index) {
  const h = home || WAITER_HOME;
  return {
    x: h[0] + (index || 0) * 0.9, z: h[1] + (index || 0) * 0.5,
    home: [h[0] + (index || 0) * 0.9, h[1] + (index || 0) * 0.5],
    facing: Math.PI,
    state: 'idle', // idle | toPickup | pickup | toPassenger | delivering | returning
    carrying: null, // dish object once picked up
    dish: null, // claimed dish object (still on the counter until pickup)
    order: null, // order object being served
    t: 0, // timer for pickup pause / delivery anim
    moving: false,
    bob: 0,
  };
}

// Speed from effective stats (tier 2 is 50% faster).
export function waiterSpeed(stats) {
  const mult = (stats && stats.waiter && stats.waiter.speedMult) || 1;
  return WAITER_BASE_SPEED * mult;
}

// Pick a job for an idle waiter: the most urgent waiting order whose
// recipe has a READY plate that is not already claimed. Returns
// { dishIndex, order } or null. The caller claims the dish (dish.claimed).
export function pickWaiterJob(readyPlates, orders) {
  if (!readyPlates || readyPlates.length === 0) return null;
  const waiting = (orders || []).filter((o) => o.state === 'waiting')
    .sort((a, b) => (a.patience / a.patienceMax) - (b.patience / b.patienceMax));
  for (const o of waiting) {
    const di = readyPlates.findIndex((d) => d.recipeId === o.recipeId && !d.claimed);
    if (di >= 0) return { dishIndex: di, order: o };
  }
  return null;
}

// Step toward a target: returns { x, z, arrived }. Pure — no mutation.
export function moveToward(x, z, tx, tz, speed, dt) {
  const dx = tx - x, dz = tz - z;
  const d = Math.hypot(dx, dz);
  if (d < 0.12) return { x, z, arrived: true };
  const step = Math.min(d, speed * dt);
  return { x: x + (dx / d) * step, z: z + (dz / d) * step, arrived: false };
}
