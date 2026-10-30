import type { useRouter } from 'expo-router';

type Router = ReturnType<typeof useRouter>;

/** What a list already knows about a patient case, enough to open it. */
export interface CaseLink {
  id: string;
  patient_id: string | null;
  scenario_title: string;
  deadline: string | null;
  status: string;
  /** Null: not started yet. Undefined: the server can't tell (before migration 063). */
  started_at?: string | null;
  tasks_total?: number;
}

/**
 * Opens a patient case: on its patient when it has one, else on its brief.
 * A case known not to have started carries what its Before you start screen
 * shows, so that screen appears at once instead of after a loading skeleton.
 */
export function openCase(router: Router, a: CaseLink) {
  // Start moves a case from pending to in progress, so a pending case hasn't
  // started even on a server that doesn't report started_at yet.
  const fresh =
    a.status !== 'completed' && (a.started_at === null || (a.started_at === undefined && a.status === 'pending'));
  const gate = fresh
    ? {
        gate: '1',
        assignment: a.id,
        title: a.scenario_title,
        due: a.deadline ?? '',
        tasks: a.tasks_total != null ? String(a.tasks_total) : '',
      }
    : a.status !== 'completed'
      ? // Can't tell yet whether it started: a short spinner, never the page skeleton.
        { gate: 'wait' }
      : {};
  if (a.patient_id) router.push({ pathname: '/clinic/patient/[id]', params: { id: a.patient_id, case: '1', ...gate } });
  else router.push({ pathname: '/clinic/assignment/[id]', params: { id: a.id, ...gate } });
}
