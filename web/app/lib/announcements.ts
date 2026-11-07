/**
 * Announcements: a message an Admin sends to everyone, to whole roles, or to
 * chosen people. Each recipient gets a notification row (`type` 'system',
 * `data.kind` 'announcement', which the 072 trigger also pushes to their
 * phone) and, if the Admin asks, an email. There is no table of its own: the
 * send is kept as an `announcement.sent` audit entry, and the rows share
 * `data.announcement_id`, which is how the Admin page counts who read it.
 *
 * Shared by the API, the Admin page and the demo, so it imports nothing
 * server-only.
 */

export const ANNOUNCEMENT_TITLE_LIMIT = 120;
export const ANNOUNCEMENT_MESSAGE_LIMIT = 2000;
/** The most people one "specific people" send can name. */
export const ANNOUNCEMENT_MAX_PICKED = 2000;

export const ANNOUNCEMENT_ACTION = 'announcement.sent';

/** A Program Chair is stored as a Dean (role admin), so the Dean group takes both. */
export const AUDIENCE_ROLES = [
  { value: 'student', label: 'Students' },
  { value: 'faculty', label: 'Instructors' },
  { value: 'admin', label: 'Deans and Program Chairs' },
  { value: 'super_admin', label: 'Admins' },
] as const;

export type AudienceRole = (typeof AUDIENCE_ROLES)[number]['value'];

export type AnnouncementAudience =
  | { kind: 'all' }
  | { kind: 'roles'; roles: AudienceRole[] }
  | { kind: 'users'; user_ids: string[] };

export function isAudienceRole(value: unknown): value is AudienceRole {
  return AUDIENCE_ROLES.some((r) => r.value === value);
}

/** The audience a request body names, or why it can't be used. */
export function parseAudience(value: unknown): { audience: AnnouncementAudience } | { error: string } {
  const raw = (value ?? {}) as Record<string, unknown>;
  if (raw.kind === 'all') return { audience: { kind: 'all' } };
  if (raw.kind === 'roles') {
    const roles = Array.isArray(raw.roles) ? [...new Set(raw.roles.filter(isAudienceRole))] : [];
    if (roles.length === 0) return { error: 'Pick at least one role to send to.' };
    return { audience: { kind: 'roles', roles } };
  }
  if (raw.kind === 'users') {
    const ids = Array.isArray(raw.user_ids)
      ? [...new Set(raw.user_ids.filter((id): id is string => typeof id === 'string' && id.length > 0))]
      : [];
    if (ids.length === 0) return { error: 'Pick at least one person to send to.' };
    if (ids.length > ANNOUNCEMENT_MAX_PICKED) {
      return { error: `Pick at most ${ANNOUNCEMENT_MAX_PICKED} people, or send to whole roles instead.` };
    }
    return { audience: { kind: 'users', user_ids: ids } };
  }
  return { error: 'Choose who the announcement goes to.' };
}

/** Whether an account is in the audience. */
export function inAudience(audience: AnnouncementAudience, user: { id: string; role: string }): boolean {
  if (audience.kind === 'all') return true;
  if (audience.kind === 'roles') return (audience.roles as readonly string[]).includes(user.role);
  return audience.user_ids.includes(user.id);
}

/** "Everyone", "Students and Instructors", "3 people": how the history names who it went to. */
export function describeAudience(audience: AnnouncementAudience): string {
  if (audience.kind === 'all') return 'Everyone';
  if (audience.kind === 'users') {
    return `${audience.user_ids.length} ${audience.user_ids.length === 1 ? 'person' : 'people'}`;
  }
  const labels = AUDIENCE_ROLES.filter((r) => audience.roles.includes(r.value)).map((r) => r.label);
  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/** What the notification row carries in `data`. */
export function announcementData(id: string, byName: string) {
  return { kind: 'announcement', announcement_id: id, by_name: byName };
}

/** One sent announcement, as the Admin page lists it. */
export interface AnnouncementSummary {
  id: string;
  title: string;
  message: string;
  audience: string;
  audience_kind: AnnouncementAudience['kind'];
  by_name: string;
  sent_at: string;
  recipients: number;
  /** Null when it wasn't emailed. */
  emailed: number | null;
  /** How many of its notifications have been opened. Null when it couldn't be counted. */
  read: number | null;
}

/** The audit entry's details, read back into a summary (`read` is filled in separately). */
export function toAnnouncementSummary(row: {
  entity_id: string | null;
  created_at: string;
  details: Record<string, unknown> | null;
}): Omit<AnnouncementSummary, 'read'> | null {
  const d = row.details ?? {};
  if (!row.entity_id || typeof d.title !== 'string') return null;
  const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    id: row.entity_id,
    title: d.title,
    message: typeof d.text === 'string' ? d.text : '',
    audience: typeof d.audience === 'string' ? d.audience : '',
    audience_kind: d.audience_kind === 'all' || d.audience_kind === 'roles' ? d.audience_kind : 'users',
    by_name: typeof d.by_name === 'string' ? d.by_name : '',
    sent_at: row.created_at,
    recipients: count(d.recipients),
    emailed: d.email === true ? count(d.emailed) : null,
  };
}
