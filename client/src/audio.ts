/**
 * Tiny procedural sound engine built on the Web Audio API. No audio assets are
 * shipped: every effect is synthesised from oscillators / noise so the game
 * stays lightweight and works offline.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private volume = 0.6;

  private ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.volume;
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain = 0.15, slideTo?: number) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), ctx.currentTime + dur);
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  private noise(dur: number, gain = 0.12, filterFreq = 1200) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const frames = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start();
  }

  swing() { this.noise(0.12, 0.08, 2400); }
  hit() { this.tone(180, 0.12, 'square', 0.12, 90); this.noise(0.08, 0.08, 900); }
  crit() { this.tone(320, 0.18, 'sawtooth', 0.16, 140); }
  miss() { this.tone(220, 0.08, 'sine', 0.06, 160); }
  hurt() { this.tone(140, 0.22, 'sawtooth', 0.14, 70); }
  heal() { this.tone(520, 0.25, 'sine', 0.1, 780); }
  levelUp() { [440, 554, 659, 880].forEach((f, i) => setTimeout(() => this.tone(f, 0.3, 'triangle', 0.12), i * 90)); }
  loot() { this.tone(660, 0.1, 'triangle', 0.1, 990); }
  quest() { this.tone(560, 0.18, 'triangle', 0.1, 840); }
  death() { [330, 262, 196, 147].forEach((f, i) => setTimeout(() => this.tone(f, 0.4, 'sine', 0.14), i * 160)); }
  ui() { this.tone(700, 0.05, 'sine', 0.05); }
  gather() { this.noise(0.2, 0.06, 500); }
  portal() { this.tone(300, 0.5, 'sine', 0.12, 900); }
}

export const audio = new AudioEngine();
