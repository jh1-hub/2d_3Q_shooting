import {UpgradePatternId} from './types';

export interface PlayerProgress {
  totalPlays: number;
  clearedStage8: boolean;
  enteredEndless: boolean;
}

const PROGRESS_KEY = 'arrow01_progress_v1';

const DEFAULT_PROGRESS: PlayerProgress = {
  totalPlays: 0,
  clearedStage8: false,
  enteredEndless: false,
};

export function readProgress(): PlayerProgress {
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    if (!raw) return {...DEFAULT_PROGRESS};
    const parsed = JSON.parse(raw) as Partial<PlayerProgress>;
    return {
      totalPlays:
        typeof parsed.totalPlays === 'number' && Number.isFinite(parsed.totalPlays)
          ? Math.max(0, Math.floor(parsed.totalPlays))
          : 0,
      clearedStage8: Boolean(parsed.clearedStage8),
      enteredEndless: Boolean(parsed.enteredEndless),
    };
  } catch {
    return {...DEFAULT_PROGRESS};
  }
}

function writeProgress(progress: PlayerProgress): void {
  try {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

export function recordPlayRun(): PlayerProgress {
  const current = readProgress();
  const next: PlayerProgress = {
    ...current,
    totalPlays: current.totalPlays + 1,
  };
  writeProgress(next);
  return next;
}

export function recordStage8Clear(): PlayerProgress {
  const current = readProgress();
  if (current.clearedStage8) return current;
  const next: PlayerProgress = {
    ...current,
    clearedStage8: true,
  };
  writeProgress(next);
  return next;
}

export function recordEndlessEntry(): PlayerProgress {
  const current = readProgress();
  if (current.enteredEndless) return current;
  const next: PlayerProgress = {
    ...current,
    enteredEndless: true,
  };
  writeProgress(next);
  return next;
}

export function isPatternUnlocked(
  patternId: UpgradePatternId,
  progress: PlayerProgress,
): boolean {
  switch (patternId) {
    case 'missile_guard':
      return true;
    case 'spread':
      return progress.totalPlays >= 2;
    case 'balance':
      return progress.totalPlays >= 6 && progress.clearedStage8;
    case 'pierce':
      return progress.totalPlays >= 10 && progress.enteredEndless;
  }
}

export interface PatternUnlockStatus {
  unlocked: boolean;
  requirements: {label: string; met: boolean}[];
}

export function getPatternUnlockStatus(
  patternId: UpgradePatternId,
  progress: PlayerProgress,
): PatternUnlockStatus {
  switch (patternId) {
    case 'missile_guard':
      return {unlocked: true, requirements: []};
    case 'spread':
      return {
        unlocked: progress.totalPlays >= 2,
        requirements: [
          {
            label: `累計プレイ ${Math.min(progress.totalPlays, 2)}/2`,
            met: progress.totalPlays >= 2,
          },
        ],
      };
    case 'balance':
      return {
        unlocked: progress.totalPlays >= 6 && progress.clearedStage8,
        requirements: [
          {
            label: `累計プレイ ${Math.min(progress.totalPlays, 6)}/6`,
            met: progress.totalPlays >= 6,
          },
          {
            label: progress.clearedStage8 ? 'STAGE 8 クリア済' : 'STAGE 8 クリア',
            met: progress.clearedStage8,
          },
        ],
      };
    case 'pierce':
      return {
        unlocked: progress.totalPlays >= 10 && progress.enteredEndless,
        requirements: [
          {
            label: `累計プレイ ${Math.min(progress.totalPlays, 10)}/10`,
            met: progress.totalPlays >= 10,
          },
          {
            label: progress.enteredEndless ? 'エンドレス挑戦済' : 'エンドレス挑戦',
            met: progress.enteredEndless,
          },
        ],
      };
  }
}
