"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faBookMedical,
  faChalkboardUser,
  faChevronRight,
  faLayerGroup,
  faListCheck,
  faPenToSquare,
  faPlus,
  faTrashCan,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import ActionsMenu from "../../components/ActionsMenu";
import { usePageData } from "../../lib/use-page-data";
import {
  fetchSkillCatalog,
  type AcademicTerm,
  type CourseOfferingRow,
  type CourseSummary,
  type SkillSummary,
} from "../../lib/api";
import SkillsTab from "../../instructor/courses/[id]/skills-tab";

const NO_SKILLS: SkillSummary[] = [];
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { numeric: true });

const cardClass =
  "group relative flex flex-col rounded-2xl border border-hairline bg-surface text-left shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-600/40 hover:shadow-tile-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40";

export interface CourseActions {
  editCourse: (c: CourseSummary) => void;
  editSkills: (c: CourseSummary) => void;
  deleteCourse: (c: CourseSummary) => void;
  changeInstructor: (o: CourseOfferingRow) => void;
  removeOffering: (o: CourseOfferingRow) => void;
}

/** A section a course is taught in this term, and who teaches it there. */
interface SectionView {
  id: string;
  name: string;
  offerings: CourseOfferingRow[];
}

type Tab = "instructors" | "skills";

/**
 * The dean's courses for one term, as cards like the instructor's. A course
 * opens on its sections; a section opens on who teaches the course there
 * (Instructors) and what the course covers (Skills).
 */
export default function CourseBrowser({
  term,
  courses,
  offerings,
  loading,
  actions,
}: {
  term: AcademicTerm | null;
  courses: CourseSummary[];
  offerings: CourseOfferingRow[];
  loading: boolean;
  actions: CourseActions;
}) {
  const router = useRouter();
  const [courseId, setCourseId] = useState<string | null>(null);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("instructors");
  const { data: catalog = NO_SKILLS } = usePageData("skills:catalog", fetchSkillCatalog, { freshFor: 10 * 60_000 });

  const termOfferings = offerings.filter((o) => o.term_id === term?.id);
  const assigned = courses.filter((c) => termOfferings.some((o) => o.course_id === c.id));
  const unassigned = courses.filter((c) => !termOfferings.some((o) => o.course_id === c.id));
  const course = courses.find((c) => c.id === courseId) ?? null;
  const courseOfferings = termOfferings.filter((o) => o.course_id === courseId);

  const sectionsOf = (list: CourseOfferingRow[]): SectionView[] => {
    const map = new Map<string, SectionView>();
    for (const o of list)
      for (const s of o.sections) {
        const view = map.get(s.id) ?? { id: s.id, name: s.name, offerings: [] };
        view.offerings.push(o);
        map.set(s.id, view);
      }
    return [...map.values()].sort(byName);
  };
  const sections = sectionsOf(courseOfferings);
  const section = sections.find((s) => s.id === sectionId) ?? null;
  // Assigned, but the instructor hasn't added sections yet.
  const noSections = courseOfferings.filter((o) => o.sections.length === 0);

  const assignHref = (c: CourseSummary) =>
    `/dean/courses/new?course=${encodeURIComponent(c.code)}${term ? `&term=${term.id}` : ""}`;

  const openCourse = (id: string | null) => {
    setCourseId(id);
    setSectionId(null);
  };
  const openSection = (id: string | null) => {
    setSectionId(id);
    setTab("instructors");
  };

  // ---- A course's section: Instructors and Skills ----
  if (course && section) {
    return (
      <div>
        <Crumbs
          items={[
            { label: "Courses", onClick: () => openCourse(null) },
            { label: course.code, onClick: () => openSection(null) },
            { label: section.name },
          ]}
        />
        <div className="mb-4">
          <h2 className="font-display text-xl font-semibold text-gray-900">
            {course.code} · {section.name}
          </h2>
          <p className="text-sm text-gray-500">{course.title}</p>
        </div>
        <div role="tablist" aria-label="Section" className="mb-4 flex gap-1 shadow-[inset_0_-1px_0_var(--color-hairline)]">
          {(
            [
              { id: "instructors", label: "Instructors", icon: faChalkboardUser, count: section.offerings.length },
              { id: "skills", label: "Skills", icon: faBookMedical, count: course.skill_ids.length },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors ${
                tab === t.id
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800"
              }`}
            >
              <FontAwesomeIcon icon={t.icon} className="h-3.5 w-3.5" />
              {t.label}
              <span
                className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${
                  tab === t.id ? "bg-brand-600/10 text-brand-700" : "bg-gray-100 text-gray-500"
                }`}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {tab === "instructors" ? (
          <div className="space-y-3">
            <ul className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-surface">
              {section.offerings.map((o) => {
                const here = o.sections.find((s) => s.id === section.id);
                return (
                  <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600/10 text-brand-600">
                      <FontAwesomeIcon icon={faChalkboardUser} className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900">
                        {o.faculty_name ?? <span className="text-amber-700">No instructor</span>}
                      </p>
                      <p className="text-xs text-gray-500">
                        {here?.has_group ? "Teaches their groups here" : "No group here, so the whole section is on their roster"}
                        {" · "}
                        {plural(o.student_count, "student")} in all their sections
                        {" · "}
                        {o.requirement_count === 0 ? "checklist not set up" : `checklist of ${plural(o.requirement_count, "item")}`}
                      </p>
                    </div>
                    <ActionsMenu
                      variant="compact"
                      label={`Actions for ${o.faculty_name ?? "assignment"}`}
                      actions={[
                        { label: "Change instructor", icon: faPenToSquare, onClick: () => actions.changeInstructor(o) },
                        { label: "Remove from term", icon: faTrashCan, danger: true, onClick: () => actions.removeOffering(o) },
                      ]}
                    />
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              onClick={() => router.push(assignHref(course))}
              className="inline-flex items-center gap-2 rounded-lg border border-brand-600/40 px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-600/5"
            >
              <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
              Assign another instructor
            </button>
          </div>
        ) : (
          <SkillsTab
            courseCode={course.code}
            skillIds={course.skill_ids}
            catalog={catalog}
            onEditSkills={() => actions.editSkills(course)}
          />
        )}
      </div>
    );
  }

  // ---- A course: its sections this term ----
  if (course) {
    return (
      <div>
        <Crumbs items={[{ label: "Courses", onClick: () => openCourse(null) }, { label: course.code }]} />
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-semibold text-gray-900">{course.code}</h2>
            <p className="text-sm text-gray-500">{course.title}</p>
          </div>
          <ActionsMenu
            variant="compact"
            label={`Actions for ${course.code}`}
            actions={[
              { label: "Edit course details", icon: faPenToSquare, onClick: () => actions.editCourse(course) },
              { label: "Edit skills", icon: faListCheck, onClick: () => actions.editSkills(course) },
            ]}
          />
        </div>
        {sections.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 bg-surface px-4 py-8 text-center text-sm text-gray-500">
            No sections yet. {courseOfferings.map((o) => o.faculty_name ?? "The instructor").join(", ")} adds the sections they
            teach it in.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {sections.map((s) => (
              <button key={s.id} type="button" onClick={() => openSection(s.id)} className={cardClass}>
                <div className="flex-1 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="flex items-center gap-2 font-display text-lg font-semibold text-gray-900">
                      <FontAwesomeIcon icon={faLayerGroup} className="h-4 w-4 text-brand-600" />
                      {s.name}
                    </p>
                    <FontAwesomeIcon
                      icon={faChevronRight}
                      className="mt-1.5 h-3.5 w-3.5 text-gray-300 transition-all group-hover:translate-x-0.5 group-hover:text-brand-600"
                    />
                  </div>
                  <p className="mt-2 text-sm text-gray-600">
                    {s.offerings.map((o) => o.faculty_name ?? "No instructor").join(", ")}
                  </p>
                </div>
                <div className="grid grid-cols-2 border-t border-hairline text-xs font-medium text-gray-500">
                  <span className="flex items-center justify-center gap-1.5 px-2 py-2.5">
                    <FontAwesomeIcon icon={faChalkboardUser} className="h-3 w-3" />
                    {plural(s.offerings.length, "instructor")}
                  </span>
                  <span className="flex items-center justify-center gap-1.5 border-l border-hairline px-2 py-2.5">
                    <FontAwesomeIcon icon={faBookMedical} className="h-3 w-3" />
                    {plural(course.skill_ids.length, "skill")}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
        {noSections.length > 0 && sections.length > 0 && (
          <p className="mt-3 text-xs text-gray-500">
            {noSections.map((o) => o.faculty_name ?? "An instructor").join(", ")} hasn&apos;t added sections yet.
          </p>
        )}
      </div>
    );
  }

  // ---- The term's courses, as cards ----
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-40 animate-pulse rounded-2xl border border-hairline bg-surface" />
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {assigned.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-surface px-4 py-8 text-center text-sm text-gray-500">
          No course is assigned in this term yet. Use Assign Course: it adds the term and the course as it goes.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {assigned.map((c) => {
            const list = termOfferings.filter((o) => o.course_id === c.id);
            const secs = sectionsOf(list);
            const students = list.reduce((n, o) => n + o.student_count, 0);
            return (
              <article key={c.id} className={cardClass}>
                <button
                  type="button"
                  onClick={() => openCourse(c.id)}
                  className="flex-1 rounded-t-2xl p-4 text-left outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-brand-600/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-display text-lg font-semibold text-gray-900">{c.code}</p>
                      <p className="truncate text-sm text-gray-600">{c.title}</p>
                    </div>
                    <FontAwesomeIcon
                      icon={faChevronRight}
                      className="mt-1.5 h-3.5 w-3.5 text-gray-300 transition-all group-hover:translate-x-0.5 group-hover:text-brand-600"
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {secs.map((s) => (
                      <span key={s.id} className="rounded-full bg-brand-600/10 px-2 py-0.5 text-xs font-medium text-brand-700">
                        {s.name}
                      </span>
                    ))}
                    {secs.length === 0 && <span className="text-xs text-gray-500">No sections yet</span>}
                    <span className="ml-auto flex items-center gap-1.5 text-xs text-gray-500">
                      <FontAwesomeIcon icon={faUsers} className="h-3 w-3 text-gray-400" />
                      {plural(students, "student")}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-gray-500">
                    {list.map((o) => o.faculty_name ?? "No instructor").join(", ")}
                  </p>
                </button>
                <div className="relative z-10 grid grid-cols-3 border-t border-hairline text-xs font-medium text-gray-500">
                  <span className="flex items-center justify-center gap-1.5 px-2 py-2.5">
                    <FontAwesomeIcon icon={faLayerGroup} className="h-3 w-3" />
                    {plural(secs.length, "section")}
                  </span>
                  <span className="flex items-center justify-center gap-1.5 border-l border-hairline px-2 py-2.5">
                    <FontAwesomeIcon icon={faChalkboardUser} className="h-3 w-3" />
                    {plural(list.length, "instructor")}
                  </span>
                  <button
                    type="button"
                    onClick={() => actions.editSkills(c)}
                    className={`flex items-center justify-center gap-1.5 rounded-br-2xl border-l border-hairline px-2 py-2.5 hover:bg-subtle hover:text-brand-700 ${
                      c.skill_ids.length === 0 ? "text-amber-700" : ""
                    }`}
                  >
                    <FontAwesomeIcon icon={faBookMedical} className="h-3 w-3" />
                    {c.skill_ids.length > 0 ? plural(c.skill_ids.length, "skill") : "Pick skills"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {unassigned.length > 0 && (
        <section>
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Not assigned this term</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {unassigned.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-xl border border-dashed border-gray-300 bg-surface px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-700">{c.code}</p>
                  <p className="truncate text-xs text-gray-500">{c.title}</p>
                </div>
                <button
                  type="button"
                  onClick={() => router.push(assignHref(c))}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-brand-600/40 px-2.5 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-600/5"
                >
                  <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
                  Assign
                </button>
                <ActionsMenu
                  variant="compact"
                  label={`Actions for ${c.code}`}
                  actions={[
                    { label: "Edit course details", icon: faPenToSquare, onClick: () => actions.editCourse(c) },
                    { label: "Edit skills", icon: faListCheck, onClick: () => actions.editSkills(c) },
                    { label: "Delete course", icon: faTrashCan, danger: true, onClick: () => actions.deleteCourse(c) },
                  ]}
                />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Crumbs({ items }: { items: { label: string; onClick?: () => void }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-1.5 text-sm">
      {items[0]?.onClick && (
        <button type="button" onClick={items[items.length - 2]?.onClick} aria-label="Back" className="mr-1 text-gray-500 hover:text-brand-700">
          <FontAwesomeIcon icon={faArrowLeft} className="h-3.5 w-3.5" />
        </button>
      )}
      {items.map((it, i) => (
        <span key={it.label} className="flex items-center gap-1.5">
          {i > 0 && <FontAwesomeIcon icon={faChevronRight} className="h-2.5 w-2.5 text-gray-300" />}
          {it.onClick ? (
            <button type="button" onClick={it.onClick} className="font-medium text-brand-700 hover:underline">
              {it.label}
            </button>
          ) : (
            <span className="font-semibold text-gray-900">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
