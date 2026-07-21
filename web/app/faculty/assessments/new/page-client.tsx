"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import PageHeader from "../../../components/PageHeader";
import { fetchSections, type Section } from "../../../lib/api";

const inputClassName =
  "w-full px-4 py-3 bg-white border border-gray-400 rounded-xl text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#1B6B7B]/30 focus:border-[#1B6B7B] focus:bg-white transition-all text-sm shadow-sm";
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
      router.replace(`/faculty/assessments/${json.assessment.id}`);
    } catch {
      setError("Failed to create assessment");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push("/faculty/assessments")}
          className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
        >
          <FontAwesomeIcon icon={faArrowLeft} className="w-4 h-4" />
        </button>
        <PageHeader
          title="New Assessment"
          subtitle="Create a new quiz and add questions"
        />
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200/80 shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] p-6 space-y-4">
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
          <label className={labelClassName}>Visible to sections</label>
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
                    className="w-4 h-4 accent-[#1B6B7B]"
                  />
                  Section {s.name}
                </label>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-400 mt-1">
            Leave all unchecked to make visible to all sections.
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
            className="flex items-center gap-2 px-6 py-2 bg-[#1B6B7B] text-white rounded-lg text-sm hover:bg-[#155663] disabled:opacity-60"
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
