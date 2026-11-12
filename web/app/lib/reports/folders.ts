import type { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { loadChecklistRoster } from './checklist-data';
import { loadGroupings } from './groupings';
import { loadQuizRoster } from './quiz-data';
import { targetId } from './targets';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/** What can be opened as a folder on the Reports page. */
export const FOLDER_TYPES = ['section', 'patient_case', 'return_demo', 'quiz'] as const;
export type FolderType = (typeof FOLDER_TYPES)[number];

export function isFolderType(value: unknown): value is FolderType {
  return typeof value === 'string' && (FOLDER_TYPES as readonly string[]).includes(value);
}

/** One report inside a folder: a student's, or a group's. */
export interface FolderItem {
  /** What the report is asked for by. */
  id: string;
  label: string;
  sub: string;
  /** A short flag such as "Not performed"; null for none. */
  flag: string | null;
}

export interface FolderView {
  id: 'student' | 'group';
  label: string;
  /** The report type each item's id is asked of. */
  type: string;
  items: FolderItem[];
}

export interface FolderData {
  title: string;
  /** The report of the whole thing, when there is one: the class, the section. */
  whole: { type: string; id: string; label: string; sub: string } | null;
  views: FolderView[];
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** Folder contents for a Return Demonstration or a Patient Case. */
async function checklistFolder(
  supabase: Supabase,
  kind: 'return_demo' | 'patient_case',
  id: string,
  scope: readonly string[] | null,
): Promise<FolderData | null> {
  const roster = await loadChecklistRoster(supabase, kind, id, scope);
  if (!roster) return null;
  const students = roster.performers.map((p) => ({
    id: targetId({ kind: 'student', parentId: id, studentId: p.studentId }),
    label: p.name,
    sub: `${p.groupLabel} · ${p.status === 'completed' && p.score !== null ? `Performed · ${p.score}%` : 'Not yet performed'}`,
    flag: p.status === 'completed' ? null : 'Not performed',
  }));
  const byTeam = new Map<string, typeof roster.performers>();
  for (const p of roster.performers) if (p.teamId) byTeam.set(p.teamId, [...(byTeam.get(p.teamId) ?? []), p]);
  const groups = [...byTeam.entries()]
    .map(([teamId, members]) => {
      const pending = members.filter((m) => m.status !== 'completed').length;
      return {
        id: targetId({ kind: 'group', parentId: id, teamId }),
        label: members[0].groupLabel,
        sub: `${plural(members.length, 'member')} · ${members.length - pending} performed · ${members.map((m) => m.name).join(', ')}`,
        flag: pending > 0 ? `${pending} not performed` : null,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  return {
    title: roster.title,
    whole:
      kind === 'patient_case'
        ? { type: 'scenario', id, label: 'Whole class', sub: `Everyone given this patient case, ${plural(students.length, 'student')}` }
        : null,
    views: [
      { id: 'student', label: 'Per student', type: kind, items: students },
      { id: 'group', label: 'Per group', type: kind, items: groups },
    ],
  };
}

async function quizFolder(supabase: Supabase, id: string, scope: readonly string[] | null): Promise<FolderData | null> {
  const roster = await loadQuizRoster(supabase, id, scope);
  if (!roster) return null;
  const students = roster.performers.map((p) => ({
    id: targetId({ kind: 'student', parentId: id, studentId: p.studentId }),
    label: p.name,
    sub: `${p.groupLabel} · ${p.grade === null ? 'Not taken' : `Grade ${p.grade}%`}`,
    flag: p.grade === null ? 'Not taken' : null,
  }));
  const byTeam = new Map<string, typeof roster.performers>();
  for (const p of roster.performers) if (p.teamId) byTeam.set(p.teamId, [...(byTeam.get(p.teamId) ?? []), p]);
  const groups = [...byTeam.entries()]
    .map(([teamId, members]) => {
      const waiting = members.filter((m) => m.grade === null).length;
      return {
        id: targetId({ kind: 'group', parentId: id, teamId }),
        label: members[0].groupLabel,
        sub: `${plural(members.length, 'member')} · ${members.length - waiting} submitted · ${members.map((m) => m.name).join(', ')}`,
        flag: waiting > 0 ? `${waiting} not taken` : null,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  return {
    title: roster.title,
    whole: { type: 'assessment', id, label: 'Whole class', sub: `Everyone given this quiz, ${plural(students.length, 'student')}` },
    views: [
      { id: 'student', label: 'Per student', type: 'quiz', items: students },
      { id: 'group', label: 'Per group', type: 'quiz', items: groups },
    ],
  };
}

async function sectionFolder(supabase: Supabase, id: string, scope: readonly string[] | null): Promise<FolderData | null> {
  const { data: section } = await supabase.from('sections').select('id, name').eq('id', id).maybeSingle();
  if (!section) return null;
  const { data: rows } = await supabase
    .from('users')
    .select('id, name, section_id')
    .eq('role', 'student')
    .eq('section_id', id)
    .order('name');
  const students = ((rows ?? []) as { id: string; name: string | null; section_id: string | null }[]).filter(
    (s) => !scope || scope.includes(s.id),
  );
  const groupings = await loadGroupings(supabase, students);

  const byTeam = new Map<string, { label: string; names: string[] }>();
  for (const s of students) {
    const g = groupings.get(s.id);
    if (!g?.teamId) continue;
    const e = byTeam.get(g.teamId) ?? { label: g.groupLabel, names: [] };
    e.names.push(s.name ?? 'Unknown student');
    byTeam.set(g.teamId, e);
  }
  const groups = [...byTeam.entries()]
    .map(([teamId, e]) => ({ id: teamId, label: e.label, sub: `${plural(e.names.length, 'member')} · ${e.names.join(', ')}`, flag: null }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));

  return {
    title: section.name as string,
    whole: {
      type: 'section',
      id,
      label: 'Whole section',
      sub: `${plural(students.length, 'student')} · ${plural(groups.length, 'group')}`,
    },
    views: [
      {
        id: 'student',
        label: 'Per student',
        type: 'student',
        items: students.map((s) => ({
          id: s.id,
          label: s.name ?? 'Unknown student',
          sub: groupings.get(s.id)?.groupName ?? 'No group',
          flag: null,
        })),
      },
      { id: 'group', label: 'Per group', type: 'section_group', items: groups },
    ],
  };
}

/** The contents of one folder, limited to the students in `scope` (null for no limit). */
export function loadFolder(
  supabase: Supabase,
  type: FolderType,
  id: string,
  scope: readonly string[] | null,
): Promise<FolderData | null> {
  if (type === 'section') return sectionFolder(supabase, id, scope);
  if (type === 'quiz') return quizFolder(supabase, id, scope);
  return checklistFolder(supabase, type, id, scope);
}
