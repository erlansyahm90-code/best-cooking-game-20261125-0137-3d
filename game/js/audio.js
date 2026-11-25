// audio.js — Synthesised sound effects + a tiny music loop, Web Audio only.
// No audio files: every sound is an oscillator / noise burst built here.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicTimer = null;
    this.musicStep = 0;
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
  setMuted(m) { this.muted = m; }
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
  // A gentle 8-step music loop (train-yard waltz feel), quiet.
  startMusic() {
    if (this.musicTimer || this.muted) return;
    const notes = [262, 330, 392, 330, 294, 370, 440, 370];
    this.musicTimer = setInterval(() => {
      if (this.muted) return;
      const f = notes[this.musicStep % notes.length];
      this.tone(f, 0.5, 'triangle', 0.035);
      if (this.musicStep % 4 === 2) this.tone(f / 2, 0.5, 'sine', 0.03);
      this.musicStep += 1;
    }, 340);
  }
  stopMusic() {
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
  }
}
