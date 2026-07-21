import { Router, Request, Response } from 'express';
import { query } from '../db';
import { RowDataPacket } from 'mysql2';

const router = Router();

interface IVFRow extends RowDataPacket {
  id: number;
  patient_id: number;
  date: string;
  time: string;
  iv_fluids: number;
  oral_intake: number;
  urine_output: number;
  vomitus: number;
  drainage: number;
  heart_rate: number | null;
  blood_pressure_systolic: number | null;
  blood_pressure_diastolic: number | null;
  temperature: number | null;
  notes: string | null;
  signature: string;
}

router.get('/patient/:patientId', async (req: Request, res: Response) => {
  try {
    const rows = await query<IVFRow[]>(
      'SELECT * FROM ivf_records WHERE patient_id = ? ORDER BY date DESC, time DESC',
      [req.params.patientId],
    );
    res.json(rows.map(mapIVF));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function mapIVF(row: IVFRow) {
  return {
    id: String(row.id),
    patientId: String(row.patient_id),
    date: row.date,
    time: row.time,
    ivFluids: row.iv_fluids,
    oralIntake: row.oral_intake,
    urineOutput: row.urine_output,
    vomitus: row.vomitus,
    drainage: row.drainage,
    heartRate: row.heart_rate ?? undefined,
    bloodPressureSystolic: row.blood_pressure_systolic ?? undefined,
    bloodPressureDiastolic: row.blood_pressure_diastolic ?? undefined,
    temperature: row.temperature ?? undefined,
    notes: row.notes || '',
    signature: row.signature,
  };
}

export default router;
