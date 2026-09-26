/**
 * Runs the Postman collection with Newman against TEST_BASE_URL, using the
 * accounts from web/.env.test, and (with TEST_REPORT=1) sends the results to
 * /super-admin/tests. Exits non-zero when any request fails, for CI.
 *
 *   npm run test:api
 */
import newman from 'newman';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { accounts, baseUrl, reportEnabled } from '../env.mjs';
import { reportRun } from '../report.mjs';

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

const started = Date.now();
newman.run(
  {
    collection: join(here, 'icare-api.postman_collection.json'),
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

    if (reportEnabled) {
      await reportRun('api', results, { duration_ms: Date.now() - started, runner: 'Postman / Newman' });
    }
    process.exit(results.some((r) => r.status === 'failed') ? 1 : 0);
  },
);
