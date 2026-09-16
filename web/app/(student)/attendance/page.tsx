import type { Metadata } from "next";
import StudentAttendanceClient from "./page-client";

export const metadata: Metadata = {
  title: "My Attendance | iCARE++",
};

export default function StudentAttendancePage() {
  return <StudentAttendanceClient />;
}
