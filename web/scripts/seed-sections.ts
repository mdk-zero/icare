/**
 * Sections, the faculty who handle them, and the students enrolled in them.
 *
 * Faculty-student connection is section-based everywhere in this app (see
 * lib/roster): a faculty member handles the sections listed against them in
 * faculty_sections, and their students are whoever carries that section_id.
 * So a section is the unit that decides what a faculty member sees — their
 * roster, their analytics scope, their shift rotations, and which scenarios
 * stay visible once assigned.
 *
 * A section with nobody in it is inert: it shows up in pickers and reports
 * zero everywhere else. Each one here is enrolled, so it is usable the moment
 * it exists.
 *
 * Safe to re-run: a section is matched by name, the faculty link by the pair,
 * and a student by email. Existing rows are left exactly as they are — this
 * never moves a student between sections or reassigns a section that already
 * has a different faculty member on it.
 *
 *   npx tsx scripts/seed-sections.ts
 *
 * Set SEED_STUDENT_PASSWORD to give every new student a known password;
 * otherwise one is generated per student and printed once.
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { generateRandomPassword, hashPassword } from '../app/lib/auth/password';

config({ path: '.env.local' });

interface SectionSeed {
  name: string;
  /** The faculty member who handles it, by email. */
  faculty_email: string;
  students: { email: string; name: string; sex: 'male' | 'female' }[];
}

const SECTIONS: SectionSeed[] = [
  {
    // Already exists with nobody on it — claimed and enrolled rather than
    // left as a third orphan in the picker.
    name: 'BSN 1103',
    faculty_email: 'linuxadona17@gmail.com',
    students: [
      { email: '23-81104@g.batstate-u.edu.ph', name: 'Althea Mae R. Bautista', sex: 'female' },
      { email: '23-81137@g.batstate-u.edu.ph', name: 'Jerome C. Maligaya', sex: 'male' },
      { email: '23-81169@g.batstate-u.edu.ph', name: 'Katrina L. Mercado', sex: 'female' },
      { email: '23-81204@g.batstate-u.edu.ph', name: 'Emmanuel D. Rosales', sex: 'male' },
      { email: '23-81238@g.batstate-u.edu.ph', name: 'Precious Joy A. Tolentino', sex: 'female' },
    ],
  },
  {
    name: 'BSN 1104',
    faculty_email: 'linuxadona17@gmail.com',
    students: [
      { email: '23-81275@g.batstate-u.edu.ph', name: 'Aaron Kyle P. Navarro', sex: 'male' },
      { email: '23-81312@g.batstate-u.edu.ph', name: 'Bianca Rose T. Gutierrez', sex: 'female' },
      { email: '23-81348@g.batstate-u.edu.ph', name: 'Christian Dave M. Lazaro', sex: 'male' },
      { email: '23-81383@g.batstate-u.edu.ph', name: 'Danica Mae S. Espiritu', sex: 'female' },
      { email: '23-81419@g.batstate-u.edu.ph', name: 'Enrico B. Pascual', sex: 'male' },
      { email: '23-81456@g.batstate-u.edu.ph', name: 'Faith Angeline C. Ramos', sex: 'female' },
    ],
  },
  {
    name: 'BSN 1105',
    faculty_email: 'linuxadona17@gmail.com',
    students: [
      { email: '23-81492@g.batstate-u.edu.ph', name: 'Gabriel John V. Soriano', sex: 'male' },
      { email: '23-81527@g.batstate-u.edu.ph', name: 'Hannah Mae D. Castillo', sex: 'female' },
      { email: '23-81564@g.batstate-u.edu.ph', name: 'Ivan Christopher A. Rivera', sex: 'male' },
      { email: '23-81598@g.batstate-u.edu.ph', name: 'Jasmine Faye R. Delos Reyes', sex: 'female' },
    ],
  },
];

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: existingSections } = await supabase.from('sections').select('id, name');
  const sectionByName = new Map((existingSections ?? []).map((s) => [s.name, s.id]));

  const { data: people } = await supabase.from('users').select('id, email, name, role');
  const userByEmail = new Map((people ?? []).map((u) => [u.email, u]));

  const { data: links } = await supabase.from('faculty_sections').select('faculty_id, section_id');
  const linked = new Set((links ?? []).map((l) => `${l.faculty_id}|${l.section_id}`));

  const credentials: string[] = [];
  let sectionsCreated = 0;
  let linksCreated = 0;
  let studentsCreated = 0;

  for (const seed of SECTIONS) {
    const faculty = userByEmail.get(seed.faculty_email);
    if (!faculty) {
      console.error(`  ✗ no user ${seed.faculty_email} — cannot assign ${seed.name}`);
      process.exit(1);
    }
    if (faculty.role !== 'faculty' && faculty.role !== 'admin') {
      console.error(`  ✗ ${seed.faculty_email} is a ${faculty.role}, not faculty`);
      process.exit(1);
    }

    let sectionId = sectionByName.get(seed.name);
    if (!sectionId) {
      const { data: created, error } = await supabase
        .from('sections')
        .insert({ name: seed.name })
        .select('id')
        .single();
      if (error || !created) {
        console.error(`  ✗ ${seed.name}:`, error?.message);
        process.exit(1);
      }
      sectionId = created.id;
      sectionByName.set(seed.name, sectionId);
      sectionsCreated += 1;
    }

    // The table has no unique constraint on the pair, so a second run would
    // happily insert the same link again. Checked rather than upserted.
    if (!linked.has(`${faculty.id}|${sectionId}`)) {
      const { error } = await supabase
        .from('faculty_sections')
        .insert({ faculty_id: faculty.id, section_id: sectionId });
      if (error) {
        console.error(`  ✗ linking ${faculty.name} to ${seed.name}:`, error.message);
        process.exit(1);
      }
      linked.add(`${faculty.id}|${sectionId}`);
      linksCreated += 1;
    }

    let enrolled = 0;
    for (const student of seed.students) {
      // An account that already exists is left alone, section included — this
      // seed adds people, it does not move them.
      if (userByEmail.has(student.email)) continue;
      const password = process.env.SEED_STUDENT_PASSWORD || generateRandomPassword();
      const { error } = await supabase.from('users').insert({
        email: student.email,
        name: student.name,
        role: 'student',
        sex: student.sex,
        section_id: sectionId,
        password_hash: await hashPassword(password),
        force_password_change: true,
      });
      if (error) {
        console.error(`  ✗ ${student.email}:`, error.message);
        process.exit(1);
      }
      credentials.push(`  ${student.email.padEnd(32)} ${password}`);
      studentsCreated += 1;
      enrolled += 1;
    }

    const { count } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'student')
      .eq('section_id', sectionId);
    console.log(
      `  ✓ ${seed.name.padEnd(10)} ${faculty.name.padEnd(16)} ${count ?? 0} students` +
        (enrolled > 0 ? ` (${enrolled} new)` : ' (unchanged)'),
    );
  }

  if (credentials.length > 0) {
    console.log(`\nTemporary passwords for the ${credentials.length} new student(s):`);
    for (const line of credentials) console.log(line);
    if (!process.env.SEED_STUDENT_PASSWORD) {
      console.log(
        '\n  Generated and not stored anywhere — keep them, or re-run with\n' +
          '  SEED_STUDENT_PASSWORD set to choose your own.',
      );
    }
  }

  console.log(
    `\nSections created: ${sectionsCreated}   Faculty links: ${linksCreated}   Students: ${studentsCreated}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
