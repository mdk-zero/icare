"use client";

import type { CSSProperties } from "react";
import {
  formatFieldValue,
  formFields,
  formPages,
  isAsked,
  type FormField,
  type FormRow,
  type PagePlace,
  type ReturnDemoForm,
} from "../../lib/return-demo-forms";

/** The ink the answers are written in, like a blue ballpen on the paper form. */
const INK = "#1d3fbf";
/** The size of a written answer and of a tick, in PDF points. */
const TEXT_PT = 7.4;
const TICK_PT = 10.5;
/** A printed ☐ is about this big, in points. */
const BOX = { w: 6.8, h: 10.6 };

/** What is written in a blank: the form already prints the units. */
function written(field: FormField, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  if (field.type === "number" || field.type === "bp") return String(value);
  return formatFieldValue(field, value);
}

/** A built-in page's file name, or an uploaded page's full URL. */
const pageSrc = (image: string) => (/^https?:\/\//.test(image) ? image : `/forms/${image}`);

/** A spot the editor marks on a page: where a field's answer, or an option's tick, goes. */
export interface PageMarker {
  id: string;
  page: number;
  x: number;
  y: number;
  w?: number;
  label: string;
  active?: boolean;
}

/**
 * A form's printed pages with the student's answers written on them: each
 * written answer in its blank, each ticked box ticked and the chosen colour
 * band circled. Without answers it is the blank form. It scales with its
 * width; the answers are sized to the page, not the screen. For the form
 * editor, `markers` shows where each answer goes and `onPick` reports a
 * click on a page, in points.
 */
export function FormPage({
  form,
  answers,
  className = "",
  markers,
  onPick,
}: {
  form: ReturnDemoForm;
  answers?: FormRow;
  className?: string;
  markers?: PageMarker[];
  onPick?: (page: number, x: number, y: number) => void;
}) {
  const pages = formPages(form);
  const marks: { page: number; node: React.ReactNode }[] = [];
  const pageOf = (place: PagePlace) => place.page ?? 0;

  const pct = (page: number, place: PagePlace, w?: number, h?: number): CSSProperties => {
    const { width: W, height: H } = pages[page] ?? pages[0];
    return {
      left: `${(place.x / W) * 100}%`,
      top: `${(place.y / H) * 100}%`,
      ...(w !== undefined ? { width: `${(w / W) * 100}%` } : {}),
      ...(h !== undefined ? { height: `${(h / H) * 100}%` } : {}),
    };
  };
  const size = (page: number, pt: number) => `${(pt / (pages[page] ?? pages[0]).width) * 100}cqw`;

  if (answers) {
    for (const field of formFields(form)) {
      const value = answers[field.key];
      if (value === null || value === undefined || value === "" || !isAsked(field, answers)) continue;
      if (field.at) {
        const page = pageOf(field.at);
        marks.push({
          page,
          node: (
            <span
              key={field.key}
              title={`${field.label}: ${formatFieldValue(field, value)}`}
              className="absolute overflow-hidden text-ellipsis whitespace-nowrap font-semibold leading-none"
              style={{ ...pct(page, field.at, field.at.w ?? 120), color: INK, fontSize: size(page, TEXT_PT) }}
            >
              {written(field, value)}
            </span>
          ),
        });
        continue;
      }
      const picked = field.type === "multi" ? String(value).split(",") : [String(value)];
      for (const option of field.options ?? []) {
        if (!option.at || !picked.includes(option.value)) continue;
        const key = `${field.key}:${option.value}`;
        const page = pageOf(option.at);
        marks.push({
          page,
          node:
            option.at.w && option.at.h ? (
              // A colour band: circled, as the form asks.
              <span
                key={key}
                title={`${field.label}: ${option.label}`}
                className="absolute rounded-[50%]"
                style={{
                  ...pct(page, { x: option.at.x - 2, y: option.at.y - 1.5 }, option.at.w + 4, option.at.h + 3),
                  border: `${size(page, 1.3)} solid ${INK}`,
                }}
              />
            ) : (
              <span
                key={key}
                title={`${field.label}: ${option.label}`}
                className="absolute flex items-center justify-center font-bold leading-none"
                style={{ ...pct(page, option.at, BOX.w, BOX.h), color: INK, fontSize: size(page, TICK_PT) }}
              >
                ✓
              </span>
            ),
        });
      }
    }
  }

  return (
    <div className={`w-full space-y-3 ${className}`}>
      {pages.map((p, n) => (
        <div
          key={n}
          className={`relative w-full overflow-hidden rounded-lg border border-hairline bg-white shadow-tile ${onPick ? "cursor-crosshair" : ""}`}
          style={{ aspectRatio: `${p.width} / ${p.height}`, containerType: "inline-size" }}
          onClick={
            onPick
              ? (e) => {
                  const box = e.currentTarget.getBoundingClientRect();
                  onPick(n, ((e.clientX - box.left) / box.width) * p.width, ((e.clientY - box.top) / box.height) * p.height);
                }
              : undefined
          }
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a page picture, drawn over at exact points */}
          <img
            src={pageSrc(p.image)}
            alt={`${form.title}${pages.length > 1 ? `, page ${n + 1}` : ""}${answers ? ", filled in" : ""}`}
            className="absolute inset-0 h-full w-full select-none"
            draggable={false}
          />
          <div aria-hidden className="absolute inset-0">
            {marks.filter((m) => m.page === n).map((m) => m.node)}
            {(markers ?? [])
              .filter((m) => m.page === n)
              .map((m) => (
                <span
                  key={m.id}
                  title={m.label}
                  className={`absolute -translate-y-1/2 rounded border-2 ${
                    m.active ? "border-brand-600 bg-brand-600/25 ring-2 ring-brand-600/30" : "border-amber-500 bg-amber-300/25"
                  }`}
                  style={{ ...pct(n, { x: m.x, y: m.y + 4 }, m.w ?? 10), height: size(n, 11) }}
                />
              ))}
          </div>
          {pages.length > 1 && (
            <span className="absolute bottom-2 right-2 rounded-full bg-gray-900/70 px-2 py-0.5 text-[11px] font-semibold text-white">
              Page {n + 1} of {pages.length}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/** The same answers as a list by section, easy to read and to search; follow-ups not asked are left out. */
export function FormAnswers({ form, answers }: { form: ReturnDemoForm; answers: FormRow }) {
  return (
    <div className="space-y-4">
      {form.sections.map((section) => {
        const fields = section.fields.filter((f) => isAsked(f, answers));
        return (
          <section key={section.title}>
            <h4 className="mb-1.5 text-xs font-bold text-brand-700">{section.title}</h4>
            <dl className="divide-y divide-hairline rounded-lg border border-hairline">
              {fields.map((f) => {
                const shown = formatFieldValue(f, answers[f.key]);
                const option = f.type === "choice" ? f.options?.find((o) => o.value === answers[f.key]) : undefined;
                return (
                  <div key={f.key} className="flex gap-3 px-3 py-1.5 text-sm">
                    <dt className="min-w-0 flex-1 text-gray-600">{f.label}</dt>
                    <dd className={`flex max-w-[55%] items-center gap-1.5 text-right ${shown === "—" ? "text-gray-400" : "font-medium text-gray-900"}`}>
                      {option?.color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: option.color }} />}
                      {shown}
                      {option?.detail && <span className="text-xs font-normal text-gray-500">{option.detail}</span>}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        );
      })}
    </div>
  );
}
