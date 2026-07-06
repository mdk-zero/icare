import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

config({ path: '.env.local' });

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

  const users = [
    {
      email: 'admin@icare.edu',
      name: 'Dr. Maria Santos',
      role: 'admin' as const,
      password: process.env.SEED_ADMIN_PASSWORD,
      google_sub: 'mock-admin-001',
    },
    {
      email: 'student@icare.edu',
      name: 'Maria Cruz',
      role: 'student' as const,
      password: process.env.SEED_STUDENT_PASSWORD,
      google_sub: 'mock-student-001',
    },
    {
      email: 'faculty@icare.edu',
      name: 'Dr. Juan Dela Cruz',
      role: 'faculty' as const,
      password: process.env.SEED_FACULTY_PASSWORD,
      google_sub: 'mock-faculty-001',
    },
  ];

  for (const u of users) {
    if (!u.password) {
      console.error(
        `Missing SEED_${u.role.toUpperCase()}_PASSWORD environment variable for ${u.email}`,
      );
      process.exit(1);
    }

    const password_hash = await bcrypt.hash(u.password, 10);
    const { error } = await supabase
      .from('users')
      .upsert(
        {
          email: u.email,
          name: u.name,
          role: u.role,
          password_hash,
          google_sub: u.google_sub,
        },
        { onConflict: 'email' },
      );
    if (error) {
      console.error(`Failed to seed ${u.email}:`, error.message);
      process.exit(1);
    }
    console.log(`Seeded ${u.email} (${u.role})`);
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
