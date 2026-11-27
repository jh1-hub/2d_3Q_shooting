import React, {useEffect, useRef} from 'react';
import {COURSES, ENEMIES, UPGRADE_PATTERNS, WEAPONS} from './data';
import {recordSolvedTerm, recordWrongTerm} from './progress';
import {pickNextQuizQuestion, QuizQuestion} from './quizData';
import {synthAudio} from './sound';
import {
  BossShape,
  CourseId,
  DifficultyMode,
  EnemyTypeId,
  GameSettings,
  GameState,
  HudSnapshot,
  UpgradePatternId,
  UpgradeStep,
  WeaponId,
} from './types';

export const LOGICAL_W = 1280;
export const LOGICAL_H = 720;

const MAX_WEAPON_LEVEL = 10;
const INITIAL_SHIELD_SCORE_REQ = 50000;

const QUIZ_TIME_LIMIT_SEC = 30;
const GATE_START_X = 120;
const GATE_ENTRY_X = 740;
const GATE_CARD_X = GATE_ENTRY_X + 44;
const GATE_CARD_WIDTH = 416;
const GATE_DRIFT_VX = (GATE_ENTRY_X - GATE_START_X) / 29.0;
const GATE_HEIGHT_INTERNAL = 108;
const GATE_TOPS_INTERNAL = [200, 322, 444, 566] as const;
const GATE_HEIGHT_EXTERNAL = 132;
const GATE_TOPS_EXTERNAL = [64, 224, 384, 544] as const;
const GATE_LABELS = ['A', 'B', 'C', 'D'] as const;

function getGateLayout(externalQuestion: boolean) {
  return {
    tops: externalQuestion ? GATE_TOPS_EXTERNAL : GATE_TOPS_INTERNAL,
    height: externalQuestion ? GATE_HEIGHT_EXTERNAL : GATE_HEIGHT_INTERNAL,
  };
}

function getAlignedGateIndex(y: number, externalQuestion: boolean): number {
  const {tops, height} = getGateLayout(externalQuestion);
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < tops.length; i++) {
    const cy = tops[i] + height / 2;
    const d = Math.abs(y - cy);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  let current = '';
  for (const ch of text) {
    if (ch === '\n') {
      lines.push(current);
      current = '';
      continue;
    }
    const next = current + ch;
    if (ctx.measureText(next).width > maxWidth && current.length > 0) {
      lines.push(current);
      current = ch;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

const BOSS_SHIELD_EDGE_X = 740;
const BOSS_SHIELD_CURVE_DEPTH = 90;
const BOSS_SHIELD_ACTIVE_DURATION = 0.75;
const BOSS_SHIELD_FADE_DURATION = 0.45;
const BOSS_QUIZ_TOPS_INTERNAL = [162, 308, 454, 600] as const;
const BOSS_QUIZ_HEIGHT_INTERNAL = 76;
const BOSS_QUIZ_TOPS_EXTERNAL = [44, 212, 380, 548] as const;
const BOSS_QUIZ_HEIGHT_EXTERNAL = 104;
const BOSS_QUIZ_STANDOFF_GAP = 180;
const BOSS_QUIZ_START_X = 140;
const BOSS_QUIZ_TIME_LIMIT_SEC = 60;
const BOSS_QUIZ_COOLDOWN_SEC = 15;
const BOSS_QUIZ_PHASE_GUARD_SEC = 2.0;

function getBossShieldXAtY(y: number): number {
  const halfH = LOGICAL_H / 2;
  const u = Math.max(-1, Math.min(1, (y - halfH) / halfH));
  return BOSS_SHIELD_EDGE_X - BOSS_SHIELD_CURVE_DEPTH * (1 - u * u);
}

function getBossQuizLayout(externalQuestion: boolean) {
  return {
    tops: externalQuestion ? BOSS_QUIZ_TOPS_EXTERNAL : BOSS_QUIZ_TOPS_INTERNAL,
    height: externalQuestion ? BOSS_QUIZ_HEIGHT_EXTERNAL : BOSS_QUIZ_HEIGHT_INTERNAL,
  };
}

function getBossQuizStartY(externalQuestion: boolean): number {
  const {tops, height} = getBossQuizLayout(externalQuestion);
  return Math.round((tops[1] + height + tops[2]) / 2);
}

function getBossQuizChoiceAtY(y: number, externalQuestion: boolean): number | null {
  const {tops, height} = getBossQuizLayout(externalQuestion);
  for (let i = 0; i < tops.length; i++) {
    if (y >= tops[i] + 2 && y <= tops[i] + height - 2) {
      return i;
    }
  }
  return null;
}

interface BulletEntity {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  color: string;
  kind: 'normal' | 'laser' | 'ripple' | 'missile' | 'cross_laser' | 'back_shot';
  isBaseNormal?: boolean;
  pierce: number;
  hitIds: Set<number>;
  age: number;
  maxAge: number;
  growRate?: number;
  originY?: number;
  phaseSign?: number;
  beamHalfLen?: number;
  level?: number;
  homing?: boolean;
  evolved?: boolean;
}

interface EnemyBulletEntity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  indestructible: boolean;
  fromBoss: boolean;
  flashTimer: number;
}

interface EnemyEntity {
  id: number;
  type: EnemyTypeId;
  isRedCarrier: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  radius: number;
  fireTimer: number;
  age: number;
  flashTimer: number;
  baseY: number;
}

interface ShieldShard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  size: number;
  color: string;
}

interface BossEntity {
  name: string;
  shape: BossShape;
  stageTier: number;
  x: number;
  y: number;
  targetX: number;
  hp: number;
  maxHp: number;
  radius: number;
  phase: 1 | 2 | 3;
  prevPhase: 1 | 2 | 3;
  age: number;
  movePhase: number;
  fireTimer: number;
  subFireTimer: number;
  laserState: 'idle' | 'telegraph' | 'firing';
  laserTimer: number;
  laserY: number;
  flashTimer: number;
  shieldTimer: number;
  shieldFadeTimer: number;
  shieldFlashTimer: number;
  shieldIntact: boolean;
  shieldShatterTimer: number;
  shieldShards: ShieldShard[];
  quizState: 'none' | 'push' | 'active' | 'feedback';
  quizPushTimer: number;
  quizTimer: number;
  quizQuestion: QuizQuestion | null;
  quizTargetDamage: [number, number, number, number];
  quizNoHitTimers: [number, number, number, number];
  quizSelectedIdx: number | null;
  quizResult: 'none' | 'correct' | 'wrong' | 'timeout';
  quizFeedbackTimer: number;
  quizCount: number;
  quizCooldownTimer: number;
  lastQuizSolvedElapsed: number;
  piercingQuizActive: boolean;
  consecutiveQuizMisses: number;
  quizBoostTier: number;
}

interface ItemEntity {
  id: number;
  x: number;
  y: number;
  baseY: number;
  vx: number;
  hp: number;
  maxHp: number;
  radius: number;
  age: number;
  flashTimer: number;
  chipCount: number;
  chipValue: number;
}

interface PickupEntity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  value: number;
  isBonus: boolean;
}

interface ParticleEntity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  ring?: boolean;
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  big?: boolean;
}

export interface DebugRunConfig {
  startStage?: number;
  weaponPowerLevel?: number;
}

export interface GameEngineHandle {
  startNewRun: (
    patternId: UpgradePatternId,
    courseId: CourseId,
    difficulty?: DifficultyMode,
    debugConfig?: DebugRunConfig,
    revengeMode?: boolean,
  ) => void;
  enterEndlessMode: () => void;
  finalizeRunToTitle: () => void;
}

interface GameCanvasProps {
  gameState: GameState;
  settings: GameSettings;
  highScore: number;
  previewCourseId: CourseId;
  externalQuizQuestion?: boolean;
  onStateChange: (next: GameState) => void;
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onHighScoreUpdate: (score: number) => void;
  onRunEnd: (result: {
    courseId: CourseId;
    score: number;
    patternId: UpgradePatternId;
    stageNumber: number;
    endlessLoop: number;
    difficulty: DifficultyMode;
  }) => void;
  onTermSolved?: () => void;
  engineRef: React.MutableRefObject<GameEngineHandle | null>;
}

const HIGH_SCORE_KEY = 'arrow01_high_score_v1';

function drawRegularPolygon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  sides: number,
  rotation = 0,
) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i * Math.PI * 2) / sides;
    const px = cx + Math.cos(a) * radius;
    const py = cy + Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export const GameCanvas: React.FC<GameCanvasProps> = ({
  gameState,
  settings,
  highScore,
  previewCourseId,
  externalQuizQuestion = false,
  onStateChange,
  onHudUpdate,
  onHighScoreUpdate,
  onRunEnd,
  onTermSolved,
  engineRef,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameStateRef = useRef<GameState>(gameState);
  const onTermSolvedRef = useRef(onTermSolved);
  onTermSolvedRef.current = onTermSolved;
  const settingsRef = useRef<GameSettings>(settings);
  const highScoreRef = useRef<number>(highScore);
  const previewCourseRef = useRef<CourseId>(previewCourseId);
  const externalQuizRef = useRef<boolean>(externalQuizQuestion);
  const onRunEndRef = useRef(onRunEnd);

  gameStateRef.current = gameState;
  settingsRef.current = settings;
  highScoreRef.current = highScore;
  previewCourseRef.current = previewCourseId;
  externalQuizRef.current = externalQuizQuestion;
  onRunEndRef.current = onRunEnd;

  const simRef = useRef({
    nextId: 1,
    waveCount: 0,
    courseId: 'neon_city' as CourseId,
    difficulty: 'normal' as DifficultyMode,
    revengeMode: false,
    patternId: 'missile_guard' as UpgradePatternId,
    upgradeIndex: 0,
    claimedShieldSteps: new Set<number>(),
    lastUpgradeBanner: null as string | null,
    upgradeBannerTimer: 0,
    player: {
      x: 180,
      y: LOGICAL_H / 2,
      prevX: 180,
      prevY: LOGICAL_H / 2,
      tilt: 0,
      shield: 3,
      maxShield: 3,
      speed: 420,
      invulnTimer: 0,
      damageMult: 1,
      fireRateMult: 1,
      bulletSizeMult: 1,
    },
    weapons: {normal: 1} as Partial<Record<WeaponId, number>>,
    weaponTimers: {} as Partial<Record<WeaponId, number>>,
    score: 0,
    level: 1,
    xp: 0,
    xpToNext: 40,
    shieldScoreProgress: 0,
    shieldScoreRequired: INITIAL_SHIELD_SCORE_REQ,
    postMaxShieldMilestones: 0,
    hiddenEvolutionUnlocked: false,
    combo: 0,
    comboTimer: 0,
    enemiesDefeated: 0,
    elapsedTime: 0,
    stageNumber: 1,
    stageHalf: 1 as 1 | 2,
    itemsEnabled: true,
    isEndless: false,
    endlessLoop: 0,
    scoreRecordedForRun: false,
    stageTimer: 0,
    spawnTimer: 0.9,
    itemTimer: 1.5,
    bossSpawnedForStage: false,
    bossIntroTimer: 0,
    bossDyingTimer: 0,
    bossExplosionBurstTimer: 0,
    playerDyingTimer: 0,
    playerExplosionBurstTimer: 0,
    playerHullDestroyed: false,
    endingPhase: 'none' as 'none' | 'move_left' | 'boost_right',
    endingTimer: 0,
    usedQuizIds: new Set<string>(),
    quizAnsweredCorrect: 0,
    quizTotalAnswered: 0,
    quizPhase: 'none' as
      | 'none'
      | 'prepare'
      | 'selecting'
      | 'feedback'
      | 'boost_out'
      | 'boost_in',
    quizQuestion: null as QuizQuestion | null,
    quizTimer: QUIZ_TIME_LIMIT_SEC,
    quizPrepareTimer: 0,
    quizSelectLockTimer: 0,
    quizFeedbackTimer: 0,
    quizBoostTimer: 0,
    quizSelectedGate: null as number | null,
    quizResult: 'none' as 'none' | 'correct' | 'wrong' | 'timeout',
    laserStreamStrength: 0,
    dFieldStrength: 0,
    dFieldSparkTimer: 0,
    warningTimer: 0,
    warningText: null as string | null,
    shakeTimer: 0,
    shakeIntensity: 0,
    bullets: [] as BulletEntity[],
    enemyBullets: [] as EnemyBulletEntity[],
    enemies: [] as EnemyEntity[],
    items: [] as ItemEntity[],
    boss: null as BossEntity | null,
    pickups: [] as PickupEntity[],
    particles: [] as ParticleEntity[],
    floatingTexts: [] as FloatingText[],
    bgOffset: 0,
    stars: Array.from({length: 75}, () => ({
      x: Math.random() * LOGICAL_W,
      y: Math.random() * LOGICAL_H,
      speed: 25 + Math.random() * 85,
      size: 1 + Math.random() * 1.8,
      alpha: 0.25 + Math.random() * 0.65,
    })),
    buildingsFar: Array.from({length: 18}, (_, i) => ({
      x: i * 92,
      w: 56 + ((i * 37) % 44),
      h: 130 + ((i * 73) % 210),
    })),
    buildingsNear: Array.from({length: 14}, (_, i) => ({
      x: i * 118,
      w: 72 + ((i * 29) % 52),
      h: 85 + ((i * 53) % 150),
    })),
  });

  const inputRef = useRef({
    keys: new Set<string>(),
    activePointerId: null as number | null,
    lastPointerX: 0,
    lastPointerY: 0,
    lastMoveTime: 0,
    flickVx: 0,
    flickVy: 0,
    glideVx: 0,
    glideVy: 0,
    tapFireTimer: 0,
    pointerDown: false,
  });

  useEffect(() => {
    engineRef.current = {
      startNewRun: (
        patternId: UpgradePatternId,
        courseId: CourseId,
        difficulty: DifficultyMode = 'normal',
        debugConfig?: DebugRunConfig,
        revengeMode = false,
      ) => {
        synthAudio.unlock();
        const s = simRef.current;
        s.nextId = 1;
        s.waveCount = 0;
        s.courseId = courseId;
        s.difficulty = difficulty;
        s.revengeMode = revengeMode;
        s.patternId = patternId;
        s.upgradeIndex = 0;
        s.claimedShieldSteps.clear();
        s.lastUpgradeBanner = null;
        s.upgradeBannerTimer = 0;
        const pat = UPGRADE_PATTERNS[patternId];
        s.player = {
          x: GATE_START_X,
          y: LOGICAL_H / 2,
          prevX: GATE_START_X,
          prevY: LOGICAL_H / 2,
          tilt: 0,
          shield: pat.maxShield,
          maxShield: pat.maxShield,
          speed: 420,
          invulnTimer: 0,
          damageMult: pat.baseDamageMult ?? 1,
          fireRateMult: pat.baseFireRateMult ?? 1,
          bulletSizeMult: 1,
        };
        s.weapons = {normal: 1};
        s.weaponTimers = {normal: 0};
        s.score = 0;
        s.level = 1;
        s.xp = 0;
        s.xpToNext = 40;
        s.shieldScoreProgress = 0;
        s.shieldScoreRequired = INITIAL_SHIELD_SCORE_REQ;
        s.postMaxShieldMilestones = 0;
        s.hiddenEvolutionUnlocked = false;
        s.combo = 0;
        s.comboTimer = 0;
        s.enemiesDefeated = 0;
        s.elapsedTime = 0;
        const reqStage = debugConfig?.startStage ?? 1;
        if (reqStage >= 9) {
          s.isEndless = true;
          s.endlessLoop = 1;
          s.stageNumber = 9;
        } else {
          s.isEndless = false;
          s.endlessLoop = 0;
          s.stageNumber = Math.max(1, Math.min(8, reqStage));
        }
        s.stageHalf = 1;
        s.itemsEnabled = true;
        s.scoreRecordedForRun = false;
        s.stageTimer = 0;
        s.spawnTimer = 0.7;
        s.itemTimer = 1.4;
        s.bossSpawnedForStage = false;
        s.bossIntroTimer = 0;
        s.bossDyingTimer = 0;
        s.bossExplosionBurstTimer = 0;
        s.playerDyingTimer = 0;
        s.playerExplosionBurstTimer = 0;
        s.playerHullDestroyed = false;
        s.endingPhase = 'none';
        s.endingTimer = 0;
        s.usedQuizIds.clear();
        s.quizAnsweredCorrect = 0;
        s.quizTotalAnswered = 0;
        s.quizPhase = 'selecting';
        s.quizQuestion = pickNextQuizQuestion(
          s.usedQuizIds,
          courseId,
          s.revengeMode,
        );
        s.quizTimer = QUIZ_TIME_LIMIT_SEC;
        s.quizPrepareTimer = 0;
        s.quizSelectLockTimer = 0.35;
        s.quizFeedbackTimer = 0;
        s.quizBoostTimer = 0;
        s.quizSelectedGate = null;
        s.quizResult = 'none';
        s.laserStreamStrength = 0;
        s.dFieldStrength = 0;
        s.dFieldSparkTimer = 0;
        s.warningTimer = 0;
        s.warningText = null;
        s.shakeTimer = 0;
        s.shakeIntensity = 0;
        s.bullets = [];
        s.enemyBullets = [];
        s.enemies = [];
        s.items = [];
        s.boss = null;
        s.pickups = [];
        s.particles = [];
        s.floatingTexts = [];

        const debugPower = debugConfig?.weaponPowerLevel;
        if (debugPower && debugPower > 1) {
          const targetLv = Math.min(MAX_WEAPON_LEVEL, Math.max(1, debugPower));
          let req = 40;
          for (let lv = 1; lv < targetLv; lv++) {
            req = Math.round(req * 1.24 + 14);
          }
          s.level = targetLv;
          s.xpToNext = req;
          s.xp = targetLv >= MAX_WEAPON_LEVEL ? req : 0;
          s.weapons = {normal: 1};
          s.upgradeIndex = 0;
          s.player.damageMult = pat.baseDamageMult ?? 1;
          s.player.fireRateMult = pat.baseFireRateMult ?? 1;
          s.player.bulletSizeMult = 1;
          s.player.speed = 420;
          const stepsToApply = Math.min(
            pat.steps.length,
            Math.max(0, targetLv - 1),
          );
          for (let idx = 0; idx < stepsToApply; idx++) {
            const step = pat.steps[idx];
            s.upgradeIndex += 1;
            const applyDebugStep = (
              k: UpgradeStep['kind'],
              val: number,
              wId?: WeaponId,
            ) => {
              if (k === 'weapon_unlock' && wId) {
                const cur = s.weapons[wId] ?? 0;
                const maxLv = wId === 'drone' || wId === 'orbit' ? 3 : 5;
                s.weapons[wId] = Math.min(maxLv, cur + 1);
                if (s.weaponTimers[wId] === undefined) s.weaponTimers[wId] = 0;
              } else if (k === 'fire_rate') {
                s.player.fireRateMult += val;
              } else if (k === 'damage') {
                s.player.damageMult += val;
              } else if (k === 'bullet_size') {
                s.player.bulletSizeMult += val;
              } else if (k === 'move_speed') {
                s.player.speed = Math.round(s.player.speed * (1 + val));
              }
            };
            applyDebugStep(step.kind, step.value, step.weaponId);
            if (step.extra) {
              applyDebugStep(
                step.extra.kind,
                step.extra.value,
                step.extra.weaponId,
              );
            }
          }
          if (debugPower >= 11) {
            s.hiddenEvolutionUnlocked = true;
            s.postMaxShieldMilestones = 2;
          }
        }

        onStateChange('PLAYING');
      },
      enterEndlessMode: () => {
        synthAudio.unlock();
        const s = simRef.current;
        s.isEndless = true;
        s.endlessLoop = 1;
        s.stageNumber = 9;
        s.stageHalf = 1;
        s.stageTimer = 0;
        s.spawnTimer = 0.6;
        s.itemTimer = 1.4;
        s.bossSpawnedForStage = false;
        s.bossIntroTimer = 0;
        s.bossDyingTimer = 0;
        s.bossExplosionBurstTimer = 0;
        s.playerDyingTimer = 0;
        s.playerExplosionBurstTimer = 0;
        s.playerHullDestroyed = false;
        s.endingPhase = 'none';
        s.endingTimer = 0;
        s.quizPhase = 'selecting';
        s.quizQuestion = pickNextQuizQuestion(
          s.usedQuizIds,
          s.courseId,
          s.revengeMode,
        );
        s.quizTimer = QUIZ_TIME_LIMIT_SEC;
        s.quizPrepareTimer = 0;
        s.quizSelectLockTimer = 0.35;
        s.quizFeedbackTimer = 0;
        s.quizBoostTimer = 0;
        s.quizSelectedGate = null;
        s.quizResult = 'none';
        s.laserStreamStrength = 0;
        s.boss = null;
        s.bullets = [];
        s.enemyBullets = [];
        s.enemies = [];
        s.player.x = GATE_START_X;
        s.player.y = LOGICAL_H / 2;
        s.player.prevX = GATE_START_X;
        s.player.prevY = LOGICAL_H / 2;
        s.player.tilt = 0;
        s.player.invulnTimer = 1.5;
        s.floatingTexts.push({
          x: LOGICAL_W / 2,
          y: 140,
          text: 'ENDLESS MODE // STAGE 9',
          color: '#F43F5E',
          life: 2.2,
        });
        onStateChange('PLAYING');
      },
      finalizeRunToTitle: () => {
        const s = simRef.current;
        if (!s.scoreRecordedForRun) {
          s.scoreRecordedForRun = true;
          onRunEndRef.current({
            courseId: s.courseId,
            score: s.score,
            patternId: s.patternId,
            stageNumber: s.stageNumber,
            endlessLoop: s.endlessLoop,
            difficulty: s.difficulty,
          });
        }
        onStateChange('TITLE_MENU');
      },
    };
  }, [engineRef, onStateChange]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(
          e.code,
        ) &&
        gameStateRef.current === 'PLAYING'
      ) {
        e.preventDefault();
      }
      inputRef.current.keys.add(e.code);
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (gameStateRef.current === 'PLAYING') {
          onStateChange('PAUSED');
        } else if (gameStateRef.current === 'PAUSED') {
          onStateChange('PLAYING');
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      inputRef.current.keys.delete(e.code);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [onStateChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const isInteractiveTarget = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      return Boolean(
        el?.closest(
          'button, input, select, textarea, a, [role="button"], [data-ui-control]',
        ),
      );
    };

    const getCanvasUnitsPerCssPx = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return {scaleX: 1, scaleY: 1};
      }
      const renderedScale = Math.min(
        rect.width / LOGICAL_W,
        rect.height / LOGICAL_H,
      );
      if (renderedScale > 0) {
        const inv = 1 / renderedScale;
        return {scaleX: inv, scaleY: inv};
      }
      return {
        scaleX: LOGICAL_W / rect.width,
        scaleY: LOGICAL_H / rect.height,
      };
    };

    const onPointerDown = (e: PointerEvent) => {
      if (gameStateRef.current !== 'PLAYING') return;
      if (isInteractiveTarget(e.target)) return;
      synthAudio.unlock();
      if (inputRef.current.activePointerId === null) {
        inputRef.current.activePointerId = e.pointerId;
        inputRef.current.lastPointerX = e.clientX;
        inputRef.current.lastPointerY = e.clientY;
        inputRef.current.lastMoveTime = performance.now();
        inputRef.current.flickVx = 0;
        inputRef.current.flickVy = 0;
        inputRef.current.glideVx = 0;
        inputRef.current.glideVy = 0;
        inputRef.current.tapFireTimer = 0.16;
        inputRef.current.pointerDown = true;
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (gameStateRef.current !== 'PLAYING') return;
      if (inputRef.current.activePointerId !== e.pointerId) return;
      if (
        simRef.current.playerDyingTimer > 0 ||
        simRef.current.endingPhase !== 'none' ||
        simRef.current.boss?.quizState === 'push' ||
        (simRef.current.quizPhase !== 'none' &&
          simRef.current.quizPhase !== 'selecting')
      ) {
        return;
      }

      const {scaleX, scaleY} = getCanvasUnitsPerCssPx();
      const sens =
        e.pointerType === 'touch' ? settingsRef.current.touchSensitivity : 1.05;

      const coalesced =
        typeof e.getCoalescedEvents === 'function'
          ? e.getCoalescedEvents()
          : [];
      const samples = coalesced.length > 0 ? coalesced : [e];
      const latest = samples[samples.length - 1];

      const totalDx =
        (latest.clientX - inputRef.current.lastPointerX) * scaleX * sens;
      const totalDy =
        (latest.clientY - inputRef.current.lastPointerY) * scaleY * sens;

      const now = performance.now();
      const dtMs = Math.max(4, now - inputRef.current.lastMoveTime);
      const dtSec = dtMs / 1000;
      const instVx = totalDx / dtSec;
      const instVy = totalDy / dtSec;
      inputRef.current.flickVx = inputRef.current.flickVx * 0.45 + instVx * 0.55;
      inputRef.current.flickVy = inputRef.current.flickVy * 0.45 + instVy * 0.55;
      inputRef.current.lastMoveTime = now;
      inputRef.current.lastPointerX = latest.clientX;
      inputRef.current.lastPointerY = latest.clientY;

      const p = simRef.current.player;
      const isSelecting = simRef.current.quizPhase === 'selecting';
      const isBossQuizActive = Boolean(
        simRef.current.boss && simRef.current.boss.quizState !== 'none',
      );
      const gateLayout = getGateLayout(externalQuizRef.current);
      const bossQuizLayout = getBossQuizLayout(externalQuizRef.current);
      const bossQuizStandoffX = Math.max(
        44,
        getBossShieldXAtY(p.y) - BOSS_QUIZ_STANDOFF_GAP,
      );
      const maxX = isSelecting
        ? GATE_ENTRY_X + 20
        : isBossQuizActive
          ? Math.min(LOGICAL_W - 60, bossQuizStandoffX)
          : LOGICAL_W - 60;
      const minY = isSelecting
        ? gateLayout.tops[0] + 12
        : isBossQuizActive
          ? bossQuizLayout.tops[0] + 10
          : 48;
      const maxY = isSelecting
        ? gateLayout.tops[3] + gateLayout.height - 12
        : isBossQuizActive
          ? bossQuizLayout.tops[3] + bossQuizLayout.height - 10
          : LOGICAL_H - 48;
      p.x = Math.max(44, Math.min(maxX, p.x + totalDx));
      p.y = Math.max(minY, Math.min(maxY, p.y + totalDy));
      if (isBossQuizActive) {
        p.x = Math.min(
          p.x,
          Math.max(44, getBossShieldXAtY(p.y) - BOSS_QUIZ_STANDOFF_GAP),
        );
      } else if (simRef.current.boss?.shieldIntact) {
        p.x = Math.min(
          p.x,
          Math.max(44, getBossShieldXAtY(p.y) - 34),
        );
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (inputRef.current.activePointerId === e.pointerId) {
        const dtSinceMove = performance.now() - inputRef.current.lastMoveTime;
        const speed = Math.hypot(
          inputRef.current.flickVx,
          inputRef.current.flickVy,
        );
        if (gameStateRef.current === 'PLAYING' && dtSinceMove < 120 && speed > 240) {
          const maxGlide = 1200;
          const clampScale = speed > maxGlide ? maxGlide / speed : 1;
          inputRef.current.glideVx = inputRef.current.flickVx * clampScale;
          inputRef.current.glideVy = inputRef.current.flickVy * clampScale;
        }
        inputRef.current.activePointerId = null;
        inputRef.current.pointerDown = false;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (gameStateRef.current !== 'PLAYING') return;
      if (isInteractiveTarget(e.target)) return;
      e.preventDefault();
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('touchmove', onTouchMove, {passive: false});
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let lastTime = performance.now();
    let hudAccumulator = 0;
    const MAX_PARTICLES = 240;

    let cachedBgKey: string | null = null;
    let cachedSkyGrad: CanvasGradient | null = null;
    let cachedHorizonGrad: CanvasGradient | null = null;
    let cachedLavaGrad: CanvasGradient | null = null;
    const cachedShieldCurtains: {
      normal: CanvasGradient | null;
      overdrive: CanvasGradient | null;
      flash: CanvasGradient | null;
    } = {normal: null, overdrive: null, flash: null};

    const getCurrentCourse = () => {
      const id =
        gameStateRef.current === 'TITLE_MENU'
          ? previewCourseRef.current
          : simRef.current.courseId;
      return COURSES[id];
    };

    const pushParticle = (pt: ParticleEntity) => {
      const arr = simRef.current.particles;
      if (arr.length < MAX_PARTICLES) {
        arr.push(pt);
      } else if (pt.ring) {
        arr[Math.floor(Math.random() * arr.length)] = pt;
      }
    };

    const updateParticlesAndTexts = (dt: number) => {
      const pts = simRef.current.particles;
      for (let i = pts.length - 1; i >= 0; i--) {
        const pt = pts[i];
        pt.life -= dt;
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        if (pt.ring) pt.size += 210 * dt;
        if (pt.life <= 0) {
          pts[i] = pts[pts.length - 1];
          pts.pop();
        }
      }
      const fts = simRef.current.floatingTexts;
      for (let i = fts.length - 1; i >= 0; i--) {
        const ft = fts[i];
        ft.life -= dt;
        ft.y -= 28 * dt;
        if (ft.life <= 0) {
          fts[i] = fts[fts.length - 1];
          fts.pop();
        }
      }
    };

    const spawnParticles = (
      x: number,
      y: number,
      color: string,
      count: number,
      speed = 180,
      ring = false,
    ) => {
      if (ring) {
        pushParticle({
          x,
          y,
          vx: 0,
          vy: 0,
          life: 0.3,
          maxLife: 0.3,
          size: 10,
          color,
          ring: true,
        });
      }
      const s = simRef.current;
      const room = Math.max(0, MAX_PARTICLES - s.particles.length);
      const spawnCount = room > 0 ? Math.min(count, room) : 0;
      for (let i = 0; i < spawnCount; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = speed * (0.3 + Math.random() * 0.85);
        s.particles.push({
          x,
          y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          life: 0.22 + Math.random() * 0.3,
          maxLife: 0.52,
          size: 2 + Math.random() * 3.2,
          color,
        });
      }
    };

    const triggerShake = (intensity: number, duration: number) => {
      if (!settingsRef.current.screenShake) return;
      const s = simRef.current;
      s.shakeIntensity = Math.max(s.shakeIntensity, intensity);
      s.shakeTimer = Math.max(s.shakeTimer, duration);
    };

    const applyFlatScoreDelta = (delta: number) => {
      const s = simRef.current;
      if (delta >= 0) {
        s.score += delta;

        // LV10 MAX到達後は、青天井に増加する要求スコア達成ごとにシールド回復＆2回目で隠し強化解放
        if (s.level >= MAX_WEAPON_LEVEL) {
          s.shieldScoreProgress += delta;
          if (s.shieldScoreProgress >= s.shieldScoreRequired) {
            const recoveredShield = s.player.shield < s.player.maxShield;
            if (recoveredShield) {
              s.player.shield = Math.min(s.player.maxShield, s.player.shield + 1);
            }
            s.postMaxShieldMilestones += 1;
            s.shieldScoreProgress = 0;
            s.shieldScoreRequired = Math.round(
              s.shieldScoreRequired * 1.6 + 20000,
            );
            const justUnlockedHidden =
              !s.hiddenEvolutionUnlocked && s.postMaxShieldMilestones >= 2;
            if (justUnlockedHidden) {
              s.hiddenEvolutionUnlocked = true;
              synthAudio.playLevelUp();
              s.lastUpgradeBanner = `HIDDEN EVOLUTION: ${UPGRADE_PATTERNS[s.patternId].name} OVERDRIVE!!`;
              s.upgradeBannerTimer = 3.6;
              spawnParticles(s.player.x, s.player.y, '#FDE047', 30, 260, true);
              s.floatingTexts.push({
                x: s.player.x,
                y: s.player.y - 38,
                text: 'OVERDRIVE UNLOCKED!!',
                color: '#FDE047',
                life: 2.0,
                big: true,
              });
            } else if (recoveredShield) {
              synthAudio.playShieldRecover();
              s.lastUpgradeBanner = `SCORE BONUS: SHIELD +1 (NEXT ${s.shieldScoreRequired.toLocaleString()})`;
              s.upgradeBannerTimer = 3.0;
              spawnParticles(s.player.x, s.player.y, '#60A5FA', 22, 230, true);
              s.floatingTexts.push({
                x: s.player.x,
                y: s.player.y - 34,
                text: 'SHIELD +1',
                color: '#60A5FA',
                life: 1.6,
              });
            } else {
              synthAudio.playShieldRecover();
              s.lastUpgradeBanner = `OVERDRIVE CHARGE 1/2 (NEXT ${s.shieldScoreRequired.toLocaleString()})`;
              s.upgradeBannerTimer = 2.8;
              spawnParticles(s.player.x, s.player.y, '#22D3EE', 18, 210, true);
              s.floatingTexts.push({
                x: s.player.x,
                y: s.player.y - 34,
                text: 'LIMIT BREAK 1/2',
                color: '#22D3EE',
                life: 1.5,
              });
            }
          }
        }

        if (s.score > highScoreRef.current) {
          highScoreRef.current = s.score;
          onHighScoreUpdate(s.score);
          try {
            localStorage.setItem(HIGH_SCORE_KEY, String(s.score));
          } catch {
            // ignore
          }
        }
      } else {
        s.score = Math.max(0, s.score + delta);
      }
    };

    const getDifficultyScoreMult = () =>
      simRef.current.difficulty === 'hard' ? 1.5 : 1;

    const addFlatBonusScore = (base: number): number => {
      const gained = Math.round(base * getDifficultyScoreMult());
      applyFlatScoreDelta(gained);
      return gained;
    };

    const addScore = (base: number): number => {
      const s = simRef.current;
      s.combo += 1;
      s.comboTimer = 3.5;
      const mult = 1 + Math.min(s.combo * 0.1, 4.0);
      const gained = Math.round(base * mult * getDifficultyScoreMult());
      applyFlatScoreDelta(gained);
      return gained;
    };

    const applyUpgradeEffect = (
      kind: UpgradeStep['kind'],
      value: number,
      weaponId?: WeaponId,
      shieldSlotKey?: number,
    ) => {
      const s = simRef.current;
      if (kind === 'weapon_unlock' && weaponId) {
        const cur = s.weapons[weaponId] ?? 0;
        const maxLv = weaponId === 'drone' || weaponId === 'orbit' ? 3 : 5;
        s.weapons[weaponId] = Math.min(maxLv, cur + 1);
        if (s.weaponTimers[weaponId] === undefined) {
          s.weaponTimers[weaponId] = 0;
        }
      } else if (kind === 'fire_rate') {
        s.player.fireRateMult += value;
      } else if (kind === 'damage') {
        s.player.damageMult += value;
      } else if (kind === 'bullet_size') {
        s.player.bulletSizeMult += value;
      } else if (kind === 'shield') {
        const alreadyClaimed =
          shieldSlotKey !== undefined &&
          s.claimedShieldSteps.has(shieldSlotKey);
        if (!alreadyClaimed && s.player.shield < s.player.maxShield) {
          s.player.shield += 1;
          if (shieldSlotKey !== undefined) {
            s.claimedShieldSteps.add(shieldSlotKey);
          }
        } else {
          addScore(400);
        }
      } else if (kind === 'move_speed') {
        s.player.speed = Math.round(s.player.speed * (1 + value));
      }
    };

    const applyAutoUpgradeStep = () => {
      const s = simRef.current;
      const pattern = UPGRADE_PATTERNS[s.patternId];
      if (s.upgradeIndex >= pattern.steps.length) return;
      const stepIdx = s.upgradeIndex;
      const step = pattern.steps[stepIdx];
      s.upgradeIndex += 1;

      applyUpgradeEffect(step.kind, step.value, step.weaponId, stepIdx * 2);
      if (step.extra) {
        applyUpgradeEffect(
          step.extra.kind,
          step.extra.value,
          step.extra.weaponId,
          stepIdx * 2 + 1,
        );
      }

      s.lastUpgradeBanner = `POWER UP: ${step.label}`;
      s.upgradeBannerTimer = 2.8;
      spawnParticles(s.player.x, s.player.y, pattern.accent, 18, 210, true);
      s.floatingTexts.push({
        x: s.player.x,
        y: s.player.y - 34,
        text: step.label,
        color: pattern.accent,
        life: 1.6,
      });
    };

    const rebuildLoadoutForLevel = (targetLevel: number) => {
      const s = simRef.current;
      const pat = UPGRADE_PATTERNS[s.patternId];
      s.weapons = {normal: 1};
      s.upgradeIndex = 0;
      s.player.damageMult = pat.baseDamageMult ?? 1;
      s.player.fireRateMult = pat.baseFireRateMult ?? 1;
      s.player.bulletSizeMult = 1;
      s.player.speed = 420;

      const stepsToApply = Math.min(pat.steps.length, Math.max(0, targetLevel - 1));
      for (let idx = 0; idx < stepsToApply; idx++) {
        const step = pat.steps[idx];
        s.upgradeIndex += 1;
        if (step.kind !== 'shield') {
          applyUpgradeEffect(step.kind, step.value, step.weaponId);
        }
        if (step.extra && step.extra.kind !== 'shield') {
          applyUpgradeEffect(
            step.extra.kind,
            step.extra.value,
            step.extra.weaponId,
          );
        }
      }
      if (
        (s.weapons.laser ?? 0) < 4 &&
        !(
          s.hiddenEvolutionUnlocked &&
          s.patternId === 'balance' &&
          (s.weapons.laser ?? 0) >= 1
        )
      ) {
        s.laserStreamStrength = 0;
      }
    };

    const applyQuizPenaltyXpDrop = () => {
      const s = simRef.current;
      let totalXp = 0;
      let req = 40;
      for (let lv = 1; lv < s.level && lv < MAX_WEAPON_LEVEL; lv++) {
        totalXp += req;
        req = Math.round(req * 1.24 + 14);
      }
      if (s.level < MAX_WEAPON_LEVEL) {
        totalXp += s.xp;
      }

      const lostHiddenEvo = s.hiddenEvolutionUnlocked;
      s.hiddenEvolutionUnlocked = false;
      s.postMaxShieldMilestones = 0;

      if (totalXp <= 0) return;

      const prevLevel = s.level;
      let rem = Math.max(0, Math.floor(totalXp * 0.8));
      let newLevel = 1;
      let newReq = 40;
      while (newLevel < MAX_WEAPON_LEVEL && rem >= newReq) {
        rem -= newReq;
        newLevel += 1;
        newReq = Math.round(newReq * 1.24 + 14);
      }

      s.level = newLevel;
      s.xpToNext = newReq;
      s.xp = newLevel >= MAX_WEAPON_LEVEL ? newReq : rem;
      // 注意: s.shieldScoreProgress と s.shieldScoreRequired は維持（リセットしない）

      if (newLevel < prevLevel) {
        rebuildLoadoutForLevel(newLevel);
        s.lastUpgradeBanner = `PENALTY: ${lostHiddenEvo ? '隠し強化解除 · ' : ''}LV.${prevLevel} → LV.${newLevel} (EXP -20%)`;
        s.upgradeBannerTimer = 3.2;
        s.floatingTexts.push({
          x: s.player.x,
          y: s.player.y - 64,
          text: lostHiddenEvo ? `OVERDRIVE LOST · LV.${newLevel}` : `LEVEL DOWN LV.${newLevel}`,
          color: '#FB7185',
          life: 2.0,
        });
      } else if (lostHiddenEvo) {
        s.lastUpgradeBanner = 'PENALTY: 隠し強化解除 (EXP -20%)';
        s.upgradeBannerTimer = 3.0;
        s.floatingTexts.push({
          x: s.player.x,
          y: s.player.y - 64,
          text: 'OVERDRIVE LOST · EXP -20%',
          color: '#FB7185',
          life: 1.9,
        });
      } else {
        s.floatingTexts.push({
          x: s.player.x,
          y: s.player.y - 64,
          text: 'EXP -20%',
          color: '#FB7185',
          life: 1.8,
        });
      }
    };

    const emitHudNow = () => {
      const s = simRef.current;
      const st = getCurrentCourse();
      const pattern = UPGRADE_PATTERNS[s.patternId];
      const isMaxLevel = s.level >= MAX_WEAPON_LEVEL;
      const nextStep =
        !isMaxLevel && s.upgradeIndex < pattern.steps.length
          ? pattern.steps[s.upgradeIndex].label
          : s.hiddenEvolutionUnlocked
            ? s.player.shield < s.player.maxShield
              ? `OVERDRIVE ★ · SHIELD +1 (${(s.shieldScoreRequired - s.shieldScoreProgress).toLocaleString()} PTS)`
              : `OVERDRIVE ★ (次回 ${s.shieldScoreRequired.toLocaleString()} PTS)`
            : s.player.shield < s.player.maxShield
              ? `SHIELD +1 (${(s.shieldScoreRequired - s.shieldScoreProgress).toLocaleString()} PTS)`
              : `LV MAX (次回 ${s.shieldScoreRequired.toLocaleString()} PTS)`;
      const activeBossQuiz =
        s.boss && s.boss.quizState !== 'none' && s.boss.quizQuestion ? s.boss : null;
      const activeQuizQuestion = activeBossQuiz
        ? activeBossQuiz.quizQuestion
        : s.quizQuestion;
      const activeQuizMode: 'none' | 'gate' | 'boss_shield' =
        s.quizPhase !== 'none'
          ? 'gate'
          : activeBossQuiz
            ? 'boss_shield'
            : 'none';

      onHudUpdate({
        shield: s.player.shield,
        maxShield: s.player.maxShield,
        score: s.score,
        highScore: highScoreRef.current,
        level: s.level,
        isMaxLevel,
        xp: s.xp,
        xpToNext: s.xpToNext,
        shieldScoreProgress: s.shieldScoreProgress,
        shieldScoreRequired: s.shieldScoreRequired,
        hiddenEvolution: s.hiddenEvolutionUnlocked,
        postMaxShieldMilestones: s.postMaxShieldMilestones,
        combo: s.combo,
        comboTimerRatio: s.comboTimer / 3.5,
        courseId: s.courseId,
        difficulty: s.difficulty,
        stageNumber: s.stageNumber,
        stageHalf: s.stageHalf,
        itemsEnabled: s.itemsEnabled,
        isEndless: s.isEndless,
        endlessLoop: s.endlessLoop,
        stageProgress: (() => {
          const halfDur = Math.max(1, st.stageDurationSec / 2);
          const halfProg = Math.min(1, s.stageTimer / halfDur);
          return s.stageHalf === 1 ? halfProg * 0.5 : 0.5 + halfProg * 0.5;
        })(),
        weapons: {...s.weapons},
        patternId: s.patternId,
        nextUpgradeLabel: nextStep,
        lastUpgradeBanner: s.lastUpgradeBanner,
        bossActive: Boolean(s.boss),
        bossName: s.boss?.name ?? '',
        bossHp: s.boss?.hp ?? 0,
        bossMaxHp: s.boss?.maxHp ?? 1,
        bossPhase: s.boss?.phase ?? 1,
        warningText: s.warningText,
        enemiesDefeated: s.enemiesDefeated,
        elapsedTime: s.elapsedTime,
        quizActive: activeQuizMode !== 'none',
        quizMode: activeQuizMode,
        bossQuizNumber: activeBossQuiz?.quizCount ?? 0,
        quizTimeRemaining: activeBossQuiz ? activeBossQuiz.quizTimer : s.quizTimer,
        quizFeedbackRemaining: activeBossQuiz
          ? activeBossQuiz.quizFeedbackTimer
          : s.quizFeedbackTimer,
        quizResult: activeBossQuiz ? activeBossQuiz.quizResult : s.quizResult,
        quizQuestionCategory: activeQuizQuestion?.category ?? '',
        quizQuestionText: activeQuizQuestion?.question ?? '',
        quizCorrectLabel: activeQuizQuestion
          ? GATE_LABELS[activeQuizQuestion.correctIndex]
          : '',
        quizCorrectChoiceText: activeQuizQuestion
          ? activeQuizQuestion.choices[activeQuizQuestion.correctIndex]
          : '',
        quizAnsweredCorrectlyCount: s.quizAnsweredCorrect,
        quizTotalAnsweredCount: s.quizTotalAnswered,
      });
    };

    const startBossQuiz = (boss: BossEntity) => {
      const s = simRef.current;
      boss.quizState = 'push';
      boss.quizPushTimer = BOSS_SHIELD_ACTIVE_DURATION;
      boss.quizTimer = BOSS_QUIZ_TIME_LIMIT_SEC;
      boss.shieldTimer = BOSS_SHIELD_ACTIVE_DURATION;
      boss.shieldFadeTimer = BOSS_SHIELD_FADE_DURATION;
      boss.shieldFlashTimer = 0.14;
      boss.shieldIntact = true;
      boss.shieldShatterTimer = 0;
      boss.shieldShards = [];
      boss.quizQuestion = pickNextQuizQuestion(
        s.usedQuizIds,
        s.courseId,
        s.revengeMode,
      );
      boss.quizTargetDamage = [0, 0, 0, 0];
      boss.quizNoHitTimers = [0, 0, 0, 0];
      boss.quizSelectedIdx = null;
      boss.quizResult = 'none';
      boss.quizFeedbackTimer = 0;
      boss.quizCount += 1;
      boss.laserState = 'idle';
      boss.laserTimer = Math.max(boss.laserTimer, 2.5);
      s.laserStreamStrength = 0;
      if (s.enemyBullets.length > 0) {
        for (const eb of s.enemyBullets) {
          spawnParticles(eb.x, eb.y, '#38BDF8', 3, 95);
        }
        s.enemyBullets = [];
      }
      // 既存の誤射を防ぐため、Normal以外の前方弾をクリア
      s.bullets = s.bullets.filter((b) => b.isBaseNormal);
      synthAudio.playWarning();
    };

    const damagePlayer = () => {
      const s = simRef.current;
      const p = s.player;
      if (
        p.invulnTimer > 0 ||
        s.playerDyingTimer > 0 ||
        s.endingPhase !== 'none' ||
        s.bossDyingTimer > 0
      ) {
        return;
      }

      synthAudio.playHit();
      triggerShake(8, 0.22);

      if (p.shield > 0) {
        p.shield -= 1;
        p.invulnTimer = 1.25;
        s.combo = 0;
        s.comboTimer = 0;
        spawnParticles(p.x, p.y, p.shield === 0 ? '#FB7185' : '#60A5FA', 20, 230, true);
        s.floatingTexts.push({
          x: p.x,
          y: p.y - 26,
          text: p.shield === 0 ? 'SHIELD BREAK!' : 'SHIELD GUARD',
          color: p.shield === 0 ? '#FB7185' : '#60A5FA',
          life: 1.1,
        });
        // ボス戦の誤答後（シールド残存中）に一撃でも被弾（シールド含む）したら即座に次の問題へ移行
        if (s.boss && s.boss.shieldIntact && s.boss.quizState === 'none') {
          s.boss.quizCooldownTimer = BOSS_QUIZ_COOLDOWN_SEC;
          startBossQuiz(s.boss);
        }
        return;
      }

      // シールド0での被弾：すぐには切り替えず連続爆発の余韻を見せる
      p.invulnTimer = 2.0;
      s.combo = 0;
      s.comboTimer = 0;
      s.laserStreamStrength = 0;
      s.playerDyingTimer = 1.65;
      s.playerExplosionBurstTimer = 0.16;
      s.playerHullDestroyed = false;
      spawnParticles(p.x, p.y, '#FB923C', 26, 250, true);
      synthAudio.playExplosion(true);
      triggerShake(10, 0.32);
    };

    const spawnEnemyWave = () => {
      const s = simRef.current;
      const course = getCurrentCourse();
      s.waveCount += 1;
      const stNum = s.stageNumber;
      const endlessLoop = s.endlessLoop;
      const attackStageNum = stNum + (s.difficulty === 'hard' ? 1 : 0);
      const attackEndlessLoop = endlessLoop + (s.difficulty === 'hard' ? 1 : 0);
      const stageFactor = s.isEndless
        ? 2.2 + endlessLoop * 0.75 + endlessLoop * endlessLoop * 0.28
        : 1 + (stNum - 1) * 0.18 + s.elapsedTime / 210;

      const allEnemyTypes: EnemyTypeId[] = [
        'drone',
        'interceptor',
        'heli',
        'turret',
        'insect',
        'heavy',
      ];
      const pool = s.isEndless ? allEnemyTypes : course.enemyPool;

      const pick = pool[Math.floor(Math.random() * pool.length)];
      const tpl = ENEMIES[pick];

      const endlessExtraCount = s.isEndless
        ? Math.min(4, Math.floor((attackEndlessLoop + 1) / 2))
        : 0;
      const groupCount =
        (pick === 'drone'
          ? attackStageNum === 1
            ? 3
            : 4
          : pick === 'interceptor' || pick === 'insect'
            ? course.id === 'cyber_vault' || s.isEndless
              ? 3
              : 2
            : pick === 'turret' && (course.id === 'foundry' || s.isEndless)
              ? 2
              : 1) + endlessExtraCount;

      const baseY =
        pick === 'turret'
          ? Math.random() < 0.5
            ? 56
            : LOGICAL_H - 56
          : 88 + Math.random() * (LOGICAL_H - 176);

      const cooldownScale = s.isEndless
        ? Math.max(0.32, 0.92 - attackEndlessLoop * 0.12)
        : attackStageNum === 1
          ? 1.85
          : attackStageNum === 2
            ? 1.35
            : 1.0;

      // グラディウス方式：アイテム出現有効時のみ、一部に赤い機体を混ぜて経験値チップを落とす
      const hasRedInWave =
        s.itemsEnabled && (s.waveCount % 4 === 0 || Math.random() < 0.18);
      const redIdx = hasRedInWave ? Math.floor(Math.random() * groupCount) : -1;

      const endlessFormation = s.isEndless ? Math.floor(Math.random() * 4) : -1;

      for (let i = 0; i < groupCount; i++) {
        // エンドレスモードでは敵種も編隊内でランダム混成させ予測不能にする
        const unitType: EnemyTypeId =
          s.isEndless && Math.random() < 0.45
            ? allEnemyTypes[Math.floor(Math.random() * allEnemyTypes.length)]
            : pick;
        const unitTpl = ENEMIES[unitType];

        let y = baseY;
        let xOffset = i * 48;

        if (s.isEndless) {
          if (endlessFormation === 0) {
            // 上下挟撃散開
            y = i % 2 === 0 ? 70 + Math.random() * 170 : LOGICAL_H - 70 - Math.random() * 170;
            xOffset = i * (36 + Math.random() * 40);
          } else if (endlessFormation === 1) {
            // ジグザグ波状
            y = Math.max(54, Math.min(LOGICAL_H - 54, baseY + Math.sin(i * 1.4) * 140));
            xOffset = i * 52;
          } else if (endlessFormation === 2) {
            // 完全ランダム配置
            y = 58 + Math.random() * (LOGICAL_H - 116);
            xOffset = Math.random() * 170;
          } else {
            // 密集ライン突撃
            y = Math.max(52, Math.min(LOGICAL_H - 52, baseY + (i - (groupCount - 1) / 2) * 48));
            xOffset = i * 38;
          }
        } else if (pick === 'turret' && course.id === 'foundry' && groupCount === 2) {
          y = i === 0 ? 54 : LOGICAL_H - 54;
          xOffset = i * 24;
        } else if (course.id === 'cyber_vault' && groupCount >= 3) {
          const mid = (groupCount - 1) / 2;
          const distFromMid = Math.abs(i - mid);
          y = Math.max(54, Math.min(LOGICAL_H - 54, baseY + (i - mid) * 56));
          xOffset = distFromMid * 46;
        } else if (course.id === 'orbital') {
          y = Math.max(54, Math.min(LOGICAL_H - 54, baseY + (i - (groupCount - 1) / 2) * 64));
          xOffset = i * 62;
        } else if (pick !== 'turret') {
          y = Math.max(52, Math.min(LOGICAL_H - 52, baseY + (i - (groupCount - 1) / 2) * 52));
        }

        // 最弱の小型ドローンは通常ステージでは1発撃破(7HP)、エンドレスはループごとに強化（HARDは耐久1.5倍）
        const hardHpMult = s.difficulty === 'hard' ? 1.5 : 1;
        const baseMaxHp =
          unitType === 'drone' && !s.isEndless
            ? 7
            : Math.max(7, Math.round(unitTpl.hp * stageFactor));
        const maxHp = Math.round(baseMaxHp * hardHpMult);

        const speedMult = s.isEndless
          ? 1.08 + Math.min(0.65, endlessLoop * 0.11) + Math.random() * 0.25
          : course.id === 'orbital'
            ? 1.08
            : 1;

        s.enemies.push({
          id: s.nextId++,
          type: unitType,
          isRedCarrier: i === redIdx,
          x: LOGICAL_W + 45 + xOffset,
          y,
          baseY: y,
          vx: -unitTpl.speed * speedMult,
          vy: 0,
          hp: maxHp,
          maxHp,
          radius: unitTpl.radius,
          fireTimer: (0.85 + Math.random() * unitTpl.fireCooldown) * cooldownScale,
          age: i * 0.35,
          flashTimer: 0,
        });
      }
    };

    const spawnItemPod = () => {
      const s = simRef.current;
      const y = 96 + Math.random() * (LOGICAL_H - 192);
      s.items.push({
        id: s.nextId++,
        x: LOGICAL_W + 40,
        y,
        baseY: y,
        vx: -115,
        hp: 10,
        maxHp: 10,
        radius: 22,
        age: 0,
        flashTimer: 0,
        chipCount: 3,
        chipValue: 12,
      });
    };

    const popItemPod = (item: ItemEntity) => {
      const s = simRef.current;
      synthAudio.playXp();
      spawnParticles(item.x, item.y, '#4ADE80', 18, 220, true);
      for (let k = 0; k < item.chipCount; k++) {
        const ang = (k * Math.PI * 2) / item.chipCount + Math.random() * 0.5;
        s.pickups.push({
          x: item.x + Math.cos(ang) * 14,
          y: item.y + Math.sin(ang) * 14,
          vx: Math.cos(ang) * 110 - 30,
          vy: Math.sin(ang) * 110,
          age: 0,
          value: item.chipValue,
          isBonus: true,
        });
      }
      const gained = addScore(150);
      s.floatingTexts.push({
        x: item.x,
        y: item.y - 22,
        text: `+${gained}`,
        color: '#4ADE80',
        life: 0.95,
      });
    };

    const getBossDisplayName = () => {
      const s = simRef.current;
      const course = getCurrentCourse();
      if (s.isEndless) return `${course.bossName} Ω-${s.endlessLoop}`;
      return s.stageNumber >= 2
        ? `${course.bossName} MK-${s.stageNumber}`
        : course.bossName;
    };

    const beginBossIntro = () => {
      const s = simRef.current;
      // スクロール前に残存している雑魚敵・敵弾をすべて爆散させて安全を確保
      if (s.enemies.length > 0) {
        synthAudio.playExplosion(false);
        for (const e of s.enemies) {
          const tpl = ENEMIES[e.type];
          spawnParticles(e.x, e.y, '#FB923C', 14, 240, true);
          spawnParticles(e.x, e.y, tpl.color, 6, 170);
        }
        s.enemies = [];
      }
      if (s.enemyBullets.length > 0) {
        for (const eb of s.enemyBullets) {
          spawnParticles(eb.x, eb.y, '#FB923C', 3, 95);
        }
        s.enemyBullets = [];
      }
      s.bossIntroTimer = 1.4;
      s.warningText = getBossDisplayName();
      s.warningTimer = 2.9;
      synthAudio.playWarning();
    };

    const spawnBoss = () => {
      const s = simRef.current;
      const course = getCurrentCourse();
      const stageTier =
        (s.isEndless ? 8 + s.endlessLoop : s.stageNumber) +
        (s.difficulty === 'hard' ? 1 : 0);
      const scale = s.isEndless
        ? 3.8 + s.endlessLoop * 1.45 + s.endlessLoop * s.endlessLoop * 0.45
        : 1 + (s.stageNumber - 1) * 0.34;
      const hardHpMult = s.difficulty === 'hard' ? 1.5 : 1;
      const maxHp = Math.round(1350 * scale * hardHpMult);
      const displayName = getBossDisplayName();
      s.warningText = displayName;
      s.warningTimer = Math.max(s.warningTimer, 1.5);
      const boss: BossEntity = {
        name: displayName,
        shape: course.bossShape,
        stageTier,
        x: LOGICAL_W + 100,
        targetX: LOGICAL_W - 190,
        y: LOGICAL_H / 2,
        hp: maxHp,
        maxHp,
        radius: 76,
        phase: 1,
        prevPhase: 1,
        age: 0,
        movePhase: 0,
        fireTimer: 1.5,
        subFireTimer: 1.75,
        laserState: 'idle',
        laserTimer: 4.6,
        laserY: LOGICAL_H / 2,
        flashTimer: 0,
        shieldTimer: BOSS_SHIELD_ACTIVE_DURATION,
        shieldFadeTimer: BOSS_SHIELD_FADE_DURATION,
        shieldFlashTimer: 0,
        shieldIntact: true,
        shieldShatterTimer: 0,
        shieldShards: [],
        quizState: 'none',
        quizPushTimer: 0,
        quizTimer: BOSS_QUIZ_TIME_LIMIT_SEC,
        quizQuestion: null,
        quizTargetDamage: [0, 0, 0, 0],
        quizNoHitTimers: [0, 0, 0, 0],
        quizSelectedIdx: null,
        quizResult: 'none',
        quizFeedbackTimer: 0,
        quizCount: 0,
        quizCooldownTimer: BOSS_QUIZ_COOLDOWN_SEC,
        lastQuizSolvedElapsed: -999,
        piercingQuizActive: false,
        consecutiveQuizMisses: 0,
        quizBoostTier: 0,
      };
      s.boss = boss;
      startBossQuiz(boss);
    };

    const fireWeapon = (weaponId: WeaponId, lv: number) => {
      const s = simRef.current;
      const p = s.player;
      const tpl = WEAPONS[weaponId];
      const dmg = Math.round(tpl.baseDamage * (1 + (lv - 1) * 0.25) * p.damageMult);
      const sz = p.bulletSizeMult;

      if (weaponId === 'normal') {
        s.bullets.push({
          id: s.nextId++,
          x: p.x + 26,
          y: p.y,
          vx: tpl.bulletSpeed,
          vy: 0,
          damage: dmg,
          radius: 5.5 * sz,
          color: tpl.color,
          kind: 'normal',
          isBaseNormal: true,
          pierce: 1,
          hitIds: new Set(),
          age: 0,
          maxAge: 1.8,
        });
        synthAudio.playShoot('normal');
      } else if (weaponId === 'twin') {
        for (const dy of [-11, 11]) {
          s.bullets.push({
            id: s.nextId++,
            x: p.x + 22,
            y: p.y + dy,
            vx: tpl.bulletSpeed + lv * 25,
            vy: 0,
            damage: dmg,
            radius: 5 * sz,
            color: tpl.color,
            kind: 'normal',
            pierce: 1,
            hitIds: new Set(),
            age: 0,
            maxAge: 1.8,
          });
        }
        synthAudio.playShoot('normal');
      } else if (weaponId === 'three_way') {
        for (const ang of [-0.24, 0, 0.24]) {
          s.bullets.push({
            id: s.nextId++,
            x: p.x + 20,
            y: p.y,
            vx: Math.cos(ang) * tpl.bulletSpeed,
            vy: Math.sin(ang) * tpl.bulletSpeed,
            damage: dmg,
            radius: (5.4 + (lv - 1) * 0.4) * sz,
            color: tpl.color,
            kind: 'normal',
            pierce: 1,
            hitIds: new Set(),
            age: 0,
            maxAge: 1.8,
          });
        }
        synthAudio.playShoot('normal');
      } else if (weaponId === 'cross_laser') {
        const isEvolvedA =
          s.hiddenEvolutionUnlocked && s.patternId === 'missile_guard';
        const crossDmg = isEvolvedA ? Math.round(dmg * 1.25) : dmg;
        for (const sign of [-1, 1]) {
          s.bullets.push({
            id: s.nextId++,
            x: p.x + 28,
            y: p.y,
            vx: tpl.bulletSpeed + lv * 35,
            vy: 0,
            damage: crossDmg,
            radius: (isEvolvedA ? 11.5 + lv * 1.4 : 7 + lv * 0.8) * sz,
            color: tpl.color,
            kind: 'cross_laser',
            pierce: (isEvolvedA ? 6 : 4) + lv,
            hitIds: new Set(),
            age: 0,
            maxAge: 2.2,
            originY: p.y,
            phaseSign: sign,
            beamHalfLen: 105 + lv * 12,
            level: lv,
            evolved: isEvolvedA,
          });
        }
        synthAudio.playShoot('laser');
      } else if (weaponId === 'back_shot') {
        const speed = tpl.bulletSpeed + (lv - 1) * 40;
        if (lv >= 3) {
          for (const ang of [Math.PI - 0.28, Math.PI, Math.PI + 0.28]) {
            s.bullets.push({
              id: s.nextId++,
              x: p.x - 24,
              y: p.y,
              vx: Math.cos(ang) * speed,
              vy: Math.sin(ang) * speed,
              damage: dmg,
              radius: 5.5 * sz,
              color: tpl.color,
              kind: 'back_shot',
              pierce: 1,
              hitIds: new Set(),
              age: 0,
              maxAge: 1.6,
            });
          }
        } else {
          const offsets = lv >= 2 ? [-9, 9] : [0];
          for (const dy of offsets) {
            s.bullets.push({
              id: s.nextId++,
              x: p.x - 24,
              y: p.y + dy,
              vx: -speed,
              vy: 0,
              damage: dmg,
              radius: 5.2 * sz,
              color: tpl.color,
              kind: 'back_shot',
              pierce: 1,
              hitIds: new Set(),
              age: 0,
              maxAge: 1.6,
            });
          }
        }
        synthAudio.playShoot('normal');
      } else if (weaponId === 'laser') {
        const isEvolvedC =
          s.hiddenEvolutionUnlocked && s.patternId === 'balance';
        const isEvolvedD =
          s.hiddenEvolutionUnlocked && s.patternId === 'pierce';
        const beamHalfLen = isEvolvedC
          ? 245 + lv * 45
          : 115 + lv * 55 + (lv >= 4 ? 95 : 0);
        const beamRadius =
          (isEvolvedC ? 9.5 + (lv - 1) * 4.2 : 8.5 + (lv - 1) * 5.2) * sz;
        s.bullets.push({
          id: s.nextId++,
          x: p.x + 26 + beamHalfLen,
          y: p.y,
          vx: tpl.bulletSpeed,
          vy: 0,
          damage: dmg,
          radius: beamRadius,
          color: tpl.color,
          kind: 'laser',
          pierce: 99,
          hitIds: new Set(),
          age: 0,
          maxAge: 2.2,
          beamHalfLen,
          level: lv,
          evolved: isEvolvedC || isEvolvedD,
        });
        synthAudio.playShoot('laser');
      } else if (weaponId === 'ripple') {
        const isEvolvedB = s.hiddenEvolutionUnlocked;
        s.bullets.push({
          id: s.nextId++,
          x: p.x + 26,
          y: p.y,
          vx: tpl.bulletSpeed,
          vy: 0,
          damage: isEvolvedB ? Math.round(dmg * 1.28) : dmg,
          radius: (isEvolvedB ? 17 : 13) * sz,
          color: tpl.color,
          kind: 'ripple',
          pierce: (isEvolvedB ? 8 : 5) + lv,
          hitIds: new Set(),
          age: 0,
          maxAge: isEvolvedB ? 2.3 : 2.1,
          growRate: (isEvolvedB ? 54 : 36) * sz,
          evolved: isEvolvedB,
        });
        synthAudio.playShoot('ripple');
      } else if (weaponId === 'missile') {
        const isBalanceC = s.patternId === 'balance';
        const isEvolvedA =
          s.hiddenEvolutionUnlocked && s.patternId === 'missile_guard';
        if (isBalanceC) {
          const isEvolvedC = s.hiddenEvolutionUnlocked;
          const salvos = [
            {dir: -1, xOff: 16, yOff: -10, vxMult: 0.78, vy: -240},
            {dir: 1, xOff: 16, yOff: 10, vxMult: 0.78, vy: 240},
            {dir: -1, xOff: 6, yOff: -18, vxMult: 0.56, vy: -350},
            {dir: 1, xOff: 6, yOff: 18, vxMult: 0.56, vy: 350},
          ];
          const cMissileDmg = Math.round(dmg * 0.8);
          for (const m of salvos) {
            s.bullets.push({
              id: s.nextId++,
              x: p.x + m.xOff,
              y: p.y + m.yOff,
              vx: tpl.bulletSpeed * m.vxMult,
              vy: m.vy,
              damage: cMissileDmg,
              radius: (isEvolvedC ? 7.2 : 6.5) * sz,
              color: tpl.color,
              kind: 'missile',
              pierce: 1,
              hitIds: new Set(),
              age: 0,
              maxAge: 2.6,
              homing: true,
              evolved: isEvolvedC,
            });
          }
        } else {
          const dirs = [-1, 1];
          for (const dir of dirs) {
            s.bullets.push({
              id: s.nextId++,
              x: p.x + 14,
              y: p.y + dir * 12,
              vx: tpl.bulletSpeed * 0.72,
              vy: dir * 290,
              damage: isEvolvedA ? Math.round(dmg * 1.18) : dmg,
              radius: (isEvolvedA ? 7.5 : 6.5) * sz,
              color: tpl.color,
              kind: 'missile',
              pierce: 1,
              hitIds: new Set(),
              age: 0,
              maxAge: isEvolvedA ? 2.8 : 2.2,
              homing: isEvolvedA,
              evolved: isEvolvedA,
            });
          }
        }
        synthAudio.playShoot('missile');
      } else if (weaponId === 'orbit') {
        const podCount = lv * 2;
        for (let i = 0; i < podCount; i++) {
          const ang = s.elapsedTime * 3.8 + (i * Math.PI * 2) / podCount;
          const ox = p.x + Math.cos(ang) * 58;
          const oy = p.y + Math.sin(ang) * 58;
          s.bullets.push({
            id: s.nextId++,
            x: ox + 10,
            y: oy,
            vx: tpl.bulletSpeed,
            vy: 0,
            damage: Math.round(dmg * 0.7),
            radius: 4.2 * sz,
            color: tpl.color,
            kind: 'normal',
            pierce: 1,
            hitIds: new Set(),
            age: 0,
            maxAge: 1.5,
          });
        }
      } else if (weaponId === 'drone') {
        for (let i = 0; i < lv; i++) {
          const ang = s.elapsedTime * 2.6 + (i * Math.PI * 2) / lv;
          const dx = p.x - 16 + Math.cos(ang) * 44;
          const dy = p.y + Math.sin(ang) * 44;
          s.bullets.push({
            id: s.nextId++,
            x: dx + 12,
            y: dy,
            vx: tpl.bulletSpeed,
            vy: 0,
            damage: dmg,
            radius: 4.8 * sz,
            color: tpl.color,
            kind: 'normal',
            pierce: 1,
            hitIds: new Set(),
            age: 0,
            maxAge: 2.0,
          });
        }
      }
    };

    const beginQuizGate = () => {
      const s = simRef.current;
      // 残存している雑魚敵・敵弾・アイテムをクリアし、ボス戦前と同様に自機を左に戻してからゲート選択へ移行
      if (s.enemies.length > 0) {
        for (const e of s.enemies) {
          spawnParticles(e.x, e.y, '#38BDF8', 8, 180, true);
        }
        s.enemies = [];
      }
      if (s.enemyBullets.length > 0) {
        s.enemyBullets = [];
      }
      s.items = [];
      s.laserStreamStrength = 0;
      s.warningTimer = 0;
      s.warningText = null;
      s.quizPhase = 'prepare';
      s.quizQuestion = pickNextQuizQuestion(
        s.usedQuizIds,
        s.courseId,
        s.revengeMode,
      );
      s.quizTimer = QUIZ_TIME_LIMIT_SEC;
      s.quizPrepareTimer = 0.65;
      s.quizSelectLockTimer = 0.2;
      s.quizFeedbackTimer = 0;
      s.quizBoostTimer = 0;
      s.quizSelectedGate = null;
      s.quizResult = 'none';
    };

    const advanceStage = () => {
      const s = simRef.current;
      if (s.isEndless) {
        s.endlessLoop += 1;
        s.stageNumber = 9;
        s.stageHalf = 1;
        s.stageTimer = 0;
        s.bossSpawnedForStage = false;
        s.bossIntroTimer = 0;
        beginQuizGate();
        return;
      }

      if (s.stageNumber >= 8) {
        s.enemies = [];
        s.enemyBullets = [];
        s.bossIntroTimer = 0;
        emitHudNow();
        onStateChange('STAGE_CLEAR');
        return;
      }

      s.stageNumber += 1;
      s.stageHalf = 1;
      s.stageTimer = 0;
      s.bossSpawnedForStage = false;
      s.bossIntroTimer = 0;
      beginQuizGate();
    };

    const updateSimulation = (dt: number) => {
      const s = simRef.current;
      const p = s.player;
      const st = getCurrentCourse();

      // 1. 自機撃破後の連続爆発余韻フェーズ -> GAME OVER遷移
      if (s.playerDyingTimer > 0) {
        const slowDt = dt * 0.35;
        s.elapsedTime += slowDt;
        s.bgOffset += st.scrollSpeed * slowDt;
        s.playerDyingTimer = Math.max(0, s.playerDyingTimer - dt);
        s.playerExplosionBurstTimer -= dt;
        p.tilt += dt * 0.55;

        if (s.playerDyingTimer > 0.45 && s.playerExplosionBurstTimer <= 0) {
          s.playerExplosionBurstTimer = 0.19;
          const ox = p.x + (Math.random() - 0.5) * 38;
          const oy = p.y + (Math.random() - 0.5) * 32;
          spawnParticles(ox, oy, '#FB923C', 14, 210, true);
          spawnParticles(ox, oy, '#FDE047', 6, 160);
          synthAudio.playExplosion(false);
          triggerShake(6, 0.18);
        } else if (!s.playerHullDestroyed && s.playerDyingTimer <= 0.45) {
          s.playerHullDestroyed = true;
          spawnParticles(p.x, p.y, '#F43F5E', 44, 330, true);
          spawnParticles(p.x, p.y, '#FBBF24', 22, 260);
          synthAudio.playExplosion(true);
          triggerShake(11, 0.36);
        }

        for (const e of s.enemies) {
          e.x += e.vx * slowDt;
        }
        for (const eb of s.enemyBullets) {
          eb.x += eb.vx * slowDt;
          eb.y += eb.vy * slowDt;
        }
        updateParticlesAndTexts(dt);

        if (s.playerDyingTimer === 0) {
          if (!s.scoreRecordedForRun) {
            s.scoreRecordedForRun = true;
            onRunEndRef.current({
              courseId: s.courseId,
              score: s.score,
              patternId: s.patternId,
              stageNumber: s.stageNumber,
              endlessLoop: s.endlessLoop,
              difficulty: s.difficulty,
            });
          }
          emitHudNow();
          onStateChange('GAME_OVER');
        }
        return;
      }

      // 2. Stage 8 ボス撃破後のエンディング飛行フェーズ -> CONGRATULATION!! 遷移
      if (s.endingPhase !== 'none') {
        s.elapsedTime += dt;
        s.endingTimer = Math.max(0, s.endingTimer - dt);
        s.laserStreamStrength = 0;

        if (s.endingPhase === 'move_left') {
          s.bgOffset += st.scrollSpeed * 1.15 * dt;
          const prevY = p.y;
          p.x += (210 - p.x) * Math.min(1, dt * 5.2);
          p.y += (LOGICAL_H / 2 - p.y) * Math.min(1, dt * 5.2);
          const vy = (p.y - prevY) / Math.max(dt, 0.001);
          p.tilt += (Math.max(-0.25, Math.min(0.25, vy * 0.00075)) - p.tilt) * Math.min(1, dt * 12);
          p.prevX = p.x;
          p.prevY = p.y;
          if (s.endingTimer === 0) {
            s.endingPhase = 'boost_right';
            s.endingTimer = 0.95;
            synthAudio.playBoost();
            spawnParticles(p.x - 18, p.y, '#22D3EE', 22, 240, true);
          }
        } else {
          const progress = 1 - s.endingTimer / 0.95;
          s.bgOffset += st.scrollSpeed * (2.6 + progress * 4.2) * dt;
          p.tilt += (0 - p.tilt) * Math.min(1, dt * 16);
          p.x += (420 + progress * 2350) * dt;
          p.prevX = p.x;
          p.prevY = p.y;
          for (let k = 0; k < 2; k++) {
            pushParticle({
              x: p.x - 24 - Math.random() * 14,
              y: p.y + (Math.random() - 0.5) * 10,
              vx: -480 - Math.random() * 260,
              vy: (Math.random() - 0.5) * 50,
              life: 0.25 + Math.random() * 0.16,
              maxLife: 0.41,
              size: 3 + Math.random() * 4,
              color: Math.random() < 0.5 ? '#22D3EE' : '#FFFFFF',
            });
          }
          if (s.endingTimer === 0 || p.x > LOGICAL_W + 140) {
            s.endingPhase = 'none';
            s.endingTimer = 0;
            emitHudNow();
            onStateChange('STAGE_CLEAR');
          }
        }

        for (let i = s.bullets.length - 1; i >= 0; i--) {
          const b = s.bullets[i];
          b.age += dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          if (b.age >= b.maxAge || b.x > LOGICAL_W + 200) s.bullets.splice(i, 1);
        }
        updateParticlesAndTexts(dt);
        return;
      }

      // 3. クイズゲート選択 & エンディング風のエリア移動ブースト演出
      if (s.quizPhase !== 'none') {
        s.elapsedTime += dt;
        if (s.upgradeBannerTimer > 0) {
          s.upgradeBannerTimer = Math.max(0, s.upgradeBannerTimer - dt);
          if (s.upgradeBannerTimer === 0) s.lastUpgradeBanner = null;
        }
        if (p.invulnTimer > 0) p.invulnTimer = Math.max(0, p.invulnTimer - dt);

        const gateLayout = getGateLayout(externalQuizRef.current);

        if (s.quizPhase === 'prepare') {
          s.laserStreamStrength = Math.max(0, s.laserStreamStrength - dt * 10);
          s.bgOffset += st.scrollSpeed * 6.5 * dt;
          const prevY = p.y;
          p.x += (GATE_START_X - p.x) * Math.min(1, dt * 8.5);
          const clampedTargetY = Math.max(
            gateLayout.tops[0] + 24,
            Math.min(gateLayout.tops[3] + gateLayout.height - 24, p.y),
          );
          p.y += (clampedTargetY - p.y) * Math.min(1, dt * 8.5);
          const vy = (p.y - prevY) / Math.max(dt, 0.001);
          p.tilt +=
            (Math.max(-0.25, Math.min(0.25, vy * 0.00075)) - p.tilt) *
            Math.min(1, dt * 12);
          p.prevX = p.x;
          p.prevY = p.y;

          s.quizPrepareTimer = Math.max(0, s.quizPrepareTimer - dt);
          if (s.quizPrepareTimer === 0) {
            p.x = GATE_START_X;
            p.prevX = p.x;
            s.quizPhase = 'selecting';
            s.quizSelectLockTimer = 0.2;
          }
        } else if (s.quizPhase === 'selecting') {
          s.bgOffset += st.scrollSpeed * 0.9 * dt;

          if (s.quizSelectLockTimer > 0) {
            s.quizSelectLockTimer = Math.max(0, s.quizSelectLockTimer - dt);
          }

          // 時間制限までに徐々に右へ押し出し、上下操作だけで自然にゲートへ入れるようにする
          p.x += GATE_DRIFT_VX * dt;

          const keys = inputRef.current.keys;
          let kx = 0;
          let ky = 0;
          if (keys.has('ArrowLeft') || keys.has('KeyA')) kx -= 1;
          if (keys.has('ArrowRight') || keys.has('KeyD')) kx += 1;
          if (keys.has('ArrowUp') || keys.has('KeyW')) ky -= 1;
          if (keys.has('ArrowDown') || keys.has('KeyS')) ky += 1;
          if (inputRef.current.tapFireTimer > 0) {
            inputRef.current.tapFireTimer = Math.max(
              0,
              inputRef.current.tapFireTimer - dt,
            );
          }

          if (kx !== 0 || ky !== 0) {
            const len = Math.hypot(kx, ky);
            p.x += (kx / len) * p.speed * dt;
            p.y += (ky / len) * p.speed * dt;
            inputRef.current.glideVx = 0;
            inputRef.current.glideVy = 0;
          } else if (
            Math.abs(inputRef.current.glideVx) > 6 ||
            Math.abs(inputRef.current.glideVy) > 6
          ) {
            p.x += inputRef.current.glideVx * dt;
            p.y += inputRef.current.glideVy * dt;
            const damp = Math.exp(-dt * 15);
            inputRef.current.glideVx *= damp;
            inputRef.current.glideVy *= damp;
          }
          p.x = Math.max(44, Math.min(GATE_ENTRY_X + 20, p.x));
          p.y = Math.max(
            gateLayout.tops[0] + 12,
            Math.min(gateLayout.tops[3] + gateLayout.height - 12, p.y),
          );

          const moveSpeed = Math.hypot(p.x - p.prevX, p.y - p.prevY) / Math.max(dt, 0.001);
          const vyApprox = (p.y - p.prevY) / Math.max(dt, 0.001);
          p.prevX = p.x;
          p.prevY = p.y;
          p.tilt +=
            (Math.max(-0.32, Math.min(0.32, vyApprox * 0.00075)) - p.tilt) *
            Math.min(1, dt * 14);

          // ゲート選択中もオートショット／射撃を継続（問題文・選択肢は手前でクリップして可読性を維持）
          const isFiring =
            settingsRef.current.autoShot ||
            keys.has('Space') ||
            keys.has('KeyZ') ||
            inputRef.current.pointerDown ||
            inputRef.current.tapFireTimer > 0;
          const laserLv = s.weapons.laser ?? 0;
          const hasStreamLaser =
            laserLv >= 4 ||
            (s.hiddenEvolutionUnlocked &&
              s.patternId === 'balance' &&
              laserLv >= 1);
          if (isFiring && hasStreamLaser) {
            if (moveSpeed < 45) {
              s.laserStreamStrength = Math.min(1, s.laserStreamStrength + dt * 7.5);
            } else {
              s.laserStreamStrength = Math.max(0.22, s.laserStreamStrength - dt * 5);
            }
          } else {
            s.laserStreamStrength = Math.max(0, s.laserStreamStrength - dt * 9);
          }
          if (isFiring) {
            const entries = Object.entries(s.weapons) as [WeaponId, number][];
            for (const [wId, lv] of entries) {
              if (!lv || lv <= 0) continue;
              const prev = s.weaponTimers[wId] ?? 0;
              const next = prev - dt;
              if (next <= 0) {
                fireWeapon(wId, lv);
                let interval =
                  WEAPONS[wId].fireInterval /
                  (p.fireRateMult * (1 + (lv - 1) * 0.08));
                if (
                  wId === 'laser' &&
                  s.hiddenEvolutionUnlocked &&
                  s.patternId === 'balance'
                ) {
                  interval *= 0.42;
                }
                s.weaponTimers[wId] = interval;
              } else {
                s.weaponTimers[wId] = next;
              }
            }
          }

          s.quizTimer = Math.max(0, s.quizTimer - dt);

          const resolveGate = (chosenIdx: number | null, timedOut: boolean) => {
            const q = s.quizQuestion;
            s.quizSelectedGate = chosenIdx;
            s.quizTotalAnswered += 1;
            const isCorrect =
              !timedOut &&
              chosenIdx !== null &&
              q !== null &&
              chosenIdx === q.correctIndex;

            if (timedOut) {
              s.quizResult = 'timeout';
              s.itemsEnabled = false;
              if (q) {
                recordWrongTerm(q.termId);
              }
              synthAudio.playQuizWrong();
              applyFlatScoreDelta(-1000);
              s.floatingTexts.push({
                x: p.x,
                y: p.y - 36,
                text: '-1000',
                color: '#FB7185',
                life: 1.8,
                big: true,
              });
              applyQuizPenaltyXpDrop();
            } else if (isCorrect) {
              s.quizResult = 'correct';
              s.itemsEnabled = true;
              s.quizAnsweredCorrect += 1;
              if (q) {
                recordSolvedTerm(q.termId);
                onTermSolvedRef.current?.();
              }
              synthAudio.playQuizCorrect();
              spawnParticles(p.x, p.y, '#10B981', 24, 240, true);
              const quizBonus = addFlatBonusScore(1000);
              s.floatingTexts.push({
                x: p.x,
                y: p.y - 36,
                text: `+${quizBonus}`,
                color: '#34D399',
                life: 1.6,
                big: true,
              });
            } else {
              s.quizResult = 'wrong';
              s.itemsEnabled = false;
              if (q) {
                recordWrongTerm(q.termId);
              }
              synthAudio.playQuizWrong();
              spawnParticles(p.x, p.y, '#F43F5E', 20, 220, true);
              applyFlatScoreDelta(-1000);
              s.floatingTexts.push({
                x: p.x,
                y: p.y - 36,
                text: '-1000',
                color: '#FB7185',
                life: 1.8,
                big: true,
              });
              applyQuizPenaltyXpDrop();
            }
            s.quizPhase = 'feedback';
            // 正解時は+2秒、不正解・時間切れ時は+4秒待機してから次エリアへ遷移
            s.quizFeedbackTimer = isCorrect ? 2.72 : 4.72;
          };

          if (s.quizSelectLockTimer <= 0 && p.x >= GATE_ENTRY_X - 8) {
            resolveGate(getAlignedGateIndex(p.y, externalQuizRef.current), false);
          } else if (s.quizTimer === 0) {
            resolveGate(null, true);
          }
        } else if (s.quizPhase === 'feedback') {
          s.laserStreamStrength = Math.max(0, s.laserStreamStrength - dt * 10);
          s.bgOffset += st.scrollSpeed * 1.2 * dt;
          const targetY =
            s.quizSelectedGate !== null
              ? gateLayout.tops[s.quizSelectedGate] + gateLayout.height / 2
              : p.y;
          const targetX = s.quizSelectedGate !== null ? GATE_ENTRY_X - 12 : 210;
          p.x += (targetX - p.x) * Math.min(1, dt * 10);
          p.y += (targetY - p.y) * Math.min(1, dt * 10);
          p.tilt += (0 - p.tilt) * Math.min(1, dt * 12);
          p.prevX = p.x;
          p.prevY = p.y;

          s.quizFeedbackTimer = Math.max(0, s.quizFeedbackTimer - dt);
          if (s.quizFeedbackTimer === 0) {
            s.quizPhase = 'boost_out';
            s.quizBoostTimer = 0.72;
            synthAudio.playBoost();
            spawnParticles(p.x - 18, p.y, '#22D3EE', 24, 260, true);
          }
        } else if (s.quizPhase === 'boost_out') {
          s.laserStreamStrength = 0;
          const progress = 1 - s.quizBoostTimer / 0.72;
          s.bgOffset += st.scrollSpeed * (3.2 + progress * 6.8) * dt;
          p.tilt += (0 - p.tilt) * Math.min(1, dt * 16);
          p.x += (680 + progress * 2200) * dt;
          p.prevX = p.x;
          p.prevY = p.y;
          for (let k = 0; k < 2; k++) {
            pushParticle({
              x: p.x - 24 - Math.random() * 14,
              y: p.y + (Math.random() - 0.5) * 10,
              vx: -520 - Math.random() * 280,
              vy: (Math.random() - 0.5) * 50,
              life: 0.25 + Math.random() * 0.16,
              maxLife: 0.41,
              size: 3 + Math.random() * 4,
              color: Math.random() < 0.5 ? '#22D3EE' : '#FFFFFF',
            });
          }
          s.quizBoostTimer = Math.max(0, s.quizBoostTimer - dt);
          if (s.quizBoostTimer === 0 || p.x > LOGICAL_W + 140) {
            s.quizPhase = 'boost_in';
            s.quizBoostTimer = 0.42;
            p.x = -80;
            p.y = LOGICAL_H / 2;
            p.prevX = p.x;
            p.prevY = p.y;
            p.tilt = 0;
          }
        } else if (s.quizPhase === 'boost_in') {
          s.laserStreamStrength = 0;
          s.quizBoostTimer = Math.max(0, s.quizBoostTimer - dt);
          const progress = 1 - s.quizBoostTimer / 0.42;
          const eased = 1 - Math.pow(1 - progress, 3);
          s.bgOffset += st.scrollSpeed * (4.0 - eased * 3.0) * dt;
          p.x = -80 + (180 - -80) * eased;
          p.prevX = p.x;
          p.prevY = p.y;
          pushParticle({
            x: p.x - 24,
            y: p.y + (Math.random() - 0.5) * 8,
            vx: -420 - Math.random() * 200,
            vy: (Math.random() - 0.5) * 40,
            life: 0.22,
            maxLife: 0.22,
            size: 3 + Math.random() * 3,
            color: '#22D3EE',
          });
          if (s.quizBoostTimer === 0) {
            const halfLabel = s.stageHalf === 1 ? '前半' : '後半';
            const stageLabel = s.isEndless
              ? `ENDLESS L${s.endlessLoop} · ${halfLabel}`
              : `STAGE ${s.stageNumber} · ${halfLabel}`;
            s.floatingTexts.push({
              x: LOGICAL_W / 2,
              y: 132,
              text: `${stageLabel} (${s.itemsEnabled ? 'ITEM ON' : 'NO ITEM'})`,
              color: s.itemsEnabled ? st.accentColor : '#FB7185',
              life: 2.0,
            });
            s.quizPhase = 'none';
            s.quizQuestion = null;
            s.quizSelectedGate = null;
            s.quizResult = 'none';
            s.stageTimer = 0;
            s.spawnTimer = 0.55;
            s.itemTimer = 1.3;
            p.invulnTimer = 1.0;
          }
        }

        // Update bullets / pickups / particles during quiz gate (clip forward shots at gate plane)
        for (let i = s.bullets.length - 1; i >= 0; i--) {
          const b = s.bullets[i];
          b.age += dt;
          if (b.growRate) {
            b.radius += b.growRate * dt;
          }
          if (b.kind === 'missile' && b.age > 0.28) {
            b.vy *= Math.max(0, 1 - dt * 6.5);
            b.vx = Math.min(780, b.vx + 460 * dt);
          }
          b.x += b.vx * dt;
          if (b.kind === 'cross_laser') {
            const amp = 28 + ((b.level ?? 1) - 1) * 3;
            b.y = (b.originY ?? b.y) + (b.phaseSign ?? 1) * Math.sin(b.age * 17) * amp;
          } else {
            b.y += b.vy * dt;
          }
          const pastGatePlane =
            s.quizPhase === 'selecting' &&
            (b.kind === 'laser'
              ? b.x - (b.beamHalfLen ?? 90) > GATE_ENTRY_X + 10
              : b.vx >= 0 && b.x > GATE_ENTRY_X + 4);
          if (b.age >= b.maxAge || b.x < -60 || b.x > LOGICAL_W + 200 || pastGatePlane) {
            s.bullets.splice(i, 1);
          }
        }
        for (let i = s.pickups.length - 1; i >= 0; i--) {
          const g = s.pickups[i];
          g.age += dt;
          const dx = p.x - g.x;
          const dy = p.y - g.y;
          const dist = Math.hypot(dx, dy);
          g.vx = (dx / Math.max(1, dist)) * 900;
          g.vy = (dy / Math.max(1, dist)) * 900;
          g.x += g.vx * dt;
          g.y += g.vy * dt;
          if (dist < 32) {
            synthAudio.playXp();
            s.pickups.splice(i, 1);
            if (s.level < MAX_WEAPON_LEVEL) {
              s.xp += g.value;
              while (s.xp >= s.xpToNext && s.level < MAX_WEAPON_LEVEL) {
                s.xp -= s.xpToNext;
                s.level += 1;
                s.xpToNext = Math.round(s.xpToNext * 1.24 + 14);
                synthAudio.playLevelUp();
                applyAutoUpgradeStep();
                if (s.level >= MAX_WEAPON_LEVEL) {
                  s.xp = s.xpToNext;
                  break;
                }
              }
            } else {
              const gained = addScore(180);
              s.floatingTexts.push({
                x: p.x,
                y: p.y - 26,
                text: `+${gained}`,
                color: '#67E8F9',
                life: 0.75,
              });
            }
          }
        }
        updateParticlesAndTexts(dt);
        return;
      }

      const isBossShieldPush = Boolean(s.boss && s.boss.shieldTimer > 0);
      const isBossQuizActive = Boolean(s.boss && s.boss.quizState !== 'none');
      const isBossQuizAiming = Boolean(s.boss && s.boss.quizState === 'active');
      const scrollMult = isBossShieldPush ? 7.5 : 1.0;

      s.elapsedTime += dt;
      s.bgOffset += st.scrollSpeed * scrollMult * dt;
      if (s.upgradeBannerTimer > 0) {
        s.upgradeBannerTimer = Math.max(0, s.upgradeBannerTimer - dt);
        if (s.upgradeBannerTimer === 0) s.lastUpgradeBanner = null;
      }
      if (s.warningTimer > 0) {
        s.warningTimer = Math.max(0, s.warningTimer - dt);
        if (s.warningTimer === 0) s.warningText = null;
      }
      if (p.invulnTimer > 0) p.invulnTimer = Math.max(0, p.invulnTimer - dt);
      if (s.comboTimer > 0) {
        s.comboTimer = Math.max(0, s.comboTimer - dt);
        if (s.comboTimer === 0) s.combo = 0;
      }

      const keys = inputRef.current.keys;
      if (inputRef.current.tapFireTimer > 0) {
        inputRef.current.tapFireTimer = Math.max(
          0,
          inputRef.current.tapFireTimer - dt,
        );
      }
      const isBossQuizPush = Boolean(s.boss && s.boss.quizState === 'push');
      const bossQuizStartY = getBossQuizStartY(externalQuizRef.current);
      if (isBossQuizPush) {
        // 押し戻し中：自機を左側・BとCの隙間中央へ戻し、初期位置から誤射しないようにする
        p.x += (BOSS_QUIZ_START_X - p.x) * Math.min(1, dt * 8.0);
        p.y += (bossQuizStartY - p.y) * Math.min(1, dt * 8.5);
        inputRef.current.glideVx = 0;
        inputRef.current.glideVy = 0;
      } else {
        let kx = 0;
        let ky = 0;
        if (keys.has('ArrowLeft') || keys.has('KeyA')) kx -= 1;
        if (keys.has('ArrowRight') || keys.has('KeyD')) kx += 1;
        if (keys.has('ArrowUp') || keys.has('KeyW')) ky -= 1;
        if (keys.has('ArrowDown') || keys.has('KeyS')) ky += 1;
        if (kx !== 0 || ky !== 0) {
          const len = Math.hypot(kx, ky);
          p.x += (kx / len) * p.speed * dt;
          p.y += (ky / len) * p.speed * dt;
          inputRef.current.glideVx = 0;
          inputRef.current.glideVy = 0;
        } else if (
          Math.abs(inputRef.current.glideVx) > 6 ||
          Math.abs(inputRef.current.glideVy) > 6
        ) {
          p.x += inputRef.current.glideVx * dt;
          p.y += inputRef.current.glideVy * dt;
          const damp = Math.exp(-dt * 15);
          inputRef.current.glideVx *= damp;
          inputRef.current.glideVy *= damp;
        }
        if (isBossShieldPush) {
          p.x -= 450 * dt;
        }
      }
      p.x = Math.max(44, Math.min(LOGICAL_W - 60, p.x));
      if (isBossQuizActive) {
        // ボスシールドクイズ出題中は一定距離以上シールド・ボスへ近づけず、4択範囲内へY軸を収める
        const bossQuizLayout = getBossQuizLayout(externalQuizRef.current);
        p.y = Math.max(
          bossQuizLayout.tops[0] + 10,
          Math.min(bossQuizLayout.tops[3] + bossQuizLayout.height - 10, p.y),
        );
        p.x = Math.min(
          p.x,
          Math.max(44, getBossShieldXAtY(p.y) - BOSS_QUIZ_STANDOFF_GAP),
        );
      } else {
        p.y = Math.max(48, Math.min(LOGICAL_H - 48, p.y));
        if (isBossShieldPush || s.boss?.shieldIntact) {
          p.x = Math.min(p.x, Math.max(44, getBossShieldXAtY(p.y) - 34));
        }
      }

      const moveSpeed = Math.hypot(p.x - p.prevX, p.y - p.prevY) / Math.max(dt, 0.001);
      const vyApprox = (p.y - p.prevY) / Math.max(dt, 0.001);
      p.prevX = p.x;
      p.prevY = p.y;
      p.tilt +=
        (Math.max(-0.32, Math.min(0.32, vyApprox * 0.00075)) - p.tilt) *
        Math.min(1, dt * 14);

      const wantsFire =
        settingsRef.current.autoShot ||
        keys.has('Space') ||
        keys.has('KeyZ') ||
        inputRef.current.pointerDown ||
        inputRef.current.tapFireTimer > 0;
      const isFiring =
        s.bossDyingTimer === 0 &&
        (!isBossQuizActive || isBossQuizAiming) &&
        wantsFire;

      const laserLv = s.weapons.laser ?? 0;
      const hasStreamLaser =
        laserLv >= 4 ||
        (s.hiddenEvolutionUnlocked &&
          s.patternId === 'balance' &&
          laserLv >= 1);
      if (isFiring && !isBossQuizActive && hasStreamLaser) {
        if (moveSpeed < 45) {
          s.laserStreamStrength = Math.min(1, s.laserStreamStrength + dt * 7.5);
        } else {
          const floorStr =
            s.patternId === 'balance' && s.hiddenEvolutionUnlocked ? 0 : 0.22;
          s.laserStreamStrength = Math.max(floorStr, s.laserStreamStrength - dt * 6);
        }
      } else {
        s.laserStreamStrength = Math.max(0, s.laserStreamStrength - dt * 9);
      }

      const dFieldActive =
        isFiring &&
        !isBossQuizActive &&
        s.hiddenEvolutionUnlocked &&
        s.patternId === 'pierce';
      if (dFieldActive) {
        s.dFieldStrength = Math.min(1, s.dFieldStrength + dt * 8);
        s.dFieldSparkTimer -= dt;
        const fieldRadius = 46;
        const shouldSpark = s.dFieldSparkTimer <= 0;
        if (shouldSpark) s.dFieldSparkTimer = 0.14;
        for (const e of s.enemies) {
          if (Math.hypot(e.x - p.x, e.y - p.y) < fieldRadius + e.radius) {
            e.hp -= 24 * dt;
            if (shouldSpark) {
              e.flashTimer = 0.05;
              spawnParticles(e.x, e.y, '#FDA4AF', 2, 95);
            }
          }
        }
        if (s.boss && !s.boss.shieldIntact && s.boss.quizState === 'none') {
          if (Math.hypot(s.boss.x - p.x, s.boss.y - p.y) < fieldRadius + s.boss.radius) {
            s.boss.hp -= 24 * dt;
            if (shouldSpark) {
              s.boss.flashTimer = 0.04;
              spawnParticles(p.x + 28, p.y, '#FDA4AF', 2, 105);
            }
          }
        }
      } else {
        s.dFieldStrength = Math.max(0, s.dFieldStrength - dt * 9);
      }

      if (isFiring) {
        const entries = Object.entries(s.weapons) as [WeaponId, number][];
        for (const [wId, lv] of entries) {
          if (!lv || lv <= 0) continue;
          // ボスシールドクイズ中は誤射防止のため前方Normalショットのみ射出
          if (isBossQuizActive && wId !== 'normal') continue;
          const prev = s.weaponTimers[wId] ?? 0;
          const next = prev - dt;
          if (next <= 0) {
            fireWeapon(wId, lv);
            const interval =
              WEAPONS[wId].fireInterval /
              (p.fireRateMult * (1 + (lv - 1) * 0.08));
            s.weaponTimers[wId] = interval;
          } else {
            s.weaponTimers[wId] = next;
          }
        }
      }

      const orbitLv = s.weapons.orbit ?? 0;
      if (orbitLv > 0 && !isBossQuizActive) {
        const podCount = orbitLv * 2;
        for (let i = 0; i < podCount; i++) {
          const ang = s.elapsedTime * 3.8 + (i * Math.PI * 2) / podCount;
          const ox = p.x + Math.cos(ang) * 58;
          const oy = p.y + Math.sin(ang) * 58;
          for (let ebIdx = s.enemyBullets.length - 1; ebIdx >= 0; ebIdx--) {
            const eb = s.enemyBullets[ebIdx];
            if (eb.indestructible) continue;
            if (Math.hypot(ox - eb.x, oy - eb.y) < 16 + eb.radius) {
              eb.hp -= 22;
              eb.flashTimer = 0.08;
              spawnParticles(eb.x, eb.y, '#FB923C', 4, 110);
              if (eb.hp <= 0) {
                s.enemyBullets[ebIdx] = s.enemyBullets[s.enemyBullets.length - 1];
                s.enemyBullets.pop();
                addFlatBonusScore(15);
              }
            }
          }
        }
      }

      if (!s.boss) {
        if (s.bossIntroTimer > 0) {
          s.bossIntroTimer = Math.max(0, s.bossIntroTimer - dt);
          if (s.bossIntroTimer === 0) {
            spawnBoss();
          }
        } else {
          const halfDurationSec = st.stageDurationSec / 2;
          s.stageTimer += dt;
          const timeReached = s.stageTimer >= halfDurationSec;

          if (!timeReached) {
            s.spawnTimer -= dt;
            if (s.spawnTimer <= 0) {
              spawnEnemyWave();
              const attackStageNum =
                s.stageNumber + (s.difficulty === 'hard' ? 1 : 0);
              const attackEndlessLoop =
                s.endlessLoop + (s.difficulty === 'hard' ? 1 : 0);
              const baseCadence = s.isEndless
                ? Math.max(0.3, 0.78 - attackEndlessLoop * 0.08)
                : Math.max(0.56, 1.7 - (attackStageNum - 1) * 0.1);
              s.spawnTimer = baseCadence * (0.8 + Math.random() * 0.45);
            }

            if (s.itemsEnabled) {
              s.itemTimer -= dt;
              if (s.itemTimer <= 0) {
                spawnItemPod();
                s.itemTimer = 2.9 + Math.random() * 1.1;
              }
            }
          } else {
            // 時間が経過し、かつエリア内の敵・アイテム・チップがすべて処理されてから移行（未殲滅でも+30秒経過で従来の爆散処理で強制移行）
            const areaCleared =
              s.enemies.length === 0 &&
              s.items.length === 0 &&
              s.pickups.length === 0;
            const forceTransition = s.stageTimer >= halfDurationSec + 30;
            if (areaCleared || forceTransition) {
              if (forceTransition && s.enemies.length > 0) {
                synthAudio.playExplosion(false);
                for (const rem of s.enemies) {
                  const tpl = ENEMIES[rem.type];
                  spawnParticles(rem.x, rem.y, '#FB923C', 14, 240, true);
                  spawnParticles(rem.x, rem.y, tpl.color, 6, 170);
                }
                s.enemies = [];
              }
              if (forceTransition) {
                s.items = [];
                s.pickups = [];
              }
              if (s.stageHalf === 1) {
                s.stageHalf = 2;
                s.stageTimer = 0;
                beginQuizGate();
                return;
              } else if (!s.bossSpawnedForStage) {
                s.bossSpawnedForStage = true;
                beginBossIntro();
              }
            }
          }
        }
      }

      for (let i = s.bullets.length - 1; i >= 0; i--) {
        const b = s.bullets[i];
        b.age += dt;
        if (b.growRate) {
          b.radius += b.growRate * dt;
        }
        if (b.kind === 'missile') {
          if (b.homing) {
            if (b.age > 0.12) {
              let targetX: number | null = null;
              let targetY: number | null = null;
              let bestDist = Infinity;
              for (const enemy of s.enemies) {
                const d = (enemy.x - b.x) * (enemy.x - b.x) + (enemy.y - b.y) * (enemy.y - b.y);
                if (d < bestDist) {
                  bestDist = d;
                  targetX = enemy.x;
                  targetY = enemy.y;
                }
              }
              if (
                s.boss &&
                !isBossQuizActive &&
                !s.boss.shieldIntact &&
                s.boss.quizState === 'none'
              ) {
                const d =
                  (s.boss.x - b.x) * (s.boss.x - b.x) +
                  (s.boss.y - b.y) * (s.boss.y - b.y);
                if (d < bestDist) {
                  targetX = s.boss.x;
                  targetY = s.boss.y;
                }
              }
              if (targetX !== null && targetY !== null) {
                const desiredAng = Math.atan2(targetY - b.y, targetX - b.x);
                const curAng = Math.atan2(b.vy, b.vx);
                let diff = desiredAng - curAng;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                const maxTurn = 7.8 * dt;
                const nextAng =
                  curAng + Math.max(-maxTurn, Math.min(maxTurn, diff));
                const speed = Math.min(780, Math.hypot(b.vx, b.vy) + 520 * dt);
                b.vx = Math.cos(nextAng) * speed;
                b.vy = Math.sin(nextAng) * speed;
              } else {
                b.vy *= Math.max(0, 1 - dt * 5.5);
                b.vx = Math.min(780, b.vx + 460 * dt);
              }
            }
          } else if (b.age > 0.28) {
            b.vy *= Math.max(0, 1 - dt * 6.5);
            b.vx = Math.min(780, b.vx + 460 * dt);
          }
        }
        b.x += b.vx * dt;
        if (b.kind === 'cross_laser') {
          const amp = 28 + ((b.level ?? 1) - 1) * 3;
          b.y = (b.originY ?? b.y) + (b.phaseSign ?? 1) * Math.sin(b.age * 17) * amp;
        } else {
          b.y += b.vy * dt;
        }

        if (
          s.boss &&
          (s.boss.shieldTimer > 0 || s.boss.shieldIntact || s.boss.quizState !== 'none')
        ) {
          const boss = s.boss;
          const shieldX = getBossShieldXAtY(b.y);
          let leadX = b.x + b.radius;
          if (b.kind === 'laser' && b.beamHalfLen) {
            leadX = b.x + b.beamHalfLen;
          } else if (b.kind === 'ripple') {
            leadX = b.x + b.radius * 0.55;
          }
          if (b.vx > 0 && leadX >= shieldX) {
            const impactY = Math.max(12, Math.min(LOGICAL_H - 12, b.y));
            const impactX = getBossShieldXAtY(impactY);

            if (boss.quizState === 'active' && boss.quizQuestion && b.isBaseNormal) {
              const choiceIdx = getBossQuizChoiceAtY(b.y, externalQuizRef.current);
              if (choiceIdx !== null) {
                const normalLv = s.weapons.normal ?? 1;
                const normalInterval =
                  WEAPONS.normal.fireInterval /
                  (p.fireRateMult * (1 + (normalLv - 1) * 0.08));
                // 誤射防止のため耐久を約3倍（約3.45秒の継続射撃で破壊）に設定
                const gain = Math.min(0.075, 1.0 / Math.max(15, 3.45 / normalInterval));
                boss.quizTargetDamage[choiceIdx] = Math.min(
                  1,
                  boss.quizTargetDamage[choiceIdx] + gain,
                );
                boss.quizNoHitTimers[choiceIdx] = 0;

                // 別の選択肢に照準を移した場合は、他の選択肢の継続ダメージを回復方向へ戻す
                for (let k = 0; k < 4; k++) {
                  if (k !== choiceIdx && boss.quizTargetDamage[k] > 0) {
                    boss.quizTargetDamage[k] = Math.max(
                      0,
                      boss.quizTargetDamage[k] - 0.12,
                    );
                  }
                }

                spawnParticles(impactX, impactY, '#34D399', 6, 165, false);
                boss.shieldFlashTimer = 0.06;
                s.bullets.splice(i, 1);

                if (boss.quizTargetDamage[choiceIdx] >= 1) {
                  const q = boss.quizQuestion;
                  boss.quizSelectedIdx = choiceIdx;
                  s.quizTotalAnswered += 1;
                  const isCorrect = choiceIdx === q.correctIndex;
                  if (isCorrect) {
                    s.quizAnsweredCorrect += 1;
                    recordSolvedTerm(q.termId);
                    onTermSolvedRef.current?.();
                    boss.quizResult = 'correct';
                    boss.piercingQuizActive = false;
                    boss.consecutiveQuizMisses = 0;
                    boss.quizBoostTier = 0;
                    boss.shieldIntact = false;
                    boss.shieldTimer = 0;
                    boss.shieldFadeTimer = 0;
                    boss.shieldShatterTimer = 0.78;
                    boss.shieldShards = Array.from({length: 24}, (_, shardIdx) => {
                      const sy = 26 + ((LOGICAL_H - 52) * shardIdx) / 23;
                      const sx = getBossShieldXAtY(sy);
                      const dir = shardIdx % 2 === 0 ? -1 : 0.45;
                      return {
                        x: sx,
                        y: sy,
                        vx: dir * (160 + Math.random() * 260) - 40,
                        vy: ((sy - LOGICAL_H / 2) / (LOGICAL_H / 2)) * 210 + (Math.random() - 0.5) * 220,
                        rot: Math.random() * Math.PI * 2,
                        vrot: (Math.random() - 0.5) * 14,
                        size: 10 + Math.random() * 14,
                        color:
                          shardIdx % 3 === 0
                            ? '#67E8F9'
                            : shardIdx % 3 === 1
                              ? '#34D399'
                              : '#E0F2FE',
                      };
                    });
                    for (let k = 0; k < 7; k++) {
                      const sy = 44 + ((LOGICAL_H - 88) * k) / 6;
                      spawnParticles(
                        getBossShieldXAtY(sy),
                        sy,
                        k % 2 === 0 ? '#22D3EE' : '#34D399',
                        7,
                        280,
                        true,
                      );
                    }
                    synthAudio.playQuizCorrect();
                    synthAudio.playExplosion(true);
                    triggerShake(11, 0.38);
                    spawnParticles(impactX, impactY, '#10B981', 18, 260, true);
                    const bossQuizBonus = addFlatBonusScore(1000);
                    s.floatingTexts.push({
                      x: p.x,
                      y: p.y - 36,
                      text: `+${bossQuizBonus}`,
                      color: '#34D399',
                      life: 1.6,
                      big: true,
                    });
                    boss.quizFeedbackTimer = 1.6;
                  } else {
                    recordWrongTerm(q.termId);
                    boss.quizResult = 'wrong';
                    boss.piercingQuizActive = true;
                    boss.consecutiveQuizMisses += 1;
                    boss.quizBoostTier = boss.consecutiveQuizMisses;
                    boss.shieldIntact = true;
                    boss.shieldFlashTimer = 0.35;
                    synthAudio.playQuizWrong();
                    spawnParticles(impactX, impactY, '#F43F5E', 28, 250, true);
                    applyFlatScoreDelta(-1000);
                    s.floatingTexts.push({
                      x: p.x,
                      y: p.y - 36,
                      text: '-1000',
                      color: '#FB7185',
                      life: 1.8,
                      big: true,
                    });
                    boss.quizFeedbackTimer = 3.8;
                  }
                  boss.quizState = 'feedback';
                  boss.lastQuizSolvedElapsed = s.elapsedTime;
                  s.bullets = [];
                }
                continue;
              }
            }

            spawnParticles(
              impactX,
              impactY,
              boss.shieldIntact && boss.quizState === 'none' ? '#FB7185' : '#38BDF8',
              6,
              155,
              true,
            );
            boss.shieldFlashTimer = 0.09;
            s.bullets.splice(i, 1);
            continue;
          }
        }

        const halfLen = b.beamHalfLen ?? 0;
        const maxCrossBack = Math.min(0.25, b.age);
        const crossAmp = 28 + ((b.level ?? 1) - 1) * 3;
        const getClosestBulletPos = (tx: number) => {
          if (b.kind === 'cross_laser') {
            const tBack = Math.max(0, Math.min(maxCrossBack, (b.x - tx) / Math.max(1, b.vx)));
            const tSample = b.age - tBack;
            return {
              cx: b.x - b.vx * tBack,
              cy: (b.originY ?? b.y) + (b.phaseSign ?? 1) * Math.sin(tSample * 17) * crossAmp,
            };
          }
          return {
            cx: halfLen > 0 ? Math.max(b.x - halfLen, Math.min(b.x + halfLen, tx)) : b.x,
            cy: b.y,
          };
        };

        let removedByBullet = false;
        for (let ebIdx = s.enemyBullets.length - 1; ebIdx >= 0; ebIdx--) {
          const eb = s.enemyBullets[ebIdx];
          if (eb.indestructible) continue;
          const {cx, cy} = getClosestBulletPos(eb.x);
          if (Math.hypot(cx - eb.x, cy - eb.y) < b.radius + eb.radius + 5) {
            eb.hp -= Math.max(1, b.damage);
            eb.flashTimer = 0.08;
            if (eb.hp <= 0) {
              spawnParticles(eb.x, eb.y, '#FFFFFF', 4, 95);
              s.enemyBullets[ebIdx] = s.enemyBullets[s.enemyBullets.length - 1];
              s.enemyBullets.pop();
              addFlatBonusScore(10);
            } else {
              spawnParticles(eb.x, eb.y, '#FDE047', 2, 75);
            }
            b.pierce -= 1;
            if (b.pierce <= 0) {
              s.bullets.splice(i, 1);
              removedByBullet = true;
              break;
            }
          }
        }
        if (removedByBullet) continue;

        const tailHalf = b.kind === 'cross_laser' ? b.vx * 0.25 : halfLen;
        if (
          b.age >= b.maxAge ||
          b.x - tailHalf > LOGICAL_W + 90 ||
          b.x + halfLen < -90 ||
          b.y < -90 ||
          b.y > LOGICAL_H + 90
        ) {
          s.bullets.splice(i, 1);
        }
      }

      // Field Green Rounded Item Pods (接触ノーダメージ or 破壊で経験値チップをドロップ)
      for (let i = s.items.length - 1; i >= 0; i--) {
        const item = s.items[i];
        item.age += dt;
        if (item.flashTimer > 0) item.flashTimer = Math.max(0, item.flashTimer - dt);

        if (isBossShieldPush) {
          item.x -= 940 * dt;
        } else {
          item.x += item.vx * dt;
          item.y = Math.max(
            52,
            Math.min(LOGICAL_H - 52, item.baseY + Math.sin(item.age * 2.2) * 26),
          );
        }

        // Player contact: zero damage, pops open & drops XP chips
        if (Math.hypot(item.x - p.x, item.y - p.y) < item.radius + 18) {
          popItemPod(item);
          s.items.splice(i, 1);
          continue;
        }

        // Player bullets destroy item pod -> drops XP chips
        for (let j = s.bullets.length - 1; j >= 0; j--) {
          const b = s.bullets[j];
          if (b.hitIds.has(item.id)) continue;
          let cx = b.x;
          let cy = b.y;
          if (b.kind === 'cross_laser') {
            const maxBack = Math.min(0.25, b.age);
            const tBack = Math.max(0, Math.min(maxBack, (b.x - item.x) / Math.max(1, b.vx)));
            const amp = 28 + ((b.level ?? 1) - 1) * 3;
            cx = b.x - b.vx * tBack;
            cy = (b.originY ?? b.y) + (b.phaseSign ?? 1) * Math.sin((b.age - tBack) * 17) * amp;
          } else if (b.beamHalfLen) {
            cx = Math.max(b.x - b.beamHalfLen, Math.min(b.x + b.beamHalfLen, item.x));
          }
          if (Math.hypot(cx - item.x, cy - item.y) < b.radius + item.radius) {
            b.hitIds.add(item.id);
            item.hp -= b.damage;
            item.flashTimer = 0.07;
            spawnParticles(cx, cy, '#4ADE80', 4, 110);
            b.pierce -= 1;
            if (b.pierce <= 0) {
              s.bullets.splice(j, 1);
            }
            if (item.hp <= 0) break;
          }
        }

        if (item.hp <= 0) {
          popItemPod(item);
          s.items.splice(i, 1);
          continue;
        }

        if (
          item.x < -120 ||
          (item.age > 2.0 && item.x > LOGICAL_W + 180) ||
          item.y < -140 ||
          item.y > LOGICAL_H + 140
        ) {
          s.items.splice(i, 1);
        }
      }

      const attackStageNum = s.stageNumber + (s.difficulty === 'hard' ? 1 : 0);
      const attackEndlessLoop = s.endlessLoop + (s.difficulty === 'hard' ? 1 : 0);
      const earlySpeedMult = s.isEndless
        ? 1.15 + Math.min(0.95, attackEndlessLoop * 0.16)
        : attackStageNum === 1
          ? 0.78
          : attackStageNum === 2
            ? 0.9
            : 1.0;
      const earlyCooldownMult = s.isEndless
        ? Math.max(0.32, 0.85 - attackEndlessLoop * 0.1)
        : attackStageNum === 1
          ? 1.8
          : attackStageNum === 2
            ? 1.35
            : 1.0;

      for (let i = s.enemies.length - 1; i >= 0; i--) {
        const e = s.enemies[i];
        e.age += dt;
        if (e.flashTimer > 0) e.flashTimer = Math.max(0, e.flashTimer - dt);

        if (isBossShieldPush) {
          // 防御フィールド展開時：雑魚敵が爆散しながら左へ押し戻され、自機に接触してもミスにならない
          e.x -= 1050 * dt;
          e.y += (e.y < LOGICAL_H / 2 ? -95 : 95) * dt;
          e.flashTimer = 0.06;
          if (Math.random() < dt * 28) {
            spawnParticles(e.x + (Math.random() - 0.5) * 16, e.y + (Math.random() - 0.5) * 16, '#FB923C', 3, 150);
          }
          const nearPlayer = Math.hypot(e.x - p.x, e.y - p.y) < e.radius + 54;
          if (e.x < 55 || nearPlayer) {
            const tpl = ENEMIES[e.type];
            spawnParticles(e.x, e.y, '#FB923C', 14, 240, true);
            spawnParticles(e.x, e.y, tpl.color, 6, 170);
            synthAudio.playExplosion(false);
            s.enemies.splice(i, 1);
          }
          continue;
        }

        if (e.type === 'drone') {
          e.y = e.baseY + Math.sin(e.age * 3.4) * 58;
        } else if (e.type === 'interceptor') {
          e.vy = (p.y - e.y) * 0.75;
        } else if (e.type === 'heli') {
          if (e.x < LOGICAL_W * 0.74) {
            e.vx = -22;
            e.y = e.baseY + Math.sin(e.age * 1.8) * 65;
          }
        } else if (e.type === 'insect') {
          e.y += Math.sin(e.age * 7.5) * 210 * dt;
        } else if (e.type === 'heavy') {
          e.y = e.baseY + Math.sin(e.age * 1.1) * 36;
        }

        e.x += e.vx * dt;
        e.y = Math.max(44, Math.min(LOGICAL_H - 44, e.y + e.vy * dt));

        e.fireTimer -= dt;
        if (!isBossQuizActive && e.fireTimer <= 0 && e.x < LOGICAL_W - 40 && e.x > 160) {
          const tpl = ENEMIES[e.type];
          e.fireTimer = tpl.fireCooldown * earlyCooldownMult * (0.85 + Math.random() * 0.35);
          const angToPlayer = Math.atan2(p.y - e.y, p.x - e.x);
          // ゲート選択ミス時またはHARDモード時は敵弾が常に貫通（自機弾で相殺不可）になる
          const enemyBulletPiercing = !s.itemsEnabled || s.difficulty === 'hard';
          const eBulletHp = enemyBulletPiercing
            ? 999
            : s.isEndless
              ? 24 + (attackEndlessLoop - 1) * 16
              : 1;
          const extraEndlessSpread =
            s.isEndless && attackEndlessLoop >= 2 ? [-0.22, 0, 0.22] : [0];

          if (e.type === 'heli') {
            const offsets = s.isEndless
              ? [-0.34, -0.17, 0, 0.17, 0.34]
              : attackStageNum <= 2
                ? [0]
                : [-0.26, 0, 0.26];
            for (const off of offsets) {
              s.enemyBullets.push({
                x: e.x - 16,
                y: e.y,
                vx: Math.cos(angToPlayer + off) * 245 * earlySpeedMult,
                vy: Math.sin(angToPlayer + off) * 245 * earlySpeedMult,
                radius: 7.5,
                hp: eBulletHp,
                maxHp: eBulletHp,
                indestructible: enemyBulletPiercing,
                fromBoss: false,
                flashTimer: 0,
              });
            }
          } else if (e.type === 'heavy') {
            const halfRange = s.isEndless ? 2 : 1;
            for (let k = -halfRange; k <= halfRange; k++) {
              const a = angToPlayer + k * 0.2;
              s.enemyBullets.push({
                x: e.x - 24,
                y: e.y,
                vx: Math.cos(a) * 235 * earlySpeedMult,
                vy: Math.sin(a) * 235 * earlySpeedMult,
                radius: 8.5,
                hp: eBulletHp,
                maxHp: eBulletHp,
                indestructible: enemyBulletPiercing,
                fromBoss: false,
                flashTimer: 0,
              });
            }
          } else if (e.type === 'interceptor') {
            for (const off of extraEndlessSpread) {
              s.enemyBullets.push({
                x: e.x - 14,
                y: e.y,
                vx: Math.cos(Math.PI + off) * 340 * earlySpeedMult,
                vy: Math.sin(Math.PI + off) * 340 * earlySpeedMult,
                radius: 7,
                hp: eBulletHp,
                maxHp: eBulletHp,
                indestructible: enemyBulletPiercing,
                fromBoss: false,
                flashTimer: 0,
              });
            }
          } else {
            for (const off of extraEndlessSpread) {
              s.enemyBullets.push({
                x: e.x - 12,
                y: e.y,
                vx: Math.cos(angToPlayer + off) * 245 * earlySpeedMult,
                vy: Math.sin(angToPlayer + off) * 245 * earlySpeedMult,
                radius: 7,
                hp: eBulletHp,
                maxHp: eBulletHp,
                indestructible: enemyBulletPiercing,
                fromBoss: false,
                flashTimer: 0,
              });
            }
          }
        }

        for (let j = s.bullets.length - 1; j >= 0; j--) {
          const b = s.bullets[j];
          if (b.hitIds.has(e.id)) continue;
          let cx = b.x;
          let cy = b.y;
          if (b.kind === 'cross_laser') {
            const maxBack = Math.min(0.25, b.age);
            const tBack = Math.max(0, Math.min(maxBack, (b.x - e.x) / Math.max(1, b.vx)));
            const amp = 28 + ((b.level ?? 1) - 1) * 3;
            cx = b.x - b.vx * tBack;
            cy = (b.originY ?? b.y) + (b.phaseSign ?? 1) * Math.sin((b.age - tBack) * 17) * amp;
          } else if (b.beamHalfLen) {
            cx = Math.max(b.x - b.beamHalfLen, Math.min(b.x + b.beamHalfLen, e.x));
          }
          if (Math.hypot(cx - e.x, cy - e.y) < b.radius + e.radius) {
            b.hitIds.add(e.id);
            e.hp -= b.damage;
            e.flashTimer = 0.08;
            spawnParticles(cx, cy, b.color, 4, 110);
            b.pierce -= 1;
            if (b.pierce <= 0) {
              s.bullets.splice(j, 1);
            }
            if (e.hp <= 0) break;
          }
        }

        if (e.hp <= 0) {
          const tpl = ENEMIES[e.type];
          s.enemiesDefeated += 1;
          const gained = addScore(tpl.scoreValue);
          s.floatingTexts.push({
            x: e.x,
            y: e.y - e.radius * 0.55,
            text: `+${gained}`,
            color: '#FDE047',
            life: 0.9,
          });
          synthAudio.playExplosion(e.type === 'heavy');
          if (e.type === 'heavy') triggerShake(6, 0.16);
          const burstColor = e.isRedCarrier ? '#EF4444' : tpl.color;
          spawnParticles(e.x, e.y, burstColor, e.type === 'heavy' ? 24 : 12, 210, true);

          if (e.isRedCarrier) {
            s.pickups.push({
              x: e.x,
              y: e.y,
              vx: -30 + (Math.random() - 0.5) * 60,
              vy: (Math.random() - 0.5) * 70,
              age: 0,
              value: tpl.xpValue,
              isBonus: false,
            });
          }

          s.enemies.splice(i, 1);
          continue;
        }

        const playerEnemyHitRadius = p.shield > 0 ? 12 : 2;
        if (
          !isBossShieldPush &&
          Math.hypot(e.x - p.x, e.y - p.y) < e.radius + playerEnemyHitRadius
        ) {
          damagePlayer();
          e.hp -= 40;
        }

        if (
          e.x < -120 ||
          (e.age > 2.5 && e.x > LOGICAL_W + 240) ||
          e.y < -160 ||
          e.y > LOGICAL_H + 160
        ) {
          s.enemies.splice(i, 1);
        }
      }

      if (s.boss) {
        const boss = s.boss;
        boss.age += dt;
        if (boss.flashTimer > 0) boss.flashTimer = Math.max(0, boss.flashTimer - dt);
        if (boss.shieldFlashTimer > 0) {
          boss.shieldFlashTimer = Math.max(0, boss.shieldFlashTimer - dt);
        }
        if (boss.shieldShatterTimer > 0) {
          boss.shieldShatterTimer = Math.max(0, boss.shieldShatterTimer - dt);
          for (const shard of boss.shieldShards) {
            shard.x += shard.vx * dt;
            shard.y += shard.vy * dt;
            shard.rot += shard.vrot * dt;
          }
          if (boss.shieldShatterTimer === 0) {
            boss.shieldShards = [];
          }
        }

        // ボス撃破後の連続爆発フェーズ
        if (s.bossDyingTimer > 0) {
          s.bossDyingTimer = Math.max(0, s.bossDyingTimer - dt);
          s.bossExplosionBurstTimer -= dt;
          boss.flashTimer = Math.floor(s.bossDyingTimer * 22) % 2 === 0 ? 0.05 : 0;
          if (s.bossExplosionBurstTimer <= 0) {
            s.bossExplosionBurstTimer = 0.15;
            const ex = boss.x + (Math.random() - 0.5) * 140;
            const ey = boss.y + (Math.random() - 0.5) * 130;
            spawnParticles(ex, ey, Math.random() < 0.5 ? '#FB923C' : '#F43F5E', 18, 250, true);
            spawnParticles(ex, ey, '#FDE047', 8, 180);
            synthAudio.playExplosion(false);
            triggerShake(7, 0.16);
          }

          if (s.bossDyingTimer === 0) {
            synthAudio.playExplosion(true);
            triggerShake(13, 0.5);
            spawnParticles(boss.x, boss.y, '#F43F5E', 58, 350, true);
            spawnParticles(boss.x, boss.y, '#22D3EE', 38, 290, true);
            const gained = addScore(4500);
            s.floatingTexts.push({
              x: boss.x,
              y: boss.y - 44,
              text: `+${gained}`,
              color: '#FDE047',
              life: 1.8,
              big: true,
            });
            s.enemiesDefeated += 1;
            for (let g = 0; g < 4; g++) {
              s.pickups.push({
                x: boss.x + (Math.random() - 0.5) * 90,
                y: boss.y + (Math.random() - 0.5) * 90,
                vx: -50 + (Math.random() - 0.5) * 120,
                vy: (Math.random() - 0.5) * 120,
                age: 0,
                value: 25,
                isBonus: true,
              });
            }
            p.shield = Math.min(p.maxShield, p.shield + 1);
            const clearedStage8 = !s.isEndless && s.stageNumber >= 8;
            s.boss = null;
            if (clearedStage8) {
              s.enemies = [];
              s.enemyBullets = [];
              s.endingPhase = 'move_left';
              s.endingTimer = 0.9;
            } else {
              advanceStage();
            }
          }
        } else {
          const prevShieldTimer = boss.shieldTimer;
          if (boss.shieldTimer > 0) {
            boss.shieldTimer = Math.max(0, boss.shieldTimer - dt);
            if (prevShieldTimer > 0 && boss.shieldTimer === 0 && s.enemies.length > 0) {
              // 押し戻し終了時に残存している雑魚敵もすべて爆散させて安全にボス戦・クイズへ移行
              for (const rem of s.enemies) {
                spawnParticles(rem.x, rem.y, '#FB923C', 12, 210, true);
              }
              s.enemies = [];
            }
          } else if (
            !boss.shieldIntact &&
            boss.shieldFadeTimer > 0 &&
            boss.quizState === 'none'
          ) {
            boss.shieldFadeTimer = Math.max(0, boss.shieldFadeTimer - dt);
          }

          if (boss.quizState === 'push') {
            boss.quizPushTimer = Math.max(0, boss.quizPushTimer - dt);
            if (boss.quizPushTimer === 0) {
              boss.quizState = 'active';
              p.x = BOSS_QUIZ_START_X;
              p.y = getBossQuizStartY(externalQuizRef.current);
              p.prevX = p.x;
              p.prevY = p.y;
              p.tilt = 0;
            }
          } else if (boss.quizState === 'active') {
            boss.quizTimer = Math.max(0, boss.quizTimer - dt);
            // 一定時間ヒットしていない選択肢の継続ダメージは素早く回復させる
            for (let k = 0; k < 4; k++) {
              boss.quizNoHitTimers[k] += dt;
              if (boss.quizNoHitTimers[k] > 0.22 && boss.quizTargetDamage[k] > 0) {
                boss.quizTargetDamage[k] = Math.max(
                  0,
                  boss.quizTargetDamage[k] - 1.35 * dt,
                );
              }
            }
            if (boss.quizTimer === 0) {
              // 60秒経過しても破壊できなかった場合は強制で誤答扱い（シールドは破壊できず残る）
              boss.quizSelectedIdx = null;
              if (boss.quizQuestion) {
                recordWrongTerm(boss.quizQuestion.termId);
              }
              s.quizTotalAnswered += 1;
              boss.quizResult = 'timeout';
              boss.piercingQuizActive = true;
              boss.consecutiveQuizMisses += 1;
              boss.quizBoostTier = boss.consecutiveQuizMisses;
              boss.shieldIntact = true;
              boss.shieldFlashTimer = 0.35;
              synthAudio.playQuizWrong();
              spawnParticles(p.x, p.y, '#F43F5E', 24, 240, true);
              applyFlatScoreDelta(-1000);
              s.floatingTexts.push({
                x: p.x,
                y: p.y - 36,
                text: '-1000',
                color: '#FB7185',
                life: 1.8,
                big: true,
              });
              boss.quizFeedbackTimer = 3.8;
              boss.quizState = 'feedback';
              boss.lastQuizSolvedElapsed = s.elapsedTime;
              s.bullets = [];
            }
          } else if (boss.quizState === 'feedback') {
            boss.quizFeedbackTimer = Math.max(0, boss.quizFeedbackTimer - dt);
            if (boss.quizFeedbackTimer === 0) {
              boss.quizState = 'none';
              boss.shieldTimer = 0;
              boss.shieldFadeTimer = boss.shieldIntact ? BOSS_SHIELD_FADE_DURATION : 0;
              boss.quizCooldownTimer = BOSS_QUIZ_COOLDOWN_SEC;
              boss.lastQuizSolvedElapsed = s.elapsedTime;
              boss.quizQuestion = null;
              boss.quizResult = 'none';
              boss.quizSelectedIdx = null;
              boss.quizTargetDamage = [0, 0, 0, 0];
              boss.quizNoHitTimers = [0, 0, 0, 0];
              boss.fireTimer = Math.max(boss.fireTimer, 0.75);
              boss.subFireTimer = Math.max(boss.subFireTimer, 1.0);
            }
          }

          const hpRatio = boss.hp / boss.maxHp;
          if (hpRatio < 0.34) boss.phase = 3;
          else if (hpRatio < 0.67) boss.phase = 2;
          else boss.phase = 1;

          const effectivePhase = Math.min(
            3,
            boss.phase + (boss.quizBoostTier >= 1 ? 1 : 0),
          ) as 1 | 2 | 3;
          const effectiveTier = boss.stageTier + boss.quizBoostTier;

          if (boss.x > boss.targetX) {
            boss.x = Math.max(boss.targetX, boss.x - 215 * dt);
          } else {
            const tierMoveBoost = 1 + Math.min(0.45, (effectiveTier - 1) * 0.1);
            const baseFreq =
              (effectivePhase === 3 ? 1.65 : effectivePhase === 2 ? 1.3 : 1.05) *
              tierMoveBoost *
              (boss.quizState !== 'none' ? 0.45 : 1.0);
            const laserSlowdown = boss.laserState === 'idle' ? 1.0 : 0.35;
            boss.movePhase += dt * baseFreq * laserSlowdown;
            boss.y = LOGICAL_H / 2 + Math.sin(boss.movePhase) * 185;
          }

          if (boss.quizState === 'none') {
            const bossSpdMult =
              (s.isEndless ? 1 + Math.min(0.75, attackEndlessLoop * 0.12) : 1) *
              (1 + Math.min(0.45, boss.quizBoostTier * 0.14));
            // HARDモードまたは誤答時は100%貫通。通常エンドレスの正解時は最初のボスP1=1%, P2=2%, P3=3%, 2体目P1=4%...とフェーズ・ボス戦ごとに+1%ずつ貫通弾が増える
            const endlessBossPierceRate = s.isEndless
              ? Math.min(1, ((s.endlessLoop - 1) * 3 + boss.phase) * 0.01)
              : 0;
            const pushBossBullet = (x: number, y: number, vx: number, vy: number, radius: number) => {
              const isPiercing =
                s.difficulty === 'hard' ||
                boss.piercingQuizActive ||
                (s.isEndless && Math.random() < endlessBossPierceRate);
              const bulletHp = isPiercing ? 999 : 1;
              s.enemyBullets.push({
                x,
                y,
                vx: vx * bossSpdMult,
                vy: vy * bossSpdMult,
                radius,
                hp: bulletHp,
                maxHp: bulletHp,
                indestructible: isPiercing,
                fromBoss: true,
                flashTimer: 0,
              });
            };

            const tierFireMult =
              (s.isEndless
                ? Math.max(0.32, 0.56 - attackEndlessLoop * 0.06)
                : Math.max(0.52, 1 - (effectiveTier - 1) * 0.06)) *
              Math.max(0.62, 1 - boss.quizBoostTier * 0.14);
            boss.fireTimer -= dt;
            if (boss.fireTimer <= 0 && boss.x <= boss.targetX + 20 && boss.shieldTimer <= 0) {
              const ang = Math.atan2(p.y - boss.y, p.x - boss.x);
              const extraEndlessRing = s.isEndless
                ? Math.min(8, attackEndlessLoop * 2)
                : 0;
              if (boss.shape === 'dreadnought') {
                if (effectivePhase === 1) {
                  boss.fireTimer = 1.15 * tierFireMult;
                  for (const dy of [-34, 0, 34]) {
                    pushBossBullet(boss.x - 62, boss.y + dy, -310, 0, 8.5);
                  }
                } else if (effectivePhase === 2) {
                  boss.fireTimer = 0.95 * tierFireMult;
                  for (const off of [-0.36, -0.18, 0, 0.18, 0.36]) {
                    pushBossBullet(
                      boss.x - 56,
                      boss.y,
                      Math.cos(ang + off) * 265,
                      Math.sin(ang + off) * 265,
                      8.5,
                    );
                  }
                } else {
                  boss.fireTimer = 0.72 * tierFireMult;
                  for (const dy of [-46, -22, 0, 22, 46]) {
                    pushBossBullet(boss.x - 64, boss.y + dy, -335, dy * 1.4, 8.5);
                  }
                }
              } else if (boss.shape === 'mantis') {
                if (effectivePhase === 1) {
                  boss.fireTimer = 0.95 * tierFireMult;
                  for (const dy of [-42, 42]) {
                    pushBossBullet(
                      boss.x - 48,
                      boss.y + dy,
                      Math.cos(ang) * 320,
                      Math.sin(ang) * 320,
                      7.5,
                    );
                  }
                } else if (effectivePhase === 2) {
                  boss.fireTimer = 0.78 * tierFireMult;
                  const ringCount = 9 + Math.min(5, effectiveTier - 1) + extraEndlessRing;
                  for (let k = 0; k < ringCount; k++) {
                    const a = boss.age * 2.2 + (k * Math.PI * 2) / ringCount;
                    pushBossBullet(boss.x - 24, boss.y, Math.cos(a) * 255, Math.sin(a) * 255, 7.5);
                  }
                } else {
                  boss.fireTimer = 0.58 * tierFireMult;
                  for (const off of [-0.28, -0.1, 0.1, 0.28]) {
                    pushBossBullet(
                      boss.x - 54,
                      boss.y,
                      Math.cos(ang + off) * 340,
                      Math.sin(ang + off) * 340,
                      7.5,
                    );
                  }
                }
              } else if (boss.shape === 'citadel') {
                if (effectivePhase === 1) {
                  boss.fireTimer = 1.1 * tierFireMult;
                  const cnt = 6 + Math.min(6, effectiveTier - 1) + extraEndlessRing;
                  for (let k = 0; k < cnt; k++) {
                    const a = boss.age * 1.3 + (k * Math.PI * 2) / cnt;
                    pushBossBullet(boss.x - 16, boss.y, Math.cos(a) * 235, Math.sin(a) * 235, 8);
                  }
                } else if (effectivePhase === 2) {
                  boss.fireTimer = 0.85 * tierFireMult;
                  for (const off of [-0.3, -0.15, 0, 0.15, 0.3]) {
                    pushBossBullet(
                      boss.x - 52,
                      boss.y,
                      Math.cos(ang + off) * 290,
                      Math.sin(ang + off) * 290,
                      8,
                    );
                  }
                } else {
                  boss.fireTimer = 0.68 * tierFireMult;
                  const cnt = 10 + Math.min(6, effectiveTier - 1) + extraEndlessRing;
                  for (let k = 0; k < cnt; k++) {
                    const a = boss.age * 2.4 + (k * Math.PI * 2) / cnt;
                    pushBossBullet(boss.x - 18, boss.y, Math.cos(a) * 265, Math.sin(a) * 265, 8);
                  }
                }
              } else {
                // cruiser (VALKYRIE-07)
                if (effectivePhase === 1) {
                  boss.fireTimer = 1.25 * tierFireMult;
                  for (const off of [-0.28, 0, 0.28]) {
                    pushBossBullet(
                      boss.x - 54,
                      boss.y,
                      Math.cos(ang + off) * 285,
                      Math.sin(ang + off) * 285,
                      8,
                    );
                  }
                } else if (effectivePhase === 2) {
                  boss.fireTimer = 0.82 * tierFireMult;
                  const ringCount = 8 + Math.min(6, effectiveTier - 1) + extraEndlessRing;
                  for (let k = 0; k < ringCount; k++) {
                    const a = boss.age * 1.9 + (k * Math.PI * 2) / ringCount;
                    pushBossBullet(boss.x - 30, boss.y, Math.cos(a) * 245, Math.sin(a) * 245, 7.5);
                  }
                } else {
                  boss.fireTimer = 0.65 * tierFireMult;
                  for (const off of [-0.34, -0.17, 0, 0.17, 0.34]) {
                    pushBossBullet(
                      boss.x - 58,
                      boss.y,
                      Math.cos(ang + off) * 315,
                      Math.sin(ang + off) * 315,
                      8,
                    );
                  }
                }
              }

              // 連続不正解強化時の追加弾幕（2連続以上でさらに濃密化）
              if (boss.quizBoostTier >= 2) {
                for (const off of [-0.22, 0.22]) {
                  pushBossBullet(
                    boss.x - 52,
                    boss.y,
                    Math.cos(ang + off) * 320,
                    Math.sin(ang + off) * 320,
                    7.5,
                  );
                }
              }
            }

            // Stage 2〜8 段階パーツ＆クイズ強化＆エンドレスモード追加攻撃パターン
            if (effectiveTier >= 2 && boss.x <= boss.targetX + 20 && boss.shieldTimer <= 0) {
              boss.subFireTimer -= dt;
              if (boss.subFireTimer <= 0) {
                boss.subFireTimer = s.isEndless
                  ? Math.max(0.36, 0.85 - attackEndlessLoop * 0.1)
                  : Math.max(0.68, 1.85 - (effectiveTier - 2) * 0.17);
                const angToP = Math.atan2(p.y - boss.y, p.x - boss.x);

                // Stage 2+: 左右ウイング追加砲台からの並列・挟撃ショット
                for (const wy of [-84, 84]) {
                  const wa = Math.atan2(p.y - (boss.y + wy), p.x - (boss.x - 24));
                  pushBossBullet(boss.x - 28, boss.y + wy, Math.cos(wa) * 290, Math.sin(wa) * 290, 7.2);
                }
                // Stage 3+: 前方ツインレール砲門からの高速バースト
                if (effectiveTier >= 3) {
                  for (const my of [-42, 42]) {
                    pushBossBullet(boss.x - 98, boss.y + my, -385, my * 0.7, 7.5);
                  }
                }
                // Stage 4+: 回転衛星ポッドからの狙撃弾
                if (effectiveTier >= 4) {
                  const satCount = effectiveTier >= 8 ? 6 : effectiveTier >= 6 ? 4 : 2;
                  for (let sIdx = 0; sIdx < satCount; sIdx++) {
                    const sa = boss.age * 1.9 + (sIdx * Math.PI * 2) / satCount;
                    const sx = boss.x + Math.cos(sa) * 112;
                    const sy = boss.y + Math.sin(sa) * 112;
                    const aim = Math.atan2(p.y - sy, p.x - sx);
                    pushBossBullet(sx, sy, Math.cos(aim) * 265, Math.sin(aim) * 265, 7);
                  }
                }
                // Stage 5+: 外翼デュアル砲塔からの広角斜め弾
                if (effectiveTier >= 5) {
                  for (const wy of [-104, 104]) {
                    pushBossBullet(boss.x - 16, boss.y + wy, -270, wy * 1.1, 7.2);
                  }
                }
                // Stage 6+: 回転リアクターリングからの放射6WAY
                if (effectiveTier >= 6) {
                  const ringWays = s.isEndless
                    ? 8 + Math.min(6, attackEndlessLoop * 2)
                    : 6;
                  for (let rIdx = 0; rIdx < ringWays; rIdx++) {
                    const ra = -boss.age * 1.6 + (rIdx * Math.PI * 2) / ringWays;
                    pushBossBullet(boss.x, boss.y, Math.cos(ra) * 235, Math.sin(ra) * 235, 7);
                  }
                }
                // Stage 7+: 先端ランス砲からの高速3連集中弾
                if (effectiveTier >= 7) {
                  for (const off of [-0.14, 0, 0.14]) {
                    pushBossBullet(
                      boss.x - 114,
                      boss.y,
                      Math.cos(angToP + off) * 390,
                      Math.sin(angToP + off) * 390,
                      8,
                    );
                  }
                }
                // Stage 8+: Ωウイングクレスト全斉射
                if (effectiveTier >= 8) {
                  for (const side of [-1, 1]) {
                    pushBossBullet(boss.x - 42, boss.y + side * 124, -340, side * 55, 8);
                  }
                }
              }
            }

            // NormalはPHASE 3/3のみ、HARDはPHASE 1からLaser攻撃を行う
            if (s.difficulty === 'hard' || boss.phase === 3) {
              boss.laserTimer -= dt;
              if (boss.laserState === 'idle' && boss.laserTimer <= 0) {
                boss.laserState = 'telegraph';
                boss.laserTimer = effectiveTier >= 3 ? 0.95 : 1.1;
                boss.laserY = boss.y;
              } else if (boss.laserState === 'telegraph') {
                boss.laserY = boss.y;
                if (boss.laserTimer <= 0) {
                  boss.laserState = 'firing';
                  boss.laserTimer = 0.85;
                  synthAudio.playShoot('laser');
                  triggerShake(6, 0.35);
                }
              } else if (boss.laserState === 'firing') {
                boss.laserY = boss.y;
                const laserHalfTol = p.shield > 0 ? 26 : 16;
                if (Math.abs(p.y - boss.laserY) < laserHalfTol && p.x < boss.x) {
                  damagePlayer();
                }
                if (boss.laserTimer <= 0) {
                  boss.laserState = 'idle';
                  boss.laserTimer =
                    3.4 * Math.max(0.7, 1 - (effectiveTier - 1) * 0.06);
                }
              }
            } else if (boss.laserState !== 'idle') {
              boss.laserState = 'idle';
            }

            if (boss.shieldTimer <= 0 && !boss.shieldIntact) {
              for (let j = s.bullets.length - 1; j >= 0; j--) {
                const b = s.bullets[j];
                if (b.hitIds.has(-999)) continue;
                let cx = b.x;
                let cy = b.y;
                if (b.kind === 'cross_laser') {
                  const maxBack = Math.min(0.25, b.age);
                  const tBack = Math.max(0, Math.min(maxBack, (b.x - boss.x) / Math.max(1, b.vx)));
                  const amp = 28 + ((b.level ?? 1) - 1) * 3;
                  cx = b.x - b.vx * tBack;
                  cy = (b.originY ?? b.y) + (b.phaseSign ?? 1) * Math.sin((b.age - tBack) * 17) * amp;
                } else if (b.beamHalfLen) {
                  cx = Math.max(b.x - b.beamHalfLen, Math.min(b.x + b.beamHalfLen, boss.x));
                }
                if (Math.hypot(cx - boss.x, cy - boss.y) < b.radius + boss.radius) {
                  b.hitIds.add(-999);
                  boss.hp -= b.damage;
                  boss.flashTimer = 0.05;
                  spawnParticles(cx, cy, b.color, 3, 120);
                  b.pierce -= 1;
                  if (b.pierce <= 0) s.bullets.splice(j, 1);
                }
              }
            }

            // ダメージ後のフェーズ再判定
            const postDmgRatio = boss.hp / boss.maxHp;
            if (postDmgRatio < 0.34) boss.phase = 3;
            else if (postDmgRatio < 0.67) boss.phase = 2;
            else boss.phase = 1;

            // 最低3回の出題保証：3回未満のうちはボスHPを5%で一時下限保護し、ガード経過後に必ず出題する
            const hpFloor = Math.max(1, Math.round(boss.maxHp * 0.05));
            let hitHpFloorForQuiz = false;
            if (boss.quizCount < 3 && boss.hp <= hpFloor) {
              boss.hp = hpFloor;
              hitHpFloorForQuiz = true;
            }

            // 正解してシールド破壊後はフェーズ変更まで再出題しない。不正解でシールドが残った場合は一定時間耐えると再挑戦できる
            const canTriggerByGuard =
              s.elapsedTime - boss.lastQuizSolvedElapsed > BOSS_QUIZ_PHASE_GUARD_SEC;
            let shouldTriggerQuiz = false;
            if (boss.phase > boss.prevPhase) {
              boss.prevPhase = boss.phase;
              if (canTriggerByGuard) {
                shouldTriggerQuiz = true;
              }
            }
            if (boss.shieldIntact) {
              boss.quizCooldownTimer -= dt;
              if (boss.quizCooldownTimer <= 0 && canTriggerByGuard) {
                shouldTriggerQuiz = true;
              }
            }
            if (hitHpFloorForQuiz && canTriggerByGuard) {
              shouldTriggerQuiz = true;
            }

            if (boss.hp <= 0) {
              boss.hp = 0;
              boss.laserState = 'idle';
              s.enemyBullets = [];
              s.laserStreamStrength = 0;
              s.bossDyingTimer = !s.isEndless && s.stageNumber >= 8 ? 1.85 : 1.15;
              s.bossExplosionBurstTimer = 0;
              synthAudio.playExplosion(true);
              triggerShake(9, 0.25);
            } else if (shouldTriggerQuiz) {
              startBossQuiz(boss);
            }
          }
        }
      }

      const playerBulletHitRadius = p.shield > 0 ? 6 : 2;
      for (let i = s.enemyBullets.length - 1; i >= 0; i--) {
        if (i >= s.enemyBullets.length) continue;
        const eb = s.enemyBullets[i];
        if (!eb) continue;
        if (eb.flashTimer > 0) eb.flashTimer = Math.max(0, eb.flashTimer - dt);
        if (isBossShieldPush) {
          eb.x -= 960 * dt;
          if (eb.x < -40) {
            s.enemyBullets[i] = s.enemyBullets[s.enemyBullets.length - 1];
            s.enemyBullets.pop();
          }
          continue;
        }
        eb.x += eb.vx * dt;
        eb.y += eb.vy * dt;
        if (Math.hypot(eb.x - p.x, eb.y - p.y) < eb.radius + playerBulletHitRadius) {
          damagePlayer();
          if (i < s.enemyBullets.length && s.enemyBullets[i] === eb) {
            s.enemyBullets[i] = s.enemyBullets[s.enemyBullets.length - 1];
            s.enemyBullets.pop();
          }
          if (s.boss && s.boss.quizState === 'push') {
            break;
          }
          continue;
        }
        if (
          eb.x < -40 ||
          eb.x > LOGICAL_W + 40 ||
          eb.y < -40 ||
          eb.y > LOGICAL_H + 40
        ) {
          s.enemyBullets[i] = s.enemyBullets[s.enemyBullets.length - 1];
          s.enemyBullets.pop();
        }
      }

      for (let i = s.pickups.length - 1; i >= 0; i--) {
        const g = s.pickups[i];
        g.age += dt;
        const dx = p.x - g.x;
        const dy = p.y - g.y;
        const dist = Math.hypot(dx, dy);

        if (g.age > 0.14) {
          const pullSpeed = 880 + Math.min(400, g.age * 300);
          g.vx = (dx / Math.max(1, dist)) * pullSpeed;
          g.vy = (dy / Math.max(1, dist)) * pullSpeed;
        }
        g.x += g.vx * dt;
        g.y += g.vy * dt;

        if (dist < 32) {
          synthAudio.playXp();
          s.pickups.splice(i, 1);
          if (s.level < MAX_WEAPON_LEVEL) {
            s.xp += g.value;
            while (s.xp >= s.xpToNext && s.level < MAX_WEAPON_LEVEL) {
              s.xp -= s.xpToNext;
              s.level += 1;
              s.xpToNext = Math.round(s.xpToNext * 1.24 + 14);
              synthAudio.playLevelUp();
              applyAutoUpgradeStep();
              if (s.level >= MAX_WEAPON_LEVEL) {
                s.xp = s.xpToNext;
                break;
              }
            }
          } else {
            const gained = addScore(180);
            s.floatingTexts.push({
              x: p.x,
              y: p.y - 26,
              text: `+${gained}`,
              color: '#67E8F9',
              life: 0.75,
            });
          }
          continue;
        }
        if (
          g.x < -120 ||
          g.x > LOGICAL_W + 140 ||
          g.y < -140 ||
          g.y > LOGICAL_H + 140
        ) {
          s.pickups.splice(i, 1);
        }
      }

      updateParticlesAndTexts(dt);
    };

    const renderScene = () => {
      const s = simRef.current;
      const st = getCurrentCourse();
      const p = s.player;
      const isBossShieldPush = Boolean(s.boss && s.boss.shieldTimer > 0);

      const stageTier =
        gameStateRef.current === 'TITLE_MENU'
          ? 1
          : s.isEndless
            ? 9 + ((s.endlessLoop - 1) % 4)
            : Math.max(1, Math.min(8, s.stageNumber));
      const bgKey = `${st.id}:${stageTier}`;

      if (cachedBgKey !== bgKey || !cachedSkyGrad || !cachedHorizonGrad) {
        cachedBgKey = bgKey;
        const stageTopShift: Record<number, string> = {
          1: st.skyTop,
          2: st.skyTop,
          3: st.id === 'foundry' ? '#1E0806' : '#090F24',
          4: st.id === 'cyber_vault' ? '#041C16' : '#110D2B',
          5: st.id === 'foundry' ? '#2A0A08' : '#160B2E',
          6: st.id === 'orbital' ? '#1E0938' : '#1B0C29',
          7: '#23091F',
          8: '#2B0718',
          9: '#22062B',
          10: '#0A192E',
          11: '#2E0914',
          12: '#140836',
        };
        const stageHorizonAlpha =
          stageTier <= 2 ? '38' : stageTier <= 4 ? '4E' : stageTier <= 6 ? '66' : '82';
        cachedSkyGrad = ctx.createLinearGradient(0, 0, 0, LOGICAL_H);
        cachedSkyGrad.addColorStop(0, stageTopShift[stageTier] ?? st.skyTop);
        cachedSkyGrad.addColorStop(1, st.skyBottom);

        cachedHorizonGrad = ctx.createLinearGradient(0, LOGICAL_H - 240, 0, LOGICAL_H);
        cachedHorizonGrad.addColorStop(0, 'rgba(0,0,0,0)');
        cachedHorizonGrad.addColorStop(
          1,
          `${stageTier >= 7 ? '#F43F5E' : st.horizonColor}${stageHorizonAlpha}`,
        );
      }
      if (!cachedLavaGrad) {
        cachedLavaGrad = ctx.createLinearGradient(0, LOGICAL_H - 40, 0, LOGICAL_H);
        cachedLavaGrad.addColorStop(0, 'rgba(249, 115, 22, 0)');
        cachedLavaGrad.addColorStop(1, 'rgba(239, 68, 68, 0.45)');
      }

      ctx.save();
      if (s.shakeTimer > 0 && s.shakeIntensity > 0) {
        const sx = (Math.random() - 0.5) * s.shakeIntensity * 2;
        const sy = (Math.random() - 0.5) * s.shakeIntensity * 2;
        ctx.translate(sx, sy);
      }

      ctx.fillStyle = cachedSkyGrad;
      ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

      // Stage 1 -> 8 Progressive Celestial / Atmospheric Landmarks
      if (stageTier >= 3) {
        const moonX = LOGICAL_W * 0.78 - ((s.bgOffset * 0.04) % 160);
        const moonY = 122;
        const moonR = stageTier >= 7 ? 74 : 58;
        ctx.save();
        ctx.fillStyle =
          stageTier >= 7
            ? 'rgba(244, 63, 94, 0.16)'
            : stageTier >= 5
              ? 'rgba(251, 146, 60, 0.14)'
              : `${st.accentColor}1E`;
        ctx.beginPath();
        ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle =
          stageTier >= 7
            ? 'rgba(251, 113, 133, 0.45)'
            : `${st.accentColor}44`;
        ctx.lineWidth = stageTier >= 7 ? 2.5 : 1.5;
        ctx.beginPath();
        ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
        ctx.stroke();
        if (stageTier >= 5) {
          ctx.strokeStyle =
            stageTier >= 7
              ? 'rgba(253, 224, 71, 0.28)'
              : 'rgba(125, 211, 252, 0.24)';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.ellipse(moonX, moonY, moonR * 1.75, moonR * 0.34, -0.22, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }

      if (stageTier >= 4) {
        // Parallax ion aurora ribbons
        ctx.save();
        ctx.globalAlpha = stageTier >= 7 ? 0.22 : 0.13;
        ctx.fillStyle = stageTier >= 7 ? '#F43F5E' : st.accentColor;
        const bandShift = (s.bgOffset * 0.15) % 420;
        for (let bIdx = 0; bIdx < 3; bIdx++) {
          const by = 68 + bIdx * 54 + Math.sin(s.elapsedTime * 0.8 + bIdx) * 8;
          ctx.fillRect(0, by, LOGICAL_W, 10 + (bIdx % 2) * 6);
          ctx.fillStyle = bIdx % 2 === 0 ? st.horizonColor : st.accentColor;
          ctx.fillRect((bIdx * 310 - bandShift + LOGICAL_W) % LOGICAL_W, by - 4, 220, 4);
        }
        ctx.restore();
      }

      if (stageTier >= 7) {
        // High-altitude meteor / ember streaks in climax stages 7-8 & Endless
        ctx.save();
        ctx.strokeStyle =
          stageTier >= 9
            ? 'rgba(167, 139, 250, 0.38)'
            : 'rgba(251, 146, 60, 0.36)';
        ctx.lineWidth = 1.5;
        for (let m = 0; m < 6; m++) {
          const mx =
            (((m * 240 - s.elapsedTime * (280 + m * 28)) % (LOGICAL_W + 180)) +
              LOGICAL_W +
              180) %
              (LOGICAL_W + 180) -
            90;
          const my = 55 + ((m * 97) % 340);
          ctx.beginPath();
          ctx.moveTo(mx, my);
          ctx.lineTo(mx + 42, my + 12);
          ctx.stroke();
        }
        ctx.restore();
      }

      for (const star of s.stars) {
        const sx =
          ((star.x - s.bgOffset * (star.speed / 120)) % LOGICAL_W + LOGICAL_W) %
          LOGICAL_W;
        ctx.fillStyle = `rgba(226, 232, 240, ${star.alpha})`;
        if (
          isBossShieldPush ||
          s.quizPhase === 'prepare' ||
          s.quizPhase === 'boost_out' ||
          s.quizPhase === 'boost_in'
        ) {
          ctx.fillRect(sx, star.y, star.size * 18, Math.max(1.2, star.size * 0.75));
        } else {
          ctx.fillRect(sx, star.y, star.size, star.size);
        }
      }

      ctx.fillStyle = cachedHorizonGrad;
      ctx.fillRect(0, LOGICAL_H - 240, LOGICAL_W, 240);

      // Course-Specific Distinct Parallax Backgrounds
      if (st.id === 'foundry') {
        // Overhead industrial steel girders & hanging pipes
        ctx.fillStyle = '#1E0D0B';
        ctx.fillRect(0, 0, LOGICAL_W, 30);
        for (const b of s.buildingsNear) {
          const bx =
            (((b.x - s.bgOffset * 0.72) % (14 * 118) + 14 * 118) % (14 * 118)) -
            140;
          ctx.fillStyle = '#29110B';
          ctx.fillRect(bx + 18, 28, 22, 46);
          ctx.fillStyle = '#1B0B09';
          const by = LOGICAL_H - b.h * 0.9;
          ctx.fillRect(bx, by, b.w, b.h * 0.9);
          // Furnace core vents
          ctx.fillStyle = 'rgba(249, 115, 22, 0.35)';
          ctx.fillRect(bx + 12, by + 18, b.w - 24, 14);
          ctx.strokeStyle = 'rgba(251, 146, 60, 0.32)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(bx, by, b.w, b.h * 0.9);
        }
        // Molten floor glow
        ctx.fillStyle = cachedLavaGrad;
        ctx.fillRect(0, LOGICAL_H - 40, LOGICAL_W, 40);
      } else if (st.id === 'cyber_vault') {
        // Perspective cyber-grid ceiling & floor + floating hologram data columns
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.24)';
        ctx.lineWidth = 1.2;
        for (const rowY of [48, 86, LOGICAL_H - 86, LOGICAL_H - 48]) {
          ctx.beginPath();
          ctx.moveTo(0, rowY);
          ctx.lineTo(LOGICAL_W, rowY);
          ctx.stroke();
        }
        for (let i = 0; i < 16; i++) {
          const gx = (((i * 110 - s.bgOffset * 0.75) % 1760) + 1760) % 1760 - 120;
          ctx.beginPath();
          ctx.moveTo(gx, 0);
          ctx.lineTo(gx - 40, 96);
          ctx.moveTo(gx, LOGICAL_H);
          ctx.lineTo(gx - 40, LOGICAL_H - 96);
          ctx.stroke();
        }
        for (const b of s.buildingsFar) {
          const bx =
            (((b.x - s.bgOffset * 0.45) % (18 * 92) + 18 * 92) % (18 * 92)) - 120;
          ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
          ctx.strokeStyle = 'rgba(52, 211, 153, 0.28)';
          ctx.lineWidth = 1;
          const colH = b.h * 1.1;
          const colY = (LOGICAL_H - colH) / 2;
          ctx.fillRect(bx, colY, b.w * 0.65, colH);
          ctx.strokeRect(bx, colY, b.w * 0.65, colH);
        }
      } else if (st.id === 'orbital') {
        // Curved planetary horizon arc + giant orbital tether pillars & ring
        ctx.save();
        ctx.strokeStyle = 'rgba(167, 139, 250, 0.45)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(LOGICAL_W * 0.5, LOGICAL_H + 540, 680, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
        ctx.fillStyle = 'rgba(91, 33, 182, 0.2)';
        ctx.beginPath();
        ctx.arc(LOGICAL_W * 0.5, LOGICAL_H + 540, 680, Math.PI * 1.15, Math.PI * 1.85);
        ctx.lineTo(LOGICAL_W, LOGICAL_H);
        ctx.lineTo(0, LOGICAL_H);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        for (let i = 0; i < 8; i++) {
          const px = (((i * 220 - s.bgOffset * 0.55) % 1760) + 1760) % 1760 - 120;
          ctx.fillStyle = 'rgba(15, 12, 38, 0.85)';
          ctx.fillRect(px, 0, 26, LOGICAL_H);
          ctx.fillStyle = 'rgba(167, 139, 250, 0.28)';
          ctx.fillRect(px + 10, 0, 4, LOGICAL_H);
        }
      } else {
        // COURSE 01: NEON SKYWAY City Skyline
        ctx.fillStyle = st.buildingColor;
        for (const b of s.buildingsFar) {
          const bx =
            (((b.x - s.bgOffset * 0.35) % (18 * 92) + 18 * 92) % (18 * 92)) - 120;
          const by = LOGICAL_H - b.h;
          ctx.fillRect(bx, by, b.w, b.h);
          ctx.fillStyle = `${st.accentColor}26`;
          ctx.fillRect(bx + 6, by + 10, b.w - 12, 3);
          ctx.fillRect(bx + 6, by + 22, (b.w - 12) * 0.6, 2);
          ctx.fillStyle = st.buildingColor;
        }

        for (const b of s.buildingsNear) {
          const bx =
            (((b.x - s.bgOffset * 0.72) % (14 * 118) + 14 * 118) % (14 * 118)) -
            140;
          const by = LOGICAL_H - b.h;
          ctx.fillStyle = '#060913';
          ctx.fillRect(bx, by, b.w, b.h);
          ctx.strokeStyle = `${st.accentColor}44`;
          ctx.lineWidth = 1;
          ctx.strokeRect(bx, by, b.w, b.h);
        }

        ctx.strokeStyle = `${st.accentColor}30`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, LOGICAL_H - 26);
        ctx.lineTo(LOGICAL_W, LOGICAL_H - 26);
        ctx.stroke();
      }

      // High-speed scroll wind streaks when Boss Shield deploys or Quiz Gate prepares/boosts
      if (
        isBossShieldPush ||
        s.quizPhase === 'prepare' ||
        s.quizPhase === 'boost_out' ||
        s.quizPhase === 'boost_in'
      ) {
        ctx.save();
        ctx.strokeStyle = 'rgba(125, 211, 252, 0.42)';
        ctx.lineWidth = 2.2;
        for (let k = 0; k < 20; k++) {
          const sy = ((k * 43 + 17) % (LOGICAL_H - 40)) + 20;
          const sx =
            (((k * 197 - s.elapsedTime * 2100) % LOGICAL_W) + LOGICAL_W) %
            LOGICAL_W;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + 130, sy);
          ctx.stroke();
        }
        ctx.restore();
      }

      // QUIZ GATE BACK LAYER (Center background "GO ➡", Translucent Elliptical Portal Rings + Mouth "➡ GO")
      const isExternalQuiz = externalQuizRef.current;
      const gateLayout = getGateLayout(isExternalQuiz);
      const isQuizRenderVisible =
        s.quizQuestion &&
        (s.quizPhase === 'selecting' ||
          s.quizPhase === 'feedback' ||
          s.quizPhase === 'boost_out');
      if (isQuizRenderVisible && s.quizQuestion) {
        const q = s.quizQuestion;
        const alignedIdx = getAlignedGateIndex(p.y, isExternalQuiz);
        const isFeedback =
          s.quizPhase === 'feedback' || s.quizPhase === 'boost_out';
        const rx = isExternalQuiz ? 28 : 24;
        const ry = isExternalQuiz ? 54 : 46;

        // Center-background large translucent "GO ➡" behind player ship
        if (s.quizPhase === 'selecting') {
          const centerY =
            (gateLayout.tops[0] + gateLayout.tops[3] + gateLayout.height) / 2;
          const centerX = (GATE_START_X + GATE_ENTRY_X) * 0.5 + 10;
          const driftPulse = Math.sin(s.elapsedTime * 4.5) * 10;
          ctx.save();
          ctx.globalAlpha = 0.24 + Math.sin(s.elapsedTime * 5.2) * 0.06;
          ctx.fillStyle = '#22D3EE';
          ctx.strokeStyle = '#67E8F9';
          ctx.lineWidth = 2.5;
          ctx.font = '900 72px "Outfit", sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText('GO', centerX + 18 + driftPulse, centerY + 24);

          const ax = centerX + 34 + driftPulse;
          ctx.beginPath();
          ctx.moveTo(ax, centerY - 14);
          ctx.lineTo(ax + 54, centerY - 14);
          ctx.lineTo(ax + 54, centerY - 32);
          ctx.lineTo(ax + 96, centerY);
          ctx.lineTo(ax + 54, centerY + 32);
          ctx.lineTo(ax + 54, centerY + 14);
          ctx.lineTo(ax, centerY + 14);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }

        // Horizontal alignment guide line from ship toward aligned ring
        if (s.quizPhase === 'selecting') {
          ctx.save();
          ctx.strokeStyle = 'rgba(34, 211, 238, 0.34)';
          ctx.setLineDash([8, 8]);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(p.x + 30, p.y);
          ctx.lineTo(GATE_ENTRY_X - rx, p.y);
          ctx.stroke();
          ctx.restore();
        }

        // Draw translucent portal interior + back half of each elliptical ring
        for (let i = 0; i < 4; i++) {
          const cy = gateLayout.tops[i] + gateLayout.height / 2;
          const isAligned = s.quizPhase === 'selecting' && alignedIdx === i;
          const isSelected = s.quizSelectedGate === i;
          const isCorrectChoice = q.correctIndex === i;

          let ringColor = isAligned ? '#22D3EE' : 'rgba(56, 189, 248, 0.65)';
          let portalFill = isAligned
            ? 'rgba(34, 211, 238, 0.24)'
            : 'rgba(14, 165, 233, 0.12)';
          if (isFeedback) {
            if (isCorrectChoice) {
              ringColor = '#10B981';
              portalFill = 'rgba(16, 185, 129, 0.32)';
            } else if (isSelected) {
              ringColor = '#F43F5E';
              portalFill = 'rgba(244, 63, 94, 0.32)';
            } else {
              ringColor = 'rgba(71, 85, 105, 0.45)';
              portalFill = 'rgba(15, 23, 42, 0.18)';
            }
          }

          ctx.save();
          // Translucent open elliptical interior
          ctx.fillStyle = portalFill;
          ctx.beginPath();
          ctx.ellipse(GATE_ENTRY_X, cy, rx, ry, 0, 0, Math.PI * 2);
          ctx.fill();

          // Inner subtle warp ellipse & animated pass-through chevron
          ctx.strokeStyle = isAligned
            ? 'rgba(165, 243, 252, 0.5)'
            : 'rgba(125, 211, 252, 0.24)';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.ellipse(GATE_ENTRY_X, cy, rx * 0.62, ry * 0.72, 0, 0, Math.PI * 2);
          ctx.stroke();

          if (!isFeedback || isSelected || isCorrectChoice) {
            const shift = ((s.elapsedTime * 36) % 14) - 7;
            ctx.strokeStyle = isAligned
              ? 'rgba(224, 242, 254, 0.85)'
              : 'rgba(148, 163, 184, 0.45)';
            ctx.lineWidth = 2.2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(GATE_ENTRY_X - 5 + shift, cy - 10);
            ctx.lineTo(GATE_ENTRY_X + 4 + shift, cy);
            ctx.lineTo(GATE_ENTRY_X - 5 + shift, cy + 10);
            ctx.stroke();
          }

          // Back (right) half of the elliptical ring (glow pass + sharp rim, zero shadowBlur)
          const ringWidth =
            isAligned || isSelected || (isFeedback && isCorrectChoice) ? 4 : 2.6;
          ctx.strokeStyle = ringColor;
          ctx.globalAlpha = 0.24;
          ctx.lineWidth = ringWidth + 5;
          ctx.beginPath();
          ctx.ellipse(GATE_ENTRY_X, cy, rx, ry, 0, -Math.PI * 0.5, Math.PI * 0.5);
          ctx.stroke();

          ctx.globalAlpha = 1;
          ctx.lineWidth = ringWidth;
          ctx.beginPath();
          ctx.ellipse(GATE_ENTRY_X, cy, rx, ry, 0, -Math.PI * 0.5, Math.PI * 0.5);
          ctx.stroke();

          // "➡ GO" pass-through indicator on gate selection
          if (s.quizPhase === 'selecting') {
            const pulse = Math.sin(s.elapsedTime * 7 + i * 0.6) * 4;
            if (isAligned) {
              const gx = GATE_ENTRY_X - 106 + pulse;
              ctx.fillStyle = '#E0F2FE';
              ctx.font = '800 18px "JetBrains Mono", monospace';
              ctx.textAlign = 'right';
              ctx.fillText('GO', gx + 42, cy + 6);

              ctx.fillStyle = '#22D3EE';
              ctx.beginPath();
              ctx.moveTo(gx + 50, cy - 5);
              ctx.lineTo(gx + 64, cy - 5);
              ctx.lineTo(gx + 64, cy - 11);
              ctx.lineTo(gx + 76, cy);
              ctx.lineTo(gx + 64, cy + 11);
              ctx.lineTo(gx + 64, cy + 5);
              ctx.lineTo(gx + 50, cy + 5);
              ctx.closePath();
              ctx.fill();
            } else {
              const gx = GATE_ENTRY_X - 48 + pulse * 0.6;
              ctx.globalAlpha = 0.65;
              ctx.fillStyle = '#7DD3FC';
              ctx.beginPath();
              ctx.moveTo(gx, cy - 3);
              ctx.lineTo(gx + 10, cy - 3);
              ctx.lineTo(gx + 10, cy - 7);
              ctx.lineTo(gx + 18, cy);
              ctx.lineTo(gx + 10, cy + 7);
              ctx.lineTo(gx + 10, cy + 3);
              ctx.lineTo(gx, cy + 3);
              ctx.closePath();
              ctx.fill();
            }
          }
          ctx.restore();
        }
      }

      // GREEN ROUNDED FIELD ITEMS (角のない緑のアイテム：接触ノーダメージ / 破壊でEXPチップ出現)
      for (const item of s.items) {
        ctx.save();
        ctx.translate(item.x, item.y);
        const pulse = 1 + Math.sin(s.elapsedTime * 5 + item.id) * 0.08;
        const isHit = item.flashTimer > 0;

        // Soft outer smooth aura circle
        ctx.strokeStyle = 'rgba(74, 222, 128, 0.42)';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(0, 0, item.radius * 1.24 * pulse, 0, Math.PI * 2);
        ctx.stroke();

        // Smooth plump green circular/oval pod (zero sharp angles)
        ctx.fillStyle = isHit ? '#BBF7D0' : '#064E3B';
        ctx.strokeStyle = isHit ? '#FFFFFF' : '#4ADE80';
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        ctx.arc(0, 0, item.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Inner smooth oval capsule core
        ctx.fillStyle = isHit ? '#FFFFFF' : '#22C55E';
        ctx.beginPath();
        ctx.ellipse(0, 0, item.radius * 0.56, item.radius * 0.38, 0, 0, Math.PI * 2);
        ctx.fill();

        // Highlight dot
        ctx.fillStyle = '#DCFCE7';
        ctx.beginPath();
        ctx.arc(-item.radius * 0.28, -item.radius * 0.28, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // HELPFUL PICKUPS: Smooth Round / Oval Energy Capsules (丸・楕円＝自機に有利なアイテム)
      for (const g of s.pickups) {
        ctx.save();
        ctx.translate(g.x, g.y);
        const mainColor = g.isBonus ? '#4ADE80' : '#10B981';

        // Outer smooth oval aura
        ctx.strokeStyle = 'rgba(52, 211, 153, 0.52)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.ellipse(
          0,
          0,
          16 + Math.sin(s.elapsedTime * 8) * 1.5,
          13 + Math.sin(s.elapsedTime * 8) * 1.5,
          0,
          0,
          Math.PI * 2,
        );
        ctx.stroke();

        // Smooth Oval Capsule Body
        ctx.fillStyle = '#052E16';
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.ellipse(0, 0, 12, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // "+" icon inside
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-4, 0);
        ctx.lineTo(4, 0);
        ctx.moveTo(0, -4);
        ctx.lineTo(0, 4);
        ctx.stroke();
        ctx.restore();
      }

      // Player Bullets (clipped ahead of gate cards & below question box during quiz gate)
      ctx.save();
      if (isQuizRenderVisible) {
        const clipTop = isExternalQuiz ? 0 : 184;
        ctx.beginPath();
        ctx.rect(0, clipTop, GATE_ENTRY_X + 2, LOGICAL_H - clipTop);
        ctx.clip();
      }
      ctx.globalCompositeOperation = 'lighter';

      // Continuous Laser Stream Effect (TYPE-D Lv4+ OR TYPE-C Hidden Evolution)
      const isStreamC =
        s.hiddenEvolutionUnlocked &&
        s.patternId === 'balance' &&
        (s.weapons.laser ?? 0) >= 1;
      const isStreamD = (s.weapons.laser ?? 0) >= 4;
      const isEvolvedD =
        s.hiddenEvolutionUnlocked && s.patternId === 'pierce' && isStreamD;
      if (s.laserStreamStrength > 0.02 && (isStreamD || isStreamC)) {
        const str = s.laserStreamStrength;
        const startX = p.x + 24;
        const maxEndX = isQuizRenderVisible
          ? Math.max(startX + 12, GATE_ENTRY_X + 2)
          : s.boss && (s.boss.shieldTimer > 0 || s.boss.shieldIntact || s.boss.quizState !== 'none')
            ? Math.max(startX + 12, getBossShieldXAtY(p.y))
            : LOGICAL_W + 30;
        const endX =
          isStreamC && !isStreamD ? Math.min(maxEndX, startX + 760) : maxEndX;
        const streamLen = Math.max(0, endX - startX);
        const pulseWave = 1 + Math.sin(s.elapsedTime * 52) * (isEvolvedD ? 0.16 : 0.08);
        const baseThickness = isEvolvedD ? 30 : isStreamD ? 15 : 14;
        const beamH = baseThickness * p.bulletSizeMult * (0.68 + 0.32 * str) * pulseWave;

        ctx.save();

        // Outer soft halo & plasma corridor (restrained at normal Lv10, bold on TYPE-D Hidden Evolution)
        if (isEvolvedD) {
          ctx.globalAlpha = str * 0.24;
          ctx.fillStyle = '#F43F5E';
          ctx.fillRect(startX, p.y - beamH * 1.35, streamLen, beamH * 2.7);
        }

        ctx.globalAlpha = str * (isEvolvedD ? 0.48 : 0.28);
        ctx.fillStyle = isStreamC && !isStreamD ? '#38BDF8' : '#F43F5E';
        ctx.fillRect(
          startX,
          p.y - beamH * (isEvolvedD ? 0.9 : 0.65),
          streamLen,
          beamH * (isEvolvedD ? 1.8 : 1.3),
        );

        // Mid sustained beam
        ctx.globalAlpha = str * (isEvolvedD ? 0.72 : 0.48);
        ctx.fillStyle = isStreamC && !isStreamD ? '#A5F3FC' : '#FDA4AF';
        ctx.fillRect(
          startX,
          p.y - beamH * (isEvolvedD ? 0.48 : 0.34),
          streamLen,
          beamH * (isEvolvedD ? 0.96 : 0.68),
        );

        // Inner white core
        ctx.globalAlpha = str * (isEvolvedD ? 0.9 : 0.68);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(
          startX,
          p.y - beamH * (isEvolvedD ? 0.22 : 0.14),
          streamLen,
          beamH * (isEvolvedD ? 0.44 : 0.28),
        );

        // Racing plasma surge nodes (hidden evolution or TYPE-C stream)
        if (isEvolvedD || isStreamC) {
          const spacing = 130;
          const offset = (s.elapsedTime * 1580) % spacing;
          ctx.globalAlpha = str * (isEvolvedD ? 0.88 : 0.6);
          for (let sx = startX + offset; sx < endX - 10; sx += spacing) {
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.ellipse(sx, p.y, isEvolvedD ? 18 : 13, beamH * 0.42, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // TYPE-D Hidden Evolution: crackling electrical discharge along Mega Laser
        if (isEvolvedD && streamLen > 30) {
          ctx.globalAlpha = str * 0.92;
          ctx.strokeStyle = '#67E8F9';
          ctx.lineWidth = 2.2;
          const arcStep = 44;
          const phase = s.elapsedTime * 36;
          ctx.beginPath();
          ctx.moveTo(startX, p.y);
          for (let ax = startX + arcStep; ax < endX; ax += arcStep) {
            const j = Math.sin(ax * 0.09 + phase) * beamH * 1.15;
            ctx.lineTo(ax, p.y + j);
          }
          ctx.stroke();

          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.moveTo(startX, p.y);
          for (let ax = startX + 36; ax < endX; ax += 52) {
            const j = Math.cos(ax * 0.11 - phase * 1.3) * beamH * 0.85;
            ctx.lineTo(ax, p.y + j);
          }
          ctx.stroke();
        }

        // Muzzle energy corona at ship nose
        const flareR = (isEvolvedD ? 21 : isStreamD ? 11 : 12) * pulseWave * str;
        ctx.globalAlpha = str * (isEvolvedD ? 0.95 : 0.65);
        ctx.fillStyle = isStreamC && !isStreamD ? '#67E8F9' : '#FDA4AF';
        ctx.beginPath();
        ctx.ellipse(startX + 4, p.y, flareR * 1.35, flareR * 0.82, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(startX + 2, p.y, flareR * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      for (const b of s.bullets) {
        ctx.fillStyle = b.color;
        ctx.strokeStyle = b.color;

        if (b.kind === 'laser') {
          const halfLen = b.beamHalfLen ?? 90;
          const fullLen = halfLen * 2;
          const isMega = (b.level ?? 1) >= 4;
          const outerH =
            b.radius * (isMega ? (b.evolved ? 1.56 : 0.96) : b.evolved ? 1.24 : 1.12);
          ctx.fillStyle = b.color;
          ctx.beginPath();
          ctx.roundRect(b.x - halfLen, b.y - outerH * 0.5, fullLen, outerH, outerH * 0.5);
          ctx.fill();

          ctx.fillStyle = '#FDA4AF';
          ctx.beginPath();
          ctx.roundRect(b.x - halfLen + 4, b.y - outerH * 0.32, Math.max(8, fullLen - 8), outerH * 0.64, outerH * 0.32);
          ctx.fill();

          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.roundRect(b.x - halfLen + 8, b.y - outerH * 0.16, Math.max(6, fullLen - 16), outerH * 0.32, outerH * 0.16);
          ctx.fill();

          if (isMega && b.evolved) {
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.ellipse(b.x + halfLen - 6, b.y, 14, outerH * 0.46, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#67E8F9';
            ctx.lineWidth = 2;
            ctx.beginPath();
            const segs = 5;
            const x0 = b.x - halfLen + 10;
            ctx.moveTo(x0, b.y);
            for (let k = 1; k <= segs; k++) {
              const sx = x0 + ((fullLen - 20) * k) / segs;
              const sy =
                b.y +
                Math.sin(s.elapsedTime * 42 + b.id + k * 2.1) * outerH * 0.72;
              ctx.lineTo(sx, sy);
            }
            ctx.stroke();
          }
        } else if (b.kind === 'cross_laser') {
          const originY = b.originY ?? b.y;
          const sign = b.phaseSign ?? 1;
          const amp = 28 + ((b.level ?? 1) - 1) * 3;
          const maxBack = Math.min(0.25, b.age);
          const segments = Math.max(2, Math.round((maxBack / 0.25) * 15));
          const dtStep = maxBack / segments;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          if (b.evolved) {
            ctx.globalAlpha = 0.3;
            ctx.strokeStyle = '#C4B5FD';
            ctx.lineWidth = Math.max(12, b.radius * 1.35);
            ctx.beginPath();
            for (let sIdx = 0; sIdx <= segments; sIdx++) {
              const tBack = sIdx * dtStep;
              const tSample = b.age - tBack;
              const sx = b.x - b.vx * tBack;
              const sy = originY + sign * Math.sin(tSample * 17) * amp;
              if (sIdx === 0) ctx.moveTo(sx, sy);
              else ctx.lineTo(sx, sy);
            }
            ctx.stroke();
            ctx.globalAlpha = 1;
          }

          ctx.strokeStyle = b.evolved ? '#DDD6FE' : b.color;
          ctx.lineWidth = b.evolved
            ? Math.max(8.5, b.radius * 0.88)
            : Math.max(5.5, b.radius * 0.78);
          ctx.beginPath();
          for (let sIdx = 0; sIdx <= segments; sIdx++) {
            const tBack = sIdx * dtStep;
            const tSample = b.age - tBack;
            const sx = b.x - b.vx * tBack;
            const sy = originY + sign * Math.sin(tSample * 17) * amp;
            if (sIdx === 0) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
          }
          ctx.stroke();

          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = b.evolved
            ? Math.max(3.6, b.radius * 0.38)
            : Math.max(2.2, b.radius * 0.3);
          ctx.beginPath();
          for (let sIdx = 0; sIdx <= segments; sIdx++) {
            const tBack = sIdx * dtStep;
            const tSample = b.age - tBack;
            const sx = b.x - b.vx * tBack;
            const sy = originY + sign * Math.sin(tSample * 17) * amp;
            if (sIdx === 0) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
          }
          ctx.stroke();

          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(
            b.x,
            b.y,
            b.evolved ? Math.max(4.5, b.radius * 0.44) : Math.max(3, b.radius * 0.36),
            0,
            Math.PI * 2,
          );
          ctx.fill();
        } else if (b.kind === 'back_shot') {
          const ang = Math.atan2(b.vy, b.vx);
          ctx.save();
          ctx.translate(b.x, b.y);
          ctx.rotate(ang);
          ctx.beginPath();
          ctx.moveTo(13, 0);
          ctx.lineTo(-8, -b.radius * 0.72);
          ctx.lineTo(-4, 0);
          ctx.lineTo(-8, b.radius * 0.72);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(-3, -1.4, 11, 2.8);
          ctx.restore();
        } else if (b.kind === 'ripple') {
          if (b.evolved) {
            const rx = b.radius * 0.58;
            const ry = b.radius * 1.04;

            // Boss "("-shield inspired thick plasma ring: outer glow + thick neon band + bright white core + travelling nodes
            ctx.globalAlpha = 0.28;
            ctx.strokeStyle = '#10B981';
            ctx.lineWidth = 17;
            ctx.beginPath();
            ctx.ellipse(b.x, b.y, rx, ry, 0, 0, Math.PI * 2);
            ctx.stroke();

            ctx.globalAlpha = 0.96;
            ctx.strokeStyle = '#34D399';
            ctx.lineWidth = 8.5;
            ctx.stroke();

            ctx.globalAlpha = 0.96;
            ctx.strokeStyle = '#F0F9FF';
            ctx.lineWidth = 2.6;
            ctx.stroke();

            ctx.fillStyle = '#FFFFFF';
            for (let n = 0; n < 4; n++) {
              const ang = s.elapsedTime * 6.5 + (n * Math.PI) / 2;
              const nx = b.x + Math.cos(ang) * rx;
              const ny = b.y + Math.sin(ang) * ry;
              ctx.beginPath();
              ctx.arc(nx, ny, 3.6, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.globalAlpha = 1;
          } else {
            ctx.globalAlpha = 0.3;
            ctx.lineWidth = 7;
            ctx.beginPath();
            ctx.ellipse(b.x, b.y, b.radius * 0.55, b.radius, 0, 0, Math.PI * 2);
            ctx.stroke();

            ctx.globalAlpha = 1;
            ctx.lineWidth = 3.2;
            ctx.beginPath();
            ctx.ellipse(b.x, b.y, b.radius * 0.55, b.radius, 0, 0, Math.PI * 2);
            ctx.stroke();
          }
        } else if (b.kind === 'missile') {
          const ang = Math.atan2(b.vy, b.vx);
          ctx.save();
          ctx.translate(b.x, b.y);
          ctx.rotate(ang);
          if (b.evolved) {
            ctx.fillStyle = '#FDE047';
            ctx.beginPath();
            ctx.moveTo(15, 0);
            ctx.lineTo(-9, -6.5);
            ctx.lineTo(-5, 0);
            ctx.lineTo(-9, 6.5);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#67E8F9';
            ctx.fillRect(-13, -2, 8, 4);
          } else {
            ctx.beginPath();
            ctx.moveTo(12, 0);
            ctx.lineTo(-8, -5);
            ctx.lineTo(-5, 0);
            ctx.lineTo(-8, 5);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(-10, -1.5, 6, 3);
          }
          ctx.restore();
        } else {
          ctx.globalAlpha = 0.28;
          ctx.beginPath();
          ctx.ellipse(
            b.x,
            b.y,
            b.radius * 2.35,
            b.radius * 1.15,
            0,
            0,
            Math.PI * 2,
          );
          ctx.fill();

          ctx.globalAlpha = 1;
          ctx.beginPath();
          ctx.ellipse(
            b.x,
            b.y,
            b.radius * 1.9,
            b.radius * 0.72,
            0,
            0,
            Math.PI * 2,
          );
          ctx.fill();

          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.ellipse(
            b.x + b.radius * 0.35,
            b.y,
            b.radius * 0.9,
            b.radius * 0.32,
            0,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      }
      ctx.restore();

      // Choice Card text badges & labels are drawn in QUIZ GATE FRONT LAYER after ship so words stay readable while ship/bullets pass through!

      // ENEMIES: すべて角のある多角形（Polygons Only）＆赤キャリア機のみ赤色で描画
      for (const e of s.enemies) {
        const tpl = ENEMIES[e.type];
        ctx.save();
        ctx.translate(e.x, e.y);
        const isHit = e.flashTimer > 0;
        const baseColor = e.isRedCarrier ? '#EF4444' : tpl.color;
        const accentColor = e.isRedCarrier ? '#FECACA' : tpl.accent;
        const bodyFill = isHit ? '#FFFFFF' : baseColor;
        const innerFill = isHit ? '#FFFFFF' : accentColor;

        ctx.fillStyle = bodyFill;
        ctx.strokeStyle = e.isRedCarrier ? '#FEF2F2' : '#FFFFFF';
        ctx.lineWidth = e.isRedCarrier ? 2.6 : 2;

        if (e.type === 'drone') {
          // Sharp 4-point angular diamond craft
          ctx.beginPath();
          ctx.moveTo(-e.radius * 1.15, 0);
          ctx.lineTo(0, -e.radius * 0.85);
          ctx.lineTo(e.radius * 1.05, 0);
          ctx.lineTo(0, e.radius * 0.85);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Angular diamond cockpit
          ctx.fillStyle = '#0F172A';
          drawRegularPolygon(ctx, -1, 0, e.radius * 0.42, 4, 0);
          ctx.fill();
          ctx.fillStyle = innerFill;
          drawRegularPolygon(ctx, -3, 0, e.radius * 0.22, 4, 0);
          ctx.fill();
        } else if (e.type === 'interceptor') {
          ctx.beginPath();
          ctx.moveTo(-e.radius * 1.3, 0);
          ctx.lineTo(e.radius * 0.9, -e.radius * 0.9);
          ctx.lineTo(e.radius * 0.45, 0);
          ctx.lineTo(e.radius * 0.9, e.radius * 0.9);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#1E1B4B';
          ctx.beginPath();
          ctx.moveTo(-e.radius * 0.7, 0);
          ctx.lineTo(-1, -e.radius * 0.25);
          ctx.lineTo(e.radius * 0.35, 0);
          ctx.lineTo(-1, e.radius * 0.25);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = innerFill;
          ctx.fillRect(-7, -2.5, 8, 5);
        } else if (e.type === 'heli') {
          // Angular chamfered gunship polygon (no rounded corners)
          ctx.beginPath();
          ctx.moveTo(-e.radius * 1.05, -e.radius * 0.35);
          ctx.lineTo(-e.radius * 0.65, -e.radius * 0.6);
          ctx.lineTo(e.radius * 0.95, -e.radius * 0.55);
          ctx.lineTo(e.radius * 0.95, e.radius * 0.55);
          ctx.lineTo(-e.radius * 0.65, e.radius * 0.6);
          ctx.lineTo(-e.radius * 1.05, e.radius * 0.35);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#1E293B';
          ctx.fillRect(-e.radius * 0.72, -e.radius * 0.3, e.radius * 0.6, e.radius * 0.6);
          ctx.fillStyle = innerFill;
          ctx.fillRect(2, -e.radius * 0.2, e.radius * 0.6, e.radius * 0.4);

          const rw = 28 + Math.sin(s.elapsedTime * 35) * 14;
          ctx.strokeStyle = '#FEF3C7';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(-rw, -e.radius * 0.88);
          ctx.lineTo(rw, -e.radius * 0.88);
          ctx.stroke();
        } else if (e.type === 'turret') {
          // Octagonal turret body (多角形)
          drawRegularPolygon(ctx, 0, 0, e.radius * 0.95, 8, Math.PI / 8);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#1E1B4B';
          drawRegularPolygon(ctx, 0, 0, e.radius * 0.48, 6, 0);
          ctx.fill();

          ctx.strokeStyle = innerFill;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(-e.radius * 1.28, 0);
          ctx.lineTo(-4, 0);
          ctx.stroke();
        } else if (e.type === 'insect') {
          // Sharp Hexagonal mechanical insect body (六角形)
          drawRegularPolygon(ctx, 0, 0, e.radius * 0.9, 6, 0);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#064E3B';
          drawRegularPolygon(ctx, 2, 0, e.radius * 0.48, 6, Math.PI / 6);
          ctx.fill();

          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(-e.radius * 0.55, -7, 5, 4);
          ctx.fillRect(-e.radius * 0.55, 3, 5, 4);

          ctx.strokeStyle = baseColor;
          ctx.lineWidth = 2.6;
          for (const leg of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(-6, leg * 11);
            ctx.lineTo(-15, leg * 21);
            ctx.moveTo(6, leg * 11);
            ctx.lineTo(15, leg * 21);
            ctx.stroke();
          }
        } else {
          // Heavy Mecha: Angular armored octagon hull + diamond core
          ctx.beginPath();
          ctx.moveTo(-e.radius, -14);
          ctx.lineTo(-14, -e.radius);
          ctx.lineTo(e.radius, -e.radius * 0.6);
          ctx.lineTo(e.radius, e.radius * 0.6);
          ctx.lineTo(-14, e.radius);
          ctx.lineTo(-e.radius, 14);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#1E293B';
          ctx.fillRect(-18, -16, 36, 32);
          ctx.fillStyle = innerFill;
          drawRegularPolygon(ctx, -4, 0, 11, 4, 0);
          ctx.fill();
        }

        if (e.hp < e.maxHp) {
          const bw = e.radius * 1.9;
          ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
          ctx.fillRect(-bw / 2, -e.radius - 13, bw, 4.5);
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(-bw / 2, -e.radius - 13, bw * (e.hp / e.maxHp), 4.5);
        }
        ctx.restore();
      }

      // Boss (All Angular Polygons)
      if (s.boss) {
        const boss = s.boss;
        if (boss.laserState === 'telegraph') {
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 46, 84, 0.8)';
          ctx.setLineDash([12, 10]);
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(0, boss.laserY);
          ctx.lineTo(boss.x - 50, boss.laserY);
          ctx.stroke();
          ctx.restore();
        } else if (boss.laserState === 'firing') {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = 'rgba(255, 46, 84, 0.6)';
          ctx.fillRect(0, boss.laserY - 26, boss.x - 40, 52);
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, boss.laserY - 9, boss.x - 40, 18);
          ctx.restore();
        }

        ctx.save();
        const bossJitterX = s.bossDyingTimer > 0 ? (Math.random() - 0.5) * 9 : 0;
        const bossJitterY = s.bossDyingTimer > 0 ? (Math.random() - 0.5) * 9 : 0;
        ctx.translate(boss.x + bossJitterX, boss.y + bossJitterY);
        const bossColor =
          boss.flashTimer > 0
            ? '#FFFFFF'
            : boss.phase === 3
              ? '#FF2E54'
              : boss.phase === 2
                ? '#F97316'
                : '#38BDF8';
        ctx.fillStyle = boss.flashTimer > 0 ? '#FFFFFF' : '#1E293B';
        ctx.strokeStyle = bossColor;
        ctx.lineWidth = 3.5;

        ctx.beginPath();
        if (boss.shape === 'dreadnought') {
          // Heavy Industrial Boxy Dreadnought with Twin Hydraulic Claws
          ctx.moveTo(-88, -54);
          ctx.lineTo(-34, -54);
          ctx.lineTo(-34, -28);
          ctx.lineTo(-68, -28);
          ctx.lineTo(-68, 28);
          ctx.lineTo(-34, 28);
          ctx.lineTo(-34, 54);
          ctx.lineTo(-88, 54);
          ctx.lineTo(-88, 72);
          ctx.lineTo(74, 72);
          ctx.lineTo(88, 44);
          ctx.lineTo(88, -44);
          ctx.lineTo(74, -72);
          ctx.lineTo(-88, -72);
          ctx.closePath();
        } else if (boss.shape === 'mantis') {
          // Twin Crescent Scythe Cyber-Mantis
          ctx.moveTo(-92, -66);
          ctx.lineTo(-10, -46);
          ctx.lineTo(78, -74);
          ctx.lineTo(54, -18);
          ctx.lineTo(86, 0);
          ctx.lineTo(54, 18);
          ctx.lineTo(78, 74);
          ctx.lineTo(-10, 46);
          ctx.lineTo(-92, 66);
          ctx.lineTo(-44, 0);
          ctx.closePath();
        } else if (boss.shape === 'citadel') {
          // Octagonal Star Fortress with Rotating Pylons
          for (let k = 0; k < 12; k++) {
            const rad = k % 2 === 0 ? 84 : 58;
            const a = boss.age * 0.4 + (k * Math.PI) / 6;
            const px = Math.cos(a) * rad;
            const py = Math.sin(a) * rad;
            if (k === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
        } else {
          // Cruiser (VALKYRIE-07)
          ctx.moveTo(-82, 0);
          ctx.lineTo(-44, -68);
          ctx.lineTo(54, -84);
          ctx.lineTo(84, -36);
          ctx.lineTo(84, 36);
          ctx.lineTo(54, 84);
          ctx.lineTo(-44, 68);
          ctx.closePath();
        }
        ctx.fill();
        ctx.stroke();

        if (boss.shape === 'citadel') {
          for (let pIdx = 0; pIdx < 4; pIdx++) {
            const pa = -boss.age * 1.4 + (pIdx * Math.PI) / 2;
            const px = Math.cos(pa) * 96;
            const py = Math.sin(pa) * 96;
            ctx.fillStyle = '#1E1B4B';
            ctx.strokeStyle = bossColor;
            ctx.lineWidth = 2.4;
            drawRegularPolygon(ctx, px, py, 14, 4, pa);
            ctx.fill();
            ctx.stroke();
          }
        } else {
          ctx.fillStyle = bossColor;
          ctx.globalAlpha = 0.28;
          ctx.beginPath();
          ctx.moveTo(-58, 0);
          ctx.lineTo(-26, -46);
          ctx.lineTo(44, -52);
          ctx.lineTo(44, 52);
          ctx.lineTo(-26, 46);
          ctx.closePath();
          ctx.fill();
          ctx.globalAlpha = 1;
        }

        const pulse = 18 + Math.sin(s.elapsedTime * 6) * 4;
        ctx.fillStyle = bossColor;
        drawRegularPolygon(ctx, boss.shape === 'citadel' ? 0 : -20, 0, pulse, 8, Math.PI / 8);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        drawRegularPolygon(ctx, boss.shape === 'citadel' ? 0 : -22, 0, pulse * 0.48, 4, 0);
        ctx.fill();

        // MK-2 〜 MK-8：ステージ8まで段階的にボスパーツが追加されていく演出
        if (boss.stageTier >= 2) {
          // MK-2+: 左右ウイング追加砲台ポッド
          for (const side of [-1, 1]) {
            ctx.fillStyle = boss.flashTimer > 0 ? '#FFFFFF' : '#0F172A';
            ctx.strokeStyle = bossColor;
            ctx.lineWidth = 2.6;
            ctx.beginPath();
            ctx.moveTo(-48, side * 86);
            ctx.lineTo(-10, side * 102);
            ctx.lineTo(36, side * 92);
            ctx.lineTo(22, side * 72);
            ctx.lineTo(-32, side * 72);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = bossColor;
            ctx.fillRect(-58, side * 83 - 3, 20, 6);
          }
        }

        if (boss.stageTier >= 3) {
          // MK-3+: 前方ツインレールキャノン
          for (const side of [-1, 1]) {
            ctx.fillStyle = boss.flashTimer > 0 ? '#FFFFFF' : '#1E293B';
            ctx.strokeStyle = '#FDE047';
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.moveTo(-108, side * 42);
            ctx.lineTo(-68, side * 34);
            ctx.lineTo(-62, side * 52);
            ctx.lineTo(-96, side * 50);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#FEF08A';
            drawRegularPolygon(ctx, -104, side * 42, 5, 4, 0);
            ctx.fill();
          }
        }

        if (boss.stageTier >= 5) {
          // MK-5+: 重装甲外翼フィンの増設（ツインバレル砲塔）
          for (const side of [-1, 1]) {
            ctx.fillStyle = boss.flashTimer > 0 ? '#FFFFFF' : '#1E293B';
            ctx.strokeStyle = '#38BDF8';
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.moveTo(-26, side * 102);
            ctx.lineTo(14, side * 116);
            ctx.lineTo(64, side * 98);
            ctx.lineTo(42, side * 84);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#38BDF8';
            ctx.fillRect(-34, side * 104 - 2.5, 16, 5);
          }
        }

        if (boss.stageTier >= 6) {
          // MK-6+: 回転するエネルギーリアクター外輪
          ctx.save();
          ctx.rotate(-boss.age * 1.4);
          ctx.strokeStyle = 'rgba(244, 114, 182, 0.72)';
          ctx.lineWidth = 2.2;
          drawRegularPolygon(ctx, 0, 0, 56, 8, 0);
          ctx.stroke();
          ctx.restore();
        }

        if (boss.stageTier >= 7) {
          // MK-7+: 先端ヘビーランス＆後方大型ブースターベーン
          ctx.fillStyle = boss.flashTimer > 0 ? '#FFFFFF' : '#0F172A';
          ctx.strokeStyle = '#FB7185';
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.moveTo(-124, 0);
          ctx.lineTo(-82, -16);
          ctx.lineTo(-76, 0);
          ctx.lineTo(-82, 16);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          for (const side of [-1, 1]) {
            ctx.fillStyle = '#38BDF8';
            ctx.fillRect(78, side * 46 - 4, 24, 8);
          }
        }

        if (boss.stageTier >= 8) {
          // MK-8 / Ω形態: 全展開Ωエネルギーウイングクレスト
          for (const side of [-1, 1]) {
            ctx.strokeStyle = '#E879F9';
            ctx.lineWidth = 2.8;
            ctx.beginPath();
            ctx.moveTo(-48, side * 112);
            ctx.lineTo(6, side * 134);
            ctx.lineTo(74, side * 112);
            ctx.lineTo(54, side * 102);
            ctx.lineTo(6, side * 120);
            ctx.closePath();
            ctx.stroke();
          }
        }

        if (boss.stageTier >= 4) {
          // MK-4+: 周囲を旋回する攻撃用衛星ポッド（2→4→6基へ増設）
          const satCount = boss.stageTier >= 8 ? 6 : boss.stageTier >= 6 ? 4 : 2;
          for (let sIdx = 0; sIdx < satCount; sIdx++) {
            const sa = boss.age * 1.9 + (sIdx * Math.PI * 2) / satCount;
            const sx = Math.cos(sa) * 112;
            const sy = Math.sin(sa) * 112;
            ctx.fillStyle = '#312E81';
            ctx.strokeStyle = '#F472B6';
            ctx.lineWidth = 2;
            drawRegularPolygon(ctx, sx, sy, 12, 6, sa);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#FFFFFF';
            drawRegularPolygon(ctx, sx, sy, 5, 4, 0);
            ctx.fill();
          }
        }

        ctx.restore();

        // Boss Intro & Quiz Defensive Barrier Field ("(" shape covering full vertical screen)
        const showQuizBarrier =
          boss.quizState === 'push' ||
          boss.quizState === 'active' ||
          (boss.quizState === 'feedback' && boss.quizResult !== 'correct');
        const showBossShield =
          boss.shieldTimer > 0 ||
          boss.shieldIntact ||
          boss.shieldFadeTimer > 0 ||
          showQuizBarrier;
        if (showBossShield) {
          const shieldAlpha =
            boss.shieldTimer > 0 || boss.shieldIntact || showQuizBarrier
              ? 1
              : Math.max(0, boss.shieldFadeTimer / BOSS_SHIELD_FADE_DURATION);
          const ctrlX = BOSS_SHIELD_EDGE_X - BOSS_SHIELD_CURVE_DEPTH * 2;
          const isFlashing = boss.shieldFlashTimer > 0;
          const isOverdrive =
            (boss.shieldIntact && boss.quizState === 'none') ||
            boss.quizBoostTier > 0 ||
            boss.piercingQuizActive;

          ctx.save();
          ctx.globalAlpha = shieldAlpha;

          // Translucent energy curtain behind the "(" barrier
          ctx.beginPath();
          ctx.moveTo(BOSS_SHIELD_EDGE_X, 0);
          ctx.quadraticCurveTo(ctrlX, LOGICAL_H / 2, BOSS_SHIELD_EDGE_X, LOGICAL_H);
          ctx.lineTo(LOGICAL_W + 20, LOGICAL_H);
          ctx.lineTo(LOGICAL_W + 20, 0);
          ctx.closePath();

          const curtainMode = isFlashing
            ? 'flash'
            : isOverdrive
              ? 'overdrive'
              : 'normal';
          if (!cachedShieldCurtains[curtainMode]) {
            const g = ctx.createLinearGradient(
              BOSS_SHIELD_EDGE_X - BOSS_SHIELD_CURVE_DEPTH,
              0,
              LOGICAL_W,
              0,
            );
            g.addColorStop(
              0,
              curtainMode === 'flash'
                ? 'rgba(186, 230, 253, 0.34)'
                : curtainMode === 'overdrive'
                  ? 'rgba(244, 63, 94, 0.22)'
                  : 'rgba(34, 211, 238, 0.24)',
            );
            g.addColorStop(0.45, 'rgba(56, 189, 248, 0.1)');
            g.addColorStop(1, 'rgba(14, 165, 233, 0.02)');
            cachedShieldCurtains[curtainMode] = g;
          }
          ctx.fillStyle = cachedShieldCurtains[curtainMode]!;
          ctx.fill();

          // Clipped energy scanlines inside the barrier zone
          ctx.save();
          ctx.clip();
          ctx.strokeStyle = isOverdrive
            ? 'rgba(251, 113, 133, 0.18)'
            : 'rgba(125, 211, 252, 0.16)';
          ctx.lineWidth = 1.5;
          const scanOffset = (s.elapsedTime * 90) % 28;
          ctx.beginPath();
          for (let sy = -28 + scanOffset; sy < LOGICAL_H + 28; sy += 28) {
            ctx.moveTo(BOSS_SHIELD_EDGE_X - BOSS_SHIELD_CURVE_DEPTH - 10, sy);
            ctx.lineTo(LOGICAL_W + 10, sy);
          }
          ctx.stroke();
          ctx.restore();

          // Glowing "(" Barrier Arc (multi-pass additive stroke, zero shadowBlur)
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = isFlashing
            ? '#BAE6FD'
            : isOverdrive
              ? '#FB7185'
              : '#22D3EE';
          ctx.globalAlpha = shieldAlpha * 0.24;
          ctx.lineWidth = isFlashing ? 24 : 18;
          ctx.beginPath();
          ctx.moveTo(BOSS_SHIELD_EDGE_X, 0);
          ctx.quadraticCurveTo(ctrlX, LOGICAL_H / 2, BOSS_SHIELD_EDGE_X, LOGICAL_H);
          ctx.stroke();

          ctx.globalAlpha = shieldAlpha;
          ctx.lineWidth = isFlashing ? 11 : 8;
          ctx.stroke();

          // Bright Inner Plasma Core Line
          ctx.strokeStyle = '#F0F9FF';
          ctx.lineWidth = 2.6;
          ctx.stroke();

          // Travelling Energy Nodes along the "(" arc
          for (let n = 0; n < 4; n++) {
            const ny = (((s.elapsedTime * 360 + n * (LOGICAL_H / 4)) % LOGICAL_H) + LOGICAL_H) % LOGICAL_H;
            const nx = getBossShieldXAtY(ny);
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(nx, ny, 4.2, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.restore();
        }

        // Boss Shield Shatter Animation (on correct quiz answer — zero shadowBlur for 60fps burst)
        if (boss.shieldShatterTimer > 0 && boss.shieldShards.length > 0) {
          const shatterAlpha = Math.max(0, Math.min(1, boss.shieldShatterTimer / 0.78));
          const ctrlX = BOSS_SHIELD_EDGE_X - BOSS_SHIELD_CURVE_DEPTH * 2;

          ctx.save();
          ctx.globalCompositeOperation = 'lighter';

          // Expanding shockwave flash along the shattered "(" arc
          if (shatterAlpha > 0.35) {
            const waveAlpha = (shatterAlpha - 0.35) / 0.65;
            ctx.beginPath();
            ctx.moveTo(BOSS_SHIELD_EDGE_X, 0);
            ctx.quadraticCurveTo(ctrlX, LOGICAL_H / 2, BOSS_SHIELD_EDGE_X, LOGICAL_H);

            ctx.globalAlpha = waveAlpha * 0.32;
            ctx.strokeStyle = '#34D399';
            ctx.lineWidth = 28 * shatterAlpha;
            ctx.stroke();

            ctx.globalAlpha = waveAlpha;
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 12 * shatterAlpha;
            ctx.stroke();
          }

          // Flying glowing polygon shield shards
          ctx.globalAlpha = shatterAlpha;
          for (const shard of boss.shieldShards) {
            ctx.save();
            ctx.translate(shard.x, shard.y);
            ctx.rotate(shard.rot);
            ctx.fillStyle = shard.color;
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(-shard.size * 0.65, -shard.size * 0.45);
            ctx.lineTo(shard.size * 0.7, -shard.size * 0.2);
            ctx.lineTo(shard.size * 0.35, shard.size * 0.65);
            ctx.lineTo(-shard.size * 0.4, shard.size * 0.35);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          }
          ctx.restore();
        }
      }

      // ENEMY BULLETS: Sharp Rotating Angular 4-Point Spikes / Diamonds (zero shadowBlur for dense bullet patterns)
      for (const eb of s.enemyBullets) {
        ctx.save();
        ctx.translate(eb.x, eb.y);
        ctx.rotate(s.elapsedTime * (eb.indestructible ? 9 : 7));

        const r = eb.radius + 2.5;
        const isFlash = eb.flashTimer > 0;
        // Soft outer neon halo + dark/armored rim
        ctx.fillStyle = eb.indestructible
          ? 'rgba(232, 121, 249, 0.24)'
          : 'rgba(255, 46, 84, 0.22)';
        ctx.beginPath();
        ctx.arc(0, 0, r + 4.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = eb.indestructible ? '#581C87' : '#1E060C';
        ctx.strokeStyle = eb.indestructible ? '#E879F9' : 'transparent';
        ctx.lineWidth = eb.indestructible ? 1.8 : 0;
        ctx.beginPath();
        for (let k = 0; k < 8; k++) {
          const rad = k % 2 === 0 ? r + 2.5 : r * 0.48;
          const a = (k * Math.PI) / 4;
          const px = Math.cos(a) * rad;
          const py = Math.sin(a) * rad;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        if (eb.indestructible) ctx.stroke();

        ctx.fillStyle = isFlash
          ? '#FFFFFF'
          : eb.indestructible
            ? '#D946EF'
            : '#FF2E54';
        ctx.beginPath();
        for (let k = 0; k < 8; k++) {
          const rad = k % 2 === 0 ? r : r * 0.44;
          const a = (k * Math.PI) / 4;
          const px = Math.cos(a) * rad;
          const py = Math.sin(a) * rad;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = eb.indestructible ? '#FFFFFF' : '#FEF08A';
        drawRegularPolygon(ctx, 0, 0, eb.radius * 0.45, 4, 0);
        ctx.fill();
        ctx.restore();
      }

      // Rotating Orbit Interceptor Missiles
      const orbitLv = s.weapons.orbit ?? 0;
      if (orbitLv > 0) {
        const podCount = orbitLv * 2;
        ctx.save();
        ctx.strokeStyle = 'rgba(251, 146, 60, 0.25)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 58, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        for (let i = 0; i < podCount; i++) {
          const ang = s.elapsedTime * 3.8 + (i * Math.PI * 2) / podCount;
          const ox = p.x + Math.cos(ang) * 58;
          const oy = p.y + Math.sin(ang) * 58;
          ctx.save();
          ctx.translate(ox, oy);
          ctx.rotate(ang + Math.PI / 2);
          ctx.fillStyle = '#FB923C';
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(9, 0);
          ctx.lineTo(-6, -5);
          ctx.lineTo(-6, 5);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      }

      // Drone Units
      const droneLv = s.weapons.drone ?? 0;
      for (let i = 0; i < droneLv; i++) {
        const ang = s.elapsedTime * 2.6 + (i * Math.PI * 2) / droneLv;
        const dx = p.x - 16 + Math.cos(ang) * 44;
        const dy = p.y + Math.sin(ang) * 44;
        ctx.save();
        ctx.translate(dx, dy);
        ctx.fillStyle = '#0891B2';
        ctx.strokeStyle = '#67E8F9';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(-7, -7);
        ctx.lineTo(-7, 7);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // Player Ship: ARROW-01
      const blinkHide =
        s.playerHullDestroyed ||
        (s.playerDyingTimer === 0 &&
          p.invulnTimer > 0 &&
          Math.floor(p.invulnTimer * 18) % 2 === 0);
      if (!blinkHide) {
        ctx.save();
        const pjX = s.playerDyingTimer > 0 ? (Math.random() - 0.5) * 6 : 0;
        const pjY = s.playerDyingTimer > 0 ? (Math.random() - 0.5) * 6 : 0;
        ctx.translate(p.x + pjX, p.y + pjY);
        ctx.rotate(p.tilt);

        if (p.shield > 0 && s.playerDyingTimer === 0) {
          ctx.strokeStyle = 'rgba(96, 165, 250, 0.55)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, 31, 0, Math.PI * 2);
          ctx.stroke();
        }

        // TYPE-D Hidden Evolution: small circular crackling energy field while firing
        if (s.dFieldStrength > 0.04 && s.playerDyingTimer === 0) {
          const ds = s.dFieldStrength;
          const r = 44 + Math.sin(s.elapsedTime * 28) * 2.5;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = ds * 0.24;
          ctx.fillStyle = '#F43F5E';
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fill();

          ctx.globalAlpha = ds * 0.72;
          ctx.strokeStyle = '#67E8F9';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          const steps = 16;
          for (let k = 0; k <= steps; k++) {
            const ang = (k * Math.PI * 2) / steps + s.elapsedTime * 7;
            const jitter =
              Math.sin(s.elapsedTime * 48 + k * 2.7) * 3.5;
            const rx = Math.cos(ang) * (r + jitter);
            const ry = Math.sin(ang) * (r + jitter);
            if (k === 0) ctx.moveTo(rx, ry);
            else ctx.lineTo(rx, ry);
          }
          ctx.stroke();
          ctx.restore();
        }

        const isBoostingOut =
          s.endingPhase === 'boost_right' ||
          s.quizPhase === 'boost_out' ||
          s.quizPhase === 'boost_in';
        const flameLen = isBoostingOut
          ? 76 + Math.sin(s.elapsedTime * 68) * 18
          : 18 + Math.sin(s.elapsedTime * 48) * 6;

        ctx.fillStyle = 'rgba(34, 211, 238, 0.28)';
        ctx.beginPath();
        ctx.moveTo(-18, isBoostingOut ? -13 : -8);
        ctx.lineTo(-18 - flameLen * 1.25, 0);
        ctx.lineTo(-18, isBoostingOut ? 13 : 8);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = isBoostingOut ? '#67E8F9' : '#22D3EE';
        ctx.beginPath();
        ctx.moveTo(-18, isBoostingOut ? -9 : -5);
        ctx.lineTo(-18 - flameLen, 0);
        ctx.lineTo(-18, isBoostingOut ? 9 : 5);
        ctx.closePath();
        ctx.fill();

        if (isBoostingOut) {
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.moveTo(-18, -4.5);
          ctx.lineTo(-18 - flameLen * 0.62, 0);
          ctx.lineTo(-18, 4.5);
          ctx.closePath();
          ctx.fill();
        }

        const dyingFlash =
          s.playerDyingTimer > 0 && Math.floor(s.playerDyingTimer * 24) % 2 === 0;
        ctx.fillStyle = dyingFlash ? '#FCA5A5' : '#0E7490';
        ctx.strokeStyle = dyingFlash ? '#FFFFFF' : '#22D3EE';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(28, 0);
        ctx.lineTo(-10, -16);
        ctx.lineTo(-22, -13);
        ctx.lineTo(-14, -4);
        ctx.lineTo(-20, 0);
        ctx.lineTo(-14, 4);
        ctx.lineTo(-22, 13);
        ctx.lineTo(-10, 16);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = dyingFlash ? '#FFFFFF' : '#67E8F9';
        ctx.beginPath();
        ctx.ellipse(5, 0, 8, 3.2, 0, 0, Math.PI * 2);
        ctx.fill();

        if (p.shield === 0) {
          // シールド0時は中央の4pxコア当たり判定を明確に可視化
          ctx.fillStyle = '#FB7185';
          ctx.beginPath();
          ctx.arc(0, 0, 3.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(0, 0, 2.0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(0, 0, 2.8, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Particles
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const pt of s.particles) {
        const alpha = Math.max(0, pt.life / pt.maxLife);
        ctx.globalAlpha = alpha;
        if (pt.ring) {
          ctx.strokeStyle = pt.color;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.fillStyle = pt.color;
          ctx.fillRect(
            pt.x - pt.size / 2,
            pt.y - pt.size / 2,
            pt.size,
            pt.size,
          );
        }
      }
      ctx.restore();

      // QUIZ GATE FRONT LAYER (Front elliptical ring rim + in-canvas Question Box when external quiz box is not active)
      if (isQuizRenderVisible && s.quizQuestion) {
        const q = s.quizQuestion;
        const alignedIdx = getAlignedGateIndex(p.y, isExternalQuiz);
        const isFeedback =
          s.quizPhase === 'feedback' || s.quizPhase === 'boost_out';
        const rx = isExternalQuiz ? 28 : 24;
        const ry = isExternalQuiz ? 54 : 46;

        ctx.save();

        // 1. Front (left) elliptical ring rims + solid Choice Cards (gate is pass-through, choice cards are solid/readable)
        for (let i = 0; i < 4; i++) {
          const gy = gateLayout.tops[i];
          const cy = gy + gateLayout.height / 2;
          const isAligned = s.quizPhase === 'selecting' && alignedIdx === i;
          const isSelected = s.quizSelectedGate === i;
          const isCorrectChoice = q.correctIndex === i;
          const borderColor = isFeedback
            ? isCorrectChoice
              ? '#10B981'
              : isSelected
                ? '#F43F5E'
                : 'rgba(71, 85, 105, 0.52)'
            : isAligned
              ? '#22D3EE'
              : 'rgba(56, 189, 248, 0.55)';

          ctx.save();
          ctx.strokeStyle = isAligned
            ? '#67E8F9'
            : isFeedback && isCorrectChoice
              ? '#34D399'
              : isFeedback && isSelected
                ? '#FB7185'
                : 'rgba(56, 189, 248, 0.85)';
          const frontWidth =
            isAligned || isSelected || (isFeedback && isCorrectChoice) ? 4.4 : 2.8;
          ctx.globalAlpha = 0.24;
          ctx.lineWidth = frontWidth + 5;
          ctx.beginPath();
          ctx.ellipse(GATE_ENTRY_X, cy, rx, ry, 0, Math.PI * 0.5, Math.PI * 1.5);
          ctx.stroke();

          ctx.globalAlpha = 1;
          ctx.lineWidth = frontWidth;
          ctx.stroke();
          ctx.restore();

          // Solid Choice Card (word block is opaque and not pass-through)
          let fillBg = isAligned
            ? 'rgba(8, 51, 68, 0.94)'
            : 'rgba(7, 11, 20, 0.92)';
          let badgeBg = isAligned ? '#22D3EE' : '#1E293B';
          let badgeText = isAligned ? '#0F172A' : '#E2E8F0';
          if (isFeedback) {
            if (isCorrectChoice) {
              fillBg = 'rgba(6, 78, 59, 0.94)';
              badgeBg = '#10B981';
              badgeText = '#052E16';
            } else if (isSelected) {
              fillBg = 'rgba(136, 19, 55, 0.94)';
              badgeBg = '#F43F5E';
              badgeText = '#FFFFFF';
            } else {
              fillBg = 'rgba(7, 11, 20, 0.86)';
            }
          }

          ctx.save();
          ctx.globalAlpha = s.quizPhase === 'boost_out' ? 0.72 : 1;
          ctx.strokeStyle = borderColor;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(GATE_ENTRY_X + rx, cy);
          ctx.lineTo(GATE_CARD_X, cy);
          ctx.stroke();

          const cardY = gy + 8;
          const cardH = gateLayout.height - 16;
          ctx.fillStyle = fillBg;
          ctx.strokeStyle = borderColor;
          ctx.lineWidth = isAligned || isSelected || (isFeedback && isCorrectChoice) ? 2.6 : 1.5;
          ctx.beginPath();
          ctx.roundRect(GATE_CARD_X, cardY, GATE_CARD_WIDTH, cardH, 10);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = badgeBg;
          ctx.beginPath();
          ctx.roundRect(GATE_CARD_X + 14, cy - 18, 34, 36, 6);
          ctx.fill();
          ctx.font = isExternalQuiz
            ? '800 20px "JetBrains Mono", monospace'
            : '800 18px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = badgeText;
          ctx.fillText(GATE_LABELS[i], GATE_CARD_X + 31, cy + 7);

          ctx.font = isExternalQuiz
            ? '700 21px "Plus Jakarta Sans", sans-serif'
            : '700 18px "Plus Jakarta Sans", sans-serif';
          ctx.textAlign = 'left';
          ctx.fillStyle =
            isFeedback && !isCorrectChoice && !isSelected ? '#94A3B8' : '#F8FAFC';
          const cLines = wrapCanvasText(ctx, q.choices[i], GATE_CARD_WIDTH - 76);
          const lineStep = isExternalQuiz ? 25 : 22;
          const startY = cLines.length > 1 ? cy - 4 : cy + 7;
          cLines.slice(0, 2).forEach((line, lIdx) => {
            ctx.fillText(line, GATE_CARD_X + 60, startY + lIdx * lineStep);
          });
          ctx.restore();
        }

        // 2. Question Banner inside canvas (shown only when there isn't external screen space)
        if (!isExternalQuiz) {
          const qBoxX = 80;
          const qBoxY = 88;
          const qBoxW = LOGICAL_W - 160;
          const qBoxH = 92;

          ctx.fillStyle = 'rgba(7, 11, 20, 0.94)';
          ctx.strokeStyle = 'rgba(34, 211, 238, 0.65)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(qBoxX, qBoxY, qBoxW, qBoxH, 12);
          ctx.fill();
          ctx.stroke();

          // Header line: Category + Area Label + 30s Timer
          ctx.font = '700 13px "JetBrains Mono", monospace';
          ctx.textAlign = 'left';
          ctx.fillStyle = '#22D3EE';
          const areaText = s.isEndless
            ? `ENDLESS L${s.endlessLoop} · ${s.stageHalf === 1 ? '前半' : '後半'} GATE QUIZ`
            : `STAGE ${s.stageNumber} · ${s.stageHalf === 1 ? '前半' : '後半'} GATE QUIZ`;
          ctx.fillText(`${areaText}  //  ${q.category}`, qBoxX + 18, qBoxY + 23);

          const timeRatio = Math.max(0, Math.min(1, s.quizTimer / QUIZ_TIME_LIMIT_SEC));
          const timerColor =
            s.quizTimer <= 5
              ? '#FB7185'
              : s.quizTimer <= 10
                ? '#FBBF24'
                : '#34D399';
          ctx.textAlign = 'right';
          ctx.fillStyle = timerColor;
          ctx.font = '700 15px "JetBrains Mono", monospace';
          ctx.fillText(
            `TIME ${Math.ceil(s.quizTimer).toString().padStart(2, '0')}s`,
            qBoxX + qBoxW - 18,
            qBoxY + 24,
          );

          const barX = qBoxX + 18;
          const barY = qBoxY + 32;
          const barW = qBoxW - 36;
          ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
          ctx.fillRect(barX, barY, barW, 5);
          ctx.fillStyle = timerColor;
          ctx.fillRect(barX, barY, barW * timeRatio, 5);

          ctx.font = '700 20px "Plus Jakarta Sans", sans-serif';
          ctx.textAlign = 'left';
          ctx.fillStyle = '#F8FAFC';
          let qLines = wrapCanvasText(ctx, q.question, qBoxW - 36);
          if (qLines.length > 2) {
            ctx.font = '700 16px "Plus Jakarta Sans", sans-serif';
            qLines = wrapCanvasText(ctx, q.question, qBoxW - 36);
            qLines.slice(0, 3).forEach((line, lIdx) => {
              ctx.fillText(line, qBoxX + 18, qBoxY + 53 + lIdx * 18);
            });
          } else {
            qLines.forEach((line, lIdx) => {
              ctx.fillText(line, qBoxX + 18, qBoxY + 59 + lIdx * 23);
            });
          }
        }

        ctx.restore();
      }

      // BOSS SHIELD 4-CHOICE QUIZ OVERLAY ("(" shield targets + Normal-shot sustained break gauge)
      const bossQuizQ =
        s.boss && s.boss.quizState !== 'none' ? s.boss.quizQuestion : null;
      if (s.boss && s.boss.quizState !== 'none' && bossQuizQ) {
        const boss = s.boss;
        const q = bossQuizQ;
        const bossLayout = getBossQuizLayout(isExternalQuiz);
        const aimedIdx =
          boss.quizState === 'active'
            ? getBossQuizChoiceAtY(p.y, isExternalQuiz)
            : null;
        const isFeedback = boss.quizState === 'feedback';

        ctx.save();

        // Standoff boundary guide & horizontal Normal Shot sightline
        if (boss.quizState === 'active') {
          const sightEndX = getBossShieldXAtY(p.y);
          ctx.save();
          ctx.strokeStyle =
            aimedIdx !== null
              ? 'rgba(52, 211, 153, 0.55)'
              : 'rgba(56, 189, 248, 0.25)';
          ctx.setLineDash([8, 8]);
          ctx.lineWidth = aimedIdx !== null ? 2.4 : 1.6;
          ctx.beginPath();
          ctx.moveTo(p.x + 30, p.y);
          ctx.lineTo(sightEndX, p.y);
          ctx.stroke();
          ctx.restore();

          // Subtle standoff barrier line along max approach boundary
          ctx.save();
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.18)';
          ctx.setLineDash([4, 8]);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          for (let sy = 40; sy <= LOGICAL_H - 40; sy += 24) {
            const sx = getBossShieldXAtY(sy) - BOSS_QUIZ_STANDOFF_GAP;
            if (sy === 40) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
          }
          ctx.stroke();
          ctx.restore();
        }

        // 4 Choice Cards anchored to the "(" shield contour (pushed well left for readability)
        for (let i = 0; i < 4; i++) {
          const gy = bossLayout.tops[i];
          const cy = gy + bossLayout.height / 2;
          const shieldNodeX = getBossShieldXAtY(cy);
          const cardX = shieldNodeX + 18;
          const cardW = LOGICAL_W - 24 - cardX;
          const cardY = gy + 2;
          const cardH = bossLayout.height - 4;
          const dmgRatio = Math.max(0, Math.min(1, boss.quizTargetDamage[i]));
          const isAimed = aimedIdx === i;
          const isSelected = boss.quizSelectedIdx === i;
          const isCorrectChoice = q.correctIndex === i;

          let borderColor = isAimed
            ? '#34D399'
            : dmgRatio > 0
              ? '#FBBF24'
              : 'rgba(56, 189, 248, 0.65)';
          let fillBg = isAimed
            ? 'rgba(6, 78, 59, 0.92)'
            : 'rgba(7, 11, 20, 0.94)';
          let badgeBg = isAimed ? '#34D399' : '#1E293B';
          let badgeText = isAimed ? '#052E16' : '#E2E8F0';

          if (isFeedback) {
            if (isCorrectChoice) {
              borderColor = '#10B981';
              fillBg = 'rgba(6, 78, 59, 0.95)';
              badgeBg = '#10B981';
              badgeText = '#052E16';
            } else if (isSelected) {
              borderColor = '#F43F5E';
              fillBg = 'rgba(136, 19, 55, 0.95)';
              badgeBg = '#F43F5E';
              badgeText = '#FFFFFF';
            } else {
              borderColor = 'rgba(71, 85, 105, 0.48)';
              fillBg = 'rgba(7, 11, 20, 0.86)';
              badgeBg = '#1E293B';
              badgeText = '#94A3B8';
            }
          }

          // Shield Break Target Node directly on the "(" arc (zero shadowBlur)
          ctx.save();
          if (isAimed || dmgRatio > 0) {
            ctx.fillStyle = borderColor;
            ctx.globalAlpha = 0.28;
            ctx.beginPath();
            ctx.arc(shieldNodeX, cy, 17, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
          }
          ctx.fillStyle = isFeedback
            ? isCorrectChoice
              ? '#10B981'
              : isSelected
                ? '#F43F5E'
                : '#475569'
            : dmgRatio > 0
              ? '#34D399'
              : isAimed
                ? '#67E8F9'
                : '#38BDF8';
          ctx.beginPath();
          ctx.arc(shieldNodeX, cy, isAimed || dmgRatio > 0 ? 11 : 8, 0, Math.PI * 2);
          ctx.fill();

          if (dmgRatio > 0 && !isFeedback) {
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 3.2;
            ctx.beginPath();
            ctx.arc(
              shieldNodeX,
              cy,
              16,
              -Math.PI / 2,
              -Math.PI / 2 + Math.PI * 2 * dmgRatio,
            );
            ctx.stroke();
          }
          ctx.restore();

          // Choice Card Body
          ctx.save();
          ctx.fillStyle = fillBg;
          ctx.strokeStyle = borderColor;
          ctx.lineWidth = isAimed || isSelected || (isFeedback && isCorrectChoice) ? 2.6 : 1.6;
          ctx.beginPath();
          ctx.roundRect(cardX, cardY, cardW, cardH, 10);
          ctx.fill();

          // Sustained Damage Fill Sweep inside the card so progress is unmistakable
          if (dmgRatio > 0 && !isFeedback) {
            ctx.save();
            ctx.clip();
            const fillGrad = ctx.createLinearGradient(cardX, 0, cardX + cardW * dmgRatio, 0);
            fillGrad.addColorStop(0, 'rgba(16, 185, 129, 0.42)');
            fillGrad.addColorStop(1, 'rgba(52, 211, 153, 0.22)');
            ctx.fillStyle = fillGrad;
            ctx.fillRect(cardX, cardY, cardW * dmgRatio, cardH);
            ctx.restore();
          }

          ctx.stroke();

          // Label Badge (A/B/C/D)
          ctx.fillStyle = badgeBg;
          ctx.beginPath();
          ctx.roundRect(cardX + 12, cy - 17, 34, 34, 6);
          ctx.fill();
          ctx.font = '800 18px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = badgeText;
          ctx.fillText(GATE_LABELS[i], cardX + 29, cy + 6);

          // Choice Text (larger font with ~550px width)
          ctx.font = isExternalQuiz
            ? '700 22px "Plus Jakarta Sans", sans-serif'
            : '700 19px "Plus Jakarta Sans", sans-serif';
          ctx.textAlign = 'left';
          ctx.fillStyle =
            isFeedback && !isCorrectChoice && !isSelected ? '#94A3B8' : '#F8FAFC';
          const cLines = wrapCanvasText(ctx, q.choices[i], cardW - 72);
          const lineStep = isExternalQuiz ? 26 : 22;
          const startY = cLines.length > 1 ? cy - 5 : cy + 6;
          cLines.slice(0, 2).forEach((line, lIdx) => {
            ctx.fillText(line, cardX + 58, startY + lIdx * lineStep);
          });

          // Visible Sustained Damage Progress Bar at bottom of each card
          if (!isFeedback) {
            const barX = cardX + 12;
            const barY = cardY + cardH - 9;
            const barW = cardW - 24;
            ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
            ctx.fillRect(barX, barY, barW, 5);
            if (dmgRatio > 0) {
              ctx.fillStyle = dmgRatio > 0.72 ? '#6EE7B7' : '#34D399';
              ctx.fillRect(barX, barY, barW * dmgRatio, 5);
            }
          }
          ctx.restore();
        }

        // Question Banner inside canvas (wide top bar clear of all 4 choices below)
        if (!isExternalQuiz) {
          const qBoxX = 48;
          const qBoxY = 66;
          const qBoxW = LOGICAL_W - 96;
          const qBoxH = 82;

          ctx.fillStyle = 'rgba(7, 11, 20, 0.95)';
          ctx.strokeStyle =
            boss.quizBoostTier > 0
              ? 'rgba(244, 63, 94, 0.8)'
              : 'rgba(34, 211, 238, 0.72)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(qBoxX, qBoxY, qBoxW, qBoxH, 12);
          ctx.fill();
          ctx.stroke();

          ctx.font = '700 12px "JetBrains Mono", monospace';
          ctx.textAlign = 'left';
          ctx.fillStyle = boss.quizBoostTier > 0 ? '#FDA4AF' : '#22D3EE';
          const boostTag =
            boss.quizBoostTier > 0 ? `  ·  OVERDRIVE +${boss.quizBoostTier}` : '';
          ctx.fillText(
            `BOSS SHIELD QUIZ #${boss.quizCount}  //  ${q.category}${boostTag}`,
            qBoxX + 16,
            qBoxY + 21,
          );

          const timeRatio = Math.max(0, Math.min(1, boss.quizTimer / BOSS_QUIZ_TIME_LIMIT_SEC));
          const timerColor =
            boss.quizTimer <= 8
              ? '#FB7185'
              : boss.quizTimer <= 18
                ? '#FBBF24'
                : '#34D399';
          ctx.textAlign = 'right';
          ctx.fillStyle = isFeedback
            ? boss.quizResult === 'correct'
              ? '#34D399'
              : '#FB7185'
            : timerColor;
          ctx.font = '700 14px "JetBrains Mono", monospace';
          const rightLabel = isFeedback
            ? boss.quizResult === 'correct'
              ? 'SHIELD SHATTERED!'
              : boss.quizResult === 'timeout'
                ? 'TIME UP · シールド維持'
                : 'MISS · シールド維持'
            : `NORMAL SHOT で破壊  ·  TIME ${Math.ceil(boss.quizTimer).toString().padStart(2, '0')}s`;
          ctx.fillText(rightLabel, qBoxX + qBoxW - 16, qBoxY + 21);

          const tBarX = qBoxX + 16;
          const tBarY = qBoxY + 28;
          const tBarW = qBoxW - 32;
          ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
          ctx.fillRect(tBarX, tBarY, tBarW, 4);
          ctx.fillStyle = isFeedback
            ? boss.quizResult === 'correct'
              ? '#34D399'
              : '#FB7185'
            : timerColor;
          ctx.fillRect(tBarX, tBarY, tBarW * (isFeedback ? 1 : timeRatio), 4);

          ctx.font = '700 20px "Plus Jakarta Sans", sans-serif';
          ctx.textAlign = 'left';
          ctx.fillStyle = '#F8FAFC';
          let qLines = wrapCanvasText(ctx, q.question, qBoxW - 32);
          if (qLines.length > 2) {
            ctx.font = '700 16px "Plus Jakarta Sans", sans-serif';
            qLines = wrapCanvasText(ctx, q.question, qBoxW - 32);
            qLines.slice(0, 3).forEach((line, lIdx) => {
              ctx.fillText(line, qBoxX + 16, qBoxY + 47 + lIdx * 17);
            });
          } else {
            qLines.forEach((line, lIdx) => {
              ctx.fillText(line, qBoxX + 16, qBoxY + 53 + lIdx * 22);
            });
          }
        }

        ctx.restore();
      }

      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      for (const ft of s.floatingTexts) {
        ctx.globalAlpha = Math.min(1, ft.life);
        ctx.font = ft.big
          ? '800 22px "JetBrains Mono", monospace'
          : '700 15px "JetBrains Mono", monospace';
        ctx.strokeStyle = 'rgba(2, 6, 23, 0.92)';
        ctx.lineWidth = ft.big ? 4.5 : 3.2;
        ctx.strokeText(ft.text, ft.x, ft.y);
        ctx.fillStyle = ft.color;
        ctx.fillText(ft.text, ft.x, ft.y);
      }
      ctx.globalAlpha = 1;

      ctx.restore();
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      // 画面揺れタイマーはゲームオーバー等の状態に関わらず常に減衰させ、確実に停止させる
      const s = simRef.current;
      if (s.shakeTimer > 0) {
        s.shakeTimer = Math.max(0, s.shakeTimer - dt);
        if (s.shakeTimer === 0) s.shakeIntensity = 0;
      }

      if (gameStateRef.current === 'PLAYING') {
        updateSimulation(dt);
      } else {
        inputRef.current.activePointerId = null;
        inputRef.current.pointerDown = false;
        inputRef.current.glideVx = 0;
        inputRef.current.glideVy = 0;
        inputRef.current.tapFireTimer = 0;
        s.bgOffset += 55 * dt;
      }

      renderScene();

      hudAccumulator += dt;
      if (hudAccumulator >= 0.06) {
        hudAccumulator = 0;
        const st = getCurrentCourse();
        const pattern = UPGRADE_PATTERNS[s.patternId];
        const isMaxLevel = s.level >= MAX_WEAPON_LEVEL;
      const nextStep =
        !isMaxLevel && s.upgradeIndex < pattern.steps.length
          ? pattern.steps[s.upgradeIndex].label
          : s.hiddenEvolutionUnlocked
            ? s.player.shield < s.player.maxShield
              ? `OVERDRIVE ★ · SHIELD +1 (${(s.shieldScoreRequired - s.shieldScoreProgress).toLocaleString()} PTS)`
              : `OVERDRIVE ★ (次回 ${s.shieldScoreRequired.toLocaleString()} PTS)`
            : s.player.shield < s.player.maxShield
              ? `SHIELD +1 (${(s.shieldScoreRequired - s.shieldScoreProgress).toLocaleString()} PTS)`
              : `LV MAX (次回 ${s.shieldScoreRequired.toLocaleString()} PTS)`;

        const activeBossQuiz =
          s.boss && s.boss.quizState !== 'none' && s.boss.quizQuestion ? s.boss : null;
        const activeQuizQuestion = activeBossQuiz
          ? activeBossQuiz.quizQuestion
          : s.quizQuestion;
        const activeQuizMode: 'none' | 'gate' | 'boss_shield' =
          s.quizPhase !== 'none'
            ? 'gate'
            : activeBossQuiz
              ? 'boss_shield'
              : 'none';

        onHudUpdate({
          shield: s.player.shield,
          maxShield: s.player.maxShield,
          score: s.score,
          highScore: highScoreRef.current,
          level: s.level,
          isMaxLevel,
          xp: s.xp,
          xpToNext: s.xpToNext,
          shieldScoreProgress: s.shieldScoreProgress,
          shieldScoreRequired: s.shieldScoreRequired,
          hiddenEvolution: s.hiddenEvolutionUnlocked,
          postMaxShieldMilestones: s.postMaxShieldMilestones,
          combo: s.combo,
          comboTimerRatio: s.comboTimer / 3.5,
          courseId: s.courseId,
          difficulty: s.difficulty,
          stageNumber: s.stageNumber,
          stageHalf: s.stageHalf,
          itemsEnabled: s.itemsEnabled,
          isEndless: s.isEndless,
          endlessLoop: s.endlessLoop,
          stageProgress: (() => {
            const halfDur = Math.max(1, st.stageDurationSec / 2);
            const halfProg = Math.min(1, s.stageTimer / halfDur);
            return s.stageHalf === 1 ? halfProg * 0.5 : 0.5 + halfProg * 0.5;
          })(),
          weapons: {...s.weapons},
          patternId: s.patternId,
          nextUpgradeLabel: nextStep,
          lastUpgradeBanner: s.lastUpgradeBanner,
          bossActive: Boolean(s.boss),
          bossName: s.boss?.name ?? '',
          bossHp: s.boss?.hp ?? 0,
          bossMaxHp: s.boss?.maxHp ?? 1,
          bossPhase: s.boss?.phase ?? 1,
          warningText: s.warningText,
          enemiesDefeated: s.enemiesDefeated,
          elapsedTime: s.elapsedTime,
          quizActive: activeQuizMode !== 'none',
          quizMode: activeQuizMode,
          bossQuizNumber: activeBossQuiz?.quizCount ?? 0,
          quizTimeRemaining: activeBossQuiz ? activeBossQuiz.quizTimer : s.quizTimer,
          quizFeedbackRemaining: activeBossQuiz
            ? activeBossQuiz.quizFeedbackTimer
            : s.quizFeedbackTimer,
          quizResult: activeBossQuiz ? activeBossQuiz.quizResult : s.quizResult,
          quizQuestionCategory: activeQuizQuestion?.category ?? '',
          quizQuestionText: activeQuizQuestion?.question ?? '',
          quizCorrectLabel: activeQuizQuestion
            ? GATE_LABELS[activeQuizQuestion.correctIndex]
            : '',
          quizCorrectChoiceText: activeQuizQuestion
            ? activeQuizQuestion.choices[activeQuizQuestion.correctIndex]
            : '',
          quizAnsweredCorrectlyCount: s.quizAnsweredCorrect,
          quizTotalAnsweredCount: s.quizTotalAnswered,
        });
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [onHighScoreUpdate, onHudUpdate, onStateChange]);

  return (
    <canvas
      ref={canvasRef}
      width={LOGICAL_W}
      height={LOGICAL_H}
      className="game-touch-surface w-full h-full object-contain block cursor-crosshair"
    />
  );
};
