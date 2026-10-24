/**
 * AI-written questions travel from the New Quiz page to the quiz's editor as
 * unsaved drafts, so an instructor reviews and saves each one before it can
 * reach students — the same rule the generator follows everywhere. They ride
 * in sessionStorage for the one navigation between the two pages.
 */

export interface DraftQuestion {
  content: string;
  options: string[];
  correct_index: number;
  question_type: string;
  points: number;
  explanation: string;
  competency_ids: string[];
  criteria_id: string | null;
}

const key = (assessmentId: string) => `icare:quiz-drafts:${assessmentId}`;

export function stashDrafts(assessmentId: string, drafts: DraftQuestion[]): boolean {
  try {
    sessionStorage.setItem(key(assessmentId), JSON.stringify(drafts));
    return true;
  } catch {
    return false;
  }
}

/** The drafts left for this quiz, once: reading them clears them. */
export function takeDrafts(assessmentId: string): DraftQuestion[] {
  try {
    const raw = sessionStorage.getItem(key(assessmentId));
    if (!raw) return [];
    sessionStorage.removeItem(key(assessmentId));
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as DraftQuestion[]) : [];
  } catch {
    return [];
  }
}
