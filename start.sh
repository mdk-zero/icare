#!/usr/bin/env bash
#
# Starts the iCARE++ dev stack together:
#
#   web     Next.js dev server   http://localhost:3000
#   ml      FastAPI + uvicorn    http://localhost:8000
#   mobile  Expo / Metro bundler
#
# Usage:
#   ./start.sh                # all three
#   ./start.sh web ml         # only the ones you name
#   EXPO_CLEAR=1 ./start.sh   # start Expo with -c (clears the Metro cache)
#
# Ctrl+C once stops everything. If any server exits on its own, the rest are
# shut down too, so you never end up with half a stack running.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Job control, so each background job becomes its own process-group leader.
# Killing the group takes down grandchildren too — `npm run dev` spawns next,
# expo spawns Metro, and uvicorn --reload spawns a worker; signalling only the
# direct child would leave those orphaned and holding ports 3000/8000.
set -m

CYAN=$'\033[36m'; GREEN=$'\033[32m'; BLUE=$'\033[34m'
YELLOW=$'\033[33m'; RED=$'\033[31m'; DIM=$'\033[2m'; RESET=$'\033[0m'

services=("$@")
[ ${#services[@]} -eq 0 ] && services=(web ml mobile)

enabled() {
  local s
  for s in "${services[@]}"; do [ "$s" = "$1" ] && return 0; done
  return 1
}

for s in "${services[@]}"; do
  case "$s" in
    web|ml|mobile) ;;
    *) printf '%sUnknown service "%s". Valid: web, ml, mobile.%s\n' "$RED" "$s" "$RESET" >&2; exit 2 ;;
  esac
done

pids=()
shutting_down=0

cleanup() {
  trap - EXIT INT TERM
  shutting_down=1
  printf '\n%s>> stopping…%s\n' "$YELLOW" "$RESET"
  local pid
  for pid in "${pids[@]:-}"; do
    # Negative PID = "the whole process group".
    kill -TERM -- "-$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  printf '%s>> all servers stopped.%s\n' "$YELLOW" "$RESET"
}
trap cleanup EXIT INT TERM

# Runs a command in <dir>, tagging each output line so three interleaved log
# streams stay tellable apart.
start() {
  local name=$1 color=$2 dir=$3; shift 3
  (
    cd "$ROOT/$dir" || exit 1
    "$@" 2>&1 | sed -u "s/^/${color}[${name}]${RESET} /"
  ) &
  pids+=("$!")
}

# ---- preflight: fail loudly here rather than in a wall of scrolling logs ----

if enabled web && [ ! -d "$ROOT/web/node_modules" ]; then
  printf '%sweb/node_modules missing — run: (cd web && npm install)%s\n' "$RED" "$RESET" >&2
  exit 1
fi

if enabled mobile && [ ! -d "$ROOT/mobile/node_modules" ]; then
  printf '%smobile/node_modules missing — run: (cd mobile && npm install)%s\n' "$RED" "$RESET" >&2
  exit 1
fi

if enabled ml; then
  if [ ! -x "$ROOT/ml/.venv/bin/uvicorn" ]; then
    printf '%sml/.venv missing — run: (cd ml && python -m venv .venv && .venv/bin/pip install -r requirements.txt)%s\n' "$RED" "$RESET" >&2
    exit 1
  fi
  if [ ! -f "$ROOT/ml/.env" ]; then
    printf '%sml/.env missing — copy ml/.env.example and fill in Supabase creds.%s\n' "$RED" "$RESET" >&2
    exit 1
  fi
fi

# ---- start ----

if enabled web; then
  start web "$CYAN" web npm run dev
  printf '%s>> web    → http://localhost:3000%s\n' "$DIM" "$RESET"
fi

if enabled ml; then
  # `set -a` exports everything .env defines so uvicorn's child inherits it;
  # exec replaces the shell so uvicorn is the process that receives signals.
  start ml "$GREEN" ml bash -c '
    set -a; . ./.env; set +a
    exec .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
  '
  printf '%s>> ml     → http://localhost:8000%s\n' "$DIM" "$RESET"
fi

if enabled mobile; then
  expo_args=()
  [ "${EXPO_CLEAR:-0}" = "1" ] && expo_args+=(-c)
  start mobile "$BLUE" mobile npx expo start ${expo_args[@]+"${expo_args[@]}"}
  printf '%s>> mobile → Expo (logs are prefixed; see note below)%s\n' "$DIM" "$RESET"
fi

printf '%s>> Ctrl+C to stop everything.%s\n\n' "$DIM" "$RESET"

# Return as soon as ANY child exits, then let the EXIT trap stop the others.
# On Ctrl+C the trap has already run, so only announce a genuine crash.
wait -n
[ "$shutting_down" -eq 0 ] &&
  printf '\n%s>> a server exited on its own — shutting the rest down.%s\n' "$RED" "$RESET"
