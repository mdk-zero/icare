# MT6 Lab Activity: Postman for the iCARE Capstone

**Project:** iCARE++ — a nursing-education platform (Expo mobile app for students + Next.js web app for faculty/admin)
**API under test:** our own backend — the **Next.js app in `web/`, backed by Supabase (Postgres)** — running locally at `http://localhost:3000`. This is the same API the Expo mobile app calls.

---

## Part 1 — Identify Your Capstone APIs (5 pts)

**Which case applies:** *Own backend.* iCARE's backend is a Next.js app (`web/app/api/**`) on top of Supabase/Postgres. The Expo mobile app talks to these routes over HTTP (`EXPO_PUBLIC_API_URL` → `http://localhost:3000`), so they are the API under test.

**Auth model:** bearer token. `POST /api/auth/login` returns a `sessionToken`; every other request sends `Authorization: Bearer <token>`. So the environment's auth variable (`token`) is *functional*, not a placeholder — the Login request's test script captures it automatically.

| # | Endpoint | Method | Purpose | Sends / Returns | How it fits iCARE |
|---|----------|--------|---------|-----------------|-------------------|
| 1 | `/api/auth/login` | POST | Authenticate a student | **Sends:** `{ email, password }` · **Returns:** `{ user, sessionToken }` | First call the app makes; the token authorizes everything after, and `role` selects the UI. |
| 2 | `/api/patients` | GET | List the patient roster | **Returns:** `{ patients: [...] }` (students see only their assigned patients) | Populates the mobile patient-list screen after login. |
| 3 | `/api/student/vitals` | GET, POST | Read / encode vital signs | **POST sends:** `{ patient_id, heart_rate, bp_systolic, ... }` · **Returns:** `{ reading, is_anomaly, anomaly_reasons }` | The student's core charting workflow; out-of-range values auto-alert faculty. |
| 4 | `/api/student/ehr` | GET, POST, PATCH | TPR / IVF / progress notes | **POST sends:** `{ type, patient_id, content }` · **Returns:** `{ record }` | Simulated documentation the student completes during a shift. |
| 5 | `/api/notifications` | GET, PATCH | Read / mark-read alerts | **PATCH sends:** `{ id }` or `{ all: true }` · **Returns:** `{ success: true }` | Feeds the notification bell and clears the unread badge. |

*(The collection also includes Get Session, Search Patients, Get Profile, Update Profile, and Get Progress — 13 requests across 6 folders.)*

---

## Part 2 — Workspace Setup (3 pts)

- **Workspace:** `iCARE Capstone`
- **Collection:** `iCARE Capstone API` (import `iCARE_MT6_Collection.postman_collection.json`)
- **Environment:** `iCARE - Local (web)` (import `iCARE_MT6_Environment.postman_environment.json`):
  - `base_url` = `http://localhost:3000`
  - `token` = *(blank; auto-filled by the Login test script)*
  - `patientId`, `notificationId` = *(blank; auto-captured by List Patients / Get Notifications)*

> ✅ **Checkpoint 1:** workspace + collection + environment with 4 variables (≥ 2 required).

**Screenshot:** the collection tree expanded, with `iCARE - Local (web)` selected in the top-right dropdown.

---

## Part 3 — Building Requests (7 pts)

13 requests across **3 HTTP methods**:

- **GET** — Get Session, List Patients, Search Patients, Get Patient Vitals, Get Progress Notes, Get Notifications, Get Profile, Get Progress
- **POST** — Login, Encode Vitals, Add Progress Note
- **PATCH** — Mark Notification Read, Update Profile Name

**On methods:** the mobile/student surface of the API is GET/POST/PATCH (PATCH is the "PUT/PATCH" category in the rubric). `DELETE` does exist in the backend but only on **faculty/admin** routes (e.g. `/api/faculty/patients`, `/api/admin/users/[id]`), not the student flow this collection models — so it's intentionally omitted, per the activity's substitution note.

Every request uses `{{base_url}}`. Auth is set at the **collection level** as `Bearer {{token}}`, so all requests inherit it (Login overrides to *No Auth*). POST/PATCH requests set `Content-Type: application/json`.

> ✅ **Checkpoint 2:** all requests use `{{base_url}}`; each sent at least once.

**Screenshot:** the **Login** request showing `{{base_url}}/api/auth/login`, the body, and a 200 response containing `sessionToken`.

---

## Part 4 — Organization & Documentation (5 pts)

- **Folders:** Auth · Patients · Vitals · EHR · Notifications · Profile & Progress.
- **Descriptions:** every request has one (embedded in the collection).
- **Saved examples:** Login (`Successful login` 200 + `Invalid credentials` 401), List Patients (`Patient roster` 200), Get Notifications (`Notifications with unread count` 200).

> ✅ **Checkpoint 3:** every request documented; 3 requests have saved examples (2 required).

**Screenshot:** a request's saved example open in the Examples dropdown.

---

## Part 5 — Testing (5 pts)

Test scripts on **5** requests (2 required):

| Request | Checks |
|---------|--------|
| Login | 200 · body has `user` + `sessionToken` · **saves `token`** to the environment |
| Get Session | 200 · body has a `user` |
| List Patients | 200 · `patients` is an array · **saves `patientId`** |
| Get Patient Vitals | 200 · `readings` is an array |
| Get Notifications | 200 · `notifications` is an array + has `unread` · **saves `notificationId`** |
| Get Profile | 200 · `user.role === 'student'` |

The capture scripts make the **Collection Runner** flow end-to-end: Login → `token`; List Patients → `patientId`; Get Notifications → `notificationId`, so downstream requests are authenticated and reference real IDs.

> ✅ **Checkpoint 4:** ≥ 2 requests have passing tests; run the Collection Runner once.

**Screenshot:** the Collection Runner results with the passing tests.

*Expected non-passes to explain (they still count):* `Encode Vitals` / `Add Progress Note` return **403** if the captured patient isn't in a scenario assigned to your test student — a correctly *handled* authorization error, not a failure of the request.

---

## Part 6 — Export & Reflection

**Export:** `iCARE_MT6_Collection.postman_collection.json` (Collection v2.1). Re-export via **Export → Collection v2.1** if you change anything.

**Q1 — Hardest part for iCARE?**
The repo has two backends — a legacy Express + MySQL server and the real Next.js + Supabase API — so the honest first task was identifying which one the mobile app actually calls (the Supabase-backed Next.js routes on `:3000`). After that, the tricky part was auth: login returns a bearer token, so I wired a test script to capture `sessionToken` into an environment variable and set collection-level bearer auth, instead of pasting a token into every request.

**Q2 — Which requests will we call from real code (requests / axios)?**
All of them — the Expo app already calls these exact routes through its `axios`-style `api()` wrapper in `mobile/lib/client.ts`: `login`, `session`, `patients`, `student/vitals` (GET + POST), `student/ehr`, `notifications` (GET + PATCH), `users/profile`, and `student/progress`. The Postman requests map one-to-one onto those calls, so this collection doubles as the contract for the mobile wiring.

**Q3 — What's needed to make it production-ready?**
- **Token lifecycle:** short-lived access tokens + refresh/rotation and server-side revocation (right now the session token is long-lived).
- **Transport & secrets:** serve over HTTPS, keep `SUPABASE_SERVICE_ROLE_KEY` server-only, add rate limiting on `/api/auth/*`.
- **Validation & errors:** the routes already validate bodies and return consistent `{ error }` shapes; production would add schema validation (Zod) and structured logging.
- **Reliability on the client:** the app already has request timeouts, an offline read-cache, and a write outbox (`mobile/lib/client.ts`); production would add retry-with-backoff and pagination on the list endpoints.

---

## How to reproduce (for the screenshots)

1. Start the backend: `cd web && npm run dev` → serves on `http://localhost:3000`. *(Requires `web/.env.local` with `SUPABASE_URL` + keys.)*
2. Postman → **Import** → drag in both JSON files.
3. Top-right → select **iCARE - Local (web)**.
4. Open **Login**, set the password to your seeded student password (`SEED_STUDENT_PASSWORD`), **Send** → confirm 200 + `sessionToken`, and `{{token}}` is now set.
5. Send **List Patients**, then the rest. **Runner** → select the collection + environment → **Run** → screenshot the passing tests.
6. Rename for submission: `Surname_MT6_Collection.json` and `Surname_MT6_Postman.pdf`.
