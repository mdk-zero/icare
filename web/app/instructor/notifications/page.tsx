import type { Metadata } from "next";
import FacultyNotificationsClient from "./page-client";

export const metadata: Metadata = {
  title: "Notifications | iCARE++ Instructor",
};

export default function FacultyNotificationsPage() {
  return <FacultyNotificationsClient />;
}