#!/usr/bin/env bash
#
# Starts the iCARE++ dev stack together:
#
#   web     Next.js dev server   http://localhost:3000
#   ml      FastAPI + uvicorn    http://localhost:8000
#   mobile  Expo / Metro bundler
#
# Runs on Linux, macOS, WSL, and Windows (Git Bash / MSYS2 / Cygwin).
#
# Usage:
#   ./start.sh                # all three
#   ./start.sh web ml         # only the ones you name
#   EXPO_CLEAR=1 ./start.sh   # start Expo with -c (clears the Metro cache)
#   NO_COLOR=1 ./start.sh     # drop the ANSI colours
#
# Ctrl+C once stops everything. If any server exits on its own, the rest are
# shut down too, so you never end up with half a stack running.

if [ -z "${BASH_VERSION:-}" ]; then
  echo "start.sh needs bash. On Windows run it from Git Bash or WSL:  bash start.sh" >&2
  exit 1
fi

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---- platform detection -----------------------------------------------------
#
# WSL reports itself as Linux, which is what we want: it has a POSIX kernel and
# a bin/-style virtualenv. Only the MSYS-family shells need the Windows path.

case "$(uname -s 2>/dev/null || echo unknown)" in
  Linux*)               OS=linux   ;;
  Darwin*)              OS=macos   ;;
  MINGW*|MSYS*|CYGWIN*) OS=windows ;;
  *)                    OS=posix   ;;
esac

# Job control, so each background job becomes its own process-group leader.
# Killing the group takes down grandchildren too — `npm run dev` spawns next,
# expo spawns Metro, and uvicorn --reload spawns a worker; signalling only the
# direct child would leave those orphaned and holding ports 3000/8000.
# Windows has no POSIX process groups, so there we shoot the tree with taskkill.
set -m

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ] && [ "${TERM:-}" != dumb ]; then
  CYAN=$'\033[36m'; GREEN=$'\033[32m'; BLUE=$'\033[34m'
  YELLOW=$'\033[33m'; RED=$'\033[31m'; DIM=$'\033[2m'; RESET=$'\033[0m'
else
  CYAN=; GREEN=; BLUE=; YELLOW=; RED=; DIM=; RESET=
fi

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

# ---- portability helpers ----------------------------------------------------

# Finds an executable inside ml/.venv. POSIX venvs put it in bin/, Windows ones
# in Scripts/ with an .exe suffix — probe for the file rather than trusting
# uname, so a Windows-built venv mounted under WSL still resolves.
venv_bin() {
  local name=$1 cand
  for cand in \
    "$ROOT/ml/.venv/bin/$name" \
    "$ROOT/ml/.venv/Scripts/$name.exe" \
    "$ROOT/ml/.venv/Scripts/$name"
  do
    [ -x "$cand" ] && { printf '%s' "$cand"; return 0; }
  done
  return 1
}

# Prefixes every output line with a coloured tag so three interleaved log
# streams stay tellable apart. Done in bash rather than `sed -u`: BSD sed (the
# macOS default) has no -u, and this also strips the CR that Windows tools add.
tag() {
  local prefix=$1 line
  while IFS= read -r line; do
    printf '%s%s\n' "$prefix" "${line%$'\r'}"
  done
  # A final line with no trailing newline — progress bars love these.
  [ -n "${line:-}" ] && printf '%s%s\n' "$prefix" "${line%$'\r'}"
  return 0
}

# Exports the KEY=value pairs from a .env file. Hand-parsed instead of
# `set -a; . ./.env` because a file checked out with CRLF endings would
# otherwise leave a stray \r on the end of every value.
load_env() {
  local file=$1 line key val
  while IFS= read -r line || [ -n "$line" ]; do
    line=${line%$'\r'}
    line=${line#"${line%%[![:space:]]*}"}          # trim leading blanks
    case "$line" in ''|'#'*) continue ;; esac
    case "$line" in 'export '*) line=${line#export } ;; esac
    case "$line" in *=*) ;; *) continue ;; esac
    key=${line%%=*}; val=${line#*=}
    key=${key%"${key##*[![:space:]]}"}             # trim trailing blanks
    case "$key" in ''|*[!A-Za-z0-9_]*) continue ;; esac
    val=${val#"${val%%[![:space:]]*}"}
    case "$val" in
      \"*\") val=${val#\"}; val=${val%\"} ;;
      \'*\') val=${val#\'}; val=${val%\'} ;;
    esac
    export "$key=$val"
  done < "$file"
}

# Kills a job and everything it spawned.
kill_tree() {
  local pid=$1 winpid
  if [ "$OS" = windows ]; then
    winpid=$pid
    [ -r "/proc/$pid/winpid" ] && winpid=$(<"/proc/$pid/winpid")
    # //PID, not /PID: MSYS would rewrite a single leading slash into a path.
    taskkill //PID "$winpid" //T //F >/dev/null 2>&1 ||
      kill -TERM "$pid" 2>/dev/null || true
  else
    # Negative PID = "the whole process group".
    kill -TERM -- "-$pid" 2>/dev/null ||
      kill -TERM "$pid" 2>/dev/null || true
  fi
}

# Blocks until any one job exits. `wait -n` needs bash 4.3+; macOS still ships
# 3.2, so fall back to polling there.
wait_any() {
  if [ "${BASH_VERSINFO[0]}" -gt 4 ] ||
     { [ "${BASH_VERSINFO[0]}" -eq 4 ] && [ "${BASH_VERSINFO[1]}" -ge 3 ]; }; then
    wait -n
    return
  fi
  local pid
  while :; do
    for pid in "${pids[@]}"; do
      kill -0 "$pid" 2>/dev/null || return 0
    done
    sleep 1
  done
}

pids=()
shutting_down=0

cleanup() {
  trap - EXIT INT TERM
  shutting_down=1
  printf '\n%s>> stopping…%s\n' "$YELLOW" "$RESET"
  local pid
  if [ ${#pids[@]} -gt 0 ]; then
    for pid in "${pids[@]}"; do kill_tree "$pid"; done
  fi
  wait 2>/dev/null || true
  printf '%s>> all servers stopped.%s\n' "$YELLOW" "$RESET"
}
trap cleanup EXIT INT TERM

# Runs a command (or a shell function) in <dir> with its output tagged.
start() {
  local name=$1 color=$2 dir=$3; shift 3
  (
    cd "$ROOT/$dir" || exit 1
    "$@" 2>&1 | tag "${color}[${name}]${RESET} "
  ) &
  pids+=("$!")
}

run_ml() {
  load_env ./.env
  # exec replaces the subshell so uvicorn is the process that receives signals.
  exec "$UVICORN" app.main:app --host 0.0.0.0 --port 8000 --reload
}

# ---- preflight: fail loudly here rather than in a wall of scrolling logs ----

need() {
  command -v "$1" >/dev/null 2>&1 && return 0
  printf '%s%s not found on PATH — install Node.js (which ships %s).%s\n' \
    "$RED" "$1" "$1" "$RESET" >&2
  exit 1
}

if enabled web; then
  need npm
  if [ ! -d "$ROOT/web/node_modules" ]; then
    printf '%sweb/node_modules missing — run: (cd web && npm install)%s\n' "$RED" "$RESET" >&2
    exit 1
  fi
fi

if enabled mobile; then
  need npx
  if [ ! -d "$ROOT/mobile/node_modules" ]; then
    printf '%smobile/node_modules missing — run: (cd mobile && npm install)%s\n' "$RED" "$RESET" >&2
    exit 1
  fi
fi

if enabled ml; then
  if ! UVICORN=$(venv_bin uvicorn); then
    if [ "$OS" = windows ]; then
      printf '%sml/.venv missing — run: (cd ml && py -m venv .venv && .venv/Scripts/pip install -r requirements.txt)%s\n' "$RED" "$RESET" >&2
    else
      printf '%sml/.venv missing — run: (cd ml && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt)%s\n' "$RED" "$RESET" >&2
    fi
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
  start ml "$GREEN" ml run_ml
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
wait_any
[ "$shutting_down" -eq 0 ] &&
  printf '\n%s>> a server exited on its own — shutting the rest down.%s\n' "$RED" "$RESET"
