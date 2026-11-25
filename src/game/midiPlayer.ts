interface MidiNoteEvent {
  timeSec: number;
  durationSec: number;
  channel: number;
  trackName: string;
  note: number;
  velocity: number;
}

interface ParsedMidi {
  events: MidiNoteEvent[];
  loopDurationSec: number;
}

interface RawMidiEvent {
  tick: number;
  order: number;
  kind: 'tempo' | 'noteOn' | 'noteOff';
  tempoUs?: number;
  channel?: number;
  trackName?: string;
  note?: number;
  velocity?: number;
}

function readVarLen(view: DataView, state: {pos: number}): number {
  let value = 0;
  for (let i = 0; i < 4; i++) {
    const b = view.getUint8(state.pos++);
    value = (value << 7) | (b & 0x7f);
    if ((b & 0x80) === 0) break;
  }
  return value;
}

function parseSmf(buffer: ArrayBuffer): ParsedMidi {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder('utf-8');

  if (
    bytes.length < 14 ||
    decoder.decode(bytes.subarray(0, 4)) !== 'MThd'
  ) {
    throw new Error('Invalid MIDI header');
  }

  const headerLen = view.getUint32(4, false);
  const trackCount = view.getUint16(10, false);
  const division = view.getUint16(12, false);
  const ppqn = division & 0x7fff || 480;

  let pos = 8 + headerLen;
  const rawEvents: RawMidiEvent[] = [];
  let maxTick = 0;
  let globalOrder = 0;

  for (let t = 0; t < trackCount && pos + 8 <= bytes.length; t++) {
    const chunkId = decoder.decode(bytes.subarray(pos, pos + 4));
    const chunkLen = view.getUint32(pos + 4, false);
    pos += 8;
    const trackEnd = Math.min(bytes.length, pos + chunkLen);

    if (chunkId !== 'MTrk') {
      pos = trackEnd;
      continue;
    }

    const state = {pos};
    let tick = 0;
    let runningStatus = 0;
    let trackName = `Track ${t}`;

    while (state.pos < trackEnd) {
      const delta = readVarLen(view, state);
      tick += delta;
      if (tick > maxTick) maxTick = tick;
      if (state.pos >= trackEnd) break;

      let status = view.getUint8(state.pos);
      if (status < 0x80) {
        status = runningStatus;
      } else {
        state.pos += 1;
        if (status < 0xf0) {
          runningStatus = status;
        }
      }

      if (status === 0xff) {
        if (state.pos >= trackEnd) break;
        const metaType = view.getUint8(state.pos++);
        const metaLen = readVarLen(view, state);
        const dataStart = state.pos;
        state.pos = Math.min(trackEnd, state.pos + metaLen);

        if (metaType === 0x03 && metaLen > 0) {
          trackName = decoder.decode(
            bytes.subarray(dataStart, dataStart + metaLen),
          );
        } else if (metaType === 0x51 && metaLen === 3) {
          const tempoUs =
            (bytes[dataStart] << 16) |
            (bytes[dataStart + 1] << 8) |
            bytes[dataStart + 2];
          rawEvents.push({
            tick,
            order: globalOrder++,
            kind: 'tempo',
            tempoUs,
          });
        }
      } else if (status === 0xf0 || status === 0xf7) {
        const syxLen = readVarLen(view, state);
        state.pos = Math.min(trackEnd, state.pos + syxLen);
      } else {
        const type = status & 0xf0;
        const channel = status & 0x0f;
        if (type === 0xc0 || type === 0xd0) {
          state.pos += 1;
        } else {
          if (state.pos + 1 >= trackEnd) {
            state.pos = trackEnd;
            break;
          }
          const d1 = view.getUint8(state.pos++);
          const d2 = view.getUint8(state.pos++);
          if (type === 0x90 && d2 > 0) {
            rawEvents.push({
              tick,
              order: globalOrder++,
              kind: 'noteOn',
              channel,
              trackName,
              note: d1,
              velocity: d2 / 127,
            });
          } else if (type === 0x80 || (type === 0x90 && d2 === 0)) {
            rawEvents.push({
              tick,
              order: globalOrder++,
              kind: 'noteOff',
              channel,
              trackName,
              note: d1,
            });
          }
        }
      }
    }

    pos = trackEnd;
  }

  rawEvents.sort((a, b) => a.tick - b.tick || a.order - b.order);

  // Convert ticks to seconds handling tempo changes
  let currentTempoUs = 500000;
  let lastTempoTick = 0;
  let lastTempoSec = 0;

  const tickToSec = (targetTick: number) =>
    lastTempoSec +
    ((targetTick - lastTempoTick) * currentTempoUs) / (ppqn * 1_000_000);

  const activeNotes = new Map<
    string,
    {timeSec: number; channel: number; trackName: string; note: number; velocity: number}[]
  >();
  const events: MidiNoteEvent[] = [];

  for (const ev of rawEvents) {
    const timeSec = tickToSec(ev.tick);
    if (ev.kind === 'tempo' && ev.tempoUs) {
      lastTempoSec = timeSec;
      lastTempoTick = ev.tick;
      currentTempoUs = ev.tempoUs;
    } else if (
      ev.kind === 'noteOn' &&
      ev.channel !== undefined &&
      ev.note !== undefined
    ) {
      const key = `${ev.channel}:${ev.trackName ?? ''}:${ev.note}`;
      let stack = activeNotes.get(key);
      if (!stack) {
        stack = [];
        activeNotes.set(key, stack);
      }
      stack.push({
        timeSec,
        channel: ev.channel,
        trackName: ev.trackName ?? '',
        note: ev.note,
        velocity: ev.velocity ?? 0.8,
      });
    } else if (
      ev.kind === 'noteOff' &&
      ev.channel !== undefined &&
      ev.note !== undefined
    ) {
      const key = `${ev.channel}:${ev.trackName ?? ''}:${ev.note}`;
      const stack = activeNotes.get(key);
      const started = stack?.shift();
      if (started) {
        events.push({
          ...started,
          durationSec: Math.max(0.03, timeSec - started.timeSec),
        });
      }
    }
  }

  const barTicks = ppqn * 4;
  const alignedBars = Math.max(1, Math.round(maxTick / barTicks));
  const loopTick = Math.max(maxTick, alignedBars * barTicks);
  const loopDurationSec = Math.max(1, tickToSec(loopTick));

  for (const stack of activeNotes.values()) {
    for (const started of stack) {
      events.push({
        ...started,
        durationSec: Math.max(0.05, Math.min(0.4, loopDurationSec - started.timeSec)),
      });
    }
  }

  events.sort((a, b) => a.timeSec - b.timeSec);
  return {events, loopDurationSec};
}

function midiNoteToFreq(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

export class MidiLoopPlayer {
  private parsed: ParsedMidi | null = null;
  private loadingPromise: Promise<void> | null = null;
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private timerId: number | null = null;
  private playing = false;
  private enabled = true;
  private volume = 0.42;

  private loopEpochSec = 0;
  private nextEventIdx = 0;

  constructor(private readonly url: string) {}

  public async preload(
    onProgress?: (loaded: number, total: number) => void,
  ): Promise<void> {
    if (this.parsed) {
      onProgress?.(1, 1);
      return;
    }
    if (!this.loadingPromise) {
      this.loadingPromise = (async () => {
        const res = await fetch(this.url);
        if (!res.ok) {
          throw new Error(`Failed to fetch MIDI: ${res.status}`);
        }
        const total = Number(res.headers.get('content-length') || 0);
        let buf: ArrayBuffer;
        if (res.body && typeof res.body.getReader === 'function') {
          const reader = res.body.getReader();
          const chunks: Uint8Array[] = [];
          let loaded = 0;
          while (true) {
            const {done, value} = await reader.read();
            if (done) break;
            if (value) {
              chunks.push(value);
              loaded += value.byteLength;
              onProgress?.(loaded, total || loaded);
            }
          }
          const combined = new Uint8Array(loaded);
          let offset = 0;
          for (const c of chunks) {
            combined.set(c, offset);
            offset += c.byteLength;
          }
          buf = combined.buffer;
        } else {
          buf = await res.arrayBuffer();
          onProgress?.(buf.byteLength, total || buf.byteLength);
        }
        this.parsed = parseSmf(buf);
      })().catch((err) => {
        this.loadingPromise = null;
        throw err;
      });
    }
    await this.loadingPromise;
  }

  private async ensureLoaded(): Promise<void> {
    try {
      await this.preload();
    } catch {
      // Handled gracefully when starting before preload finishes
    }
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as {webkitAudioContext: typeof AudioContext})
          .webkitAudioContext;
      if (!AudioCtx) return null;

      this.ctx = new AudioCtx();
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-16, this.ctx.currentTime);
      compressor.knee.setValueAtTime(14, this.ctx.currentTime);
      compressor.ratio.setValueAtTime(5, this.ctx.currentTime);
      compressor.attack.setValueAtTime(0.004, this.ctx.currentTime);
      compressor.release.setValueAtTime(0.18, this.ctx.currentTime);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(this.enabled ? this.volume : 0, this.ctx.currentTime);
      gain.connect(compressor);
      compressor.connect(this.ctx.destination);
      this.masterGain = gain;

      const sr = this.ctx.sampleRate;
      const len = Math.floor(sr * 0.6);
      const nb = this.ctx.createBuffer(1, len, sr);
      const ch = nb.getChannelData(0);
      for (let i = 0; i < len; i++) {
        ch[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = nb;
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public unlock() {
    if (!this.playing || !this.enabled) return;
    const ctx = this.ensureContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }

  public setEnabled(val: boolean) {
    this.enabled = val;
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(
        val && this.playing ? this.volume : 0,
        this.ctx.currentTime,
        0.02,
      );
    }
    if (!val) {
      this.stopSchedulerOnly();
    } else if (this.playing) {
      void this.start();
    }
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.ctx && this.masterGain && this.enabled && this.playing) {
      this.masterGain.gain.setTargetAtTime(
        this.volume,
        this.ctx.currentTime,
        0.03,
      );
    }
  }

  private stopSchedulerOnly() {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  public async start(): Promise<void> {
    this.playing = true;
    if (!this.enabled) return;

    await this.ensureLoaded();
    if (!this.playing || !this.enabled || !this.parsed) return;

    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    this.masterGain.gain.setTargetAtTime(this.volume, ctx.currentTime, 0.02);

    if (this.timerId === null) {
      this.loopEpochSec = ctx.currentTime + 0.04;
      this.nextEventIdx = 0;
      this.timerId = window.setInterval(() => this.pumpSchedule(), 35);
      this.pumpSchedule();
    }
  }

  public stop() {
    this.playing = false;
    this.stopSchedulerOnly();
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
    }
  }

  private pumpSchedule() {
    if (!this.playing || !this.enabled || !this.parsed || !this.ctx || !this.masterGain) {
      return;
    }
    if (this.ctx.state !== 'running') {
      return;
    }

    const {events, loopDurationSec} = this.parsed;
    if (events.length === 0) return;

    const lookaheadUntil = this.ctx.currentTime + 0.16;

    // Catch up if tab was backgrounded
    if (this.loopEpochSec + loopDurationSec < this.ctx.currentTime - 0.1) {
      this.loopEpochSec = this.ctx.currentTime + 0.02;
      this.nextEventIdx = 0;
    }

    let safety = 0;
    while (safety++ < 512) {
      if (this.nextEventIdx >= events.length) {
        this.loopEpochSec += loopDurationSec;
        this.nextEventIdx = 0;
      }
      const ev = events[this.nextEventIdx];
      const scheduledTime = this.loopEpochSec + ev.timeSec;
      if (scheduledTime > lookaheadUntil) break;

      if (scheduledTime >= this.ctx.currentTime - 0.04) {
        this.triggerNote(ev, Math.max(this.ctx.currentTime, scheduledTime));
      }
      this.nextEventIdx += 1;
    }
  }

  private triggerNote(ev: MidiNoteEvent, when: number) {
    const ctx = this.ctx;
    const out = this.masterGain;
    if (!ctx || !out) return;

    if (ev.channel === 9) {
      this.triggerDrum(ev.note, ev.velocity, when, ctx, out);
      return;
    }

    const freq = midiNoteToFreq(ev.note);
    const dur = Math.min(2.2, Math.max(0.04, ev.durationSec));
    const name = ev.trackName.toLowerCase();

    if (name.includes('fmmotor') || ev.channel === 0 || ev.channel === 1) {
      // Punchy FM/Saw bass
      const isBite = name.includes('bite') || ev.channel === 1;
      const osc = ctx.createOscillator();
      osc.type = isBite ? 'square' : 'sawtooth';
      osc.frequency.setValueAtTime(freq, when);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.setValueAtTime(isBite ? 4.5 : 2.8, when);
      filter.frequency.setValueAtTime(isBite ? 2400 : 1250, when);
      filter.frequency.exponentialRampToValueAtTime(
        isBite ? 480 : 280,
        when + Math.min(dur, 0.18),
      );

      const gain = ctx.createGain();
      const peak = (isBite ? 0.14 : 0.22) * ev.velocity;
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.linearRampToValueAtTime(peak, when + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0008, when + dur + 0.03);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(out);
      osc.start(when);
      osc.stop(when + dur + 0.04);
    } else if (name.includes('echo') || ev.channel === 3) {
      // Pseudo delay echo arp (softer square)
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, when);

      const gain = ctx.createGain();
      const peak = 0.055 * ev.velocity;
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.linearRampToValueAtTime(peak, when + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0008, when + dur + 0.02);

      osc.connect(gain);
      gain.connect(out);
      osc.start(when);
      osc.stop(when + dur + 0.03);
    } else if (name.includes('stab') || ev.channel === 4) {
      // Synth stab chords
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, when);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2600, when);
      filter.frequency.exponentialRampToValueAtTime(750, when + Math.min(dur, 0.22));

      const gain = ctx.createGain();
      const peak = 0.095 * ev.velocity;
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.linearRampToValueAtTime(peak, when + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0008, when + dur + 0.04);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(out);
      osc.start(when);
      osc.stop(when + dur + 0.05);
    } else if (name.includes('arcadelead') || ev.channel === 5) {
      // Bright dual-osc arcade lead
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = 'square';
      osc2.type = 'sawtooth';
      osc1.frequency.setValueAtTime(freq, when);
      osc2.frequency.setValueAtTime(freq * 1.004, when);

      const gain = ctx.createGain();
      const peak = 0.13 * ev.velocity;
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.linearRampToValueAtTime(peak, when + 0.008);
      gain.gain.setValueAtTime(peak * 0.78, when + Math.min(0.06, dur * 0.5));
      gain.gain.exponentialRampToValueAtTime(0.0008, when + dur + 0.05);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(out);
      osc1.start(when);
      osc2.start(when);
      osc1.stop(when + dur + 0.06);
      osc2.stop(when + dur + 0.06);
    } else if (name.includes('fx') || ev.channel === 6 || ev.channel === 7) {
      if (this.noiseBuffer) {
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(1400, when);
        bp.frequency.exponentialRampToValueAtTime(220, when + 0.45);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.14 * ev.velocity, when);
        gain.gain.exponentialRampToValueAtTime(0.001, when + 0.45);
        src.connect(bp);
        bp.connect(gain);
        gain.connect(out);
        src.start(when);
        src.stop(when + 0.46);
      }
    } else {
      // ChiptuneArpLead / default
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, when);

      const gain = ctx.createGain();
      const peak = 0.11 * ev.velocity;
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.linearRampToValueAtTime(peak, when + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0008, when + dur + 0.02);

      osc.connect(gain);
      gain.connect(out);
      osc.start(when);
      osc.stop(when + dur + 0.03);
    }
  }

  private triggerDrum(
    note: number,
    velocity: number,
    when: number,
    ctx: AudioContext,
    out: AudioNode,
  ) {
    if (note === 35 || note === 36) {
      // Kick
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(148, when);
      osc.frequency.exponentialRampToValueAtTime(42, when + 0.11);
      gain.gain.setValueAtTime(0.32 * velocity, when);
      gain.gain.exponentialRampToValueAtTime(0.001, when + 0.14);
      osc.connect(gain);
      gain.connect(out);
      osc.start(when);
      osc.stop(when + 0.15);
    } else if (note === 38 || note === 40 || note === 39 || note === 37) {
      // Snare / Clap
      if (this.noiseBuffer) {
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(1100, when);
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.18 * velocity, when);
        ng.gain.exponentialRampToValueAtTime(0.001, when + 0.13);
        src.connect(hp);
        hp.connect(ng);
        ng.connect(out);
        src.start(when);
        src.stop(when + 0.14);
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(210, when);
      osc.frequency.exponentialRampToValueAtTime(95, when + 0.07);
      gain.gain.setValueAtTime(0.14 * velocity, when);
      gain.gain.exponentialRampToValueAtTime(0.001, when + 0.08);
      osc.connect(gain);
      gain.connect(out);
      osc.start(when);
      osc.stop(when + 0.09);
    } else if (note === 42 || note === 44) {
      // Closed Hi-Hat
      if (this.noiseBuffer) {
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(6500, when);
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.085 * velocity, when);
        ng.gain.exponentialRampToValueAtTime(0.001, when + 0.045);
        src.connect(hp);
        hp.connect(ng);
        ng.connect(out);
        src.start(when);
        src.stop(when + 0.05);
      }
    } else if (note === 46 || note === 49 || note === 51 || note === 57) {
      // Open Hat / Crash / Ride
      if (this.noiseBuffer) {
        const isCrash = note === 49 || note === 57;
        const dur = isCrash ? 0.42 : 0.16;
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(isCrash ? 4200 : 5800, when);
        const ng = ctx.createGain();
        ng.gain.setValueAtTime((isCrash ? 0.14 : 0.09) * velocity, when);
        ng.gain.exponentialRampToValueAtTime(0.001, when + dur);
        src.connect(hp);
        hp.connect(ng);
        ng.connect(out);
        src.start(when);
        src.stop(when + dur + 0.01);
      }
    } else {
      // Toms / misc percussion
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const base = 95 + (note % 12) * 14;
      osc.frequency.setValueAtTime(base * 1.5, when);
      osc.frequency.exponentialRampToValueAtTime(base * 0.7, when + 0.12);
      gain.gain.setValueAtTime(0.14 * velocity, when);
      gain.gain.exponentialRampToValueAtTime(0.001, when + 0.13);
      osc.connect(gain);
      gain.connect(out);
      osc.start(when);
      osc.stop(when + 0.14);
    }
  }
}
