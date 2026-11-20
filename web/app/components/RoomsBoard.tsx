"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBedPulse,
  faDoorOpen,
  faHandHoldingMedical,
  faStopwatch,
  faUserInjured,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import { fetchRoomActivities, fetchWardFixtures, type Room, type RoomActivity } from "../lib/api";
import { usePageData } from "../lib/use-page-data";
import { timeLimitLabel } from "../lib/activity-time";
import { FloorPlanCanvas, GRID_COLS, GRID_ROWS } from "./FloorPlan";
import PageHeader from "./PageHeader";
import { EcgLoader } from "./EcgLoader";

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric" });

const dateLabel = (deadline: string | null | "mixed") =>
  deadline === "mixed" ? "Different dates" : deadline ? day(deadline) : "No date";

/**
 * Wards as rooms only (098): where students perform. Each room lists the
 * patient cases and Return Demonstrations assigned to it, by group, with the
 * date of performance. Rooms are given out when an activity is assigned.
 */
export default function RoomsBoard() {
  const { data, loading } = usePageData("rooms-board", async () => {
    const [board, plan] = await Promise.all([fetchRoomActivities(), fetchWardFixtures()]);
    return { board, fixtures: plan.fixtures };
  });
  const [focus, setFocus] = useState<string | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);

  const board = data?.board && !("error" in data.board) ? data.board : null;
  const rooms = useMemo(() => board?.rooms ?? [], [board]);
  const byRoom = useMemo(() => {
    const out = new Map<string, RoomActivity[]>();
    for (const a of board?.activities ?? []) out.set(a.room_id, [...(out.get(a.room_id) ?? []), a]);
    for (const list of out.values()) {
      list.sort((a, b) => (a.next_date ?? "~").localeCompare(b.next_date ?? "~") || a.title.localeCompare(b.title));
    }
    return out;
  }, [board]);
  // The plan shows each room's students against its capacity.
  const counts = useMemo(
    () => new Map([...byRoom].map(([id, list]) => [id, list.reduce((n, a) => n + a.students, 0)])),
    [byRoom],
  );

  const busy = rooms.filter((r) => byRoom.has(r.id));
  // The plan is drawn on the full grid; only its used rows are shown, so the
  // room list below isn't pushed off the screen by empty paper.
  const usedRows = useMemo(() => {
    const bottoms = [
      ...rooms.flatMap((r) => (r.plan_y != null && r.plan_h != null ? [r.plan_y + r.plan_h] : [])),
      ...(data?.fixtures ?? []).map((f) => f.plan_y + f.plan_h),
    ];
    return bottoms.length ? Math.min(GRID_ROWS, Math.max(...bottoms) + 1) : 0;
  }, [rooms, data?.fixtures]);

  /** A room on the plan picks its card below, and brings it into view. */
  const pickRoom = (room: Room) => {
    const next = focus === room.id ? null : room.id;
    setFocus(next);
    if (next) {
      requestAnimationFrame(() =>
        document.getElementById("room-list")?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    }
  };
  const shown = (focus ? rooms.filter((r) => r.id === focus) : showEmpty ? rooms : busy).sort(
    (a, b) => a.room_number.localeCompare(b.room_number, undefined, { numeric: true }),
  );

  return (
    <div className="pb-4">
      <PageHeader
        badge={{ icon: <FontAwesomeIcon icon={faBedPulse} className="h-3.5 w-3.5" />, label: "Wards" }}
        title="Wards"
        subtitle="The rooms where students perform, and what each group does in them"
      />

      {loading && !data ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <EcgLoader className="text-brand-600" /> Loading the rooms…
        </div>
      ) : data?.board && "error" in data.board ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{data.board.error}</p>
      ) : rooms.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          No rooms yet. Your Dean or Program Chair adds them.
        </p>
      ) : (
        <div className="space-y-5">
          {!board?.enabled && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Rooms on assignments need database migration 098 applied first.
            </p>
          )}

          {usedRows > 0 && (
            <div>
              <p className="mb-2 text-sm text-gray-600">
                Filled beds are students with work in that room. Click a room to see what is assigned there.
              </p>
              <div
                className="relative w-full overflow-hidden rounded-xl"
                style={{ aspectRatio: `${GRID_COLS} / ${usedRows}` }}
              >
                <div className="absolute inset-x-0 top-0">
                  <FloorPlanCanvas
                    rooms={rooms}
                    fixtures={data?.fixtures ?? []}
                    occupancy={counts}
                    onRoomClick={pickRoom}
                    dimmedUnless={focus ? new Set([focus]) : undefined}
                  />
                </div>
              </div>
            </div>
          )}

          <div id="room-list" className="flex scroll-mt-4 flex-wrap items-end justify-between gap-3 border-t border-hairline pt-5">
            <div>
              <h2 className="font-display text-lg font-semibold text-gray-900">
                {focus ? (rooms.find((r) => r.id === focus)?.name ?? "Room") : "What's assigned in each room"}
              </h2>
              <p className="text-sm text-gray-600">
                {focus ? (
                  <button type="button" onClick={() => setFocus(null)} className="font-semibold text-brand-700 hover:underline">
                    Show every room
                  </button>
                ) : (
                  `${busy.length} of ${rooms.length} room${rooms.length === 1 ? "" : "s"} in use`
                )}
              </p>
            </div>
            {!focus && busy.length < rooms.length && (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={showEmpty}
                  onChange={(e) => setShowEmpty(e.target.checked)}
                  className="h-4 w-4 rounded text-brand-600 focus:ring-brand-600"
                />
                Show empty rooms
              </label>
            )}
          </div>

          {shown.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-center">
              <FontAwesomeIcon icon={faDoorOpen} className="mb-2 h-6 w-6 text-gray-300" />
              <p className="text-sm font-medium text-gray-700">Nothing is assigned to a room yet</p>
              <p className="mt-1 text-sm text-gray-500">
                Pick a room when you assign a{" "}
                <Link href="/instructor/scenarios" className="font-semibold text-brand-700 hover:underline">
                  patient case
                </Link>{" "}
                or{" "}
                <Link href="/instructor/return-demos" className="font-semibold text-brand-700 hover:underline">
                  Return Demonstration
                </Link>
                .
              </p>
            </div>
          ) : (
            // One room gets the full width, its activities laid out as a grid.
            <div className={shown.length === 1 ? "grid gap-4" : "grid gap-4 md:grid-cols-2 2xl:grid-cols-3"}>
              {shown.map((room) => (
                <RoomCard key={room.id} room={room} activities={byRoom.get(room.id) ?? []} wide={shown.length === 1} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** A room and what is assigned in it: a list in the room grid, tiles when it has the page to itself. */
function RoomCard({ room, activities, wide = false }: { room: Room; activities: RoomActivity[]; wide?: boolean }) {
  const students = activities.reduce((n, a) => n + a.students, 0);
  return (
    <section className="flex flex-col overflow-hidden rounded-2xl border border-hairline bg-surface shadow-tile">
      <header className="flex items-start justify-between gap-3 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold text-gray-900">
            <FontAwesomeIcon icon={faDoorOpen} className="h-3.5 w-3.5 text-brand-600" aria-hidden />
            <span className="truncate">{room.name}</span>
          </h2>
          <p className="text-xs text-gray-500">Room {room.room_number}</p>
        </div>
        {activities.length > 0 && (
          <span className="shrink-0 rounded-full bg-brand-600/10 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-brand-700">
            {students} student{students === 1 ? "" : "s"}
          </span>
        )}
      </header>
      {activities.length === 0 ? (
        <p className="px-4 py-5 text-sm text-gray-400">Nothing assigned here yet.</p>
      ) : (
        // Tiles at least 20rem wide, so a group's name and date fit on one line.
        <ul className={wide ? "grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] gap-3 p-4" : "divide-y divide-hairline"}>
          {activities.map((a) => {
            const demo = a.kind === "return_demo";
            const groups = (
              <ul className="mt-2 space-y-1">
                {a.groups.map((g) => (
                  <li key={g.key} className="flex items-center justify-between gap-2 rounded-lg bg-subtle px-2.5 py-1.5 text-xs">
                    <span className="flex min-w-0 items-center gap-1.5 text-gray-700">
                      <FontAwesomeIcon icon={faUsers} className="h-3 w-3 shrink-0 text-gray-400" aria-hidden />
                      <span className="truncate font-medium">{g.label}</span>
                      <span className="shrink-0 text-gray-400">{g.count}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-gray-600">{dateLabel(g.deadline)}</span>
                  </li>
                ))}
              </ul>
            );
            return (
              <li key={a.scenario_id} className={wide ? "rounded-xl border border-hairline p-3" : "px-4 py-3"}>
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                      demo ? "bg-amber-100 text-amber-700" : "bg-brand-600/10 text-brand-700"
                    }`}
                    aria-hidden
                  >
                    <FontAwesomeIcon icon={demo ? faHandHoldingMedical : faUserInjured} className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`${wide ? "line-clamp-2" : "truncate"} text-sm font-semibold text-gray-900`} title={a.title}>
                      {a.title}
                    </p>
                    {a.patient && (
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-700">
                        <FontAwesomeIcon icon={faUserInjured} className="h-3 w-3 text-brand-600" aria-hidden />
                        <span className="font-medium">{a.patient.name}</span>
                        {[a.patient.age != null ? `${a.patient.age} yrs` : null, a.patient.sex || null]
                          .filter(Boolean)
                          .map((x) => (
                            <span key={x} className="text-gray-500">
                              · {x}
                            </span>
                          ))}
                      </p>
                    )}
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
                      <span>{demo ? "Return Demonstration" : "Patient case"}</span>
                      {a.time_limit_minutes && (
                        <span className="inline-flex items-center gap-1">
                          <FontAwesomeIcon icon={faStopwatch} className="h-2.5 w-2.5" aria-hidden />
                          {timeLimitLabel(a.time_limit_minutes)}
                        </span>
                      )}
                      <span className="tabular-nums">
                        {a.done}/{a.students} graded
                      </span>
                    </p>
                    {!wide && groups}
                  </div>
                </div>
                {/* A tile gives its groups the full width, under the icon too. */}
                {wide && groups}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
