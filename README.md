# Angband-TS

A full TypeScript port of [Angband 4.2.6](https://angband.github.io/angband/), the classic roguelike dungeon crawler. Playable in the browser.

## Quick Start

```bash
npm install
npm run build
npm run dev        # opens Vite dev server → play in browser
```

## Project Structure

```
packages/
  @angband/core/       Game engine (player, monsters, dungeon generation, combat, items)
  @angband/web/        Browser UI (Canvas rendering, keyboard input)
  @angband/renderer/   Rendering abstraction layer
tools/
  busho-player.ts      AI player agent — plays Angband autonomously via ai-server
  replay-viewer.html   Replay viewer for recorded game sessions
  run-alternating.sh   Batch runner for multiple AI sessions
  data-converter/      Data conversion utilities (C → TS)
  snapshot-tester/     Snapshot-based regression tests
  logs/                AI game session logs
```

## Development

```bash
npm run dev          # Vite dev server (play in browser)
npm run build        # Production build
npm run typecheck    # TypeScript type checking
npm run test         # Vitest test suite
npm run lint         # ESLint
```

## AI Server

An HTTP server that runs a headless Angband game and exposes it as a structured JSON API. No screen parsing — the AI agent sends `GameCommand`s and receives full game state directly.

### Usage

```bash
# Start the AI server
npx tsx packages/@angband/core/src/borg/ai-server.ts --port 3000

# In another terminal, run the AI player
npx tsx tools/busho-player.ts --port 3000
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/state` | GET | Current game state (player, map, monsters, inventory) |
| `/command` | POST | Send a GameCommand, returns result + updated state |
| `/health` | GET | Server health check |

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--port` | 3000 | HTTP listen port |
| `--race` | Human | Player race |
| `--class` | Warrior | Player class |
| `--seed` | (clock) | RNG seed for reproducible runs |

## Borg Remote Server

A TCP server for the C Borg (the original auto-play AI) to play against the TS engine. Useful for cross-implementation testing between the C and TS versions.

```bash
# Terminal 1: start TS remote server
npx tsx packages/@angband/core/src/borg/remote-server.ts --port 9876

# Terminal 2: connect C Borg
cd ../angband
angband -mborg -n -- --remote localhost:9876
```

### Protocol

The server sends screen frames as `FRAME/ROW/CURSOR/STAT/INVEN/END` messages. The client responds with `KEY <code> <mods>` messages which are translated into game commands.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — Architecture overview
- [ARCHITECTURE_V2.md](ARCHITECTURE_V2.md) — V2 architecture design
- [GAME_FLOW.md](GAME_FLOW.md) — Game loop and flow
- [PLAN.md](PLAN.md) — Porting plan and progress
- [PORTING_DIFF.md](PORTING_DIFF.md) — Differences from the C version

## License

Based on [Angband](https://github.com/angband/angband), licensed under GPL-2.0.
