# Angband (Original C版) アーキテクチャ図

> オリジナルC言語版Angband (`/Users/ishikawayuuki/Projects/angband/src/`) のMermaid記法によるアーキテクチャ図。
> TS版は `ARCHITECTURE.md` を参照。

---

## 目次

1. [クラス図（構造体）](#1-クラス図構造体)
2. [シーケンス図](#2-シーケンス図)
3. [状態遷移図](#3-状態遷移図)
4. [モジュール構成図](#4-モジュール構成図)

---

## 1. クラス図（構造体）

### 1.1 プレイヤー関連構造体

```mermaid
classDiagram
    class player {
        +player_race *race
        +player_class *class
        +loc grid
        +loc old_grid
        +uint8_t hitdie
        +uint8_t expfact
        +int16_t age, ht, wt
        +int32_t au
        +int16_t max_depth, recall_depth, depth
        +int16_t max_lev, lev
        +int32_t max_exp, exp
        +int16_t mhp, chp
        +int16_t msp, csp
        +int16_t stat_max[STAT_MAX]
        +int16_t stat_cur[STAT_MAX]
        +int16_t *timed
        +int16_t energy
        +int16_t food
        +int16_t player_hp[PY_MAX_LEVEL]
        +char full_name[32]
        +char died_from[80]
        +char *history
        +uint16_t total_winner
        +bool is_dead
        +bool wizard
        +player_state state
        +player_state known_state
        +player_body body
        +player_shape *shape
        +object *gear
        +object *gear_k
        +object *obj_k
        +chunk *cave
        +player_upkeep *upkeep
        +player_options opts
    }

    class player_race {
        +player_race *next
        +char *name
        +unsigned int ridx
        +int r_mhp
        +int r_exp
        +int b_age, m_age
        +int base_hgt, mod_hgt
        +int base_wgt, mod_wgt
        +int infra
        +int r_adj[STAT_MAX]
        +int r_skills[SKILL_MAX]
        +bitflag flags[OF_SIZE]
        +bitflag pflags[PF_SIZE]
        +element_info el_info[ELEM_MAX]
        +history_chart *history
    }

    class player_class {
        +player_class *next
        +char *name
        +unsigned int cidx
        +char *title[10]
        +int c_adj[STAT_MAX]
        +int c_skills[SKILL_MAX]
        +int x_skills[SKILL_MAX]
        +int c_mhp
        +int c_exp
        +int max_attacks
        +int min_weight
        +int att_multiply
        +start_item *start_items
        +class_magic magic
        +bitflag flags[OF_SIZE]
        +bitflag pflags[PF_SIZE]
    }

    class player_state {
        +int stat_add[STAT_MAX]
        +int stat_ind[STAT_MAX]
        +int stat_use[STAT_MAX]
        +int stat_top[STAT_MAX]
        +int skills[SKILL_MAX]
        +int speed
        +int num_blows
        +int num_shots
        +int num_moves
        +int ammo_mult
        +int ac
        +int dam_red
        +int to_a, to_h, to_d
        +int see_infra
        +int cur_light
        +bool heavy_wield
        +bool heavy_shoot
        +bitflag flags[OF_SIZE]
        +bitflag pflags[PF_SIZE]
        +element_info el_info[ELEM_MAX]
    }

    class player_upkeep {
        +bool playing
        +bool autosave
        +bool generate_level
        +int energy_use
        +int *redraw
        +int *update
        +bool only_partial
        +int16_t health_who
        +int16_t monster_race
        +int16_t object_kind
        +int command_wrk
        +int running
        +bool running_firststep
        +struct object *inven[z_info_pack_size]
        +int inven_cnt
        +int equip_cnt
        +int recharge_pow
    }

    class player_body {
        +player_body *next
        +char *name
        +int count
        +equip_slot *slots
    }

    class player_shape {
        +player_shape *next
        +char *name
        +int sidx
        +int to_a, to_h, to_d
        +int skills[SKILL_MAX]
        +bitflag flags[OF_SIZE]
        +bitflag pflags[PF_SIZE]
        +int modifiers[OBJ_MOD_MAX]
        +element_info el_info[ELEM_MAX]
        +effect *effect
        +player_blow *blows
        +int num_blows
    }

    class class_magic {
        +int total_spells
        +int num_books
        +class_book *books
    }

    class class_book {
        +int tval
        +int sval
        +bool dungeon
        +int num_spells
        +magic_realm *realm
        +class_spell *spells
    }

    class class_spell {
        +char *name
        +char *text
        +effect *effect
        +magic_realm *realm
        +int sidx, bidx
        +int slevel, smana, sfail, sexp
    }

    player --> player_race
    player --> player_class
    player --> player_state
    player --> player_upkeep
    player --> player_body
    player --> player_shape
    player_class --> class_magic
    class_magic --> class_book
    class_book --> class_spell
    class_spell --> effect
```

### 1.2 モンスター関連構造体

```mermaid
classDiagram
    class monster {
        +monster_race *race
        +monster_race *original_race
        +int midx
        +loc grid
        +int16_t hp
        +int16_t maxhp
        +int16_t m_timed[MON_TMD_MAX]
        +uint8_t mspeed
        +uint8_t energy
        +uint8_t cdis
        +bitflag mflag[MFLAG_SIZE]
        +object *mimicked_obj
        +object *held_obj
        +uint8_t attr
        +player_state known_pstate
        +target target
        +monster_group_info group_info[GROUP_MAX]
        +heatmap heatmap
        +uint8_t min_range
        +uint8_t best_range
    }

    class monster_race {
        +monster_race *next
        +unsigned int ridx
        +char *name
        +char *text
        +char *plural
        +monster_base *base
        +int avg_hp
        +int ac
        +int sleep
        +int hearing
        +int smell
        +int speed
        +int light
        +int mexp
        +int freq_innate
        +int freq_spell
        +int spell_power
        +bitflag flags[RF_SIZE]
        +bitflag spell_flags[RSF_SIZE]
        +monster_blow *blow
        +int level
        +int rarity
        +uint8_t d_attr
        +wchar_t d_char
        +uint8_t max_num
        +int cur_num
        +monster_drop *drops
        +monster_friends *friends
        +monster_shape *shapes
        +int num_shapes
    }

    class monster_base {
        +monster_base *next
        +char *name
        +char *text
        +bitflag flags[RF_SIZE]
        +bitflag spell_flags[RSF_SIZE]
        +wchar_t d_char
        +char *pain
    }

    class monster_blow {
        +monster_blow *next
        +blow_method *method
        +blow_effect *effect
        +random_value dice
        +int times_seen
    }

    class blow_method {
        +char *name
        +bool cut
        +bool stun
        +bool miss
        +bool phys
        +int msgt
        +blow_message *messages
        +int num_messages
        +char *desc
    }

    class blow_effect {
        +char *name
        +int power
        +int eval
        +char *desc
        +uint8_t lore_attr
        +char *effect_type
        +int resist
        +int lash_type
    }

    class monster_lore {
        +int16_t sights
        +int16_t deaths
        +int16_t pkills
        +int16_t tkills
        +uint8_t wake
        +int16_t spell_count
        +int16_t cast_innate
        +int16_t cast_spell
        +bitflag flags[RF_SIZE]
        +bitflag spell_flags[RSF_SIZE]
        +monster_blow *blows
        +uint8_t *drops
        +uint8_t *friends
        +uint8_t *friends_base
        +monster_mimic *mimic_kinds
    }

    class monster_spell {
        +monster_spell *next
        +uint16_t index
        +int msgt
        +int hit
        +effect *effect
        +monster_spell_level *level
    }

    monster --> monster_race
    monster_race --> monster_base
    monster_race --> monster_blow
    monster_blow --> blow_method
    monster_blow --> blow_effect
    monster_race --> monster_spell
    monster_spell --> effect
    monster_lore ..> monster_race : tracks knowledge
```

### 1.3 ダンジョン/洞窟構造体

```mermaid
classDiagram
    class chunk {
        +char *name
        +int32_t turn
        +int depth
        +uint8_t feeling
        +uint32_t obj_rating
        +uint32_t mon_rating
        +bool good_item
        +int height
        +int width
        +uint16_t feeling_squares
        +int *feat_count
        +square **squares
        +heatmap noise
        +heatmap scent
        +loc decoy
        +object **objects
        +uint16_t obj_max
        +monster *monsters
        +uint16_t mon_max
        +uint16_t mon_cnt
        +int mon_current
        +int num_repro
        +monster_group **monster_groups
        +connector *join
    }

    class square {
        +uint8_t feat
        +bitflag *info
        +int light
        +int16_t mon
        +object *obj
        +trap *trap
    }

    class feature {
        +char *name
        +char *desc
        +int fidx
        +feature *mimic
        +uint8_t priority
        +uint8_t shopnum
        +uint8_t dig
        +bitflag flags[TF_SIZE]
        +uint8_t d_attr
        +wchar_t d_char
        +char *walk_msg
        +char *run_msg
        +char *hurt_msg
        +char *die_msg
        +int resist_flag
    }

    class trap {
        +uint8_t t_idx
        +trap_kind *kind
        +trap *next
        +loc grid
        +uint8_t power
        +uint8_t timeout
        +bitflag flags[TRF_SIZE]
    }

    class trap_kind {
        +char *name
        +char *text
        +char *desc
        +char *msg
        +char *msg_good
        +char *msg_bad
        +int tidx
        +uint8_t d_attr
        +wchar_t d_char
        +int rarity
        +int min_depth
        +random_value power
        +bitflag flags[TRF_SIZE]
        +effect *effect
        +effect *effect_xtra
    }

    class loc {
        +int x
        +int y
    }

    class heatmap {
        +uint16_t **grids
    }

    chunk --> square : squares[][]
    chunk --> monster : monsters[]
    chunk --> heatmap : noise, scent
    square --> feature : feat (index)
    square --> trap : trap (linked list)
    square --> object : obj (pile)
    trap --> trap_kind
    trap_kind --> effect
```

### 1.4 オブジェクト（アイテム）関連構造体

```mermaid
classDiagram
    class object {
        +object_kind *kind
        +ego_item *ego
        +artifact *artifact
        +object *prev
        +object *next
        +object *known
        +uint16_t oidx
        +loc grid
        +uint8_t tval
        +uint8_t sval
        +int16_t pval
        +int16_t weight
        +uint8_t dd, ds
        +int16_t ac
        +int16_t to_a, to_h, to_d
        +bitflag flags[OF_SIZE]
        +int16_t modifiers[OBJ_MOD_MAX]
        +element_info el_info[ELEM_MAX]
        +bool *brands
        +bool *slays
        +curse_data *curses
        +effect *effect
        +activation *activation
        +random_value time
        +int16_t timeout
        +uint8_t number
        +int16_t held_m_idx
        +int16_t mimicking_m_idx
        +uint8_t origin
        +uint8_t origin_depth
        +monster_race *origin_race
        +quark_t note
    }

    class object_kind {
        +char *name
        +char *text
        +object_base *base
        +uint32_t kidx
        +int tval, sval
        +random_value pval
        +random_value to_h, to_d, to_a
        +int ac, dd, ds
        +int weight, cost
        +bitflag flags[OF_SIZE]
        +bitflag kind_flags[KF_SIZE]
        +random_value modifiers[OBJ_MOD_MAX]
        +element_info el_info[ELEM_MAX]
        +bool *brands
        +bool *slays
        +int *curses
        +uint8_t d_attr
        +wchar_t d_char
        +int alloc_prob, alloc_min, alloc_max
        +int level
        +activation *activation
        +effect *effect
        +int power
        +random_value time
        +random_value charge
        +flavor *flavor
        +bool aware, tried, everseen
    }

    class artifact {
        +char *name
        +char *text
        +uint32_t aidx
        +int tval, sval
        +int to_h, to_d, to_a
        +int ac, dd, ds
        +int weight, cost
        +bitflag flags[OF_SIZE]
        +int modifiers[OBJ_MOD_MAX]
        +element_info el_info[ELEM_MAX]
        +bool *brands
        +bool *slays
        +int level
        +int alloc_prob, alloc_min, alloc_max
        +activation *activation
        +random_value time
    }

    class ego_item {
        +char *name
        +char *text
        +uint32_t eidx
        +int cost
        +bitflag flags[OF_SIZE]
        +bitflag flags_off[OF_SIZE]
        +random_value modifiers[OBJ_MOD_MAX]
        +int min_modifiers[OBJ_MOD_MAX]
        +element_info el_info[ELEM_MAX]
        +bool *brands
        +bool *slays
        +int rating
        +int alloc_prob, alloc_min, alloc_max
        +poss_item *poss_items
        +random_value to_h, to_d, to_a
        +activation *activation
        +random_value time
    }

    class effect {
        +effect *next
        +uint16_t index
        +dice_t *dice
        +int y, x
        +int subtype
        +int radius
        +int other
        +char *msg
    }

    class activation {
        +activation *next
        +char *name
        +int index
        +bool aim
        +int level
        +int power
        +effect *effect
        +char *message
        +char *desc
    }

    class store {
        +owner *owners
        +owner *owner
        +int feat
        +uint8_t stock_num
        +int16_t stock_size
        +object *stock
        +object *stock_k
        +object_kind **always_table
        +object_kind **normal_table
        +object_buy *buy
        +int turnover
        +int normal_stock_min
        +int normal_stock_max
    }

    object --> object_kind
    object --> ego_item
    object --> artifact
    object --> effect
    object --> activation
    object_kind --> effect
    object_kind --> activation
    store --> object : stock
    store --> object_kind : always/normal_table
```

### 1.5 コマンドシステム構造体

```mermaid
classDiagram
    class command {
        +cmd_context context
        +cmd_code code
        +int nrepeats
        +int background_command
        +cmd_arg arg[CMD_MAX_ARGS]
    }

    class cmd_arg {
        +cmd_arg_type type
        +cmd_arg_data data
        +char name[20]
    }

    class cmd_arg_data {
        <<union>>
        +char *string
        +int choice
        +object *obj
        +int number
        +int direction
        +loc point
    }

    class cmd_info {
        +char *desc
        +cmd_code cmd
        +cmd_handler_fn fn
        +char *arg
        +bool auto_repeat
        +int auto_repeat_n
    }

    class source {
        <<tagged union>>
        +SRC_NONE
        +SRC_TRAP
        +SRC_PLAYER
        +SRC_MONSTER
        +SRC_OBJECT
        +SRC_CHEST_TRAP
    }

    class random_value {
        +int base
        +int dice
        +int sides
        +int m_bonus
    }

    command --> cmd_arg : arg[]
    cmd_arg --> cmd_arg_data
    cmd_info --> command : dispatches

    note for command "cmd_code列挙:\nCMD_WALK, CMD_RUN, CMD_GO_UP, CMD_GO_DOWN\nCMD_WIELD, CMD_TAKEOFF, CMD_DROP\nCMD_CAST, CMD_STUDY, CMD_USE_STAFF\nCMD_EAT, CMD_QUAFF, CMD_READ_SCROLL\nCMD_FIRE, CMD_THROW, CMD_OPEN, CMD_CLOSE\nCMD_TUNNEL, CMD_DISARM, CMD_REST..."

    note for source "効果の発生源を示す\n罠/プレイヤー/モンスター/\nオブジェクト/宝箱罠"
```

---

## 2. シーケンス図

### 2.1 メインゲームループ

```mermaid
sequenceDiagram
    participant Main as main.c
    participant UIGame as ui-game.c
    participant World as game-world.c
    participant CmdCore as cmd-core.c
    participant MonMove as mon-move.c
    participant Player as player.c

    Main->>UIGame: play_game(mode)
    UIGame->>UIGame: start_game(new_game)

    loop メインゲームループ (while playing && !is_dead)
        UIGame->>UIGame: pre_turn_refresh()
        UIGame->>UIGame: textui_get_cmd(CTX_GAME)
        UIGame->>UIGame: textui_process_command()
        UIGame->>CmdCore: cmdq_push_repeat(cmd, count)
        UIGame->>World: run_game_loop()

        rect rgb(200, 230, 255)
            Note over World: Phase 1: プレイヤー処理
            World->>World: process_player_cleanup()
            loop until energy_use > 0
                World->>World: process_player()
                World->>CmdCore: cmdq_pop(CTX_GAME)
                CmdCore->>CmdCore: process_command(ctx, cmd)
                CmdCore-->>World: energy_use設定
            end
        end

        rect rgb(255, 230, 200)
            Note over World: Phase 2: 高速モンスター
            World->>MonMove: process_monsters(player.energy + 1)
            loop 高エネルギーモンスター
                MonMove->>MonMove: monster_turn(mon)
            end
        end

        rect rgb(230, 255, 200)
            Note over World: Phase 3: ワールド処理ループ
            loop while playing
                World->>MonMove: process_monsters(0)
                MonMove->>MonMove: reset_monsters()
                alt every 10 turns
                    World->>World: process_world(cave)
                    Note over World: HP/MP回復, 空腹,<br/>モンスター自然生成,<br/>毒/傷ダメージ
                end
                World->>Player: energy += turn_energy(speed)
                World->>World: turn++
                alt generate_level要求
                    World->>World: prepare_next_level()
                end
            end
        end
    end

    UIGame->>UIGame: close_game(true)
```

### 2.2 コマンド入力〜実行フロー

```mermaid
sequenceDiagram
    participant Term as ui-term.c
    participant Input as ui-input.c
    participant UIGame as ui-game.c
    participant CmdCore as cmd-core.c
    participant CmdCave as cmd-cave.c
    participant CmdObj as cmd-obj.c

    Term->>Input: inkey() [キー入力待ち]
    Input-->>UIGame: keypress

    UIGame->>UIGame: textui_get_command(&count)
    UIGame->>UIGame: textui_process_key(key)
    Note over UIGame: converted_list[mode][key]<br/>でコマンド検索

    alt 移動コマンド (方向キー/vi keys)
        UIGame->>CmdCore: cmdq_push(CMD_WALK)
        CmdCore->>CmdCave: do_cmd_walk(cmd)
        CmdCave->>CmdCave: move_player(dir)
        Note over CmdCave: 壁判定, ドア開放,<br/>モンスター攻撃,<br/>罠発動
    else アイテムコマンド
        UIGame->>CmdCore: cmdq_push(CMD_USE/WIELD/etc)
        CmdCore->>CmdObj: do_cmd_use(cmd)
        CmdObj->>CmdObj: アイテム選択UI
        CmdObj->>CmdObj: 効果適用
    else 階段コマンド
        UIGame->>CmdCore: cmdq_push(CMD_GO_DOWN)
        CmdCore->>CmdCave: do_cmd_go_down(cmd)
        Note over CmdCave: generate_level = true
    end

    CmdCore-->>UIGame: energy_use設定
```

### 2.3 モンスターAI処理フロー

```mermaid
sequenceDiagram
    participant World as game-world.c
    participant Move as mon-move.c
    participant Attack as mon-attack.c
    participant Blow as mon-blows.c
    participant Spell as mon-spell.c
    participant Timed as mon-timed.c

    World->>Move: process_monsters(minimum_energy)

    loop 各モンスター (逆順ループ)
        Move->>Move: cave_monster(cave, i)

        alt MFLAG_HANDLED済み
            Note over Move: スキップ
        else エネルギー不足
            Move->>Move: energy += turn_energy(speed)
            Note over Move: continue
        else 十分なエネルギー
            Move->>Move: energy -= move_energy
            Move->>Move: set MFLAG_HANDLED

            alt 100ターンごと
                Move->>Move: regen_monster(mon, 1)
            end

            Move->>Timed: process_monster_timed(mon)
            Note over Timed: 混乱, 恐怖, 睡眠,<br/>加速, 減速, etc.

            Move->>Move: monster_turn(mon)

            alt プレイヤー視認 && 呪文発動可能
                Move->>Spell: make_ranged_attack(mon)
                Spell->>Spell: 呪文選択 (freq_spell確率)
                Spell->>Spell: spell効果適用
            else プレイヤー隣接
                Move->>Attack: make_attack_normal(mon, player)
                loop 各blow
                    Attack->>Blow: blow判定 (hit/miss)
                    Blow->>Blow: ダメージ計算 (dice + AC軽減)
                    Blow->>Blow: 追加効果 (毒, 混乱, etc.)
                end
            else 移動可能
                Move->>Move: get_move(mon, &dir)
                Note over Move: ヒートマップ/LOS/<br/>匂い/聴覚で方向決定
                Move->>Move: monster_swap(grid, new_grid)
            else
                Note over Move: 待機
            end

            Move->>Move: monster_take_terrain_damage(mon)
        end
    end
```

### 2.4 ダンジョン生成フロー

```mermaid
sequenceDiagram
    participant World as game-world.c
    participant Gen as generate.c
    participant Cave as gen-cave.c
    participant Room as gen-room.c
    participant MonGen as gen-monster.c
    participant Util as gen-util.c

    World->>Gen: prepare_next_level(player)

    alt 永続レベル有効 && 既存レベルあり
        Gen->>Gen: chunk_find_name(level_name)
        Gen-->>World: 既存chunk返却
    else 新規生成
        Gen->>Gen: cave_generate(player, h, w)

        Gen->>Gen: choose_profile(player)
        Note over Gen: moria / angband / lair /<br/>gauntlet / hard_centre / etc.

        loop 最大100回試行
            Gen->>Cave: profile->builder(p, h, w)

            rect rgb(230, 240, 255)
                Note over Cave: 部屋生成
                Cave->>Room: room_build(dun, typ)
                loop 各部屋
                    Room->>Room: テンプレート選択
                    Room->>Room: 部屋配置 + ドア設置
                end
            end

            rect rgb(240, 255, 230)
                Note over Cave: トンネル接続
                Cave->>Util: トンネル掘削
                Cave->>Util: 壁/床配置
            end

            rect rgb(255, 240, 230)
                Note over Cave: エンティティ配置
                Cave->>MonGen: pick_and_place_monster(c, loc, depth)
                Cave->>Gen: place_object(c, loc, level, good, great)
                Cave->>Util: place_stairs(c, feat)
                Cave->>Util: place_traps(c)
            end

            alt 生成成功
                Gen->>Gen: place_feeling(chunk)
                Gen->>Gen: calc_obj/mon_feeling(chunk)
                Gen-->>World: 新chunk返却
            else 失敗 (モンスター超過等)
                Note over Gen: 再試行
            end
        end
    end
```

### 2.5 セーブ/ロード フロー

```mermaid
sequenceDiagram
    participant UI as ui-game.c
    participant Save as savefile.c
    participant Load as load.c
    participant File as z-file.c

    rect rgb(200, 230, 255)
        Note over UI,File: セーブフロー
        UI->>Save: save_game()
        Save->>Save: save_charoutput()
        Save->>Save: player.died_from = "(saved)"
        Save->>File: 一時ファイル作成
        Save->>Save: プレイヤーデータ書き込み
        Save->>Save: ダンジョンデータ書き込み
        Save->>File: atomic rename → savefile
        Save-->>UI: success/failure
    end

    rect rgb(255, 230, 200)
        Note over UI,File: ロードフロー
        UI->>UI: start_game()
        UI->>Save: savefile_load(path, cheat_death)
        Save->>File: ファイルオープン
        Save->>Load: ヘッダ解析
        Save->>Load: プレイヤーデータ読み込み
        Load->>Load: race/class復元
        Load->>Load: 装備/インベントリ復元
        Save->>Load: ダンジョンデータ読み込み
        Load-->>UI: success/failure

        alt パニックセーブ検出
            UI->>Save: panicfile確認
            Save-->>UI: panic save復元
        end
    end
```

### 2.6 キャラクター作成（Birth）フロー

```mermaid
sequenceDiagram
    participant UI as ui-birth.c
    participant Birth as player-birth.c
    participant CmdCore as cmd-core.c
    participant Race as player-race.c
    participant Class as player-class.c

    UI->>UI: textui_do_birth()

    rect rgb(230, 240, 255)
        Note over UI: Birth状態マシン
        UI->>CmdCore: CMD_BIRTH_INIT
        UI->>CmdCore: CMD_BIRTH_RESET

        loop BIRTH_QUICKSTART
            UI->>UI: クイックスタート確認
        end

        loop BIRTH_RACE_CHOICE
            UI->>UI: 種族一覧表示
            UI->>CmdCore: CMD_CHOOSE_RACE
            CmdCore->>Race: 種族パラメータ適用
        end

        loop BIRTH_CLASS_CHOICE
            UI->>UI: 職業一覧表示
            UI->>CmdCore: CMD_CHOOSE_CLASS
            CmdCore->>Class: 職業パラメータ適用
        end

        loop BIRTH_ROLLER_CHOICE
            UI->>UI: ロール方式選択 (ポイント購入 or ランダム)
        end

        alt BIRTH_POINTBASED
            loop ポイント購入
                UI->>CmdCore: CMD_BUY_STAT / CMD_SELL_STAT
            end
        else BIRTH_ROLLER
            loop ランダムロール
                UI->>CmdCore: CMD_RESET_STATS
            end
        end

        loop BIRTH_NAME_CHOICE
            UI->>UI: 名前入力
        end

        UI->>UI: BIRTH_HISTORY_CHOICE (背景選択)
        UI->>UI: BIRTH_FINAL_CONFIRM (最終確認)
        UI->>UI: BIRTH_COMPLETE (完了)
    end

    UI->>CmdCore: CMD_ACCEPT_CHARACTER
    CmdCore->>Birth: 初期装備付与
    CmdCore->>Birth: 初期呪文設定
    Note over Birth: ゲーム開始へ
```

---

## 3. 状態遷移図

### 3.1 ゲーム全体の状態遷移

```mermaid
stateDiagram-v2
    [*] --> Init : main()起動

    Init --> Birth : 新規ゲーム
    Init --> LoadSave : セーブファイル存在
    Init --> PanicRecover : パニックセーブ検出

    LoadSave --> GameLoop : ロード成功
    LoadSave --> Birth : ロード失敗/新規選択
    PanicRecover --> GameLoop : 復元成功

    Birth --> RaceSelect
    RaceSelect --> ClassSelect
    ClassSelect --> StatRoll
    StatRoll --> HistorySelect
    HistorySelect --> Confirm
    Confirm --> RaceSelect : やり直し
    Confirm --> GameLoop : CMD_ACCEPT_CHARACTER

    state GameLoop {
        [*] --> PreTurnRefresh

        PreTurnRefresh --> WaitInput : 画面更新完了
        WaitInput --> ProcessCommand : キー入力受信
        ProcessCommand --> PlayerTurn : コマンドキュー処理

        state PlayerTurn {
            [*] --> ExecuteCommand
            ExecuteCommand --> CheckEnergy
            CheckEnergy --> ExecuteCommand : energy_use == 0 (無料行動)
            CheckEnergy --> [*] : energy_use > 0
        }

        PlayerTurn --> MonsterPhase : プレイヤー行動完了

        state MonsterPhase {
            [*] --> HighEnergyMonsters
            HighEnergyMonsters --> AllMonsters
            AllMonsters --> ResetFlags
            ResetFlags --> [*]
        }

        MonsterPhase --> WorldPhase

        state WorldPhase {
            [*] --> CheckTurn
            CheckTurn --> ProcessWorld : turn % 10 == 0
            CheckTurn --> GiveEnergy : else
            ProcessWorld --> GiveEnergy
            GiveEnergy --> AdvanceTurn
            AdvanceTurn --> [*]
        }

        WorldPhase --> CheckLevelChange
        CheckLevelChange --> GenerateLevel : generate_level == true
        CheckLevelChange --> PreTurnRefresh : same level
        GenerateLevel --> PreTurnRefresh
    }

    GameLoop --> Death : player.is_dead
    GameLoop --> Victory : total_winner
    GameLoop --> SaveQuit : セーブ & 終了

    Death --> DeathScreen : 墓碑表示
    DeathScreen --> HighScore : スコア記録
    HighScore --> [*]

    Victory --> VictoryScreen
    VictoryScreen --> HighScore

    SaveQuit --> [*]
```

### 3.2 モンスターAI状態遷移

```mermaid
stateDiagram-v2
    [*] --> Sleeping : 初期状態 (sleep値)

    Sleeping --> Alert : 聴覚/匂い/視覚で検知
    Sleeping --> Sleeping : 検知失敗

    Alert --> CheckRange

    state CheckRange {
        [*] --> CalcDistance
        CalcDistance --> InSpellRange : cdis <= spell_range && freq確率
        CalcDistance --> Adjacent : cdis == 1
        CalcDistance --> Approaching : プレイヤー方向
        CalcDistance --> Fleeing : HP < 閾値 && SMART
    }

    InSpellRange --> CastSpell : 呪文選択成功
    CastSpell --> ProcessTimed

    Adjacent --> MeleeAttack : make_attack_normal()
    state MeleeAttack {
        [*] --> Blow1
        Blow1 --> Blow2 : 次のblow
        Blow2 --> Blow3 : 次のblow
        Blow3 --> Blow4 : 次のblow
        Blow4 --> [*]
        Blow1 --> [*] : blows終了
        Blow2 --> [*] : blows終了
        Blow3 --> [*] : blows終了
    }
    MeleeAttack --> ProcessTimed

    Approaching --> MoveToward : 経路探索成功
    Approaching --> Wander : 経路なし
    MoveToward --> ProcessTimed
    Wander --> ProcessTimed

    Fleeing --> MoveAway : 逃走経路あり
    Fleeing --> Cornered : 逃走不可
    MoveAway --> ProcessTimed
    Cornered --> MeleeAttack : やむなく攻撃

    state ProcessTimed {
        [*] --> CheckConfusion
        CheckConfusion --> RandomMove : 混乱中
        CheckConfusion --> CheckFear
        CheckFear --> ForceFlee : 恐怖中
        CheckFear --> CheckStun
        CheckStun --> SkipAction : 気絶中 (確率)
        CheckStun --> Done
        RandomMove --> Done
        ForceFlee --> Done
        SkipAction --> Done
        Done --> [*]
    }

    ProcessTimed --> TerrainDamage : 溶岩/水等
    TerrainDamage --> [*] : HP <= 0 (死亡)
    TerrainDamage --> Sleeping : ターン終了 (エネルギー消費)
    TerrainDamage --> Alert : 次ターンも行動可能
```

### 3.3 エネルギーシステム

```mermaid
stateDiagram-v2
    [*] --> Accumulate : ターン開始

    state Accumulate {
        [*] --> CalcSpeed
        CalcSpeed --> LookupTable : extract_energy[speed]
        Note right of LookupTable : speed 0-59 → 1 energy\nspeed 100 → 10 energy\nspeed 120 → 20 energy\nspeed 150+ → 45-49 energy
        LookupTable --> AddEnergy : energy += turn_energy(speed)
        AddEnergy --> [*]
    }

    Accumulate --> CheckThreshold

    state CheckThreshold {
        [*] --> Compare
        Compare --> CanAct : energy >= move_energy(100)
        Compare --> Wait : energy < move_energy(100)
    }

    CanAct --> ExecuteAction
    ExecuteAction --> DeductEnergy : energy -= move_energy
    DeductEnergy --> CheckThreshold : まだ行動可能？
    Wait --> Accumulate : 次ターン

    note right of ExecuteAction
        プレイヤー: コマンド実行
        モンスター: AI行動
        高速キャラは1ターンで複数行動
        低速キャラは数ターンに1回行動
    end note
```

### 3.4 プレイヤー入力処理の状態遷移

```mermaid
stateDiagram-v2
    [*] --> WaitKey : inkey()

    WaitKey --> MapKey : キー入力
    MapKey --> CheckMode

    state CheckMode {
        [*] --> OriginalKeyset : mode == KEYMAP_MODE_ORIG
        [*] --> RoguelikeKeyset : mode == KEYMAP_MODE_ROGUE
        OriginalKeyset --> LookupCommand
        RoguelikeKeyset --> LookupCommand
    }

    LookupCommand --> FoundCommand : converted_list[mode][key]
    LookupCommand --> UnknownKey : 未登録キー

    UnknownKey --> WaitKey : エラーメッセージ表示

    FoundCommand --> NeedsDirection : 方向要求コマンド
    FoundCommand --> NeedsTarget : ターゲット要求コマンド
    FoundCommand --> NeedsItem : アイテム選択コマンド
    FoundCommand --> Immediate : 即時実行コマンド

    NeedsDirection --> WaitKey : 方向キー待ち
    NeedsDirection --> QueueCommand : 方向入力完了
    NeedsTarget --> TargetUI : ターゲットモード
    TargetUI --> QueueCommand : ターゲット選択完了
    NeedsItem --> ItemSelectUI : アイテム一覧表示
    ItemSelectUI --> QueueCommand : アイテム選択完了
    Immediate --> QueueCommand

    QueueCommand --> cmdq_push : コマンドキューに追加
    cmdq_push --> [*] : 実行へ

    note right of QueueCommand
        nrepeats > 0 なら
        cmdq_push_repeat()で
        リピート登録
    end note
```

### 3.5 投射（Projection）処理の状態遷移

```mermaid
stateDiagram-v2
    [*] --> DetermineType

    state DetermineType {
        [*] --> Bolt : PROJECT_STOP
        [*] --> Beam : PROJECT_BEAM
        [*] --> Ball : PROJECT_ARC + radius
        [*] --> Breath : PROJECT_ARC + arc
        [*] --> Line : PROJECT_BEAM + long range
    }

    DetermineType --> CalcPath
    CalcPath --> TracePath : project_path()

    state TracePath {
        [*] --> NextGrid
        NextGrid --> CheckWall : グリッド判定
        CheckWall --> Blocked : 壁 && !PROJECT_PASS
        CheckWall --> CheckMonster : 通過可能
        CheckMonster --> HitMonster : PROJECT_STOP && monster
        CheckMonster --> NextGrid : 通過
        HitMonster --> [*]
        Blocked --> [*]
        NextGrid --> Reached : 最大距離到達
        Reached --> [*]
    }

    TracePath --> CalcArea

    state CalcArea {
        [*] --> SingleCell : Bolt/Hit
        [*] --> LineOfCells : Beam/Line
        [*] --> CircularArea : Ball
        [*] --> ConeArea : Breath
    }

    CalcArea --> ApplyEffects

    state ApplyEffects {
        [*] --> CheckFeature
        CheckFeature --> project_feat : 地形変化
        project_feat --> CheckObjects
        CheckObjects --> project_obj : アイテム破壊
        project_obj --> CheckMonsters
        CheckMonsters --> project_mon : モンスターダメージ
        project_mon --> CheckPlayer
        CheckPlayer --> project_player : プレイヤーダメージ
        project_player --> [*]
    }

    ApplyEffects --> VisualEffect : PROJECT_SEEN
    VisualEffect --> [*]
```

---

## 4. モジュール構成図

### 4.1 アーキテクチャレイヤー

```mermaid
graph TB
    subgraph "UI Layer (40 files)"
        UIBirth[ui-birth.c]
        UIGame[ui-game.c]
        UIDisplay[ui-display.c]
        UIMap[ui-map.c]
        UIStore[ui-store.c]
        UIMenu[ui-menu.c]
        UIInput[ui-input.c]
        UIOther[ui-*.c (30+ files)]
    end

    subgraph "Game Logic Layer"
        CmdCore[cmd-core.c<br/>コマンドキュー&ディスパッチ]
        CmdCave[cmd-cave.c<br/>移動/地形コマンド]
        CmdObj[cmd-obj.c<br/>アイテムコマンド]
        CmdMisc[cmd-misc.c<br/>休憩/探索等]
        Effects[effects.c<br/>エフェクト処理]
        Project[project.c<br/>投射/範囲処理]
    end

    subgraph "Game State Layer"
        Player[player.c<br/>プレイヤー状態]
        PlayerCalcs[player-calcs.c<br/>ステータス計算]
        Monster["mon-*.c (15 files)<br/>モンスターAI/攻撃/移動"]
        Object["obj-*.c (17 files)<br/>アイテム生成/管理"]
        Cave["cave*.c (4 files)<br/>ダンジョン/視界"]
        Store[store.c<br/>ショップ]
    end

    subgraph "World Management"
        GameWorld[game-world.c<br/>ゲームループ/ターン管理]
        Generate["gen-*.c (5 files)<br/>ダンジョン生成"]
        SaveLoad[save.c / load.c<br/>セーブ/ロード]
    end

    subgraph "Event System"
        GameEvent[game-event.c<br/>Pub/Subイベント]
    end

    subgraph "Terminal Abstraction"
        UITerm[ui-term.c<br/>仮想ターミナル]
    end

    subgraph "Platform Frontends"
        MainGCU[main-gcu.c<br/>NCurses]
        MainSDL[main-sdl2.c<br/>SDL2]
        MainX11[main-x11.c<br/>X11]
        MainWin[main-win.c<br/>Windows]
        MainNDS[main-nds.c<br/>NDS]
    end

    subgraph "Data Loading"
        Parser[parser.c<br/>汎用パーサー]
        Datafile[datafile.c<br/>データファイル読込]
        Init[init.c<br/>初期化/全データ読込]
    end

    subgraph "Z-Layer Utilities (13 files)"
        ZRand[z-rand.c<br/>乱数生成]
        ZVirt[z-virt.c<br/>メモリ管理]
        ZFile[z-file.c<br/>ファイルI/O]
        ZDice[z-dice.c<br/>ダイス式]
        ZOther[z-*.c (9 files)]
    end

    UIGame --> CmdCore
    UIGame --> GameWorld
    CmdCore --> CmdCave
    CmdCore --> CmdObj
    CmdCore --> CmdMisc
    CmdCave --> Player
    CmdCave --> Cave
    CmdObj --> Object
    CmdObj --> Effects
    Effects --> Project
    GameWorld --> Monster
    GameWorld --> Generate
    GameWorld --> Player
    GameEvent -.-> UIDisplay
    GameEvent -.-> UIMap
    UITerm --> MainGCU
    UITerm --> MainSDL
    UITerm --> MainX11
    UITerm --> MainWin
    Init --> Parser
    Init --> Datafile
    Monster --> Cave
    Object --> ZDice
    Generate --> Cave
```

### 4.2 モジュールファイル分類

```mermaid
graph LR
    subgraph "cmd-* (7)"
        cmd1[cmd-core.c]
        cmd2[cmd-cave.c]
        cmd3[cmd-obj.c]
        cmd4[cmd-misc.c]
        cmd5[cmd-pickup.c]
        cmd6[cmd-spoil.c]
        cmd7[cmd-wizard.c]
    end

    subgraph "mon-* (15)"
        mon1[mon-attack.c]
        mon2[mon-blows.c]
        mon3[mon-desc.c]
        mon4[mon-group.c]
        mon5[mon-init.c]
        mon6[mon-list.c]
        mon7[mon-lore.c]
        mon8[mon-make.c]
        mon9[mon-move.c]
        mon10[mon-msg.c]
        mon11[mon-predicate.c]
        mon12[mon-spell.c]
        mon13[mon-summon.c]
        mon14[mon-timed.c]
        mon15[mon-util.c]
    end

    subgraph "obj-* (17)"
        obj1[obj-chest.c]
        obj2[obj-curse.c]
        obj3[obj-desc.c]
        obj4[obj-gear.c]
        obj5[obj-ignore.c]
        obj6[obj-info.c]
        obj7[obj-init.c]
        obj8[obj-knowledge.c]
        obj9[obj-list.c]
        obj10[obj-make.c]
        obj11[obj-pile.c]
        obj12[obj-power.c]
        obj13[obj-properties.c]
        obj14[obj-randart.c]
        obj15[obj-slays.c]
        obj16[obj-tval.c]
        obj17[obj-util.c]
    end

    subgraph "player-* (13)"
        p1[player.c]
        p2[player-attack.c]
        p3[player-birth.c]
        p4[player-calcs.c]
        p5[player-class.c]
        p6[player-history.c]
        p7[player-path.c]
        p8[player-properties.c]
        p9[player-quest.c]
        p10[player-race.c]
        p11[player-spell.c]
        p12[player-timed.c]
        p13[player-util.c]
    end

    subgraph "gen-* (5+)"
        g1[generate.c]
        g2[gen-cave.c]
        g3[gen-chunk.c]
        g4[gen-monster.c]
        g5[gen-room.c]
        g6[gen-util.c]
    end

    subgraph "project-* (5)"
        pr1[project.c]
        pr2[project-feat.c]
        pr3[project-mon.c]
        pr4[project-obj.c]
        pr5[project-player.c]
    end

    subgraph "main-* (12)"
        m1[main.c]
        m2[main-gcu.c]
        m3[main-sdl.c]
        m4[main-sdl2.c]
        m5[main-x11.c]
        m6[main-win.c]
        m7["main-*.c (others)"]
    end
```

### 4.3 データ駆動アーキテクチャ

```mermaid
graph TB
    subgraph "テキストデータファイル (.txt)"
        MonsterTxt[monster.txt<br/>モンスター定義]
        MonsterBaseTxt[monster_base.txt<br/>基本種族]
        ObjectTxt[object.txt<br/>アイテム定義]
        ObjectBaseTxt[object_base.txt<br/>基本種別]
        ArtifactTxt[artifact.txt<br/>アーティファクト]
        EgoTxt[ego_item.txt<br/>エゴアイテム]
        VaultTxt[vault.txt<br/>Vaultテンプレート]
        PlayerRaceTxt[p_race.txt<br/>種族データ]
        PlayerClassTxt[class.txt<br/>職業データ]
        SpellTxt[spell.txt<br/>呪文データ]
        TrapTxt[trap.txt<br/>罠データ]
        FeatureTxt[terrain.txt<br/>地形データ]
        StoreTxt[store.txt<br/>店データ]
        EffectTxt[effects.txt<br/>効果データ]
        OtherTxt["50+ other .txt files"]
    end

    subgraph "パーサーシステム"
        Parser[parser.c<br/>行ベース汎用パーサー]
        Datafile[datafile.c<br/>Angband固有パーサー]
        Init[init.c<br/>全データ初期化]
    end

    subgraph "ゲーム内構造体"
        MRace[monster_race配列]
        OKind[object_kind配列]
        ArtArray[artifact配列]
        EgoArray[ego_item配列]
        Feats[feature配列]
        Traps[trap_kind配列]
        Races[player_race リスト]
        Classes[player_class リスト]
    end

    MonsterTxt --> Parser
    ObjectTxt --> Parser
    ArtifactTxt --> Parser
    VaultTxt --> Parser
    PlayerRaceTxt --> Parser
    PlayerClassTxt --> Parser
    FeatureTxt --> Parser
    OtherTxt --> Parser

    Parser --> Datafile
    Datafile --> Init

    Init --> MRace
    Init --> OKind
    Init --> ArtArray
    Init --> EgoArray
    Init --> Feats
    Init --> Traps
    Init --> Races
    Init --> Classes
```

---

## 付録: C版 vs TS版 主要な設計差異

| 観点 | C版 (Original) | TS版 (Port) |
|------|----------------|-------------|
| **状態管理** | グローバル変数 (`player`, `cave`, `turn`) | `GameState`オブジェクト（集約） |
| **関数ディスパッチ** | 関数ポインタ + コマンドキュー | async/await + switch文 |
| **イベントシステム** | `game-event.c` (C関数ポインタ) | `EventBus` (TypeScript) |
| **UI抽象化** | `ui-term.c` (仮想ターミナル + フロントエンド) | `Terminal` class (Canvas直接描画) |
| **プラットフォーム** | Curses / SDL2 / X11 / Windows / NDS | Webブラウザ (Canvas) |
| **データ読込** | テキスト `.txt` ファイル + 行パーサー | JSON ファイル + TypeScript import |
| **乱数** | WELL512a (`z-rand.c`) | カスタムRNG (`rand.ts`) |
| **メモリ管理** | `z-virt.c` (手動malloc/free) | GC (JavaScript自動管理) |
| **セーブ形式** | バイナリ savefile | JSON → localStorage |
| **ファイル数** | 164 .c + 168 .h = 332 files | 97 .ts source + 54 .test.ts files |
| **視界(FOV)** | `cave-view.c` (整数ベースBresenham) | `view.ts` (Symmetric Shadowcasting, 実装済み) |
| **モンスターAI** | ヒートマップ + 匂い + 聴覚 + 個別flow | チャンクレベル音/匂いBFS + 距離ベース (heatmap.ts 実装済み) |
| **投射(Projection)** | `project.c` (完全実装 bolt/beam/ball/breath) | `project.ts` (コア実装済、UIアニメーション未対応) |
| **呪文システム** | データファイル駆動 + `effect`チェーン | エフェクト35/119実装、spell-flagsデータ未パース |
| **ショップ** | 完全実装（8店舗 + 自宅） | store.ts コア完成、町マップ/UI未接続 |
