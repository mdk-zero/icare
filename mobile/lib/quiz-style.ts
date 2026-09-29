import type { useTheme } from '@/hooks/useTheme';

type Accent = ReturnType<typeof useTheme>['Accent'];

const TONES: (keyof Accent)[] = ['teal', 'blue', 'violet', 'cyan', 'amber'];

/** A quiz keeps the same icon tone everywhere: picked from its id. */
export function quizAccent(Accent: Accent, id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return Accent[TONES[Math.abs(hash) % TONES.length]];
}

/** The College's passing mark for Skill Assessments. */
export const PASSING_SCORE = 75;

/** Green at the passing mark and up, amber from half, red below. */
export function accuracyAccent(Accent: Accent, score: number) {
  if (score >= PASSING_SCORE) return Accent.green;
  if (score >= 50) return Accent.amber;
  return Accent.red;
}
