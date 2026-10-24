import type { Metadata } from "next";
import LeaderboardClient from "../../../instructor/analytics/leaderboard/page-client";

export const metadata: Metadata = {
  title: "Leaderboard | iCARE++",
};

export default function AdminLeaderboardPage() {
  return <LeaderboardClient backHref="/dean/analytics" cacheScope="admin" />;
}
