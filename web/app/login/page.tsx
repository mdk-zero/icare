"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import GoogleSignInButton from "../components/GoogleSignInButton";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleExclamation,
  faEnvelope,
  faLock,
  faEye,
  faEyeSlash,
  faCircleNotch,
  faBolt,
  faChartColumn,
  faHeart,
} from "@fortawesome/free-solid-svg-icons";
import { login, isAuthenticated, getCurrentUser, User, logAuditAction } from "../lib/api";
import logo from "../../public/logo-no-bg.png";
import logo_white from "../../public/logo-white-no-bg.png";

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

      if (result?.user) {
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
        setError(result?.error ?? "Connection error. Please make sure the backend is running.");
      }
    } catch {
      setError("Connection error. Please make sure the backend is running.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSuccess = async (response: { credential: string }) => {
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
    <div className="min-h-screen flex">
        {/* Left panel — logo & description */}
        <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-[#0D7377] via-[#0A5C5F] to-[#084A4D]">
          {/* ECG graph-paper grid, fading toward the top-left */}
          <div className="absolute inset-0 opacity-[0.07] [mask-image:linear-gradient(135deg,transparent_15%,black_70%)]">
            <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="gridMinor" width="28" height="28" patternUnits="userSpaceOnUse">
                  <path d="M28 0H0v28" fill="none" stroke="#ffffff" strokeWidth="0.5" />
                </pattern>
                <pattern id="gridMajor" width="140" height="140" patternUnits="userSpaceOnUse">
                  <path d="M140 0H0v140" fill="none" stroke="#ffffff" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#gridMinor)" />
              <rect width="100%" height="100%" fill="url(#gridMajor)" />
            </svg>
          </div>

          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[#7DD3D8]/10 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4" />

          <div className="relative z-10 flex flex-col w-full px-14 xl:px-20 py-10 xl:py-14 text-white">
            {/* Story */}
            <div className="flex-1 flex flex-col justify-center max-w-xl py-10">
              {/* Brand */}
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
        {/* Right panel — cards */}
        <div className="w-full lg:w-1/2 flex items-center justify-center px-5 sm:px-8 py-12 bg-canvas relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full opacity-40">
            <div className="absolute top-[-10%] right-[-10%] w-[350px] h-[350px] bg-[#7DD3D8]/20 rounded-full blur-3xl" />
            <div className="absolute bottom-[-10%] left-[-10%] w-[300px] h-[300px] bg-brand-600/10 rounded-full blur-3xl" />
          </div>
          <div className="relative z-10 w-full max-w-[520px] animate-fade-in-up">
            {/* Mobile header */}
            <div className="lg:hidden flex flex-col items-center mb-6">
              <div className="p-3.5 rounded-2xl mb-3">
                <Image src={logo} alt="iCare++ Logo" className="h-12 w-auto" priority />
              </div>
            </div>
            {/* Login card */}
            <div className="bg-surface rounded-3xl border border-hairline shadow-xl shadow-brand-600/[0.05] p-7 sm:p-9">
              <div className="mb-6">
                <h1 className="text-3xl font-semibold text-gray-900 mb-1 tracking-tight">
                  Welcome back, caregiver
                </h1>
                <p className="text-sm text-gray-500">
                  Sign in to continue your journey in nursing excellence
                </p>
              </div>
              {/* Error banner */}
              {error && (
                <div className="flex items-start gap-3 p-3.5 mb-5 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm animate-shake">
                  <FontAwesomeIcon
                    icon={faCircleExclamation}
                    className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5"
                  />
                  <span>{error}</span>
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-gray-700 mb-1.5"
                  >
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <FontAwesomeIcon icon={faEnvelope} className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="email"
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full pl-11 pr-4 py-3 bg-subtle border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600 transition-all"
                      placeholder="name@icare.edu"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-gray-700 mb-1.5"
                  >
                    Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <FontAwesomeIcon icon={faLock} className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type={showPassword ? "text" : "password"}
                      id="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full pl-11 pr-11 py-3 bg-subtle border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600 transition-all"
                      placeholder="Enter your password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-500 transition-colors"
                    >
                      {showPassword ? (
                        <FontAwesomeIcon icon={faEyeSlash} className="h-5 w-5" />
                      ) : (
                        <FontAwesomeIcon icon={faEye} className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center cursor-pointer group">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-600/30 cursor-pointer"
                    />
                    <span className="ml-2 text-sm text-gray-500 group-hover:text-gray-600 transition-colors">
                      Remember me
                    </span>
                  </label>
                  <Link
                    href="/forgot-password"
                    className="text-sm text-brand-600 hover:text-brand-700 font-medium transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || isGoogleLoading}
                  className="w-full bg-brand-600 hover:bg-brand-700 text-white py-3 px-6 rounded-xl font-medium transition-all duration-200 shadow-lg shadow-brand-600/20 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <FontAwesomeIcon icon={faCircleNotch} className="animate-spin h-5 w-5" />
                      Signing in...
                    </>
                  ) : (
                    "Sign In"
                  )}
                </button>
              </form>

              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="w-full h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-4 bg-surface text-gray-400 uppercase tracking-wider font-medium text-[10px]">
                    or continue with
                  </span>
                </div>
              </div>

              {/* Google button */}
              <div className="w-full flex justify-center overflow-hidden">
                {isGoogleLoading ? (
                  <div className="w-full h-[44px] border border-gray-200 rounded-xl flex items-center justify-center gap-2.5 text-gray-500 bg-subtle text-sm">
                    <FontAwesomeIcon
                      icon={faCircleNotch}
                      className="animate-spin h-4 w-4 text-brand-600"
                    />
                    Signing in with Google...
                  </div>
                ) : (
                  <GoogleSignInButton
                    onSuccess={handleGoogleSuccess}
                    onError={handleGoogleError}
                    width={400}
                  />
                )}
              </div>

              <div className="mt-6 text-center">
                <p className="text-sm text-gray-500">
                  Don&apos;t have an account?{" "}
                  <Link
                    href="/signup"
                    className="text-brand-600 hover:text-brand-700 font-medium transition-colors"
                  >
                    Sign up
                  </Link>
                </p>
              </div>
            </div>

            {/* Footer */}
            <p className="text-center text-xs text-gray-400 mt-5">
              &copy; 2026 iCARE++. All rights reserved.
            </p>
          </div>
        </div>
    </div>
  );
}
