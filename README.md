# Angband-TS

A full TypeScript port of [Angband 4.2.6](https://angband.github.io/angband/), the classic roguelike dungeon crawler. Playable in the browser, with an AI player that reaches DL34 using a rule-based + LLM hybrid approach.

## Quick Start

```bash
npm install
npm run build
npm run dev        # opens Vite dev server → play in browser
```

## AI Player

An autonomous AI agent that plays Angband via HTTP API. Uses a hybrid architecture: rule-based decisions for 90% of actions, LLM for strategic decisions (fight/flee, descent, equipment).

### Best Results

| Mode | Avg DL | Max DL | Engine |
|------|--------|--------|--------|
| Rules only | 27.7 | 31 | TS (bonus items) |
| + Ollama phi3.5 | — | **34** | TS (bonus items) |
| Vanilla (no bonus) | — | 24 | C Angband |

### Run the AI

```bash
# 1. Start game server
npx tsx packages/@angband/core/src/borg/ai-server.ts --seed 42

# 2. Run AI player (rules only)
npx tsx tools/busho-player.ts

# 3. With local LLM (Ollama)
brew install ollama && ollama pull phi3.5
LLM_BACKEND=ollama npx tsx tools/busho-player.ts

# 4. With Anthropic API
ANTHROPIC_API_KEY=sk-ant-... npx tsx tools/busho-player.ts

# 5. Against C Angband (requires separate build)
API=http://localhost:4000 npx tsx tools/busho-player.ts

# 6. Vanilla mode (no bonus items, matches C version)
VANILLA=1 npx tsx packages/@angband/core/src/borg/ai-server.ts --seed 42
npx tsx tools/busho-player.ts

# 7. Watch replay
open tools/replay-viewer.html  # drag /tmp/busho-replay.jsonl
```

### LLM Hybrid Architecture

```
Rule Layer (90% of actions)          LLM Layer (10% of decisions)
├─ BFS pathfinding                   ├─ Fight or flee? (HP>150 enemies)
├─ Combat (attack weakest)           ├─ Descend? (DL15+, 1x/floor)
├─ Healing / flee                    └─ Weapon swap? (blows risk)
├─ Descent conditions                    │
└─ Exploration                       Learning Cache
                                     └─ /tmp/busho-llm-cache.json
                                        2nd run: 0 LLM calls
```

Supports Ollama (local, free) and Anthropic API (cloud). Falls back to pure rules if no LLM available.

## Project Structure

```
packages/
  @angband/core/       Game engine (player, monsters, dungeon, combat, items)
    src/borg/
      ai-server.ts     HTTP API server for AI play
      remote-server.ts TCP server for C Borg
    src/player/
      calcs.ts         Stat/blow/speed calculations
    src/game/
      world.ts         Game loop, stat gain on level up
  @angband/web/        Browser UI (Canvas, keyboard)
  @angband/renderer/   Rendering abstraction

tools/
  busho-player.ts      AI player (2900 lines, rules + LLM hybrid)
  replay-viewer.html   Browser replay viewer
  data-converter/      C data → JSON converter

# C Angband HTTP server (separate repo)
angband/src/main-http.c   HTTP frontend for original C Angband
```

## Development

```bash
npm run dev          # Vite dev server (play in browser)
npm run build        # Production build
npm run typecheck    # TypeScript type checking
npm run test         # Vitest test suite
npm run lint         # ESLint
```

## API

### AI Server (ai-server.ts)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/state` | GET | Game state (player, map, monsters, inventory) |
| `/command` | POST | Execute `{type, direction, itemIndex}` |
| `/buy` | POST | Buy from store `{storeType, itemIndex}` |
| `/sell` | POST | Sell item `{storeType, itemSlot}` |

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--port` | 3000 | HTTP listen port |
| `--seed` | (clock) | RNG seed for reproducible runs |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `API` | `http://localhost:3000` | Game server URL |
| `LLM_BACKEND` | `ollama` / `anthropic` | LLM backend selection |
| `ANTHROPIC_API_KEY` | — | Anthropic API key (enables cloud LLM) |
| `OLLAMA_MODEL` | `phi3.5` | Ollama model name |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama server URL |
| `VANILLA` | — | Set to `1` to disable bonus items |

## C Angband Integration

The AI player can also control the original C Angband via an HTTP server frontend:

```bash
# Build C Angband with HTTP support
cd angband/build
cmake .. -DSUPPORT_HTTP_FRONTEND=ON -DSUPPORT_BORG=ON
make

# Run
./game/angband -mhttp -n -- --port 4000

# Connect AI
API=http://localhost:4000 npx tsx tools/busho-player.ts
```

Command codes are automatically translated between TS and C formats.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — Full architecture with AI system design
- [GAME_FLOW.md](GAME_FLOW.md) — Game loop and flow
- [PLAN.md](PLAN.md) — Porting plan and progress
- [PORTING_DIFF.md](PORTING_DIFF.md) — Differences from the C version

## License

Based on [Angband](https://github.com/angband/angband), licensed under GPL-2.0.
