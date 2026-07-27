"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Image from "next/image";
import { getPendingGoogleProfile, registerGoogle, GooglePendingProfile, User } from "../../lib/api";
import logo_white from "../../../public/logo-white-no-bg.png";

const roles: {
  id: User["role"];
  label: string;
  description: string;
  icon: string;
}[] = [
  {
    id: "faculty",
    label: "Faculty",
    description: "Manage students, assign scenarios, and review performance.",
    icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z",
  },
  {
    id: "admin",
    label: "Administrator",
    description: "Oversee users, rooms, reports, and system settings.",
    icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  },
];

export default function SelectRolePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<GooglePendingProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

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
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-gradient-to-r from-[#0D7377] via-30% via-[#0A4A4D] to-[#050c0d]">
        <div className="w-8 h-8 border-4 border-[#7DD3D8] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex relative overflow-hidden bg-gradient-to-r from-[#0D7377] via-30% via-[#0A4A4D] to-[#050c0d]">
      {/* ───────── Shared abstract layer ───────── */}
      <div className="absolute inset-0 opacity-[0.07] [mask-image:linear-gradient(90deg,black_0%,black_60%,transparent_100%)] pointer-events-none">
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="roleGridMinor" width="28" height="28" patternUnits="userSpaceOnUse">
              <path d="M28 0H0v28" fill="none" stroke="#ffffff" strokeWidth="0.5" />
            </pattern>
            <pattern id="roleGridMajor" width="140" height="140" patternUnits="userSpaceOnUse">
              <path d="M140 0H0v140" fill="none" stroke="#ffffff" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#roleGridMinor)" />
          <rect width="100%" height="100%" fill="url(#roleGridMajor)" />
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
          <div className="flex-1 flex flex-col justify-center max-w-xl py-10 -mt-8">
            <div className="mb-12 opacity-0 animate-fade-in-up">
              <Image src={logo_white} alt="iCare++ Logo" className="h-14 w-auto drop-shadow-md" priority />
            </div>

            <p className="opacity-0 animate-fade-in-up [animation-delay:100ms] text-[11px] font-semibold uppercase tracking-[0.28em] text-[#7DD3D8] mb-4">
              Clinical Competency Platform
            </p>
            <h2 className="opacity-0 animate-fade-in-up [animation-delay:200ms] text-4xl xl:text-[2.75rem] font-semibold tracking-tight leading-[1.12] mb-5">
              One last step to
              <br />
              get you started.
            </h2>
            <p className="opacity-0 animate-fade-in-up [animation-delay:300ms] text-base text-white/70 leading-relaxed mb-10">
              A scalable machine learning–driven clinical competency assessment and adaptive
              learning system for nursing students.
            </p>
          </div>
        </div>
      </div>

      {/* ───────── Right panel — glass role selection card ───────── */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-5 sm:px-8 py-12 relative">
        <div className="relative z-10 w-full max-w-[460px] -mt-8 animate-fade-in-up">
          {/* Mobile header */}
          <div className="lg:hidden flex flex-col items-center mb-6">
            <div className="p-3.5 bg-white/10 border border-white/10 backdrop-blur-md rounded-2xl mb-3">
              <Image src={logo_white} alt="iCare++ Logo" className="h-12 w-auto" priority />
            </div>
          </div>

          {/* Role selection card */}
          <div className="bg-white/[0.06] backdrop-blur-2xl rounded-3xl border border-white/30 shadow-2xl shadow-black/40 p-5 sm:p-8">
            <div className="mb-6">
              <h1 className="text-3xl font-semibold text-white mb-1 tracking-tight">
                Select your role
              </h1>
              <p className="text-sm text-white/50">
                {profile
                  ? `Welcome, ${profile.name}. Choose how you will use iCARE++.`
                  : "Choose how you will use iCARE++."}
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-3 p-3.5 mb-5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-sm animate-shake">
                <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
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
                  className="w-full flex items-start gap-4 p-4 rounded-xl border border-white/10 bg-white/5 hover:border-[#7DD3D8]/50 hover:bg-white/[0.08] transition-all disabled:opacity-60 text-left group"
                >
                  <div className="w-11 h-11 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center flex-shrink-0 group-hover:bg-[#7DD3D8]/20 transition-colors">
                    <svg className="w-6 h-6 text-[#7DD3D8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={role.icon} />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-white">{role.label}</p>
                    <p className="text-sm text-white/50">{role.description}</p>
                  </div>
                  <svg
                    className="w-5 h-5 text-white/35 self-center group-hover:text-[#7DD3D8] transition-colors"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>

            <div className="mt-6 text-center">
              <p className="text-sm text-white/50">
                Not the right account?{" "}
                <button
                  type="button"
                  onClick={() => router.push("/login")}
                  className="text-[#7DD3D8] hover:text-white font-medium transition-colors"
                >
                  Go back
                </button>
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