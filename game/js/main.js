// main.js — Junction Kitchen 3D: game state, loop, input, HUD (2D canvas),
// overlays (title / level-up / shop / recipe book / pause / game over),
// staged scenes for screenshots, and a test hook (window.JK).

import { Renderer, matMultiply, matPerspective, matLookAt, hex } from './gl.js';
import { Scene3D, makeViewProjection, projectToScreen, CAMERA } from './render3d.js';
import { INGREDIENTS, RECIPES, recipeById, unlockedRecipes, unlockedIngredients, nextPrepStep } from './recipes.js';
import { LEVELS, levelDef, starsFor } from './levels.js';
import { UPGRADES, effectiveStats, canBuy, tierUnlockLevel } from './upgrades.js';
import { PASSENGERS, makeOrder, tickOrders, servePayout, patienceFrac, patienceColor } from './orders.js';
import { makeCountdown, tickCountdown, fmtTime, makeAction, tickAction, actionFrac, PERFECT_LOW, PERFECT_HIGH } from './timer.js';
import { STATIONS, PASSENGER_SPOTS, stationById, nearestStation, clampFloor, burnerSlots, plateSlots } from './stations.js';
import { makeChef, moveChef, giveItem, takeItem, findCarried, freeHand, handCount } from './chef.js';
import { makeWaiter, waiterSpeed, pickWaiterJob, moveToward, WAITER_HOME, WAITER_PICKUP } from './waiter.js';
import { SoundBank } from './audio.js';

const W = 1280, H = 720;
const CHOPPABLE = new Set(['tomato', 'lettuce', 'carrot', 'potato', 'mushroom']);
const COOKABLE = new Set(['patty', 'mushroom']);

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- state ----------
function freshState() {
  return {
    screen: 'title', paused: false, showBook: false, pantryOpen: false,
    level: 1, levelTime: 150, coins: 0, totalCoins: 0, totalStars: 0,
    combo: 0, serves: 0, failed: 0,
    chef: makeChef(),
    orders: [], spots: [null, null, null, null], orderTimer: 6,
    burners: [], chopping: null, boardPieces: [],
    plates: [], readyPlates: [], warmingItems: [],
    upgrades: { knife: 0, stove: 0, plating: 0, window: 0, shoes: 0, pantry: 0, quality: 0, warming: 0, waiter: 0 },
    stats: effectiveStats({}),
    sousChef: false, sousChefReady: false,
    waiters: [],
    teaCooldown: 0, teaUsed: 0,
    particles: [], floaters: [],
    pantryItems: [], pantryHighlight: null,
    time: 0, action: null, moveTarget: null,
    serveAnim: null, passengerJoy: null,
    realtime: true,
    frozen: false, scene: null, annotations: false,
    levelStars: 0, levelCoins: 0,
    shopSel: null,
  };
}

let S = freshState();
const sound = new SoundBank();
const glCanvas = document.getElementById('gl');
const hudCanvas = document.getElementById('hud');
const hctx = hudCanvas.getContext('2d');
const scene = new Scene3D(glCanvas);
let vp = makeViewProjection(W, H);

// ---------- helpers ----------
function levelParams() { return levelDef(S.level); }
function plateSlotCount() { return S.stats.plating.plateSlots; }
function burnerCount() { return S.stats.stove.burners; }
function syncBurners() {
  while (S.burners.length < burnerCount()) S.burners.push({ state: 'empty', ing: null, progress: 0, duration: 8, perfect: false, perfectDinged: false });
  while (S.burners.length > burnerCount()) {
    const b = S.burners.pop();
    if (b.state !== 'empty') S.burners.push(b);
  }
}
function syncStats() { S.stats = effectiveStats(S.upgrades); }
// Match the waiter crew to the waiter upgrade tier (1 waiter at tier 1-2,
// 2 waiters at tier 3). New waiters start at their home spot.
function syncWaiters() {
  const want = (S.stats.waiter && S.stats.waiter.waiters) || 0;
  while (S.waiters.length < want) S.waiters.push(makeWaiter(WAITER_HOME, S.waiters.length));
  while (S.waiters.length > want) S.waiters.pop();
}
function floater(x, y, text, color) {
  S.floaters.push({ x, y, text, color: color || '#ffd700', life: 1.4 });
}
function chefScreenPos() {
  return projectToScreen(vp, S.chef.x, 2.2, S.chef.z, W, H);
}
function addSteam(x, y, z) {
  S.particles.push({ x: x + (Math.random() - 0.5) * 0.2, y, z: z + (Math.random() - 0.5) * 0.2, r: 0.09, vy: 0.5, life: 1.2 });
}

// ---------- level lifecycle ----------
function startLevel(n) {
  S.level = n;
  sound.setMusicLevel(n); // melody + tempo follow the shift (Rush Hour is faster)
  const L = levelDef(n);
  S.levelTime = L.duration;
  S.coins = 0; S.combo = 0; S.serves = 0; S.failed = 0;
  S.orders = []; S.spots = [null, null, null, null]; S.orderTimer = 4;
  S.burners = []; S.chopping = null; S.boardPieces = [];
  S.plates = []; S.readyPlates = []; S.warmingItems = [];
  S.chef = makeChef();
  S.sousChef = false; S.sousChefReady = false;
  S.teaCooldown = 0; S.action = null; S.moveTarget = null;
  S.pantryItems = unlockedIngredients(n);
  syncBurners();
  S.screen = 'playing';
  S.paused = false; S.showBook = false; S.pantryOpen = false;
}
function newGame() {
  S = freshState();
  S.stats = effectiveStats(S.upgrades);
  sound.stopSizzle(); // fresh kitchen, no burners cooking
  startLevel(1);
  sound.startMusic();
}
function finishLevel() {
  const stars = starsFor(S.level, S.coins, S.failed);
  S.levelStars = stars; S.levelCoins = S.coins;
  S.totalCoins += S.coins; S.totalStars += stars;
  sound.levelUp();
  S.screen = 'levelup';
}
function nextAfterShop() {
  if (S.level >= LEVELS.length) { S.screen = 'gameover'; return; }
  startLevel(S.level + 1);
}

// ---------- orders ----------
function spawnOrder(opts) {
  const waiting = S.orders.filter((o) => o.state === 'waiting').length;
  const L = levelParams();
  if (waiting >= L.maxOrders) return null;
  const spot = S.spots.indexOf(null);
  if (spot < 0) return null;
  const express = opts && opts.express !== undefined ? opts.express : Math.random() < L.expressChance;
  const o = makeOrder(S.level, { ...opts, express, patienceScale: L.patienceScale });
  o.spot = spot;
  S.spots[spot] = o.id;
  S.orders.push(o);
  sound.bell();
  return o;
}
function resolveOrder(order, how) {
  order.state = how;
  if (order.spot !== undefined && S.spots[order.spot] === order.id) S.spots[order.spot] = null;
  S.orders = S.orders.filter((o) => o.id !== order.id);
}

// ---------- interactions ----------
function nearestReachable() {
  return nearestStation(S.chef.x, S.chef.z, 2.1);
}
function startAction(type, duration, world, onDone, label) {
  S.action = { type, duration, t: 0, world, onDone, label };
}
function interact() {
  if (S.screen !== 'playing' || S.paused || S.action) return;
  const st = nearestReachable();
  if (!st) return;
  const chef = S.chef;
  if (st.id === 'pantry') {
    S.pantryOpen = true;
    sound.click();
    return;
  }
  if (st.id === 'chopping') {
    const idx = chef.hands.findIndex((h) => h && !h.chopped && CHOPPABLE.has(h.ing));
    if (idx < 0) { floater(...chefScreenPos(), 'Bawa bahan yang bisa di-chop', '#ff9a9a'); return; }
    if (S.sousChefReady) {
      // Sous-chef chops instantly, free.
      chef.hands[idx].chopped = true;
      S.sousChefReady = false;
      sound.chop();
      floater(...chefScreenPos(), 'Sous-chef chop!', '#7fe0c0');
      return;
    }
    const dur = S.stats.knife.chopTime;
    S.chopping = { ing: chef.hands[idx].ing, progress: 0, hand: idx, strokes: 0 };
    S.boardPieces = [];
    startAction('chop', dur, { x: -2.7, y: 1.9, z: -3.2 }, () => {
      chef.hands[idx].chopped = true;
      S.chopping = null;
      // Pieces fly off the board into the hand.
      for (let i = 0; i < 5; i++) {
        S.particles.push({ x: -2.7 + (Math.random() - 0.5) * 0.6, y: 1.3, z: -3.2 + (Math.random() - 0.5) * 0.4, r: 0.07, vy: 0.9, life: 0.6 });
      }
      S.boardPieces = [];
      sound.chop();
    }, 'Chopping');
    return;
  }
  if (st.id === 'stove') {
    // Take out a done pot first when any hand is free (progress in/after
    // the perfect zone, or a burnt pot to trash it). The other hand may
    // hold something — the chef has two hands for a reason.
    if (freeHand(chef) >= 0) {
      const doneIdx = S.burners.findIndex((b) => b.state === 'burnt' || (b.state === 'cooking' && b.progress >= PERFECT_LOW));
      if (doneIdx >= 0) {
        const b = S.burners[doneIdx];
        if (b.state === 'burnt') {
          S.burners[doneIdx] = { state: 'empty', ing: null, progress: 0, duration: 8, perfect: false, perfectDinged: false };
          sound.fail();
          floater(...chefScreenPos(), 'Gosong! Dibuang', '#ff9a9a');
        } else {
          const perfect = b.progress >= PERFECT_LOW && b.progress <= PERFECT_HIGH;
          giveItem(chef, { ing: b.ing, chopped: b.chopped, cooked: true, perfect });
          S.burners[doneIdx] = { state: 'empty', ing: null, progress: 0, duration: 8, perfect: false, perfectDinged: false };
          sound.pickup();
          if (perfect) floater(...chefScreenPos(), 'PERFECT!', '#7dff8a');
        }
        return;
      }
    }
    // Put a cookable item into a free burner.
    const idx = chef.hands.findIndex((h) => h && !h.cooked &&
      (COOKABLE.has(h.ing) || (h.ing === 'potato' && h.chopped)));
    if (idx < 0) { floater(...chefScreenPos(), 'Bawa bahan yang bisa dimasak', '#ff9a9a'); return; }
    const free = S.burners.findIndex((b) => b.state === 'empty');
    if (free < 0) { floater(...chefScreenPos(), 'Kompor penuh!', '#ff9a9a'); return; }
    const item = takeItem(chef, idx);
    const recipe = RECIPES.find((r) => r.components.some((c) => c.ing === item.ing && c.cookTime));
    const dur = (recipe ? (recipe.components.find((c) => c.ing === item.ing) || {}).cookTime : 8) || 8;
    S.burners[free] = { state: 'cooking', ing: item.ing, chopped: item.chopped, progress: 0, duration: dur * S.stats.stove.cookMult, perfect: false, perfectDinged: false };
    sound.startSizzle(); // the loop keeps going until the pot leaves (see update())
    return;
  }
  if (st.id === 'plating') {
    const idx = chef.hands.findIndex((h) => h && isItemReady(h));
    if (idx < 0) { floater(...chefScreenPos(), 'Bawa komponen yang sudah siap', '#ff9a9a'); return; }
    const item = chef.hands[idx];
    const target = findPlateTarget(item);
    if (!target) { floater(...chefScreenPos(), 'Tidak ada order yang butuh ini', '#ff9a9a'); return; }
    const dur = S.stats.plating.plateTime;
    startAction('plate', dur, { x: 3.0, y: 1.9, z: -3.2 }, () => {
      takeItem(chef, idx);
      target.comp.done = true;
      if (item.perfect) target.plate.perfect = true;
      sound.place();
      if (target.plate.components.every((c) => c.done)) {
        target.plate.complete = true;
        S.readyPlates.push({ recipeId: target.plate.recipeId, recipeName: target.plate.recipeName, color: target.plate.color, perfect: target.plate.perfect });
        S.plates = S.plates.filter((p) => p !== target.plate);
        sound.ding();
        floater(...chefScreenPos(), target.plate.recipeName + ' siap!', '#7dff8a');
      }
    }, 'Plating');
    S.action.item = item;
    S.action.plate = target.plate;
    return;
  }
  if (st.id === 'serving') {
    serveReady();
    return;
  }
  if (st.id === 'warming') {
    const idx = chef.hands.findIndex((h) => h && h.cooked);
    if (idx >= 0) {
      if (S.warmingItems.length >= S.stats.warming.warmingSlots) { floater(...chefScreenPos(), 'Warming penuh!', '#ff9a9a'); return; }
      S.warmingItems.push(takeItem(chef, idx));
      sound.place();
      return;
    }
    if (S.warmingItems.length > 0 && freeHand(chef) >= 0) {
      giveItem(chef, S.warmingItems.shift());
      sound.pickup();
    }
    return;
  }
}
function isItemReady(item) {
  // Ready when no waiting order recipe still needs prep for this ingredient.
  for (const o of S.orders) {
    if (o.state !== 'waiting') continue;
    const r = recipeById(o.recipeId);
    const comp = r.components.find((c) => c.ing === item.ing);
    if (comp && nextPrepStep(comp, item) === null) return true;
  }
  return false;
}
function findPlateTarget(item) {
  // Most urgent waiting order whose recipe needs this ready component.
  const waiting = S.orders.filter((o) => o.state === 'waiting')
    .sort((a, b) => (a.patience / a.patienceMax) - (b.patience / b.patienceMax));
  for (const o of waiting) {
    const r = recipeById(o.recipeId);
    const comp = r.components.find((c) => c.ing === item.ing);
    if (!comp || nextPrepStep(comp, item) !== null) continue;
    let plate = S.plates.find((p) => p.recipeId === o.recipeId);
    if (!plate) {
      if (S.plates.length >= plateSlotCount()) continue;
      plate = {
        recipeId: r.id, recipeName: r.name, color: r.color, perfect: false, complete: false,
        components: r.components.map((c) => ({ ing: c.ing, done: false })),
      };
      S.plates.push(plate);
    }
    const slot = plate.components.find((c) => c.ing === item.ing && !c.done);
    if (slot) return { plate, comp: slot };
  }
  return null;
}
function serveReady() {
  if (S.serveAnim) return; // already delivering a plate
  if (S.readyPlates.length === 0) { floater(...chefScreenPos(), 'Belum ada hidangan siap', '#ff9a9a'); return; }
  const waiting = S.orders.filter((o) => o.state === 'waiting')
    .sort((a, b) => (a.patience / a.patienceMax) - (b.patience / b.patienceMax));
  for (const o of waiting) {
    // Skip plates a waiter already claimed — the waiter is bringing it.
    const di = S.readyPlates.findIndex((d) => d.recipeId === o.recipeId && !d.claimed);
    if (di < 0) continue;
    const dish = S.readyPlates[di];
    S.readyPlates.splice(di, 1);
    // The plate flies to the passenger; payout lands on arrival (see update).
    o.state = 'serving';
    const spot = PASSENGER_SPOTS[o.spot];
    S.serveAnim = { t: 0, dur: 0.9, dish, order: o, from: { x: 5.6, z: -2.0 }, to: { x: spot.x, z: spot.z } };
    sound.bell();
    return;
  }
  floater(...chefScreenPos(), 'Tidak cocok dengan order yang menunggu', '#ff9a9a');
}
function useTea() {
  if (S.teaCooldown > 0) return;
  const waiting = S.orders.filter((o) => o.state === 'waiting')
    .sort((a, b) => (a.patience / a.patienceMax) - (b.patience / b.patienceMax));
  if (waiting.length === 0) return;
  const o = waiting[0];
  o.patience = Math.min(o.patienceMax, o.patience + o.patienceMax * 0.25);
  S.teaCooldown = 20;
  S.teaUsed += 1;
  sound.ding();
  floater(...chefScreenPos(), 'Teh penenang untuk ' + o.train, '#c9a2ff');
}

// ---------- pantry picker ----------
function pickIngredient(ing) {
  if (!S.pantryOpen) return;
  if (freeHand(S.chef) < 0) { floater(W / 2, H / 2, 'Tangan penuh (maks 2)!', '#ff9a9a'); return; }
  if (!S.pantryItems.includes(ing)) return;
  giveItem(S.chef, { ing, chopped: false, cooked: false, perfect: false });
  // Stay open while a hand is still free (take up to 2 in one visit);
  // close once both hands are full.
  if (freeHand(S.chef) < 0) S.pantryOpen = false;
  sound.pickup();
}

// Shared serve payout: a chef serve and a waiter delivery both land
// here — same coins, combo, sous-chef progress, joy and floaters.
function completeServe(order, dish) {
  // Accepts 'waiting' (waiter delivery) and 'serving' (chef serve sets
  // this when the plate starts flying); rejects failed/already-served.
  if (!order || (order.state !== 'waiting' && order.state !== 'serving') || !dish) return;
  const payout = servePayout(order, {
    tipMult: S.stats.window.tipMult,
    qualityTip: S.stats.quality.qualityTip,
    perfectBonus: dish.perfect ? S.stats.quality.perfectBonus : 0,
    combo: S.combo,
  });
  S.coins += payout.coins;
  S.combo += 1;
  S.serves += 1;
  if (S.serves % 3 === 0) { S.sousChef = true; S.sousChefReady = true; }
  resolveOrder(order, 'served');
  sound.coin();
  sound.bell();
  S.passengerJoy = { spot: order.spot, t: 0.9 };
  const spot = PASSENGER_SPOTS[order.spot];
  const [jx, jy] = projectToScreen(vp, spot.x + 0.55, 2.7, spot.z, W, H);
  floater(jx, jy, '😋 Yum! +' + payout.coins, '#7dff8a');
  if (payout.breakdown.perfect) floater(jx, jy - 26, 'PERFECT +' + payout.breakdown.perfect, '#7dff8a');
  for (let i = 0; i < 8; i++) {
    S.particles.push({ x: spot.x + (Math.random() - 0.5), y: 1.6, z: spot.z + (Math.random() - 0.5), r: 0.08, vy: 0.8, life: 0.9 });
  }
}

// ---------- update ----------
function update(dt) {
  S.time += dt;
  if (S.screen !== 'playing' || S.paused || S.frozen) return;
  if (S.pantryOpen) return; // time keeps running? No: pantry pauses the rush (fair).
  // Level clock.
  S.levelTime -= dt;
  if (S.levelTime <= 0) { S.levelTime = 0; finishLevel(); return; }
  // Orders.
  S.orderTimer -= dt;
  if (S.orderTimer <= 0) {
    spawnOrder();
    S.orderTimer = levelParams().orderEvery * (0.85 + Math.random() * 0.3);
  }
  const failed = tickOrders(S.orders.filter((o) => o.state === 'waiting'), dt);
  for (const o of failed) {
    S.combo = 0;
    S.failed += 1;
    S.coins = Math.max(0, S.coins - 10);
    resolveOrder(o, 'failed');
    sound.fail();
    floater(...chefScreenPos(), o.train + ' gagal! -10', '#ff6a6a');
  }
  // Burners: progress keeps advancing while cooking; at >= 1.0 it burns.
  // "Done" is derived: progress >= PERFECT_LOW. Perfect zone is 0.35-0.65.
  // Steam grows thicker as the food cooks.
  for (const b of S.burners) {
    if (b.state === 'cooking') {
      b.progress += dt / b.duration;
      if (Math.random() < dt * (2 + b.progress * 10)) addSteam(0.1 + (S.burners.indexOf(b) - 0.5) * 1.1, 1.6, -3.2);
      // Entering the perfect zone dings once — "matang!" you can hear.
      if (!b.perfectDinged && b.progress >= PERFECT_LOW && b.progress < 1) {
        b.perfectDinged = true;
        sound.ding();
      }
      if (b.progress >= 1) { b.state = 'burnt'; sound.fail(); }
    }
  }
  // Sizzle loops exactly while food is on the stove (and stops when the
  // last pot leaves the burner or burns). Idempotent — cheap per frame.
  if (S.burners.some((b) => b.state === 'cooking')) sound.startSizzle();
  else sound.stopSizzle();
  // Serve delivery animation: the plate flies to the passenger, who eats
  // happily; coins land only when the plate arrives.
  if (S.serveAnim) {
    S.serveAnim.t += dt;
    if (S.serveAnim.t >= S.serveAnim.dur) {
      const anim = S.serveAnim;
      S.serveAnim = null;
      completeServe(anim.order, anim.dish);
    }
  }
  // Waiters (Pelayan upgrade): idle -> walk to the serving window, pick
  // the claimed plate up -> walk to the passenger's counter front ->
  // plate flies (0.9s, same arc) -> coins land -> walk home. If the
  // order is gone when they arrive, the dish goes back on the counter.
  for (const w of S.waiters) {
    const speed = waiterSpeed(S.stats);
    if (w.state === 'idle') {
      const job = pickWaiterJob(S.readyPlates, S.orders);
      if (job) {
        const dish = S.readyPlates[job.dishIndex];
        dish.claimed = true;
        w.dish = dish;
        w.order = job.order;
        w.state = 'toPickup';
      }
      w.moving = false;
    } else if (w.state === 'toPickup') {
      const r = moveToward(w.x, w.z, WAITER_PICKUP[0], WAITER_PICKUP[1], speed, dt);
      w.x = r.x; w.z = r.z;
      w.moving = !r.arrived;
      w.bob += dt * 10;
      w.facing = Math.atan2(WAITER_PICKUP[0] - w.x, WAITER_PICKUP[1] - w.z);
      if (r.arrived) {
        const di = S.readyPlates.indexOf(w.dish);
        if (di < 0 || !w.order || w.order.state !== 'waiting') {
          if (w.dish) w.dish.claimed = false;
          w.dish = null; w.order = null; w.state = 'returning';
        } else {
          S.readyPlates.splice(di, 1);
          w.carrying = w.dish;
          w.dish = null;
          w.t = 0.35; // pick the plate up
          w.state = 'pickup';
        }
      }
    } else if (w.state === 'pickup') {
      w.t -= dt;
      if (w.t <= 0) w.state = 'toPassenger';
    } else if (w.state === 'toPassenger') {
      if (!w.order || w.order.state !== 'waiting') {
        if (w.carrying) { w.carrying.claimed = false; S.readyPlates.push(w.carrying); w.carrying = null; }
        w.order = null; w.state = 'returning';
      } else {
        const spot = PASSENGER_SPOTS[w.order.spot];
        const tx = spot.x + 1.4, tz = spot.z; // counter front
        const r = moveToward(w.x, w.z, tx, tz, speed, dt);
        w.x = r.x; w.z = r.z;
        w.moving = !r.arrived;
        w.bob += dt * 10;
        w.facing = Math.atan2(tx - w.x, tz - w.z);
        if (r.arrived) {
          w.anim = { t: 0, dur: 0.9, dish: w.carrying, order: w.order, from: { x: w.x, z: w.z }, to: { x: spot.x, z: spot.z } };
          w.state = 'delivering';
        }
      }
    } else if (w.state === 'delivering') {
      w.anim.t += dt;
      if (w.anim.t >= w.anim.dur) {
        const dish = w.carrying, order = w.order;
        w.anim = null; w.carrying = null; w.order = null;
        completeServe(order, dish);
        w.state = 'returning';
      }
    } else if (w.state === 'returning') {
      const r = moveToward(w.x, w.z, w.home[0], w.home[1], speed, dt);
      w.x = r.x; w.z = r.z;
      w.moving = !r.arrived;
      w.bob += dt * 10;
      w.facing = Math.atan2(w.home[0] - w.x, w.home[1] - w.z);
      if (r.arrived) { w.state = 'idle'; w.moving = false; }
    }
    // Keep waiters out of the furniture (serving counter, prep table).
    const [wx, wz] = clampFloor(w.x, w.z);
    w.x = wx; w.z = wz;
  }
  if (S.passengerJoy) {
    S.passengerJoy.t -= dt;
    if (S.passengerJoy.t <= 0) S.passengerJoy = null;
  }
  // Chopping progress: one piece appears per knife stroke (3 strokes),
  // each with a chop sound and particles on the board.
  if (S.action && S.action.type === 'chop' && S.chopping) {
    const p = actionFrac(S.action);
    S.chopping.progress = p;
    const want = Math.min(3, Math.floor(p * 3));
    while (S.chopping.strokes < want) {
      S.chopping.strokes += 1;
      S.boardPieces.push(S.chopping.ing);
      for (let i = 0; i < 3; i++) {
        S.particles.push({ x: -2.7 + (Math.random() - 0.5) * 0.5, y: 1.25, z: -3.2 + (Math.random() - 0.5) * 0.3, r: 0.06, vy: 0.7, life: 0.5 });
      }
      sound.chop();
    }
  }
  // Timed action.
  if (S.action) {
    if (tickAction(S.action, dt)) {
      const done = S.action.onDone;
      S.action = null;
      if (done) done();
    }
  }
  // Tea cooldown.
  if (S.teaCooldown > 0) S.teaCooldown -= dt;
  // Movement.
  if (!S.action && !S.pantryOpen) {
    const ix = (keys['arrowright'] || keys['d'] ? 1 : 0) - (keys['arrowleft'] || keys['a'] ? 1 : 0);
    const iz = (keys['arrowdown'] || keys['s'] ? 1 : 0) - (keys['arrowup'] || keys['w'] ? 1 : 0);
    if (ix || iz) {
      S.moveTarget = null;
      moveChef(S.chef, ix, iz, dt, S.stats.shoes.speedMult);
    } else if (S.moveTarget) {
      const dx = S.moveTarget[0] - S.chef.x, dz = S.moveTarget[1] - S.chef.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.25) {
        S.moveTarget = null;
        if (S.moveTargetStation) { const st = S.moveTargetStation; S.moveTargetStation = null; interact(); }
      } else {
        moveChef(S.chef, dx / d, dz / d, dt, S.stats.shoes.speedMult);
      }
    }
    const [cx, cz] = clampFloor(S.chef.x, S.chef.z);
    S.chef.x = cx; S.chef.z = cz;
  }
  // Particles.
  for (const p of S.particles) { p.y += p.vy * dt; p.life -= dt; }
  S.particles = S.particles.filter((p) => p.life > 0);
  // Floaters.
  for (const f of S.floaters) { f.y -= 24 * dt; f.life -= dt; }
  S.floaters = S.floaters.filter((f) => f.life > 0);
}

// ---------- HUD (2D canvas) ----------
function rr(x, y, w, h, r) {
  hctx.beginPath();
  hctx.moveTo(x + r, y);
  hctx.arcTo(x + w, y, x + w, y + h, r);
  hctx.arcTo(x + w, y + h, x, y + h, r);
  hctx.arcTo(x, y + h, x, y, r);
  hctx.arcTo(x, y, x + w, y, r);
  hctx.closePath();
}
function text(str, x, y, size, color, align, bold) {
  hctx.font = (bold ? 'bold ' : '') + size + 'px sans-serif';
  hctx.fillStyle = color || '#fff';
  hctx.textAlign = align || 'left';
  hctx.textBaseline = 'middle';
  hctx.fillText(str, x, y);
}
function bar(x, y, w, h, frac, color, bg) {
  hctx.fillStyle = bg || 'rgba(0,0,0,0.55)';
  rr(x, y, w, h, h / 2); hctx.fill();
  if (frac > 0) {
    hctx.fillStyle = color;
    rr(x, y, Math.max(h, w * Math.min(1, frac)), h, h / 2); hctx.fill();
  }
}
function drawTopBar() {
  hctx.fillStyle = 'rgba(10,10,16,0.82)';
  hctx.fillRect(0, 0, W, 64);
  const L = levelParams();
  text('🚂 LV ' + S.level + ' — ' + L.name, 16, 20, 22, '#ffd700', 'left', true);
  text('⏱ ' + fmtTime(S.levelTime), 16, 46, 16, '#fff');
  // Goal meter with star thresholds.
  const gx = 260, gw = 420;
  text('GOAL', gx, 18, 13, '#aaa');
  bar(gx + 50, 10, gw, 14, S.coins / L.stars[2], '#ffd700');
  L.stars.forEach((t, i) => {
    const x = gx + 50 + (gw * t) / L.stars[2];
    text('★', x, 34, 16, S.coins >= t ? '#ffd700' : '#666');
  });
  text('💰 ' + S.coins + '  •  🔥x' + S.combo, W - 300, 20, 20, '#ffd700', 'left', true);
  text(S.sousChef ? '👨‍🍳 Sous-chef siap!' : 'Serve 3× untuk sous-chef', W - 300, 46, 14, '#7fe0c0');
  // Order tickets (departure board).
  const waiting = S.orders.filter((o) => o.state === 'waiting');
  let tx = 16;
  waiting.forEach((o) => {
    const w = 218;
    hctx.fillStyle = o.express ? 'rgba(60,45,5,0.92)' : 'rgba(20,22,32,0.92)';
    hctx.strokeStyle = o.express ? '#ffd700' : '#555';
    hctx.lineWidth = o.express ? 3 : 1;
    rr(tx, 74, w, 62, 8); hctx.fill(); hctx.stroke();
    const pc = patienceColor(o);
    const css = 'rgb(' + Math.round(pc[0] * 255) + ',' + Math.round(pc[1] * 255) + ',' + Math.round(pc[2] * 255) + ')';
    text((o.express ? '🚄 ' : '🚂 ') + o.train + '  ' + o.passengerName, tx + 10, 90, 14, '#fff', 'left', true);
    text(o.recipeName, tx + 10, 110, 14, '#ffd700');
    bar(tx + 10, 122, w - 20, 8, patienceFrac(o), css);
    tx += w + 10;
  });
}
function drawHands() {
  text('TANGAN — klik slot untuk buang', 16, H - 88, 13, '#aaa');
  S._handRects = [];
  S.chef.hands.forEach((item, i) => {
    const x = 16 + i * 76, y = H - 76;
    S._handRects.push({ x, y, w: 66, h: 66, idx: i });
    hctx.fillStyle = 'rgba(10,10,16,0.8)';
    rr(x, y, 66, 66, 10); hctx.fill();
    hctx.strokeStyle = item ? '#ffd700' : '#444'; hctx.lineWidth = 2;
    rr(x, y, 66, 66, 10); hctx.stroke();
    if (item) {
      const c = INGREDIENTS[item.ing].color;
      hctx.fillStyle = 'rgb(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ')';
      hctx.beginPath(); hctx.arc(x + 33, y + 26, 16, 0, Math.PI * 2); hctx.fill();
      text(INGREDIENTS[item.ing].name, x + 33, y + 52, 11, '#fff', 'center');
      const tags = [];
      if (item.chopped) tags.push('chop✓');
      if (item.cooked) tags.push(item.perfect ? 'PERFECT' : 'masak✓');
      if (tags.length) text(tags.join(' '), x + 33, y + 8, 10, '#7dff8a', 'center', true);
    } else {
      text('—', x + 33, y + 33, 20, '#666', 'center');
    }
  });
}
function drawButtons() {
  const btns = [
    { id: 'book', label: '📖 Resep (B)', x: W - 480, w: 130 },
    { id: 'shop', label: '🛒 Toko (U)', x: W - 340, w: 120 },
    { id: 'tea', label: S.teaCooldown > 0 ? '🍵 ' + Math.ceil(S.teaCooldown) + 's' : '🍵 Teh (T)', x: W - 210, w: 120 },
    { id: 'pause', label: '⏸ (P)', x: W - 80, w: 66 },
  ];
  S._buttons = btns.map((b) => ({ ...b, y: H - 76, h: 44 }));
  for (const b of S._buttons) {
    hctx.fillStyle = 'rgba(20,22,32,0.9)';
    rr(b.x, b.y, b.w, b.h, 10); hctx.fill();
    hctx.strokeStyle = '#888'; hctx.lineWidth = 1.5;
    rr(b.x, b.y, b.w, b.h, 10); hctx.stroke();
    text(b.label, b.x + b.w / 2, b.y + b.h / 2, 15, '#fff', 'center', true);
  }
}
function drawWorldBars() {
  // Cook progress above each pot.
  const slots = burnerSlots(S.burners.length);
  S.burners.forEach((b, i) => {
    if (b.state === 'empty') return;
    const slot = slots[i];
    if (!slot) return;
    const [px, py, behind] = projectToScreen(vp, slot.x, 2.1, slot.z, W, H);
    if (behind) return;
    const w = 74;
    // Green perfect zone.
    hctx.fillStyle = 'rgba(0,0,0,0.6)';
    rr(px - w / 2, py, w, 10, 5); hctx.fill();
    hctx.fillStyle = 'rgba(80,255,120,0.45)';
    hctx.fillRect(px - w / 2 + w * PERFECT_LOW, py, w * (PERFECT_HIGH - PERFECT_LOW), 10);
    const col = b.state === 'burnt' ? '#333' : (b.progress >= PERFECT_LOW ? '#7dff8a' : '#ffb347');
    hctx.fillStyle = col;
    rr(px - w / 2, py, Math.max(10, w * Math.min(1, b.progress)), 10, 5); hctx.fill();
    // Labels staggered vertically per burner so two pots never overlap.
    const labelY = py - 14 - i * 24;
    if (b.state === 'burnt') text('GOSONG!', px, labelY, 13, '#ff6a6a', 'center', true);
    else if (b.progress >= PERFECT_LOW) text(b.progress >= PERFECT_LOW && b.progress <= PERFECT_HIGH ? 'PERFECT!' : 'Matang!', px, labelY, 13, '#7dff8a', 'center', true);
    // Progress ring: raw -> half -> cooked, green arc = perfect zone.
    const ringY = py - 34;
    hctx.lineWidth = 5;
    hctx.strokeStyle = 'rgba(255,255,255,0.25)';
    hctx.beginPath(); hctx.arc(px, ringY, 14, 0, Math.PI * 2); hctx.stroke();
    hctx.strokeStyle = '#7dff8a';
    hctx.beginPath(); hctx.arc(px, ringY, 14, -Math.PI / 2 + Math.PI * 2 * PERFECT_LOW, -Math.PI / 2 + Math.PI * 2 * PERFECT_HIGH); hctx.stroke();
    hctx.strokeStyle = b.state === 'burnt' ? '#ff6a6a' : '#ffb347';
    hctx.beginPath(); hctx.arc(px, ringY, 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, b.progress)); hctx.stroke();
  });
  // Chop progress above the board.
  if (S.action && S.action.type === 'chop') {
    const [px, py, behind] = projectToScreen(vp, -2.7, 2.0, -3.2, W, H);
    if (!behind) {
      bar(px - 40, py, 80, 10, actionFrac(S.action), '#ffd700');
      text('Chopping…', px, py - 14, 12, '#fff', 'center', true);
    }
  }
  // Plate progress + assembly counter (1/3 -> 2/3 -> 3/3).
  if (S.action && S.action.type === 'plate') {
    const [px, py, behind] = projectToScreen(vp, 3.0, 2.0, -3.2, W, H);
    if (!behind) {
      bar(px - 40, py, 80, 10, actionFrac(S.action), '#7fd0ff');
      text('Plating…', px, py - 14, 12, '#fff', 'center', true);
    }
  }
  const assembling = S.plates[S.plates.length - 1];
  if (assembling) {
    const [px, py, behind] = projectToScreen(vp, 3.0, 2.3, -3.2, W, H);
    if (!behind) {
      const done = assembling.components.filter((c) => c.done).length;
      text(assembling.recipeName + '  ' + done + '/' + assembling.components.length, px, py, 14, '#ffd700', 'center', true);
    }
  }
  // Passenger joy after eating.
  if (S.passengerJoy) {
    const spot = PASSENGER_SPOTS[S.passengerJoy.spot];
    if (spot) {
      const [px, py, behind] = projectToScreen(vp, spot.x + 0.55, 2.9, spot.z, W, H);
      if (!behind) text('😋 Yum!', px, py, 20, '#7dff8a', 'center', true);
    }
  }
  // Passenger patience + ticket above heads. A dark pill behind the
  // recipe name keeps it readable over the counter and the legend.
  // (No "⚡ EXPRESS" text here: the gold box on the 3D ticket and the
  // top ticket already say it — the text only collided with the next
  // passenger's label.)
  const waiting = S.orders.filter((o) => o.state === 'waiting');
  for (const o of waiting) {
    const spot = PASSENGER_SPOTS[o.spot];
    if (!spot) continue;
    const [px, py, behind] = projectToScreen(vp, spot.x + 0.55, 2.5, spot.z, W, H);
    if (behind) continue;
    const pc = patienceColor(o);
    const css = 'rgb(' + Math.round(pc[0] * 255) + ',' + Math.round(pc[1] * 255) + ',' + Math.round(pc[2] * 255) + ')';
    hctx.fillStyle = 'rgba(10,10,16,0.75)';
    const tw = 84;
    rr(px - tw / 2, py - 26, tw, 18, 9); hctx.fill();
    bar(px - 42, py, 84, 9, patienceFrac(o), css);
    text(o.recipeName, px, py - 17, 12, '#fff', 'center', true);
  }
  // Nearest station hint (drawn below the station so it never covers
  // pot labels or coin floaters above it).
  const st = nearestReachable();
  if (st && !S.action && !S.pantryOpen) {
    const [px, py, behind] = projectToScreen(vp, st.x, 2.0, st.z, W, H);
    if (!behind) text(st.hint, px, py + 46, 14, '#ffd700', 'center', true);
  }
  // Floaters.
  for (const f of S.floaters) {
    hctx.globalAlpha = Math.min(1, f.life);
    text(f.text, f.x, f.y, 20, f.color, 'center', true);
    hctx.globalAlpha = 1;
  }
}
function drawPantryPicker() {
  hctx.fillStyle = 'rgba(0,0,0,0.6)';
  hctx.fillRect(0, 0, W, H);
  const pw = 640, ph = 300, px = (W - pw) / 2, py = (H - ph) / 2;
  hctx.fillStyle = '#181a24';
  rr(px, py, pw, ph, 16); hctx.fill();
  hctx.strokeStyle = '#c9a227'; hctx.lineWidth = 3;
  rr(px, py, pw, ph, 16); hctx.stroke();
  text('🧺 PANTRY — pilih bahan (klik / tombol 1-7, Esc tutup)', px + pw / 2, py + 34, 20, '#ffd700', 'center', true);
  S._pantryBtns = [];
  S.pantryItems.forEach((ing, i) => {
    const bx = px + 30 + (i % 4) * 150, by = py + 70 + Math.floor(i / 4) * 100;
    const c = INGREDIENTS[ing].color;
    hctx.fillStyle = 'rgb(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ')';
    rr(bx, by, 130, 80, 12); hctx.fill();
    text((i + 1) + '. ' + INGREDIENTS[ing].name, bx + 65, by + 40, 16, '#fff', 'center', true);
    S._pantryBtns.push({ x: bx, y: by, w: 130, h: 80, ing });
  });
  text('Tangan: ' + handCount(S.chef) + '/2 terisi', px + pw / 2, py + ph - 28, 15, '#aaa', 'center');
}
function drawBook() {
  hctx.fillStyle = 'rgba(0,0,0,0.7)';
  hctx.fillRect(0, 0, W, H);
  const pw = 760, ph = 560, px = (W - pw) / 2, py = (H - ph) / 2;
  hctx.fillStyle = '#181a24';
  rr(px, py, pw, ph, 16); hctx.fill();
  hctx.strokeStyle = '#c9a227'; hctx.lineWidth = 3;
  rr(px, py, pw, ph, 16); hctx.stroke();
  text('📖 RECIPE BOOK — Junction Kitchen', px + pw / 2, py + 34, 22, '#ffd700', 'center', true);
  RECIPES.forEach((r, i) => {
    const y = py + 70 + i * 62;
    const unlocked = r.level <= S.level;
    hctx.fillStyle = unlocked ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.4)';
    rr(px + 24, y, pw - 48, 52, 10); hctx.fill();
    const c = r.color;
    hctx.fillStyle = unlocked ? 'rgb(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ')' : '#555';
    hctx.beginPath(); hctx.arc(px + 52, y + 26, 14, 0, Math.PI * 2); hctx.fill();
    text(unlocked ? r.name : '🔒 ' + r.name + ' (LV' + r.level + ')', px + 78, y + 18, 17, unlocked ? '#fff' : '#888', 'left', true);
    const parts = r.components.map((comp) => {
      const ing = INGREDIENTS[comp.ing].name;
      const prep = comp.prep === 'raw' ? '' : comp.prep === 'chop' ? ' (chop)' : comp.prep === 'cook' ? ' (masak)' : ' (chop+masak)';
      return ing + prep;
    }).join(' + ');
    text(parts + '  •  ' + r.basePrice + ' koin', px + 78, y + 40, 13, unlocked ? '#aaa' : '#666');
  });
  text('Tutup: B / Esc / klik', px + pw / 2, py + ph - 24, 14, '#aaa', 'center');
}
function drawShop() {
  hctx.fillStyle = 'rgba(0,0,0,0.72)';
  hctx.fillRect(0, 0, W, H);
  const pw = 980, ph = 600, px = (W - pw) / 2, py = (H - ph) / 2;
  S._shopPanel = { x: px, y: py, w: pw, h: ph };
  hctx.fillStyle = '#181a24';
  rr(px, py, pw, ph, 16); hctx.fill();
  hctx.strokeStyle = '#c9a227'; hctx.lineWidth = 3;
  rr(px, py, pw, ph, 16); hctx.stroke();
  text('🛒 TOKO UPGRADE — 9 upgrade • koin: ' + S.coins, px + pw / 2, py + 32, 22, '#ffd700', 'center', true);
  S._shopBtns = [];
  UPGRADES.forEach((u, i) => {
    // 9 rows: pitch 50, height 44 — last row ends at py+502, the
    // continue button sits at py+544.
    const y = py + 58 + i * 50;
    const tier = S.upgrades[u.id] || 0;
    hctx.fillStyle = 'rgba(255,255,255,0.06)';
    rr(px + 24, y, pw - 48, 44, 10); hctx.fill();
    text(u.icon + ' ' + u.name, px + 44, y + 13, 16, '#fff', 'left', true);
    text(u.desc, px + 44, y + 31, 12, '#aaa');
    // Tier pips.
    for (let t = 0; t < 3; t++) {
      const tx2 = px + 560 + t * 34;
      hctx.fillStyle = t < tier ? '#ffd700' : '#333';
      hctx.beginPath(); hctx.arc(tx2, y + 22, 11, 0, Math.PI * 2); hctx.fill();
      text(String(t + 1), tx2, y + 22, 11, t < tier ? '#111' : '#888', 'center', true);
    }
    if (tier < 3) {
      const cost = u.tiers[tier].price;
      const lockLv = tierUnlockLevel(tier);
      const locked = S.level < lockLv;
      const afford = S.coins >= cost;
      const bx = px + pw - 190, bw = 160;
      hctx.fillStyle = locked ? '#333' : afford ? '#2f7a3d' : '#5a3a3a';
      rr(bx, y + 6, bw, 32, 8); hctx.fill();
      text(locked ? '🔒 LV' + lockLv : 'Beli ' + cost + ' 🪙', bx + bw / 2, y + 22, 14, '#fff', 'center', true);
      if (!locked) S._shopBtns.push({ x: bx, y: y + 6, w: bw, h: 32, id: u.id, tier, cost });
    } else {
      text('MAX', px + pw - 110, y + 22, 15, '#ffd700', 'center', true);
    }
  });
  // Continue button.
  const cb = { x: px + pw / 2 - 130, y: py + ph - 56, w: 260, h: 40 };
  hctx.fillStyle = '#c9a227';
  rr(cb.x, cb.y, cb.w, cb.h, 10); hctx.fill();
  text(S.screen === 'shop' && S.level >= LEVELS.length ? 'Selesai' : 'Lanjut ▶', cb.x + cb.w / 2, cb.y + 20, 18, '#111', 'center', true);
  S._shopContinue = cb;
}
function drawTitle() {
  hctx.fillStyle = 'rgba(8,8,14,0.55)';
  hctx.fillRect(0, 0, W, H);
  text('🚂 JUNCTION KITCHEN 3D', W / 2, 180, 58, '#ffd700', 'center', true);
  text('Dapur stasiun kereta — masak, sajikan, kejar kereta berikutnya!', W / 2, 235, 22, '#fff', 'center');
  text('WASD / panah: gerak  •  E: interaksi  •  T: teh penenang  •  B: resep  •  U: toko  •  X: buang bahan', W / 2, 300, 18, '#ddd', 'center');
  text('Klik stasiun untuk jalan ke sana. Chef bawa 2 bahan. Masak di zona hijau = PERFECT!', W / 2, 330, 18, '#ddd', 'center');
  const pulse = 0.7 + Math.sin(S.time * 3) * 0.3;
  hctx.globalAlpha = pulse;
  text('▶  TEKAN ENTER / KLIK UNTUK MULAI  ◀', W / 2, 420, 26, '#7dff8a', 'center', true);
  hctx.globalAlpha = 1;
  text('5 shift • 7 resep • 9 upgrade • Express Train', W / 2, 470, 16, '#aaa', 'center');
}
function drawLevelUp() {
  hctx.fillStyle = 'rgba(0,0,0,0.7)';
  hctx.fillRect(0, 0, W, H);
  text('🎉 SHIFT SELESAI — ' + levelDef(S.level).name + '!', W / 2, 150, 40, '#ffd700', 'center', true);
  let stars = '';
  for (let i = 0; i < 5; i++) stars += i < S.levelStars ? '★' : '☆';
  text(stars, W / 2, 220, 64, '#ffd700', 'center');
  text('Koin shift ini: ' + S.levelCoins + '  •  Order gagal: ' + S.failed + '  •  Total bintang: ' + S.totalStars, W / 2, 280, 20, '#fff', 'center');
  text(levelDef(S.level + 1) ? 'Berikutnya: ' + levelDef(S.level + 1).unlockText : 'Semua shift selesai!', W / 2, 320, 18, '#7fe0c0', 'center');
  const b = { x: W / 2 - 130, y: 380, w: 260, h: 52 };
  hctx.fillStyle = '#c9a227';
  rr(b.x, b.y, b.w, b.h, 12); hctx.fill();
  text('🛒 Ke Toko Upgrade', b.x + b.w / 2, b.y + 26, 20, '#111', 'center', true);
  S._levelUpBtn = b;
}
function drawGameOver() {
  hctx.fillStyle = 'rgba(0,0,0,0.75)';
  hctx.fillRect(0, 0, W, H);
  text('🚂 JUNCTION KITCHEN — TUTUP!', W / 2, 180, 44, '#ffd700', 'center', true);
  let stars = '';
  for (let i = 0; i < 25; i++) stars += i < S.totalStars ? '★' : '☆';
  text(stars, W / 2, 250, 40, '#ffd700', 'center');
  text('Total bintang: ' + S.totalStars + ' / 25   •   Total koin: ' + S.totalCoins, W / 2, 310, 22, '#fff', 'center');
  text('Terima kasih sudah masak di Junction Kitchen!', W / 2, 350, 18, '#aaa', 'center');
  text('Tekan R untuk main lagi', W / 2, 420, 20, '#7dff8a', 'center', true);
}
function drawAnnotations() {
  // Cover annotations: legend + leader lines to the six criterion-1 elements.
  const items = [
    { label: '1. Dapur 3D', at: [0, 1.2, -3.2] },
    { label: '2. Order board', at: [0, 3.3, -4.4] },
    { label: '3. Bahan di counter', at: [-2.7, 1.6, -3.2] }, // chopping board (was the pantry: it sat on top of the spot-0 passenger label)
    { label: '4. Hidangan mid-assembly', at: [3.0, 1.6, -3.2] },
    { label: '5. Timer & patience', at: [-5.3, 1.35, -1.6] },
    { label: '6. Piring siap saji', at: [5.6, 1.4, -2.0] },
  ];
  hctx.fillStyle = 'rgba(10,10,16,0.85)';
  rr(16, 150, 250, 168, 12); hctx.fill();
  hctx.strokeStyle = '#c9a227'; hctx.lineWidth = 2;
  rr(16, 150, 250, 168, 12); hctx.stroke();
  text('JUNCTION KITCHEN 3D', 141, 172, 15, '#ffd700', 'center', true);
  items.forEach((it, i) => {
    const y = 194 + i * 20;
    text(it.label, 30, y, 13, '#fff');
    // Numbered gold dot on the spot itself — no leader lines crossing
    // the scene (they cluttered the cover at 768x480).
    const [px, py, behind] = projectToScreen(vp, it.at[0], it.at[1], it.at[2], W, H);
    if (!behind) {
      hctx.fillStyle = '#ffd700';
      hctx.beginPath(); hctx.arc(px, py, 13, 0, Math.PI * 2); hctx.fill();
      hctx.strokeStyle = '#111'; hctx.lineWidth = 2; hctx.stroke();
      text(String(i + 1), px, py + 1, 14, '#111', 'center', true);
    }
  });
}
function drawHUD() {
  hctx.clearRect(0, 0, W, H);
  if (S.screen === 'title') { drawTitle(); return; }
  if (S.screen === 'playing' || S.screen === 'levelup' || S.screen === 'shop' || S.screen === 'gameover') {
    if (S.screen === 'playing') {
      drawTopBar();
      drawWorldBars();
      drawHands();
      drawButtons();
      if (S.annotations) drawAnnotations();
      if (S.pantryOpen) drawPantryPicker();
      if (S.showBook) drawBook();
      if (S.paused) {
        hctx.fillStyle = 'rgba(0,0,0,0.55)';
        hctx.fillRect(0, 0, W, H);
        text('⏸ PAUSED — tekan P untuk lanjut', W / 2, H / 2, 30, '#fff', 'center', true);
      }
    }
    if (S.screen === 'levelup') drawLevelUp();
    if (S.screen === 'shop') drawShop();
    if (S.screen === 'gameover') drawGameOver();
  }
}

// ---------- staged scenes (?scene=) ----------
function applyScene(name) {
  S.scene = name;
  S.frozen = true;
  S.screen = 'playing';
  newGameSilent(3);
  if (name === 'cover') {
    S.annotations = true;
    S.coins = 87; S.combo = 3; S.levelTime = 96;
    spawnOrder({ recipeId: 'station-burger', passenger: 'santai' });
    spawnOrder({ recipeId: 'platform-salad', passenger: 'buru', express: true });
    spawnOrder({ recipeId: 'signal-sandwich', passenger: 'vip' });
    S.orders[2].patience = S.orders[2].patienceMax * 0.3;
    S.burners[0] = { state: 'cooking', ing: 'patty', chopped: false, progress: 0.5, duration: 8, perfect: false };
    S.burners[1] = { state: 'cooking', ing: 'mushroom', chopped: false, progress: 0.32, duration: 6, perfect: false };
    S.chopping = { ing: 'tomato', progress: 0.55, hand: 0 };
    S.chef.hands[0] = { ing: 'tomato', chopped: false, cooked: false, perfect: false };
    S.chef.x = 1.6; S.chef.z = -1.2; S.chef.facing = Math.PI * 0.75;
    const r = recipeById('station-burger');
    S.plates.push({
      recipeId: r.id, recipeName: r.name, color: r.color, perfect: false, complete: false,
      components: r.components.map((c, i) => ({ ing: c.ing, done: i < 2 })),
    });
    S.readyPlates.push({ recipeId: 'express-fries', recipeName: recipeById('express-fries').name, color: recipeById('express-fries').color });
    S.sousChef = true;
    // A plate is mid-flight to the VIP passenger AT the counter — the
    // passenger receives the dish right where they waited (ticket +
    // patience bar above their head, "😋 Yum!" on arrival). The order
    // stays 'waiting' in this staged frame so the passenger keeps
    // standing at the counter; the flight is frozen, see below.
    const vipSpot = PASSENGER_SPOTS[S.orders[2].spot];
    S.serveAnim = { t: 0.675, dur: 0.9, dish: { recipeId: 'signal-sandwich', recipeName: 'Signal Sandwich', color: recipeById('signal-sandwich').color, perfect: true }, order: S.orders[2], from: { x: 5.6, z: -2.0 }, to: { x: vipSpot.x, z: vipSpot.z } };
    // (No passengerJoy here: the "😋 Yum!" text landed on top of the
    // Signal Sandwich label. The flying plate + the ticket tell the
    // serve story on their own.)
    // Show the upgrade system on the stations: 3 burners, gold window
    // trim, boots, tier pips — plus a waiter standing by the window.
    // (The ready plate is express-fries, which no waiting order wants,
    // so the waiter stays at his post instead of walking off mid-shot.)
    S.upgrades = { knife: 2, stove: 3, plating: 2, window: 2, shoes: 1, pantry: 1, quality: 1, warming: 1, waiter: 1 };
    syncStats(); syncBurners(); syncWaiters();
    S.warmingItems.push({ ing: 'patty', chopped: false, cooked: true, perfect: true });
    // Staged steam over the pots + sparkles around the flying plate
    // (frozen scene: particles stay put and read as steam/shine).
    for (let i = 0; i < 4; i++) {
      S.particles.push({ x: -0.45 + (Math.random() - 0.5) * 0.3, y: 1.7 + i * 0.22, z: -3.2 + (Math.random() - 0.5) * 0.2, r: 0.09, vy: 0, life: 99 });
      S.particles.push({ x: 0.65 + (Math.random() - 0.5) * 0.3, y: 1.7 + i * 0.22, z: -3.2 + (Math.random() - 0.5) * 0.2, r: 0.08, vy: 0, life: 99 });
    }
    for (let i = 0; i < 5; i++) {
      S.particles.push({ x: -3.1 + (Math.random() - 0.5) * 0.9, y: 2.2 + (Math.random() - 0.5) * 0.5, z: 0.4 + (Math.random() - 0.5) * 0.5, r: 0.06, vy: 0, life: 99 });
    }
    S.time = 12.34;
  } else if (name === 'shop') {
    // The upgrade shop, open: all 9 upgrades with tiers, prices and
    // pips over a live kitchen behind it.
    newGameSilent(3);
    S.coins = 300;
    S.upgrades = { knife: 2, stove: 3, plating: 2, window: 2, shoes: 1, pantry: 1, quality: 1, warming: 1, waiter: 1 };
    syncStats(); syncBurners(); syncWaiters();
    spawnOrder({ recipeId: 'station-burger', passenger: 'santai' });
    S.chef.x = 1.6; S.chef.z = -1.2; S.chef.facing = Math.PI * 0.75;
    S.screen = 'shop';
    S.time = 12.34;
  } else if (name === 'chop') {
    newGameSilent(1);
    spawnOrder({ recipeId: 'platform-salad', passenger: 'santai' });
    S.chef.x = -2.7; S.chef.z = -1.9; S.chef.facing = Math.PI;
    S.chef.hands[0] = { ing: 'lettuce', chopped: false, cooked: false, perfect: false };
    S.chopping = { ing: 'lettuce', progress: 0.55, hand: 0 };
    S.action = { type: 'chop', duration: 2, t: 1.1, world: { x: -2.7, y: 1.9, z: -3.2 }, onDone: null, label: 'Chopping' };
    S.boardPieces = ['tomato', 'carrot'];
    // Chop sparks flying off the board.
    for (let i = 0; i < 6; i++) {
      S.particles.push({ x: -2.7 + (Math.random() - 0.5) * 0.7, y: 1.3 + Math.random() * 0.3, z: -3.2 + (Math.random() - 0.5) * 0.4, r: 0.06, vy: 0, life: 99 });
    }
    S.time = 8.1;
  } else if (name === 'stove') {
    newGameSilent(2);
    spawnOrder({ recipeId: 'station-burger', passenger: 'buru' });
    spawnOrder({ recipeId: 'express-fries', passenger: 'vip' });
    S.orders[1].patience = S.orders[1].patienceMax * 0.18;
    S.burners[0] = { state: 'cooking', ing: 'patty', chopped: false, progress: 0.52, duration: 8, perfect: false };
    S.burners[1] = { state: 'cooking', ing: 'potato', chopped: true, progress: 0.9, duration: 7, perfect: false };
    S.chef.x = 0.6; S.chef.z = -1.6; S.chef.facing = Math.PI;
    S.levelTime = 34;
    // Steam over both pots (one in the perfect zone, one nearly burnt).
    for (let i = 0; i < 4; i++) {
      S.particles.push({ x: -0.45 + (Math.random() - 0.5) * 0.3, y: 1.7 + i * 0.22, z: -3.2 + (Math.random() - 0.5) * 0.2, r: 0.09, vy: 0, life: 99 });
      S.particles.push({ x: 0.65 + (Math.random() - 0.5) * 0.3, y: 1.7 + i * 0.22, z: -3.2 + (Math.random() - 0.5) * 0.2, r: 0.08, vy: 0, life: 99 });
    }
    S.time = 21.7;
  } else if (name === 'serve') {
    newGameSilent(3);
    S.coins = 124; S.combo = 4;
    spawnOrder({ recipeId: 'signal-sandwich', passenger: 'santai' });
    S.readyPlates.push({ recipeId: 'signal-sandwich', recipeName: 'Signal Sandwich', color: [0.85, 0.62, 0.30] });
    S.chef.x = 4.4; S.chef.z = -1.2; S.chef.facing = Math.PI / 2;
    S.floaters.push({ x: 900, y: 340, text: '+18 koin', color: '#ffd700', life: 1.4 });
    S.floaters.push({ x: 900, y: 300, text: 'PERFECT!', color: '#7dff8a', life: 1.4 });
    S.time = 30.2;
  }
  // Staged shots are deterministic: freeze the clock so the chop stays
  // mid-chop, the pots stay in the perfect zone, and the serve plate
  // stays mid-flight instead of landing before the screenshot.
  S.frozen = true;
}
function newGameSilent(level) {
  S = freshState();
  S.stats = effectiveStats(S.upgrades);
  startLevel(level);
  S.screen = 'playing';
}

// ---------- input ----------
const keys = {};
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  if (S.screen === 'title' && (k === 'enter' || k === ' ')) { sound.click(); newGame(); return; }
  if (S.screen === 'gameover' && k === 'r') { sound.click(); newGame(); return; }
  if (S.screen !== 'playing') return;
  if (k === 'escape') {
    if (S.pantryOpen) { S.pantryOpen = false; sound.click(); }
    else if (S.showBook) { S.showBook = false; sound.click(); }
    return;
  }
  if (S.pantryOpen) {
    const idx = parseInt(k, 10) - 1;
    if (!isNaN(idx) && S.pantryItems[idx]) pickIngredient(S.pantryItems[idx]);
    return;
  }
  if (k === 'e' || k === ' ') interact();
  if (k === 'x') {
    // Discard the first filled hand (wrong pick? throw it).
    const idx = S.chef.hands.findIndex((h) => h);
    if (idx >= 0) {
      const item = takeItem(S.chef, idx);
      floater(...chefScreenPos(), 'Dibuang: ' + INGREDIENTS[item.ing].name, '#ff9a9a');
      sound.fail();
    }
  }
  if (k === 't') useTea(); // ding on success is its feedback
  if (k === 'b') { S.showBook = !S.showBook; sound.click(); }
  if (k === 'u' && S.screen === 'playing') { S.screen = 'shop'; sound.click(); }
  if (k === 'p') { S.paused = !S.paused; sound.click(); }
  if (k === 'm') { sound.setMuted(!sound.muted); sound.click(); } // click after unmute: audible confirmation
});
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

function canvasPos(e) {
  const rect = glCanvas.getBoundingClientRect();
  return [(e.clientX - rect.left) * (W / rect.width), (e.clientY - rect.top) * (H / rect.height)];
}
function screenToFloor(sx, sy) {
  // Ray from the fixed camera through a screen point onto the y=0 plane.
  const ndcX = (sx / W) * 2 - 1;
  const ndcY = 1 - (sy / H) * 2;
  const fwd = [CAMERA.target[0] - CAMERA.eye[0], CAMERA.target[1] - CAMERA.eye[1], CAMERA.target[2] - CAMERA.eye[2]];
  const fl = Math.hypot(...fwd);
  const f = fwd.map((v) => v / fl);
  const up = [0, 1, 0];
  // right = f x up (normalised), up2 = right x f
  const rgt = [
    f[1] * up[2] - f[2] * up[1],
    f[2] * up[0] - f[0] * up[2],
    f[0] * up[1] - f[1] * up[0],
  ];
  const rl = Math.hypot(...rgt);
  const rr2 = rgt.map((v) => v / rl);
  const up2 = [
    rr2[1] * f[2] - rr2[2] * f[1],
    rr2[2] * f[0] - rr2[0] * f[2],
    rr2[0] * f[1] - rr2[1] * f[0],
  ];
  const tanF = Math.tan(CAMERA.fovy / 2);
  const aspect = W / H;
  const dir = [
    f[0] + rr2[0] * ndcX * tanF * aspect + up2[0] * ndcY * tanF,
    f[1] + rr2[1] * ndcX * tanF * aspect + up2[1] * ndcY * tanF,
    f[2] + rr2[2] * ndcX * tanF * aspect + up2[2] * ndcY * tanF,
  ];
  if (dir[1] >= -0.0001) return null;
  const t = -CAMERA.eye[1] / dir[1];
  return [CAMERA.eye[0] + dir[0] * t, CAMERA.eye[2] + dir[2] * t];
}
function hitRect(x, y, r) {
  return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
hudCanvas.addEventListener('click', (e) => {
  const [x, y] = canvasPos(e);
  sound.ensure();
  if (S.screen === 'title') { sound.click(); newGame(); return; }
  if (S.screen === 'levelup') {
    if (hitRect(x, y, S._levelUpBtn)) { S.screen = 'shop'; sound.click(); }
    else sound.clickInvalid();
    return;
  }
  if (S.screen === 'shop') {
    if (hitRect(x, y, S._shopContinue)) { sound.click(); nextAfterShop(); return; }
    for (const b of S._shopBtns || []) {
      if (hitRect(x, y, b)) {
        const chk = canBuy(b.id, b.tier, S.level, S.coins);
        if (chk.ok) {
          S.coins -= chk.cost;
          S.upgrades[b.id] = b.tier + 1;
          syncStats(); syncBurners(); syncWaiters();
          sound.coin(); // the buy sound — no extra click (no double sound)
        } else {
          sound.clickInvalid();
        }
        return;
      }
    }
    if (hitRect(x, y, S._shopPanel)) sound.clickInvalid();
    return;
  }
  if (S.screen === 'gameover') { sound.click(); newGame(); return; }
  if (S.screen !== 'playing') return;
  if (S.pantryOpen) {
    for (const b of S._pantryBtns || []) {
      if (hitRect(x, y, b)) { pickIngredient(b.ing); return; } // pickup() is its feedback
    }
    S.pantryOpen = false;
    sound.click();
    return;
  }
  if (S.showBook) { S.showBook = false; sound.click(); return; }
  // Click a filled hand slot to discard that item (wrong pick? throw it).
  for (const r of S._handRects || []) {
    if (hitRect(x, y, r) && S.chef.hands[r.idx]) {
      const item = takeItem(S.chef, r.idx);
      floater(...chefScreenPos(), 'Dibuang: ' + INGREDIENTS[item.ing].name, '#ff9a9a');
      sound.fail();
      return;
    }
  }
  for (const b of S._buttons || []) {
    if (hitRect(x, y, b)) {
      if (b.id === 'book') { S.showBook = !S.showBook; sound.click(); }
      if (b.id === 'shop') { S.screen = 'shop'; sound.click(); }
      if (b.id === 'tea') useTea(); // ding on success is its feedback
      if (b.id === 'pause') { S.paused = !S.paused; sound.click(); }
      return;
    }
  }
  // Click a station: walk there, then interact.
  const pt = screenToFloor(x, y);
  if (pt) {
    sound.click();
    const [wx, wz] = clampFloor(pt[0], pt[1]);
    const st = nearestStation(wx, wz, 2.4);
    if (st) {
      S.moveTarget = [st.x, st.z + 1.4];
      S.moveTargetStation = st;
    } else {
      S.moveTarget = [wx, wz];
      S.moveTargetStation = null;
    }
  }
});

// ---------- main loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  // The real-time clock only runs when realtime is on; the test hook
  // (JK.step) is the only clock when it is off, so scripted play is exact.
  if (!S.frozen && S.realtime) update(dt);
  scene.render(S, S.time);
  drawHUD();
  requestAnimationFrame(frame);
}

// ---------- boot ----------
(function boot() {
  const params = new URLSearchParams(location.search);
  const sceneName = params.get('scene') || params.get('shot');
  if (sceneName) {
    applyScene(sceneName);
  } else {
    // Title screen over a live demo kitchen.
    newGameSilent(1);
    S.screen = 'title';
    spawnOrder({ recipeId: 'station-burger', passenger: 'santai' });
    spawnOrder({ recipeId: 'platform-salad', passenger: 'buru' });
    S.burners[0] = { state: 'cooking', ing: 'patty', chopped: false, progress: 0.4, duration: 8, perfect: false };
    S.chef.x = 0; S.chef.z = 1.0;
    S.frozen = true;
    S.time = 5.0;
  }
  requestAnimationFrame(frame);
})();

// ---------- test hook ----------
window.JK = {
  state: () => S,
  newGame,
  startLevel,
  interact,
  pickIngredient,
  useTea,
  serveReady,
  spawnOrder,
  step(dt) { update(dt); },
  setChef(x, z) { S.chef.x = x; S.chef.z = z; },
  setRealtime(v) { S.realtime = !!v; },
  syncStats,
  syncWaiters,
};
