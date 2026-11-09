import type { NextRequest } from 'next/server';
import { getSupabaseAdmin } from './supabase/server';
import { logAudit } from './audit';
import type { SessionPayload } from './auth/jwt';
import {
  STUDENT_WEB_EMAIL_OFF,
  STUDENT_WEB_EMAIL_ON,
  STUDENT_WEB_OFF,
  STUDENT_WEB_ON,
  STUDENT_WEB_SESSION_DAYS,
  STUDENT_WEB_SIGNIN,
  STUDENT_WEB_SIGNOUT,
  type StudentWebChange,
  type StudentWebSummary,
} from './student-web';

/**
 * The server side of the student web app (see lib/student-web): the Admin's
 * switch, and who gets their notifications by email.
 */

/**
 * Every student web request asks whether the switch is on, so each server
 * instance keeps the answer this long. A turn of the switch reaches the other
 * instances within it.
 */
const SWITCH_CACHE_MS = 15_000;
let cachedSwitch: { on: boolean; at: number } | null = null;

/**
 * Whether an Admin has the student web turned on. Off until the first time
 * one does. A failed read falls back to the last answer this instance had,
 * and throws without one, so a database hiccup turns into a server error
 * (which the app rides out) rather than signing everyone out.
 */
export async function studentWebEnabled({ fresh = false }: { fresh?: boolean } = {}): Promise<boolean> {
  if (!fresh && cachedSwitch && Date.now() - cachedSwitch.at < SWITCH_CACHE_MS) return cachedSwitch.on;
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('audit_logs')
      .select('action')
      .in('action', [STUDENT_WEB_ON, STUDENT_WEB_OFF])
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    const on = data?.[0]?.action === STUDENT_WEB_ON;
    cachedSwitch = { on, at: Date.now() };
    return on;
  } catch (err) {
    if (cachedSwitch) {
      console.error('Reading the student web switch failed; using the last answer', err);
      return cachedSwitch.on;
    }
    throw err;
  }
}

/**
 * Turns the student web on or off, as the Admin in `session`. Throws if it
 * didn't take. Asking for what it already is changes nothing, so a second
 * click from a stale page adds no line to the history.
 */
export async function setStudentWebEnabled(
  session: SessionPayload,
  on: boolean,
  request: NextRequest,
): Promise<void> {
  if ((await studentWebEnabled({ fresh: true })) === on) return;
  await logAudit(
    session,
    {
      action: on ? STUDENT_WEB_ON : STUDENT_WEB_OFF,
      entityType: 'settings',
      entityId: 'student_web',
      details: { message: on ? 'Turned on the student web app' : 'Turned off the student web app' },
    },
    request,
  );
  if ((await studentWebEnabled({ fresh: true })) !== on) {
    throw new Error('The student web switch did not save');
  }
}

/** Records a student's sign-in, sign-out or email choice on the student web app. */
export async function logStudentWebEvent(
  session: SessionPayload,
  action:
    | typeof STUDENT_WEB_SIGNIN
    | typeof STUDENT_WEB_SIGNOUT
    | typeof STUDENT_WEB_EMAIL_ON
    | typeof STUDENT_WEB_EMAIL_OFF,
  request?: NextRequest,
): Promise<void> {
  await logAudit(
    session,
    { action, entityType: 'student_web', entityId: session.uid, details: { message: EVENT_MESSAGES[action] } },
    request,
  );
}

const EVENT_MESSAGES: Record<string, string> = {
  [STUDENT_WEB_SIGNIN]: 'Signed in on the student web app',
  [STUDENT_WEB_SIGNOUT]: 'Signed out of the student web app',
  [STUDENT_WEB_EMAIL_ON]: 'Turned on notification emails on the student web app',
  [STUDENT_WEB_EMAIL_OFF]: 'Turned off notification emails on the student web app',
};

const STUDENT_EVENTS = [STUDENT_WEB_SIGNIN, STUDENT_WEB_SIGNOUT, STUDENT_WEB_EMAIL_ON, STUDENT_WEB_EMAIL_OFF];

interface StudentWebState {
  /** Signed in on the web within the session lifetime, and not signed out since. */
  signedIn: boolean;
  /** Their own choice; on unless they turned it off. */
  emailOn: boolean;
}

/**
 * Each student's web state, from their own events. One query covers a whole
 * batch of recipients; ids with no events are left out (not on the web).
 */
async function studentWebStates(userIds: string[] | null): Promise<Map<string, StudentWebState>> {
  const supabase = getSupabaseAdmin();
  const rows: { actor_id: string | null; action: string; created_at: string }[] = [];
  const PAGE = 1000;
  const chunks = userIds === null ? [null] : chunk(userIds, 200);
  for (const ids of chunks) {
    for (let from = 0; ; from += PAGE) {
      let query = supabase
        .from('audit_logs')
        .select('actor_id, action, created_at')
        .in('action', STUDENT_EVENTS)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1);
      if (ids) query = query.in('actor_id', ids);
      const { data, error } = await query;
      if (error) throw error;
      rows.push(...((data ?? []) as typeof rows));
      if (!data || data.length < PAGE) break;
    }
  }

  const sessionCutoff = Date.now() - STUDENT_WEB_SESSION_DAYS * 24 * 60 * 60 * 1000;
  const states = new Map<string, StudentWebState & { sessionSeen: boolean; emailSeen: boolean }>();
  // Newest first, so the first event of each kind is the one that counts.
  for (const row of rows) {
    if (!row.actor_id) continue;
    const state = states.get(row.actor_id) ?? {
      signedIn: false,
      emailOn: true,
      sessionSeen: false,
      emailSeen: false,
    };
    if (!state.sessionSeen && (row.action === STUDENT_WEB_SIGNIN || row.action === STUDENT_WEB_SIGNOUT)) {
      state.sessionSeen = true;
      state.signedIn = row.action === STUDENT_WEB_SIGNIN && new Date(row.created_at).getTime() >= sessionCutoff;
    }
    if (!state.emailSeen && (row.action === STUDENT_WEB_EMAIL_ON || row.action === STUDENT_WEB_EMAIL_OFF)) {
      state.emailSeen = true;
      state.emailOn = row.action === STUDENT_WEB_EMAIL_ON;
    }
    states.set(row.actor_id, state);
  }
  return new Map([...states].map(([id, s]) => [id, { signedIn: s.signedIn, emailOn: s.emailOn }]));
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Whether this student gets their notifications by email (their own switch). */
export async function studentWebEmailOn(userId: string): Promise<boolean> {
  return (await studentWebStates([userId])).get(userId)?.emailOn ?? true;
}

/**
 * Which of these users get a notification by email: students signed in on
 * the web with their email copies on, and nobody while the switch is off.
 */
export async function emailCopyRecipients(
  userIds: string[],
): Promise<{ id: string; email: string; name: string }[]> {
  if (userIds.length === 0 || !(await studentWebEnabled())) return [];
  const states = await studentWebStates([...new Set(userIds)]);
  const ids = [...states].filter(([, s]) => s.signedIn && s.emailOn).map(([id]) => id);
  if (ids.length === 0) return [];
  const { data, error } = await getSupabaseAdmin()
    .from('users')
    .select('id, email, name, role')
    .in('id', ids)
    .eq('role', 'student');
  if (error) throw error;
  return (data ?? []).map((u) => ({ id: u.id as string, email: u.email as string, name: u.name as string }));
}

/** The switch, its history and how many students use the web, for the Admin page. */
export async function studentWebSummary(): Promise<StudentWebSummary> {
  const supabase = getSupabaseAdmin();
  const [on, historyRes, states] = await Promise.all([
    studentWebEnabled({ fresh: true }),
    supabase
      .from('audit_logs')
      .select('action, created_at, actor_id')
      .in('action', [STUDENT_WEB_ON, STUDENT_WEB_OFF])
      .order('created_at', { ascending: false })
      .limit(20),
    studentWebStates(null),
  ]);
  if (historyRes.error) throw historyRes.error;

  // audit_logs.actor_id has no foreign key (031), so names are looked up.
  const actorIds = [...new Set((historyRes.data ?? []).map((r) => r.actor_id).filter((id): id is string => !!id))];
  const names = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data } = await supabase.from('users').select('id, name').in('id', actorIds);
    for (const u of data ?? []) names.set(u.id as string, u.name as string);
  }
  const history: StudentWebChange[] = (historyRes.data ?? []).map((r) => ({
    on: r.action === STUDENT_WEB_ON,
    at: r.created_at as string,
    by: r.actor_id ? (names.get(r.actor_id as string) ?? null) : null,
  }));

  const signedIn = [...states.values()].filter((s) => s.signedIn);
  return { on, history, signedIn: signedIn.length, emailed: signedIn.filter((s) => s.emailOn).length };
}
