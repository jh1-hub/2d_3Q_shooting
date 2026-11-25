import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Layers,
  Lock,
  X,
} from 'lucide-react';
import {getTermIcon} from '../../termIcon';
import {ALL_QUIZ_CATEGORIES, TOTAL_QUIZ_TERM_COUNT} from '../game/quizData';
import {Category, Rarity, Subcategory, TermData} from '../game/types';

interface PartsCollectionViewProps {
  solvedTermCounts: Record<number, number>;
  onClose: () => void;
}

interface SelectedCardContext {
  category: Category;
  subcategory: Subcategory;
  term: TermData;
}

type UnlockFilter = 'all' | 'unlocked' | 'locked';

const RARITY_STYLES: Record<
  Rarity,
  {
    code: string;
    label: string;
    textColor: string;
    borderColor: string;
    accentBar: string;
    socketBg: string;
  }
> = {
  C: {
    code: 'C',
    label: 'COMMON',
    textColor: 'text-slate-300',
    borderColor: 'border-slate-700/90 hover:border-slate-500',
    accentBar: 'bg-slate-500',
    socketBg: 'bg-slate-950/90 border-slate-800',
  },
  R: {
    code: 'R',
    label: 'RARE',
    textColor: 'text-sky-300',
    borderColor: 'border-sky-500/45 hover:border-sky-400',
    accentBar: 'bg-sky-400',
    socketBg: 'bg-sky-950/35 border-sky-500/35',
  },
  SR: {
    code: 'SR',
    label: 'SUPER RARE',
    textColor: 'text-amber-300',
    borderColor: 'border-amber-400/55 hover:border-amber-300',
    accentBar: 'bg-amber-400',
    socketBg: 'bg-amber-950/30 border-amber-400/40',
  },
  UR: {
    code: 'UR',
    label: 'ULTRA RARE',
    textColor: 'text-rose-300',
    borderColor: 'border-rose-400/65 hover:border-rose-300',
    accentBar: 'bg-rose-400',
    socketBg: 'bg-rose-950/35 border-rose-400/45',
  },
};

function formatCardNumber(id: number): string {
  return `No.${String(id).padStart(3, '0')}`;
}

function getMaxCardPages(term: TermData): number {
  return Math.max(
    1,
    Math.min(3, Math.max(term.descriptions.length, term.flavorTexts.length)),
  );
}

export const PartsCollectionView: React.FC<PartsCollectionViewProps> = ({
  solvedTermCounts,
  onClose,
}) => {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [selectedSubcategoryId, setSelectedSubcategoryId] =
    useState<string>('all');
  const [unlockFilter, setUnlockFilter] = useState<UnlockFilter>('all');
  const [selectedCard, setSelectedCard] = useState<SelectedCardContext | null>(
    null,
  );
  const [cardPageIndex, setCardPageIndex] = useState(0);
  const [isFlipping, setIsFlipping] = useState(false);
  const flipTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (flipTimerRef.current !== null) {
        window.clearTimeout(flipTimerRef.current);
      }
    };
  }, []);

  const selectedCategory = useMemo(
    () =>
      selectedCategoryId === 'all'
        ? null
        : (ALL_QUIZ_CATEGORIES.find((c) => c.id === selectedCategoryId) ??
          null),
    [selectedCategoryId],
  );

  const handleSelectCategory = (catId: string) => {
    setSelectedCategoryId(catId);
    setSelectedSubcategoryId('all');
  };

  const getSolveCount = useCallback(
    (termId: number) => solvedTermCounts[termId] ?? 0,
    [solvedTermCounts],
  );

  const totalUnlocked = useMemo(
    () => Object.values(solvedTermCounts).filter((c) => c >= 1).length,
    [solvedTermCounts],
  );

  const unlockedCardsInView = useMemo(() => {
    const list: SelectedCardContext[] = [];
    for (const cat of ALL_QUIZ_CATEGORIES) {
      if (selectedCategoryId !== 'all' && cat.id !== selectedCategoryId) {
        continue;
      }
      for (const sub of cat.subcategories) {
        if (
          selectedCategoryId !== 'all' &&
          selectedSubcategoryId !== 'all' &&
          sub.id !== selectedSubcategoryId
        ) {
          continue;
        }
        for (const term of sub.terms) {
          if (getSolveCount(term.id) >= 1) {
            list.push({category: cat, subcategory: sub, term});
          }
        }
      }
    }
    return list;
  }, [getSolveCount, selectedCategoryId, selectedSubcategoryId]);

  const selectedIndex = useMemo(() => {
    if (!selectedCard) return -1;
    return unlockedCardsInView.findIndex(
      (item) => item.term.id === selectedCard.term.id,
    );
  }, [selectedCard, unlockedCardsInView]);

  const openCard = useCallback((ctx: SelectedCardContext) => {
    if (flipTimerRef.current !== null) {
      window.clearTimeout(flipTimerRef.current);
      flipTimerRef.current = null;
    }
    setIsFlipping(false);
    setCardPageIndex(0);
    setSelectedCard(ctx);
  }, []);

  const triggerCardFlip = useCallback(() => {
    if (!selectedCard || isFlipping) return;
    const solveCount = getSolveCount(selectedCard.term.id);
    const maxPages = getMaxCardPages(selectedCard.term);
    const unlockedPages = Math.max(1, Math.min(maxPages, solveCount));

    if (flipTimerRef.current !== null) {
      window.clearTimeout(flipTimerRef.current);
    }
    setIsFlipping(true);
    flipTimerRef.current = window.setTimeout(() => {
      if (unlockedPages > 1) {
        setCardPageIndex((prev) => (prev + 1) % unlockedPages);
      }
      setIsFlipping(false);
      flipTimerRef.current = null;
    }, 140);
  }, [getSolveCount, isFlipping, selectedCard]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedCard) {
          setSelectedCard(null);
        } else {
          onClose();
        }
      } else if (selectedCard && unlockedCardsInView.length > 1) {
        if (e.key === 'ArrowLeft' && selectedIndex > 0) {
          openCard(unlockedCardsInView[selectedIndex - 1]);
        } else if (
          e.key === 'ArrowRight' &&
          selectedIndex >= 0 &&
          selectedIndex < unlockedCardsInView.length - 1
        ) {
          openCard(unlockedCardsInView[selectedIndex + 1]);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, selectedCard, selectedIndex, unlockedCardsInView]);

  const visibleCategories = useMemo(() => {
    return ALL_QUIZ_CATEGORIES.filter(
      (cat) => selectedCategoryId === 'all' || cat.id === selectedCategoryId,
    );
  }, [selectedCategoryId]);

  const hasAnyVisibleTerms = useMemo(() => {
    return visibleCategories.some((cat) =>
      cat.subcategories.some((sub) => {
        if (
          selectedCategoryId !== 'all' &&
          selectedSubcategoryId !== 'all' &&
          sub.id !== selectedSubcategoryId
        ) {
          return false;
        }
        return sub.terms.some((t) => {
          const unlocked = getSolveCount(t.id) >= 1;
          if (unlockFilter === 'unlocked') return unlocked;
          if (unlockFilter === 'locked') return !unlocked;
          return true;
        });
      }),
    );
  }, [
    getSolveCount,
    selectedCategoryId,
    selectedSubcategoryId,
    unlockFilter,
    visibleCategories,
  ]);

  return (
    <div className="fixed inset-0 z-30 bg-[#050811] text-slate-100 flex flex-col">
      {/* Top Bar */}
      <header className="px-4 sm:px-6 py-3.5 border-b border-slate-800 bg-slate-950/90 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-mono font-semibold text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-cyan-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            戻る
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <Layers className="w-4 h-4 text-cyan-400 shrink-0" />
            <h2 className="font-display text-base sm:text-lg font-bold text-white tracking-tight truncate">
              Parts Collection
            </h2>
          </div>
        </div>

        <div className="text-xs font-mono tabular-nums text-slate-300 whitespace-nowrap shrink-0">
          <span className="text-cyan-300 font-bold">{totalUnlocked}</span>
          <span className="text-slate-500 mx-1">/</span>
          <span>{TOTAL_QUIZ_TERM_COUNT}</span>
        </div>
      </header>

      {/* Category, Subcategory & Filter Controls */}
      <div className="px-4 sm:px-6 py-3 border-b border-slate-800/80 bg-slate-950/55 flex flex-col gap-2.5 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 max-w-full">
            <button
              type="button"
              onClick={() => handleSelectCategory('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selectedCategoryId === 'all'
                  ? 'bg-cyan-400 text-slate-950 font-semibold'
                  : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
              }`}
            >
              すべて
            </button>
            {ALL_QUIZ_CATEGORIES.map((cat) => {
              const active = selectedCategoryId === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleSelectCategory(cat.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-cyan-400 text-slate-950 font-semibold'
                      : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
                  }`}
                >
                  {cat.id}. {cat.title}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg shrink-0">
            {(
              [
                {id: 'all', label: 'ALL'},
                {id: 'unlocked', label: 'OPEN'},
                {id: 'locked', label: 'LOCK'},
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setUnlockFilter(tab.id)}
                className={`px-2.5 py-1 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  unlockFilter === tab.id
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Subcategory Selector when a major category is chosen */}
        {selectedCategory && (
          <div className="flex items-center gap-1.5 overflow-x-auto pt-1 border-t border-slate-800/70 max-w-full">
            <button
              type="button"
              onClick={() => setSelectedSubcategoryId('all')}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selectedSubcategoryId === 'all'
                  ? 'bg-slate-700 text-white font-semibold'
                  : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800/80'
              }`}
            >
              全サブカテゴリ
            </button>
            {selectedCategory.subcategories.map((sub) => {
              const active = selectedSubcategoryId === sub.id;
              return (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setSelectedSubcategoryId(sub.id)}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-slate-700 text-white font-semibold'
                      : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800/80'
                  }`}
                >
                  {sub.title}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Category-Organized Card Grid */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
        <div className="max-w-6xl mx-auto flex flex-col gap-8">
          {visibleCategories.map((cat) => {
            const catTerms = cat.subcategories.flatMap((s) => s.terms);
            const catUnlocked = catTerms.filter(
              (t) => getSolveCount(t.id) >= 1,
            ).length;

            const filteredSubcategories = cat.subcategories
              .filter(
                (sub) =>
                  selectedCategoryId === 'all' ||
                  selectedSubcategoryId === 'all' ||
                  sub.id === selectedSubcategoryId,
              )
              .map((sub) => {
                const terms = sub.terms.filter((t) => {
                  const unlocked = getSolveCount(t.id) >= 1;
                  if (unlockFilter === 'unlocked') return unlocked;
                  if (unlockFilter === 'locked') return !unlocked;
                  return true;
                });
                return {sub, terms};
              })
              .filter((entry) => entry.terms.length > 0);

            if (filteredSubcategories.length === 0) {
              return null;
            }

            return (
              <section key={cat.id} className="flex flex-col gap-5">
                <div className="flex items-baseline justify-between gap-4 pb-2 border-b border-slate-800">
                  <h3 className="font-display text-base sm:text-lg font-bold text-white">
                    {cat.id}. {cat.title}
                  </h3>
                  <span className="text-xs font-mono tabular-nums text-slate-400 whitespace-nowrap shrink-0">
                    {catUnlocked} / {catTerms.length}
                  </span>
                </div>

                {filteredSubcategories.map(({sub, terms}) => {
                  const subUnlocked = sub.terms.filter(
                    (t) => getSolveCount(t.id) >= 1,
                  ).length;

                  return (
                    <div key={sub.id} className="flex flex-col gap-3">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <h4 className="font-semibold text-slate-300">
                          {sub.title}
                        </h4>
                        <span className="font-mono tabular-nums text-slate-500">
                          {subUnlocked} / {sub.terms.length}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {terms.map((term) => {
                          const solveCount = getSolveCount(term.id);
                          const unlocked = solveCount >= 1;
                          const maxPages = getMaxCardPages(term);
                          const unlockedPages = Math.min(maxPages, solveCount);
                          const rarityStyle = RARITY_STYLES[term.rarity];

                          if (!unlocked) {
                            return (
                              <div
                                key={term.id}
                                aria-label={formatCardNumber(term.id)}
                                className="rounded-lg bg-slate-950/80 border border-slate-800/85 p-3 flex flex-col gap-2.5 select-none opacity-70"
                              >
                                <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-600">
                                  <span>{formatCardNumber(term.id)}</span>
                                </div>
                                <div className="h-24 rounded-md bg-slate-900/65 border border-slate-800/80 flex items-center justify-center text-slate-600">
                                  <Lock className="w-5 h-5" />
                                </div>
                              </div>
                            );
                          }

                          return (
                            <button
                              key={term.id}
                              type="button"
                              onClick={() =>
                                openCard({
                                  category: cat,
                                  subcategory: sub,
                                  term,
                                })
                              }
                              className={`text-left rounded-lg bg-slate-900/90 border ${rarityStyle.borderColor} p-3 flex flex-col gap-2.5 transition-transform duration-150 hover:-translate-y-0.5 hover:bg-slate-900 focus-visible:outline-2 focus-visible:outline-cyan-400 cursor-pointer`}
                            >
                              <div className="flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums">
                                <span className="text-slate-400">
                                  {formatCardNumber(term.id)}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  {maxPages > 1 && (
                                    <span className="text-[10px] text-slate-500">
                                      {unlockedPages}/{maxPages}
                                    </span>
                                  )}
                                  <span
                                    className={`font-bold ${rarityStyle.textColor}`}
                                  >
                                    {rarityStyle.code}
                                  </span>
                                </div>
                              </div>

                              <div
                                className={`h-16 rounded-md border ${rarityStyle.socketBg} flex items-center justify-center ${rarityStyle.textColor}`}
                              >
                                {getTermIcon(term.name, 28)}
                              </div>

                              <div className="min-w-0">
                                <div className="text-xs sm:text-[13px] font-semibold text-slate-100 truncate">
                                  {term.name}
                                </div>
                                <div className="text-[11px] text-slate-400 truncate mt-0.5">
                                  {term.descriptions[0] ?? ''}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </section>
            );
          })}

          {!hasAnyVisibleTerms && (
            <div className="py-16 text-center text-sm text-slate-400 border border-dashed border-slate-800 rounded-xl">
              {unlockFilter === 'unlocked'
                ? '該当する解放済みカードがありません。'
                : '該当するカードがありません。'}
            </div>
          )}
        </div>
      </div>

      {/* Enlarged Parts Card Detail Modal with Lightweight 3D Rotation */}
      {selectedCard && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedCard(null)}
        >
          {(() => {
            const {category, subcategory, term} = selectedCard;
            const style = RARITY_STYLES[term.rarity];
            const solveCount = getSolveCount(term.id);
            const maxPages = getMaxCardPages(term);
            const unlockedPages = Math.max(1, Math.min(maxPages, solveCount));
            const safePage = Math.min(cardPageIndex, unlockedPages - 1);
            const currentDescription =
              term.descriptions[safePage] ?? term.descriptions[0] ?? '';
            const currentFlavor =
              term.flavorTexts[safePage] ?? term.flavorTexts[0] ?? '';

            return (
              <div
                key={term.id}
                role="dialog"
                aria-modal="true"
                aria-label={term.name}
                onClick={(e) => {
                  e.stopPropagation();
                  triggerCardFlip();
                }}
                data-flipping={isFlipping ? 'true' : 'false'}
                className={`parts-card-flip-in parts-card-flip-stage w-full max-w-md bg-slate-900 border ${style.borderColor.split(' ')[0]} rounded-xl shadow-2xl overflow-hidden flex flex-col cursor-pointer select-none`}
              >
                <div className={`h-1.5 w-full ${style.accentBar}`} />

                {/* Card Top Metadata & Close */}
                <div className="px-5 pt-4 pb-3 border-b border-slate-800 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono tabular-nums">
                      <span className={`font-bold ${style.textColor}`}>
                        {style.code} · {style.label}
                      </span>
                      <span className="text-slate-600">/</span>
                      <span className="text-slate-400">
                        {formatCardNumber(term.id)}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-1 truncate">
                      {category.title} · {subcategory.title}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCard(null);
                    }}
                    aria-label="閉じる"
                    className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors shrink-0 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Enlarged Icon, Title & Multi-Entry Progress Indicators */}
                <div className="px-5 pt-5 pb-4 flex flex-col items-center text-center gap-3">
                  <div
                    className={`w-28 h-28 rounded-xl border ${style.socketBg} flex items-center justify-center ${style.textColor} shadow-inner`}
                  >
                    {getTermIcon(term.name, 56)}
                  </div>
                  <h3 className="font-display text-xl sm:text-2xl font-bold text-white tracking-tight">
                    {term.name}
                  </h3>
                  {maxPages > 1 && (
                    <div
                      className="flex items-center gap-2 font-mono text-[11px] tabular-nums"
                      aria-label={`${safePage + 1} / ${unlockedPages}`}
                    >
                      {Array.from({length: maxPages}).map((_, idx) => {
                        const pageUnlocked = idx < unlockedPages;
                        const active = idx === safePage;
                        if (!pageUnlocked) {
                          return (
                            <span
                              key={idx}
                              className="inline-flex items-center text-slate-600"
                            >
                              <Lock className="w-3 h-3" />
                            </span>
                          );
                        }
                        return (
                          <span
                            key={idx}
                            className={`w-2 h-2 rounded-full transition-colors ${
                              active ? 'bg-cyan-400' : 'bg-slate-600'
                            }`}
                          />
                        );
                      })}
                      <span className="text-slate-500 ml-1">
                        {safePage + 1}/{maxPages}
                      </span>
                    </div>
                  )}
                </div>

                {/* Primary Definition */}
                <div className="px-5 pb-4">
                  <p className="text-sm sm:text-[15px] text-slate-100 leading-relaxed">
                    {currentDescription}
                  </p>
                </div>

                {/* Subordinate Centered Flavor Text */}
                {currentFlavor && (
                  <div className="mx-5 mb-5 pt-3.5 border-t border-slate-800/90">
                    <p className="text-xs text-slate-400 italic leading-relaxed text-center">
                      {currentFlavor}
                    </p>
                  </div>
                )}

                {/* Prev / Next Navigation Footer */}
                {unlockedCardsInView.length > 1 && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="px-5 py-3 bg-slate-950/60 border-t border-slate-800 flex items-center justify-between text-xs font-mono cursor-default"
                  >
                    <button
                      type="button"
                      disabled={selectedIndex <= 0}
                      onClick={() => {
                        if (selectedIndex > 0) {
                          openCard(unlockedCardsInView[selectedIndex - 1]);
                        }
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-35 disabled:cursor-default text-slate-200 transition-colors cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      PREV
                    </button>

                    <span className="text-slate-500 tabular-nums">
                      {selectedIndex + 1} / {unlockedCardsInView.length}
                    </span>

                    <button
                      type="button"
                      disabled={selectedIndex >= unlockedCardsInView.length - 1}
                      onClick={() => {
                        if (selectedIndex < unlockedCardsInView.length - 1) {
                          openCard(unlockedCardsInView[selectedIndex + 1]);
                        }
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-35 disabled:cursor-default text-slate-200 transition-colors cursor-pointer"
                    >
                      NEXT
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};
