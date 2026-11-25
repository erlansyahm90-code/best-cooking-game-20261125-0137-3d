// orders.js — Order board: generation, patience, passenger types, tips.
// Orders are train departures: each has a recipe, a passenger type and a
// patience clock. Patience green -> orange -> red; a red order fails.

import { unlockedRecipes, recipeById } from './recipes.js';

// Passenger types: different patience, different tips.
export const PASSENGERS = {
  santai:   { name: 'Santai',    patience: 95, tip: 2,  color: [0.35, 0.70, 0.35] },
  buru:     { name: 'Buru-buru', patience: 55, tip: 6,  color: [0.95, 0.55, 0.10] },
  vip:      { name: 'VIP',       patience: 40, tip: 12, color: [0.85, 0.25, 0.65] },
};
const PASSENGER_KEYS = ['santai', 'santai', 'buru', 'buru', 'vip'];

let orderSeq = 0;

export function makeOrder(level, opts) {
  const o = opts || {};
  const pool = unlockedRecipes(level);
  const recipe = o.recipeId ? recipeById(o.recipeId) : pool[Math.floor(Math.random() * pool.length)];
  const pKey = o.passenger || PASSENGER_KEYS[Math.floor(Math.random() * PASSENGER_KEYS.length)];
  const p = PASSENGERS[pKey];
  const express = !!o.express;
  const patienceScale = o.patienceScale || 1;
  const patience = Math.round(p.patience * patienceScale * (express ? 0.55 : 1));
  orderSeq += 1;
  return {
    id: 'ord-' + orderSeq,
    train: 'KA-' + (100 + Math.floor(Math.random() * 800)),
    recipeId: recipe.id,
    recipeName: recipe.name,
    recipeColor: recipe.color,
    passenger: pKey,
    passengerName: p.name,
    tip: p.tip,
    patienceMax: patience,
    patience: patience,
    express,
    state: 'waiting', // waiting | served | failed
    servedAt: null,
  };
}

// Patience fraction 0..1 and its colour band.
export function patienceFrac(order) {
  return Math.max(0, order.patience / order.patienceMax);
}
export function patienceBand(order) {
  const f = patienceFrac(order);
  if (f > 0.5) return 'green';
  if (f > 0.25) return 'orange';
  return 'red';
}
export function patienceColor(order) {
  const b = patienceBand(order);
  if (b === 'green') return [0.25, 0.75, 0.30];
  if (b === 'orange') return [0.95, 0.60, 0.10];
  return [0.90, 0.20, 0.20];
}

// Tick all orders by dt seconds. Returns orders that just failed.
export function tickOrders(orders, dt) {
  const failed = [];
  for (const o of orders) {
    if (o.state !== 'waiting') continue;
    o.patience -= dt;
    if (o.patience <= 0) {
      o.patience = 0;
      o.state = 'failed';
      failed.push(o);
    }
  }
  return failed;
}

// Serve payout: recipe price + passenger tip (scaled by window upgrade)
// + fast-serve bonus + perfect-cook bonus + combo bonus + quality bonus.
// Returns { coins, breakdown }.
export function servePayout(order, ctx) {
  const recipe = recipeById(order.recipeId);
  const tipMult = (ctx && ctx.tipMult) || 1;
  const qualityTip = (ctx && ctx.qualityTip) || 0;
  const perfectBonus = (ctx && ctx.perfectBonus) || 0;
  const combo = (ctx && ctx.combo) || 0;
  const base = recipe.basePrice;
  const tip = Math.round((order.tip + qualityTip) * tipMult);
  // Fast serve: patience still above 60% pays a speed bonus.
  const fast = patienceFrac(order) > 0.6 ? 4 : 0;
  const comboBonus = Math.min(combo, 5) * 2;
  const coins = base + tip + fast + perfectBonus + comboBonus;
  return {
    coins,
    breakdown: { base, tip, fast, perfect: perfectBonus, combo: comboBonus },
  };
}

// Score of one order for the board: how urgent it is (0..1, 1 = about to fail).
export function urgency(order) {
  return 1 - patienceFrac(order);
}
