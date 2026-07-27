"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Image from "next/image";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUsers,
  faGear,
  faCircleExclamation,
  faChevronRight,
  faBolt,
  faChartColumn,
  faHeart,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { getPendingGoogleProfile, registerGoogle, GooglePendingProfile, User } from "../../lib/api";
import logo from "../../../public/logo-no-bg.png";
import logo_white from "../../../public/logo-white-no-bg.png";

const roles: {
  id: User["role"];
  label: string;
  description: string;
  icon: IconDefinition;
}[] = [
  {
    id: "faculty",
    label: "Faculty",
    description: "Manage students, assign scenarios, and review performance.",
    icon: faUsers,
  },
  {
    id: "admin",
    label: "Administrator",
    description: "Oversee users, rooms, reports, and system settings.",
    icon: faGear,
  },
];

export default function SelectRolePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<GooglePendingProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const pending = await getPendingGoogleProfile();
      if (!pending) {
        router.replace("/login");
        return;
      }
      setProfile(pending);
      setIsLoading(false);
    }
    load();
  }, [router]);

  const handleSelect = async (role: User["role"]) => {
    setIsSubmitting(true);
    setError("");

    const result = await registerGoogle(role);
    if (!result) {
      setIsSubmitting(false);
      setError("Unable to create your account. Please try again.");
      return;
    }

    localStorage.setItem("icare_user", JSON.stringify(result.user));
    localStorage.setItem("icare_token", "logged_in");
    router.push(result.user.role === "faculty" ? "/faculty" : "/admin");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

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

      {/* Right panel — role selection */}
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
            <h2 className="text-2xl font-semibold text-brand-800">iCARE++</h2>
          </div>

          <div className="bg-surface rounded-3xl border border-hairline shadow-xl shadow-brand-600/[0.05] p-7 sm:p-9">
            <div className="mb-6">
              <h1 className="text-xl font-semibold text-gray-900 mb-1 tracking-tight">
                Select your role
              </h1>
              <p className="text-sm text-gray-500">
                {profile
                  ? `Welcome, ${profile.name}. Choose how you will use iCARE++.`
                  : "Choose how you will use iCARE++."}
              </p>
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

            <div className="space-y-3">
              {roles.map((role) => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => handleSelect(role.id)}
                  disabled={isSubmitting}
                  className="w-full flex items-start gap-4 p-4 rounded-xl border border-gray-200 bg-subtle hover:border-brand-600 hover:bg-brand-50 transition-all disabled:opacity-60 text-left group"
                >
                  <div className="w-11 h-11 rounded-xl bg-brand-600/10 flex items-center justify-center flex-shrink-0 group-hover:bg-brand-600/20 transition-colors">
                    <FontAwesomeIcon icon={role.icon} className="w-6 h-6 text-brand-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">{role.label}</p>
                    <p className="text-sm text-gray-500">{role.description}</p>
                  </div>
                  <FontAwesomeIcon
                    icon={faChevronRight}
                    className="w-5 h-5 text-gray-400 self-center group-hover:text-brand-600 transition-colors"
                  />
                </button>
              ))}
            </div>

            <div className="mt-6 text-center">
              <p className="text-sm text-gray-500">
                Not the right account?{" "}
                <button
                  type="button"
                  onClick={() => router.push("/login")}
                  className="text-brand-600 hover:text-brand-700 font-medium transition-colors"
                >
                  Go back
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
