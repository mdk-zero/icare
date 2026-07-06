import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

async function main() {
  const email = process.argv[2] || process.env.SEED_FACULTY_EMAIL;

  if (!email) {
    console.error('Usage: npx tsx scripts/link-existing-students-to-faculty.ts <faculty-email>');
    console.error('   or: SEED_FACULTY_EMAIL=... npx tsx scripts/link-existing-students-to-faculty.ts');
    process.exit(1);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: faculty, error: facultyError } = await supabase
    .from('users')
    .select('id, email, name, role')
    .eq('email', email.toLowerCase().trim())
    .in('role', ['faculty', 'admin'])
    .maybeSingle();

  if (facultyError || !faculty) {
    console.error('Faculty user not found:', facultyError?.message || email);
    process.exit(1);
  }

  console.log(`Linking existing students to faculty: ${faculty.name} (${faculty.email})`);

  const { data: students, error: studentsError } = await supabase
    .from('users')
    .select('id, email, name')
    .eq('role', 'student');

  if (studentsError) {
    console.error('Failed to fetch students:', studentsError.message);
    process.exit(1);
  }

  if (!students || students.length === 0) {
    console.log('No students found.');
    return;
  }

  const { data: existingLinks } = await supabase
    .from('faculty_students')
    .select('student_id')
    .eq('faculty_id', faculty.id);

  const linkedStudentIds = new Set(existingLinks?.map((r) => r.student_id) ?? []);
  const toLink = students.filter((s) => !linkedStudentIds.has(s.id));

  if (toLink.length === 0) {
    console.log('All existing students are already linked to this faculty.');
    return;
  }

  const rows = toLink.map((s) => ({
    faculty_id: faculty.id,
    student_id: s.id,
  }));

  const { error: insertError } = await supabase.from('faculty_students').insert(rows);

  if (insertError) {
    console.error('Failed to link students:', insertError.message);
    process.exit(1);
  }

  console.log(`Successfully linked ${toLink.length} student(s) to ${faculty.email}:`);
  for (const s of toLink) {
    console.log(`  - ${s.name} (${s.email})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
