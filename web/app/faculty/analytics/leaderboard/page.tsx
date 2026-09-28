import type { Metadata } from "next";
import LeaderboardClient from "./page-client";

export const metadata: Metadata = {
  title: "Leaderboard | iCARE++ Instructor",
};

export default function FacultyLeaderboardPage() {
  return <LeaderboardClient />;
}
