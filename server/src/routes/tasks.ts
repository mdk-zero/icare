import { Router, Request, Response } from 'express';
import { query, execute } from '../db';
import { RowDataPacket } from 'mysql2';

const router = Router();

interface TaskRow extends RowDataPacket {
  id: number;
  title: string;
  description: string | null;
  patient_id: number | null;
  patient_name: string | null;
  due_date: string;
  status: string;
  priority: string;
  category: string;
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    let sql = 'SELECT * FROM clinical_tasks';
    const params: any[] = [];
    if (status) {
      sql += ' WHERE status = ?';
      params.push(status);
    }
    sql += ' ORDER BY due_date ASC';
    const rows = await query<TaskRow[]>(sql, params);
    res.json(rows.map(mapTask));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    await execute('UPDATE clinical_tasks SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function mapTask(row: TaskRow) {
  return {
    id: String(row.id),
    title: row.title,
    description: row.description || '',
    patientId: row.patient_id ? String(row.patient_id) : '',
    patientName: row.patient_name || '',
    dueDate: row.due_date,
    status: row.status,
    priority: row.priority,
    category: row.category,
  };
}

export default router;
