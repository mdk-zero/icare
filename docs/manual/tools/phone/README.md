# Phone screenshots for the user manual

These files retake the manual's phone screenshots: SET-04 to SET-07, INS-17 and STU-01 to STU-16
in the plan's shot list. They run the app's browser build against a mock API with fictional
records, so no screenshot needs a real account or touches the live database.

| File | What it does |
|---|---|
| `fixtures.mjs` | The fictional records. Names come from the web demo; clinical content is read from the repo's own data (the demo ward and cases, Taylor's checklists, the quiz bank, the case presentation rubric). |
| `server.mjs` | Serves the exported app under `/student/` and answers `/api/*` from the fixtures, on one origin. Logs every `/api` route it doesn't know. Makes no network requests. |
| `capture.mjs` | Signs in through the app's own screens and writes compressed PNGs into `docs/manual/img/`. |

Everything is shown in light mode at 390 × 844 (`isMobile`, `hasTouch`, scale 2), in `Asia/Manila`,
with the clock fixed at Monday 2026-11-16, 9:30 AM.

## Rebuild and rerun

Run from the repo root. Node 23.6 or later is needed: `fixtures.mjs` imports TypeScript data files
directly. Playwright and sharp come from `web/node_modules`, so run `npm ci` in `web/` first if it
has none.

1. Export the app for the browser into a folder outside the repo:

   ```sh
   cd mobile
   ICARE_STUDENT_WEB=1 EXPO_NO_DOTENV=1 npx expo export --platform web --output-dir /tmp/icare-student-web
   cd ..
   ```

   `EXPO_NO_DOTENV` keeps `mobile/.env.local` out. Leave `EXPO_PUBLIC_API_URL` unset, so the app
   calls the server that serves it.

2. Start the mock server. Port 3998 is the default; leave 3000 and 8081 to `next dev` and Expo.

   ```sh
   node docs/manual/tools/phone/server.mjs --root /tmp/icare-student-web --port 3998
   ```

3. In another terminal, take the shots:

   ```sh
   node docs/manual/tools/phone/capture.mjs
   ```

   - `--only set,ins` retakes some groups only. The groups are `set`, `set-password`, `set-ai`,
     `stu-clinic`, `stu-quiz`, `stu-library`, `stu-profile` and `ins`.
   - `--raw <folder>` also keeps the uncompressed screenshots.
   - `--base <url>` points at a server on another port.

4. Stop the server, and open every image to check it.

A shot is refused, and its file left as it was, when the app asked the mock for a route it doesn't
know or tried to reach anything off the mock's origin. A group whose steps fail is tried once more
before it counts as failed. The run ends with the number written, the number failed and the total
size.

Node prints a `MODULE_TYPELESS_PACKAGE_JSON` warning when it loads the TypeScript data files;
`--disable-warning=MODULE_TYPELESS_PACKAGE_JSON` hides it.

## Changing the records

Edit `fixtures.mjs`. Keep to the people in the plan's allowed list and to `demo.icare.ph` or
`example.com` addresses, and take any clinical wording from the repo's data rather than writing it.
The response shapes the app expects are the types in `mobile/lib/api.ts`.

The mock's state can be set without the capture script:

```sh
curl -X POST localhost:3998/__mock/state -H 'Content-Type: application/json' \
  -d '{"forcePasswordChange": false, "aiConsent": null, "role": "student"}'
curl localhost:3998/__mock/unknown
```

`aiConsent` is `true`, `false` or `null` (the app then asks the AI question), and `role` is
`student` or `faculty` (Maria Santos). Setting the state also clears the unknown-route log and any
quiz taken.
