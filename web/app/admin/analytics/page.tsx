import type { Metadata } from "next";
import AdminAnalyticsClient from "./page-client";

export const metadata: Metadata = {
  title: "Analytics | iCARE++",
};

export default function AnalyticsPage() {
  return <AdminAnalyticsClient />;
}
