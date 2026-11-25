// timer.js — Clocks: level countdown, cook/chop progress, perfect zone.
// All progress is 0..1 fractions; the perfect-cook green zone is the
// middle 30% of a cook bar (0.35..0.65). Leaving food past 1.0 burns it.

export const PERFECT_LOW = 0.35;
export const PERFECT_HIGH = 0.65;
export const BURN_AT = 1.0;

// A cook pot: progress advances with dt / duration. Returns its zone.
export function cookZone(progress) {
  if (progress >= PERFECT_LOW && progress <= PERFECT_HIGH) return 'perfect';
  if (progress > PERFECT_HIGH && progress < BURN_AT) return 'late';
  if (progress >= BURN_AT) return 'burnt';
  return 'cooking';
}
export function isPerfect(progress) {
  return cookZone(progress) === 'perfect';
}
// Simple countdown timer object.
export function makeCountdown(seconds) {
  return { total: seconds, left: seconds };
}
export function tickCountdown(c, dt) {
  c.left = Math.max(0, c.left - dt);
  return c.left;
}
export function countdownFrac(c) {
  return c.total > 0 ? c.left / c.total : 0;
}
export function fmtTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
// A timed action (chop / pickup / plate): advances 0..1, done at 1.
export function makeAction(duration) {
  return { duration, t: 0, done: false };
}
export function tickAction(a, dt) {
  if (a.done) return true;
  a.t += dt;
  if (a.t >= a.duration) { a.t = a.duration; a.done = true; }
  return a.done;
}
export function actionFrac(a) {
  return a.duration > 0 ? a.t / a.duration : 1;
}
