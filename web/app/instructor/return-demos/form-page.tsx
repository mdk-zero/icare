"use client";

import type { CSSProperties } from "react";
import {
  formatFieldValue,
  formFields,
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

/**
 * A form's printed page with the student's answers written on it: each
 * written answer in its blank, each ticked box ticked and the chosen colour
 * band circled. Without answers it is the blank form. It scales with its
 * width; the answers are sized to the page, not the screen.
 */
export function FormPage({ form, answers, className = "" }: { form: ReturnDemoForm; answers?: FormRow; className?: string }) {
  const { width: W, height: H } = form.page;
  const pct = (place: PagePlace, w?: number, h?: number): CSSProperties => ({
    left: `${(place.x / W) * 100}%`,
    top: `${(place.y / H) * 100}%`,
    ...(w !== undefined ? { width: `${(w / W) * 100}%` } : {}),
    ...(h !== undefined ? { height: `${(h / H) * 100}%` } : {}),
  });
  const size = (pt: number) => `${(pt / W) * 100}cqw`;
  const marks: React.ReactNode[] = [];

  if (answers) {
    for (const field of formFields(form)) {
      const value = answers[field.key];
      if (value === null || value === undefined || value === "" || !isAsked(field, answers)) continue;
      if (field.at) {
        marks.push(
          <span
            key={field.key}
            title={`${field.label}: ${formatFieldValue(field, value)}`}
            className="absolute overflow-hidden text-ellipsis whitespace-nowrap font-semibold leading-none"
            style={{ ...pct(field.at, field.at.w), color: INK, fontSize: size(TEXT_PT) }}
          >
            {written(field, value)}
          </span>,
        );
        continue;
      }
      const picked = field.type === "multi" ? String(value).split(",") : [String(value)];
      for (const option of field.options ?? []) {
        if (!option.at || !picked.includes(option.value)) continue;
        const key = `${field.key}:${option.value}`;
        if (option.at.w && option.at.h) {
          // A colour band: circled, as the form asks.
          marks.push(
            <span
              key={key}
              title={`${field.label}: ${option.label}`}
              className="absolute rounded-[50%]"
              style={{
                ...pct({ x: option.at.x - 2, y: option.at.y - 1.5 }, option.at.w + 4, option.at.h + 3),
                border: `${size(1.3)} solid ${INK}`,
              }}
            />,
          );
        } else {
          marks.push(
            <span
              key={key}
              title={`${field.label}: ${option.label}`}
              className="absolute flex items-center justify-center font-bold leading-none"
              style={{ ...pct(option.at, BOX.w, BOX.h), color: INK, fontSize: size(TICK_PT) }}
            >
              ✓
            </span>,
          );
        }
      }
    }
  }

  return (
    <div
      className={`relative w-full overflow-hidden rounded-lg border border-hairline bg-white shadow-tile ${className}`}
      style={{ aspectRatio: `${W} / ${H}`, containerType: "inline-size" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a fixed page image, drawn over at exact points */}
      <img
        src={`/forms/${form.page.image}`}
        alt={answers ? `${form.title}, filled in` : `${form.title}, blank`}
        className="absolute inset-0 h-full w-full select-none"
        draggable={false}
      />
      <div aria-hidden className="absolute inset-0">
        {marks}
      </div>
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
