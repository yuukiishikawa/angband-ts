# Angband ゲームフロー分析 & 実装状況

## 全体フロー

```
┌──────────────┐    ┌──────────────┐    ┌──────────────────┐
│  1. 起動     │───▶│  2. キャラ   │───▶│  3. 町（深度0）  │
│  タイトル画面│    │  作成        │    │  ショップ & 準備 │
└──────────────┘    └──────────────┘    └────────┬─────────┘
                                                 │
                                                 ▼
                    ┌───────────────────────────────────────────┐
                    │  4. メインゲームループ（各ターン）        │
                    │                                           │
                    │  4a. プレイヤーフェーズ                   │
                    │      エネルギー≥100 → コマンド入力 → 実行 │
                    │                                           │
                    │  4b. モンスターフェーズ                   │
                    │      各モンスター：AI判断 → 移動/攻撃     │
                    │                                           │
                    │  4c. ワールドフェーズ                     │
                    │      HP/MP回復、空腹、時限効果減少        │
                    │                                           │
                    │  4d. エネルギー付与 & ターン進行          │
                    └──┬─────────────┬────────────┬─────────────┘
                       │             │            │
                       ▼             ▼            ▼
                ┌──────────┐  ┌──────────┐  ┌──────────────┐
                │ 5. 階段  │  │ 6. 死亡  │  │ 7. 勝利     │
                │ 上下移動 │  │ 墓碑表示 │  │ Morgoth撃破 │
                │ 新レベル │  │ スコア   │  │ スコア      │
                │ 生成     │  │ 記録     │  │ 記録        │
                └──────────┘  └──────────┘  └──────────────┘
```

---

## フェーズ別 実装状況

### ✅ = 動作する | ⚠️ = コアにあるがUI未接続 | ❌ = 未実装

---

### 1. 起動 & タイトル画面

| 機能 | 状態 | 備考 |
|------|------|------|
| タイトル画面表示 | ✅ | birth-screen.ts ASCIIアート |
| "Press any key" 待機 | ✅ | |

---

### 2. キャラクター作成（Birth）

| 機能 | 状態 | 備考 |
|------|------|------|
| 種族選択（11種族） | ✅ | p_race.json読込、ステータス表示 |
| 職業選択（9職業） | ✅ | class.json読込、ステータス表示 |
| 名前入力 | ✅ | ランダム名生成あり |
| ステータスロール | ✅ | birth.ts rollStats() |
| HPロール | ✅ | birth.ts rollHP() |
| 年齢/身長/体重 | ✅ | birth.ts getAHW() |
| 初期装備付与 | ⚠️ | classのstartItems存在するがロード未実装 |
| 初期所持金 | ✅ | 600 gold |

---

### 3. 町レベル（深度0）

| 機能 | 状態 | 備考 |
|------|------|------|
| 町マップ生成 | ❌ | 深度0でもダンジョン生成される |
| ショップ配置 | ❌ | Feat.STORE_*は定義あり、生成なし |
| アイテム売買 | ⚠️ | store.ts実装済、UI未接続 |
| 自宅（HOME） | ⚠️ | store.ts実装済、UI未接続 |

---

### 4. メインゲームループ

#### 4a. プレイヤーフェーズ — コマンド

| コマンド | 状態 | 詳細 |
|----------|------|------|
| **移動（8方向）** | ✅ | 矢印/numpad/vi keys |
| **壁衝突** | ✅ | granite, perm, rubble等 |
| **ドア自動開放** | ✅ | 移動先がCLOSED→OPENに変更 |
| **階段使用 < >** | ✅ | 深度変更 + 新レベル生成 |
| **見回す /** | ✅ | 足元の地形表示 |
| **ヘルプ ?** | ✅ | キー一覧表示 |
| **近接攻撃** | ❌ | モンスターにぶつかっても何も起きない |
| **射撃 f** | ❌ | スタブメッセージのみ |
| **投擲 v** | ❌ | スタブメッセージのみ |
| **ドアを開ける o** | ❌ | 「方向は？」表示のみ |
| **ドアを閉める c** | ❌ | 「方向は？」表示のみ |
| **探索 s** | ❌ | メッセージのみ、罠/秘密ドア検出なし |
| **掘削 T** | ❌ | 未接続 |
| **罠解除 D** | ❌ | 未接続 |
| **体当たり B** | ❌ | 未接続 |
| **魔法詠唱 m** | ❌ | 「呪文を知らない」表示のみ |
| **アイテム拾い g** | ❌ | 「何もない」表示のみ |
| **アイテム落とす d** | ❌ | 「何も持ってない」表示のみ |
| **装備 w** | ❌ | 未接続 |
| **外す t** | ❌ | 未接続 |
| **インベントリ i** | ❌ | 「パックは空」表示のみ |
| **装備一覧 e** | ❌ | 「装備なし」表示のみ |
| **飲む q** | ❌ | 未接続 |
| **読む r** | ❌ | 未接続 |
| **食べる E** | ❌ | 未接続 |
| **杖を振る z** | ❌ | 未接続 |
| **杖を使う a** | ❌ | 未接続 |
| **休憩 . R** | ❌ | メッセージのみ、回復なし |

#### 4b. モンスターフェーズ

| 機能 | 状態 | 備考 |
|------|------|------|
| エネルギーシステム | ✅ | world.ts EXTRACT_ENERGY経由 |
| モンスターAI | ✅ | move.ts monsterTakeTurn()経由 |
| モンスター移動 | ✅ | processMonsters → monsterMove |
| モンスター攻撃 | ✅ | processMonsters → monsterAttack |
| モンスター魔法 | ⚠️ | spell.ts実装済だがUI未接続 |
| モンスター表示 | ✅ | 種族別文字/色で表示（race.dChar/dAttr） |

#### 4c. ワールドフェーズ

| 機能 | 状態 | 備考 |
|------|------|------|
| HP自然回復 | ⚠️ | world.ts regenerateHP()実装済 |
| MP自然回復 | ⚠️ | world.ts regenerateMana()実装済 |
| 空腹処理 | ⚠️ | world.ts processHunger()実装済 |
| 時限効果減少 | ⚠️ | player/timed.ts実装済 |
| ターン進行 | ✅（簡易） | state.turn++のみ |

---

### 5. レベル遷移

| 機能 | 状態 | 備考 |
|------|------|------|
| 上り階段検出 | ✅ | Feat.LESS |
| 下り階段検出 | ✅ | Feat.MORE |
| 新ダンジョン生成 | ✅ | generateDungeon() |
| プレイヤー配置 | ✅ | placePlayerOnStairs() |
| 深度追跡 | ✅ | state.depth更新 |
| 最大深度追跡 | ✅ | player.maxDepth更新 |

---

### 6. 死亡 & ゲームオーバー

| 機能 | 状態 | 備考 |
|------|------|------|
| HP≤0判定 | ❌ | ダメージを受けないので死なない |
| 死因記録 | ❌ | |
| 墓碑表示 | ❌ | |
| スコア記録 | ❌ | |
| ゲームループ終了 | ⚠️ | state.deadチェックはあるが設定されない |

---

### 7. 勝利

| 機能 | 状態 | 備考 |
|------|------|------|
| Morgoth生成（深度100） | ❌ | |
| Morgoth撃破判定 | ❌ | |
| 勝利フラグ設定 | ❌ | |
| 勝利画面 | ❌ | |

---

### 8. セーブ/ロード

| 機能 | 状態 | 備考 |
|------|------|------|
| JSON形式保存 | ⚠️ | save.ts実装済 |
| ロード & 復元 | ⚠️ | load.ts実装済 |
| UIからの保存操作 | ❌ | キーバインドなし |
| UIからの読込操作 | ❌ | メニューなし |
| オートセーブ | ❌ | |

---

## 実装済コア vs UI接続状況

```
                    Core Engine          Web UI (game-bridge.ts)
                    ───────────          ──────────────────────
  ゲームループ      game/world.ts        ✅ runGameLoop()使用
  エネルギー        game/world.ts        ✅ EXTRACT_ENERGY
  移動              command/movement.ts  ✅ cmdWalk → 自動攻撃対応
  階段              command/movement.ts  ✅ cmdGoUp/cmdGoDown
  戦闘              command/combat.ts    ✅ cmdAttack/cmdFire/cmdThrow
  モンスターAI      monster/move.ts      ✅ processMonsters経由
  モンスター攻撃    monster/attack.ts    ✅ processMonsters経由
  HP/MP回復         game/world.ts        ✅ processWorld経由
  空腹              game/world.ts        ✅ processWorld経由
  時限効果          player/timed.ts      ✅ processWorld経由
  アイテム使用      command/item.ts      ✅ 食/飲/読/杖/棒 UI付き
  装備              object/gear.ts       ✅ 装備/外す/落とす UI付き
  魔法              command/magic.ts     ✅ 詠唱/習得 UI付き
  セーブ            save/save.ts         ✅ Ctrl+S → localStorage
  ロード            save/load.ts         ✅ 起動時に自動検出
  死亡画面          (新規)               ✅ 墓碑ASCIIアート表示
  勝利画面          (新規)               ✅ 勝利メッセージ表示
  エフェクト        effect/handler.ts    ⚠️ 基本のみ（簡略化）
  投射              project/project.ts   ⚠️ コア実装済・UI未対応
  店                store/store.ts       ❌ 町マップ未生成
  初期装備          (birth)              ❌ classのstartItems未ロード
```

---

## 修正履歴

### Phase A: ゲームループ統合 ✅
game-bridge.ts の簡易ループを廃止し、core の runGameLoop() を使用。
CommandInputProvider を実装し、キー入力→GameCommand変換。
エネルギーシステム、モンスターAI、ワールド処理が動作。

### Phase B: 戦闘接続 ✅
Phase Aの統合により自動接続。cmdWalkがモンスター隣接時にcmdAttack呼出。
processMonsters()がモンスターの攻撃を処理。HP≤0→死亡判定。

### Phase C: アイテム & 装備 ✅
command/core.ts のディスパッチャーに全アイテムコマンドを接続。
game-bridge.ts にインベントリ表示(i)、装備表示(e)、
アイテム選択UI(レター式)を実装。

### Phase D: 魔法 & エフェクト ✅
呪文詠唱UI(m/p)、呪文習得UI(G)を実装。
呪文リスト表示（名前/レベル/消費SP/失敗率）。
コアのcastSpell/learnSpellに接続。

### Phase E: セーブ/ロード ✅
Ctrl+S → localStorage保存。
起動時に保存データ検出 → 「続行/新規」選択画面。
race/classテンプレート復元対応。

### Phase F: 死亡 & 勝利画面 ✅
墓碑ASCIIアート（名前/種族/職業/死因/深度/レベル/ターン）。
勝利画面メッセージ。死亡/勝利時にセーブデータ自動削除。

### Phase G: モンスター生成修正 ✅
monster.json + monster_base.json をロードし MonsterRace[] にパース。
populateMonsters() を placeNewMonster() 使用に書き換え、
実体のある Monster オブジェクト（HP/速度/AI/睡眠状態付き）を生成。
GameState.monsters / GameState.monsterRaces を追加し、
階段によるレベル遷移時も新レベルのモンスターを自動生成。
モンスター表示を種族別の文字/色に対応（race.dChar / race.dAttr使用）。

### Phase H: 戦闘・レベル遷移品質修正 ✅
- モンスター近接攻撃をmonsterAttackPlayer()（hit/miss判定、ダメージダイス、
  AC軽減、クリティカル、状態異常）に置き換え。簡略ダメージ計算を廃止。
- changeLevel()でレベル遷移時に旧モンスターのrace.curNumをデクリメント。
  UNIQUEモンスターが永久ブロックされるバグを修正。
- processMonsters()でプレイヤー死亡時にループを即座に中断。
- drawMap()のモンスター検索をO(n) find()からMap<midx, Monster>のO(1)に変更。
- 死亡/不在モンスターの描画を赤"m"からテレインフォールスルーに修正。
- 未使用のgetMonsters()関数を削除。

---

## 残課題（優先度順）

1. **初期装備付与**: classのstartItemsをロードしてインベントリに追加
2. **町マップ生成**: 深度0で8ショップ＋自宅を配置
3. **ショップUI**: store.tsのstoreBuy/storeSellをUI接続
4. **投射エフェクト可視化**: ビーム/ボルトの軌跡表示
5. **Morgoth生成**: 深度100でボス配置、撃破→totalWinner設定
6. **monster-loader拡充**: innate-freq, spells, spell-power, flags-off未パース
7. **セーブ/ロード**: monsters配列のシリアライズ/デシリアライズ未実装
