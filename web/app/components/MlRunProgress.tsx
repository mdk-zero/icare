import ProgressBar from "./ProgressBar";

/** Which of the two ML jobs is running, and how far it has got. */
export interface MlRun {
  job: "predict" | "recommend";
  /** Fraction of that job done, 0 to 1. */
  fraction: number;
}

/**
 * Prediction then recommendation, back to back, each half of the bar. The
 * halves are not equal in time — recommending grows with the roster — but a
 * bar that only ever moves forward matters more than one that is evenly paced.
 */
export function mlRunFraction(run: MlRun): number {
  return ((run.job === "recommend" ? 1 : 0) + run.fraction) / 2;
}

/**
 * The step in words, for the run button's tooltip and the bar's name. Only a
 * whole-cohort run refits BKT; a run scoped to one instructor's students leaves it.
 */
export function mlRunLabel(run: MlRun, wholeCohort = false): string {
  if (run.job === "recommend") {
    return wholeCohort
      ? "Step 2 of 2 · Refitting skill mastery (BKT)"
      : "Step 2 of 2 · Updating skill mastery";
  }
  // Nothing reported yet: the service is still starting, which on a sleeping
  // free instance can take most of a minute.
  if (run.fraction === 0) return "Step 1 of 2 · Starting the ML service…";
  return "Step 1 of 2 · Scoring students for risk";
}

/**
 * A thin bar for under the run button (faculty Students, admin Student
 * Management). The button carries the percentage; the step is the tooltip.
 */
export default function MlRunProgress({ run, wholeCohort = false }: { run: MlRun; wholeCohort?: boolean }) {
  return <ProgressBar compact value={mlRunFraction(run)} label={mlRunLabel(run, wholeCohort)} />;
}
