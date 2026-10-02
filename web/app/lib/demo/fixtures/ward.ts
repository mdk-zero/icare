import { KIND, ago, demoId, type DemoUser } from "./people";
import type { DemoPatient, DemoRoom } from "./school";

/** The floor plan's fixtures, a few days of vital-sign readings, and discharge summaries. */

export interface DemoFixture {
  id: string;
  kind: "corridor" | "nurse_station" | "stairs" | "elevator" | "restroom" | "storage" | "label";
  label: string;
  plan_x: number;
  plan_y: number;
  plan_w: number;
  plan_h: number;
}

export interface DemoVital {
  id: string;
  patient_id: string;
  recorded_by: string;
  recorded_at: string;
  heart_rate: number | null;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  temperature_c: number | null;
  respiratory_rate: number | null;
  oxygen_saturation: number | null;
  pain_score: number | null;
  notes: string | null;
  is_anomaly: boolean;
  anomaly_reasons: { field: string; value: number; severity: "warning" | "critical"; message: string }[];
}

export interface DemoDischargeSummary {
  id: string;
  patient_id: string;
  admitted_at: string | null;
  discharged_at: string;
  diagnosis: string;
  room_label: string;
  vitals_digest: {
    readings?: number;
    flagged?: number;
    critical?: number;
    stats?: Record<string, { min: number; max: number; avg: number; n: number }>;
    findings?: { message: string; severity: string; recommendation?: string }[];
  };
  ehr_digest: Record<string, number>;
  follow_up: { title: string; detail: string }[];
  ai_model: string | null;
  ai_generated_at: string | null;
  created_at: string;
}

export interface DemoRoomAssignment {
  id: string;
  room_id: string;
  student_id: string;
  shift: string | null;
  starts_at: string;
  ends_at: string | null;
}

export function seedWard(rooms: DemoRoom[], patients: DemoPatient[], users: DemoUser[]) {
  const fixtures: DemoFixture[] = [
    { id: demoId(KIND.misc, 1), kind: "corridor", label: "Main corridor", plan_x: 0, plan_y: 3, plan_w: 24, plan_h: 1 },
    { id: demoId(KIND.misc, 2), kind: "nurse_station", label: "Nurses' station", plan_x: 0, plan_y: 7, plan_w: 4, plan_h: 2 },
    { id: demoId(KIND.misc, 3), kind: "restroom", label: "Restroom", plan_x: 5, plan_y: 7, plan_w: 2, plan_h: 2 },
    { id: demoId(KIND.misc, 4), kind: "storage", label: "Supply room", plan_x: 8, plan_y: 7, plan_w: 3, plan_h: 2 },
    { id: demoId(KIND.misc, 5), kind: "stairs", label: "Stairs", plan_x: 20, plan_y: 7, plan_w: 2, plan_h: 2 },
    { id: demoId(KIND.misc, 6), kind: "elevator", label: "Elevator", plan_x: 22, plan_y: 7, plan_w: 2, plan_h: 2 },
    { id: demoId(KIND.misc, 7), kind: "label", label: "College of Nursing · 2F", plan_x: 13, plan_y: 8, plan_w: 6, plan_h: 1 },
  ];

  // Readings taken by students on the ward, three per admitted patient.
  const students = users.filter((u) => u.role === "student");
  const vitals: DemoVital[] = [];
  let n = 0;
  patients
    .filter((p) => p.status === "admitted")
    .forEach((p, i) => {
      const [sys, dia] = (p.vital_signs.blood_pressure ?? "120/80").split("/").map(Number);
      for (let k = 0; k < 3; k++) {
        n += 1;
        const drift = k - 1;
        const temp = (p.vital_signs.temperature ?? 37) - k * 0.2;
        const spo2 = (p.vital_signs.oxygen_saturation ?? 98) + (k === 2 ? 1 : 0);
        const reasons: DemoVital["anomaly_reasons"] = [];
        if (temp >= 38) reasons.push({ field: "temperature_c", value: Math.round(temp * 10) / 10, severity: "warning", message: `Temperature ${temp.toFixed(1)} °C is febrile` });
        if ((p.vital_signs.heart_rate ?? 80) - drift * 3 > 100) reasons.push({ field: "heart_rate", value: (p.vital_signs.heart_rate ?? 80) - drift * 3, severity: "warning", message: "Heart rate above 100 bpm" });
        vitals.push({
          id: demoId(KIND.vitals, n),
          patient_id: p.id,
          recorded_by: students[(i * 3 + k) % students.length].id,
          recorded_at: ago(2 - k * 0.8, 8 + k * 4),
          heart_rate: (p.vital_signs.heart_rate ?? 80) - drift * 3,
          bp_systolic: sys - drift * 2,
          bp_diastolic: dia,
          temperature_c: Math.round(temp * 10) / 10,
          respiratory_rate: p.vital_signs.respiratory_rate,
          oxygen_saturation: spo2,
          pain_score: k === 0 ? 3 : 2,
          notes: k === 0 ? "Patient resting, oriented, no distress." : null,
          is_anomaly: reasons.length > 0,
          anomaly_reasons: reasons,
        });
      }
    });

  const dischargeSummaries = patients
    .filter((p) => p.status === "discharged")
    .map((p, i): DemoDischargeSummary => ({
      id: demoId(KIND.misc, 100 + i),
      patient_id: p.id,
      admitted_at: p.admission_date,
      discharged_at: p.discharged_at!,
      diagnosis: p.diagnosis,
      room_label: i === 0 ? "Simulation Ward · 201" : "Skills Laboratory A · 101",
      vitals_digest: {
        readings: 14,
        flagged: 3,
        critical: 0,
        stats: {
          heart_rate: { min: 74, max: 104, avg: 86, n: 14 },
          temperature_c: { min: 36.6, max: 38.4, avg: 37.2, n: 14 },
          oxygen_saturation: { min: 93, max: 99, avg: 96, n: 14 },
        },
        findings: [
          { message: "Fever settled by day 3 of admission", severity: "info" },
          { message: "Brief tachycardia on admission, resolved with fluids", severity: "warning", recommendation: "Recheck heart rate at the clinic follow-up" },
        ],
      },
      ehr_digest: { tpr: 12, ivf: 2, ivf_ongoing: 0, notes: 6, notes_reviewed: 6 },
      follow_up: [],
      ai_model: null,
      ai_generated_at: null,
      created_at: p.discharged_at!,
    }));

  const roomAssignments: DemoRoomAssignment[] = [];
  void rooms;
  return { fixtures, vitals, dischargeSummaries, roomAssignments };
}
