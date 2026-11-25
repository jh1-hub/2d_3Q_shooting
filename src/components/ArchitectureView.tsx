import React from 'react';
import {COURSES, ENEMIES, WEAPONS} from '../game/data';

const DIRECTORY_TREE = `res://
├── project.godot
├── assets/
│   ├── sprites/          # ARROW-01、敵機6種、ボス、弾丸スプライト
│   ├── backgrounds/      # 7ステージ別パララックスレイヤー画像
│   └── audio/            # SE / BGM (.ogg / .wav)
├── resources/
│   ├── weapons/          # normal_shot.tres, twin_shot.tres ... (WeaponData)
│   ├── upgrades/         # fire_rate_15.tres, unlock_laser.tres ... (UpgradeData)
│   ├── enemies/          # small_drone.tres ... heavy_mecha.tres (EnemyData)
│   └── stages/           # stage_01_skyway.tres ... stage_07_aicore.tres (StageData)
├── scenes/
│   ├── main.tscn         # ルートゲームシーン
│   ├── player.tscn       # ARROW-01 (CharacterBody2D + WeaponManager)
│   ├── enemy.tscn        # 汎用敵シーン (Area2D + EnemyData)
│   ├── boss.tscn         # マルチフェーズボス (Area2D + PhaseController)
│   ├── bullet.tscn       # 共通弾丸 (Area2D + Kind分岐)
│   ├── drone_unit.tscn   # 追従支援機
│   └── ui_hud.tscn       # HUD + LevelUp 3択 + Settingsモーダル
└── scripts/
    ├── autoload/         # game_manager.gd (スコア・コンボ・Save・状態遷移)
    ├── resources/        # weapon_data.gd, upgrade_data.gd, enemy_data.gd, stage_data.gd
    ├── player/           # player.gd
    ├── weapons/          # weapon_manager.gd, bullet.gd, drone_unit.gd
    ├── upgrades/         # upgrade_manager.gd
    ├── enemies/          # enemy.gd, boss.gd
    ├── managers/         # spawn_manager.gd, stage_manager.gd
    └── ui/               # ui_manager.gd`;

const SCENE_TREES = [
  {
    name: 'Main.tscn (Node2D)',
    nodes: [
      'ParallaxBackground — ColorRect (Sky) + ParallaxLayer x3 (遠景・中景・近景)',
      'StageManager (Node) — StageData[] を読み込みスクロール速度・環境色を切替',
      'SpawnManager (Node) — EnemyData[] から編隊をランダム生成、一定時間でBoss出現',
      'UpgradeManager (Node) — UpgradeData[] から3択を抽選しPlayer/WeaponManagerへ適用',
      'Player (CharacterBody2D) — 相対移動・HP/シールド・当たり判定（コア極小6px）',
      'UIManager (CanvasLayer) — HUD（HP/Score/Combo/EXP/Weapons）・3択・Settings',
    ],
  },
  {
    name: 'Player.tscn (CharacterBody2D)',
    nodes: [
      'CollisionShape2D (CircleShape2D r=6) — 弾幕回避しやすい精密コア判定',
      'VisualHull (Polygon2D / AnimatedSprite2D) — 上下移動に応じたバンク傾斜',
      'WeaponManager (Node2D) — 解放済みWeaponDataタイマー＆シナジー判定',
      'InvulnTimer (Timer, one_shot=true) — 被弾後の無敵フレーム管理',
    ],
  },
  {
    name: 'Enemy.tscn & Boss.tscn (Area2D)',
    nodes: [
      'Enemy: CollisionShape2D + Sprite2D + EnemyData (AIPattern enumで6種分岐)',
      'Boss: CollisionShape2D + MultiTurretNodes + 3フェーズHPしきい値 + BossWarning連携',
    ],
  },
];

const MVP_STEPS = [
  {
    step: '01',
    title: 'プレイヤー移動',
    detail: 'Player.tscnを作成し、InputEventScreenDrag・マウス相対移動・矢印キー入力と画面端クランプを実装。',
  },
  {
    step: '02',
    title: 'オートショット',
    detail: 'WeaponManagerにNormal Shotのタイマー射撃を実装し、GameManager.auto_shot_enabledでON/OFF切替。',
  },
  {
    step: '03',
    title: '敵出現',
    detail: 'EnemyData ResourceとSpawnManagerを組み、画面右端から小型ドローンがランダム座標で出現。',
  },
  {
    step: '04',
    title: '当たり判定',
    detail: 'Physics Layer（1:Player / 2:PlayerBullets / 3:Enemies / 4:EnemyBullets）を分離し、相互ダメージを実装。',
  },
  {
    step: '05',
    title: 'スコア＆コンボ',
    detail: 'GameManager.add_kill_score()でコンボ倍率加算、被弾時リセット、user://へのハイスコア保存を接続。',
  },
  {
    step: '06',
    title: 'レベルアップ',
    detail: 'EXPジェム獲得→xp_to_next到達でget_tree().paused = trueにし、3択カードモーダルを表示。',
  },
  {
    step: '07',
    title: '武器強化・シナジー',
    detail: 'Twin / 3-Way / Laser / Ripple / Homing / Droneを追加し、2種所持でシナジー自動解放。',
  },
  {
    step: '08',
    title: 'ボス戦実装',
    detail: '32秒経過またはステージ終端でWARNING表示→Boss.tscn出現、HP割合でPhase 1〜3へ移行。',
  },
  {
    step: '09',
    title: '演出強化',
    detail: 'GPUParticles2D爆発・WorldEnvironment Glow・Camera2D画面揺れ・ヒットフラッシュを追加。',
  },
  {
    step: '10',
    title: 'UI・端末最適化',
    detail: 'タブレット/スマホ実機でHUD視認性とセーフエリア余白を調整し、設定モーダルを完成。',
  },
];

const PROPOSALS = [
  {
    title: 'オブジェクトプーリング導入（弾丸・パーティクル）',
    reason: '高レベル帯の3-Way＋Drone＋Prism Wave同時発射時、queue_free()/instantiate()によるGCスパイクを防ぎ60fpsを維持できます。',
  },
  {
    title: 'モバイル向けセーフエリア自動補正',
    reason: 'DisplayServer.get_display_safe_area()をUIManagerのMarginContainerへ反映すると、ノッチ・パンチホール端末でもHUDが欠けません。',
  },
  {
    title: 'シェーダーによるヒットフラッシュ＆ネオンブルーム',
    reason: 'CanvasItemMaterialやWorldEnvironmentのGlow（HDR Threshold 1.1）を使うと、モバイルGPUでも軽量にサイバーパンクな発光表現が得られます。',
  },
];

export const ArchitectureView: React.FC = () => {
  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-6 flex flex-col gap-8">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl md:text-3xl font-bold text-white text-balance">
          設計ドキュメント・実装ロードマップ
        </h1>
        <p className="text-sm text-slate-400 mt-1.5 max-w-3xl leading-relaxed">
          Godot 4 + GDScriptにおける責務分離、データ駆動Resource設計、シーン階層、MVP優先の10段階実装手順、および拡張提案をまとめています。
        </p>
      </div>

      {/* Directory & Scene Structure */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-5 bg-slate-900/80 border border-slate-800 rounded-xl p-5 flex flex-col">
          <h2 className="font-display text-lg font-bold text-white mb-3">
            01. ディレクトリ構成
          </h2>
          <pre className="text-xs font-mono text-slate-300 leading-relaxed overflow-x-auto bg-slate-950/80 border border-slate-800/80 rounded-lg p-4 flex-1">
            {DIRECTORY_TREE}
          </pre>
        </div>

        <div className="lg:col-span-7 bg-slate-900/80 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
          <h2 className="font-display text-lg font-bold text-white">
            02. シーン構成と責務分離
          </h2>
          <div className="flex flex-col gap-4">
            {SCENE_TREES.map((scene) => (
              <div
                key={scene.name}
                className="bg-slate-950/70 border border-slate-800/90 rounded-lg p-4"
              >
                <div className="font-mono text-xs font-semibold text-cyan-300 mb-2">
                  {scene.name}
                </div>
                <ul className="space-y-1.5 text-xs text-slate-300">
                  {scene.nodes.map((node) => (
                    <li key={node} className="leading-relaxed">
                      {node}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Data-Driven Catalog Summary */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
        <h2 className="font-display text-lg font-bold text-white mb-4">
          03. データ駆動カタログ（Resource設計）
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs">
          <div>
            <div className="font-semibold text-cyan-300 mb-2">
              WeaponData（7種）
            </div>
            <ul className="space-y-1.5 text-slate-300">
              {Object.values(WEAPONS).map((w) => (
                <li key={w.id} className="flex justify-between gap-2 border-b border-slate-800/70 pb-1">
                  <span className="font-medium text-white">{w.name}</span>
                  <span className="font-mono text-slate-400 tabular-nums">
                    DMG {w.baseDamage} · {w.fireInterval}s
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="font-semibold text-rose-300 mb-2">
              EnemyData（6種）
            </div>
            <ul className="space-y-1.5 text-slate-300">
              {Object.values(ENEMIES).map((e) => (
                <li key={e.id} className="flex justify-between gap-2 border-b border-slate-800/70 pb-1">
                  <span className="font-medium text-white">{e.name}</span>
                  <span className="font-mono text-slate-400 tabular-nums">
                    HP {e.hp} · EXP {e.xpValue}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="font-semibold text-emerald-300 mb-2">
              CourseData（4コース）
            </div>
            <ul className="space-y-1.5 text-slate-300">
              {Object.values(COURSES).map((course) => (
                <li key={course.id} className="flex justify-between gap-2 border-b border-slate-800/70 pb-1">
                  <span className="font-medium text-white">
                    {course.code} · {course.name}
                  </span>
                  <span className="font-mono text-slate-400">
                    {course.bossName}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* 10-Step MVP Implementation Order */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
        <h2 className="font-display text-lg font-bold text-white mb-4">
          04. MVP優先・段階的実装手順（1〜10）
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {MVP_STEPS.map((item) => (
            <div
              key={item.step}
              className="bg-slate-950/70 border border-slate-800 rounded-lg p-3.5 flex flex-col gap-1.5"
            >
              <div className="font-mono text-xs font-bold text-cyan-400 tabular-nums">
                STEP {item.step}
              </div>
              <div className="text-sm font-semibold text-white">{item.title}</div>
              <p className="text-xs text-slate-400 leading-relaxed">{item.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Proposals (Explicitly marked as proposals, not added unasked) */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
        <h2 className="font-display text-lg font-bold text-white mb-1">
          05. 今後の改善・最適化提案
        </h2>
        <p className="text-xs text-slate-400 mb-4">
          仕様を勝手に肥大化させず、MVP完成後に検討できる技術的改善案として整理しています。
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PROPOSALS.map((prop) => (
            <div
              key={prop.title}
              className="bg-slate-950/60 border border-slate-800 rounded-lg p-4"
            >
              <div className="text-sm font-semibold text-white mb-1.5">
                {prop.title}
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">{prop.reason}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
