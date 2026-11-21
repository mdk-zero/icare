import type { ChecklistRating, TaskRating } from "../../task-ratings";
import { ago, ahead, demoId, INSTRUCTOR_ID, KIND, TEAM_A1, TEAM_A2, TEAM_B1, TEAM_B2, type DemoTeam, type DemoUser } from "./people";
import { OFFERING_COLLEAGUE, OFFERING_MAIN, OFFERING_OXYGENATION } from "./courses";
import type {
  DemoAssignment,
  DemoCompletion,
  DemoRoom,
  DemoScenario,
  DemoStep,
  DemoStepRating,
  DemoTask,
} from "./school";
import { RETURN_DEMO_SPECS } from "./return-demos-data";
import returnDemoTasks from "./return-demo-tasks.json";

/**
 * The demo's Return Demonstrations (072), one per group, each in its group's
 * course, since no two groups share an activity: two finalized a few days
 * ago (the vital signs one with a few steps graded N/A and the PhilPEN form),
 * two due later this week, not started. All are performed in Skills
 * Laboratory A (098).
 */
const PLAN: { team: string; offering: string; graded: boolean; createdAgo: number }[] = [
  { team: TEAM_A1, offering: OFFERING_MAIN, graded: true, createdAgo: 12 },
  { team: TEAM_B1, offering: OFFERING_OXYGENATION, graded: false, createdAgo: 2 },
  { team: TEAM_A2, offering: OFFERING_MAIN, graded: true, createdAgo: 11 },
  { team: TEAM_B2, offering: OFFERING_COLLEAGUE, graded: false, createdAgo: 3 },
];

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
    rooms: DemoRoom[];
  },
  users: DemoUser[],
  teams: DemoTeam[],
): void {
  const skillsLab = tables.rooms.find((r) => r.room_number === "101")?.id ?? null;

  RETURN_DEMO_SPECS.forEach((spec, d) => {
    const plan = PLAN[d];
    const team = teams.find((t) => t.id === plan?.team);
    if (!plan || !team) return;
    const supervisor = team.faculty_id ?? INSTRUCTOR_ID;
    const members = users.filter((u) => u.role === "student" && u.team_id === team.id);
    const scenarioId = demoId(KIND.scenario, 900 + d);
    const created = ago(plan.createdAgo, 9);
    tables.scenarios.push({
      id: scenarioId,
      created_by: supervisor,
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
      offering_id: plan.offering,
      kind: "return_demo",
      // The vital signs one comes with its sheets (094).
      ...(d === 0 ? { form_keys: ["philpen"] } : {}),
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
        assigned_by: supervisor,
        assigned_at: created,
        deadline: plan.graded ? ago(3, 17) : ahead(4, 17),
        status: "pending",
        required: true,
        score: null,
        started_at: null,
        completed_at: null,
        time_taken: null,
        submitted_at: null,
        finalized_by: null,
        team_id: team.id,
        room_id: skillsLab,
      };
      tables.assignments.push(assignment);
      if (!plan.graded) return;

      // Graded at the skills lab: every step rated, a few N/A, the score from the rest.
      const graded = ago(4, 14, 10 + m * 7);
      const weak = student.risk_level === "at_risk";
      let earned = 0;
      let total = 0;
      tasks.forEach((task, i) => {
        let credit = 0;
        let counted = 0;
        (stepsOf.get(task.id) ?? []).forEach((st, j) => {
          const rating: ChecklistRating = d === 0 && isNotApplicable(j, i)
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
          remarks: task.skill_id === "1-7" && m === 0 ? "Recheck the cuff size before inflating." : null,
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
        finalized_by: supervisor,
      });
      if (d !== 0) return;
      // The PhilPEN form they filled in on their partner at the skills lab.
      const handedIn = ago(4, 13, 40 + m * 3);
      const clients = [
        { name: "Reyes, Ana, Lopez", sex: "female" },
        { name: "Garcia, Mark, Dizon", sex: "male" },
        { name: "Santos, Liza, Ramos", sex: "female" },
      ];
      const client = clients[m % clients.length];
      const bmi = Math.round(((58 + m * 3) / ((158 + m * 3) / 100) ** 2) * 10) / 10;
      assignment.forms = {
        philpen: {
          rows: [
            {
              name: client.name,
              assessed_on: graded.slice(0, 10),
              address: "Brgy. Bucana, Nasugbu, Batangas",
              birth_date: `${1981 + m}-0${(m % 9) + 1}-14`,
              age: 45 - m,
              sex: client.sex,
              weight_kg: 58 + m * 3,
              height_cm: 158 + m * 3,
              bmi,
              bmi_class: bmi < 18.5 ? "underweight" : bmi < 23 ? "normal" : bmi < 25 ? "overweight" : "obese",
              waist_cm: 78 + m * 3,
              cvd_ckd: "no",
              family_cvd: m === 1 ? "yes" : "no",
              hypertension: m === 1 ? "yes" : "no",
              hypertension_meds: m === 1 ? "yes" : null,
              diabetes: m === 2 ? "unsure" : "no",
              diabetes_meds: null,
              cholesterol: "no",
              cholesterol_meds: null,
              bp_1: `${124 + m * 4}/${80 + m * 2}`,
              bp_2: `${120 + m * 4}/${78 + m * 2}`,
              bp_3: `${118 + m * 4}/${78 + m * 2}`,
              bp_average: `${119 + m * 4}/${78 + m * 2}`,
              smoker: m === 1 ? "yes" : "no",
              binge_drinking: "no",
              physical_activity: m === 1 ? "no" : "yes",
              low_fruit_vegetable: m === 0 ? "no" : "yes",
              cvd_risk: m === 1 ? "orange" : "green",
              counselling: m === 1 ? "healthy_diet,physical_activity,referred_bti" : "healthy_diet",
              next_assessment: m === 1 ? "2027-05-12" : "2027-11-12",
              assessed_by: null,
            },
          ],
          submitted_at: m === 2 ? null : handedIn,
          updated_at: handedIn,
        },
      };
    });
  });
}
