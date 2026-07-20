import { Router, Request, Response } from 'express';
import { query } from '../db';
import { RowDataPacket } from 'mysql2';

const router = Router();

interface VitalRow extends RowDataPacket {
  id: number;
  patient_id: number;
  timestamp: string;
  heart_rate: number;
  blood_pressure_systolic: number;
  blood_pressure_diastolic: number;
  temperature: number;
  respiration_rate: number;
  oxygen_saturation: number;
  is_anomaly: boolean;
}

router.get('/patient/:patientId', async (req: Request, res: Response) => {
  try {
    const rows = await query<VitalRow[]>(
      'SELECT * FROM vital_signs WHERE patient_id = ? ORDER BY timestamp DESC',
      [req.params.patientId],
    );
    res.json(rows.map(mapVital));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function mapVital(row: VitalRow) {
  return {
    id: String(row.id),
    patientId: String(row.patient_id),
    timestamp: row.timestamp,
    heartRate: row.heart_rate,
    bloodPressureSystolic: row.blood_pressure_systolic,
    bloodPressureDiastolic: row.blood_pressure_diastolic,
    temperature: row.temperature,
    respirationRate: row.respiration_rate,
    oxygenSaturation: row.oxygen_saturation,
    isAnomaly: Boolean(row.is_anomaly),
  };
}

export default router;
