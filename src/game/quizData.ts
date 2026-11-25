import {quizCategories} from '../../new_quizData';
import {Category, CourseId, Subcategory, TermData} from './types';

export interface QuizQuestion {
  id: string;
  category: string;
  question: string;
  choices: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
}

interface QuizTermEntry {
  category: Category;
  subcategory: Subcategory;
  term: TermData;
}

const COURSE_CATEGORY_IDS: Record<CourseId, string[]> = {
  neon_city: ['1'],
  foundry: ['2'],
  cyber_vault: ['3'],
  orbital: ['1', '2', '3'],
};

const ALL_ENTRIES: QuizTermEntry[] = quizCategories.flatMap((cat) =>
  cat.subcategories.flatMap((sub) =>
    sub.terms.map((term) => ({
      category: cat,
      subcategory: sub,
      term,
    })),
  ),
);

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function pickNextQuizQuestion(
  usedIds: Set<string>,
  courseId: CourseId = 'orbital',
): QuizQuestion {
  const allowedCatIds = COURSE_CATEGORY_IDS[courseId] ?? ['1', '2', '3'];
  const courseEntries = ALL_ENTRIES.filter((entry) =>
    allowedCatIds.includes(entry.category.id),
  );
  const effectiveEntries = courseEntries.length > 0 ? courseEntries : ALL_ENTRIES;

  let pool = effectiveEntries.filter(
    (entry) => !usedIds.has(String(entry.term.id)),
  );
  if (pool.length === 0) {
    for (const entry of effectiveEntries) {
      usedIds.delete(String(entry.term.id));
    }
    pool = effectiveEntries;
  }

  const picked = pool[Math.floor(Math.random() * pool.length)];
  usedIds.add(String(picked.term.id));

  const descriptions =
    picked.term.descriptions.length > 0
      ? picked.term.descriptions
      : [picked.term.name];
  const rawDesc = descriptions[Math.floor(Math.random() * descriptions.length)];
  const cleanDesc = rawDesc.trim().replace(/。+$/, '');

  // 同ジャンル（同一サブカテゴリ）の単語nameから不正解の選択肢を3つランダム抽出
  const sameSubCandidates = picked.subcategory.terms.filter(
    (t) => t.id !== picked.term.id && t.name !== picked.term.name,
  );
  const distractors: string[] = [];
  for (const cand of shuffleArray(sameSubCandidates)) {
    if (!distractors.includes(cand.name)) {
      distractors.push(cand.name);
      if (distractors.length >= 3) break;
    }
  }

  // 万一同一サブカテゴリの候補が3件未満だった場合は同大カテゴリから補完
  if (distractors.length < 3) {
    const sameCatCandidates = picked.category.subcategories.flatMap((s) =>
      s.terms.filter(
        (t) =>
          t.id !== picked.term.id &&
          t.name !== picked.term.name &&
          !distractors.includes(t.name),
      ),
    );
    for (const cand of shuffleArray(sameCatCandidates)) {
      if (!distractors.includes(cand.name)) {
        distractors.push(cand.name);
        if (distractors.length >= 3) break;
      }
    }
  }

  const shuffledChoices = shuffleArray([
    picked.term.name,
    ...distractors.slice(0, 3),
  ]) as [string, string, string, string];
  const correctIndex = shuffledChoices.indexOf(picked.term.name) as
    | 0
    | 1
    | 2
    | 3;

  return {
    id: `term-${picked.term.id}`,
    category: `${picked.category.title} · ${picked.subcategory.title}`,
    question: `「${cleanDesc}」は何を説明したもの？`,
    choices: shuffledChoices,
    correctIndex,
  };
}
