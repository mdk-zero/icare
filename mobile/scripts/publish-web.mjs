#!/usr/bin/env node
/**
 * Builds the student web app (this app, for browsers) into
 * web/public/student, where the web portal serves it at /student. It's a
 * backup for students who can't install the app; an Admin turns it on and
 * off in the Admin portal (Student Web App), and it stays off until they do.
 * See web/app/lib/student-web.ts.
 *
 *   node scripts/publish-web.mjs
 *   node scripts/publish-web.mjs --allow-dirty   (to try uncommitted changes locally)
 *
 * Not an npm script on purpose: package.json's scripts are part of the OTA
 * runtime fingerprint, and adding one would cut every installed APK off from
 * updates until the next native build.
 *
 * Then commit web/public/student and push: the portal's next deployment
 * serves it. Publishing again replaces the whole folder.
 *
 * Like publish-update, it refuses to run while mobile/ has uncommitted
 * changes, so what students get is exactly what's committed. Unlike an OTA
 * update it reaches every student at once, with no runtime to match.
 *
 * How it differs from the app's own build:
 * - ICARE_STUDENT_WEB=1 makes app.config.ts build one page for every route
 *   (output "single") under the /student base path. app.json is untouched, so
 *   native builds and the OTA runtime fingerprint never change.
 * - EXPO_NO_DOTENV keeps .env.local out, and no EXPO_PUBLIC_API_URL is set:
 *   on the web the app calls the API on the site that serves it
 *   (lib/client.ts), so it also works on preview deployments.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoDir = path.resolve(mobileDir, '..');
const outDir = path.join(mobileDir, 'web-build');
const target = path.join(repoDir, 'web', 'public', 'student');

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

const allowDirty = process.argv.includes('--allow-dirty');
const git = (args, cwd = mobileDir) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const dirty = git(['status', '--porcelain', '--', '.']);
if (dirty && !allowDirty) {
  fail(
    `mobile/ has uncommitted changes, and they would be published:\n${dirty}\n` +
      'Commit or stash them first (or pass --allow-dirty to try them locally).',
  );
}

const env = { ...process.env, ICARE_STUDENT_WEB: '1', EXPO_NO_DOTENV: '1', NODE_ENV: 'production' };
delete env.EXPO_PUBLIC_API_URL;

console.log('Building the student web app…');
rmSync(outDir, { recursive: true, force: true });
// On Windows npx is npx.cmd, which only runs through a shell.
const result = spawnSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'web-build', '--clear'], {
  cwd: mobileDir,
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32',
});
if (result.error) fail(`Could not run expo export: ${result.error.message}`);
if (result.status !== 0) fail('expo export failed; nothing was published.');
if (!existsSync(path.join(outDir, 'index.html'))) fail('expo export left no index.html; nothing was published.');

// Expo files the fonts and images that packages ship under
// assets/node_modules/. The repo's .gitignore drops every node_modules
// folder, so those would never be committed, and hosts skip them too. They
// move to assets/pkg/, and the bundles' paths to them (plain strings) follow.
const vendored = path.join(outDir, 'assets', 'node_modules');
if (existsSync(vendored)) {
  renameSync(vendored, path.join(outDir, 'assets', 'pkg'));
  const rewrite = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) rewrite(file);
      else if (/\.(js|html|css|json)$/.test(entry.name)) {
        const text = readFileSync(file, 'utf8');
        if (text.includes('/assets/node_modules/')) {
          writeFileSync(file, text.replaceAll('/assets/node_modules/', '/assets/pkg/'));
        }
      }
    }
  };
  rewrite(outDir);
}
// grep exits 1 when nothing matches, which is the good outcome here.
const leftover = spawnSync('grep', ['-rl', 'node_modules', outDir], { encoding: 'utf8' }).stdout.trim();
if (leftover) fail(`These files still point into node_modules, which won't be deployed:\n${leftover}`);

// Which code this is, for the Admin page and anyone wondering what's live.
const commit = git(['log', '-1', '--format=%H', '--', '.']);
writeFileSync(
  path.join(outDir, 'version.json'),
  `${JSON.stringify({ commit, dirty: Boolean(dirty), published_at: new Date().toISOString() }, null, 2)}\n`,
);

rmSync(target, { recursive: true, force: true });
mkdirSync(path.dirname(target), { recursive: true });
cpSync(outDir, target, { recursive: true });
rmSync(outDir, { recursive: true, force: true });

console.log(
  `\n✔ Published to web/public/student (mobile/ at ${commit.slice(0, 7)}${dirty ? ', with uncommitted changes' : ''}).\n` +
    '  Commit web/public/student and push; the next web deployment serves it at /student.\n' +
    '  Students can only sign in there while the Admin portal has Student Web App turned on.\n',
);
