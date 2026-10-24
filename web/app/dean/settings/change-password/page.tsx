"use client";

import ChangePasswordForm from "../../../components/ChangePasswordForm";

export default function AdminChangePasswordPage() {
  return (
    <ChangePasswordForm
      backHref="/dean/settings"
      backLabel="Back to settings"
    />
  );
}
