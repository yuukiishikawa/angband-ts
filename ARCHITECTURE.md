# Angband-TS アーキテクチャ図

## 1. クラス図（型・インターフェース関係）

### 1-1. コアエンティティ関係図

```mermaid
classDiagram
    direction TB

    class GameState {
        +Player player
        +Chunk chunk
        +Monster[] monsters
        +MonsterRace[] monsterRaces
        +GameMessage[] messages
        +EventBus eventBus
        +RNG rng
        +number depth
        +number turn
        +boolean running
        +boolean dead
        +boolean won
    }

    class Player {
        +PlayerRace race
        +PlayerClass class
        +PlayerBody body
        +PlayerShape shape?
        +PlayerState state
        +PlayerUpkeep upkeep
        +Loc grid
        +number chp / mhp
        +number csp / msp
        +number energy
        +number lev / exp
        +number au
        +number food
        +number[] timed
        +number[] statMax / statCur
        +boolean isDead
        +boolean totalWinner
        +string fullName
        +string diedFrom
    }

    class PlayerRace {
        +string name
        +number ridx
        +number hitDice
        +number expFactor
        +number[] statAdj
        +number[] skills
        +BitFlag flags
        +ElementInfo[] elInfo
    }

    class PlayerClass {
        +string name
        +number cidx
        +number hitDice
        +number expFactor
        +number[] statAdj
        +ClassMagic magic
        +StartItem[] startItems
        +number maxAttacks
    }

    class PlayerState {
        +number speed
        +number ac / toA / toH / toD
        +number numBlows
        +number curLight
        +number[] statInd / statUse
        +number[] skills
        +BitFlag flags
    }

    class PlayerUpkeep {
        +boolean playing
        +boolean generateLevel
        +number energyUse
        +number newSpells
        +number resting / running
    }

    class ClassMagic {
        +number spellFirst
        +number totalSpells
        +ClassBook[] books
    }

    class ClassSpell {
        +string name
        +number sidx
        +number slevel
        +number smana
        +number sfail
    }

    GameState --> Player
    GameState --> Chunk
    GameState --> EventBus
    GameState --> RNG
    GameState "1" --> "*" Monster : monsters
    GameState "1" --> "*" MonsterRace : monsterRaces
    Player --> PlayerRace
    Player --> PlayerClass
    Player --> PlayerState
    Player --> PlayerUpkeep
    Player --> PlayerBody
    PlayerClass --> ClassMagic
    ClassMagic "1" --> "*" ClassSpell : books.spells
```

### 1-2. モンスター型関係図

```mermaid
classDiagram
    direction TB

    class Monster {
        +MonsterRace race
        +MonsterRace originalRace?
        +MonsterId midx
        +Loc grid
        +number hp / maxhp
        +number mspeed
        +number energy
        +number cdis
        +Int16Array mTimed
        +BitFlag mflag
        +MonsterTarget target
    }

    class MonsterRace {
        +MonsterRaceId ridx
        +string name
        +MonsterBase base
        +number avgHp / ac
        +number speed / level
        +number rarity
        +number freqInnate / freqSpell
        +MonsterBlow[] blows
        +BitFlag flags
        +BitFlag spellFlags
        +number dAttr / dChar
        +number maxNum
        +number curNum
        +MonsterDrop[] drops
        +MonsterFriend[] friends
    }

    class MonsterBase {
        +string name
        +string text
        +BitFlag flags
        +number dChar
    }

    class MonsterBlow {
        +BlowMethod method
        +BlowEffect effect
        +RandomValue dice
    }

    class MonsterDrop {
        +number kindIdx
        +number tval
        +number percentChance
        +number min / max
    }

    class MonsterTarget {
        +Loc grid
        +MonsterId midx
    }

    Monster --> MonsterRace : race
    Monster --> MonsterTarget
    MonsterRace --> MonsterBase : base
    MonsterRace "1" --> "0..4" MonsterBlow : blows
    MonsterRace "1" --> "*" MonsterDrop : drops
```

### 1-3. ダンジョン（Chunk/Square）型関係図

```mermaid
classDiagram
    direction TB

    class Chunk {
        +string name
        +number depth
        +number height / width
        +Square[][] squares
        +Monster[] monsters
        +Heatmap noise / scent
        +number monMax / monCnt
        +number objMax
        +number feeling
        +number objRating / monRating
        +Int32Array featCount
    }

    class Square {
        +FeatureId feat
        +BitFlag info
        +number light
        +MonsterId mon
        +ObjectId obj?
        +TrapId trap?
    }

    class Heatmap {
        +Uint16Array[] grids
    }

    class Feat {
        <<enumeration>>
        NONE
        FLOOR
        CLOSED / OPEN / BROKEN
        LESS / MORE
        GRANITE / PERM
        RUBBLE / MAGMA / QUARTZ
        LAVA
        SECRET
        STORE_GENERAL..HOME
    }

    class SquareFlag {
        <<enumeration>>
        MARK
        GLOW
        VAULT / ROOM
        SEEN / VIEW / WASSEEN
        TRAP / INVIS
        WALL_INNER / WALL_OUTER
        PROJECT
        CLOSE_PLAYER
    }

    Chunk "1" --> "*" Square : squares[y][x]
    Chunk --> Heatmap : noise, scent
    Chunk "1" --> "*" Monster : monsters
    Square ..> Feat : feat
    Square ..> SquareFlag : info flags
```

### 1-4. Web UIレイヤー クラス図

```mermaid
classDiagram
    direction TB

    class GameBridge {
        -CanvasRenderer renderer
        -Terminal terminal
        -KeyboardInputProvider input
        -GameState state
        -number cameraX / cameraY
        -string pendingDirectionCmd?
        +start() Promise~void~
        +getCommand() Promise~GameCommand~
        -drawAll()
        -drawMap()
        -drawStatus()
        -drawMessages()
        -updateCamera()
        -showTombstone()
        -showVictoryScreen()
        -showInventoryScreen()
        -selectInventoryItem() Promise~number~
        -selectSpell() Promise~number~
        -saveToLocalStorage()
        +hasSavedGame()$ boolean
        +clearSave()$
    }

    class Terminal {
        +number cols / rows
        -TerminalCell[][] cells
        +putChar(x, y, ch, fg, bg)
        +putString(x, y, text, fg, bg)
        +clear()
        +clearDirty()
    }

    class CanvasRenderer {
        -HTMLCanvasElement canvas
        -CanvasRenderingContext2D ctx
        -number cellWidth / cellHeight
        +render(terminal)
        +resize(cols, rows)
        +clearCanvas()
    }

    class KeyboardInputProvider {
        -PendingKey[] keyQueue
        -string lastCommand?
        -number lastDirection?
        +onKeypress callback?
        +consumeCommand() string?
        +consumeDirection() number?
        +request(req) Promise~InputResponse~
        +flush()
    }

    class CommandInputProvider {
        <<interface>>
        +getCommand() Promise~GameCommand~
    }

    GameBridge ..|> CommandInputProvider
    GameBridge --> Terminal
    GameBridge --> CanvasRenderer
    GameBridge --> KeyboardInputProvider
    GameBridge --> GameState
    CanvasRenderer --> Terminal : render()
```

### 1-5. コマンドシステム型関係図

```mermaid
classDiagram
    direction LR

    class CommandType {
        <<enumeration>>
        WALK
        RUN
        OPEN / CLOSE
        TUNNEL / DISARM
        SEARCH
        GO_UP / GO_DOWN
        ATTACK
        FIRE / THROW
        CAST
        EAT / QUAFF / READ
        AIM / ZAP
        PICKUP / DROP
        EQUIP / UNEQUIP
        REST
    }

    class GameCommand {
        <<discriminated union>>
        +CommandType type
        +number direction?
        +Loc target?
        +number itemIndex?
        +number spellIndex?
    }

    class CommandResult {
        +boolean success
        +number energyCost
        +string[] messages
    }

    class AttackResult {
        +boolean hit
        +number damage
        +BlowEffect effect
        +BlowMethod method
        +string message
        +BlowEffectResult effectResult?
        +number critical
    }

    class BlowEffectResult {
        +number damage
        +StatusEffect statusEffect?
        +string message
    }

    GameCommand ..> CommandType
    GameCommand --> CommandResult : executeCommand()
    AttackResult --> BlowEffectResult
```

---

## 2. シーケンス図

### 2-1. メインゲームループ（1ターンの流れ）

```mermaid
sequenceDiagram
    participant GL as runGameLoop
    participant FOV as updateView
    participant EB as EventBus
    participant PP as processPlayer
    participant GB as GameBridge
    participant KB as KeyboardInput
    participant EC as executeCommand
    participant PM as processMonsters
    participant MT as monsterTakeTurn
    participant MA as monsterAttackPlayer
    participant PW as processWorld
    participant CL as changeLevel

    GL->>FOV: updateView(chunk, player.grid)
    FOV-->>GL: FOV flags updated (SEEN/VIEW)

    GL->>EB: emit(REFRESH)
    EB-->>GB: → drawAll() + doRender()

    alt player.energy >= MOVE_ENERGY
        GL->>PP: processPlayer(state, input)
        PP->>GB: await getCommand()
        GB->>KB: waitForKey()
        KB-->>GB: KeyboardEvent
        GB->>GB: consumeDirection / consumeCommand
        GB-->>PP: GameCommand

        PP->>EC: executeCommand(cmd, player, chunk, rng)
        EC-->>PP: CommandResult {success, energyCost, messages}
        PP->>PP: player.energy -= energyCost
        PP-->>GL: usedEnergy: boolean

        alt player.isDead
            GL->>GL: break (death)
        end
        alt player.totalWinner
            GL->>GL: break (victory)
        end
        alt !usedEnergy
            GL->>GL: continue (re-prompt)
        end
    end

    GL->>PM: processMonsters(state, monsters)
    loop each living monster
        PM->>PM: mon.energy += turnEnergy(mspeed)
        loop mon.energy >= MOVE_ENERGY
            PM->>MT: monsterTakeTurn(chunk, mon, playerLoc, rng)
            MT-->>PM: MonsterAction {type, target}
            alt action = "attack"
                PM->>MA: monsterAttackPlayer(mon, player, rng)
                MA-->>PM: AttackResult[] (hit/miss per blow)
                PM->>PM: apply damage, check death
            else action = "move"
                PM->>PM: monsterMove(chunk, mon, target)
            else action = "idle"
                Note over PM: do nothing
            end
            PM->>PM: mon.energy -= MOVE_ENERGY
            alt player.isDead
                PM-->>GL: break
            end
        end
    end

    GL->>PW: processWorld(state)
    PW->>PW: regenerateHP / regenerateMana
    PW->>PW: processHunger (every 10 turns)
    PW->>PW: decreaseTimeouts

    GL->>GL: player.energy += turnEnergy(speed)
    GL->>GL: state.turn++

    alt checkLevelChange(state)
        GL->>CL: changeLevel(state, newDepth)
        CL->>CL: decrement old monsters curNum
        CL->>CL: generateDungeon(depth, config, rng, races)
        CL->>CL: state.chunk = newChunk
        CL->>CL: state.monsters = newChunk.monsters
        CL->>EB: emit(NEW_LEVEL_DISPLAY)
    end
```

### 2-2. 起動〜ゲーム開始シーケンス

```mermaid
sequenceDiagram
    participant M as main()
    participant FS as fetch (JSON)
    participant ML as monster-loader
    participant BS as BirthScreen
    participant B as birth.ts
    participant DG as generateDungeon
    participant GB as GameBridge
    participant GL as runGameLoop

    M->>M: setupCanvas()
    M->>M: buildDefaultFeatureInfo()

    par データ並列ロード
        M->>FS: fetch p_race.json
        M->>FS: fetch class.json
        M->>FS: fetch monster.json
        M->>FS: fetch monster_base.json
    end
    FS-->>M: raceData, classData, monsterData, monsterBaseData

    M->>ML: parseMonsterBases(monsterBaseData)
    ML-->>M: Map~string, MonsterBase~
    M->>ML: parseMonsterRaces(monsterData, bases)
    ML-->>M: MonsterRace[]

    M->>M: RNG.stateInit(Date.now())

    alt セーブデータあり
        M->>M: tryLoadSavedGame(rng)
        alt ロード成功
            M->>M: askContinue(canvas)
            alt 続行
                M->>M: state = loadedState
            else 新規
                M->>M: clearSave()
                M->>BS: runBirthScreen(canvas, races, classes)
            end
        else ロード失敗
            M->>BS: runBirthScreen(canvas, races, classes)
        end
    else セーブなし
        M->>BS: runBirthScreen(canvas, races, classes)
    end

    BS->>BS: Phase 0: タイトル画面
    BS->>BS: Phase 1: 種族選択 (11種族)
    BS->>BS: Phase 2: 職業選択 (9職業)
    BS->>BS: Phase 3: 名前入力
    BS-->>M: BirthResult {name, race, class}

    M->>B: createPlayer(name, race, class, rng)
    B->>B: rollStats() / rollHP()
    B-->>M: Player (Lv1)

    M->>DG: generateDungeon(depth=1, config, rng, monsterRaces)
    DG->>DG: createChunk → fillWithWalls
    DG->>DG: carve rooms → dig tunnels
    DG->>DG: placeStairs / populateMonsters / populateObjects
    DG-->>M: Chunk (monsters付き)

    M->>M: createGameState(player, chunk, rng, monsterRaces)
    M->>GB: new GameBridge(canvas, state, input)
    M->>GB: bridge.start()
    GB->>GB: subscribe events (REFRESH, HP, MANA, ...)
    GB->>GL: runGameLoop(state, this)
    Note over GL: ゲームループ開始
```

### 2-3. モンスター近接攻撃シーケンス

```mermaid
sequenceDiagram
    participant PM as processMonsters
    participant MT as monsterTakeTurn
    participant MA as monsterAttackPlayer
    participant RB as resolveBlowMethod
    participant TH as testHit
    participant CD as calculateBlowDamage
    participant RE as resolveBlowEffect
    participant GS as GameState

    PM->>MT: monsterTakeTurn(chunk, mon, playerLoc, rng)
    MT->>MT: check: sleep? held? stunned? confused?
    MT->>MT: calculate distance (Chebyshev)
    alt distance <= 1 かつ !NEVER_BLOW
        MT-->>PM: {type: "attack", target: playerLoc}
    end

    PM->>MA: monsterAttackPlayer(mon, player, rng)

    alt NEVER_BLOW flag
        MA-->>PM: [] (空配列)
    end

    loop 各blow in mon.race.blows
        alt blow.method == NONE
            Note over MA: break (攻撃リスト終端)
        end

        MA->>RB: resolveBlowMethod(method, effect, mon, playerAc, rng)
        RB->>RB: toHit = max(level,1)*3 + effectPower
        RB->>TH: testHit(toHit, ac, rng)
        TH->>TH: 5% auto-hit check
        TH->>TH: randint1(toHit) >= ac*3/4
        TH-->>RB: hit: boolean
        RB-->>MA: hit

        alt 命中
            MA->>CD: calculateBlowDamage(blow, rlev, mon, rng)
            CD->>CD: randcalc(blow.dice) ± stun penalty
            CD-->>MA: rawDamage

            MA->>RE: resolveBlowEffect(effect, rawDamage, playerAc)
            RE->>RE: adjustDamArmor(damage, ac)
            RE->>RE: effectToStatusKind(effect)
            RE-->>MA: {damage, statusEffect, message}

            MA->>MA: monsterCritical(dice, rlev, damage, rng)
        else ミス
            MA->>MA: miss message
        end
    end

    MA-->>PM: AttackResult[]

    PM->>PM: totalDamage = Σ result.damage
    PM->>GS: player.chp -= totalDamage
    alt player.chp <= 0
        PM->>GS: player.isDead = true
        PM->>GS: state.dead = true
        PM->>GS: player.diedFrom = mon.race.name
    end
```

### 2-4. ダンジョン生成シーケンス

```mermaid
sequenceDiagram
    participant GD as generateDungeon
    participant CC as createChunk
    participant RG as Room Generators
    participant TN as digTunnel
    participant PS as placeStairs
    participant PP as populateMonsters
    participant MK as make.ts
    participant PO as populateObjects

    GD->>CC: createChunk(height, width, depth)
    CC-->>GD: Chunk (空グリッド)

    GD->>GD: fillWithWalls(chunk)
    Note over GD: 外壁=PERM, 内部=GRANITE

    loop roomAttempts回
        GD->>GD: pick random center + builder
        GD->>RG: generateSimpleRoom / OverlappingRoom / CrossRoom / etc.
        RG->>RG: carve floor, set ROOM flag
        RG-->>GD: Room {center, bounds}
    end

    loop 部屋を順番に接続
        GD->>TN: digTunnel(room[i].center, room[i+1].center)
        TN->>TN: L字掘削 (水平→垂直 or 垂直→水平)
        TN->>TN: GRANITE → FLOOR, ドア配置
    end

    GD->>PS: placeStairs(chunk, upLoc, downLoc)
    PS->>PS: FLOOR → LESS (上り), FLOOR → MORE (下り)

    GD->>PP: populateMonsters(chunk, depth, density, races, rng)
    loop density回
        PP->>PP: findEmptyFloor(chunk, rng)
        PP->>MK: pickMonsterRace(depth, races, rng)
        MK-->>PP: MonsterRace (深度・レア度重み付き)
        PP->>MK: placeNewMonster(chunk, pos, race, ...)
        MK->>MK: createMonster(race, rng)
        Note over MK: HP, speed, sleep, energy初期化
        MK->>MK: square.mon = midx, chunk.monMax++
        MK->>MK: race.curNum++
        MK-->>PP: Monster
        PP->>PP: chunk.monsters.push(mon)
    end

    GD->>PO: populateObjects(chunk, depth, density, kinds, rng)
    GD->>GD: placeTraps(chunk, depth, count, rng)

    GD-->>GD: return chunk
```

---

## 3. 状態遷移図

### 3-1. ゲーム全体の状態遷移

```mermaid
stateDiagram-v2
    [*] --> TitleScreen : アプリ起動

    TitleScreen --> SaveCheck : Press any key

    state SaveCheck <<choice>>
    SaveCheck --> ContinuePrompt : セーブあり
    SaveCheck --> CharacterCreation : セーブなし

    ContinuePrompt --> GameLoop : 続行 (C)
    ContinuePrompt --> CharacterCreation : 新規 (N)

    state CharacterCreation {
        [*] --> RaceSelect
        RaceSelect --> ClassSelect : 種族決定
        ClassSelect --> NameInput : 職業決定
        NameInput --> [*] : 名前決定
    }

    CharacterCreation --> DungeonGeneration : Player作成

    DungeonGeneration --> GameLoop : Chunk生成完了

    state GameLoop {
        [*] --> FOVUpdate
        FOVUpdate --> WaitInput : energy >= 100
        FOVUpdate --> MonsterPhase : energy < 100

        WaitInput --> CommandExec : GameCommand受信
        CommandExec --> DeathCheck1 : コマンド実行

        DeathCheck1 --> MonsterPhase : 生存
        DeathCheck1 --> Dead : HP <= 0

        MonsterPhase --> DeathCheck2 : モンスター処理完了
        DeathCheck2 --> WorldPhase : 生存
        DeathCheck2 --> Dead : HP <= 0

        WorldPhase --> EnergyGrant : HP/MP回復, 空腹, 時限効果
        EnergyGrant --> TurnIncrement : energy += turnEnergy(speed)
        TurnIncrement --> LevelCheck : turn++

        LevelCheck --> FOVUpdate : 同じ階
        LevelCheck --> LevelTransition : 階段使用
    }

    state LevelTransition {
        [*] --> CurNumReset : 旧モンスターcurNum--
        CurNumReset --> NewDungeon : generateDungeon()
        NewDungeon --> PlayerPlace : 階段位置に配置
        PlayerPlace --> [*] : state更新
    }

    LevelTransition --> GameLoop : 新レベル開始

    state Dead {
        [*] --> Tombstone : 墓碑表示
        Tombstone --> [*] : any key
    }

    state Victory {
        [*] --> VictoryScreen : 勝利メッセージ
        VictoryScreen --> [*] : any key
    }

    GameLoop --> Dead : player.isDead
    GameLoop --> Victory : player.totalWinner
    Dead --> [*] : セーブ削除
    Victory --> [*] : セーブ削除
```

### 3-2. モンスターAI 状態遷移

```mermaid
stateDiagram-v2
    [*] --> CheckSleep : monsterTakeTurn()

    CheckSleep --> Idle : 睡眠中 (mTimed[SLEEP] > 0)
    Note right of Idle : sleep--

    CheckSleep --> CheckHold : 起きている

    CheckHold --> Idle : 拘束中 (mTimed[HOLD] > 0)
    CheckHold --> CheckStun : 自由

    CheckStun --> Idle : 朦朧 + 50%失敗
    CheckStun --> CheckConfusion : 行動可能

    CheckConfusion --> RandomMove : 混乱中
    CheckConfusion --> CheckRandomFlags : 正常

    CheckRandomFlags --> RandomMove : RAND_50 (50%) or RAND_25 (25%)
    CheckRandomFlags --> CheckFear : 通常移動

    CheckFear --> Flee : 恐怖状態 or FRIGHTENED flag
    CheckFear --> CheckNeverMove : 恐怖なし

    CheckNeverMove --> AdjacentCheck1 : NEVER_MOVE flag
    CheckNeverMove --> DistanceCalc : 移動可能

    state AdjacentCheck1 <<choice>>
    AdjacentCheck1 --> Attack : 隣接 & !NEVER_BLOW
    AdjacentCheck1 --> Idle : 隣接不可

    DistanceCalc --> AdjacentCheck2 : 距離計算 (Chebyshev)

    state AdjacentCheck2 <<choice>>
    AdjacentCheck2 --> Attack : dist <= 1 & !NEVER_BLOW
    AdjacentCheck2 --> Flee : dist <= 1 & NEVER_BLOW
    AdjacentCheck2 --> Pathfind : dist > 1

    Pathfind --> Move : 経路あり
    Pathfind --> RandomMove : 経路なし → ランダム
    Pathfind --> Idle : 移動先なし

    state ActionResult <<choice>>
    Attack --> ActionResult
    Move --> ActionResult
    Flee --> ActionResult
    RandomMove --> ActionResult
    Idle --> ActionResult
    ActionResult --> [*] : MonsterAction返却
```

### 3-3. プレイヤーコマンド入力 状態遷移

```mermaid
stateDiagram-v2
    [*] --> WaitKey : getCommand()

    WaitKey --> DirectionCheck : keypress受信

    state DirectionCheck <<choice>>
    DirectionCheck --> PendingDirCheck : 方向キー検出
    DirectionCheck --> CommandCheck : 方向なし

    PendingDirCheck --> CompleteDirCmd : pendingCmd あり
    PendingDirCheck --> WalkCommand : pendingCmd なし

    CompleteDirCmd --> [*] : GameCommand (open/close/tunnel等)
    WalkCommand --> [*] : WALK {direction}

    state CommandCheck <<choice>>
    CommandCheck --> HelpScreen : "help"
    CommandCheck --> LookCmd : "look"
    CommandCheck --> DirPrompt : "open/close/tunnel/disarm/bash"
    CommandCheck --> InventoryScreen : "inventory"
    CommandCheck --> EquipScreen : "equipment"
    CommandCheck --> ItemSelect : "quaff/eat/read/zap/aim"
    CommandCheck --> EquipManage : "wield/takeoff/drop"
    CommandCheck --> SpellSelect : "cast/pray"
    CommandCheck --> StudySelect : "study"
    CommandCheck --> SaveCmd : "save"
    CommandCheck --> SimpleCmd : "go_up/go_down/search/rest/pickup"
    CommandCheck --> Unhandled : 未知コマンド

    HelpScreen --> WaitKey : ESC/Space/Enter
    LookCmd --> WaitKey : メッセージ表示

    DirPrompt --> WaitKey : pendingDirectionCmd設定

    InventoryScreen --> WaitKey : ESC/Space/Enter
    EquipScreen --> WaitKey : ESC/Space/Enter

    state ItemSelect {
        [*] --> FilterItems : フィルタ適用
        FilterItems --> ShowList : 該当アイテムあり
        FilterItems --> NoItems : アイテムなし
        ShowList --> LetterSelect : a-z選択
        LetterSelect --> [*]
        NoItems --> [*]
    }

    ItemSelect --> [*] : GameCommand (QUAFF/EAT/READ等)
    ItemSelect --> WaitKey : ESC取消

    SpellSelect --> [*] : GameCommand (CAST)
    SpellSelect --> WaitKey : ESC取消

    StudySelect --> WaitKey : 習得完了 or ESC

    EquipManage --> [*] : GameCommand (EQUIP/UNEQUIP/DROP)
    EquipManage --> WaitKey : ESC取消

    SaveCmd --> WaitKey : localStorage保存

    SimpleCmd --> [*] : GameCommand
    Unhandled --> WaitKey : エラーメッセージ
```

### 3-4. エネルギーシステム状態遷移

```mermaid
stateDiagram-v2
    [*] --> EnergyGrant : ターン開始

    state EnergyGrant {
        [*] --> CalcEnergy
        CalcEnergy : energy += EXTRACT_ENERGY[speed]
        Note right of CalcEnergy : テーブルは180エントリ (speed 0-179)\nspeed 110 → +10/tick
        CalcEnergy --> [*]
    }

    EnergyGrant --> EnergyCheck

    state EnergyCheck <<choice>>
    EnergyCheck --> CanAct : energy >= 100
    EnergyCheck --> WaitTick : energy < 100

    CanAct --> ActionExec : コマンド/AI決定
    ActionExec --> EnergyDeduct : 行動実行

    state EnergyDeduct {
        [*] --> Deduct
        Deduct : energy -= MOVE_ENERGY (100)
        Deduct --> [*]
    }

    EnergyDeduct --> EnergyCheck : 残エネルギー確認
    WaitTick --> EnergyGrant : 次tick

    note right of EnergyCheck
        速度110: 10tick で1行動
        速度120: 5tick で1行動
        速度130: ~3tick で1行動
        速度 80: ~17tick で1行動
    end note
```

### 3-5. セーブ/ロード状態遷移

```mermaid
stateDiagram-v2
    [*] --> Playing : ゲーム中

    state Playing {
        [*] --> Normal
        Normal --> SaveTrigger : Ctrl+S
        SaveTrigger --> Serialize : saveGameToJSON()
        Serialize --> WriteLS : localStorage.setItem()
        WriteLS --> Normal : "Game saved" メッセージ
    }

    Playing --> Death : HP <= 0
    Playing --> Victory : totalWinner

    Death --> ClearSave : localStorage.removeItem()
    Victory --> ClearSave : localStorage.removeItem()
    ClearSave --> [*]

    state StartupLoad {
        [*] --> CheckLS : localStorage.getItem()
        CheckLS --> HasSave : JSON文字列あり
        CheckLS --> NoSave : null
        HasSave --> Parse : JSON.parse()
        Parse --> Validate : validateSaveData()
        Validate --> LoadOK : バージョン互換
        Validate --> LoadFail : 不整合
        LoadOK --> PatchRace : race/classテンプレート復元
        PatchRace --> RestoreRNG : RNG状態復元
        RestoreRNG --> AskContinue : 「続行/新規？」
        AskContinue --> ResumeGame : 続行 (C)
        AskContinue --> DiscardSave : 新規 (N)
        LoadFail --> DiscardSave
        DiscardSave --> NoSave
        NoSave --> NewGame : キャラ作成へ
    }

    [*] --> StartupLoad : アプリ起動

    state SaveData {
        version : "1.0.0"
        --
        player : PlayerSaveData
        dungeon : DungeonSaveData
        rngState : WELL1024a State
        messages : GameMessage[200]
        turn / depth / dead / won
    }
```

---

## 4. パッケージ構成図

```mermaid
graph TB
    subgraph "@angband/web"
        main["main.ts<br/>エントリポイント"]
        bridge["game-bridge.ts<br/>UI⇔コアブリッジ"]
        kbinput["keyboard-input.ts<br/>キーボード入力"]
        birth["birth-screen.ts<br/>キャラ作成画面"]
        term["terminal.ts<br/>80x24文字グリッド"]
        renderer["canvas-renderer.ts<br/>Canvas描画"]
        colors["color-palette.ts<br/>29色定義"]
    end

    subgraph "@angband/core"
        subgraph "game/"
            state["state.ts<br/>GameState"]
            world["world.ts<br/>ゲームループ"]
            event["event.ts<br/>EventBus"]
        end
        subgraph "command/"
            core_cmd["core.ts<br/>executeCommand"]
            movement["movement.ts<br/>移動・階段"]
            combat["combat.ts<br/>プレイヤー攻撃"]
            item_cmd["item.ts<br/>アイテム使用"]
            magic_cmd["magic.ts<br/>魔法詠唱"]
        end
        subgraph "monster/"
            move["move.ts<br/>AI・移動"]
            attack["attack.ts<br/>近接攻撃解決"]
            make["make.ts<br/>生成・配置"]
        end
        subgraph "generate/"
            gen["generate.ts<br/>ダンジョン生成"]
            populate["populate.ts<br/>配置処理"]
        end
        subgraph "cave/"
            chunk["chunk.ts<br/>Chunk管理"]
            square["square.ts<br/>Square操作"]
            view["view.ts<br/>FOV計算"]
        end
        subgraph "save/"
            save["save.ts<br/>シリアライズ"]
            load["load.ts<br/>デシリアライズ"]
        end
        subgraph "data/"
            mloader["monster-loader.ts<br/>JSONパーサー"]
        end
        subgraph "player/"
            pbirth["birth.ts<br/>Player生成"]
            spell["spell.ts<br/>呪文管理"]
        end
        subgraph "z/"
            rng["rand.ts<br/>RNG (WELL1024a)"]
            bitflag["bitflag.ts<br/>BitFlag"]
            color["color.ts<br/>色変換"]
        end
        subgraph "types/"
            tplayer["player.ts"]
            tmonster["monster.ts"]
            tcave["cave.ts"]
            tobject["object.ts"]
        end
    end

    main --> bridge
    main --> birth
    main --> mloader
    main --> pbirth
    main --> gen

    bridge --> world
    bridge --> kbinput
    bridge --> term
    bridge --> renderer
    bridge --> save

    world --> core_cmd
    world --> move
    world --> attack
    world --> view
    world --> gen
    world --> event

    core_cmd --> movement
    core_cmd --> combat
    core_cmd --> item_cmd
    core_cmd --> magic_cmd

    gen --> chunk
    gen --> populate
    populate --> make

    style main fill:#4a9,stroke:#333,color:#fff
    style bridge fill:#4a9,stroke:#333,color:#fff
    style world fill:#e84,stroke:#333,color:#fff
    style state fill:#e84,stroke:#333,color:#fff
    style gen fill:#48e,stroke:#333,color:#fff
    style attack fill:#e44,stroke:#333,color:#fff
```
