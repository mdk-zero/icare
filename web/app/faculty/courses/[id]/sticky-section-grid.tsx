"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

/** Marks a group heading row in the body, for the sticky header to follow. */
export const GROUP_ROW_ATTR = "data-group-row";

/**
 * One section of a wide grid whose heading stays in view while the page
 * scrolls: the section title, the column headers and the group being read
 * stick just under the course tab bar.
 *
 * The grid scrolls sideways, and a box that scrolls sideways can't also hold
 * a header that sticks to the page, so the header is a second table above the
 * body. Both share one column layout (`colgroup`, fixed table layout, one
 * width) and the header follows the body's sideways scroll, so their columns
 * always line up.
 */
export default function StickySectionGrid({
  label,
  heading,
  colgroup,
  head,
  width,
  children,
}: {
  /** Read aloud for the section, e.g. "Section BSN 3101". */
  label: string;
  /** The section's title row. */
  heading: ReactNode;
  /** The same <colgroup> for the header table and the body table. */
  colgroup: ReactNode;
  /** The <thead>. */
  head: ReactNode;
  /** The grid's natural width; it grows to fill wider screens. */
  width: string;
  /** The <tbody>; group heading rows carry GROUP_ROW_ATTR with their label. */
  children: ReactNode;
}) {
  const headRef = useRef<HTMLDivElement>(null);
  const headScrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [group, setGroup] = useState<string | null>(null);

  // The header follows the body sideways.
  const onBodyScroll = () => {
    if (headScrollRef.current && bodyRef.current)
      headScrollRef.current.scrollLeft = bodyRef.current.scrollLeft;
  };

  // The group whose heading has scrolled up under the sticky header is shown
  // in it, so a long group's rows are never read without their group.
  useEffect(() => {
    const body = bodyRef.current;
    const headEl = headRef.current;
    if (!body || !headEl) return;
    let scroller: HTMLElement | null = body.parentElement;
    while (
      scroller &&
      !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)
    )
      scroller = scroller.parentElement;
    const target: HTMLElement | Window = scroller ?? window;
    let frame = 0;
    const update = () => {
      frame = 0;
      const bottom = headEl.getBoundingClientRect().bottom;
      let current: string | null = null;
      for (const row of body.querySelectorAll<HTMLElement>(
        `[${GROUP_ROW_ATTR}]`,
      )) {
        if (row.getBoundingClientRect().top < bottom - 1)
          current = row.getAttribute(GROUP_ROW_ATTR);
        else break;
      }
      setGroup(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    target.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      target.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const tableStyle: CSSProperties = {
    width: `max(100%, ${width})`,
    tableLayout: "fixed",
  };

  return (
    <section aria-label={label} className="relative">
      {/* Just under the course tab bar (h-12, itself pinned at -top-3 / lg:-top-5). */}
      <div ref={headRef} className="sticky top-9 z-20 bg-canvas pt-2 lg:top-7">
        <div className="pb-2">{heading}</div>
        <div
          ref={headScrollRef}
          className="overflow-hidden rounded-t-xl border-x border-t border-hairline bg-subtle"
        >
          <table
            className="border-separate border-spacing-0 text-sm"
            style={tableStyle}
          >
            {colgroup}
            {head}
          </table>
        </div>
        {group && (
          // "Group B · 5 students": the group's name as the rows show it, then its size.
          <div className="border-x border-b border-hairline bg-subtle px-4 py-1.5 text-[11px] shadow-sm">
            <span className="font-semibold uppercase tracking-wider text-gray-500">{group.split(" · ")[0]}</span>
            <span className="ml-2 font-medium text-gray-400">{group.split(" · ").slice(1).join(" · ")}</span>
          </div>
        )}
      </div>
      <div
        ref={bodyRef}
        onScroll={onBodyScroll}
        className="overflow-x-auto rounded-b-xl border-x border-b border-hairline bg-surface"
      >
        <table
          className="border-separate border-spacing-0 text-sm"
          style={tableStyle}
        >
          {colgroup}
          {children}
        </table>
      </div>
    </section>
  );
}
