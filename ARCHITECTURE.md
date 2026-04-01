# Angband-TS Architecture

A TypeScript port of [Angband 4.2.6](https://angband.github.io/angband/). 28,583 source lines, 1,441 tests passing, playable in the browser.

---

## 1. Package Structure

```mermaid
graph TB
    subgraph "@angband/web"
        main["main.ts — Entry point"]
        bridge["game-bridge.ts — UI ↔ Core bridge"]
        kbinput["keyboard-input.ts — Keyboard input"]
        birth["birth-screen.ts — Character creation"]
        maprender["map-renderer.ts — Dungeon display"]
        storeui["store-screen.ts — Shop UI"]
        invui["inventory-ui.ts — Inventory UI"]
        spellui["spell-ui.ts — Spell selection UI"]
    end

    subgraph "@angband/renderer"
        term["terminal.ts — Virtual 80×24 grid"]
        display["display.ts — Display abstraction"]
        textblock["textblock.ts — Text block rendering"]
    end

    subgraph "@angband/core"
        subgraph "game/"
            state["state.ts — GameState"]
            world["world.ts — Game loop"]
            event["event.ts — EventBus"]
            input["input.ts — Input abstraction"]
            bootstrap["bootstrap.ts — Initialization"]
        end
        subgraph "command/"
            cmd_core["core.ts — Command dispatcher"]
            movement["movement.ts — Walk, run, stairs"]
            combat["combat.ts — Melee & ranged"]
            item_cmd["item.ts — Item use"]
            magic_cmd["magic.ts — Spellcasting"]
        end
        subgraph "monster/"
            mon_move["move.ts — AI & pathfinding"]
            mon_attack["attack.ts — Melee resolution"]
            mon_make["make.ts — Spawn & placement"]
            mon_spell["spell.ts — Monster spellcasting"]
        end
        subgraph "generate/"
            gen["generate.ts — Dungeon generation"]
            rooms["room.ts — Room carving"]
            populate["populate.ts — Monster & item placement"]
        end
        subgraph "cave/"
            chunk["chunk.ts — Chunk management"]
            square["square.ts — Square queries"]
            viewfov["view.ts — FOV (shadowcasting)"]
            pathfind["pathfind.ts — A* pathfinding"]
        end
        subgraph "object/"
            gear["gear.ts — Equipment"]
            pile["pile.ts — Item stacks"]
            slays["slays.ts — Slay & brand damage"]
        end
        subgraph "player/"
            pbirth["birth.ts — Character creation"]
            calcs["calcs.ts — Stat calculations"]
            spell["spell.ts — Spell management"]
        end
        subgraph "borg/"
            aiserver["ai-server.ts — HTTP API for AI"]
            remserver["remote-server.ts — TCP for C Borg"]
        end
        subgraph "z/"
            rng["rand.ts — RNG (WELL1024a)"]
            bitflag["bitflag.ts — BitFlag class"]
        end
    end

    subgraph "tools/"
        aiplayer["busho-player.ts — AI agent"]
        converter["data-converter/ — txt→json"]
    end

    main --> bridge
    main --> birth
    main --> bootstrap

    bridge --> world
    bridge --> kbinput
    bridge --> term
    bridge --> display

    world --> cmd_core
    world --> mon_move
    world --> mon_attack
    world --> viewfov
    world --> gen
    world --> event

    cmd_core --> movement
    cmd_core --> combat
    cmd_core --> item_cmd
    cmd_core --> magic_cmd

    gen --> chunk
    gen --> populate
    populate --> mon_make

    aiserver --> world
    aiserver --> state
    aiplayer -.->|HTTP| aiserver
    remserver --> world

    style main fill:#4a9,stroke:#333,color:#fff
    style bridge fill:#4a9,stroke:#333,color:#fff
    style world fill:#e84,stroke:#333,color:#fff
    style state fill:#e84,stroke:#333,color:#fff
    style gen fill:#48e,stroke:#333,color:#fff
    style mon_attack fill:#e44,stroke:#333,color:#fff
    style aiserver fill:#a4e,stroke:#333,color:#fff
    style aiplayer fill:#a4e,stroke:#333,color:#fff
```

---

## 2. Core Entities

### 2-1. GameState & Player

```mermaid
classDiagram
    direction TB

    class GameState {
        +Player player
        +Chunk chunk
        +Monster[] monsters
        +MonsterRace[] monsterRaces
        +ObjectKind[] objectKinds
        +Artifact[] artifacts
        +EgoItem[] egoItems
        +Store[] stores
        +GameMessage[] messages
        +EventBus eventBus
        +RNG rng
        +number depth
        +number turn
        +boolean running / dead / won
    }

    class Player {
        +PlayerRace race
        +PlayerClass class
        +PlayerBody body
        +PlayerState state
        +PlayerUpkeep upkeep
        +Loc grid
        +number chp / mhp / csp / msp
        +number energy / lev / exp / au / food
        +number[] timed
        +number[] statMax / statCur
        +boolean isDead / totalWinner
    }

    class PlayerState {
        +number speed / ac / toA / toH / toD
        +number numBlows / curLight
        +number[] skills
        +BitFlag flags
    }

    class PlayerUpkeep {
        +boolean playing / generateLevel
        +number energyUse / newSpells
    }

    GameState --> Player
    GameState --> Chunk
    GameState --> EventBus
    GameState --> RNG
    GameState "1" --> "*" Monster
    Player --> PlayerState
    Player --> PlayerUpkeep
```

### 2-2. Monster

```mermaid
classDiagram
    direction TB

    class Monster {
        +MonsterRace race
        +MonsterId midx
        +Loc grid
        +number hp / maxhp / mspeed / energy / cdis
        +Int16Array mTimed
        +BitFlag mflag
        +MonsterTarget target
    }

    class MonsterRace {
        +MonsterRaceId ridx
        +string name
        +MonsterBase base
        +number avgHp / ac / speed / level
        +number freqInnate / freqSpell
        +MonsterBlow[] blows
        +BitFlag flags / spellFlags
        +number maxNum / curNum
    }

    class MonsterBlow {
        +BlowMethod method
        +BlowEffect effect
        +RandomValue dice
    }

    Monster --> MonsterRace
    MonsterRace --> MonsterBase
    MonsterRace "1" --> "0..4" MonsterBlow
```

### 2-3. Dungeon

```mermaid
classDiagram
    direction TB

    class Chunk {
        +number depth / height / width
        +Square[][] squares
        +Monster[] monsters
        +Heatmap noise / scent
        +number monMax / monCnt / objMax
        +number feeling
    }

    class Square {
        +FeatureId feat
        +BitFlag info
        +number light
        +MonsterId mon
        +ObjectId obj?
        +TrapId trap?
    }

    class Feat {
        <<enumeration>>
        FLOOR / CLOSED / OPEN / BROKEN
        LESS / MORE
        GRANITE / PERM / RUBBLE
        SECRET / LAVA
        STORE_GENERAL..HOME
    }

    Chunk "1" --> "*" Square
    Square ..> Feat
```

---

## 3. Game Loop

```mermaid
sequenceDiagram
    participant GL as Game Loop
    participant FOV as FOV Update
    participant PP as Player Phase
    participant EC as Execute Command
    participant PM as Monster Phase
    participant PW as World Phase

    GL->>FOV: updateView(chunk, player.grid)

    alt player.energy >= 100
        GL->>PP: processPlayer()
        PP->>EC: await getCommand() → executeCommand()
        EC-->>PP: CommandResult {success, energyCost}
        PP->>PP: player.energy -= energyCost
    end

    GL->>PM: processMonsters()
    loop each monster with energy >= 100
        PM->>PM: monsterTakeTurn() → move / attack / cast
        PM->>PM: monster.energy -= 100
    end

    GL->>PW: processWorld()
    PW->>PW: regenerateHP / regenerateMana
    PW->>PW: processHunger (every 10 turns)
    PW->>PW: decreaseTimeouts

    GL->>GL: player.energy += turnEnergy(speed)
    GL->>GL: state.turn++

    alt stairs used
        GL->>GL: changeLevel() → generateDungeon()
    end
```

---

## 4. Command System

```mermaid
classDiagram
    direction LR

    class CommandType {
        <<enumeration>>
        WALK / RUN
        OPEN / CLOSE / TUNNEL / DISARM
        GO_UP / GO_DOWN
        ATTACK / FIRE / THROW
        CAST / STUDY
        EAT / QUAFF / READ / AIM / ZAP
        PICKUP / DROP / EQUIP / UNEQUIP
        REST / SEARCH
    }

    class GameCommand {
        +CommandType type
        +number direction?
        +number itemIndex?
        +number spellIndex?
    }

    class CommandResult {
        +boolean success
        +number energyCost
        +string[] messages
    }

    GameCommand ..> CommandType
    GameCommand --> CommandResult : executeCommand()
```

---

## 5. AI Infrastructure

```mermaid
graph LR
    subgraph "AI Player (tools/)"
        BP["busho-player.ts<br/>BFS pathfinding<br/>Combat decisions<br/>Retreat logic"]
    end

    subgraph "AI Server (core/borg/)"
        AS["ai-server.ts<br/>HTTP API"]
        GS["GameState<br/>(headless)"]
        AS --> GS
    end

    subgraph "C Borg (external)"
        CB["C Borg Client"]
    end

    subgraph "Remote Server (core/borg/)"
        RS["remote-server.ts<br/>TCP protocol"]
        RS --> GS
    end

    BP -->|"GET /state<br/>POST /command"| AS
    CB -->|"KEY/FRAME<br/>TCP"| RS

    style BP fill:#a4e,stroke:#333,color:#fff
    style AS fill:#a4e,stroke:#333,color:#fff
    style RS fill:#48e,stroke:#333,color:#fff
```

### AI Server HTTP API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/state` | GET | Full game state as JSON |
| `/command` | POST | Execute GameCommand, return result + state |
| `/health` | GET | Server health check |

### Remote Server TCP Protocol

Server sends screen as `FRAME/ROW/CURSOR/STAT/INVEN/END` messages.
Client responds with `KEY <code> <mods>`.

---

## 6. State Transitions

```mermaid
stateDiagram-v2
    [*] --> TitleScreen : App start

    TitleScreen --> SaveCheck : Press any key

    state SaveCheck <<choice>>
    SaveCheck --> ContinuePrompt : Save exists
    SaveCheck --> CharacterCreation : No save

    ContinuePrompt --> GameLoop : Continue (C)
    ContinuePrompt --> CharacterCreation : New game (N)

    state CharacterCreation {
        [*] --> RaceSelect
        RaceSelect --> ClassSelect
        ClassSelect --> NameInput
        NameInput --> [*]
    }

    CharacterCreation --> GameLoop : Player created

    state GameLoop {
        [*] --> FOVUpdate
        FOVUpdate --> PlayerInput : energy >= 100
        FOVUpdate --> MonsterPhase : energy < 100

        PlayerInput --> CommandExec
        CommandExec --> DeathCheck1

        DeathCheck1 --> MonsterPhase : Alive
        DeathCheck1 --> Dead : HP <= 0

        MonsterPhase --> DeathCheck2
        DeathCheck2 --> WorldPhase : Alive
        DeathCheck2 --> Dead : HP <= 0

        WorldPhase --> EnergyGrant
        EnergyGrant --> LevelCheck

        LevelCheck --> FOVUpdate : Same level
        LevelCheck --> LevelTransition : Stairs
    }

    LevelTransition --> GameLoop
    GameLoop --> Dead : isDead
    GameLoop --> Victory : totalWinner
    Dead --> [*]
    Victory --> [*]
```

---

## 7. Energy System

```
Speed 110 (normal): +10 energy/tick → 1 action per 10 ticks
Speed 120 (fast):   +20 energy/tick → 1 action per 5 ticks
Speed 130 (v.fast): +30 energy/tick → 1 action per ~3 ticks
Speed  80 (slow):   +6 energy/tick  → 1 action per ~17 ticks

Action cost: 100 energy (MOVE_ENERGY)
Energy table: EXTRACT_ENERGY[speed], 200 entries (index 0-199 → 1-49)
```

---

## 8. Data Pipeline

```
Build time:  .txt files → data-converter → .json files
Runtime:     .json files → loaders → TypeScript objects → GameState

Loaded data:
  monster.json + monster_base.json → MonsterRace[]
  object.json                      → ObjectKind[]
  artifact.json                    → Artifact[]
  ego_item.json                    → EgoItem[]
  p_race.json                      → PlayerRace[]
  class.json                       → PlayerClass[]
```

---

## 9. Design Principles

| Principle | Implementation |
|-----------|---------------|
| **Core isolation** | `@angband/core` has zero DOM/Node dependencies |
| **Type safety** | TypeScript strict mode, noUncheckedIndexedAccess |
| **Async input** | Game loop uses `async/await` for UI input |
| **Event-driven** | EventBus decouples core from UI |
| **JSON save** | Save/load via JSON + localStorage |
| **Data-driven** | All game data loaded from external JSON files |
| **Faithful port** | Game algorithms match C Angband 4.2.6 |
