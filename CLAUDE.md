# iCARE++

Three apps in one repo: `web/` (Next.js portal and API), `mobile/` (Expo app) and `ml/`
(Python model service). `web/CLAUDE.md` has the web-specific notes.

## Before every commit: run `./check.sh`

Run `./check.sh` from the repo root before every commit, and commit only when it ends with
"All blocking checks passed". It runs what CI runs for all three apps, plus a secret scan, a
migration-number check and `npm audit`. It takes a few minutes, so start it in the background.
`./check.sh web` (or `mobile`, `ml`) limits it to the apps you name; the security checks always
run.

- **Blocking failures** (typecheck, build, secrets, migration numbers) must be fixed before
  committing.
- **Warnings** (lint, audit) don't block, but read them. Fix lint errors in code you touched,
  and say why when an audit finding is left alone.
- **When it fails for a reason that isn't the code**, such as a generated folder or a tool
  change, fix `check.sh` in the same change rather than working around it.

The mobile audit warning is expected for now: npm's suggested fixes are major-version jumps tied
to the Expo SDK. They belong with the next SDK upgrade, which needs a new APK build anyway.
