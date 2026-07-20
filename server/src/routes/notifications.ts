import { Router, Request, Response } from 'express';
import { query, execute } from '../db';
import { RowDataPacket } from 'mysql2';

const router = Router();

interface NotificationRow extends RowDataPacket {
  id: number;
  user_id: number | null;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string | undefined;
    let sql = 'SELECT * FROM notifications';
    const params: any[] = [];
    if (userId) {
      sql += ' WHERE user_id = ?';
      params.push(userId);
    }
    sql += ' ORDER BY created_at DESC';
    const rows = await query<NotificationRow[]>(sql, params);
    res.json(rows.map(mapNotification));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id/read', async (req: Request, res: Response) => {
  try {
    await execute('UPDATE notifications SET is_read = TRUE WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function mapNotification(row: NotificationRow) {
  return {
    id: String(row.id),
    title: row.title,
    message: row.message,
    type: row.type,
    timestamp: row.created_at,
    read: Boolean(row.is_read),
  };
}

export default router;
