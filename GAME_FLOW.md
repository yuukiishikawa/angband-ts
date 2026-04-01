# Angband-TS Game Flow

## Overview

```
┌──────────────┐    ┌──────────────┐    ┌──────────────────┐
│  1. Startup  │───▶│  2. Character│───▶│  3. Town (D:0)   │
│  Title screen│    │  Creation    │    │  Shops & prep    │
└──────────────┘    └──────────────┘    └────────┬─────────┘
                                                 │
                                                 ▼
                    ┌───────────────────────────────────────────┐
                    │  4. Main Game Loop (per turn)             │
                    │                                           │
                    │  4a. Player Phase                         │
                    │      energy >= 100 → input → execute      │
                    │                                           │
                    │  4b. Monster Phase                        │
                    │      each monster: AI → move / attack     │
                    │                                           │
                    │  4c. World Phase                          │
                    │      HP/MP regen, hunger, timed effects   │
                    │                                           │
                    │  4d. Energy grant & turn advance          │
                    └──┬─────────────┬────────────┬─────────────┘
                       │             │            │
                       ▼             ▼            ▼
                ┌──────────┐  ┌──────────┐  ┌──────────────┐
                │ 5. Stairs│  │ 6. Death │  │ 7. Victory   │
                │ New level│  │ Tombstone│  │ Morgoth slain│
                └──────────┘  └──────────┘  └──────────────┘
```

---

## Implementation Status

### ✅ = Working | ⚠️ = Core exists, UI not connected | ❌ = Not implemented

### 1. Startup

| Feature | Status |
|---------|--------|
| Title screen | ✅ |
| Save detection & continue prompt | ✅ |

### 2. Character Creation

| Feature | Status |
|---------|--------|
| Race selection (11 races) | ✅ |
| Class selection (9 classes) | ✅ |
| Name input + random names | ✅ |
| Stat rolls / HP rolls | ✅ |
| Starting equipment | ✅ |

### 3. Town

| Feature | Status |
|---------|--------|
| Town map generation | ❌ |
| Buy/sell logic (core) | ✅ |

### 4a. Player Commands

| Command | Status |
|---------|--------|
| Movement (8-dir), auto-attack | ✅ |
| Stairs, look, help, search | ✅ |
| Open / close / tunnel / disarm | ✅ |
| Ranged attack, spellcasting, study | ✅ |
| Item use (quaff/eat/read/zap/aim) | ✅ |
| Equipment (wield/takeoff/drop) | ✅ |
| Inventory, pickup, rest, save | ✅ |

### 4b. Monsters

| Feature | Status |
|---------|--------|
| Energy system, AI, melee (full blow) | ✅ |
| Sleep/wake, confusion, fear, breeders | ✅ |
| Monster spells | ⚠️ |

### 4c. World

| Feature | Status |
|---------|--------|
| HP/MP regen, hunger, timed effects | ✅ |
| Object timeout (torch, recharge) | ❌ |

### 5-8. Level Transition, Death, Victory, Save/Load

All ✅ — stair detection, dungeon generation, Word of Recall, tombstone, victory screen, JSON save/load with auto-detect.

---

## Core ↔ UI Connection

```
                    Core Engine          Web UI (game-bridge.ts)
                    ───────────          ──────────────────────
  Game loop         game/world.ts        ✅ runGameLoop()
  Energy            game/world.ts        ✅ EXTRACT_ENERGY
  Movement          command/movement.ts  ✅ auto-attack on bump
  Combat            command/combat.ts    ✅ melee/ranged/crit
  Monster AI        monster/move.ts      ✅ processMonsters()
  Regen/hunger      game/world.ts        ✅ processWorld()
  Items/equipment   command/item.ts      ✅ full UI
  Magic             command/magic.ts     ✅ cast/study UI
  Save/load         save/*.ts            ✅ Ctrl+S / auto-detect
  Death/victory     game-bridge.ts       ✅ tombstone / victory
  Effects           effect/handler.ts    ⚠️ ~25/130 handlers
  Projection        project/project.ts   ⚠️ no visual effects
  Shops             store/store.ts       ❌ no town map
```
