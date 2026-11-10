/**
 * Seeds group case presentations (migrations 056 and 093) for BSN 1102.
 *
 * Does what each supervisor would do in the app: every BSN 1102 supervisor
 * (teams.faculty_id) creates one presentation for their groups there, with
 * the first member of each group (by name) as its leader. Groups are spread
 * across the states so every view has something to show: graded on the
 * six-criterion rubric (score from the app's own caseScore), handed in and
 * waiting, and not handed in yet. A handed-in group gets a small placeholder
 * PDF in the case-presentations bucket, so its slides open.
 *
 * Re-runs replace the seeded presentations: any presentation with SEED_TITLE,
 * created by a BSN 1102 supervisor and given to BSN 1102, is deleted (its
 * groups, ratings and submissions cascade; its files are removed) and
 * rebuilt. Anything else is left alone.
 *
 *   npx tsx scripts/seed-case-presentations.ts
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { CASE_BUCKET, CASE_CRITERIA, caseScore, type CaseLevel } from '../app/lib/case-rubric';

config({ path: '.env.local' });

const SECTION = 'BSN 1102';
const SEED_TITLE = 'Grand Case Presentation';
const INSTRUCTIONS =
  'Present one patient your group handled during this hospital duty, by initials only. Cover the assessment and ' +
  'baseline data, a patient-specific pathophysiology diagram, diagnostics and medical management, a prioritised ' +
  'nursing care plan with SMART goals, and be ready to defend it in the Q&A. The group leader uploads the slides.';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const daysAgo = (d: number, hour = 9) => {
  const t = new Date(now - d * DAY);
  t.setHours(hour, 0, 0, 0);
  return t.toISOString();
};

type Status = 'not_started' | 'submitted' | 'graded';
const PLAN: Status[] = ['graded', 'submitted', 'not_started', 'graded', 'submitted'];

/** One set of levels per graded group, in rubric order. */
const GRADES: CaseLevel[][] = [
  [4, 3, 3, 4, 3, 3],
  [3, 3, 2, 3, 4, 3],
  [4, 4, 3, 3, 3, 4],
];
const GRADE_REMARKS = [
  'Clear pathophysiology diagram tied to the patient. Put airway and breathing first in the NCP.',
  'Good delivery. Analyse the ABG and labs, not just list them.',
  'Strong defence in the Q&A; tighten the SMART goals.',
];

/** A one-page PDF saying what it stands in for, so a seeded group's slides open. */
function placeholderPdf(title: string): Buffer {
  const text = title.replace(/[()\\]/g, '');
  const stream = `BT /F1 20 Tf 60 500 Td (${text}) Tj 0 -32 Td /F1 12 Tf (Seeded placeholder slides) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local');
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: section, error: sectionError } = await supabase.from('sections').select('id, name').eq('name', SECTION).single();
  if (sectionError || !section) throw new Error(`Section ${SECTION} not found`);

  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('id, name, faculty_id')
    .eq('section_id', section.id)
    .order('name');
  if (teamsError) throw teamsError;
  const supervised = (teams ?? []).filter((t) => t.faculty_id) as { id: string; name: string; faculty_id: string }[];
  if (supervised.length === 0) throw new Error(`${SECTION} has no supervised groups`);

  const supervisors = [...new Set(supervised.map((t) => t.faculty_id))];
  const { data: old, error: oldError } = await supabase
    .from('case_presentations')
    .select('id')
    .eq('title', SEED_TITLE)
    .in('created_by', supervisors)
    .contains('section_ids', [section.id]);
  if (oldError) throw oldError;
  if ((old ?? []).length > 0) {
    const ids = old!.map((p) => p.id);
    const { data: files } = await supabase.from('case_presentation_groups').select('file_path').in('presentation_id', ids);
    const paths = (files ?? []).map((f) => f.file_path as string | null).filter((p): p is string => !!p);
    if (paths.length) await supabase.storage.from(CASE_BUCKET).remove(paths);
    const { error } = await supabase.from('case_presentations').delete().in('id', ids);
    if (error) throw error;
    console.log(`Replaced ${ids.length} earlier seeded presentation(s)`);
  }

  let groupIndex = 0;
  let gradeIndex = 0;
  for (const facultyId of supervisors) {
    const own = supervised.filter((t) => t.faculty_id === facultyId);
    const createdAt = daysAgo(10, 8);
    const { data: presentation, error: presError } = await supabase
      .from('case_presentations')
      .insert({
        title: SEED_TITLE,
        instructions: INSTRUCTIONS,
        deadline: new Date(now - 1 * DAY).toISOString(),
        section_ids: [section.id],
        team_ids: own.map((t) => t.id),
        created_by: facultyId,
        created_at: createdAt,
        updated_at: createdAt,
      })
      .select('id')
      .single();
    if (presError || !presentation) throw presError ?? new Error('Insert failed');

    for (const team of own) {
      const { data: members, error: membersError } = await supabase
        .from('team_members')
        .select('student_id, users!inner(name)')
        .eq('team_id', team.id);
      if (membersError) throw membersError;
      const roster = (members ?? [])
        .map((m) => ({ id: m.student_id as string, name: (m.users as unknown as { name: string }).name }))
        .sort((a, b) => a.name.localeCompare(b.name));
      if (roster.length === 0) continue;

      const status = PLAN[groupIndex++ % PLAN.length];
      const leader = roster[0];
      const row: Record<string, unknown> = {
        presentation_id: presentation.id,
        team_id: team.id,
        team_name: team.name,
        section_name: section.name,
        leader_id: leader.id,
        status,
        created_at: createdAt,
      };

      if (status !== 'not_started') {
        const fileName = `${team.name} - Grand Case Presentation.pdf`;
        const path = `seed/${presentation.id}/${team.id}.pdf`;
        const body = placeholderPdf(`${team.name} - ${SEED_TITLE}`);
        const { error: uploadError } = await supabase.storage
          .from(CASE_BUCKET)
          .upload(path, body, { contentType: 'application/pdf', upsert: true });
        if (uploadError) throw uploadError;
        Object.assign(row, {
          file_path: path,
          file_name: fileName,
          file_size: body.length,
          file_type: 'pdf',
          uploaded_by: leader.id,
          submitted_at: daysAgo(2 + (groupIndex % 2), 21),
        });
      }

      let levels: CaseLevel[] | null = null;
      if (status === 'graded') {
        levels = GRADES[gradeIndex % GRADES.length];
        Object.assign(row, {
          score: caseScore(new Map(CASE_CRITERIA.map((c, k) => [c.key, levels![k]]))),
          remarks: GRADE_REMARKS[gradeIndex % GRADE_REMARKS.length],
          graded_by: facultyId,
          graded_at: daysAgo(1, 15),
        });
        gradeIndex++;
      }

      const { data: group, error: groupError } = await supabase.from('case_presentation_groups').insert(row).select('id').single();
      if (groupError || !group) throw groupError ?? new Error('Insert failed');

      if (levels) {
        const { error } = await supabase.from('case_group_ratings').insert(
          CASE_CRITERIA.map((c, k) => ({
            group_id: group.id,
            criterion: c.key,
            level: levels![k],
            remarks: '',
            rated_by: facultyId,
            rated_at: row.graded_at,
          })),
        );
        if (error) throw error;
      }

      // Each member's own record carries the group's status and grade.
      const { error: subError } = await supabase.from('case_submissions').insert(
        roster.map((m) => ({
          presentation_id: presentation.id,
          student_id: m.id,
          group_id: group.id,
          status,
          submitted_at: row.submitted_at ?? null,
          score: row.score ?? null,
          remarks: (row.remarks as string | undefined) ?? '',
          graded_by: row.graded_by ?? null,
          graded_at: row.graded_at ?? null,
          created_at: createdAt,
        })),
      );
      if (subError) throw subError;

      const score = row.score === undefined ? '' : ` — ${row.score}%`;
      console.log(`${SECTION} · ${team.name} (leader ${leader.name}, ${roster.length} members) → ${status}${score}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
