/**
 * Reads a JMeter results file (CSV .jtl) from one of the plans here and prints
 * the figures of the manuscript's performance tables: response time per
 * interaction (1 user), scalability per user level, throughput per role,
 * reliability under sustained load, and capacity under realistic use.
 *
 *   node tests/load/summarize.mjs tests/load/results/<run>/results.jtl
 *
 * Throughput is requests over the span from the first request's start to the
 * last one's end; degradation compares each level's average with one user's.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** JMeter's CSV, quoted fields and all. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) rows.push([...row, field]);
  const [header, ...data] = rows;
  const whole = data.filter((r) => r.length === header.length);
  if (whole.length < data.length) console.warn(`Skipped ${data.length - whole.length} row(s) that don't match the header.`);
  return whole.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};
const f1 = (x) => x.toFixed(1);
const f2 = (x) => x.toFixed(2);
/** The p-th percentile, nearest rank. */
const pct = (xs, p) => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0;
};

/** "2 Scalability 30 users 2-17" → "2 Scalability 30 users". */
const groupOf = (threadName) => threadName.replace(/ \d+-\d+$/, '');

function span(samples) {
  const start = Math.min(...samples.map((s) => s.start));
  const end = Math.max(...samples.map((s) => s.start + s.elapsed));
  return (end - start) / 1000;
}

function table(title, head, rows) {
  console.log(`\n${title}`);
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(widths[i])).join('  ');
  console.log(line(head));
  for (const r of rows) console.log(line(r));
}

export function summarize(jtlPath) {
  const samples = parseCsv(readFileSync(jtlPath, 'utf8')).map((r) => ({
    label: r.label,
    group: groupOf(r.threadName),
    start: Number(r.timeStamp),
    elapsed: Number(r.elapsed),
    ok: r.success === 'true',
    code: r.responseCode,
  }));
  const inGroup = (prefix) => samples.filter((s) => s.group.startsWith(prefix));

  const timed = inGroup('1 ').filter((s) => !/^(Warm-up|Prepare)/.test(s.label));
  if (timed.length) {
    const labels = [...new Set(timed.map((s) => s.label))];
    const rows = labels.map((label) => {
      const xs = timed.filter((s) => s.label === label).map((s) => s.elapsed);
      return [label, xs.length, f1(avg(xs)), Math.min(...xs), Math.max(...xs)];
    });
    const all = timed.map((s) => s.elapsed);
    rows.push(['Overall', all.length, f1(avg(all)), Math.min(...all), Math.max(...all)]);
    table('Response time, 1 user (ms)', ['Interaction', 'Requests', 'Average', 'Minimum', 'Maximum'], rows);
    const failed = timed.filter((s) => !s.ok);
    if (failed.length) console.log(`  ${failed.length} failed: ${[...new Set(failed.map((s) => `${s.label} (${s.code})`))].join(', ')}`);
  }

  const levels = [...new Set(inGroup('2 ').map((s) => s.group))];
  if (levels.length) {
    let baseline = null;
    const rows = levels.map((group) => {
      const xs = samples.filter((s) => s.group === group);
      const users = Number(group.match(/(\d+) users?$/)?.[1] ?? 0);
      const times = xs.map((s) => s.elapsed);
      const mean = avg(times);
      baseline ??= mean;
      const errors = (100 * xs.filter((s) => !s.ok).length) / xs.length;
      return [
        users,
        xs.length,
        f1(mean),
        median(times),
        pct(times, 95),
        f2(xs.length / span(xs)),
        f2(errors),
        users === 1 ? 'Baseline' : f2((100 * (mean - baseline)) / baseline),
      ];
    });
    table('Scalability', ['Users', 'Requests', 'Avg (ms)', 'p50 (ms)', 'p95 (ms)', 'RPS', 'Errors (%)', 'Degradation (%)'], rows);
  }

  const roles = [...new Set(inGroup('3 ').map((s) => s.group))];
  if (roles.length) {
    let total = 0;
    let seconds = 0;
    const rows = roles.map((group) => {
      const xs = samples.filter((s) => s.group === group);
      const duration = span(xs);
      total += xs.length;
      seconds += duration;
      const failed = xs.filter((s) => !s.ok).length;
      return [group.replace(/^3 Throughput /, ''), xs.length, f1(duration), f2(xs.length / duration), failed, f1(avg(xs.map((s) => s.elapsed)))];
    });
    rows.push(['Overall', total, f1(seconds), f2(total / seconds), '', '']);
    table('Throughput, 30 users per role, no pauses', ['Scenario', 'Requests', 'Duration (s)', 'RPS', 'Failed', 'Avg (ms)'], rows);
  }

  const capacity = [...new Set(inGroup('5 ').map((s) => s.group))];
  if (capacity.length) {
    const rows = capacity.map((group) => {
      const xs = samples.filter((s) => s.group === group);
      const times = xs.map((s) => s.elapsed);
      const failed = xs.filter((s) => !s.ok);
      return [
        Number(group.match(/(\d+) users?$/)?.[1] ?? 0),
        xs.length,
        f1(avg(times)),
        median(times),
        pct(times, 95),
        f2(xs.length / span(xs)),
        f2((100 * failed.length) / xs.length),
      ];
    });
    table('Capacity, realistic use (5-15 s between requests)', ['Users', 'Requests', 'Avg (ms)', 'p50 (ms)', 'p95 (ms)', 'RPS', 'Errors (%)'], rows);
    const failed = inGroup('5 ').filter((s) => !s.ok);
    if (failed.length) console.log(`  failures by status: ${JSON.stringify(Object.groupBy(failed, (s) => s.code), (k, v) => (Array.isArray(v) ? v.length : v))}`);
  }

  const sustained = inGroup('4 ');
  if (sustained.length) {
    const duration = span(sustained);
    const failed = sustained.filter((s) => !s.ok);
    const start = Math.min(...sustained.map((s) => s.start));
    // The windows requests were sent in; a sliver after the last one started isn't one.
    const windows = Math.floor((Math.max(...sustained.map((s) => s.start)) - start) / 10_000) + 1;
    const up = new Set(sustained.filter((s) => s.ok).map((s) => Math.floor((s.start - start) / 10_000)));
    const users = Number(sustained[0].group.match(/(\d+) users/)?.[1] ?? 0);
    table('Reliability', ['Measurement', 'Result'], [
      ['Concurrent virtual users', users],
      ['Stress duration (s)', f1(duration)],
      ['Total requests', sustained.length],
      ['Failed requests', failed.length],
      ['Error rate (%)', f2((100 * failed.length) / sustained.length)],
      ['Uptime (10-s windows with a success)', `${f2((100 * up.size) / windows)}%`],
      ['Average response (ms)', f1(avg(sustained.map((s) => s.elapsed)))],
      ['Median response (ms)', median(sustained.map((s) => s.elapsed))],
    ]);
    if (failed.length) console.log(`  failures by status: ${JSON.stringify(Object.groupBy(failed, (s) => s.code), (k, v) => (Array.isArray(v) ? v.length : v))}`);
  }

  const signIns = samples.filter((s) => s.label === 'Sign-in' && !s.ok);
  if (signIns.length) console.log(`\n${signIns.length} sign-in(s) failed (${signIns.map((s) => s.code).join(', ')}): the requests after them ran signed out.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) {
    console.error('Usage: node tests/load/summarize.mjs <results.jtl>');
    process.exit(2);
  }
  summarize(process.argv[2]);
}
