// Tiny synthesized engine + horn (no audio files needed).
export class CarAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  start() {
    if (this.ctx) return;
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(ctx.destination);

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass'; this.filter.frequency.value = 600;
    this.filter.connect(this.master);
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.15;
    this.engineGain.connect(this.filter);
    this.osc1 = ctx.createOscillator(); this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator(); this.osc2.type = 'square';
    this.osc1.connect(this.engineGain); this.osc2.connect(this.engineGain);
    this.osc1.start(); this.osc2.start();
  }

  update(speed, throttle) {
    if (!this.ctx) return;
    // Fake gearbox so the engine note rises and drops as you accelerate.
    const v = Math.abs(speed);
    const gears = [0, 9, 17, 26, 35, 60];
    let gi = 0;
    while (gi < gears.length - 2 && v > gears[gi + 1]) gi++;
    const t = (v - gears[gi]) / (gears[gi + 1] - gears[gi]);
    const rpm = 0.2 + Math.min(1, t) * 0.8;
    const f = 38 + rpm * 70;
    const now = this.ctx.currentTime;
    this.osc1.frequency.setTargetAtTime(f, now, 0.05);
    this.osc2.frequency.setTargetAtTime(f * 0.5, now, 0.05);
    this.filter.frequency.setTargetAtTime(300 + rpm * 900 + (throttle ? 400 : 0), now, 0.08);
    this.engineGain.gain.setTargetAtTime(throttle ? 0.2 : 0.11, now, 0.1);
  }

  horn() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const [freq, delay] of [[420, 0], [520, 0], [420, 0.22], [520, 0.22]]) {
      const o = this.ctx.createOscillator(), gn = this.ctx.createGain();
      o.type = 'square'; o.frequency.value = freq;
      gn.gain.setValueAtTime(0, now + delay);
      gn.gain.linearRampToValueAtTime(0.12, now + delay + 0.01);
      gn.gain.setValueAtTime(0.12, now + delay + 0.15);
      gn.gain.linearRampToValueAtTime(0, now + delay + 0.18);
      o.connect(gn).connect(this.master);
      o.start(now + delay); o.stop(now + delay + 0.2);
    }
  }

  splash() {
    if (!this.ctx) return;
    const ctx = this.ctx, len = ctx.sampleRate * 1.2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 900;
    src.buffer = buf; src.connect(f).connect(this.master); src.start();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.35;
    return this.muted;
  }
}
