"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import Image from "next/image";
import { GoogleOAuthProvider, GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { login, isAuthenticated, getCurrentUser, User, logAuditAction } from "../lib/api";
import logo_white from "../../public/logo-white-no-bg.png";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [googleMounted, setGoogleMounted] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const [googleButtonWidth, setGoogleButtonWidth] = useState(0);

  useEffect(() => {
    setGoogleMounted(true);
  }, []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const redirectAfterAuth = useCallback(
    (user: User) => {
      if (user.force_password_change) {
        router.push("/change-password");
        return;
      }
      router.push(
        user.role === "student" ? "/dashboard" : user.role === "faculty" ? "/faculty" : "/admin",
      );
    },
    [router],
  );

  useLayoutEffect(() => {
    const updateWidth = () => {
      if (googleButtonRef.current) {
        setGoogleButtonWidth(googleButtonRef.current.offsetWidth);
      }
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  useEffect(() => {
    if (isAuthenticated()) {
      const user = getCurrentUser();
      if (user) {
        redirectAfterAuth(user);
      }
    }
  }, [redirectAfterAuth]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const result = await login(email, password);

      if (result) {
        if (result.user.role === "faculty") {
          void logAuditAction({
            faculty_id: result.user.id,
            faculty_name: result.user.name,
            tab: "Authentication",
            action: "Login",
            details: `Logged in via email and password`,
            metadata: { method: "credentials" },
          });
        }
        redirectAfterAuth(result.user);
      } else {
        setError("Invalid email or password");
      }
    } catch {
      setError("Connection error. Please make sure the backend is running.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSuccess = async (response: CredentialResponse) => {
    if (!response.credential) {
      setError("Google sign-in did not return a credential");
      return;
    }
    setError("");
    setIsGoogleLoading(true);
    try {
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_token: response.credential }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Google sign-in failed");
        setIsGoogleLoading(false);
        return;
      }
      const data = (await res.json()) as {
        user?: User;
        needsRoleSelection?: boolean;
      };

      if (data.needsRoleSelection) {
        router.push("/signup/role");
        return;
      }

      const user = data.user as User;
      localStorage.setItem("icare_user", JSON.stringify(user));
      localStorage.setItem("icare_token", "logged_in");
      if (user.role === "faculty") {
        void logAuditAction({
          faculty_id: user.id,
          faculty_name: user.name,
          tab: "Authentication",
          action: "Login",
          details: `Logged in via Google`,
          metadata: { method: "google" },
        });
      }
      redirectAfterAuth(user);
    } catch {
      setError("Google sign-in failed. Please try again.");
      setIsGoogleLoading(false);
    }
  };

  const handleGoogleError = () => {
    setError("Google sign-in was cancelled");
  };

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <div className="min-h-screen flex relative overflow-hidden bg-gradient-to-r from-[#0D7377] via-30% via-[#0A4A4D] to-[#050c0d]">
        {/* ───────── Shared abstract layer, spans the full screen ───────── */}
        <div className="absolute inset-0 opacity-[0.07] [mask-image:linear-gradient(90deg,black_0%,black_60%,transparent_100%)] pointer-events-none">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="loginGridMinor" width="28" height="28" patternUnits="userSpaceOnUse">
                <path d="M28 0H0v28" fill="none" stroke="#ffffff" strokeWidth="0.5" />
              </pattern>
              <pattern id="loginGridMajor" width="140" height="140" patternUnits="userSpaceOnUse">
                <path d="M140 0H0v140" fill="none" stroke="#ffffff" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#loginGridMinor)" />
            <rect width="100%" height="100%" fill="url(#loginGridMajor)" />
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
                Sharpen clinical judgment,
                <br />
                one scenario at a time.
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
                    icon: (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    ),
                  },
                  {
                    title: "ML-driven assessment",
                    description: "Objective, consistent competency scoring on every attempt",
                    delay: "500ms",
                    icon: (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                      />
                    ),
                  },
                  {
                    title: "Realistic simulation",
                    description: "EHR charts, live vitals, and patient encounters",
                    delay: "600ms",
                    icon: (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                      />
                    ),
                  },
                ].map((feature) => (
                  <li
                    key={feature.title}
                    className="opacity-0 animate-fade-in-up flex items-start gap-4"
                    style={{ animationDelay: feature.delay }}
                  >
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-white/10 border border-white/10 backdrop-blur-md flex items-center justify-center text-[#7DD3D8]">
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        {feature.icon}
                      </svg>
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
          <div className="relative z-10 w-full max-w-[460px] mt-17 animate-fade-in-up">
            {/* Mobile header */}
            <div className="lg:hidden flex flex-col items-center mb-6">
              <div className="p-3.5 bg-white/10 border border-white/10 backdrop-blur-md rounded-2xl mb-3">
                <Image src={logo_white} alt="iCare++ Logo" className="h-12 w-auto" priority />
              </div>
            </div>

            {/* Login card */}
            <div className="bg-white/[0.06] backdrop-blur-2xl rounded-3xl border border-white/30 shadow-2xl shadow-black/40 p-7 sm:p-8">
              <div className="mb-6">
                <h1 className="text-3xl font-semibold text-white mb-1 tracking-tight">
                  Welcome back, caregiver
                </h1>
                <p className="text-sm text-white/50">
                  Sign in to continue your journey in nursing excellence
                </p>
              </div>

              {/* Error banner */}
              {error && (
                <div className="flex items-start gap-3 p-3.5 mb-5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-sm animate-shake">
                  <svg
                    className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5"
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

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-white/70 mb-1.5">
                    Email Address <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <svg
                        className="h-5 w-5 text-white/35"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                    <input
                      type="email"
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#7DD3D8]/30 focus:border-[#7DD3D8]/50 transition-all"
                      placeholder="name@icare.edu"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-white/70 mb-1.5"
                  >
                    Password <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <svg
                        className="h-5 w-5 text-white/35"
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
                      id="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full pl-11 pr-11 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#7DD3D8]/30 focus:border-[#7DD3D8]/50 transition-all"
                      placeholder="Enter your password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-white/35 hover:text-white/60 transition-colors"
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

                <div className="flex items-center justify-between">
                  <label className="flex items-center cursor-pointer group">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-white/20 bg-white/5 text-brand-400 focus:ring-[#7DD3D8]/30 cursor-pointer"
                    />
                    <span className="ml-2 text-sm text-white/50 group-hover:text-white/70 transition-colors">
                      Remember me
                    </span>
                  </label>
                  <Link
                    href="/forgot-password"
                    className="text-sm text-[#7DD3D8] hover:text-white font-medium transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || isGoogleLoading}
                  className="w-full bg-[#2B9095] hover:bg-[#19797D] text-white border border-white/20 py-3 px-6 rounded-xl font-semibold transition-all duration-200 shadow-lg shadow-black/20 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
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
                      Signing in...
                    </>
                  ) : (
                    "Sign In"
                  )}
                </button>
              </form>

              {/* Divider */}
              <div className="flex items-center gap-4 my-6">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent to-white/15" />
                <span className="text-white/40 uppercase tracking-wider font-medium text-[10px] whitespace-nowrap">
                  or continue with
                </span>
                <div className="flex-1 h-px bg-gradient-to-l from-transparent to-white/15" />
              </div>

              {/* Google button */}
              <div ref={googleButtonRef} className="w-full flex justify-center overflow-hidden">
                {isGoogleLoading ? (
                  <div className="w-full h-[44px] border border-white/10 rounded-xl flex items-center justify-center gap-2.5 text-white/60 bg-white/5 text-sm">
                    <svg
                      className="animate-spin h-4 w-4 text-[#7DD3D8]"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
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
                    Signing in with Google...
                  </div>
                ) : googleMounted ? (
                  <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={handleGoogleError}
                    theme="outline"
                    size="large"
                    shape="rectangular"
                    text="continue_with"
                    logo_alignment="left"
                    useOneTap={false}
                    width={googleButtonWidth || 400}
                  />
                ) : (
                  <div className="w-full h-[44px] border border-white/10 rounded-xl bg-white/5" />
                )}
              </div>

              <div className="mt-6 text-center">
                <p className="text-sm text-white/50">
                  Don&apos;t have an account?{" "}
                  <Link
                    href="/signup"
                    className="text-[#7DD3D8] hover:text-white font-medium transition-colors"
                  >
                    Sign up
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
    </GoogleOAuthProvider>
  );
}