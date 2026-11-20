"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faHeartPulse, faStopwatch } from "@fortawesome/free-solid-svg-icons";
import type { PatientCase } from "../../lib/ai/scenario";
import { MAX_TIME_LIMIT_MINUTES, timeLimitLabel } from "../../lib/activity-time";

const inputClassName =
  "w-full px-3.5 py-2.5 bg-surface border border-gray-300 rounded-lg text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-600/25 focus:border-brand-600 transition-all text-sm";

const labelClassName = "block text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-600 mb-1.5";

/** A case with nothing written in it yet. */
export const EMPTY_PATIENT_CASE: PatientCase = {
  patient: { name: "", age: null, sex: "" },
  chief_complaint: "",
  vitals: { heart_rate: null, blood_pressure: "", temperature: null, respiratory_rate: null, oxygen_saturation: null },
  medical_history: "",
  physical_exam: "",
  diagnosis: "",
  treatment_plan: "",
};

/** A saved or AI-drafted case as the form holds it, every field present. */
export function patientCaseForm(value: unknown): PatientCase {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<PatientCase>;
  return {
    ...EMPTY_PATIENT_CASE,
    ...raw,
    patient: { ...EMPTY_PATIENT_CASE.patient!, ...(raw.patient ?? {}) },
    vitals: { ...EMPTY_PATIENT_CASE.vitals, ...(raw.vitals ?? {}) },
  };
}

const VITALS: { key: keyof Omit<PatientCase["vitals"], "blood_pressure">; label: string; unit: string; step?: string }[] = [
  { key: "heart_rate", label: "HR", unit: "bpm" },
  { key: "temperature", label: "Temp", unit: "°C", step: "0.1" },
  { key: "respiratory_rate", label: "RR", unit: "/min" },
  { key: "oxygen_saturation", label: "SpO₂", unit: "%" },
];

const SEXES = ["Female", "Male"];

const toNumber = (text: string) => (text.trim() === "" || !Number.isFinite(Number(text)) ? null : Number(text));

/**
 * The patient the instructor writes into a patient case: who they are and the
 * state they are in, which students read before they perform the tasks.
 */
export function PatientFields({
  value,
  onChange,
  disabled,
}: {
  value: PatientCase;
  onChange: (next: PatientCase) => void;
  disabled?: boolean;
}) {
  const patient = value.patient ?? EMPTY_PATIENT_CASE.patient!;
  const setPatient = (p: Partial<NonNullable<PatientCase["patient"]>>) => onChange({ ...value, patient: { ...patient, ...p } });
  const setVital = (key: keyof PatientCase["vitals"], v: number | string | null) =>
    onChange({ ...value, vitals: { ...value.vitals, [key]: v } });

  return (
    <fieldset disabled={disabled} className="space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-3 sm:grid-cols-[minmax(0,1fr)_5.5rem_auto]">
        <div>
          <label htmlFor="patient-name" className={labelClassName}>
            Name <span className="text-red-600">*</span>
          </label>
          <input
            id="patient-name"
            type="text"
            value={patient.name}
            onChange={(e) => setPatient({ name: e.target.value })}
            placeholder="e.g. Maria Santos"
            maxLength={120}
            className={inputClassName}
          />
        </div>
        <div>
          <label htmlFor="patient-age" className={labelClassName}>
            Age
          </label>
          <input
            id="patient-age"
            type="number"
            inputMode="numeric"
            min={0}
            max={130}
            value={patient.age ?? ""}
            onChange={(e) => setPatient({ age: toNumber(e.target.value) })}
            className={inputClassName + " tabular-nums"}
          />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <span className={labelClassName}>Sex</span>
          <div role="radiogroup" aria-label="Sex" className="flex rounded-lg border border-gray-300 p-0.5">
            {SEXES.map((s) => {
              const on = patient.sex === s;
              return (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setPatient({ sex: on ? "" : s })}
                  className={`flex-1 rounded-md px-3 py-[7px] text-sm font-medium transition-colors ${
                    on ? "bg-brand-600 text-white" : "text-gray-600 hover:bg-subtle"
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="patient-state" className={labelClassName}>
          Condition now
        </label>
        <textarea
          id="patient-state"
          value={value.chief_complaint}
          onChange={(e) => onChange({ ...value, chief_complaint: e.target.value })}
          rows={2}
          placeholder="e.g. Day 1 after abdominal surgery, restless, says it is hard to breathe"
          className={inputClassName + " resize-none"}
        />
      </div>

      <div className="rounded-xl border border-hairline bg-subtle/60 p-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-700">
          <FontAwesomeIcon icon={faHeartPulse} className="h-3.5 w-3.5 text-brand-600" aria-hidden />
          Vital signs
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <VitalInput label="BP" unit="mmHg">
            <input
              type="text"
              value={value.vitals.blood_pressure}
              onChange={(e) => setVital("blood_pressure", e.target.value)}
              placeholder="120/80"
              aria-label="Blood pressure"
              className="w-full min-w-0 bg-transparent text-sm font-semibold tabular-nums text-gray-900 placeholder:font-normal placeholder:text-gray-400 focus:outline-none"
            />
          </VitalInput>
          {VITALS.map((v) => (
            <VitalInput key={v.key} label={v.label} unit={v.unit}>
              <input
                type="number"
                inputMode="decimal"
                step={v.step ?? "1"}
                value={value.vitals[v.key] ?? ""}
                onChange={(e) => setVital(v.key, toNumber(e.target.value))}
                aria-label={v.label}
                className="w-full min-w-0 bg-transparent text-sm font-semibold tabular-nums text-gray-900 focus:outline-none"
              />
            </VitalInput>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="patient-diagnosis" className={labelClassName}>
            Diagnosis
          </label>
          <input
            id="patient-diagnosis"
            type="text"
            value={value.diagnosis}
            onChange={(e) => onChange({ ...value, diagnosis: e.target.value })}
            placeholder="e.g. Post-operative atelectasis"
            className={inputClassName}
          />
        </div>
        <div>
          <label htmlFor="patient-history" className={labelClassName}>
            Medical history
          </label>
          <input
            id="patient-history"
            type="text"
            value={value.medical_history}
            onChange={(e) => onChange({ ...value, medical_history: e.target.value })}
            placeholder="e.g. Hypertension, smoker for 10 years"
            className={inputClassName}
          />
        </div>
      </div>

      <div>
        <label htmlFor="patient-exam" className={labelClassName}>
          Physical findings
        </label>
        <textarea
          id="patient-exam"
          value={value.physical_exam}
          onChange={(e) => onChange({ ...value, physical_exam: e.target.value })}
          rows={2}
          placeholder="e.g. Diminished breath sounds at both bases, splinting when coughing"
          className={inputClassName + " resize-none"}
        />
      </div>
    </fieldset>
  );
}

function VitalInput({ label, unit, children }: { label: string; unit: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5 rounded-lg border border-hairline bg-surface px-2.5 py-1.5 focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-600/25">
      <span className="flex items-baseline justify-between gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</span>
        <span className="text-[10px] text-gray-400">{unit}</span>
      </span>
      {children}
    </label>
  );
}

const PRESETS = [15, 30, 45, 60];

/**
 * How long the student has once they start. Shared by the patient case and
 * Return Demonstration forms.
 */
export function TimeLimitPicker({
  value,
  onChange,
  disabled,
}: {
  value: number | null;
  onChange: (minutes: number | null) => void;
  disabled?: boolean;
}) {
  const custom = value !== null && !PRESETS.includes(value);
  const chip = (on: boolean) =>
    `rounded-full border px-3.5 py-1.5 text-sm font-medium tabular-nums transition-colors disabled:opacity-50 ${
      on ? "border-brand-600 bg-brand-600 text-white" : "border-gray-300 bg-surface text-gray-700 hover:border-brand-600/50"
    }`;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Time limit">
        <button type="button" role="radio" aria-checked={value === null} disabled={disabled} onClick={() => onChange(null)} className={chip(value === null)}>
          No limit
        </button>
        {PRESETS.map((m) => (
          <button key={m} type="button" role="radio" aria-checked={value === m} disabled={disabled} onClick={() => onChange(m)} className={chip(value === m)}>
            {timeLimitLabel(m)}
          </button>
        ))}
        <label
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${
            custom ? "border-brand-600 bg-brand-50" : "border-gray-300 bg-surface"
          }`}
        >
          <FontAwesomeIcon icon={faStopwatch} className="h-3 w-3 text-gray-400" aria-hidden />
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_TIME_LIMIT_MINUTES}
            disabled={disabled}
            value={custom ? value : ""}
            onChange={(e) => {
              const n = Math.round(Number(e.target.value));
              onChange(e.target.value === "" || !Number.isFinite(n) || n < 1 ? null : Math.min(n, MAX_TIME_LIMIT_MINUTES));
            }}
            placeholder="Other"
            aria-label="Minutes"
            className="w-14 bg-transparent tabular-nums text-gray-900 placeholder:text-gray-500 focus:outline-none"
          />
          <span className="text-xs text-gray-500">min</span>
        </label>
      </div>
      <p className="text-xs text-gray-500">
        {value === null
          ? "Students take as long as they need."
          : `Students see ${timeLimitLabel(value)} counting down once they start. Finishing after it runs out still counts, but adds less to their skill mastery.`}
      </p>
    </div>
  );
}
