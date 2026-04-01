# Angband-TS Architecture v2

> 58,573 LOC / 97 source files / 54 test files / 1,443 tests passing
> Last updated: 2026-02-27

---

## 1. Overall Project Structure

```
angband-ts/
├── packages/
│   ├── @angband/core/     ← Game engine (pure logic, no DOM dependency)
│   │   ├── src/           ← 97 source + 54 test files
│   │   └── gamedata/      ← 46 JSON files (converted from C version .txt → JSON)
│   ├── @angband/renderer/ ← Virtual terminal + display logic
│   │   └── src/           ← 3 source + 3 test files
│   └── @angband/web/      ← Browser frontend (Vite)
│       ├── src/           ← 7 source files
│       └── public/gamedata/ ← JSON copies for web
├── tools/
│   └── data-converter/    ← C version .txt → JSON conversion tool
├── vitest.config.ts       ← Test configuration (single root config)
└── tsconfig.json          ← TypeScript configuration (strict, ES2022, bundler resolution)
```

### Build & Test

| Command | Description |
|---------|-------------|
| `npm run build` | Build all packages (workspaces) |
| `npm test` | Run all Vitest tests (58 files, 1,443 tests) |
| `npm run typecheck` | tsc --noEmit (type checking only) |
| `npm run lint` | ESLint |

### Technology Stack

- TypeScript 5.6+ (strict mode, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- Vitest 3.0 (test runner)
- Vite 6.0 (web bundler)
- ESM only (`"type": "module"`)
- Runtime dependencies: **zero** (core/renderer require no external npm packages)

---

## 2. Module Dependency Layer Diagram

```
Layer 1 ─── z/               Pure utilities (RNG, BitFlag, Loc, Dice, Color)
            │                 Dependencies: none
            ▼
Layer 2 ─── types/            Shared type definitions (Player, Monster, Chunk, ObjectType)
            │                 Dependencies: z
            ▼
Layer 3 ─── data/             JSON data loaders (monster, object, vault, pit, profile)
            cave/             Dungeon grid operations (Chunk, Square, FOV, Heatmap)
            object/           Item system (inventory, gear, slays, knowledge)
            store/            Shop system (buying/selling, stock management)
            │                 Dependencies: z, types
            ▼
Layer 4 ─── player/           Player system (birth, calc, timed, spell)
            │                 Dependencies: z, types, cave/view, object/knowledge
            ▼
Layer 5 ─── monster/          Monster AI & behavior (move, attack, spell, death, make)
            │                 Dependencies: z, types, cave, object/make
            ▼
Layer 6 ─── effect/           Effect dispatch (heal, damage, teleport, detect...)
            project/          Projection engine (bolt, ball, beam, breath)
            command/          Player commands (walk, attack, fire, cast, item...)
            │                 Dependencies: z, types, cave, object, player, monster (partial)
            ▼
Layer 7 ─── generate/         Dungeon generation (room, tunnel, populate, town, vault)
            │                 Dependencies: z, types, cave, data, monster/make, object/make
            ▼
Layer 8 ─── game/             Game loop & state management (runGameLoop, processMonsters, world)
            save/             Save & load (JSON serialization)
            │                 Dependencies: all layers
            ▼
Layer 9 ─── @angband/renderer Display logic (Terminal, renderMap, renderSidebar)
            @angband/web      Browser UI (GameBridge, Canvas, Input, BirthScreen)
                              Dependencies: all @angband/core submodules
```

### Circular Dependencies

**Only one type-level pseudo-cycle exists (no runtime issues):**
```
types/player.ts ──import type──> object/knowledge.ts
                                      │
                                      └──import type──> types/object.ts
                                                             │
                                                             └──import type──> types/player.ts
```
All are `import type`, so TypeScript resolves them correctly.

---

## 3. Core Module Details

### 3.1 z/ — Foundation Utilities (9 files)

| File | Main Exports | Role |
|------|--------------|------|
| `rand.ts` | `RNG`, `randomValue`, `randcalc`, `damcalc`, `mBonus` | WELL1024a random number generator |
| `bitflag.ts` | `BitFlag`, `FLAG_END`, `flagSize` | Variable-length bit flags |
| `dice.ts` | `Dice` | NdS+B dice rolls |
| `expression.ts` | `Expression`, `ExpressionError` | Data-driven calculation expressions |
| `color.ts` | `COLOUR_*` (29 constants), `angbandColorTable` | Angband color system |
| `type.ts` | `Loc`, `loc`, `locSum`, `PointSet`, `Grouper` | 2D coordinates, sets, grouping |
| `queue.ts` | `Queue`, `PriorityQueue` | Generic queues |
| `quark.ts` | `QuarkStore`, `QuarkId` | String interning |

### 3.2 types/ — Type Definitions (5 files)

| File | Main Types | Overview |
|------|------------|----------|
| `cave.ts` | `Chunk`, `Square`, `Heatmap`, `FeatureType`, `Feat` | Dungeon structures |
| `monster.ts` | `Monster`, `MonsterRace`, `MonsterBlow`, `MonsterLore` | Monster data (includes hearing, smell, shapes, heldObjIdx, mimickedObjIdx, minRange, bestRange) |
| `player.ts` | `Player`, `PlayerRace`, `PlayerClass`, `PlayerState` | Player data |
| `object.ts` | `ObjectType`, `ObjectKind`, `Artifact`, `EgoItem`, `Brand`, `Slay` | Item data |
| `option.ts` | `OptionCategory`, `OptionIndex` | Game options |

### 3.3 data/ — Data Loaders (9 files)

| File | Role | Status |
|------|------|--------|
| `parser.ts` | Generic text parser | COMPLETE |
| `loader.ts` | blow_methods/effects/object_bases text loading | COMPLETE |
| `registry.ts` | `GameData` central registry | COMPLETE |
| `monster-loader.ts` | monster.json/monster_base.json → MonsterRace[] | PARTIAL (spell data not parsed) |
| `object-loader.ts` | object/brand/slay/artifact/ego_item/object_base JSON | PARTIAL (activation/effect not parsed — fixed to null) |
| `vault-loader.ts` | vault.json → VaultTemplate[] | COMPLETE |
| `pit-loader.ts` | pit.json → PitDefinition[] | COMPLETE |
| `dungeon-profile-loader.ts` | dungeon_profile.json → DungeonProfile[] | COMPLETE |

### 3.4 cave/ — Dungeon Grid (7 files)

| File | Role | Status |
|------|------|--------|
| `chunk.ts` | Chunk creation/validation/access | COMPLETE |
| `square.ts` | Square operations/predicates/flags | COMPLETE |
| `features.ts` | Terrain type definitions/registration | COMPLETE |
| `view.ts` | FOV calculation (Symmetric Shadowcasting) | COMPLETE |
| `heatmap.ts` | Sound/scent BFS propagation | COMPLETE |
| `pathfind.ts` | A* pathfinding | COMPLETE |

### 3.5 object/ — Item System (9 files)

| File | Role | Status |
|------|------|--------|
| `gear.ts` | Inventory/equipment management | COMPLETE |
| `desc.ts` | Item name generation | PARTIAL (flavors not supported) |
| `pile.ts` | Object piles (items on the ground) | COMPLETE |
| `slays.ts` | Slay/brand multiplier calculation | COMPLETE |
| `knowledge.ts` | Rune identification system | PARTIAL (simplified Set\<string\> design, differs from C version's `known` object copy) |
| `make.ts` | Item generation (simplified apply_magic) | PARTIAL |
| `power.ts` | Item power calculation | COMPLETE |
| `properties.ts` | Object property predicates | COMPLETE |

### 3.6 player/ — Player System (6 files)

| File | Role | Status |
|------|------|--------|
| `birth.ts` | Character creation | PARTIAL (simplified body, no starting equipment) |
| `calcs.ts` | Stat calculation (AC, speed, blows) | PARTIAL (blows uses fixed value) |
| `timed.ts` | Timed effects (poison, haste, blindness...) | COMPLETE |
| `spell.ts` | Spell management/casting | COMPLETE |
| `util.ts` | LOS, experience tables, flag checks | COMPLETE |

### 3.7 monster/ — Monster AI (8 files)

| File | Role | Status |
|------|------|--------|
| `make.ts` | Monster generation/placement | COMPLETE |
| `move.ts` | AI decision-making/movement | PARTIAL (MOVE_BODY/KILL_BODY not implemented) |
| `attack.ts` | Melee attack resolution | PARTIAL (6 blow effects are stubs) |
| `spell.ts` | Spell selection/damage calculation | PARTIAL (status effects not applied) |
| `death.ts` | Death drops | COMPLETE |
| `lore.ts` | Monster knowledge accumulation | COMPLETE |
| `timed.ts` | Monster timed effects | COMPLETE |

### 3.8 effect/ — Effect System (4 files)

| File | Role | Status |
|------|------|--------|
| `handler.ts` | Effect registration/dispatch | COMPLETE |
| `attack.ts` | Attack effects (bolt, ball, breath) | COMPLETE |
| `general.ts` | General effects (heal, teleport, detect) | PARTIAL (11 stubs, 73 unregistered) |

### 3.9 command/ — Commands (6 files)

| File | Role | Status |
|------|------|--------|
| `core.ts` | Dispatcher/type definitions | COMPLETE |
| `movement.ts` | Movement/doors/tunneling/stairs | COMPLETE |
| `combat.ts` | Melee/ranged/throwing | PARTIAL (thrown item landing/breakage not implemented) |
| `item.ts` | Item use/pickup/drop/equip | COMPLETE |
| `magic.ts` | Spell casting/learning | COMPLETE |

### 3.10 generate/ — Dungeon Generation (7 files)

| File | Role | Status |
|------|------|--------|
| `generate.ts` | Main generation entry point | PARTIAL (profiles not connected, no retry) |
| `room.ts` | Room generation (6 types + vault + pit/nest) | PARTIAL (vault entity placement incomplete) |
| `tunnel.ts` | Tunnel digging | COMPLETE |
| `populate.ts` | Monster/object/stair/trap placement | COMPLETE |
| `town.ts` | Town map generation | PARTIAL (depth=0 not connected, shop UI not linked) |
| `test-helpers.ts` | Test helpers | COMPLETE |

### 3.11 game/ — Game Loop (5 files)

| File | Role | Status |
|------|------|--------|
| `event.ts` | EventBus (synchronous pub/sub) | COMPLETE |
| `state.ts` | GameState interface | COMPLETE |
| `input.ts` | InputProvider interface | COMPLETE |
| `world.ts` | Main game loop | PARTIAL (natural spawning empty, cleanup incomplete) |

### 3.12 store/ — Shops (2 files)

| File | Role | Status |
|------|------|--------|
| `store.ts` | Shop logic/stock/buying & selling | COMPLETE |

### 3.13 save/ — Save/Load (3 files)

| File | Role | Status |
|------|------|--------|
| `save.ts` | Serialization → JSON | COMPLETE |
| `load.ts` | Deserialization ← JSON | PARTIAL (race/class placeholder) |

---

## 4. Web Layer

### @angband/renderer (3 files)

| File | Role |
|------|------|
| `terminal.ts` | Virtual character grid (dirty cell tracking) |
| `display.ts` | Map/sidebar/message/status rendering |
| `textblock.ts` | Colored text blocks |

### @angband/web (7 files)

| File | Role |
|------|------|
| `main.ts` | Entry point: Canvas initialization, parallel JSON loading, save check, character creation, game start |
| `game-bridge.ts` | CommandInputProvider implementation: game loop ⇔ UI bridge, key input → command conversion, Canvas rendering, inventory/spell menus, targeting, panic save |
| `keyboard-input.ts` | InputProvider implementation: DOM keydown → direction/command conversion, VI keys/arrow/numpad support |
| `canvas-renderer.ts` | HTML Canvas rendering: redraw dirty cells only, monospace font |
| `terminal.ts` | 80x24 character grid: putChar/putString/clear |
| `birth-screen.ts` | Character creation UI: title → race → class → name input |
| `color-palette.ts` | Angband COLOUR_* → CSS hex mapping |

---

## 5. Data Flow

### 5.1 Startup Sequence

```
main.ts
  ├─ setupCanvas()
  ├─ buildDefaultFeatureInfo()
  ├─ Parallel fetch: p_race, class, monster, monster_base,
  │              object, object_base, brand, slay, artifact, ego_item
  ├─ parseMonsterBases() → parseMonsterRaces()
  ├─ parseObjectBases() → parseObjectKinds() / parseBrands() / parseSlays() /
  │                        parseArtifacts() / parseEgoItems()
  ├─ RNG.stateInit(Date.now())
  ├─ Save check → continue or character creation
  ├─ createPlayer(name, race, class, rng)
  ├─ generateDungeon(depth, config, rng, races, kinds)
  ├─ createGameState(player, chunk, rng, races, kinds, ...)
  └─ GameBridge.start() → runGameLoop(state, this)
```

### 5.2 Game Loop (1 turn)

```
runGameLoop:
  1. updateView(chunk, player.grid)      ← FOV update
  2. updateNoise/updateScent             ← Heatmap update
  3. eventBus.emit(REFRESH)              ← UI render trigger
  4. processPlayer(state, input)         ← Player input → command execution
     └─ await input.getCommand()         ← Async key input wait
     └─ executeCommand(cmd, player, chunk, rng)
     └─ processDeadMonsters(state)       ← Dead monster processing
  5. processMonsters(state, monsters)    ← All monster AI actions
     └─ monsterTakeTurn() → move/attack/spell/idle
     └─ monsterAttackPlayer()            ← Melee attack resolution
     └─ monsterCastSpell()               ← Spell resolution
  6. processWorld(state)                 ← HP/MP regen, hunger, poison, bleeding, timed effects
  7. player.energy += turnEnergy(speed)  ← Energy grant
  8. state.turn++                        ← Turn counter
  9. checkLevelChange(state)             ← Stairs → level transition
```

### 5.3 Command Input Flow

```
GameBridge.getCommand()
  └─ waitForKey()                     ← Promise<void> (waiting for keydown)
  └─ input.consumeDirection()         ← Direction key?
      ├─ pendingDirectionCmd exists → {type: OPEN/CLOSE/TUNNEL, direction}
      └─ none → {type: WALK, direction}
  └─ input.consumeCommand()           ← Command key?
      ├─ "open/close/tunnel/disarm" → set pendingDirectionCmd → re-loop
      ├─ "inventory/equipment"       → display screen → re-loop
      ├─ "quaff/eat/read/zap/aim"    → selectInventoryItem() → command
      ├─ "cast/pray"                 → selectSpell() → waitForDirection() → command
      ├─ "fire"                      → waitForTarget() → command
      ├─ "throw"                     → selectInventoryItem() → waitForTarget() → command
      └─ "go_up/go_down/search/rest/pickup" → immediate command
```

---

## 6. Current Gap List

### 6.1 Effect Handlers

| Category | Count |
|----------|-------|
| Registered + functional | 35 |
| Registered + stub | 11 |
| Unregistered | 73 |
| **Total EffectTypes** | **119** |

Major stubs: TELEPORT (no terrain check), IDENTIFY (not connected to rune system), ENCHANT/RECHARGE (message only), SUMMON/BANISH (no monster operations), GLYPH (no terrain change), CONFUSE/SLEEP (no target effect)

### 6.2 Monster Spells

- `spellFlags` / `freqInnate` / `spellPower` are always 0/empty (parsing not implemented in monster-loader.ts)
- `monsterCastSpell()` only calculates damage. Status effects, summoning, and healing are not applied
- Connected to the AI loop in game/world.ts, but non-functional due to missing data

### 6.3 Combat

- Throwing: no landing/breakage/pickup mechanics
- Shield bash: not implemented
- `visible` flag: always `true` (blindness hit rate penalty not reflected)

### 6.4 Dungeon Generation

- Profiles: loader complete, not connected to generate.ts (hardcoded settings only)
- Vaults: loader complete, ASCII template drawing done in room.ts, **entity placement not implemented**
- Pits/Nests: loader complete, generators exist in room.ts, **not connected to generate.ts**
- Town: generateTown() exists, **depth=0 routing not connected**
- Retry: none (C version retries up to 100 times)
- Level feeling: field exists, no calculation

### 6.5 Shops & Town

- store.ts core logic complete
- Shop UI: not implemented
- Town map → game startup: not connected

### 6.6 Monster AI & Behavior

- **Individual heatmaps**: C version has per-monster flow/path data (`monster->flow`), but TS version only has chunk-wide sound/scent heatmaps
- **Monster HP regeneration**: TS version recovers 1/8 every 100 turns (simplified). C version uses per-turn fractional accumulation (same fractional method as player)
- **Monster shape-shifting**: Monster type has `shapes`/`numShapes`/`originalRace` fields, but transformation logic is not implemented

### 6.7 save/load

- race/class restored as placeholders (correct data missing after load)
- Panic save: beforeunload handler implemented
- Character dump/high scores: not implemented

### 6.8 UI

- Targeting mode: implemented (cursor-based movement)
- Projection visuals: not implemented (events are not emitted)
- Multi-window: not implemented
- Keymap mode switching: not implemented
- Mouse/sound: not implemented

---

## 7. Work Packages

Each WP can be started independently (prerequisites noted where applicable).
**Estimated size**: S (< 100 lines), M (100-300 lines), L (300-800 lines), XL (800+ lines)

---

### WP-A: Monster Spell Data Connection [M]

**Scope**: `data/monster-loader.ts`, `monster/move.ts`
**Prerequisites**: None

| Task | Details |
|------|---------|
| A1 | `monster-loader.ts`: Parse `spell-freq` field and set `freqInnate`/`freqSpell` (`1_in_N` format) |
| A2 | `monster-loader.ts`: `spells` array → `spellFlags` BitFlag mapping (define SPELL_FLAG_MAP) |
| A3 | `monster-loader.ts`: Set `spellPower` = monster level |
| A4 | `monster/move.ts`: Add `freqInnate`/`freqSpell` probability check in monsterTakeTurn() |

**Verification**: Monsters actually cast spells (spell names appear in log)

---

### WP-B: Effect Handler Completion [XL]

**Scope**: `effect/general.ts`, `effect/attack.ts`, new `effect/monster.ts`
**Prerequisites**: None (independent work)

| Task | Details |
|------|---------|
| B1 | Complete implementation of 11 stubs (TELEPORT terrain check, IDENTIFY → knowledge connection, ENCHANT implementation, RECHARGE implementation, SUMMON → monster/make connection, BANISH → monster deletion, GLYPH → terrain change, CONFUSE/SLEEP → monster timed, DRAIN_LIGHT → light reduction) |
| B2 | Implement **priority 30** of the 73 unregistered: TELEPORT_TO, TELEPORT_LEVEL, DETECT_STAIRS, DETECT_LIVING_MONSTERS, DETECT_INVISIBLE_MONSTERS, DETECT_EVIL, PROJECT_LOS, PROJECT_LOS_AWARE, ACQUIRE, RUBBLE, GRANITE, ARC, SHORT_BEAM, LASH, BOLT_OR_BEAM, LINE, TOUCH, BRAND_WEAPON, BRAND_AMMO, CREATE_ARROWS, DRAIN_LIFE (register), TURN_UNDEAD, DEEP_DESCENT, SCRAMBLE/UNSCRAMBLE_STATS, ENCHANT_WEAPON, ENCHANT_ARMOR, REMOVE_CURSE (implement), RANDOM, TAP_DEVICE |
| B3 | Apply `monsterCastSpell()` return results in the game loop: status effects → `incTimedEffect()`, summoning → `placeNewMonster()` |

**Verification**: Drinking potions / zapping wands / reading scrolls → game state actually changes

---

### WP-C: Dungeon Generation Enhancement [L]

**Scope**: `generate/generate.ts`, `generate/room.ts`
**Prerequisites**: None

| Task | Details |
|------|---------|
| C1 | `generate.ts`: Connect `dungeon-profile-loader` profiles. Depth-based room count/monster density/tunnel settings |
| C2 | `generate.ts`: Generation retry (up to 100 attempts, matching C version) |
| C3 | `room.ts`: `generateVaultRoom()` second pass implementation (`9` → monster, `&` → artifact, `*` → item placement) |
| C4 | `generate.ts`: Add `generatePitRoom()`/`generateNestRoom()` to room selection table |
| C5 | `generate.ts`: Level feeling calculation (`chunk.feeling` = obj_rating + mon_rating combined) |

**Verification**: Vaults/pit rooms appear on deeper levels. Level feeling messages are displayed

---

### WP-D: Town & Shop UI [L]

**Scope**: `generate/generate.ts`, `web/src/game-bridge.ts`, new `web/src/store-screen.ts`
**Prerequisites**: None

| Task | Details |
|------|---------|
| D1 | `generate/generate.ts`: Add branch to call `generateTown()` when depth===0 |
| D2 | `web/src/main.ts`: Change new game start to depth=0 |
| D3 | New `web/src/store-screen.ts`: Text-based buy/sell screen (item list, purchase/sell, ESC to exit) |
| D4 | `web/src/game-bridge.ts`: Enter on shop tile → launch shop screen |
| D5 | `player/birth.ts`: class.json `start-items` → add starting equipment to inventory |

**Verification**: Start game → town screen → enter shop → purchase item → descend into dungeon

---

### WP-E: Projection Visuals & Effects [M]

**Scope**: `project/project.ts`, `web/src/game-bridge.ts`
**Prerequisites**: None

| Task | Details |
|------|---------|
| E1 | `project/project.ts`: Emit per-cell EventBus events during BOLT/BALL/BEAM/BREATH projection |
| E2 | `web/src/game-bridge.ts`: Receive events → flash animation on Canvas (display colored `*` character briefly) |
| E3 | Simultaneously highlight ball/breath area of effect |

**Verification**: Spells/ranged attacks visually travel along their path

---

### WP-F: Monster Blow Effect Completion [S]

**Scope**: `monster/attack.ts`
**Prerequisites**: None

| Task | Details |
|------|---------|
| F1 | DRAIN_CHARGES: Drain charges from wands/staves (inventory search → decrease charges) |
| F2 | EAT_GOLD: Decrease gold + "Your purse feels lighter!" |
| F3 | EAT_ITEM: Consume 1 random item from inventory |
| F4 | EAT_FOOD: Consume food item |
| F5 | EAT_LIGHT: Decrease light source fuel/charges |
| F6 | SHATTER: Destroy surrounding terrain (GRANITE → FLOOR) |

**Verification**: Getting hit by monsters with each blow method triggers the corresponding effect

---

### WP-G: FOV & Vision Enhancement [M]

**Scope**: `cave/view.ts`, `monster/move.ts`, `web/src/game-bridge.ts`
**Prerequisites**: None

| Task | Details |
|------|---------|
| G1 | `cave/view.ts`: BLIND state → hide all grid cells (remembered terrain only) |
| G2 | `cave/view.ts`: Infravision → warm-blooded monsters visible in darkness |
| G3 | `game-bridge.ts`: BLIND display mode (darken all cells, show known terrain faintly) |

**Verification**: Drink blindness potion → screen goes dark → infravision shows only nearby monsters

---

### WP-H: Save/Load Completion [M]

**Scope**: `save/load.ts`, `web/src/main.ts`
**Prerequisites**: None

| Task | Details |
|------|---------|
| H1 | `load.ts`: Look up correct race/class from `monsterRaces` / `objectKinds` on load (eliminate placeholders) |
| H2 | `load.ts`: Save data version migration framework (old version → new format conversion) |
| H3 | `save.ts`: Complete object serialization (save kindIdx, egoIdx, art_idx) |
| H4 | Character dump (text output: stats/equipment/kill count/depth) |

**Verification**: Save → restart browser → load → equipment/inventory fully restored

---

### WP-I: Player Calculation Fixes [S]

**Scope**: `player/calcs.ts`, `player/birth.ts`
**Prerequisites**: None

| Task | Details |
|------|---------|
| I1 | `calcs.ts`: Fix `calcBlows()` to use correct calculation based on equipped weapon weight/class (currently fixed at 100) |
| I2 | `birth.ts`: Properly initialize equipment slots in `createDefaultBody()` (currently empty array) |
| I3 | `calcs.ts`: Call `calcBonuses()` every turn in the game loop cleanup |

**Verification**: Heavy weapon → fewer blows, light weapon → more blows

---

### WP-J: Unimplemented Game Loop Processing [M]

**Scope**: `game/world.ts`
**Prerequisites**: WP-A (monster spell data) recommended

| Task | Details |
|------|---------|
| J1 | Natural monster spawning: place 1 random monster every depth×2+10 turns |
| J2 | Object timeout: wand charge recovery, torch fuel consumption |
| J3 | `process_player_cleanup()`: Recalculate `calcBonuses()` every turn |
| J4 | `reset_monsters()`: Clear MFLAG_HANDLED |
| J5 | Fix monster HP regeneration cycle (monsters with REGENERATE flag use 50-turn cycle) |

**Verification**: Stay on the same level for a long time → new monsters appear

---

### WP-K: Command Repeat & Keymaps [S]

**Scope**: `game/world.ts`, `web/src/game-bridge.ts`, `web/src/keyboard-input.ts`
**Prerequisites**: None

| Task | Details |
|------|---------|
| K1 | Numeric prefix input (e.g., `5s` = search 5 times) |
| K2 | Repeat interruption conditions (monster detected, damage received, new message) |
| K3 | Roguelike keymap mode (hjkl movement, yubn diagonal movement alternate interpretation) |

**Verification**: Enter `99s` → 99 searches auto-execute → interrupted on monster detection

---

## 8. Dependencies & Suggested Order

```
Independent (can start immediately):
  WP-A (Monster spell data)
  WP-B (Effect handlers)
  WP-C (Dungeon generation)
  WP-D (Town & shops)
  WP-E (Projection visuals)
  WP-F (Blow effects)
  WP-G (FOV enhancement)
  WP-H (Save/load)
  WP-I (Player calculations)
  WP-K (Repeat & keymaps)

Has dependencies:
  WP-J (Game loop) ← WP-A recommended (spell data needed for J1 to be complete)

Suggested order:
  1st wave: WP-A, WP-C, WP-D, WP-F, WP-I  (foundation fixes)
  2nd wave: WP-B, WP-G, WP-H, WP-J         (system completion)
  3rd wave: WP-E, WP-K                       (polish)
```

### 4-Agent Distribution Example

| Agent | WP | Estimated Workload |
|-------|-----|-------------------|
| Agent 1 | WP-B (Effects XL) + WP-F (Blow S) | Heavy |
| Agent 2 | WP-C (Generation L) + WP-D (Town L) | Heavy |
| Agent 3 | WP-A (Spell data M) + WP-J (Loop M) + WP-I (Calculations S) | Medium |
| Agent 4 | WP-G (FOV M) + WP-H (Save M) + WP-E (Visuals M) | Medium |

Remaining WP-K (S) is picked up by whichever agent finishes first.

### 2-Agent Distribution Example

| Agent | WP |
|-------|-----|
| Agent 1 (Core) | WP-A + WP-B + WP-F + WP-I + WP-J |
| Agent 2 (UI/Generation) | WP-C + WP-D + WP-E + WP-G + WP-H + WP-K |

---

## 9. Intentionally Deferred Items

| Item | Reason |
|------|--------|
| Random artifacts (`obj-randart.c`) | Extremely complex generation algorithm |
| Item ignoring/squelching (`obj-ignore.c`) | QoL feature, not core |
| Multi-window UI | Requires fundamental UI architecture change |
| Mouse/sound | Low priority |
| Persistent levels | Requires level cache system |
| Group AI | Complex coordinated behavior |
| High score table | Cosmetic |
| Wizard mode | Debug only |
| SMART AI (`known_pstate`) | Advanced AI, low priority |
| `project_obj` (projection → object destruction) | Niche feature |
| Monster shape-shifting (`mon-shape.c`) | Type fields exist but logic is complex |
| Per-monster heatmaps (`monster->flow`) | Current BFS sound/scent works sufficiently |

---

## 10. Testing Strategy

| Level | Target | Current State |
|-------|--------|---------------|
| Unit tests | Individual module functions | 1,443 tests / 58 files (all passing) |
| Integration tests | Command → state change | Partially covered in combat.test.ts, world.test.ts |
| E2E tests | Browser interaction → game progression | **Not implemented** |

Verification for each WP completion:
1. `npm run build` — 0 type errors
2. `npm test` — all tests pass (adding new tests recommended)
3. Manual browser check — verify the relevant feature works

---

## 11. Design Principles

1. **Pure functions first**: Commands return `CommandResult`. Side effects are applied by the caller
2. **Type safety**: Branded type IDs (`MonsterId`, `ObjectKindId`, etc.) prevent type confusion
3. **Event-driven UI**: core → EventBus → web. Core has no knowledge of DOM
4. **Data-driven**: Game data is JSON, logic is TypeScript. Adding a new monster = JSON edit only
5. **Faithful C version port**: Function/variable names follow C version conventions (`cmdWalk` ← `do_cmd_walk`, `resolveBlowEffect` ← `monster_blow_effect`)
6. **Tests required**: New features must include tests. SKIP = FAIL
