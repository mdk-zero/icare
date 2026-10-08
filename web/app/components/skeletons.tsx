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

/** Mirrors the student detail Low Performance Prediction card. */
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
        {/* Fixed heights: random ones would change on every render. */}
        {[55, 80, 40, 95, 65, 75, 45, 85].map((h, i) => (
          <div key={i} className="flex-1 bg-gray-100 rounded-t" style={{ height: `${h}%` }} />
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

/** Mirrors the Library skill browser: a chapter heading, then skill rows with a mono id. */
export function SkeletonLibrarySkillList({ chapters = 3, perChapter = 4 }: { chapters?: number; perChapter?: number }) {
  const titles = ["w-40", "w-52", "w-32", "w-44", "w-36"];
  return (
    <div className="animate-pulse" aria-hidden>
      {Array.from({ length: chapters }).map((_, c) => (
        <div key={c}>
          <div className="px-3 pt-3 pb-1.5">
            <div className="h-2.5 w-36 rounded bg-gray-100" />
          </div>
          {Array.from({ length: perChapter }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2.5">
              <div className="h-3 w-8 shrink-0 rounded bg-gray-100" />
              <div className={`h-3.5 ${titles[(c * perChapter + i) % titles.length]} max-w-full rounded bg-gray-100`} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Mirrors the Library's selected skill: its header with the add buttons, then material cards. */
export function SkeletonLibraryMaterials({ cards = 2 }: { cards?: number }) {
  return (
    <div className="space-y-4 animate-pulse" aria-hidden>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline bg-surface p-4 shadow-tile">
        <div className="space-y-2">
          <div className="h-3 w-40 rounded bg-gray-100" />
          <div className="h-4 w-64 max-w-full rounded bg-gray-100" />
        </div>
        <div className="flex flex-wrap gap-2">
          {["w-16", "w-14", "w-20", "w-16"].map((w, i) => (
            <div key={i} className={`h-7 ${w} rounded-lg bg-gray-100`} />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="flex flex-col overflow-hidden rounded-xl border border-hairline bg-surface shadow-tile">
            <div className="flex aspect-video items-center justify-center bg-gray-100">
              <div className="h-12 w-12 rounded-full bg-gray-200/70" />
            </div>
            <div className="space-y-2.5 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="h-4 w-2/3 rounded bg-gray-100" />
                <div className="h-5 w-16 rounded-full bg-gray-100" />
              </div>
              <div className="h-3 w-full rounded bg-gray-100" />
              <div className="flex gap-1.5">
                <div className="h-5 w-12 rounded bg-gray-100" />
                <div className="h-5 w-20 rounded bg-gray-100" />
              </div>
            </div>
            <div className="flex items-center gap-3 border-t border-hairline bg-subtle px-4 py-2.5">
              <div className="h-3 w-20 rounded bg-gray-100" />
              <span className="flex-1" />
              <div className="h-3 w-12 rounded bg-gray-100" />
              <div className="h-3.5 w-3.5 rounded bg-gray-100" />
              <div className="h-3.5 w-3.5 rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Mirrors a term heading over its course cards: name, status pill, dates. */
export function SkeletonTermHeading() {
  return (
    <div className="mb-2.5 flex items-center gap-2 animate-pulse">
      <div className="h-4 w-44 rounded bg-gray-200" />
      <div className="h-4 w-14 rounded-full bg-gray-100" />
      <div className="h-3 w-32 rounded bg-gray-100" />
    </div>
  );
}

/** Mirrors a course card: code and title, section chips and students, roster bar, tab links. */
export function SkeletonCourseCard() {
  return (
    <div className="flex flex-col rounded-2xl border border-hairline bg-surface shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] animate-pulse">
      <div className="flex-1 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-5 w-24 rounded bg-gray-200" />
            <div className="h-3.5 w-48 rounded bg-gray-100" />
          </div>
          <div className="mt-1.5 h-3.5 w-3.5 rounded bg-gray-100" />
        </div>
        <div className="mt-3 flex items-center gap-1.5">
          <div className="h-5 w-16 rounded-full bg-gray-100" />
          <div className="h-5 w-16 rounded-full bg-gray-100" />
          <div className="ml-auto h-3 w-20 rounded bg-gray-100" />
        </div>
        <div className="mt-4 space-y-1.5">
          <div className="h-2 rounded-full bg-gray-100" />
          <div className="flex gap-3">
            <div className="h-3 w-20 rounded bg-gray-100" />
            <div className="h-3 w-16 rounded bg-gray-100" />
            <div className="h-3 w-20 rounded bg-gray-100" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 border-t border-hairline">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={`flex justify-center py-3 ${i > 0 ? "border-l border-hairline" : ""}`}>
            <div className="h-3 w-16 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Mirrors a course's progress grid: search, group and status filters, the
 * legend, then a table of students (avatar, name, group, done/total) against
 * requirements.
 */
export function SkeletonProgressGrid({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="animate-pulse" aria-hidden>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="h-9 min-w-[12rem] flex-1 rounded-xl border border-gray-200 bg-surface sm:max-w-xs" />
        <div className="h-9 w-32 rounded-xl border border-gray-200 bg-surface" />
        <div className="flex gap-1 rounded-xl bg-subtle p-1">
          <div className="h-7 w-14 rounded-lg bg-surface" />
          <div className="h-7 w-24 rounded-lg bg-gray-100" />
          <div className="h-7 w-24 rounded-lg bg-gray-100" />
        </div>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-4">
        <div className="h-3 w-32 rounded bg-gray-100" />
        <div className="h-3 w-24 rounded bg-gray-100" />
        <div className="h-3 w-36 rounded bg-gray-100" />
      </div>
      <div className="overflow-hidden rounded-xl border border-hairline bg-surface">
        <div className="flex border-b border-hairline bg-subtle">
          <div className="w-60 shrink-0 px-4 py-3">
            <div className="h-3 w-16 rounded bg-gray-200" />
          </div>
          {Array.from({ length: cols }).map((_, i) => (
            <div key={i} className="w-32 shrink-0 space-y-1.5 px-2 py-3">
              <div className="h-2.5 w-6 rounded bg-gray-200" />
              <div className="h-3 w-24 rounded bg-gray-200" />
              <div className="h-2.5 w-10 rounded bg-gray-100" />
            </div>
          ))}
        </div>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center border-b border-hairline last:border-b-0">
            <div className="flex w-60 shrink-0 items-center gap-3 px-4 py-2.5">
              <div className="h-8 w-8 shrink-0 rounded-full bg-gray-100" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-28 rounded bg-gray-200" />
                <div className="h-2.5 w-20 rounded bg-gray-100" />
              </div>
              <div className="h-4 w-9 rounded-full bg-gray-100" />
            </div>
            {Array.from({ length: cols }).map((_, c) => (
              <div key={c} className="w-32 shrink-0 px-2 py-2.5">
                <div className="h-6 w-6 rounded-full bg-gray-100" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Mirrors the patient picker's rows: initials, name and diagnosis, room. */
export function SkeletonPatientPickRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-hairline animate-pulse" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5">
          <div className="h-7 w-7 shrink-0 rounded-full bg-gray-100" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-32 rounded bg-gray-200" />
            <div className="h-2.5 w-52 rounded bg-gray-100" />
          </div>
          <div className="h-3 w-14 rounded bg-gray-100" />
        </div>
      ))}
    </div>
  );
}

/**
 * Mirrors the patient case editor: the case's own fields and its tasks on the
 * left, the patient and room it runs on to the right.
 */
export function SkeletonCaseEditor() {
  const field = (label: string, h: string) => (
    <div className="space-y-2">
      <div className={`h-3 rounded bg-gray-200 ${label}`} />
      <div className={`rounded-lg border border-hairline bg-gray-50 ${h}`} />
    </div>
  );
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 animate-pulse" aria-hidden>
      <div className="space-y-4">
        <div className="space-y-4 rounded-xl border border-hairline bg-surface p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
          {field("w-12", "h-10")}
          {field("w-20", "h-24")}
          {field("w-32", "h-24")}
        </div>
        <div className="space-y-3 rounded-xl border border-hairline bg-surface p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
          <div className="h-3.5 w-14 rounded bg-gray-200" />
          <div className="h-2.5 w-56 rounded bg-gray-100" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-hairline px-3 py-2.5">
              <div className="h-5 w-5 rounded-full bg-gray-100" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-3/4 rounded bg-gray-200" />
                <div className="h-2.5 w-20 rounded bg-gray-100" />
              </div>
              <div className="h-4 w-4 rounded bg-gray-100" />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-4">
        <div className="rounded-xl border border-hairline bg-surface p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
          <div className="mb-3 flex justify-between">
            <div className="h-3.5 w-16 rounded bg-gray-200" />
            <div className="h-3 w-28 rounded bg-gray-100" />
          </div>
          <div className="mb-2 h-10 rounded-lg border border-hairline bg-gray-50" />
          <SkeletonPatientPickRows rows={4} />
        </div>
        <div className="space-y-2.5 rounded-xl border border-hairline bg-surface p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
          <div className="h-3.5 w-12 rounded bg-gray-200" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-1">
              <div className="h-4 w-4 rounded-full bg-gray-100" />
              <div className="h-3 w-36 rounded bg-gray-200" />
              <div className="ml-auto h-3 w-16 rounded bg-gray-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Mirrors grading a case presentation: back link, student and hand-in line,
 * the written-up case on the left and the rubric on the right.
 */
export function SkeletonCaseGrading({ criteria = 5 }: { criteria?: number }) {
  return (
    <div className="space-y-4 animate-pulse" aria-busy="true" aria-label="Loading the case presentation">
      <div className="h-4 w-48 rounded bg-gray-100" />
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="h-6 w-44 rounded bg-gray-200" />
          <div className="h-3.5 w-64 rounded bg-gray-100" />
        </div>
        <div className="h-6 w-20 rounded-full bg-gray-100" />
      </div>
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
        <div className="space-y-3">
          <div className="space-y-3 rounded-xl border border-hairline bg-surface p-4 shadow-tile">
            <div className="h-3 w-48 rounded bg-gray-100" />
            <div className="grid grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="h-2.5 w-14 rounded bg-gray-100" />
                  <div className="h-3 w-20 rounded bg-gray-200" />
                </div>
              ))}
            </div>
            <div className="h-2.5 w-28 rounded bg-gray-100" />
          </div>
          {["w-32", "w-16", "w-24", "w-36", "w-44", "w-32"].map((w, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-hairline bg-surface p-4 shadow-tile">
              <div className={`h-3.5 rounded bg-gray-200 ${w}`} />
              <div className="h-3 w-3/4 rounded bg-gray-100" />
            </div>
          ))}
        </div>
        <section className="space-y-4 rounded-xl border border-hairline bg-surface p-4 shadow-tile">
          <div className="flex items-baseline justify-between">
            <div className="h-4 w-16 rounded bg-gray-200" />
            <div className="h-3.5 w-36 rounded bg-gray-100" />
          </div>
          {Array.from({ length: criteria }).map((_, i) => (
            <div key={i} className="space-y-2 border-t border-hairline pt-3 first:border-t-0 first:pt-0">
              <div className="h-3.5 w-40 rounded bg-gray-200" />
              <div className="h-2.5 w-full rounded bg-gray-100" />
              <div className="grid grid-cols-3 gap-1.5">
                <div className="h-7 rounded-lg bg-gray-100" />
                <div className="h-7 rounded-lg bg-gray-100" />
                <div className="h-7 rounded-lg bg-gray-100" />
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

/** Mirrors the ward toolbar: layout toggle, room search, filters, Admit Patient. */
export function SkeletonWardToolbar({ toggle = true }: { toggle?: boolean }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 animate-pulse" aria-hidden>
      {toggle && (
        <div className="flex gap-1 rounded-xl border border-gray-200 bg-surface p-1">
          <div className="h-7 w-28 rounded-lg bg-gray-200" />
          <div className="h-7 w-24 rounded-lg bg-gray-100" />
        </div>
      )}
      <div className="h-10 w-full rounded-xl border border-hairline bg-surface sm:w-64" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-9 w-24 rounded-lg border border-hairline bg-surface" />
      ))}
      <div className="ml-auto h-10 w-32 rounded-lg bg-gray-200" />
    </div>
  );
}

/** Mirrors the room layout: a heading over rows of rooms, each a name bar over beds. */
export function SkeletonFloorPlan() {
  const room = (beds: number, key: number) => (
    <div key={key} className="flex-1 border-r-4 border-gray-200 p-2 last:border-r-0">
      <div className="mb-2 flex items-center justify-between">
        <div className="space-y-1">
          <div className="h-3 w-24 rounded bg-gray-200" />
          <div className="h-2 w-10 rounded bg-gray-100" />
        </div>
        <div className="h-3.5 w-8 rounded bg-gray-100" />
      </div>
      <div className="flex gap-1">
        {Array.from({ length: beds }).map((_, b) => (
          <div key={b} className="h-7 w-4 rounded-sm border border-gray-200 bg-gray-50" />
        ))}
      </div>
    </div>
  );
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading the ward">
      <div className="mb-2 flex items-center justify-between">
        <div className="h-4 w-28 rounded bg-gray-200" />
        <div className="h-3 w-56 rounded bg-gray-100" />
      </div>
      <div className="space-y-6 rounded-xl border border-hairline bg-surface p-4">
        <div className="flex border-4 border-gray-200">{[9, 7, 7, 3].map((b, i) => room(b, i))}</div>
        <div className="flex border-4 border-gray-200">{[6, 5, 4, 4, 4].map((b, i) => room(b, i))}</div>
        <div className="flex w-1/4 border-4 border-gray-200">{room(3, 0)}</div>
      </div>
    </div>
  );
}

/** The plot of a chart inside its own card: bars rising from a baseline. */
export function SkeletonChartBars({ height = 200, bars = 24 }: { height?: number; bars?: number }) {
  const heights = [30, 45, 25, 60, 40, 70, 35, 55, 20, 65, 50, 80];
  return (
    <div className="animate-pulse" style={{ height }} aria-hidden="true">
      <div className="flex h-full items-end gap-1 border-b border-l border-gray-100 pl-2">
        {Array.from({ length: bars }).map((_, i) => (
          <div key={i} className="flex-1 rounded-t bg-gray-100" style={{ height: `${heights[i % heights.length]}%` }} />
        ))}
      </div>
    </div>
  );
}

/** A donut with its total in the middle and a legend underneath. */
export function SkeletonDonut({ legend = 4 }: { legend?: number }) {
  return (
    <div className="flex flex-col gap-4 animate-pulse" aria-hidden="true">
      <div className="relative mx-auto aspect-square w-full max-w-[11rem]">
        <div className="absolute inset-0 rounded-full border-[1.6rem] border-gray-100" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
          <div className="h-7 w-10 rounded bg-gray-100" />
          <div className="h-3 w-14 rounded bg-gray-100" />
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
        {Array.from({ length: legend }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-gray-100" />
            <div className="h-3 w-14 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Label-on-the-left, value-on-the-right rows, like a definition list. */
export function SkeletonKeyValues({ rows = 4 }: { rows?: number }) {
  const widths = ["w-20", "w-28", "w-16", "w-24"];
  return (
    <div className="space-y-2.5 animate-pulse" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex justify-between gap-3">
          <div className={`h-3.5 ${widths[i % widths.length]} rounded bg-gray-100`} />
          <div className="h-3.5 w-16 rounded bg-gray-100" />
        </div>
      ))}
    </div>
  );
}

/** A bar standing in for one line of text. */
export function SkeletonText({ className = "h-3.5 w-24" }: { className?: string }) {
  return <span className={`block animate-pulse rounded bg-gray-100 ${className}`} aria-hidden="true" />;
}
