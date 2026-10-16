"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUserPlus,
  faCheck,
  faTriangleExclamation,
  faEnvelope,
} from "@fortawesome/free-solid-svg-icons";
import { apiFetch, moveStudentToTeam } from "../../lib/api";
import { loadingToast } from "../../components/Toast";

const inputClass =
  "mt-1.5 block w-full rounded-lg border border-gray-200 bg-surface px-3 py-2 text-gray-800 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30";

/**
 * Registers one late enrollee straight into a section, and into one of its
 * groups when picked. The account gets a temporary password that is emailed
 * to the student; it is also shown here once, in case the email doesn't land.
 */
export default function RegisterStudentModal({
  sectionId,
  sectionName,
  groups,
  onClose,
  onRegistered,
  endpoint = "/api/admin/users",
}: {
  sectionId: string;
  sectionName: string;
  groups: { id: string; name: string }[];
  onClose: () => void;
  onRegistered: () => void;
  /** Where the account is made: the dean's users API, or an instructor's students API. */
  endpoint?: string;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [sex, setSex] = useState("");
  const [groupId, setGroupId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{
    name: string;
    email: string;
    group: string | null;
    password: string;
    warning?: string;
    emailFailed: boolean;
  } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const progress = loadingToast(`Registering ${name.trim()}…`);
    const res = await apiFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: name.trim(),
        email: email.trim(),
        role: "student",
        section_id: sectionId,
        sex,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      user?: { id: string; email: string };
      password?: string;
      warning?: string;
      error?: string;
    };
    if (!res.ok || !json.user) {
      setSaving(false);
      progress.error(json.error ?? "Unable to register the student.");
      setError(json.error ?? "Unable to register the student.");
      return;
    }

    let warning = json.warning;
    if (groupId) {
      const moved = await moveStudentToTeam(json.user.id, groupId);
      if ("error" in moved) {
        warning = [warning, `Registered, but not added to the group: ${moved.error}`].filter(Boolean).join(" ");
      }
    }
    setSaving(false);
    progress.success(`Registered ${name.trim()}`);
    // The server warns only when the invitation email didn't go out.
    setDone({
      name: name.trim(),
      email: json.user.email,
      group: groups.find((g) => g.id === groupId)?.name ?? null,
      password: json.password ?? "",
      warning,
      emailFailed: Boolean(json.warning),
    });
    onRegistered();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={saving ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="register-title"
        className="w-full max-w-md overflow-hidden rounded-xl border border-hairline bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <div className="p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <FontAwesomeIcon icon={faCheck} className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h3 id="register-title" className="font-display text-lg font-semibold text-gray-900">
                  Student registered
                </h3>
                <p className="text-sm text-gray-600 break-words">
                  {done.name} is now in {sectionName}
                  {done.group ? `, ${done.group}` : ""}.
                </p>
              </div>
            </div>

            <p className="mt-4 flex items-start gap-2 rounded-lg bg-subtle px-3 py-2.5 text-sm text-gray-600">
              <FontAwesomeIcon icon={faEnvelope} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
              <span className="min-w-0 [overflow-wrap:anywhere]">
                {done.emailFailed ? (
                  <>
                    The invitation to <span className="font-medium text-gray-900">{done.email}</span>
                    {" didn't send. Share the password below."}
                  </>
                ) : (
                  <>
                    Invitation sent to <span className="font-medium text-gray-900">{done.email}</span>.
                  </>
                )}
              </span>
            </p>

            {done.warning && !done.emailFailed && (
              <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {done.warning}
              </p>
            )}
            {/* The emailed invitation carries the password; it's shown here only
                when that email couldn't be sent, to pass on by hand. */}
            {done.emailFailed && done.password && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                <p className="text-xs text-amber-800">Temporary password, shown once</p>
                <code className="mt-0.5 block select-all font-mono text-base font-semibold text-gray-900">{done.password}</code>
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setName("");
                  setEmail("");
                  setSex("");
                  setGroupId("");
                  setError(null);
                  setDone(null);
                }}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-subtle hover:text-gray-900"
              >
                Register another
              </button>
              <button
                type="button"
                autoFocus
                onClick={onClose}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="p-5">
            <h3 id="register-title" className="font-display text-lg font-semibold text-gray-900">
              Register a student
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Adds a late enrollee to {sectionName}. They get their sign-in details by email.
            </p>

            {error && (
              <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            )}

            <label className="mt-4 block text-sm font-medium text-gray-700">
              Full name
              <input
                autoFocus
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Juan dela Cruz"
                className={inputClass}
              />
            </label>
            <label className="mt-3 block text-sm font-medium text-gray-700">
              Email
              <input
                type="email"
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="23-12345@g.batstate-u.edu.ph"
                className={inputClass}
              />
            </label>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-gray-700">
                Sex <span className="font-normal text-gray-400">(optional)</span>
                <select value={sex} onChange={(e) => setSex(e.target.value)} className={inputClass}>
                  <option value="">Not specified</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </select>
              </label>
              {groups.length > 0 && (
                <label className="block text-sm font-medium text-gray-700">
                  Group <span className="font-normal text-gray-400">(optional)</span>
                  <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={inputClass}>
                    <option value="">Not in a group</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
              >
                <FontAwesomeIcon icon={faUserPlus} className="h-3.5 w-3.5" />
                {saving ? "Registering…" : "Register"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
