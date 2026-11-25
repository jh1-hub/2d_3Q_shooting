import gameMp3Url from '../../bgm/kiokuyouryou_no_uta.mp3?url';
import topMidiUrl from '../../bgm/Neon_Tachyon_8-Bit_Overdrive.mid?url';
import {MidiLoopPlayer} from './midiPlayer';

export type BgmMode = 'top' | 'game' | 'none';
export type BgmDownloadStatus = 'loading' | 'ready' | 'error';

export interface BgmLoadState {
  status: BgmDownloadStatus;
  progress: number; // 0..1
  loadedBytes: number;
  totalBytes: number;
}

class BgmManager {
  private midiPlayer = new MidiLoopPlayer(topMidiUrl);
  private mp3Audio: HTMLAudioElement | null = null;
  private mp3ObjectUrl: string | null = null;
  private mode: BgmMode = 'none';
  private enabled = true;
  private paused = false;
  private gestureListenerAttached = false;
  private mp3NeedsUnlock = false;

  private preloadPromise: Promise<void> | null = null;
  private loadState: BgmLoadState = {
    status: 'loading',
    progress: 0,
    loadedBytes: 0,
    totalBytes: 0,
  };
  private listeners = new Set<(state: BgmLoadState) => void>();

  private readonly gameVolume = 0.45;
  private readonly pausedVolume = 0.16;

  private emitLoadState(next: BgmLoadState) {
    this.loadState = next;
    for (const listener of this.listeners) {
      listener(next);
    }
  }

  public getLoadState(): BgmLoadState {
    return this.loadState;
  }

  public subscribeLoadState(
    listener: (state: BgmLoadState) => void,
  ): () => void {
    this.listeners.add(listener);
    listener(this.loadState);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async fetchMp3Blob(
    onProgress: (loaded: number, total: number) => void,
  ): Promise<string> {
    if (this.mp3ObjectUrl) {
      onProgress(1, 1);
      return this.mp3ObjectUrl;
    }

    const res = await fetch(gameMp3Url);
    if (!res.ok) {
      throw new Error(`Failed to fetch BGM MP3: ${res.status}`);
    }

    const headerTotal = Number(res.headers.get('content-length') || 0);
    let blob: Blob;

    if (res.body && typeof res.body.getReader === 'function') {
      const reader = res.body.getReader();
      const chunks: BlobPart[] = [];
      let loaded = 0;
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          loaded += value.byteLength;
          onProgress(loaded, headerTotal || loaded);
        }
      }
      blob = new Blob(chunks, {type: 'audio/mpeg'});
    } else {
      blob = await res.blob();
      onProgress(blob.size, headerTotal || blob.size);
    }

    const objectUrl = URL.createObjectURL(blob);
    this.mp3ObjectUrl = objectUrl;
    return objectUrl;
  }

  public preloadAll(): Promise<void> {
    if (typeof window === 'undefined') {
      return Promise.resolve();
    }
    if (this.loadState.status === 'ready') {
      return Promise.resolve();
    }
    if (this.preloadPromise) {
      return this.preloadPromise;
    }

    let midiLoaded = 0;
    let midiTotal = 46_136;
    let mp3Loaded = 0;
    let mp3Total = 3_719_815;

    const updateCombinedProgress = () => {
      const total = Math.max(1, midiTotal + mp3Total);
      const loaded = Math.min(total, midiLoaded + mp3Loaded);
      const ratio = Math.max(0, Math.min(0.99, loaded / total));
      this.emitLoadState({
        status: 'loading',
        progress: ratio,
        loadedBytes: loaded,
        totalBytes: total,
      });
    };

    this.emitLoadState({
      status: 'loading',
      progress: 0,
      loadedBytes: 0,
      totalBytes: midiTotal + mp3Total,
    });

    this.preloadPromise = Promise.all([
      this.midiPlayer.preload((loaded, total) => {
        midiLoaded = loaded;
        if (total > 0) midiTotal = total;
        updateCombinedProgress();
      }),
      this.fetchMp3Blob((loaded, total) => {
        mp3Loaded = loaded;
        if (total > 0) mp3Total = total;
        updateCombinedProgress();
      }).then((objectUrl) => {
        if (!this.mp3Audio) {
          const audio = new Audio(objectUrl);
          audio.loop = true;
          audio.preload = 'auto';
          audio.volume = this.paused ? this.pausedVolume : this.gameVolume;
          audio.load();
          this.mp3Audio = audio;
        } else if (this.mp3Audio.src !== objectUrl) {
          this.mp3Audio.src = objectUrl;
          this.mp3Audio.load();
        }
      }),
    ])
      .then(() => {
        const finalTotal = Math.max(1, midiLoaded + mp3Loaded);
        this.emitLoadState({
          status: 'ready',
          progress: 1,
          loadedBytes: finalTotal,
          totalBytes: finalTotal,
        });
        if (this.enabled && this.mode === 'top') {
          void this.midiPlayer.start();
        }
      })
      .catch(() => {
        this.preloadPromise = null;
        this.emitLoadState({
          status: 'error',
          progress: 0,
          loadedBytes: 0,
          totalBytes: 0,
        });
      });

    return this.preloadPromise;
  }

  private ensureMp3(): HTMLAudioElement | null {
    if (typeof window === 'undefined') return null;
    if (!this.mp3Audio) {
      const audio = new Audio(this.mp3ObjectUrl ?? gameMp3Url);
      audio.loop = true;
      audio.preload = 'auto';
      audio.volume = this.paused ? this.pausedVolume : this.gameVolume;
      this.mp3Audio = audio;
    }
    return this.mp3Audio;
  }

  private attachGestureUnlock() {
    if (this.gestureListenerAttached || typeof window === 'undefined') return;
    this.gestureListenerAttached = true;

    const handleGesture = () => {
      if (!this.enabled) return;
      if (this.mode === 'top') {
        this.midiPlayer.unlock();
        void this.midiPlayer.start();
      } else if (this.mode === 'game' && this.mp3NeedsUnlock) {
        const audio = this.ensureMp3();
        if (audio && audio.paused) {
          audio.volume = this.paused ? this.pausedVolume : this.gameVolume;
          audio
            .play()
            .then(() => {
              this.mp3NeedsUnlock = false;
            })
            .catch(() => {});
        }
      }
    };

    window.addEventListener('pointerdown', handleGesture, {passive: true});
    window.addEventListener('keydown', handleGesture, {passive: true});
    window.addEventListener('touchstart', handleGesture, {passive: true});
  }

  public unlock() {
    this.attachGestureUnlock();
    if (this.mode === 'top') {
      this.midiPlayer.unlock();
    } else if (this.mode === 'game') {
      const audio = this.ensureMp3();
      if (audio && this.enabled && audio.paused) {
        audio
          .play()
          .then(() => {
            this.mp3NeedsUnlock = false;
          })
          .catch(() => {
            this.mp3NeedsUnlock = true;
          });
      }
    }
  }

  public setMode(nextMode: BgmMode) {
    this.attachGestureUnlock();
    if (this.mode === nextMode) return;
    this.mode = nextMode;

    if (nextMode === 'top') {
      if (this.mp3Audio) {
        this.mp3Audio.pause();
        this.mp3Audio.currentTime = 0;
      }
      this.mp3NeedsUnlock = false;
      if (this.enabled) {
        void this.midiPlayer.start();
      }
    } else if (nextMode === 'game') {
      this.midiPlayer.stop();
      const audio = this.ensureMp3();
      if (audio && this.enabled) {
        audio.volume = this.paused ? this.pausedVolume : this.gameVolume;
        audio
          .play()
          .then(() => {
            this.mp3NeedsUnlock = false;
          })
          .catch(() => {
            this.mp3NeedsUnlock = true;
          });
      }
    } else {
      this.midiPlayer.stop();
      if (this.mp3Audio) {
        this.mp3Audio.pause();
        this.mp3Audio.currentTime = 0;
      }
      this.mp3NeedsUnlock = false;
    }
  }

  public restartGameTrack() {
    this.attachGestureUnlock();
    this.midiPlayer.stop();
    this.mode = 'game';
    this.paused = false;
    const audio = this.ensureMp3();
    if (audio) {
      audio.currentTime = 0;
      audio.volume = this.gameVolume;
      if (this.enabled) {
        audio
          .play()
          .then(() => {
            this.mp3NeedsUnlock = false;
          })
          .catch(() => {
            this.mp3NeedsUnlock = true;
          });
      }
    }
  }

  public setPaused(paused: boolean) {
    this.paused = paused;
    if (this.mp3Audio) {
      this.mp3Audio.volume = paused ? this.pausedVolume : this.gameVolume;
    }
  }

  public setEnabled(val: boolean) {
    this.enabled = val;
    this.midiPlayer.setEnabled(val);
    const audio = this.ensureMp3();
    if (!audio) return;

    if (!val) {
      audio.pause();
    } else if (this.mode === 'game') {
      audio.volume = this.paused ? this.pausedVolume : this.gameVolume;
      audio
        .play()
        .then(() => {
          this.mp3NeedsUnlock = false;
        })
        .catch(() => {
          this.mp3NeedsUnlock = true;
        });
    } else if (this.mode === 'top') {
      void this.midiPlayer.start();
    }
  }
}

export const bgmManager = new BgmManager();
