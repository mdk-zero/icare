import { Router, Request, Response } from 'express';
import { query } from '../db';
import { RowDataPacket } from 'mysql2';

const router = Router();

interface PerformanceRow extends RowDataPacket {
  id: number;
  user_id: number | null;
  date: string;
  category: string;
  score: number;
  competency: string;
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string | undefined;
    let sql = 'SELECT * FROM performance_logs';
    const params: any[] = [];
    if (userId) {
      sql += ' WHERE user_id = ?';
      params.push(userId);
    }
    sql += ' ORDER BY date DESC';
    const rows = await query<PerformanceRow[]>(sql, params);
    res.json(rows.map(mapPerformance));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function mapPerformance(row: PerformanceRow) {
  return {
    id: String(row.id),
    date: row.date,
    category: row.category,
    score: row.score,
    competency: row.competency,
  };
}

export default router;
