"use client";

import { useEffect } from "react";
import { stickyToast, toast } from "./Toast";
import {
  getConnectivity,
  onConnectivityChange,
  startConnectivityWatch,
  type Connectivity,
} from "../lib/connectivity";

const MESSAGE: Record<Exclude<Connectivity, "online">, string> = {
  offline: "You're offline. Changes won't be saved until the connection is back.",
  unreachable: "Can't reach the server. Changes won't be saved until it's back.",
};

const RESTORED = "Connection restored. You're back online.";

/**
 * Tells the user when they lose or regain their connection to the server
 * (lib/connectivity decides which).
 *
 * Losing it puts up a toast that stays until the connection returns, since
 * anything saved meanwhile will fail; coming back replaces it with a short
 * "restored" one. Renders nothing itself. Mount it after ToastContainer so the
 * container is listening when a page opens already offline.
 */
export default function ConnectionStatus() {
  useEffect(() => {
    let down: ReturnType<typeof stickyToast> | null = null;

    const show = (next: Connectivity) => {
      if (next === "online") {
        if (down) down.replace(RESTORED, "success");
        else toast(RESTORED);
        down = null;
        return;
      }
      // Offline and unreachable swap in place rather than stacking.
      if (down) down.replace(MESSAGE[next], "error", 0);
      else down = stickyToast(MESSAGE[next], "error");
    };

    startConnectivityWatch();
    if (getConnectivity() !== "online") show(getConnectivity());
    return onConnectivityChange(show);
  }, []);

  return null;
}
