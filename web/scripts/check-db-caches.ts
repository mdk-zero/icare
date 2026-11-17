/**
 * Behavioural checks for the per-instance caches that spare the database a
 * read on every request: the TTL cache itself, the session check's cached
 * user row (lib/auth/live-user) with its memory of missing columns, the
 * warehouse results and refresh (lib/analytics), the instructor and Dean
 * scopes with the write hook that drops them (lib/roster, lib/table-writes),
 * and the scenario-kind and BKT catalogs.
 * The app's own Supabase client runs against a small fake PostgREST that
 * counts what reaches it. There is no test runner in this repo.
 *
 *   npm run check:db-caches
 *
 * Exits non-zero if any expectation fails.
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { SessionPayload } from '../app/lib/auth/jwt';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
const eq = (label: string, got: unknown, want: unknown) =>
  check(label, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** What the fake database holds, and how often each thing was read. */
const db = {
  user: {
    id: 'u1',
    role: 'faculty',
    email: 'instructor@example.com',
    sessions_valid_after: null as string | null,
    web_session_id: 's1' as string | null,
    mobile_session_id: null as string | null,
    admin_id: 'dean-1' as string | null,
  } as Record<string, unknown> | null,
  userReads: 0,
  /** The select list of each users read, last first. */
  userSelects: [] as string[],
  /** Optional users columns the fake database lacks (a migration not applied). */
  missingUserColumns: new Set<string>(),
  summaryCalls: 0,
  summaryFails: 0,
  /** What run_dw_etl_once does: refresh, report a refresh already running, or not exist (before 095). */
  etlOnce: 'refresh' as 'refresh' | 'skip' | 'missing',
  etlOnceCalls: 0,
  etlCalls: 0,
  /** Reads per table, for the tables only these checks use. */
  reads: {} as Record<string, number>,
  writes: 0,
};

async function startFakePostgrest(): Promise<string> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://fake');
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (url.pathname === '/rest/v1/users') {
      db.userReads++;
      const select = url.searchParams.get('select') ?? '*';
      db.userSelects.unshift(select);
      const missing = select.split(',').map((c) => c.trim()).find((c) => db.missingUserColumns.has(c));
      if (missing) return send(400, { code: '42703', message: `column users.${missing} does not exist` });
      return send(200, db.user ? [db.user] : []);
    }
    if (url.pathname === '/rest/v1/rpc/run_dw_etl_once') {
      db.etlOnceCalls++;
      if (db.etlOnce === 'missing') {
        return send(404, { code: 'PGRST202', message: 'Could not find the function public.run_dw_etl_once without parameters' });
      }
      // Slow enough for concurrent callers to overlap.
      setTimeout(() => send(200, db.etlOnce === 'skip' ? { skipped: true } : { fact_attempts: 3 }), 40);
      return;
    }
    if (url.pathname === '/rest/v1/rpc/run_dw_etl') {
      db.etlCalls++;
      return send(200, { fact_attempts: 3 });
    }
    const table = url.pathname.replace('/rest/v1/', '');
    if (req.method !== 'GET' && !table.startsWith('rpc/')) {
      db.writes++;
      return send(201, []);
    }
    db.reads[table] = (db.reads[table] ?? 0) + 1;
    if (table === 'teams') return send(200, [{ id: 't1', section_id: 'sec1' }]);
    if (table === 'team_members') return send(200, [{ student_id: 'st1', users: { role: 'student' } }]);
    if (table === 'course_offerings') return send(200, []);
    if (table === 'scenarios') {
      const ids = (url.searchParams.get('id') ?? '').replace(/^in\.\(|\)$/g, '').split(',').filter(Boolean);
      return send(200, ids.map((id) => ({ id, kind: id.startsWith('rd') ? 'return_demo' : 'patient_case' })));
    }
    if (table === 'bkt_parameters') {
      return send(200, [{ skill_id: '1-1', p_init: 0.3, p_learn: 0.2, p_guess: 0.2, p_slip: 0.1, source: 'fitted' }]);
    }
    // deanOwnershipLive's probe: the column exists.
    if (url.pathname === '/rest/v1/sections') return send(200, []);
    if (url.pathname === '/rest/v1/rpc/dw_analytics_summary') {
      db.summaryCalls++;
      if (db.summaryFails > 0) {
        db.summaryFails--;
        return send(500, { code: 'XX000', message: 'boom' });
      }
      // Slow enough for concurrent callers to overlap.
      setTimeout(() => send(200, { cohort: { graded: 3 }, etl: { last_run_at: new Date().toISOString() } }), 40);
      return;
    }
    send(404, { message: `no fake for ${url.pathname}` });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  server.unref();
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const token = (sessionId: string): SessionPayload => ({
  uid: 'u1',
  role: 'faculty',
  email: 'instructor@example.com',
  sessionId,
  platform: 'web',
  iatMs: Date.now(),
});

async function main() {
  process.env.SUPABASE_URL = await startFakePostgrest();
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-key';
  const { TtlCache } = await import('../app/lib/ttl-cache');
  const { forgetLiveUser, liveSessionStatus } = await import('../app/lib/auth/live-user');
  const { viewerDeanId } = await import('../app/lib/dean-scope');
  const { callAnalytics, forgetAnalytics, refreshWarehouse } = await import('../app/lib/analytics');
  const { getSupabaseAdmin } = await import('../app/lib/supabase/server');
  const { getFacultySectionIds, getFacultyStudentIds } = await import('../app/lib/roster');
  const { scenarioKinds } = await import('../app/lib/scenario-kind');
  const { loadBktParameters } = await import('../app/lib/bkt');
  const supabase = getSupabaseAdmin();

  console.log('ttl cache');
  {
    const cache = new TtlCache<number>(60, 2);
    cache.set('a', 1);
    eq('a value is kept within its time', cache.get('a'), 1);
    await sleep(80);
    eq('and gone after it', cache.get('a'), undefined);

    let loads = 0;
    const load = async () => {
      loads++;
      await sleep(20);
      return 7;
    };
    const values = await Promise.all([1, 2, 3, 4, 5].map(() => cache.fetch('b', load)));
    eq('five callers at once share one load', { loads, values }, { loads: 1, values: [7, 7, 7, 7, 7] });
    await cache.fetch('b', load);
    eq('the next caller is served from the cache', loads, 1);

    await cache.fetch('c', async () => 0, (v) => v > 0);
    eq('a value `keep` refuses is not stored', cache.get('c'), undefined);

    let threw = false;
    await cache.fetch('d', async () => Promise.reject(new Error('down'))).catch(() => (threw = true));
    eq('a failed load is passed on and not stored', { threw, value: cache.get('d') }, { threw: true, value: undefined });

    const slow = cache.fetch('e', async () => {
      await sleep(20);
      return 9;
    });
    cache.delete('e');
    await slow;
    eq('a load that began before a delete does not store what it read', cache.get('e'), undefined);

    const small = new TtlCache<number>(10_000, 2);
    small.set('x', 1);
    small.set('y', 2);
    small.set('z', 3);
    eq('past its size the oldest entry goes', [small.get('x'), small.get('y'), small.get('z')], [undefined, 2, 3]);
  }

  console.log('\nsession check');
  {
    db.userReads = 0;
    const results = await Promise.all(Array.from({ length: 10 }, () => liveSessionStatus(token('s1'))));
    check('ten requests at once let the session through', results.every((r) => r.session !== null));
    eq('and read the user row once', db.userReads, 1);
    await liveSessionStatus(token('s1'));
    eq('a later request reads nothing', db.userReads, 1);

    // viewerDeanId reads the same cached row.
    const dean = await viewerDeanId(supabase as never, { uid: 'u1', role: 'faculty' });
    eq("an instructor's Dean comes from the same row, with no read", { dean, reads: db.userReads }, { dean: 'dean-1', reads: 1 });

    // A sign-in on another instance takes the slot; this one still holds s1.
    db.user!.web_session_id = 's2';
    const fresh = await liveSessionStatus(token('s2'));
    check("the new sign-in's token is let through at once", fresh.session !== null, `ended ${fresh.ended}`);
    eq('after one read of the database', db.userReads, 2);
    const old = await liveSessionStatus(token('s1'));
    eq('the replaced token is then refused', old.ended, 'replaced');

    // The delay the cache allows: the row changes behind this instance's back.
    await liveSessionStatus(token('s2'));
    db.user!.web_session_id = 's3';
    const late = await liveSessionStatus(token('s2'));
    check('a session replaced elsewhere still passes here while the row is cached', late.session !== null);
    forgetLiveUser('u1');
    const forgotten = await liveSessionStatus(token('s2'));
    eq('and is refused once the row is read again', forgotten.ended, 'replaced');

    db.user!.web_session_id = 's1';
    db.user!.role = 'admin';
    forgetLiveUser('u1');
    const promoted = await liveSessionStatus(token('s1'));
    eq('the live role wins over the token’s', promoted.session?.role, 'admin');

    db.user!.sessions_valid_after = new Date(Date.now() + 1000).toISOString();
    forgetLiveUser('u1');
    eq('a revoked token is refused', (await liveSessionStatus(token('s1'))).ended, 'revoked');
    db.user!.sessions_valid_after = null;

    const saved = db.user;
    db.user = null;
    forgetLiveUser('u1');
    const readsBefore = db.userReads;
    eq('a deleted account is refused', (await liveSessionStatus(token('s1'))).ended, 'gone');
    await liveSessionStatus(token('s1'));
    eq('and a missing row is never cached', db.userReads - readsBefore, 2);
    db.user = saved;
  }

  console.log('\nwarehouse results');
  {
    const args = (ids: string[]) => ({ p_section_ids: null, p_from: '2026-11-01', p_to: null, p_bucket: 'week', p_student_ids: ids });
    db.summaryCalls = 0;
    const firsts = await Promise.all([
      callAnalytics(supabase, 'dw_analytics_summary', args(['a', 'b', 'c'])),
      callAnalytics(supabase, 'dw_analytics_summary', args(['c', 'a', 'b'])),
      callAnalytics(supabase, 'dw_analytics_summary', args(['b', 'c', 'a'])),
    ]);
    check('three dashboards at once get the summary', firsts.every((r) => !r.error && r.data));
    eq('from one call, whatever order the ids came in', db.summaryCalls, 1);
    await callAnalytics(supabase, 'dw_analytics_summary', args(['a', 'b', 'c']));
    eq('a later request reuses it', db.summaryCalls, 1);
    await callAnalytics(supabase, 'dw_analytics_summary', args(['a', 'b']));
    eq('another scope is its own call', db.summaryCalls, 2);
    await callAnalytics(supabase, 'dw_analytics_summary', args(['a', 'b', 'c']), { fresh: true });
    eq('fresh asks the database again', db.summaryCalls, 3);
    forgetAnalytics();
    await callAnalytics(supabase, 'dw_analytics_summary', args(['a', 'b', 'c']));
    eq('a warehouse refresh drops what was kept', db.summaryCalls, 4);

    forgetAnalytics();
    db.summaryFails = 1;
    const failed = await callAnalytics(supabase, 'dw_analytics_summary', args(['a']));
    const retried = await callAnalytics(supabase, 'dw_analytics_summary', args(['a']));
    check('an error is passed on', failed.error !== null);
    check('and not kept: the next request asks again', retried.error === null && db.summaryCalls === 6, `calls ${db.summaryCalls}`);
  }

  console.log('\nwarehouse refresh');
  {
    const args = { p_section_ids: null, p_from: null, p_to: null, p_bucket: 'week' };
    const cachedSummary = async () => {
      const before = db.summaryCalls;
      await callAnalytics(supabase, 'dw_analytics_summary', args);
      return db.summaryCalls - before; // 0: served from the cache
    };

    forgetAnalytics();
    db.etlOnce = 'refresh';
    db.etlOnceCalls = 0;
    await cachedSummary();
    const many = await Promise.all([1, 2, 3].map(() => refreshWarehouse(supabase)));
    eq('three refreshes at once make one call', db.etlOnceCalls, 1);
    check('and report a refresh that ran', many.every((r) => !r.error && !r.skipped && r.loaded !== null));
    eq('which drops the cached results', await cachedSummary(), 1);

    db.etlOnce = 'skip';
    const skipped = await refreshWarehouse(supabase);
    check('a refresh already running elsewhere is skipped', skipped.skipped && skipped.loaded === null);
    eq('and leaves the cached results', await cachedSummary(), 0);

    db.etlOnce = 'missing';
    db.etlCalls = 0;
    const fallback = await refreshWarehouse(supabase);
    check('before 095 it falls back to run_dw_etl', !fallback.error && !fallback.skipped && db.etlCalls === 1, `etl calls ${db.etlCalls}`);
  }

  console.log('\ninstructor scope');
  {
    db.reads = {};
    const [a, b] = await Promise.all([getFacultyStudentIds(supabase, 'f1'), getFacultyStudentIds(supabase, 'f1')]);
    eq('two requests at once read the groups once', { a, b, teams: db.reads.teams }, { a: ['st1'], b: ['st1'], teams: 1 });
    a.push('changed by a caller');
    eq('a caller changing its copy leaves the kept one', await getFacultyStudentIds(supabase, 'f1'), ['st1']);
    eq('and later requests read nothing', db.reads.teams, 1);
    await getFacultySectionIds(supabase, 'f1');
    await getFacultySectionIds(supabase, 'f1');
    eq('the sections are kept too', db.reads.teams, 2);

    await supabase.from('users').update({ last_login_at: new Date().toISOString() }).eq('id', 'f1');
    await getFacultyStudentIds(supabase, 'f1');
    eq('a sign-in stamping last_login_at keeps them', db.reads.teams, 2);
    await supabase.from('team_members').insert({ team_id: 't1', student_id: 'st2' });
    await getFacultyStudentIds(supabase, 'f1');
    eq('a group change on this instance drops them at once', db.reads.teams, 3);
    await supabase.from('users').update({ section_id: 'sec2' }).eq('id', 'st1');
    await getFacultySectionIds(supabase, 'f1');
    eq('and so does moving a student to another section', db.reads.teams, 4);
  }

  console.log('\ncatalogs');
  {
    db.reads = {};
    const first = await scenarioKinds(supabase, ['pc1', 'rd1']);
    const again = await scenarioKinds(supabase, ['rd1', 'pc1']);
    eq('scenario kinds are read once', { reads: db.reads.scenarios, rd1: again.get('rd1') }, { reads: 1, rd1: 'return_demo' });
    check('with the same answer', first.get('pc1') === 'patient_case' && again.get('pc1') === 'patient_case');
    await scenarioKinds(supabase, ['pc1', 'pc2']);
    eq('a new scenario is read on its own', db.reads.scenarios, 2);

    const p1 = await loadBktParameters(supabase, ['1-1', '2-1']);
    const p2 = await loadBktParameters(supabase, ['1-1']);
    eq('BKT parameters are read once for every skill', db.reads.bkt_parameters, 1);
    check('and filtered to the skills asked for', p1.size === 1 && p1.get('1-1')?.p_init === 0.3 && p2.size === 1);
  }

  // Last: the memory below would leave sessions_valid_after out of later checks.
  console.log('\nmissing columns');
  {
    db.missingUserColumns.add('sessions_valid_after');
    forgetLiveUser('u1');
    db.userReads = 0;
    const first = await liveSessionStatus(token('s1'));
    check('a session still passes when a column is missing', first.session !== null);
    eq('the first read learns which column, in two reads', db.userReads, 2);
    check('the second leaves it out', !db.userSelects[0].includes('sessions_valid_after') && db.userSelects[0].includes('web_session_id'), db.userSelects[0]);
    forgetLiveUser('u1');
    await liveSessionStatus(token('s1'));
    eq('later reads take one round trip', db.userReads, 3);
    eq("an instructor's Dean still comes through", await viewerDeanId(supabase as never, { uid: 'u1', role: 'faculty' }), 'dean-1');
  }

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

void main();
