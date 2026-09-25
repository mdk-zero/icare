"use client";

/**
 * How each skill area has moved over time: every recorded score (from skill
 * assessments and faculty validation) as a small line, oldest to newest, with
 * the change from the first reading to the latest.
 */
export default function SkillAreaTrend({
  records,
}: {
  records: { name: string; score: number; created_at: string }[];
}) {
  const byArea = new Map<string, { score: number; at: number }[]>();
  for (const r of records) {
    const list = byArea.get(r.name) ?? [];
    list.push({ score: Number(r.score), at: new Date(r.created_at).getTime() });
    byArea.set(r.name, list);
  }
  const areas = [...byArea.entries()]
    .map(([name, points]) => ({ name, points: points.sort((a, b) => a.at - b.at) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (areas.length === 0) return null;

  return (
    <div>
      <h3 className="mb-1 font-semibold text-gray-900">Progress over time</h3>
      <p className="mb-3 text-xs text-gray-500">Each score recorded for a skill area, oldest to newest.</p>
      <ul className="divide-y divide-hairline rounded-xl border border-hairline">
        {areas.map(({ name, points }) => {
          const first = points[0].score;
          const latest = points[points.length - 1].score;
          const change = Math.round(latest - first);
          return (
            <li key={name} className="flex items-center gap-3 px-3 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">{name}</span>
              <Sparkline values={points.map((p) => p.score)} label={`${name}: ${points.map((p) => Math.round(p.score)).join(", ")}`} />
              <span className="w-12 shrink-0 text-right text-sm font-bold tabular-nums text-gray-900">{Math.round(latest)}%</span>
              <span
                className={`w-14 shrink-0 text-right text-xs font-semibold tabular-nums ${
                  points.length < 2 ? "text-gray-400" : change > 0 ? "text-emerald-600" : change < 0 ? "text-rose-600" : "text-gray-500"
                }`}
              >
                {points.length < 2 ? "1 score" : `${change > 0 ? "+" : ""}${change} pts`}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Sparkline({ values, label }: { values: number[]; label: string }) {
  const w = 120;
  const h = 28;
  const x = (i: number) => (values.length === 1 ? w / 2 : (i / (values.length - 1)) * (w - 4) + 2);
  const y = (v: number) => h - 2 - (Math.max(0, Math.min(100, v)) / 100) * (h - 4);
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} className="shrink-0 text-brand-600">
      <line x1="0" x2={w} y1={y(75)} y2={y(75)} className="stroke-gray-200" strokeDasharray="2 3" />
      {values.length > 1 && <path d={d} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />}
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="2.5" fill="currentColor" />
    </svg>
  );
}
