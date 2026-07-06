"use client";

import ChangePasswordForm from "../../../components/ChangePasswordForm";
import { logAuditAction, getCurrentFacultyUser } from "../../../lib/api";

export default function FacultyChangePasswordPage() {
  return (
    <ChangePasswordForm
      backHref="/faculty/settings"
      backLabel="Back to settings"
      onPasswordChanged={() => {
        const faculty = getCurrentFacultyUser();
        if (faculty) {
          logAuditAction({
            faculty_id: faculty.id,
            faculty_name: faculty.name,
            tab: 'settings',
            action: 'change_password',
            details: 'Changed account password',
          });
        }
      }}
    />
  );
}
