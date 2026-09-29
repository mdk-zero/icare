import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { startScenarioAssignment, type ScenarioTasksResult } from '@/lib/api';

/**
 * The RetDem clock. Opening a patient case that hasn't started asks the
 * student whether they are ready; starting stamps the start on the server and
 * the clock runs until the instructor grades the last task. "Not yet" goes
 * back without starting it.
 *
 * Returns the seconds elapsed while the case is open and started, else null.
 * A server without the clock (before migration 063) never asks.
 */
export function useCaseClock(
  assignment: ScenarioTasksResult['assignment'] | null,
  active: boolean,
): number | null {
  const router = useRouter();
  const [started, setStarted] = useState<{ id: string; at: string } | null>(null);
  const asked = useRef<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const id = assignment?.id ?? null;
  const supported = assignment != null && assignment.started_at !== undefined;
  const startedAt = (started?.id === id ? started?.at : null) ?? assignment?.started_at ?? null;

  useEffect(() => {
    if (!id || !active || !supported || startedAt || asked.current === id) return;
    asked.current = id;
    Alert.alert(
      'Ready to start?',
      'The timer starts as soon as you tap Start and runs until your instructor has graded every task. Only start when your instructor is ready to watch you.',
      [
        { text: 'Not yet', style: 'cancel', onPress: () => router.back() },
        {
          text: 'Start',
          onPress: () => {
            startScenarioAssignment(id)
              .then((result) => {
                if (result.started_at) setStarted({ id, at: result.started_at });
              })
              .catch((err) => {
                // Let the next open ask again.
                asked.current = null;
                Alert.alert(
                  'Unable to start',
                  err instanceof Error ? err.message : 'Check your connection and try again.',
                  [{ text: 'OK', onPress: () => router.back() }],
                );
              });
          },
        },
      ],
      { cancelable: false },
    );
  }, [id, active, supported, startedAt, router]);

  const running = active && Boolean(startedAt);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  if (!running || !startedAt) return null;
  return Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
}
