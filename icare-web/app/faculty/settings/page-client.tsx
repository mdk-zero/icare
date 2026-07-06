"use client";

import ProfileEditor from "../../components/ProfileEditor";
import { logAuditAction, getCurrentFacultyUser } from "../../lib/api";
import PageHeader from "../../components/PageHeader";

export default function FacultySettingsClient() {
  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        badge={{
          icon: (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          ),
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
