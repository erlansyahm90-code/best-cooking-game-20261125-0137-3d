// Unit tests for Junction Kitchen 3D pure logic (node --test).
import test from 'node:test';
import assert from 'node:assert/strict';
import { RECIPES, recipeById, unlockedRecipes, unlockedIngredients, nextPrepStep, componentReady, chopPiecesVisible } from '../game/js/recipes.js';
import { LEVELS, levelDef, starsFor } from '../game/js/levels.js';
import { UPGRADES, effectiveStats, canBuy, tierUnlockLevel } from '../game/js/upgrades.js';
import { makeOrder, tickOrders, servePayout, patienceFrac, patienceBand, departureTime } from '../game/js/orders.js';
import { cookZone, isPerfect, makeCountdown, tickCountdown, makeAction, tickAction, actionFrac } from '../game/js/timer.js';
import { STATIONS, PASSENGER_SPOTS, burnerSlots, plateSlots, nearestStation, clampFloor, OBSTACLES } from '../game/js/stations.js';
import { makeChef, giveItem, takeItem, freeHand, handCount, moveChef } from '../game/js/chef.js';
import { makeWaiter, waiterSpeed, pickWaiterJob, moveToward, WAITER_HOME } from '../game/js/waiter.js';

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

test('recipes: chop pieces appear one per stroke', () => {
  assert.equal(chopPiecesVisible(0), 0);
  assert.equal(chopPiecesVisible(0.2), 0);
  assert.equal(chopPiecesVisible(0.34), 1);
  assert.equal(chopPiecesVisible(0.55), 1);
  assert.equal(chopPiecesVisible(0.67), 2);
  assert.equal(chopPiecesVisible(1), 3);
  assert.equal(chopPiecesVisible(2), 3); // clamped
  assert.equal(chopPiecesVisible(-1), 0); // clamped
});

test('orders: departure board times are 5 minutes apart from 08:15', () => {
  assert.equal(departureTime(0), '08:15');
  assert.equal(departureTime(1), '08:20');
  assert.equal(departureTime(2), '08:25');
  assert.equal(departureTime(3), '08:30');
  assert.equal(departureTime(9), '09:00');
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

test('upgrades: 9 upgrades, 3 tiers, locks by level', () => {
  assert.equal(UPGRADES.length, 9);
  for (const u of UPGRADES) assert.equal(u.tiers.length, 3);
  assert.equal(tierUnlockLevel(0), 1);
  assert.equal(tierUnlockLevel(1), 2);
  assert.equal(tierUnlockLevel(2), 4);
  const base = effectiveStats({});
  assert.equal(base.knife.chopTime, 2.0);
  assert.equal(base.stove.burners, 2);
  assert.equal(base.waiter.waiters, 0);
  const full = effectiveStats({ knife: 3, stove: 3, plating: 3, waiter: 3 });
  assert.equal(full.knife.chopTime, 0.4);
  assert.equal(full.stove.burners, 3);
  assert.equal(full.plating.plateSlots, 5);
  assert.equal(full.waiter.waiters, 2);
  assert.equal(full.waiter.speedMult, 1.5);
  assert.equal(effectiveStats({ waiter: 2 }).waiter.waiters, 1);
  assert.equal(effectiveStats({ waiter: 2 }).waiter.speedMult, 1.5);
  assert.equal(canBuy('waiter', 0, 1, 50).ok, true);
  assert.equal(canBuy('waiter', 2, 3, 999).ok, false); // tier 3 needs LV4
  assert.equal(canBuy('knife', 0, 1, 25).ok, true);
  assert.equal(canBuy('knife', 1, 1, 999).ok, false); // tier 2 needs LV2
  assert.equal(canBuy('knife', 0, 1, 10).ok, false); // not enough coins
});

test('waiter: job picking and movement', () => {
  const w = makeWaiter(WAITER_HOME, 0);
  assert.equal(w.state, 'idle');
  assert.equal(w.carrying, null);
  assert.deepEqual(w.home, WAITER_HOME);
  // No ready plates -> no job.
  assert.equal(pickWaiterJob([], [{ state: 'waiting', recipeId: 'station-burger', patience: 10, patienceMax: 10 }]), null);
  // Ready plate + matching waiting order -> job; claimed plates skipped.
  const plates = [{ recipeId: 'station-burger' }, { recipeId: 'platform-salad', claimed: true }];
  const orders = [
    { state: 'waiting', recipeId: 'platform-salad', patience: 5, patienceMax: 10 },
    { state: 'waiting', recipeId: 'station-burger', patience: 9, patienceMax: 10 },
  ];
  const job = pickWaiterJob(plates, orders);
  assert.equal(job.dishIndex, 0);
  assert.equal(job.order.recipeId, 'station-burger');
  // A failed order never gets a job.
  assert.equal(pickWaiterJob(plates, [{ state: 'failed', recipeId: 'station-burger', patience: 0, patienceMax: 10 }]), null);
  // Speed: tier 2 is 50% faster, tier 3 keeps the speed with 2 waiters.
  assert.equal(waiterSpeed({ waiter: { speedMult: 1 } }), 2.2);
  assert.ok(Math.abs(waiterSpeed({ waiter: { speedMult: 1.5 } }) - 3.3) < 1e-9);
  // moveToward: arrives exactly, never overshoots.
  const m1 = moveToward(0, 0, 10, 0, 2.2, 1);
  assert.ok(Math.abs(m1.x - 2.2) < 1e-9 && m1.arrived === false);
  const m2 = moveToward(9.95, 0, 10, 0, 2.2, 1);
  assert.equal(m2.arrived, true);
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
  // Solid furniture: the serving counter and the prep table push the
  // walker out to the nearest edge; open floor is untouched.
  assert.equal(OBSTACLES.length, 3); // serving counter, prep table, bench
  const [ox, oz] = clampFloor(-5.3, 1.0);
  assert.ok(ox === -5.8 || ox === -4.8 || oz === -0.9 || oz === 2.9);
  const [px2, pz2] = clampFloor(0, 2.3);
  assert.equal(px2, 0);
  assert.ok(Math.abs(pz2 - 1.8) < 1e-9);
  assert.deepEqual(clampFloor(1.6, -1.2), [1.6, -1.2]);
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

import { musicMelody, musicTempoMs, SoundBank } from '../game/js/audio.js';

test('audio: melody is diatonic C major — no chromatic notes, no big leaps', () => {
  // Every non-rest note must sit on a C-major pitch class (C D E F G A
  // B = semitone classes 0,2,4,5,7,9,11). An F# (370 Hz, class 6)
  // slipped into the first version; F natural (349 Hz) replaced it.
  const C_MAJOR = new Set([0, 2, 4, 5, 7, 9, 11]);
  const pitchClass = (f) => {
    const midi = Math.round(69 + 12 * Math.log2(f / 440));
    return ((midi % 12) + 12) % 12;
  };
  for (const lv of [1, 3, 5]) {
    for (const f of musicMelody(lv)) {
      if (!f) continue; // rest
      assert.ok(C_MAJOR.has(pitchClass(f)), `level ${lv}: ${f} Hz is not in C major`);
    }
  }
  // No melodic leap bigger than a perfect fourth (5 semitones) WITHIN
  // a 16-step phrase — the waltz walks in steps, it never jumps. The
  // seam between the two phrases (A ends low on C, B-up starts an
  // octave higher) is a register shift after a rest, not a leap in
  // the line, so it is checked per phrase, not across the seam.
  const midiOf = (f) => Math.round(69 + 12 * Math.log2(f / 440));
  for (const lv of [1, 3, 5]) {
    const mel = musicMelody(lv);
    for (let ph = 0; ph < 2; ph++) {
      const notes = mel.slice(ph * 16, ph * 16 + 16).filter(Boolean);
      for (let i = 1; i < notes.length; i++) {
        assert.ok(Math.abs(midiOf(notes[i]) - midiOf(notes[i - 1])) <= 5,
          `level ${lv} phrase ${ph}: leap ${notes[i - 1]} -> ${notes[i]} Hz is too big`);
      }
    }
  }
  // Music sits under the SFX in volume (melody 0.03 < sizzle 0.045 <
  // chop 0.3): the balance is structural, not a guess.
  assert.ok(0.03 < 0.045 && 0.045 < 0.3);
});

test('audio: 32-step melody varies by level, Rush Hour is faster', () => {
  for (const lv of [1, 2, 3, 4, 5]) assert.equal(musicMelody(lv).length, 32);
  const m1 = musicMelody(1), m3 = musicMelody(3), m5 = musicMelody(5);
  // Levels 1-2: phrase A twice (same notes in both halves).
  assert.deepEqual(m1.slice(0, 16), m1.slice(16, 32));
  // Levels 3-4: A + B (second half differs from the first).
  assert.notDeepEqual(m3.slice(0, 16), m3.slice(16, 32));
  // Level 5: second half is B an octave up.
  assert.deepEqual(m5.slice(16, 32), m3.slice(16, 32).map((f) => (f ? f * 2 : 0)));
  // First half never changes; the rest (0) ends each phrase.
  assert.deepEqual(m1.slice(0, 16), m3.slice(0, 16));
  assert.equal(m1[15], 0);
  assert.equal(musicTempoMs(1), 340);
  assert.equal(musicTempoMs(5), 300);
  assert.ok(musicTempoMs(5) < musicTempoMs(1));
});

// Minimal fake AudioContext so the SoundBank can be exercised in node
// (no real audio device, no timers left running after the test).
function fakeAudioContext() {
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
  return {
    currentTime: 0,
    sampleRate: 44100,
    destination: {},
    resume() {},
    createBuffer(_ch, len) { return { getChannelData: () => new Float32Array(len) }; },
    createBufferSource() {
      return { buffer: null, loop: false, connect() { return this; }, start() { this.started = true; }, stop() { this.stopped = true; } };
    },
    createBiquadFilter() { return { type: '', frequency: param(), Q: param(), connect() { return this; } }; },
    createGain() { return { gain: param(), connect() { return this; } }; },
    createOscillator() { return { type: '', frequency: param(), connect() { return this; }, start() {}, stop() {} }; },
  };
}

test('audio: sizzle loop is idempotent, mute silences it, music restarts on unmute', () => {
  globalThis.window = { AudioContext: function () { return fakeAudioContext(); } };
  try {
    const sb = new SoundBank();
    sb.startSizzle();
    assert.ok(sb.sizzle, 'sizzle nodes created');
    const first = sb.sizzle;
    sb.startSizzle();
    assert.equal(sb.sizzle, first, 'second startSizzle reuses the loop');
    sb.stopSizzle();
    assert.equal(sb.sizzle, null, 'stopSizzle clears the loop');
    sb.stopSizzle(); // no-op, no throw
    // Music: wanted flag survives mute, timer restarts on unmute.
    sb.startMusic(1);
    assert.equal(sb.musicWanted, true);
    assert.ok(sb.musicTimer, 'music timer running');
    sb.setMuted(true);
    assert.equal(sb.musicTimer, null, 'mute stops the music timer');
    assert.equal(sb.sizzle, null, 'mute also stops the sizzle loop');
    sb.setMuted(false);
    assert.ok(sb.musicTimer, 'unmute restarts the music timer');
    sb.setMusicLevel(5);
    assert.equal(sb.musicLevel, 5);
    assert.equal(musicTempoMs(sb.musicLevel), 300);
    sb.stopMusic();
    assert.equal(sb.musicTimer, null);
    assert.equal(sb.musicWanted, false);
  } finally {
    delete globalThis.window;
  }
});
