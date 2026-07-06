"use client";

import ChangePasswordForm from "../../../components/ChangePasswordForm";

export default function ChangePasswordPage() {
  return (
    <ChangePasswordForm
      backHref="/profile"
      backLabel="Back to profile"
    />
  );
}
