"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleExclamation,
  faEnvelope,
  faLock,
  faEye,
  faEyeSlash,
  faCheck,
  faCircleNotch,
  faBolt,
  faChartColumn,
  faHeart,
} from "@fortawesome/free-solid-svg-icons";
import logo_white from "../../public/logo-white-no-bg.png";

/** Shared with login/signup so the three auth surfaces read as one screen. */
const FIELD_CLASS =
  "w-full py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#7DD3D8]/30 focus:border-[#7DD3D8]/50 transition-all";
const SUBMIT_CLASS =
  "w-full bg-[#2B9095] hover:bg-[#19797D] text-white border border-white/20 py-3 px-6 rounded-xl font-semibold transition-all duration-200 shadow-lg shadow-black/20 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<"email" | "code" | "reset" | "success">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = (await res.json()) as { error?: string; message?: string };

      if (!res.ok) {
        if (data.error === "google_no_password") {
          setError(
            "This account uses Google sign-in and has no password set. Please sign in with Google.",
          );
        } else {
          setError(data.error ?? "Unable to send reset code.");
        }
        setIsLoading(false);
        return;
      }

      setMessage(data.message ?? "If this account exists, a reset code has been sent.");
      setStep("code");
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password/check-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });

      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        setError(data.error ?? "Invalid or expired reset code.");
        setIsLoading(false);
        return;
      }

      setStep("reset");
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp, newPassword }),
      });

      const data = (await res.json()) as { error?: string; message?: string };

      if (!res.ok) {
        setError(data.error ?? "Unable to reset password.");
        setIsLoading(false);
        return;
      }

      setStep("success");
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
            <pattern id="forgotGridMinor" width="28" height="28" patternUnits="userSpaceOnUse">
              <path d="M28 0H0v28" fill="none" stroke="#ffffff" strokeWidth="0.5" />
            </pattern>
            <pattern id="forgotGridMajor" width="140" height="140" patternUnits="userSpaceOnUse">
              <path d="M140 0H0v140" fill="none" stroke="#ffffff" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#forgotGridMinor)" />
          <rect width="100%" height="100%" fill="url(#forgotGridMajor)" />
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
          <div className="flex-1 flex flex-col justify-center max-w-xl py-10">
            <div className="mb-12 opacity-0 animate-fade-in-up">
              <Image
                src={logo_white}
                alt="iCare++ Logo"
                className="h-14 w-auto drop-shadow-md"
                priority
              />
            </div>

            <p className="opacity-0 animate-fade-in-up [animation-delay:100ms] text-[11px] font-semibold uppercase tracking-[0.28em] text-[#7DD3D8] mb-4">
              Clinical Competency Platform
            </p>
            <h2 className="opacity-0 animate-fade-in-up [animation-delay:200ms] text-4xl xl:text-[2.75rem] font-semibold tracking-tight leading-[1.12] mb-5">
              Back to where
              <br />
              you left off.
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
          </div>
        </div>
      </div>

      {/* ───────── Right panel — glass form card, floating on the dark side ───────── */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-5 sm:px-8 py-12 relative">
        <div className="relative z-10 w-full max-w-[460px] animate-fade-in-up">
          {/* Mobile header */}
          <div className="lg:hidden flex flex-col items-center mb-6">
            <div className="mb-3">
              <Image src={logo_white} alt="iCare++ Logo" className="h-12 w-auto" priority />
            </div>
          </div>

          {/* Reset card */}
          <div className="bg-white/[0.06] backdrop-blur-2xl rounded-3xl border border-white/30 shadow-2xl shadow-black/40 p-7 sm:p-8">
            <div className="mb-6">
              <h1 className="text-3xl font-semibold text-white mb-1 tracking-tight">
                {step === "success" ? "Password updated" : "Reset your password"}
              </h1>
              <p className="text-sm text-white/50">
                {step === "success"
                  ? "You can now sign in with your new password."
                  : step === "code"
                    ? "Enter the 6-digit code sent to your email."
                    : step === "reset"
                      ? "Choose a new password for your account."
                      : "Enter your email and we'll send you a reset code."}
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-3 p-3.5 mb-5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-sm animate-shake">
                <FontAwesomeIcon
                  icon={faCircleExclamation}
                  className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5"
                />
                <span>{error}</span>
              </div>
            )}

            {message && step === "code" && (
              <div className="p-3.5 mb-5 bg-[#7DD3D8]/10 border border-[#7DD3D8]/20 rounded-xl text-[#7DD3D8] text-sm">
                {message}
              </div>
            )}

            {step === "email" && (
              <form onSubmit={handleRequestCode} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-white/70 mb-1.5">
                    Email Address <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <FontAwesomeIcon icon={faEnvelope} className="h-5 w-5 text-white/35" />
                    </div>
                    <input
                      type="email"
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className={`${FIELD_CLASS} pl-11 pr-4`}
                      placeholder="name@icare.edu"
                    />
                  </div>
                </div>

                <button type="submit" disabled={isLoading} className={SUBMIT_CLASS}>
                  {isLoading ? (
                    <>
                      <FontAwesomeIcon icon={faCircleNotch} className="animate-spin h-5 w-5" />
                      Sending code...
                    </>
                  ) : (
                    "Send reset code"
                  )}
                </button>
              </form>
            )}

            {step === "code" && (
              <form onSubmit={handleVerifyCode} className="space-y-4">
                <div>
                  <label htmlFor="otp" className="block text-sm font-medium text-white/70 mb-1.5">
                    Reset Code <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    id="otp"
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                    required
                    autoFocus
                    className={`${FIELD_CLASS} px-4 text-center font-semibold tracking-[0.4em] text-lg`}
                    placeholder="000000"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading || otp.length < 6}
                  className={SUBMIT_CLASS}
                >
                  {isLoading ? (
                    <>
                      <FontAwesomeIcon icon={faCircleNotch} className="animate-spin h-5 w-5" />
                      Verifying...
                    </>
                  ) : (
                    "Verify code"
                  )}
                </button>
              </form>
            )}

            {step === "reset" && (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <label
                    htmlFor="newPassword"
                    className="block text-sm font-medium text-white/70 mb-1.5"
                  >
                    New Password <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <FontAwesomeIcon icon={faLock} className="h-5 w-5 text-white/35" />
                    </div>
                    <input
                      type={showPassword ? "text" : "password"}
                      id="newPassword"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      autoFocus
                      minLength={8}
                      className={`${FIELD_CLASS} pl-11 pr-11`}
                      placeholder="At least 8 characters"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-white/35 hover:text-white/60 transition-colors"
                    >
                      {showPassword ? (
                        <FontAwesomeIcon icon={faEyeSlash} className="h-5 w-5" />
                      ) : (
                        <FontAwesomeIcon icon={faEye} className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="block text-sm font-medium text-white/70 mb-1.5"
                  >
                    Confirm Password <span className="text-red-400">*</span>
                  </label>
                  <input
                    type={showPassword ? "text" : "password"}
                    id="confirmPassword"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    className={`${FIELD_CLASS} px-4`}
                    placeholder="Re-enter your password"
                  />
                </div>

                <button type="submit" disabled={isLoading} className={SUBMIT_CLASS}>
                  {isLoading ? (
                    <>
                      <FontAwesomeIcon icon={faCircleNotch} className="animate-spin h-5 w-5" />
                      Resetting...
                    </>
                  ) : (
                    "Reset password"
                  )}
                </button>
              </form>
            )}

            {step === "success" && (
              <div className="text-center py-2">
                <div className="w-14 h-14 rounded-full bg-[#7DD3D8]/10 border border-[#7DD3D8]/20 flex items-center justify-center mx-auto mb-5">
                  <FontAwesomeIcon icon={faCheck} className="w-7 h-7 text-[#7DD3D8]" />
                </div>
                <Link href="/login" className={`${SUBMIT_CLASS} inline-flex`}>
                  Go to sign in
                </Link>
              </div>
            )}

            {step !== "success" && step !== "reset" && (
              <div className="mt-5 text-center">
                <Link
                  href="/login"
                  className="text-sm text-[#7DD3D8] hover:text-white font-medium transition-colors"
                >
                  Back to sign in
                </Link>
              </div>
            )}
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
