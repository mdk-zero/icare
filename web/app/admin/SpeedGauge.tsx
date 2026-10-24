import { formatMs } from "./metrics";

/**
 * Where a response time turns from fast to okay to slow, and where the dial
 * ends. The three bands get equal thirds of the dial whatever their width in
 * milliseconds, so a 120 ms median doesn't sit pinned against the left stop.
 */
export interface SpeedScale {
  fast: number;
  slow: number;
  max: number;
}

const CX = 100;
const CY = 100;
const R = 78;

const ZONES = [
  { key: "fast", label: "Fast", arc: "stroke-emerald-500", text: "text-emerald-600" },
  { key: "okay", label: "Okay", arc: "stroke-amber-500", text: "text-amber-600" },
  { key: "slow", label: "Slow", arc: "stroke-rose-500", text: "text-rose-600" },
] as const;

/** 0 → left end of the dial, 1 → right end, over the top. */
function point(t: number, r = R): [number, number] {
  const a = Math.PI * (1 + t);
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

function arc(t0: number, t1: number): string {
  const [x0, y0] = point(t0);
  const [x1, y1] = point(t1);
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${R},${R} 0 0 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
}

/** Milliseconds to a position on the dial, piecewise across the three bands. */
function position(ms: number, s: SpeedScale): number {
  if (ms <= s.fast) return (ms / s.fast) / 3;
  if (ms <= s.slow) return 1 / 3 + ((ms - s.fast) / (s.slow - s.fast)) / 3;
  return Math.min(2 / 3 + ((ms - s.slow) / (s.max - s.slow)) / 3, 1);
}

/**
 * A speedometer for one response time: a dial split into fast, okay and slow,
 * lit up to where the needle rests, with the reading and its verdict beneath.
 */
export default function SpeedGauge({
  label,
  hint,
  value,
  scale,
}: {
  label: string;
  hint: string;
  value: number | null | undefined;
  scale: SpeedScale;
}) {
  const has = value !== null && value !== undefined;
  const t = has ? position(value, scale) : 0;
  const zone = ZONES[Math.min(Math.floor(t * 3), 2)];
  const bands: [number, number][] = [
    [0, 1 / 3],
    [1 / 3, 2 / 3],
    [2 / 3, 1],
  ];
  const ticks = Array.from({ length: 13 }, (_, i) => i / 12);
  const stops = [
    { t: 0, text: "0" },
    { t: 1 / 3, text: formatMs(scale.fast) },
    { t: 2 / 3, text: formatMs(scale.slow) },
    { t: 1, text: `${formatMs(scale.max)}+` },
  ];

  return (
    <figure className="flex flex-col items-center text-center">
      <svg
        viewBox="0 0 200 124"
        className="block w-full max-w-[15rem]"
        role="img"
        aria-label={has ? `${label}: ${formatMs(value)}, ${zone.label.toLowerCase()}` : `${label}: no requests yet`}
      >
        {/* Dim bands for the whole dial, then the same bands lit up to the needle. */}
        {bands.map(([a, b], i) => (
          <path
            key={`track-${i}`}
            d={arc(a + (i ? 0.006 : 0), b - (i < 2 ? 0.006 : 0))}
            fill="none"
            strokeWidth="12"
            className={`${ZONES[i].arc} opacity-20`}
          />
        ))}
        {has &&
          bands.map(([a, b], i) =>
            t > a ? (
              <path
                key={`lit-${i}`}
                d={arc(a + (i ? 0.006 : 0), Math.max(Math.min(t, b - (i < 2 ? 0.006 : 0)), a + 0.007))}
                fill="none"
                strokeWidth="12"
                className={ZONES[i].arc}
              />
            ) : null,
          )}

        {ticks.map((tick) => {
          const major = Math.abs(tick * 3 - Math.round(tick * 3)) < 1e-9;
          const [x0, y0] = point(tick, R - 11);
          const [x1, y1] = point(tick, R - (major ? 20 : 15));
          return (
            <line
              key={tick}
              x1={x0}
              y1={y0}
              x2={x1}
              y2={y1}
              strokeWidth={major ? 1.5 : 1}
              strokeLinecap="round"
              className={major ? "stroke-gray-400" : "stroke-gray-300"}
            />
          );
        })}

        {stops.map((s) => {
          const [x, y] = point(s.t, s.t === 0 || s.t === 1 ? R + 12 : R + 16);
          return (
            <text
              key={s.t}
              x={s.t === 0 ? x + 6 : s.t === 1 ? x - 6 : x}
              y={s.t === 0 || s.t === 1 ? y + 16 : y}
              textAnchor={s.t === 0 ? "start" : s.t === 1 ? "end" : "middle"}
              className="fill-gray-400 text-[9px] tabular-nums"
            >
              {s.text}
            </text>
          );
        })}

        {has && (
          <g
            style={{
              transform: `rotate(${t * 180}deg)`,
              transformOrigin: `${CX}px ${CY}px`,
              transition: "transform 900ms cubic-bezier(0.34, 1.4, 0.64, 1)",
            }}
          >
            <path d={`M${CX - R + 16},${CY} L${CX},${CY - 3} L${CX + 10},${CY} L${CX},${CY + 3} Z`} className="fill-gray-800" />
          </g>
        )}
        <circle cx={CX} cy={CY} r="7" className="fill-gray-800" />
        <circle cx={CX} cy={CY} r="2.5" className="fill-surface" />
      </svg>

      <figcaption className="-mt-1">
        <p className="font-display text-3xl font-bold tabular-nums text-gray-900">{formatMs(value)}</p>
        <p className="text-sm font-semibold text-gray-800">
          {label}
          {has && <span className={`ml-1.5 text-xs font-semibold ${zone.text}`}>· {zone.label}</span>}
        </p>
        <p className="text-xs text-gray-500">{hint}</p>
      </figcaption>
    </figure>
  );
}
