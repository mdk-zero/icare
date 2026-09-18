"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCamera,
  faEnvelope,
  faIdCard,
  faKey,
  faLayerGroup,
  faLock,
  faShieldHalved,
} from "@fortawesome/free-solid-svg-icons";
import {
  fetchFacultySections,
  getCurrentUser,
  getDisplayAvatarUrl,
  refreshCurrentUser,
  updateProfile,
  uploadAvatar,
  User,
} from "../lib/api";
import { usePageData } from "../lib/use-page-data";
import { initials } from "./Avatar";
import { EcgLoader } from "./EcgLoader";
import ThemeSetting from "./ThemeSetting";
import { toast } from "./Toast";

interface ProfileEditorProps {
  changePasswordHref: string;
  onUserUpdate?: (user: User) => void;
}

const ROLE_LABEL: Record<User["role"], string> = {
  admin: "Administrator",
  faculty: "Faculty",
  student: "Student",
};

/** The sidebar's teal, so the credential band reads as part of the chrome. */
const BAND_GRADIENT = "linear-gradient(120deg, #0b3d3d 0%, #0f5252 45%, #146464 100%)";

/*
 * Monitor paper: a faint 16px grid behind the band, the way an ECG strip is
 * printed. Two gradients, one per axis.
 */
const PAPER_GRID =
  "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)";

const STEP_MS = 45;
const step = (index: number) => ({ animationDelay: `${index * STEP_MS}ms` });

function GoogleMark({ className = "" }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

/**
 * A trace running along the band's lower edge — the app's bedside-monitor
 * motif. Left out on phones, where the stacked band puts text in its path.
 */
function BandTrace() {
  return (
    <svg
      className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-24 w-full sm:block"
      viewBox="0 0 1200 96"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d="M0 70 L560 70 L590 70 L604 58 L618 88 L632 28 L648 80 L662 70 L900 70 L914 62 L926 82 L938 46 L952 76 L964 70 L1200 70"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.16"
        strokeWidth="1.5"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function SectionCard({
  icon,
  title,
  description,
  children,
  className = "",
  style,
}: {
  icon: typeof faIdCard;
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <section
      className={`animate-rise rounded-2xl border border-hairline bg-surface p-5 shadow-tile ${className}`}
      style={style}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600/10 text-brand-600">
          <FontAwesomeIcon icon={icon} className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold tracking-[-0.01em] text-gray-900">
            {title}
          </h3>
          <p className="mt-0.5 text-sm text-gray-500">{description}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default function ProfileEditor({
  changePasswordHref,
  onUserUpdate,
}: ProfileEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Read after mount: localStorage doesn't exist during the server render, so
  // reading it in the initial state would render differently on each side.
  const [user, setUser] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const current = getCurrentUser();
    if (!current) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUser(current);
    setName(current.name);
    getDisplayAvatarUrl(current.picture_url).then(setAvatarUrl);
  }, []);

  // The same cache entry the analytics page reads, so this is usually free.
  const { data: sections } = usePageData(
    user?.role === "faculty" ? "faculty:sections" : null,
    fetchFacultySections,
  );

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const { path } = await uploadAvatar(file);
      const fresh = await refreshCurrentUser();
      if (fresh) {
        setUser(fresh);
        onUserUpdate?.(fresh);
        setAvatarUrl(await getDisplayAvatarUrl(path));
        setAvatarFailed(false);
      }
      toast("Profile photo updated.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Unable to upload photo.", "error");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      toast("Name is required.", "error");
      return;
    }

    setIsSaving(true);
    try {
      await updateProfile({ name: trimmedName });
      const fresh = await refreshCurrentUser();
      if (fresh) {
        setUser(fresh);
        setName(fresh.name);
        onUserUpdate?.(fresh);
      }
      toast("Profile saved.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Unable to save profile.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  if (!user) return null;

  const hasPassword = user.has_password ?? false;
  const dirty = name.trim() !== user.name;
  const showPhoto = Boolean(avatarUrl) && !avatarFailed;
  const pickPhoto = () => fileInputRef.current?.click();

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Credential band: who is signed in, at a glance. */}
      <section
        className="animate-rise relative overflow-hidden rounded-2xl text-white shadow-[0_18px_40px_-20px_rgba(4,32,31,0.55)]"
        style={{ background: BAND_GRADIENT }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: PAPER_GRID, backgroundSize: "16px 16px" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-[#5eead4]/10 blur-3xl"
        />
        <BandTrace />

        <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-7">
          <div className="relative shrink-0 self-start sm:self-center">
            <button
              type="button"
              onClick={pickPhoto}
              disabled={isUploading}
              aria-label="Change profile photo"
              className="group relative block h-24 w-24 overflow-hidden rounded-full bg-gradient-to-br from-brand-500 to-brand-800 ring-4 ring-white/15 transition-all hover:ring-white/35 disabled:cursor-wait"
            >
              {showPhoto ? (
                <img
                  src={avatarUrl!}
                  alt=""
                  onError={() => setAvatarFailed(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="font-display flex h-full w-full items-center justify-center text-3xl font-semibold tracking-[-0.02em]">
                  {initials(user.name)}
                </span>
              )}
              <span
                className={`absolute inset-0 flex items-center justify-center bg-black/45 transition-opacity ${
                  isUploading ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                }`}
              >
                {isUploading ? (
                  <EcgLoader size="md" className="text-white" />
                ) : (
                  <span className="text-xs font-medium">Change</span>
                )}
              </span>
            </button>
            <span
              aria-hidden
              className="absolute -bottom-0.5 -right-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-white text-brand-700 shadow-md ring-2 ring-[#0f5252]"
            >
              <FontAwesomeIcon icon={faCamera} className="h-3.5 w-3.5" />
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#9fd8d6]">
              iCARE++ · {ROLE_LABEL[user.role]}
            </p>
            <h2 className="font-display mt-1 truncate text-2xl font-semibold tracking-[-0.02em] sm:text-[28px]">
              {user.name}
            </h2>
            <p className="mt-1 flex min-w-0 items-center gap-1.5 text-sm text-white/70">
              <FontAwesomeIcon icon={faEnvelope} className="h-3 w-3 shrink-0" />
              <span className="truncate">{user.email}</span>
            </p>

            <div className="mt-4 flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white/90 ring-1 ring-white/15">
                {hasPassword ? (
                  <FontAwesomeIcon icon={faKey} className="h-3 w-3" />
                ) : (
                  <GoogleMark className="h-3 w-3" />
                )}
                {hasPassword ? "Email & password" : "Google account"}
              </span>
              {user.role === "faculty" &&
                (sections === undefined ? null : sections.length === 0 ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-xs text-white/60 ring-1 ring-white/10">
                    <FontAwesomeIcon icon={faLayerGroup} className="h-3 w-3" />
                    No sections assigned
                  </span>
                ) : (
                  sections.map((section) => (
                    <span
                      key={section.id}
                      className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white/90 ring-1 ring-white/15"
                    >
                      <FontAwesomeIcon icon={faLayerGroup} className="h-3 w-3 text-[#9fd8d6]" />
                      {section.name}
                    </span>
                  ))
                ))}
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
            <button
              type="button"
              onClick={pickPhoto}
              disabled={isUploading}
              className="inline-flex items-center gap-2 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-brand-700 shadow-sm transition-colors hover:bg-brand-50 disabled:opacity-70"
            >
              {isUploading ? (
                <EcgLoader className="text-brand-600" />
              ) : (
                <FontAwesomeIcon icon={faCamera} className="h-3.5 w-3.5" />
              )}
              {isUploading ? "Uploading…" : "Change photo"}
            </button>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/45">
              JPG · PNG · WebP · Max 2 MB
            </p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
        <SectionCard
          icon={faIdCard}
          title="Personal details"
          description="How your name appears to students and colleagues."
          className="lg:col-span-2"
          style={step(1)}
        >
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                  maxLength={120}
                  autoComplete="name"
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-surface px-3 py-2.5 text-gray-800 transition-all focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30"
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
                <div className="relative">
                  <input
                    id="profile-email"
                    type="email"
                    value={user.email}
                    readOnly
                    aria-describedby="profile-email-hint"
                    className="w-full cursor-default rounded-lg border border-hairline bg-subtle py-2.5 pl-3 pr-9 text-gray-500 focus:outline-none"
                  />
                  <FontAwesomeIcon
                    icon={faLock}
                    className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
                  />
                </div>
                <p id="profile-email-hint" className="mt-1.5 text-xs text-gray-400">
                  Your sign-in email can&apos;t be changed.
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-hairline pt-4">
              {dirty && (
                <span className="mr-auto inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  Unsaved changes
                </span>
              )}
              {dirty && !isSaving && (
                <button
                  type="button"
                  onClick={() => setName(user.name)}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-subtle hover:text-gray-800"
                >
                  Discard
                </button>
              )}
              <button
                type="submit"
                disabled={!dirty || isSaving}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-[0_2px_8px_-1px_rgb(27_107_123_/_0.35)] transition-all hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
              >
                {isSaving && <EcgLoader />}
                {isSaving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </SectionCard>

        <SectionCard
          icon={faShieldHalved}
          title="Sign-in & security"
          description="How you get into iCARE++."
          style={step(2)}
        >
          <dl className="divide-y divide-hairline">
            <div className="flex items-center justify-between gap-3 pb-3.5">
              <dt className="text-sm text-gray-500">Sign-in method</dt>
              <dd className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-800">
                {hasPassword ? (
                  <FontAwesomeIcon icon={faKey} className="h-3 w-3 text-gray-400" />
                ) : (
                  <GoogleMark className="h-3 w-3 text-gray-400" />
                )}
                {hasPassword ? "Email & password" : "Google"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 py-3.5">
              <dt className="text-sm text-gray-500">Password</dt>
              <dd>
                {hasPassword ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Set
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                    Not set
                  </span>
                )}
              </dd>
            </div>
          </dl>
          <p className="mt-1 text-xs text-gray-500">
            {hasPassword
              ? "Change it any time — you'll confirm with a code sent to your email."
              : "Add a password so you can also sign in without Google."}
          </p>
          <Link
            href={changePasswordHref}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-brand-600/30 px-3 py-2 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50"
          >
            <FontAwesomeIcon icon={faKey} className="h-3.5 w-3.5" />
            {hasPassword ? "Change password" : "Set a password"}
          </Link>
        </SectionCard>
      </div>

      <ThemeSetting style={step(3)} />
    </div>
  );
}
