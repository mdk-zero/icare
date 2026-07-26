"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGear } from "@fortawesome/free-solid-svg-icons";
import ProfileEditor from "../../components/ProfileEditor";
import { logAuditAction, getCurrentFacultyUser } from "../../lib/api";
import PageHeader from "../../components/PageHeader";

export default function FacultySettingsClient() {
  return (
    <div>
      <PageHeader
        badge={{
          icon: <FontAwesomeIcon icon={faGear} className="w-3.5 h-3.5" />,
          label: "Faculty Settings",
        }}
        title="Faculty Settings"
        subtitle="Manage your profile and account security"
      />
      <ProfileEditor
        changePasswordHref="/faculty/settings/change-password"
        onUserUpdate={(user) => {
          const faculty = getCurrentFacultyUser();
          if (faculty) {
            logAuditAction({
              faculty_id: faculty.id,
              faculty_name: faculty.name,
              tab: 'settings',
              action: 'update_profile',
              details: `Updated profile to ${user.name}`,
            });
          }
        }}
      />
    </div>
  );
}
