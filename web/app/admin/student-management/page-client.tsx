"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faLayerGroup,
  faChevronRight,
  faArrowLeft,
  faPlus,
  faXmark,
  faTrashCan,
  faSpinner,
  faCircleCheck,
  faCircleXmark,
  faUsers,
  faTriangleExclamation,
  faSearch,
} from "@fortawesome/free-solid-svg-icons";
import PageHeader from "../../components/PageHeader";
import StatTile from "../../components/StatTile";
import { fetchSections, Section } from "../../lib/api";

interface StudentPerformance {
  id: string;
  name: string;
  email: string;
  quizzes_completed: number;
  average_score: number | null;
  at_risk: boolean;
  last_login_at: string | null;
  section_id: string | null;
  section: string | null;
}

/** Group key for students with no section assigned. */
const UNASSIGNED_KEY = "__unassigned__";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatLastActive(value: string | null): string {
  if (!value) return "Never";
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface DraftRow {
  key: number;
  name: string;
  email: string;
  status: "ready" | "creating" | "created" | "failed";
  message?: string;
}

let rowKey = 0;
const emptyRow = (): DraftRow => ({ key: rowKey++, name: "", email: "", status: "ready" });

/**
 * Enrolment is section-first: a cohort arrives as a list, so the section is
 * chosen once and every student in the batch inherits it.
 */
function EnrollSectionModal({
  onClose,
  sections,
  presetSectionId,
  onEnroll,
  onFinished,
}: {
  onClose: () => void;
  sections: Section[];
  presetSectionId: string | null;
  onEnroll: (name: string, email: string, sectionId: string) => Promise<string | null>;
  onFinished: (created: number) => void;
}) {
  // The parent mounts this only while open and keys it on the section, so state
  // starts fresh every time rather than needing an effect to reset it.
  const [sectionId, setSectionId] = useState(presetSectionId ?? "");
  const [rows, setRows] = useState<DraftRow[]>(() => [emptyRow(), emptyRow(), emptyRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [finished, setFinished] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const filled = rows.filter((r) => r.name.trim() || r.email.trim());
  const createdCount = rows.filter((r) => r.status === "created").length;

  const update = (key: number, patch: Partial<DraftRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const validate = (): string | null => {
    if (!sectionId) return "Choose a section first.";
    if (filled.length === 0) return "Add at least one student.";
    const seen = new Set<string>();
    for (const row of filled) {
      if (!row.name.trim()) return "Every student needs a name.";
      if (!EMAIL_REGEX.test(row.email.trim())) return `"${row.email.trim() || "(blank)"}" is not a valid email.`;
      const email = row.email.trim().toLowerCase();
      if (seen.has(email)) return `${email} appears twice in this batch.`;
      seen.add(email);
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validate();
    if (problem) {
      setFormError(problem);
      return;
    }
    setFormError(null);
    setSubmitting(true);

    let created = 0;
    for (const row of filled) {
      if (row.status === "created") continue;
      update(row.key, { status: "creating", message: undefined });
      const error = await onEnroll(row.name.trim(), row.email.trim(), sectionId);
      if (error) {
        update(row.key, { status: "failed", message: error });
      } else {
        created++;
        update(row.key, { status: "created", message: "Invitation sent" });
      }
    }

    setSubmitting(false);
    setFinished(true);
    onFinished(created);
  };

  const sectionName = sections.find((s) => s.id === sectionId)?.name;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={submitting ? undefined : onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-hairline bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-hairline bg-subtle px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600/10">
              <FontAwesomeIcon icon={faLayerGroup} className="h-5 w-5 text-brand-600" />
            </span>
            <div>
              <h2 className="font-display text-lg font-semibold text-gray-900">
                Enroll students into a section
              </h2>
              <p className="text-sm text-gray-500">
                Pick the section once — every student below joins it.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"
            aria-label="Close"
          >
            <FontAwesomeIcon icon={faXmark} className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div>
            <label htmlFor="enroll-section" className="mb-1.5 block text-sm font-semibold text-gray-700">
              Section <span className="text-rose-500">*</span>
            </label>
            <select
              id="enroll-section"
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
              disabled={submitting}
              className="w-full rounded-xl border border-gray-300 bg-surface px-4 py-2.5 text-gray-900 transition-all focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30 disabled:opacity-60"
            >
              <option value="">Select a section…</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {sections.length === 0 && (
              <p className="mt-1.5 text-xs text-amber-600">
                No sections exist yet — create one before enrolling students.
              </p>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-semibold text-gray-700">
                Students {sectionName && <span className="text-gray-400">→ {sectionName}</span>}
              </label>
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-gray-400">
                {filled.length} to enroll
              </span>
            </div>

            <div className="space-y-2">
              {rows.map((row, i) => (
                <div key={row.key} className="flex items-start gap-2">
                  <span className="mt-2.5 w-5 shrink-0 text-right font-mono text-[10px] text-gray-400">
                    {i + 1}
                  </span>
                  <input
                    type="text"
                    value={row.name}
                    onChange={(e) => update(row.key, { name: e.target.value })}
                    disabled={submitting || row.status === "created"}
                    placeholder="Full name"
                    className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-surface px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30 disabled:opacity-60"
                  />
                  <input
                    type="text"
                    value={row.email}
                    onChange={(e) => update(row.key, { email: e.target.value })}
                    disabled={submitting || row.status === "created"}
                    placeholder="name@batstate-u.edu.ph"
                    className="min-w-0 flex-[1.3] rounded-lg border border-gray-200 bg-surface px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30 disabled:opacity-60"
                  />
                  <span className="mt-2 flex w-5 shrink-0 justify-center">
                    {row.status === "creating" && (
                      <FontAwesomeIcon icon={faSpinner} spin className="h-3.5 w-3.5 text-brand-600" />
                    )}
                    {row.status === "created" && (
                      <FontAwesomeIcon icon={faCircleCheck} className="h-3.5 w-3.5 text-emerald-600" />
                    )}
                    {row.status === "failed" && (
                      <FontAwesomeIcon
                        icon={faCircleXmark}
                        title={row.message}
                        className="h-3.5 w-3.5 text-rose-600"
                      />
                    )}
                    {row.status === "ready" && rows.length > 1 && !submitting && (
                      <button
                        type="button"
                        onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                        aria-label={`Remove row ${i + 1}`}
                        className="text-gray-300 transition-colors hover:text-rose-500"
                      >
                        <FontAwesomeIcon icon={faTrashCan} className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>

            {rows.some((r) => r.status === "failed") && (
              <ul className="mt-2 space-y-1">
                {rows
                  .filter((r) => r.status === "failed")
                  .map((r) => (
                    <li key={r.key} className="text-xs text-rose-600">
                      {r.email || "(blank)"} — {r.message}
                    </li>
                  ))}
              </ul>
            )}

            {!submitting && !finished && (
              <button
                type="button"
                onClick={() => setRows((prev) => [...prev, emptyRow()])}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:border-brand-300 hover:text-brand-700"
              >
                <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
                Add another student
              </button>
            )}
          </div>

          {formError && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-sm text-rose-700">
              {formError}
            </p>
          )}

          {finished && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm text-emerald-700">
              Enrolled {createdCount} of {filled.length} into {sectionName}. Each student receives an
              email with a temporary password.
            </p>
          )}
        </form>

        <div className="flex items-center justify-end gap-3 border-t border-hairline bg-subtle px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-gray-200 bg-surface px-5 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 disabled:opacity-50"
          >
            {finished ? "Close" : "Cancel"}
          </button>
          {!finished && (
            <button
              onClick={handleSubmit}
              disabled={submitting || sections.length === 0}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_2px_8px_-1px_rgb(27_107_123_/_0.35)] transition-all hover:bg-brand-700 disabled:opacity-60"
            >
              {submitting && <FontAwesomeIcon icon={faSpinner} spin className="h-4 w-4" />}
              {submitting
                ? "Enrolling…"
                : `Enroll ${filled.length || ""} student${filled.length === 1 ? "" : "s"}`.trim()}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface SectionGroup {
  key: string;
  name: string;
  students: StudentPerformance[];
}

export default function StudentManagementClient() {
  const router = useRouter();
  const [students, setStudents] = useState<StudentPerformance[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
  const [passwords, setPasswords] = useState<{ email: string; password: string }[]>([]);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/students", { credentials: "include" });
    if (res.ok) {
      const json = (await res.json()) as { students: StudentPerformance[] };
      setStudents(json.students ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // Both lists are remote, so they can only be populated after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStudents();
    void fetchSections().then(setSections);
  }, [loadStudents]);

  /** Provisions one account into a section; returns an error message or null. */
  const handleEnroll = useCallback(
    async (name: string, email: string, sectionId: string): Promise<string | null> => {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, email, role: "student", section_id: sectionId }),
      });
      const json = (await res.json()) as {
        user?: { id: string; name: string; email: string };
        password?: string;
        error?: string;
      };
      if (!res.ok || !json.user) return json.error ?? "Failed to enroll student";
      if (json.password) {
        setPasswords((prev) => [...prev, { email: json.user!.email, password: json.password! }]);
      }
      return null;
    },
    [],
  );

  const filteredStudents = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return students.filter((s) => {
      const matchesSearch = !q || s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q);
      const matchesFilter =
        filterStatus === "all" ||
        (filterStatus === "at-risk" && s.at_risk) ||
        (filterStatus === "safe" && !s.at_risk);
      return matchesSearch && matchesFilter;
    });
  }, [students, searchQuery, filterStatus]);

  const groups = useMemo<SectionGroup[]>(() => {
    const matching = new Set(filteredStudents.map((s) => s.id));
    const byKey = new Map<string, SectionGroup>();
    for (const section of sections) {
      byKey.set(section.id, { key: section.id, name: section.name, students: [] });
    }
    for (const student of students) {
      const key = student.section_id ?? UNASSIGNED_KEY;
      let group = byKey.get(key);
      if (!group) {
        group = { key, name: student.section ?? "Unassigned", students: [] };
        byKey.set(key, group);
      }
      if (matching.has(student.id)) group.students.push(student);
    }
    return [...byKey.values()].sort((a, b) => {
      if (a.key === UNASSIGNED_KEY) return 1;
      if (b.key === UNASSIGNED_KEY) return -1;
      return a.name.localeCompare(b.name);
    });
  }, [sections, students, filteredStudents]);

  const openGroup = groups.find((g) => g.key === selectedSection) ?? null;

  return (
    <div>
      <PageHeader
        badge={{
          icon: <FontAwesomeIcon icon={faLayerGroup} className="h-3 w-3" />,
          label: "Student Management",
        }}
        title="Student Management"
        subtitle="Enroll and monitor nursing students by section"
        action={{
          icon: <FontAwesomeIcon icon={faPlus} className="h-5 w-5" />,
          onClick: () => setIsEnrollModalOpen(true),
          label: "Enroll students",
        }}
      />

      {passwords.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <div className="mb-2 flex items-center justify-between gap-4">
            <p className="font-semibold">
              Temporary passwords ({passwords.length}) — invitation emails were attempted; keep these
              as backup.
            </p>
            <button
              onClick={() => setPasswords([])}
              className="shrink-0 font-medium text-amber-700 hover:text-amber-900"
            >
              Dismiss
            </button>
          </div>
          <ul className="space-y-1">
            {passwords.map((p) => (
              <li key={p.email} className="flex items-center gap-2">
                <span className="truncate">{p.email}</span>
                <code className="rounded border border-amber-200 bg-surface px-2 py-0.5 font-mono text-xs">
                  {p.password}
                </code>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={<FontAwesomeIcon icon={faUsers} className="h-5 w-5" />}
          value={students.length}
          label="Total Students"
          caption={`${sections.length} section${sections.length === 1 ? "" : "s"}`}
        />
        <StatTile
          icon={<FontAwesomeIcon icon={faCircleCheck} className="h-5 w-5" />}
          value={students.filter((s) => !s.at_risk).length}
          label="Safe"
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
        />
        <StatTile
          icon={<FontAwesomeIcon icon={faTriangleExclamation} className="h-5 w-5" />}
          value={students.filter((s) => s.at_risk).length}
          label="At Risk"
          iconBg="bg-rose-50"
          iconColor="text-rose-600"
        />
        <StatTile
          icon={<FontAwesomeIcon icon={faLayerGroup} className="h-5 w-5" />}
          value={students.filter((s) => !s.section_id).length}
          label="Unassigned"
          caption="No section yet"
          iconBg="bg-gray-100"
          iconColor="text-gray-600"
        />
      </div>

      <div className="mb-4 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <FontAwesomeIcon
            icon={faSearch}
            className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="Search by name or email…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-surface py-2.5 pl-11 pr-4 text-gray-700 transition-all placeholder:text-gray-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/40"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="cursor-pointer rounded-xl border border-gray-200 bg-surface px-4 py-2.5 text-gray-700 transition-all focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/40"
        >
          <option value="all">All Students</option>
          <option value="at-risk">At Risk</option>
          <option value="safe">Safe</option>
        </select>
      </div>

      {loading ? (
        <div className="rounded-xl border border-hairline bg-surface p-12 text-center text-gray-400 shadow-tile">
          Loading students…
        </div>
      ) : !openGroup ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => {
            const atRisk = group.students.filter((s) => s.at_risk).length;
            return (
              <button
                key={group.key}
                onClick={() => setSelectedSection(group.key)}
                className="group rounded-xl border border-hairline bg-surface p-5 text-left shadow-tile transition-all duration-200 hover:border-brand-300 hover:shadow-tile-hover"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                        group.key === UNASSIGNED_KEY
                          ? "bg-gray-100 text-gray-500"
                          : "bg-brand-600/10 text-brand-600"
                      }`}
                    >
                      <FontAwesomeIcon icon={faLayerGroup} className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-gray-900">{group.name}</p>
                      <p className="text-xs text-gray-500">
                        {group.students.length} student{group.students.length === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                  <FontAwesomeIcon
                    icon={faChevronRight}
                    className="mt-3.5 h-3.5 w-3.5 shrink-0 text-gray-300 transition-all group-hover:translate-x-0.5 group-hover:text-brand-600"
                  />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
                  {group.students.length === 0 ? (
                    <span className="text-xs text-gray-400">No students yet</span>
                  ) : atRisk > 0 ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-700">
                      <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3" />
                      {atRisk} at risk
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                      <FontAwesomeIcon icon={faCircleCheck} className="h-3 w-3" />
                      All safe
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => setSelectedSection(null)}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-surface px-3 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50"
            >
              <FontAwesomeIcon icon={faArrowLeft} className="h-3.5 w-3.5" />
              All sections
            </button>
            <h2 className="font-display truncate text-lg font-bold text-gray-900">{openGroup.name}</h2>
            <span className="rounded-full border border-brand-600/20 bg-brand-600/10 px-2.5 py-1 text-xs font-medium text-brand-700">
              {openGroup.students.length} student{openGroup.students.length === 1 ? "" : "s"}
            </span>
            {openGroup.key !== UNASSIGNED_KEY && (
              <button
                onClick={() => setIsEnrollModalOpen(true)}
                className="ml-auto flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-brand-700"
              >
                <FontAwesomeIcon icon={faPlus} className="h-3.5 w-3.5" />
                Enroll into {openGroup.name}
              </button>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-hairline bg-surface shadow-tile">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-gray-100 bg-subtle">
                  <tr>
                    {["Student", "Quizzes", "Avg. Score", "Status", "Last Active"].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 sm:px-6"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {openGroup.students.map((student) => (
                    <tr
                      key={student.id}
                      onClick={() => router.push(`/admin/students/${student.id}`)}
                      className="cursor-pointer transition-colors hover:bg-subtle"
                    >
                      <td className="px-4 py-4 sm:px-6">
                        <div className="flex items-center gap-3">
                          <span
                            className={`flex h-10 w-10 items-center justify-center rounded-full font-semibold ${
                              student.at_risk
                                ? "bg-rose-50 text-rose-600"
                                : "bg-brand-600/10 text-brand-600"
                            }`}
                          >
                            {student.name.charAt(0)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-gray-800">{student.name}</p>
                            <p className="truncate text-sm text-gray-500">{student.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm font-medium text-gray-600 sm:px-6">
                        {student.quizzes_completed}
                      </td>
                      <td className="px-4 py-4 sm:px-6">
                        {student.average_score === null ? (
                          <span className="text-sm text-gray-400">No attempts</span>
                        ) : (
                          <span
                            className={`text-sm font-semibold ${
                              student.average_score >= 70 ? "text-brand-600" : "text-rose-600"
                            }`}
                          >
                            {student.average_score}%
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 sm:px-6">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                            student.at_risk
                              ? "bg-rose-50 text-rose-600"
                              : "bg-emerald-50 text-emerald-600"
                          }`}
                        >
                          {student.at_risk ? "At Risk" : "Safe"}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500 sm:px-6">
                        {formatLastActive(student.last_login_at)}
                      </td>
                    </tr>
                  ))}
                  {openGroup.students.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-gray-400">
                        No students in this section yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {isEnrollModalOpen && (
        <EnrollSectionModal
          key={openGroup?.key ?? "all"}
          onClose={() => setIsEnrollModalOpen(false)}
          sections={sections}
          presetSectionId={openGroup && openGroup.key !== UNASSIGNED_KEY ? openGroup.key : null}
          onEnroll={handleEnroll}
          onFinished={(created) => {
            if (created > 0) void loadStudents();
          }}
        />
      )}
    </div>
  );
}
