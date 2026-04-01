# Angband Game Flow Analysis & Implementation Status

## Overall Flow

```
┌──────────────┐    ┌──────────────┐    ┌───────────────────┐
│  1. Startup  │───▶│  2. Character│───▶│  3. Town (Depth 0) │
│  Title Screen│    │  Creation    │    │  Shops & Prep      │
└──────────────┘    └──────────────┘    └────────┬──────────┘
                                                 │
                                                 ▼
                    ┌───────────────────────────────────────────┐
                    │  4. Main Game Loop (each turn)            │
                    │                                           │
                    │  4a. Player Phase                         │
                    │      Energy >= 100 → Command Input → Exec │
                    │                                           │
                    │  4b. Monster Phase                        │
                    │      Each monster: AI decision → Move/Atk │
                    │                                           │
                    │  4c. World Phase                          │
                    │      HP/MP regen, hunger, timed effects   │
                    │                                           │
                    │  4d. Energy Grant & Turn Advance          │
                    └──┬─────────────┬────────────┬─────────────┘
                       │             │            │
                       ▼             ▼            ▼
                ┌──────────┐  ┌──────────┐  ┌──────────────┐
                │ 5. Stairs│  │ 6. Death │  │ 7. Victory   │
                │ Up/Down  │  │ Tombstone│  │ Morgoth Kill │
                │ New Level│  │ Score    │  │ Score        │
                │ Generate │  │ Record   │  │ Record       │
                └──────────┘  └──────────┘  └──────────────┘
```

---

## Implementation Status by Phase

### ✅ = Working | ⚠️ = Core exists but UI not connected | ❌ = Not implemented

---

### 1. Startup & Title Screen

| Feature | Status | Notes |
|---------|--------|-------|
| Title screen display | ✅ | birth-screen.ts ASCII art |
| "Press any key" prompt | ✅ | |

---

### 2. Character Creation (Birth)

| Feature | Status | Notes |
|---------|--------|-------|
| Race selection (11 races) | ✅ | p_race.json loaded, stats displayed |
| Class selection (9 classes) | ✅ | class.json loaded, stats displayed |
| Name input | ✅ | Random name generation available |
| Stat rolling | ✅ | birth.ts rollStats() |
| HP rolling | ✅ | birth.ts rollHP() |
| Age/height/weight | ✅ | birth.ts getAHW() |
| Starting equipment | ⚠️ | Class startItems exist but loading not implemented |
| Starting gold | ✅ | 600 gold |

---

### 3. Town Level (Depth 0)

| Feature | Status | Notes |
|---------|--------|-------|
| Town map generation | ❌ | Dungeon is generated even at depth 0 |
| Shop placement | ❌ | Feat.STORE_* defined but not generated |
| Item buying/selling | ⚠️ | store.ts implemented, UI not connected |
| Home (HOME) | ⚠️ | store.ts implemented, UI not connected |

---

### 4. Main Game Loop

#### 4a. Player Phase — Commands

| Command | Status | Details |
|---------|--------|---------|
| **Movement (8-dir)** | ✅ | Arrow/numpad/vi keys |
| **Wall collision** | ✅ | granite, perm, rubble, etc. |
| **Auto door open** | ✅ | Moving into CLOSED → changes to OPEN |
| **Stair use < >** | ✅ | Depth change + new level generation |
| **Look around /** | ✅ | Shows terrain under feet |
| **Help ?** | ✅ | Key list display |
| **Melee attack** | ❌ | Nothing happens when bumping into a monster |
| **Fire f** | ❌ | Stub message only |
| **Throw v** | ❌ | Stub message only |
| **Open door o** | ❌ | "Which direction?" prompt only |
| **Close door c** | ❌ | "Which direction?" prompt only |
| **Search s** | ❌ | Message only, no trap/secret door detection |
| **Tunnel T** | ❌ | Not connected |
| **Disarm D** | ❌ | Not connected |
| **Bash B** | ❌ | Not connected |
| **Cast spell m** | ❌ | "You don't know any spells" message only |
| **Pick up item g** | ❌ | "Nothing here" message only |
| **Drop item d** | ❌ | "You have nothing" message only |
| **Wield/wear w** | ❌ | Not connected |
| **Take off t** | ❌ | Not connected |
| **Inventory i** | ❌ | "Pack is empty" message only |
| **Equipment list e** | ❌ | "No equipment" message only |
| **Quaff q** | ❌ | Not connected |
| **Read r** | ❌ | Not connected |
| **Eat E** | ❌ | Not connected |
| **Zap wand z** | ❌ | Not connected |
| **Activate staff a** | ❌ | Not connected |
| **Rest . R** | ❌ | Message only, no recovery |

#### 4b. Monster Phase

| Feature | Status | Notes |
|---------|--------|-------|
| Energy system | ✅ | Via world.ts EXTRACT_ENERGY |
| Monster AI | ✅ | Via move.ts monsterTakeTurn() |
| Monster movement | ✅ | processMonsters → monsterMove |
| Monster attacks | ✅ | processMonsters → monsterAttack |
| Monster spells | ⚠️ | spell.ts implemented but UI not connected |
| Monster display | ✅ | Race-specific char/color (race.dChar/dAttr) |

#### 4c. World Phase

| Feature | Status | Notes |
|---------|--------|-------|
| HP natural regen | ⚠️ | world.ts regenerateHP() implemented |
| MP natural regen | ⚠️ | world.ts regenerateMana() implemented |
| Hunger processing | ⚠️ | world.ts processHunger() implemented |
| Timed effect decay | ⚠️ | player/timed.ts implemented |
| Turn progression | ✅ (basic) | state.turn++ only |

---

### 5. Level Transition

| Feature | Status | Notes |
|---------|--------|-------|
| Up stair detection | ✅ | Feat.LESS |
| Down stair detection | ✅ | Feat.MORE |
| New dungeon generation | ✅ | generateDungeon() |
| Player placement | ✅ | placePlayerOnStairs() |
| Depth tracking | ✅ | state.depth updated |
| Max depth tracking | ✅ | player.maxDepth updated |

---

### 6. Death & Game Over

| Feature | Status | Notes |
|---------|--------|-------|
| HP <= 0 check | ❌ | Cannot die since no damage is taken |
| Cause of death record | ❌ | |
| Tombstone display | ❌ | |
| Score recording | ❌ | |
| Game loop termination | ⚠️ | state.dead check exists but is never set |

---

### 7. Victory

| Feature | Status | Notes |
|---------|--------|-------|
| Morgoth spawn (depth 100) | ❌ | |
| Morgoth kill detection | ❌ | |
| Victory flag setting | ❌ | |
| Victory screen | ❌ | |

---

### 8. Save/Load

| Feature | Status | Notes |
|---------|--------|-------|
| JSON format save | ⚠️ | save.ts implemented |
| Load & restore | ⚠️ | load.ts implemented |
| Save from UI | ❌ | No key binding |
| Load from UI | ❌ | No menu |
| Auto-save | ❌ | |

---

## Core Implementation vs UI Connection Status

```
                    Core Engine          Web UI (game-bridge.ts)
                    ───────────          ──────────────────────
  Game loop         game/world.ts        ✅ Uses runGameLoop()
  Energy            game/world.ts        ✅ EXTRACT_ENERGY
  Movement          command/movement.ts  ✅ cmdWalk → auto-attack support
  Stairs            command/movement.ts  ✅ cmdGoUp/cmdGoDown
  Combat            command/combat.ts    ✅ cmdAttack/cmdFire/cmdThrow
  Monster AI        monster/move.ts      ✅ Via processMonsters
  Monster attacks   monster/attack.ts    ✅ Via processMonsters
  HP/MP regen       game/world.ts        ✅ Via processWorld
  Hunger            game/world.ts        ✅ Via processWorld
  Timed effects     player/timed.ts      ✅ Via processWorld
  Item use          command/item.ts      ✅ Eat/quaff/read/zap/activate w/ UI
  Equipment         object/gear.ts       ✅ Wield/remove/drop w/ UI
  Magic             command/magic.ts     ✅ Cast/learn w/ UI
  Save              save/save.ts         ✅ Ctrl+S → localStorage
  Load              save/load.ts         ✅ Auto-detect on startup
  Death screen      (new)                ✅ Tombstone ASCII art display
  Victory screen    (new)                ✅ Victory message display
  Effects           effect/handler.ts    ⚠️ Basic only (simplified)
  Projection        project/project.ts   ⚠️ Core implemented, UI not connected
  Shops             store/store.ts       ❌ Town map not generated
  Starting equip    (birth)              ❌ Class startItems not loaded
```

---

## Revision History

### Phase A: Game Loop Integration ✅
Replaced game-bridge.ts simple loop with core's runGameLoop().
Implemented CommandInputProvider for key input → GameCommand conversion.
Energy system, monster AI, and world processing now functional.

### Phase B: Combat Connection ✅
Auto-connected through Phase A integration. cmdWalk calls cmdAttack when adjacent to a monster.
processMonsters() handles monster attacks. HP <= 0 → death check.

### Phase C: Items & Equipment ✅
Connected all item commands to the dispatcher in command/core.ts.
Implemented inventory display (i), equipment display (e),
and item selection UI (letter-based) in game-bridge.ts.

### Phase D: Magic & Effects ✅
Implemented spellcasting UI (m/p) and spell learning UI (G).
Spell list display (name/level/SP cost/failure rate).
Connected to core castSpell/learnSpell.

### Phase E: Save/Load ✅
Ctrl+S → localStorage save.
Save data detection on startup → "Continue/New Game" selection screen.
Race/class template restoration support.

### Phase F: Death & Victory Screens ✅
Tombstone ASCII art (name/race/class/cause of death/depth/level/turns).
Victory screen message. Auto-delete save data on death/victory.

### Phase G: Monster Generation Fix ✅
Loaded monster.json + monster_base.json and parsed into MonsterRace[].
Rewrote populateMonsters() to use placeNewMonster(),
generating proper Monster objects (with HP/speed/AI/sleep state).
Added GameState.monsters / GameState.monsterRaces.
Auto-generate monsters for new levels on stair-based level transitions.
Monster display now uses race-specific char/color (race.dChar / race.dAttr).

### Phase H: Combat & Level Transition Quality Fix ✅
- Replaced monster melee attacks with monsterAttackPlayer() (hit/miss checks,
  damage dice, AC reduction, criticals, status effects). Removed simplified damage calc.
- Decrement old monsters' race.curNum on level transition in changeLevel().
  Fixed bug where UNIQUE monsters were permanently blocked.
- Immediately break loop in processMonsters() on player death.
- Changed drawMap() monster lookup from O(n) find() to O(1) Map<midx, Monster>.
- Fixed dead/absent monster rendering from red "m" to terrain fallthrough.
- Removed unused getMonsters() function.

---

## Remaining Tasks (by priority)

1. **Starting equipment**: Load class startItems and add to inventory
2. **Town map generation**: Place 8 shops + home at depth 0
3. **Shop UI**: Connect store.ts storeBuy/storeSell to UI
4. **Projection effect visualization**: Display beam/bolt trajectories
5. **Morgoth spawn**: Place boss at depth 100, kill → set totalWinner
6. **monster-loader expansion**: innate-freq, spells, spell-power, flags-off not yet parsed
7. **Save/Load**: Serialization/deserialization of monsters array not implemented
