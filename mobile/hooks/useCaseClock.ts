import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { startScenarioAssignment, type ScenarioTasksResult } from '@/lib/api';

export interface CaseClock {
  /** Seconds elapsed while the case is open and started, else null. */
  elapsed: number | null;
  /**
   * The case hasn't started: the screen shows its instructions (CaseStartGate)
   * instead of the tasks until the student taps Start.
   */
  needsStart: boolean;
  starting: boolean;
  start: () => void;
}

/**
 * The RetDem clock. A patient case that hasn't started opens on its
 * instructions; Start stamps the start on the server, the tasks appear, and
 * the clock runs until the instructor grades the last task.
 * A server without the clock (before migration 063) never asks.
 */
export function useCaseClock(assignment: ScenarioTasksResult['assignment'] | null, active: boolean): CaseClock {
  const [started, setStarted] = useState<{ id: string; at: string } | null>(null);
  const [starting, setStarting] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const id = assignment?.id ?? null;
  const supported = assignment != null && assignment.started_at !== undefined;
  const startedAt = (started?.id === id ? started?.at : null) ?? assignment?.started_at ?? null;

  const start = () => {
    if (!id || starting) return;
    setStarting(true);
    startScenarioAssignment(id)
      .then((result) => {
        if (result.started_at) setStarted({ id, at: result.started_at });
      })
      .catch((err) => {
        Alert.alert('Unable to start', err instanceof Error ? err.message : 'Check your connection and try again.');
      })
      .finally(() => setStarting(false));
  };

  const running = active && Boolean(startedAt);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  return {
    elapsed: running && startedAt ? Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000)) : null,
    needsStart: Boolean(id) && active && supported && !startedAt,
    starting,
    start,
  };
}
