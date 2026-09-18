/**
 * Loading indicator: a bedside-monitor ECG sweep, the web twin of the mobile
 * boot loader. It replaces the rotating circles the app used for every wait,
 * so a pending save and a loading page share one clinical motif. Skeletons
 * stay skeletons; this is for the places a spinner used to be.
 *
 * Pure SVG + CSS (keyframes in globals.css), so it renders in server and
 * client components alike and costs no JS per frame. It strokes in
 * `currentColor`: colour it with a `text-*` class like the icon it replaced.
 */

const SIZES = {
  xs: { box: "h-3 w-5.25", stroke: 4 },
  sm: { box: "h-4 w-7", stroke: 3.5 },
  md: { box: "h-6 w-10.5", stroke: 3 },
  lg: { box: "h-8 w-14", stroke: 2.75 },
  xl: { box: "h-12 w-21", stroke: 2.5 },
} as const;

export type EcgLoaderSize = keyof typeof SIZES;

/*
 * One beat spans the full 56-unit viewBox. It is drawn twice back to back and
 * `.ecg-trace` scrolls it left by exactly one beat per loop, so the seam never
 * shows. The breakpoints are the mobile BootLoader's, scaled to this height.
 * `.ecg-dot` rides the trace at x=50; its keyframes are these same breakpoints
 * re-timed for that x, so if the shape changes they must change with it.
 */
const BEAT_W = 56;
const MID_Y = 16;
const DOT_X = 50;
const BEAT_POINTS: [frac: number, dy: number][] = [
  [0, 0],
  [0.34, 0],
  [0.4, -3],
  [0.45, 8],
  [0.5, -12],
  [0.56, 4],
  [0.62, 0],
  [1, 0],
];

function beatPath(offsetX: number) {
  return BEAT_POINTS.map(
    ([f, dy], i) => `${i === 0 ? "M" : "L"}${+(offsetX + BEAT_W * f).toFixed(2)} ${MID_Y + dy}`,
  ).join(" ");
}

const TRACE = `${beatPath(0)} ${beatPath(BEAT_W)}`;

export function EcgLoader({
  size = "sm",
  className = "",
}: {
  size?: EcgLoaderSize;
  className?: string;
}) {
  const { box, stroke } = SIZES[size];
  return (
    <svg
      viewBox={`0 0 ${BEAT_W} 32`}
      fill="none"
      aria-hidden="true"
      className={`ecg-loader inline-block shrink-0 align-middle ${box} ${className}`.trim()}
    >
      <path
        className="ecg-trace"
        d={TRACE}
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g className="ecg-dot">
        <circle cx={DOT_X} cy={MID_Y} r={stroke * 1.6} fill="currentColor" opacity={0.25} />
        <circle cx={DOT_X} cy={MID_Y} r={stroke * 0.85} fill="currentColor" />
      </g>
    </svg>
  );
}
