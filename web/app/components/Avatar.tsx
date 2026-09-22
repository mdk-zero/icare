"use client";

import { useEffect, useState } from "react";
import { getDisplayAvatarUrl } from "../lib/api";
import { defaultAvatarSrc } from "../lib/default-avatar";

/**
 * Person avatar: their uploaded/Google picture when there is one, otherwise
 * an illustrated stand-in matching their sex, otherwise their initials.
 * Replaces seven hand-rolled copies that each did
 * `name.split(' ').map(n => n[0]).join('')` — which turns "Linux Mandrake S.
 * Adona" into "LMSA" — and none of which ever showed the picture.
 */

const SIZES = {
  xs: { box: "w-7 h-7", text: "text-[10px]" },
  sm: { box: "w-8 h-8", text: "text-xs" },
  md: { box: "w-10 h-10", text: "text-sm" },
  lg: { box: "w-12 h-12", text: "text-base" },
  xl: { box: "w-16 h-16", text: "text-xl" },
} as const;

export type AvatarSize = keyof typeof SIZES;

/**
 * First letter of the first name plus first letter of the last — never more
 * than two. Middle names and initials like "S." are skipped, and a name with
 * no letters at all falls back to "?".
 */
export function initials(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  if (words.length === 0) return "?";
  const letterOf = (word: string) => word.match(/[\p{L}\p{N}]/u)?.[0] ?? "";
  const first = letterOf(words[0]);
  const last = words.length > 1 ? letterOf(words[words.length - 1]) : "";
  return (first + last).toUpperCase() || "?";
}

export default function Avatar({
  name,
  src,
  userId,
  sex,
  size = "md",
  className = "",
  tone = "brand",
}: {
  name: string | null | undefined;
  src?: string | null;
  /** With `sex`, picks the stand-in illustration shown when there is no photo. */
  userId?: string | null;
  sex?: "male" | "female" | null;
  size?: AvatarSize;
  className?: string;
  /** `solid` for profile headers, `risk` to flag an at-risk student. */
  tone?: "brand" | "solid" | "risk";
}) {
  // A stale Google or storage URL would otherwise render as a broken image.
  const [failed, setFailed] = useState(false);
  const [fallbackFailed, setFallbackFailed] = useState(false);

  // Uploaded avatars are stored as a bucket path ("avatars/<uid>/<file>"),
  // which only becomes loadable after it is exchanged for a signed URL;
  // Google pictures are already absolute and go straight through.
  const isStoragePath = Boolean(src?.startsWith("avatars/"));
  const [signed, setSigned] = useState<{ path: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!isStoragePath || !src) return;
    let cancelled = false;
    void (async () => {
      const url = await getDisplayAvatarUrl(src);
      if (!cancelled) setSigned({ path: src, url });
    })();
    return () => {
      cancelled = true;
    };
  }, [src, isStoragePath]);

  // Until signing settles it is unknown whether a photo exists, so neither
  // the stand-in nor the initials are drawn — either would flash and swap.
  const signing = isStoragePath && signed?.path !== src;
  const photo = failed ? null : isStoragePath ? (signed?.url ?? null) : src;
  const fallback = fallbackFailed ? null : defaultAvatarSrc(userId, sex);
  const resolved = signing ? null : photo || fallback;
  const { box, text } = SIZES[size];
  const showImage = Boolean(resolved);
  const onImageError = () => (resolved === photo ? setFailed(true) : setFallbackFailed(true));

  const TONES = {
    solid: "bg-gradient-to-br from-brand-600 to-brand-700 text-white",
    risk: "bg-rose-50 text-rose-600",
    brand: "bg-brand-600/10 text-brand-600",
  };
  const fallbackTone = TONES[tone];

  return (
    <span
      className={`${box} shrink-0 overflow-hidden rounded-full flex items-center justify-center ${
        showImage || signing ? "bg-subtle" : fallbackTone
      } ${className}`}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolved as string}
          alt=""
          className="w-full h-full object-cover"
          // A server-rendered image that failed before hydration never fires
          // onError, so check for one that has already given up.
          ref={(img) => {
            if (img?.complete && img.naturalWidth === 0) onImageError();
          }}
          onError={onImageError}
          referrerPolicy="no-referrer"
        />
      ) : signing ? null : (
        <span className={`${text} font-semibold leading-none`}>{initials(name)}</span>
      )}
    </span>
  );
}
