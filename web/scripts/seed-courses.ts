/**
 * Sample terms, courses and semester requirement checklists (migration 065),
 * fitted to the students' actual work.
 *
 * Every Dean with an instructor who supervises groups gets the terms and
 * courses below, and each such instructor is assigned both courses for the
 * sections their groups are in. The term covers the graded history (late June
 * to October), and every checklist item is one each section can meet: BSN 1101
 * and BSN 1102 worked different Patient Cases and Quizzes, so the items are
 * skills and counts their work shares rather than one particular case. The
 * Case Presentation item uses the instructor's own presentation for those
 * sections, when there is one. Manual return demonstrations are ticked for
 * some of the students whose graded work already shows the course's skills,
 * as an instructor would have signed them off, so progress reads as a term in
 * motion and never credits a student still short on those skills.
 *
 * Safe to re-run: terms, courses and assignments are matched by name, code
 * and (course, term, instructor); a checklist that already has items is left
 * alone. Afterwards it prints each checklist as the app judges it.
 *
 *   npx tsx scripts/seed-courses.ts            seed, then report
 *   npx tsx scripts/seed-courses.ts --dry-run  report the plan only
 *   npx tsx scripts/seed-courses.ts --remove   delete what this script seeds
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { getSupabaseAdmin } from '../app/lib/supabase/server';
import { parseRequirement, type RequirementInput } from '../app/lib/course-progress';
import { loadOwnOffering } from '../app/lib/courses';
import { requirementWrite } from '../app/lib/course-schema';
import { loadOfferingProgress } from '../app/lib/course-requirements';

const DRY_RUN = process.argv.includes('--dry-run');
const REMOVE = process.argv.includes('--remove');

const TERMS = [
  { name: '1st Semester AY 2026–2027', starts_on: '2026-06-22', ends_on: '2026-10-24' },
  { name: '2nd Semester AY 2026–2027', starts_on: '2026-11-09', ends_on: '2027-03-27' },
];
/** The term the courses are taught in; the second is set up for the Dean to plan ahead. */
const TEACHING_TERM = TERMS[0].name;

type Item = Partial<RequirementInput> & Pick<RequirementInput, 'kind'> & {
  /** Use the instructor's own Case Presentation for these sections. */
  ownCasePresentation?: boolean;
  /** Manual items: about this share of the students who already show the course's skills are ticked. */
  tickShare?: number;
};

interface CourseSeed {
  code: string;
  title: string;
  description: string;
  skills: string[];
  checklist: Item[];
}

const range = (chapter: number, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${chapter}-${from + i}`);

const COURSES: CourseSeed[] = [
  {
    code: 'NCM 101',
    title: 'Health Assessment',
    description:
      'Systematic assessment of the adult client: vital signs and pulse oximetry, the general survey, and the head-to-toe physical examination, with accurate documentation of findings.',
    skills: [...range(1, 1, 7), ...range(2, 1, 8), '14-1'],
    checklist: [
      { kind: 'count', activity_type: 'assessment', target_count: 3, min_score: 75, skills_only: true },
      { kind: 'skill', skill_id: '1-1', min_score: 50 },
      { kind: 'skill', skill_id: '1-4', min_score: 50 },
      { kind: 'skill', skill_id: '1-6', min_score: 50 },
      { kind: 'skill', skill_id: '1-7', min_score: 50 },
      { kind: 'count', activity_type: 'shift', target_count: 15 },
      {
        kind: 'manual',
        title: 'Head-to-toe assessment return demonstration, signed by the clinical instructor',
        tickShare: 0.6,
      },
    ],
  },
  {
    code: 'NCM 103',
    title: 'Fundamentals of Nursing Practice',
    description:
      'Core nursing skills at the bedside: oxygen therapy and airway support, incentive spirometry, and starting, monitoring and maintaining peripheral IV access.',
    skills: [...range(14, 1, 4), ...range(15, 1, 5)],
    checklist: [
      { kind: 'count', activity_type: 'scenario', target_count: 3 },
      { kind: 'count', activity_type: 'assessment', target_count: 2, min_score: 75, skills_only: true },
      { kind: 'skill', skill_id: '14-1', min_score: 50 },
      { kind: 'skill', skill_id: '15-3', min_score: 50 },
      { kind: 'activity', activity_type: 'case_presentation', ownCasePresentation: true },
      {
        kind: 'manual',
        title: 'Oxygen therapy return demonstration (nasal cannula and face mask)',
        tickShare: 0.4,
      },
    ],
  },
];

const supabase = getSupabaseAdmin();

function must<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

interface Teacher {
  id: string;
  name: string;
  deanId: string;
  deanName: string;
  sectionIds: string[];
  sectionNames: string[];
}

/** Every instructor who supervises a group, with their Dean and their groups' sections. */
async function loadTeachers(): Promise<Teacher[]> {
  const faculty = must(
    await supabase.from('users').select('id, name, admin_id').eq('role', 'faculty').not('admin_id', 'is', null),
    'read instructors',
  ) as { id: string; name: string; admin_id: string }[];
  const deans = must(await supabase.from('users').select('id, name').eq('role', 'admin'), 'read deans') as {
    id: string;
    name: string;
  }[];
  const teams = must(
    await supabase.from('teams').select('faculty_id, section_id, sections(name)').not('faculty_id', 'is', null),
    'read groups',
  ) as unknown as { faculty_id: string; section_id: string; sections: { name: string } }[];

  return faculty
    .map((f) => {
      const own = teams.filter((t) => t.faculty_id === f.id);
      const sections = new Map(own.map((t) => [t.section_id, t.sections.name]));
      return {
        id: f.id,
        name: f.name,
        deanId: f.admin_id,
        deanName: deans.find((d) => d.id === f.admin_id)?.name ?? 'Dean',
        sectionIds: [...sections.keys()],
        sectionNames: [...sections.values()].sort(),
      };
    })
    .filter((t) => t.sectionIds.length > 0 && deans.some((d) => d.id === t.deanId));
}

async function ensureTerm(deanId: string, term: (typeof TERMS)[number]): Promise<string> {
  const found = must(
    await supabase.from('academic_terms').select('id').eq('admin_id', deanId).eq('name', term.name).maybeSingle(),
    'read term',
  ) as { id: string } | null;
  if (found) return found.id;
  const row = must(
    await supabase.from('academic_terms').insert({ ...term, admin_id: deanId }).select('id').single(),
    `create term ${term.name}`,
  ) as { id: string };
  console.log(`  + term ${term.name}`);
  return row.id;
}

async function ensureCourse(deanId: string, course: CourseSeed): Promise<string> {
  const found = must(
    await supabase.from('courses').select('id').eq('admin_id', deanId).eq('code', course.code).maybeSingle(),
    'read course',
  ) as { id: string } | null;
  const id =
    found?.id ??
    (
      must(
        await supabase
          .from('courses')
          .insert({ admin_id: deanId, code: course.code, title: course.title, description: course.description })
          .select('id')
          .single(),
        `create course ${course.code}`,
      ) as { id: string }
    ).id;
  if (!found) console.log(`  + course ${course.code} ${course.title}`);
  must(
    await supabase
      .from('course_skills')
      .upsert(
        course.skills.map((skill_id) => ({ course_id: id, skill_id, source: 'manual', added_by: deanId })),
        { onConflict: 'course_id,skill_id', ignoreDuplicates: true },
      ),
    `skills for ${course.code}`,
  );
  return id;
}

async function ensureOffering(courseId: string, termId: string, teacher: Teacher): Promise<{ id: string; created: boolean }> {
  const found = must(
    await supabase
      .from('course_offerings')
      .select('id')
      .eq('course_id', courseId)
      .eq('term_id', termId)
      .eq('faculty_id', teacher.id)
      .maybeSingle(),
    'read assignment',
  ) as { id: string } | null;
  if (found) return { id: found.id, created: false };
  const row = must(
    await supabase
      .from('course_offerings')
      .insert({ course_id: courseId, term_id: termId, faculty_id: teacher.id, created_by: teacher.deanId })
      .select('id')
      .single(),
    'create assignment',
  ) as { id: string };
  must(
    await supabase
      .from('course_offering_sections')
      .insert(teacher.sectionIds.map((section_id) => ({ offering_id: row.id, section_id }))),
    'link sections',
  );
  return { id: row.id, created: true };
}

/** The instructor's latest Case Presentation aimed at any of their sections. */
async function ownCasePresentation(teacher: Teacher): Promise<string | null> {
  const rows = must(
    await supabase
      .from('case_presentations')
      .select('id, section_ids')
      .eq('created_by', teacher.id)
      .order('created_at', { ascending: false }),
    'read case presentations',
  ) as { id: string; section_ids: string[] | null }[];
  return rows.find((p) => (p.section_ids ?? []).some((s) => teacher.sectionIds.includes(s)))?.id ?? null;
}

async function seedChecklist(offeringId: string, course: CourseSeed, teacher: Teacher) {
  const existing = must(
    await supabase.from('course_requirements').select('id').eq('offering_id', offeringId),
    'read checklist',
  ) as { id: string }[];
  if (existing.length > 0) {
    console.log(`    checklist already has ${existing.length} items; left as is`);
    return;
  }

  const presentationId = await ownCasePresentation(teacher);
  let position = 0;
  for (const item of course.checklist) {
    // parseRequirement keeps only the requirement fields, so tickShare drops out there.
    const { ownCasePresentation: wantsPresentation, ...fields } = item;
    if (wantsPresentation) {
      if (!presentationId) {
        console.log('    (no Case Presentation of theirs for these sections; item skipped)');
        continue;
      }
      fields.presentation_id = presentationId;
    }
    const parsed = parseRequirement(fields as Record<string, unknown>);
    if (!parsed.ok) throw new Error(`${course.code} item ${position + 1}: ${parsed.error}`);
    must(
      await supabase
        .from('course_requirements')
        // Seeded items are never Written Exams, so manual_type (067) is left to
        // its default and the seed runs before and after 067 alike.
        .insert({ ...requirementWrite(parsed.value, true), offering_id: offeringId, position: position++, created_by: teacher.id })
        .select('id'),
      'create requirement',
    );
  }
  console.log(`    + checklist of ${position} items`);
}

/**
 * Tick a seeded manual item the way an instructor would have: a return
 * demonstration is signed off for students whose graded work already shows
 * the course's skills, about `tickShare` of them, and never for a student
 * still short on those skills. An item that already has ticks is left alone.
 */
async function seedTicks(offeringId: string, course: CourseSeed, teacher: Teacher) {
  const offering = await loadOwnOffering(supabase, teacher.id, offeringId);
  if (!offering) return;
  const progress = await loadOfferingProgress(supabase, offering);
  const skillItems = progress.requirements.filter((r) => r.kind === 'skill');
  for (const item of course.checklist) {
    if (item.kind !== 'manual' || !item.tickShare) continue;
    const requirement = progress.requirements.find((r) => r.kind === 'manual' && r.title === item.title);
    if (!requirement || (progress.totals[requirement.id] ?? 0) > 0) continue;
    const ready = progress.students
      .filter((s) => skillItems.every((r) => progress.progress[s.id]?.[r.id]?.source === 'graded'))
      .sort((a, b) => a.name.localeCompare(b.name));
    const share = item.tickShare;
    const ticked = ready.filter((_, i) => (i * 7) % 10 < share * 10);
    if (ticked.length === 0) continue;
    must(
      await supabase.from('course_requirement_checks').insert(
        ticked.map((s, i) => ({
          requirement_id: requirement.id,
          student_id: s.id,
          checked_by: teacher.id,
          checked_at: new Date(Date.UTC(2026, 8, 7 + ((i * 3) % 21), 6, 30)).toISOString(),
          note: '',
        })),
      ),
      'tick manual item',
    );
    console.log(`    + ticked "${item.title}" for ${ticked.length} of ${ready.length} students whose graded work shows the skills`);
  }
}

async function report(offeringId: string, teacher: Teacher, label: string) {
  const offering = await loadOwnOffering(supabase, teacher.id, offeringId);
  if (!offering) return;
  const progress = await loadOfferingProgress(supabase, offering);
  const n = progress.students.length;
  console.log(`\n  ${label} — ${offering.term.name} — ${n} students in ${teacher.sectionNames.join(', ')}`);
  for (const [i, r] of progress.requirements.entries()) {
    console.log(`    ${String(i + 1).padStart(2)}. ${String(progress.totals[r.id] ?? 0).padStart(2)}/${n} met  ${r.title || r.label}`);
  }
  const complete = progress.students.filter((s) => s.total > 0 && s.done === s.total).length;
  const spread = progress.students.map((s) => s.done).sort((a, b) => a - b);
  console.log(`    every item met: ${complete}/${n}; items met per student: ${spread.join(' ')}`);
}

async function remove(teachers: Teacher[]) {
  for (const deanId of new Set(teachers.map((t) => t.deanId))) {
    const codes = COURSES.map((c) => c.code);
    const names = TERMS.map((t) => t.name);
    if (DRY_RUN) {
      console.log(`would delete courses ${codes.join(', ')} and terms ${names.join(', ')} of dean ${deanId}`);
      continue;
    }
    // Assignments, checklists and ticks go with them (on delete cascade).
    must(await supabase.from('courses').delete().eq('admin_id', deanId).in('code', codes), 'delete courses');
    must(await supabase.from('academic_terms').delete().eq('admin_id', deanId).in('name', names), 'delete terms');
    console.log(`deleted the seeded courses and terms of dean ${deanId}`);
  }
}

async function main() {
  const teachers = await loadTeachers();
  if (teachers.length === 0) {
    console.log('No instructor supervises a group yet, so there is no one to assign courses to.');
    return;
  }
  if (REMOVE) return remove(teachers);

  for (const teacher of teachers) {
    console.log(`${teacher.deanName} → ${teacher.name} (${teacher.sectionNames.join(', ')})`);
    if (DRY_RUN) {
      console.log(`  would add terms ${TERMS.map((t) => t.name).join(', ')}`);
      for (const c of COURSES) console.log(`  would assign ${c.code} ${c.title} in ${TEACHING_TERM} with ${c.checklist.length} items`);
      continue;
    }
    const termIds = new Map<string, string>();
    for (const term of TERMS) termIds.set(term.name, await ensureTerm(teacher.deanId, term));

    for (const course of COURSES) {
      const courseId = await ensureCourse(teacher.deanId, course);
      const { id, created } = await ensureOffering(courseId, termIds.get(TEACHING_TERM)!, teacher);
      console.log(`  ${created ? '+' : '='} ${course.code} assigned to ${teacher.name} for ${teacher.sectionNames.join(', ')}`);
      await seedChecklist(id, course, teacher);
      await seedTicks(id, course, teacher);
    }

    const offerings = must(
      await supabase
        .from('course_offerings')
        .select('id, courses!inner(code, title, admin_id)')
        .eq('faculty_id', teacher.id)
        .eq('term_id', termIds.get(TEACHING_TERM)!),
      'read assignments',
    ) as unknown as { id: string; courses: { code: string; title: string } }[];
    for (const o of offerings) await report(o.id, teacher, `${o.courses.code} ${o.courses.title}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
