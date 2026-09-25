"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleExclamation,
  faCircleCheck,
  faUser,
  faEnvelope,
  faTag,
  faBolt,
  faChartColumn,
  faHeart,
} from "@fortawesome/free-solid-svg-icons";
import logo_white from "../../public/logo-white-no-bg.png";
import { EcgLoader } from "../components/EcgLoader";
import { RotatingWords, EcgSweep } from "../components/AuthShowcase";

const inputClass =
  "auth-input w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#7DD3D8]/30 focus:border-[#7DD3D8]/50 transition-all";
const iconInputClass = `${inputClass} pl-11`;

/**
 * Accounts aren't self-service: this page is a contact form that mails an
 * access request to the dev team, who validate the person and create the
 * account for them.
 */
export default function ContactUsPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("Requesting account activation");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, message }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Your message could not be sent. Please try again.");
        return;
      }
      setSent(true);
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex relative overflow-hidden bg-gradient-to-r from-[#0D7377] via-30% via-[#0A4A4D] to-[#050c0d]">
      {/* ───────── Shared abstract layer, spans the full screen ───────── */}
      <div className="absolute inset-0 opacity-[0.07] [mask-image:linear-gradient(90deg,black_0%,black_60%,transparent_100%)] pointer-events-none">
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="signupGridMinor" width="28" height="28" patternUnits="userSpaceOnUse">
              <path d="M28 0H0v28" fill="none" stroke="#ffffff" strokeWidth="0.5" />
            </pattern>
            <pattern id="signupGridMajor" width="140" height="140" patternUnits="userSpaceOnUse">
              <path d="M140 0H0v140" fill="none" stroke="#ffffff" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#signupGridMinor)" />
          <rect width="100%" height="100%" fill="url(#signupGridMajor)" />
        </svg>
      </div>

      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-white/[0.05] rounded-full blur-3xl -translate-y-1/3 -translate-x-1/4 animate-float-slow pointer-events-none" />
      <div className="absolute top-1/3 left-1/3 w-[350px] h-[350px] bg-[#7DD3D8]/10 rounded-full blur-3xl animate-float-medium pointer-events-none" />
      <div
        className="absolute bottom-0 right-[15%] w-[450px] h-[450px] bg-brand-900/30 rounded-full blur-3xl animate-float-slow pointer-events-none"
        style={{ animationDelay: "-3s" }}
      />
      <div className="absolute bottom-[10%] right-0 w-[350px] h-[350px] bg-black/20 rounded-full blur-3xl translate-x-1/4 pointer-events-none" />

      {/* ───────── Left panel — brand story ───────── */}
      <div className="hidden lg:flex lg:w-1/2 relative">
        <div className="relative z-10 flex flex-col w-full px-14 xl:px-20 py-10 xl:py-14 text-white">
          <div className="flex-1 flex flex-col justify-center max-w-xl py-10 -mt-20">
            <div className="mb-12 opacity-0 animate-fade-in-up">
              <Image src={logo_white} alt="iCare++ Logo" className="h-14 w-auto drop-shadow-md" priority />
            </div>

            <p className="opacity-0 animate-fade-in-up [animation-delay:100ms] text-[11px] font-semibold uppercase tracking-[0.28em] text-[#7DD3D8] mb-4">
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
                  description: "Scenarios that adjust to each student's performance",
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
                  <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-white/10 border border-white/10 backdrop-blur-md flex items-center justify-center text-[#7DD3D8]">
                    <FontAwesomeIcon icon={feature.icon} className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-medium text-white leading-tight mb-0.5">{feature.title}</p>
                    <p className="text-sm text-white/60 leading-relaxed">{feature.description}</p>
                  </div>
                </li>
              ))}
            </ul>
            <EcgSweep />
          </div>
        </div>
      </div>

      {/* ───────── Right panel — glass form card ───────── */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-5 sm:px-8 py-12 relative">
        <div className="relative z-10 w-full max-w-[560px] -mt-8 animate-fade-in-up">
          {/* Mobile header */}
          <div className="lg:hidden flex flex-col items-center mb-6">
            <div className="p-3.5 bg-white/10 border border-white/10 backdrop-blur-md rounded-2xl mb-3">
              <Image src={logo_white} alt="iCare++ Logo" className="h-12 w-auto" priority />
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
                <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#7DD3D8]/15 text-[#7DD3D8]">
                  <FontAwesomeIcon icon={faCircleCheck} className="h-6 w-6" />
                </span>
                <h2 className="text-xl font-semibold text-white mb-2">Request sent</h2>
                <p className="text-sm text-white/60 leading-relaxed">
                  Please wait for the team to validate your account. We&apos;ll reply to{" "}
                  <span className="text-white/80">{email}</span> once it&apos;s ready.
                </p>
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

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
                    <div className="sm:col-span-2">
                      <label htmlFor="name" className="block text-sm font-medium text-white/70 mb-1.5">
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
                      <label htmlFor="email" className="block text-sm font-medium text-white/70 mb-1.5">
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
                          required
                          maxLength={254}
                          className={iconInputClass}
                          placeholder="you@email.com"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="subject" className="block text-sm font-medium text-white/70 mb-1.5">
                      Subject <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <FontAwesomeIcon icon={faTag} className="h-4 w-4 text-white/35" />
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

                  <div>
                    <label htmlFor="message" className="block text-sm font-medium text-white/70 mb-1.5">
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
                    className="w-full bg-[#2B9095] hover:bg-[#19797D] text-white border border-white/20 py-3 px-6 rounded-xl font-semibold transition-all duration-200 shadow-lg shadow-black/20 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
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
                <Link href="/login" className="text-[#7DD3D8] hover:text-white font-medium transition-colors">
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