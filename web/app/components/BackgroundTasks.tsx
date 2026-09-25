"use client";

import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronDown,
  faChevronUp,
  faXmark,
  faCircleCheck,
  faCircleXmark,
  faTriangleExclamation,
  faClock,
} from "@fortawesome/free-solid-svg-icons";
import { EcgLoader } from "./EcgLoader";
import {
  dismissTask,
  isAnyTaskRunning,
  useBackgroundTasks,
  type BackgroundTask,
  type TaskItem,
} from "../lib/background-tasks";

/**
 * A tray in the bottom-right corner for jobs that run in the background, like
 * an upload panel: overall progress on top, each item's status in a list you
 * can collapse, and the page stays usable underneath.
 */
export default function BackgroundTasks() {
  const tasks = useBackgroundTasks();

  // Leaving the page would stop a job halfway, so the browser asks first.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (!isAnyTaskRunning()) return;
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  if (tasks.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[90] flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-3">
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} />
      ))}
    </div>
  );
}

function TaskCard({ task }: { task: BackgroundTask }) {
  const [open, setOpen] = useState(true);
  const total = task.items.length;
  const settled = task.items.filter((i) => i.status !== "waiting" && i.status !== "working").length;
  const failed = task.items.filter((i) => i.status === "failed").length;
  const running = task.state === "running";
  const fraction = total > 0 ? settled / total : 1;

  return (
    <section className="overflow-hidden rounded-xl border border-hairline bg-surface shadow-overlay">
      <header className="flex items-center gap-2 bg-brand-600 px-4 py-3 text-white">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">
          {running ? task.title : task.summary ?? task.title}
        </p>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Collapse" : "Expand"}
          className="rounded-md p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
        >
          <FontAwesomeIcon icon={open ? faChevronDown : faChevronUp} className="h-3.5 w-3.5" />
        </button>
        {!running && (
          <button
            onClick={() => dismissTask(task.id)}
            aria-label="Close"
            className="rounded-md p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
          >
            <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
          </button>
        )}
      </header>

      <div className="border-b border-hairline px-4 py-3">
        <div className="mb-1.5 flex items-center justify-between gap-3 text-xs text-gray-500">
          <span className="truncate">
            {running ? task.phase ?? `${settled} of ${total} done` : `${settled - failed} of ${total} done`}
          </span>
          {failed > 0 && <span className="shrink-0 font-medium text-rose-600">{failed} failed</span>}
        </div>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-gray-100"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(fraction * 100)}
        >
          <div
            className={`h-full rounded-full transition-[width] duration-300 ease-out ${
              !running && failed > 0 ? "bg-amber-500" : "bg-brand-600"
            }`}
            style={{ width: `${fraction * 100}%` }}
          />
        </div>
      </div>

      {open && (
        <ul className="max-h-72 divide-y divide-hairline overflow-y-auto">
          {task.items.map((item) => (
            <ItemRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ItemRow({ item }: { item: TaskItem }) {
  return (
    <li className="flex items-start gap-3 px-4 py-2.5">
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
        {item.status === "working" && <EcgLoader size="xs" className="text-brand-600" />}
        {item.status === "waiting" && <FontAwesomeIcon icon={faClock} className="h-3.5 w-3.5 text-gray-300" />}
        {item.status === "done" && <FontAwesomeIcon icon={faCircleCheck} className="h-4 w-4 text-emerald-600" />}
        {item.status === "warning" && (
          <FontAwesomeIcon icon={faTriangleExclamation} className="h-3.5 w-3.5 text-amber-600" />
        )}
        {item.status === "failed" && <FontAwesomeIcon icon={faCircleXmark} className="h-4 w-4 text-rose-600" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm ${item.status === "waiting" ? "text-gray-400" : "text-gray-800"}`}>
          {item.label}
        </p>
        {item.message && item.status !== "done" && (
          <p className={`text-xs ${item.status === "failed" ? "text-rose-600" : "text-amber-700"}`}>
            {item.message}
          </p>
        )}
        {item.secret && item.status === "warning" && (
          <p className="mt-1 text-xs text-gray-500">
            Temporary password{" "}
            <code className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-mono text-amber-800">
              {item.secret}
            </code>
          </p>
        )}
      </div>
    </li>
  );
}
