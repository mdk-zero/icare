"use client";

import ChangePasswordForm from "../../../components/ChangePasswordForm";

export default function AdminChangePasswordPage() {
  return (
    <ChangePasswordForm
      backHref="/admin/settings"
      backLabel="Back to settings"
    />
  );
}
