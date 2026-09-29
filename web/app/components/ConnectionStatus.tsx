"use client";

import { useEffect } from "react";
import { stickyToast, toast } from "./Toast";

/**
 * Tells the user when the browser loses or regains its network connection.
 *
 * Going offline puts up a toast that stays until the connection returns, since
 * anything saved meanwhile will fail; coming back replaces it with a short
 * "restored" one. Renders nothing itself. Mount it after ToastContainer so the
 * container is listening when a page opens already offline.
 */
export default function ConnectionStatus() {
  useEffect(() => {
    let offline: ReturnType<typeof stickyToast> | null = null;

    const goOffline = () => {
      if (offline) return;
      offline = stickyToast("You're offline. Changes won't be saved until the connection is back.", "error");
    };
    const goOnline = () => {
      if (offline) offline.replace("Connection restored. You're back online.", "success");
      else toast("Connection restored. You're back online.");
      offline = null;
    };

    if (!navigator.onLine) goOffline();
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  return null;
}
