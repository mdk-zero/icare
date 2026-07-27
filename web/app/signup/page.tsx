"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleExclamation,
  faUser,
  faEnvelope,
  faChevronDown,
  faLock,
  faEye,
  faEyeSlash,
  faCircleNotch,
  faBolt,
  faChartColumn,
  faHeart,
} from "@fortawesome/free-solid-svg-icons";
import { register, User } from "../lib/api";
import logo from "../../public/logo-no-bg.png";
import logo_white from "../../public/logo-white-no-bg.png";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<User["role"]>("faculty");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsLoading(true);

    try {
      const result = await register(name, email, password, role);
      if (!result) {
        setError("Unable to create account. This email may already be in use.");
        setIsLoading(false);
        return;
      }

      localStorage.setItem("icare_user", JSON.stringify(result.user));
      localStorage.setItem("icare_token", "logged_in");
      router.push(
        result.user.role === "faculty"
          ? "/faculty"
          : "/admin",
      );
    } catch {
      setError("Connection error. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel — logo & description (mirrors login) */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-[#0D7377] via-[#0A5C5F] to-[#084A4D]">
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

      {/* Right panel — sign up form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-5 sm:px-8 py-12 bg-canvas relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full opacity-40">
          <div className="absolute top-[-10%] right-[-10%] w-[350px] h-[350px] bg-[#7DD3D8]/20 rounded-full blur-3xl" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[300px] h-[300px] bg-brand-600/10 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 w-full max-w-[520px] animate-fade-in-up">
          {/* Mobile header */}
          <div className="lg:hidden flex flex-col items-center mb-6">
            <div className="p-3.5 bg-brand-50 rounded-2xl shadow-md mb-3">
              <Image src={logo} alt="iCare++ Logo" className="h-12 w-auto" priority />
            </div>
          </div>

          <div className="bg-surface rounded-3xl border border-hairline shadow-xl shadow-brand-600/[0.05] p-7 sm:p-9">
            <div className="mb-6">
              <h1 className="text-xl font-semibold text-gray-900 mb-1 tracking-tight">
                Create your account
              </h1>
              <p className="text-sm text-gray-500">Join iCARE++ for nursing education</p>
            </div>

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
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <FontAwesomeIcon icon={faUser} className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full pl-11 pr-4 py-3 bg-subtle border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600 transition-all"
                    placeholder="Maria Cruz"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
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
                <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1.5">
                  I am a <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <FontAwesomeIcon icon={faUser} className="h-5 w-5 text-gray-400" />
                  </div>
                  <select
                    id="role"
                    value={role}
                    onChange={(e) => setRole(e.target.value as User["role"])}
                    required
                    className="w-full pl-11 pr-4 py-3 bg-subtle border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600 transition-all appearance-none"
                  >
                    <option value="faculty">Faculty</option>
                    <option value="admin">Administrator</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                    <FontAwesomeIcon icon={faChevronDown} className="h-4 w-4 text-gray-400" />
                  </div>
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
                    minLength={8}
                    className="w-full pl-11 pr-11 py-3 bg-subtle border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600 transition-all"
                    placeholder="At least 8 characters"
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

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
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
                  className="w-full px-4 py-3 bg-subtle border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600 transition-all"
                  placeholder="Re-enter your password"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-brand-600 hover:bg-brand-700 text-white py-3 px-6 rounded-xl font-medium transition-all duration-200 shadow-lg shadow-brand-600/20 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <FontAwesomeIcon icon={faCircleNotch} className="animate-spin h-5 w-5" />
                    Creating account...
                  </>
                ) : (
                  "Create account"
                )}
              </button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-gray-500">
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="text-brand-600 hover:text-brand-700 font-medium transition-colors"
                >
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
