# Angband TypeScript Porting Plan (7 Steps)

Master plan for porting the original C Angband (205,536 lines / 235 files) to TypeScript.

## Current Status: All 7 Steps Complete (2026-02-27)

**All steps complete.** 28,583 source lines + 23,380 test lines = 51,963 lines.
All 1,441 tests passing. typecheck 0 errors. Playable via Web UI.

---

## Step 1: Foundation Complete — Type Definitions + Data Structures

**Goal**: Define the types used throughout the game (Player, Monster, Object, Cave)
and establish the foundation that higher-level modules depend on.

**Source Files (C)**:
- `player.h` — Player struct
- `monster.h` — Monster struct
- `object.h` — Item/equipment struct
- `cave.h` — Dungeon struct (chunk, square)
- `option.h` — Game options
- `z-type.h` additions — Type utility supplements

**Output (TS)**:
```
packages/@angband/core/src/types/
  player.ts       — Player, PlayerRace, PlayerClass, PlayerState
  monster.ts      — Monster, MonsterRace, MonsterLore
  object.ts       — Object, ObjectKind, EgoItem, Artifact
  cave.ts         — Chunk, Square, FeatureType
  option.ts       — GameOptions
  index.ts        — barrel export
```

**Design Decisions**:
- Missing z-layer components (z-form, z-util, z-virt, z-file, z-textblock) are unnecessary in TS.
  - z-form → template literal / string interpolation
  - z-util → Replaced by JS standard library
  - z-virt → Unnecessary in a GC language
  - z-file → Node fs / Web File API (deferred via layer separation)
  - z-textblock → Implemented in Step 7 (UI)
- C struct "pointers" → TS "ID references or object references"

**Estimated Size**: ~2,000 lines (type definitions + tests)

---

## Step 2: Data Pipeline — Parser + Gamedata Loader

**Goal**: Parse the 46 game data files (monster.txt, object.txt, etc. totaling 2.3MB)
and convert them into TypeScript objects.

**Source Files (C)**:
- `parser.c` / `parser.h` (1,200 lines) — Generic text parser
- `datafile.c` / `datafile.h` (500 lines) — File reading
- `init.c` (4,558 lines) — Initialization and data loading integration

**Output (TS)**:
```
packages/@angband/core/src/data/
  parser.ts        — Angband text format parser
  parser.test.ts
  loader.ts        — Data file loader
  loader.test.ts
  registry.ts      — Central registry for all data
  index.ts

tools/data-converter/
  convert.ts       — .txt → .json conversion tool (run at build time)
  schemas/         — JSON schema definitions

packages/@angband/core/gamedata/
  *.json           — Converted game data
```

**Approach**:
- Two-stage design: (A) Convert txt → JSON at build time, (B) Load JSON at runtime
- Runtime parser also implemented (for modding support)
- Faithfully reproduce the initialization order from `init.c`

**Key Data Files (by priority)**:

| File | Size | Contents |
|------|------|----------|
| monster.txt | 287KB | 420 monster types |
| room_template.txt | 161KB | 100+ room templates |
| vault.txt | 101KB | 80+ vaults |
| object.txt | 84KB | 400 item types |
| artifact.txt | 61KB | 100+ artifacts |
| class.txt | 48KB | 10 player classes |
| monster_spell.txt | 33KB | 150+ monster spells |
| ego_item.txt | 24KB | 150+ ego items |
| 30+ other files | — | Races, shops, terrain, effects, etc. |

**Estimated Size**: ~3,000 lines (parser + conversion tool + tests)

---

## Step 3: Cave & Map System — FOV, Movement, Terrain

**Goal**: Implement dungeon spatial representation, field of view calculation, and pathfinding.
The core of a roguelike.

**Source Files (C)**:
- `cave.c` (1,500 lines) — Map operations
- `cave-map.c` (1,000 lines) — Vision and lighting calculations
- `cave-square.c` (1,000 lines) — Tile operations
- `cave-view.c` (800 lines) — FOV (Field of View)

**Output (TS)**:
```
packages/@angband/core/src/cave/
  chunk.ts         — Chunk (dungeon level) management
  square.ts        — Square operations (terrain checks, flag operations)
  map.ts           — Map updates and lighting
  view.ts          — FOV calculation (shadowcasting)
  pathfind.ts      — A* pathfinding
  cave.test.ts     — Integration tests
  index.ts
```

**Technical Notes**:
- FOV algorithm: Faithful port of Angband's shadowcasting implementation
- Performance: TypedArray (Int8Array, etc.) for map grid representation
- Coordinate system: Uses the Loc type from Step 1

**Estimated Size**: ~3,500 lines

---

## Step 4: Entity System — Player, Monster, Object

**Goal**: Implement creation, management, and interaction of the three major game entities.

### 4a: Player System
**Source (C)**: player.c, player-birth.c, player-calcs.c, player-timed.c, player-util.c, etc. (22 files, 12,764 lines)

```
packages/@angband/core/src/player/
  birth.ts         — Character creation
  calcs.ts         — Stat calculations (equipment bonuses, level bonuses)
  timed.ts         — Timed effects (poison, haste, see invisible, etc.)
  spell.ts         — Spell learning and casting
  util.ts          — Utilities
  index.ts
```

### 4b: Monster System
**Source (C)**: mon-attack.c, mon-blow-effects.c, mon-blow-methods.c, mon-init.c, mon-list.c, mon-lore.c, mon-make.c, mon-move.c, mon-msg.c, mon-spell.c, mon-timed.c, mon-util.c, etc. (30 files, 16,351 lines)

```
packages/@angband/core/src/monster/
  make.ts          — Monster generation and placement
  move.ts          — Movement AI (using pathfinding)
  attack.ts        — Melee attacks
  spell.ts         — Spell attacks
  lore.ts          — Monster knowledge (bestiary)
  timed.ts         — Timed states (confusion, fear, etc.)
  index.ts
```

### 4c: Object System
**Source (C)**: obj-chest.c, obj-desc.c, obj-gear.c, obj-ignore.c, obj-info.c, obj-init.c, obj-knowledge.c, obj-list.c, obj-make.c, obj-pile.c, obj-power.c, obj-properties.c, obj-slays.c, obj-tval.c, obj-util.c, etc. (34 files, 23,913 lines)

```
packages/@angband/core/src/object/
  make.ts          — Item generation (level-appropriate drops)
  desc.ts          — Item name generation (e.g. "a Flaming Longsword")
  gear.ts          — Equipment management
  properties.ts    — Item properties, slays, and resistances
  pile.ts          — Item piles (floor, inventory)
  power.ts         — Item power calculation
  index.ts
```

**Estimated Size**: ~12,000 lines (all 3 systems combined)

---

## Step 5: Game Mechanics — Commands, Effects, Combat

**Goal**: Implement player actions (movement, attacks, spells, etc.) and
game effects (damage, status ailments, projections, etc.).

**Source Files (C)**:
- `cmd-core.c`, `cmd-cave.c`, `cmd-misc.c`, `cmd-obj.c`, `cmd-pickup.c`, etc. (8 files, ~2,500 lines)
- `effect-handler-attack.c`, `effect-handler-general.c` (3,646 lines)
- `project.c`, `project-feat.c`, `project-mon.c`, `project-obj.c`, `project-player.c` (5 files, ~5,000 lines)
- `trap.c` (trap system)

**Output (TS)**:
```
packages/@angband/core/src/command/
  core.ts          — Command dispatcher
  movement.ts      — Movement and exploration
  combat.ts        — Melee and ranged combat
  magic.ts         — Spell casting
  item.ts          — Item use and equipment
  index.ts

packages/@angband/core/src/effect/
  handler.ts       — Effect handler integration
  attack.ts        — Attack effects
  general.ts       — General effects (healing, teleport, etc.)
  index.ts

packages/@angband/core/src/project/
  project.ts       — Projection calculation (ball, breath, beam)
  feat.ts          — Effects on terrain
  monster.ts       — Effects on monsters
  player.ts        — Effects on the player
  index.ts
```

**Estimated Size**: ~8,000 lines

---

## Step 6: World Simulation — Game Loop, Dungeon Generation, Save/Load

**Goal**: Manage overall game progression. Turn processing, level generation, persistence.

**Source Files (C)**:
- `game-world.c` — Main game loop
- `game-input.c` — Input abstraction
- `game-event.c` — Event system
- `generate.c`, `gen-cave.c`, `gen-chunk.c`, `gen-monster.c`, `gen-room.c`, `gen-util.c` (6 files, 7,600 lines)
- `save.c`, `load.c` (save/load)
- `score.c` (score management)
- `store.c` (shop system)
- `target.c` (targeting)

**Output (TS)**:
```
packages/@angband/core/src/game/
  world.ts         — Game loop (turn processing)
  input.ts         — Input abstraction (separated from UI)
  event.ts         — Event bus (Observer pattern)
  state.ts         — Game state management
  index.ts

packages/@angband/core/src/generate/
  generate.ts      — Dungeon generation entry point
  cave.ts          — Cave type-specific generation
  room.ts          — Room generation
  monster.ts       — Monster placement
  object.ts        — Item placement
  vault.ts         — Vault placement
  index.ts

packages/@angband/core/src/save/
  save.ts          — Save (JSON format)
  load.ts          — Load
  index.ts

packages/@angband/core/src/store/
  store.ts         — Shop inventory and trading
  index.ts
```

**Approach**:
- Game loop is async/await-based (to support asynchronous UI input)
- Event system for loose coupling between core and UI
- Save format is JSON (not compatible with C's binary format)
- Dungeon generation is a faithful port (Angband's generation algorithms are central to gameplay)

**Estimated Size**: ~10,000 lines

---

## Step 7: Rendering & UI — Web Frontend

**Goal**: Complete a browser-playable Angband.

**Reference (C)**: ui-*.c (79 files, 46,648 lines) — terminal UI, used only as reference

**Output (TS)**:
```
packages/@angband/renderer/
  src/
    terminal.ts    — Virtual terminal grid
    textblock.ts   — Text block (z-textblock replacement)
    theme.ts       — Color theme
    index.ts

packages/@angband/web/
  src/
    App.tsx         — Main app
    components/
      GameMap.tsx   — Map rendering (Canvas or DOM grid)
      Sidebar.tsx   — Status display
      Messages.tsx  — Message log
      Inventory.tsx — Inventory screen
      CharSheet.tsx — Character sheet
    hooks/
      useGame.ts   — Game engine connection
      useInput.ts  — Keybinding handling
    index.html
    main.tsx
```

**Approach**:
- `@angband/core` is pure logic (no DOM dependency)
- `@angband/renderer` is a terminal grid abstraction
- `@angband/web` uses React/Preact + Canvas rendering
- ASCII display as default, with tileset support planned for the future

**Estimated Size**: ~8,000 lines

---

## Overall Summary

| Step | Contents | Estimated Lines | Dependencies |
|------|----------|----------------|--------------|
| 0 (Complete) | z-layer foundation | 3,374 lines | — |
| 1 | Type definitions + data structures | ~2,000 lines | Step 0 |
| 2 | Data pipeline | ~3,000 lines | Step 1 |
| 3 | Cave & map | ~3,500 lines | Step 1 |
| 4 | Entities (Player/Monster/Object) | ~12,000 lines | Step 1,2,3 |
| 5 | Game mechanics | ~8,000 lines | Step 3,4 |
| 6 | World simulation | ~10,000 lines | Step 4,5 |
| 7 | Rendering & UI | ~8,000 lines | Step 6 |
| **Total** | | **~50,000 lines** | |

**Note**: Reasons for compression from C 205K lines → TS ~50K lines:
- Most of C's 46K-line UI layer is unnecessary (Web UI is a separate design)
- C memory management and string processing code is unnecessary
- TypeScript's expressiveness (generics, spread, etc.)
- Elimination of duplicate code and platform-specific branches

---

## Porting Principles

1. **Fidelity**: Game logic algorithms are faithful to the original C version
2. **Type Safety**: TypeScript strict mode at maximum, noUncheckedIndexedAccess enabled
3. **Test-Driven**: Tests for all modules. Test cases from the C version are also ported
4. **Core Separation**: `@angband/core` has no DOM/Node dependencies (pure logic)
5. **Data-Driven**: Game data is loaded from external files (JSON)
6. **Incremental**: Working milestones at each step (e.g., FOV demo after Step 3)
