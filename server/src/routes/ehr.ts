import { Router, Request, Response } from 'express';
import { query } from '../db';
import { RowDataPacket } from 'mysql2';

const router = Router();

interface EHRRow extends RowDataPacket {
  id: number;
  patient_id: number;
  date: string;
  type: string;
  content: string;
  author: string;
}

router.get('/patient/:patientId', async (req: Request, res: Response) => {
  try {
    const rows = await query<EHRRow[]>(
      'SELECT * FROM ehr_records WHERE patient_id = ? ORDER BY date DESC',
      [req.params.patientId],
    );
    res.json(rows.map(mapEHR));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function mapEHR(row: EHRRow) {
  return {
    id: String(row.id),
    patientId: String(row.patient_id),
    date: row.date,
    type: row.type,
    content: row.content,
    author: row.author,
  };
}

export default router;
