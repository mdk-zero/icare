"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLock, faCircleExclamation, faCircleNotch } from "@fortawesome/free-solid-svg-icons";
import { getCurrentUser, refreshCurrentUser, User } from "../lib/api";

function useAuthUser(): User | null {
  const [user] = useState<User | null>(() => {
    if (typeof window === "undefined") return null;
    return getCurrentUser();
  });
  return user;
}

export default function ChangePasswordPage() {
  const router = useRouter();
  const user = useAuthUser();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!user) {
      router.push("/login");
      return;
    }

    if (!user.force_password_change) {
      router.push(user.role === "student" ? "/dashboard" : "/faculty");
    }
  }, [router, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/users/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || "Unable to change password");
        return;
      }

      await refreshCurrentUser();
      router.push(user?.role === "student" ? "/dashboard" : "/faculty");
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user || !user.force_password_change) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-canvas">
      <div className="w-full max-w-md bg-surface rounded-2xl shadow-xl border border-hairline p-8">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-brand-600/10 rounded-xl flex items-center justify-center mx-auto mb-4">
            <FontAwesomeIcon icon={faLock} className="w-6 h-6 text-brand-600" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Update your password</h1>
          <p className="text-sm text-gray-500">
            Your account was created with a temporary password. Please set a new password to continue.
          </p>
        </div>

        {error && (
          <div className="mb-5 p-3.5 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm flex items-start gap-3">
            <FontAwesomeIcon icon={faCircleExclamation} className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
              New Password <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-4 py-3 bg-subtle border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600 transition-all"
                placeholder="Enter new password"
              />
            </div>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1.5">
              Confirm New Password <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-4 py-3 bg-subtle border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600 transition-all"
                placeholder="Confirm new password"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(e) => setShowPassword(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-600/30 cursor-pointer"
            />
            <span className="text-sm text-gray-500 group-hover:text-gray-600 transition-colors">
              Show password
            </span>
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white py-3 px-6 rounded-xl font-medium transition-all duration-200 shadow-lg shadow-brand-600/20 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <FontAwesomeIcon icon={faCircleNotch} className="animate-spin h-5 w-5" />
                Updating...
              </>
            ) : (
              "Set Password"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
