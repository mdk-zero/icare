"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import logo from "../public/logo-no-bg.png";
import logo_white from "../public/logo-white-no-bg.png";

function useScrollReveal<T extends HTMLElement>(threshold = 0.15) {
  const [revealed, setRevealed] = useState(false);
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || revealed) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true);
          observer.unobserve(el);
        }
      },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, revealed]);

  return { ref, revealed };
}

function RevealSection({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  const { ref, revealed } = useScrollReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ${revealed ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
        }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

function RevealCard({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  const { ref, revealed } = useScrollReveal<HTMLDivElement>(0.1);
  return (
    <div
      ref={ref}
      className={`transition-all duration-500 ${revealed ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

function FAQItem({
  question,
  answer,
  open: defaultOpen = false,
}: {
  question: string;
  answer: string;
  open?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-hairline last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-4 py-5 text-left transition-all duration-200 hover:opacity-80"
      >
        <span className="text-sm sm:text-base font-medium text-gray-900">{question}</span>
        <svg
          className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""
            }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ${open ? "max-h-80 pb-5" : "max-h-0"
          }`}
      >
        <p className="text-sm text-gray-500 leading-relaxed">{answer}</p>
      </div>
    </div>
  );
}

/* ───────── Core Modules quick-cards ───────── */
const quickModules = [
  {
    title: "Immersive Scenarios",
    blurb: "Branching patient cases where every decision changes the outcome — not multiple choice.",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
      />
    ),
  },
  {
    title: "Bias-Free Scoring",
    blurb: "The same response gets the same score, every time — no evaluator mood, no inconsistency.",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
      />
    ),
  },
  {
    title: "Answers, Not Just Grades",
    blurb: "Dashboards flag exactly which competencies are weak — days before an exam would.",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
      />
    ),
  },
];

const whyData = [
  {
    title: "Adaptive vs. One-Size-Fits-All",
    traditional:
      "All students follow the same curriculum regardless of existing skill gaps.",
    icare:
      "ML dynamically adjusts scenario difficulty and content to target each student's weak areas.",
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
    title: "Objective vs. Subjective Assessment",
    traditional:
      "Competency scoring varies between evaluators, introducing bias.",
    icare:
      "Machine learning provides consistent, bias-free scoring across every attempt.",
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
    title: "Hands-On vs. Theory-Only Learning",
    traditional:
      "Learning relies heavily on textbooks, lectures, and passive study.",
    icare:
      "Realistic patient scenarios build clinical judgment through active practice.",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
      />
    ),
  },
  {
    title: "Real-Time vs. Periodic Feedback",
    traditional:
      "Feedback comes days or weeks after exams or clinical rotations.",
    icare:
      "Instant analytics and progress tracking give students and faculty actionable insights immediately.",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
      />
    ),
  },
];

const faqs = [
  {
    question: "Who can use iCARE++?",
    answer:
      "iCARE++ is designed for nursing students, faculty, and program administrators at institutions of all sizes — from diploma programs to university-level nursing schools. The platform supports multiple cohorts and can be configured for your program's specific curriculum.",
  },
  {
    question: "How does the ML-driven assessment work?",
    answer:
      "The machine learning model analyzes every student response across scenarios, quizzes, and EHR entries to build a detailed competency profile. It identifies knowledge gaps, adjusts difficulty in real time, and provides objective scoring that eliminates grading bias. Faculty get a clear picture of each student's strengths and areas needing improvement.",
  },
  {
    question: "Can faculty create their own scenarios?",
    answer:
      "Yes. Faculty can build custom scenarios from scratch using an intuitive editor, or use the AI-assisted scenario generator to create realistic patient cases in minutes. Scenarios can be tailored to specific learning objectives, nursing domains, and difficulty levels.",
  },
  {
    question: "What kind of analytics are available?",
    answer:
      "Faculty and administrators have access to real-time dashboards showing competency scores, at-risk student flags, cohort trends, scenario completion rates, time-on-task metrics, and detailed per-student reports. All data is exportable for accreditation review and curriculum planning.",
  },
  {
    question: "Is iCARE++ suitable for all nursing programs?",
    answer:
      "Absolutely. The platform supports medical-surgical, pediatrics, maternity, critical care, and community health nursing. Scenario difficulty can be calibrated from first-year fundamentals through advanced practice. Content is customizable to match your program's specific competencies and curriculum.",
  },
  {
    question: "How is student data protected?",
    answer:
      "iCARE++ uses industry-standard encryption for data at rest and in transit, secure authentication via Supabase, and follows data privacy best practices including audit trails that record all access and changes. The platform is designed with FERPA and institutional compliance in mind.",
  },
];

const tour = [
  {
    number: "01",
    title: "Realistic Clinical Scenarios",
    description:
      "Students step into immersive, branching patient encounters that span medical-surgical, pediatrics, maternity, and critical care nursing. Every decision alters the patient's trajectory, building clinical judgment in a safe environment.",
    capabilities: [
      "Dynamic vitals that react to interventions in real time",
      "Integrated EHR documentation within every case",
      "Branching storylines with multiple outcomes",
      "Covers all core nursing domains",
    ],
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
      />
    ),
  },
  {
    number: "02",
    title: "ML-Powered Adaptive Assessments",
    description:
      "Machine learning algorithms analyze every student response in real time, adjusting question difficulty and scenario complexity to target individual knowledge gaps. Each assessment delivers a precise competency profile.",
    capabilities: [
      "Dynamic difficulty adjustment based on performance",
      "Instant competency scoring with detailed breakdowns",
      "Multiple formats: quizzes, OSCEs, case studies",
      "Identifies strengths and knowledge gaps automatically",
    ],
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605"
      />
    ),
  },
  {
    number: "03",
    title: "Electronic Health Records (EHR)",
    description:
      "A fully simulated EHR system lets students practice charting patient histories, documenting assessments, ordering labs, and reviewing results. Build clinical reasoning through structured, real-world documentation workflows.",
    capabilities: [
      "Chart patient histories, medications, and assessments",
      "Review lab results and diagnostic imaging",
      "Practice structured clinical reasoning workflows",
      "Faculty can review and provide feedback on entries",
    ],
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
      />
    ),
  },
  {
    number: "04",
    title: "Live Vitals & Patient Monitoring",
    description:
      "Real-time vital sign displays — heart rate, blood pressure, respiratory rate, SpO₂, and temperature — respond dynamically to clinical interventions. Students learn to recognize deterioration patterns and act decisively.",
    capabilities: [
      "Real-time vital sign monitoring with live updates",
      "Physiological responses to medications and interventions",
      "Abnormal vitals trigger alerts and clinical cues",
      "Practice recognizing and responding to deterioration",
    ],
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
      />
    ),
  },
  {
    number: "05",
    title: "Competency Analytics & Insights",
    description:
      "Visual dashboards track progress across every clinical competency. At-risk students are flagged early, cohort trends are surfaced instantly, and detailed reports are exportable for accreditation and curriculum review.",
    capabilities: [
      "Visual progress tracking across all competencies",
      "Early at-risk identification with automated alerts",
      "Cohort comparison and trend analysis tools",
      "Exportable reports for accreditation and review",
    ],
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
      />
    ),
  },
  {
    number: "06",
    title: "AI-Powered Recommendations",
    description:
      "An intelligent recommendation engine suggests personalised learning paths based on each student's performance history. Faculty receive actionable insights to target remediation where it matters most.",
    capabilities: [
      "Personalized learning paths based on performance data",
      "Suggested scenarios and quizzes to address weak areas",
      "Spaced repetition scheduling for knowledge retention",
      "Faculty insights for targeted remediation",
    ],
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"
      />
    ),
  },
];

const roles = [
  {
    title: "For Students",
    description:
      "Engage with adaptive scenarios, practice EHR charting, monitor live vitals, and track your competency growth through detailed analytics — all at your own pace.",
    action: "Start learning",
    href: "/signup",
    highlights: [
      "Adaptive scenarios and quizzes",
      "EHR charting and vitals monitoring",
      "Personalized progress dashboard",
      "Competency tracking and feedback",
    ],
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342"
      />
    ),
  },
  {
    title: "For Faculty",
    description:
      "Create scenarios and assessments with AI assistance, monitor student performance in real time, identify at-risk learners early, and generate comprehensive reports.",
    action: "Explore faculty tools",
    href: "/login",
    highlights: [
      "AI-assisted scenario and assessment creation",
      "Real-time student performance monitoring",
      "At-risk student identification and alerts",
      "Detailed analytics and exportable reports",
    ],
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z"
      />
    ),
  },
  {
    title: "For Administrators",
    description:
      "Manage students, faculty, and rooms from a single dashboard. Access institution-wide analytics, audit logs, and configuration settings to keep your program running smoothly.",
    action: "View admin features",
    href: "/login",
    highlights: [
      "Centralised user and room management",
      "Institution-wide analytics and reporting",
      "Full audit trail and compliance logs",
      "System configuration and settings",
    ],
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
      />
    ),
  },
];

const steps = [
  {
    step: "01",
    title: "Assess",
    description:
      "Students engage with realistic clinical scenarios that evaluate their current competency level across key nursing domains.",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    ),
  },
  {
    step: "02",
    title: "Adapt",
    description:
      "The ML engine analyzes performance and dynamically adjusts scenario difficulty, focusing on individual knowledge gaps.",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
      />
    ),
  },
  {
    step: "03",
    title: "Excel",
    description:
      "Build clinical confidence with measurable progress, detailed feedback, and competency validation at every step.",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
      />
    ),
  },
];

const testimonials = [
  {
    quote:
      "iCARE++ transformed how our students prepare for clinical rotations. The adaptive scenarios are remarkably realistic, and the ML-driven feedback helps them identify exactly where they need to improve.",
    name: "Dr. Rebecca Chen",
    role: "Dean, College of Nursing",
  },
  {
    quote:
      "The EHR documentation module is a game-changer. Our students graduate already familiar with electronic charting workflows, giving them a real advantage in clinical placements.",
    name: "Prof. James Okonkwo",
    role: "Clinical Education Director",
  },
  {
    quote:
      "As a student, I love that the platform adapts to my skill level. The vitals monitoring scenarios helped me recognize deterioration signs that I later encountered in my actual hospital rotation.",
    name: "Maria Santos",
    role: "Senior Nursing Student",
  },
];

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-canvas">
      {/* ───────── Navbar ───────── */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ease-out ${scrolled
            ? "bg-surface/80 backdrop-blur-lg border-b border-hairline shadow-sm"
            : "bg-white/10 backdrop-blur-md border-b border-white/10"
          }`}
      >
        <div className="max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src={scrolled ? logo : logo_white}
              alt="iCARE++"
              className="h-9 w-auto transition-opacity duration-500"
              priority
            />
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className={`text-sm font-medium transition-colors duration-500 px-4 py-2 ${scrolled
                  ? "text-gray-600 hover:text-brand-600"
                  : "text-white/90 hover:text-white"
                }`}
            >
              Sign In
            </Link>
            <Link
              href="/signup"
              className={`text-sm font-medium px-5 py-2 rounded-xl transition-all duration-500 ${scrolled
                  ? "text-white bg-brand-600 hover:bg-brand-700 shadow-lg shadow-brand-600/20"
                  : "text-brand-700 bg-white hover:bg-white/90 shadow-lg shadow-black/10"
                }`}
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* ───────── Hero (text left, floating mockup right — like reference) ───────── */}
      <section className="relative min-h-screen flex items-center overflow-hidden bg-gradient-to-br from-[#0D7377] via-[#0A5C5F] to-[#084A4D]">
        <div className="absolute inset-0 opacity-[0.06]">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="heroGridMinor" width="28" height="28" patternUnits="userSpaceOnUse">
                <path d="M28 0H0v28" fill="none" stroke="#ffffff" strokeWidth="0.5" />
              </pattern>
              <pattern id="heroGridMajor" width="140" height="140" patternUnits="userSpaceOnUse">
                <path d="M140 0H0v140" fill="none" stroke="#ffffff" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#heroGridMinor)" />
            <rect width="100%" height="100%" fill="url(#heroGridMajor)" />
          </svg>
        </div>

        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-white/[0.06] rounded-full blur-3xl -translate-y-1/3 translate-x-1/3 animate-float-slow" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-[#7DD3D8]/10 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4 animate-float-medium" />
        <div
          className="absolute top-1/3 left-1/4 w-[300px] h-[300px] bg-white/[0.04] rounded-full blur-3xl animate-float-slow"
          style={{ animationDelay: "-3s" }}
        />

        <div className="relative z-10 w-full max-w-7xl mx-auto px-5 sm:px-8 py-20 pt-32">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left: copy */}
            <div className="max-w-xl">
              <div className="opacity-0 animate-fade-in-up">
                
              </div>
              <p className="opacity-0 animate-fade-in-up [animation-delay:100ms] text-[11px] font-semibold uppercase tracking-[0.28em] text-[#7DD3D8] mb-4">
                Clinical Competency Platform
              </p>
              <h1 className="opacity-0 animate-fade-in-up [animation-delay:200ms] text-4xl sm:text-5xl lg:text-6xl font-display font-bold text-white tracking-tight leading-[1.08] mb-6">
                Sharpen clinical judgment,
                <br />
                <span className="text-[#7DD3D8]">one scenario at a time.</span>
              </h1>
              <p className="opacity-0 animate-fade-in-up [animation-delay:300ms] text-lg sm:text-xl text-white/70 leading-relaxed mb-10">
                A scalable machine learning&ndash;driven clinical competency assessment and adaptive
                learning system for nursing students.
              </p>
              <div className="opacity-0 animate-fade-in-up [animation-delay:400ms] flex flex-wrap gap-4">
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-2 bg-white text-brand-700 hover:bg-white/90 font-semibold px-8 py-3.5 rounded-xl transition-all duration-200 shadow-xl shadow-black/10"
                >
                  Get Started Free
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 7l5 5m0 0l-5 5m5-5H6"
                    />
                  </svg>
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 text-white border border-white/30 hover:border-white/50 hover:bg-white/10 font-medium px-8 py-3.5 rounded-xl transition-all duration-200"
                >
                  Sign In
                </Link>
              </div>
            </div>

            {/* Right: floating mockup, like the plated cake + macarons in the reference */}
            <div className="hidden lg:block relative opacity-0 animate-fade-in-up [animation-delay:250ms]">
              <div className="relative mx-auto max-w-md">
                {/* main preview panel */}
                <div className="bg-white/10 backdrop-blur-sm rounded-3xl border border-white/15 p-4 shadow-2xl">
                  <div className="bg-surface rounded-2xl p-5 shadow-xl">
                    <div className="flex items-center gap-1.5 mb-4">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-300" />
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-300" />
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-300" />
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
                      Patient Vitals — Live
                    </p>
                    <svg viewBox="0 0 300 90" className="w-full h-20 mb-4">
                      <path
                        d="M0,50 L30,50 L40,25 L50,70 L60,50 L110,50 L120,20 L130,75 L140,50 L190,50 L200,30 L210,60 L220,50 L300,50"
                        fill="none"
                        stroke="var(--color-brand-600)"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Competency Score</span>
                        <span className="font-semibold text-brand-600">92%</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-brand-50 overflow-hidden">
                        <div className="h-full w-[92%] rounded-full bg-brand-600" />
                      </div>
                      <div className="flex items-center justify-between text-sm pt-1">
                        <span className="text-gray-500">Scenarios Completed</span>
                        <span className="font-semibold text-gray-900">14 / 16</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* floating badge 1 */}
                <div className="absolute -top-6 -left-8 bg-surface rounded-2xl shadow-xl border border-hairline px-4 py-3 flex items-center gap-3 animate-float-slow">
                  <div className="w-9 h-9 rounded-xl bg-brand-600/10 flex items-center justify-center text-brand-600 flex-shrink-0">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 leading-none">98% Accuracy</p>
                    <p className="text-[11px] text-gray-400 mt-1">ML Scoring Engine</p>
                  </div>
                </div>

                {/* floating badge 2 */}
                <div
                  className="absolute -bottom-8 -right-6 bg-surface rounded-2xl shadow-xl border border-hairline px-4 py-3 flex items-center gap-3 animate-float-medium"
                  style={{ animationDelay: "-2s" }}
                >
                  <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center text-rose-500 flex-shrink-0">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 leading-none">Live Vitals</p>
                    <p className="text-[11px] text-gray-400 mt-1">Real-time monitoring</p>
                  </div>
                </div>

                {/* small floating chip */}
                <div className="absolute top-1/2 -right-10 w-14 h-14 rounded-full bg-white shadow-xl border border-hairline flex items-center justify-center animate-float-slow">
                  <span className="text-[10px] font-bold text-brand-600 text-center leading-tight">AI<br />Powered</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-canvas to-transparent" />
      </section>

      {/* ───────── Platform Overview ───────── */}
      <section className="py-24 sm:py-32 bg-gradient-to-b from-canvas to-surface relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none">
          <svg className="w-full h-full" viewBox="0 0 1200 400" preserveAspectRatio="none">
            <path d="M0,200 L120,200 L140,160 L155,230 L170,200 L340,200 L360,140 L375,250 L390,200 L560,200 L580,170 L595,225 L610,200 L780,200 L800,130 L815,260 L830,200 L1000,200 L1020,175 L1035,220 L1050,200 L1200,200" fill="none" stroke="var(--color-brand-600)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
        <div className="absolute top-[-10%] right-[-5%] w-[300px] h-[300px] bg-brand-200/30 rounded-full blur-3xl" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[250px] h-[250px] bg-brand-300/20 rounded-full blur-3xl" />
        <div className="absolute bottom-8 right-12 opacity-[0.06] pointer-events-none">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="var(--color-brand-600)" strokeWidth="1.5">
            <path d="M24 8v32M8 24h32" strokeLinecap="round" />
            <circle cx="24" cy="24" r="20" strokeLinecap="round" />
            <path d="M14 24h20M24 14v20" strokeLinecap="round" opacity="0.5" />
          </svg>
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-5 sm:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <RevealSection>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brand-600 mb-4">
                Overview
              </p>
              <h2 className="text-3xl sm:text-4xl font-display font-bold text-gray-900 tracking-tight mb-6">
                What is iCARE++?
              </h2>
              <p className="text-base sm:text-lg text-gray-500 leading-relaxed">
                iCARE++ is a comprehensive clinical competency platform purpose-built for nursing
                education. It combines adaptive learning, realistic patient simulation, and machine
                learning&ndash;driven assessment to help students develop and demonstrate clinical
                competence. Educators gain real-time visibility into student progress, while
                administrators get the tools they need to manage programs at scale.
              </p>
            </RevealSection>
          </div>
        </div>
      </section>

      {/* ───────── Core Modules: 3-card grid + side panel (like the product grid + specials box) ───────── */}
      <section className="py-24 sm:py-32 bg-surface">
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <RevealSection>
            <div className="text-center max-w-2xl mx-auto mb-16">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brand-600 mb-4">
                Core Modules
              </p>
              <h2 className="text-3xl sm:text-4xl font-display font-bold text-gray-900 tracking-tight mb-4">
                Everything your program needs, in one place
              </h2>
              <p className="text-gray-500 leading-relaxed">
                Three pillars power every iCARE++ experience — practice, assessment, and insight.
              </p>
            </div>
          </RevealSection>

          <div className="grid lg:grid-cols-3 gap-6 lg:gap-8 items-stretch">
            <div className="lg:col-span-2 grid sm:grid-cols-3 gap-6">
              {quickModules.map((mod, i) => (
                <RevealCard key={mod.title} delay={i * 100}>
                  <div className="bg-canvas rounded-2xl border border-hairline p-6 h-full transition-all duration-200 hover:shadow-tile-hover hover:border-brand-200">
                    <div className="w-11 h-11 rounded-xl bg-brand-600/10 flex items-center justify-center text-brand-600 mb-5">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        {mod.icon}
                      </svg>
                    </div>
                    <h3 className="text-base font-semibold text-gray-900 mb-2">{mod.title}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">{mod.blurb}</p>
                  </div>
                </RevealCard>
              ))}
            </div>

            <RevealCard delay={300}>
              <div className="bg-gradient-to-br from-[#0D7377] via-[#0A5C5F] to-[#084A4D] rounded-2xl p-8 h-full flex flex-col text-white relative overflow-hidden">
                <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/[0.06] rounded-full blur-2xl" />
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#7DD3D8] mb-3 relative z-10">
                  For Your Program
                </p>
                <h3 className="text-xl font-semibold mb-3 relative z-10">
                  See where your students actually stand
                </h3>
                <p className="text-sm text-white/70 leading-relaxed mb-6 relative z-10">
                  Stop waiting for finals to find out who's struggling. Onboard your first cohort
                  and get visibility into every student's clinical competency from day one.
                </p>
                <ul className="space-y-2.5 mb-8 relative z-10">
                  {[
                    "Unlimited student accounts",
                    "AI scenario generator for faculty",
                    "Full competency analytics dashboard",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm text-white/80">
                      <svg className="w-4 h-4 text-[#7DD3D8] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className="mt-auto inline-flex items-center justify-center gap-2 bg-white text-brand-700 hover:bg-white/90 font-semibold px-6 py-3 rounded-xl transition-all duration-200 relative z-10"
                >
                  Get Started Free
                </Link>
              </div>
            </RevealCard>
          </div>
        </div>
      </section>

      {/* ───────── Product Tour ───────── */}
      <section className="py-24 sm:py-32 bg-gradient-to-b from-surface to-brand-50 relative overflow-hidden">
        <div className="absolute top-12 left-12 opacity-[0.04] pointer-events-none">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="var(--color-brand-600)" strokeWidth="1.5">
            <path d="M20 4v32M4 20h32" strokeLinecap="round" />
          </svg>
        </div>
        <div className="absolute bottom-[-10%] right-[-5%] w-[250px] h-[250px] bg-brand-200/25 rounded-full blur-3xl" />
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <RevealSection>
            <div className="text-center max-w-2xl mx-auto mb-16">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brand-600 mb-4">
                Product Tour
              </p>
              <h2 className="text-3xl sm:text-4xl font-display font-bold text-gray-900 tracking-tight mb-4">
                Explore everything iCARE++ has to offer
              </h2>
              <p className="text-gray-500 leading-relaxed">
                Take a guided tour through the platform&apos;s core capabilities — from clinical
                scenarios to AI-powered recommendations.
              </p>
            </div>
          </RevealSection>

          <div className="grid md:grid-cols-2 gap-x-12 gap-y-16">
            {tour.map((item, i) => (
              <RevealCard key={item.number} delay={i * 100}>
                <div className="flex gap-5">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 rounded-xl bg-brand-600/10 flex items-center justify-center text-brand-600 mb-3">
                      <svg
                        className="w-6 h-6"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        {item.icon}
                      </svg>
                    </div>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-400 ml-0.5">
                      Stop {item.number}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">{item.title}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed mb-4">
                      {item.description}
                    </p>
                    <ul className="space-y-1.5">
                      {item.capabilities.map((cap) => (
                        <li key={cap} className="flex items-start gap-2 text-sm text-gray-600">
                          <svg
                            className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="m4.5 12.75 6 6 9-13.5"
                            />
                          </svg>
                          {cap}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </RevealCard>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Who It's For ───────── */}
      <section className="py-24 sm:py-32 bg-gradient-to-b from-brand-50 to-surface relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
          <svg className="w-full h-full" viewBox="0 0 1200 400" preserveAspectRatio="none">
            <path d="M0,300 L100,300 L120,270 L135,320 L150,300 L250,300 L270,260 L285,330 L300,300 L400,300 L420,275 L435,315 L450,300 L550,300 L570,250 L585,340 L600,300 L700,300 L720,280 L735,320 L750,300 L850,300 L870,255 L885,335 L900,300 L1050,300 L1070,275 L1085,320 L1100,300 L1200,300" fill="none" stroke="var(--color-brand-600)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
        <div className="absolute top-1/2 right-[-10%] w-[350px] h-[350px] bg-brand-200/25 rounded-full blur-3xl" />
        <div className="absolute top-8 left-12 opacity-[0.05] pointer-events-none">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="var(--color-brand-600)" strokeWidth="1.5">
            <circle cx="16" cy="16" r="12" strokeLinecap="round" />
            <path d="M16 8v16M8 16h16" strokeLinecap="round" />
          </svg>
        </div>
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <RevealSection>
            <div className="text-center max-w-2xl mx-auto mb-16">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brand-600 mb-4">
                Who It&apos;s For
              </p>
              <h2 className="text-3xl sm:text-4xl font-display font-bold text-gray-900 tracking-tight mb-4">
                Designed for every role in nursing education
              </h2>
              <p className="text-gray-500 leading-relaxed">
                Whether you&apos;re a student honing your skills, faculty shaping the next
                generation, or an administrator overseeing the program — iCARE++ has you covered.
              </p>
            </div>
          </RevealSection>

          <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
            {roles.map((role, i) => (
              <RevealCard key={role.title} delay={i * 120}>
                <div className="bg-surface rounded-2xl border border-hairline p-7 h-full flex flex-col transition-all duration-200 hover:shadow-tile-hover hover:border-brand-200 group">
                  <div className="w-12 h-12 rounded-xl bg-brand-600/10 flex items-center justify-center text-brand-600 mb-5 transition-colors duration-200 group-hover:bg-brand-600 group-hover:text-white">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      {role.icon}
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">{role.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed mb-5">{role.description}</p>
                  <ul className="space-y-2 mb-6 flex-1">
                    {role.highlights.map((h) => (
                      <li key={h} className="flex items-start gap-2.5 text-sm text-gray-600">
                        <svg
                          className="w-4 h-4 text-brand-500 flex-shrink-0 mt-0.5"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                            clipRule="evenodd"
                          />
                        </svg>
                        {h}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={role.href}
                    className="inline-flex items-center justify-center gap-2 w-full text-sm font-medium text-brand-600 hover:text-white bg-brand-50 hover:bg-brand-600 border border-brand-200 hover:border-brand-600 px-5 py-2.5 rounded-xl transition-all duration-200"
                  >
                    {role.action}
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 7l5 5m0 0l-5 5m5-5H6"
                      />
                    </svg>
                  </Link>
                </div>
              </RevealCard>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Why iCARE++ ───────── */}
      <section className="py-24 sm:py-32 bg-gradient-to-b from-surface to-brand-50 relative overflow-hidden">
        <div className="absolute bottom-[-10%] right-[-5%] w-[300px] h-[300px] bg-brand-200/25 rounded-full blur-3xl" />
        <div className="absolute bottom-8 right-12 opacity-[0.05] pointer-events-none">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="var(--color-brand-600)" strokeWidth="1.5">
            <path d="M18 4v28M4 18h28" strokeLinecap="round" />
            <circle cx="18" cy="18" r="14" strokeLinecap="round" />
          </svg>
        </div>
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <RevealSection>
            <div className="text-center max-w-2xl mx-auto mb-16">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brand-600 mb-4">
                Why iCARE++
              </p>
              <h2 className="text-3xl sm:text-4xl font-display font-bold text-gray-900 tracking-tight mb-4">
                Built different. Built for better outcomes.
              </h2>
              <p className="text-gray-500 leading-relaxed">
                iCARE++ rethinks clinical education by replacing outdated approaches with
                technology that adapts to each learner.
              </p>
            </div>
          </RevealSection>

          <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
            {whyData.map((item, i) => (
              <RevealCard key={item.title} delay={i * 100}>
                <div className="bg-surface rounded-2xl border border-hairline p-6 sm:p-7 h-full transition-all duration-200 hover:shadow-tile-hover group">
                  <div className="w-11 h-11 rounded-xl bg-brand-600/10 flex items-center justify-center text-brand-600 mb-5 transition-colors duration-200 group-hover:bg-brand-600 group-hover:text-white">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      {item.icon}
                    </svg>
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 mb-4">{item.title}</h3>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-rose-100 flex items-center justify-center mt-0.5">
                        <svg
                          className="w-3.5 h-3.5 text-rose-500"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2.5}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </div>
                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-rose-500">
                          Traditional
                        </span>
                        <p className="text-sm text-gray-500 mt-0.5">{item.traditional}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center mt-0.5">
                        <svg
                          className="w-3.5 h-3.5 text-emerald-600"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2.5}
                            d="m4.5 12.75 6 6 9-13.5"
                          />
                        </svg>
                      </div>
                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
                          iCARE++
                        </span>
                        <p className="text-sm text-gray-900 mt-0.5">{item.icare}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </RevealCard>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Testimonials ───────── */}
      <section className="py-24 sm:py-32 bg-gradient-to-b from-brand-50 to-surface relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
          <svg className="w-full h-full" viewBox="0 0 1200 300" preserveAspectRatio="none">
            <path d="M0,150 L80,150 L95,120 L110,170 L125,150 L210,150 L225,130 L240,160 L255,150 L340,150 L355,125 L370,165 L385,150 L470,150 L485,140 L500,155 L515,150 L600,150 L615,120 L630,170 L645,150 L730,150 L745,135 L760,160 L775,150 L860,150 L875,115 L890,175 L905,150 L1000,150 L1015,130 L1030,165 L1045,150 L1200,150" fill="none" stroke="var(--color-brand-600)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
        <div className="absolute bottom-[-10%] right-[-8%] w-[300px] h-[300px] bg-brand-200/25 rounded-full blur-3xl" />
        <div className="absolute top-[-5%] left-[-8%] w-[200px] h-[200px] bg-brand-300/15 rounded-full blur-3xl" />
        <div className="absolute top-8 right-12 opacity-[0.05] pointer-events-none">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="var(--color-brand-600)" strokeWidth="1.5">
            <circle cx="14" cy="14" r="10" strokeLinecap="round" />
            <path d="M14 7v14M7 14h14" strokeLinecap="round" opacity="0.7" />
          </svg>
        </div>
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <RevealSection>
            <div className="text-center max-w-2xl mx-auto mb-16">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brand-600 mb-4">
                Testimonials
              </p>
              <h2 className="text-3xl sm:text-4xl font-display font-bold text-gray-900 tracking-tight mb-4">
                Trusted by educators and students alike
              </h2>
              <p className="text-gray-500 leading-relaxed">
                Hear from the nursing education community about how iCARE++ is making a difference.
              </p>
            </div>
          </RevealSection>

          <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
            {testimonials.map((t, i) => (
              <RevealCard key={t.name} delay={i * 120}>
                <div className="bg-surface rounded-2xl border border-hairline p-7 h-full flex flex-col transition-all duration-200 hover:shadow-tile-hover">
                  <div className="flex gap-1 mb-5">
                    {[...Array(5)].map((_, s) => (
                      <svg
                        key={s}
                        className="w-4 h-4 text-amber-400"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                  <blockquote className="text-sm text-gray-600 leading-relaxed mb-6 flex-1">
                    &ldquo;{t.quote}&rdquo;
                  </blockquote>
                  <div className="flex items-center gap-3 pt-4 border-t border-hairline">
                    <div className="w-10 h-10 rounded-full bg-brand-600/10 flex items-center justify-center text-brand-600 font-semibold text-sm">
                      {t.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">{t.name}</div>
                      <div className="text-xs text-gray-400">{t.role}</div>
                    </div>
                  </div>
                </div>
              </RevealCard>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── How It Works ───────── */}
      <section className="py-24 sm:py-32 bg-gradient-to-b from-surface to-brand-50 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.025] pointer-events-none">
          <svg className="w-full h-full" viewBox="0 0 1200 300" preserveAspectRatio="none">
            <path d="M0,200 L100,200 L115,170 L130,220 L145,200 L240,200 L255,180 L270,215 L285,200 L380,200 L395,160 L410,230 L425,200 L520,200 L535,185 L550,210 L565,200 L660,200 L675,155 L690,235 L705,200 L800,200 L815,175 L830,215 L845,200 L940,200 L955,190 L970,205 L985,200 L1100,200 L1115,165 L1130,225 L1145,200 L1200,200" fill="none" stroke="var(--color-brand-600)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
        <div className="absolute top-[-8%] left-1/2 w-[250px] h-[250px] bg-brand-100/30 rounded-full blur-3xl -translate-x-1/2" />
        <div className="absolute top-8 left-12 opacity-[0.04] pointer-events-none">
          <svg width="30" height="30" viewBox="0 0 30 30" fill="none" stroke="var(--color-brand-600)" strokeWidth="1.5">
            <path d="M15 4v22M4 15h22" strokeLinecap="round" />
            <circle cx="15" cy="15" r="11" strokeLinecap="round" opacity="0.6" />
          </svg>
        </div>
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <RevealSection>
            <div className="text-center max-w-2xl mx-auto mb-16">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brand-600 mb-4">
                How It Works
              </p>
              <h2 className="text-3xl sm:text-4xl font-display font-bold text-gray-900 tracking-tight mb-4">
                From assessment to mastery in three steps
              </h2>
              <p className="text-gray-500 leading-relaxed">
                iCARE++ guides nursing students through a complete learning cycle powered by machine
                learning.
              </p>
            </div>
          </RevealSection>

          <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
            {steps.map((step, i) => (
              <RevealCard key={step.step} delay={i * 150}>
                <div className="text-center">
                  <div className="w-16 h-16 rounded-2xl bg-brand-600/10 flex items-center justify-center mx-auto mb-6">
                    <svg
                      className="w-7 h-7 text-brand-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      {step.icon}
                    </svg>
                  </div>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-400 mb-2 block">
                    Step {step.step}
                  </span>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">{step.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed max-w-xs mx-auto">
                    {step.description}
                  </p>
                </div>
              </RevealCard>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── FAQ ───────── */}
      <section className="py-24 sm:py-32 bg-gradient-to-b from-brand-50 to-surface relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.025] pointer-events-none">
          <svg className="w-full h-full" viewBox="0 0 1200 200" preserveAspectRatio="none">
            <path d="M0,100 L100,100 L115,75 L130,120 L145,100 L240,100 L255,85 L270,110 L285,100 L380,100 L395,65 L410,130 L425,100 L520,100 L535,90 L550,108 L565,100 L660,100 L675,70 L690,125 L705,100 L800,100 L815,80 L830,115 L845,100 L940,100 L955,95 L970,105 L985,100 L1100,100 L1115,75 L1130,120 L1145,100 L1200,100" fill="none" stroke="var(--color-brand-600)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
        <div className="absolute top-1/2 left-[-10%] w-[300px] h-[300px] bg-brand-200/20 rounded-full blur-3xl -translate-y-1/2" />
        <div className="absolute bottom-8 right-12 opacity-[0.04] pointer-events-none">
          <svg width="34" height="34" viewBox="0 0 34 34" fill="none" stroke="var(--color-brand-600)" strokeWidth="1.5">
            <circle cx="17" cy="17" r="13" strokeLinecap="round" />
            <path d="M17 7v20M7 17h20" strokeLinecap="round" opacity="0.5" />
          </svg>
        </div>
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <RevealSection>
            <div className="text-center max-w-2xl mx-auto mb-12">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brand-600 mb-4">
                FAQ
              </p>
              <h2 className="text-3xl sm:text-4xl font-display font-bold text-gray-900 tracking-tight mb-4">
                Common questions about iCARE++
              </h2>
              <p className="text-gray-500 leading-relaxed">
                Everything you need to know about the platform. Still have questions?{" "}
                <span className="text-brand-600 font-medium">Get in touch.</span>
              </p>
            </div>
          </RevealSection>

          <RevealSection>
            <div className="max-w-3xl mx-auto bg-surface rounded-2xl border border-hairline divide-y divide-hairline px-6 sm:px-8">
              {faqs.map((faq) => (
                <FAQItem key={faq.question} question={faq.question} answer={faq.answer} />
              ))}
            </div>
          </RevealSection>
        </div>
      </section>

      {/* ───────── Our Story ───────── */}
      <section className="relative py-24 sm:py-32 overflow-hidden bg-gradient-to-br from-[#0D7377] via-[#0A5C5F] to-[#084A4D]">
        <div className="absolute inset-0 opacity-[0.05]">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="storyGrid" width="28" height="28" patternUnits="userSpaceOnUse">
                <path d="M28 0H0v28" fill="none" stroke="#ffffff" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#storyGrid)" />
          </svg>
        </div>
        <div className="absolute top-0 left-1/3 w-[350px] h-[350px] bg-white/[0.05] rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-[#7DD3D8]/10 rounded-full blur-3xl translate-y-1/3 translate-x-1/4" />

        <div className="relative z-10 max-w-7xl mx-auto px-5 sm:px-8 grid md:grid-cols-2 gap-12 items-center">
          <RevealSection>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#7DD3D8] mb-4">
              Our Story
            </p>
            <h2 className="text-3xl sm:text-4xl font-display font-bold text-white tracking-tight mb-5">
              Built by people who saw the gap firsthand
            </h2>
            <p className="text-white/70 leading-relaxed mb-5 max-w-lg">
              iCARE++ started with a simple observation: nursing students are evaluated on
              real-world clinical judgment, yet most training still relies on textbooks, static
              exams, and feedback that arrives weeks too late to matter.
            </p>
            <p className="text-white/70 leading-relaxed mb-8 max-w-lg">
              We set out to build something different — a platform that practices the way clinical
              work actually happens, scores fairly and consistently, and gives students the
              instant, specific feedback they need to genuinely improve before they ever step into
              a hospital ward.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 bg-white text-brand-700 hover:bg-white/90 font-semibold px-8 py-3.5 rounded-xl transition-all duration-200 shadow-xl shadow-black/10"
              >
                Get Started Free
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 text-white border border-white/30 hover:border-white/50 hover:bg-white/10 font-medium px-8 py-3.5 rounded-xl transition-all duration-200"
              >
                Sign In
              </Link>
            </div>
          </RevealSection>

          <RevealSection delay={150}>
            <div className="relative max-w-sm mx-auto">
              <div className="bg-white/10 backdrop-blur-sm rounded-3xl border border-white/15 p-4 shadow-2xl">
                <div className="bg-surface rounded-2xl p-6 shadow-xl">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-9 h-9 rounded-xl bg-brand-600/10 flex items-center justify-center text-brand-600">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
                        />
                      </svg>
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                      Our Mission
                    </p>
                  </div>

                  <div className="space-y-5">
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                        1
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900 leading-snug">Practice like it's real</p>
                        <p className="text-xs text-gray-500 mt-0.5">Realistic scenarios, not static case studies.</p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                        2
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900 leading-snug">Score without bias</p>
                        <p className="text-xs text-gray-500 mt-0.5">Consistent evaluation, every student, every time.</p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                        3
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900 leading-snug">Feedback that arrives in time</p>
                        <p className="text-xs text-gray-500 mt-0.5">Insight while it can still change the outcome.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full bg-white shadow-xl border border-hairline flex items-center justify-center animate-float-medium">
                <span className="text-[11px] font-bold text-brand-600 text-center leading-tight">
                  Why We
                  <br />
                  Built This
                </span>
              </div>
            </div>
          </RevealSection>
        </div>
      </section>

      {/* ───────── Footer ───────── */}
      <footer className="bg-surface border-t border-hairline py-12">
        <div className="max-w-7xl mx-auto px-5 sm:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <Image src={logo} alt="iCARE++" className="h-8 w-auto" />
              <span className="text-sm text-gray-400">
                &copy; {new Date().getFullYear()} iCARE++. All rights reserved.
              </span>
            </div>
            <div className="flex items-center gap-6">
              <Link
                href="/login"
                className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/signup"
                className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                Sign Up
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}