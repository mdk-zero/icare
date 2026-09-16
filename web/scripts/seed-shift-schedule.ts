/**
 * The duty roster: ward shifts and who turned up for them.
 *
 * Attendance is tied to the rest of the data twice over.
 *
 * Where a student charted inside a shift window — vitals, TPR and notes all
 * carry timestamps from the earlier seeds — that charting *is* the record of
 * their shift: check-in is their first entry, check-out their last, and they
 * are late if the first lands more than SHIFT_LATE_AFTER_MINUTES after the
 * bell. Those rows agree with the chart exactly.
 *
 * Everywhere else attendance is drawn against the student's own reliability,
 * because charting is evidence of attendance but silence is not evidence of
 * absence — a student can work a shift without writing anything, and the
 * seeded charting clusters on the days their scenarios ran. Reliability comes
 * from the work they have outstanding: a student carrying overdue scenarios
 * misses more shifts than one who finished everything, so the roster and the
 * quiz record describe the same person.
 *
 * Shifts are built from SHIFT_TYPE_PRESETS in lib/shifts, the same rotation
 * times the faculty UI offers, and rostered the way the create route rosters
 * them: every student in the section, assigned by the faculty who teaches it.
 * Rooms come from where that section's patients actually are.
 *
 * The window runs three weeks back and one forward, so the attendance page
 * has past shifts to review and upcoming ones to plan against — an upcoming
 * shift keeps its roster on 'scheduled', because nobody has been anywhere yet.
 *
 *   npx tsx scripts/seed-shift-schedule.ts
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  SHIFT_TYPE_PRESETS,
  SHIFT_END_GRACE_MINUTES,
  SHIFT_LATE_AFTER_MINUTES,
  presetEndsNextDay,
  type ShiftType,
  type ShiftAttendanceStatus,
} from '../app/lib/shifts';

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
const MINUTE_MS = 60_000;

/** Weekdays only — the ward runs a teaching rotation, not a 24/7 roster. */
const DAYS_BACK = 21;
const DAYS_FORWARD = 7;

/** Which section rotates through which room, and on what pattern. */
const ROTATIONS: { section: string; room_number: string; label: string }[] = [
  { section: 'BSN 1101', room_number: '201', label: 'Med-Surg Ward Rotation' },
  { section: 'BSN 1102', room_number: '101', label: 'Skills Laboratory Rotation' },
];

/** Monday/Wednesday/Friday run AM; Tuesday/Thursday run PM. */
function shiftTypeForDay(day: number): Exclude<ShiftType, 'custom'> | null {
  if (day === 1 || day === 3 || day === 5) return 'am';
  if (day === 2 || day === 4) return 'pm';
  return null;
}

/** Expands a preset onto a date, rolling the end forward for a night shift. */
function windowFor(date: Date, type: Exclude<ShiftType, 'custom'>): { start: Date; end: Date } {
  const preset = SHIFT_TYPE_PRESETS[type];
  const [sh, sm] = preset.start.split(':').map(Number);
  const [eh, em] = preset.end.split(':').map(Number);
  const start = new Date(date);
  start.setHours(sh, sm, 0, 0);
  const end = new Date(date);
  end.setHours(eh, em, 0, 0);
  if (presetEndsNextDay(type)) end.setDate(end.getDate() + 1);
  return { start, end };
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

  const { data: campus } = await supabase.from('campuses').select('id').limit(1).maybeSingle();
  const { data: sections } = await supabase.from('sections').select('id, name');
  const sectionByName = new Map((sections ?? []).map((s) => [s.name, s.id]));
  const { data: links } = await supabase.from('faculty_sections').select('faculty_id, section_id');
  const facultyBySection = new Map((links ?? []).map((l) => [l.section_id, l.faculty_id]));
  const { data: rooms } = await supabase.from('rooms').select('id, room_number');
  const roomByNumber = new Map((rooms ?? []).map((r) => [r.room_number, r.id]));
  const { data: students } = await supabase
    .from('users')
    .select('id, email, section_id')
    .eq('role', 'student');

  // Every timestamped thing a student charted, so attendance can be read off
  // the record rather than guessed. Three tables, one list per student.
  const activity = new Map<string, number[]>();
  const push = (studentId: string | null, at: string | null) => {
    if (!studentId || !at) return;
    const list = activity.get(studentId) ?? [];
    list.push(new Date(at).getTime());
    activity.set(studentId, list);
  };
  const [vitals, tpr, notes] = await Promise.all([
    supabase.from('vital_sign_readings').select('recorded_by, recorded_at'),
    supabase.from('tpr_records').select('recorded_by, recorded_at'),
    supabase.from('progress_notes').select('author_id, created_at'),
  ]);
  for (const r of vitals.data ?? []) push(r.recorded_by, r.recorded_at);
  for (const r of tpr.data ?? []) push(r.recorded_by, r.recorded_at);
  for (const r of notes.data ?? []) push(r.author_id, r.created_at);
  for (const list of activity.values()) list.sort((a, b) => a - b);

  // How reliable each student has been, read off the work they were set.
  // A student carrying overdue scenarios and quizzes is the one who also
  // misses rotations; one who finished everything turns up. This is what ties
  // the roster to the rest of the seeded record rather than to a coin flip.
  const reliability = new Map<string, number>();
  const [scenarioWork, quizWork] = await Promise.all([
    supabase.from('scenario_assignments').select('student_id, status'),
    supabase.from('assessment_assignments').select('student_id, status'),
  ]);
  const totals = new Map<string, { done: number; missed: number }>();
  for (const row of [...(scenarioWork.data ?? []), ...(quizWork.data ?? [])]) {
    const entry = totals.get(row.student_id) ?? { done: 0, missed: 0 };
    if (row.status === 'completed') entry.done += 1;
    else entry.missed += 1;
    totals.set(row.student_id, entry);
  }
  for (const [studentId, { done, missed }] of totals) {
    const assigned = done + missed;
    // 0.94 for a student who finished everything, down to about 0.6 for one
    // who finished none — poor attendance, not a total no-show.
    const completion = assigned > 0 ? done / assigned : 1;
    reliability.set(studentId, 0.6 + 0.34 * completion);
  }

  const now = Date.now();
  let shiftCount = 0;
  let assignmentCount = 0;
  const tally: Record<string, number> = {};

  for (const rotation of ROTATIONS) {
    const sectionId = sectionByName.get(rotation.section);
    if (!sectionId) {
      console.warn(`  skipped ${rotation.section} — no such section`);
      continue;
    }
    const facultyId = facultyBySection.get(sectionId) ?? null;
    const roomId = roomByNumber.get(rotation.room_number) ?? null;
    const roster = (students ?? []).filter((s) => s.section_id === sectionId);
    if (roster.length === 0) {
      console.warn(`  skipped ${rotation.section} — no students`);
      continue;
    }

    // One series per (section, shift type), the way a recurring rotation
    // created through the UI would group its occurrences.
    const seriesFor = new Map<string, string>();

    // This section's shifts are ours to rebuild. Assignments cascade.
    const { data: old } = await supabase.from('shifts').select('id').eq('section_id', sectionId);
    for (const row of old ?? []) await supabase.from('shifts').delete().eq('id', row.id);

    for (let offset = -DAYS_BACK; offset <= DAYS_FORWARD; offset++) {
      const date = new Date(now + offset * DAY_MS);
      const type = shiftTypeForDay(date.getDay());
      if (!type) continue;

      const { start, end } = windowFor(date, type);
      if (!seriesFor.has(type)) seriesFor.set(type, crypto.randomUUID());

      const { data: shift, error } = await supabase
        .from('shifts')
        .insert({
          campus_id: campus?.id ?? null,
          section_id: sectionId,
          room_id: roomId,
          created_by: facultyId,
          label: rotation.label,
          shift_type: type,
          starts_at: start.toISOString(),
          ends_at: end.toISOString(),
          capacity: roster.length,
          status: 'scheduled' as const,
          series_id: seriesFor.get(type),
          notes: null,
        })
        .select('id')
        .single();
      if (error || !shift) {
        console.error(`  ✗ shift ${rotation.section} ${date.toDateString()}:`, error?.message);
        process.exit(1);
      }
      shiftCount += 1;

      const graceEnd = end.getTime() + SHIFT_END_GRACE_MINUTES * MINUTE_MS;
      const lateAfter = start.getTime() + SHIFT_LATE_AFTER_MINUTES * MINUTE_MS;
      const upcoming = start.getTime() > now;

      const rows = roster.map((student) => {
        // Seeded on the shift's slot rather than its row id: the id is a
        // fresh uuid every run, which made the whole roster re-roll each
        // time and the counts drift between otherwise identical runs.
        const rng = seeded(hash(`${student.email}|${rotation.section}|${type}|${start.toISOString()}`));
        // Nothing has happened yet on a shift that has not started.
        if (upcoming) {
          return {
            shift_id: shift.id,
            student_id: student.id,
            assigned_by: facultyId,
            attendance_status: 'scheduled' as ShiftAttendanceStatus,
            checked_in_at: null,
            checked_out_at: null,
            notes: null,
          };
        }

        const inWindow = (activity.get(student.id) ?? []).filter(
          (t) => t >= start.getTime() && t <= graceEnd,
        );

        if (inWindow.length === 0) {
          // Nothing charted, which is not the same as nobody there. Draw
          // against how reliable this student has been elsewhere.
          const rate = reliability.get(student.id) ?? 0.9;
          const roll = rng();
          if (roll < rate) {
            // Turned up and worked without charting. Most arrive inside the
            // first few minutes; scattering uniformly across the half hour
            // put half the ward past the 15-minute line and made 'late' the
            // commonest outcome on the roster.
            const minutesLate = rng() < 0.85
              ? Math.round(rng() * 12)
              : SHIFT_LATE_AFTER_MINUTES + 1 + Math.round(rng() * 25);
            const arrived = start.getTime() + minutesLate * MINUTE_MS;
            const status: ShiftAttendanceStatus =
              arrived > lateAfter ? 'late' : 'present';
            return {
              shift_id: shift.id,
              student_id: student.id,
              assigned_by: facultyId,
              attendance_status: status,
              checked_in_at: new Date(arrived).toISOString(),
              checked_out_at: new Date(end.getTime() - Math.round(rng() * 10) * MINUTE_MS).toISOString(),
              notes: status === 'late' ? 'Arrived after the start of the shift.' : null,
            };
          }
          const status: ShiftAttendanceStatus = roll < rate + (1 - rate) * 0.4 ? 'excused' : 'absent';
          return {
            shift_id: shift.id,
            student_id: student.id,
            assigned_by: facultyId,
            attendance_status: status,
            checked_in_at: null,
            checked_out_at: null,
            notes: status === 'excused' ? 'Excused — cleared with the clinical instructor.' : null,
          };
        }

        const first = inWindow[0];
        const last = inWindow[inWindow.length - 1];
        const status: ShiftAttendanceStatus = first > lateAfter ? 'late' : 'present';
        return {
          shift_id: shift.id,
          student_id: student.id,
          assigned_by: facultyId,
          attendance_status: status,
          checked_in_at: new Date(first).toISOString(),
          checked_out_at: new Date(Math.min(last, graceEnd)).toISOString(),
          notes: status === 'late' ? 'First entry charted after the start of the shift.' : null,
        };
      });

      const { error: assignError } = await supabase.from('shift_assignments').insert(rows);
      if (assignError) {
        console.error(`  ✗ roster for ${rotation.section}:`, assignError.message);
        process.exit(1);
      }
      assignmentCount += rows.length;
      for (const r of rows) tally[r.attendance_status] = (tally[r.attendance_status] ?? 0) + 1;
    }

    console.log(`  ✓ ${rotation.section.padEnd(10)} ${rotation.label} in room ${rotation.room_number}`);
  }

  console.log(`\nShifts: ${shiftCount}   Roster entries: ${assignmentCount}`);
  console.log('Attendance:');
  for (const [status, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${status.padEnd(12)}${n}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
