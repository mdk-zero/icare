"use client";

import { useState, type SelectHTMLAttributes } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faListCheck, faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { apiFetch } from "../../../lib/api";
import { toast } from "../../../components/Toast";
import { EcgLoader } from "../../../components/EcgLoader";
import PageHeader from "../../../components/PageHeader";

const inputClassName =
  "w-full px-4 py-3 bg-surface border border-gray-400 rounded-xl text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 focus:bg-surface transition-all text-sm shadow-sm";
const labelClassName = "block text-sm font-bold text-gray-800 mb-2";

/** A native `<select>` with its own chevron pulled in from the edge, rather
 * than the browser's default arrow flush against the border. */
function SelectField({
  className = "",
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select {...props} className={`${inputClassName} appearance-none pr-9 ${className}`} />
      <FontAwesomeIcon
        icon={faChevronDown}
        className="pointer-events-none absolute right-3.5 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-500"
      />
    </div>
  );
}

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    difficulty: "beginner" as Difficulty,
    category: "General" as (typeof CATEGORIES)[number],
    time_limit_minutes: "",
  });

  const handleCreate = async () => {
    if (!form.title.trim()) {
      setError("Title is required");
      return;
    }
    setBusy(true);
    setError(null);

    try {
      const res = await apiFetch("/api/faculty/assessments", {
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
      <PageHeader
        badge={{
          icon: <FontAwesomeIcon icon={faListCheck} className="h-4 w-4" />,
          label: "Assessments",
        }}
        title="New Assessment"
        subtitle="Create a new quiz and add questions"
      />

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
            <SelectField
              value={form.difficulty}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  difficulty: e.target.value as Difficulty,
                }))
              }
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </SelectField>
          </div>
          <div>
            <label className={labelClassName}>Category</label>
            <SelectField
              value={form.category}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  category: e.target.value as (typeof CATEGORIES)[number],
                }))
              }
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </SelectField>
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
              <><EcgLoader /> Creating…</>
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
