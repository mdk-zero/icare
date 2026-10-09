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

const easJson = JSON.parse(readFileSync(path.join(mobileDir, 'eas.json'), 'utf8'));
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

console.log(`Publishing to channel "${channel}" with ${Object.keys(env).join(', ')}`);
const result = spawnSync(
  'eas',
  ['update', '--channel', channel, '--environment', profile, '--message', message, '--non-interactive'],
  { cwd: mobileDir, stdio: 'inherit', env: { ...process.env, ...env } },
);
if (result.error) fail(`Could not run eas-cli: ${result.error.message}`);
process.exit(result.status ?? 1);
