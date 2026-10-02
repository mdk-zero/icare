"use client";

import { seed } from "./fixtures";
import { DEMO_STORE_KEY, isDemo } from "./session";

/**
 * The demo's database: the seeded fixtures, plus whatever the visitor has
 * changed since. Edits are mirrored to sessionStorage so a refresh keeps them;
 * logout (endDemo) deletes the copy, and the next demo seeds afresh.
 */

export type DemoDb = ReturnType<typeof seed>;

let db: DemoDb | null = null;

export function getStore(): DemoDb {
  if (db) return db;
  try {
    const saved = sessionStorage.getItem(DEMO_STORE_KEY);
    if (saved) {
      db = JSON.parse(saved) as DemoDb;
      return db;
    }
  } catch {
    // Unreadable copy: start over from the fixtures.
  }
  db = seed();
  return db;
}

let pending: ReturnType<typeof setTimeout> | null = null;

/**
 * Mirrors the store to sessionStorage, coalescing a burst of requests into
 * one write: a page load fires a dozen at once, and the copy is most of a
 * megabyte. Reads can write too (detected absences, report audit entries),
 * so the router calls this after every request.
 */
export function saveStore() {
  if (!db || pending) return;
  if (!listening) {
    listening = true;
    // A refresh inside the debounce window still keeps the last edit.
    window.addEventListener("pagehide", flush);
  }
  pending = setTimeout(flush, 100);
}

let listening = false;

function flush() {
  if (pending) clearTimeout(pending);
  pending = null;
  // Logout may have ended the demo since the save was queued; writing now
  // would bring its edits back into the next demo.
  if (!db || !isDemo()) return;
  try {
    sessionStorage.setItem(DEMO_STORE_KEY, JSON.stringify(db));
  } catch {
    // Storage full or blocked: edits still hold for this page's lifetime.
  }
}

let counter = 0;

/** A fresh id for a row the visitor creates. */
export function newId(): string {
  counter += 1;
  const stamp = Date.now().toString(16).padStart(12, "0").slice(-12);
  return `e${String(counter).padStart(7, "0")}-0000-4000-8000-${stamp}`;
}
