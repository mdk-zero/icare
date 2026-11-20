import type { Metadata } from "next";
import NotificationDetail from "../../../components/NotificationDetail";

export const metadata: Metadata = {
  title: "Notification | iCARE++ Instructor",
};

export default function FacultyNotificationPage() {
  return <NotificationDetail portal="instructor" />;
}
