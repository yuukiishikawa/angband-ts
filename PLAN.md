# Angband TypeScript移植計画（7ステップ）

本家C版Angband（205,536行 / 235ファイル）をTypeScriptに移植するマスタープラン。

## 現状: 全7ステップ完了 (2026-02-27)

**全ステップ完了。** 28,583ソース行 + 23,380テスト行 = 51,963行。
1,441テスト全通過。typecheck 0エラー。Web UIでプレイ可能。

---

## Step 1: 基盤完成 — 型定義 + データ構造

**目的**: ゲーム全体で使う型（Player, Monster, Object, Cave）を定義し、
上位モジュールが依存する土台を固める。

**対象ファイル（C）**:
- `player.h` — プレイヤー構造体
- `monster.h` — モンスター構造体
- `object.h` — アイテム/装備構造体
- `cave.h` — ダンジョン構造体（chunk, square）
- `option.h` — ゲームオプション
- `z-type.h` 追加分 — 型ユーティリティ補完

**成果物（TS）**:
```
packages/@angband/core/src/types/
  player.ts       — Player, PlayerRace, PlayerClass, PlayerState
  monster.ts      — Monster, MonsterRace, MonsterLore
  object.ts       — Object, ObjectKind, EgoItem, Artifact
  cave.ts         — Chunk, Square, FeatureType
  option.ts       — GameOptions
  index.ts        — barrel export
```

**判断基準**:
- z-layer不足分（z-form, z-util, z-virt, z-file, z-textblock）はTSでは不要。
  - z-form → template literal / string interpolation
  - z-util → JS標準ライブラリで代替
  - z-virt → GC言語なので不要
  - z-file → Node fs / Web File API（レイヤー分離で後回し）
  - z-textblock → Step 7（UI）で実装
- C構造体の「ポインタ」→ TS「ID参照 or オブジェクト参照」に変換

**推定規模**: ~2,000行（型定義 + テスト）

---

## Step 2: データパイプライン — Parser + Gamedata Loader

**目的**: 46個のゲームデータファイル（monster.txt, object.txt等 計2.3MB）を
パースしてTypeScriptオブジェクトに変換する。

**対象ファイル（C）**:
- `parser.c` / `parser.h` (1,200行) — 汎用テキストパーサー
- `datafile.c` / `datafile.h` (500行) — ファイル読み込み
- `init.c` (4,558行) — 初期化・データロード統合

**成果物（TS）**:
```
packages/@angband/core/src/data/
  parser.ts        — Angbandテキストフォーマットパーサー
  parser.test.ts
  loader.ts        — データファイルローダー
  loader.test.ts
  registry.ts      — 全データの中央レジストリ
  index.ts

tools/data-converter/
  convert.ts       — .txt → .json 変換ツール（ビルド時実行）
  schemas/         — JSONスキーマ定義

packages/@angband/core/gamedata/
  *.json           — 変換済みゲームデータ
```

**方針**:
- 2段構成: (A) ビルド時にtxt→JSON変換、(B) ランタイムでJSONロード
- ランタイムパーサーも実装（modding対応）
- `init.c`の初期化順序を忠実に再現

**主要データファイル（優先度順）**:

| ファイル | サイズ | 内容 |
|---------|--------|------|
| monster.txt | 287KB | モンスター420種 |
| room_template.txt | 161KB | 部屋テンプレート100+ |
| vault.txt | 101KB | ヴォールト80+ |
| object.txt | 84KB | アイテム400種 |
| artifact.txt | 61KB | アーティファクト100+ |
| class.txt | 48KB | プレイヤークラス10種 |
| monster_spell.txt | 33KB | モンスター魔法150+ |
| ego_item.txt | 24KB | エゴアイテム150+ |
| その他30+ファイル | — | 種族、店、地形、効果等 |

**推定規模**: ~3,000行（パーサー + 変換ツール + テスト）

---

## Step 3: 洞窟 & マップシステム — FOV, 移動, 地形

**目的**: ダンジョンの空間表現、視界計算、経路探索を実装。
ローグライクの根幹。

**対象ファイル（C）**:
- `cave.c` (1,500行) — マップ操作
- `cave-map.c` (1,000行) — 視界・照明計算
- `cave-square.c` (1,000行) — マス目操作
- `cave-view.c` (800行) — FOV（Field of View）

**成果物（TS）**:
```
packages/@angband/core/src/cave/
  chunk.ts         — Chunk（ダンジョン階層）管理
  square.ts        — Square操作（地形判定、フラグ操作）
  map.ts           — マップ更新・照明
  view.ts          — FOV計算（shadowcasting）
  pathfind.ts      — A*経路探索
  cave.test.ts     — 統合テスト
  index.ts
```

**技術的注意点**:
- FOVアルゴリズム: Angbandのshadowcasting実装を忠実移植
- パフォーマンス: TypedArray（Int8Array等）でマップグリッド表現
- 座標系: Step 1のLoc型を活用

**推定規模**: ~3,500行

---

## Step 4: エンティティシステム — Player, Monster, Object

**目的**: ゲーム3大エンティティの生成・管理・相互作用を実装。

### 4a: プレイヤーシステム
**対象（C）**: player.c, player-birth.c, player-calcs.c, player-timed.c, player-util.c 等（22ファイル, 12,764行）

```
packages/@angband/core/src/player/
  birth.ts         — キャラクター作成
  calcs.ts         — ステータス計算（装備補正、レベル補正）
  timed.ts         — 時限効果（毒、加速、透明視等）
  spell.ts         — 魔法習得・詠唱
  util.ts          — ユーティリティ
  index.ts
```

### 4b: モンスターシステム
**対象（C）**: mon-attack.c, mon-blow-effects.c, mon-blow-methods.c, mon-init.c, mon-list.c, mon-lore.c, mon-make.c, mon-move.c, mon-msg.c, mon-spell.c, mon-timed.c, mon-util.c 等（30ファイル, 16,351行）

```
packages/@angband/core/src/monster/
  make.ts          — モンスター生成・配置
  move.ts          — 移動AI（経路探索利用）
  attack.ts        — 近接攻撃
  spell.ts         — 魔法攻撃
  lore.ts          — モンスター知識（図鑑）
  timed.ts         — 時限状態（混乱、恐怖等）
  index.ts
```

### 4c: オブジェクトシステム
**対象（C）**: obj-chest.c, obj-desc.c, obj-gear.c, obj-ignore.c, obj-info.c, obj-init.c, obj-knowledge.c, obj-list.c, obj-make.c, obj-pile.c, obj-power.c, obj-properties.c, obj-slays.c, obj-tval.c, obj-util.c 等（34ファイル, 23,913行）

```
packages/@angband/core/src/object/
  make.ts          — アイテム生成（レベル適正ドロップ）
  desc.ts          — アイテム名生成（「燃える長剣」等）
  gear.ts          — 装備管理
  properties.ts    — アイテム属性・スレイ・耐性
  pile.ts          — アイテムの山（フロア、インベントリ）
  power.ts         — アイテムパワー計算
  index.ts
```

**推定規模**: ~12,000行（3システム合計）

---

## Step 5: ゲームメカニクス — コマンド, 効果, 戦闘

**目的**: プレイヤーの行動（移動、攻撃、魔法等）と
ゲーム効果（ダメージ、状態異常、投射等）を実装。

**対象ファイル（C）**:
- `cmd-core.c`, `cmd-cave.c`, `cmd-misc.c`, `cmd-obj.c`, `cmd-pickup.c` 等（8ファイル, ~2,500行）
- `effect-handler-attack.c`, `effect-handler-general.c` (3,646行)
- `project.c`, `project-feat.c`, `project-mon.c`, `project-obj.c`, `project-player.c`（5ファイル, ~5,000行）
- `trap.c`（罠システム）

**成果物（TS）**:
```
packages/@angband/core/src/command/
  core.ts          — コマンドディスパッチャー
  movement.ts      — 移動・探索
  combat.ts        — 近接・射撃戦闘
  magic.ts         — 魔法詠唱
  item.ts          — アイテム使用・装備
  index.ts

packages/@angband/core/src/effect/
  handler.ts       — 効果ハンドラー統合
  attack.ts        — 攻撃系効果
  general.ts       — 汎用効果（回復、テレポート等）
  index.ts

packages/@angband/core/src/project/
  project.ts       — 投射計算（ボール、ブレス、ビーム）
  feat.ts          — 地形への影響
  monster.ts       — モンスターへの影響
  player.ts        — プレイヤーへの影響
  index.ts
```

**推定規模**: ~8,000行

---

## Step 6: ワールドシミュレーション — ゲームループ, ダンジョン生成, セーブ/ロード

**目的**: ゲーム全体の進行管理。ターン処理、階層生成、永続化。

**対象ファイル（C）**:
- `game-world.c` — メインゲームループ
- `game-input.c` — 入力抽象化
- `game-event.c` — イベントシステム
- `generate.c`, `gen-cave.c`, `gen-chunk.c`, `gen-monster.c`, `gen-room.c`, `gen-util.c`（6ファイル, 7,600行）
- `save.c`, `load.c`（セーブ/ロード）
- `score.c`（スコア管理）
- `store.c`（店システム）
- `target.c`（ターゲティング）

**成果物（TS）**:
```
packages/@angband/core/src/game/
  world.ts         — ゲームループ（ターン処理）
  input.ts         — 入力抽象化（UIから分離）
  event.ts         — イベントバス（Observer pattern）
  state.ts         — ゲーム状態管理
  index.ts

packages/@angband/core/src/generate/
  generate.ts      — ダンジョン生成エントリーポイント
  cave.ts          — 洞窟タイプ別生成
  room.ts          — 部屋生成
  monster.ts       — モンスター配置
  object.ts        — アイテム配置
  vault.ts         — ヴォールト配置
  index.ts

packages/@angband/core/src/save/
  save.ts          — セーブ（JSON形式）
  load.ts          — ロード
  index.ts

packages/@angband/core/src/store/
  store.ts         — 店の在庫・売買
  index.ts
```

**方針**:
- ゲームループはasync/awaitベース（UIの非同期入力に対応）
- イベントシステムでcore⇔UI疎結合
- セーブはJSON（Cのバイナリ形式とは非互換）
- ダンジョン生成は忠実移植（Angbandの生成アルゴリズムはゲーム性の核）

**推定規模**: ~10,000行

---

## Step 7: レンダリング & UI — Webフロントエンド

**目的**: ブラウザで遊べるAngbandを完成させる。

**対象（C参考）**: ui-*.c（79ファイル, 46,648行）— ただしターミナルUIなので参考程度

**成果物（TS）**:
```
packages/@angband/renderer/
  src/
    terminal.ts    — 仮想ターミナルグリッド
    textblock.ts   — テキストブロック（z-textblock代替）
    theme.ts       — カラーテーマ
    index.ts

packages/@angband/web/
  src/
    App.tsx         — メインアプリ
    components/
      GameMap.tsx   — マップ描画（Canvas or DOM grid）
      Sidebar.tsx   — ステータス表示
      Messages.tsx  — メッセージログ
      Inventory.tsx — インベントリ画面
      CharSheet.tsx — キャラクターシート
    hooks/
      useGame.ts   — ゲームエンジン接続
      useInput.ts  — キーバインド処理
    index.html
    main.tsx
```

**方針**:
- `@angband/core` は純粋ロジック（DOM依存なし）
- `@angband/renderer` はターミナルグリッド抽象化
- `@angband/web` はReact/Preact + Canvas描画
- ASCII表示を基本とし、タイルセットは将来対応

**推定規模**: ~8,000行

---

## 全体サマリー

| Step | 内容 | 推定行数 | 依存 |
|------|------|---------|------|
| 0 (完了) | z-layer基盤 | 3,374行 | — |
| 1 | 型定義 + データ構造 | ~2,000行 | Step 0 |
| 2 | データパイプライン | ~3,000行 | Step 1 |
| 3 | 洞窟 & マップ | ~3,500行 | Step 1 |
| 4 | エンティティ (Player/Monster/Object) | ~12,000行 | Step 1,2,3 |
| 5 | ゲームメカニクス | ~8,000行 | Step 3,4 |
| 6 | ワールドシミュレーション | ~10,000行 | Step 4,5 |
| 7 | レンダリング & UI | ~8,000行 | Step 6 |
| **合計** | | **~50,000行** | |

**注**: C版205K行 → TS版~50K行の圧縮理由:
- C版UI層46K行の大半が不要（Web UIは別設計）
- Cのメモリ管理・文字列処理コードが不要
- TypeScriptの表現力（ジェネリクス、スプレッド等）
- 重複コード・プラットフォーム分岐の排除

---

## 移植原則

1. **忠実性**: ゲームロジックのアルゴリズムは本家C版に忠実
2. **型安全**: TypeScript strictモード最大、noUncheckedIndexedAccess有効
3. **テスト駆動**: 全モジュールにテスト。C版のテストケースも移植
4. **Core分離**: `@angband/core` はDOM/Node依存なし（純粋ロジック）
5. **データ駆動**: ゲームデータは外部ファイル（JSON）から読み込み
6. **漸進的**: 各Stepで動作するマイルストーン（Step 3後にFOVデモ等）
