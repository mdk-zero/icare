import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes from './routes/auth';
import patientRoutes from './routes/patients';
import vitalRoutes from './routes/vitals';
import taskRoutes from './routes/tasks';
import quizRoutes from './routes/quizzes';
import ehrRoutes from './routes/ehr';
import progressRoutes from './routes/progress';
import tprRoutes from './routes/tpr';
import ivfRoutes from './routes/ivf';
import notificationRoutes from './routes/notifications';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/vitals', vitalRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/ehr', ehrRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/tpr', tprRoutes);
app.use('/api/ivf', ivfRoutes);
app.use('/api/notifications', notificationRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`iCARE server running on http://0.0.0.0:${PORT}`);
});
