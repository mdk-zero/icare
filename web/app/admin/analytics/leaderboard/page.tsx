import type { Metadata } from "next";
import LeaderboardClient from "../../../faculty/analytics/leaderboard/page-client";

export const metadata: Metadata = {
  title: "Leaderboard | iCARE++",
};

export default function AdminLeaderboardPage() {
  return <LeaderboardClient backHref="/admin/analytics" cacheScope="admin" />;
}
