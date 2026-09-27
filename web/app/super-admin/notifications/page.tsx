import type { Metadata } from "next";
import FacultyNotificationsClient from "../../faculty/notifications/page-client";

export const metadata: Metadata = {
  title: "Notifications | iCARE++",
};

/** The faculty feed, pointed at what reaches a super admin: account requests. */
export default function SuperAdminNotificationsPage() {
  return (
    <FacultyNotificationsClient emptyHint="Account requests from the sign-up page will land here as they happen." />
  );
}
