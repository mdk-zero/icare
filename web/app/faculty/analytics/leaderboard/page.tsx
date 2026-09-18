import type { Metadata } from "next";
import LeaderboardClient from "./page-client";

export const metadata: Metadata = {
  title: "Leaderboard | iCARE++ Faculty",
};

export default function FacultyLeaderboardPage() {
  return <LeaderboardClient />;
}
