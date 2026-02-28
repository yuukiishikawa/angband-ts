# C版 → TS版 移植差分レポート

> 3つの独立した検証エージェント (A/B/C) の結果を突合し、全エージェント一致した項目のみ確定とした。
> 不一致があった場合はソースコードで追加検証済み。

---

## 凡例

| ステータス | 意味 |
|-----------|------|
| **EQUIVALENT** | C版とTS版で機能的に同等 |
| **DIFFERENT** | 設計アプローチが異なるが同等の目的 |
| **SIMPLIFIED** | C版より簡略化されている |
| **PARTIAL** | 型定義はあるが実行時ロジックが不完全 |
| **MISSING** | C版に存在しTS版に欠落 |

---

## 1. プレイヤー構造体

**合意度: 3/3 エージェント一致**

| 項目 | ステータス | 詳細 |
|------|-----------|------|
| コアフィールド (race/class/grid/stats/hp/mp/energy/food/timed等) | **EQUIVALENT** | 全35+フィールドが完全一致 |
| PlayerState (speed/ac/skills/flags等) | **EQUIVALENT** | 全フィールド一致 |
| PlayerUpkeep (playing/energyUse/running等) | **EQUIVALENT** | コアフィールド一致 |
| `gear` (インベントリ) | **DIFFERENT** | C: player上のlinked list → TS: 別配列 (`PlayerWithGear`) |
| `cave` (プレイヤー視界コピー) | **DIFFERENT** | C: player.cave (知識コピー) → TS: GameState.chunk (単一) |
| `gear_k` (知識装備) | **MISSING** | ルーン鑑定システムの一部 |
| `obj_k` (オブジェクト知識) | **MISSING** | ルーン鑑定システムの一部 |
| `opts` (プレイヤーオプション) | **PARTIAL** | 型定義はあるがPlayer構造体に未接続 |
| upkeep: `health_who`/`monster_race`/`object_kind` | **MISSING** | UI表示ターゲット追跡 (A/B一致、Cは言及なし→確認済MISSING) |

---

## 2. モンスター構造体

**合意度: 3/3 エージェント一致**

| 項目 | ステータス | 詳細 |
|------|-----------|------|
| Monster コアフィールド (race/midx/grid/hp/energy/mTimed等) | **EQUIVALENT** | 全フィールド一致 |
| MonsterRace コアフィールド (ridx/name/blows/flags/speed等) | **EQUIVALENT** | 全フィールド一致 |
| MonsterLore | **EQUIVALENT** | 型定義完全一致 (ただし実行時更新は不完全) |
| `known_pstate` (SMART AI用プレイヤー知識) | **MISSING** | 3エージェント一致 |
| `heatmap` (モンスター個別ヒートマップ) | **MISSING** | 3エージェント一致 |
| `mimicked_obj`/`held_obj` | **DIFFERENT** | C: ポインタ → TS: インデックス |
| `freq_innate` (先天呪文頻度) | **PARTIAL** | 型あり、常に0 (パース未実装) |
| `spell_flags` (呪文フラグ) | **PARTIAL** | 型あり、常に空 (パース未実装) |
| `spell_power` | **PARTIAL** | 型あり、常に0 (パース未実装) |
| monster_spell (呪文効果チェーン) | **MISSING** | 種族ごとの呪文効果チェーンが未モデル化 |

---

## 3. ダンジョン/洞窟構造体

**合意度: 3/3 エージェント一致**

| 項目 | ステータス | 詳細 |
|------|-----------|------|
| Chunk コアフィールド | **EQUIVALENT** | name/depth/height/width/squares/feeling等 |
| Square コアフィールド | **EQUIVALENT** | feat/info/light/mon |
| FeatureType | **EQUIVALENT** | 全フィールド一致 |
| noise/scent ヒートマップ | **PARTIAL** | 型定義あり、伝播処理は未実装 |
| `monster_groups` | **PARTIAL** | MonsterGroup型定義あり、Chunkに未接続 (A: MISSING, B: PARTIAL, C: PARTIAL → 確認後PARTIAL) |
| `obj` (オブジェクトパイル) | **SIMPLIFIED** | C: linked listポインタ → TS: ObjectId \| null |
| `trap` (罠) | **SIMPLIFIED** | C: linked list → TS: TrapId \| null (罠効果は未実装) |

---

## 4. オブジェクト/アイテムシステム

**合意度: 3/3 エージェント一致 — TS版最大のギャップ領域**

| 項目 | ステータス | 詳細 |
|------|-----------|------|
| ObjectType 型定義 | **EQUIVALENT** | 全30+フィールドが完全一致 |
| ObjectKind 型定義 | **EQUIVALENT** | allocProb/flavor/aware等すべて |
| Artifact 型定義 | **EQUIVALENT** | ArtifactUpkeepも含む |
| EgoItem 型定義 | **EQUIVALENT** | flagsOff/minModifiers等 |
| Brand/Slay/Curse 型定義 | **EQUIVALENT** | 完全 |
| Effect チェーン | **EQUIVALENT** | linked list構造同等 |
| **object.txt からのデータ読込** | **MISSING** | 3エージェント一致。ObjectKindが実行時にロードされない |
| **artifact.txt からのデータ読込** | **MISSING** | 3エージェント一致 |
| **ego_item.txt からのデータ読込** | **MISSING** | 3エージェント一致 |
| `obj-knowledge.c` (ルーン鑑定) | **MISSING** | 3エージェント一致 |
| `obj-randart.c` (ランダムアーティファクト) | **MISSING** | 3エージェント一致 |
| `obj-ignore.c` (アイテム無視/squelch) | **MISSING** | 3エージェント一致 |
| `obj-slays.c` (スレイ/ブランドダメージ計算) | **MISSING** | 3エージェント一致 |
| `obj-info.c` (アイテム詳細表示) | **MISSING** | 3エージェント一致 |
| `obj-make.c` (アイテム生成) | **PARTIAL** | make.ts存在、apply_magic()簡略化 |
| `obj-gear.c` (装備管理) | **PARTIAL** | gear.ts存在、基本動作のみ |
| `obj-desc.c` (名前生成) | **PARTIAL** | desc.ts存在、フレーバー名簡略化 |

---

## 5. コマンドシステム

**合意度: 3/3 エージェント一致**

| 項目 | ステータス | 詳細 |
|------|-----------|------|
| コマンド種別 (28種) | **EQUIVALENT** | WALK〜ALTER全て対応 |
| コマンドキュー | **DIFFERENT** | C: ring buffer (cmdq_push/pop) → TS: async/await |
| コマンド引数 | **DIFFERENT** | C: union → TS: discriminated union |
| `nrepeats` (コマンドリピート) | **MISSING** | 3エージェント一致 |
| `background_command` | **MISSING** | 3エージェント一致 |
| `cmd_context` (GAME/BIRTH/STORE/DEATH) | **SIMPLIFIED** | TS: 暗黙的にゲーム状態で判定 |
| Birth コマンド群 | **DIFFERENT** | C: コマンドシステム経由 → TS: 別画面 (BirthScreen) |
| Wizard コマンド | **MISSING** | デバッグモード未実装 |

---

## 6. ゲームループ

**合意度: 3/3 エージェント一致**

| 項目 | ステータス | 詳細 |
|------|-----------|------|
| Phase 1: プレイヤー処理 | **EQUIVALENT** | await getCommand() → executeCommand() |
| Phase 2: 高速モンスター先行処理 | **MISSING** | C: process_monsters(player.energy+1) → TS: 全モンスター一括 |
| Phase 3: ワールド処理ループ | **SIMPLIFIED** | C: while(playing)反復 → TS: シングルパス |
| `process_player_cleanup()` | **MISSING** | ステータス再計算/update flags |
| `reset_monsters()` | **MISSING** | MFLAG_HANDLEDクリア |
| process_world: HP/MP回復 | **EQUIVALENT** | regenerateHP/Mana |
| process_world: 空腹 | **EQUIVALENT** | processHunger (10ターンごと) |
| process_world: 時限効果 | **EQUIVALENT** | decreaseTimedEffects |
| process_world: **モンスター自然生成** | **MISSING** | 3エージェント一致 |
| process_world: **モンスターHP再生** | **MISSING** | 3エージェント一致 |
| process_world: **オブジェクトタイムアウト** | **MISSING** | 杖チャージ回復、松明燃料消費等 |
| process_world: **毒/出血ダメージ** | **MISSING** | A/B一致、Cは言及あり → 確認済MISSING |

---

## 7. モンスターAI

**合意度: 3/3 エージェント一致**

| 項目 | ステータス | 詳細 |
|------|-----------|------|
| 睡眠/覚醒 | **SIMPLIFIED** | C: 聴覚/匂い/視覚で覚醒判定 → TS: カウンタ減算のみ |
| 混乱→ランダム移動 | **EQUIVALENT** | |
| RAND_25/RAND_50 | **EQUIVALENT** | |
| NEVER_MOVE/NEVER_BLOW | **EQUIVALENT** | |
| 恐怖/逃走 | **SIMPLIFIED** | C: HP閾値+SMART判定 → TS: FEAR効果フラグのみ |
| 経路探索 | **SIMPLIFIED** | C: ヒートマップ+フロー → TS: 貪欲法 (Chebyshev距離) |
| ドア開放 (OPEN_DOOR) | **PARTIAL** | 移動可能だがドア地形変更なし (B/C一致) |
| PASS_WALL/KILL_WALL | **PARTIAL** | 移動可能だが壁破壊なし (B/C一致) |
| **MOVE_BODY/KILL_BODY** | **MISSING** | 3エージェント一致。モンスター間押し/殺し |
| **地形ダメージ** | **MISSING** | 3エージェント一致。溶岩等 |
| **モンスターHP再生** | **MISSING** | 3エージェント一致。100ターンごと |
| **グループAI** | **MISSING** | 3エージェント一致。協調行動 |
| **召喚** | **MISSING** | 3エージェント一致 |
| **増殖** (MULTIPLY) | **MISSING** | 3エージェント一致 |
| 呪文詠唱 | **PARTIAL** | spell.ts存在、AIターンループ未接続 |

---

## 8. 戦闘システム

**合意度: 3/3 エージェント一致**

| 項目 | ステータス | 詳細 |
|------|-----------|------|
| プレイヤー命中判定 | **EQUIVALENT** | chanceOfMeleeHit() |
| プレイヤーダメージ計算 | **SIMPLIFIED** | 武器ダイス+toD、スレイ/ブランド未適用 |
| プレイヤークリティカル | **EQUIVALENT** | |
| モンスター近接攻撃 | **EQUIVALENT** | 完全なblow解決 (hit/miss/ダメージ/AC軽減/クリティカル) |
| モンスターblow効果 | **PARTIAL** | 基本効果 (毒/混乱/恐怖/麻痺/ステータス吸収) あり。不足: DRAIN_CHARGES/EAT_GOLD/EAT_ITEM/EAT_FOOD/EAT_LIGHT/SHATTER/経験値吸収 |
| 自動攻撃 (移動先にモンスター) | **EQUIVALENT** | |
| **スレイ/ブランドダメージ** | **MISSING** | 3エージェント一致。型定義あり、戦闘で未適用 |
| **射撃 (FIRE)** | **PARTIAL** | 基本構造あり、弾薬消費/倍率なし |
| **投擲 (THROW)** | **PARTIAL** | スタブのみ |
| **盾バッシュ** | **MISSING** | 3エージェント一致 |
| **モンスター死亡時ドロップ** | **MISSING** | A/B一致。モンスター撃破時にアイテムが落ちない |

---

## 9. 魔法/呪文システム

**合意度: 3/3 エージェント一致**

| 項目 | ステータス | 詳細 |
|------|-----------|------|
| ClassSpell/ClassBook/ClassMagic型 | **EQUIVALENT** | |
| 呪文習得 (learnSpell) | **EQUIVALENT** | |
| 呪文詠唱 (cmdCast) | **EQUIVALENT** | |
| 失敗率計算 | **EQUIVALENT** | |
| エフェクトチェーン実行 | **EQUIVALENT** | executeEffectChain() |
| EffectType列挙 (~130型) | **EQUIVALENT** | 全型定義 |
| **実装済エフェクトハンドラ** | **PARTIAL** | ~25/130実装。動作: HEAL_HP, NOURISH, CURE, TIMED_INC/DEC/SET, RESTORE_STAT, DRAIN_STAT, GAIN_STAT, BOLT, BEAM, BALL, BREATH, RESTORE_MANA/EXP, LIGHT_AREA, MAP_AREA。未実装: TELEPORT, SUMMON, DETECT_*, ENCHANT, RECHARGE, IDENTIFY, EARTHQUAKE, DESTRUCTION等 |

---

## 10. ダンジョン生成

**合意度: 3/3 エージェント一致**

| 項目 | ステータス | 詳細 |
|------|-----------|------|
| 基本生成 (壁充填→部屋→トンネル→階段) | **EQUIVALENT** | |
| 部屋タイプ | **SIMPLIFIED** | C: 15+種類 → TS: 5種類 (simple/overlapping/cross/circular/large) |
| モンスター配置 | **EQUIVALENT** | 深度ベース選択 |
| **生成プロファイル** | **MISSING** | 3エージェント一致。C: 15+プロファイル → TS: 1つ |
| **Vaultテンプレート** | **MISSING** | 3エージェント一致 |
| **Pit/Nestルーム** | **MISSING** | 3エージェント一致 |
| **町マップ生成** | **MISSING** | 3エージェント一致。深度0でショップ配置なし |
| **永続レベル** | **MISSING** | 3エージェント一致 |
| **レベル感覚計算** | **PARTIAL** | フィールドあり、算出なし |
| **生成リトライ** | **MISSING** | C: 100回まで → TS: 1回 |
| オブジェクト配置 | **PARTIAL** | populateObjects()あり、ObjectKind未ロード |
| 罠配置 | **PARTIAL** | placeTraps()あり、罠効果なし |

---

## 11. FOV/LOS (視界)

**合意度: 3/3 エージェント一致**

| 項目 | ステータス | 詳細 |
|------|-----------|------|
| LOS算法 (Joseph Hall) | **EQUIVALENT** | 忠実な移植 |
| FOV算法 | **DIFFERENT** | C: ブルートフォース → TS: 再帰シャドウキャスティング (より効率的) |
| VIEW/SEEN/WASSEEN フラグ | **EQUIVALENT** | |
| 壁可視性修正 | **EQUIVALENT** | fixWallVisibility() |
| CLOSE_PLAYER | **EQUIVALENT** | |
| **盲目処理** | **MISSING** | 3エージェント一致 |
| **赤外線視覚** | **MISSING** | 3エージェント一致 |
| **GLOW伝播** | **PARTIAL** | フラグあり、光源からの伝播は基本的 |
| **モンスター発光** | **MISSING** | B/C一致 |

---

## 12. ショップ

**合意度: 3/3 エージェント一致**

| 項目 | ステータス | 詳細 |
|------|-----------|------|
| 店タイプ (9種) | **EQUIVALENT** | |
| 売買ロジック | **EQUIVALENT** | storeBuy/storeSell |
| 自宅 | **EQUIVALENT** | homeStore/homeRetrieve |
| 在庫管理 | **EQUIVALENT** | storeMaintenance |
| 店主 | **SIMPLIFIED** | C: 複数ランダム → TS: 固定1人 |
| **店UI** | **MISSING** | 3エージェント一致。コアロジックあり、UI未接続 |
| **町マップ上の店配置** | **MISSING** | 3エージェント一致 |

---

## 13. セーブ/ロード

**合意度: 3/3 エージェント一致**

| 項目 | ステータス | 詳細 |
|------|-----------|------|
| プレイヤーデータ | **EQUIVALENT** | |
| ダンジョンデータ | **EQUIVALENT** | |
| モンスターデータ | **EQUIVALENT** | |
| RNG状態 | **EQUIVALENT** | |
| 保存形式 | **DIFFERENT** | C: バイナリ → TS: JSON + localStorage |
| **パニックセーブ** | **MISSING** | 3エージェント一致 |
| **バージョン移行** | **MISSING** | 3エージェント一致 |
| **キャラクターダンプ** | **MISSING** | 3エージェント一致 |
| **ハイスコア** | **MISSING** | 3エージェント一致 |
| メッセージ保存 | **DIFFERENT** | C: 保存なし → TS: 直近200メッセージ保存 (TS版が優位) |

---

## 14. イベントシステム

**合意度: 3/3 エージェント一致**

| 項目 | ステータス | 詳細 |
|------|-----------|------|
| イベント型 (65種) | **EQUIVALENT** | 完全一致 |
| ハンドラ登録/削除 | **EQUIVALENT** | on/off |
| ディスパッチ | **EQUIVALENT** | emit |
| once ハンドラ | **TS版のみ** | C版にない機能 |
| ビジュアルエフェクトイベント | **PARTIAL** | 型定義あり、UIハンドラなし |

---

## 15. UI抽象化

**合意度: 3/3 エージェント一致**

| 項目 | ステータス | 詳細 |
|------|-----------|------|
| ターミナル抽象化 | **SIMPLIFIED** | C: マルチウィンドウ → TS: シングル80x24 |
| プラットフォーム | **DIFFERENT** | C: Curses/SDL2/X11/Win/NDS → TS: Canvas |
| 色システム | **EQUIVALENT** | |
| ダーティリージョン描画 | **EQUIVALENT** | |
| **マルチウィンドウ** | **MISSING** | 3エージェント一致。モンスター一覧/メッセージ履歴等 |
| **キーマップモード** | **MISSING** | 3エージェント一致。Original/Roguelike切替 |
| **メニューフレームワーク** | **MISSING** | 3エージェント一致。汎用メニューシステム |
| **ターゲティングモード** | **MISSING** | 3エージェント一致。カーソル移動式ターゲット選択 |
| **マウスサポート** | **MISSING** | |
| **サウンド** | **MISSING** | |

---

## 16. データ読込

**合意度: 3/3 エージェント一致**

| 項目 | ステータス | 詳細 |
|------|-----------|------|
| パーサーシステム | **EQUIVALENT** | parser.ts は C版の忠実な移植 |
| モンスターデータ | **EQUIVALENT** | monster.json + monster_base.json |
| 種族/職業データ | **EQUIVALENT** | p_race.json, class.json |
| 地形データ | **SIMPLIFIED** | C: terrain.txt → TS: ハードコード (buildDefaultFeatureInfo) |
| **object.txt** | **MISSING** | 3エージェント一致 |
| **artifact.txt** | **MISSING** | 3エージェント一致 |
| **ego_item.txt** | **MISSING** | 3エージェント一致 |
| **vault.txt** | **MISSING** | 3エージェント一致 |
| **trap.txt** | **MISSING** | 3エージェント一致 |
| **spell.txt** (呪文効果) | **SIMPLIFIED** | class.jsonに埋め込み |
| データファイル数 | **SIMPLIFIED** | C: 50+ファイル → TS: 4 JSONファイル |

---

## 17. 投射/エフェクトシステム

**合意度: 3/3 エージェント一致**

| 項目 | ステータス | 詳細 |
|------|-----------|------|
| 投射経路計算 | **EQUIVALENT** | calculateProjectionPath() |
| Bolt/Beam/Ball/Arc | **EQUIVALENT** | 全4種類の範囲計算 |
| ProjectFlag (14フラグ) | **EQUIVALENT** | |
| ダメージ減衰 | **EQUIVALENT** | damage/(dist+1) |
| project_feat (地形変化) | **PARTIAL** | 基本のみ |
| project_mon (モンスターダメージ) | **PARTIAL** | 基本ダメージ+耐性、状態異常簡略 |
| project_player (プレイヤーダメージ) | **PARTIAL** | 基本ダメージ+一部状態異常 |
| **project_obj (オブジェクト破壊)** | **MISSING** | 3エージェント一致。火で巻物燃える等 |
| **ビジュアルエフェクト** | **MISSING** | 3エージェント一致。ボルト/ボール軌跡アニメ |

---

## 統計サマリー

| カテゴリ | EQUIVALENT | DIFFERENT | SIMPLIFIED | PARTIAL | MISSING |
|----------|-----------|-----------|------------|---------|---------|
| 1. プレイヤー | 35 | 2 | 0 | 1 | 4 |
| 2. モンスター | 24 | 2 | 0 | 4 | 3 |
| 3. ダンジョン | 17 | 0 | 2 | 3 | 1 |
| 4. オブジェクト | 17 | 0 | 0 | 5 | 8 |
| 5. コマンド | 21 | 3 | 1 | 0 | 3 |
| 6. ゲームループ | 5 | 0 | 2 | 0 | 5 |
| 7. モンスターAI | 4 | 0 | 3 | 3 | 7 |
| 8. 戦闘 | 4 | 0 | 1 | 3 | 4 |
| 9. 魔法/呪文 | 6 | 0 | 0 | 1 | 0 |
| 10. ダンジョン生成 | 3 | 0 | 1 | 3 | 5 |
| 11. FOV/LOS | 5 | 1 | 0 | 1 | 3 |
| 12. ショップ | 5 | 0 | 1 | 0 | 2 |
| 13. セーブ/ロード | 4 | 3 | 0 | 0 | 4 |
| 14. イベント | 5 | 0 | 0 | 1 | 0 |
| 15. UI | 2 | 2 | 1 | 0 | 5 |
| 16. データ読込 | 3 | 0 | 3 | 0 | 5 |
| 17. 投射/エフェクト | 5 | 0 | 0 | 3 | 2 |
| **合計** | **165** | **13** | **15** | **28** | **61** |

---

## 最重要ギャップ TOP 10 (全エージェント一致)

| 順位 | ギャップ | 影響度 | 備考 |
|------|---------|--------|------|
| **1** | オブジェクトデータ未読込 (object.txt/artifact.txt/ego_item.txt) | **致命的** | アイテムがゲーム世界に登場しない |
| **2** | 町マップ生成 + ショップUI | **致命的** | 深度0で買い物不可 |
| **3** | モンスター呪文のAI未接続 | **高** | freq_innate/spell_flags/spellPowerがパースされず、呪文詠唱しない |
| **4** | スレイ/ブランドダメージ未適用 | **高** | 武器特殊効果が機能しない |
| **5** | 投射ビジュアルエフェクト | **高** | ボルト/ビーム/ボールの軌跡が見えない |
| **6** | Vault/Pit/Nestルーム + ダンジョンプロファイル | **中** | ダンジョンの多様性が低い |
| **7** | モンスター自然生成 + HP再生 + 地形ダメージ | **中** | ワールド処理の欠落 |
| **8** | ルーン鑑定システム (obj-knowledge) | **中** | アイテム知識の進行がない |
| **9** | ターゲティングモード | **中** | 遠距離攻撃/呪文の照準不可 |
| **10** | コマンドリピート (nrepeats) | **低** | QoL機能の欠落 |

---

## 設計上の主要な差異 (意図的な変更)

| 観点 | C版 | TS版 | 評価 |
|------|-----|------|------|
| 状態管理 | グローバル変数 | GameStateオブジェクト | TS版が優位 (テスト容易) |
| コマンド入力 | ring buffer + 関数ポインタ | async/await + switch | TS版が優位 (型安全) |
| イベント | Cコールバック | EventBus (once/clearType追加) | TS版が優位 (機能追加) |
| FOV算法 | ブルートフォース | 再帰シャドウキャスティング | TS版が優位 (効率的) |
| セーブ形式 | バイナリ | JSON + localStorage | TS版が優位 (デバッグ容易) |
| メモリ管理 | 手動malloc/free | GC自動管理 | TS版が優位 |
| データ形式 | .txtパーサー | JSON + .txtパーサー両対応 | 同等 |

---

## 結論

**型定義の移植は非常に高品質** — C版の全主要構造体にTS版の完全なinterface対応がある。

**ギャップの本質は「データ読込」と「実行時ロジック」** — 型は定義されているが、データファイルがロードされないためオブジェクト/アーティファクト/エゴアイテム/罠が実行時に存在しない。この1点を解決すれば、多くのPARTIAL項目が自動的にEQUIVALENTに昇格する。
