/**
 * Patients who have completed a stay: admitted, charted, discharged.
 *
 * The ward seed leaves everyone admitted, so nothing in the database
 * exercises the other half of the lifecycle 034 added — no discharged row, no
 * freed bed, no discharge summary, and a Monitoring page that has never seen
 * a closed case. These four fill that in, each with the record a real stay
 * leaves behind: a week of vitals and TPR, IV fluids where the case called
 * for them, progress notes signed off by faculty, and the summary the
 * check-out route would have written.
 *
 * Built through the real code where it exists. Anomaly flags come from
 * evaluateVitals() and the summary's digests from buildStayDigest() — the
 * same function app/api/faculty/patients/admission calls on check-out — so a
 * seeded summary and a live one are the same object.
 *
 * Vitals improve across each stay, because these patients got better and went
 * home: the flagged readings cluster at the start and the last day is clean.
 * That is what makes them useful next to the admitted eight, whose records
 * all stop mid-treatment.
 *
 * One consequence worth knowing: a discharged patient has no scenario, so it
 * appears in no student's assigned list. Their charting is attributed to the
 * students who recorded it at the time, and the case is closed — which is
 * exactly how the app treats a stay that has ended.
 *
 *   npx tsx scripts/seed-discharged-patients.ts
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { evaluateVitals } from '../app/lib/vitals/rules';
import { buildStayDigest } from '../app/lib/discharge';

config({ path: '.env.local' });

function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const SHIFTS = ['AM', 'PM', 'Night'] as const;

interface Stay {
  subject_id: number;
  hadm_id: number;
  name: string;
  age: number;
  gender: 'M' | 'F';
  diagnosis: string;
  medical_history: string;
  /** Section whose students charted this stay. */
  section: string;
  /** Days before today the patient was admitted, and discharged. */
  admittedDaysAgo: number;
  dischargedDaysAgo: number;
  /** Room they occupied, by number. The bed is freed on discharge. */
  room_number: string;
  /** Day 1 observations — deliberately abnormal; the stay improves from here. */
  onset: {
    heart_rate: number;
    bp_systolic: number;
    bp_diastolic: number;
    temperature_c: number;
    respiratory_rate: number;
    oxygen_saturation: number;
    pain_score: number;
  };
  /** Where each value lands by the last day. */
  resolved: {
    heart_rate: number;
    bp_systolic: number;
    bp_diastolic: number;
    temperature_c: number;
    respiratory_rate: number;
    oxygen_saturation: number;
    pain_score: number;
  };
  labs: Record<string, number>;
  ivf: { solution: string; volume_ml: number; rate_ml_hr: number; site: string; remarks: string } | null;
  notes: { day: number; subjective: string; objective: string; assessment: string; plan: string }[];
}

const STAYS: Stay[] = [
  {
    subject_id: 910001,
    hadm_id: 810001,
    name: 'Teresita Ramos',
    age: 68,
    gender: 'F',
    diagnosis: 'Community-acquired pneumonia, resolved',
    medical_history: 'Hypertension on maintenance amlodipine. Non-smoker. No prior admissions.',
    section: 'BSN 1101',
    admittedDaysAgo: 34,
    dischargedDaysAgo: 28,
    room_number: '201',
    onset: { heart_rate: 108, bp_systolic: 138, bp_diastolic: 84, temperature_c: 39.1, respiratory_rate: 26, oxygen_saturation: 91, pain_score: 4 },
    resolved: { heart_rate: 78, bp_systolic: 124, bp_diastolic: 76, temperature_c: 36.8, respiratory_rate: 18, oxygen_saturation: 97, pain_score: 1 },
    labs: { 'White Blood Cells': 16.4, Hemoglobin: 12.1, 'Platelet Count': 288, Sodium: 134, Potassium: 3.9, Creatinine: 1.0 },
    ivf: {
      solution: 'PNSS 1L',
      volume_ml: 1000,
      rate_ml_hr: 100,
      site: 'Left forearm',
      remarks: 'Carrier line for IV antibiotics. Discontinued on switch to oral therapy.',
    },
    notes: [
      {
        day: 1,
        subjective: 'Breathless on minimal exertion, productive cough with green sputum, feverish since yesterday.',
        objective: 'T 39.1 °C, RR 26, SpO2 91% on room air. Coarse crackles right base. WBC 16.4.',
        assessment: 'Community-acquired pneumonia, right base. Hypoxic and febrile on admission.',
        plan: 'IV antibiotics as ordered, oxygen to keep SpO2 above 94%, four-hourly vitals, chest physiotherapy and deep breathing.',
      },
      {
        day: 4,
        subjective: 'Says breathing is much easier and the cough is loosening. Eating again.',
        objective: 'T 37.2 °C, RR 20, SpO2 96% on room air. Crackles reduced. Tolerating oral intake.',
        assessment: 'Pneumonia responding to treatment. Off supplemental oxygen since yesterday.',
        plan: 'Switch to oral antibiotics, continue deep breathing exercises, mobilise as tolerated, plan discharge teaching.',
      },
      {
        day: 6,
        subjective: 'Feels back to herself. No breathlessness walking the corridor. Keen to go home.',
        objective: 'T 36.8 °C, RR 18, SpO2 97% on room air, HR 78. Chest clear to auscultation.',
        assessment: 'Pneumonia resolved. Safe for discharge with a full oral antibiotic course to complete.',
        plan: 'Discharge home. Complete the antibiotic course, return if fever or breathlessness recurs, follow up in one week.',
      },
    ],
  },
  {
    subject_id: 910002,
    hadm_id: 810002,
    name: 'Benjamin Cruz',
    age: 45,
    gender: 'M',
    diagnosis: 'Acute gastritis, resolved',
    medical_history: 'Irregular meals and frequent NSAID use for back pain. No known ulcer disease.',
    section: 'BSN 1102',
    admittedDaysAgo: 26,
    dischargedDaysAgo: 22,
    room_number: '101',
    onset: { heart_rate: 96, bp_systolic: 132, bp_diastolic: 82, temperature_c: 37.4, respiratory_rate: 20, oxygen_saturation: 98, pain_score: 7 },
    resolved: { heart_rate: 74, bp_systolic: 120, bp_diastolic: 76, temperature_c: 36.7, respiratory_rate: 16, oxygen_saturation: 99, pain_score: 1 },
    labs: { Hemoglobin: 13.8, 'White Blood Cells': 9.1, Sodium: 139, Potassium: 4.0, Creatinine: 0.9 },
    ivf: null,
    notes: [
      {
        day: 1,
        subjective: 'Burning epigastric pain rated 7/10, worse after meals. Nauseated, no vomiting of blood.',
        objective: 'Epigastric tenderness on palpation. No guarding or rebound. Stool negative for blood. HR 96.',
        assessment: 'Acute gastritis, likely NSAID-related. No evidence of bleeding.',
        plan: 'Proton pump inhibitor as ordered, withhold NSAIDs, bland diet, monitor for melaena or haematemesis.',
      },
      {
        day: 3,
        subjective: 'Pain down to 2/10, eating small meals without discomfort.',
        objective: 'Abdomen soft, minimal epigastric tenderness. No nausea. Vitals within normal limits.',
        assessment: 'Gastritis settling on acid suppression. No bleeding throughout the stay.',
        plan: 'Continue PPI, discharge teaching on avoiding NSAIDs and regular meals, alternative analgesia discussed.',
      },
    ],
  },
  {
    subject_id: 910003,
    hadm_id: 810003,
    name: 'Marilou Santos',
    age: 33,
    gender: 'F',
    diagnosis: 'Dengue fever without warning signs, recovered',
    medical_history: 'Previously well. Lives in an area with recent dengue cases.',
    section: 'BSN 1102',
    admittedDaysAgo: 20,
    dischargedDaysAgo: 15,
    room_number: '201',
    onset: { heart_rate: 104, bp_systolic: 104, bp_diastolic: 64, temperature_c: 39.4, respiratory_rate: 22, oxygen_saturation: 98, pain_score: 6 },
    resolved: { heart_rate: 76, bp_systolic: 116, bp_diastolic: 74, temperature_c: 36.9, respiratory_rate: 17, oxygen_saturation: 99, pain_score: 1 },
    labs: { 'Platelet Count': 88, Hematocrit: 42, 'White Blood Cells': 3.2, Hemoglobin: 13.0, Sodium: 136 },
    ivf: {
      solution: 'PNSS 1L',
      volume_ml: 1000,
      rate_ml_hr: 125,
      site: 'Right cephalic vein',
      remarks: 'Maintenance fluid through the febrile phase. Discontinued once oral intake was adequate.',
    },
    notes: [
      {
        day: 1,
        subjective: 'High fever for three days with severe headache, retro-orbital pain and body aches.',
        objective: 'T 39.4 °C, HR 104, BP 104/64. Platelets 88, WBC 3.2. No bleeding, no abdominal tenderness. Tourniquet test negative.',
        assessment: 'Dengue fever without warning signs. Platelets falling; requires close monitoring.',
        plan: 'IV fluids as ordered, paracetamol only — no NSAIDs or aspirin, daily platelet count, watch for bleeding, abdominal pain or lethargy.',
      },
      {
        day: 3,
        subjective: 'Fever settling, headache much improved. Drinking well.',
        objective: 'T 37.5 °C, HR 88. Platelets 102 and rising. No bleeding signs. Urine output adequate.',
        assessment: 'Entering recovery phase. Platelet nadir passed without haemorrhagic complication.',
        plan: 'Continue oral fluids, step down IV, repeat platelets tomorrow, continue warning-sign teaching.',
      },
      {
        day: 5,
        subjective: 'Feels well, appetite returned, no headache.',
        objective: 'Afebrile 36.9 °C, HR 76, BP 116/74. Platelets 165. No rash or bleeding.',
        assessment: 'Dengue fever recovered. Platelets recovering, haemodynamically stable.',
        plan: 'Discharge home with mosquito-control advice and warning signs to return on. Repeat platelet count in clinic in three days.',
      },
    ],
  },
  {
    subject_id: 910004,
    hadm_id: 810004,
    name: 'Gregorio Lim',
    age: 72,
    gender: 'M',
    diagnosis: 'Acute exacerbation of congestive heart failure, compensated',
    medical_history: 'CHF with reduced ejection fraction, on furosemide and lisinopril. Admitted twice in the past year.',
    section: 'BSN 1101',
    admittedDaysAgo: 16,
    dischargedDaysAgo: 9,
    room_number: '301',
    onset: { heart_rate: 112, bp_systolic: 158, bp_diastolic: 92, temperature_c: 36.9, respiratory_rate: 28, oxygen_saturation: 89, pain_score: 3 },
    resolved: { heart_rate: 80, bp_systolic: 128, bp_diastolic: 78, temperature_c: 36.7, respiratory_rate: 18, oxygen_saturation: 96, pain_score: 0 },
    labs: { Creatinine: 1.4, Sodium: 133, Potassium: 3.6, Hemoglobin: 11.8, 'Urea Nitrogen': 28 },
    ivf: null,
    notes: [
      {
        day: 1,
        subjective: 'Breathless lying flat, sleeping on three pillows, ankles swollen for a week.',
        objective: 'RR 28, SpO2 89% on room air, HR 112, BP 158/92. Bibasal crackles, pitting oedema to mid-shin, JVP raised.',
        assessment: 'Acute CHF exacerbation with fluid overload. Hypoxic on admission.',
        plan: 'IV furosemide as ordered, strict intake and output, daily weights, fluid restriction 1.5 L, oxygen to keep SpO2 above 92%, sit upright.',
      },
      {
        day: 4,
        subjective: 'Breathing easier, sleeping on one pillow. Passing much more urine.',
        objective: 'RR 22, SpO2 94% on room air. Crackles at bases only. Oedema reduced to ankles. Down 3.2 kg since admission.',
        assessment: 'Responding to diuresis. Renal function stable, potassium 3.6 and being replaced.',
        plan: 'Continue diuretics and daily weights, monitor potassium and creatinine, begin discharge teaching on fluid and salt limits.',
      },
      {
        day: 7,
        subjective: 'No breathlessness at rest or walking to the bathroom. Sleeping flat.',
        objective: 'RR 18, SpO2 96%, HR 80, BP 128/78. Chest clear. Trace ankle oedema only. Weight stable for two days.',
        assessment: 'CHF compensated. Safe for discharge on oral diuretics.',
        plan: 'Discharge with daily weight diary, 1.5 L fluid limit, low-salt diet, and instructions to return for a 2 kg gain in three days or worsening breathlessness. Cardiology follow-up in one week.',
      },
    ],
  },
];

/** Linear interpolation from the onset value to the resolved one. */
function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: sections } = await supabase.from('sections').select('id, name');
  const sectionByName = new Map((sections ?? []).map((s) => [s.name, s.id]));
  const { data: links } = await supabase.from('faculty_sections').select('faculty_id, section_id');
  const facultyBySection = new Map((links ?? []).map((l) => [l.section_id, l.faculty_id]));
  const { data: studentRows } = await supabase
    .from('users')
    .select('id, email, section_id')
    .eq('role', 'student');
  const { data: rooms } = await supabase.from('rooms').select('id, name, room_number');
  const roomByNumber = new Map((rooms ?? []).map((r) => [r.room_number, r]));

  let created = 0;
  let vitalsCount = 0;
  let tprCount = 0;
  let ivfCount = 0;
  let noteCount = 0;
  let summaryCount = 0;
  let eventCount = 0;
  let skippedTimelines = 0;

  for (const stay of STAYS) {
    const sectionId = sectionByName.get(stay.section);
    const facultyId = sectionId ? facultyBySection.get(sectionId) ?? null : null;
    const students = (studentRows ?? []).filter((s) => s.section_id === sectionId);
    if (students.length === 0) {
      console.warn(`  skipped ${stay.name} — no students in ${stay.section}`);
      continue;
    }
    const room = roomByNumber.get(stay.room_number);
    const rng = seeded(hash(`discharged|${stay.name}`));

    const admittedAt = new Date(Date.now() - stay.admittedDaysAgo * DAY_MS);
    const dischargedAt = new Date(Date.now() - stay.dischargedDaysAgo * DAY_MS);
    const stayDays = Math.max(1, stay.admittedDaysAgo - stay.dischargedDaysAgo);

    // The bed is freed and the label cleared, exactly as the check-out route
    // leaves them — a discharged patient holding a room would keep occupying
    // it in the floor plan's capacity count.
    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .upsert(
        {
          subject_id: stay.subject_id,
          hadm_id: stay.hadm_id,
          mimic_id: `SIM-${stay.subject_id}`,
          name: stay.name,
          age: stay.age,
          gender: stay.gender,
          diagnosis: stay.diagnosis,
          medical_history: stay.medical_history,
          vital_signs: {
            heart_rate: stay.resolved.heart_rate,
            blood_pressure: `${stay.resolved.bp_systolic}/${stay.resolved.bp_diastolic}`,
            temperature: stay.resolved.temperature_c,
            respiratory_rate: stay.resolved.respiratory_rate,
            oxygen_saturation: stay.resolved.oxygen_saturation,
          },
          labs: stay.labs,
          room_id: null,
          room_number: '',
          status: 'discharged' as const,
          admission_date: admittedAt.toISOString(),
          discharged_at: dischargedAt.toISOString(),
          discharged_by: facultyId,
          created_by: facultyId,
        },
        { onConflict: 'subject_id,hadm_id' },
      )
      .select('id, name')
      .single();
    if (patientError || !patient) {
      console.error(`  ✗ ${stay.name}:`, patientError?.message);
      process.exit(1);
    }
    created += 1;

    // Ours to rebuild.
    for (const table of ['vital_sign_readings', 'tpr_records', 'ivf_records', 'progress_notes', 'discharge_summaries']) {
      await supabase.from(table).delete().eq('patient_id', patient.id);
    }

    // One round of observations per shift per day of the stay, each charted
    // by whichever student was on. Values walk from the onset picture to the
    // resolved one, so the flagged readings sit at the start.
    const rounds = stayDays * SHIFTS.length;
    for (let r = 0; r < rounds; r++) {
      const t = rounds === 1 ? 1 : r / (rounds - 1);
      const student = students[r % students.length];
      const at = new Date(admittedAt.getTime() + Math.floor(r / 3) * DAY_MS + (r % 3) * 8 * HOUR_MS + 6 * HOUR_MS);
      const shift = SHIFTS[r % 3];

      const reading = {
        heart_rate: Math.round(lerp(stay.onset.heart_rate, stay.resolved.heart_rate, t)),
        bp_systolic: Math.round(lerp(stay.onset.bp_systolic, stay.resolved.bp_systolic, t)),
        bp_diastolic: Math.round(lerp(stay.onset.bp_diastolic, stay.resolved.bp_diastolic, t)),
        temperature_c: Math.round(lerp(stay.onset.temperature_c, stay.resolved.temperature_c, t) * 10) / 10,
        respiratory_rate: Math.round(lerp(stay.onset.respiratory_rate, stay.resolved.respiratory_rate, t)),
        oxygen_saturation: Math.round(lerp(stay.onset.oxygen_saturation, stay.resolved.oxygen_saturation, t)),
        pain_score: Math.round(lerp(stay.onset.pain_score, stay.resolved.pain_score, t)),
      };
      const evaluation = evaluateVitals(reading);

      const { error: vErr } = await supabase.from('vital_sign_readings').insert({
        patient_id: patient.id,
        recorded_by: student.id,
        recorded_at: at.toISOString(),
        // created_at is set explicitly rather than defaulting to now(),
        // because buildStayDigest() windows the stay on created_at and would
        // otherwise fold every reading into a stay that ended weeks ago.
        created_at: at.toISOString(),
        ...reading,
        notes: null,
        is_anomaly: evaluation.is_anomaly,
        anomaly_reasons: evaluation.reasons,
      });
      if (vErr) {
        console.error(`  ✗ vitals for ${stay.name}:`, vErr.message);
        process.exit(1);
      }
      vitalsCount += 1;

      const { error: tErr } = await supabase.from('tpr_records').insert({
        patient_id: patient.id,
        recorded_by: student.id,
        recorded_at: at.toISOString(),
        created_at: at.toISOString(),
        shift,
        temperature_c: reading.temperature_c,
        pulse: reading.heart_rate,
        respiration: reading.respiratory_rate,
        remarks: null,
      });
      if (tErr) {
        console.error(`  ✗ TPR for ${stay.name}:`, tErr.message);
        process.exit(1);
      }
      tprCount += 1;
    }

    if (stay.ivf) {
      const started = new Date(admittedAt.getTime() + 2 * HOUR_MS);
      const ended = new Date(admittedAt.getTime() + 2 * DAY_MS);
      // Nothing is left running: the line came down before the patient went
      // home, which is what ehr_digest.ivf_ongoing should show as zero.
      const { error: iErr } = await supabase.from('ivf_records').insert({
        patient_id: patient.id,
        recorded_by: students[0].id,
        created_at: started.toISOString(),
        solution: stay.ivf.solution,
        volume_ml: stay.ivf.volume_ml,
        rate_ml_hr: stay.ivf.rate_ml_hr,
        site: stay.ivf.site,
        status: 'completed' as const,
        started_at: started.toISOString(),
        ended_at: ended.toISOString(),
        remarks: stay.ivf.remarks,
      });
      if (iErr) {
        console.error(`  ✗ IVF for ${stay.name}:`, iErr.message);
        process.exit(1);
      }
      ivfCount += 1;
    }

    for (const [i, note] of stay.notes.entries()) {
      const at = new Date(admittedAt.getTime() + (note.day - 1) * DAY_MS + 20 * HOUR_MS);
      const student = students[i % students.length];
      // The final note is always countersigned — a stay does not close with
      // its discharge note unreviewed.
      const isLast = i === stay.notes.length - 1;
      const isReviewed = isLast || rng() < 0.6;
      const { error: nErr } = await supabase.from('progress_notes').insert({
        patient_id: patient.id,
        author_id: student.id,
        created_at: at.toISOString(),
        content: `S: ${note.subjective}\n\nO: ${note.objective}\n\nA: ${note.assessment}\n\nP: ${note.plan}`,
        structured: {
          subjective: note.subjective,
          objective: note.objective,
          assessment: note.assessment,
          plan: note.plan,
        },
        reviewed_by: isReviewed ? facultyId : null,
        reviewed_at: isReviewed ? new Date(at.getTime() + 8 * HOUR_MS).toISOString() : null,
      });
      if (nErr) {
        console.error(`  ✗ note for ${stay.name}:`, nErr.message);
        process.exit(1);
      }
      noteCount += 1;
    }

    // The summary the check-out route would have written, from the same
    // builder, over the stay that just went in.
    const digest = await buildStayDigest(supabase, patient.id, admittedAt.toISOString());
    const { error: sErr } = await supabase.from('discharge_summaries').insert({
      patient_id: patient.id,
      created_by: facultyId,
      admitted_at: admittedAt.toISOString(),
      discharged_at: dischargedAt.toISOString(),
      diagnosis: stay.diagnosis,
      room_label: room ? `${room.name} · Room ${room.room_number}` : `Room ${stay.room_number}`,
      vitals_digest: digest.vitals,
      ehr_digest: digest.ehr,
    });
    if (sErr) {
      console.error(`  ✗ discharge summary for ${stay.name}:`, sErr.message);
      process.exit(1);
    }
    summaryCount += 1;

    // audit_logs is append-only (031): write the timeline once, never twice.
    const { count: existing } = await supabase
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('entity_type', 'patients')
      .eq('entity_id', patient.id)
      .in('action', ['patient.create', 'patient.check_in', 'patient.check_out']);
    if ((existing ?? 0) > 0) {
      skippedTimelines += 1;
    } else {
      const roomLabel = room?.room_number ?? stay.room_number;
      const { error: eErr } = await supabase.from('audit_logs').insert([
        {
          actor_id: facultyId,
          actor_role: 'faculty' as const,
          action: 'patient.create',
          entity_type: 'patients',
          entity_id: patient.id,
          details: { name: stay.name, room: roomLabel },
          created_at: admittedAt.toISOString(),
        },
        {
          actor_id: facultyId,
          actor_role: 'faculty' as const,
          action: 'patient.check_out',
          entity_type: 'patients',
          entity_id: patient.id,
          details: { name: stay.name, from_room: roomLabel, discharge_summary_id: null },
          created_at: dischargedAt.toISOString(),
        },
      ]);
      if (eErr) {
        console.error(`  ✗ admission history for ${stay.name}:`, eErr.message);
        process.exit(1);
      }
      eventCount += 2;
    }

    console.log(
      `  ✓ ${stay.name.padEnd(18)} ${stayDays}-day stay, discharged ${stay.dischargedDaysAgo}d ago  ` +
        `(${digest.vitals.readings} readings, ${digest.vitals.flagged} flagged)`,
    );
  }

  console.log(
    `\nDischarged patients: ${created}\n` +
      `Vital readings: ${vitalsCount}   TPR: ${tprCount}   IVF: ${ivfCount}   Notes: ${noteCount}\n` +
      `Discharge summaries: ${summaryCount}\n` +
      `Admission events: ${eventCount} written` +
      (skippedTimelines > 0 ? `, ${skippedTimelines} already present and left as-is` : ''),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
