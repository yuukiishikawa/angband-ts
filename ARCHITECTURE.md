# Angband-TS Architecture Diagrams

## 1. Class Diagrams (Types & Interface Relationships)

### 1-1. Core Entity Relationship Diagram

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

### 1-2. Monster Type Relationship Diagram

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

### 1-3. Dungeon (Chunk/Square) Type Relationship Diagram

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

### 1-4. Web UI Layer Class Diagram

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

### 1-5. Command System Type Relationship Diagram

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

## 2. Sequence Diagrams

### 2-1. Main Game Loop (Flow of One Turn)

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
    EB-->>GB: -> drawAll() + doRender()

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

### 2-2. Startup to Game Start Sequence

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

    par Parallel data loading
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

    alt Save data exists
        M->>M: tryLoadSavedGame(rng)
        alt Load successful
            M->>M: askContinue(canvas)
            alt Continue
                M->>M: state = loadedState
            else New game
                M->>M: clearSave()
                M->>BS: runBirthScreen(canvas, races, classes)
            end
        else Load failed
            M->>BS: runBirthScreen(canvas, races, classes)
        end
    else No save data
        M->>BS: runBirthScreen(canvas, races, classes)
    end

    BS->>BS: Phase 0: Title screen
    BS->>BS: Phase 1: Race selection (11 races)
    BS->>BS: Phase 2: Class selection (9 classes)
    BS->>BS: Phase 3: Name input
    BS-->>M: BirthResult {name, race, class}

    M->>B: createPlayer(name, race, class, rng)
    B->>B: rollStats() / rollHP()
    B-->>M: Player (Lv1)

    M->>DG: generateDungeon(depth=1, config, rng, monsterRaces)
    DG->>DG: createChunk -> fillWithWalls
    DG->>DG: carve rooms -> dig tunnels
    DG->>DG: placeStairs / populateMonsters / populateObjects
    DG-->>M: Chunk (with monsters)

    M->>M: createGameState(player, chunk, rng, monsterRaces)
    M->>GB: new GameBridge(canvas, state, input)
    M->>GB: bridge.start()
    GB->>GB: subscribe events (REFRESH, HP, MANA, ...)
    GB->>GL: runGameLoop(state, this)
    Note over GL: Game loop starts
```

### 2-3. Monster Melee Attack Sequence

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
    alt distance <= 1 and !NEVER_BLOW
        MT-->>PM: {type: "attack", target: playerLoc}
    end

    PM->>MA: monsterAttackPlayer(mon, player, rng)

    alt NEVER_BLOW flag
        MA-->>PM: [] (empty array)
    end

    loop each blow in mon.race.blows
        alt blow.method == NONE
            Note over MA: break (end of attack list)
        end

        MA->>RB: resolveBlowMethod(method, effect, mon, playerAc, rng)
        RB->>RB: toHit = max(level,1)*3 + effectPower
        RB->>TH: testHit(toHit, ac, rng)
        TH->>TH: 5% auto-hit check
        TH->>TH: randint1(toHit) >= ac*3/4
        TH-->>RB: hit: boolean
        RB-->>MA: hit

        alt Hit
            MA->>CD: calculateBlowDamage(blow, rlev, mon, rng)
            CD->>CD: randcalc(blow.dice) +/- stun penalty
            CD-->>MA: rawDamage

            MA->>RE: resolveBlowEffect(effect, rawDamage, playerAc)
            RE->>RE: adjustDamArmor(damage, ac)
            RE->>RE: effectToStatusKind(effect)
            RE-->>MA: {damage, statusEffect, message}

            MA->>MA: monsterCritical(dice, rlev, damage, rng)
        else Miss
            MA->>MA: miss message
        end
    end

    MA-->>PM: AttackResult[]

    PM->>PM: totalDamage = sum of result.damage
    PM->>GS: player.chp -= totalDamage
    alt player.chp <= 0
        PM->>GS: player.isDead = true
        PM->>GS: state.dead = true
        PM->>GS: player.diedFrom = mon.race.name
    end
```

### 2-4. Dungeon Generation Sequence

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
    CC-->>GD: Chunk (empty grid)

    GD->>GD: fillWithWalls(chunk)
    Note over GD: Outer walls=PERM, Interior=GRANITE

    loop roomAttempts times
        GD->>GD: pick random center + builder
        GD->>RG: generateSimpleRoom / OverlappingRoom / CrossRoom / etc.
        RG->>RG: carve floor, set ROOM flag
        RG-->>GD: Room {center, bounds}
    end

    loop Connect rooms in order
        GD->>TN: digTunnel(room[i].center, room[i+1].center)
        TN->>TN: L-shaped excavation (horizontal->vertical or vertical->horizontal)
        TN->>TN: GRANITE -> FLOOR, place doors
    end

    GD->>PS: placeStairs(chunk, upLoc, downLoc)
    PS->>PS: FLOOR -> LESS (up stairs), FLOOR -> MORE (down stairs)

    GD->>PP: populateMonsters(chunk, depth, density, races, rng)
    loop density times
        PP->>PP: findEmptyFloor(chunk, rng)
        PP->>MK: pickMonsterRace(depth, races, rng)
        MK-->>PP: MonsterRace (weighted by depth and rarity)
        PP->>MK: placeNewMonster(chunk, pos, race, ...)
        MK->>MK: createMonster(race, rng)
        Note over MK: Initialize HP, speed, sleep, energy
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

## 3. State Transition Diagrams

### 3-1. Overall Game State Transitions

```mermaid
stateDiagram-v2
    [*] --> TitleScreen : App launch

    TitleScreen --> SaveCheck : Press any key

    state SaveCheck <<choice>>
    SaveCheck --> ContinuePrompt : Save exists
    SaveCheck --> CharacterCreation : No save

    ContinuePrompt --> GameLoop : Continue (C)
    ContinuePrompt --> CharacterCreation : New game (N)

    state CharacterCreation {
        [*] --> RaceSelect
        RaceSelect --> ClassSelect : Race selected
        ClassSelect --> NameInput : Class selected
        NameInput --> [*] : Name confirmed
    }

    CharacterCreation --> DungeonGeneration : Player created

    DungeonGeneration --> GameLoop : Chunk generation complete

    state GameLoop {
        [*] --> FOVUpdate
        FOVUpdate --> WaitInput : energy >= 100
        FOVUpdate --> MonsterPhase : energy < 100

        WaitInput --> CommandExec : GameCommand received
        CommandExec --> DeathCheck1 : Command executed

        DeathCheck1 --> MonsterPhase : Alive
        DeathCheck1 --> Dead : HP <= 0

        MonsterPhase --> DeathCheck2 : Monster processing complete
        DeathCheck2 --> WorldPhase : Alive
        DeathCheck2 --> Dead : HP <= 0

        WorldPhase --> EnergyGrant : HP/MP regen, hunger, timed effects
        EnergyGrant --> TurnIncrement : energy += turnEnergy(speed)
        TurnIncrement --> LevelCheck : turn++

        LevelCheck --> FOVUpdate : Same floor
        LevelCheck --> LevelTransition : Stairs used
    }

    state LevelTransition {
        [*] --> CurNumReset : Old monsters curNum--
        CurNumReset --> NewDungeon : generateDungeon()
        NewDungeon --> PlayerPlace : Place at stairs location
        PlayerPlace --> [*] : State updated
    }

    LevelTransition --> GameLoop : New level starts

    state Dead {
        [*] --> Tombstone : Display tombstone
        Tombstone --> [*] : any key
    }

    state Victory {
        [*] --> VictoryScreen : Victory message
        VictoryScreen --> [*] : any key
    }

    GameLoop --> Dead : player.isDead
    GameLoop --> Victory : player.totalWinner
    Dead --> [*] : Save deleted
    Victory --> [*] : Save deleted
```

### 3-2. Monster AI State Transitions

```mermaid
stateDiagram-v2
    [*] --> CheckSleep : monsterTakeTurn()

    CheckSleep --> Idle : Sleeping (mTimed[SLEEP] > 0)
    Note right of Idle : sleep--

    CheckSleep --> CheckHold : Awake

    CheckHold --> Idle : Held (mTimed[HOLD] > 0)
    CheckHold --> CheckStun : Free

    CheckStun --> Idle : Stunned + 50% failure
    CheckStun --> CheckConfusion : Can act

    CheckConfusion --> RandomMove : Confused
    CheckConfusion --> CheckRandomFlags : Normal

    CheckRandomFlags --> RandomMove : RAND_50 (50%) or RAND_25 (25%)
    CheckRandomFlags --> CheckFear : Normal movement

    CheckFear --> Flee : Afraid or FRIGHTENED flag
    CheckFear --> CheckNeverMove : Not afraid

    CheckNeverMove --> AdjacentCheck1 : NEVER_MOVE flag
    CheckNeverMove --> DistanceCalc : Can move

    state AdjacentCheck1 <<choice>>
    AdjacentCheck1 --> Attack : Adjacent & !NEVER_BLOW
    AdjacentCheck1 --> Idle : Not adjacent

    DistanceCalc --> AdjacentCheck2 : Calculate distance (Chebyshev)

    state AdjacentCheck2 <<choice>>
    AdjacentCheck2 --> Attack : dist <= 1 & !NEVER_BLOW
    AdjacentCheck2 --> Flee : dist <= 1 & NEVER_BLOW
    AdjacentCheck2 --> Pathfind : dist > 1

    Pathfind --> Move : Path found
    Pathfind --> RandomMove : No path -> random
    Pathfind --> Idle : No valid destination

    state ActionResult <<choice>>
    Attack --> ActionResult
    Move --> ActionResult
    Flee --> ActionResult
    RandomMove --> ActionResult
    Idle --> ActionResult
    ActionResult --> [*] : Return MonsterAction
```

### 3-3. Player Command Input State Transitions

```mermaid
stateDiagram-v2
    [*] --> WaitKey : getCommand()

    WaitKey --> DirectionCheck : Keypress received

    state DirectionCheck <<choice>>
    DirectionCheck --> PendingDirCheck : Direction key detected
    DirectionCheck --> CommandCheck : No direction

    PendingDirCheck --> CompleteDirCmd : pendingCmd exists
    PendingDirCheck --> WalkCommand : No pendingCmd

    CompleteDirCmd --> [*] : GameCommand (open/close/tunnel etc.)
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
    CommandCheck --> Unhandled : Unknown command

    HelpScreen --> WaitKey : ESC/Space/Enter
    LookCmd --> WaitKey : Display message

    DirPrompt --> WaitKey : Set pendingDirectionCmd

    InventoryScreen --> WaitKey : ESC/Space/Enter
    EquipScreen --> WaitKey : ESC/Space/Enter

    state ItemSelect {
        [*] --> FilterItems : Apply filter
        FilterItems --> ShowList : Matching items found
        FilterItems --> NoItems : No items
        ShowList --> LetterSelect : Select a-z
        LetterSelect --> [*]
        NoItems --> [*]
    }

    ItemSelect --> [*] : GameCommand (QUAFF/EAT/READ etc.)
    ItemSelect --> WaitKey : ESC cancel

    SpellSelect --> [*] : GameCommand (CAST)
    SpellSelect --> WaitKey : ESC cancel

    StudySelect --> WaitKey : Learning complete or ESC

    EquipManage --> [*] : GameCommand (EQUIP/UNEQUIP/DROP)
    EquipManage --> WaitKey : ESC cancel

    SaveCmd --> WaitKey : Save to localStorage

    SimpleCmd --> [*] : GameCommand
    Unhandled --> WaitKey : Error message
```

### 3-4. Energy System State Transitions

```mermaid
stateDiagram-v2
    [*] --> EnergyGrant : Turn start

    state EnergyGrant {
        [*] --> CalcEnergy
        CalcEnergy : energy += EXTRACT_ENERGY[speed]
        Note right of CalcEnergy : Table has 180 entries (speed 0-179)\nspeed 110 -> +10/tick
        CalcEnergy --> [*]
    }

    EnergyGrant --> EnergyCheck

    state EnergyCheck <<choice>>
    EnergyCheck --> CanAct : energy >= 100
    EnergyCheck --> WaitTick : energy < 100

    CanAct --> ActionExec : Command/AI decision
    ActionExec --> EnergyDeduct : Action executed

    state EnergyDeduct {
        [*] --> Deduct
        Deduct : energy -= MOVE_ENERGY (100)
        Deduct --> [*]
    }

    EnergyDeduct --> EnergyCheck : Check remaining energy
    WaitTick --> EnergyGrant : Next tick

    note right of EnergyCheck
        Speed 110: 1 action per 10 ticks
        Speed 120: 1 action per 5 ticks
        Speed 130: ~1 action per 3 ticks
        Speed 80: ~1 action per 17 ticks
    end note
```

### 3-5. Save/Load State Transitions

```mermaid
stateDiagram-v2
    [*] --> Playing : In game

    state Playing {
        [*] --> Normal
        Normal --> SaveTrigger : Ctrl+S
        SaveTrigger --> Serialize : saveGameToJSON()
        Serialize --> WriteLS : localStorage.setItem()
        WriteLS --> Normal : "Game saved" message
    }

    Playing --> Death : HP <= 0
    Playing --> Victory : totalWinner

    Death --> ClearSave : localStorage.removeItem()
    Victory --> ClearSave : localStorage.removeItem()
    ClearSave --> [*]

    state StartupLoad {
        [*] --> CheckLS : localStorage.getItem()
        CheckLS --> HasSave : JSON string exists
        CheckLS --> NoSave : null
        HasSave --> Parse : JSON.parse()
        Parse --> Validate : validateSaveData()
        Validate --> LoadOK : Version compatible
        Validate --> LoadFail : Incompatible
        LoadOK --> PatchRace : Restore race/class templates
        PatchRace --> RestoreRNG : Restore RNG state
        RestoreRNG --> AskContinue : "Continue or New?"
        AskContinue --> ResumeGame : Continue (C)
        AskContinue --> DiscardSave : New game (N)
        LoadFail --> DiscardSave
        DiscardSave --> NoSave
        NoSave --> NewGame : Go to character creation
    }

    [*] --> StartupLoad : App launch

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

## 4. Package Structure Diagram

```mermaid
graph TB
    subgraph "@angband/web"
        main["main.ts<br/>Entry point"]
        bridge["game-bridge.ts<br/>UI-Core bridge"]
        kbinput["keyboard-input.ts<br/>Keyboard input"]
        birth["birth-screen.ts<br/>Character creation screen"]
        term["terminal.ts<br/>80x24 character grid"]
        renderer["canvas-renderer.ts<br/>Canvas rendering"]
        colors["color-palette.ts<br/>29 color definitions"]
    end

    subgraph "@angband/core"
        subgraph "game/"
            state["state.ts<br/>GameState"]
            world["world.ts<br/>Game loop"]
            event["event.ts<br/>EventBus"]
        end
        subgraph "command/"
            core_cmd["core.ts<br/>executeCommand"]
            movement["movement.ts<br/>Movement & stairs"]
            combat["combat.ts<br/>Player attack"]
            item_cmd["item.ts<br/>Item usage"]
            magic_cmd["magic.ts<br/>Spellcasting"]
        end
        subgraph "monster/"
            move["move.ts<br/>AI & movement"]
            attack["attack.ts<br/>Melee attack resolution"]
            make["make.ts<br/>Spawning & placement"]
        end
        subgraph "generate/"
            gen["generate.ts<br/>Dungeon generation"]
            populate["populate.ts<br/>Placement processing"]
        end
        subgraph "cave/"
            chunk["chunk.ts<br/>Chunk management"]
            square["square.ts<br/>Square operations"]
            view["view.ts<br/>FOV calculation"]
        end
        subgraph "save/"
            save["save.ts<br/>Serialization"]
            load["load.ts<br/>Deserialization"]
        end
        subgraph "data/"
            mloader["monster-loader.ts<br/>JSON parser"]
        end
        subgraph "player/"
            pbirth["birth.ts<br/>Player creation"]
            spell["spell.ts<br/>Spell management"]
        end
        subgraph "z/"
            rng["rand.ts<br/>RNG (WELL1024a)"]
            bitflag["bitflag.ts<br/>BitFlag"]
            color["color.ts<br/>Color conversion"]
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
