/**
 * Runs the Postman collection with Newman against TEST_BASE_URL, using the
 * accounts from web/.env.test, and (with TEST_REPORT=1) streams the results to
 * /super-admin/tests as each request finishes. Exits non-zero when any request fails, for CI.
 *
 *   npm run test:api
 */
import newman from 'newman';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { accounts, baseUrl, reportEnabled } from '../env.mjs';
import { startLiveRun } from '../report.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const PREFIX = { super_admin: 'super', admin: 'admin', faculty: 'faculty', student: 'student' };

const envVars = [{ key: 'base_url', value: baseUrl }];
for (const [role, prefix] of Object.entries(PREFIX)) {
  envVars.push({ key: `${prefix}Email`, value: accounts[role]?.email ?? '' });
  envVars.push({ key: `${prefix}Password`, value: accounts[role]?.password ?? '' });
}

/** "03 Super admin › List every account" style parent path. */
function suiteOf(item) {
  const names = [];
  for (let parent = item.parent(); parent && parent.parent; parent = parent.parent()) names.unshift(parent.name);
  return names.join(' › ');
}

const collectionPath = join(here, 'icare-api.postman_collection.json');

/** Requests in the collection, counting into folders. */
function countRequests(items) {
  return items.reduce((n, item) => n + (item.item ? countRequests(item.item) : 1), 0);
}

const live = reportEnabled
  ? await startLiveRun('api', {
      runner: 'Postman / Newman',
      planned: countRequests(JSON.parse(readFileSync(collectionPath, 'utf8')).item),
    })
  : null;

// What has finished so far, keyed by item id, for the live view.
const done = new Map();
const failures = new Map();

const started = Date.now();
newman.run(
  {
    collection: collectionPath,
    envVar: envVars,
    reporters: ['cli'],
    timeoutRequest: 30_000,
  },
  async (err, summary) => {
    if (err) {
      console.error(err);
      process.exit(2);
    }

    // One row per request. A request the collection skipped (its role isn't
    // configured) has no response.
    const rows = new Map();
    summary.collection.forEachItem((item) => {
      rows.set(item.id, { suite: suiteOf(item), name: item.name, status: 'skipped', duration_ms: 0, error: null });
    });
    for (const execution of summary.run.executions) {
      const row = rows.get(execution.item.id);
      if (!row || !execution.response) continue;
      const failures = (execution.assertions ?? []).filter((a) => a.error).map((a) => a.error.message);
      if (execution.requestError) failures.unshift(execution.requestError.message);
      row.status = failures.length ? 'failed' : 'passed';
      row.duration_ms = execution.response.responseTime ?? 0;
      row.error = failures.length ? failures.join('\n') : null;
    }
    const results = [...rows.values()];

    await live?.finish(results, { duration_ms: Date.now() - started });
    process.exit(results.some((r) => r.status === 'failed') ? 1 : 0);
  },
)
  .on('request', (err, { item, response }) => {
    if (err) failures.set(item.id, [err.message]);
    done.set(item.id, { response });
  })
  .on('assertion', (err, { item }) => {
    if (err) failures.set(item.id, [...(failures.get(item.id) ?? []), err.message]);
  })
  .on('item', (_err, { item }) => {
    if (!live) return;
    const request = done.get(item.id);
    const errors = failures.get(item.id) ?? [];
    done.set(item.id, {
      ...request,
      row: {
        suite: suiteOf(item),
        name: item.name,
        // No request means the folder skipped it (that role isn't configured).
        status: errors.length ? 'failed' : request?.response ? 'passed' : 'skipped',
        duration_ms: request?.response?.responseTime ?? 0,
        error: errors.length ? errors.join('\n') : null,
      },
    });
    live.update([...done.values()].map((d) => d.row).filter(Boolean));
  });
