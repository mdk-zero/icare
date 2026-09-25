"use client";

import { useSyncExternalStore } from "react";

/**
 * Long jobs (a bulk enrollment, say) that keep running after the dialog that
 * started them closes. They live at module level, outside any component, so
 * moving around the app doesn't stop them; the BackgroundTasks panel shows
 * their progress wherever you are, like an upload tray.
 */

export type TaskItemStatus = "waiting" | "working" | "done" | "warning" | "failed";

export interface TaskItem {
  id: string;
  label: string;
  status: TaskItemStatus;
  /** Why it failed, or what to follow up on. */
  message?: string;
  /** A temporary password to hand over when the invitation email didn't go out. */
  secret?: string;
}

export interface BackgroundTask {
  id: number;
  title: string;
  items: TaskItem[];
  state: "running" | "finished";
  /** One line on how it went, set when it finishes. */
  summary?: string;
  /** Extra step after the items, e.g. "Putting students into groups…". */
  phase?: string;
}

let tasks: BackgroundTask[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const EMPTY: BackgroundTask[] = [];

export function useBackgroundTasks(): BackgroundTask[] {
  return useSyncExternalStore(subscribe, () => tasks, () => EMPTY);
}

export function isAnyTaskRunning(): boolean {
  return tasks.some((t) => t.state === "running");
}

function patch(id: number, change: (task: BackgroundTask) => BackgroundTask) {
  tasks = tasks.map((t) => (t.id === id ? change(t) : t));
  emit();
}

/** Starts tracking a job; returns the handles the job reports progress through. */
export function startTask(title: string, items: { id: string; label: string }[]) {
  const id = nextId++;
  tasks = [...tasks, { id, title, state: "running", items: items.map((i) => ({ ...i, status: "waiting" })) }];
  emit();
  return {
    item: (itemId: string, change: Partial<Omit<TaskItem, "id" | "label">>) =>
      patch(id, (t) => ({ ...t, items: t.items.map((i) => (i.id === itemId ? { ...i, ...change } : i)) })),
    phase: (text: string | undefined) => patch(id, (t) => ({ ...t, phase: text })),
    finish: (summary: string) => patch(id, (t) => ({ ...t, state: "finished", phase: undefined, summary })),
  };
}

export function dismissTask(id: number) {
  tasks = tasks.filter((t) => t.id !== id);
  emit();
}
