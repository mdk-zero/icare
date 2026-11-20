import type { Metadata } from "next";
import NotificationDetail from "../../../components/NotificationDetail";

export const metadata: Metadata = {
  title: "Notification | iCARE++",
};

export default function SuperAdminNotificationPage() {
  return <NotificationDetail portal="admin" />;
}
