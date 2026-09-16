#!/usr/bin/env bash
#
# Pre-push checks for the iCARE++ stack — everything .github/workflows/ci.yml
# runs, plus security checks CI doesn't, so a push to main doesn't come back
# red (or worse, leak a credential).
#
#   security  nothing secret-shaped tracked by git; secret scan over the
#             files this push would touch
#   repo      duplicate migration numbers in web/supabase/migrations
#   web       next typegen → tsc → eslint (advisory) → next build
#   mobile    tsc → eslint (advisory)
#   ml        byte-compiles the Python sources (there is no test suite yet)
#   audit     npm audit --audit-level=high, web + mobile (advisory)
#
# Usage:
#   ./check.sh                # everything
#   ./check.sh web mobile     # only the stacks you name (security always runs)
#   ./check.sh --quick        # skip the slow parts (next build, npm audit)
#   NO_COLOR=1 ./check.sh     # drop the ANSI colours
#
# Exit status is 0 only when every blocking check passed. Lint and audit are
# advisory — they warn without failing, matching CI's continue-on-error.

if [ -z "${BASH_VERSION:-}" ]; then
  echo "check.sh needs bash. On Windows run it from Git Bash or WSL:  bash check.sh" >&2
  exit 1
fi

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ] && [ "${TERM:-}" != dumb ]; then
  GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'
  DIM=$'\033[2m'; BOLD=$'\033[1m'; RESET=$'\033[0m'
else
  GREEN=; YELLOW=; RED=; DIM=; BOLD=; RESET=
fi

# ---- arguments --------------------------------------------------------------

services=()
quick=0
for arg in "$@"; do
  case "$arg" in
    --quick)       quick=1 ;;
    web|ml|mobile) services+=("$arg") ;;
    *)
      printf '%sUnknown argument "%s". Usage: ./check.sh [--quick] [web] [ml] [mobile]%s\n' \
        "$RED" "$arg" "$RESET" >&2
      exit 2 ;;
  esac
done
[ ${#services[@]} -eq 0 ] && services=(web ml mobile)

enabled() {
  local s
  for s in "${services[@]}"; do [ "$s" = "$1" ] && return 0; done
  return 1
}

# ---- result plumbing --------------------------------------------------------

LOGDIR="$(mktemp -d)"
trap 'rm -rf "$LOGDIR"' EXIT

result_names=()
result_states=()
fail_count=0

record() {
  result_names+=("$1")
  result_states+=("$2")
  [ "$2" = FAIL ] && fail_count=$((fail_count + 1))
  return 0
}

# run <blocking|advisory> <name> <dir> <command...>
#
# Output is captured; on success only a one-line "ok" is printed, on failure
# the tail of the log. A failing advisory check records WARN instead of FAIL.
run() {
  local mode=$1 name=$2 dir=$3; shift 3
  local log="$LOGDIR/${name//[^A-Za-z0-9]/_}.log" t0=$SECONDS
  printf '%s→ %s …%s ' "$DIM" "$name" "$RESET"
  if (cd "$ROOT/$dir" && "$@") >"$log" 2>&1; then
    printf '%sok%s %s(%ss)%s\n' "$GREEN" "$RESET" "$DIM" "$((SECONDS - t0))" "$RESET"
    record "$name" PASS
  elif [ "$mode" = advisory ]; then
    printf '%swarn%s %s(%ss)%s\n' "$YELLOW" "$RESET" "$DIM" "$((SECONDS - t0))" "$RESET"
    sed 's/^/    /' <(tail -n 10 "$log")
    record "$name" WARN
  else
    printf '%sFAIL%s %s(%ss)%s\n' "$RED" "$RESET" "$DIM" "$((SECONDS - t0))" "$RESET"
    sed 's/^/    /' <(tail -n 40 "$log")
    record "$name" FAIL
  fi
}

skip() {
  printf '%s→ %s … skipped (%s)%s\n' "$DIM" "$1" "$2" "$RESET"
  record "$1" SKIP
}

# ---- security: nothing secret-shaped may be tracked by git ------------------

tracked_secrets() {
  local bad
  bad=$(git -C "$ROOT" ls-files |
    grep -E '(^|/)\.env(\.[^/]*)?$|service-account[^/]*\.json$|\.(pem|p12|pfx|jks|keystore)$' |
    grep -v '\.env\.example$' || true)
  [ -z "$bad" ] && return 0
  printf 'These files look like secrets and are tracked by git:\n%s\n' "$bad"
  printf 'Untrack with `git rm --cached <file>` — and rotate the credential,\n'
  printf 'because it is already in the history.\n'
  return 1
}

# ---- security: secret scan over the files this push would touch -------------
#
# Scans the current content of every file that is new, modified, or committed
# but not yet pushed. Matches are reported as file:line + rule name only —
# the matched text itself is never echoed, so the secret does not end up in
# scrollback or a CI log.

scan_files() {
  {
    git -C "$ROOT" diff --name-only HEAD --
    git -C "$ROOT" ls-files --others --exclude-standard
    local upstream
    if upstream=$(git -C "$ROOT" rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null); then
      git -C "$ROOT" diff --name-only "$upstream...HEAD" --
    fi
  } | sort -u
}

secret_scan() {
  # rule name | extra grep flag | pattern
  local rules=(
    'private key||-----BEGIN [A-Z ]*PRIVATE KEY-----'
    'JWT (Supabase keys are JWTs)||eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}'
    'Supabase secret key||sb_secret_[A-Za-z0-9_-]{16,}'
    'Google API key||AIza[0-9A-Za-z_-]{35}'
    'GitHub token||\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,}'
    'AWS access key||\bAKIA[0-9A-Z]{16}\b'
    'Slack token||xox[baprs]-[A-Za-z0-9-]{10,}'
    'Anthropic/OpenAI key||\bsk-(ant-)?[A-Za-z0-9_-]{20,}'
    'hardcoded credential|-i|(password|passwd|secret|api_?key|auth_?token)["'\'']?[[:space:]]*[:=][[:space:]]*["'\''][^"'\'']{8,}["'\'']'
  )
  local f found=0 rule rest name flag pattern hits
  while IFS= read -r f; do
    [ -f "$ROOT/$f" ] || continue                     # deleted since HEAD
    case "$f" in
      check.sh|*.env.example|*package-lock.json|*.lock|\
      *.png|*.jpg|*.jpeg|*.webp|*.gif|*.ico|*.svg|*.ttf|*.otf|*.woff|*.woff2)
        continue ;;
    esac
    for rule in "${rules[@]}"; do
      name=${rule%%|*}; rest=${rule#*|}
      flag=${rest%%|*}; pattern=${rest#*|}
      # -I skips binaries; the second grep drops obvious dummy values.
      hits=$(grep -nHIE ${flag:+"$flag"} "$pattern" "$ROOT/$f" 2>/dev/null |
        grep -viE 'example|dummy|placeholder|change-?me|not[-_]?real|redacted' |
        cut -d: -f1,2 || true)
      if [ -n "$hits" ]; then
        found=1
        printf '%s — possible %s:\n%s\n' "${f}" "$name" "$hits" |
          sed "s|$ROOT/||"
      fi
    done
  done < <(scan_files)
  if [ "$found" -ne 0 ]; then
    printf '\nIf a hit is a real credential: remove it, rotate it, and keep it in\n'
    printf 'an ignored .env file. If it is a false positive, adjust the rule in\n'
    printf 'check.sh (matched text is deliberately not shown above).\n'
    return 1
  fi
}

# ---- repo: migration files must have unique numbers -------------------------

migration_numbers() {
  local dups
  dups=$(ls "$ROOT/web/supabase/migrations" | grep -oE '^[0-9]+' | sort | uniq -d)
  [ -z "$dups" ] && return 0
  printf 'Duplicate migration number(s) in web/supabase/migrations: %s\n' "$dups"
  printf 'Two files sharing a prefix apply in filename order — renumber one.\n'
  return 1
}

# ---- web: build with the same dummy env CI uses -----------------------------
#
# Process env beats .env.local in Next.js, so exporting CI's values catches
# code that only builds locally thanks to a variable CI doesn't have.

web_build() {
  SUPABASE_URL=https://example.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=ci-dummy \
  SUPABASE_ANON_KEY=ci-dummy \
  SESSION_SECRET=ci-dummy-session-secret-not-real \
  NEXT_PUBLIC_GOOGLE_CLIENT_ID=ci-dummy \
  GOOGLE_CLIENT_ID=ci-dummy \
  npm run build
}

# ---- ml: byte-compile every Python source -----------------------------------

ml_compile() {
  local py="$ROOT/ml/.venv/bin/python" dirs=() d
  [ -x "$py" ] || py=$(command -v python3) || { echo 'no python3 on PATH'; return 1; }
  for d in app training eval; do
    [ -d "$ROOT/ml/$d" ] && dirs+=("$d")
  done
  (cd "$ROOT/ml" && "$py" -m compileall -q "${dirs[@]}")
}

# ---- preflight: fail loudly before the first slow step ----------------------

if enabled web || enabled mobile; then
  if ! command -v npm >/dev/null 2>&1; then
    printf '%snpm not found on PATH — install Node.js.%s\n' "$RED" "$RESET" >&2
    exit 1
  fi
fi
for s in web mobile; do
  if enabled "$s" && [ ! -d "$ROOT/$s/node_modules" ]; then
    printf '%s%s/node_modules missing — run: (cd %s && npm install)%s\n' "$RED" "$s" "$s" "$RESET" >&2
    exit 1
  fi
done

# ---- the checks -------------------------------------------------------------

run blocking 'security · tracked secrets' .   tracked_secrets
run blocking 'security · secret scan'     .   secret_scan
run blocking 'repo · migration numbers'   .   migration_numbers

if enabled web; then
  run blocking 'web · next typegen' web npx next typegen
  run blocking 'web · typecheck'    web npx tsc --noEmit
  run advisory 'web · lint'         web npm run lint
  if [ "$quick" -eq 1 ]; then
    skip 'web · build' '--quick'
  else
    run blocking 'web · build' web web_build
  fi
fi

if enabled mobile; then
  run blocking 'mobile · typecheck' mobile npx tsc --noEmit
  run advisory 'mobile · lint'      mobile npm run lint
fi

if enabled ml; then
  run blocking 'ml · compile' . ml_compile
fi

if [ "$quick" -eq 1 ]; then
  skip 'audit · npm audit' '--quick'
else
  enabled web    && run advisory 'audit · web'    web    npm audit --omit=dev --audit-level=high
  enabled mobile && run advisory 'audit · mobile' mobile npm audit --omit=dev --audit-level=high
fi

# ---- summary ----------------------------------------------------------------

printf '\n%s──── summary ────%s\n' "$BOLD" "$RESET"
for i in "${!result_names[@]}"; do
  case "${result_states[$i]}" in
    PASS) printf '  %spass%s  %s\n' "$GREEN"  "$RESET" "${result_names[$i]}" ;;
    WARN) printf '  %swarn%s  %s\n' "$YELLOW" "$RESET" "${result_names[$i]}" ;;
    SKIP) printf '  %sskip%s  %s\n' "$DIM"    "$RESET" "${result_names[$i]}" ;;
    FAIL) printf '  %sFAIL%s  %s\n' "$RED"    "$RESET" "${result_names[$i]}" ;;
  esac
done

if [ "$fail_count" -gt 0 ]; then
  printf '\n%s%d blocking check(s) failed — fix before pushing.%s\n' "$RED" "$fail_count" "$RESET"
  exit 1
fi
printf '\n%sAll blocking checks passed — safe to push.%s\n' "$GREEN" "$RESET"
