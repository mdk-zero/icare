import type { Metadata } from "next";
import AnnouncementsClient from "./page-client";
import { CONTACT_EMAIL } from "../../lib/dev-team";

export const metadata: Metadata = {
  title: "Announcements | iCARE++",
};

export default function SuperAdminAnnouncementsPage() {
  return <AnnouncementsClient contactEmail={CONTACT_EMAIL} />;
}
