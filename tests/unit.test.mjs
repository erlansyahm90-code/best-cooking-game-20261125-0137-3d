// Unit tests for Junction Kitchen 3D pure logic (node --test).
import test from 'node:test';
import assert from 'node:assert/strict';
import { RECIPES, recipeById, unlockedRecipes, unlockedIngredients, nextPrepStep, componentReady } from '../game/js/recipes.js';
import { LEVELS, levelDef, starsFor } from '../game/js/levels.js';
import { UPGRADES, effectiveStats, canBuy, tierUnlockLevel } from '../game/js/upgrades.js';
import { makeOrder, tickOrders, servePayout, patienceFrac, patienceBand } from '../game/js/orders.js';
import { cookZone, isPerfect, makeCountdown, tickCountdown, makeAction, tickAction, actionFrac } from '../game/js/timer.js';
import { STATIONS, PASSENGER_SPOTS, burnerSlots, plateSlots, nearestStation, clampFloor } from '../game/js/stations.js';
import { makeChef, giveItem, takeItem, freeHand, handCount, moveChef } from '../game/js/chef.js';

test('recipes: 7 recipes, unlocks by level', () => {
  assert.equal(RECIPES.length, 7);
  assert.equal(unlockedRecipes(1).length, 3);
  assert.equal(unlockedRecipes(2).length, 4);
  assert.equal(unlockedRecipes(5).length, 7);
  assert.equal(unlockedIngredients(1).length, 6);
  assert.ok(unlockedIngredients(2).includes('potato'));
  assert.ok(unlockedIngredients(3).includes('mushroom'));
  assert.equal(recipeById('station-burger').components.length, 3);
});

test('recipes: prep steps follow chop/cook order', () => {
  const fries = recipeById('express-fries').components[0]; // potato chopcook
  assert.equal(nextPrepStep(fries, { chopped: false, cooked: false }), 'chop');
  assert.equal(nextPrepStep(fries, { chopped: true, cooked: false }), 'cook');
  assert.equal(nextPrepStep(fries, { chopped: true, cooked: true }), null);
  assert.equal(componentReady(fries, { chopped: true, cooked: true }), true);
  const bread = recipeById('signal-sandwich').components[0];
  assert.equal(nextPrepStep(bread, {}), null);
});

test('levels: 5 shifts with growing pressure', () => {
  assert.equal(LEVELS.length, 5);
  assert.ok(levelDef(5).maxOrders > levelDef(1).maxOrders);
  assert.ok(levelDef(5).orderEvery < levelDef(1).orderEvery);
  assert.ok(levelDef(5).expressChance > levelDef(1).expressChance);
  assert.equal(starsFor(1, 0, 0), 0);
  assert.equal(starsFor(1, 40, 0), 1);
  assert.equal(starsFor(1, 100, 0), 3);
  assert.equal(starsFor(1, 150, 0), 5); // expert bar + no failures = 5 stars
  assert.equal(starsFor(1, 150, 1), 4); // a failed order blocks the 5th star
  assert.equal(starsFor(1, 100, 1), 3);
});

test('upgrades: 8 upgrades, 3 tiers, locks by level', () => {
  assert.equal(UPGRADES.length, 8);
  for (const u of UPGRADES) assert.equal(u.tiers.length, 3);
  assert.equal(tierUnlockLevel(0), 1);
  assert.equal(tierUnlockLevel(1), 2);
  assert.equal(tierUnlockLevel(2), 4);
  const base = effectiveStats({});
  assert.equal(base.knife.chopTime, 2.0);
  assert.equal(base.stove.burners, 2);
  const full = effectiveStats({ knife: 3, stove: 3, plating: 3 });
  assert.equal(full.knife.chopTime, 0.4);
  assert.equal(full.stove.burners, 3);
  assert.equal(full.plating.plateSlots, 5);
  assert.equal(canBuy('knife', 0, 1, 25).ok, true);
  assert.equal(canBuy('knife', 1, 1, 999).ok, false); // tier 2 needs LV2
  assert.equal(canBuy('knife', 0, 1, 10).ok, false); // not enough coins
});

test('orders: patience bands and payout math', () => {
  const o = makeOrder(1, { recipeId: 'station-burger', passenger: 'vip', express: false });
  assert.equal(o.recipeId, 'station-burger');
  assert.equal(patienceBand(o), 'green');
  assert.ok(patienceFrac(o) > 0.99);
  o.patience = o.patienceMax * 0.4;
  assert.equal(patienceBand(o), 'orange');
  o.patience = o.patienceMax * 0.1;
  assert.equal(patienceBand(o), 'red');
  const pay = servePayout(o, { tipMult: 2, qualityTip: 4, perfectBonus: 8, combo: 3 });
  // base 18 + tip (12+4)*2=32 + fast 0 (patience low) + perfect 8 + combo 6 = 64
  assert.equal(pay.coins, 64);
  const failed = tickOrders([o], 999);
  assert.equal(failed.length, 1);
  assert.equal(o.state, 'failed');
});

test('timer: cook zones and actions', () => {
  assert.equal(cookZone(0.1), 'cooking');
  assert.equal(cookZone(0.5), 'perfect');
  assert.equal(isPerfect(0.5), true);
  assert.equal(cookZone(0.8), 'late');
  assert.equal(cookZone(1.0), 'burnt');
  const c = makeCountdown(60);
  tickCountdown(c, 15);
  assert.equal(c.left, 45);
  const a = makeAction(2);
  assert.equal(tickAction(a, 1), false);
  assert.equal(actionFrac(a), 0.5);
  assert.equal(tickAction(a, 1), true);
});

test('stations: layout, burners, plates, reach', () => {
  assert.equal(STATIONS.length, 6);
  assert.equal(PASSENGER_SPOTS.length, 4);
  assert.equal(burnerSlots(2).length, 2);
  assert.equal(burnerSlots(3).length, 3);
  assert.equal(plateSlots(2).length, 2);
  assert.equal(plateSlots(5).length, 5);
  assert.equal(nearestStation(-5.3, -2.0, 2.1).id, 'pantry');
  assert.equal(nearestStation(0, 0, 2.1), null);
  const [x, z] = clampFloor(99, -99);
  assert.equal(x, 6.2);
  assert.equal(z, -2.2);
});

test('chef: two hand slots, movement', () => {
  const chef = makeChef();
  assert.equal(handCount(chef), 0);
  assert.equal(freeHand(chef), 0);
  assert.equal(giveItem(chef, { ing: 'tomato' }), true);
  assert.equal(giveItem(chef, { ing: 'bread' }), true);
  assert.equal(giveItem(chef, { ing: 'cheese' }), false); // full
  assert.equal(freeHand(chef), -1);
  assert.equal(takeItem(chef, 0).ing, 'tomato');
  assert.equal(handCount(chef), 1);
  moveChef(chef, 1, 0, 1, 1);
  assert.ok(chef.x > 4 && chef.x < 4.5);
  assert.equal(chef.moving, true);
});
