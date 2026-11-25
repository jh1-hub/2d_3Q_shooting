export type GameState =
  | 'TITLE_MENU'
  | 'PLAYING'
  | 'PAUSED'
  | 'STAGE_CLEAR'
  | 'GAME_OVER';

export type WeaponId =
  | 'normal'
  | 'twin'
  | 'three_way'
  | 'cross_laser'
  | 'laser'
  | 'ripple'
  | 'missile'
  | 'orbit'
  | 'drone'
  | 'back_shot';

export type UpgradePatternId = 'balance' | 'spread' | 'pierce' | 'missile_guard';

export type CourseId = 'neon_city' | 'foundry' | 'cyber_vault' | 'orbital';

export type DifficultyMode = 'normal' | 'hard';

export type BossShape = 'cruiser' | 'dreadnought' | 'mantis' | 'citadel';

export type EnemyTypeId =
  | 'drone'
  | 'interceptor'
  | 'heli'
  | 'turret'
  | 'insect'
  | 'heavy';

export interface WeaponResource {
  id: WeaponId;
  name: string;
  shortLabel: string;
  description: string;
  fireInterval: number;
  baseDamage: number;
  bulletSpeed: number;
  color: string;
}

export type UpgradeKind =
  | 'weapon_unlock'
  | 'fire_rate'
  | 'damage'
  | 'bullet_size'
  | 'shield'
  | 'move_speed';

export interface UpgradeStep {
  label: string;
  shortTag: string;
  kind: UpgradeKind;
  weaponId?: WeaponId;
  value: number;
  extra?: {
    kind: UpgradeKind;
    weaponId?: WeaponId;
    value: number;
  };
}

export interface UpgradePattern {
  id: UpgradePatternId;
  name: string;
  subtitle: string;
  description: string;
  accent: string;
  maxShield: number;
  baseDamageMult?: number;
  baseFireRateMult?: number;
  steps: UpgradeStep[];
}

export interface EnemyResource {
  id: EnemyTypeId;
  name: string;
  hp: number;
  speed: number;
  radius: number;
  scoreValue: number;
  xpValue: number;
  fireCooldown: number;
  color: string;
  accent: string;
}

export interface CourseResource {
  id: CourseId;
  code: string;
  name: string;
  quizCategoryLabel: string;
  accentColor: string;
  skyTop: string;
  skyBottom: string;
  horizonColor: string;
  buildingColor: string;
  scrollSpeed: number;
  stageDurationSec: number;
  enemyPool: EnemyTypeId[];
  bossName: string;
  bossShape: BossShape;
}

export interface GameSettings {
  autoShot: boolean;
  bgmEnabled: boolean;
  sfxEnabled: boolean;
  touchSensitivity: number;
  screenShake: boolean;
}

export interface HudSnapshot {
  shield: number;
  maxShield: number;
  score: number;
  highScore: number;
  level: number;
  isMaxLevel: boolean;
  xp: number;
  xpToNext: number;
  shieldScoreProgress: number;
  shieldScoreRequired: number;
  combo: number;
  comboTimerRatio: number;
  courseId: CourseId;
  difficulty: DifficultyMode;
  stageNumber: number;
  stageHalf: 1 | 2;
  itemsEnabled: boolean;
  isEndless: boolean;
  endlessLoop: number;
  stageProgress: number;
  weapons: Partial<Record<WeaponId, number>>;
  patternId: UpgradePatternId;
  nextUpgradeLabel: string;
  lastUpgradeBanner: string | null;
  bossActive: boolean;
  bossName: string;
  bossHp: number;
  bossMaxHp: number;
  bossPhase: number;
  warningText: string | null;
  enemiesDefeated: number;
  elapsedTime: number;
  quizActive: boolean;
  quizMode: 'none' | 'gate' | 'boss_shield';
  bossQuizNumber: number;
  quizTimeRemaining: number;
  quizFeedbackRemaining: number;
  quizResult: 'none' | 'correct' | 'wrong' | 'timeout';
  quizQuestionCategory: string;
  quizQuestionText: string;
  quizCorrectLabel: string;
  quizCorrectChoiceText: string;
  quizAnsweredCorrectlyCount: number;
  quizTotalAnsweredCount: number;
}

export interface CourseScoreEntry {
  score: number;
  patternId: UpgradePatternId;
  stageNumber: number;
  endlessLoop: number;
  difficulty?: DifficultyMode;
  timestamp: number;
}

export type CourseHighScores = Record<CourseId, CourseScoreEntry[]>;

export type Rarity = 'C' | 'R' | 'SR' | 'UR';

export interface TermData {
  id: number;
  name: string;
  descriptions: string[];
  rarity: Rarity;
  flavorTexts: string[];
}

export interface Subcategory {
  id: string;
  title: string;
  terms: TermData[];
}

export interface Category {
  id: string;
  title: string;
  subcategories: Subcategory[];
}

export interface UnitStats {
  level?: number;
  xp?: number;
  [key: string]: unknown;
}

export interface GameStats {
  [key: string]: unknown;
}

export interface TermStat {
  [key: string]: unknown;
}

export type TermStats = Record<string, TermStat>;
