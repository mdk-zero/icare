/**
 * Runs a test command with TEST_REPORT=1, portably (Windows shells don't
 * take `VAR=1 cmd`). Used by the test:*:report npm scripts.
 */
import { spawnSync } from 'node:child_process';

const [command, ...args] = process.argv.slice(2);
const result = spawnSync(command, args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, TEST_REPORT: '1' },
});
process.exit(result.status ?? 1);
