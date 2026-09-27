/** Mirrors StatTile: label beside a round icon, a display-size value, caption. */
export function SkeletonStatTile() {
  return (
    <div className="flex flex-col rounded-2xl border border-hairline bg-surface p-4 shadow-tile animate-pulse">
      <div className="flex items-start justify-between gap-2">
        <div className="mt-0.5 h-3 w-24 rounded bg-gray-100" />
        <div className="h-12 w-12 shrink-0 rounded-full bg-gray-100" />
      </div>
      <div className="mt-2 h-9 w-20 rounded bg-gray-100" />
      <div className="mt-2.5 h-3 w-28 rounded bg-gray-100" />
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

/** Mirrors the faculty patients care-unit card: icon, title + count line, a
 *  chevron, and a single status pill on the footer. */
export function SkeletonUnitGrid({ cards = 6 }: { cards?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: cards }).map((_, i) => (
        <div
          key={i}
          className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] p-5 animate-pulse"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 bg-gray-100 rounded-xl shrink-0" />
              <div className="space-y-2 min-w-0">
                <div className="h-4 w-24 bg-gray-100 rounded" />
                <div className="h-3 w-28 bg-gray-100 rounded" />
              </div>
            </div>
            <div className="w-3.5 h-3.5 bg-gray-100 rounded mt-1" />
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="h-6 w-24 bg-gray-100 rounded-full" />
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

/** Mirrors the student detail profile card: avatar, name, AI Summary, 4 stat tiles. */
export function SkeletonProfileHeader() {
  return (
    <div className="flex h-full flex-col rounded-xl border border-hairline bg-surface p-3 shadow-tile animate-pulse">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 shrink-0 rounded-full bg-gray-100" />
          <div className="space-y-2">
            <div className="h-7 w-44 rounded bg-gray-100" />
            <div className="h-4 w-52 rounded bg-gray-100" />
            <div className="h-5 w-24 rounded-full bg-gray-100" />
          </div>
        </div>
        <div className="h-9 w-32 shrink-0 rounded-lg bg-gray-100" />
      </div>
      <div className="grid flex-1 grid-cols-1 sm:grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStatTile key={i} />
        ))}
      </div>
    </div>
  );
}

/** Mirrors the student detail At-Risk Prediction card. */
export function SkeletonRiskPredictionCard() {
  return (
    <div className="h-full rounded-xl border border-hairline bg-surface p-3 shadow-tile animate-pulse">
      <div className="mb-4 flex items-center gap-2">
        <div className="h-9 w-9 rounded-lg bg-gray-100" />
        <div className="h-4 w-36 rounded bg-gray-100" />
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="h-3.5 w-24 rounded bg-gray-100" />
          <div className="h-3.5 w-14 rounded bg-gray-100" />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <div className="h-3.5 w-28 rounded bg-gray-100" />
            <div className="h-3.5 w-10 rounded bg-gray-100" />
          </div>
          <div className="h-2 rounded-full bg-gray-100" />
        </div>
        <div className="space-y-2 border-t border-hairline pt-3">
          <div className="h-3.5 w-40 rounded bg-gray-100" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-gray-100" />
                <div className="h-3 w-28 rounded bg-gray-100" />
              </div>
              <div className="h-3 w-16 rounded bg-gray-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Mirrors the student detail tab tiles: icon, label and hint, count. */
export function SkeletonTabTiles({ count = 4 }: { count?: number }) {
  return (
    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-2xl border border-hairline bg-surface p-4 animate-pulse"
        >
          <div className="h-12 w-12 shrink-0 rounded-xl bg-gray-100" />
          <div className="flex-1 space-y-1.5">
            <div className="h-4 w-24 rounded bg-gray-100" />
            <div className="h-3 w-32 rounded bg-gray-100" />
          </div>
          <div className="space-y-1.5">
            <div className="ml-auto h-6 w-6 rounded bg-gray-100" />
            <div className="h-2.5 w-10 rounded bg-gray-100" />
          </div>
        </div>
      ))}
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

/** Mirrors a Performance tab row: icon, title and date, score. */
export function SkeletonTabContent() {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
          <div className="h-9 w-9 shrink-0 rounded-full bg-gray-100" />
          <div className="flex-1 space-y-1.5">
            <div className="h-4 w-48 bg-gray-100 rounded" />
            <div className="h-3.5 w-32 bg-gray-100 rounded" />
            <div className="h-3 w-24 bg-gray-100 rounded" />
          </div>
          <div className="space-y-1.5">
            <div className="ml-auto h-5 w-12 bg-gray-100 rounded" />
            <div className="h-2.5 w-16 bg-gray-100 rounded" />
          </div>
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
    <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] overflow-hidden flex flex-col animate-pulse">
      <div className="p-4 flex-1 space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-5 w-36 bg-gray-100 rounded" />
          <div className="h-5 w-16 bg-gray-100 rounded-full shrink-0" />
        </div>
        <div className="h-4 w-full bg-gray-100 rounded" />
        <div className="h-4 w-2/3 bg-gray-100 rounded" />
        <div className="flex items-center gap-2">
          <div className="h-5 w-16 bg-gray-100 rounded" />
          <div className="h-5 w-14 bg-gray-100 rounded" />
          <div className="h-4 w-20 bg-gray-100 rounded" />
        </div>
      </div>
      <div className="px-4 py-3 bg-subtle border-t border-hairline flex justify-end gap-1.5">
        <div className="w-8 h-8 bg-gray-100 rounded-lg" />
        <div className="w-8 h-8 bg-gray-100 rounded-lg" />
        <div className="w-8 h-8 bg-gray-100 rounded-lg" />
        <div className="w-8 h-8 bg-gray-100 rounded-lg" />
        <div className="h-8 w-20 bg-gray-100 rounded-lg" />
      </div>
    </div>
  );
}

export function SkeletonQuestionCard() {
  return (
    <div className="bg-surface rounded-xl border border-gray-200 shadow-sm animate-pulse flex flex-col">
      <div className="p-4 flex-1 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-gray-100 rounded-full shrink-0" />
          <div className="h-6 w-28 bg-gray-100 rounded-lg" />
        </div>
        <div className="h-12 w-full bg-gray-100 rounded-xl" />
        <div className="space-y-1.5">
          {[0, 1].map((j) => (
            <div key={j} className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gray-100 rounded-full shrink-0" />
              <div className="h-8 flex-1 bg-gray-100 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
      <div className="px-4 py-3 bg-subtle border-t border-hairline flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-5 w-14 bg-gray-100 rounded" />
          <div className="h-6 w-20 bg-gray-100 rounded-lg" />
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-7 h-7 bg-gray-100 rounded-lg" />
          <div className="w-7 h-7 bg-gray-100 rounded-lg" />
          <div className="w-7 h-7 bg-gray-100 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

/** `collapsed` mirrors the Shell's desktop icon rail, so the page doesn't jump when it loads. */
export function SkeletonSidebar({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="h-screen bg-canvas flex overflow-hidden animate-pulse">
      <div
        className={`${collapsed ? 'w-64 md:w-[68px]' : 'w-64'} flex flex-col shrink-0`}
        style={{ background: 'linear-gradient(180deg, #0b3d3d 0%, #146464 50%, #0f5252 100%)' }}
      >
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-3.5">
          <div className="w-9 h-9 shrink-0 bg-white/10 rounded-[11px]" />
          <div className={`space-y-2 ${collapsed ? 'md:hidden' : ''}`}>
            <div className="h-3 w-16 bg-white/10 rounded" />
            <div className="h-2 w-20 bg-white/[0.06] rounded" />
          </div>
        </div>
        {/* Profile */}
        <div
          className={`mx-3 mb-2 flex items-center gap-2.5 rounded-xl bg-white/[0.05] px-2 py-2 ${
            collapsed ? 'md:justify-center md:bg-transparent md:px-0' : ''
          }`}
        >
          <div className="w-8 h-8 shrink-0 bg-white/10 rounded-full" />
          <div className={`space-y-2 flex-1 ${collapsed ? 'md:hidden' : ''}`}>
            <div className="h-3 w-24 bg-white/10 rounded" />
            <div className="h-2 w-12 bg-white/[0.06] rounded" />
          </div>
        </div>
        {/* Nav groups */}
        <div className="flex-1 px-3 py-2 space-y-3">
          {[3, 3, 2].map((count, group) => (
            <div key={group} className="space-y-1.5">
              <div className="flex items-center gap-2 px-2.5 pb-1 pt-1">
                <div className={`h-2 w-14 bg-white/10 rounded ${collapsed ? 'md:hidden' : ''}`} />
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

/** Mirrors the faculty teams section card: display-size name + chevron, the
 *  groups/count line, then an avatar stack beside a status pill. */
export function SkeletonTeamGrid({ cards = 6 }: { cards?: number }) {
  return (
    <div>
      <div className="mb-5 h-11 max-w-md rounded-xl border border-hairline bg-surface animate-pulse" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: cards }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col rounded-xl border border-hairline bg-surface p-5 shadow-tile animate-pulse"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="h-7 w-32 rounded bg-gray-100" />
              <div className="mt-2 h-3.5 w-3.5 rounded bg-gray-100" />
            </div>
            <div className="mt-2 h-3.5 w-48 rounded bg-gray-100" />
            <div className="mt-auto flex items-center justify-between gap-3 pt-5">
              <div className="flex -space-x-2">
                {Array.from({ length: 5 }).map((_, j) => (
                  <div key={j} className="h-8 w-8 rounded-full bg-gray-100 ring-2 ring-surface" />
                ))}
              </div>
              <div className="h-5 w-28 rounded-full bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Mirrors the attendance month calendar: toolbar, weekday header, and six
 *  rows of day cells so the page keeps its height when shifts arrive. */
export function SkeletonShiftCalendar() {
  return (
    <div className="overflow-hidden rounded-xl border border-hairline bg-surface shadow-tile animate-pulse">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <div className="flex items-center gap-1.5">
          <div className="h-8 w-16 rounded-lg bg-gray-100" />
          <div className="h-8 w-8 rounded-lg bg-gray-100" />
          <div className="h-8 w-8 rounded-lg bg-gray-100" />
          <div className="ml-1.5 h-4 w-32 rounded bg-gray-100" />
        </div>
        <div className="h-8 w-32 rounded-lg bg-gray-100" />
      </div>
      <div className="grid grid-cols-7 border-b border-hairline bg-subtle">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex justify-center px-2 py-2.5">
            <div className="h-2.5 w-8 rounded bg-gray-100" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: 42 }).map((_, i) => (
          <div
            key={i}
            className="min-h-[104px] border-b border-r border-hairline p-1.5 [&:nth-child(7n)]:border-r-0"
          >
            <div className="mb-1 flex justify-end">
              <div className="h-6 w-6 rounded-full bg-gray-100" />
            </div>
            {i % 5 === 2 && <div className="h-4 w-full rounded bg-gray-100" />}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Mirrors a shift's roster view below its back button: header, the
 *  status/actions row, then one row per student with their mark buttons. */
export function SkeletonShiftRoster({ rows = 6 }: { rows?: number }) {
  return (
    <div className="animate-pulse">
      <div className="mb-6 space-y-2.5">
        <div className="h-6 w-32 rounded-full bg-gray-100" />
        <div className="h-8 w-72 rounded bg-gray-100" />
        <div className="h-4 w-96 max-w-full rounded bg-gray-100" />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="h-6 w-20 rounded-full bg-gray-100" />
        <div className="h-4 w-36 rounded bg-gray-100" />
        <div className="ml-auto flex items-center gap-2">
          <div className="h-9 w-36 rounded-xl bg-gray-100" />
          <div className="h-9 w-28 rounded-xl bg-gray-100" />
          <div className="h-9 w-24 rounded-xl bg-gray-100" />
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-hairline bg-surface shadow-tile">
        <ul className="divide-y divide-hairline">
          {Array.from({ length: rows }).map((_, i) => (
            <li key={i} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="h-4 w-40 rounded bg-gray-100" />
                <div className="h-3 w-56 rounded bg-gray-100" />
              </div>
              <div className="h-5 w-16 rounded-full bg-gray-100" />
              <div className="flex items-center gap-1">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} className="h-6 w-14 rounded-lg bg-gray-100" />
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
