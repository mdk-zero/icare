export function SkeletonStatCard() {
  return (
    <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] p-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-gray-100 rounded-lg" />
        <div className="space-y-2">
          <div className="h-5 w-12 bg-gray-100 rounded" />
          <div className="h-3 w-16 bg-gray-100 rounded" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonInlineStatCard() {
  return (
    <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] p-3.5 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-gray-100 rounded-lg" />
        <div className="space-y-1.5">
          <div className="h-5 w-12 bg-gray-100 rounded" />
          <div className="h-3 w-16 bg-gray-100 rounded" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  const widths = ["w-32", "w-48", "w-24", "w-28", "w-20"];
  return (
    <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] overflow-hidden animate-pulse">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              {Array.from({ length: cols }).map((_, i) => (
                <th key={i} className="py-3 px-4">
                  <div className="h-3.5 w-14 bg-gray-100 rounded" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, i) => (
              <tr key={i} className="border-b border-gray-50 last:border-0">
                {Array.from({ length: cols }).map((_, j) => (
                  <td key={j} className="py-3.5 px-4">
                    <div className={`h-3.5 ${widths[j % widths.length]} bg-gray-100 rounded`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SkeletonSectionGrid({ cards = 6 }: { cards?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: cards }).map((_, i) => (
        <div
          key={i}
          className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] p-5 animate-pulse"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-gray-100 rounded-xl" />
            <div className="space-y-2 min-w-0 flex-1">
              <div className="h-4 w-2/3 bg-gray-100 rounded" />
              <div className="h-3 w-1/3 bg-gray-100 rounded" />
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 flex gap-2">
            <div className="h-5 w-20 bg-gray-100 rounded-full" />
            <div className="h-5 w-16 bg-gray-100 rounded-full" />
            <div className="h-5 w-24 bg-gray-100 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonStudentRow() {
  return (
    <div className="flex items-center justify-between p-3.5 animate-pulse">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 bg-gray-100 rounded-full" />
        <div className="space-y-1.5">
          <div className="h-3.5 w-28 bg-gray-100 rounded" />
          <div className="h-3 w-40 bg-gray-100 rounded" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="h-5 w-16 bg-gray-100 rounded-full" />
        <div className="h-3 w-12 bg-gray-100 rounded" />
      </div>
    </div>
  );
}

export function SkeletonActivityItem() {
  return (
    <div className="flex gap-3 animate-pulse">
      <div className="w-7 h-7 bg-gray-100 rounded-full shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 w-20 bg-gray-100 rounded" />
        <div className="h-3 w-32 bg-gray-100 rounded" />
        <div className="h-3 w-16 bg-gray-100 rounded" />
      </div>
    </div>
  );
}

export function SkeletonScenarioCard() {
  return (
    <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] overflow-hidden animate-pulse">
      <div className="p-4 border-b border-gray-100 space-y-2.5">
        <div className="h-4 w-3/4 bg-gray-100 rounded" />
        <div className="h-3 w-full bg-gray-100 rounded" />
        <div className="h-3 w-2/3 bg-gray-100 rounded" />
      </div>
      <div className="p-3.5 space-y-2.5">
        <div className="flex items-center gap-2">
          <div className="h-5 w-16 bg-gray-100 rounded-full" />
          <div className="h-3 w-12 bg-gray-100 rounded" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-3 w-20 bg-gray-100 rounded" />
          <div className="h-3 w-16 bg-gray-100 rounded" />
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-16 bg-gray-100 rounded-lg" />
          <div className="h-8 w-20 bg-gray-100 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonNotificationItem() {
  return (
    <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] p-3.5 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 bg-gray-100 rounded-lg shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 w-3/4 bg-gray-100 rounded" />
          <div className="h-3 w-full bg-gray-100 rounded" />
          <div className="h-3 w-20 bg-gray-100 rounded" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonProfileHeader() {
  return (
    <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] p-5 animate-pulse">
      <div className="flex items-center gap-4 mb-5">
        <div className="w-14 h-14 bg-gray-100 rounded-full" />
        <div className="space-y-1.5">
          <div className="h-5 w-40 bg-gray-100 rounded" />
          <div className="h-3.5 w-48 bg-gray-100 rounded" />
          <div className="h-3 w-28 bg-gray-100 rounded" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="text-center p-3 bg-gray-50 rounded-lg space-y-1.5">
            <div className="h-6 w-10 bg-gray-100 rounded mx-auto" />
            <div className="h-3 w-14 bg-gray-100 rounded mx-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonRiskPredictionCard() {
  return (
    <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] p-5 animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 bg-gray-100 rounded-lg" />
        <div className="h-4 w-32 bg-gray-100 rounded" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between">
            <div className="h-3.5 w-16 bg-gray-100 rounded" />
            <div className="h-3.5 w-12 bg-gray-100 rounded" />
          </div>
        ))}
        <div className="border-t border-gray-100 pt-3 space-y-1.5">
          <div className="h-3.5 w-20 bg-gray-100 rounded" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-2 h-2 bg-gray-100 rounded-full" />
              <div className="h-3 w-28 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SkeletonChartArea({ height = "h-36" }: { height?: string }) {
  return (
    <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] p-5 animate-pulse">
      <div className="h-4 w-32 bg-gray-100 rounded mb-4" />
      <div className={`${height} bg-gray-50 rounded-lg flex items-end gap-2 p-2`}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 bg-gray-100 rounded-t"
            style={{ height: `${30 + Math.random() * 70}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export function SkeletonCompetencyGrid() {
  return (
    <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] p-5 animate-pulse">
      <div className="h-4 w-40 bg-gray-100 rounded mb-4" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="text-center space-y-1.5">
            <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto" />
            <div className="h-3 w-14 bg-gray-100 rounded mx-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonInsightCard() {
  return (
    <div className="flex items-start gap-3 p-3.5 rounded-lg border border-gray-100 bg-subtle animate-pulse">
      <div className="w-7 h-7 bg-gray-100 rounded-full shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 w-3/4 bg-gray-100 rounded" />
        <div className="h-3 w-16 bg-gray-100 rounded" />
      </div>
    </div>
  );
}

export function SkeletonTabContent() {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between p-3.5 bg-gray-50 rounded-lg">
          <div className="space-y-1.5">
            <div className="h-3.5 w-40 bg-gray-100 rounded" />
            <div className="h-3 w-28 bg-gray-100 rounded" />
          </div>
          <div className="h-5 w-10 bg-gray-100 rounded" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonPatientGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] p-4 animate-pulse"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-gray-100 rounded-full" />
            <div className="space-y-2 min-w-0 flex-1">
              <div className="h-4 w-3/4 bg-gray-100 rounded" />
              <div className="h-3 w-1/2 bg-gray-100 rounded" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="h-3 w-1/3 bg-gray-100 rounded" />
            <div className="h-3 w-1/2 bg-gray-100 rounded" />
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="h-5 w-full bg-gray-100 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonEhrTable() {
  return (
    <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] overflow-hidden animate-pulse">
      <div className="border-b border-hairline flex gap-4 px-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="py-4">
            <div className="h-4 w-24 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              {Array.from({ length: 4 }).map((_, i) => (
                <th key={i} className="py-3 px-4">
                  <div className="h-3.5 w-14 bg-gray-100 rounded" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 4 }).map((_, i) => (
              <tr key={i} className="border-b border-gray-50 last:border-0">
                {Array.from({ length: 4 }).map((_, j) => (
                  <td key={j} className="py-3.5 px-4">
                    <div className={`h-3.5 ${['w-32', 'w-48', 'w-24', 'w-20'][j]} bg-gray-100 rounded`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SkeletonAssessmentCard() {
  return (
    <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] overflow-hidden animate-pulse">
      <span className="absolute left-0 top-0 h-full w-0.5 bg-gray-200" aria-hidden />
      <div className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-5 w-40 bg-gray-100 rounded" />
              <div className="h-5 w-16 bg-gray-100 rounded-full" />
            </div>
            <div className="h-4 w-3/4 bg-gray-100 rounded" />
            <div className="flex items-center gap-3">
              <div className="h-5 w-20 bg-gray-100 rounded" />
              <div className="h-5 w-16 bg-gray-100 rounded" />
              <div className="h-4 w-24 bg-gray-100 rounded" />
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-9 h-9 bg-gray-100 rounded-lg" />
            <div className="w-9 h-9 bg-gray-100 rounded-lg" />
            <div className="w-9 h-9 bg-gray-100 rounded-lg" />
            <div className="h-9 w-24 bg-gray-100 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function SkeletonQuestionCard() {
  return (
    <div className="bg-surface rounded-xl border border-gray-200 shadow-sm animate-pulse">
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-gray-100 rounded-full" />
            <div className="h-8 w-32 bg-gray-100 rounded-lg" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-20 bg-gray-100 rounded-lg" />
            <div className="h-8 w-8 bg-gray-100 rounded-lg" />
          </div>
        </div>
        <div className="h-16 w-full bg-gray-100 rounded-xl" />
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 bg-gray-100 rounded-full" />
            <div className="h-10 flex-1 bg-gray-100 rounded-xl" />
          </div>
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 bg-gray-100 rounded-full" />
            <div className="h-10 flex-1 bg-gray-100 rounded-xl" />
          </div>
        </div>
        <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
          <div className="h-5 w-16 bg-gray-100 rounded" />
          <div className="h-8 w-32 bg-gray-100 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonSidebar() {
  return (
    <div className="h-screen bg-canvas flex overflow-hidden animate-pulse">
      <div
        className="w-60 flex flex-col shrink-0"
        style={{ background: 'linear-gradient(180deg, #0b3d3d 0%, #146464 50%, #0f5252 100%)' }}
      >
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-3.5">
          <div className="w-9 h-9 bg-white/10 rounded-[11px]" />
          <div className="space-y-2">
            <div className="h-3 w-16 bg-white/10 rounded" />
            <div className="h-2 w-20 bg-white/[0.06] rounded" />
          </div>
        </div>
        {/* Profile */}
        <div className="mx-3 mb-2 flex items-center gap-2.5 rounded-xl bg-white/[0.05] px-2 py-2">
          <div className="w-8 h-8 bg-white/10 rounded-full" />
          <div className="space-y-2 flex-1">
            <div className="h-3 w-24 bg-white/10 rounded" />
            <div className="h-2 w-12 bg-white/[0.06] rounded" />
          </div>
        </div>
        {/* Nav groups */}
        <div className="flex-1 px-3 py-2 space-y-3">
          {[3, 3, 2].map((count, group) => (
            <div key={group} className="space-y-1.5">
              <div className="flex items-center gap-2 px-2.5 pb-1 pt-1">
                <div className="h-2 w-14 bg-white/10 rounded" />
                <div className="h-px flex-1 bg-white/10" />
              </div>
              {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="h-9 bg-white/[0.06] rounded-lg" />
              ))}
            </div>
          ))}
        </div>
        {/* Logout */}
        <div className="px-3 pb-3 pt-2 border-t border-white/10">
          <div className="h-9 bg-white/[0.04] rounded-lg" />
        </div>
      </div>
      <div className="flex-1 p-4 space-y-4">
        <div className="h-16 bg-surface rounded-xl border border-hairline" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-surface rounded-xl border border-hairline" />
          ))}
        </div>
        <div className="h-48 bg-surface rounded-xl border border-hairline" />
      </div>
    </div>
  );
}
