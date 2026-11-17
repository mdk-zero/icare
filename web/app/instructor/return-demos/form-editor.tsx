"use client";

import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCrosshairs,
  faFileCircleCheck,
  faPlus,
  faTrashCan,
  faTriangleExclamation,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { saveCustomForm, type CustomForm, type ReadFormDraft } from "../../lib/api";
import type { FormField, FormFieldType, FormOption, FormSection, PagePlace } from "../../lib/return-demo-forms";
import { EcgLoader } from "../../components/EcgLoader";
import { FormPage, type PageMarker } from "./form-page";

const TYPES: { value: FormFieldType; label: string }[] = [
  { value: "text", label: "Short text" },
  { value: "longtext", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "bp", label: "Blood pressure" },
  { value: "choice", label: "One choice" },
  { value: "multi", label: "Checkboxes" },
];

/** What a click on the page places next: a field's written answer, or one option's tick. */
type Target = { s: number; f: number; o?: number } | null;

let made = 0;
const newKey = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${made++}`;
const inputClass =
  "w-full rounded-lg border border-gray-200 bg-surface px-2.5 py-1.5 text-sm text-gray-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20";

/**
 * Checking a form read from an uploaded PDF before it is kept (095): the pages
 * on the left, with a mark wherever an answer goes, and the fields on the
 * right, which can be renamed, retyped, removed or added. "Place" then a click
 * on the page sets where a field's answer (or an option's tick) is written.
 */
export default function FormEditor({
  draft,
  onSaved,
  onClose,
}: {
  draft: ReadFormDraft;
  onSaved: (form: CustomForm) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(draft.title);
  const [description, setDescription] = useState(draft.description);
  const [sections, setSections] = useState<FormSection[]>(() => structuredClone(draft.sections));
  const [target, setTarget] = useState<Target>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (target) setTarget(null);
      else if (!saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, saving, onClose]);

  const fieldCount = sections.reduce((n, s) => n + s.fields.length, 0);
  const placed = sections.reduce(
    (n, s) => n + s.fields.filter((f) => f.at || f.options?.some((o) => o.at)).length,
    0,
  );

  const markers = useMemo<PageMarker[]>(() => {
    const out: PageMarker[] = [];
    sections.forEach((s, si) =>
      s.fields.forEach((f, fi) => {
        const active = target?.s === si && target.f === fi;
        if (f.at) out.push({ id: f.key, page: f.at.page ?? 0, x: f.at.x, y: f.at.y, w: f.at.w ?? 120, label: f.label, active: active && target?.o === undefined });
        f.options?.forEach((o, oi) => {
          if (o.at) out.push({ id: `${f.key}:${o.value}`, page: o.at.page ?? 0, x: o.at.x, y: o.at.y, w: 8, label: `${f.label}: ${o.label}`, active: active && target?.o === oi });
        });
      }),
    );
    return out;
  }, [sections, target]);

  const pageForm = useMemo(
    () => ({ key: "draft", title: title || "Form", description, source: "", page: draft.pages[0], pages: draft.pages, sections }),
    [title, description, draft.pages, sections],
  );

  const updateField = (si: number, fi: number, patch: Partial<FormField>) =>
    setSections((prev) =>
      prev.map((s, i) => (i !== si ? s : { ...s, fields: s.fields.map((f, j) => (j === fi ? { ...f, ...patch } : f)) })),
    );
  const updateOption = (si: number, fi: number, oi: number, patch: Partial<FormOption>) =>
    updateField(si, fi, {
      options: sections[si].fields[fi].options?.map((o, k) => (k === oi ? { ...o, ...patch } : o)),
    });

  const changeType = (si: number, fi: number, type: FormFieldType) => {
    const field = sections[si].fields[fi];
    const choosing = type === "choice" || type === "multi";
    updateField(si, fi, {
      type,
      // A choice needs options; a written answer has none.
      options: choosing
        ? field.options?.length
          ? field.options
          : [
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ]
        : undefined,
      unit: type === "number" || type === "bp" ? field.unit ?? (type === "bp" ? "mmHg" : undefined) : undefined,
    });
  };

  const removeField = (si: number, fi: number) => {
    setTarget(null);
    setSections((prev) =>
      prev
        .map((s, i) => (i !== si ? s : { ...s, fields: s.fields.filter((_, j) => j !== fi) }))
        .filter((s) => s.fields.length > 0 || prev.length === 1),
    );
  };

  const addField = (si: number) =>
    setSections((prev) =>
      prev.map((s, i) => (i !== si ? s : { ...s, fields: [...s.fields, { key: newKey("field"), label: "", type: "text" }] })),
    );

  const pick = (page: number, x: number, y: number) => {
    if (!target) return;
    const { s, f, o } = target;
    if (o !== undefined) {
      // The tick is drawn on a box about 7 x 11 points, centred on the click.
      updateOption(s, f, o, { at: { page, x: x - 3.4, y: y - 5.3 } });
    } else {
      const field = sections[s].fields[f];
      const at: PagePlace = { page, x, y: y - 5, w: field.at?.w ?? 120 };
      updateField(s, f, { at });
    }
    setTarget(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const cleaned = sections
      .map((s) => ({ ...s, fields: s.fields.filter((f) => f.label.trim()) }))
      .filter((s) => s.fields.length > 0);
    const result = await saveCustomForm({ title: title.trim(), description: description.trim(), pages: draft.pages, sections: cleaned });
    setSaving(false);
    if (result.error || !result.form) {
      setError(result.error ?? "Unable to save the form");
      return;
    }
    onSaved(result.form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-5" onClick={saving ? undefined : onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="form-editor-title"
        className="flex h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-hairline bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-hairline bg-subtle px-5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-600/10">
              <FontAwesomeIcon icon={faFileCircleCheck} className="h-5 w-5 text-brand-600" />
            </span>
            <div className="min-w-0">
              <h2 id="form-editor-title" className="font-display text-lg font-bold text-gray-900">
                Check the form
              </h2>
              <p className="text-xs text-gray-500">
                {fieldCount} field{fieldCount === 1 ? "" : "s"} found, {placed} placed on the page. Fix anything wrong, remove what students
                shouldn&apos;t fill in, then save.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100">
            <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_28rem]">
          <div className="min-h-0 overflow-y-auto bg-gray-50/70 p-4">
            {target && (
              <p className="sticky top-0 z-10 mb-3 flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow-tile">
                <FontAwesomeIcon icon={faCrosshairs} className="h-3.5 w-3.5" />
                Click the page where{" "}
                {target.o !== undefined
                  ? `the box for “${sections[target.s].fields[target.f].options?.[target.o]?.label}” is`
                  : `“${sections[target.s].fields[target.f].label || "this field"}” is written`}
                . Esc to cancel.
              </p>
            )}
            <FormPage form={pageForm} markers={markers} onPick={target ? pick : undefined} className="mx-auto max-w-3xl" />
          </div>

          <div className="flex min-h-0 flex-col border-t border-hairline lg:border-l lg:border-t-0">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              {draft.scanned && (
                <p className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-800">
                  <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  This PDF is a scan, so the fields were read from the picture and have no place on the page yet. Use Place to put each
                  one where it&apos;s written, or leave it: answers without a place show in the list beside the form.
                </p>
              )}
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-gray-700">Form title</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={inputClass} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-gray-700">
                  Description <span className="font-normal text-gray-400">(optional)</span>
                </span>
                <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={600} className={inputClass} />
              </label>

              {sections.map((section, si) => (
                <section key={si} className="rounded-xl border border-hairline">
                  <div className="flex items-center gap-2 border-b border-hairline bg-subtle px-3 py-2">
                    <input
                      value={section.title}
                      onChange={(e) => setSections((prev) => prev.map((s, i) => (i === si ? { ...s, title: e.target.value } : s)))}
                      aria-label="Section title"
                      className="min-w-0 flex-1 bg-transparent text-sm font-bold text-gray-900 focus:outline-none"
                    />
                    <span className="text-[11px] text-gray-500 tabular-nums">{section.fields.length}</span>
                  </div>
                  <ol className="divide-y divide-hairline">
                    {section.fields.map((field, fi) => {
                      const choosing = field.type === "choice" || field.type === "multi";
                      const selected = target?.s === si && target.f === fi;
                      return (
                        <li key={field.key} className={`space-y-2 px-3 py-2.5 ${selected ? "bg-brand-600/5" : ""}`}>
                          <div className="flex items-center gap-2">
                            <input
                              value={field.label}
                              onChange={(e) => updateField(si, fi, { label: e.target.value })}
                              placeholder="What the student fills in"
                              aria-label="Field label"
                              className={inputClass}
                            />
                            <button
                              type="button"
                              onClick={() => removeField(si, fi)}
                              aria-label={`Remove ${field.label || "this field"}`}
                              title="Remove: students won't fill this in"
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                            >
                              <FontAwesomeIcon icon={faTrashCan} className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              value={field.type}
                              onChange={(e) => changeType(si, fi, e.target.value as FormFieldType)}
                              aria-label="Field type"
                              className="rounded-lg border border-gray-200 bg-surface px-2 py-1 text-xs text-gray-700"
                            >
                              {TYPES.map((t) => (
                                <option key={t.value} value={t.value}>
                                  {t.label}
                                </option>
                              ))}
                            </select>
                            {(field.type === "number" || field.type === "bp") && (
                              <input
                                value={field.unit ?? ""}
                                onChange={(e) => updateField(si, fi, { unit: e.target.value || undefined })}
                                placeholder="Unit"
                                aria-label="Unit"
                                className="w-20 rounded-lg border border-gray-200 bg-surface px-2 py-1 text-xs"
                              />
                            )}
                            <label className="flex items-center gap-1 text-xs text-gray-600">
                              <input
                                type="checkbox"
                                checked={!!field.required}
                                onChange={(e) => updateField(si, fi, { required: e.target.checked || undefined })}
                                className="accent-brand-600"
                              />
                              Required
                            </label>
                            {!choosing && (
                              <PlaceButton
                                placed={!!field.at}
                                active={selected && target?.o === undefined}
                                onClick={() => setTarget(selected && target?.o === undefined ? null : { s: si, f: fi })}
                              />
                            )}
                          </div>
                          {choosing && (
                            <ul className="space-y-1.5 border-l-2 border-gray-200 pl-2.5">
                              {(field.options ?? []).map((option, oi) => (
                                <li key={oi} className="flex items-center gap-1.5">
                                  <input
                                    value={option.label}
                                    onChange={(e) => updateOption(si, fi, oi, { label: e.target.value })}
                                    aria-label="Option"
                                    className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-surface px-2 py-1 text-xs"
                                  />
                                  <PlaceButton
                                    placed={!!option.at}
                                    active={selected && target?.o === oi}
                                    onClick={() => setTarget(selected && target?.o === oi ? null : { s: si, f: fi, o: oi })}
                                  />
                                  <button
                                    type="button"
                                    disabled={(field.options ?? []).length <= 2}
                                    onClick={() => updateField(si, fi, { options: field.options?.filter((_, k) => k !== oi) })}
                                    aria-label={`Remove ${option.label}`}
                                    className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:text-red-600 disabled:opacity-30"
                                  >
                                    <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
                                  </button>
                                </li>
                              ))}
                              <li>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateField(si, fi, {
                                      options: [...(field.options ?? []), { value: newKey("option"), label: `Option ${(field.options?.length ?? 0) + 1}` }],
                                    })
                                  }
                                  className="text-xs font-semibold text-brand-700 hover:underline"
                                >
                                  + Add option
                                </button>
                              </li>
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                  <button
                    type="button"
                    onClick={() => addField(si)}
                    className="flex w-full items-center justify-center gap-1.5 border-t border-dashed border-hairline py-2 text-xs font-semibold text-brand-700 hover:bg-brand-600/5"
                  >
                    <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
                    Add field
                  </button>
                </section>
              ))}
              <button
                type="button"
                onClick={() => setSections((prev) => [...prev, { title: `Part ${prev.length + 1}`, fields: [{ key: newKey("field"), label: "", type: "text" }] }])}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
                Add section
              </button>
            </div>

            <div className="border-t border-hairline px-4 py-3">
              {error && <p className="mb-2 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={saving}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving || !title.trim() || fieldCount === 0}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {saving && <EcgLoader />}
                  Save form
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlaceButton({ placed, active, onClick }: { placed: boolean; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title="Click, then click the page where this goes"
      className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors ${
        active
          ? "bg-brand-600 text-white"
          : placed
            ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            : "bg-amber-50 text-amber-700 hover:bg-amber-100"
      }`}
    >
      <FontAwesomeIcon icon={faCrosshairs} className="h-3 w-3" />
      {active ? "Click the page" : placed ? "Placed" : "Place"}
    </button>
  );
}
