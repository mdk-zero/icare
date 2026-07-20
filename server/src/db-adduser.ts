import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

async function addUser() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'andre_db',
  });

  const hash = await bcrypt.hash('pocox3pro', 10);

  await conn.query(
    `INSERT IGNORE INTO users (name, email, password, role, cohort, student_id) VALUES (?, ?, ?, 'student', 'BSN-2027', 'NS-2024-003')`,
    ['Andre Cachola', 'dreicachola13@gmail.com', hash],
  );

  console.log('User Andre Cachola added!');
  await conn.end();
}

addUser().catch(console.error);
