import type { Metadata } from "next";
import AttendanceClient from "./page-client";

export const metadata: Metadata = {
  title: "Attendance | iCARE++ Instructor",
};

export default function FacultyAttendancePage() {
  return <AttendanceClient />;
}
