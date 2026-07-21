import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query, execute } from '../db';
import { RowDataPacket } from 'mysql2';

const router = Router();

interface UserRow extends RowDataPacket {
  id: number;
  name: string;
  email: string;
  password: string;
  role: string;
  cohort: string;
  student_id: string;
}

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const users = await query<UserRow[]>('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const user = users[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    await execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        cohort: user.cohort,
        studentId: user.student_id,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, email, password, cohort, studentId } = req.body;
    if (!name || !email || !password) {
      res.status(400).json({ error: 'Name, email, and password are required' });
      return;
    }

    const existing = await query<UserRow[]>('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const hashed = await bcrypt.hash(password, 10);
    const result = await execute(
      'INSERT INTO users (name, email, password, cohort, student_id) VALUES (?, ?, ?, ?, ?)',
      [name, email, hashed, cohort || '', studentId || ''],
    );

    res.status(201).json({
      user: {
        id: result.insertId,
        name,
        email,
        role: 'student',
        cohort: cohort || '',
        studentId: studentId || '',
      },
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
