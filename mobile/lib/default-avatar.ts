/**
 * Illustrated stand-ins for people who haven't set a profile picture: Open
 * Peeps busts (CC0), pre-cropped with a tinted background baked in. Bundled
 * rather than fetched so they show offline.
 *
 * Mirror of web/app/lib/default-avatar.ts — same files, same order, same
 * hash — so a student sees the same face in the app as on the web. Keep the
 * two lists identical; any edit reshuffles who gets which.
 *
 * Nobody gets one while `sex` is unrecorded: the picture would be a guess,
 * the same reason the home greeting drops Mr./Ms. then.
 */

// Metro only bundles statically required assets, and hands each back as a
// numeric asset id that <Image source> accepts directly.
const MALE: number[] = [
  require('@/assets/images/default-avatars/male/peep-100.png'),
  require('@/assets/images/default-avatars/male/peep-103.png'),
  require('@/assets/images/default-avatars/male/peep-10.png'),
  require('@/assets/images/default-avatars/male/peep-17.png'),
  require('@/assets/images/default-avatars/male/peep-18.png'),
  require('@/assets/images/default-avatars/male/peep-19.png'),
  require('@/assets/images/default-avatars/male/peep-21.png'),
  require('@/assets/images/default-avatars/male/peep-28.png'),
  require('@/assets/images/default-avatars/male/peep-29.png'),
  require('@/assets/images/default-avatars/male/peep-32.png'),
  require('@/assets/images/default-avatars/male/peep-34.png'),
  require('@/assets/images/default-avatars/male/peep-39.png'),
  require('@/assets/images/default-avatars/male/peep-41.png'),
  require('@/assets/images/default-avatars/male/peep-42.png'),
  require('@/assets/images/default-avatars/male/peep-46.png'),
  require('@/assets/images/default-avatars/male/peep-49.png'),
  require('@/assets/images/default-avatars/male/peep-4.png'),
  require('@/assets/images/default-avatars/male/peep-51.png'),
  require('@/assets/images/default-avatars/male/peep-55.png'),
  require('@/assets/images/default-avatars/male/peep-59.png'),
  require('@/assets/images/default-avatars/male/peep-68.png'),
  require('@/assets/images/default-avatars/male/peep-74.png'),
  require('@/assets/images/default-avatars/male/peep-7.png'),
  require('@/assets/images/default-avatars/male/peep-79.png'),
  require('@/assets/images/default-avatars/male/peep-83.png'),
  require('@/assets/images/default-avatars/male/peep-85.png'),
  require('@/assets/images/default-avatars/male/peep-8.png'),
  require('@/assets/images/default-avatars/male/peep-91.png'),
  require('@/assets/images/default-avatars/male/peep-92.png'),
  require('@/assets/images/default-avatars/male/peep-94.png'),
  require('@/assets/images/default-avatars/male/peep-97.png'),
  require('@/assets/images/default-avatars/male/peep-99.png'),
  require('@/assets/images/default-avatars/male/peep-15.png'),
];

const FEMALE: number[] = [
  require('@/assets/images/default-avatars/female/peep-101.png'),
  require('@/assets/images/default-avatars/female/peep-102.png'),
  require('@/assets/images/default-avatars/female/peep-105.png'),
  require('@/assets/images/default-avatars/female/peep-11.png'),
  require('@/assets/images/default-avatars/female/peep-13.png'),
  require('@/assets/images/default-avatars/female/peep-22.png'),
  require('@/assets/images/default-avatars/female/peep-23.png'),
  require('@/assets/images/default-avatars/female/peep-30.png'),
  require('@/assets/images/default-avatars/female/peep-35.png'),
  require('@/assets/images/default-avatars/female/peep-38.png'),
  require('@/assets/images/default-avatars/female/peep-40.png'),
  require('@/assets/images/default-avatars/female/peep-48.png'),
  require('@/assets/images/default-avatars/female/peep-61.png'),
  require('@/assets/images/default-avatars/female/peep-63.png'),
  require('@/assets/images/default-avatars/female/peep-67.png'),
  require('@/assets/images/default-avatars/female/peep-78.png'),
  require('@/assets/images/default-avatars/female/peep-82.png'),
  require('@/assets/images/default-avatars/female/peep-87.png'),
  require('@/assets/images/default-avatars/female/peep-90.png'),
  require('@/assets/images/default-avatars/female/peep-96.png'),
];

/** 32-bit FNV-1a, identical to the web's so both pick the same picture. */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The user's bundled stand-in picture, or null when sex is unrecorded. */
export function defaultAvatarSource(
  userId: string | null | undefined,
  sex: 'male' | 'female' | null | undefined,
): number | null {
  if (!userId || (sex !== 'male' && sex !== 'female')) return null;
  const pool = sex === 'male' ? MALE : FEMALE;
  return pool[hash(userId) % pool.length];
}
