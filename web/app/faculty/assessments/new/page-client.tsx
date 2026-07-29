"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import { fetchSections, type Section } from "../../../lib/api";
import { toast } from "../../../components/Toast";

const inputClassName =
  "w-full px-4 py-3 bg-surface border border-gray-400 rounded-xl text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 focus:bg-surface transition-all text-sm shadow-sm";
const labelClassName = "block text-sm font-bold text-gray-800 mb-2";

const CATEGORIES = [
  "Cardiac Emergency",
  "Respiratory Emergency",
  "Neurological Emergency",
  "Trauma",
  "Medical-Surgical",
  "Patient Education",
  "Infection Management",
  "Critical Care",
  "Medication Safety",
  "General",
] as const;

type Difficulty = "beginner" | "intermediate" | "advanced";

export default function AssessmentNewClient() {
  const router = useRouter();
  const [sections, setSections] = useState<Section[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    difficulty: "beginner" as Difficulty,
    category: "General" as (typeof CATEGORIES)[number],
    time_limit_minutes: "",
    target_sections: [] as string[],
  });

  useEffect(() => {
    fetchSections().then(setSections);
  }, []);

  const handleCreate = async () => {
    if (!form.title.trim()) {
      setError("Title is required");
      return;
    }
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/faculty/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description,
          category: form.category,
          difficulty: form.difficulty,
          time_limit_seconds: form.time_limit_minutes
            ? Number(form.time_limit_minutes) * 60
            : null,
          target_sections:
            form.target_sections.length > 0 ? form.target_sections : null,
        }),
      });

      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        setError(j.error ?? "Failed to create assessment");
        setBusy(false);
        return;
      }

      const json = (await res.json()) as { assessment: { id: string } };
      toast("Assessment created");
      router.replace(`/faculty/assessments/${json.assessment.id}`);
    } catch {
      setError("Failed to create assessment");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="animate-rise relative overflow-hidden bg-surface rounded-2xl border border-hairline shadow-tile p-5 sm:p-6 mb-6">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: "radial-gradient(70% 130% at 100% 0%, rgb(27 107 123 / 0.07) 0%, transparent 70%)" }} />
        <span aria-hidden className="absolute left-0 top-0 h-full w-[3px] bg-gradient-to-b from-brand-400 via-brand-600 to-brand-800" />
        <div className="relative">
          <h1 className="font-display text-[32px] sm:text-[38px] font-bold leading-[1.08] tracking-[-0.02em] text-gray-900">
            New Assessment
          </h1>
          <p className="mt-2 text-sm text-gray-500">Create a new quiz and add questions</p>
        </div>
      </header>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] p-6 space-y-4">
        <div>
          <label className={labelClassName}>Title</label>
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="e.g. Vital Signs Fundamentals"
            className={inputClassName}
          />
        </div>
        <div>
          <label className={labelClassName}>Description</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={2}
            className={inputClassName}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClassName}>Difficulty</label>
            <select
              value={form.difficulty}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  difficulty: e.target.value as Difficulty,
                }))
              }
              className={inputClassName}
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>
          <div>
            <label className={labelClassName}>Category</label>
            <select
              value={form.category}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  category: e.target.value as (typeof CATEGORIES)[number],
                }))
              }
              className={inputClassName}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={labelClassName}>Time limit (minutes, optional)</label>
          <input
            type="number"
            min={1}
            value={form.time_limit_minutes}
            onChange={(e) =>
              setForm((f) => ({ ...f, time_limit_minutes: e.target.value }))
            }
            placeholder="No limit"
            className={inputClassName}
          />
        </div>
        <div>
          <label className={labelClassName}>Published to sections</label>
          {sections.length === 0 ? (
            <p className="text-sm text-gray-500">
              No sections exist yet — this assessment will be visible to all students.
            </p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {sections.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={form.target_sections.includes(s.name)}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        target_sections: e.target.checked
                          ? [...f.target_sections, s.name]
                          : f.target_sections.filter((x) => x !== s.name),
                      }))
                    }
                    className="w-4 h-4 accent-brand-600"
                  />
                  Section {s.name}
                </label>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-400 mt-1">
            Leave all unchecked to publish to all sections. You can change this later from the
            assessment&apos;s details.
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={() => router.push("/faculty/assessments")}
            className="px-5 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={busy}
            className="flex items-center gap-2 px-6 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? (
              <><FontAwesomeIcon icon={faSpinner} spin className="w-4 h-4" /> Creating…</>
            ) : (
              "Create Assessment"
            )}
          </button>
        </div>
      </div>

      <p className="text-sm text-gray-400 text-center">
        After creating, you&apos;ll be able to add questions, set up scoring criteria, and more.
      </p>
    </div>
  );
}
