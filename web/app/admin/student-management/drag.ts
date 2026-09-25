import type { DragEvent } from "react";

/**
 * Students are dragged between the not-in-a-group table and the group cards,
 * one at a time or several picked with Ctrl/Shift. The drag carries their ids
 * under its own type, so only students light up a drop target, not a stray
 * file or text selection.
 */
export const STUDENT_DRAG_TYPE = "application/x-icare-student";

export interface StudentDrag {
  studentIds: string[];
  fromGroupId: string | null;
  /** "Kenji P. Villanueva", or "3 students" when several are carried. */
  label: string;
}

export function startStudentDrag(
  e: DragEvent,
  students: { id: string; name: string }[],
  fromGroupId: string | null,
) {
  const label = students.length === 1 ? students[0].name : `${students.length} students`;
  const payload: StudentDrag = { studentIds: students.map((s) => s.id), fromGroupId, label };
  e.dataTransfer.setData(STUDENT_DRAG_TYPE, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = "move";
  setChipDragImage(e, label, students.length);
}

/**
 * The browser's default drag image is a ghost of the whole row, which for a
 * table row is a wide smear across the page. Drag a small chip instead: the
 * student's picture and name, or a count badge when carrying several.
 */
function setChipDragImage(e: DragEvent, label: string, count: number) {
  const chip = document.createElement("div");
  chip.style.cssText = [
    "position:fixed",
    "top:-1000px",
    "left:-1000px",
    "display:flex",
    "align-items:center",
    "gap:8px",
    "padding:6px 14px 6px 6px",
    "border-radius:9999px",
    "background:#ffffff",
    "border:1px solid #b7dfe6",
    "box-shadow:0 8px 24px rgba(15,23,42,0.18)",
    "font:600 13px/1.2 system-ui,-apple-system,sans-serif",
    "color:#0f172a",
    "white-space:nowrap",
  ].join(";");

  const source = count === 1 ? (e.currentTarget as HTMLElement).querySelector("img") : null;
  if (source) {
    const img = source.cloneNode() as HTMLImageElement;
    img.style.cssText = "width:28px;height:28px;border-radius:9999px;object-fit:cover;background:#f0f9fa";
    chip.appendChild(img);
  } else {
    const badge = document.createElement("span");
    badge.textContent =
      count > 1
        ? String(count)
        : label
            .split(/\s+/)
            .filter(Boolean)
            .map((w) => w[0])
            .slice(0, 2)
            .join("")
            .toUpperCase();
    badge.style.cssText =
      "display:flex;align-items:center;justify-content:center;min-width:28px;height:28px;padding:0 6px;border-radius:9999px;background:#1b6b7b;color:#fff;font-size:12px";
    chip.appendChild(badge);
  }
  const text = document.createElement("span");
  text.textContent = label;
  chip.appendChild(text);

  // The chip hangs below and to the right of the pointer, inside a clear
  // frame, so the cursor stays in plain sight instead of sitting on top of the
  // chip where it's hard to see.
  const frame = document.createElement("div");
  frame.style.cssText = "position:fixed;top:-1000px;left:-1000px;padding:22px 14px 14px 22px;background:transparent";
  chip.style.position = "static";
  frame.appendChild(chip);
  document.body.appendChild(frame);
  e.dataTransfer.setDragImage(frame, 0, 0);
  // The browser snapshots the frame at drag start, so it can go straight away.
  setTimeout(() => frame.remove(), 0);
}

export function isStudentDrag(e: DragEvent): boolean {
  return e.dataTransfer.types.includes(STUDENT_DRAG_TYPE);
}

export function readStudentDrag(e: DragEvent): StudentDrag | null {
  try {
    const raw = e.dataTransfer.getData(STUDENT_DRAG_TYPE);
    return raw ? (JSON.parse(raw) as StudentDrag) : null;
  } catch {
    return null;
  }
}

/** A drag leaving for one of the target's own children isn't really leaving it. */
export function leftTarget(e: DragEvent): boolean {
  return !(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget));
}
