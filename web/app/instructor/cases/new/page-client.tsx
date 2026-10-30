"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faCalendarDays,
  faCheck,
  faFilePrescription,
  faShieldHalved,
  faTriangleExclamation,
  faUserGroup,
} from "@fortawesome/free-solid-svg-icons";
import PageHeader from "../../../components/PageHeader";
import SheetStep from "../../../components/SheetStep";
import { toast } from "../../../components/Toast";
import { EcgLoader } from "../../../components/EcgLoader";
import CoursePicker, { resolveCourse, useActivityCourses } from "../../../components/CoursePicker";
import AudiencePicker, { audiencePayload, useCourseAudience } from "../../../components/AudiencePicker";
import { forgetPage } from "../../../lib/request-cache";
import { deadlineFromInput } from "../../../lib/deadline-input";
import { createCasePresentation } from "../../../lib/api";
import { formatDue, inputClassName, labelClassName } from "../case-ui";

export default function CaseNewClient() {
  const router = useRouter();
  const back = () => router.push("/instructor/cases");

  const [title, setTitle] = useState("Most Interesting Case");
  const [instructions, setInstructions] = useState("");
  const [deadline, setDeadline] = useState("");
  const [busy, setBusy] = useState(false);

  // The course the presentation is made for (070); it then counts toward that course's grading.
  const { offerings, loading: loadingCourses } = useActivityCourses();
  const [chosenCourse, setChosenCourse] = useState("");
  const offeringId = resolveCourse(offerings, chosenCourse);
  const offering = offerings.find((o) => o.id === offeringId) ?? null;
  const pickCourse = (id: string) => {
    setChosenCourse(id);
    setAudience([]);
  };

  // With a course, it goes to its groups (and whole sections where you have none).
  const [audience, setAudience] = useState<string[]>([]);
  const { roster } = useCourseAudience(offeringId || null);
  const picked = audiencePayload(roster, audience);

  // The API takes an instructor's case presentation only for one of their courses.
  const noCourses = !loadingCourses && offerings.length === 0;

  const audienceOk = !!offeringId && picked.count > 0;

  const submit = async () => {
    if (busy) return;
    if (!title.trim()) return toast("Give the presentation a title");
    if (!offeringId) return toast("Choose the course this is for");
    if (!deadline) return toast("Set a due date");
    if (!audienceOk) return toast("Choose the groups this goes to");
    setBusy(true);
    const res = await createCasePresentation({
      title: title.trim(),
      instructions,
      deadline: deadlineFromInput(deadline),
      section_ids: picked.section_ids,
      team_ids: picked.team_ids,
      student_ids: picked.student_ids,
      offering_id: offeringId,
    });
    setBusy(false);
    if (res.error !== undefined) return toast(res.error);
    const n = res.data.student_count;
    toast(`Assigned to ${n} student${n === 1 ? "" : "s"}`);
    forgetPage("faculty:cases");
    router.push(`/instructor/cases/${res.data.presentation.id}`);
  };

  const checklist = [
    { ok: !!offeringId, label: "Course chosen" },
    { ok: !!title.trim(), label: "Title written" },
    { ok: !!deadline, label: "Due date set" },
    { ok: audienceOk, label: "Groups chosen" },
  ];

  let n = 0;
  return (
    <div className="pb-4">
      <PageHeader
        badge={{ icon: <FontAwesomeIcon icon={faFilePrescription} className="h-4 w-4" />, label: "Case Presentations" }}
        title="New Case Presentation"
        subtitle="Students write up their most interesting patient from hospital duty — by initials only — and you grade the presentation"
      />

      <button
        type="button"
        onClick={back}
        className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-brand-700 transition-colors"
      >
        <FontAwesomeIcon icon={faArrowLeft} className="h-3.5 w-3.5" />
        Back to case presentations
      </button>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="relative rounded-2xl border border-hairline bg-surface p-4 shadow-tile sm:p-6">
          <SheetStep
              n={++n}
              title="Course"
              hint="Which of your courses this presentation is for."
              done={!!offeringId}
              tag={<span className="text-xs font-medium text-red-600">Required</span>}
            >
              {loadingCourses ? (
                <p className="text-sm text-gray-500">Loading your courses…</p>
              ) : noCourses ? (
                <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    None of your courses is in a running semester, so there is nothing to make this for. Ask your Dean
                    to assign you a course this semester, or to update the semester&apos;s dates if it is still running.
                  </span>
                </p>
              ) : (
                <CoursePicker offerings={offerings} value={offeringId} onChange={pickCourse} what="case presentation" />
              )}
            </SheetStep>

          <SheetStep n={++n} title="Details" hint="What students see when they open the case." done={!!title.trim()}>
            <div className="space-y-4">
              <div>
                <label className={labelClassName} htmlFor="case-title">Title</label>
                <input
                  id="case-title"
                  value={title}
                  maxLength={200}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={busy}
                  className={`${inputClassName} font-display text-base font-medium`}
                />
              </div>
              <div>
                <label className={labelClassName} htmlFor="case-instructions">
                  Instructions <span className="font-normal text-gray-500">(optional)</span>
                </label>
                <textarea
                  id="case-instructions"
                  rows={4}
                  value={instructions}
                  maxLength={4000}
                  onChange={(e) => setInstructions(e.target.value)}
                  disabled={busy}
                  placeholder="What to include, how long the presentation should run, when you'll hold it…"
                  className={inputClassName}
                />
              </div>
            </div>
          </SheetStep>

          <SheetStep n={++n} title="Due" hint="Late cases are still accepted, and marked Late." done={!!deadline}>
            <input
              id="case-deadline"
              type="datetime-local"
              aria-label="Due"
              required
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              disabled={busy}
              className={`${inputClassName} sm:max-w-xs`}
            />
          </SheetStep>

          <SheetStep
            n={++n}
            last
            title="Who writes it"
            hint={
              <span className="inline-flex items-start gap-1.5">
                <FontAwesomeIcon icon={faShieldHalved} className="mt-0.5 h-3 w-3 shrink-0" />
                Each student you pick gets one case to write. The app only accepts the patient&apos;s initials.
              </span>
            }
            done={audienceOk}
          >
            {offeringId ? (
              <AudiencePicker offeringId={offeringId} value={audience} onChange={setAudience} />
            ) : (
              <p className="rounded-xl border border-dashed border-gray-300 px-4 py-5 text-center text-sm text-gray-500">
                {loadingCourses ? "Loading…" : "Choose a course first to see its groups."}
              </p>
            )}
          </SheetStep>
        </div>

        <aside className="space-y-3 xl:sticky xl:top-0">
          <div className="overflow-hidden rounded-2xl border border-hairline bg-surface shadow-tile">
            <div className="bg-brand-600 px-4 pb-4 pt-3.5 text-white">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/75">
                {offering ? `Case presentation · ${offering.course.code}` : "Case presentation"}
              </p>
              <p className={`mt-1 font-display text-lg font-semibold leading-snug ${title.trim() ? "text-white" : "text-white/55"}`}>
                {title.trim() || "Untitled case presentation"}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 px-4 py-3 text-xs text-gray-600">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-subtle px-2 py-0.5">
                <FontAwesomeIcon icon={faCalendarDays} className="h-3 w-3 text-brand-600" />
                {deadline ? `Due ${formatDue(deadlineFromInput(deadline))}` : "No due date yet"}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-subtle px-2 py-0.5">
                <FontAwesomeIcon icon={faUserGroup} className="h-3 w-3 text-brand-600" />
                {offeringId ? `${picked.count} student${picked.count === 1 ? "" : "s"}` : "No groups yet"}
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-hairline bg-surface p-4 shadow-tile">
            <ul className="space-y-1.5 text-xs">
              {checklist.map((c) => (
                <li key={c.label} className={`flex items-center gap-2 ${c.ok ? "text-gray-700" : "text-gray-400"}`}>
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-full ${
                      c.ok ? "bg-brand-600 text-white" : "border border-gray-300"
                    }`}
                  >
                    {c.ok && <FontAwesomeIcon icon={faCheck} className="h-2 w-2" />}
                  </span>
                  {c.label}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-gray-500">You can grade each case once its student hands it in.</p>
            <button
              onClick={submit}
              disabled={busy || checklist.some((c) => !c.ok)}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white shadow-[0_2px_6px_rgba(27,107,123,0.25)] hover:bg-brand-700 disabled:opacity-60"
            >
              {busy ? (
                <>
                  <EcgLoader /> Creating…
                </>
              ) : (
                "Create & assign"
              )}
            </button>
            <button
              onClick={back}
              disabled={busy}
              className="mt-2 w-full rounded-xl px-5 py-2 text-sm text-gray-600 hover:bg-subtle disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
