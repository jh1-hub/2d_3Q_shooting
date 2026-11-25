import {CourseHighScores, CourseId, CourseScoreEntry} from './types';

const COURSE_SCORES_KEY = 'arrow01_course_scores_v1';
const LEGACY_HIGH_SCORE_KEY = 'arrow01_high_score_v1';

const EMPTY_SCORES: CourseHighScores = {
  neon_city: [],
  foundry: [],
  cyber_vault: [],
  orbital: [],
};

export function readCourseScores(): CourseHighScores {
  const result: CourseHighScores = {
    neon_city: [],
    foundry: [],
    cyber_vault: [],
    orbital: [],
  };
  try {
    const raw = localStorage.getItem(COURSE_SCORES_KEY);
    if (!raw) return result;
    const parsed = JSON.parse(raw) as Partial<CourseHighScores>;
    for (const cid of Object.keys(EMPTY_SCORES) as CourseId[]) {
      const list = parsed?.[cid];
      if (Array.isArray(list)) {
        result[cid] = list
          .filter(
            (e): e is CourseScoreEntry =>
              typeof e?.score === 'number' &&
              typeof e?.patternId === 'string' &&
              typeof e?.stageNumber === 'number',
          )
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);
      }
    }
  } catch {
    return result;
  }
  return result;
}

export function getGlobalTopScore(scores: CourseHighScores): number {
  let max = 0;
  try {
    const raw = localStorage.getItem(LEGACY_HIGH_SCORE_KEY);
    if (raw) {
      max = Math.max(0, parseInt(raw, 10) || 0);
    }
  } catch {
    // ignore
  }
  for (const cid of Object.keys(scores) as CourseId[]) {
    for (const entry of scores[cid]) {
      if (entry.score > max) max = entry.score;
    }
  }
  return max;
}

export function recordCourseScore(
  courseId: CourseId,
  entry: CourseScoreEntry,
): CourseHighScores {
  const current = readCourseScores();
  if (entry.score <= 0) return current;

  const updatedList = [...current[courseId], entry]
    .sort((a, b) => b.score - a.score || b.timestamp - a.timestamp)
    .slice(0, 5);

  const next: CourseHighScores = {
    ...current,
    [courseId]: updatedList,
  };

  try {
    localStorage.setItem(COURSE_SCORES_KEY, JSON.stringify(next));
    const top = getGlobalTopScore(next);
    localStorage.setItem(LEGACY_HIGH_SCORE_KEY, String(top));
  } catch {
    // ignore
  }
  return next;
}
