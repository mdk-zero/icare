import { Router, Request, Response } from 'express';
import { query, execute } from '../db';
import { RowDataPacket } from 'mysql2';

const router = Router();

interface PatientRow extends RowDataPacket {
  id: number;
  name: string;
  age: number;
  gender: string;
  room: string;
  diagnosis: string;
  admitted_date: string;
  status: string;
}

router.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await query<PatientRow[]>('SELECT * FROM patients ORDER BY name');
    res.json(rows.map(mapPatient));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const rows = await query<PatientRow[]>('SELECT * FROM patients WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      res.status(404).json({ error: 'Patient not found' });
      return;
    }
    res.json(mapPatient(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function mapPatient(row: PatientRow) {
  return {
    id: String(row.id),
    name: row.name,
    age: row.age,
    gender: row.gender,
    room: row.room,
    diagnosis: row.diagnosis,
    admittedDate: row.admitted_date,
    status: row.status,
  };
}

export default router;
