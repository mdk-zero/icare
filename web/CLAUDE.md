@AGENTS.md

## Before every commit: run `./check.sh`

Run `./check.sh` from the repo root before every commit, and commit only when it ends with
"All blocking checks passed". It runs what CI runs (typegen, typecheck, lint, build for web;
typecheck and lint for mobile; the ML compile) plus a secret scan, a migration-number check and
`npm audit`. It takes a few minutes, so start it in the background.

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
