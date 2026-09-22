/**
 * Illustrated stand-ins for people who haven't set a profile picture: Open
 * Peeps busts (CC0) under public/default-avatars, pre-cropped to a square with
 * a tinted background baked in, since the line art is transparent inside and
 * would vanish on a dark surface.
 *
 * The pool is chosen by recorded sex and the picture within it by a hash of
 * the user id, so a person keeps the same one on every page. Nobody gets one
 * while `sex` is unrecorded — the picture would be a guess, the same reason
 * the dashboard greeting drops the honorific then — so those fall back to
 * initials.
 *
 * The mobile app ships the same files and hashes the same way
 * (mobile/lib/default-avatar.ts); keep the two lists identical, in the same
 * order, or a student sees one face in the app and another on the web. Any
 * edit to a list reshuffles who gets which.
 *
 * Curated from the male/female folders: dropped the ones that read as either
 * sex, the joke variants (extra eyes, fangs, eyepatches, knives), angry or sad
 * faces, and busts whose head crop duplicates another. peep-15 was filed under
 * female but has a moustache and goatee, so it is in the male pool.
 */

const MALE = [
  "peep-100", "peep-103", "peep-10", "peep-17", "peep-18", "peep-19", "peep-21",
  "peep-28", "peep-29", "peep-32", "peep-34", "peep-39", "peep-41", "peep-42",
  "peep-46", "peep-49", "peep-4", "peep-51", "peep-55", "peep-59", "peep-68",
  "peep-74", "peep-7", "peep-79", "peep-83", "peep-85", "peep-8", "peep-91",
  "peep-92", "peep-94", "peep-97", "peep-99", "peep-15",
];

const FEMALE = [
  "peep-101", "peep-102", "peep-105", "peep-11", "peep-13", "peep-22", "peep-23",
  "peep-30", "peep-35", "peep-38", "peep-40", "peep-48", "peep-61", "peep-63",
  "peep-67", "peep-78", "peep-82", "peep-87", "peep-90", "peep-96",
];

/** 32-bit FNV-1a: tiny, and spreads sequential UUIDs evenly across a pool. */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Public path of the user's stand-in picture, or null when sex is unrecorded. */
export function defaultAvatarSrc(
  userId: string | null | undefined,
  sex: "male" | "female" | null | undefined,
): string | null {
  if (!userId || (sex !== "male" && sex !== "female")) return null;
  const pool = sex === "male" ? MALE : FEMALE;
  return `/default-avatars/${sex}/${pool[hash(userId) % pool.length]}.png`;
}
