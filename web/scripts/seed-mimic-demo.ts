import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';
import { createReadStream } from 'fs';
import { createGunzip } from 'zlib';

config({ path: '.env.local' });

const DEMO_DIR = './data/mimic-iv-demo';

const FIRST_NAMES = [
  'Juan', 'Maria', 'Carlos', 'Anna', 'Luis', 'Sofia', 'Miguel', 'Isabella',
  'Jose', 'Carmen', 'Antonio', 'Elena', 'Francisco', 'Lucia', 'Manuel', 'Victoria',
  'Pedro', 'Gabriela', 'Daniel', 'Valentina', 'Jorge', 'Camila', 'Alejandro', 'Daniela',
  'Ricardo', 'Mariana', 'Fernando', 'Paula', 'Andres', 'Natalia',
];

const LAST_NAMES = [
  'Reyes', 'Santos', 'Diaz', 'Cruz', 'Garcia', 'Rodriguez', 'Martinez', 'Hernandez',
  'Lopez', 'Gonzalez', 'Perez', 'Sanchez', 'Ramirez', 'Torres', 'Flores', 'Rivera',
  'Castillo', 'Jimenez', 'Vargas', 'Ruiz', 'Moreno', 'Aguilar', 'Mendoza', 'Ortiz',
  'Silva', 'Ramos', 'Morales', 'Chavez', 'Guerrero', 'Medina',
];

function generateName(subjectId: number): string {
  const firstIndex = subjectId % FIRST_NAMES.length;
  const lastIndex = Math.floor(subjectId / FIRST_NAMES.length) % LAST_NAMES.length;
  return `${FIRST_NAMES[firstIndex]} ${LAST_NAMES[lastIndex]}`;
}

function generateRoom(subjectId: number): string {
  const floor = (subjectId % 5) + 1;
  const room = String(100 + (subjectId % 30)).padStart(3, '0');
  return `Room ${floor}${room}`;
}

/**
 * Example clinical/teaching rooms for the admin Room Management page. The MIMIC
 * import only fills patients.room_number (free text); the `rooms` table is a
 * separate concept (capacity, status, student assignments) and nothing else
 * seeds it, so the admin side would otherwise show "No rooms found".
 */
const EXAMPLE_ROOMS: {
  name: string;
  room_number: string;
  capacity: number;
  status: 'active' | 'inactive' | 'maintenance';
  description: string;
}[] = [
  { name: 'Skills Laboratory A', room_number: '101', capacity: 12, status: 'active', description: 'Basic nursing skills practice — beds, mannequins, and supply carts.' },
  { name: 'Skills Laboratory B', room_number: '102', capacity: 12, status: 'active', description: 'IV therapy, wound care, and medication administration stations.' },
  { name: 'Health Assessment Room', room_number: '104', capacity: 10, status: 'active', description: 'Head-to-toe physical assessment stations.' },
  { name: 'Debriefing Room', room_number: '105', capacity: 20, status: 'active', description: 'Post-scenario debriefing and reflection.' },
  { name: 'Community Health Room', room_number: '106', capacity: 10, status: 'inactive', description: 'Community and public-health teaching space (currently unused).' },
  { name: 'Simulation Ward', room_number: '201', capacity: 8, status: 'active', description: 'High-fidelity med-surg simulation with monitored beds.' },
  { name: 'Maternity Simulation Suite', room_number: '202', capacity: 6, status: 'active', description: 'Obstetric and newborn care simulation.' },
  { name: 'Pediatric Simulation Room', room_number: '203', capacity: 6, status: 'active', description: 'Pediatric and neonatal scenarios.' },
  { name: 'Simulation Ward B', room_number: '204', capacity: 8, status: 'maintenance', description: 'Temporarily closed for equipment upgrades.' },
  { name: 'ICU Simulation Bay', room_number: '301', capacity: 6, status: 'active', description: 'Critical care simulation with ventilator and telemetry.' },
];

async function readGzCsv(path: string): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stream = createReadStream(path).pipe(createGunzip());
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', reject);
    stream.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const records = parse(buffer, {
        columns: true,
        skip_empty_lines: true,
        cast: false,
      }) as Record<string, string>[];
      resolve(records);
    });
  });
}

function parseNumber(value: string | undefined | null): number | null {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function fahrenheitToCelsius(f: number): number {
  return Math.round(((f - 32) * 5) / 9 * 10) / 10;
}

interface LatestValue {
  charttime: string;
  value: string;
  valuenum: number | null;
  valueuom: string;
}

function latestByItem(
  rows: Record<string, string>[],
  itemIdColumn: string,
  valueColumn = 'value',
  valueNumColumn = 'valuenum',
  valueUomColumn = 'valueuom',
): Map<string, LatestValue> {
  const map = new Map<string, LatestValue>();
  for (const row of rows) {
    const itemid = row[itemIdColumn];
    if (!itemid) continue;
    const charttime = row.charttime || row.storetime || '';
    const existing = map.get(itemid);
    if (!existing || charttime > existing.charttime) {
      map.set(itemid, {
        charttime,
        value: row[valueColumn] || '',
        valuenum: parseNumber(row[valueNumColumn]),
        valueuom: row[valueUomColumn] || '',
      });
    }
  }
  return map;
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

  // Find the seeded faculty user to attribute created_by to.
  const { data: facultyUser } = await supabase
    .from('users')
    .select('id')
    .eq('role', 'faculty')
    .maybeSingle();

  const createdBy = facultyUser?.id || null;

  console.log('Loading MIMIC-IV Demo CSVs...');
  const [
    patients,
    admissions,
    diagnoses,
    dIcdDiagnoses,
    chartevents,
    labevents,
    dLabitems,
    icustays,
  ] = await Promise.all([
    readGzCsv(`${DEMO_DIR}/hosp/patients.csv.gz`),
    readGzCsv(`${DEMO_DIR}/hosp/admissions.csv.gz`),
    readGzCsv(`${DEMO_DIR}/hosp/diagnoses_icd.csv.gz`),
    readGzCsv(`${DEMO_DIR}/hosp/d_icd_diagnoses.csv.gz`),
    readGzCsv(`${DEMO_DIR}/icu/chartevents.csv.gz`),
    readGzCsv(`${DEMO_DIR}/hosp/labevents.csv.gz`),
    readGzCsv(`${DEMO_DIR}/hosp/d_labitems.csv.gz`),
    readGzCsv(`${DEMO_DIR}/icu/icustays.csv.gz`),
  ]);

  console.log(`Loaded ${patients.length} patients, ${admissions.length} admissions, ${chartevents.length} chartevents, ${labevents.length} labevents.`);

  // Build diagnosis lookup: hadm_id -> primary diagnosis (seq_num == 1)
  const diagnosisMap = new Map<string, string>();
  const icdTitleMap = new Map<string, string>();
  for (const row of dIcdDiagnoses) {
    const key = `${row.icd_code.trim()}-${row.icd_version.trim()}`;
    icdTitleMap.set(key, row.long_title.trim());
  }
  for (const row of diagnoses) {
    if (row.seq_num.trim() === '1') {
      const hadmId = row.hadm_id.trim();
      const key = `${row.icd_code.trim()}-${row.icd_version.trim()}`;
      const title = icdTitleMap.get(key) || `ICD-${row.icd_code.trim()}`;
      diagnosisMap.set(hadmId, title);
    }
  }

  // Build patient demographics lookup.
  const patientDemoMap = new Map<string, { gender: string; age: number }>();
  for (const row of patients) {
    patientDemoMap.set(row.subject_id.trim(), {
      gender: row.gender.trim(),
      age: parseNumber(row.anchor_age) || 0,
    });
  }

  // Pick the latest admission per subject and gather their ICU stays.
  const latestAdmissionBySubject = new Map<string, Record<string, string>>();
  for (const row of admissions) {
    const subjectId = row.subject_id.trim();
    const existing = latestAdmissionBySubject.get(subjectId);
    if (!existing || row.admittime > existing.admittime) {
      latestAdmissionBySubject.set(subjectId, row);
    }
  }

  // Build ICU stay lookup to get a careunit for the room number fallback.
  const careunitByHadm = new Map<string, string>();
  for (const row of icustays) {
    const hadmId = row.hadm_id.trim();
    if (!careunitByHadm.has(hadmId)) {
      careunitByHadm.set(hadmId, row.first_careunit.trim());
    }
  }

  // Build lab item label lookup.
  const labLabelMap = new Map<string, string>();
  for (const row of dLabitems) {
    labLabelMap.set(row.itemid.trim(), row.label.trim());
  }

  // Pre-filter chartevents and labevents to latest-admission subject/hadm pairs
  // to keep the maps small and accurate.
  const targetHadmIds = new Set<string>();
  for (const row of latestAdmissionBySubject.values()) {
    targetHadmIds.add(row.hadm_id.trim());
  }

  const vitalItemIds = new Set([
    '220045', // Heart Rate
    '220210', // Respiratory Rate
    '220277', // SpO2
    '220179', // NIBP systolic
    '220180', // NIBP diastolic
    '223762', // Temperature Celsius
    '223761', // Temperature Fahrenheit
  ]);

  const charteventsByKey = new Map<string, Record<string, string>[]>();
  for (const row of chartevents) {
    if (!vitalItemIds.has(row.itemid.trim())) continue;
    const hadmId = row.hadm_id.trim();
    if (!targetHadmIds.has(hadmId)) continue;
    const key = `${row.subject_id.trim()}-${hadmId}`;
    if (!charteventsByKey.has(key)) charteventsByKey.set(key, []);
    charteventsByKey.get(key)!.push(row);
  }

  const labItemIds = new Set([
    '50912', // Creatinine
    '51006', // Urea Nitrogen
    '50971', // Potassium
    '50902', // Chloride
    '50882', // Bicarbonate
    '51222', // Hemoglobin
    '51301', // White Blood Cells
    '51265', // Platelet Count
    '51279', // Red Blood Cells
  ]);

  const labeventsByKey = new Map<string, Record<string, string>[]>();
  for (const row of labevents) {
    if (!labItemIds.has(row.itemid.trim())) continue;
    const hadmId = row.hadm_id.trim();
    if (!targetHadmIds.has(hadmId)) continue;
    const key = `${row.subject_id.trim()}-${hadmId}`;
    if (!labeventsByKey.has(key)) labeventsByKey.set(key, []);
    labeventsByKey.get(key)!.push(row);
  }

  const records: {
    subject_id: number;
    hadm_id: number;
    name: string;
    age: number;
    gender: string;
    room_number: string;
    diagnosis: string;
    admission_date: string;
    vital_signs: object;
    labs: object;
    mimic_id: string;
    created_by: string | null;
  }[] = [];

  for (const [subjectIdStr, admission] of latestAdmissionBySubject.entries()) {
    const subjectId = Number(subjectIdStr);
    const hadmId = Number(admission.hadm_id.trim());
    const demo = patientDemoMap.get(subjectIdStr);
    const key = `${subjectIdStr}-${admission.hadm_id.trim()}`;

    const chartRows = charteventsByKey.get(key) || [];
    const latestVitals = latestByItem(chartRows, 'itemid');

    const hr = latestVitals.get('220045')?.valuenum ?? null;
    const rr = latestVitals.get('220210')?.valuenum ?? null;
    const spo2 = latestVitals.get('220277')?.valuenum ?? null;
    const bpSys = latestVitals.get('220179')?.valuenum ?? null;
    const bpDia = latestVitals.get('220180')?.valuenum ?? null;

    let temp: number | null = latestVitals.get('223762')?.valuenum ?? null;
    if (temp === null) {
      const tempF = latestVitals.get('223761')?.valuenum;
      if (tempF !== null && tempF !== undefined) {
        temp = fahrenheitToCelsius(tempF);
      }
    }

    const vital_signs = {
      heart_rate: hr,
      blood_pressure: bpSys !== null && bpDia !== null ? `${bpSys}/${bpDia}` : null,
      temperature: temp,
      respiratory_rate: rr,
      oxygen_saturation: spo2,
    };

    const labRows = labeventsByKey.get(key) || [];
    const latestLabs = latestByItem(labRows, 'itemid');
    const labs: Record<string, string | number | null> = {};
    for (const [itemid, value] of latestLabs.entries()) {
      const label = labLabelMap.get(itemid);
      if (label) {
        labs[label] = value.valuenum !== null ? value.valuenum : value.value;
      }
    }

    const careunit = careunitByHadm.get(admission.hadm_id.trim());
    const room_number = generateRoom(subjectId);

    records.push({
      subject_id: subjectId,
      hadm_id: hadmId,
      name: generateName(subjectId),
      age: demo?.age || 0,
      gender: demo?.gender || 'U',
      room_number: careunit ? `${careunit} ${room_number}` : room_number,
      diagnosis: diagnosisMap.get(admission.hadm_id.trim()) || 'Unknown',
      admission_date: new Date(admission.admittime).toISOString(),
      vital_signs,
      labs,
      mimic_id: `MIMIC-${subjectId}`,
      created_by: createdBy,
    });
  }

  console.log(`Upserting ${records.length} patient records...`);

  const { error } = await supabase
    .from('patients')
    .upsert(records, { onConflict: 'subject_id,hadm_id' });

  if (error) {
    console.error('Failed to seed patients:', error.message);
    process.exit(1);
  }

  console.log('MIMIC-IV Demo patients seeded successfully.');

  // Seed the admin Room Management table (idempotent on campus + room number).
  const { data: campus } = await supabase.from('campuses').select('id').limit(1).maybeSingle();
  const roomRows = EXAMPLE_ROOMS.map((room) => ({ ...room, campus_id: campus?.id ?? null }));
  console.log(`Seeding ${roomRows.length} example rooms...`);
  const { error: roomsError } = await supabase
    .from('rooms')
    .upsert(roomRows, { onConflict: 'campus_id,room_number' });
  if (roomsError) {
    console.error('Failed to seed rooms:', roomsError.message);
    process.exit(1);
  }
  console.log('Example rooms seeded.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
