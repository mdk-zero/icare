"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faEllipsisVertical } from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

export type MenuAction = {
  label: string;
  icon: IconDefinition;
  onClick: () => void;
  /** Destructive items read red and sit below a divider. */
  danger?: boolean;
};

/**
 * A set of actions collapsed behind one trigger.
 *
 * The menu renders in a portal because callers clip their content (rounded
 * cards with overflow-hidden, scrolling table wrappers), so an in-flow dropdown
 * would be cut off; it is positioned from the trigger's rect and flips above
 * when there is no room below. Scroll or resize closes it rather than chasing
 * the trigger with a fixed element.
 *
 * `block` fills its container (card footers); `compact` is an icon-only trigger
 * sized for a table's actions cell.
 */
export default function ActionsMenu({
  actions,
  variant = "block",
  label = "Actions",
}: {
  actions: MenuAction[];
  variant?: "block" | "compact";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; flip: boolean } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const menuHeight = 44 * actions.length + 8;
    const flip = r.bottom + 6 + menuHeight > window.innerHeight && r.top - menuHeight > 0;
    setCoords({ top: flip ? r.top - 6 : r.bottom + 6, left: r.right, flip });
  }, [actions.length]);

  useEffect(() => {
    if (!open) return;
    place();
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, place]);

  return (
    <>
      {variant === "compact" ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={label}
          title={label}
          className={`flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 ${
            open ? "bg-gray-100 text-gray-700" : ""
          }`}
        >
          <FontAwesomeIcon icon={faEllipsisVertical} className="w-4 h-4" />
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-brand-600/20 py-2 text-sm font-medium text-brand-600 transition-colors hover:border-brand-600/40 hover:bg-brand-600/5"
        >
          {label}
          <FontAwesomeIcon
            icon={faChevronDown}
            className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      )}

      {open &&
        coords &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              transform: coords.flip ? "translate(-100%, -100%)" : "translateX(-100%)",
            }}
            className="z-50 min-w-44 overflow-hidden rounded-xl border border-hairline bg-surface py-1 shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
          >
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  action.onClick();
                }}
                className={`group flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition-colors ${
                  action.danger
                    ? "border-t border-hairline text-rose-600 hover:bg-rose-50"
                    : "text-gray-700 hover:bg-brand-600/5 hover:text-brand-700"
                }`}
              >
                <FontAwesomeIcon
                  icon={action.icon}
                  className={`w-4 h-4 transition-colors ${
                    action.danger ? "text-rose-500" : "text-gray-400 group-hover:text-brand-600"
                  }`}
                />
                {action.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
