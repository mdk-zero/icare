"use client";

import { useCallback, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrash } from "@fortawesome/free-solid-svg-icons";
import { fetchScenarioSkillTasks, removeScenarioTask, type ScenarioSkillTask } from "../../../../lib/api";
import ConfirmModal, { type ConfirmConfig } from "../../../../components/ConfirmModal";
import { toast } from "../../../../components/Toast";

/**
 * The tasks a saved scenario already has, each marked with the Taylor's skill
 * it is. Removing one deletes every student's grades on it, so a graded task
 * asks first. New skills are added through the picker below it and saved with
 * the rest of the form.
 */
export default function ScenarioTasksPanel({
  scenarioId,
  onSkillsLoaded,
  reloadKey,
}: {
  scenarioId: string;
  /** The skills already present, so the picker can't add them twice. */
  onSkillsLoaded: (ids: string[]) => void;
  /** Bump to re-read after skills are added. */
  reloadKey: number;
}) {
  const [tasks, setTasks] = useState<ScenarioSkillTask[] | null>(null);
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null);

  const load = useCallback(async () => {
    const loaded = await fetchScenarioSkillTasks(scenarioId);
    setTasks(loaded ?? []);
    onSkillsLoaded((loaded ?? []).flatMap((t) => (t.skill_id ? [t.skill_id] : [])));
  }, [scenarioId, onSkillsLoaded]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, reloadKey]);

  const remove = async (task: ScenarioSkillTask) => {
    setConfirm((c) => (c ? { ...c, loading: true, error: null } : c));
    const ok = await removeScenarioTask(scenarioId, task.id);
    if (!ok) {
      setConfirm((c) => (c ? { ...c, loading: false, error: "Unable to remove the task." } : c));
      return;
    }
    setConfirm(null);
    toast("Task removed");
    void load();
  };

  const askRemove = (task: ScenarioSkillTask) =>
    setConfirm({
      title: "Remove this task?",
      message:
        task.graded > 0
          ? `“${task.title}” has grades for ${task.graded} student${task.graded === 1 ? "" : "s"}. Removing it deletes those grades and its checklist.`
          : `“${task.title}” and its checklist will be removed from the scenario.`,
      confirmLabel: "Remove task",
      onConfirm: () => void remove(task),
    });

  return (
    <div className="rounded-xl border border-hairline bg-surface p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      <p className="text-sm font-bold text-gray-800">Tasks</p>
      <p className="mt-0.5 text-xs text-gray-500">What students are graded on in this scenario, in order.</p>
      {tasks === null ? (
        <p className="mt-3 text-xs text-gray-500">Loading tasks…</p>
      ) : tasks.length === 0 ? (
        <p className="mt-3 text-xs text-gray-500">No tasks yet — add skills below.</p>
      ) : (
        <ol className="mt-3 divide-y divide-hairline rounded-lg border border-hairline">
          {tasks.map((t, i) => (
            <li key={t.id} className="flex items-center gap-2 px-3 py-2">
              <span className="w-5 shrink-0 font-mono text-xs text-gray-400">{i + 1}.</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-gray-800">{t.title}</p>
                <p className="text-[11px] text-gray-500">
                  {t.skill_id ? `Taylor's Skill ${t.skill_id}` : "General task"}
                  {t.graded > 0 && ` · graded for ${t.graded}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => askRemove(t)}
                aria-label={`Remove ${t.title}`}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-gray-400 hover:bg-rose-50 hover:text-rose-600"
              >
                <FontAwesomeIcon icon={faTrash} className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ol>
      )}
      {confirm && <ConfirmModal config={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}
