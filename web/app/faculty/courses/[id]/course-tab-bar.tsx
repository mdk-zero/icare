"use client";

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import type { CourseTab } from "../course-tabs";

export interface CourseTabDef {
  id: CourseTab;
  label: string;
  icon: IconDefinition;
  count: number;
}

export interface CourseTabAction {
  icon: IconDefinition;
  text: string;
  /** Read aloud and shown on hover; says why when disabled. */
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export const COURSE_TAB_PANEL_ID = "course-tab-panel";
export const courseTabId = (tab: CourseTab) => `course-tab-${tab}`;

/**
 * The course page's tabs, with the open tab's action (Add Requirement, Edit
 * Skills) at the row's far end. The row has a fixed height, so a tab with
 * no action takes the same room as one with, and switching tabs moves
 * nothing on the page. One underline slides to the open tab.
 *
 * Keyboard: the tabs are one stop; arrows, Home and End move between them.
 */
export default function CourseTabBar({
  tabs,
  active,
  onChange,
  action,
}: {
  tabs: CourseTabDef[];
  active: CourseTab;
  onChange: (tab: CourseTab) => void;
  action?: CourseTabAction;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Partial<Record<CourseTab, HTMLButtonElement | null>>>({});
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null);

  // Measured before paint, and again whenever the row resizes (a font
  // loading, the window narrowing), so the underline sits under its tab.
  useLayoutEffect(() => {
    const place = () => {
      const el = tabRefs.current[active];
      if (el) setBar({ left: el.offsetLeft, width: el.offsetWidth });
    };
    place();
    const observer = new ResizeObserver(place);
    if (listRef.current) observer.observe(listRef.current);
    return () => observer.disconnect();
  }, [active]);

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const target = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (target === undefined) return;
    e.preventDefault();
    const next = tabs[(target + tabs.length) % tabs.length];
    onChange(next.id);
    tabRefs.current[next.id]?.focus();
  };

  return (
    <div className="mb-4 flex h-12 items-stretch gap-2 shadow-[inset_0_-1px_0_var(--color-hairline)]">
      <div ref={listRef} role="tablist" aria-label="Course" className="relative flex min-w-0 flex-1 items-stretch gap-1 sm:flex-none">
        {tabs.map((t, i) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              id={courseTabId(t.id)}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={COURSE_TAB_PANEL_ID}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(t.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-t-lg px-2 text-sm font-medium outline-none transition-colors focus-visible:bg-brand-600/10 sm:flex-none sm:px-3.5 ${
                on ? "text-brand-700" : "text-gray-500 hover:bg-subtle hover:text-gray-800"
              }`}
            >
              <span className="hidden sm:inline-flex" aria-hidden>
                <FontAwesomeIcon icon={t.icon} className="h-3.5 w-3.5" />
              </span>
              {t.label}
              <span
                className={`hidden rounded-full px-1.5 text-[11px] font-semibold tabular-nums transition-colors sm:inline ${
                  on ? "bg-brand-600/10 text-brand-700" : "bg-gray-100 text-gray-500"
                }`}
              >
                {t.count}
              </span>
            </button>
          );
        })}
        {bar && (
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-0 h-0.5 rounded-full bg-brand-600 transition-[left,width] duration-300 ease-out"
            style={{ left: bar.left, width: bar.width }}
          />
        )}
      </div>

      {action && (
        <div className="ml-auto flex shrink-0 items-center">
          <button
            type="button"
            onClick={action.onClick}
            disabled={action.disabled}
            aria-label={action.label}
            title={action.label}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-600 px-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-45 disabled:hover:bg-brand-600 sm:px-3.5"
          >
            <FontAwesomeIcon icon={action.icon} className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{action.text}</span>
          </button>
        </div>
      )}
    </div>
  );
}
