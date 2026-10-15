import type { ChecklistRating, TaskRating } from "../../task-ratings";
import { ago, ahead, demoId, INSTRUCTOR_ID, KIND, type DemoTeam, type DemoUser } from "./people";
import { OFFERING_MAIN } from "./courses";
import type {
  DemoAssignment,
  DemoCompletion,
  DemoScenario,
  DemoStep,
  DemoStepRating,
  DemoTask,
} from "./school";
import { RETURN_DEMO_SPECS } from "./return-demos-data";
import returnDemoTasks from "./return-demo-tasks.json";

/**
 * The demo instructor's Return Demonstrations (072), made for NCM 101: the
 * vital signs one finalized for their first group a few days ago, a few
 * steps graded N/A, and the oxygen one due later this week, not started.
 */

const CREDIT: Record<TaskRating, number> = { excellent: 1, satisfactory: 2 / 3, needs_practice: 1 / 3 };

const levelFor = (credit: number): TaskRating => {
  const score = Math.round(credit * 100);
  return score >= 90 ? "excellent" : score >= 60 ? "satisfactory" : "needs_practice";
};

/** Steps the demo grades N/A: Taylor's steps not done in Philippine practice. */
const isNotApplicable = (stepIndex: number, taskIndex: number) => taskIndex === 0 && (stepIndex === 4 || stepIndex === 11);

export function seedReturnDemos(
  tables: {
    scenarios: DemoScenario[];
    tasks: DemoTask[];
    steps: DemoStep[];
    assignments: DemoAssignment[];
    completions: DemoCompletion[];
    stepRatings: DemoStepRating[];
  },
  users: DemoUser[],
  teams: DemoTeam[],
): void {
  const team = teams.find((t) => t.faculty_id === INSTRUCTOR_ID);
  if (!team) return;
  const members = users.filter((u) => u.role === "student" && u.team_id === team.id);

  RETURN_DEMO_SPECS.forEach((spec, d) => {
    const scenarioId = demoId(KIND.scenario, 900 + d);
    const created = ago(d === 0 ? 12 : 2, 9);
    tables.scenarios.push({
      id: scenarioId,
      created_by: INSTRUCTOR_ID,
      title: spec.title,
      description: spec.description,
      category: "Return Demonstration",
      learning_objectives: [],
      is_ai_generated: false,
      created_at: created,
      updated_at: created,
      patient_id: null,
      patient_case: {},
      rubric: null,
      difficulty: "intermediate",
      offering_id: OFFERING_MAIN,
      kind: "return_demo",
    });

    const built = returnDemoTasks.find((r) => r.title === spec.title)?.tasks ?? [];
    const tasks: DemoTask[] = [];
    const stepsOf = new Map<string, DemoStep[]>();
    built.forEach((t, i) => {
      const taskId = demoId(KIND.task, 50_000 + d * 100 + i);
      tasks.push({
        id: taskId,
        scenario_id: scenarioId,
        title: t.title,
        description: t.description,
        category: t.category as DemoTask["category"],
        points: t.points,
        verification: "faculty",
        system_trigger: null,
        sort_order: i,
        skill_id: t.skill_id,
      });
      stepsOf.set(
        taskId,
        t.steps.map((st, j) => ({ id: demoId(KIND.task, 60_000 + d * 1000 + i * 100 + j), task_id: taskId, title: st.title, source: st.source, position: st.position })),
      );
    });
    tables.tasks.push(...tasks);
    tables.steps.push(...[...stepsOf.values()].flat());

    members.forEach((student, m) => {
      const assignment: DemoAssignment = {
        id: demoId(KIND.assignment, 9_000 + d * 100 + m),
        scenario_id: scenarioId,
        student_id: student.id,
        assigned_by: INSTRUCTOR_ID,
        assigned_at: created,
        deadline: d === 0 ? ago(3, 17) : ahead(4, 17),
        status: "pending",
        required: true,
        score: null,
        started_at: null,
        completed_at: null,
        time_taken: null,
        submitted_at: null,
        finalized_by: null,
        team_id: team.id,
      };
      tables.assignments.push(assignment);
      if (d !== 0) return;

      // Graded at the skills lab: every step rated, a few N/A, the score from the rest.
      const graded = ago(4, 14, 10 + m * 7);
      const weak = student.risk_level === "at_risk";
      let earned = 0;
      let total = 0;
      tasks.forEach((task, i) => {
        let credit = 0;
        let counted = 0;
        (stepsOf.get(task.id) ?? []).forEach((st, j) => {
          const rating: ChecklistRating = isNotApplicable(j, i)
            ? "not_applicable"
            : (j + m + i) % (weak ? 3 : 7) === 0
              ? "needs_practice"
              : (j + m) % 3 === 0
                ? "satisfactory"
                : "excellent";
          tables.stepRatings.push({ assignment_id: assignment.id, step_id: st.id, rating });
          if (rating === "not_applicable") return;
          credit += CREDIT[rating];
          counted += 1;
        });
        const taskCredit = counted ? credit / counted : 1;
        tables.completions.push({
          assignment_id: assignment.id,
          task_id: task.id,
          rating: levelFor(taskCredit),
          remarks: i === 3 && m === 0 ? "Recheck the cuff size before inflating." : null,
          completed_via: "faculty",
          completed_at: graded,
        });
        earned += task.points * taskCredit;
        total += task.points;
      });
      Object.assign(assignment, {
        status: "completed",
        score: total ? Math.round((earned / total) * 100) : 0,
        completed_at: graded,
        finalized_by: INSTRUCTOR_ID,
      });
    });
  });
}
