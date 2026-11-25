// audio.js — Synthesised sound effects + a tiny music loop, Web Audio only.
// No audio files: every sound is an oscillator / noise burst built here.

// ---------- background music ----------
// 32-step train-yard waltz (C major), two 16-step phrases. Level 1-2
// play A+A (gentler); level 3-4 play A+B; level 5 (Rush Hour) plays
// A+B an octave up, and a faster tempo. 0 = rest (a breath at the end
// of each phrase). Pure note data — no audio files, no AudioContext.
const MELODY_A = [262, 330, 392, 330, 294, 370, 440, 370, 330, 392, 440, 392, 330, 294, 262, 0];
const MELODY_B = [294, 370, 440, 523, 440, 370, 392, 330, 294, 330, 392, 440, 523, 440, 392, 0];
// One bass root per 8-step bar: C - G - Am - F.
const BASS_ROOTS = [131, 98, 110, 87];
export function musicMelody(level) {
  const b = level >= 5 ? MELODY_B.map((f) => (f ? f * 2 : 0)) : MELODY_B;
  return level >= 3 ? [...MELODY_A, ...b] : [...MELODY_A, ...MELODY_A];
}
export function musicTempoMs(level) {
  return level >= 5 ? 300 : 340; // Rush Hour is a touch faster
}

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicTimer = null;
    this.musicStep = 0;
    this.musicLevel = 1;
    this.musicWanted = false;
    this._melody = musicMelody(1);
    this.sizzle = null; // looping stove noise nodes, or null
  }
  ensure() {
    if (!this.ctx) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
      } catch (e) { this.ctx = null; }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  setMuted(m) {
    this.muted = m;
    if (m) {
      // Silence everything at once, including the looping sizzle.
      this._stopMusicTimer();
      this.stopSizzle();
    } else if (this.musicWanted && !this.musicTimer) {
      this._startMusicTimer();
    }
  }
  clickInvalid() { this.tone(200, 0.06, 'sine', 0.05); }
  tone(freq, dur, type, vol, when, slideTo) {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + (when || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.15, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }
  noise(dur, vol, filterFreq) {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = filterFreq || 1800;
    const g = ctx.createGain();
    g.gain.value = vol || 0.2;
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(t0);
  }
  chop() { this.noise(0.09, 0.3, 2200); this.tone(180, 0.06, 'triangle', 0.12); }
  pickup() { this.tone(520, 0.07, 'sine', 0.12, 0, 780); }
  place() { this.tone(340, 0.08, 'sine', 0.12, 0, 240); }
  sizzle() { this.noise(0.5, 0.08, 5000); }
  ding() { this.tone(880, 0.35, 'sine', 0.18); this.tone(1320, 0.3, 'sine', 0.10, 0.02); }
  coin() { this.tone(990, 0.08, 'square', 0.08); this.tone(1320, 0.16, 'square', 0.08, 0.08); }
  fail() { this.tone(220, 0.3, 'sawtooth', 0.12, 0, 110); }
  bell() { this.tone(1180, 0.5, 'sine', 0.16); this.tone(1760, 0.4, 'sine', 0.08, 0.01); }
  levelUp() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.14, i * 0.11));
  }
  click() { this.tone(700, 0.04, 'sine', 0.08); }
  // Sizzle: a LOOP while food sits on the stove (start when food is
  // placed, stop when it is taken off or burns). Quiet, so it sits
  // under the music and the other SFX. Idempotent: calling it again
  // while already sizzling does nothing.
  startSizzle() {
    if (this.muted || this.sizzle) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 5000;
    f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(0.045, ctx.currentTime + 0.1);
    src.connect(f).connect(g).connect(ctx.destination);
    src.start();
    this.sizzle = { src, g };
  }
  stopSizzle() {
    if (!this.sizzle) return;
    const { src, g } = this.sizzle;
    this.sizzle = null;
    try {
      if (this.ctx) g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.05);
      src.stop(this.ctx ? this.ctx.currentTime + 0.2 : 0);
    } catch (e) { /* already stopped */ }
  }
  // ---------- background music ----------
  // 32-step loop, quiet under the SFX (melody 0.03, bass 0.028).
  // The bass line (one root per bar + the fifth mid-bar) carries the
  // waltz; the melody varies by level (see musicMelody).
  startMusic(level) {
    this.musicWanted = true;
    if (level) this.musicLevel = level;
    this._melody = musicMelody(this.musicLevel);
    if (this.muted || this.musicTimer) return;
    this._startMusicTimer();
  }
  _startMusicTimer() {
    this._melody = musicMelody(this.musicLevel);
    this.musicTimer = setInterval(() => {
      if (this.muted) return;
      const step = this.musicStep % 32;
      const f = this._melody[step];
      if (f) this.tone(f, 0.5, 'triangle', 0.03);
      if (step % 8 === 0) {
        const root = BASS_ROOTS[(step / 8) | 0];
        this.tone(root, 1.1, 'sine', 0.028);
      } else if (step % 8 === 4) {
        const root = BASS_ROOTS[(step / 8) | 0];
        this.tone(root * 1.5, 0.5, 'sine', 0.02);
      }
      this.musicStep += 1;
    }, musicTempoMs(this.musicLevel));
  }
  _stopMusicTimer() {
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
  }
  // Called when the level changes: the melody and tempo follow the
  // shift (Rush Hour is faster and brighter). Restarts the timer only
  // when the tempo actually changes and music is playing.
  setMusicLevel(level) {
    const oldTempo = musicTempoMs(this.musicLevel);
    this.musicLevel = level;
    this._melody = musicMelody(level);
    if (this.musicTimer && musicTempoMs(level) !== oldTempo) {
      this._stopMusicTimer();
      this._startMusicTimer();
    }
  }
  stopMusic() {
    this.musicWanted = false;
    this._stopMusicTimer();
  }
}
