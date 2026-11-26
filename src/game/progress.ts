import {UpgradePatternId} from './types';

export interface PlayerProgress {
  totalPlays: number;
  clearedStage8: boolean;
  enteredEndless: boolean;
  solvedTermIds: number[];
  solvedTermCounts: Record<number, number>;
  wrongTermCounts: Record<number, number>;
}

const PROGRESS_KEY = 'arrow01_progress_v1';

const DEFAULT_PROGRESS: PlayerProgress = {
  totalPlays: 0,
  clearedStage8: false,
  enteredEndless: false,
  solvedTermIds: [],
  solvedTermCounts: {},
  wrongTermCounts: {},
};

export function readProgress(): PlayerProgress {
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    if (!raw) {
      return {
        ...DEFAULT_PROGRESS,
        solvedTermIds: [],
        solvedTermCounts: {},
        wrongTermCounts: {},
      };
    }
    const parsed = JSON.parse(raw) as Partial<PlayerProgress>;
    const counts: Record<number, number> = {};
    const wrongCounts: Record<number, number> = {};

    if (
      parsed.solvedTermCounts &&
      typeof parsed.solvedTermCounts === 'object'
    ) {
      for (const [key, val] of Object.entries(parsed.solvedTermCounts)) {
        const id = Number(key);
        if (
          Number.isInteger(id) &&
          id > 0 &&
          typeof val === 'number' &&
          Number.isFinite(val) &&
          val >= 1
        ) {
          counts[id] = Math.floor(val);
        }
      }
    }

    if (
      parsed.wrongTermCounts &&
      typeof parsed.wrongTermCounts === 'object'
    ) {
      for (const [key, val] of Object.entries(parsed.wrongTermCounts)) {
        const id = Number(key);
        if (
          Number.isInteger(id) &&
          id > 0 &&
          typeof val === 'number' &&
          Number.isFinite(val) &&
          val >= 1
        ) {
          wrongCounts[id] = Math.floor(val);
        }
      }
    }

    if (Array.isArray(parsed.solvedTermIds)) {
      for (const id of parsed.solvedTermIds) {
        if (typeof id === 'number' && Number.isInteger(id) && id > 0) {
          counts[id] = Math.max(1, counts[id] ?? 0);
        }
      }
    }

    const solvedTermIds = Object.keys(counts)
      .map(Number)
      .sort((a, b) => a - b);

    return {
      totalPlays:
        typeof parsed.totalPlays === 'number' && Number.isFinite(parsed.totalPlays)
          ? Math.max(0, Math.floor(parsed.totalPlays))
          : 0,
      clearedStage8: Boolean(parsed.clearedStage8),
      enteredEndless: Boolean(parsed.enteredEndless),
      solvedTermIds,
      solvedTermCounts: counts,
      wrongTermCounts: wrongCounts,
    };
  } catch {
    return {
      ...DEFAULT_PROGRESS,
      solvedTermIds: [],
      solvedTermCounts: {},
      wrongTermCounts: {},
    };
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

export function recordSolvedTerm(termId: number): PlayerProgress {
  const current = readProgress();
  if (!Number.isInteger(termId) || termId <= 0) {
    return current;
  }
  const prevCount = current.solvedTermCounts[termId] ?? 0;
  const nextCounts: Record<number, number> = {
    ...current.solvedTermCounts,
    [termId]: prevCount + 1,
  };
  const solvedTermIds = Object.keys(nextCounts)
    .map(Number)
    .sort((a, b) => a - b);
  const next: PlayerProgress = {
    ...current,
    solvedTermCounts: nextCounts,
    solvedTermIds,
  };
  writeProgress(next);
  return next;
}

export function recordWrongTerm(termId: number): PlayerProgress {
  const current = readProgress();
  if (!Number.isInteger(termId) || termId <= 0) {
    return current;
  }
  const prevWrong = current.wrongTermCounts[termId] ?? 0;
  const nextWrongCounts: Record<number, number> = {
    ...current.wrongTermCounts,
    [termId]: prevWrong + 1,
  };
  const next: PlayerProgress = {
    ...current,
    wrongTermCounts: nextWrongCounts,
  };
  writeProgress(next);
  return next;
}

export function isPatternUnlocked(
  patternId: UpgradePatternId,
  progress: PlayerProgress,
): boolean {
  const collectedCount = progress.solvedTermIds.length;
  switch (patternId) {
    case 'missile_guard':
      return true;
    case 'spread':
      return progress.totalPlays >= 2 && collectedCount >= 10;
    case 'balance':
      return (
        progress.totalPlays >= 6 &&
        progress.clearedStage8 &&
        collectedCount >= 30
      );
    case 'pierce':
      return (
        progress.totalPlays >= 10 &&
        progress.enteredEndless &&
        collectedCount >= 65
      );
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
  const collectedCount = progress.solvedTermIds.length;
  switch (patternId) {
    case 'missile_guard':
      return {unlocked: true, requirements: []};
    case 'spread':
      return {
        unlocked: progress.totalPlays >= 2 && collectedCount >= 10,
        requirements: [
          {
            label: `累計プレイ ${Math.min(progress.totalPlays, 2)}/2`,
            met: progress.totalPlays >= 2,
          },
          {
            label: `Parts ${Math.min(collectedCount, 10)}/10`,
            met: collectedCount >= 10,
          },
        ],
      };
    case 'balance':
      return {
        unlocked:
          progress.totalPlays >= 6 &&
          progress.clearedStage8 &&
          collectedCount >= 30,
        requirements: [
          {
            label: `累計プレイ ${Math.min(progress.totalPlays, 6)}/6`,
            met: progress.totalPlays >= 6,
          },
          {
            label: progress.clearedStage8 ? 'STAGE 8 クリア済' : 'STAGE 8 クリア',
            met: progress.clearedStage8,
          },
          {
            label: `Parts ${Math.min(collectedCount, 30)}/30`,
            met: collectedCount >= 30,
          },
        ],
      };
    case 'pierce':
      return {
        unlocked:
          progress.totalPlays >= 10 &&
          progress.enteredEndless &&
          collectedCount >= 65,
        requirements: [
          {
            label: `累計プレイ ${Math.min(progress.totalPlays, 10)}/10`,
            met: progress.totalPlays >= 10,
          },
          {
            label: progress.enteredEndless ? 'エンドレス挑戦済' : 'エンドレス挑戦',
            met: progress.enteredEndless,
          },
          {
            label: `Parts ${Math.min(collectedCount, 65)}/65`,
            met: collectedCount >= 65,
          },
        ],
      };
  }
}
