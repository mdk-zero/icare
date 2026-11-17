/**
 * Runs one of the JMeter plans here against TEST_BASE_URL, signed in as the
 * student, Instructor and Dean test accounts from web/.env.test, then prints
 * the figures the manuscript reports (see summarize.mjs).
 *
 *   JMETER_HOME=/path/to/apache-jmeter-5.6.3 npm run test:load:live -- performance
 *   JMETER_HOME=/path/to/apache-jmeter-5.6.3 npm run test:load:live -- capacity
 *   JMETER_HOME=/path/to/apache-jmeter-5.6.3 npm run test:load:live -- reliability
 *
 * JMeter needs Java 17 or newer on the PATH or in JAVA_HOME. The passwords
 * reach JMeter in a properties file only you can read, deleted when the run
 * ends. Each run writes tests/load/results/<plan>-<time>/ (gitignored):
 * results.jtl, jmeter.log and JMeter's HTML report.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { accounts, baseUrl } from '../env.mjs';
import { summarize } from './summarize.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const PLANS = {
  suite: 'icare-suite.jmx',
  performance: 'icare-performance.jmx',
  throughput: 'icare-throughput.jmx',
  capacity: 'icare-capacity.jmx',
  reliability: 'icare-reliability.jmx',
};
/** The plans' role names, and the .env.test account each signs in as. */
const ROLES = { student: 'student', instructor: 'faculty', dean: 'admin' };

const planName = process.argv[2];
if (!PLANS[planName]) {
  console.error('Usage: node tests/load/run.mjs performance|throughput|capacity|reliability');
  process.exit(2);
}
const home = process.env.JMETER_HOME;
if (!home) {
  console.error('Set JMETER_HOME to an Apache JMeter 5.6.3 folder.');
  process.exit(2);
}
const missing = Object.entries(ROLES).filter(([, role]) => !accounts[role]).map(([name]) => name);
if (missing.length) {
  console.error(`web/.env.test needs the ${missing.join(', ')} account(s).`);
  process.exit(2);
}

/** A value as a Java properties file reads it back: backslashes escaped, anything past ASCII as \uXXXX. */
const propValue = (value) =>
  value.replace(/\\/g, '\\\\').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

const target = new URL(baseUrl);
const lines = [`host=${target.hostname}`, `port=${target.port}`, `protocol=${target.protocol.replace(':', '')}`];
for (const [name, role] of Object.entries(ROLES)) {
  lines.push(`${name}_email=${propValue(accounts[role].email)}`, `${name}_password=${propValue(accounts[role].password)}`);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const out = join(here, 'results', `${planName}-${stamp}`);
mkdirSync(out, { recursive: true });
const secrets = mkdtempSync(join(tmpdir(), 'icare-load-'));
const propsFile = join(secrets, 'accounts.properties');
writeFileSync(propsFile, `${lines.join('\n')}\n`, { mode: 0o600 });

console.log(`Running ${PLANS[planName]} against ${target.origin}; results in ${out}`);
let status;
try {
  const result = spawnSync(
    join(home, 'bin', process.platform === 'win32' ? 'jmeter.bat' : 'jmeter'),
    ['-n', '-t', join(here, PLANS[planName]), '-q', propsFile, '-l', join(out, 'results.jtl'), '-j', join(out, 'jmeter.log'), '-e', '-o', join(out, 'report')],
    { stdio: 'inherit' },
  );
  status = result.status ?? 1;
} finally {
  rmSync(secrets, { recursive: true, force: true });
}
if (status !== 0) process.exit(status);
summarize(join(out, 'results.jtl'));
