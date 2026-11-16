@AGENTS.md

## Before committing web code: run `./check.sh web`

When a commit changes code, config or package files in `web/`, run `./check.sh web` from the
repo root (add `mobile` or `ml` if the commit touches them too). Commit only when it ends with
"All blocking checks passed". It runs typegen, typecheck, lint and build, plus a secret scan, a
migration-number check and `npm audit`. It takes a few minutes, so start it in the background.
Markdown files and SQL migrations alone need only `./check.sh security`. The root `CLAUDE.md`
has the full table.

- **Blocking failures** (typecheck, build, secrets, migration numbers) must be fixed before
  committing.
- **Warnings** (lint, audit) don't block, but read them. Fix lint errors in code you touched,
  and say why when an audit finding is left alone.
- **When it fails for a reason that isn't the code**, such as a generated folder or a tool
  change, fix `check.sh` in the same change rather than working around it.

Things that have tripped it before:

- The typecheck uses `tsconfig.check.json`, not `tsconfig.json`. That leaves out
  `.next/dev/types`, which a `next dev` run can leave half-written (TS1109/TS1128 in
  `validator.ts`). If a plain `npm run build` fails that way, stop the dev server and delete
  `.next/dev/types/validator.ts`; `next dev` writes it again.
- Builds into another folder (`NEXT_DIST_DIR=.next-build`) are ignored by ESLint. Any new
  generated folder needs adding to the ignores in `eslint.config.mjs`, or lint reads the bundles.
- Regenerate `package-lock.json` with `npx -y npm@11 install`, not an older local npm.
