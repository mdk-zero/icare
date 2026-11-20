import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { getScopedStudentIds } from '@/app/lib/admin-scope';
import { assignedGroups } from '@/app/lib/assigned-groups';
import { isMissingRoomColumns, loadTimeLimits } from '@/app/lib/activity-room';
import { loadRoomsWithCounts } from '@/app/lib/patient-rooms';
import { scenarioKinds, kindOf } from '@/app/lib/scenario-kind';
import { fetchAll } from '@/app/lib/fetch-all';

/**
 * GET: the Wards page (098). Rooms are only where students perform, so each
 * of the Dean's rooms comes with the patient cases and Return Demonstrations
 * assigned to it: per activity, the groups doing it there, their date and how
 * many are graded. An instructor sees their own students' work, an admin
 * their own students'. `enabled: false` before 098.
 */
export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const supabase = getSupabaseAdmin();
    const [rooms, scoped] = await Promise.all([loadRoomsWithCounts(supabase, session), getScopedStudentIds(supabase, session)]);
    const roomIds = rooms.map((r) => r.id as string);
    if (roomIds.length === 0) return NextResponse.json({ rooms, activities: [], enabled: true });

    let rows: { scenario_id: string; student_id: string; room_id: string; deadline: string | null; status: string }[];
    try {
      rows = await fetchAll((from, to) =>
        supabase
          .from('scenario_assignments')
          .select('scenario_id, student_id, room_id, deadline, status')
          .in('room_id', roomIds)
          .order('id')
          .range(from, to),
      );
    } catch (err) {
      if (isMissingRoomColumns(err as { code?: string; message?: string })) {
        return NextResponse.json({ rooms, activities: [], enabled: false });
      }
      throw err;
    }
    const mine = scoped ? new Set(scoped) : null;
    const own = rows.filter((r) => !mine || mine.has(r.student_id));

    const scenarioIds = [...new Set(own.map((r) => r.scenario_id))];
    const [{ data: scenarios, error }, kinds, timeLimits, groups] = await Promise.all([
      scenarioIds.length
        ? supabase.from('scenarios').select('id, title, patient_case').in('id', scenarioIds)
        : Promise.resolve({ data: [], error: null }),
      scenarioKinds(supabase, scenarioIds),
      loadTimeLimits(supabase, scenarioIds),
      // One "activity" per room and case, so the same case in two rooms is two rows.
      assignedGroups(
        supabase,
        own.map((r) => ({
          activity_id: `${r.room_id}|${r.scenario_id}`,
          student_id: r.student_id,
          deadline: r.deadline,
          done: r.status === 'completed',
        })),
      ),
    ]);
    if (error) throw error;
    type Row = { id: string; title: string; patient_case: { patient?: { name?: string; age?: number | null; sex?: string } } | null };
    const byId = new Map(((scenarios ?? []) as Row[]).map((s) => [s.id, s]));

    const activities = [...groups].map(([key, list]) => {
      const [room_id, scenario_id] = key.split('|');
      const dates = [...new Set(list.map((g) => g.deadline).filter((d): d is string => typeof d === 'string'))].sort();
      return {
        room_id,
        scenario_id,
        title: byId.get(scenario_id)?.title ?? 'Untitled',
        // The patient written into the case (098); null for a Return Demonstration.
        patient: byId.get(scenario_id)?.patient_case?.patient?.name
          ? {
              name: byId.get(scenario_id)!.patient_case!.patient!.name!,
              age: byId.get(scenario_id)!.patient_case!.patient!.age ?? null,
              sex: byId.get(scenario_id)!.patient_case!.patient!.sex ?? '',
            }
          : null,
        kind: kindOf(kinds, scenario_id),
        time_limit_minutes: timeLimits.get(scenario_id) ?? null,
        groups: list,
        students: list.reduce((n, g) => n + g.count, 0),
        done: list.reduce((n, g) => n + g.done, 0),
        // The earliest date of performance among them, for ordering.
        next_date: dates[0] ?? null,
      };
    });

    return NextResponse.json({ rooms, activities, enabled: true });
  } catch (err) {
    console.error('Fetch room activities failed', err);
    return NextResponse.json({ error: 'Unable to fetch the rooms' }, { status: 500 });
  }
}
