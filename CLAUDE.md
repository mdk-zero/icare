# iCARE++

Three apps in one repo: `web/` (Next.js portal and API), `mobile/` (Expo app) and `ml/`
(Python model service). `web/CLAUDE.md` has the web-specific notes.

## Before committing: run `./check.sh` for what the commit touches

Run only the part of `./check.sh` (from the repo root) that the commit's paths need, and commit
only when it ends with "All blocking checks passed":

| The commit touches | Run | Takes |
|---|---|---|
| Code, config or package files in `web/`, `mobile/` or `ml/` | `./check.sh <those apps>`, e.g. `./check.sh web` | minutes, so start it in the background |
| `check.sh` or `.github/workflows/` | `./check.sh` (everything) | minutes |
| Only docs, Markdown (CLAUDE.md files too), `.claude/`, diagrams or SQL migrations | `./check.sh security` | seconds |

The app runs do what CI does, plus `npm audit`. Every run, `security` included, scans the
changed files for secrets, checks that no secret-shaped file is tracked, and checks that no two
migrations share a number. The repo is public, so never skip the `security` run. Don't run the
app checks again when nothing in them changed since the last green run.

- **Blocking failures** (typecheck, build, secrets, migration numbers) must be fixed before
  committing.
- **Warnings** (lint, audit) don't block, but read them. Fix lint errors in code you touched,
  and say why when an audit finding is left alone.
- **When it fails for a reason that isn't the code**, such as a generated folder or a tool
  change, fix `check.sh` in the same change rather than working around it.

The mobile audit warning is expected for now. What is left after the SDK 58 upgrade sits inside
Expo's own tooling (`zod` and `deepmerge` under `@expo/cli` and `@expo/config`), where `--force`
would break Expo, and in `react-native-markdown-display` (`linkify-it`), which has no fix. Leave
them for the next SDK upgrade.
