import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import { reportEnabled } from '../env.mjs';
import { reportRun } from '../report.mjs';

type Row = { suite: string; name: string; status: 'passed' | 'failed' | 'skipped'; duration_ms: number; error: string | null };

/** Collects each test's final outcome and, with TEST_REPORT=1, sends the run to Test Results. */
export default class IcareReporter implements Reporter {
  private rows = new Map<string, Row>();

  onTestEnd(test: TestCase, result: TestResult) {
    const [, file, ...describe] = test.titlePath();
    const outcome = test.outcome();
    // Retries report more than once; the last result is the one that counts.
    this.rows.set(test.id, {
      suite: [file, ...describe.slice(0, -1)].filter(Boolean).join(' › '),
      name: test.title,
      status: outcome === 'skipped' ? 'skipped' : outcome === 'unexpected' ? 'failed' : 'passed',
      duration_ms: result.duration,
      error: result.error?.message?.replace(/\u001b\[[0-9;]*m/g, '').slice(0, 2000) ?? null,
    });
  }

  async onEnd(result: FullResult) {
    if (!reportEnabled) return;
    await reportRun('e2e', [...this.rows.values()], { duration_ms: result.duration, runner: 'Playwright' });
  }
}
