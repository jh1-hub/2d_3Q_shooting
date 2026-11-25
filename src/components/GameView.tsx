import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Layers,
  Lock,
  Pause,
  Play,
  RotateCcw,
  Settings,
  Shield,
  Smartphone,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {COURSES, UPGRADE_PATTERNS, WEAPONS} from '../game/data';
import {GameCanvas, GameEngineHandle} from '../game/GameCanvas';
import {
  getPatternUnlockStatus,
  isPatternUnlocked,
  PlayerProgress,
  readProgress,
  recordEndlessEntry,
  recordPlayRun,
  recordStage8Clear,
} from '../game/progress';
import {TOTAL_QUIZ_TERM_COUNT} from '../game/quizData';
import {
  getGlobalTopScore,
  readCourseScores,
  recordCourseScore,
} from '../game/scores';
import {BgmLoadState, bgmManager} from '../game/bgm';
import {synthAudio} from '../game/sound';
import {usePWAInstall} from '../hooks/usePWAInstall';
import {
  CourseHighScores,
  CourseId,
  DifficultyMode,
  GameSettings,
  GameState,
  HudSnapshot,
  UpgradePatternId,
  WeaponId,
} from '../game/types';
import {PartsCollectionView} from './PartsCollectionView';
import {
  CoursePreviewSvg,
  PatternMiniDiagram,
  UpgradeStepIcon,
} from './WeaponVisuals';

const CURSOR_IDLE_HIDE_MS = 2000;

function renderPhraseWithNaturalBreaks(phrase: string, keyPrefix: string) {
  const chunks = phrase.split(/(?<=・)|(?=（|装備|増設|配備|\sLv)/);
  return chunks.map((chunk, idx) => (
    <React.Fragment key={`${keyPrefix}-${idx}`}>
      {idx > 0 && <wbr />}
      {chunk}
    </React.Fragment>
  ));
}

function renderUpgradeBannerContent(bannerText: string) {
  const colonIdx = bannerText.indexOf(': ');
  const prefix = colonIdx >= 0 ? bannerText.slice(0, colonIdx + 1) : '';
  const body = colonIdx >= 0 ? bannerText.slice(colonIdx + 2) : bannerText;
  const clauses = body.split(' & ');

  return (
    <div className="font-mono text-xs sm:text-[13px] font-semibold text-cyan-300 leading-relaxed break-keep">
      {prefix && (
        <>
          <span className="whitespace-nowrap text-cyan-200">{prefix}</span>{' '}
        </>
      )}
      {clauses.map((clause, idx) => (
        <React.Fragment key={idx}>
          {idx > 0 && (
            <>
              {' '}
              <span className="whitespace-nowrap">&amp;</span>{' '}
            </>
          )}
          <span className="inline-block whitespace-normal break-keep">
            {renderPhraseWithNaturalBreaks(clause, `c${idx}`)}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

export const GameView: React.FC = () => {
  const engineRef = useRef<GameEngineHandle | null>(null);
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [cursorHidden, setCursorHidden] = useState(false);
  const [progress, setProgress] = useState<PlayerProgress>(readProgress);
  const [selectedPattern, setSelectedPattern] =
    useState<UpgradePatternId>('missile_guard');
  const [selectedCourse, setSelectedCourse] = useState<CourseId>('neon_city');
  const [selectedDifficulty, setSelectedDifficulty] =
    useState<DifficultyMode>('normal');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [highScoresOpen, setHighScoresOpen] = useState(false);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [highScoreCourseTab, setHighScoreCourseTab] =
    useState<CourseId>('neon_city');
  const tabStripRef = useRef<HTMLDivElement | null>(null);
  const [tabScrollState, setTabScrollState] = useState({
    overflow: false,
    canLeft: false,
    canRight: false,
  });
  const [courseScores, setCourseScores] = useState<CourseHighScores>(
    readCourseScores,
  );
  const [highScore, setHighScore] = useState<number>(() =>
    getGlobalTopScore(readCourseScores()),
  );

  const updateTabScrollState = useCallback(() => {
    const el = tabStripRef.current;
    if (!el) return;
    const overflow = el.scrollWidth > el.clientWidth + 2;
    setTabScrollState({
      overflow,
      canLeft: el.scrollLeft > 2,
      canRight: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
    });
  }, []);

  useEffect(() => {
    if (!highScoresOpen) return;
    const raf = requestAnimationFrame(updateTabScrollState);
    window.addEventListener('resize', updateTabScrollState);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', updateTabScrollState);
    };
  }, [highScoresOpen, updateTabScrollState]);

  const scrollTabsBy = (delta: number) => {
    const el = tabStripRef.current;
    if (!el) return;
    el.scrollBy({left: delta, behavior: 'smooth'});
  };

  const SETTINGS_STORAGE_KEY = 'arrow01_settings_v1';

  const [settings, setSettings] = useState<GameSettings>(() => {
    const defaults: GameSettings = {
      autoShot: true,
      bgmEnabled: true,
      sfxEnabled: true,
      bgmVolume: 0.7,
      sfxVolume: 0.85,
      touchSensitivity: 1.2,
      screenShake: true,
    };
    if (typeof window === 'undefined') return defaults;
    try {
      const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw) as Partial<GameSettings> & {
        soundEnabled?: boolean;
      };
      const legacySound =
        typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : true;
      return {
        autoShot:
          typeof parsed.autoShot === 'boolean'
            ? parsed.autoShot
            : defaults.autoShot,
        bgmEnabled:
          typeof parsed.bgmEnabled === 'boolean'
            ? parsed.bgmEnabled
            : legacySound,
        sfxEnabled:
          typeof parsed.sfxEnabled === 'boolean'
            ? parsed.sfxEnabled
            : legacySound,
        bgmVolume:
          typeof parsed.bgmVolume === 'number'
            ? Math.max(0, Math.min(1, parsed.bgmVolume))
            : defaults.bgmVolume,
        sfxVolume:
          typeof parsed.sfxVolume === 'number'
            ? Math.max(0, Math.min(1, parsed.sfxVolume))
            : defaults.sfxVolume,
        touchSensitivity:
          typeof parsed.touchSensitivity === 'number'
            ? Math.max(0.7, Math.min(2.0, parsed.touchSensitivity))
            : defaults.touchSensitivity,
        screenShake:
          typeof parsed.screenShake === 'boolean'
            ? parsed.screenShake
            : defaults.screenShake,
      };
    } catch {
      return defaults;
    }
  });

  const [bgmLoad, setBgmLoad] = useState<BgmLoadState>(() =>
    bgmManager.getLoadState(),
  );
  const [expandedRuleIds, setExpandedRuleIds] = useState<
    Record<string, boolean>
  >({});
  const [debugPanelOpen, setDebugPanelOpen] = useState(false);
  const [debugStartStage, setDebugStartStage] = useState(1);
  const [debugWeaponLevel, setDebugWeaponLevel] = useState(1);
  const preMuteAudioRef = useRef<{bgm: boolean; sfx: boolean}>({
    bgm: true,
    sfx: true,
  });
  const {isInstallable, isInstalled, isIOS, install} = usePWAInstall();

  const [externalQuizRoom, setExternalQuizRoom] = useState<'none' | 'compact' | 'roomy'>(() => {
    if (typeof window === 'undefined') return 'none';
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gameH = Math.min(vh, (vw * 9) / 16);
    const spare = vh - gameH;
    return spare >= 350 ? 'roomy' : spare >= 220 ? 'compact' : 'none';
  });

  useEffect(() => {
    const checkRoom = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const gameH = Math.min(vh, (vw * 9) / 16);
      const spare = vh - gameH;
      setExternalQuizRoom(spare >= 350 ? 'roomy' : spare >= 220 ? 'compact' : 'none');
    };
    checkRoom();
    window.addEventListener('resize', checkRoom);
    window.addEventListener('orientationchange', checkRoom);
    return () => {
      window.removeEventListener('resize', checkRoom);
      window.removeEventListener('orientationchange', checkRoom);
    };
  }, []);

  const [hud, setHud] = useState<HudSnapshot>({
    shield: 3,
    maxShield: 3,
    score: 0,
    highScore: getGlobalTopScore(readCourseScores()),
    level: 1,
    isMaxLevel: false,
    xp: 0,
    xpToNext: 40,
    shieldScoreProgress: 0,
    shieldScoreRequired: 50000,
    hiddenEvolution: false,
    postMaxShieldMilestones: 0,
    combo: 0,
    comboTimerRatio: 0,
    courseId: 'neon_city',
    difficulty: 'normal',
    stageNumber: 1,
    stageHalf: 1,
    itemsEnabled: true,
    isEndless: false,
    endlessLoop: 0,
    stageProgress: 0,
    weapons: {normal: 1},
    patternId: 'missile_guard',
    nextUpgradeLabel: UPGRADE_PATTERNS.missile_guard.steps[0].label,
    lastUpgradeBanner: null,
    bossActive: false,
    bossName: '',
    bossHp: 0,
    bossMaxHp: 1,
    bossPhase: 1,
    warningText: null,
    enemiesDefeated: 0,
    elapsedTime: 0,
    quizActive: false,
    quizMode: 'none',
    bossQuizNumber: 0,
    quizTimeRemaining: 30,
    quizFeedbackRemaining: 0,
    quizResult: 'none',
    quizQuestionCategory: '',
    quizQuestionText: '',
    quizCorrectLabel: '',
    quizCorrectChoiceText: '',
    quizAnsweredCorrectlyCount: 0,
    quizTotalAnsweredCount: 0,
  });

  useEffect(() => {
    const unsubscribe = bgmManager.subscribeLoadState(setBgmLoad);
    void bgmManager.preloadAll();
    return unsubscribe;
  }, []);

  useEffect(() => {
    bgmManager.setEnabled(settings.bgmEnabled);
    bgmManager.setVolume(settings.bgmVolume);
    synthAudio.setEnabled(settings.sfxEnabled);
    synthAudio.setVolume(settings.sfxVolume);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(
          'arrow01_settings_v1',
          JSON.stringify(settings),
        );
      } catch {
        // Ignore storage quota errors
      }
    }
  }, [settings]);

  useEffect(() => {
    if (gameState === 'TITLE_MENU') {
      bgmManager.setMode('top');
    } else if (gameState === 'PLAYING') {
      bgmManager.setMode('game');
      bgmManager.setPaused(false);
    } else if (gameState === 'PAUSED' || gameState === 'STAGE_CLEAR') {
      bgmManager.setMode('game');
      bgmManager.setPaused(true);
    } else if (gameState === 'GAME_OVER') {
      bgmManager.setMode('none');
    }
  }, [gameState]);

  useEffect(() => {
    if (gameState === 'STAGE_CLEAR') {
      setProgress(recordStage8Clear());
    } else if (gameState === 'TITLE_MENU') {
      setProgress(readProgress());
    }
  }, [gameState]);

  const handleTermSolved = useCallback(() => {
    setProgress(readProgress());
  }, []);

  useEffect(() => {
    let timerId: number | null = null;

    const scheduleHide = () => {
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
      timerId = window.setTimeout(() => {
        setCursorHidden(true);
      }, CURSOR_IDLE_HIDE_MS);
    };

    const handleMouseActivity = () => {
      setCursorHidden(false);
      scheduleHide();
    };

    scheduleHide();
    window.addEventListener('mousemove', handleMouseActivity, {passive: true});
    window.addEventListener('mousedown', handleMouseActivity, {passive: true});
    window.addEventListener('wheel', handleMouseActivity, {passive: true});

    return () => {
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
      window.removeEventListener('mousemove', handleMouseActivity);
      window.removeEventListener('mousedown', handleMouseActivity);
      window.removeEventListener('wheel', handleMouseActivity);
    };
  }, []);

  const handleRunEnd = useCallback(
    (result: {
      courseId: CourseId;
      score: number;
      patternId: UpgradePatternId;
      stageNumber: number;
      endlessLoop: number;
      difficulty: DifficultyMode;
    }) => {
      const updated = recordCourseScore(result.courseId, {
        score: result.score,
        patternId: result.patternId,
        stageNumber: result.stageNumber,
        endlessLoop: result.endlessLoop,
        difficulty: result.difficulty,
        timestamp: Date.now(),
      });
      setCourseScores(updated);
      setHighScore(getGlobalTopScore(updated));
      setProgress(recordPlayRun());
    },
    [],
  );

  const isBgmReady = bgmLoad.status === 'ready';
  const anyAudioEnabled = settings.bgmEnabled || settings.sfxEnabled;

  const startSelectedRun = useCallback(() => {
    if (bgmManager.getLoadState().status !== 'ready') return;
    const effectivePattern = isPatternUnlocked(selectedPattern, progress)
      ? selectedPattern
      : 'missile_guard';
    if (effectivePattern !== selectedPattern) {
      setSelectedPattern(effectivePattern);
    }
    bgmManager.restartGameTrack();
    engineRef.current?.startNewRun(
      effectivePattern,
      selectedCourse,
      selectedDifficulty,
    );
  }, [progress, selectedCourse, selectedDifficulty, selectedPattern]);

  const startDebugRun = useCallback(() => {
    if (bgmManager.getLoadState().status !== 'ready') return;
    const effectivePattern = isPatternUnlocked(selectedPattern, progress)
      ? selectedPattern
      : 'missile_guard';
    if (effectivePattern !== selectedPattern) {
      setSelectedPattern(effectivePattern);
    }
    setSettingsOpen(false);
    bgmManager.restartGameTrack();
    engineRef.current?.startNewRun(
      effectivePattern,
      selectedCourse,
      selectedDifficulty,
      {
        startStage: debugStartStage,
        weaponPowerLevel: debugWeaponLevel,
      },
    );
  }, [
    debugStartStage,
    debugWeaponLevel,
    progress,
    selectedCourse,
    selectedDifficulty,
    selectedPattern,
  ]);

  const toggleBgm = () => {
    setSettings((prev) => ({...prev, bgmEnabled: !prev.bgmEnabled}));
  };

  const toggleSfx = () => {
    setSettings((prev) => ({...prev, sfxEnabled: !prev.sfxEnabled}));
  };

  const toggleQuickMute = () => {
    setSettings((prev) => {
      if (prev.bgmEnabled || prev.sfxEnabled) {
        preMuteAudioRef.current = {
          bgm: prev.bgmEnabled,
          sfx: prev.sfxEnabled,
        };
        return {...prev, bgmEnabled: false, sfxEnabled: false};
      }
      const restoreBgm = preMuteAudioRef.current.bgm;
      const restoreSfx = preMuteAudioRef.current.sfx;
      return {
        ...prev,
        bgmEnabled: restoreBgm || !restoreSfx ? restoreBgm : true,
        sfxEnabled: restoreSfx || !restoreBgm ? restoreSfx : true,
      };
    });
  };

  const toggleAutoShot = () => {
    setSettings((prev) => ({...prev, autoShot: !prev.autoShot}));
  };

  const toggleRuleItem = (id: string) => {
    setExpandedRuleIds((prev) => ({...prev, [id]: !prev[id]}));
  };

  const handleOpenSettings = () => {
    if (gameState === 'PLAYING') {
      setGameState('PAUSED');
    }
    setSettingsOpen(true);
  };

  const weaponEntries = Object.entries(hud.weapons).filter(
    ([, lv]) => (lv ?? 0) > 0,
  ) as [WeaponId, number][];

  const xpPercent = hud.isMaxLevel
    ? Math.min(
        100,
        Math.round(
          (hud.shieldScoreProgress / Math.max(1, hud.shieldScoreRequired)) *
            100,
        ),
      )
    : Math.min(
        100,
        Math.round((hud.xp / Math.max(1, hud.xpToNext)) * 100),
      );

  const useExternalQuizLayout =
    externalQuizRoom !== 'none' && gameState !== 'TITLE_MENU';

  const quizTimerColor =
    hud.quizTimeRemaining <= 5
      ? 'text-rose-400'
      : hud.quizTimeRemaining <= 10
        ? 'text-amber-300'
        : 'text-emerald-300';
  const quizBarColor =
    hud.quizTimeRemaining <= 5
      ? 'bg-rose-500'
      : hud.quizTimeRemaining <= 10
        ? 'bg-amber-400'
        : 'bg-emerald-400';

  const hudTopContent = (
    <div className="w-full flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3 md:gap-4">
        {/* Left: HP, Shield & Weapons */}
        <div className="flex flex-col gap-1.5 min-w-0">
          <div className="flex items-center gap-3">
            {/* Shield Count Slots (0 = Next hit fatal) */}
            <div className="w-36 sm:w-44">
              <div className="flex items-center justify-between text-xs font-mono tabular-nums mb-1">
                <span
                  className={`flex items-center gap-1 font-semibold ${
                    hud.shield === 0 ? 'text-rose-400' : 'text-sky-300'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5" />
                  SHIELD {hud.shield}/{hud.maxShield}
                </span>
                {hud.shield === 0 && (
                  <span className="text-[10px] font-bold text-rose-400">
                    DANGER
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {Array.from({length: Math.max(1, hud.maxShield)}).map((_, idx) => {
                  const active = idx < hud.shield;
                  return (
                    <div
                      key={idx}
                      className={`h-2.5 flex-1 rounded-sm border transition-colors duration-150 ${
                        active
                          ? hud.shield === 1 && hud.maxShield > 1
                            ? 'bg-amber-400 border-amber-300'
                            : 'bg-cyan-400 border-cyan-300'
                          : 'bg-slate-900/90 border-rose-500/45'
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Equipped Weapons Strip */}
            <div className="hidden md:flex items-center gap-2 text-[11px] font-mono text-slate-300 bg-slate-950/75 border border-slate-800 px-2.5 py-1 rounded-md">
              {weaponEntries.map(([wId, lv], idx) => (
                <React.Fragment key={wId}>
                  {idx > 0 && <span className="text-slate-600">/</span>}
                  <span style={{color: WEAPONS[wId].color}}>
                    {WEAPONS[wId].shortLabel} Lv.{lv}
                  </span>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>

        {/* Center: Stage / Endless & Auto-Upgrade Meter */}
        <div className="hidden sm:flex flex-col items-center w-64 md:w-72">
          <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-slate-200 mb-1">
            {hud.difficulty === 'hard' && (
              <span className="font-bold text-rose-400">HARD</span>
            )}
            {hud.isEndless ? (
              <span className="font-semibold text-rose-300">
                ENDLESS · L{hud.endlessLoop} · {hud.stageHalf === 1 ? '前半' : '後半'}
              </span>
            ) : (
              <span className="font-semibold">
                STAGE {hud.stageNumber} · {hud.stageHalf === 1 ? '前半' : '後半'}
              </span>
            )}
            {!hud.quizActive && (
              <span
                className={
                  hud.itemsEnabled ? 'text-emerald-400' : 'text-rose-400'
                }
              >
                · {hud.itemsEnabled ? 'ITEM ON' : 'NO ITEM'}
              </span>
            )}
          </div>
          <div className="w-full flex items-center gap-2">
            <span
              className={`text-[11px] font-mono font-semibold tabular-nums whitespace-nowrap ${
                hud.hiddenEvolution
                  ? 'text-amber-300'
                  : hud.isMaxLevel
                    ? 'text-sky-300'
                    : 'text-emerald-300'
              }`}
            >
              {hud.hiddenEvolution
                ? 'LV MAX ★'
                : hud.isMaxLevel
                  ? 'LV MAX'
                  : `LV ${hud.level}`}
            </span>
            <div className="flex-1 h-2 bg-slate-900/90 border border-slate-700/80 rounded-sm overflow-hidden">
              <div
                className={`h-full transition-[width] duration-150 ${
                  hud.hiddenEvolution
                    ? 'bg-amber-400'
                    : hud.isMaxLevel
                      ? 'bg-sky-400'
                      : 'bg-emerald-400'
                }`}
                style={{width: `${xpPercent}%`}}
              />
            </div>
          </div>
          <div className="text-[10px] font-mono text-slate-400 mt-0.5 truncate max-w-full">
            NEXT: {hud.nextUpgradeLabel}
          </div>
        </div>

        {/* Right: Score, Combo & Quick Action Icons */}
        <div className="flex items-start gap-2.5 sm:gap-3 shrink-0">
          <div className="text-right font-mono tabular-nums">
            <div className="text-sm sm:text-base font-bold text-white leading-tight flex items-center justify-end gap-1.5">
              {hud.difficulty === 'hard' && (
                <span className="text-[10px] font-bold text-rose-400">
                  x1.5
                </span>
              )}
              <span>{hud.score.toLocaleString()}</span>
            </div>
            <div className="text-[11px] text-slate-300">
              HI {hud.highScore.toLocaleString()}
              {hud.combo > 1 && (
                <span className="ml-2 text-amber-400 font-semibold">
                  {hud.combo} COMBO (x
                  {(1 + Math.min(hud.combo * 0.1, 4.0)).toFixed(1)})
                </span>
              )}
            </div>
          </div>

          <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={toggleQuickMute}
              aria-label={anyAudioEnabled ? 'ミュート' : 'サウンド有効化'}
              className="p-2 rounded-lg bg-slate-900/85 border border-slate-700/80 text-slate-200 hover:border-cyan-400 transition-colors cursor-pointer"
            >
              {anyAudioEnabled ? (
                <Volume2 className="w-4 h-4" />
              ) : (
                <VolumeX className="w-4 h-4 text-slate-500" />
              )}
            </button>

            {gameState !== 'GAME_OVER' && (
              <button
                type="button"
                onClick={() =>
                  setGameState((prev) =>
                    prev === 'PAUSED' ? 'PLAYING' : 'PAUSED',
                  )
                }
                aria-label={gameState === 'PAUSED' ? '再開' : '一時停止'}
                className="p-2 rounded-lg bg-slate-900/85 border border-slate-700/80 text-slate-200 hover:border-cyan-400 transition-colors cursor-pointer"
              >
                {gameState === 'PAUSED' ? (
                  <Play className="w-4 h-4 text-cyan-400" />
                ) : (
                  <Pause className="w-4 h-4" />
                )}
              </button>
            )}

            <button
              type="button"
              onClick={handleOpenSettings}
              aria-label="設定を開く"
              className="p-2 rounded-lg bg-slate-900/85 border border-slate-700/80 text-slate-100 hover:border-cyan-400 transition-colors cursor-pointer"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Boss Health Bar */}
      {hud.bossActive && (
        <div className="w-full max-w-xl mx-auto mt-1">
          <div className="flex items-center justify-between text-xs font-mono text-rose-300 mb-1">
            <span className="font-semibold">{hud.bossName}</span>
            <span className="tabular-nums">PHASE {hud.bossPhase} / 3</span>
          </div>
          <div className="h-2.5 bg-slate-950/90 border border-rose-500/60 rounded-sm overflow-hidden">
            <div
              className="h-full bg-rose-500 transition-[width] duration-100"
              style={{
                width: `${Math.max(0, Math.min(100, (hud.bossHp / Math.max(1, hud.bossMaxHp)) * 100))}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div
      className={`relative w-screen h-[100dvh] bg-[#050811] overflow-hidden flex ${
        useExternalQuizLayout
          ? 'flex-col items-center justify-between'
          : 'items-center justify-center'
      } ${cursorHidden ? 'hide-cursor' : ''}`}
    >
      {/* External Top HUD & Question Panel when screen has vertical spare room (e.g. mobile portrait) */}
      {useExternalQuizLayout && (
        <div
          className={`w-full px-3 pt-2.5 pb-1.5 flex flex-col items-center gap-2 shrink-0 z-10 ${
            externalQuizRoom === 'roomy' ? 'min-h-[176px]' : ''
          }`}
        >
          {hudTopContent}

          {hud.quizActive && hud.quizQuestionText && (
            <div className="w-full max-w-2xl bg-slate-900/90 border border-cyan-500/45 rounded-xl px-4 py-3 shadow-lg">
              <div className="flex items-center justify-between gap-2 text-xs font-mono">
                <div className="text-cyan-300 font-semibold truncate">
                  {hud.quizMode === 'boss_shield'
                    ? `BOSS SHIELD QUIZ #${hud.bossQuizNumber}`
                    : hud.isEndless
                      ? `ENDLESS L${hud.endlessLoop} · ${hud.stageHalf === 1 ? '前半' : '後半'}`
                      : `STAGE ${hud.stageNumber} · ${hud.stageHalf === 1 ? '前半' : '後半'}`}
                  <span className="text-slate-500 mx-1.5">·</span>
                  <span className="text-slate-300">{hud.quizQuestionCategory}</span>
                </div>
                {hud.quizMode === 'boss_shield' ? (
                  <span
                    className={`font-bold tabular-nums whitespace-nowrap ${
                      hud.quizResult === 'correct'
                        ? 'text-emerald-300'
                        : hud.quizResult === 'wrong' || hud.quizResult === 'timeout'
                          ? 'text-rose-400'
                          : hud.quizTimeRemaining <= 8
                            ? 'text-rose-400'
                            : hud.quizTimeRemaining <= 18
                              ? 'text-amber-300'
                              : 'text-emerald-300'
                    }`}
                  >
                    {hud.quizResult === 'none'
                      ? `NORMAL SHOT で破壊 · TIME ${Math.ceil(hud.quizTimeRemaining).toString().padStart(2, '0')}s`
                      : hud.quizResult === 'correct'
                        ? 'SHIELD SHATTERED!'
                        : hud.quizResult === 'timeout'
                          ? `TIME UP · シールド維持 (${Math.max(1, Math.ceil(hud.quizFeedbackRemaining))}s)`
                          : `MISS · シールド維持 (${Math.max(1, Math.ceil(hud.quizFeedbackRemaining))}s)`}
                  </span>
                ) : (
                  <span className={`font-bold tabular-nums whitespace-nowrap ${quizTimerColor}`}>
                    {hud.quizResult === 'none'
                      ? `TIME ${Math.ceil(hud.quizTimeRemaining).toString().padStart(2, '0')}s`
                      : hud.quizResult === 'correct'
                        ? `正解 · 移動まで ${Math.max(1, Math.ceil(hud.quizFeedbackRemaining))}s`
                        : `移動まで ${Math.max(1, Math.ceil(hud.quizFeedbackRemaining))}s`}
                  </span>
                )}
              </div>

              <div className="w-full h-1 bg-slate-800 rounded-xs overflow-hidden mt-1.5">
                <div
                  className={`h-full transition-[width] duration-100 ${
                    hud.quizMode === 'boss_shield'
                      ? hud.quizTimeRemaining <= 8
                        ? 'bg-rose-500'
                        : hud.quizTimeRemaining <= 18
                          ? 'bg-amber-400'
                          : 'bg-emerald-400'
                      : quizBarColor
                  }`}
                  style={{
                    width: `${Math.max(
                      0,
                      Math.min(
                        100,
                        (hud.quizTimeRemaining /
                          (hud.quizMode === 'boss_shield' ? 60 : 30)) *
                          100,
                      ),
                    )}%`,
                  }}
                />
              </div>

              <p className="text-sm sm:text-base font-bold text-slate-50 leading-snug mt-2">
                {hud.quizQuestionText}
              </p>

              {hud.quizResult !== 'none' && (
                <div
                  className={`mt-2 text-xs sm:text-sm font-semibold ${
                    hud.quizResult === 'correct' ? 'text-emerald-300' : 'text-rose-300'
                  }`}
                >
                  {hud.quizMode === 'boss_shield'
                    ? hud.quizResult === 'correct'
                      ? '正解！ 横断シールドを破壊 — ボス本体へダメージ可能＆強化解除！'
                      : hud.quizResult === 'timeout'
                        ? `TIME UP！ 正解は ${hud.quizCorrectLabel}：${hud.quizCorrectChoiceText}（シールド破壊失敗：攻撃無効・一定時間耐えて再挑戦）`
                        : `不正解… 正解は ${hud.quizCorrectLabel}：${hud.quizCorrectChoiceText}（シールド破壊失敗：攻撃無効・一定時間耐えて再挑戦）`
                    : hud.quizResult === 'correct'
                      ? '正解！ アイテム出現あり — エリアへブースト突入！'
                      : hud.quizResult === 'timeout'
                        ? `TIME UP！ 正解は ${hud.quizCorrectLabel}：${hud.quizCorrectChoiceText}（EXP -20% / 敵弾貫通 / アイテムなし）`
                        : `不正解… 正解は ${hud.quizCorrectLabel}：${hud.quizCorrectChoiceText}（EXP -20% / 敵弾貫通 / アイテムなし）`}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Maximized Play Viewport */}
      <div
        className={
          useExternalQuizLayout
            ? 'relative w-full max-w-[calc(100dvh*16/9)] aspect-video flex items-center justify-center shrink-0'
            : 'relative w-full h-full flex items-center justify-center'
        }
      >
        <GameCanvas
          gameState={gameState}
          settings={settings}
          highScore={highScore}
          previewCourseId={selectedCourse}
          externalQuizQuestion={useExternalQuizLayout}
          onStateChange={setGameState}
          onHudUpdate={setHud}
          onHighScoreUpdate={setHighScore}
          onRunEnd={handleRunEnd}
          onTermSolved={handleTermSolved}
          engineRef={engineRef}
        />

        {/* Boss Warning Banner */}
        {hud.warningText && gameState === 'PLAYING' && (
          <div className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center z-10">
            <div className="bg-rose-950/92 border-y-2 border-rose-500 px-10 py-3.5 text-center shadow-[0_0_32px_rgba(244,63,94,0.45)]">
              <div className="font-mono text-[11px] font-semibold tracking-[0.25em] text-rose-300">
                BOSS APPROACHING
              </div>
              <div className="font-display text-3xl md:text-4xl font-black tracking-widest text-rose-400 mt-0.5 animate-pulse">
                WARNING!!
              </div>
              <div className="font-mono text-sm md:text-base font-bold text-white mt-0.5 tracking-wider">
                {hud.warningText}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Top-Right Quick Controls on Title Menu */}
      {gameState === 'TITLE_MENU' && (
        <div className="absolute top-3 right-3 md:top-4 md:right-4 z-20 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCollectionOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900/85 border border-slate-700/80 text-slate-100 hover:border-cyan-400 transition-colors text-xs font-mono font-semibold whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>Parts Collection</span>
            <span className="text-slate-400 tabular-nums">
              {progress.solvedTermIds.length}/{TOTAL_QUIZ_TERM_COUNT}
            </span>
          </button>

          <button
            type="button"
            onClick={toggleQuickMute}
            aria-label={anyAudioEnabled ? 'ミュート' : 'サウンド有効化'}
            className="p-2.5 rounded-lg bg-slate-900/85 border border-slate-700/80 text-slate-200 hover:border-cyan-400 transition-colors cursor-pointer"
          >
            {anyAudioEnabled ? (
              <Volume2 className="w-4 h-4" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-500" />
            )}
          </button>

          <button
            type="button"
            onClick={handleOpenSettings}
            aria-label="設定を開く"
            className="p-2.5 rounded-lg bg-slate-900/85 border border-slate-700/80 text-slate-100 hover:border-cyan-400 transition-colors cursor-pointer"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Overlay Gameplay HUD (when screen has no external vertical margin) */}
      {gameState !== 'TITLE_MENU' && !useExternalQuizLayout && (
        <div className="pointer-events-none absolute inset-x-0 top-0 p-3 md:p-4 bg-gradient-to-b from-slate-950/85 via-slate-950/35 to-transparent">
          {hudTopContent}
        </div>
      )}

      {/* External Bottom Area on mobile portrait (keeps thumb area clean & hides bottom-right text during quiz) */}
      {useExternalQuizLayout && (
        <div className="w-full flex-1 min-h-0 flex flex-col justify-end px-3 pb-2.5 pointer-events-none">
          {hud.lastUpgradeBanner && gameState === 'PLAYING' && (
            <div className="flex justify-center mb-2">
              <div className="w-fit max-w-full bg-slate-950/90 border border-cyan-400/70 px-4 py-2 rounded-lg text-center shadow-lg">
                {renderUpgradeBannerContent(hud.lastUpgradeBanner)}
              </div>
            </div>
          )}
          {gameState === 'PLAYING' && !hud.quizActive && (
            <div className="sm:hidden flex items-center justify-between gap-3 text-[11px] font-mono">
              <span
                className={`font-semibold tabular-nums whitespace-nowrap ${
                  hud.hiddenEvolution
                    ? 'text-amber-300'
                    : hud.isMaxLevel
                      ? 'text-sky-300'
                      : 'text-emerald-300'
                }`}
              >
                {hud.hiddenEvolution
                  ? 'LV MAX ★'
                  : hud.isMaxLevel
                    ? 'LV MAX'
                    : `LV ${hud.level}`}
              </span>
              <div className="flex-1 h-1.5 bg-slate-900 border border-slate-700 rounded-sm overflow-hidden">
                <div
                  className={`h-full ${
                    hud.hiddenEvolution
                      ? 'bg-amber-400'
                      : hud.isMaxLevel
                        ? 'bg-sky-400'
                        : 'bg-emerald-400'
                  }`}
                  style={{width: `${xpPercent}%`}}
                />
              </div>
              <span className="text-slate-200 tabular-nums whitespace-nowrap">
                {hud.isEndless
                  ? `ENDLESS L${hud.endlessLoop} · ${hud.stageHalf === 1 ? '前半' : '後半'}`
                  : `STAGE ${hud.stageNumber} · ${hud.stageHalf === 1 ? '前半' : '後半'}`}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Mobile Compact Bottom Bar (overlay mode, suppressed during Quiz Gate so bottom-right text does not show) */}
      {!useExternalQuizLayout && gameState === 'PLAYING' && !hud.quizActive && (
        <div className="sm:hidden pointer-events-none absolute inset-x-0 bottom-0 px-3 py-2 flex items-center justify-between gap-3 bg-gradient-to-t from-slate-950/85 to-transparent text-[11px] font-mono">
          <span
            className={`font-semibold tabular-nums whitespace-nowrap ${
              hud.hiddenEvolution
                ? 'text-amber-300'
                : hud.isMaxLevel
                  ? 'text-sky-300'
                  : 'text-emerald-300'
            }`}
          >
            {hud.hiddenEvolution
              ? 'LV MAX ★'
              : hud.isMaxLevel
                ? 'LV MAX'
                : `LV ${hud.level}`}
          </span>
          <div className="flex-1 h-1.5 bg-slate-900 border border-slate-700 rounded-sm overflow-hidden">
            <div
              className={`h-full ${
                hud.hiddenEvolution
                  ? 'bg-amber-400'
                  : hud.isMaxLevel
                    ? 'bg-sky-400'
                    : 'bg-emerald-400'
              }`}
              style={{width: `${xpPercent}%`}}
            />
          </div>
          <span className="text-slate-200 tabular-nums whitespace-nowrap">
            {hud.isEndless
              ? `ENDLESS L${hud.endlessLoop} · ${hud.stageHalf === 1 ? '前半' : '後半'}`
              : `STAGE ${hud.stageNumber} · ${hud.stageHalf === 1 ? '前半' : '後半'}`}
          </span>
        </div>
      )}

      {/* Real-time Auto-Upgrade Banner (overlay mode) */}
      {!useExternalQuizLayout && hud.lastUpgradeBanner && gameState === 'PLAYING' && (
        <div className="pointer-events-none absolute inset-x-3 bottom-10 sm:bottom-8 flex justify-center z-10">
          <div className="w-fit max-w-full bg-slate-950/90 border border-cyan-400/70 px-4 sm:px-5 py-2 rounded-lg text-center shadow-lg">
            {renderUpgradeBannerContent(hud.lastUpgradeBanner)}
          </div>
        </div>
      )}

      {/* TITLE MENU WITH COURSE & PRE-STAGE AUTO-UPGRADE PATTERN SELECTOR */}
      {gameState === 'TITLE_MENU' && (
        <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-[2px] flex items-center justify-center p-3 pt-16 sm:p-4 sm:pt-16 overflow-y-auto">
          <div className="w-full max-w-4xl bg-slate-900/95 border border-slate-700/80 rounded-xl p-4 md:p-6 flex flex-col gap-4 shadow-2xl my-auto">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-xs font-mono text-cyan-400 mb-0.5">
                  2157 NEO-CITY · ENDLESS HORIZONTAL SHMUP
                </div>
                <h1 className="font-display text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                  ARROW-01
                </h1>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-xs font-mono tabular-nums text-slate-400">
                  HIGH SCORE:{' '}
                  <span className="text-white font-semibold">
                    {highScore.toLocaleString()}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setHighScoreCourseTab(selectedCourse);
                    setHighScoresOpen(true);
                  }}
                  className="px-3 py-1.5 text-xs font-mono font-semibold text-amber-300 bg-slate-950/80 hover:bg-slate-800 border border-amber-400/50 hover:border-amber-300 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Trophy className="w-3.5 h-3.5" />
                  HIGH SCORE
                </button>
              </div>
            </div>

            {/* 4-Course Selector */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2.5">
                <span className="text-[10px] font-mono font-semibold tracking-[0.22em] text-slate-400 whitespace-nowrap">
                  COURSE
                </span>
                <div className="h-px flex-1 bg-slate-800/90" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {(Object.keys(COURSES) as CourseId[]).map((cid) => {
                  const course = COURSES[cid];
                  const active = selectedCourse === cid;
                  return (
                    <button
                      key={cid}
                      type="button"
                      onClick={() => setSelectedCourse(cid)}
                      className={`text-left p-2.5 rounded-lg border transition-colors cursor-pointer flex flex-col gap-1.5 ${
                        active
                          ? 'bg-slate-800/95 border-cyan-400'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span
                          className="font-mono text-[10px] font-bold"
                          style={{color: course.accentColor}}
                        >
                          {course.code}
                        </span>
                        <span className="font-mono text-[10px] text-slate-400 truncate">
                          {course.name}
                        </span>
                      </div>
                      <CoursePreviewSvg course={course} />
                      <div className="flex items-start gap-1.5 pt-0.5 text-[10px] leading-snug">
                        <span className="font-mono text-slate-500 shrink-0">出題:</span>
                        <span
                          className="font-medium line-clamp-2"
                          style={{color: active ? '#E2E8F0' : '#94A3B8'}}
                        >
                          {course.quizCategoryLabel}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Boundary Divider between Course & Ship Type */}
            <div className="border-t border-slate-700/90 pt-3 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2.5">
                <span className="text-[10px] font-mono font-semibold tracking-[0.22em] text-slate-400 whitespace-nowrap">
                  SHIP TYPE
                </span>
                <div className="h-px flex-1 bg-slate-800/90" />
                <span className="text-[10px] font-mono tabular-nums text-slate-500 whitespace-nowrap">
                  PLAYS: {progress.totalPlays}
                </span>
              </div>

              {/* 4-Pattern Auto-Upgrade Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {(Object.keys(UPGRADE_PATTERNS) as UpgradePatternId[]).map(
                  (pid) => {
                    const pat = UPGRADE_PATTERNS[pid];
                    const unlockStatus = getPatternUnlockStatus(pid, progress);
                    const unlocked = unlockStatus.unlocked;
                    const active = unlocked && selectedPattern === pid;
                    return (
                      <button
                        key={pid}
                        type="button"
                        disabled={!unlocked}
                        onClick={() => {
                          if (unlocked) setSelectedPattern(pid);
                        }}
                        className={`text-left p-2.5 rounded-lg border transition-colors flex flex-col gap-2 ${
                          !unlocked
                            ? 'bg-slate-950/80 border-slate-800/80 cursor-not-allowed'
                            : active
                              ? 'bg-slate-800/95 border-cyan-400 cursor-pointer'
                              : 'bg-slate-950/60 border-slate-800 hover:border-slate-600 cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-mono text-xs font-bold ${
                                !unlocked ? 'opacity-55' : ''
                              }`}
                              style={{color: pat.accent}}
                            >
                              {pat.name}
                            </span>
                            <span
                              className={`inline-flex items-center gap-0.5 text-sky-400 font-mono text-[10px] tabular-nums ${
                                !unlocked ? 'opacity-45' : ''
                              }`}
                            >
                              {Array.from({length: pat.maxShield}).map(
                                (_, sIdx) => (
                                  <Shield
                                    key={sIdx}
                                    className="w-3 h-3 fill-sky-400/30"
                                  />
                                ),
                              )}
                            </span>
                          </div>
                          {unlocked ? (
                            <div className="flex items-center gap-1">
                              {pat.steps.slice(0, 4).map((step, i) => (
                                <React.Fragment key={`${pid}-${i}`}>
                                  {i > 0 && (
                                    <span className="text-[9px] text-slate-600 font-mono">
                                      →
                                    </span>
                                  )}
                                  <div className="bg-slate-900/90 border border-slate-800 rounded px-1 py-0.5">
                                    <UpgradeStepIcon step={step} />
                                  </div>
                                </React.Fragment>
                              ))}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-700 bg-slate-900 text-[10px] font-mono font-semibold text-slate-400">
                              <Lock className="w-3 h-3 text-amber-400/80" />
                              LOCKED
                            </span>
                          )}
                        </div>
                        <div className="relative">
                          <PatternMiniDiagram
                            pattern={pat}
                            className={`w-full h-20 bg-[#050914] rounded border border-slate-800/80 ${
                              !unlocked ? 'opacity-25' : ''
                            }`}
                          />
                          {!unlocked && (
                            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 rounded">
                              <Lock className="w-5 h-5 text-slate-400" />
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  },
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex items-center p-1 rounded-lg bg-slate-950/90 border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setSelectedDifficulty('normal')}
                    className={`px-3 py-1.5 text-xs font-mono font-bold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      selectedDifficulty === 'normal'
                        ? 'bg-cyan-400 text-slate-950'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    NORMAL
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedDifficulty('hard')}
                    className={`px-3 py-1.5 text-xs font-mono font-bold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      selectedDifficulty === 'hard'
                        ? 'bg-rose-500 text-white'
                        : 'text-slate-400 hover:text-rose-300'
                    }`}
                  >
                    HARD
                  </button>
                </div>

                {selectedDifficulty === 'hard' && (
                  <span className="text-[11px] font-mono text-rose-300">
                    常時貫通弾 · SCORE x1.5
                  </span>
                )}

                <div className="text-xs font-mono">
                  {bgmLoad.status === 'loading' && (
                    <span className="text-cyan-300 tabular-nums">
                      BGMデータをダウンロード中... {Math.round(bgmLoad.progress * 100)}%
                    </span>
                  )}
                  {bgmLoad.status === 'error' && (
                    <div className="flex items-center gap-2 text-rose-400">
                      <span>BGMダウンロードに失敗しました</span>
                      <button
                        type="button"
                        onClick={() => void bgmManager.preloadAll()}
                        className="px-2.5 py-1 rounded bg-rose-950/80 border border-rose-500/60 text-rose-200 hover:bg-rose-900 cursor-pointer"
                      >
                        再試行
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                disabled={!isBgmReady}
                onClick={startSelectedRun}
                className="ml-auto px-8 py-2.5 text-sm font-mono font-bold tracking-wider text-slate-950 bg-cyan-400 hover:bg-cyan-300 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isBgmReady
                  ? 'START'
                  : bgmLoad.status === 'error'
                    ? 'BGM REQUIRED'
                    : `LOADING ${Math.round(bgmLoad.progress * 100)}%`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STAGE 8 CLEAR: CONGRATULATION!! & ENDLESS MODE CHOICE */}
      {gameState === 'STAGE_CLEAR' && (
        <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4 z-20">
          <div className="w-full max-w-md bg-slate-900 border border-cyan-400/60 rounded-xl p-6 flex flex-col gap-5 shadow-2xl">
            <div className="text-center">
              <div className="text-xs font-mono tracking-widest text-amber-300">
                STAGE 8 ALL CLEAR
              </div>
              <h2 className="font-display text-3xl font-extrabold text-white mt-1 tracking-tight">
                CONGRATULATION!!
              </h2>
            </div>

            <div className="grid grid-cols-3 gap-3 bg-slate-950/75 border border-slate-800 rounded-lg p-3.5 text-xs font-mono tabular-nums text-center">
              <div>
                <div className="text-slate-400">現在スコア</div>
                <div className="text-base font-bold text-white mt-0.5">
                  {hud.score.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-slate-400">到達レベル</div>
                <div className="text-base font-bold text-emerald-300 mt-0.5">
                  LV {hud.level}
                </div>
              </div>
              <div>
                <div className="text-slate-400">撃破数</div>
                <div className="text-base font-bold text-cyan-300 mt-0.5">
                  {hud.enemiesDefeated} 機
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => engineRef.current?.finalizeRunToTitle()}
                className="px-5 py-2.5 text-sm font-mono font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                TITLE
              </button>
              <button
                type="button"
                onClick={() => {
                  setProgress(recordEndlessEntry());
                  engineRef.current?.enterEndlessMode();
                }}
                className="px-6 py-2.5 text-sm font-mono font-bold bg-rose-500 hover:bg-rose-400 text-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                ENDLESS MODE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PAUSED OVERLAY */}
      {gameState === 'PAUSED' && !settingsOpen && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-xl p-6 text-center flex flex-col gap-4">
            <h2 className="font-display text-2xl font-bold tracking-wider text-white">
              PAUSED
            </h2>
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => setGameState('PLAYING')}
                className="w-full py-2.5 px-4 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-mono font-bold text-sm rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                RESUME
              </button>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono font-semibold text-sm rounded-lg border border-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                SETTINGS
              </button>
              <button
                type="button"
                onClick={() => engineRef.current?.finalizeRunToTitle()}
                className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono font-semibold text-sm rounded-lg border border-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                TITLE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GAME OVER OVERLAY */}
      {gameState === 'GAME_OVER' && (
        <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl p-6 flex flex-col gap-4">
            <div>
              <div className="text-xs font-mono text-rose-400">SIGNAL LOST</div>
              <h2 className="font-display text-2xl font-bold text-white mt-0.5 tracking-wide">
                GAME OVER
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-3 bg-slate-950/70 border border-slate-800 rounded-lg p-3.5 text-xs font-mono tabular-nums">
              <div>
                <div className="text-slate-400">最終スコア</div>
                <div className="text-lg font-bold text-white mt-0.5">
                  {hud.score.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-slate-400">ハイスコア</div>
                <div className="text-lg font-bold text-cyan-300 mt-0.5">
                  {hud.highScore.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-slate-400">到達ステージ</div>
                <div className="text-sm font-semibold text-emerald-300 mt-0.5">
                  {hud.difficulty === 'hard' && (
                    <span className="text-rose-400 mr-1.5">HARD</span>
                  )}
                  {hud.isEndless
                    ? `ENDLESS L${hud.endlessLoop} (LV ${hud.level})`
                    : `STAGE ${hud.stageNumber} (LV ${hud.level})`}
                </div>
              </div>
              <div>
                <div className="text-slate-400">撃破数</div>
                <div className="text-sm font-semibold text-slate-200 mt-0.5">
                  {hud.enemiesDefeated} 機
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setGameState('TITLE_MENU')}
                className="px-4 py-2.5 text-sm font-mono font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                CHANGE TYPE
              </button>
              <button
                type="button"
                onClick={startSelectedRun}
                className="px-5 py-2.5 text-sm font-mono font-bold bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                RETRY
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SETTINGS MODAL */}
      {settingsOpen && (
        <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-3 md:p-6 z-30">
          <div className="w-full max-w-xl max-h-[90dvh] bg-slate-900 border border-slate-700 rounded-xl flex flex-col overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between gap-4 bg-slate-950/60">
              <h2 className="text-sm font-semibold text-white">
                操作・システム設定
              </h2>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                aria-label="閉じる"
                className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-6 flex flex-col gap-5 text-sm">
                <div className="flex items-center justify-between py-2.5 border-b border-slate-800">
                  <div>
                    <div className="font-medium text-white">オートショット</div>
                    <div className="text-xs text-slate-400">
                      OFF時はドラッグ押下中またはSpaceで射撃
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={toggleAutoShot}
                    className={`px-4 py-1.5 text-xs font-mono font-semibold rounded-md transition-colors cursor-pointer ${
                      settings.autoShot
                        ? 'bg-cyan-400 text-slate-950'
                        : 'bg-slate-800 text-slate-300 border border-slate-700'
                    }`}
                  >
                    {settings.autoShot ? 'ON' : 'OFF'}
                  </button>
                </div>

                <div className="py-2.5 border-b border-slate-800 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-white">BGM</div>
                      <div className="text-xs text-slate-400">
                        TOP画面MIDI・プレイ中MP3のループ再生
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={toggleBgm}
                      className={`px-4 py-1.5 text-xs font-mono font-semibold rounded-md transition-colors cursor-pointer ${
                        settings.bgmEnabled
                          ? 'bg-cyan-400 text-slate-950'
                          : 'bg-slate-800 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {settings.bgmEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-mono text-slate-400 w-10 shrink-0">
                      音量
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={settings.bgmVolume}
                      onChange={(e) =>
                        setSettings((p) => ({
                          ...p,
                          bgmVolume: parseFloat(e.target.value),
                        }))
                      }
                      aria-label="BGM音量"
                      className="flex-1 accent-cyan-400 cursor-pointer"
                    />
                    <span className="text-xs font-mono tabular-nums text-cyan-300 w-10 text-right shrink-0">
                      {Math.round(settings.bgmVolume * 100)}%
                    </span>
                  </div>
                </div>

                <div className="py-2.5 border-b border-slate-800 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-white">効果音（SFX）</div>
                      <div className="text-xs text-slate-400">
                        射撃・撃破・クイズ・警告サウンド
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={toggleSfx}
                      className={`px-4 py-1.5 text-xs font-mono font-semibold rounded-md transition-colors cursor-pointer ${
                        settings.sfxEnabled
                          ? 'bg-cyan-400 text-slate-950'
                          : 'bg-slate-800 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {settings.sfxEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-mono text-slate-400 w-10 shrink-0">
                      音量
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={settings.sfxVolume}
                      onChange={(e) =>
                        setSettings((p) => ({
                          ...p,
                          sfxVolume: parseFloat(e.target.value),
                        }))
                      }
                      aria-label="効果音音量"
                      className="flex-1 accent-cyan-400 cursor-pointer"
                    />
                    <span className="text-xs font-mono tabular-nums text-cyan-300 w-10 text-right shrink-0">
                      {Math.round(settings.sfxVolume * 100)}%
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between py-2.5 border-b border-slate-800">
                  <div>
                    <div className="font-medium text-white">画面揺れ演出</div>
                    <div className="text-xs text-slate-400">
                      被弾・ボス撃破時のカメラシェイク
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setSettings((p) => ({
                        ...p,
                        screenShake: !p.screenShake,
                      }))
                    }
                    className={`px-4 py-1.5 text-xs font-mono font-semibold rounded-md transition-colors cursor-pointer ${
                      settings.screenShake
                        ? 'bg-cyan-400 text-slate-950'
                        : 'bg-slate-800 text-slate-300 border border-slate-700'
                    }`}
                  >
                    {settings.screenShake ? 'ON' : 'OFF'}
                  </button>
                </div>

                <div className="py-2 border-b border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-white">
                      タッチ相対移動感度
                    </span>
                    <span className="text-xs font-mono tabular-nums text-cyan-300">
                      x{settings.touchSensitivity.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.7"
                    max="2.0"
                    step="0.05"
                    value={settings.touchSensitivity}
                    onChange={(e) =>
                      setSettings((p) => ({
                        ...p,
                        touchSensitivity: parseFloat(e.target.value),
                      }))
                    }
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                </div>

                {/* PWA App Install Section */}
                <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-4 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-white flex items-center gap-1.5">
                        <Smartphone className="w-4 h-4 text-cyan-400" />
                        アプリインストール（PWA）
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        BGMデータ・ゲーム本体を端末に保存してオフライン対応アプリとして起動できます
                      </div>
                    </div>
                    {isInstalled ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-emerald-950/80 border border-emerald-500/45 text-emerald-300 text-xs font-mono font-semibold whitespace-nowrap shrink-0">
                        <Check className="w-3.5 h-3.5" />
                        導入済み
                      </span>
                    ) : isInstallable ? (
                      <button
                        type="button"
                        onClick={() => void install()}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-mono font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        インストール
                      </button>
                    ) : null}
                  </div>
                  {!isInstalled && !isInstallable && (
                    <div className="text-xs text-slate-300 bg-slate-900/80 border border-slate-800 rounded-md px-3 py-2 leading-relaxed">
                      {isIOS
                        ? 'iOS Safariでは画面下部の共有ボタンから「ホーム画面に追加」を選択するとアプリとしてインストールできます。'
                        : 'ブラウザのアドレスバー右端のインストールアイコン、またはメニューの「ホーム画面に追加 / アプリをインストール」から導入できます。'}
                    </div>
                  )}
                </div>

                {/* Collapsible Operation & Game Rules */}
                <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-4 flex flex-col gap-2">
                  <div className="text-xs font-semibold text-white mb-0.5">
                    操作仕様・ゲームルール（項目をタップして開閉）
                  </div>
                  {[
                    {
                      id: 'touch',
                      title: 'タッチ / マウス操作',
                      body: '画面のどこからでもドラッグで自機が相対移動します。オートショットがOFFのときは、押下（ドラッグ）中に射撃します。',
                    },
                    {
                      id: 'keyboard',
                      title: 'キーボード操作',
                      body: '矢印キー / WASD で移動、Space / Z で手動射撃、P / Esc で一時停止します。',
                    },
                    {
                      id: 'shield',
                      title: 'シールドと極小コア判定',
                      body: 'シールドが1以上残っていれば被弾を防ぎ、短時間の無敵状態になります。シールド0時は自機中央の極小コア（4px）のみが当たり判定となり、被弾すると連続爆発の後にGAME OVERとなります。',
                    },
                    {
                      id: 'upgrade',
                      title: '武装レベルアップ・Lv10上限と隠し強化',
                      body: '経験値チップで自動進化します（最大Lv10）。レベルアップ時のシールド獲得は一度取得済みの場合ポイントへ変換されます（初回MAXでポイントになった分は後で減少時に取得可能）。Lv10到達後は一定スコア達成ごとにシールドが回復し、この取得ラインを2回踏破すると各機体の隠し強化が解放されます（クイズ誤答によるパワーダウンで失われますが、再度2回踏破すると再取得できます）。',
                    },
                    {
                      id: 'gate_quiz',
                      title: 'ステージ前半・後半の4択クイズゲート',
                      body: '各ステージ前半・後半の突入前に30秒制限のゲート選択が発生します（コース01〜03は各専門ジャンル、04は全ジャンルから出題）。時間経過で自機は右へ進み、正解ゲートを通ると+1000点・通常通りアイテムが出現します。不正解・時間切れの場合は-1000点・取得経験値全体が20%低下（LvMAX時のシールド累計スコアは維持）し、そのエリアではアイテムが出現せず敵弾が貫通属性になります。',
                    },
                    {
                      id: 'boss_quiz',
                      title: 'ボス戦「（」型シールドクイズ・Laser攻撃',
                      body: 'ボスが横断シールドを展開すると4択問題が出題されます（制限時間60秒・最低3回出題）。前方Normalショットの継続射撃でターゲットを破壊でき（別の選択肢へ照準を移すと耐久は回復）、正解するとシールドを粉砕して次のフェーズまで再出題されず攻撃が通ります。不正解・時間切れの場合は-1000点・シールド維持（本体攻撃無効＆ボス弾100%貫通、連続ミスで攻撃激化）となりますが、約15秒耐えるか攻撃を1発受ける（シールド含む）と次の問題へ再挑戦できます。なおボスのLaser攻撃はNORMALではPHASE 3/3のみ、HARDではPHASE 1から発動します。',
                    },
                    {
                      id: 'difficulty',
                      title: 'NORMAL / HARD 難易度とエンドレスモード',
                      body: 'トップ画面でNORMALとHARDを切り替えられます。HARDでは常時敵の攻撃が貫通弾となり、獲得スコアが1.5倍になります（敵の耐久力や攻撃パターンも強化されます）。STAGE 8クリア後はエンドレスモードへ突入でき、通常モードのボス正解時でも最初のボスPhase1の1%からフェーズ・ボス戦ごとに1%ずつ貫通弾率が上昇します。',
                    },
                  ].map((rule) => {
                    const isOpen = Boolean(expandedRuleIds[rule.id]);
                    return (
                      <div
                        key={rule.id}
                        className="border border-slate-800/90 rounded-md bg-slate-900/60 overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() => toggleRuleItem(rule.id)}
                          aria-expanded={isOpen}
                          className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left text-xs font-medium text-slate-200 hover:bg-slate-800/60 transition-colors cursor-pointer"
                        >
                          <span>{rule.title}</span>
                          {isOpen ? (
                            <ChevronDown className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          )}
                        </button>
                        {isOpen && (
                          <div className="px-3 pb-2.5 pt-1 text-xs text-slate-300 leading-relaxed border-t border-slate-800/80">
                            {rule.body}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Debug Mode (collapsible button, easily hideable later) */}
                <div className="bg-slate-950/70 border border-amber-500/30 rounded-lg p-3 flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => setDebugPanelOpen((prev) => !prev)}
                    aria-expanded={debugPanelOpen}
                    className="w-full flex items-center justify-between gap-2 text-left text-xs font-mono font-semibold text-amber-300 hover:text-amber-200 transition-colors cursor-pointer"
                  >
                    <span>デバッグモード</span>
                    {debugPanelOpen ? (
                      <ChevronDown className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-amber-400/80 shrink-0" />
                    )}
                  </button>

                  {debugPanelOpen && (
                    <div className="flex flex-col gap-3.5 pt-2.5 border-t border-slate-800">
                      <div>
                        <div className="flex items-center justify-between mb-1.5 text-xs">
                          <span className="text-slate-200 font-medium">
                            開始ステージ
                          </span>
                          <span className="font-mono font-bold text-amber-300 tabular-nums">
                            {debugStartStage >= 9
                              ? 'ENDLESS (STAGE 9)'
                              : `STAGE ${debugStartStage}`}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="9"
                          step="1"
                          value={debugStartStage}
                          onChange={(e) =>
                            setDebugStartStage(parseInt(e.target.value, 10))
                          }
                          aria-label="デバッグ開始ステージ"
                          className="w-full accent-amber-400 cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-0.5">
                          <span>1</span>
                          <span>4</span>
                          <span>8</span>
                          <span>ENDLESS</span>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1.5 text-xs">
                          <span className="text-slate-200 font-medium">
                            自機の強化状態
                          </span>
                          <span className="font-mono font-bold text-cyan-300 tabular-nums">
                            {debugWeaponLevel >= 11
                              ? 'LV 10 ★ 隠し強化'
                              : `LV ${debugWeaponLevel}`}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="11"
                          step="1"
                          value={debugWeaponLevel}
                          onChange={(e) =>
                            setDebugWeaponLevel(parseInt(e.target.value, 10))
                          }
                          aria-label="デバッグ自機強化状態"
                          className="w-full accent-cyan-400 cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-0.5">
                          <span>LV 1</span>
                          <span>LV 5</span>
                          <span>LV 10</span>
                          <span>★ 隠し強化</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 pt-1">
                        <span className="text-[11px] font-mono text-slate-400">
                          {UPGRADE_PATTERNS[selectedPattern].name} ·{' '}
                          {selectedDifficulty.toUpperCase()}
                        </span>
                        <button
                          type="button"
                          disabled={!isBgmReady}
                          onClick={startDebugRun}
                          className="px-4 py-2 rounded-md bg-amber-400 hover:bg-amber-300 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed text-slate-950 font-mono text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          {isBgmReady ? 'デバッグ出撃' : 'BGM LOADING...'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PER-COURSE HIGH SCORE RANKING MODAL (MAX 5 PER COURSE) */}
      {highScoresOpen && (
        <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-3 md:p-6 z-30">
          <div className="w-full max-w-3xl max-h-[90dvh] bg-slate-900 border border-slate-700 rounded-xl flex flex-col overflow-hidden shadow-2xl">
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between gap-4 bg-slate-950/60">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-300" />
                <h2 className="text-sm font-mono font-bold tracking-wider text-white">
                  HIGH SCORE RANKING
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setHighScoresOpen(false)}
                aria-label="CLOSE"
                className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 pt-4 flex items-center gap-1.5">
              {tabScrollState.overflow && (
                <button
                  type="button"
                  onClick={() => scrollTabsBy(-150)}
                  disabled={!tabScrollState.canLeft}
                  aria-label="前のコース"
                  className="p-1.5 rounded-lg bg-slate-950/80 border border-slate-700 text-slate-200 hover:border-cyan-400 disabled:opacity-30 disabled:cursor-default transition-colors shrink-0 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}

              <div
                ref={tabStripRef}
                onScroll={updateTabScrollState}
                className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-hidden"
              >
                {(
                  [
                    {id: 'neon_city', code: '01', shortName: 'SKYWAY'},
                    {id: 'foundry', code: '02', shortName: 'FOUNDRY'},
                    {id: 'cyber_vault', code: '03', shortName: 'MATRIX'},
                    {id: 'orbital', code: '04', shortName: 'ORBITAL'},
                  ] as const
                ).map(({id: cid, code, shortName}) => {
                  const course = COURSES[cid];
                  const active = highScoreCourseTab === cid;
                  return (
                    <button
                      key={cid}
                      type="button"
                      onClick={() => setHighScoreCourseTab(cid)}
                      className={`flex-1 min-w-[112px] px-2.5 py-1.5 text-xs font-mono font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center justify-center gap-1.5 ${
                        active
                          ? 'bg-slate-800 border-cyan-400 text-white'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span style={{color: course.accentColor}}>{code}</span>
                      <span>{shortName}</span>
                    </button>
                  );
                })}
              </div>

              {tabScrollState.overflow && (
                <button
                  type="button"
                  onClick={() => scrollTabsBy(150)}
                  disabled={!tabScrollState.canRight}
                  aria-label="次のコース"
                  className="p-1.5 rounded-lg bg-slate-950/80 border border-slate-700 text-slate-200 hover:border-cyan-400 disabled:opacity-30 disabled:cursor-default transition-colors shrink-0 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="p-5 flex-1 overflow-y-auto">
              {courseScores[highScoreCourseTab].length === 0 ? (
                <div className="py-10 text-center text-xs font-mono text-slate-400 border border-dashed border-slate-800 rounded-lg">
                  NO RECORDS YET
                </div>
              ) : (
                <div className="divide-y divide-slate-800/80 border border-slate-800 rounded-lg bg-slate-950/60">
                  {courseScores[highScoreCourseTab].map((entry, idx) => {
                    const pat = UPGRADE_PATTERNS[entry.patternId];
                    return (
                      <div
                        key={`${entry.timestamp}-${idx}`}
                        className="px-4 py-2.5 flex items-center justify-between gap-3 font-mono text-xs tabular-nums"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`w-6 font-bold shrink-0 ${
                              idx === 0
                                ? 'text-amber-300'
                                : idx === 1
                                  ? 'text-slate-200'
                                  : idx === 2
                                    ? 'text-amber-600'
                                    : 'text-slate-500'
                            }`}
                          >
                            #{idx + 1}
                          </span>
                          {pat && (
                            <PatternMiniDiagram
                              pattern={pat}
                              className="w-24 sm:w-36 h-10 bg-[#050914] rounded border border-slate-800/90 shrink-0"
                            />
                          )}
                          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2.5 min-w-0">
                            <span
                              className="font-bold whitespace-nowrap"
                              style={{color: pat?.accent ?? '#22D3EE'}}
                            >
                              {pat?.name ?? entry.patternId}
                            </span>
                            <span className="text-slate-400 whitespace-nowrap text-[11px] sm:text-xs">
                              {entry.difficulty === 'hard' && (
                                <span className="text-rose-400 font-bold mr-1.5">
                                  HARD
                                </span>
                              )}
                              {entry.endlessLoop > 0
                                ? `ENDLESS L${entry.endlessLoop}`
                                : `STAGE ${entry.stageNumber}`}
                            </span>
                          </div>
                        </div>
                        <span className="text-sm sm:text-base font-bold text-white shrink-0">
                          {entry.score.toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="text-xs font-mono tabular-nums text-slate-400">
                TOP HIGH SCORE:{' '}
                <span className="text-cyan-300 font-bold">
                  {highScore.toLocaleString()}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setHighScoresOpen(false)}
                className="px-4 py-1.5 text-xs font-mono font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
      {/* PARTS COLLECTION SCREEN */}
      {collectionOpen && gameState === 'TITLE_MENU' && (
        <PartsCollectionView
          solvedTermCounts={progress.solvedTermCounts}
          onClose={() => setCollectionOpen(false)}
        />
      )}
    </div>
  );
};
