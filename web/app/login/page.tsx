"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import Image from "next/image";
import { GoogleOAuthProvider, GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { login, isAuthenticated, getCurrentUser, User, logAuditAction } from "../lib/api";
import logo from "../../public/logo-no-bg.png";

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

  const redirectAfterAuth = useCallback((user: User) => {
    if (user.force_password_change) {
      router.push("/change-password");
      return;
    }
    router.push(
      user.role === "student" ? "/dashboard" : user.role === "faculty" ? "/faculty" : "/admin",
    );
  }, [router]);

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
      <div className="h-screen overflow-hidden flex bg-[#EDEAE2] text-[#16181B]">
        {/* Left panel — editorial intro */}
        <div className="hidden lg:flex lg:w-1/2 h-full relative flex-col border-r border-[#DBD6CA] px-14 xl:px-16 py-6">
          {/* top row: wordmark + accent dot/rule */}
          <div className="flex items-start justify-between shrink-0">
            <div className="flex items-center gap-3">
              <Image src={logo} alt="iCARE++ logo" className="h-6 w-auto" priority />
              <span className="h-5 w-px bg-[#CBC5B6]" />
            </div>
            <div className="flex flex-col items-center">
              <span className="h-2 w-2 rounded-full bg-[#0D7377]" />
              <span className="mt-2 w-px h-16 bg-[#CBC5B6]" />
            </div>
          </div>

          {/* headline block */}
          <div className="flex-1 flex flex-col justify-center max-w-md min-h-0 mx-auto">
            <span className="text-[11px] tracking-[0.2em] font-semibold text-[#0D7377] mb-3">
              CLINICAL COMPETENCY PLATFORM
            </span>
            <h1 className="text-4xl xl:text-5xl leading-[1.05] font-bold text-[#14171A] mb-4 tracking-tight">
              Practice with
              <br />
              purpose.
            </h1>
            <p className="text-[#5B5F63] text-[15px] leading-relaxed mb-6">
              A calm, focused space for nursing students and educators to build better clinical
              judgment.
            </p>

            <div className="border-t border-[#DBD6CA] pt-5 flex items-start gap-5">
              <span className="text-2xl font-bold text-[#14171A]">01</span>
              <p className="text-[#5B5F63] text-[15px] leading-relaxed">
                Adaptive scenarios that meet you where you are.
              </p>
            </div>
          </div>

          {/* bottom bar */}
          <div className="border-t border-[#DBD6CA] pt-4 flex items-center justify-between shrink-0">
            <span className="text-[10px] tracking-[0.2em] font-semibold text-[#8A8B7F]">
              BUILT FOR BETTER CARE
            </span>
            <span className="text-[10px] tracking-[0.2em] font-semibold text-[#8A8B7F]">
              EST. 2026
            </span>
          </div>
        </div>

        {/* Right panel — sign in form */}
        <div className="w-full lg:w-1/2 h-full flex flex-col px-6 sm:px-14 xl:px-20 py-6">
          {/* mobile wordmark */}
          <div className="lg:hidden flex items-center gap-3 mb-6 shrink-0">
            <Image src={logo} alt="iCARE++ logo" className="h-6 w-auto" priority />
            <span className="h-5 w-px bg-[#CBC5B6]" />
            <span className="text-[11px] tracking-[0.2em] font-semibold text-[#0D7377]">
              ICARE++
            </span>
          </div>

          {/* top-right accent dot/rule (desktop only) — pinned to top, not part of centered block */}
          <div className="hidden lg:flex justify-end shrink-0">
            <div className="flex flex-col items-center">
              <span className="h-2 w-2 rounded-full bg-[#0D7377]" />
              <span className="mt-2 w-px h-16 bg-[#CBC5B6]" />
            </div>
          </div>

          {/* centered form block — direct flex-1 child, centers in the remaining space */}
          <div className="flex-1 min-h-0 flex flex-col justify-center w-full max-w-md mx-auto">
            <span className="text-[11px] tracking-[0.2em] font-semibold text-[#0D7377] mb-3">
              SECURE ACCESS
            </span>
            <h2 className="text-3xl font-bold text-[#14171A] mb-2 tracking-tight">
              Welcome back, caregiver
            </h2>
            <p className="text-sm text-[#5B5F63] mb-6">
              Sign in to continue your journey in nursing excellence
            </p>

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

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm text-[#14171A] mb-2">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#9C9789] font-medium">
                    @
                  </div>
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full pl-10 pr-4 py-3.5 bg-[#F7F5F0] border border-[#DBD6CA] rounded-xl text-[#14171A] placeholder:text-[#9C9789] focus:outline-none focus:ring-2 focus:ring-[#0D7377]/20 focus:border-[#0D7377] transition-all"
                    placeholder="name@icare.edu"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm text-[#14171A] mb-2">
                  Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <svg
                      className="h-4 w-4 text-[#9C9789]"
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
                    className="w-full pl-10 pr-11 py-3.5 bg-[#F7F5F0] border border-[#DBD6CA] rounded-xl text-[#14171A] placeholder:text-[#9C9789] focus:outline-none focus:ring-2 focus:ring-[#0D7377]/20 focus:border-[#0D7377] transition-all"
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#9C9789] hover:text-[#5B5F63] transition-colors"
                  >
                    {showPassword ? (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                        />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center cursor-pointer group">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-[#CBC5B6] text-[#0D7377] focus:ring-[#0D7377]/30 cursor-pointer"
                  />
                  <span className="ml-2 text-sm text-[#5B5F63] group-hover:text-[#14171A] transition-colors">
                    Remember me
                  </span>
                </label>
                <Link
                  href="/forgot-password"
                  className="text-sm text-[#0D7377] hover:text-[#0A5C5F] font-medium transition-colors"
                >
                  Forgot password?
                </Link>
              </div>

              <button
                type="submit"
                disabled={isLoading || isGoogleLoading}
                className="w-full bg-[#0D7377] hover:bg-[#0A5C5F] text-white py-3.5 px-6 rounded-full font-medium transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
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
            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <div className="w-full h-px bg-[#DBD6CA]" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-4 bg-[#EDEAE2] text-[#9C9789] uppercase tracking-wider font-medium text-[10px]">
                  or continue with
                </span>
              </div>
            </div>

            {/* Google button */}
            <div ref={googleButtonRef} className="w-full flex justify-center overflow-hidden rounded-full">
              {isGoogleLoading ? (
                <div className="w-full h-[48px] border border-[#DBD6CA] rounded-full flex items-center justify-center gap-2.5 text-[#5B5F63] bg-white text-sm">
                  <svg className="animate-spin h-4 w-4 text-[#0D7377]" fill="none" viewBox="0 0 24 24">
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
                  shape="pill"
                  text="continue_with"
                  logo_alignment="left"
                  useOneTap={false}
                  width={googleButtonWidth || 400}
                />
              ) : (
                <div className="w-full h-[48px] border border-[#DBD6CA] rounded-full bg-white" />
              )}
            </div>

            <div className="mt-5 text-center">
              <p className="text-sm text-[#5B5F63]">
                Don&apos;t have an account?{" "}
                <Link
                  href="/signup"
                  className="text-[#0D7377] hover:text-[#0A5C5F] font-medium transition-colors"
                >
                  Sign up
                </Link>
              </p>
            </div>
          </div>
          {/* footer — pinned to bottom of panel, outside the centered block */}
          <p className="text-center text-xs text-[#9C9789] shrink-0 pt-4">
            &copy; 2026 iCARE++. All rights reserved.
          </p>
        </div>
      </div>
    </GoogleOAuthProvider>
  );
}