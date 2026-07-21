import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

async function seed() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'icare',
  });

  const hash = await bcrypt.hash('password123', 10);

  await conn.query(
    `INSERT IGNORE INTO users (name, email, password, role, cohort, student_id) VALUES
     ('Maria Santos', 'maria@icare.edu', ?, 'student', 'BSN-2027', 'NS-2024-001'),
     ('Juan Cruz', 'juan@icare.edu', ?, 'student', 'BSN-2027', 'NS-2024-002'),
     ('Dr. Rodriguez', 'dr.rodriguez@icare.edu', ?, 'faculty', '', '')`,
    [hash, hash, hash],
  );

  console.log('Seed data inserted!');
  await conn.end();
}

seed().catch(console.error);
