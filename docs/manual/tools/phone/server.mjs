#!/usr/bin/env node
/**
 * A mock iCARE++ server for the phone screenshots in the user manual. It
 * serves the app's browser build under /student/ and answers /api/* from the
 * fictional records in fixtures.mjs, on one origin, so the app finds its API
 * at window.location.origin exactly as it does on the web portal. It reads no
 * database and makes no network requests of its own.
 *
 *   node server.mjs --root <the export folder> [--port 3998]
 *
 * Every /api route it doesn't know is logged, answered 404, and listed at
 * GET /__mock/unknown, so a capture can refuse a shot that asked for one.
 *
 * Control (not under /api):
 *   POST /__mock/state  { forcePasswordChange, aiConsent: true|false|null, role: 'student'|'faculty' }
 *                       Resets the records and the unknown-route log too.
 *   GET  /__mock/unknown
 */

import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import * as fx from './fixtures.mjs';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const ROOT = arg('root');
const PORT = Number(arg('port', '3998'));
if (!ROOT || !existsSync(path.join(ROOT, 'index.html'))) {
  console.error('Pass --root <folder> with the app exported for the web (index.html inside).');
  process.exit(1);
}

const TOKEN = 'mock-token';
const DEFAULTS = { forcePasswordChange: false, aiConsent: true, role: 'student' };

let state;
function reset(next = {}) {
  state = {
    ...DEFAULTS,
    ...next,
    submitted: new Set(),
    lastScore: null,
    lastResult: null,
    unknown: [],
  };
}
reset();

const user = () => {
  const base = state.role === 'faculty' ? fx.INSTRUCTOR : fx.STUDENT;
  return { ...base, force_password_change: state.role === 'student' && state.forcePasswordChange };
};

function send(res, status, body, headers = {}) {
  const text = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
  res.end(text);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

/** Routes: [method, pattern, handler(match, body) → [status, json] or null for "not found"]. */
const ROUTES = [
  ['POST', /^\/api\/auth\/login$/, () => [200, { user: user(), sessionToken: TOKEN }]],
  ['GET', /^\/api\/auth\/session$/, (_m, _b, signedIn) => (signedIn ? [200, { user: user() }] : [401, { user: null }])],
  ['POST', /^\/api\/auth\/logout$/, () => [200, { ok: true }]],
  ['POST', /^\/api\/users\/change-password$/, () => {
    state.forcePasswordChange = false;
    return [200, { success: true, sessionToken: TOKEN }];
  }],
  ['HEAD', /^\/api\/health$/, () => [200, undefined]],
  ['GET', /^\/api\/health$/, () => [200, { ok: true }]],
  ['POST', /^\/api\/push-tokens$/, () => [200, { ok: true }]],
  ['GET', /^\/api\/student-web$/, () => [200, { on: true }]],
  ['GET', /^\/api\/student-web\/email$/, () => [200, { on: true }]],
  ['GET', /^\/api\/student\/ai-consent$/, () => [200, { consent: state.aiConsent, available: true }]],
  ['POST', /^\/api\/student\/ai-consent$/, (_m, body) => {
    state.aiConsent = typeof body?.consent === 'boolean' ? body.consent : state.aiConsent;
    return [200, { consent: state.aiConsent, available: true }];
  }],

  ['GET', /^\/api\/notifications$/, () => {
    const list = fx.notifications(state.role);
    return [200, { notifications: list, unread: list.filter((n) => !n.read_at).length }];
  }],
  ['PATCH', /^\/api\/notifications$/, () => [200, { ok: true }]],

  ['GET', /^\/api\/student\/scenarios$/, () => [200, fx.studentScenarios()]],
  ['GET', /^\/api\/student\/scenarios\/([^/]+)\/tasks$/, (m) => ok(fx.scenarioTasks(m[1]))],
  ['GET', /^\/api\/student\/scenarios\/([^/]+)\/forms$/, (m) => ok(fx.returnDemoForms(m[1]))],
  ['GET', /^\/api\/student\/ward$/, () => [200, fx.ward()]],
  ['GET', /^\/api\/patients$/, () => [200, fx.myPatients()]],
  ['GET', /^\/api\/student\/assistance$/, () => [200, { requests: [] }]],
  ['GET', /^\/api\/student\/cases$/, () => [200, fx.myCases()]],
  ['GET', /^\/api\/student\/cases\/([^/]+)$/, (m) => ok(fx.caseDetail(m[1]))],
  ['GET', /^\/api\/student\/skill-mastery$/, () => [200, fx.skillMastery()]],
  ['GET', /^\/api\/student\/skill-mastery\/history$/, () => [200, fx.masteryHistory()]],
  ['GET', /^\/api\/student\/progress$/, () => [200, fx.progress()]],
  ['GET', /^\/api\/student\/goals$/, () => [200, fx.goals()]],
  ['GET', /^\/api\/student\/courses$/, () => [200, fx.studentCourses()]],
  ['GET', /^\/api\/student\/library$/, () => [200, fx.library()]],
  ['GET', /^\/api\/student\/library\/focus$/, () => [200, fx.libraryFocus()]],
  ['GET', /^\/api\/student\/tips$/, () => [200, fx.tips()]],

  ['GET', /^\/api\/student\/assessments$/, () => [200, fx.assessments(state)]],
  ['POST', /^\/api\/student\/assessments\/([^/]+)\/attempts$/, (m) => ok(fx.startAttempt(m[1]))],
  ['POST', /^\/api\/student\/attempts\/([^/]+)\/submit$/, (m, body) => {
    if (m[1] !== fx.ATTEMPT_ID) return null;
    const { bySkill, ...result } = fx.submitAttempt(body?.answers);
    state.lastResult = { ...result, bySkill };
    state.lastScore = result.score;
    state.submitted.add(fx.QUIZ_FULL_SET);
    return [200, result];
  }],
  ['GET', /^\/api\/student\/reflections$/, () => [200, fx.reflection(state.lastResult)]],

  ['GET', /^\/api\/faculty\/courses$/, () => [200, fx.facultyCourses()]],
];

const ok = (json) => (json ? [200, json] : null);

function streamNotifications(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
  res.write(`event: snapshot\ndata: ${JSON.stringify({ notifications: fx.notifications(state.role) })}\n\n`);
  const beat = setInterval(() => res.write(': keep-alive\n\n'), 15_000);
  req.on('close', () => clearInterval(beat));
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
};

function serveStatic(req, res, pathname) {
  if (pathname === '/' || pathname === '/student') {
    res.writeHead(302, { Location: '/student/' });
    res.end();
    return;
  }
  if (!pathname.startsWith('/student/')) {
    res.writeHead(404);
    res.end();
    return;
  }
  // What the update check reads; fixed, so the "Update ready" prompt never shows.
  if (pathname === '/student/version.json') {
    send(res, 200, { commit: 'manual-screenshots', dirty: false, published_at: fx.NOW });
    return;
  }
  const relative = decodeURIComponent(pathname.slice('/student/'.length));
  let file = path.resolve(ROOT, relative);
  if (!file.startsWith(path.resolve(ROOT)) || !existsSync(file) || statSync(file).isDirectory()) {
    // A single-page build: every route is index.html.
    file = path.join(ROOT, 'index.html');
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const { pathname } = url;

  if (pathname === '/__mock/state' && req.method === 'POST') {
    const body = (await readBody(req)) ?? {};
    reset({
      forcePasswordChange: Boolean(body.forcePasswordChange),
      aiConsent: body.aiConsent === undefined ? DEFAULTS.aiConsent : body.aiConsent,
      role: body.role === 'faculty' ? 'faculty' : 'student',
    });
    send(res, 200, { ok: true });
    return;
  }
  if (pathname === '/__mock/unknown') {
    send(res, 200, { unknown: state.unknown });
    return;
  }

  if (!pathname.startsWith('/api/')) {
    serveStatic(req, res, pathname);
    return;
  }

  const signedIn = req.headers.authorization === `Bearer ${TOKEN}`;
  if (pathname === '/api/notifications/stream' && req.method === 'GET') {
    if (!signedIn) {
      send(res, 401, { error: 'Unauthorized' });
      return;
    }
    streamNotifications(req, res);
    return;
  }

  const body = ['POST', 'PATCH'].includes(req.method) ? await readBody(req) : null;
  for (const [method, pattern, handler] of ROUTES) {
    if (method !== req.method) continue;
    const match = pattern.exec(pathname);
    if (!match) continue;
    const isPublic = /^\/api\/(auth\/login|auth\/session|health|student-web)$/.test(pathname);
    if (!isPublic && !signedIn) {
      send(res, 401, { error: 'Unauthorized' });
      return;
    }
    const result = handler(match, body, signedIn);
    if (result) {
      send(res, result[0], result[1]);
      return;
    }
    break;
  }

  const entry = `${req.method} ${pathname}${url.search}`;
  state.unknown.push(entry);
  console.warn(`Not mocked: ${entry}`);
  send(res, 404, { error: 'Not mocked' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Mock iCARE++ on http://localhost:${PORT}/student/ (serving ${ROOT})`);
});
