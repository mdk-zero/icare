"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleExclamation,
  faHourglassHalf,
  faCheck,
  faPaperPlane,
  faUser,
  faEnvelope,
  faPen,
  faVenusMars,
  faBolt,
  faChartColumn,
  faHeart,
} from "@fortawesome/free-solid-svg-icons";
import logo_white from "../../public/logo-white-no-bg.png";
import logo_colour from "../../public/logo-no-bg.png";
import { EcgLoader } from "../components/EcgLoader";
import { DriftingKit, RotatingWords } from "../components/AuthShowcase";
import { GoogleGlyph } from "../components/GoogleSignInButton";

const inputClass =
  "auth-input w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-(--auth-accent)/30 focus:border-(--auth-accent)/50 transition-all";
const iconInputClass = `${inputClass} pl-11`;

/*
 * The "request sent" confirmation: the badge pops in, the ring and check draw
 * themselves, then two ripples spread out. Kept beside the markup like
 * DriftingKit's rules; the global reduced-motion block settles it instantly.
 */
const sentStyles = `
.sent-badge { animation: sentPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
@keyframes sentPop {
  from { transform: scale(0.4); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
.sent-circle, .sent-check { stroke-dasharray: 1; stroke-dashoffset: 1; }
.sent-circle { animation: sentDraw 0.45s ease-out 0.15s forwards; }
.sent-check { animation: sentDraw 0.3s ease-out 0.5s forwards; }
@keyframes sentDraw { to { stroke-dashoffset: 0; } }
.sent-ring { opacity: 0; animation: sentRipple 1.1s ease-out 0.6s; }
.sent-ring-late { animation-delay: 0.85s; }
@keyframes sentRipple {
  from { transform: scale(1); opacity: 0.6; }
  to { transform: scale(2.1); opacity: 0; }
}
`;

/**
 * Accounts aren't self-service: this page is a contact form that mails an
 * access request to the dev team, who validate the person and create the
 * account for them.
 */
export default function ContactUsPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("Requesting account creation");
  const [sex, setSex] = useState<"" | "female" | "male">("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  // Set when this email already has a request waiting; it replaces the form.
  const [notice, setNotice] = useState("");
  const [sent, setSent] = useState(false);
  const [followUp, setFollowUp] = useState("");
  const [followUpState, setFollowUpState] = useState<"idle" | "sending" | "sent">("idle");
  const [followUpError, setFollowUpError] = useState("");
  // Set when the person came here from "Continue with Google": the email is
  // then the verified Google address, locked, and the request carries the
  // Google account so it can sign in once the account exists.
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [googleNote, setGoogleNote] = useState("");

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("google");
    if (!token) return;
    // The token is single-purpose; keep it out of history and reloads.
    window.history.replaceState(null, "", window.location.pathname);
    let cancelled = false;
    fetch("/api/auth/google/pending", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          email?: string;
          name?: string;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !data.email) {
          setGoogleNote(data.error ?? "That Google sign-in has expired. Type your email instead.");
          return;
        }
        setGoogleEmail(data.email);
        setEmail(data.email);
        setName((current) => current || data.name || "");
      })
      .catch(() => {
        if (!cancelled) setGoogleNote("Couldn't load your Google account. Type your email instead.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dropGoogleEmail = () => {
    setGoogleEmail(null);
    setEmail("");
    void fetch("/api/auth/google/pending", { method: "DELETE" });
  };

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!sex) {
      setError("Select your sex.");
      return;
    }
    setIsLoading(true);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, sex, subject, message }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
        const text = data.error ?? "Your message could not be sent. Please try again.";
        if (data.code === "already_requested") setNotice(text);
        else setError(text);
        return;
      }
      setSent(true);
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const sendFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setFollowUpError("");
    setFollowUpState("sending");
    try {
      const res = await fetch("/api/contact/follow-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, message: followUp }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setFollowUpError(data.error ?? "Your follow-up could not be sent. Please try again.");
        setFollowUpState("idle");
        return;
      }
      setFollowUpState("sent");
    } catch {
      setFollowUpError("Connection error. Please try again.");
      setFollowUpState("idle");
    }
  };

  const tryAnotherEmail = () => {
    if (googleEmail) dropGoogleEmail();
    setNotice("");
    setFollowUp("");
    setFollowUpState("idle");
    setFollowUpError("");
  };

  return (
    <div className="auth-screen min-h-screen flex relative overflow-hidden bg-gradient-to-r from-(--auth-bg-1) via-30% via-(--auth-bg-2) to-(--auth-bg-3)">
      {/* ───────── Shared abstract layer, spans the full screen ───────── */}
      <div className="absolute inset-0 opacity-[0.07] [mask-image:linear-gradient(90deg,black_0%,black_60%,transparent_100%)] pointer-events-none">
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="signupGridMinor" width="28" height="28" patternUnits="userSpaceOnUse">
              <path d="M28 0H0v28" fill="none" stroke="var(--color-white)" strokeWidth="0.5" />
            </pattern>
            <pattern id="signupGridMajor" width="140" height="140" patternUnits="userSpaceOnUse">
              <path d="M140 0H0v140" fill="none" stroke="var(--color-white)" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#signupGridMinor)" />
          <rect width="100%" height="100%" fill="url(#signupGridMajor)" />
        </svg>
      </div>

      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-white/[0.05] rounded-full blur-3xl -translate-y-1/3 -translate-x-1/4 animate-float-slow pointer-events-none" />
      <div className="absolute top-1/3 left-1/3 w-[350px] h-[350px] bg-(--auth-accent)/10 rounded-full blur-3xl animate-float-medium pointer-events-none" />
      <div
        className="absolute bottom-0 right-[15%] w-[450px] h-[450px] bg-brand-900/30 rounded-full blur-3xl animate-float-slow pointer-events-none"
        style={{ animationDelay: "-3s" }}
      />
      <div className="absolute bottom-[10%] right-0 w-[350px] h-[350px] bg-black/20 rounded-full blur-3xl translate-x-1/4 pointer-events-none" />

      <DriftingKit />

      {/* ───────── Left panel — brand story ───────── */}
      <div className="hidden lg:flex lg:w-1/2 relative">
        <div className="relative z-10 flex flex-col w-full px-14 xl:px-20 py-10 xl:py-14 text-white">
          <div className="flex-1 flex flex-col justify-center max-w-xl py-10 -mt-20">
            <div className="mb-12 opacity-0 animate-fade-in-up">
              <Image src={logo_colour}
                alt="iCare++ Logo"
                className="h-14 w-auto drop-shadow-md dark:hidden"
                priority
              />
              <Image src={logo_white}
                alt="iCare++ Logo"
                className="h-14 w-auto drop-shadow-md hidden dark:block"
                priority
              />
            </div>

            <p className="opacity-0 animate-fade-in-up [animation-delay:100ms] text-[11px] font-semibold uppercase tracking-[0.28em] text-(--auth-accent) mb-4">
              Clinical Competency Platform
            </p>
            <h2 className="opacity-0 animate-fade-in-up [animation-delay:200ms] text-4xl xl:text-[2.75rem] font-semibold tracking-tight leading-[1.12] mb-5">
              Join the future of
              <br />
              <RotatingWords
                words={["nursing education.", "clinical practice.", "patient care."]}
              />
            </h2>
            <p className="opacity-0 animate-fade-in-up [animation-delay:300ms] text-base text-white/70 leading-relaxed mb-10">
              A scalable machine learning–driven clinical competency assessment and adaptive
              learning system for nursing students.
            </p>

            <ul className="space-y-5">
              {[
                {
                  title: "Adaptive learning paths",
                  description: "Patient cases that adjust to each student's performance",
                  delay: "400ms",
                  icon: faBolt,
                },
                {
                  title: "ML-driven assessment",
                  description: "Objective, consistent competency scoring on every attempt",
                  delay: "500ms",
                  icon: faChartColumn,
                },
                {
                  title: "Realistic simulation",
                  description: "EHR charts, live vitals, and patient encounters",
                  delay: "600ms",
                  icon: faHeart,
                },
              ].map((feature) => (
                <li
                  key={feature.title}
                  className="opacity-0 animate-fade-in-up flex items-start gap-4"
                  style={{ animationDelay: feature.delay }}
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-white/10 border border-white/10 backdrop-blur-md flex items-center justify-center text-(--auth-accent)">
                    <FontAwesomeIcon icon={feature.icon} className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-medium text-white leading-tight mb-0.5">{feature.title}</p>
                    <p className="text-sm text-white/60 leading-relaxed">{feature.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* ───────── Right panel — glass form card ───────── */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-5 sm:px-8 py-12 relative">
        <div className="relative z-10 w-full max-w-[560px] -mt-8 animate-fade-in-up">
          {/* Mobile header */}
          <div className="lg:hidden flex flex-col items-center mb-6">
            <div className="p-3.5 bg-white/10 border border-white/10 backdrop-blur-md rounded-2xl mb-3">
              <Image src={logo_colour} alt="iCare++ Logo" className="h-12 w-auto dark:hidden" priority />
              <Image src={logo_white} alt="iCare++ Logo" className="h-12 w-auto hidden dark:block" priority />
            </div>
          </div>

          {/* Sign up card */}
          <div className="bg-white/[0.06] backdrop-blur-2xl rounded-3xl border border-white/30 shadow-2xl shadow-black/40 p-5 sm:p-8">
            <div className="mb-6">
              <h1 className="text-3xl font-semibold text-white mb-1 tracking-tight">Contact us</h1>
              <p className="text-sm text-white/50">
                Accounts are created by the iCARE++ team. Send a request and we&apos;ll set you up.
              </p>
            </div>

            {sent ? (
              <div className="py-6 text-center" role="status">
                <style>{sentStyles}</style>
                <span className="sent-badge relative mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-(--auth-accent)/15 text-(--auth-accent)">
                  <span
                    aria-hidden
                    className="sent-ring absolute inset-0 rounded-full border-2 border-(--auth-accent)"
                  />
                  <span
                    aria-hidden
                    className="sent-ring sent-ring-late absolute inset-0 rounded-full border border-(--auth-accent)"
                  />
                  <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    className="h-7 w-7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.25"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle
                      className="sent-circle"
                      cx="12"
                      cy="12"
                      r="10"
                      pathLength={1}
                      transform="rotate(-90 12 12)"
                    />
                    <path className="sent-check" d="M7.5 12.5l3 3 6-6.5" pathLength={1} />
                  </svg>
                </span>
                <h2 className="opacity-0 animate-fade-in-up [animation-delay:650ms] text-xl font-semibold text-white mb-2">
                  Request sent
                </h2>
                <p className="opacity-0 animate-fade-in-up [animation-delay:750ms] text-sm text-white/60 leading-relaxed">
                  We&apos;ve emailed a confirmation to{" "}
                  <span className="text-white/80">{email}</span>. Please wait for the team to
                  validate your account; we&apos;ll write again once it&apos;s ready.
                </p>
              </div>
            ) : notice ? (
              <div className="py-6 text-center" role="status">
                <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-(--auth-accent)/15 text-(--auth-accent) animate-fade-in-up">
                  <FontAwesomeIcon icon={faHourglassHalf} className="h-6 w-6" />
                </span>
                <h2 className="opacity-0 animate-fade-in-up [animation-delay:100ms] text-xl font-semibold text-white mb-2">
                  Request already submitted
                </h2>
                <p className="opacity-0 animate-fade-in-up [animation-delay:200ms] text-sm text-white/60 leading-relaxed">
                  <span className="text-white/80">{email}</span>{" "}
                  already has a request waiting
                  for review. The iCARE++ team will get back to you once it&apos;s been checked.
                </p>

                {followUpState === "sent" ? (
                  <p className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-(--auth-accent)/30 bg-(--auth-accent)/10 px-4 py-3 text-sm text-white/85 animate-fade-in-up">
                    <FontAwesomeIcon icon={faCheck} className="h-4 w-4 text-(--auth-accent)" />
                    Follow-up sent. The team has been reminded.
                  </p>
                ) : (
                  <form
                    onSubmit={sendFollowUp}
                    className="opacity-0 animate-fade-in-up [animation-delay:300ms] mt-5 text-left"
                  >
                    <label htmlFor="follow-up" className="block text-sm font-medium text-white/70 mb-1.5">
                      Haven&apos;t heard back? Send a follow-up
                    </label>
                    <textarea
                      id="follow-up"
                      value={followUp}
                      onChange={(e) => setFollowUp(e.target.value)}
                      required
                      maxLength={2000}
                      rows={3}
                      className={`${inputClass} resize-none`}
                      placeholder="Add anything the team should know, or ask about your request."
                    />
                    {followUpError && (
                      <p className="mt-2 flex items-start gap-2 text-sm text-red-300">
                        <FontAwesomeIcon icon={faCircleExclamation} className="mt-0.5 h-4 w-4 text-red-400" />
                        {followUpError}
                      </p>
                    )}
                    <button
                      type="submit"
                      disabled={followUpState === "sending" || !followUp.trim()}
                      className="mt-3 w-full bg-[#2B9095] hover:bg-[#19797D] text-[#fff] border border-[#ffffff33] py-2.5 px-6 rounded-xl text-sm font-semibold transition-all duration-200 shadow-lg shadow-black/20 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <FontAwesomeIcon icon={faPaperPlane} className="h-3.5 w-3.5" />
                      {followUpState === "sending" ? "Sending…" : "Send follow-up"}
                    </button>
                  </form>
                )}

                <button
                  type="button"
                  onClick={tryAnotherEmail}
                  className="opacity-0 animate-fade-in-up [animation-delay:400ms] mt-4 text-sm font-medium text-(--auth-accent) hover:underline cursor-pointer"
                >
                  Use a different email
                </button>
              </div>
            ) : (
              <>
                {error && (
                  <div className="flex items-start gap-3 p-3.5 mb-5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-sm animate-shake">
                    <FontAwesomeIcon
                      icon={faCircleExclamation}
                      className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5"
                    />
                    <span>{error}</span>
                  </div>
                )}

                {googleNote && !error && (
                  <div className="flex items-start gap-3 p-3.5 mb-5 bg-white/5 border border-white/10 rounded-xl text-white/70 text-sm">
                    <GoogleGlyph className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>{googleNote}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
                    <div className="sm:col-span-2">
                      <label
                        htmlFor="name"
                        className="block text-sm font-medium text-white/70 mb-1.5"
                      >
                        Name <span className="text-red-400">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <FontAwesomeIcon icon={faUser} className="h-4 w-4 text-white/35" />
                        </div>
                        <input
                          type="text"
                          id="name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          required
                          maxLength={120}
                          className={iconInputClass}
                          placeholder="Your name"
                        />
                      </div>
                    </div>
                    <div className="sm:col-span-3">
                      <label
                        htmlFor="email"
                        className="block text-sm font-medium text-white/70 mb-1.5"
                      >
                        Email <span className="text-red-400">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <FontAwesomeIcon icon={faEnvelope} className="h-4 w-4 text-white/35" />
                        </div>
                        <input
                          type="email"
                          id="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          readOnly={googleEmail !== null}
                          required
                          maxLength={254}
                          className={`${iconInputClass} ${googleEmail ? "cursor-default text-white/80" : ""}`}
                          placeholder="you@email.com"
                        />
                      </div>
                      {googleEmail && (
                        <p className="mt-1.5 flex items-center justify-between gap-2 text-xs text-white/50">
                          <span className="inline-flex items-center gap-1.5">
                            <GoogleGlyph className="h-3 w-3" />
                            Verified with Google
                          </span>
                          <button
                            type="button"
                            onClick={dropGoogleEmail}
                            className="font-medium text-(--auth-accent) hover:underline cursor-pointer"
                          >
                            Use a different email
                          </button>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
                    <div className="sm:col-span-3">
                      <label
                        htmlFor="subject"
                        className="block text-sm font-medium text-white/70 mb-1.5"
                      >
                        Subject <span className="text-red-400">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <FontAwesomeIcon icon={faPen} className="h-4 w-4 text-white/35" />
                        </div>
                        <input
                          type="text"
                          id="subject"
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                          required
                          maxLength={150}
                          className={iconInputClass}
                          placeholder="What's this about?"
                        />
                      </div>
                    </div>
                    <fieldset className="sm:col-span-2">
                      <legend className="block text-sm font-medium text-white/70 mb-1.5">
                        Sex <span className="text-red-400">*</span>
                      </legend>
                      {/* Radios styled as a two-way toggle: a native select's
                          option list ignores the auth theme. */}
                      <div className="auth-input flex h-[50px] items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
                        <FontAwesomeIcon icon={faVenusMars} className="mx-2.5 h-4 w-4 shrink-0 text-white/35" />
                        {(["female", "male"] as const).map((value) => (
                          <label
                            key={value}
                            className={`flex h-full flex-1 cursor-pointer items-center justify-center rounded-lg text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-(--auth-accent)/40 ${
                              sex === value
                                ? "bg-[#2B9095] font-semibold text-[#fff]"
                                : "text-white/60 hover:bg-white/5 hover:text-white"
                            }`}
                          >
                            <input
                              type="radio"
                              name="sex"
                              value={value}
                              checked={sex === value}
                              onChange={() => {
                                setSex(value);
                                setError("");
                              }}
                              className="sr-only"
                            />
                            {value === "female" ? "Female" : "Male"}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  </div>

                  <div>
                    <label
                      htmlFor="message"
                      className="block text-sm font-medium text-white/70 mb-1.5"
                    >
                      Message <span className="text-red-400">*</span>
                    </label>
                    <textarea
                      id="message"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      required
                      maxLength={4000}
                      rows={5}
                      className={`${inputClass} resize-none`}
                      placeholder="Tell us who you are, your school, and the access you need."
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-[#2B9095] hover:bg-[#19797D] text-[#fff] border border-[#ffffff33] py-3 px-6 rounded-xl font-semibold transition-all duration-200 shadow-lg shadow-black/20 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isLoading ? (
                      <>
                        <EcgLoader />
                        Sending...
                      </>
                    ) : (
                      "Send request"
                    )}
                  </button>
                </form>
              </>
            )}

            <div className="mt-6 text-center">
              <p className="text-sm text-white/50">
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="text-(--auth-accent) hover:text-white font-medium transition-colors"
                >
                  Sign in
                </Link>
              </p>
            </div>
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-white/30 mt-5">
            &copy; 2026 iCARE++. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
