#!/bin/bash
# Run C borg + TS server and C borg native alternately, with 10-min timeout per run.
# Usage: ./tools/run-alternating.sh [rounds] [timeout_sec]
#   rounds:      number of TS+C pairs (default: 5 = 10 total runs)
#   timeout_sec: per-run timeout in seconds (default: 600 = 10 min)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
C_ROOT="$(cd "$TS_ROOT/../angband" && pwd)"
C_ANGBAND="$C_ROOT/build/game/angband"

ROUNDS="${1:-5}"
TIMEOUT="${2:-600}"
PORT=9876
LOG_DIR="$TS_ROOT/tools/logs"
mkdir -p "$LOG_DIR"

TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
SUMMARY="$LOG_DIR/summary_${TIMESTAMP}.txt"

# macOS-compatible timeout: use gtimeout if available, else shell-based
run_with_timeout() {
  local secs="$1"; shift
  if command -v gtimeout >/dev/null 2>&1; then
    gtimeout "$secs" "$@"
    return $?
  fi
  # Shell-based timeout using process group kill
  "$@" &
  local cmd_pid=$!
  (
    sleep "$secs"
    # Kill the process and its children
    kill "$cmd_pid" 2>/dev/null
    sleep 1
    kill -9 "$cmd_pid" 2>/dev/null
  ) &
  local watcher_pid=$!
  wait "$cmd_pid" 2>/dev/null
  local exit_code=$?
  kill "$watcher_pid" 2>/dev/null
  wait "$watcher_pid" 2>/dev/null || true
  # If killed by our watcher, treat as timeout (exit 143=SIGTERM, 137=SIGKILL)
  if [ "$exit_code" -eq 143 ] || [ "$exit_code" -eq 137 ]; then
    return 124  # mimic GNU timeout exit code
  fi
  return "$exit_code"
}

printf "%-4s %-6s %-8s %-6s %-6s %-8s %-6s %s\n" \
  "Run" "Mode" "Timeout?" "Turns" "CL" "MaxDL" "Kills" "Death" \
  | tee "$SUMMARY"
printf "%-4s %-6s %-8s %-6s %-6s %-8s %-6s %s\n" \
  "---" "------" "--------" "------" "------" "--------" "------" "-----" \
  | tee -a "$SUMMARY"

# macOS-compatible grep helpers (no -P, use -E or sed)
max_cl() {
  grep -oE 'CL[0-9]+' "$1" 2>/dev/null | sed 's/CL//' | sort -n | tail -1 || echo "?"
}

max_dl() {
  grep -oE 'depth=[0-9]+' "$1" 2>/dev/null | sed 's/depth=//' | sort -n | tail -1 || echo "?"
}

kill_count() {
  grep -c '\[XP\] Killed' "$1" 2>/dev/null || echo 0
}

extract_turn() {
  grep -oE 'turn=[0-9]+' "$1" 2>/dev/null | sed 's/turn=//' | tail -1 || echo "0"
}

extract_death() {
  grep 'Player died:' "$1" 2>/dev/null | sed 's/.*Player died: //' | tail -1 || echo ""
}

run_ts_mode() {
  local run_id="$1"
  local seed="$((RANDOM * 32768 + RANDOM))"
  local ts_log="$LOG_DIR/run${run_id}_ts_server.log"
  local borg_log="$LOG_DIR/run${run_id}_ts_borg.log"

  # Start TS server
  cd "$TS_ROOT"
  npx tsx packages/@angband/core/src/borg/remote-server.ts \
    --port "$PORT" --seed "$seed" \
    >"$ts_log" 2>&1 &
  local ts_pid=$!

  # Wait for server to start listening
  for i in $(seq 1 30); do
    if lsof -i ":$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
      break
    fi
    sleep 0.5
  done

  # Start C borg in remote mode with timeout
  local timed_out="no"
  local borg_exit=0
  cd "$C_ROOT"
  run_with_timeout "$TIMEOUT" \
    ./build/game/angband -mborg -n -- --remote "localhost:$PORT" \
    >"$borg_log" 2>&1 || borg_exit=$?

  if [ "$borg_exit" -eq 124 ]; then
    timed_out="yes"
  fi

  # Wait a moment then kill TS server if still running
  sleep 1
  if kill -0 "$ts_pid" 2>/dev/null; then
    kill "$ts_pid" 2>/dev/null || true
    sleep 2
    # Force kill if SIGTERM didn't work (node may ignore SIGTERM in event loop)
    if kill -0 "$ts_pid" 2>/dev/null; then
      kill -9 "$ts_pid" 2>/dev/null || true
    fi
    wait "$ts_pid" 2>/dev/null || true
    if [ "$timed_out" = "no" ]; then
      timed_out="yes"
    fi
  else
    wait "$ts_pid" 2>/dev/null || true
  fi

  local turns; turns=$(extract_turn "$ts_log")
  turns="${turns:-0}"
  local cl; cl=$(max_cl "$ts_log")
  cl="${cl:-?}"
  local dl; dl=$(max_dl "$ts_log")
  dl="${dl:-?}"
  local kills; kills=$(kill_count "$ts_log")
  local death; death=$(extract_death "$ts_log")
  death="${death:-survived}"

  if [ "$turns" = "0" ] && [ "$timed_out" = "no" ]; then
    timed_out="crash?"
  fi

  printf "%-4s %-6s %-8s %-6s %-6s %-8s %-6s %s\n" \
    "$run_id" "TS" "$timed_out" "$turns" "$cl" "$dl" "$kills" "$death" \
    | tee -a "$SUMMARY"
}

run_c_mode() {
  local run_id="$1"
  local borg_log="$LOG_DIR/run${run_id}_c.log"

  local timed_out="no"
  local borg_exit=0
  cd "$C_ROOT"
  run_with_timeout "$TIMEOUT" \
    ./build/game/angband -mborg -n \
    >"$borg_log" 2>&1 || borg_exit=$?

  if [ "$borg_exit" -eq 124 ]; then
    timed_out="yes"
  fi

  # C borg logs — extract what we can
  local turns="?" cl="?" dl="?" kills="?" death="?"
  if [ -s "$borg_log" ]; then
    turns=$(grep -oE 'Turn:[[:space:]]*[0-9]+' "$borg_log" 2>/dev/null | sed 's/Turn:[[:space:]]*//' | tail -1)
    turns="${turns:-?}"
    cl=$(grep -oE 'Clevel:[[:space:]]*[0-9]+' "$borg_log" 2>/dev/null | sed 's/Clevel:[[:space:]]*//' | tail -1)
    cl="${cl:-?}"
    dl=$(grep -oE 'Dlevel:[[:space:]]*[0-9]+' "$borg_log" 2>/dev/null | sed 's/Dlevel:[[:space:]]*//' | tail -1)
    dl="${dl:-?}"
    kills=$(grep -oE 'Kills:[[:space:]]*[0-9]+' "$borg_log" 2>/dev/null | sed 's/Kills:[[:space:]]*//' | tail -1)
    kills="${kills:-?}"
    death=$(grep 'Killed by ' "$borg_log" 2>/dev/null | sed 's/.*Killed by //' | tail -1)
    death="${death:-?}"
  fi

  printf "%-4s %-6s %-8s %-6s %-6s %-8s %-6s %s\n" \
    "$run_id" "C" "$timed_out" "$turns" "$cl" "$dl" "$kills" "$death" \
    | tee -a "$SUMMARY"
}

cleanup() {
  pkill -f "remote-server.ts.*--port $PORT" 2>/dev/null || true
  pkill -f "angband.*-mborg" 2>/dev/null || true
  sleep 1
}

trap cleanup EXIT

echo ""
echo "=== Alternating TS/C borg runs: ${ROUNDS} rounds, ${TIMEOUT}s timeout ==="
echo "    Logs: $LOG_DIR"
echo ""

for r in $(seq 1 "$ROUNDS"); do
  run_id=$((r * 2 - 1))
  echo "[Run $run_id/$((ROUNDS * 2))] TS mode (seed=random)..."
  cleanup
  run_ts_mode "$run_id"

  run_id=$((r * 2))
  echo "[Run $run_id/$((ROUNDS * 2))] C native mode..."
  cleanup
  run_c_mode "$run_id"
done

echo ""
echo "=== Done. Summary: $SUMMARY ==="
cat "$SUMMARY"
