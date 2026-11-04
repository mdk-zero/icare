/**
 * The two accounts Apple's App Review signs in with, and enough sample work
 * for every screen to have something on it.
 *
 * Everything sits under the test Dean (campus ICARE-TEST), in its own section
 * of fictional students, so no real Dean, instructor or student sees any of it
 * and no real student's name reaches a reviewer. The cases and quizzes are the
 * test Dean's finished ones, named below. Its leftover test quizzes stay out of
 * sight: they are tied to a course, so a student only sees one assigned to them.
 * The grades come from seed-student-history and seed-courses, the same code the
 * test cohort uses, and only ever touch the accounts named here. They do count
 * as simulated data in that Dean's analytics and in ML training.
 *
 * Safe to re-run: accounts, the section, the group and the term are matched by
 * name or email, and the sample work is rebuilt. Passwords are only set when an
 * account is created, or with --new-passwords: changing them would lock out a
 * review already under way.
 *
 *   npx tsx scripts/seed-review-accounts.ts                 create or refresh
 *   npx tsx scripts/seed-review-accounts.ts --dry-run       report, write nothing
 *   npx tsx scripts/seed-review-accounts.ts --new-passwords also replace the two passwords
 *
 * Writes to whatever .env.local points at. Paste the printed passwords into App
 * Store Connect (docs/app-store-review-notes.md); only their hashes are stored.
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { generateRandomPassword, hashPassword } from '../app/lib/auth/password';
import { seedHistory, type Profile, type WorkItem } from './seed-student-history';
import { assignCourses, ensureTerm } from './seed-courses';

config({ path: '.env.local' });

const DRY_RUN = process.argv.includes('--dry-run');
const NEW_PASSWORDS = process.argv.includes('--new-passwords');

const TEST_CAMPUS = 'ICARE-TEST';
const SECTION = 'App Review';
const GROUP = 'Group 1';
const INSTRUCTOR = { email: 'app-review-instructor@i-care.dev', name: 'Elena Reyes', sex: 'female' as const };
const STUDENT_EMAIL = 'app-review-student@i-care.dev';

const DAY_MS = 24 * 60 * 60 * 1000;
const dateOnly = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** How long what's due stays open, and the term stays current: a later app update is reviewed again. */
const OPEN_DAYS = 365;

/** Worked in order. The student finishes the first two, which leaves a case and a quiz open to try. */
const WORK: WorkItem[] = [
  { scenario: 'Community-Acquired Pneumonia: Respiratory and Pulse Assessment', quiz: 'Vital Signs: Pulse, Respiration, and Blood Pressure' },
  { scenario: 'Heart Failure: Cardiovascular Assessment', quiz: 'Vital Signs Fundamentals' },
  { scenario: 'Acute Gastroenteritis: Abdominal and Skin Assessment', quiz: 'Health Assessment: General Survey, Skin, and Head and Neck' },
];
const RETURN_DEMOS = ['Chapter 1: Skill 1-7', 'Chapter 2: Skill 2-2'];

/** Fictional, with one clear weakness so the skills to improve and the AI tips have something to say. */
const PROFILES: Profile[] = [
  { email: STUDENT_EMAIL, name: 'Maria Santos', section: SECTION, sex: 'female', ability: 0.78, weakAt: ['Health Assessment'], strongAt: ['Vital Signs'], taskCompletion: 1, engagement: 0.8 },
  { email: 'app-review-classmate-1@i-care.dev', name: 'Jose Cruz', section: SECTION, sex: 'male', ability: 0.9, weakAt: [], strongAt: ['Health Assessment'], taskCompletion: 1, engagement: 1 },
  { email: 'app-review-classmate-2@i-care.dev', name: 'Ana Dela Rosa', section: SECTION, sex: 'female', ability: 0.86, weakAt: [], strongAt: ['Vital Signs'], taskCompletion: 1, engagement: 1 },
  { email: 'app-review-classmate-3@i-care.dev', name: 'Paolo Garcia', section: SECTION, sex: 'male', ability: 0.7, weakAt: ['Vital Signs'], strongAt: [], taskCompletion: 0.9, engagement: 0.8 },
  { email: 'app-review-classmate-4@i-care.dev', name: 'Liza Ramos', section: SECTION, sex: 'female', ability: 0.55, weakAt: ['Health Assessment'], strongAt: [], taskCompletion: 0.8, engagement: 0.6 },
];

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  console.log(`Target: ${new URL(url).hostname}${DRY_RUN ? ' (dry run, nothing is written)' : ''}`);

  // ---- Who owns it --------------------------------------------------------
  const { data: campus, error: campusError } = await supabase.from('campuses').select('id, name').eq('code', TEST_CAMPUS).maybeSingle();
  if (campusError) throw new Error(`read campus: ${campusError.message}`);
  if (!campus) throw new Error(`No campus with code ${TEST_CAMPUS}, so there is no test Dean to put these under.`);
  const { data: deans, error: deanError } = await supabase
    .from('users')
    .select('id, name, email')
    .eq('role', 'admin')
    .eq('campus_id', campus.id)
    .is('admin_title', null);
  if (deanError) throw new Error(`read test Dean: ${deanError.message}`);
  const dean = deans?.[0];
  if (!dean) throw new Error(`${campus.name} has no Dean to put these under.`);
  console.log(`Under: ${dean.name} (${dean.email}), ${campus.name}`);

  const emails = [INSTRUCTOR.email, ...PROFILES.map((p) => p.email)];
  const { data: existing, error: existingError } = await supabase.from('users').select('id, email').in('email', emails);
  if (existingError) throw new Error(`read accounts: ${existingError.message}`);
  const idOf = new Map((existing ?? []).map((u) => [u.email as string, u.id as string]));

  // The work has to be there before anything is written.
  const scenarioTitles = [...WORK.map((w) => w.scenario), ...RETURN_DEMOS];
  const quizTitles = WORK.map((w) => w.quiz);
  const [scenarios, quizzes] = await Promise.all([
    supabase.from('scenarios').select('title').eq('admin_id', dean.id).in('title', scenarioTitles),
    supabase.from('assessments').select('title').eq('admin_id', dean.id).eq('is_published', true).in('title', quizTitles),
  ]);
  if (scenarios.error || quizzes.error) throw new Error(`read work: ${(scenarios.error ?? quizzes.error)?.message}`);
  const found = new Set([...(scenarios.data ?? []), ...(quizzes.data ?? [])].map((row) => row.title as string));
  const missing = [...scenarioTitles, ...quizTitles].filter((title) => !found.has(title));
  if (missing.length > 0) throw new Error(`${dean.name} doesn't have these, published:\n  ${missing.join('\n  ')}`);
  console.log(`All ${WORK.length} cases and quizzes and ${RETURN_DEMOS.length} Return Demonstrations are there.`);

  if (DRY_RUN) {
    const { data: section } = await supabase.from('sections').select('id').eq('name', SECTION).eq('admin_id', dean.id).maybeSingle();
    console.log(`Section "${SECTION}": ${section ? 'exists' : 'would create'}`);
    for (const email of emails) console.log(`${email}: ${idOf.has(email) ? 'exists' : 'would create'}`);
    return;
  }

  // ---- The section --------------------------------------------------------
  const { data: foundSection } = await supabase.from('sections').select('id').eq('name', SECTION).eq('admin_id', dean.id).maybeSingle();
  let sectionId = foundSection?.id as string | undefined;
  if (!sectionId) {
    const { data, error } = await supabase.from('sections').insert({ name: SECTION, admin_id: dean.id }).select('id').single();
    if (error || !data) throw new Error(`create section: ${error?.message}`);
    sectionId = data.id as string;
  }
  const section = { id: sectionId };

  // ---- The accounts -------------------------------------------------------
  const printed: string[] = [];
  const ensureAccount = async (person: { email: string; name: string; sex: 'male' | 'female' }, role: 'faculty' | 'student', signsIn: boolean) => {
    const known = idOf.get(person.email);
    // A classmate's password is never printed: nobody signs in as them.
    if (known) {
      if (signsIn && NEW_PASSWORDS) {
        const password = generateRandomPassword();
        const { error } = await supabase.from('users').update({ password_hash: await hashPassword(password) }).eq('id', known);
        if (error) throw new Error(`new password for ${person.email}: ${error.message}`);
        printed.push(`  ${person.email}  ${password}`);
      }
      return known;
    }
    const password = generateRandomPassword();
    const { data, error } = await supabase
      .from('users')
      .insert({
        email: person.email,
        name: person.name,
        sex: person.sex,
        role,
        admin_id: dean.id,
        campus_id: campus.id,
        section_id: role === 'student' ? section.id : null,
        password_hash: await hashPassword(password),
        // A reviewer signs straight in; a forced change would lock out the next one.
        force_password_change: false,
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(`create ${person.email}: ${error?.message}`);
    if (signsIn) printed.push(`  ${person.email}  ${password}`);
    return data.id as string;
  };

  const instructorId = await ensureAccount(INSTRUCTOR, 'faculty', true);
  const studentIds = new Map<string, string>();
  for (const profile of PROFILES) {
    studentIds.set(profile.email, await ensureAccount(profile, 'student', profile.email === STUDENT_EMAIL));
  }

  // ---- The instructor teaches the section, through one group ---------------
  const { data: link } = await supabase.from('faculty_sections').select('id').eq('faculty_id', instructorId).eq('section_id', section.id).maybeSingle();
  if (!link) {
    const { error } = await supabase.from('faculty_sections').insert({ faculty_id: instructorId, section_id: section.id });
    if (error) throw new Error(`link instructor: ${error.message}`);
  }
  const { data: foundTeam } = await supabase.from('teams').select('id').eq('section_id', section.id).eq('name', GROUP).maybeSingle();
  let teamId = foundTeam?.id as string | undefined;
  if (!teamId) {
    const { data, error } = await supabase
      .from('teams')
      .insert({ section_id: section.id, name: GROUP, faculty_id: instructorId, created_by: instructorId })
      .select('id')
      .single();
    if (error || !data) throw new Error(`create group: ${error?.message}`);
    teamId = data.id as string;
  }
  const { error: membersError } = await supabase
    .from('team_members')
    .upsert([...studentIds.values()].map((student_id) => ({ team_id: teamId, student_id })), {
      onConflict: 'team_id,student_id',
      ignoreDuplicates: true,
    });
  if (membersError) throw new Error(`add group members: ${membersError.message}`);

  // ---- Graded work and a course --------------------------------------------
  console.log('\nBuilding their work (a few minutes)...');
  await seedHistory(PROFILES, { [SECTION]: WORK });

  // Its own term, since the instructor's screens only list a course in a term that is running.
  const now = Date.now();
  const termId = await ensureTerm(dean.id, {
    name: 'App Review Term',
    starts_on: dateOnly(now - 120 * DAY_MS),
    ends_on: dateOnly(now + OPEN_DAYS * DAY_MS),
  });
  await assignCourses(
    { id: instructorId, name: INSTRUCTOR.name, deanId: dean.id, deanName: dean.name, sectionIds: [section.id], sectionNames: [SECTION] },
    termId,
  );

  // ---- What's left is still open, whenever the review happens --------------
  const studentId = studentIds.get(STUDENT_EMAIL)!;
  const deadline = new Date(now + OPEN_DAYS * DAY_MS).toISOString();
  for (const table of ['scenario_assignments', 'assessment_assignments']) {
    const { error } = await supabase
      .from(table)
      .update({ status: 'pending', deadline })
      .eq('student_id', studentId)
      .in('status', ['pending', 'overdue']);
    if (error) throw new Error(`reopen ${table}: ${error.message}`);
  }

  // The Demos tab.
  const { data: demos, error: demosError } = await supabase.from('scenarios').select('id').eq('admin_id', dean.id).in('title', RETURN_DEMOS);
  if (demosError) throw new Error(`read Return Demonstrations: ${demosError.message}`);
  for (const demo of demos ?? []) {
    const { data: held } = await supabase.from('scenario_assignments').select('id').eq('scenario_id', demo.id).eq('student_id', studentId).maybeSingle();
    if (held) continue;
    const { error } = await supabase.from('scenario_assignments').insert({
      scenario_id: demo.id,
      student_id: studentId,
      team_id: teamId,
      assigned_by: instructorId,
      deadline,
      status: 'pending',
      required: true,
    });
    if (error) throw new Error(`assign Return Demonstration: ${error.message}`);
  }

  // The Library. Its materials are aimed at the test cohort's sections, so this
  // section gets its own copies and theirs stay as they are.
  const { data: materials, error: materialsError } = await supabase
    .from('library_materials')
    .select('skill_id, kind, title, description, youtube_id, body_md, url, target_sections, published_at')
    .eq('admin_id', dean.id)
    .eq('status', 'published');
  if (materialsError) throw new Error(`read Library: ${materialsError.message}`);
  const mineAlready = (materials ?? []).some((m) => (m.target_sections as string[] | null)?.includes(SECTION));
  const toCopy = mineAlready ? [] : (materials ?? []).filter((m) => m.kind === 'video' || m.kind === 'link' || m.kind === 'note');
  if (toCopy.length > 0) {
    const { error } = await supabase.from('library_materials').insert(
      toCopy.map((m) => ({ ...m, target_sections: [SECTION], status: 'published', created_by: instructorId, admin_id: dean.id })),
    );
    if (error) throw new Error(`copy Library materials: ${error.message}`);
  }

  // Something in the bell.
  const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', studentId);
  if (!count) {
    const { error } = await supabase.from('notifications').insert([
      { user_id: studentId, type: 'assignment_created', title: 'New Patient Case', body: 'Your clinical instructor assigned you a new Patient Case.' },
      { user_id: studentId, type: 'system', title: 'Welcome to iCARE++', body: 'Your courses, cases and quizzes are all here.' },
    ]);
    if (error) console.warn(`  no sample notifications: ${error.message}`);
  }

  // ---- Report ---------------------------------------------------------------
  const [open, finished, quizzesOpen] = await Promise.all([
    supabase.from('scenario_assignments').select('id', { count: 'exact', head: true }).eq('student_id', studentId).eq('status', 'pending'),
    supabase.from('scenario_assignments').select('id', { count: 'exact', head: true }).eq('student_id', studentId).eq('status', 'completed'),
    supabase.from('assessment_assignments').select('id', { count: 'exact', head: true }).eq('student_id', studentId).eq('status', 'pending'),
  ]);
  console.log(`\n${STUDENT_EMAIL}: ${finished.count ?? 0} graded cases, ${open.count ?? 0} open, ${quizzesOpen.count ?? 0} quizzes to take.`);
  console.log(`Return Demonstrations given: ${demos?.length ?? 0}. Library materials copied: ${toCopy.length}.`);
  if (printed.length > 0) {
    console.log('\nPasswords, shown only now. Put them in App Store Connect:');
    for (const line of printed) console.log(line);
  } else {
    console.log('\nPasswords are unchanged. Use --new-passwords if they were lost.');
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
