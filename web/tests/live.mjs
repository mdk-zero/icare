/**
 * Runs a test command against the live site instead of TEST_BASE_URL, portably
 * (Windows shells don't take `VAR=1 cmd`). Used by the test:*:live npm scripts.
 * The suites change no data, so this is safe; see tests/README.md.
 */
import { spawnSync } from 'node:child_process';

const LIVE_URL = 'https://www.i-care.dev';

const [command, ...args] = process.argv.slice(2);
const result = spawnSync(command, args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, TEST_BASE_URL: LIVE_URL },
});
process.exit(result.status ?? 1);
