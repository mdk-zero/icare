import type { CourseRequirement, CourseTerm, ItemProgress, TermStatus } from './api';

/**
 * Display rules for course requirements, mirroring the web portal
 * (web/app/lib/course-progress.ts and faculty/courses/progress-ui.tsx), so an
 * instructor reads the same words on both.
 */

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Terms are Manila calendar days. */
export function termStatus(term: Pick<CourseTerm, 'starts_on' | 'ends_on'>, now: Date = new Date()): TermStatus {
  const today = new Date(now.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10);
  if (today < term.starts_on) return 'upcoming';
  if (today > term.ends_on) return 'ended';
  return 'current';
}

export const TERM_STATUS_LABEL: Record<TermStatus, string> = {
  upcoming: 'Upcoming',
  current: 'Current',
  ended: 'Ended',
};

const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const when = (at: string | null) => (at ? dateFmt.format(new Date(at)) : '');

/** One student's standing on one item, in words. */
export function statusText(requirement: CourseRequirement, item: ItemProgress | undefined): string {
  if (!item) return 'Not started';
  if (item.done && item.source === 'instructor') {
    const verb = requirement.kind === 'manual' ? 'Ticked' : 'Marked done';
    return `${verb} by you on ${when(item.done_at)}${item.note ? `: ${item.note}` : ''}`;
  }
  if (item.done) return `Met on ${when(item.done_at)}${item.best_score !== null ? ` · best ${Math.round(item.best_score)}%` : ''}`;
  if (requirement.kind === 'count') return `${item.current} of ${item.target} so far`;
  if (requirement.kind === 'skill' && item.level) return `Best so far: ${item.level}`;
  if (item.best_score !== null) return `Best so far: ${Math.round(item.best_score)}%, below the minimum`;
  return requirement.kind === 'manual' ? 'Not ticked' : 'Not met yet';
}

/** Graded work can't be unticked; everything else can be changed by the instructor. */
export function canAct(requirement: CourseRequirement, item: ItemProgress | undefined): boolean {
  return requirement.kind === 'manual' || !item?.done || item.source === 'instructor';
}

/** The item as it will read right after a tick, before the server answers (or offline). */
export function optimisticItem(item: ItemProgress | undefined, checked: boolean, note: string): ItemProgress {
  const base: ItemProgress = item ?? {
    done: false,
    source: null,
    current: 0,
    target: 1,
    done_at: null,
    best_score: null,
    level: null,
    note: null,
  };
  return checked
    ? { ...base, done: true, source: 'instructor', done_at: new Date().toISOString(), note: note || null }
    : { ...base, done: false, source: null, done_at: null, note: null };
}
