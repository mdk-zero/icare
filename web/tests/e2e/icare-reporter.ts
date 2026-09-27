import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';
import { reportEnabled } from '../env.mjs';
import { startLiveRun } from '../report.mjs';

type Row = { suite: string; name: string; status: 'passed' | 'failed' | 'skipped'; duration_ms: number; error: string | null };
type LiveRun = Awaited<ReturnType<typeof startLiveRun>>;

/**
 * Collects each test's final outcome and, with TEST_REPORT=1, streams the run
 * to Test Results as tests finish.
 */
export default class IcareReporter implements Reporter {
  private rows = new Map<string, Row>();
  private live: Promise<LiveRun> | null = null;

  onBegin(_config: FullConfig, suite: Suite) {
    if (!reportEnabled) return;
    this.live = startLiveRun('e2e', { runner: 'Playwright', planned: suite.allTests().length });
  }

  async onTestEnd(test: TestCase, result: TestResult) {
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
    (await this.live)?.update([...this.rows.values()]);
  }

  async onEnd(result: FullResult) {
    const live = await this.live;
    await live?.finish([...this.rows.values()], {
      duration_ms: result.duration,
      interrupted: result.status === 'interrupted',
    });
  }
}
