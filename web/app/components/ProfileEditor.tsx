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
    <div className="max-w-5xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column — identity card */}
        <div className="lg:col-span-1">
          <div className="bg-surface rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
            <div className="relative inline-block mb-4">
              <button
                type="button"
                onClick={handleAvatarClick}
                disabled={isUploading}
                className="relative w-28 h-28 rounded-full bg-gradient-to-br from-brand-600 to-brand-700 flex items-center justify-center text-white text-4xl font-bold overflow-hidden ring-4 ring-brand-600/10 hover:ring-brand-600/30 transition-all disabled:opacity-60"
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  user.name.charAt(0).toUpperCase()
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white text-xs opacity-0 hover:opacity-100 transition-opacity">
                  Change
                </span>
              </button>
              <button
                type="button"
                onClick={handleAvatarClick}
                disabled={isUploading}
                className="absolute bottom-1 right-1 w-8 h-8 bg-surface rounded-full shadow-md flex items-center justify-center text-brand-600 hover:bg-gray-50 transition-colors disabled:opacity-60"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleFileChange}
              className="hidden"
            />

            <h2 className="text-xl font-bold text-gray-900 mb-1">{user.name}</h2>
            <p className="text-sm text-gray-500 mb-4">{user.email}</p>

            <div className="flex items-center justify-center gap-2 mb-6">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-brand-600/10 text-brand-600 capitalize">
                {user.role}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                {providerIcon}
                {providerLabel}
              </span>
            </div>

            <button
              type="button"
              onClick={handleAvatarClick}
              disabled={isUploading}
              className="w-full px-4 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-xl hover:bg-brand-700 transition-all disabled:opacity-60"
            >
              {isUploading ? "Uploading..." : "Upload new photo"}
            </button>
            <p className="text-xs text-gray-400 mt-2">
              JPG, PNG, WebP, or GIF. Max 2 MB.
            </p>
          </div>
        </div>

        {/* Right column — forms */}
        <div className="lg:col-span-2 space-y-6">
          {message && (
            <div
              className={`p-4 rounded-xl text-sm border ${
                message.type === "success"
                  ? "bg-green-50 text-green-700 border-green-200"
                  : "bg-red-50 text-red-700 border-red-200"
              }`}
            >
              {message.text}
            </div>
          )}

          <div className="bg-surface rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Account Information
              </h3>
              <p className="text-sm text-gray-500">
                Update your name and manage your account details.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Full name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-surface border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-600/50 focus:border-brand-600 transition-all"
                    placeholder="Your full name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email address
                  </label>
                  <input
                    type="email"
                    value={user.email}
                    disabled
                    className="w-full px-4 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-gray-500 cursor-not-allowed"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Email cannot be changed.
                  </p>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 bg-brand-600 text-white font-medium rounded-xl hover:bg-brand-700 transition-all disabled:opacity-60"
                >
                  {isSaving ? "Saving..." : "Save changes"}
                </button>
              </div>
            </form>
          </div>

          <div className="bg-surface rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Security
              </h3>
              <p className="text-sm text-gray-500">
                Manage how you sign in to your account.
              </p>
            </div>

            <div className="flex items-center justify-between py-4 border-t border-gray-100">
              <div>
                <p className="font-medium text-gray-800">
                  {hasPassword ? "Change password" : "Set password"}
                </p>
                <p className="text-sm text-gray-500">
                  {hasPassword
                    ? "Update the password you use to sign in."
                    : "Add a password so you can sign in without Google."}
                </p>
              </div>
              <Link
                href={changePasswordHref}
                className="px-4 py-2 text-sm font-medium text-brand-600 border border-brand-600 rounded-xl hover:bg-brand-600 hover:text-white transition-all"
              >
                {hasPassword ? "Change" : "Set password"}
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <ThemeSetting />
      </div>
    </div>
  );
}
