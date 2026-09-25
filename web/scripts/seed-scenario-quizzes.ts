/**
 * Seeds one skill assessment per ward scenario from seed-basic-cases.ts.
 *
 * The pairing is the point: a student works Rosa Delgado's fever at the
 * bedside, then sits a skill assessment on exactly the skills that case used.
 * Scenario and assessment share a category and a set of Taylor's skills, so
 * the assessment measures what the scenario just taught instead of testing
 * unrelated material.
 *
 * Source. Every question comes from scripts/data/skill-questions.ts, a bank
 * per Taylor's skill written from the checklist steps in Lynn & LeBon, "Skill
 * Checklists for Taylor's Clinical Nursing Skills: A Nursing Process
 * Approach", 3rd ed. (Wolters Kluwer / LWW, 2011), shipped in docs/ —
 * Chapters 1, 14 and 15. An assessment names its skills; each becomes one
 * criterion (weights split evenly) holding that skill's bank, and each
 * explanation opens with the skill and step it came from. validate() refuses
 * a question that does not cite its skill.
 *
 * Skill areas follow from those citations. They are the book's chapters
 * (taylors-chapters.ts, migration 041), and a skill's number names its
 * chapter, so a criterion's skill area is its skill's chapter and each
 * question is tagged with it. With migration 049 applied, criteria and
 * questions are also linked to the skill itself. Nothing is tagged by hand.
 *
 * Every assessment is built to satisfy publish validation (app/lib/
 * assessment-validation.ts) so it can be published rather than sitting in
 * draft:
 *
 *   - criteria weights total exactly 100
 *   - every question is owned by a criterion (an unassigned one is never served)
 *   - each criterion holds at least its min_questions
 *   - total_questions <= the assigned bank, and >= the sum of the minimums
 *
 * Banks are ten or more questions and each attempt serves six. The surplus is
 * deliberate: it is the pool a retake draws unseen questions from, which is
 * what makes the adaptive selection in app/lib/assessment-selection.ts do
 * anything interesting.
 *
 * Safe to re-run: an assessment is matched by title (or the title it had
 * before), and its criteria and questions are rebuilt rather than duplicated.
 *
 *   npx tsx scripts/seed-scenario-quizzes.ts
 *   npx tsx scripts/seed-scenario-quizzes.ts --check   (validate only)
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { TAYLORS_CHAPTERS, chapterOfSkill, skillsIn } from './taylors-chapters';
import { SKILL_QUESTIONS } from './data/skill-questions';
import catalog from './data/taylor-skills.json';

config({ path: '.env.local' });

interface CriterionSeed {
  /** Opens with the Taylor's skill it covers: "Skill 1-1 · Assessing Body Temperature". */
  name: string;
  skill: string;
  weight: number;
  min_questions: number;
}

interface QuestionSeed {
  content: string;
  options: string[];
  correct_index: number;
  explanation: string;
  /** Index into the quiz's criteria array. Every question must own one. */
  criterion: number;
}

/** The Taylor's skills a criterion covers, from the part of its name before " · ". */
function criterionSkills(c: CriterionSeed): string[] {
  return skillsIn(c.name.split(' · ')[0]);
}

/** The skill a question's explanation opens by citing ("Skill 1-5, step 10: …"). */
function citedSkill(q: QuestionSeed): string | undefined {
  return q.explanation.match(/^Skills? (\d+-\d+)/)?.[1];
}

interface AssessmentPlan {
  /** The scenario this assessment is paired with, by title. */
  scenario_title: string;
  title: string;
  /**
   * The title this assessment had before. A re-run finds the old row by it
   * and renames it in place, so it keeps its id — and seed-student-history.ts,
   * which clears attempts by assessment id, still finds and rebuilds them.
   */
  formerly?: string;
  category: string;
  /** The Taylor's skills it assesses, one criterion each, in this order. */
  skills: string[];
}

interface QuizSeed {
  scenario_title: string;
  title: string;
  formerly?: string;
  description: string;
  category: string;
  time_limit_seconds: number;
  /** How many questions one attempt serves, out of the bank. */
  total_questions: number;
  criteria: CriterionSeed[];
  questions: QuestionSeed[];
}

const POINTS_PER_QUESTION = 10;
const SERVED_PER_ATTEMPT = 6;
const TIME_LIMIT_SECONDS = 900;

const SKILL_TITLE = new Map((catalog as { id: string; title: string }[]).map((s) => [s.id, s.title]));

const PLANS: AssessmentPlan[] = [
  {
    scenario_title: 'Fever Workup: Temperature, Pulse and Respirations',
    title: 'Temperature, Pulse, Respiration, and Pulse Oximetry',
    formerly: 'Temperature, Pulse, Respiration, and Nasopharyngeal Swab',
    category: 'General',
    skills: ['1-1', '1-4', '1-6', '14-1'],
  },
  {
    scenario_title: 'Dehydration: Starting and Monitoring a Peripheral IV',
    title: 'Peripheral IV Therapy, Pulse, and Blood Pressure',
    formerly: 'Peripheral IV Therapy, Stool Culture, and PPE',
    category: 'Medical-Surgical',
    skills: ['15-1', '15-3', '1-4', '1-7'],
  },
  {
    scenario_title: 'UTI with Low-Grade Fever: A Full Set of Vital Signs',
    title: 'A Full Set of Vital Signs',
    formerly: 'Clean-Catch Urine, Oral Medications, and Handwashing',
    category: 'Infection Management',
    skills: ['1-1', '1-4', '1-6', '1-7'],
  },
  {
    scenario_title: 'New Hypertension: Accurate Blood Pressure and Apical Pulse',
    title: 'Blood Pressure, Apical Pulse, and Radial Pulse',
    formerly: 'Blood Pressure, Cardiovascular Assessment, and 12-Lead ECG',
    category: 'Patient Education',
    skills: ['1-7', '1-5', '1-4'],
  },
  {
    scenario_title: 'Asthma: Pulse Oximetry, Respirations and Nasal Cannula Oxygen',
    title: 'Pulse Oximetry, Respiration, and Nasal Cannula Oxygen',
    formerly: 'Pulse Oximetry, Inhalers, Nebulizers, and Nasal Cannula',
    category: 'Respiratory Emergency',
    skills: ['14-1', '1-6', '14-3'],
  },
  {
    scenario_title: 'Post-Op Day One: Incentive Spirometry and the IV Site',
    title: 'Incentive Spirometry, IV Site Care, and Temperature',
    formerly: 'Wound Dressing, Post-Op Breathing Exercises, and Pain Relief',
    category: 'Medical-Surgical',
    skills: ['14-2', '15-3', '15-4', '1-1'],
  },
  {
    scenario_title: 'Cellulitis: IV Antibiotic Through a Saline Lock',
    title: 'Saline Lock, IV Site Monitoring, and Temperature',
    formerly: 'Capillary Glucose, Insulin Injection, and IV Piggyback',
    category: 'Infection Management',
    skills: ['15-5', '15-3', '1-1'],
  },
  {
    scenario_title: 'Anaemia and Dizziness: Orthostatic Vital Signs and Oxygen Saturation',
    title: 'Blood Pressure, Pulse, and Pulse Oximetry',
    formerly: 'Fall Prevention, Assisted Ambulation, and Venipuncture',
    category: 'Medical-Surgical',
    skills: ['1-7', '1-4', '14-1'],
  },
];

/** Whole-number weights that total 100, the remainder going to the first skills. */
function evenWeights(n: number): number[] {
  const base = Math.floor(100 / n);
  return Array.from({ length: n }, (_, i) => base + (i < 100 - base * n ? 1 : 0));
}

/** An assessment built from its skills: a criterion per skill, holding that skill's bank. */
function compose(plan: AssessmentPlan): QuizSeed {
  const weights = evenWeights(plan.skills.length);
  const criteria = plan.skills.map((skill, i) => ({
    name: `Skill ${skill} · ${SKILL_TITLE.get(skill) ?? 'Unknown skill'}`,
    skill,
    weight: weights[i],
    min_questions: 1,
  }));
  const questions = plan.skills.flatMap((skill, i) =>
    (SKILL_QUESTIONS[skill] ?? []).map((q) => ({ ...q, criterion: i })),
  );
  const named = plan.skills.map((s) => `${s} (${SKILL_TITLE.get(s)})`).join(', ');
  return {
    scenario_title: plan.scenario_title,
    title: plan.title,
    formerly: plan.formerly,
    description: `A skill assessment built from Taylor’s skill checklists ${named} — the skills the “${plan.scenario_title}” scenario calls for.`,
    category: plan.category,
    time_limit_seconds: TIME_LIMIT_SECONDS,
    total_questions: SERVED_PER_ATTEMPT,
    criteria,
    questions,
  };
}

const QUIZZES: QuizSeed[] = PLANS.map(compose);

/**
 * Re-checks the publish rules from app/lib/assessment-validation.ts against
 * the seed data before anything is written.
 *
 * The real validation runs server-side at publish time and would simply
 * refuse, leaving eight quizzes stuck in draft with no explanation at the
 * seed's end. Failing here instead names the quiz and the rule.
 */
function validate(quiz: QuizSeed): string[] {
  const problems: string[] = [];

  const weight = quiz.criteria.reduce((sum, c) => sum + c.weight, 0);
  if (Math.round(weight * 100) / 100 !== 100) {
    problems.push(`criteria weights total ${weight}, must be 100`);
  }

  const poolOf = (i: number) => quiz.questions.filter((q) => q.criterion === i).length;

  quiz.criteria.forEach((c, i) => {
    if (poolOf(i) < c.min_questions) {
      problems.push(`"${c.name}" needs ${c.min_questions} questions but has ${poolOf(i)}`);
    }
  });

  const orphans = quiz.questions.filter(
    (q) => q.criterion < 0 || q.criterion >= quiz.criteria.length,
  );
  if (orphans.length > 0) {
    problems.push(`${orphans.length} question(s) point at a criterion that does not exist`);
  }

  if (quiz.total_questions > quiz.questions.length) {
    problems.push(
      `serves ${quiz.total_questions} questions but the bank holds ${quiz.questions.length}`,
    );
  }

  const minimums = quiz.criteria.reduce(
    (sum, c, i) => sum + Math.min(c.min_questions, poolOf(i)),
    0,
  );
  if (minimums > quiz.total_questions) {
    problems.push(
      `criteria minimums add up to ${minimums}, more than the ${quiz.total_questions} served`,
    );
  }

  for (const c of quiz.criteria) {
    if (!SKILL_TITLE.has(c.skill)) problems.push(`Skill ${c.skill} is not in the catalog`);
    if ((SKILL_QUESTIONS[c.skill] ?? []).length === 0) problems.push(`Skill ${c.skill} has no questions in the bank`);
  }

  quiz.questions.forEach((q, i) => {
    if (q.correct_index < 0 || q.correct_index >= q.options.length) {
      problems.push(`question ${i + 1} has correct_index outside its options`);
    }
    // The citation is what makes a question checkable against the book, and
    // what decides its competency tag.
    const cited = citedSkill(q);
    if (!cited) {
      problems.push(`question ${i + 1} does not open its explanation with the Taylor's skill it cites`);
    } else if (q.criterion >= 0 && q.criterion < quiz.criteria.length) {
      if (!criterionSkills(quiz.criteria[q.criterion]).includes(cited)) {
        problems.push(`question ${i + 1} cites Skill ${cited}, which its criterion does not cover`);
      }
    }
  });

  // A criterion's competency is its skills' chapter, so they must share one.
  quiz.criteria.forEach((c) => {
    const skills = criterionSkills(c);
    if (skills.length === 0) {
      problems.push(`"${c.name}" does not name the Taylor's skill it covers`);
      return;
    }
    try {
      const chapters = new Set(skills.map((skill) => chapterOfSkill(skill).chapter));
      if (chapters.size > 1) problems.push(`"${c.name}" spans more than one Taylor's chapter`);
    } catch (err) {
      problems.push(`"${c.name}": ${(err as Error).message}`);
    }
  });

  return problems;
}

async function main() {
  if (process.argv.includes('--check')) {
    let problems = 0;
    for (const quiz of QUIZZES) {
      for (const p of validate(quiz)) {
        console.error(`  INVALID  "${quiz.title}" — ${p}`);
        problems += 1;
      }
      console.log(`  ${quiz.title}: ${quiz.criteria.length} skills, ${quiz.questions.length} questions`);
    }
    if (problems > 0) process.exit(1);
    console.log(`Content OK: ${QUIZZES.length} skill assessments. Nothing written.`);
    return;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Fail before touching the database rather than half-way through.
  let invalid = 0;
  for (const quiz of QUIZZES) {
    const problems = validate(quiz);
    for (const p of problems) {
      console.error(`  INVALID  "${quiz.title}" — ${p}`);
      invalid += 1;
    }
  }
  if (invalid > 0) {
    console.error(`\n${invalid} problem(s) found. Nothing was written.`);
    process.exit(1);
  }

  // The competency areas have to be the Taylor's chapters, under the ids
  // taylors-chapters.ts gives them: assessment_criteria.competency_id is NOT
  // NULL, and a criterion pointing at a mismatched row would score the wrong
  // area without complaint.
  const { data: competencies } = await supabase.from('competency_areas').select('id, name');
  const nameById = new Map((competencies ?? []).map((c) => [c.id, c.name]));
  const mismatched = TAYLORS_CHAPTERS.filter((c) => nameById.get(c.id) !== c.name);
  if (mismatched.length > 0) {
    console.error(
      `competency_areas lacks ${mismatched.length} of the 18 Taylor's chapters ` +
        `(${mismatched.map((c) => c.name).join(', ')}).\n` +
        'Apply migration 041_taylors_competency_areas.sql before seeding.',
    );
    process.exit(1);
  }

  const { data: author } = await supabase
    .from('users')
    .select('id, email, role')
    .in('role', ['faculty', 'admin'])
    .order('role', { ascending: true })
    .limit(1)
    .maybeSingle();
  console.log(author ? `Attributing to ${author.email} (${author.role}).` : 'No faculty or admin user found — leaving author blank.');

  const { data: campus } = await supabase.from('campuses').select('id').limit(1).maybeSingle();

  // Skill links need migration 049; before it the criteria and questions
  // are written without them.
  const { error: linkProbe } = await supabase.from('assessment_criteria').select('skill_id').limit(1);
  const { count: catalogCount } = await supabase.from('taylor_skills').select('id', { count: 'exact', head: true });
  const linkSkills = !linkProbe && (catalogCount ?? 0) > 0;
  if (!linkSkills) console.warn('Skill links skipped: apply migrations 045 and 049 and run seed-taylor-skills.ts first.');

  let created = 0;
  let replaced = 0;

  for (const quiz of QUIZZES) {
    // Pair by title. A missing scenario is worth saying out loud — it means
    // seed-basic-cases.ts has not been run, and the quiz will land unpaired.
    const { data: scenario } = await supabase
      .from('scenarios')
      .select('id')
      .eq('title', quiz.scenario_title)
      .maybeSingle();
    if (!scenario) {
      console.warn(`  note: no scenario titled "${quiz.scenario_title}" — run db:seed:basic-cases first.`);
    }

    const row = {
      campus_id: campus?.id ?? null,
      created_by: author?.id ?? null,
      title: quiz.title,
      description: quiz.description,
      difficulty: 'beginner' as const,
      category: quiz.category,
      time_limit_seconds: quiz.time_limit_seconds,
      total_questions: quiz.total_questions,
      is_published: true,
      is_ai_generated: false,
    };

    // The former title is tried too, so a renamed quiz is updated in place
    // rather than duplicated; the current title wins if somehow both exist.
    const titles = [quiz.title, ...(quiz.formerly ? [quiz.formerly] : [])];
    const { data: matches } = await supabase.from('assessments').select('id, title').in('title', titles);
    const existing = (matches ?? []).find((m) => m.title === quiz.title) ?? (matches ?? [])[0] ?? null;

    let assessmentId: string;
    if (existing) {
      const { error } = await supabase.from('assessments').update(row).eq('id', existing.id);
      if (error) {
        console.error(`  ✗ "${quiz.title}" — update failed:`, error.message);
        process.exit(1);
      }
      assessmentId = existing.id;
      // Questions cascade from the assessment, not from criteria, so both are
      // cleared explicitly. question_competencies follows its question.
      await supabase.from('questions').delete().eq('assessment_id', assessmentId);
      await supabase.from('assessment_criteria').delete().eq('assessment_id', assessmentId);
      replaced += 1;
    } else {
      const { data: inserted, error } = await supabase
        .from('assessments')
        .insert(row)
        .select('id')
        .single();
      if (error || !inserted) {
        console.error(`  ✗ "${quiz.title}" — insert failed:`, error?.message);
        process.exit(1);
      }
      assessmentId = inserted.id;
      created += 1;
    }

    const { data: criteria, error: cErr } = await supabase
      .from('assessment_criteria')
      .insert(
        quiz.criteria.map((c, i) => ({
          assessment_id: assessmentId,
          name: c.name,
          weight: c.weight,
          competency_id: chapterOfSkill(criterionSkills(c)[0]).id,
          min_questions: c.min_questions,
          sort_order: i,
          ...(linkSkills ? { skill_id: c.skill } : {}),
        })),
      )
      .select('id, sort_order');
    if (cErr || !criteria) {
      console.error(`  ✗ "${quiz.title}" — criteria failed:`, cErr?.message);
      process.exit(1);
    }
    // Order by sort_order rather than trusting insert order, so a question's
    // criterion index cannot silently point at the wrong criterion.
    const criterionIds = [...criteria]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => c.id);

    const { data: questions, error: qErr } = await supabase
      .from('questions')
      .insert(
        quiz.questions.map((q, i) => ({
          assessment_id: assessmentId,
          position: i + 1,
          content: q.content,
          options: q.options,
          correct_index: q.correct_index,
          explanation: q.explanation,
          difficulty: 'beginner' as const,
          question_type: 'multiple_choice',
          points: POINTS_PER_QUESTION,
          criteria_id: criterionIds[q.criterion],
          ...(linkSkills ? { skill_id: citedSkill(q) } : {}),
        })),
      )
      .select('id, position');
    if (qErr || !questions) {
      console.error(`  ✗ "${quiz.title}" — questions failed:`, qErr?.message);
      process.exit(1);
    }

    const byPosition = [...questions].sort((a, b) => a.position - b.position);
    // One tag per question: the chapter of the skill it cites. validate()
    // has already guaranteed every question cites one.
    const links = quiz.questions.map((q, i) => ({
      question_id: byPosition[i].id,
      competency_id: chapterOfSkill(citedSkill(q)!).id,
    }));
    const { error: lErr } = await supabase.from('question_competencies').insert(links);
    if (lErr) {
      console.error(`  ✗ "${quiz.title}" — competency links failed:`, lErr.message);
      process.exit(1);
    }

    console.log(
      `  ✓ ${quiz.title} — ${quiz.criteria.length} criteria, ${questions.length} questions ` +
        `(${quiz.total_questions} served), ${links.length} competency links` +
        `${scenario ? '' : '  [unpaired]'}`,
    );
  }

  console.log(`\nSkill assessments: ${created} created, ${replaced} rebuilt. All published.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
