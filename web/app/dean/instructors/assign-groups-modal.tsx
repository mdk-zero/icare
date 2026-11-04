"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight, faSearch, faTimes } from "@fortawesome/free-solid-svg-icons";

export interface SectionRef {
  id: string;
  name: string;
}

export interface GroupRef {
  id: string;
  name: string;
  section_id: string;
  section_name: string;
  faculty_id: string | null;
  faculty_name: string | null;
  member_count: number;
}

/** Past this many groups they no longer fit at once: search appears and sections start closed. */
const MANY_GROUPS = 12;

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** What saving would do to a group, or who holds it now. Null when there is nothing to say. */
function groupStatus(group: GroupRef, checked: boolean, instructorId: string): { text: string; warn: boolean } | null {
  // May be another dean's instructor when a section is shared.
  if (group.faculty_id && group.faculty_id !== instructorId) {
    const holder = group.faculty_name ?? "another instructor";
    return checked ? { text: `Moves from ${holder}`, warn: true } : { text: `With ${holder}`, warn: false };
  }
  if (checked) return null;
  return group.faculty_id === instructorId
    ? { text: "Will have no instructor", warn: true }
    : { text: "No instructor", warn: false };
}

/**
 * Picks the groups an instructor handles, one block per section. Rows stay one
 * line and sections close, so the list holds up at any number of groups. A
 * closed section still shows its tally, and the footer sums up what saving
 * would change, since the row saying so may be out of sight.
 */
export default function AssignGroupsModal({
  instructor,
  sections,
  groups,
  onClose,
  onSave,
}: {
  instructor: { id: string; name: string; groups: { id: string; section_id: string }[] };
  sections: SectionRef[];
  groups: GroupRef[];
  onClose: () => void;
  /** Gets the checked groups; resolves with an error to show, or null once saved. */
  onSave: (groupIds: string[]) => Promise<string | null>;
}) {
  const router = useRouter();
  const many = groups.length > MANY_GROUPS;
  const [selected, setSelected] = useState(() => new Set(instructor.groups.map((g) => g.id)));
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blocks = [...sections]
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    .map((section) => ({ section, list: groups.filter((g) => g.section_id === section.id) }));

  // With many groups, open only where this instructor already has some.
  const [open, setOpen] = useState(() => {
    if (!many) return new Set(sections.map((s) => s.id));
    const held = instructor.groups.map((g) => g.section_id);
    const first = blocks.find((b) => b.list.length > 0)?.section.id;
    return new Set(held.length > 0 ? held : first ? [first] : []);
  });

  const dialogRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // On the dialog rather than the search box, so no phone keyboard opens uninvited.
    dialogRef.current?.focus();
    // Far enough down a long list, what they already have starts out of sight.
    if (many) listRef.current?.querySelector("[data-open]")?.scrollIntoView({ block: "nearest" });
    // Only on opening: after that the scroll position is theirs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const toggleOpen = (sectionId: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(sectionId)) next.add(sectionId);
      return next;
    });

  const toggleGroup = (groupId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(groupId)) next.add(groupId);
      return next;
    });

  /** Ticks a whole block of groups, or clears it when all of it is ticked. */
  const toggleMany = (ids: string[]) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const all = ids.every((id) => prev.has(id));
      for (const id of ids) {
        if (all) next.delete(id);
        else next.add(id);
      }
      return next;
    });

  /** Back to the top too: the results are a different list from the one scrolled. */
  const search = (value: string) => {
    setQuery(value);
    if (listRef.current) listRef.current.scrollTop = 0;
  };

  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const searching = terms.length > 0;
  const matches = (group: GroupRef, section: SectionRef) => {
    const text = `section ${section.name} ${group.name} ${group.faculty_name ?? ""}`.toLowerCase();
    const words = text.split(/[\s-]+/);
    // A lone letter means "Group A", not every "a" in an instructor's name.
    return terms.every((term) => (term.length > 1 ? text.includes(term) : words.some((w) => w.startsWith(term))));
  };
  const shownBlocks = blocks
    .map(({ section, list }) => ({
      section,
      list,
      shown: searching ? list.filter((g) => matches(g, section)) : list,
    }))
    .filter((block) => !searching || block.shown.length > 0);

  const students = groups.filter((g) => selected.has(g.id)).reduce((sum, g) => sum + g.member_count, 0);
  const moving = groups.filter((g) => selected.has(g.id) && g.faculty_id && g.faculty_id !== instructor.id).length;
  const released = groups.filter((g) => g.faculty_id === instructor.id && !selected.has(g.id)).length;
  const changes = [
    moving > 0 ? `${moving} ${moving === 1 ? "moves" : "move"} from another instructor` : null,
    released > 0 ? `${released} will have no instructor` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const save = async () => {
    setSaving(true);
    setError(null);
    const failure = await onSave([...selected]);
    setSaving(false);
    setError(failure);
  };

  return (
    // Hangs from the top rather than the middle, so opening a section leaves the rest where it was.
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 backdrop-blur-sm sm:pt-[7.5dvh]">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-groups-title"
        tabIndex={-1}
        // Important because the app-wide :focus-visible rule is unlayered and beats utilities.
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl! border border-hairline bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.12)] outline-none! sm:max-h-[85dvh]"
      >
        <div className="border-b border-hairline p-4">
          <div className="flex items-start justify-between gap-3">
            <h3 id="assign-groups-title" className="min-w-0 text-lg font-semibold text-gray-900 [overflow-wrap:anywhere]">
              Assign Groups to {instructor.name}
            </h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1 -mt-0.5 shrink-0 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              <FontAwesomeIcon icon={faTimes} className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            This instructor handles the students in the checked groups. A group has one instructor, so checking
            another&apos;s group moves it here.
          </p>
          {many && (
            <div className="relative mt-3">
              <FontAwesomeIcon
                icon={faSearch}
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => search(e.target.value)}
                onKeyDown={(e) => {
                  // The first Escape clears the search; only the next one closes the dialog.
                  if (e.key === "Escape" && query) {
                    e.stopPropagation();
                    search("");
                  }
                }}
                aria-label="Search by section, group or instructor"
                placeholder="Search groups or instructors"
                className="w-full rounded-xl border border-gray-200 bg-surface py-2 pl-9 pr-3 text-sm text-gray-800 placeholder:text-gray-500 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30"
              />
            </div>
          )}
        </div>

        <div ref={listRef} className="custom-scrollbar min-h-40 flex-1 overflow-y-auto">
          {sections.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-500">
              No sections yet. Create them on the{" "}
              <button
                type="button"
                onClick={() => router.push("/dean/instructors/assignment")}
                className="font-medium text-brand-600 hover:underline"
              >
                Sections page
              </button>
              .
            </p>
          ) : shownBlocks.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-500 [overflow-wrap:anywhere]">
              No groups match &ldquo;{query.trim()}&rdquo;.{" "}
              <button
                type="button"
                onClick={() => search("")}
                className="font-medium text-brand-600 hover:underline"
              >
                Clear search
              </button>
            </p>
          ) : (
            shownBlocks.map(({ section, list, shown }) => {
              if (list.length === 0) {
                return (
                  <div
                    key={section.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-hairline py-2.5 pl-[4.5rem] pr-4 text-sm last:border-b-0"
                  >
                    <span className="min-w-0 flex-1 basis-40 truncate font-semibold text-gray-500" title={section.name}>
                      Section {section.name}
                    </span>
                    <span className="shrink-0 text-xs text-gray-500">
                      No groups yet.{" "}
                      <button
                        type="button"
                        onClick={() => router.push("/dean/student-management")}
                        className="font-medium text-brand-600 hover:underline"
                      >
                        Create groups
                      </button>
                    </span>
                  </div>
                );
              }

              const isOpen = searching || open.has(section.id);
              const shownIds = shown.map((g) => g.id);
              const shownPicked = shownIds.filter((id) => selected.has(id)).length;
              const picked = list.filter((g) => selected.has(g.id)).length;
              const panelId = `assign-groups-section-${section.id}`;
              return (
                <section key={section.id} data-open={isOpen || undefined} className="border-b border-hairline last:border-b-0">
                  {/* Stays on top while its groups scroll by. */}
                  <div className="sticky top-0 z-10 flex items-center gap-3 bg-subtle px-4 py-2.5 text-sm shadow-[0_1px_0_var(--color-hairline)]">
                    {/* Covers the row, so anywhere on it but the checkbox opens the section. */}
                    {!searching && (
                      <button
                        type="button"
                        onClick={() => toggleOpen(section.id)}
                        aria-expanded={isOpen}
                        aria-controls={panelId}
                        aria-label={`Section ${section.name}`}
                        className="absolute inset-0 -outline-offset-2!"
                      />
                    )}
                    {/* A fixed box, so this checkbox lines up with the ones below it. */}
                    <span className={`pointer-events-none flex w-4 shrink-0 justify-center ${searching ? "invisible" : ""}`}>
                      <FontAwesomeIcon
                        icon={faChevronRight}
                        className={`h-3 w-3 text-gray-500 transition-transform duration-150 motion-reduce:transition-none ${
                          isOpen ? "rotate-90" : ""
                        }`}
                      />
                    </span>
                    <input
                      type="checkbox"
                      aria-label={`Select ${plural(shown.length, "group")} in Section ${section.name}`}
                      checked={shownPicked === shownIds.length}
                      ref={(el) => {
                        if (el) el.indeterminate = shownPicked > 0 && shownPicked < shownIds.length;
                      }}
                      onChange={() => toggleMany(shownIds)}
                      className="relative h-4 w-4 shrink-0 rounded text-brand-600 focus:ring-brand-600"
                    />
                    <span className="pointer-events-none min-w-0 flex-1 truncate font-semibold text-gray-900" title={section.name}>
                      Section {section.name}
                    </span>
                    <span
                      className={`pointer-events-none shrink-0 text-xs ${
                        picked > 0 ? "font-semibold text-brand-700" : "text-gray-500"
                      }`}
                    >
                      {picked > 0
                        ? `${picked} of ${list.length} selected`
                        : searching
                          ? `${shown.length} of ${list.length} shown`
                          : plural(list.length, "group")}
                    </span>
                  </div>

                  {isOpen && (
                    <div id={panelId}>
                      {shown.map((group) => {
                        const checked = selected.has(group.id);
                        const status = groupStatus(group, checked, instructor.id);
                        return (
                          <label
                            key={group.id}
                            className={`flex cursor-pointer items-center gap-3 border-t border-hairline py-2 pl-11 pr-4 transition-colors first:border-t-0 ${
                              checked ? "bg-brand-600/10" : "hover:bg-gray-50"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleGroup(group.id)}
                              className="h-4 w-4 shrink-0 rounded text-brand-600 focus:ring-brand-600"
                            />
                            {/* One line from sm up, in columns that line up across the list. */}
                            <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 sm:grid-cols-[minmax(0,1fr)_5rem_minmax(0,13rem)]">
                              <span
                                className={`truncate text-sm ${checked ? "font-semibold text-gray-900" : "font-medium text-gray-800"}`}
                                title={group.name}
                              >
                                {group.name}
                              </span>
                              <span className="whitespace-nowrap text-xs text-gray-500">
                                {plural(group.member_count, "student")}
                              </span>
                              {status && (
                                <span
                                  className={`col-span-2 truncate text-xs sm:col-span-1 ${
                                    status.warn ? "font-medium text-amber-700" : "text-gray-500"
                                  }`}
                                  title={status.text}
                                >
                                  {status.text}
                                </span>
                              )}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-hairline p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0" aria-live="polite">
            <p className="text-sm font-medium text-gray-700">
              {plural(selected.size, "group")} selected, {plural(students, "student")}
            </p>
            {changes && <p className="mt-0.5 text-xs font-medium text-amber-700">{changes}</p>}
            {error && <p className="mt-0.5 text-xs font-medium text-red-700">{error}</p>}
          </div>
          <div className="flex shrink-0 justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 transition-colors hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="rounded-xl bg-brand-600 px-4 py-2 font-medium text-white transition-all hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Groups"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
