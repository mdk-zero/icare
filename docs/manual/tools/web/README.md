# Web screenshots for the user manual

`capture.mjs` retakes the manual's web screenshots: the SET, COM, ADM, DEAN, PC and INS rows (the
web ones) in the plan's shot list. It drives the portal in its demo mode, where the browser
answers every `/api` call itself with hard-coded sample data. No shot needs a real account or
touches the live database.

| File | What it does |
|---|---|
| `capture.mjs` | Opens each row's page in headless Chromium, takes the shot, compresses it and writes it into `docs/manual/img/`. |

The phone screenshots have their own tools in `../phone/`.

Every shot is taken in light mode, at 1440 × 900 (390 × 844 for the one phone-width row), scale 1,
in `Asia/Manila`, with the clock fixed at Monday 2026-11-16, 9:30 AM. A few rows grow the
window's height so a tall form or dialog fits whole.

## What a run does

- Starts the role's demo the way a visitor does: **Try a demo** on `/login`, then the role. The
  Admin portal has no entry in that picker, so the script sets in the browser what the demo's
  `startDemo` sets.
- Shows the pages at the live site's address (`https://www.i-care.dev` by default, `--site`
  changes it), so pages that print their own address read as the real one. Every request is
  answered by the local server.
- Hides what the real app never shows: the demo's welcome and test-run notifications, and the
  demo's one account request, which is shown under a name from the manual's own list.
- Compresses each PNG and writes it under `docs/manual/img/<role>/`.

## Build and serve the portal

Run from the repo root. Playwright and sharp come from `web/node_modules`, so run `npm ci` in
`web/` first if it has none. The script uses the full Chromium build, not the headless shell,
because only it has the PDF viewer the report preview needs.

1. Check that no `check.sh` is running, because both builds write to `web/.next-build`:

   ```sh
   ps -eo pid,cmd | grep '[c]heck.sh'
   ```

2. Make a production build into `web/.next-build`, with the same dummy settings `check.sh` uses.
   Do not use `web/.env.local`; demo mode needs no real keys.

   ```sh
   cd web
   NEXT_DIST_DIR=.next-build CHECK_SH_BUILD=1 \
   SUPABASE_URL=https://example.supabase.co \
   SUPABASE_SERVICE_ROLE_KEY=ci-dummy \
   SUPABASE_ANON_KEY=ci-dummy \
   SESSION_SECRET=ci-dummy-session-secret-not-real \
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=ci-dummy \
   GOOGLE_CLIENT_ID=ci-dummy \
   npm run build
   ```

   Rebuild whenever the portal's code has changed since the last build; an old build shows old
   screens.

3. Serve it on port 3100. Leave 3000 (`next dev`) and 8081 (Expo) to their owners.

   ```sh
   NEXT_DIST_DIR=.next-build \
   SUPABASE_URL=https://example.supabase.co \
   SUPABASE_SERVICE_ROLE_KEY=ci-dummy \
   SUPABASE_ANON_KEY=ci-dummy \
   SESSION_SECRET=ci-dummy-session-secret-not-real \
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=ci-dummy \
   GOOGLE_CLIENT_ID=ci-dummy \
   npx next start -p 3100
   ```

   Run it from `web/`, in its own terminal or in the background, and stop it when you finish.

## Run it

From the repo root, with the server up:

```sh
node docs/manual/tools/web/capture.mjs
```

- `--only INS` takes one group. Use a prefix (`INS`, `DEAN`, `ADM`, `COM`, `SET`, `PC`) or row
  IDs (`--only INS-03,INS-10`).
- `--base <url>` points at a server on another port. `--site <url>` changes the address the
  browser shows.
- `--headed` shows the browser.
- Set `MANUAL_DEBUG_DIR` to a folder to keep a screenshot of the page where a row failed. Without
  it, that picture goes to the system's temporary folder.

The run ends with the number of rows captured, and exits with an error if any row failed or any
`/api` request reached the network.

## Checks it enforces

- **No `/api` call reaches the network.** In every demo row the script blocks and logs each
  `/api` request that the browser did not answer itself, and fails the run. The public rows
  (sign-in, contact form) may ask for nothing more than the build ID.
- **No real site traffic.** Requests for the site's address go to the local server, and the error
  reporter's tunnel is answered empty.
- **Calm pages only.** Before each shot the script waits until no skeleton or loader is on screen,
  then dismisses toasts and takes focus off any field, so no focus ring shows.
- **Same names every time.** The demo's one account request is swapped for a name from the
  manual's list, and the demo-only notifications are left out.
- **File size.** Each PNG is compressed, and a file over 600 KB is reported.
- **No saved changes.** Rows stop before every Send, Save, Enroll and Assign button. The pages are
  demo copies, but the manual's figures should never show a result the steps don't reach.

After a run, open every image: the script does not check for a "Reconnecting" pill, a dev
indicator, a retired feature in frame or a name outside the manual's list, so look for these.

## Changing a row

Rows are defined in `capture.mjs` with `row(id, file, role, async (page, row) => …)`, where `role`
is `faculty`, `dean`, `pc` (Program Chair), `admin`, or `null` for the signed-out pages. Reuse the
helpers: `go` opens a route, `settle` waits for the page, `scroller` is the Shell's own scroll
container, and `shot.viewport`, `shot.of` and `shot.clip` take the picture. A row's file name must
match the one the guide's Markdown names.
