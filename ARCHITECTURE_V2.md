# Angband-TS アーキテクチャ v2

> 58,573 LOC / 97 source files / 54 test files / 1,443 tests passing
> Last updated: 2026-02-27

---

## 1. プロジェクト全体構成

```
angband-ts/
├── packages/
│   ├── @angband/core/     ← ゲームエンジン（純ロジック、DOM依存なし）
│   │   ├── src/           ← 97 source + 54 test files
│   │   └── gamedata/      ← 46 JSON（C版 .txt → JSON 変換済み）
│   ├── @angband/renderer/ ← 仮想ターミナル＋表示ロジック
│   │   └── src/           ← 3 source + 3 test files
│   └── @angband/web/      ← ブラウザフロントエンド（Vite）
│       ├── src/           ← 7 source files
│       └── public/gamedata/ ← web用JSONコピー
├── tools/
│   └── data-converter/    ← C版 .txt → JSON 変換ツール
├── vitest.config.ts       ← テスト設定（単一ルート設定）
└── tsconfig.json          ← TypeScript設定（strict, ES2022, bundler resolution）
```

### ビルド・テスト

| コマンド | 内容 |
|----------|------|
| `npm run build` | 全パッケージビルド（workspaces） |
| `npm test` | Vitest 全テスト実行（58ファイル、1,443テスト） |
| `npm run typecheck` | tsc --noEmit（型チェックのみ） |
| `npm run lint` | ESLint |

### 技術スタック

- TypeScript 5.6+ (strict mode, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- Vitest 3.0 (テストランナー)
- Vite 6.0 (web バンドラ)
- ESM only (`"type": "module"`)
- ランタイム依存: **ゼロ** (core/renderer は外部 npm パッケージ不要)

---

## 2. モジュール依存レイヤー図

```
Layer 1 ─── z/               純ユーティリティ（RNG, BitFlag, Loc, Dice, Color）
            │                 依存: なし
            ▼
Layer 2 ─── types/            共有型定義（Player, Monster, Chunk, ObjectType）
            │                 依存: z
            ▼
Layer 3 ─── data/             JSONデータローダー（monster, object, vault, pit, profile）
            cave/             ダンジョングリッド操作（Chunk, Square, FOV, Heatmap）
            object/           アイテムシステム（inventory, gear, slays, knowledge）
            store/            ショップシステム（売買, 在庫管理）
            │                 依存: z, types
            ▼
Layer 4 ─── player/           プレイヤーシステム（birth, calc, timed, spell）
            │                 依存: z, types, cave/view, object/knowledge
            ▼
Layer 5 ─── monster/          モンスターAI・行動（move, attack, spell, death, make）
            │                 依存: z, types, cave, object/make
            ▼
Layer 6 ─── effect/           エフェクトディスパッチ（heal, damage, teleport, detect...）
            project/          投射エンジン（bolt, ball, beam, breath）
            command/          プレイヤーコマンド（walk, attack, fire, cast, item...）
            │                 依存: z, types, cave, object, player, monster（一部）
            ▼
Layer 7 ─── generate/         ダンジョン生成（room, tunnel, populate, town, vault）
            │                 依存: z, types, cave, data, monster/make, object/make
            ▼
Layer 8 ─── game/             ゲームループ・状態管理（runGameLoop, processMonsters, world）
            save/             セーブ・ロード（JSON シリアライズ）
            │                 依存: 全レイヤー
            ▼
Layer 9 ─── @angband/renderer 表示ロジック（Terminal, renderMap, renderSidebar）
            @angband/web      ブラウザUI（GameBridge, Canvas, Input, BirthScreen）
                              依存: @angband/core の全サブモジュール
```

### 循環依存

**型レベルの擬似循環が1つのみ（ランタイム問題なし）:**
```
types/player.ts ──import type──> object/knowledge.ts
                                      │
                                      └──import type──> types/object.ts
                                                             │
                                                             └──import type──> types/player.ts
```
全て `import type` のため TypeScript が正常に解決する。

---

## 3. コアモジュール詳細

### 3.1 z/ — 基盤ユーティリティ（9ファイル）

| ファイル | 主要エクスポート | 役割 |
|----------|------------------|------|
| `rand.ts` | `RNG`, `randomValue`, `randcalc`, `damcalc`, `mBonus` | WELL1024a 乱数生成器 |
| `bitflag.ts` | `BitFlag`, `FLAG_END`, `flagSize` | 可変長ビットフラグ |
| `dice.ts` | `Dice` | NdS+B ダイスロール |
| `expression.ts` | `Expression`, `ExpressionError` | データ駆動式計算式 |
| `color.ts` | `COLOUR_*` (29定数), `angbandColorTable` | Angband カラーシステム |
| `type.ts` | `Loc`, `loc`, `locSum`, `PointSet`, `Grouper` | 2D座標, 集合, グループ化 |
| `queue.ts` | `Queue`, `PriorityQueue` | 汎用キュー |
| `quark.ts` | `QuarkStore`, `QuarkId` | 文字列インターン |

### 3.2 types/ — 型定義（5ファイル）

| ファイル | 主要型 | 概要 |
|----------|--------|------|
| `cave.ts` | `Chunk`, `Square`, `Heatmap`, `FeatureType`, `Feat` | ダンジョン構造 |
| `monster.ts` | `Monster`, `MonsterRace`, `MonsterBlow`, `MonsterLore` | モンスターデータ (hearing, smell, shapes, heldObjIdx, mimickedObjIdx, minRange, bestRange含む) |
| `player.ts` | `Player`, `PlayerRace`, `PlayerClass`, `PlayerState` | プレイヤーデータ |
| `object.ts` | `ObjectType`, `ObjectKind`, `Artifact`, `EgoItem`, `Brand`, `Slay` | アイテムデータ |
| `option.ts` | `OptionCategory`, `OptionIndex` | ゲームオプション |

### 3.3 data/ — データローダー（9ファイル）

| ファイル | 役割 | 状態 |
|----------|------|------|
| `parser.ts` | 汎用テキストパーサー | COMPLETE |
| `loader.ts` | blow_methods/effects/object_bases テキスト読込 | COMPLETE |
| `registry.ts` | `GameData` 中央レジストリ | COMPLETE |
| `monster-loader.ts` | monster.json/monster_base.json → MonsterRace[] | PARTIAL (spell data未パース) |
| `object-loader.ts` | object/brand/slay/artifact/ego_item/object_base JSON | PARTIAL (activation/effect未パース — null固定) |
| `vault-loader.ts` | vault.json → VaultTemplate[] | COMPLETE |
| `pit-loader.ts` | pit.json → PitDefinition[] | COMPLETE |
| `dungeon-profile-loader.ts` | dungeon_profile.json → DungeonProfile[] | COMPLETE |

### 3.4 cave/ — ダンジョングリッド（7ファイル）

| ファイル | 役割 | 状態 |
|----------|------|------|
| `chunk.ts` | Chunk生成/検証/アクセス | COMPLETE |
| `square.ts` | Square操作/述語/フラグ | COMPLETE |
| `features.ts` | 地形タイプ定義/登録 | COMPLETE |
| `view.ts` | FOV計算（Symmetric Shadowcasting） | COMPLETE |
| `heatmap.ts` | 音/匂いBFS伝播 | COMPLETE |
| `pathfind.ts` | A*経路探索 | COMPLETE |

### 3.5 object/ — アイテムシステム（9ファイル）

| ファイル | 役割 | 状態 |
|----------|------|------|
| `gear.ts` | インベントリ/装備管理 | COMPLETE |
| `desc.ts` | アイテム名生成 | PARTIAL (flavor未対応) |
| `pile.ts` | オブジェクトパイル（地面上アイテム） | COMPLETE |
| `slays.ts` | スレイ/ブランド倍率計算 | COMPLETE |
| `knowledge.ts` | ルーン鑑定システム | PARTIAL (C版`known`オブジェクトコピーとは異なるSet\<string\>簡易設計) |
| `make.ts` | アイテム生成（apply_magic簡易版） | PARTIAL |
| `power.ts` | アイテムパワー計算 | COMPLETE |
| `properties.ts` | オブジェクトプロパティ述語 | COMPLETE |

### 3.6 player/ — プレイヤーシステム（6ファイル）

| ファイル | 役割 | 状態 |
|----------|------|------|
| `birth.ts` | キャラクター作成 | PARTIAL (body簡易版, 初期装備なし) |
| `calcs.ts` | ステータス計算 (AC, speed, blows) | PARTIAL (blows固定値) |
| `timed.ts` | 時限効果 (毒, 加速, 盲目...) | COMPLETE |
| `spell.ts` | 呪文管理/詠唱 | COMPLETE |
| `util.ts` | LOS, 経験値テーブル, フラグ判定 | COMPLETE |

### 3.7 monster/ — モンスターAI（8ファイル）

| ファイル | 役割 | 状態 |
|----------|------|------|
| `make.ts` | モンスター生成/配置 | COMPLETE |
| `move.ts` | AI行動決定/移動 | PARTIAL (MOVE_BODY/KILL_BODY未実装) |
| `attack.ts` | 近接攻撃解決 | PARTIAL (6 blow effect スタブ) |
| `spell.ts` | 呪文選択/ダメージ計算 | PARTIAL (状態異常未適用) |
| `death.ts` | 死亡時ドロップ | COMPLETE |
| `lore.ts` | モンスター知識蓄積 | COMPLETE |
| `timed.ts` | モンスター時限効果 | COMPLETE |

### 3.8 effect/ — エフェクトシステム（4ファイル）

| ファイル | 役割 | 状態 |
|----------|------|------|
| `handler.ts` | エフェクト登録/ディスパッチ | COMPLETE |
| `attack.ts` | 攻撃系エフェクト (bolt, ball, breath) | COMPLETE |
| `general.ts` | 一般エフェクト (heal, teleport, detect) | PARTIAL (11スタブ, 73未登録) |

### 3.9 command/ — コマンド（6ファイル）

| ファイル | 役割 | 状態 |
|----------|------|------|
| `core.ts` | ディスパッチャ/型定義 | COMPLETE |
| `movement.ts` | 移動/ドア/トンネル/階段 | COMPLETE |
| `combat.ts` | 近接/射撃/投擲 | PARTIAL (投擲の着地/破損未実装) |
| `item.ts` | アイテム使用/拾う/落とす/装備 | COMPLETE |
| `magic.ts` | 魔法詠唱/学習 | COMPLETE |

### 3.10 generate/ — ダンジョン生成（7ファイル）

| ファイル | 役割 | 状態 |
|----------|------|------|
| `generate.ts` | メイン生成エントリ | PARTIAL (プロファイル未接続, リトライなし) |
| `room.ts` | 部屋生成 (6タイプ + vault + pit/nest) | PARTIAL (vault実体配置未完了) |
| `tunnel.ts` | 通路掘削 | COMPLETE |
| `populate.ts` | モンスター/オブジェクト/階段/罠配置 | COMPLETE |
| `town.ts` | 町マップ生成 | PARTIAL (depth=0未接続, 店UI未連携) |
| `test-helpers.ts` | テスト用ヘルパー | COMPLETE |

### 3.11 game/ — ゲームループ（5ファイル）

| ファイル | 役割 | 状態 |
|----------|------|------|
| `event.ts` | EventBus (同期pub/sub) | COMPLETE |
| `state.ts` | GameState インターフェース | COMPLETE |
| `input.ts` | InputProvider インターフェース | COMPLETE |
| `world.ts` | メインゲームループ | PARTIAL (自然生成空, cleanup未完全) |

### 3.12 store/ — ショップ（2ファイル）

| ファイル | 役割 | 状態 |
|----------|------|------|
| `store.ts` | 店ロジック/在庫/売買 | COMPLETE |

### 3.13 save/ — セーブ/ロード（3ファイル）

| ファイル | 役割 | 状態 |
|----------|------|------|
| `save.ts` | シリアライズ → JSON | COMPLETE |
| `load.ts` | デシリアライズ ← JSON | PARTIAL (race/classプレースホルダー) |

---

## 4. Web レイヤー

### @angband/renderer（3ファイル）

| ファイル | 役割 |
|----------|------|
| `terminal.ts` | 仮想文字グリッド（dirty cell tracking） |
| `display.ts` | マップ/サイドバー/メッセージ/ステータス描画 |
| `textblock.ts` | 色付きテキストブロック |

### @angband/web（7ファイル）

| ファイル | 役割 |
|----------|------|
| `main.ts` | エントリポイント: Canvas初期化, JSON並列ロード, セーブ確認, キャラ作成, ゲーム開始 |
| `game-bridge.ts` | CommandInputProvider実装: ゲームループ ⇔ UI ブリッジ, キー入力→コマンド変換, Canvas描画, インベントリ/呪文メニュー, ターゲティング, パニックセーブ |
| `keyboard-input.ts` | InputProvider実装: DOM keydown → 方向/コマンド変換, VIキー/矢印/テンキー対応 |
| `canvas-renderer.ts` | HTML Canvas描画: dirty cell のみ再描画, monospace font |
| `terminal.ts` | 80x24文字グリッド: putChar/putString/clear |
| `birth-screen.ts` | キャラ作成UI: タイトル → 種族 → 職業 → 名前入力 |
| `color-palette.ts` | Angband COLOUR_* → CSS hex マッピング |

---

## 5. データフロー

### 5.1 起動シーケンス

```
main.ts
  ├─ setupCanvas()
  ├─ buildDefaultFeatureInfo()
  ├─ 並列fetch: p_race, class, monster, monster_base,
  │              object, object_base, brand, slay, artifact, ego_item
  ├─ parseMonsterBases() → parseMonsterRaces()
  ├─ parseObjectBases() → parseObjectKinds() / parseBrands() / parseSlays() /
  │                        parseArtifacts() / parseEgoItems()
  ├─ RNG.stateInit(Date.now())
  ├─ セーブチェック → 続行 or キャラ作成
  ├─ createPlayer(name, race, class, rng)
  ├─ generateDungeon(depth, config, rng, races, kinds)
  ├─ createGameState(player, chunk, rng, races, kinds, ...)
  └─ GameBridge.start() → runGameLoop(state, this)
```

### 5.2 ゲームループ（1ターン）

```
runGameLoop:
  1. updateView(chunk, player.grid)      ← FOV更新
  2. updateNoise/updateScent             ← ヒートマップ更新
  3. eventBus.emit(REFRESH)              ← UI描画トリガー
  4. processPlayer(state, input)         ← プレイヤー入力→コマンド実行
     └─ await input.getCommand()         ← 非同期キー入力待ち
     └─ executeCommand(cmd, player, chunk, rng)
     └─ processDeadMonsters(state)       ← 死亡モンスター処理
  5. processMonsters(state, monsters)    ← 全モンスターAI行動
     └─ monsterTakeTurn() → move/attack/spell/idle
     └─ monsterAttackPlayer()            ← 近接攻撃解決
     └─ monsterCastSpell()               ← 呪文解決
  6. processWorld(state)                 ← HP/MP再生, 空腹, 毒, 出血, 時限効果
  7. player.energy += turnEnergy(speed)  ← エネルギー付与
  8. state.turn++                        ← ターンカウンタ
  9. checkLevelChange(state)             ← 階段→レベル遷移
```

### 5.3 コマンド入力フロー

```
GameBridge.getCommand()
  └─ waitForKey()                     ← Promise<void>（keydown待ち）
  └─ input.consumeDirection()         ← 方向キー？
      ├─ pendingDirectionCmd あり → {type: OPEN/CLOSE/TUNNEL, direction}
      └─ なし → {type: WALK, direction}
  └─ input.consumeCommand()           ← コマンドキー？
      ├─ "open/close/tunnel/disarm" → pendingDirectionCmd設定 → 再ループ
      ├─ "inventory/equipment"       → 画面表示 → 再ループ
      ├─ "quaff/eat/read/zap/aim"    → selectInventoryItem() → コマンド
      ├─ "cast/pray"                 → selectSpell() → waitForDirection() → コマンド
      ├─ "fire"                      → waitForTarget() → コマンド
      ├─ "throw"                     → selectInventoryItem() → waitForTarget() → コマンド
      └─ "go_up/go_down/search/rest/pickup" → 即座にコマンド
```

---

## 6. 現在のギャップ一覧

### 6.1 エフェクトハンドラ

| 分類 | 数 |
|------|-----|
| 登録済み＋実動作 | 35 |
| 登録済み＋スタブ | 11 |
| 未登録 | 73 |
| **合計 EffectType** | **119** |

主要スタブ: TELEPORT（地形チェック未実施）, IDENTIFY（ルーンシステム未接続）, ENCHANT/RECHARGE（メッセージのみ）, SUMMON/BANISH（モンスター操作なし）, GLYPH（地形変更なし）, CONFUSE/SLEEP（対象効果なし）

### 6.2 モンスター呪文

- `spellFlags` / `freqInnate` / `spellPower` が常に 0/empty（monster-loader.ts でパース未実装）
- `monsterCastSpell()` はダメージ計算のみ。状態異常・召喚・回復は未適用
- game/world.ts のAIループには接続済みだが、データがないため実質機能しない

### 6.3 戦闘

- 投擲: 着地/破損/拾い直しなし
- 盾バッシュ: 未実装
- `visible` フラグ: 常に `true`（盲目時の命中率未反映）

### 6.4 ダンジョン生成

- プロファイル: ローダー完成、generate.ts 未接続（ハードコード設定のみ）
- Vault: ローダー完成、room.ts でASCIIテンプレート描画済み、**エンティティ配置未実装**
- Pit/Nest: ローダー完成、room.ts にジェネレータ存在、**generate.ts 未接続**
- 町: generateTown() 存在、**depth=0 ルーティング未接続**
- リトライ: なし（C版は最大100回再試行）
- レベル感覚: フィールド存在、計算なし

### 6.5 ショップ・町

- store.ts コアロジック完成
- ショップUI: 未実装
- 町マップ → ゲーム起動: 未接続

### 6.6 モンスターAI・行動

- **個別ヒートマップ**: C版は各モンスターに個別のflow/pathデータ（`monster->flow`）を持つが、TS版はChunk全体の音/匂いヒートマップのみ
- **モンスターHP再生**: TS版は100ターンごとに1/8回復（簡易実装）。C版は毎ターン分数蓄積（プレイヤーと同様のfractional方式）
- **モンスター変身（shape-shifting）**: Monster型に`shapes`/`numShapes`/`originalRace`フィールドは存在するが、変身ロジックは未実装

### 6.7 save/load

- race/class がプレースホルダー復元（ロード後に正しいデータが欠落）
- パニックセーブ: beforeunload ハンドラ実装済み
- キャラクターダンプ/ハイスコア: 未実装

### 6.8 UI

- ターゲティングモード: 実装済み（カーソル移動式）
- 投射ビジュアル: 未実装（イベントは emit されない）
- マルチウィンドウ: 未実装
- キーマップモード切替: 未実装
- マウス/サウンド: 未実装

---

## 7. 作業分担表（Work Packages）

各 WP は独立して着手可能（前提WPの完了を待つ必要がある場合は明記）。
**推定規模**: S (< 100行), M (100-300行), L (300-800行), XL (800行+)

---

### WP-A: モンスター呪文データ接続 [M]

**担当範囲**: `data/monster-loader.ts`, `monster/move.ts`
**前提**: なし

| タスク | 詳細 |
|--------|------|
| A1 | `monster-loader.ts`: `spell-freq` フィールドをパースし `freqInnate`/`freqSpell` に設定 (`1_in_N` 形式) |
| A2 | `monster-loader.ts`: `spells` 配列 → `spellFlags` BitFlag マッピング (SPELL_FLAG_MAP 定義) |
| A3 | `monster-loader.ts`: `spellPower` = monster level として設定 |
| A4 | `monster/move.ts`: monsterTakeTurn() で `freqInnate`/`freqSpell` 確率判定追加 |

**検証**: モンスターが呪文を実際に使用する（ログにスペル名が表示される）

---

### WP-B: エフェクトハンドラ完成 [XL]

**担当範囲**: `effect/general.ts`, `effect/attack.ts`, 新規 `effect/monster.ts`
**前提**: なし（独立作業可能）

| タスク | 詳細 |
|--------|------|
| B1 | スタブ11件の実装完了 (TELEPORT地形チェック, IDENTIFY→knowledge接続, ENCHANT実装, RECHARGE実装, SUMMON→monster/make接続, BANISH→monster削除, GLYPH→地形変更, CONFUSE/SLEEP→monster timed, DRAIN_LIGHT→light減少) |
| B2 | 未登録73件から**優先30件**を実装: TELEPORT_TO, TELEPORT_LEVEL, DETECT_STAIRS, DETECT_LIVING_MONSTERS, DETECT_INVISIBLE_MONSTERS, DETECT_EVIL, PROJECT_LOS, PROJECT_LOS_AWARE, ACQUIRE, RUBBLE, GRANITE, ARC, SHORT_BEAM, LASH, BOLT_OR_BEAM, LINE, TOUCH, BRAND_WEAPON, BRAND_AMMO, CREATE_ARROWS, DRAIN_LIFE(登録), TURN_UNDEAD, DEEP_DESCENT, SCRAMBLE/UNSCRAMBLE_STATS, ENCHANT_WEAPON, ENCHANT_ARMOR, REMOVE_CURSE(実装), RANDOM, TAP_DEVICE |
| B3 | `monsterCastSpell()` の返却結果をゲームループで適用: 状態異常 → `incTimedEffect()`, 召喚 → `placeNewMonster()` |

**検証**: ポーションを飲む / 杖を振る / 巻物を読む → 実際にゲーム状態が変化する

---

### WP-C: ダンジョン生成強化 [L]

**担当範囲**: `generate/generate.ts`, `generate/room.ts`
**前提**: なし

| タスク | 詳細 |
|--------|------|
| C1 | `generate.ts`: `dungeon-profile-loader` のプロファイルを接続。深度別の部屋数/モンスター密度/トンネル設定 |
| C2 | `generate.ts`: 生成リトライ（最大100回、C版準拠） |
| C3 | `room.ts`: `generateVaultRoom()` 第2パス実装（`9`→モンスター、`&`→アーティファクト、`*`→アイテム配置） |
| C4 | `generate.ts`: `generatePitRoom()`/`generateNestRoom()` を部屋選択テーブルに追加 |
| C5 | `generate.ts`: レベル感覚計算（`chunk.feeling` = obj_rating + mon_rating 合算） |

**検証**: 深層でvault/pit部屋が出現する。レベル感覚メッセージが表示される

---

### WP-D: 町・ショップUI [L]

**担当範囲**: `generate/generate.ts`, `web/src/game-bridge.ts`, 新規 `web/src/store-screen.ts`
**前提**: なし

| タスク | 詳細 |
|--------|------|
| D1 | `generate/generate.ts`: depth===0 で `generateTown()` を呼び出す分岐追加 |
| D2 | `web/src/main.ts`: 新規ゲーム開始を depth=0 に変更 |
| D3 | 新規 `web/src/store-screen.ts`: テキストベース売買画面（商品リスト、購入/売却、ESCで退出） |
| D4 | `web/src/game-bridge.ts`: 店タイル上で Enter → ショップ画面起動 |
| D5 | `player/birth.ts`: class.json の `start-items` → インベントリ初期装備追加 |

**検証**: ゲーム開始→町画面→店に入る→アイテム購入→ダンジョンへ降りる

---

### WP-E: 投射ビジュアル・エフェクト [M]

**担当範囲**: `project/project.ts`, `web/src/game-bridge.ts`
**前提**: なし

| タスク | 詳細 |
|--------|------|
| E1 | `project/project.ts`: BOLT/BALL/BEAM/BREATH 投射時に EventBus でセル毎イベント emit |
| E2 | `web/src/game-bridge.ts`: イベント受信→Canvas上でフラッシュアニメーション（`*` 文字を色付きで短時間表示） |
| E3 | ball/breath の範囲を同時にハイライト表示 |

**検証**: 魔法/射撃が視覚的にパス上を飛んでいくのが見える

---

### WP-F: モンスター blow エフェクト完成 [S]

**担当範囲**: `monster/attack.ts`
**前提**: なし

| タスク | 詳細 |
|--------|------|
| F1 | DRAIN_CHARGES: 杖/ワンドからチャージ吸収（インベントリ検索→charges減少） |
| F2 | EAT_GOLD: ゴールド減少 + "Your purse feels lighter!" |
| F3 | EAT_ITEM: インベントリからランダムにアイテム1つ消費 |
| F4 | EAT_FOOD: 食料アイテム消費 |
| F5 | EAT_LIGHT: 光源の燃料/チャージ減少 |
| F6 | SHATTER: 周囲地形破壊（GRANITE→FLOOR） |

**検証**: 各 blow method のモンスターに殴られて対応する効果が発生する

---

### WP-G: FOV・視覚強化 [M]

**担当範囲**: `cave/view.ts`, `monster/move.ts`, `web/src/game-bridge.ts`
**前提**: なし

| タスク | 詳細 |
|--------|------|
| G1 | `cave/view.ts`: BLIND状態→全グリッド非表示（remembered地形のみ） |
| G2 | `cave/view.ts`: 赤外線視覚→暗闇でも温血モンスター可視 |
| G3 | `game-bridge.ts`: BLIND表示モード（全マス暗転、既知地形のみ薄く表示） |

**検証**: 盲目ポーション→画面が暗転→赤外線で近くのモンスターだけ見える

---

### WP-H: save/load 完全化 [M]

**担当範囲**: `save/load.ts`, `web/src/main.ts`
**前提**: なし

| タスク | 詳細 |
|--------|------|
| H1 | `load.ts`: ロード時に `monsterRaces` / `objectKinds` から正しい race/class を lookup（プレースホルダー廃止） |
| H2 | `load.ts`: セーブデータバージョン移行フレームワーク（古いバージョン→新フォーマット変換） |
| H3 | `save.ts`: オブジェクトのシリアライズ完成（kindIdx, egoIdx, art_idx 保存） |
| H4 | キャラクターダンプ（テキスト出力: ステータス/装備/キル数/深度） |

**検証**: セーブ→ブラウザ再起動→ロード→装備/インベントリが完全復元

---

### WP-I: プレイヤー計算修正 [S]

**担当範囲**: `player/calcs.ts`, `player/birth.ts`
**前提**: なし

| タスク | 詳細 |
|--------|------|
| I1 | `calcs.ts`: `calcBlows()` を装備武器の重量/クラスに基づく正しい計算に修正（現在は固定100） |
| I2 | `birth.ts`: `createDefaultBody()` で装備スロットを正しく初期化（現在は空配列） |
| I3 | `calcs.ts`: `calcBonuses()` をゲームループの cleanup で毎ターン呼び出し |

**検証**: 重い武器 → blows減少、軽い武器 → blows増加

---

### WP-J: 未実装ゲームループ処理 [M]

**担当範囲**: `game/world.ts`
**前提**: WP-A（モンスター呪文データ）推奨

| タスク | 詳細 |
|--------|------|
| J1 | モンスター自然生成: depth×2+10 ターンごとにランダム1体配置 |
| J2 | オブジェクトタイムアウト: 杖チャージ回復、松明燃料消費 |
| J3 | `process_player_cleanup()`: 毎ターン `calcBonuses()` 再計算 |
| J4 | `reset_monsters()`: MFLAG_HANDLED クリア |
| J5 | モンスター HP 再生周期修正（REGENERATE フラグ持ちは50ターン周期） |

**検証**: 長時間同じ階に滞在→新モンスターが出現する

---

### WP-K: コマンドリピート＆キーマップ [S]

**担当範囲**: `game/world.ts`, `web/src/game-bridge.ts`, `web/src/keyboard-input.ts`
**前提**: なし

| タスク | 詳細 |
|--------|------|
| K1 | 数字プレフィックス入力 (例: `5s` = search 5回) |
| K2 | リピート中断条件（モンスター発見、ダメージ受信、新メッセージ） |
| K3 | Roguelike キーマップモード（hjkl移動、yubn斜め移動の別解釈） |

**検証**: `99s` 入力→99回検索が自動実行→モンスター発見で中断

---

## 8. 依存関係・着手順序

```
独立（即座に着手可能）:
  WP-A (モンスター呪文データ)
  WP-B (エフェクトハンドラ)
  WP-C (ダンジョン生成)
  WP-D (町・ショップ)
  WP-E (投射ビジュアル)
  WP-F (blow エフェクト)
  WP-G (FOV強化)
  WP-H (save/load)
  WP-I (プレイヤー計算)
  WP-K (リピート・キーマップ)

依存あり:
  WP-J (ゲームループ) ← WP-A 推奨（呪文データがないとJ1が不完全）

推奨着手順:
  1st wave: WP-A, WP-C, WP-D, WP-F, WP-I （基盤修正）
  2nd wave: WP-B, WP-G, WP-H, WP-J      （システム完成）
  3rd wave: WP-E, WP-K                    （ポリッシュ）
```

### 4名分担例

| 担当 | WP | 推定作業量 |
|------|-----|-----------|
| Agent 1 | WP-B (エフェクト XL) + WP-F (blow S) | 大 |
| Agent 2 | WP-C (生成 L) + WP-D (町 L) | 大 |
| Agent 3 | WP-A (呪文データ M) + WP-J (ループ M) + WP-I (計算 S) | 中 |
| Agent 4 | WP-G (FOV M) + WP-H (save M) + WP-E (ビジュアル M) | 中 |

残り WP-K (S) は最初に終わった担当が拾う。

### 2名分担例

| 担当 | WP |
|------|-----|
| Agent 1 (コア) | WP-A + WP-B + WP-F + WP-I + WP-J |
| Agent 2 (UI/生成) | WP-C + WP-D + WP-E + WP-G + WP-H + WP-K |

---

## 9. 意図的に延期する項目

| 項目 | 理由 |
|------|------|
| ランダムアーティファクト (`obj-randart.c`) | 極めて複雑な生成アルゴリズム |
| アイテム無視/スケルチ (`obj-ignore.c`) | QoL機能、コア不要 |
| マルチウィンドウUI | UIアーキテクチャ根本変更 |
| マウス/サウンド | 低優先度 |
| 永続レベル | レベルキャッシュシステム必要 |
| グループAI | 複雑な協調行動 |
| ハイスコアテーブル | cosmetic |
| ウィザードモード | デバッグ用 |
| SMART AI (`known_pstate`) | 高度AI、低優先度 |
| `project_obj` (投射→オブジェクト破壊) | ニッチ機能 |
| モンスター変身 (`mon-shape.c`) | 型フィールド存在するがロジック複雑 |
| 個別モンスターヒートマップ (`monster->flow`) | 現行BFS音/匂いで十分機能 |

---

## 10. テスト方針

| レベル | 対象 | 現状 |
|--------|------|------|
| ユニットテスト | 各モジュール関数 | 1,443テスト / 58ファイル（全パス） |
| 統合テスト | コマンド→状態変化 | combat.test.ts, world.test.ts で部分カバー |
| E2Eテスト | ブラウザ操作→ゲーム進行 | **未実装** |

各WP完了時の検証:
1. `npm run build` — 型エラー 0
2. `npm test` — 全テスト パス（新テスト追加推奨）
3. ブラウザ手動確認 — 該当機能の動作確認

---

## 11. 設計原則

1. **純粋関数優先**: コマンドは `CommandResult` を返す。副作用は呼び出し側で適用
2. **型安全**: branded type ID（`MonsterId`, `ObjectKindId`等）で型混同を防止
3. **イベント駆動UI**: core → EventBus → web。core は DOM を知らない
4. **データ駆動**: ゲームデータは JSON、ロジックは TypeScript。新モンスター追加 = JSON 編集のみ
5. **C版忠実移植**: 関数名・変数名は C版に準拠（`cmdWalk` ← `do_cmd_walk`、`resolveBlowEffect` ← `monster_blow_effect`）
6. **テスト必須**: 新機能には必ずテスト追加。SKIP = FAIL
