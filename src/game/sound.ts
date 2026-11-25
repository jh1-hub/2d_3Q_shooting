class SynthAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private enabled = true;
  private lastShootTime: Record<string, number> = {};

  public setEnabled(val: boolean) {
    this.enabled = val;
  }

  private ensureContext(): AudioContext | null {
    if (!this.enabled) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as {webkitAudioContext: typeof AudioContext})
          .webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        const compressor = this.ctx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-14, this.ctx.currentTime);
        compressor.knee.setValueAtTime(18, this.ctx.currentTime);
        compressor.ratio.setValueAtTime(6, this.ctx.currentTime);
        compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
        compressor.release.setValueAtTime(0.16, this.ctx.currentTime);

        const masterGain = this.ctx.createGain();
        masterGain.gain.setValueAtTime(0.85, this.ctx.currentTime);
        masterGain.connect(compressor);
        compressor.connect(this.ctx.destination);
        this.master = masterGain;

        // Precompute reusable white noise buffer for punchy explosions & thrusters
        const sampleRate = this.ctx.sampleRate;
        const length = Math.floor(sampleRate * 1.4);
        const buf = this.ctx.createBuffer(1, length, sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < length; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        this.noiseBuffer = buf;
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public unlock() {
    this.ensureContext();
  }

  public playShoot(kind: 'normal' | 'laser' | 'missile' | 'ripple') {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;

    const now = ctx.currentTime;
    const prev = this.lastShootTime[kind] ?? 0;
    if (now - prev < 0.038) return;
    this.lastShootTime[kind] = now;

    if (kind === 'laser') {
      // Resonant dual-oscillator cyber beam + filtered noise tail
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.setValueAtTime(5.5, now);
      filter.frequency.setValueAtTime(2800, now);
      filter.frequency.exponentialRampToValueAtTime(420, now + 0.14);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.068, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      const osc1 = ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(920, now);
      osc1.frequency.exponentialRampToValueAtTime(210, now + 0.14);

      const osc2 = ctx.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1380, now);
      osc2.frequency.exponentialRampToValueAtTime(320, now + 0.14);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.15);
      osc2.stop(now + 0.15);

      if (this.noiseBuffer) {
        const noise = ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        const nFilter = ctx.createBiquadFilter();
        nFilter.type = 'bandpass';
        nFilter.frequency.setValueAtTime(2400, now);
        nFilter.Q.setValueAtTime(2, now);
        const nGain = ctx.createGain();
        nGain.gain.setValueAtTime(0.028, now);
        nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
        noise.connect(nFilter);
        nFilter.connect(nGain);
        nGain.connect(this.master);
        noise.start(now);
        noise.stop(now + 0.09);
      }
    } else if (kind === 'missile') {
      // Punchy tube thump + rocket whoosh
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(210, now);
      osc.frequency.exponentialRampToValueAtTime(75, now + 0.08);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(now);
      osc.stop(now + 0.09);

      if (this.noiseBuffer) {
        const noise = ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(900, now);
        bp.frequency.exponentialRampToValueAtTime(2400, now + 0.11);
        bp.Q.setValueAtTime(2.5, now);
        const nGain = ctx.createGain();
        nGain.gain.setValueAtTime(0.04, now);
        nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        noise.connect(bp);
        bp.connect(nGain);
        nGain.connect(this.master);
        noise.start(now);
        noise.stop(now + 0.12);
      }
    } else if (kind === 'ripple') {
      // Harmonic wave pulse
      for (const ratio of [1, 1.498]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(380 * ratio, now);
        osc.frequency.exponentialRampToValueAtTime(920 * ratio, now + 0.1);
        gain.gain.setValueAtTime(0.035, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
        osc.connect(gain);
        gain.connect(this.master);
        osc.start(now);
        osc.stop(now + 0.11);
      }
    } else {
      // Crisp filtered plasma pulse
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2200, now);
      filter.frequency.exponentialRampToValueAtTime(520, now + 0.048);

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(780, now);
      osc.frequency.exponentialRampToValueAtTime(240, now + 0.048);
      gain.gain.setValueAtTime(0.034, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.052);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      osc.start(now);
      osc.stop(now + 0.052);
    }
  }

  public playExplosion(large = false) {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;

    const now = ctx.currentTime;
    const duration = large ? 0.56 : 0.22;

    // 1. Sub-bass impact punch
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(large ? 125 : 175, now);
    sub.frequency.exponentialRampToValueAtTime(28, now + duration * 0.85);
    subGain.gain.setValueAtTime(large ? 0.22 : 0.1, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.9);
    sub.connect(subGain);
    subGain.connect(this.master);
    sub.start(now);
    sub.stop(now + duration);

    // 2. Crunchy lowpass-filtered noise roar
    if (this.noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.setValueAtTime(large ? 2.4 : 1.5, now);
      filter.frequency.setValueAtTime(large ? 2100 : 1700, now);
      filter.frequency.exponentialRampToValueAtTime(110, now + duration);

      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(large ? 0.2 : 0.095, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.master);
      noise.start(now);
      noise.stop(now + duration);
    }
  }

  public playXp() {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;
    const notes = [987.77, 1479.98];
    notes.forEach((freq, idx) => {
      if (!this.master) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const t = now + idx * 0.025;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.032, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.075);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + 0.075);
    });
  }

  public playLevelUp() {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 987.77, 1318.51];
    notes.forEach((freq, idx) => {
      if (!this.master) return;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      osc1.type = 'triangle';
      osc2.type = 'sine';
      const t = now + idx * 0.048;
      osc1.frequency.setValueAtTime(freq, t);
      osc2.frequency.setValueAtTime(freq * 1.004, t);
      const len = idx === notes.length - 1 ? 0.34 : 0.16;
      gain.gain.setValueAtTime(0.055, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + len);
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.master);
      osc1.start(t);
      osc2.start(t);
      osc1.stop(t + len);
      osc2.stop(t + len);
    });
  }

  public playShieldRecover() {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;
    const notes = [587.33, 880, 1174.66];
    notes.forEach((freq, idx) => {
      if (!this.master) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const t = now + idx * 0.045;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.06, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + 0.24);
    });
  }

  public playHit() {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.22);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.23);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.23);

    if (this.noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1100, now);
      bp.Q.setValueAtTime(1.8, now);
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.12, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      noise.connect(bp);
      bp.connect(nGain);
      nGain.connect(this.master);
      noise.start(now);
      noise.stop(now + 0.16);
    }
  }

  public playWarning() {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const t = now + i * 0.26;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.setValueAtTime(4, t);
      filter.frequency.setValueAtTime(1900, t);
      filter.frequency.linearRampToValueAtTime(600, t + 0.21);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.075, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

      const osc1 = ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(520, t);
      osc1.frequency.linearRampToValueAtTime(280, t + 0.21);

      const osc2 = ctx.createOscillator();
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(526, t);
      osc2.frequency.linearRampToValueAtTime(284, t + 0.21);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);

      osc1.start(t);
      osc2.start(t);
      osc1.stop(t + 0.22);
      osc2.stop(t + 0.22);
    }
  }

  public playBoost() {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(640, now + 0.55);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.7);

    if (this.noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(320, now);
      bp.frequency.exponentialRampToValueAtTime(3200, now + 0.65);
      bp.Q.setValueAtTime(1.4, now);
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.11, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.72);
      noise.connect(bp);
      bp.connect(nGain);
      nGain.connect(this.master);
      noise.start(now);
      noise.stop(now + 0.72);
    }
  }

  public playQuizCorrect() {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      if (!this.master) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const t = now + idx * 0.055;
      osc.frequency.setValueAtTime(freq, t);
      const len = idx === notes.length - 1 ? 0.28 : 0.12;
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + len);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + len);
    });
  }

  public playQuizWrong() {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;
    const notes = [233.08, 174.61];
    notes.forEach((freq, idx) => {
      if (!this.master) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      const t = now + idx * 0.14;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.075, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + 0.16);
    });
  }
}

export const synthAudio = new SynthAudio();
