"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  getCurrentUser,
  getDisplayAvatarUrl,
  refreshCurrentUser,
  updateProfile,
  uploadAvatar,
  User,
} from "../lib/api";
import ThemeSetting from "./ThemeSetting";

interface ProfileEditorProps {
  changePasswordHref: string;
  onUserUpdate?: (user: User) => void;
}

export default function ProfileEditor({
  changePasswordHref,
  onUserUpdate,
}: ProfileEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initialUser = getCurrentUser();
  const [user, setUser] = useState<User | null>(initialUser);
  const [name, setName] = useState(initialUser?.name ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
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
    setName(current.name);
    getDisplayAvatarUrl(current.picture_url).then(setAvatarUrl);
  }, []);

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setMessage(null);

    try {
      const { path } = await uploadAvatar(file);
      const fresh = await refreshCurrentUser();
      if (fresh) {
        setUser(fresh);
        onUserUpdate?.(fresh);
        const url = await getDisplayAvatarUrl(path);
        setAvatarUrl(url);
      }
      setMessage({ type: "success", text: "Avatar updated successfully." });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Unable to upload avatar.",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      setMessage({ type: "error", text: "Name is required." });
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      await updateProfile({ name: trimmedName });
      const fresh = await refreshCurrentUser();
      if (fresh) {
        setUser(fresh);
        onUserUpdate?.(fresh);
      }
      setMessage({ type: "success", text: "Profile saved successfully." });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Unable to save profile.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!user) return null;

  const hasPassword = user.has_password ?? false;
  const providerLabel = hasPassword ? "Email account" : "Google account";
  const providerIcon = hasPassword ? (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ) : (
    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleFileChange}
        className="hidden"
      />

      {message && (
        <div
          className={`rounded-xl border p-3 text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-700 border-green-200"
              : "bg-red-50 text-red-700 border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {/*
        Identity and Appearance share the narrow column so neither stretches to
        a width it has no content for; the forms take the wide one. The original
        layout left a tall void under a centred identity card.
      */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-1">
          <section className="rounded-xl border border-hairline bg-surface p-4 shadow-tile">
            <div className="flex items-center gap-3.5">
              <button
                type="button"
                onClick={handleAvatarClick}
                disabled={isUploading}
                aria-label="Change profile photo"
                className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-brand-600 to-brand-700 text-3xl font-bold text-white ring-4 ring-brand-600/15 transition-all hover:ring-brand-600/40 disabled:opacity-60"
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                  Change
                </span>
              </button>
              <div className="min-w-0">
                <h2 className="font-display text-base font-semibold leading-tight tracking-[-0.01em] text-gray-900">
                  {user.name}
                </h2>
                <p className="mt-0.5 truncate text-xs text-gray-500">{user.email}</p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center rounded-full bg-brand-600/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-brand-700">
                {user.role}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                {providerIcon}
                {providerLabel}
              </span>
            </div>

            <button
              type="button"
              onClick={handleAvatarClick}
              disabled={isUploading}
              className="mt-3 w-full rounded-lg border border-brand-600/30 px-3 py-2 text-sm font-semibold text-brand-700 transition-all hover:bg-brand-50 disabled:opacity-60"
            >
              {isUploading ? "Uploading…" : "Upload new photo"}
            </button>
            <p className="mt-1.5 text-center font-mono text-[10px] uppercase tracking-[0.1em] text-gray-400">
              JPG · PNG · WebP · Max 2 MB
            </p>
          </section>

          <ThemeSetting />
        </div>

        <div className="space-y-3 lg:col-span-2">
          <section className="rounded-xl border border-hairline bg-surface p-4 shadow-tile">
            <h3 className="font-display text-base font-semibold tracking-[-0.01em] text-gray-900">
              Account Information
            </h3>
            <p className="mt-0.5 text-sm text-gray-500">
              Update your name and manage your account details.
            </p>

            <form onSubmit={handleSubmit} className="mt-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label
                    htmlFor="profile-name"
                    className="mb-1.5 block text-sm font-medium text-gray-700"
                  >
                    Full name
                  </label>
                  <input
                    id="profile-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-surface px-3 py-2 text-gray-700 transition-all focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/40"
                    placeholder="Your full name"
                  />
                </div>

                <div>
                  <label
                    htmlFor="profile-email"
                    className="mb-1.5 block text-sm font-medium text-gray-700"
                  >
                    Email address
                  </label>
                  <input
                    id="profile-email"
                    type="email"
                    value={user.email}
                    disabled
                    className="w-full cursor-not-allowed rounded-lg border border-gray-200 bg-gray-100 px-3 py-2 text-gray-500"
                  />
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs text-gray-400">Email cannot be changed.</p>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-[0_2px_8px_-1px_rgb(27_107_123_/_0.35)] transition-all hover:bg-brand-700 disabled:opacity-60"
                >
                  {isSaving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </section>

          <section className="rounded-xl border border-hairline bg-surface p-4 shadow-tile">
            <h3 className="font-display text-base font-semibold tracking-[-0.01em] text-gray-900">
              Security
            </h3>
            <p className="mt-0.5 text-sm text-gray-500">
              Manage how you sign in to your account.
            </p>

            <div className="mt-3 flex items-center justify-between gap-4 rounded-lg bg-subtle p-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800">
                  {hasPassword ? "Change password" : "Set password"}
                </p>
                <p className="text-xs text-gray-500">
                  {hasPassword
                    ? "Update the password you use to sign in."
                    : "Add a password so you can sign in without Google."}
                </p>
              </div>
              <Link
                href={changePasswordHref}
                className="shrink-0 rounded-lg border border-brand-600/30 px-3 py-2 text-sm font-semibold text-brand-700 transition-all hover:bg-brand-50"
              >
                {hasPassword ? "Change" : "Set password"}
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
