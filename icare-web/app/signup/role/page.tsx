"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Image from "next/image";
import { getPendingGoogleProfile, registerGoogle, GooglePendingProfile, User } from "../../lib/api";
import logo from "../../../public/logo-no-bg.png";
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

function MedicalCross({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="16" y="4" width="8" height="32" rx="2" fill="currentColor" />
      <rect x="4" y="16" width="32" height="8" rx="2" fill="currentColor" />
    </svg>
  );
}

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
      <div className="min-h-screen flex items-center justify-center bg-[#F8FBFC]">
        <div className="w-8 h-8 border-4 border-[#0D7377] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel — brand */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-[#0D7377] via-[#0A5C5F] to-[#084A4D]">
        <div className="absolute inset-0 opacity-[0.05]">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="crossPatternRole" width="80" height="80" patternUnits="userSpaceOnUse">
                <path d="M36 28h8v12h12v8h-12v12h-8v-12h-12v-8h12z" fill="#ffffff" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#crossPatternRole)" />
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

          <p className="text-lg xl:text-xl text-white/85 text-center max-w-md leading-relaxed">
            A Scalable Machine Learning-Driven Clinical Competency Assessment and Adaptive Learning
            System for Nursing Students
          </p>
        </div>
      </div>

      {/* Right panel — role selection */}
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
            <h2 className="text-2xl font-semibold text-[#0F4C5C]">iCARE++</h2>
          </div>

          <div className="bg-white rounded-3xl border border-[#E2EBEC] shadow-xl shadow-[#0D7377]/[0.05] p-7 sm:p-9">
            <div className="mb-6">
              <h1 className="text-xl font-semibold text-[#0F172A] mb-1 tracking-tight">
                Select your role
              </h1>
              <p className="text-sm text-[#64748B]">
                {profile
                  ? `Welcome, ${profile.name}. Choose how you will use iCARE++.`
                  : "Choose how you will use iCARE++."}
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

            <div className="space-y-3">
              {roles.map((role) => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => handleSelect(role.id)}
                  disabled={isSubmitting}
                  className="w-full flex items-start gap-4 p-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] hover:border-[#0D7377] hover:bg-[#E8F6F5] transition-all disabled:opacity-60 text-left group"
                >
                  <div className="w-11 h-11 rounded-xl bg-[#0D7377]/10 flex items-center justify-center flex-shrink-0 group-hover:bg-[#0D7377]/20 transition-colors">
                    <svg
                      className="w-6 h-6 text-[#0D7377]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d={role.icon}
                      />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-[#0F172A]">{role.label}</p>
                    <p className="text-sm text-[#64748B]">{role.description}</p>
                  </div>
                  <svg
                    className="w-5 h-5 text-[#94A3B8] self-center group-hover:text-[#0D7377] transition-colors"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              ))}
            </div>

            <div className="mt-6 text-center">
              <p className="text-sm text-[#64748B]">
                Not the right account?{" "}
                <button
                  type="button"
                  onClick={() => router.push("/login")}
                  className="text-[#0D7377] hover:text-[#0A5C5F] font-medium transition-colors"
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
