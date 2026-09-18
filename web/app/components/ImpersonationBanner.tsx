"use client";

import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUserSecret } from "@fortawesome/free-solid-svg-icons";
import { refreshCurrentUser } from "../lib/api";
import { clearRequestCache } from "../lib/request-cache";
import {
  decodeFlag,
  IMPERSONATION_FLAG_COOKIE,
  type ImpersonationFlag,
} from "../lib/dev/impersonation";
import { EcgLoader } from "./EcgLoader";

function readFlag(): ImpersonationFlag | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${IMPERSONATION_FLAG_COOKIE}=`));
  return decodeFlag(match?.slice(IMPERSONATION_FLAG_COOKIE.length + 1));
}

/**
 * Renders on every page of the app while a developer is signed in as someone
 * else, because forgetting is the whole risk: an impersonated session looks
 * exactly like a real one, and a stray edit lands on the target's account.
 *
 * It reads a non-httpOnly cookie rather than calling the session endpoint, so
 * it is on screen at first paint. The cookie names the target and the
 * developer; the token that grants the access stays httpOnly.
 */
export default function ImpersonationBanner() {
  const [flag, setFlag] = useState<ImpersonationFlag | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    // Cookies are unreadable during SSR, so this settles right after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFlag(readFlag());
  }, []);

  if (!flag) return null;

  const stop = async () => {
    setLeaving(true);
    try {
      await fetch("/api/dev/impersonate", { method: "DELETE", credentials: "include" });
      clearRequestCache();
      await refreshCurrentUser();
    } finally {
      // A full load, not a router push: every cached fetch, every piece of
      // component state and the mirrored localStorage user belong to the
      // account being left behind.
      window.location.assign("/developer");
    }
  };

  return (
    <div
      role="status"
      className="flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-1.5 text-center text-xs font-medium"
      style={{ background: "#7c2d12", color: "#fed7aa" }}
    >
      <FontAwesomeIcon icon={faUserSecret} className="h-3.5 w-3.5" />
      <span>
        Signed in as <strong className="font-semibold">{flag.name}</strong> ({flag.role})
        {flag.by && <> · impersonated by {flag.by}</>}
      </span>
      <button
        onClick={stop}
        disabled={leaving}
        className="inline-flex items-center gap-1.5 rounded-md bg-orange-100/15 px-2 py-0.5 font-semibold transition-colors hover:bg-orange-100/25 disabled:opacity-60"
      >
        {leaving && <EcgLoader size="xs" />}
        Return to yourself
      </button>
    </div>
  );
}
