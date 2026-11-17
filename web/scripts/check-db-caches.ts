/**
 * Behavioural checks for the per-instance caches that spare the database a
 * read on every request: the TTL cache itself, the session check's cached
 * user row (lib/auth/live-user) and the warehouse results (lib/analytics).
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
  summaryCalls: 0,
  summaryFails: 0,
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
      return send(200, db.user ? [db.user] : []);
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
  const { callAnalytics, forgetAnalytics } = await import('../app/lib/analytics');
  const { getSupabaseAdmin } = await import('../app/lib/supabase/server');
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

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

void main();
