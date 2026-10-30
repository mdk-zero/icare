#!/usr/bin/env node
/**
 * Publishes an over-the-air update (EAS Update) to the APKs students have
 * installed. Always use this instead of running `eas update` directly.
 *
 *   npm run publish-update -- "Fix the quiz timer"
 *   npm run publish-update -- "Try the new library screen" --profile preview
 *
 * Why the wrapper: `eas update` never reads the `env` block of eas.json, which
 * is where this project keeps its EXPO_PUBLIC_* values (there are no EAS
 * server-side variables). Run bare, it ships a bundle with no API URL. Every
 * phone would then call the emulator default http://10.0.2.2:3000. Running
 * without --environment is worse: .env.local's
 * dev values get bundled. This script feeds the update the same values
 * `eas build` used for that profile. `--environment` makes eas-cli set
 * EXPO_NO_DOTENV, so .env.local never gets bundled.
 *
 * The update is bundled from the files on disk, so it refuses to run while
 * mobile/ has uncommitted changes: what ships is exactly what's committed.
 *
 * It only reaches APKs whose native code matches (runtimeVersion uses the
 * "fingerprint" policy). A change to native code needs a new APK build;
 * students who keep the old APK simply don't get the update.
 *
 * The fingerprint is taken from node_modules, not package.json, so the script
 * also refuses to run when node_modules doesn't match package-lock.json. On
 * 2026-10-30 an update was published after pulling the SDK 58 upgrade without
 * `npm ci`: the SDK 57 node_modules gave it the old APKs' runtime version, and
 * its SDK 58 code crashed those APKs on every tab switch.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

const args = process.argv.slice(2);
let profile = 'production';
const profileFlag = args.indexOf('--profile');
if (profileFlag !== -1) {
  profile = args[profileFlag + 1];
  args.splice(profileFlag, 2);
}
const message = args.join(' ').trim();
if (!message) {
  fail('Describe the update: npm run publish-update -- "Fix the quiz timer"');
}

const dirty = execFileSync('git', ['status', '--porcelain', '--', '.'], {
  cwd: mobileDir,
  encoding: 'utf8',
}).trim();
if (dirty) {
  fail(
    `mobile/ has uncommitted changes, and they would ship in the update:\n${dirty}\n` +
      'Commit or stash them first.',
  );
}

const readJson = (file) => JSON.parse(readFileSync(path.join(mobileDir, file), 'utf8'));
const pkg = readJson('package.json');
const lock = readJson('package-lock.json');
const stale = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).flatMap((name) => {
  const locked = lock.packages?.[`node_modules/${name}`]?.version;
  let installed = 'missing';
  try {
    installed = readJson(`node_modules/${name}/package.json`).version;
  } catch {}
  return locked && installed !== locked ? [`${name}: installed ${installed}, lockfile ${locked}`] : [];
});
if (stale.length) {
  fail(
    `node_modules doesn't match package-lock.json:\n  ${stale.join('\n  ')}\n` +
      'The update would get the runtime version of the installed packages and reach APKs\n' +
      'its code was not written for. Run `npm ci` in mobile/ first.',
  );
}

const easJson = readJson('eas.json');
function profileEnv(name, seen = new Set()) {
  const build = easJson.build?.[name];
  if (!build) fail(`eas.json has no build profile named "${name}".`);
  if (seen.has(name)) fail(`eas.json build profile "${name}" extends itself.`);
  seen.add(name);
  const inherited = build.extends ? profileEnv(build.extends, seen) : {};
  return { ...inherited, ...build.env };
}
const env = profileEnv(profile);
const channel = easJson.build[profile].channel;
if (!channel) fail(`eas.json build profile "${profile}" has no "channel", so no APK listens for it.`);
if (!env.EXPO_PUBLIC_API_URL) {
  fail(`eas.json build profile "${profile}" has no EXPO_PUBLIC_API_URL in its env.`);
}

// eas-cli isn't a project dependency. A globally installed one is used when
// there is one (there wasn't on 2026-10-23); otherwise npx fetches it.
function runEas(easArgs) {
  const options = { cwd: mobileDir, stdio: 'inherit', env: { ...process.env, ...env } };
  const installed = spawnSync('eas', easArgs, options);
  if (installed.error?.code !== 'ENOENT') return installed;
  console.log('eas-cli is not installed globally, so it runs through npx.');
  return spawnSync('npx', ['--yes', 'eas-cli@latest', ...easArgs], options);
}

console.log(`Publishing to channel "${channel}" with ${Object.keys(env).join(', ')}`);
const result = runEas([
  'update',
  '--channel',
  channel,
  '--environment',
  profile,
  '--message',
  message,
  '--non-interactive',
]);
if (result.error) fail(`Could not run eas-cli: ${result.error.message}`);
process.exit(result.status ?? 1);
