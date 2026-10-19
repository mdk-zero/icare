"use client";

import { useEffect } from "react";
import { resumeTabPresence } from "../lib/tab-presence";

/**
 * On every page, so a tab that was inside a session keeps it across a reload,
 * public pages included (lib/tab-presence). Renders nothing.
 */
export default function TabPresence() {
  useEffect(() => resumeTabPresence(), []);
  return null;
}
