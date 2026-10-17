"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleCheck,
  faEnvelope,
  faLifeRing,
  faLightbulb,
  faPaperPlane,
} from "@fortawesome/free-solid-svg-icons";
import PageHeader from "./PageHeader";
import { EcgLoader } from "./EcgLoader";
import { toast } from "./Toast";
import { SupportImagePicker, useSupportImages } from "./SupportImagePicker";
import { apiFetch, getCurrentUser } from "../lib/api";
import { SUPPORT_LIMITS, SUPPORT_TOPICS, type SupportTopic } from "../lib/support";

const TIPS = [
  "What you were trying to do, what happened, and what you expected instead.",
  "The page and the student, course, or Patient Case it involves.",
  "Any error message, word for word, or a screenshot of it.",
];

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-surface px-3 py-2.5 text-gray-800 transition-all focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30";

/**
 * Help & Support for the web portals: writes to the iCARE++ team, who get
 * the sender's account details and any images with it, and answer from the
 * Admin portal by email.
 */
export default function HelpCenter({ contactEmail }: { contactEmail: string }) {
  // The portal layouts render nothing until the session is known, so this
  // only ever runs in the browser, with the user already mirrored.
  const [email] = useState(() => getCurrentUser()?.email ?? null);
  const [topic, setTopic] = useState<SupportTopic | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const images = useSupportImages();

  const canSend =
    !!topic &&
    subject.trim().length > 0 &&
    message.trim().length > 0 &&
    !sending &&
    !images.uploading &&
    !images.failed;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    setSending(true);
    try {
      const res = await apiFetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          subject,
          message,
          attachments: images.attachments,
          client: "Web portal",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Your message could not be sent.");
      setSent(true);
      setTopic(null);
      setSubject("");
      setMessage("");
      images.clear();
      toast("Message sent to the iCARE++ team.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Your message could not be sent.", "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <PageHeader
        badge={{ icon: <FontAwesomeIcon icon={faLifeRing} />, label: "Support" }}
        title="Help & Support"
        subtitle="Report a problem, ask how something works, or suggest an improvement. Your message goes straight to the iCARE++ team."
      />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <section className="animate-rise rounded-2xl border border-hairline bg-surface p-5 shadow-tile lg:col-span-2">
          {sent ? (
            <div className="flex flex-col items-start gap-3 py-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <FontAwesomeIcon icon={faCircleCheck} className="h-5 w-5" />
              </span>
              <h2 className="font-display text-lg font-semibold tracking-[-0.01em] text-gray-900">
                Message sent
              </h2>
              <p className="max-w-[52ch] text-sm leading-relaxed text-gray-600">
                The team will reply to {email ? <strong>{email}</strong> : "your account email"}. A
                copy of your message is on its way there too.
              </p>
              <button
                type="button"
                onClick={() => setSent(false)}
                className="mt-1 rounded-lg border border-gray-200 bg-surface px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50"
              >
                Write Another Message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <fieldset>
                <legend className="mb-2 block text-sm font-medium text-gray-700">
                  What is this about?
                </legend>
                <div className="flex flex-wrap gap-2">
                  {SUPPORT_TOPICS.map((t) => {
                    const active = topic === t.value;
                    return (
                      <label
                        key={t.value}
                        className={`cursor-pointer rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-600 ${
                          active
                            ? "bg-brand-600 text-white ring-brand-600"
                            : "bg-surface text-gray-700 ring-gray-200 hover:bg-gray-50 hover:ring-gray-300"
                        }`}
                      >
                        <input
                          type="radio"
                          name="topic"
                          value={t.value}
                          checked={active}
                          onChange={() => setTopic(t.value)}
                          className="sr-only"
                        />
                        {t.label}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div>
                <label htmlFor="support-subject" className="mb-1.5 block text-sm font-medium text-gray-700">
                  Subject
                </label>
                <input
                  id="support-subject"
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={SUPPORT_LIMITS.subject}
                  placeholder="A few words that sum it up"
                  className={inputClass}
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <label htmlFor="support-message" className="block text-sm font-medium text-gray-700">
                    Message
                  </label>
                  <span className="font-mono text-[11px] tabular-nums text-gray-400">
                    {message.length}/{SUPPORT_LIMITS.message}
                  </span>
                </div>
                <textarea
                  id="support-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onPaste={images.onPaste}
                  maxLength={SUPPORT_LIMITS.message}
                  rows={8}
                  placeholder="Tell us what's going on"
                  className={`${inputClass} resize-y leading-relaxed`}
                />
              </div>

              <div>
                <p className="mb-1.5 block text-sm font-medium text-gray-700">
                  Images <span className="font-normal text-gray-400">(optional)</span>
                </p>
                <SupportImagePicker images={images} disabled={sending} />
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-hairline pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-gray-500">
                  {email ? (
                    <>
                      We&apos;ll reply to <span className="font-medium text-gray-700">{email}</span>.
                    </>
                  ) : (
                    "We'll reply to your account email."
                  )}
                </p>
                <button
                  type="submit"
                  disabled={!canSend}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-[0_2px_8px_-1px_rgb(27_107_123_/_0.35)] transition-all hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                >
                  {sending ? (
                    <EcgLoader className="text-white" />
                  ) : (
                    <FontAwesomeIcon icon={faPaperPlane} className="h-3.5 w-3.5" />
                  )}
                  {sending ? "Sending…" : images.uploading ? "Uploading images…" : "Send Message"}
                </button>
              </div>
            </form>
          )}
        </section>

        <aside className="animate-rise space-y-4" style={{ animationDelay: "60ms" }}>
          <section className="rounded-2xl border border-hairline bg-surface p-5 shadow-tile">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <FontAwesomeIcon icon={faLightbulb} className="h-3.5 w-3.5" />
              </span>
              <h2 className="font-display text-base font-semibold tracking-[-0.01em] text-gray-900">
                Helpful to include
              </h2>
            </div>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-gray-600">
              {TIPS.map((tip) => (
                <li key={tip} className="flex gap-2">
                  <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gray-400" />
                  {tip}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-gray-500">
              Your name, role, and email are attached for you. Never send a password.
            </p>
          </section>

          <section className="rounded-2xl border border-hairline bg-surface p-5 shadow-tile">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600/10 text-brand-600">
                <FontAwesomeIcon icon={faEnvelope} className="h-3.5 w-3.5" />
              </span>
              <h2 className="font-display text-base font-semibold tracking-[-0.01em] text-gray-900">
                Prefer email?
              </h2>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              Write to{" "}
              <a
                href={`mailto:${contactEmail}`}
                className="font-medium text-brand-600 underline-offset-2 hover:underline"
              >
                {contactEmail}
              </a>{" "}
              from any address.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
