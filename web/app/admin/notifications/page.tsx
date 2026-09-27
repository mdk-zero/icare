import type { Metadata } from "next";
import FacultyNotificationsClient from "../../faculty/notifications/page-client";

export const metadata: Metadata = {
  title: "Notifications | iCARE++ Admin",
};

/** The faculty feed, pointed at what reaches an admin: grade change requests. */
export default function AdminNotificationsPage() {
  return (
    <FacultyNotificationsClient emptyHint="When your faculty ask to change a saved grade, the request lands here." />
  );
}
