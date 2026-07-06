"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import logo from "../../public/logo-no-bg.png";
import logo_white from "../../public/logo-white-no-bg.png";

function MedicalCross({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="16" y="4" width="8" height="32" rx="2" fill="currentColor" />
      <rect x="4" y="16" width="32" height="8" rx="2" fill="currentColor" />
    </svg>
  );
}

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
    <div className="min-h-screen flex">
      {/* Left panel — brand */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-[#0D7377] via-[#0A5C5F] to-[#084A4D]">
        <div className="absolute inset-0 opacity-[0.05]">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="crossPattern" width="80" height="80" patternUnits="userSpaceOnUse">
                <path d="M36 28h8v12h12v8h-12v12h-8v-12h-12v-8h12z" fill="#ffffff" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#crossPattern)" />
          </svg>
        </div>

        <MedicalCross className="absolute top-[12%] left-[10%] w-16 h-16 text-white/8 animate-float-slow" />
        <MedicalCross className="absolute top-[30%] right-[12%] w-10 h-10 text-white/10 animate-float-medium" />
        <MedicalCross className="absolute bottom-[20%] left-[15%] w-12 h-12 text-white/6 animate-float-slow" />
        <MedicalCross className="absolute bottom-[38%] right-[8%] w-8 h-8 text-white/8 animate-float-medium" />

        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-white/5 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4" />

        <div className="relative z-10 flex flex-col justify-center items-center w-full px-14 xl:px-20 text-white">
          <div className="mb-8 p-6 bg-white/10 backdrop-blur-md rounded-3xl border border-white/10 shadow-2xl shadow-black/10">
            <Image
              src={logo_white}
              alt="iCare++ Logo"
              className="h-24 w-auto drop-shadow-md"
              priority
            />
          </div>

          <h2 className="text-4xl xl:text-5xl font-semibold tracking-tight mb-5">iCARE++</h2>
          <p className="text-lg xl:text-xl text-white/85 text-center max-w-md leading-relaxed">
            A Scalable Machine Learning-Driven Clinical Competency Assessment and Adaptive Learning
            System for Nursing Students
          </p>
        </div>
      </div>

      {/* Right panel — forgot password form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-5 sm:px-8 py-12 bg-[#F8FBFC] relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full opacity-40">
          <div className="absolute top-[-10%] right-[-10%] w-[350px] h-[350px] bg-[#7DD3D8]/20 rounded-full blur-3xl" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[300px] h-[300px] bg-[#0D7377]/10 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 w-full max-w-[520px] animate-fade-in-up">
          {/* Mobile header */}
          <div className="lg:hidden flex flex-col items-center mb-6">
            <div className="p-3.5 bg-[#E8F6F5] rounded-2xl shadow-md mb-3">
              <Image src={logo} alt="iCare++ Logo" className="h-12 w-auto" priority />
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-[#E2EBEC] shadow-xl shadow-[#0D7377]/[0.05] p-7 sm:p-9">
            <div className="mb-6">
              <h1 className="text-xl font-semibold text-[#0F172A] mb-1 tracking-tight">
                {step === "success" ? "Password updated" : "Reset your password"}
              </h1>
              <p className="text-sm text-[#64748B]">
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
              <div className="flex items-start gap-3 p-3.5 mb-5 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm animate-shake">
                <svg
                  className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>{error}</span>
              </div>
            )}

            {message && step === "code" && (
              <div className="p-3.5 mb-5 bg-[#F0F9FA] border border-[#D0EBEA] rounded-xl text-[#0F4C5C] text-sm">
                {message}
              </div>
            )}

            {step === "email" && (
              <form onSubmit={handleRequestCode} className="space-y-4">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-[#334155] mb-1.5"
                  >
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <svg
                        className="h-5 w-5 text-[#94A3B8]"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"
                        />
                      </svg>
                    </div>
                    <input
                      type="email"
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full pl-11 pr-4 py-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#0D7377]/20 focus:border-[#0D7377] transition-all"
                      placeholder="name@icare.edu"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-[#0D7377] hover:bg-[#0A5C5F] text-white py-3 px-6 rounded-xl font-medium transition-all duration-200 shadow-lg shadow-[#0D7377]/20 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
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
                  <label htmlFor="otp" className="block text-sm font-medium text-[#334155] mb-1.5">
                    Reset Code <span className="text-red-500">*</span>
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
                    className="w-full px-4 py-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#0D7377]/20 focus:border-[#0D7377] transition-all tracking-[0.2em] text-center font-medium"
                    placeholder="000000"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading || otp.length < 6}
                  className="w-full bg-[#0D7377] hover:bg-[#0A5C5F] text-white py-3 px-6 rounded-xl font-medium transition-all duration-200 shadow-lg shadow-[#0D7377]/20 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
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
                    className="block text-sm font-medium text-[#334155] mb-1.5"
                  >
                    New Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <svg
                        className="h-5 w-5 text-[#94A3B8]"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                        />
                      </svg>
                    </div>
                    <input
                      type={showPassword ? "text" : "password"}
                      id="newPassword"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      autoFocus
                      minLength={8}
                      className="w-full pl-11 pr-11 py-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#0D7377]/20 focus:border-[#0D7377] transition-all"
                      placeholder="At least 8 characters"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#94A3B8] hover:text-[#64748B] transition-colors"
                    >
                      {showPassword ? (
                        <svg
                          className="h-5 w-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                          />
                        </svg>
                      ) : (
                        <svg
                          className="h-5 w-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="block text-sm font-medium text-[#334155] mb-1.5"
                  >
                    Confirm Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    type={showPassword ? "text" : "password"}
                    id="confirmPassword"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    className="w-full px-4 py-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#0D7377]/20 focus:border-[#0D7377] transition-all"
                    placeholder="Re-enter your password"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-[#0D7377] hover:bg-[#0A5C5F] text-white py-3 px-6 rounded-xl font-medium transition-all duration-200 shadow-lg shadow-[#0D7377]/20 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Resetting...
                    </>
                  ) : (
                    "Reset password"
                  )}
                </button>
              </form>
            )}

            {step === "success" && (
              <div className="text-center py-4">
                <div className="w-14 h-14 bg-[#F0F9FA] rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg
                    className="w-7 h-7 text-[#0D7377]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center w-full bg-[#0D7377] hover:bg-[#0A5C5F] text-white py-3 px-6 rounded-xl font-medium transition-all duration-200 shadow-lg shadow-[#0D7377]/20"
                >
                  Go to sign in
                </Link>
              </div>
            )}

            {step !== "success" && step !== "reset" && (
              <div className="mt-5 text-center">
                <Link
                  href="/login"
                  className="text-sm text-[#0D7377] hover:text-[#0A5C5F] font-medium transition-colors"
                >
                  Back to sign in
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
