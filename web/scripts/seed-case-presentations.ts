/**
 * Seeds hospital case presentations (migration 056) for BSN 1102.
 *
 * A faculty member giving a presentation to a section reaches only their own
 * group members there, so this does what each supervisor would do in the app:
 * every BSN 1102 group's supervising faculty member (teams.faculty_id) creates
 * one presentation, and each of their members gets a submission row.
 *
 * The members are spread across the roster states so every view has
 * something to show: some cases graded on the five-criterion rubric (score
 * from the app's own caseScore), some handed in and waiting, a draft, and a
 * case not started yet. Patients are invented and, like real ones, named by
 * initials only.
 *
 * Re-runs replace the seeded presentations: any presentation with SEED_TITLE,
 * created by a BSN 1102 supervisor and given to BSN 1102, is deleted (its
 * submissions and ratings cascade) and rebuilt. Anything else is left alone.
 *
 *   npx tsx scripts/seed-case-presentations.ts
 */

import { config } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { CASE_CRITERIA, caseScore } from '../app/lib/case-rubric';
import type { TaskRating } from '../app/lib/task-ratings';

config({ path: '.env.local' });

const SECTION = 'BSN 1102';
const SEED_TITLE = 'Hospital Duty Case Presentation';
const INSTRUCTIONS =
  'Choose the most interesting patient you handled during this hospital duty and write up the case. ' +
  "Identify the patient by initials only — never a name, record number or photo. Include the vital signs, TPR and IV fluids you observed, " +
  'your prioritised nursing diagnoses, and the interventions you carried out with their rationale. Be ready to present it in class.';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const daysAgo = (d: number, hour = 9) => {
  const t = new Date(now - d * DAY);
  t.setHours(hour, 0, 0, 0);
  return t.toISOString();
};

type Status = 'not_started' | 'draft' | 'submitted' | 'graded';

interface SeedCase {
  patient_initials: string;
  age: number;
  sex: 'male' | 'female';
  hospital: string;
  ward: string;
  admitting_diagnosis: string;
  chief_complaint: string;
  history: string;
  medications: string;
  nursing_diagnoses: string;
  interventions: string;
  vitals: [hr: number, sys: number, dia: number, temp: number, rr: number, spo2: number, pain: number, notes: string][];
  ivf: [solution: string, volume: number, rate: number, site: string][];
}

const CASES: SeedCase[] = [
  {
    patient_initials: 'RM', age: 68, sex: 'male', hospital: 'Provincial Hospital', ward: 'Medical Ward (Male)',
    admitting_diagnosis: 'Community-acquired pneumonia, moderate risk',
    chief_complaint: 'Productive cough and difficulty of breathing for 4 days',
    history: 'Known hypertensive for 10 years, 40 pack-year smoker. Onset of fever and yellowish sputum 4 days prior, with progressive dyspnea on exertion.',
    medications: 'Ceftriaxone 2 g IV OD; Azithromycin 500 mg PO OD; Salbutamol nebulization q6h; Amlodipine 10 mg PO OD; Paracetamol 500 mg PO q4h PRN for T ≥ 38°C',
    nursing_diagnoses: '1. Ineffective airway clearance related to retained secretions\n2. Impaired gas exchange related to alveolar consolidation\n3. Hyperthermia related to infectious process',
    interventions: 'Positioned in high Fowler\'s and taught controlled coughing (to mobilise secretions). Administered nebulization as ordered and monitored SpO2 q2h. Encouraged 2–3 L oral fluids per day to thin secretions. Tepid sponge bath and antipyretic for fever. Health teaching on smoking cessation.',
    vitals: [[104, 150, 90, 38.6, 26, 91, 3, 'On O2 2 L/min via nasal cannula'], [96, 140, 86, 37.9, 22, 94, 2, 'After nebulization']],
    ivf: [['PNSS 1 L', 1000, 83, 'Left metacarpal vein']],
  },
  {
    patient_initials: 'KA', age: 19, sex: 'female', hospital: 'Provincial Hospital', ward: 'Isolation Ward',
    admitting_diagnosis: 'Dengue fever with warning signs',
    chief_complaint: 'High-grade fever for 5 days with abdominal pain and gum bleeding',
    history: 'Previously healthy college student. Fever of 39–40°C for 5 days, then abdominal pain, vomiting twice and gum bleeding on day 5. Platelet count 68,000/µL on admission.',
    medications: 'Paracetamol 500 mg PO q6h PRN; Omeprazole 40 mg IV OD',
    nursing_diagnoses: '1. Risk for bleeding related to thrombocytopenia\n2. Deficient fluid volume related to plasma leakage\n3. Acute pain related to the inflammatory process',
    interventions: 'Monitored for bleeding (gums, stool, urine) and avoided IM injections. Strict intake and output monitoring with hourly urine output. Maintained IV fluids at the ordered rate and reported a narrowing pulse pressure. Soft-bristled toothbrush and bed rest. Explained warning signs to the patient and her mother.',
    vitals: [[110, 100, 80, 38.9, 22, 98, 5, 'Narrow pulse pressure — reported to resident'], [98, 104, 76, 37.8, 20, 98, 3, '']],
    ivf: [['PLR 1 L', 1000, 120, 'Right cephalic vein']],
  },
  {
    patient_initials: 'EB', age: 57, sex: 'male', hospital: 'Regional Medical Center', ward: 'Surgical Ward',
    admitting_diagnosis: 'Diabetic foot ulcer, left, with cellulitis; Type 2 diabetes mellitus, uncontrolled',
    chief_complaint: 'Foul-smelling wound on the left foot for 2 weeks',
    history: 'Diabetic for 12 years with poor compliance to metformin. Stepped on a nail 3 weeks prior and self-treated with herbal leaves. Admission CBG 312 mg/dL.',
    medications: 'Insulin glargine 20 units SC HS; Insulin lispro sliding scale before meals; Piperacillin-tazobactam 4.5 g IV q8h; Tramadol 50 mg IV q8h PRN',
    nursing_diagnoses: '1. Impaired skin integrity related to the infected ulcer\n2. Unstable blood glucose level related to non-adherence to therapy\n3. Deficient knowledge related to diabetic foot care',
    interventions: 'Assisted the surgeon with wound debridement and did daily sterile dressing. CBG monitoring before meals and at bedtime, insulin given per sliding scale. Elevated the affected foot. Taught daily foot inspection, proper footwear and why self-treating wounds is dangerous.',
    vitals: [[92, 138, 84, 37.8, 20, 97, 6, 'Pain at wound site'], [86, 132, 80, 37.2, 18, 98, 4, 'Post-debridement']],
    ivf: [['D5 0.3% NaCl 1 L', 1000, 60, 'Right metacarpal vein']],
  },
  {
    patient_initials: 'LS', age: 72, sex: 'female', hospital: 'Regional Medical Center', ward: 'Neuro Ward',
    admitting_diagnosis: 'Acute ischemic stroke, left MCA territory',
    chief_complaint: 'Sudden right-sided weakness and slurred speech',
    history: 'Hypertensive and on irregular medication. Found by her daughter with right-sided weakness 3 hours after waking. CT scan showed a left MCA infarct.',
    medications: 'Aspirin 160 mg PO OD (via NGT); Atorvastatin 80 mg PO HS; Citicoline 1 g IV q12h',
    nursing_diagnoses: '1. Impaired physical mobility related to right hemiparesis\n2. Risk for aspiration related to impaired swallowing\n3. Impaired verbal communication related to expressive aphasia',
    interventions: 'Turned q2h with the affected side supported, and did passive ROM exercises. Kept the head of bed at 30° and checked NGT placement before every feeding. Used yes/no questions and a picture board to communicate. Did neuro checks (GCS, pupils) q4h.',
    vitals: [[84, 168, 96, 36.9, 18, 96, 0, 'GCS 14 (E4V4M6)'], [80, 158, 92, 37.0, 18, 97, 0, '']],
    ivf: [['PNSS 1 L', 1000, 42, 'Left cephalic vein']],
  },
  {
    patient_initials: 'JC', age: 24, sex: 'male', hospital: 'District Hospital', ward: 'Surgical Ward',
    admitting_diagnosis: 'Acute appendicitis, s/p open appendectomy (post-op day 1)',
    chief_complaint: 'Right lower quadrant pain for 1 day',
    history: 'Periumbilical pain that migrated to the right lower quadrant, with anorexia and vomiting. Rebound tenderness at McBurney\'s point. Appendectomy under spinal anesthesia with no complications.',
    medications: 'Cefuroxime 750 mg IV q8h; Ketorolac 30 mg IV q8h; Metronidazole 500 mg IV q8h',
    nursing_diagnoses: '1. Acute pain related to the surgical incision\n2. Risk for infection related to the surgical wound\n3. Risk for ineffective breathing pattern related to post-anesthesia splinting',
    interventions: 'Assessed pain with the numeric scale and gave analgesics on schedule. Taught splinting of the incision with a pillow when coughing, and incentive spirometry every hour while awake. Watched the dressing for bleeding or discharge. Early ambulation on post-op day 1. Diet progressed as tolerated.',
    vitals: [[88, 120, 78, 37.4, 18, 98, 5, 'Post-op day 1'], [80, 118, 76, 37.1, 16, 99, 3, 'After ambulation']],
    ivf: [['D5LR 1 L', 1000, 100, 'Left metacarpal vein']],
  },
  {
    patient_initials: 'MT', age: 3, sex: 'male', hospital: 'District Hospital', ward: 'Pediatric Ward',
    admitting_diagnosis: 'Acute gastroenteritis with moderate dehydration',
    chief_complaint: 'Watery stools 8 times a day for 2 days with vomiting',
    history: 'Watery, non-bloody stools and vomiting after meals. Sunken eyes and decreased urine output noted by the mother. Weight 13 kg.',
    medications: 'Zinc sulfate 20 mg PO OD for 14 days; ORS 75 mL/kg over 4 hours; Ondansetron 2 mg IV once',
    nursing_diagnoses: '1. Deficient fluid volume related to excessive GI losses\n2. Risk for impaired skin integrity (perianal) related to frequent stools\n3. Deficient knowledge (caregiver) related to home rehydration',
    interventions: 'Weighed diapers to measure output and monitored skin turgor, fontanelle and mucosa. Gave ORS in small frequent sips. Gentle perianal care with barrier cream. Taught the mother how to prepare ORS and the danger signs that need a return to hospital.',
    vitals: [[132, 90, 60, 37.6, 30, 99, 0, 'Irritable, sunken eyes'], [118, 92, 62, 37.2, 28, 99, 0, 'Tolerating ORS']],
    ivf: [['D5 0.3% NaCl 500 mL', 500, 45, 'Right dorsal hand (pedia set)']],
  },
  {
    patient_initials: 'AV', age: 31, sex: 'female', hospital: 'Provincial Hospital', ward: 'OB Ward',
    admitting_diagnosis: 'G2P1 (1001), pregnancy uterine 34 weeks AOG, preeclampsia with severe features',
    chief_complaint: 'Severe headache and blurring of vision',
    history: 'Blood pressure had been normal at prenatal checkups until 32 weeks. Came in with BP 170/110, 3+ proteinuria and bipedal edema.',
    medications: 'Magnesium sulfate 4 g IV loading then 1 g/hr; Hydralazine 5 mg IV PRN for BP ≥ 160/110; Dexamethasone 6 mg IM q12h x 4 doses',
    nursing_diagnoses: '1. Risk for injury (maternal seizure) related to cerebral irritability\n2. Risk for fetal injury related to reduced placental perfusion\n3. Anxiety related to the threat to her own and her baby\'s wellbeing',
    interventions: 'Kept the room quiet and dim, with seizure precautions and padded side rails. Monitored for magnesium toxicity (patellar reflex, RR ≥ 12, urine output ≥ 30 mL/hr) with calcium gluconate at bedside. Checked fetal heart tones q1h. Positioned in left lateral recumbent. Explained each procedure to lessen her anxiety.',
    vitals: [[96, 168, 108, 36.8, 18, 98, 6, 'Headache, patellar reflex +2'], [90, 150, 98, 36.9, 16, 98, 3, 'After hydralazine']],
    ivf: [['PLR 1 L', 1000, 80, 'Left cephalic vein'], ['Magnesium sulfate in PNSS 250 mL', 250, 25, 'Right cephalic vein']],
  },
  {
    patient_initials: 'CD', age: 64, sex: 'female', hospital: 'Regional Medical Center', ward: 'Medical Ward (Female)',
    admitting_diagnosis: 'Congestive heart failure, NYHA class III, in acute exacerbation',
    chief_complaint: 'Shortness of breath when lying down and bilateral leg swelling',
    history: 'Known hypertensive heart disease. Stopped furosemide 2 weeks ago because of frequent urination. Sleeps on 3 pillows and has crackles at both lung bases.',
    medications: 'Furosemide 40 mg IV q12h; Losartan 50 mg PO OD; Spironolactone 25 mg PO OD; Isosorbide dinitrate 10 mg PO TID',
    nursing_diagnoses: '1. Excess fluid volume related to compromised regulatory mechanisms\n2. Decreased cardiac output related to impaired contractility\n3. Activity intolerance related to an imbalance between oxygen supply and demand',
    interventions: 'Daily weight at the same time and strict intake and output, with fluids restricted to 1.5 L per day. Kept her in semi-Fowler\'s and monitored lung sounds. Watched potassium while on diuretics. Grouped nursing care so she could rest. Taught her why she should not stop her diuretics and to follow a low-salt diet.',
    vitals: [[102, 156, 94, 36.7, 24, 92, 2, 'Bibasal crackles'], [90, 138, 86, 36.8, 20, 95, 1, 'After diuresis — UO 1.2 L']],
    ivf: [['D5W 500 mL (KVO)', 500, 10, 'Left metacarpal vein']],
  },
];

/** Rubric ratings per graded student, in CASE_CRITERIA order. */
const GRADES: TaskRating[][] = [
  ['excellent', 'excellent', 'satisfactory', 'excellent', 'satisfactory'],
  ['satisfactory', 'needs_practice', 'satisfactory', 'satisfactory', 'satisfactory'],
  ['excellent', 'satisfactory', 'excellent', 'satisfactory', 'excellent'],
];
const GRADE_REMARKS = [
  'A well-organised case, and your rationale for each intervention was clear. Prioritise the airway diagnosis first next time.',
  'Your assessment findings were incomplete: record every vital sign you took, with its time. The delivery was fine.',
  'Strong nursing diagnoses and a confident delivery. You protected the patient\'s privacy well.',
];

/** The roster state of each member, by their position (by name) in the group. */
const PLANS: Status[][] = [
  ['graded', 'graded', 'submitted', 'draft'],
  ['graded', 'submitted', 'draft', 'not_started'],
];

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }
  const supabase: SupabaseClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: section, error: sectionError } = await supabase.from('sections').select('id').eq('name', SECTION).single();
  if (sectionError || !section) throw new Error(`Section ${SECTION} not found`);

  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('id, name, faculty_id')
    .eq('section_id', section.id)
    .order('name');
  if (teamsError) throw teamsError;
  const supervised = (teams ?? []).filter((t) => t.faculty_id);
  if (supervised.length === 0) throw new Error(`${SECTION} has no supervised groups`);

  const supervisors = [...new Set(supervised.map((t) => t.faculty_id as string))];
  const { data: old, error: oldError } = await supabase
    .from('case_presentations')
    .select('id')
    .eq('title', SEED_TITLE)
    .in('created_by', supervisors)
    .contains('section_ids', [section.id]);
  if (oldError) throw oldError;
  if ((old ?? []).length > 0) {
    const { error } = await supabase.from('case_presentations').delete().in('id', old!.map((p) => p.id));
    if (error) throw error;
    console.log(`Replaced ${old!.length} earlier seeded presentation(s)`);
  }

  let caseIndex = 0;
  let gradeIndex = 0;
  for (const [teamIndex, team] of supervised.entries()) {
    const { data: members, error: membersError } = await supabase
      .from('team_members')
      .select('student_id, users!inner(name)')
      .eq('team_id', team.id);
    if (membersError) throw membersError;
    const roster = (members ?? [])
      .map((m) => ({ id: m.student_id as string, name: (m.users as unknown as { name: string }).name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (roster.length === 0) continue;

    const createdAt = daysAgo(10, 8);
    const { data: presentation, error: presError } = await supabase
      .from('case_presentations')
      .insert({
        title: SEED_TITLE,
        instructions: INSTRUCTIONS,
        deadline: new Date(now + 3 * DAY).toISOString(),
        section_ids: [section.id],
        created_by: team.faculty_id,
        created_at: createdAt,
        updated_at: createdAt,
      })
      .select('id')
      .single();
    if (presError || !presentation) throw presError ?? new Error('Insert failed');

    const plan = PLANS[teamIndex % PLANS.length];
    for (const [i, student] of roster.entries()) {
      const status = plan[i % plan.length];
      const c = CASES[caseIndex++ % CASES.length];
      const row: Record<string, unknown> = {
        presentation_id: presentation.id,
        student_id: student.id,
        status,
        created_at: createdAt,
        updated_at: createdAt,
      };

      if (status !== 'not_started') {
        const observed = (n: number) => daysAgo(8 - n * 0.25, 8 + n * 4);
        Object.assign(row, {
          patient_initials: c.patient_initials,
          age: c.age,
          sex: c.sex,
          hospital: c.hospital,
          ward: c.ward,
          admitting_diagnosis: c.admitting_diagnosis,
          chief_complaint: c.chief_complaint,
          history: c.history,
          medications: c.medications,
          observations: {
            vitals: c.vitals.map(([heart_rate, bp_systolic, bp_diastolic, temperature_c, respiratory_rate, oxygen_saturation, pain_score, notes], n) => ({
              heart_rate, bp_systolic, bp_diastolic, temperature_c, respiratory_rate, oxygen_saturation, pain_score, notes, observed_at: observed(n),
            })),
            tpr: c.vitals.map(([pulse, , , temperature_c, respiration], n) => ({
              temperature_c, pulse, respiration, remarks: '', observed_at: observed(n),
            })),
            ivf: c.ivf.map(([solution, volume_ml, rate_ml_hr, site]) => ({
              solution, volume_ml, rate_ml_hr, site, remarks: '', observed_at: observed(0),
            })),
          },
          updated_at: daysAgo(3, 20),
        });
        // A draft is still missing its care plan.
        if (status !== 'draft') {
          Object.assign(row, { nursing_diagnoses: c.nursing_diagnoses, interventions: c.interventions });
        }
      }
      if (status === 'submitted' || status === 'graded') {
        row.submitted_at = daysAgo(2 + (i % 2), 21);
        row.updated_at = row.submitted_at;
      }

      let ratings: TaskRating[] | null = null;
      if (status === 'graded') {
        ratings = GRADES[gradeIndex % GRADES.length];
        const gradedAt = daysAgo(1, 15);
        Object.assign(row, {
          graded_by: team.faculty_id,
          graded_at: gradedAt,
          score: caseScore(new Map(CASE_CRITERIA.map((cr, k) => [cr.key, ratings![k]]))),
          remarks: GRADE_REMARKS[gradeIndex % GRADE_REMARKS.length],
          updated_at: gradedAt,
        });
        gradeIndex++;
      }

      const { data: submission, error: subError } = await supabase.from('case_submissions').insert(row).select('id').single();
      if (subError || !submission) throw subError ?? new Error('Insert failed');

      if (ratings) {
        const { error } = await supabase.from('case_submission_ratings').insert(
          CASE_CRITERIA.map((cr, k) => ({
            submission_id: submission.id,
            criterion: cr.key,
            rating: ratings![k],
            remarks: '',
            rated_by: team.faculty_id,
            rated_at: row.graded_at,
          })),
        );
        if (error) throw error;
      }

      const score = row.score === undefined ? '' : ` — ${row.score}%`;
      console.log(`${SECTION} · ${team.name}: ${student.name} → ${status}${status === 'not_started' ? '' : ` (${c.patient_initials}, ${c.admitting_diagnosis.split(',')[0]})`}${score}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
