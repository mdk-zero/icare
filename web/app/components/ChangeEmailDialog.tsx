"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEnvelope, faTimes } from "@fortawesome/free-solid-svg-icons";
import { apiFetch } from "../lib/api";

const INPUT =
  "w-full px-4 py-3 bg-surface border border-gray-400 rounded-xl text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 text-sm";

interface Props {
  userId: string;
  currentEmail: string;
  /** Whose email this is, for the copy: "your" when changing your own. */
  whose: "your" | "their";
  onClose: () => void;
  onChanged: (newEmail: string) => void;
}

/**
 * Two steps, one dialog: enter the new address and send it a code, then enter
 * the code. Render it outside any <form> — it has forms of its own — and its
 * submits stop here, so they never reach a form further up the React tree. The change only happens on the second step (POST then PUT on
 * /api/users/:id/email), so closing half-way leaves the account untouched.
 */
export default function ChangeEmailDialog({ userId, currentEmail, whose, onClose, onChanged }: Props) {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const call = async (method: "POST" | "PUT", body: object) => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/users/${userId}/email`, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "Something went wrong");
        return null;
      }
      return json;
    } catch {
      setError("Something went wrong. Check your connection and try again.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const sendCode = async () => {
    const json = await call("POST", { email });
    if (!json) return;
    setSentTo(String(json.new_email));
    setMessage(typeof json.message === "string" ? json.message : null);
    setDevOtp(typeof json.devOtp === "string" ? json.devOtp : null);
    setCode("");
  };

  const confirm = async () => {
    const json = await call("PUT", { code });
    if (!json) return;
    onChanged((json.user as { email: string }).email);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-email-title"
        className="w-full max-w-md rounded-xl border border-hairline bg-surface p-5 shadow-overlay space-y-4"
      >
        <div className="flex items-center justify-between">
          <h3 id="change-email-title" className="flex items-center gap-2 font-semibold text-gray-800">
            <FontAwesomeIcon icon={faEnvelope} className="h-4 w-4 text-brand-600" />
            Change {whose} email
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <FontAwesomeIcon icon={faTimes} className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm text-gray-600">
          Current: <span className="font-medium text-gray-800">{currentEmail}</span>
        </p>

        {sentTo === null ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void sendCode();
            }}
          >
            <div>
              <label htmlFor="new-email" className="mb-1.5 block text-sm font-bold text-gray-800">
                New email
              </label>
              <input
                id="new-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={INPUT}
                placeholder="name@example.com"
              />
              <p className="mt-1.5 text-xs text-gray-500">
                We&apos;ll send a 6-digit code to the new address. The change happens only once that code is entered.
              </p>
            </div>
            {error && <p className="text-sm text-rose-700">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !email.trim()}
                className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {busy ? "Sending…" : "Send code"}
              </button>
            </div>
          </form>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void confirm();
            }}
          >
            <p className="text-sm text-gray-600">{message ?? `A code was sent to ${sentTo}.`}</p>
            {devOtp && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 font-mono text-sm text-amber-800">Dev code: {devOtp}</p>
            )}
            <div>
              <label htmlFor="email-code" className="mb-1.5 block text-sm font-bold text-gray-800">
                Code sent to {sentTo}
              </label>
              <input
                id="email-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className={`${INPUT} font-mono tracking-[0.4em] text-lg`}
                placeholder="000000"
              />
              {whose === "their" && (
                <p className="mt-1.5 text-xs text-gray-500">Ask the account holder to read you the code from that inbox.</p>
              )}
            </div>
            {error && <p className="text-sm text-rose-700">{error}</p>}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setSentTo(null);
                  setError(null);
                }}
                className="text-sm text-brand-600 hover:text-brand-700"
              >
                Use a different email
              </button>
              <button
                type="submit"
                disabled={busy || code.length !== 6}
                className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {busy ? "Confirming…" : "Confirm change"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
