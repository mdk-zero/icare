import type { Metadata } from "next";
import PageHeader from "../../components/PageHeader";
import ProfileEditor from "../../components/ProfileEditor";

export const metadata: Metadata = {
  title: "Settings | iCARE++",
};

export default function SuperAdminSettingsPage() {
  return (
    <div>
      <PageHeader title="Settings" subtitle="Your profile and password" />
      <ProfileEditor changePasswordHref="/super-admin/settings/change-password" />
    </div>
  );
}
