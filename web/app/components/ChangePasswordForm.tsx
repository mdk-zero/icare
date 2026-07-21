"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  changePassword,
  getCurrentUser,
  refreshCurrentUser,
  requestPasswordChangeOtp,
  verifyPasswordChangeOtp,
  User,
} from "../lib/api";

interface ChangePasswordFormProps {
  backHref: string;
  backLabel?: string;
  onPasswordChanged?: () => void;
}

export default function ChangePasswordForm({
  backHref,
  backLabel = "Back to profile",
  onPasswordChanged,
}: ChangePasswordFormProps) {
  const [user, setUser] = useState<User | null>(getCurrentUser());
  const [step, setStep] = useState<"request" | "otp" | "reset">("request");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    const current = getCurrentUser();
    if (!current) return;
    // Hydrate from localStorage after mount to avoid SSR mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUser(current);
  }, []);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = setTimeout(() => setResendSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendSeconds]);

  const hasPassword = user?.has_password ?? false;

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (hasPassword && currentPassword.length === 0) {
      setMessage({ type: "error", text: "Current password is required." });
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await requestPasswordChangeOtp(currentPassword);
      if (result.requiresOtp) {
        setStep("otp");
        setOtp("");
        setDevOtp(result.devOtp ?? null);
        setResendSeconds(60);
        setMessage({
          type: "success",
          text:
            result.error ??
            `A verification code has been sent to ${user?.email ?? "your email"}. It will expire in 10 minutes.`,
        });
      } else if (result.success) {
        setStep("otp");
        setDevOtp(null);
        setMessage({
          type: "success",
          text: "Verification code sent. Please check your email.",
        });
      } else {
        setMessage({
          type: "error",
          text: result.error || "Unable to send verification code.",
        });
      }
    } catch (err) {
      setMessage({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Unable to send verification code.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (otp.length === 0) {
      setMessage({ type: "error", text: "Please enter the verification code." });
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await verifyPasswordChangeOtp(otp);
      if (result.success) {
        setStep("reset");
        setMessage(null);
      } else {
        setMessage({
          type: "error",
          text: result.error || "Invalid or expired verification code.",
        });
      }
    } catch (err) {
      setMessage({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Unable to verify code.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendCode = async () => {
    setMessage(null);
    setIsSubmitting(true);

    try {
      const result = await requestPasswordChangeOtp(currentPassword);
      if (result.requiresOtp || result.success) {
        setResendSeconds(60);
        if (result.devOtp) setDevOtp(result.devOtp);
        setMessage({
          type: "success",
          text:
            result.error ??
            "A new verification code has been sent. It will expire in 10 minutes.",
        });
      } else {
        setMessage({
          type: "error",
          text: result.error || "Unable to resend verification code.",
        });
      }
    } catch (err) {
      setMessage({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Unable to resend verification code.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (newPassword.length < 8) {
      setMessage({
        type: "error",
        text: "New password must be at least 8 characters.",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "Passwords do not match." });
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await changePassword(currentPassword, newPassword, otp);
      if (result.success) {
        setStep("request");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setOtp("");
        setDevOtp(null);
        const fresh = await refreshCurrentUser();
        if (fresh) setUser(fresh);
        onPasswordChanged?.();
        setMessage({
          type: "success",
          text: hasPassword
            ? "Password changed successfully."
            : "Password set successfully. You can now sign in with your email and password.",
        });
      } else {
        setMessage({
          type: "error",
          text: result.error || "Unable to update password.",
        });
      }
    } catch (err) {
      setMessage({
        type: "error",
        text:
          err instanceof Error ? err.message : "Unable to update password.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-surface rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-1">
            {hasPassword ? "Change Password" : "Set Password"}
          </h2>
          <p className="text-gray-500 text-sm">
            {step === "request" &&
              (hasPassword
                ? "Enter your current password to request a verification code."
                : "Verify your email to set a password.")}
            {step === "otp" &&
              `Enter the 6-digit code sent to ${user.email}. It will expire in 10 minutes.`}
            {step === "reset" &&
              "Verification confirmed. Enter your new password below."}
          </p>
        </div>

        {message && (
          <div
            className={`mb-6 p-4 rounded-xl text-sm border ${
              message.type === "success"
                ? "bg-green-50 text-green-700 border-green-200"
                : "bg-red-50 text-red-700 border-red-200"
            }`}
          >
            {message.text}
          </div>
        )}

        {step === "request" && (
          <form onSubmit={handleRequestCode} className="space-y-6">
            {hasPassword && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Current password
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required={hasPassword}
                  className="w-full px-4 py-2.5 bg-surface border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-600/50 focus:border-brand-600 transition-all"
                />
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-gray-100">
              <Link
                href={backHref}
                className="text-brand-600 hover:text-brand-700 text-sm font-medium transition-colors"
              >
                {backLabel}
              </Link>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2.5 bg-brand-600 text-white font-medium rounded-xl hover:bg-brand-700 transition-all disabled:opacity-60"
              >
                {isSubmitting ? "Sending code..." : "Send verification code"}
              </button>
            </div>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={handleVerifyOtp} className="space-y-6">
            {devOtp && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-sm">
                <p className="font-medium">Development mode</p>
                <p>Your verification code is: {devOtp}</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Verification code
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                required
                autoFocus
                placeholder="000000"
                className="w-full px-4 py-2.5 bg-surface border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-600/50 focus:border-brand-600 transition-all tracking-[0.2em] text-center font-medium"
              />
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setStep("request");
                  setOtp("");
                  setMessage(null);
                }}
                className="text-brand-600 hover:text-brand-700 text-sm font-medium transition-colors"
              >
                Back
              </button>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={isSubmitting || resendSeconds > 0}
                  className="text-sm text-brand-600 hover:text-brand-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {resendSeconds > 0
                    ? `Resend in ${resendSeconds}s`
                    : "Resend code"}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 bg-brand-600 text-white font-medium rounded-xl hover:bg-brand-700 transition-all disabled:opacity-60"
                >
                  {isSubmitting ? "Verifying..." : "Verify code"}
                </button>
              </div>
            </div>
          </form>
        )}

        {step === "reset" && (
          <form onSubmit={handleChangePassword} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {hasPassword ? "New password" : "Password"}
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-4 py-2.5 bg-surface border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-600/50 focus:border-brand-600 transition-all"
              />
              <p className="text-xs text-gray-500 mt-1">
                Must be at least 8 characters.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Confirm {hasPassword ? "new password" : "password"}
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-4 py-2.5 bg-surface border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-600/50 focus:border-brand-600 transition-all"
              />
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setStep("otp");
                  setMessage(null);
                }}
                className="text-brand-600 hover:text-brand-700 text-sm font-medium transition-colors"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2.5 bg-brand-600 text-white font-medium rounded-xl hover:bg-brand-700 transition-all disabled:opacity-60"
              >
                {isSubmitting
                  ? hasPassword
                    ? "Updating..."
                    : "Setting..."
                  : hasPassword
                  ? "Update password"
                  : "Set password"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
