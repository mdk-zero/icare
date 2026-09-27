"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faFilePdf, faLock, faUserShield } from "@fortawesome/free-solid-svg-icons";
import { SkeletonTable } from "../../../../components/skeletons";
import { toast } from "../../../../components/Toast";
import { usePageData } from "../../../../lib/use-page-data";
import { fetchCaseSubmission, gradeCaseSubmission, type CaseSubmission } from "../../../../lib/api";
import { allCriteriaRated, caseScore } from "../../../../lib/case-rubric";
import { MAX_REMARKS_LENGTH, TASK_RATINGS, scoreDescriptor, type TaskRating } from "../../../../lib/task-ratings";
import { RATING_STYLE } from "../../../scenarios/review/grading";
import { CaseStatusBadge, formatDue } from "../../case-ui";

const formatWhen = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

export default function CaseGradingClient({ submissionId }: { submissionId: string }) {
  const { data, loading, refresh } = usePageData(`faculty:case-submission:${submissionId}`, async () => {
    const res = await fetchCaseSubmission(submissionId);
    return { grading: res.data ?? null, error: res.error ?? null };
  });
  const grading = data?.grading ?? null;

  const [ratings, setRatings] = useState<Map<string, TaskRating>>(new Map());
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"save" | "finalize" | null>(null);

  // Seed the form from what is saved whenever a fresh copy arrives.
  useEffect(() => {
    if (!grading) return;
    setRatings(new Map(grading.ratings.map((r) => [r.criterion, r.rating])));
    setNotes(Object.fromEntries(grading.ratings.map((r) => [r.criterion, r.remarks])));
    setRemarks(grading.submission.remarks ?? "");
    setDirty(false);
  }, [grading]);

  const score = useMemo(() => caseScore(ratings), [ratings]);
  const complete = allCriteriaRated(ratings);
  const graded = grading?.submission.status === "graded";

  const rate = (key: string, rating: TaskRating) => {
    setRatings((prev) => {
      const next = new Map(prev);
      if (next.get(key) === rating) next.delete(key);
      else next.set(key, rating);
      return next;
    });
    setDirty(true);
  };

  const save = async (finalize: boolean) => {
    if (!grading) return;
    setBusy(finalize ? "finalize" : "save");
    const body = {
      ratings: Object.fromEntries(grading.criteria.map((c) => [c.key, ratings.get(c.key) ?? null])),
      rating_remarks: Object.fromEntries(grading.criteria.filter((c) => ratings.has(c.key)).map((c) => [c.key, notes[c.key] ?? ""])),
      remarks,
      finalize,
    };
    const res = await gradeCaseSubmission(submissionId, body);
    setBusy(null);
    if (res.error !== undefined) return toast(res.error);
    toast(finalize ? `Graded · ${res.data.score}%` : "Saved");
    refresh();
  };

  if (!loading && !grading) {
    return (
      <div className="space-y-4">
        <Link href="/faculty/cases" className="inline-flex items-center gap-2 text-sm text-brand-600 hover:text-brand-700">
          <FontAwesomeIcon icon={faArrowLeft} className="w-3.5 h-3.5" /> Case Presentations
        </Link>
        <div className="bg-surface p-12 rounded-xl border border-hairline shadow-tile text-center text-gray-500">
          {data?.error ?? "Case not found."}
        </div>
      </div>
    );
  }

  if (loading || !grading) return <SkeletonTable rows={8} cols={3} />;

  const { submission: s, presentation, student } = grading;

  return (
    <div className="space-y-4">
      <Link
        href={`/faculty/cases/${s.presentation_id}`}
        className="inline-flex items-center gap-2 text-sm text-brand-600 hover:text-brand-700"
      >
        <FontAwesomeIcon icon={faArrowLeft} className="w-3.5 h-3.5" /> {presentation?.title ?? "Case presentation"}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{student?.name ?? "Student"}</h1>
          <p className="text-sm text-gray-500">
            Handed in {formatWhen(s.submitted_at)} · due {formatDue(presentation?.deadline ?? null)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CaseStatusBadge status={s.status} late={s.late} />
          {graded && (
            <a
              href={`/api/faculty/reports/case?id=${s.id}&format=pdf`}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm"
            >
              <FontAwesomeIcon icon={faFilePdf} className="w-3.5 h-3.5" /> Download PDF
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] gap-4 items-start">
        <CaseView submission={s} />

        <section className="bg-surface rounded-xl border border-hairline shadow-tile p-4 space-y-4 xl:sticky xl:top-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold text-gray-900">Rubric</h2>
            <span className="text-sm tabular-nums text-gray-700 text-right">
              {graded ? "Final" : "Projected"}: <strong>{score}%</strong> · {scoreDescriptor(score)}
              {/* Unrated criteria count as zero, so say how far along the projection is. */}
              {!graded && !complete && (
                <span className="block text-xs text-gray-500">
                  {ratings.size} of {grading.criteria.length} rated
                </span>
              )}
            </span>
          </div>

          {grading.criteria.map((c) => {
            const current = ratings.get(c.key);
            return (
              <div key={c.key} className="space-y-2 border-t border-hairline pt-3 first:border-t-0 first:pt-0">
                <div>
                  <div className="text-sm font-medium text-gray-900">{c.label}</div>
                  <div className="text-xs text-gray-500">{c.description}</div>
                </div>
                <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={c.label}>
                  {TASK_RATINGS.map((level) => {
                    const on = current === level.key;
                    const style = RATING_STYLE[level.key];
                    return (
                      <button
                        key={level.key}
                        role="radio"
                        aria-checked={on}
                        disabled={graded}
                        onClick={() => rate(c.key, level.key)}
                        className={`px-2 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                          on ? style.checked : `border-gray-300 text-gray-700 ${graded ? "" : style.hover}`
                        } disabled:cursor-default`}
                      >
                        {level.label}
                      </button>
                    );
                  })}
                </div>
                {(current || notes[c.key]) && (
                  <input
                    value={notes[c.key] ?? ""}
                    disabled={graded}
                    maxLength={MAX_REMARKS_LENGTH}
                    onChange={(e) => {
                      setNotes((prev) => ({ ...prev, [c.key]: e.target.value }));
                      setDirty(true);
                    }}
                    placeholder="Remarks (optional)"
                    className="w-full px-3 py-2 bg-surface border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-600/30 disabled:bg-subtle"
                  />
                )}
              </div>
            );
          })}

          <div className="border-t border-hairline pt-3">
            <label htmlFor="overall-remarks" className="text-sm font-medium text-gray-900">
              Overall remarks
            </label>
            <textarea
              id="overall-remarks"
              rows={3}
              value={remarks}
              disabled={graded}
              maxLength={MAX_REMARKS_LENGTH}
              onChange={(e) => {
                setRemarks(e.target.value);
                setDirty(true);
              }}
              className="mt-1 w-full px-3 py-2 bg-surface border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-600/30 disabled:bg-subtle"
            />
          </div>

          {graded ? (
            <p className="flex items-center gap-2 text-sm text-gray-600">
              <FontAwesomeIcon icon={faLock} className="w-3.5 h-3.5" /> Graded {formatWhen(s.graded_at)}. The grade is
              final.
            </p>
          ) : (
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => save(false)}
                disabled={busy !== null || !dirty}
                className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                {busy === "save" ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => save(true)}
                disabled={busy !== null || !complete}
                title={complete ? "Lock in the grade and notify the student" : "Rate every criterion first"}
                className="px-5 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 disabled:opacity-50"
              >
                {busy === "finalize" ? "Finalizing…" : "Finalize grade"}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

const SEX_LABEL = { male: "Male", female: "Female" } as const;

function CaseView({ submission: s }: { submission: CaseSubmission }) {
  const obs = s.observations ?? { vitals: [], tpr: [], ivf: [] };
  const n = (v: number | null) => (v === null ? "—" : v);
  const narrative: [string, string][] = [
    ["Chief complaint", s.chief_complaint],
    ["History", s.history],
    ["Medications", s.medications],
    ["Nursing diagnoses", s.nursing_diagnoses],
    ["Interventions & rationale", s.interventions],
  ];

  return (
    <section className="space-y-4">
      <div className="bg-surface rounded-xl border border-hairline shadow-tile p-4">
        <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
          <FontAwesomeIcon icon={faUserShield} className="w-3.5 h-3.5" /> Patient identified by initials only
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Field label="Patient" value={<span className="font-mono text-base">{s.patient_initials ?? "—"}</span>} />
          <Field label="Age / sex" value={`${s.age ?? "—"}${s.sex ? ` · ${SEX_LABEL[s.sex]}` : ""}`} />
          <Field label="Hospital" value={s.hospital || "—"} />
          <Field label="Ward" value={s.ward || "—"} />
          <div className="col-span-2 sm:col-span-4">
            <Field label="Admitting diagnosis" value={s.admitting_diagnosis || "—"} />
          </div>
        </dl>
      </div>

      {narrative.map(([label, text]) => (
        <div key={label} className="bg-surface rounded-xl border border-hairline shadow-tile p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">{label}</h3>
          <p className="text-sm text-gray-700 whitespace-pre-line">{text || "—"}</p>
        </div>
      ))}

      <ObsTable
        title="Vital signs observed"
        head={["Observed", "HR", "BP", "Temp °C", "RR", "SpO₂ %", "Pain"]}
        rows={obs.vitals.map((v) => [
          formatWhen(v.observed_at),
          n(v.heart_rate),
          v.bp_systolic != null && v.bp_diastolic != null ? `${v.bp_systolic}/${v.bp_diastolic}` : "—",
          n(v.temperature_c),
          n(v.respiratory_rate),
          n(v.oxygen_saturation),
          n(v.pain_score),
        ])}
      />
      <ObsTable
        title="TPR"
        head={["Observed", "Temp °C", "Pulse", "Resp", "Remarks"]}
        rows={obs.tpr.map((t) => [formatWhen(t.observed_at), n(t.temperature_c), n(t.pulse), n(t.respiration), t.remarks || "—"])}
      />
      <ObsTable
        title="IV fluids"
        head={["Solution", "Volume mL", "Rate mL/hr", "Site", "Remarks"]}
        rows={obs.ivf.map((f) => [f.solution, n(f.volume_ml), n(f.rate_ml_hr), f.site || "—", f.remarks || "—"])}
      />
    </section>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-gray-900">{value}</dd>
    </div>
  );
}

function ObsTable({ title, head, rows }: { title: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="bg-surface rounded-xl border border-hairline shadow-tile overflow-x-auto">
      <h3 className="px-4 pt-3 text-sm font-semibold text-gray-900">{title}</h3>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-gray-500">None recorded.</p>
      ) : (
        <table className="w-full text-sm mt-2">
          <thead className="bg-subtle text-left text-xs text-gray-600">
            <tr>
              {head.map((h) => (
                <th key={h} className="px-4 py-2 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline tabular-nums">
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((cell, j) => (
                  <td key={j} className="px-4 py-2 text-gray-700">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
