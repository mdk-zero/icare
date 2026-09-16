/**
 * Everything on a patient's chart: the vital-sign readings, TPR, IVF and
 * progress notes students recorded, plus the admission timeline above them.
 *
 * A student may chart on the patients linked to scenarios assigned to them —
 * the rule in lib/assigned-patients.ts — so this walks the completed scenario
 * assignments and fills in the bedside record each one implies. Work a
 * student never did stays blank: an overdue scenario has no charting behind
 * it, which is the same absence the history seed leaves in the quiz data.
 *
 * The entries track the case rather than being plausible noise. Rosa
 * Delgado's fever is charted coming down over three shifts because her
 * scenario is about giving an antipyretic and watching it work; Mateo
 * Salazar has an IV line running because his is about rehydration; the
 * patients whose cases call for no IV fluids have none. Each patient's first
 * TPR is anchored to the vitals on their own record, so the chart opens on
 * the numbers the EHR already shows.
 *
 * Deterministic: seeded per student and patient, so a re-run reproduces the
 * same chart. Scope is the (patient, student) pairs it writes; those are
 * cleared and rebuilt, and nothing else is touched.
 *
 *   npx tsx scripts/seed-clinical-records.ts
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { evaluateVitals } from '../app/lib/vitals/rules';

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

/** The three shifts a day is charted in, matching the EHR modal's options. */
const SHIFTS = ['AM', 'PM', 'Night'] as const;

interface CaseChart {
  /**
   * Pain on the 0–10 scale at each shift. 7+ is flagged severe by the vitals
   * rules, so this is what decides whether a reading raises a pain anomaly.
   */
  pain: [number, number, number];
  /** Systolic/diastolic drift per shift, applied to the patient's own BP. */
  bp: [[number, number], [number, number], [number, number]];
  /** SpO2 offsets per shift. */
  spo2: [number, number, number];
  /** Per-shift offsets applied to the patient's own recorded vitals. */
  temp: [number, number, number];
  pulse: [number, number, number];
  resp: [number, number, number];
  remarks: [string, string, string];
  /** Null when the case calls for no IV fluids — most of them do not. */
  ivf: { solution: string; volume_ml: number; rate_ml_hr: number; site: string; status: 'ongoing' | 'completed'; remarks: string } | null;
  note: { subjective: string; objective: string; assessment: string; plan: string };
}

/**
 * One chart per patient, keyed by name. Offsets rather than absolutes so the
 * first entry lands on whatever vitals that patient actually carries — edit
 * the patient in seed-basic-cases.ts and the charting follows.
 */
const CHARTS: Record<string, CaseChart> = {
  'Rosa Delgado': {
    pain: [3, 2, 1],
    bp: [[0, 0], [-4, -2], [-6, -4]],
    spo2: [0, 1, 1],
    temp: [0, -0.6, -1.1],
    pulse: [0, -6, -10],
    resp: [0, -2, -2],
    remarks: [
      'Febrile on admission round. Paracetamol given as ordered.',
      'Temperature coming down one hour post-dose. Tolerating oral fluids.',
      'Settled overnight, no chills or rigors. Fluids encouraged.',
    ],
    ivf: null,
    note: {
      subjective: 'Reports feeling less warm and body aches easing. Asking when she can go home.',
      objective: 'T 38.2 °C on admission, down to 37.1 °C by the night shift. Alert, mucous membranes moist, chest clear.',
      assessment: 'Mild viral febrile illness, responding to antipyretic and oral fluids. No red flags.',
      plan: 'Continue four-hourly vitals, paracetamol as ordered, encourage 2 L oral intake. Escalate if temperature exceeds 38.5 °C or breathing becomes laboured.',
    },
  },
  'Mateo Salazar': {
    pain: [2, 2, 1],
    bp: [[0, 0], [6, 4], [10, 6]],
    spo2: [0, 0, 1],
    temp: [0, -0.3, -0.5],
    pulse: [0, -6, -12],
    resp: [0, -1, -2],
    remarks: [
      'Tachycardic, mucous membranes dry. IV line started, ORS commenced.',
      'Pulse settling with fluids. Two loose stools this shift, no vomiting.',
      'No further vomiting overnight. Passing urine, intake tolerated.',
    ],
    ivf: {
      solution: 'PNSS 1L',
      volume_ml: 1000,
      rate_ml_hr: 120,
      site: 'Left cephalic vein',
      status: 'ongoing',
      remarks: 'Maintenance fluid for mild dehydration. Site clean and dry, no infiltration.',
    },
    note: {
      subjective: 'Says the vomiting has stopped and he can keep sips down. Still feels weak on standing.',
      objective: 'HR 102 down to 90 over the shift. Dry mucous membranes improving, capillary refill under 3 s. Intake 1,400 mL, output 1,100 mL.',
      assessment: 'Mild dehydration from acute gastroenteritis, improving with oral and IV rehydration. Potassium 3.4 mmol/L noted and handed over.',
      plan: 'Continue PNSS as charted, ORS after each loose stool, strict intake and output. Report urine output under 30 mL/hr.',
    },
  },
  'Liza Fontanilla': {
    pain: [4, 3, 2],
    bp: [[0, 0], [-2, 0], [-4, -2]],
    spo2: [0, 0, 0],
    temp: [0, -0.5, -0.8],
    pulse: [0, -4, -8],
    resp: [0, 0, -1],
    remarks: [
      'Low-grade fever, reports burning on urination. Antibiotic given.',
      'Dysuria less marked. Fluids encouraged, output monitored.',
      'Afebrile overnight, voiding without difficulty.',
    ],
    ivf: null,
    note: {
      subjective: 'Burning on urination less severe than on admission. Passing urine more comfortably.',
      objective: 'T 38.0 °C settling to 37.2 °C. Suprapubic tenderness reduced. Urine clearing, no flank pain or CVA tenderness.',
      assessment: 'Uncomplicated lower urinary tract infection responding to oral antibiotics.',
      plan: 'Complete the full antibiotic course, maintain 2–3 L oral intake daily, teach hygiene and voiding habits before discharge.',
    },
  },
  'Ernesto Bautista': {
    pain: [0, 0, 0],
    bp: [[0, 0], [-6, -4], [-10, -6]],
    spo2: [0, 0, 0],
    temp: [0, 0, -0.2],
    pulse: [0, 2, -4],
    resp: [0, 0, 0],
    remarks: [
      'Manual BP taken both arms after five minutes rest. Asymptomatic.',
      'Repeat reading this shift, technique confirmed with clinical instructor.',
      'Settled overnight, no headache or visual disturbance.',
    ],
    ivf: null,
    note: {
      subjective: 'Feels entirely well and questions whether the reading is accurate. No headache, chest pain or visual change.',
      objective: 'BP 152/94 mmHg seated, both arms, correct cuff size after five minutes rest. Heart sounds normal, no oedema.',
      assessment: 'Stage 1 hypertension, asymptomatic. Modifiable risks: smoking, sedentary work, salt intake.',
      plan: 'Twice-daily BP with consistent technique, low-salt diet counselling, smoking cessation referral. Agreed one change with patient: a daily walk.',
    },
  },
  'Joana Rivas': {
    pain: [2, 1, 1],
    bp: [[0, 0], [-4, -2], [-6, -4]],
    spo2: [0, 2, 3],
    temp: [0, 0, -0.2],
    pulse: [0, -6, -10],
    resp: [0, -2, -4],
    remarks: [
      'Expiratory wheeze both fields. Salbutamol via spacer given, sat upright.',
      'Wheeze reduced 15 minutes post-dose, RR down. Speaking full sentences.',
      'Slept without waking. No accessory muscle use.',
    ],
    ivf: null,
    note: {
      subjective: 'Says her chest feels looser and she slept through without waking to use the inhaler.',
      objective: 'RR 22 down to 18, SpO2 95% on room air rising to 97%. Mild expiratory wheeze resolving. Speaking in full sentences throughout.',
      assessment: 'Mild asthma exacerbation, responding to bronchodilator. No features of severity.',
      plan: 'Salbutamol via spacer as ordered, upright positioning, observations before and after each dose. Inhaler technique reviewed and corrected.',
    },
  },
  'Rafael Ocampo': {
    pain: [7, 4, 2],
    bp: [[0, 0], [-2, 0], [-4, -2]],
    spo2: [0, 1, 1],
    temp: [0, -0.3, -0.6],
    pulse: [0, -4, -8],
    resp: [0, -1, -2],
    remarks: [
      'Post-op day 1. Port sites clean and dry. Analgesia given before mobilising.',
      'Walked to the end of the bay and back with assistance. Pain 3/10 after dose.',
      'Slept comfortably. Bowel sounds active, passing flatus.',
    ],
    ivf: {
      solution: 'D5LR 1L',
      volume_ml: 1000,
      rate_ml_hr: 100,
      site: 'Right metacarpal vein',
      status: 'completed',
      remarks: 'Post-operative maintenance. Completed and line removed once oral intake established.',
    },
    note: {
      subjective: 'Reports pain 5/10 on movement and 2/10 at rest. Reluctant to mobilise at first.',
      objective: 'T 37.6 °C, expected day-one inflammatory response. Three laparoscopic port sites clean, dry, edges approximated, no discharge. Bowel sounds sluggish then active.',
      assessment: 'Uncomplicated post-appendectomy recovery. Low-grade temperature consistent with normal healing, not infection.',
      plan: 'Analgesia before mobilising, wound inspection each shift, increase ambulation, deep breathing exercises. Escalate if temperature exceeds 38.5 °C or wound discharges.',
    },
  },
  'Corazon Villamor': {
    pain: [5, 4, 3],
    bp: [[0, 0], [-4, -2], [-6, -4]],
    spo2: [0, 0, 1],
    temp: [0, -0.4, -0.7],
    pulse: [0, -4, -6],
    resp: [0, 0, -1],
    remarks: [
      'Border of redness marked and measured. Limb elevated. Antibiotic given.',
      'Redness unchanged within the marking. CBG checked, result handed over.',
      'No spread overnight. Foot inspection done with patient.',
    ],
    ivf: {
      solution: 'PNSS 500ml',
      volume_ml: 500,
      rate_ml_hr: 80,
      site: 'Right forearm',
      status: 'completed',
      remarks: 'Carrier line for IV antibiotic. Site clean, no phlebitis. Discontinued on switch to oral.',
    },
    note: {
      subjective: 'Says the leg feels less tight when elevated. Concerned about how the scratch became infected.',
      objective: 'T 38.1 °C settling to 37.4 °C. Left shin redness ~8 cm, marked and unchanged. Warm and tender, no fluctuance. CBG 168 mg/dL. Pedal pulses present.',
      assessment: 'Mild cellulitis in a patient with type 2 diabetes. Not spreading on treatment; glucose above target, which slows healing.',
      plan: 'Continue antibiotics, keep the limb elevated, re-measure the marked border each shift, monitor CBG. Daily foot care taught and return precautions given.',
    },
  },
  'Nadine Corpuz': {
    pain: [2, 2, 1],
    bp: [[0, 0], [2, 2], [4, 2]],
    spo2: [0, 0, 0],
    temp: [0, 0, 0],
    pulse: [0, -4, -6],
    resp: [0, 0, -1],
    remarks: [
      'Pale conjunctivae. Reports dizziness on standing — falls precautions in place.',
      'Oral iron given with vitamin C, away from meals. Ambulated with assistance.',
      'No dizziness this shift when rising in stages.',
    ],
    ivf: null,
    note: {
      subjective: 'Reports tiredness and breathlessness climbing stairs. Felt lightheaded standing up this morning.',
      objective: 'Hb 9.2 g/dL, ferritin 8. Pale conjunctivae and nail beds. HR 96 at rest settling to 90. Postural dizziness on rising, no syncope.',
      assessment: 'Iron deficiency anaemia, haemodynamically stable. Orthostatic symptoms make her a falls risk.',
      plan: 'Falls precautions and call bell in reach, staged position changes taught and demonstrated back, oral iron with vitamin C away from tea and dairy. Escalate for chest pain or breathlessness at rest.',
    },
  },
};

/** Splits the "118/74" string patients carry into its two numbers. */
function parseBp(value: unknown): { systolic: number; diastolic: number } {
  const match = typeof value === 'string' ? value.match(/(\d+)\s*\/\s*(\d+)/) : null;
  if (!match) return { systolic: 120, diastolic: 80 };
  return { systolic: Number(match[1]), diastolic: Number(match[2]) };
}

const HOUR_MS = 60 * 60 * 1000;

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

  // Only completed scenarios are charted. An overdue one is work the student
  // never did, and inventing a bedside record for it would contradict the
  // assignment sitting next to it.
  const { data: assignmentRows, error } = await supabase
    .from('scenario_assignments')
    .select(
      'id, student_id, submitted_at, assigned_at, ' +
        'scenarios:scenario_id(title, patient_id, patients:patient_id(id, name, vital_signs))',
    )
    .eq('status', 'completed');
  if (error) {
    console.error('Failed to read scenario assignments:', error.message);
    process.exit(1);
  }

  // PostgREST's generated types give up on a two-level embed, so the shape is
  // named here once rather than cast at every use.
  const assignments = (assignmentRows ?? []) as unknown as {
    id: string;
    student_id: string;
    submitted_at: string | null;
    assigned_at: string | null;
    scenarios: {
      title: string;
      patients: { id: string; name: string; vital_signs: Record<string, unknown> } | null;
    } | null;
  }[];

  // Faculty who teach each student, for the notes they countersign.
  const { data: links } = await supabase.from('faculty_sections').select('faculty_id, section_id');
  const { data: studentRows } = await supabase
    .from('users')
    .select('id, email, section_id')
    .eq('role', 'student');
  const facultyBySection = new Map((links ?? []).map((l) => [l.section_id, l.faculty_id]));
  const studentById = new Map((studentRows ?? []).map((s) => [s.id, s]));

  let vitalsCount = 0;
  let anomalyCount = 0;
  let tprCount = 0;
  let ivfCount = 0;
  let noteCount = 0;
  let reviewed = 0;
  const missing = new Set<string>();

  for (const row of assignments) {
    const patient = row.scenarios?.patients;
    if (!patient) continue;

    const chart = CHARTS[patient.name];
    if (!chart) {
      missing.add(patient.name);
      continue;
    }

    const student = studentById.get(row.student_id);
    if (!student) continue;
    const facultyId = facultyBySection.get(student.section_id) ?? null;
    const rng = seeded(hash(`${student.email}|${patient.name}`));

    // This (patient, student) pair is ours — rebuild rather than stack.
    await supabase.from('vital_sign_readings').delete().eq('patient_id', patient.id).eq('recorded_by', student.id);
    await supabase.from('tpr_records').delete().eq('patient_id', patient.id).eq('recorded_by', student.id);
    await supabase.from('ivf_records').delete().eq('patient_id', patient.id).eq('recorded_by', student.id);
    await supabase.from('progress_notes').delete().eq('patient_id', patient.id).eq('author_id', student.id);

    // Charting sits inside the shift the student worked the scenario.
    const base = new Date(row.submitted_at ?? row.assigned_at ?? Date.now());
    const dayStart = new Date(base);
    dayStart.setHours(6, 0, 0, 0);

    const vitals = (patient.vital_signs ?? {}) as {
      temperature?: number; heart_rate?: number; respiratory_rate?: number;
    };
    const baseTemp = Number(vitals.temperature ?? 37);
    const basePulse = Number(vitals.heart_rate ?? 80);
    const baseResp = Number(vitals.respiratory_rate ?? 18);

    const tprRows = SHIFTS.map((shift, i) => ({
      patient_id: patient.id,
      recorded_by: student.id,
      // AM at 06:00, PM at 14:00, Night at 22:00, with a few minutes of
      // jitter so three students charting the same patient do not all land
      // on the same timestamp.
      recorded_at: new Date(dayStart.getTime() + i * 8 * HOUR_MS + Math.round(rng() * 25) * 60000).toISOString(),
      shift,
      temperature_c: Math.round((baseTemp + chart.temp[i]) * 10) / 10,
      pulse: Math.max(40, basePulse + chart.pulse[i]),
      respiration: Math.max(8, baseResp + chart.resp[i]),
      remarks: chart.remarks[i],
    }));
    const { error: tprError } = await supabase.from('tpr_records').insert(tprRows);
    if (tprError) {
      console.error(`  ✗ TPR for ${patient.name} / ${student.email}:`, tprError.message);
      process.exit(1);
    }
    tprCount += tprRows.length;

    // Vital signs sit alongside TPR but carry the fuller set the Vitals
    // screen records — blood pressure, saturation and pain — and each one is
    // run through evaluateVitals(), the same rules the app applies on save,
    // so is_anomaly and anomaly_reasons say exactly what a real reading would.
    const bp = parseBp((vitals as { blood_pressure?: unknown }).blood_pressure);
    const baseSpo2 = Number((vitals as { oxygen_saturation?: number }).oxygen_saturation ?? 98);

    const vitalRows = SHIFTS.map((shift, i) => {
      const reading = {
        heart_rate: Math.max(40, basePulse + chart.pulse[i]),
        bp_systolic: bp.systolic + chart.bp[i][0],
        bp_diastolic: bp.diastolic + chart.bp[i][1],
        temperature_c: Math.round((baseTemp + chart.temp[i]) * 10) / 10,
        respiratory_rate: Math.max(8, baseResp + chart.resp[i]),
        oxygen_saturation: Math.min(100, baseSpo2 + chart.spo2[i]),
        pain_score: chart.pain[i],
      };
      const evaluation = evaluateVitals(reading);
      return {
        patient_id: patient.id,
        recorded_by: student.id,
        // Half an hour after the TPR round, the order a student works in.
        recorded_at: new Date(
          dayStart.getTime() + i * 8 * HOUR_MS + 30 * 60000 + Math.round(rng() * 15) * 60000,
        ).toISOString(),
        ...reading,
        notes: chart.remarks[i],
        is_anomaly: evaluation.is_anomaly,
        anomaly_reasons: evaluation.reasons,
      };
    });
    const { error: vitalsError } = await supabase.from('vital_sign_readings').insert(vitalRows);
    if (vitalsError) {
      console.error(`  ✗ Vitals for ${patient.name} / ${student.email}:`, vitalsError.message);
      process.exit(1);
    }
    vitalsCount += vitalRows.length;
    anomalyCount += vitalRows.filter((v) => v.is_anomaly).length;

    if (chart.ivf) {
      const started = new Date(dayStart.getTime() + HOUR_MS);
      const { error: ivfError } = await supabase.from('ivf_records').insert({
        patient_id: patient.id,
        recorded_by: student.id,
        solution: chart.ivf.solution,
        volume_ml: chart.ivf.volume_ml,
        rate_ml_hr: chart.ivf.rate_ml_hr,
        site: chart.ivf.site,
        status: chart.ivf.status,
        started_at: started.toISOString(),
        // A completed infusion ran its volume at its rate; an ongoing one
        // has no end yet.
        ended_at:
          chart.ivf.status === 'completed'
            ? new Date(started.getTime() + (chart.ivf.volume_ml / chart.ivf.rate_ml_hr) * HOUR_MS).toISOString()
            : null,
        remarks: chart.ivf.remarks,
      });
      if (ivfError) {
        console.error(`  ✗ IVF for ${patient.name} / ${student.email}:`, ivfError.message);
        process.exit(1);
      }
      ivfCount += 1;
    }

    // Roughly two in three notes have been countersigned; the rest are the
    // queue a faculty member still has to work through.
    const isReviewed = facultyId !== null && rng() < 0.65;
    const writtenAt = new Date(dayStart.getTime() + 20 * HOUR_MS);
    const { error: noteError } = await supabase.from('progress_notes').insert({
      patient_id: patient.id,
      author_id: student.id,
      content:
        `S: ${chart.note.subjective}\n\n` +
        `O: ${chart.note.objective}\n\n` +
        `A: ${chart.note.assessment}\n\n` +
        `P: ${chart.note.plan}`,
      structured: chart.note,
      reviewed_by: isReviewed ? facultyId : null,
      reviewed_at: isReviewed ? new Date(writtenAt.getTime() + 6 * HOUR_MS).toISOString() : null,
      created_at: writtenAt.toISOString(),
    });
    if (noteError) {
      console.error(`  ✗ Note for ${patient.name} / ${student.email}:`, noteError.message);
      process.exit(1);
    }
    noteCount += 1;
    if (isReviewed) reviewed += 1;
  }

  // ---- Admission history ------------------------------------------------
  //
  // The chart's timeline is not a table of its own: it reads audit_logs for
  // entity_type 'patients' and the three lifecycle actions, which is what the
  // app writes as patients are created and moved. Seeding it means writing
  // those same rows. entity_id is plain text here — 031 dropped the foreign
  // key so an actor or patient can be removed without taking the trail.
  const { data: allPatients } = await supabase
    .from('patients')
    .select('id, name, room_number, admission_date, created_by, created_at');

  let eventCount = 0;
  let skippedTimelines = 0;
  for (const patient of allPatients ?? []) {
    // audit_logs is append-only — 031 restored a trigger that refuses both
    // DELETE and UPDATE, because a trail you can rewrite is not a trail. So
    // this cannot rebuild its rows the way the rest of the seed does: it
    // writes a patient's timeline once and then leaves it alone. Re-running
    // after editing the events below will not replace them.
    const { count: existingEvents } = await supabase
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('entity_type', 'patients')
      .eq('entity_id', patient.id)
      .in('action', ['patient.create', 'patient.check_in', 'patient.check_out']);
    if ((existingEvents ?? 0) > 0) {
      skippedTimelines += 1;
      continue;
    }

    const admitted = new Date(patient.admission_date ?? patient.created_at ?? Date.now());
    // eventDetail() in PatientChart reads room/to_room/from_room, and the
    // label it shows is the bare room number rather than the full name.
    const roomNumber = (patient.room_number ?? '').split('Room ').pop() ?? null;
    const rng = seeded(hash(`admission|${patient.name}`));

    // Some of the ward has been here before. That earlier stay has to sit
    // *before* the current admission, not after it: admission_date is when
    // this stay began, so hanging a discharge and readmission off the end
    // would date them in the future and leave a trail that ends in a
    // check-out while the row still reads admitted.
    const readmitted = rng() < 0.4;
    const events: { action: string; at: Date; details: Record<string, unknown> }[] = readmitted
      ? [
          {
            action: 'patient.create',
            at: new Date(admitted.getTime() - 10 * 24 * HOUR_MS),
            details: { name: patient.name, room: roomNumber },
          },
          {
            action: 'patient.check_out',
            at: new Date(admitted.getTime() - 8 * 24 * HOUR_MS),
            details: { name: patient.name, from_room: roomNumber, discharge_summary_id: null },
          },
          {
            action: 'patient.check_in',
            at: admitted,
            details: { name: patient.name, to_room: roomNumber },
          },
        ]
      : [
          {
            action: 'patient.create',
            at: admitted,
            details: { name: patient.name, room: roomNumber },
          },
        ];

    const { error: eventError } = await supabase.from('audit_logs').insert(
      events.map((e) => ({
        actor_id: patient.created_by,
        actor_role: 'faculty' as const,
        action: e.action,
        entity_type: 'patients',
        entity_id: patient.id,
        details: e.details,
        created_at: e.at.toISOString(),
      })),
    );
    if (eventError) {
      console.error(`  ✗ Admission history for ${patient.name}:`, eventError.message);
      process.exit(1);
    }
    eventCount += events.length;
  }

  for (const name of missing) {
    console.warn(`  note: no chart defined for patient "${name}" — left unchartted.`);
  }
  console.log(
    `\nVital readings: ${vitalsCount} (${anomalyCount} flagged anomalous)\n` +
      `TPR entries: ${tprCount}\nIVF records: ${ivfCount}\n` +
      `Progress notes: ${noteCount} (${reviewed} countersigned by faculty)\n` +
      `Admission events: ${eventCount} written` +
      (skippedTimelines > 0
        ? `, ${skippedTimelines} patient timeline(s) already present and left as-is`
        : ` across ${allPatients?.length ?? 0} patients`),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
