# Student web app

A backup for students who can't install the mobile app, such as iPhone users. It's the same app
(`mobile/`) built for browsers and served by the web portal at `/student`. It stays off until an
Admin turns it on.

## Turning it on and off

Admin portal → **Student Web App**. The switch takes effect within about 15 seconds on every
server.

- **On:** students sign in at `https://www.i-care.dev/student` with their usual account. iPhones
  that open the app download link (`/download`) are sent there, and the portal's sign-in page
  tells students about it.
- **Off:** nobody can sign in there. Students already signed in are signed out at their next tap
  and see a "turned off" screen. Their work is kept, and the mobile app isn't affected.

Each change is recorded in the page's history and in the Activity Log. Nothing needs a database
migration: the switch, students' sign-ins and their email choice are audit log entries.

## Notifications

Browsers get no push notifications. While the switch is on, each notification is also emailed to
students signed in on the web in the last 7 days, unless they turn off **Email notifications** in
Profile → Settings. Notifications that already go out by email (support replies, announcements
sent with email) aren't emailed twice. The code is `web/app/lib/notify.ts`; every notification is
written through `insertNotifications()` there.

## Publishing a new version

The published files are committed in `web/public/student` and go live with the portal's next
deployment. After changing `mobile/`, commit, then:

```sh
cd mobile
node scripts/publish-web.mjs
git add web/public/student   # from the repo root; commit and push as usual
```

The script refuses to run with uncommitted changes in `mobile/` (`--allow-dirty` is for trying
them locally). Open tabs offer a reload once a newer version is live.

It isn't an npm script on purpose. `package.json` scripts, like `app.json`, are part of the OTA
runtime fingerprint, and changing them would cut every installed APK off from updates until the
next native build. The web build's own settings live in `mobile/app.config.ts` and apply only
when the script runs (`ICARE_STUDENT_WEB=1`), so native builds and the fingerprint never see them.

## Removing it

Turning it off is enough. To take the files down as well, delete `web/public/student` and deploy.

## What differs from the phone app

- **Who:** students only. Instructors, Deans and Admins are refused and pointed to the portal.
- **Pop-up dialogs** are drawn by `mobile/components/web/WebAlertHost.web.tsx`, since
  `Alert.alert` does nothing in a browser.
- **Photos:** the browser's file picker or camera. No permission switches.
- **Quizzes:** switching tabs or minimizing counts as leaving the app, and closing or reloading
  the tab asks first.
- **Sessions:** the web slot (the phone keeps its own), with a bearer token like the app's and no
  portal cookie. The token is kept in the browser's storage.
- **Wide windows:** the app sits in a 900 px column.
