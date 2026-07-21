import { Router, Request, Response } from 'express';
import { query } from '../db';
import { RowDataPacket } from 'mysql2';

const router = Router();

interface TPRRow extends RowDataPacket {
  id: number;
  patient_id: number;
  date: string;
  time: string;
  temperature: number;
  pulse: number;
  respiration: number;
  signature: string;
}

router.get('/patient/:patientId', async (req: Request, res: Response) => {
  try {
    const rows = await query<TPRRow[]>(
      'SELECT * FROM tpr_records WHERE patient_id = ? ORDER BY date DESC, time DESC',
      [req.params.patientId],
    );
    res.json(rows.map(mapTPR));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function mapTPR(row: TPRRow) {
  return {
    id: String(row.id),
    patientId: String(row.patient_id),
    date: row.date,
    time: row.time,
    temperature: row.temperature,
    pulse: row.pulse,
    respiration: row.respiration,
    signature: row.signature,
  };
}

export default router;
