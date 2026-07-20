import { Router, Request, Response } from 'express';
import { query } from '../db';
import { RowDataPacket } from 'mysql2';

const router = Router();

interface QuizRow extends RowDataPacket {
  id: number;
  title: string;
  description: string | null;
  category: string | null;
  difficulty: string;
  questions_count: number;
  completed_count: number;
  last_score: number | null;
  due_date: string | null;
}

interface QuestionRow extends RowDataPacket {
  id: number;
  quiz_id: number;
  text: string;
  options: string;
  correct_index: number;
  explanation: string | null;
}

router.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await query<QuizRow[]>('SELECT * FROM quizzes ORDER BY title');
    res.json(rows.map(mapQuiz));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/questions', async (req: Request, res: Response) => {
  try {
    const rows = await query<QuestionRow[]>(
      'SELECT * FROM questions WHERE quiz_id = ? ORDER BY id',
      [req.params.id],
    );
    res.json(rows.map(mapQuestion));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function mapQuiz(row: QuizRow) {
  return {
    id: String(row.id),
    title: row.title,
    description: row.description || '',
    category: row.category || '',
    difficulty: row.difficulty,
    questionsCount: row.questions_count,
    completedCount: row.completed_count,
    lastScore: row.last_score ?? undefined,
    dueDate: row.due_date || undefined,
  };
}

function mapQuestion(row: QuestionRow) {
  return {
    id: String(row.id),
    quizId: String(row.quiz_id),
    text: row.text,
    options: JSON.parse(row.options),
    correctIndex: row.correct_index,
    explanation: row.explanation || '',
  };
}

export default router;
