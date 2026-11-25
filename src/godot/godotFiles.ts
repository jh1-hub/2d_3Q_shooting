export interface GodotFileEntry {
  path: string;
  category: 'Project & Scenes' | 'Autoload & Managers' | 'Player & Weapons' | 'Enemies & Boss' | 'Resources (.gd / .tres)';
  summary: string;
  code: string;
}

export const GODOT_PROJECT_FILES: GodotFileEntry[] = [
  {
    path: 'project.godot',
    category: 'Project & Scenes',
    summary: 'Godot 4.3 プロジェクト設定（1280x720 横画面・タッチ/マウス統合・GameManager Autoload）',
    code: `; Engine configuration file.
; Generated for ARROW-01 (2157 Neon Cyber Shmup)

config_version=5

[application]

config/name="ARROW-01"
config/description="2157 Cyber-City Horizontal Roguelite Shoot'em Up"
run/main_scene="res://scenes/main.tscn"
config/features=PackedStringArray("4.3", "Forward Plus")

[autoload]

GameManager="*res://scripts/autoload/game_manager.gd"

[display]

window/size/viewport_width=1280
window/size/viewport_height=720
window/stretch/mode="canvas_items"
window/stretch/aspect="expand"

[input_devices]

pointing/emulate_touch_from_mouse=false
pointing/emulate_mouse_from_touch=false

[layer_names]

2d_physics/layer_1="Player"
2d_physics/layer_2="PlayerBullets"
2d_physics/layer_3="Enemies"
2d_physics/layer_4="EnemyBullets"
2d_physics/layer_5="Pickups"

[rendering]

environment/defaults/default_clear_color=Color(0.027, 0.043, 0.078, 1)
`,
  },
  {
    path: 'scripts/autoload/game_manager.gd',
    category: 'Autoload & Managers',
    summary: 'ゲーム全体状態・スコア・コンボ・ハイスコア保存・自動強化トリガー・エンドレス進行管理',
    code: `extends Node
## GameManager (Autoload Singleton)
## スコア、コンボ倍率、ハイスコア保存、EXP/レベル進行、事前選択パターンに基づく自動強化を管理。

signal score_changed(new_score: int, high_score: int)
signal combo_changed(combo_count: int, multiplier: float)
signal xp_changed(xp: int, xp_to_next: int, level: int)
signal auto_upgrade_triggered(new_level: int)
signal state_changed(new_state: GameState)

enum GameState { TITLE, PLAYING, PAUSED, GAME_OVER }

const SAVE_PATH := "user://arrow01_save.cfg"
const COMBO_TIMEOUT := 3.5

var current_state: GameState = GameState.TITLE
var selected_pattern_id: String = "balance"
var score: int = 0
var high_score: int = 0
var combo: int = 0
var combo_timer: float = 0.0

var level: int = 1
var xp: int = 0
var xp_to_next: int = 48

var auto_shot_enabled: bool = true
var touch_sensitivity: float = 1.2


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_load_save_data()


func _process(delta: float) -> void:
	if current_state != GameState.PLAYING:
		return
	if combo_timer > 0.0:
		combo_timer -= delta
		if combo_timer <= 0.0:
			reset_combo()


func start_new_run(pattern_id: String = "balance") -> void:
	selected_pattern_id = pattern_id
	score = 0
	combo = 0
	combo_timer = 0.0
	level = 1
	xp = 0
	xp_to_next = 48
	get_tree().paused = false
	set_state(GameState.PLAYING)
	score_changed.emit(score, high_score)
	combo_changed.emit(combo, get_combo_multiplier())
	xp_changed.emit(xp, xp_to_next, level)


func set_state(next_state: GameState) -> void:
	current_state = next_state
	get_tree().paused = next_state in [GameState.PAUSED, GameState.GAME_OVER]
	state_changed.emit(current_state)


func add_kill_score(base_points: int) -> void:
	combo += 1
	combo_timer = COMBO_TIMEOUT
	var mult := get_combo_multiplier()
	score += int(round(base_points * mult))
	if score > high_score:
		high_score = score
		_save_high_score()
	score_changed.emit(score, high_score)
	combo_changed.emit(combo, mult)


func get_combo_multiplier() -> float:
	return 1.0 + minf(float(combo) * 0.1, 4.0)


func reset_combo() -> void:
	if combo == 0:
		return
	combo = 0
	combo_timer = 0.0
	combo_changed.emit(combo, 1.0)


func add_xp(amount: int) -> void:
	xp += amount
	while xp >= xp_to_next:
		xp -= xp_to_next
		level += 1
		xp_to_next = int(round(xp_to_next * 1.26 + 18))
		auto_upgrade_triggered.emit(level)
	xp_changed.emit(xp, xp_to_next, level)


func _load_save_data() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(SAVE_PATH) == OK:
		high_score = int(cfg.get_value("records", "high_score", 0))
		auto_shot_enabled = bool(cfg.get_value("settings", "auto_shot", true))
		touch_sensitivity = float(cfg.get_value("settings", "touch_sensitivity", 1.2))


func _save_high_score() -> void:
	var cfg := ConfigFile.new()
	cfg.load(SAVE_PATH)
	cfg.set_value("records", "high_score", high_score)
	cfg.set_value("settings", "auto_shot", auto_shot_enabled)
	cfg.set_value("settings", "touch_sensitivity", touch_sensitivity)
	cfg.save(SAVE_PATH)
`,
  },
  {
    path: 'scripts/player/player.gd',
    category: 'Player & Weapons',
    summary: 'ARROW-01自機：画面どこでも相対ドラッグ（タッチ/マウス）＆キーボード操作、シールド・HP管理',
    code: `class_name Player
extends CharacterBody2D
## ARROW-01 プレイヤー機体制御
## タッチ・マウスは画面全体のどこからでも相対移動ドラッグ可能。矢印キーは補助入力。

signal hp_changed(hp: int, max_hp: int, shield: int, max_shield: int)
signal died

@export var move_speed: float = 420.0
@export var max_hp: int = 100
@export var max_shield: int = 1
@export var screen_margin := Vector2(44.0, 44.0)

@onready var weapon_manager: WeaponManager = $WeaponManager
@onready var invuln_timer: Timer = $InvulnTimer
@onready var sprite: Node2D = $VisualHull

var hp: int = 100
var shield: int = 1
var _active_touch_index: int = -1
var _is_mouse_dragging: bool = false
var _manual_fire_held: bool = false


func _ready() -> void:
	hp = max_hp
	shield = max_shield
	hp_changed.emit(hp, max_hp, shield, max_shield)


func _unhandled_input(event: InputEvent) -> void:
	if GameManager.current_state != GameManager.GameState.PLAYING:
		return

	# 1. タッチ操作（最優先）：画面のどこでも相対移動
	if event is InputEventScreenTouch:
		if event.pressed and _active_touch_index == -1:
			_active_touch_index = event.index
			_manual_fire_held = true
		elif not event.pressed and event.index == _active_touch_index:
			_active_touch_index = -1
			_manual_fire_held = false

	elif event is InputEventScreenDrag and event.index == _active_touch_index:
		_apply_relative_move(event.relative * GameManager.touch_sensitivity)

	# 2. マウスドラッグ操作（タッチと同一の相対挙動）
	elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		_is_mouse_dragging = event.pressed
		_manual_fire_held = event.pressed

	elif event is InputEventMouseMotion and _is_mouse_dragging:
		_apply_relative_move(event.relative)


func _physics_process(delta: float) -> void:
	if GameManager.current_state != GameManager.GameState.PLAYING:
		return

	# 3. 補助キーボード入力（矢印キー / WASD）
	var dir := Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
	if dir != Vector2.ZERO:
		global_position += dir * move_speed * delta
		_clamp_to_viewport()

	# 機体バンク演出（上下移動に応じた傾き）
	if sprite:
		var target_tilt := clampf(dir.y * 0.22, -0.25, 0.25)
		sprite.rotation = lerpf(sprite.rotation, target_tilt, minf(1.0, delta * 12.0))

	# 射撃判定（オートショットON または 手動射撃キー/ドラッグ）
	var should_fire := GameManager.auto_shot_enabled or _manual_fire_held or Input.is_action_pressed("ui_accept")
	weapon_manager.set_firing(should_fire)


func _apply_relative_move(delta_pos: Vector2) -> void:
	global_position += delta_pos
	_clamp_to_viewport()


func _clamp_to_viewport() -> void:
	var vp := get_viewport_rect().size
	global_position.x = clampf(global_position.x, screen_margin.x, vp.x - screen_margin.x)
	global_position.y = clampf(global_position.y, screen_margin.y, vp.y - screen_margin.y)


func take_damage(amount: int) -> void:
	if not invuln_timer.is_stopped():
		return

	invuln_timer.start(1.1)
	if shield > 0:
		shield -= 1
		hp_changed.emit(hp, max_hp, shield, max_shield)
		return

	hp = maxi(0, hp - amount)
	GameManager.reset_combo()
	hp_changed.emit(hp, max_hp, shield, max_shield)
	if hp <= 0:
		died.emit()
		GameManager.set_state(GameManager.GameState.GAME_OVER)


func heal_and_boost_max_hp(bonus_max: int, heal_amount: int) -> void:
	max_hp += bonus_max
	hp = mini(max_hp, hp + heal_amount)
	hp_changed.emit(hp, max_hp, shield, max_shield)


func add_shield() -> void:
	max_shield += 1
	shield = max_shield
	hp_changed.emit(hp, max_hp, shield, max_shield)
`,
  },
  {
    path: 'scripts/weapons/weapon_manager.gd',
    category: 'Player & Weapons',
    summary: '全8種の前方攻撃武装・オートショット・迎撃ミサイル・連射タイマーを統括',
    code: `class_name WeaponManager
extends Node2D
## WeaponManager
## 解放済みWeaponDataに基づき前方弾・対地対空ミサイル・周囲回転迎撃ミサイルを展開する。

signal weapons_updated(owned_weapons: Dictionary)

@export var bullet_scene: PackedScene
@export var drone_scene: PackedScene
@export var weapon_catalog: Array[WeaponData] = []

var owned_weapons: Dictionary = { "normal": 1 } # weapon_id -> level
var _cooldowns: Dictionary = {}
var _is_firing: bool = false
var _drones: Array[DroneUnit] = []
var _elapsed: float = 0.0

var damage_multiplier: float = 1.0
var fire_rate_multiplier: float = 1.0
var bullet_size_multiplier: float = 1.0


func set_firing(enabled: bool) -> void:
	_is_firing = enabled


func unlock_or_upgrade_weapon(weapon_id: String) -> void:
	var current_lv := int(owned_weapons.get(weapon_id, 0))
	var max_lv := 3 if weapon_id in ["drone", "orbit"] else 5
	owned_weapons[weapon_id] = mini(max_lv, current_lv + 1)
	if weapon_id == "drone":
		_sync_drones(owned_weapons["drone"])
	weapons_updated.emit(owned_weapons)


func _process(delta: float) -> void:
	if GameManager.current_state != GameManager.GameState.PLAYING:
		return
	_elapsed += delta
	if not _is_firing:
		return

	for weapon_id in owned_weapons.keys():
		var lv := int(owned_weapons[weapon_id])
		if lv <= 0 or weapon_id == "drone":
			continue
		var data := _find_weapon_data(weapon_id)
		if data == null:
			continue

		var t := float(_cooldowns.get(weapon_id, 0.0)) - delta
		if t <= 0.0:
			_fire_weapon(data, lv)
			_cooldowns[weapon_id] = data.fire_interval / (fire_rate_multiplier * (1.0 + (lv - 1) * 0.08))
		else:
			_cooldowns[weapon_id] = t


func _fire_weapon(data: WeaponData, lv: int) -> void:
	if bullet_scene == null:
		return
	var dmg := int(round(data.base_damage * (1.0 + (lv - 1) * 0.25) * damage_multiplier))

	match data.id:
		"normal":
			_spawn_bullet(global_position + Vector2(24, 0), Vector2.RIGHT * data.bullet_speed, dmg, data)
		"twin":
			for y_off in [-11.0, 11.0]:
				_spawn_bullet(global_position + Vector2(20, y_off), Vector2.RIGHT * data.bullet_speed, dmg, data)
		"three_way":
			for angle in [-0.24, 0.0, 0.24]:
				var vel := Vector2.RIGHT.rotated(angle) * data.bullet_speed
				_spawn_bullet(global_position + Vector2(18, 0), vel, dmg, data)
		"laser":
			_spawn_bullet(global_position + Vector2(36, 0), Vector2.RIGHT * data.bullet_speed, dmg, data, 99)
		"ripple":
			_spawn_bullet(global_position + Vector2(24, 0), Vector2.RIGHT * data.bullet_speed, dmg, data, 5 + lv)
		"missile":
			# 対地・対空ミサイル（前方斜め上下へ射出し水平直進へ移行）
			for dir_y in [-290.0, 290.0]:
				_spawn_bullet(global_position + Vector2(14, signf(dir_y) * 12.0), Vector2(data.bullet_speed * 0.72, dir_y), dmg, data)
		"orbit":
			# 迎撃ミサイル（自機周囲を回転しながら前方弾も発射）
			var count := lv * 2
			for i in range(count):
				var ang := _elapsed * 3.8 + (TAU / float(count)) * float(i)
				var pod_pos := global_position + Vector2(cos(ang), sin(ang)) * 58.0
				_spawn_bullet(pod_pos + Vector2(10, 0), Vector2.RIGHT * data.bullet_speed, int(round(dmg * 0.7)), data)


func _spawn_bullet(pos: Vector2, vel: Vector2, dmg: int, data: WeaponData, pierce: int = 1) -> void:
	var b: Bullet = bullet_scene.instantiate()
	b.global_position = pos
	b.setup(vel, dmg, data.id, data.accent_color, pierce, bullet_size_multiplier)
	get_tree().current_scene.add_child(b)


func _sync_drones(count: int) -> void:
	if drone_scene == null:
		return
	while _drones.size() < count:
		var drone: DroneUnit = drone_scene.instantiate()
		drone.orbit_index = _drones.size()
		drone.total_drones = count
		get_parent().add_child(drone)
		_drones.append(drone)
	for i in range(_drones.size()):
		_drones[i].total_drones = _drones.size()


func _find_weapon_data(weapon_id: String) -> WeaponData:
	for item in weapon_catalog:
		if item.id == weapon_id:
			return item
	return null
`,
  },
  {
    path: 'scripts/weapons/bullet.gd',
    category: 'Player & Weapons',
    summary: '通常弾・貫通レーザー・拡大リップル・対地対空ミサイル・敵弾相殺対応',
    code: `class_name Bullet
extends Area2D
## Bullet
## weapon_kindに応じて直進・貫通・リング拡大・前方対地対空ミサイル挙動を行い、敵弾を相殺する。

var velocity: Vector2 = Vector2.RIGHT * 900.0
var damage: int = 14
var weapon_kind: String = "normal"
var pierce_left: int = 1
var size_mult: float = 1.0
var _hit_targets: Array[int] = []
var _age: float = 0.0
var _max_age: float = 2.2


func setup(vel: Vector2, dmg: int, kind: String, color: Color, pierce: int, scale_factor: float) -> void:
	velocity = vel
	damage = dmg
	weapon_kind = kind
	pierce_left = pierce
	size_mult = scale_factor
	modulate = color
	scale = Vector2.ONE * scale_factor


func _physics_process(delta: float) -> void:
	_age += delta
	if _age >= _max_age:
		queue_free()
		return

	if weapon_kind == "ripple":
		scale += Vector2.ONE * (1.8 * delta * size_mult)
	elif weapon_kind == "missile" and _age > 0.28:
		velocity.y = lerpf(velocity.y, 0.0, minf(1.0, delta * 6.5))
		velocity.x = minf(780.0, velocity.x + 460.0 * delta)
		rotation = velocity.angle()

	global_position += velocity * delta


func _on_area_entered(area: Area2D) -> void:
	# 敵弾の相殺処理
	if area.is_in_group("enemy_bullets"):
		area.queue_free()
		GameManager.add_kill_score(10)
		pierce_left -= 1
		if pierce_left <= 0:
			queue_free()
		return

	if not area.is_in_group("enemies"):
		return
	var id := area.get_instance_id()
	if id in _hit_targets:
		return
	_hit_targets.append(id)

	if area.has_method("apply_damage"):
		area.apply_damage(damage)

	pierce_left -= 1
	if pierce_left <= 0:
		queue_free()
`,
  },
  {
    path: 'scripts/weapons/drone_unit.gd',
    category: 'Player & Weapons',
    summary: '自機追従支援機（Drone Unit）＆Swarm Protocolシナジー対応',
    code: `class_name DroneUnit
extends Node2D
## DroneUnit
## プレイヤー周辺を周回追従し、連動射撃を行う支援ユニット。

@export var bullet_scene: PackedScene
var orbit_index: int = 0
var total_drones: int = 1
var _fire_timer: float = 0.0
var _angle: float = 0.0


func _process(delta: float) -> void:
	if GameManager.current_state != GameManager.GameState.PLAYING:
		return
	var player := get_parent() as Player
	if player == null:
		return

	_angle += delta * 2.6
	var offset_ang := _angle + (TAU / maxf(1.0, float(total_drones))) * float(orbit_index)
	var target_pos := player.global_position + Vector2(-16.0, 0.0) + Vector2(cos(offset_ang), sin(offset_ang)) * 46.0
	global_position = global_position.lerp(target_pos, minf(1.0, delta * 14.0))

	_fire_timer -= delta
	if _fire_timer <= 0.0 and GameManager.auto_shot_enabled:
		_fire_timer = 0.42
		if bullet_scene:
			var b: Bullet = bullet_scene.instantiate()
			b.global_position = global_position + Vector2(12, 0)
			b.setup(Vector2.RIGHT * 860.0, 11, "normal", Color("#67E8F9"), 1, 1.0)
			get_tree().current_scene.add_child(b)
`,
  },
  {
    path: 'scripts/upgrades/upgrade_manager.gd',
    category: 'Autoload & Managers',
    summary: '事前選択されたグラディウス式自動強化パターンの順次適用マネージャ',
    code: `class_name UpgradeManager
extends Node
## UpgradeManager
## ステージ開始前に選択された強化パターン配列を、レベルアップ時に自動で順次適用する。

signal auto_upgraded(label: String, next_label: String)

@export var patterns: Dictionary = {} # pattern_id -> Array[UpgradeData]
@export var player: Player
@export var weapon_manager: WeaponManager

var _step_index: int = 0


func _ready() -> void:
	GameManager.auto_upgrade_triggered.connect(_on_auto_upgrade_triggered)


func reset_sequence() -> void:
	_step_index = 0


func _on_auto_upgrade_triggered(_new_level: int) -> void:
	var seq: Array = patterns.get(GameManager.selected_pattern_id, [])
	if seq.is_empty():
		return

	var choice: UpgradeData = seq[_step_index % seq.size()]
	_step_index += 1
	_apply_upgrade(choice)

	var next_choice: UpgradeData = seq[_step_index % seq.size()]
	auto_upgraded.emit(choice.title, next_choice.title)


func _apply_upgrade(choice: UpgradeData) -> void:
	if choice == null:
		return

	match choice.kind:
		UpgradeData.UpgradeKind.WEAPON_UNLOCK:
			weapon_manager.unlock_or_upgrade_weapon(choice.target_weapon_id)
		UpgradeData.UpgradeKind.FIRE_RATE:
			weapon_manager.fire_rate_multiplier += choice.value
		UpgradeData.UpgradeKind.DAMAGE:
			weapon_manager.damage_multiplier += choice.value
		UpgradeData.UpgradeKind.BULLET_SIZE:
			weapon_manager.bullet_size_multiplier += choice.value
		UpgradeData.UpgradeKind.SHIELD:
			player.add_shield()
		UpgradeData.UpgradeKind.MAX_HP:
			player.heal_and_boost_max_hp(int(choice.value), 35)
		UpgradeData.UpgradeKind.MOVE_SPEED:
			player.move_speed *= (1.0 + choice.value)
`,
  },
  {
    path: 'scripts/enemies/enemy.gd',
    category: 'Enemies & Boss',
    summary: 'Resource駆動の汎用敵クラス（小型ドローン〜大型兵器6種の行動パターン実装）',
    code: `class_name Enemy
extends Area2D
## Enemy
## EnemyDataリソースを差し替えるだけで6種の敵兵器の挙動とステータスを切り替える。

@export var data: EnemyData
@export var enemy_bullet_scene: PackedScene
@export var is_red_carrier: bool = false

var hp: int = 10
var _age: float = 0.0
var _base_y: float = 0.0
var _fire_timer: float = 1.2


func _ready() -> void:
	add_to_group("enemies")
	_base_y = global_position.y
	if data:
		hp = data.max_hp
		_fire_timer = randf_range(0.6, data.fire_cooldown)
		modulate = Color("#EF4444") if is_red_carrier else data.tint_color


func _physics_process(delta: float) -> void:
	if data == null or GameManager.current_state != GameManager.GameState.PLAYING:
		return
	_age += delta

	match data.ai_pattern:
		EnemyData.AIPattern.SINE_DRONE:
			global_position.x -= data.speed * delta
			global_position.y = _base_y + sin(_age * 3.4) * 58.0
		EnemyData.AIPattern.INTERCEPTOR:
			var player := get_tree().get_first_node_in_group("player") as Node2D
			var vy := (player.global_position.y - global_position.y) * 0.75 if player else 0.0
			global_position += Vector2(-data.speed, vy) * delta
		EnemyData.AIPattern.HOVER_HELI:
			var vx := -data.speed if global_position.x > 920.0 else -20.0
			global_position.x += vx * delta
			global_position.y = _base_y + sin(_age * 1.8) * 65.0
		EnemyData.AIPattern.TURRET:
			global_position.x -= data.speed * delta
		EnemyData.AIPattern.ZIGZAG_INSECT:
			global_position.x -= data.speed * delta
			global_position.y += sin(_age * 7.5) * 210.0 * delta
		EnemyData.AIPattern.HEAVY_MECHA:
			global_position.x -= data.speed * delta
			global_position.y = _base_y + sin(_age * 1.1) * 35.0

	_fire_timer -= delta
	if _fire_timer <= 0.0 and global_position.x < 1240.0:
		_fire_timer = data.fire_cooldown
		_shoot_at_player()

	if global_position.x < -90.0:
		queue_free()


func _shoot_at_player() -> void:
	if enemy_bullet_scene == null:
		return
	var player := get_tree().get_first_node_in_group("player") as Node2D
	var angle := (player.global_position - global_position).angle() if player else PI
	var bullet := enemy_bullet_scene.instantiate()
	bullet.global_position = global_position + Vector2(-14, 0)
	bullet.set("velocity", Vector2.RIGHT.rotated(angle) * 275.0)
	get_tree().current_scene.add_child(bullet)


func apply_damage(amount: int) -> void:
	hp -= amount
	if hp <= 0:
		GameManager.add_kill_score(data.score_value if data else 100)
		if is_red_carrier:
			GameManager.add_xp(data.xp_value if data else 15)
		queue_free()
`,
  },
  {
    path: 'scripts/enemies/boss.gd',
    category: 'Enemies & Boss',
    summary: '多段階フェーズ（Phase 1〜3）を持つ巨大ボスAI＆大量報酬ドロップ',
    code: `class_name Boss
extends Area2D
## Boss
## 巨大感と3フェーズの攻撃変化を持つステージボス。

signal boss_hp_changed(hp: int, max_hp: int, phase: int)
signal boss_defeated

@export var boss_name: String = "AETHER-CORE MK.IX"
@export var max_hp: int = 1800
@export var enemy_bullet_scene: PackedScene

var hp: int = 1800
var phase: int = 1
var _age: float = 0.0
var _move_phase: float = 0.0
var _fire_timer: float = 1.2


func _ready() -> void:
	add_to_group("enemies")
	hp = max_hp
	boss_hp_changed.emit(hp, max_hp, phase)


func _physics_process(delta: float) -> void:
	if GameManager.current_state != GameManager.GameState.PLAYING:
		return
	_age += delta

	var ratio := float(hp) / float(max_hp)
	phase = 3 if ratio < 0.34 else (2 if ratio < 0.67 else 1)

	if global_position.x > 1080.0:
		global_position.x = maxf(1080.0, global_position.x - 140.0 * delta)
	else:
		# 連続位相を積算することでPhase切替時もY座標が一切ジャンプしない
		var spd_mult := 1.65 if phase == 3 else (1.3 if phase == 2 else 1.05)
		_move_phase += delta * spd_mult
		global_position.y = 360.0 + sin(_move_phase) * 185.0

	_fire_timer -= delta
	if _fire_timer <= 0.0:
		_execute_phase_pattern()


func _execute_phase_pattern() -> void:
	match phase:
		1:
			_fire_timer = 1.15
			_spawn_fan(5, 0.16, 310.0)
		2:
			_fire_timer = 0.72
			_spawn_ring(8, 260.0)
		3:
			_fire_timer = 0.55
			_spawn_fan(5, 0.18, 345.0)


func _spawn_fan(count: int, step_rad: float, spd: float) -> void:
	if enemy_bullet_scene == null:
		return
	var player := get_tree().get_first_node_in_group("player") as Node2D
	var base_ang := (player.global_position - global_position).angle() if player else PI
	var half := (count - 1) / 2.0
	for i in range(count):
		var b := enemy_bullet_scene.instantiate()
		b.global_position = global_position + Vector2(-56, 0)
		b.set("velocity", Vector2.RIGHT.rotated(base_ang + (i - half) * step_rad) * spd)
		get_tree().current_scene.add_child(b)


func _spawn_ring(count: int, spd: float) -> void:
	if enemy_bullet_scene == null:
		return
	for i in range(count):
		var ang := _age * 1.9 + (TAU / float(count)) * float(i)
		var b := enemy_bullet_scene.instantiate()
		b.global_position = global_position
		b.set("velocity", Vector2.RIGHT.rotated(ang) * spd)
		get_tree().current_scene.add_child(b)


func apply_damage(amount: int) -> void:
	hp = maxi(0, hp - amount)
	boss_hp_changed.emit(hp, max_hp, phase)
	if hp <= 0:
		GameManager.add_kill_score(4500)
		GameManager.add_xp(250)
		boss_defeated.emit()
		queue_free()
`,
  },
  {
    path: 'scripts/managers/spawn_manager.gd',
    category: 'Autoload & Managers',
    summary: 'ランダム編隊スポーン＆ステージ進行に応じたボス出現ディレクター',
    code: `class_name SpawnManager
extends Node
## SpawnManager
## EnemyDataプールからランダムに編隊を出現させ、一定時間経過でボスを起動する。

@export var enemy_scene: PackedScene
@export var boss_scene: PackedScene
@export var enemy_pool: Array[EnemyData] = []

var _spawn_timer: float = 0.8
var _stage_elapsed: float = 0.0
var _wave_count: int = 0
var _boss_active: bool = false


func _process(delta: float) -> void:
	if GameManager.current_state != GameManager.GameState.PLAYING or _boss_active:
		return

	_stage_elapsed += delta
	_spawn_timer -= delta
	if _spawn_timer <= 0.0:
		_spawn_random_wave()
		_spawn_timer = randf_range(0.75, 1.45)

	if _stage_elapsed >= 32.0:
		_spawn_boss()


func _spawn_random_wave() -> void:
	if enemy_scene == null or enemy_pool.is_empty():
		return
	_wave_count += 1
	var chosen: EnemyData = enemy_pool.pick_random()
	var count := 3 if chosen.ai_pattern == EnemyData.AIPattern.SINE_DRONE else 1
	var base_y := randf_range(80.0, 640.0)
	var red_idx := randi() % count if (_wave_count % 3 == 0 or randf() < 0.22) else -1

	for i in range(count):
		var e: Enemy = enemy_scene.instantiate()
		e.data = chosen
		e.is_red_carrier = (i == red_idx)
		e.global_position = Vector2(1340.0 + i * 48.0, clampf(base_y + (i - 1) * 44.0, 60.0, 660.0))
		get_tree().current_scene.add_child(e)


func _spawn_boss() -> void:
	if boss_scene == null:
		return
	_boss_active = true
	var boss: Boss = boss_scene.instantiate()
	boss.global_position = Vector2(1420.0, 360.0)
	boss.boss_defeated.connect(func():
		_boss_active = false
		_stage_elapsed = 0.0
	)
	get_tree().current_scene.add_child(boss)
`,
  },
  {
    path: 'scripts/managers/stage_manager.gd',
    category: 'Autoload & Managers',
    summary: '7つのサイバー都市ステージをエンドレスループしステージ番号を継続管理',
    code: `class_name StageManager
extends Node
## StageManager
## ステージ資源が一周したら最初の背景に戻り、stage_numberのみエンドレスに増加させ続ける。

signal stage_changed(stage_number: int, stage_data: StageData)

@export var stages: Array[StageData] = []
@export var parallax_bg: ParallaxBackground
@export var sky_rect: ColorRect

var stage_number: int = 1


func _ready() -> void:
	if not stages.is_empty():
		apply_stage(1)


func _process(delta: float) -> void:
	if parallax_bg == null or stages.is_empty():
		return
	var st := stages[(stage_number - 1) % stages.size()]
	parallax_bg.scroll_offset.x -= st.scroll_speed * delta


func advance_stage() -> void:
	if stages.is_empty():
		return
	stage_number += 1
	apply_stage(stage_number)


func apply_stage(num: int) -> void:
	stage_number = num
	var st := stages[(stage_number - 1) % stages.size()]
	if sky_rect:
		sky_rect.color = st.sky_color
	stage_changed.emit(stage_number, st)
`,
  },
  {
    path: 'scripts/ui/ui_manager.gd',
    category: 'Autoload & Managers',
    summary: '最大化された画面向けのコンパクトHUD・自動強化通知・右上設定パネル制御',
    code: `class_name UIManager
extends CanvasLayer
## UIManager
## 中央のプレイ画面を最大化し、右上の設定ボタンから設定メニューを展開する。

@export var upgrade_manager: UpgradeManager

@onready var hp_bar: ProgressBar = $HUD/TopLeft/HPBar
@onready var xp_bar: ProgressBar = $HUD/TopCenter/XPBar
@onready var level_label: Label = $HUD/TopCenter/LevelLabel
@onready var next_upgrade_label: Label = $HUD/TopCenter/NextUpgradeLabel
@onready var score_label: Label = $HUD/TopRight/ScoreLabel
@onready var combo_label: Label = $HUD/TopRight/ComboLabel
@onready var upgrade_toast: Label = $HUD/UpgradeToast


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	upgrade_toast.visible = false
	GameManager.score_changed.connect(_on_score_changed)
	GameManager.combo_changed.connect(_on_combo_changed)
	GameManager.xp_changed.connect(_on_xp_changed)
	if upgrade_manager:
		upgrade_manager.auto_upgraded.connect(_on_auto_upgraded)


func _on_score_changed(new_score: int, high_score: int) -> void:
	score_label.text = "%07d  |  HI %07d" % [new_score, high_score]


func _on_combo_changed(combo_count: int, mult: float) -> void:
	combo_label.visible = combo_count > 1
	combo_label.text = "%d COMBO (x%.1f)" % [combo_count, mult]


func _on_xp_changed(xp: int, xp_to_next: int, level: int) -> void:
	xp_bar.max_value = xp_to_next
	xp_bar.value = xp
	level_label.text = "LV %d" % level


func _on_auto_upgraded(applied_label: String, next_label: String) -> void:
	next_upgrade_label.text = "NEXT: %s" % next_label
	upgrade_toast.text = "POWER UP: %s" % applied_label
	upgrade_toast.visible = true
	await get_tree().create_timer(2.5).timeout
	upgrade_toast.visible = false
`,
  },
  {
    path: 'scripts/resources/weapon_data.gd',
    category: 'Resources (.gd / .tres)',
    summary: 'データ駆動武器定義リソース（Inspectorから新規武器を即座に追加可能）',
    code: `class_name WeaponData
extends Resource

@export var id: String = "normal"
@export var display_name: String = "Normal Shot"
@export_multiline var description: String = ""
@export var fire_interval: float = 0.2
@export var base_damage: int = 14
@export var bullet_speed: float = 950.0
@export var accent_color: Color = Color("#22D3EE")
`,
  },
  {
    path: 'scripts/resources/upgrade_data.gd',
    category: 'Resources (.gd / .tres)',
    summary: 'レベルアップ強化カード用Resourceクラス',
    code: `class_name UpgradeData
extends Resource

enum UpgradeKind { WEAPON_UNLOCK, FIRE_RATE, DAMAGE, BULLET_SIZE, SHIELD, MAX_HP, MOVE_SPEED }

@export var id: String = ""
@export var title: String = ""
@export_multiline var description: String = ""
@export var kind: UpgradeKind = UpgradeKind.DAMAGE
@export var target_weapon_id: String = ""
@export var value: float = 0.15
`,
  },
  {
    path: 'scripts/resources/enemy_data.gd',
    category: 'Resources (.gd / .tres)',
    summary: '敵ユニット用Resourceクラス（6種のAIパターン＆報酬値）',
    code: `class_name EnemyData
extends Resource

enum AIPattern { SINE_DRONE, INTERCEPTOR, HOVER_HELI, TURRET, ZIGZAG_INSECT, HEAVY_MECHA }

@export var id: String = "drone"
@export var display_name: String = "小型ドローン"
@export var ai_pattern: AIPattern = AIPattern.SINE_DRONE
@export var max_hp: int = 22
@export var speed: float = 220.0
@export var score_value: int = 100
@export var xp_value: int = 12
@export var fire_cooldown: float = 2.2
@export var tint_color: Color = Color("#38BDF8")
`,
  },
  {
    path: 'scripts/resources/stage_data.gd',
    category: 'Resources (.gd / .tres)',
    summary: 'ステージ環境・スクロール速度・ボス名定義用Resourceクラス',
    code: `class_name StageData
extends Resource

@export var id: String = "neon_skyway"
@export var stage_name: String = "近未来都市上空"
@export var scroll_speed: float = 120.0
@export var sky_color: Color = Color("#060B18")
@export var accent_color: Color = Color("#22D3EE")
@export var has_boss: bool = false
@export var boss_name: String = ""
`,
  },
  {
    path: 'scenes/main.tscn',
    category: 'Project & Scenes',
    summary: 'メインゲームシーン（StageManager・SpawnManager・Player・UIManager統合）',
    code: `[gd_scene load_steps=5 format=3]

[ext_resource type="Script" path="res://scripts/managers/stage_manager.gd" id="1"]
[ext_resource type="Script" path="res://scripts/managers/spawn_manager.gd" id="2"]
[ext_resource type="Script" path="res://scripts/upgrades/upgrade_manager.gd" id="3"]
[ext_resource type="PackedScene" path="res://scenes/player.tscn" id="4"]

[node name="Main" type="Node2D"]

[node name="ParallaxBackground" type="ParallaxBackground" parent="."]

[node name="SkyRect" type="ColorRect" parent="ParallaxBackground"]
anchors_preset = 15
anchor_right = 1.0
anchor_bottom = 1.0
color = Color(0.023, 0.043, 0.094, 1)

[node name="StageManager" type="Node" parent="." node_paths=PackedStringArray("parallax_bg", "sky_rect")]
script = ExtResource("1")
parallax_bg = NodePath("../ParallaxBackground")
sky_rect = NodePath("../ParallaxBackground/SkyRect")

[node name="SpawnManager" type="Node" parent="."]
script = ExtResource("2")

[node name="UpgradeManager" type="Node" parent="." node_paths=PackedStringArray("player", "weapon_manager")]
script = ExtResource("3")
player = NodePath("../Player")
weapon_manager = NodePath("../Player/WeaponManager")

[node name="Player" parent="." instance=ExtResource("4")]
position = Vector2(180, 360)
`,
  },
  {
    path: 'scenes/player.tscn',
    category: 'Project & Scenes',
    summary: 'ARROW-01 プレイヤー機体シーン（CharacterBody2D + WeaponManager + InvulnTimer）',
    code: `[gd_scene load_steps=4 format=3]

[ext_resource type="Script" path="res://scripts/player/player.gd" id="1"]
[ext_resource type="Script" path="res://scripts/weapons/weapon_manager.gd" id="2"]

[sub_resource type="CircleShape2D" id="CircleShape2D_core"]
radius = 6.0

[node name="Player" type="CharacterBody2D" groups=["player"]]
collision_layer = 1
collision_mask = 12
script = ExtResource("1")

[node name="CollisionShape2D" type="CollisionShape2D" parent="."]
shape = SubResource("CircleShape2D_core")

[node name="VisualHull" type="Polygon2D" parent="."]
color = Color(0.133, 0.827, 0.933, 1)
polygon = PackedVector2Array(26, 0, -14, -14, -20, 0, -14, 14)

[node name="WeaponManager" type="Node2D" parent="."]
script = ExtResource("2")

[node name="InvulnTimer" type="Timer" parent="."]
one_shot = true
`,
  },
  {
    path: 'resources/weapons/normal_shot.tres',
    category: 'Resources (.gd / .tres)',
    summary: 'WeaponDataサンプル（Inspector編集可能なデータアセット）',
    code: `[gd_resource type="Resource" script_class="WeaponData" load_steps=2 format=3]

[ext_resource type="Script" path="res://scripts/resources/weapon_data.gd" id="1"]

[resource]
script = ExtResource("1")
id = "normal"
display_name = "Normal Shot"
description = "前方単発の標準プラズマ弾。初期武装。"
fire_interval = 0.19
base_damage = 14
bullet_speed = 980.0
accent_color = Color(0.133, 0.827, 0.933, 1)
`,
  },
  {
    path: 'resources/enemies/small_drone.tres',
    category: 'Resources (.gd / .tres)',
    summary: 'EnemyDataサンプル（小型ドローン設定アセット）',
    code: `[gd_resource type="Resource" script_class="EnemyData" load_steps=2 format=3]

[ext_resource type="Script" path="res://scripts/resources/enemy_data.gd" id="1"]

[resource]
script = ExtResource("1")
id = "drone"
display_name = "小型ドローン"
ai_pattern = 0
max_hp = 22
speed = 220.0
score_value = 100
xp_value = 12
fire_cooldown = 2.3
tint_color = Color(0.22, 0.74, 0.97, 1)
`,
  },
];
