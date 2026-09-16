import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { callAI, aiErrorResponse } from '@/app/lib/ai/generate';
import { logAudit } from '@/app/lib/audit';
import type { VitalsDigest, EhrDigest } from '@/app/lib/discharge';

/** Kept in step with the chart endpoint, which is what reads summaries back. */
const SUMMARY_COLUMNS =
  'id, patient_id, admitted_at, discharged_at, diagnosis, room_label, vitals_digest, ehr_digest, follow_up, ai_model, ai_generated_at, created_at';

/** Guards the prompt and the stored column against a runaway model. */
const MAX_ITEMS = 6;
const MAX_CHARS = 400;

function isFacultyOrAdmin(role: string | undefined): boolean {
  return role === 'faculty' || role === 'admin';
}

interface FollowUp {
  title: string;
  detail: string;
}

/**
 * Pulls the model's reply into shape. Anything unexpected is dropped rather
 * than stored: this text is shown to students as clinical guidance, so a
 * malformed or empty answer must read as "not generated", never as advice.
 */
function sanitizeFollowUps(raw: Record<string, unknown>): FollowUp[] {
  const list = Array.isArray(raw.recommendations)
    ? raw.recommendations
    : Array.isArray(raw.follow_up)
      ? raw.follow_up
      : [];

  const out: FollowUp[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const title = typeof e.title === 'string' ? e.title.trim() : '';
    const detail = typeof e.detail === 'string' ? e.detail.trim() : '';
    if (!title || !detail) continue;
    out.push({ title: title.slice(0, 120), detail: detail.slice(0, MAX_CHARS) });
    if (out.length === MAX_ITEMS) break;
  }
  return out;
}

function buildPrompt(summary: {
  diagnosis: string;
  admitted_at: string | null;
  discharged_at: string;
  vitals_digest: VitalsDigest;
  ehr_digest: EhrDigest;
  patientName: string;
  age: number | null;
  gender: string;
}): string {
  const v = summary.vitals_digest ?? ({} as VitalsDigest);
  const e = summary.ehr_digest ?? ({} as EhrDigest);
  const days =
    summary.admitted_at
      ? Math.max(
          0,
          Math.floor(
            (new Date(summary.discharged_at).getTime() - new Date(summary.admitted_at).getTime()) /
              86_400_000,
          ),
        )
      : null;

  const stats = Object.entries(v.stats ?? {})
    .map(([key, s]) => `- ${key}: min ${s.min}, max ${s.max}, avg ${s.avg} (${s.n} readings)`)
    .join('\n');
  const findings = (v.findings ?? []).map((f) => `- [${f.severity}] ${f.message}`).join('\n');

  return `You are a clinical nurse educator writing the follow-up section of a discharge summary for a NURSING STUDENT SIMULATION. The patient is a simulated training case, not a real person.

Patient: ${summary.patientName}, ${summary.age ?? 'unknown'} years old, ${summary.gender || 'unspecified'}
Admitting diagnosis: ${summary.diagnosis || 'not recorded'}
Length of stay: ${days === null ? 'unknown' : `${days} day(s)`}

Vital sign ranges recorded during the stay:
${stats || '- none recorded'}

Abnormal findings raised during the stay:
${findings || '- none'}

Documentation completed: ${e.tpr ?? 0} TPR sheet(s), ${e.ivf ?? 0} IVF record(s) (${e.ivf_ongoing ?? 0} still running at discharge), ${e.notes ?? 0} progress note(s).

Write ${MAX_ITEMS} or fewer follow-up recommendations for the care team and the student who managed this patient. Ground every recommendation in the data above — do not invent findings, medications, doses or test results. Prefer monitoring, patient education, and re-assessment actions a student nurse can carry out or explain. If an IVF line is still running, address it.

Respond with JSON only, in exactly this shape:
{"recommendations":[{"title":"Short imperative title","detail":"One or two sentences explaining what to do and why, referencing the recorded data."}]}`;
}

/** POST { summary_id } — drafts follow-up recommendations into an existing summary. */
export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isFacultyOrAdmin(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { summary_id?: unknown };
  try {
    body = (await request.json()) as { summary_id?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const summaryId = typeof body.summary_id === 'string' ? body.summary_id.trim() : '';
  if (!summaryId) {
    return NextResponse.json({ error: 'summary_id is required' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: summary } = await supabase
      .from('discharge_summaries')
      .select(`${SUMMARY_COLUMNS}, patients(name, age, gender)`)
      .eq('id', summaryId)
      .maybeSingle();

    if (!summary) {
      return NextResponse.json({ error: 'Discharge summary not found' }, { status: 404 });
    }

    const patient = (summary as unknown as { patients: { name: string; age: number | null; gender: string } | null })
      .patients;

    const generated = await callAI(
      buildPrompt({
        diagnosis: summary.diagnosis,
        admitted_at: summary.admitted_at,
        discharged_at: summary.discharged_at,
        vitals_digest: summary.vitals_digest as VitalsDigest,
        ehr_digest: summary.ehr_digest as EhrDigest,
        patientName: patient?.name ?? 'the patient',
        age: patient?.age ?? null,
        gender: patient?.gender ?? '',
      }),
    );

    const followUp = sanitizeFollowUps(generated);
    if (followUp.length === 0) {
      // Storing an empty list would look like "generated, nothing to add".
      return NextResponse.json(
        { error: 'The model returned no usable recommendations. Try again.' },
        { status: 502 },
      );
    }

    const { data: updated, error } = await supabase
      .from('discharge_summaries')
      .update({
        follow_up: followUp,
        ai_model: typeof generated._model === 'string' ? generated._model : 'ai',
        ai_generated_at: new Date().toISOString(),
      })
      .eq('id', summaryId)
      .select(SUMMARY_COLUMNS)
      .single();

    if (error) {
      console.error('Failed to store follow-up recommendations', error);
      return NextResponse.json({ error: 'Unable to save recommendations' }, { status: 500 });
    }

    await logAudit(
      session,
      {
        action: 'discharge.follow_up.generate',
        entityType: 'discharge_summaries',
        entityId: summaryId,
        details: { patient_id: summary.patient_id, count: followUp.length },
      },
      request,
    );

    return NextResponse.json({ summary: updated });
  } catch (err) {
    console.error('Generate follow-up recommendations failed', err);
    const { error, status } = aiErrorResponse(err, 'recommendations');
    return NextResponse.json({ error }, { status });
  }
}
