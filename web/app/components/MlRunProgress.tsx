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

function label(run: MlRun): string {
  if (run.job === "recommend") return "Step 2 of 2 · Refreshing quiz recommendations";
  // Nothing reported yet: the service is still starting, which on a sleeping
  // free instance can take most of a minute.
  if (run.fraction === 0) return "Step 1 of 2 · Starting the ML service…";
  return "Step 1 of 2 · Scoring students for risk";
}

/** The progress panel both run buttons (faculty Students, admin Student Management) show under their header. */
export default function MlRunProgress({ run }: { run: MlRun }) {
  return (
    <div className="mb-4 rounded-xl border border-hairline bg-surface px-4 py-3">
      <ProgressBar value={mlRunFraction(run)} label={label(run)} />
    </div>
  );
}
