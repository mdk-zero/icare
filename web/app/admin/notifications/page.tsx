import type { Metadata } from "next";
import FacultyNotificationsClient from "../../faculty/notifications/page-client";

export const metadata: Metadata = {
  title: "Notifications | iCARE++ Dean",
};

/** The faculty feed, pointed at what reaches an admin: grade change requests. */
export default function AdminNotificationsPage() {
  return (
    <FacultyNotificationsClient emptyHint="When your instructors ask to change a saved grade, the request lands here." />
  );
}
