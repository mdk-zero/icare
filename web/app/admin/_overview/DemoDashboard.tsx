"use client";

import { useEffect, useState } from "react";
import { DashboardSkeleton, DashboardView, type DashboardData } from "./DashboardView";

/** The Dean overview in a demo: the same view, fed by the demo's in-browser data. */
export default function DemoDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    let live = true;
    void fetch("/api/admin/overview")
      .then((res) => (res.ok ? (res.json() as Promise<DashboardData>) : null))
      .then((next) => {
        if (live && next) setData(next);
      });
    return () => {
      live = false;
    };
  }, []);

  return data ? <DashboardView data={data} /> : <DashboardSkeleton />;
}
