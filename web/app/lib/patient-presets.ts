/**
 * Common conditions an instructor can start a patient from. Picking one
 * fills the diagnosis, a typical set of vital signs and the usual labs, so
 * a simulated patient is ready in a click instead of typed in by hand;
 * every field stays editable afterwards.
 *
 * Values are typical adult presentations for teaching, not clinical
 * reference ranges. Each pick nudges the numbers slightly (see
 * presetVitals) so two patients made from the same condition don't share
 * an identical chart.
 */

export interface PresetVitals {
  heart_rate: number;
  /** Systolic/diastolic, mmHg. */
  bp: [number, number];
  /** °C */
  temperature: number;
  respiratory_rate: number;
  oxygen_saturation: number;
}

export interface PatientPreset {
  id: string;
  label: string;
  group: PresetGroup;
  diagnosis: string;
  vitals: PresetVitals;
  labs: Record<string, number>;
}

export const PRESET_GROUPS = [
  "Fever & Infection",
  "Respiratory",
  "Heart & Blood Pressure",
  "Diabetes & Metabolic",
  "Stomach & Digestive",
  "Kidney & Urinary",
  "Brain & Nerves",
  "Bones & Surgery",
  "Mother & Child",
  "Routine Check",
] as const;

export type PresetGroup = (typeof PRESET_GROUPS)[number];

export const PATIENT_PRESETS: PatientPreset[] = [
  // Fever & Infection
  {
    id: "high-fever",
    label: "High fever",
    group: "Fever & Infection",
    diagnosis: "Acute febrile illness, rule out infection",
    vitals: { heart_rate: 108, bp: [112, 72], temperature: 39.4, respiratory_rate: 22, oxygen_saturation: 97 },
    labs: { "White Blood Cells": 13.2, Hemoglobin: 13.4, "Platelet Count": 245 },
  },
  {
    id: "dengue",
    label: "Dengue fever",
    group: "Fever & Infection",
    diagnosis: "Dengue fever without warning signs",
    vitals: { heart_rate: 98, bp: [108, 70], temperature: 38.8, respiratory_rate: 20, oxygen_saturation: 98 },
    labs: { "Platelet Count": 92, Hematocrit: 44, "White Blood Cells": 3.4 },
  },
  {
    id: "typhoid",
    label: "Typhoid fever",
    group: "Fever & Infection",
    diagnosis: "Typhoid fever",
    vitals: { heart_rate: 88, bp: [110, 70], temperature: 39.0, respiratory_rate: 20, oxygen_saturation: 98 },
    labs: { "White Blood Cells": 4.6, Hemoglobin: 12.6, "Platelet Count": 168 },
  },
  {
    id: "cellulitis",
    label: "Skin infection (cellulitis)",
    group: "Fever & Infection",
    diagnosis: "Cellulitis of the left lower leg",
    vitals: { heart_rate: 94, bp: [124, 78], temperature: 38.2, respiratory_rate: 18, oxygen_saturation: 98 },
    labs: { "White Blood Cells": 12.8, "C-Reactive Protein": 48 },
  },
  {
    id: "tuberculosis",
    label: "Pulmonary tuberculosis",
    group: "Fever & Infection",
    diagnosis: "Pulmonary tuberculosis, newly diagnosed",
    vitals: { heart_rate: 92, bp: [110, 68], temperature: 37.9, respiratory_rate: 22, oxygen_saturation: 95 },
    labs: { Hemoglobin: 11.2, "White Blood Cells": 9.8 },
  },

  // Respiratory
  {
    id: "pneumonia",
    label: "Pneumonia",
    group: "Respiratory",
    diagnosis: "Community-acquired pneumonia, moderate risk",
    vitals: { heart_rate: 104, bp: [118, 74], temperature: 38.6, respiratory_rate: 26, oxygen_saturation: 92 },
    labs: { "White Blood Cells": 15.1, "C-Reactive Protein": 96, Hemoglobin: 13.0 },
  },
  {
    id: "asthma",
    label: "Asthma attack",
    group: "Respiratory",
    diagnosis: "Acute asthma exacerbation, moderate",
    vitals: { heart_rate: 112, bp: [126, 80], temperature: 37.0, respiratory_rate: 28, oxygen_saturation: 93 },
    labs: { "White Blood Cells": 9.2 },
  },
  {
    id: "copd",
    label: "COPD flare-up",
    group: "Respiratory",
    diagnosis: "COPD in acute exacerbation",
    vitals: { heart_rate: 102, bp: [138, 86], temperature: 37.4, respiratory_rate: 26, oxygen_saturation: 89 },
    labs: { "White Blood Cells": 11.4, Hemoglobin: 15.8 },
  },

  // Heart & Blood Pressure
  {
    id: "hypertension",
    label: "High blood pressure",
    group: "Heart & Blood Pressure",
    diagnosis: "Stage 2 hypertension",
    vitals: { heart_rate: 84, bp: [164, 102], temperature: 36.8, respiratory_rate: 18, oxygen_saturation: 98 },
    labs: { Sodium: 141, Potassium: 4.1, Creatinine: 1.0 },
  },
  {
    id: "heart-failure",
    label: "Heart failure",
    group: "Heart & Blood Pressure",
    diagnosis: "Congestive heart failure, NYHA class III",
    vitals: { heart_rate: 106, bp: [148, 92], temperature: 36.7, respiratory_rate: 24, oxygen_saturation: 91 },
    labs: { Sodium: 133, Potassium: 4.6, Creatinine: 1.4, "BNP": 820 },
  },
  {
    id: "chest-pain",
    label: "Chest pain",
    group: "Heart & Blood Pressure",
    diagnosis: "Chest pain, rule out acute coronary syndrome",
    vitals: { heart_rate: 98, bp: [152, 94], temperature: 36.8, respiratory_rate: 20, oxygen_saturation: 96 },
    labs: { Troponin: 0.02, Potassium: 4.2, "Total Cholesterol": 236 },
  },

  // Diabetes & Metabolic
  {
    id: "hyperglycemia",
    label: "High blood sugar",
    group: "Diabetes & Metabolic",
    diagnosis: "Type 2 diabetes mellitus, uncontrolled hyperglycemia",
    vitals: { heart_rate: 92, bp: [138, 84], temperature: 36.9, respiratory_rate: 20, oxygen_saturation: 98 },
    labs: { "Blood Glucose": 342, HbA1c: 10.4, Sodium: 134, Potassium: 4.8 },
  },
  {
    id: "hypoglycemia",
    label: "Low blood sugar",
    group: "Diabetes & Metabolic",
    diagnosis: "Hypoglycemia in a patient with type 2 diabetes",
    vitals: { heart_rate: 110, bp: [118, 76], temperature: 36.5, respiratory_rate: 20, oxygen_saturation: 98 },
    labs: { "Blood Glucose": 52, Potassium: 3.9 },
  },

  // Stomach & Digestive
  {
    id: "gastroenteritis",
    label: "Diarrhea with dehydration",
    group: "Stomach & Digestive",
    diagnosis: "Acute gastroenteritis with moderate dehydration",
    vitals: { heart_rate: 112, bp: [98, 62], temperature: 37.8, respiratory_rate: 22, oxygen_saturation: 98 },
    labs: { Sodium: 132, Potassium: 3.2, Creatinine: 1.3, Hematocrit: 48 },
  },
  {
    id: "appendicitis",
    label: "Appendicitis (before surgery)",
    group: "Stomach & Digestive",
    diagnosis: "Acute appendicitis, for appendectomy",
    vitals: { heart_rate: 102, bp: [124, 78], temperature: 38.3, respiratory_rate: 20, oxygen_saturation: 98 },
    labs: { "White Blood Cells": 14.6, "C-Reactive Protein": 64 },
  },
  {
    id: "peptic-ulcer",
    label: "Peptic ulcer",
    group: "Stomach & Digestive",
    diagnosis: "Peptic ulcer disease with epigastric pain",
    vitals: { heart_rate: 90, bp: [122, 78], temperature: 36.9, respiratory_rate: 18, oxygen_saturation: 98 },
    labs: { Hemoglobin: 11.8, Hematocrit: 35 },
  },

  // Kidney & Urinary
  {
    id: "uti",
    label: "Urinary tract infection",
    group: "Kidney & Urinary",
    diagnosis: "Uncomplicated urinary tract infection",
    vitals: { heart_rate: 96, bp: [118, 76], temperature: 38.1, respiratory_rate: 18, oxygen_saturation: 98 },
    labs: { "White Blood Cells": 11.6, Creatinine: 0.9 },
  },
  {
    id: "ckd",
    label: "Chronic kidney disease",
    group: "Kidney & Urinary",
    diagnosis: "Chronic kidney disease stage 4",
    vitals: { heart_rate: 88, bp: [158, 96], temperature: 36.7, respiratory_rate: 20, oxygen_saturation: 96 },
    labs: { Creatinine: 4.2, "Blood Urea Nitrogen": 62, Potassium: 5.6, Hemoglobin: 9.4 },
  },

  // Brain & Nerves
  {
    id: "stroke",
    label: "Stroke",
    group: "Brain & Nerves",
    diagnosis: "Acute ischemic stroke with right-sided weakness",
    vitals: { heart_rate: 86, bp: [178, 104], temperature: 36.9, respiratory_rate: 18, oxygen_saturation: 95 },
    labs: { "Blood Glucose": 148, "Platelet Count": 230, Sodium: 139 },
  },
  {
    id: "head-injury",
    label: "Minor head injury",
    group: "Brain & Nerves",
    diagnosis: "Mild traumatic brain injury after a fall",
    vitals: { heart_rate: 82, bp: [132, 82], temperature: 36.8, respiratory_rate: 18, oxygen_saturation: 98 },
    labs: { Hemoglobin: 13.6, "Platelet Count": 260 },
  },

  // Bones & Surgery
  {
    id: "post-op",
    label: "After surgery (post-op)",
    group: "Bones & Surgery",
    diagnosis: "Post-operative day 1 after appendectomy",
    vitals: { heart_rate: 90, bp: [120, 76], temperature: 37.6, respiratory_rate: 18, oxygen_saturation: 97 },
    labs: { Hemoglobin: 12.4, "White Blood Cells": 11.2 },
  },
  {
    id: "fracture",
    label: "Broken bone (fracture)",
    group: "Bones & Surgery",
    diagnosis: "Closed fracture of the right femur",
    vitals: { heart_rate: 100, bp: [136, 84], temperature: 37.1, respiratory_rate: 20, oxygen_saturation: 97 },
    labs: { Hemoglobin: 11.9, "White Blood Cells": 10.4 },
  },

  // Mother & Child
  {
    id: "postpartum",
    label: "After normal delivery",
    group: "Mother & Child",
    diagnosis: "Postpartum day 1 after normal spontaneous delivery",
    vitals: { heart_rate: 86, bp: [118, 74], temperature: 37.2, respiratory_rate: 18, oxygen_saturation: 98 },
    labs: { Hemoglobin: 11.0, "Platelet Count": 210 },
  },
  {
    id: "preeclampsia",
    label: "High blood pressure in pregnancy",
    group: "Mother & Child",
    diagnosis: "Preeclampsia at 34 weeks gestation",
    vitals: { heart_rate: 94, bp: [162, 108], temperature: 36.9, respiratory_rate: 20, oxygen_saturation: 97 },
    labs: { "Platelet Count": 118, Creatinine: 1.1, "Urine Protein": 300 },
  },

  // Routine Check
  {
    id: "healthy",
    label: "Healthy adult (routine check)",
    group: "Routine Check",
    diagnosis: "Healthy adult for routine health assessment",
    vitals: { heart_rate: 74, bp: [118, 76], temperature: 36.7, respiratory_rate: 16, oxygen_saturation: 99 },
    labs: { Hemoglobin: 14.0, "Blood Glucose": 92 },
  },
];

const round = (n: number, step: number) => Math.round(n / step) * step;

/**
 * The preset's vitals, each moved a little at random so patients made from
 * one condition differ, as two real patients would. `random` is injectable
 * for tests.
 */
export function presetVitals(preset: PatientPreset, random: () => number = Math.random) {
  const nudge = (value: number, spread: number) => value + (random() * 2 - 1) * spread;
  const v = preset.vitals;
  return {
    heart_rate: Math.round(nudge(v.heart_rate, 4)),
    blood_pressure: `${Math.round(nudge(v.bp[0], 4))}/${Math.round(nudge(v.bp[1], 3))}`,
    temperature: Number(round(nudge(v.temperature, 0.2), 0.1).toFixed(1)),
    respiratory_rate: Math.round(nudge(v.respiratory_rate, 1)),
    oxygen_saturation: Math.min(100, Math.round(nudge(v.oxygen_saturation, 1))),
  };
}
