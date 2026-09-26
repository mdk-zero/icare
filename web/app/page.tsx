import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import logo from "../public/logo-no-bg.png";
import logoWhite from "../public/logo-white-no-bg.png";
import sapiens from "../public/sapiens.png";
import { TAYLORS_CHAPTERS } from "../scripts/taylors-chapters";
import { EcgLoader } from "./components/EcgLoader";
import LandingNav from "./components/landing/LandingNav";
import Reveal from "./components/landing/Reveal";
import ProductTour from "./components/landing/ProductTour";
import { Icon, ICONS } from "./components/landing/Icon";

/*
 * Server-rendered: only the navbar, the scroll reveals and the product tour
 * ship as client components, so the copy below costs no JavaScript.
 */

const pillars = [
  {
    title: "Practice",
    text: "Branching patient scenarios with live vitals and EHR charting.",
  },
  {
    title: "Assess",
    text: "Checklist-graded tasks and adaptive skill assessments, scored the same way every time.",
  },
  {
    title: "Understand",
    text: "Competency dashboards for students, faculty and administrators.",
  },
];

const steps = [
  {
    step: "01",
    title: "Assess",
    description:
      "Students engage with realistic clinical scenarios that evaluate their current competency level across key nursing domains.",
    icon: ICONS.clock,
  },
  {
    step: "02",
    title: "Adapt",
    description:
      "The ML engine analyzes performance and dynamically adjusts scenario difficulty, focusing on individual knowledge gaps.",
    icon: ICONS.bolt,
  },
  {
    step: "03",
    title: "Excel",
    description:
      "Build clinical confidence with measurable progress, detailed feedback, and competency validation at every step.",
    icon: ICONS.star,
  },
];

/* Nobody self-registers: /signup is a contact form that asks the team for an
   account. Students already have one, so their card sends them to sign in. */
const roles = [
  {
    title: "Students",
    description:
      "Engage with adaptive scenarios, practice EHR charting, monitor live vitals, and track your competency growth through detailed analytics — all at your own pace.",
    action: "Sign in to practice",
    href: "/login",
    highlights: [
      "Adaptive scenarios and skill assessments",
      "EHR charting and vitals monitoring",
      "Personalized progress dashboard",
      "Competency tracking and feedback",
    ],
    icon: ICONS.academicCap,
  },
  {
    title: "Faculty",
    description:
      "Create scenarios and assessments with AI assistance, monitor student performance in real time, identify at-risk learners early, and generate comprehensive reports.",
    action: "Request faculty account activation",
    href: "/signup",
    highlights: [
      "AI-assisted scenario and assessment creation",
      "Real-time student performance monitoring",
      "At-risk student identification and alerts",
      "Detailed analytics and exportable reports",
    ],
    icon: ICONS.userGroup,
  },
  {
    title: "Administrators",
    description:
      "Manage students, faculty, and rooms from a single dashboard. Access institution-wide analytics, audit logs, and configuration settings to keep your program running smoothly.",
    action: "Request admin account activation",
    href: "/signup",
    highlights: [
      "Centralised user and room management",
      "Institution-wide analytics and reporting",
      "Full audit trail and compliance logs",
      "System configuration and settings",
    ],
    icon: ICONS.shieldCheck,
  },
];

const comparison = [
  {
    dimension: "Learning path",
    traditional: "All students follow the same curriculum regardless of existing skill gaps.",
    icare:
      "ML dynamically adjusts scenario difficulty and content to target each student’s weak areas.",
    icon: ICONS.bolt,
  },
  {
    dimension: "Scoring",
    traditional: "Competency scoring varies between evaluators, introducing bias.",
    icare: "Machine learning provides consistent, bias-free scoring across every attempt.",
    icon: ICONS.scale,
  },
  {
    dimension: "Practice",
    traditional: "Learning relies heavily on textbooks, lectures, and passive study.",
    icare: "Realistic patient scenarios build clinical judgment through active practice.",
    icon: ICONS.heart,
  },
  {
    dimension: "Feedback",
    traditional: "Feedback comes days or weeks after exams or clinical rotations.",
    icare:
      "Instant analytics and progress tracking give students and faculty actionable insights immediately.",
    icon: ICONS.chart,
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

const faqs = [
  {
    question: "Who can use iCARE++?",
    answer:
      "iCARE++ is designed for nursing students, faculty, and program administrators at institutions of all sizes — from diploma programs to university-level nursing schools. The platform supports multiple cohorts and can be configured for your program’s specific curriculum.",
  },
  {
    question: "How does the ML-driven assessment work?",
    answer:
      "The machine learning model analyzes every student response across scenarios, skill assessments, and EHR entries to build a detailed competency profile. It identifies knowledge gaps, adjusts difficulty in real time, and provides objective scoring that eliminates grading bias. Faculty get a clear picture of each student’s strengths and areas needing improvement.",
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
      "Absolutely. The platform supports medical-surgical, pediatrics, maternity, critical care, and community health nursing. Scenario difficulty can be calibrated from first-year fundamentals through advanced practice. Content is customizable to match your program’s specific competencies and curriculum.",
  },
  {
    question: "How is student data protected?",
    answer:
      "iCARE++ uses industry-standard encryption for data at rest and in transit, secure authentication via Supabase, and follows data privacy best practices including audit trails that record all access and changes. The platform is designed with FERPA and institutional compliance in mind.",
  },
];

const mission = [
  { title: "Practice like it’s real", text: "Realistic scenarios, not static case studies." },
  { title: "Score without bias", text: "Consistent evaluation, every student, every time." },
  {
    title: "Feedback that arrives in time",
    text: "Insight while it can still change the outcome.",
  },
];

const footerLinks = [
  {
    heading: "Explore",
    links: [
      { label: "Overview", href: "#overview" },
      { label: "How It Works", href: "#how-it-works" },
      { label: "Features", href: "#features" },
      { label: "Product Tour", href: "#modules" },
    ],
  },
  {
    heading: "Platform",
    links: [
      { label: "Who It’s For", href: "#who-its-for" },
      { label: "Why iCARE++", href: "#why" },
      { label: "FAQ", href: "#faq" },
    ],
  },
  {
    heading: "Account",
    links: [
      { label: "Sign In", href: "/login" },
      { label: "Contact Us", href: "/signup" },
    ],
  },
];

/* ───────── Shared pieces ───────── */

function Eyebrow({
  index,
  children,
  tone = "light",
  className = "",
}: {
  index: string;
  children: ReactNode;
  tone?: "light" | "dark";
  className?: string;
}) {
  const dark = tone === "dark";
  return (
    <p
      className={`flex items-center gap-3 font-mono text-[11px] font-medium uppercase tracking-[0.22em] ${
        dark ? "text-[#7DD3D8]" : "text-brand-600"
      } ${className}`}
    >
      <span className={dark ? "text-white/40" : "text-gray-400"}>{index}</span>
      <span aria-hidden="true" className={`h-px w-8 ${dark ? "bg-white/25" : "bg-brand-600/35"}`} />
      {children}
    </p>
  );
}

/** Eyebrow and title on the left, the intro dropped to the right column's
 *  baseline — the page's editorial header, used by most sections. */
function SectionHeader({
  index,
  eyebrow,
  title,
  intro,
}: {
  index: string;
  eyebrow: string;
  title: string;
  intro: string;
}) {
  return (
    <Reveal className="grid gap-6 lg:grid-cols-12 lg:items-end lg:gap-16">
      <div className="lg:col-span-7">
        <Eyebrow index={index}>{eyebrow}</Eyebrow>
        <h2 className="mt-5 font-display text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]">
          {brand(title)}
        </h2>
      </div>
      <p className="leading-relaxed text-gray-500 lg:col-span-5 lg:pb-1.5">{brand(intro)}</p>
    </Reveal>
  );
}

function PrimaryButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-2 rounded-full bg-brand-600 py-3.5 pl-7 pr-6 text-sm font-semibold text-white shadow-lg shadow-brand-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-xl hover:shadow-brand-600/30"
    >
      {children}
      <Icon
        d={ICONS.arrowRight}
        strokeWidth={2}
        className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
      />
    </Link>
  );
}

/** A check (or cross) in a small disc, for lists. */
function Mark({
  d = ICONS.check,
  className = "bg-brand-600/10 text-brand-600",
}: {
  d?: string;
  className?: string;
}) {
  return (
    <span
      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${className}`}
    >
      <Icon d={d} strokeWidth={2.5} className="h-3 w-3" />
    </span>
  );
}

function initials(name: string) {
  return name
    .replace(/^(Dr|Prof)\.\s+/, "")
    .split(" ")
    .map((n) => n[0])
    .join("");
}

/** Keeps "iCARE++" whole: a line may otherwise break between its plus signs. */
function brand(text: string): ReactNode {
  return text.split("iCARE++").flatMap((part, i) =>
    i === 0
      ? [part]
      : [
          <span key={i} className="whitespace-nowrap">
            iCARE++
          </span>,
          part,
        ],
  );
}

const delay = (ms: number) => ({ "--lp-delay": `${ms}ms` }) as CSSProperties;

/* ───────── Page ───────── */

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-canvas">
      <LandingNav />

      <main>
        {/* ───────── Hero ───────── */}
        <section className="relative overflow-hidden pb-16 pt-28 sm:pt-32 lg:flex lg:min-h-[min(calc(100svh-3.5rem),860px)] lg:items-center lg:pb-20 lg:pt-28">
          {/* Chart-paper grid, faded out toward the edges. */}
          <div
            aria-hidden="true"
            className="lp-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_75%_65%_at_65%_40%,#000_25%,transparent_75%)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-48 -top-24 h-[680px] w-[680px] rounded-full bg-brand-300/25 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-32 bottom-0 h-[260px] w-[260px] rounded-full bg-amber-200/25 blur-3xl sm:-left-40 sm:h-[420px] sm:w-[420px] sm:bg-amber-200/30"
          />

          <div className="relative mx-auto grid w-full max-w-7xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-12 lg:gap-8">
            {/* Copy */}
            <div className="lg:col-span-6">
              <p className="lp-enter inline-flex items-center gap-2.5 rounded-full border border-brand-600/15 bg-surface/70 py-1.5 pl-2.5 pr-4 text-xs font-medium text-gray-600 shadow-tile backdrop-blur">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                Clinical competency platform for nursing education
              </p>

              <h1
                className="lp-enter mt-7 font-display text-[2.6rem] font-bold leading-[1.02] tracking-[-0.035em] text-gray-900 sm:text-6xl lg:text-[3.6rem] xl:text-[4.1rem]"
                style={delay(80)}
              >
                Sharpen clinical{" "}
                <span className="relative inline-block whitespace-nowrap">
                  judgment,
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 300 24"
                    preserveAspectRatio="none"
                    className="absolute -bottom-1.5 left-0 h-3 w-full text-amber-400 sm:-bottom-2 sm:h-4"
                  >
                    <path
                      className="lp-underline"
                      pathLength={1}
                      d="M4 17 C 70 6, 170 4, 296 11"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="7"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>{" "}
                <span className="text-brand-600 dark:text-brand-700">one scenario at a time.</span>
              </h1>

              <p
                className="lp-enter mt-7 max-w-xl text-lg leading-relaxed text-gray-500 sm:text-xl"
                style={delay(160)}
              >
                A scalable machine learning&ndash;driven clinical competency assessment and adaptive
                learning system for nursing students.
              </p>

              <div className="lp-enter mt-10 flex flex-wrap items-center gap-3" style={delay(240)}>
                <PrimaryButton href="/signup">Contact Us</PrimaryButton>
                <a
                  href="#how-it-works"
                  className="group inline-flex items-center gap-2 rounded-full border border-hairline bg-surface/70 px-6 py-3.5 text-sm font-semibold text-gray-700 backdrop-blur transition-colors hover:border-brand-300 hover:text-brand-700"
                >
                  See how it works
                  <Icon
                    d={ICONS.arrowDown}
                    strokeWidth={2}
                    className="h-4 w-4 transition-transform duration-200 group-hover:translate-y-0.5"
                  />
                </a>
              </div>
            </div>

            {/* Illustration */}
            <div className="lp-enter relative lg:col-span-6" style={delay(200)}>
              <div className="relative mx-auto aspect-[1440/1280] w-full max-w-[640px]">
                {/* Drawn in the image's own coordinates: its pale disk is centred
                    at (720, 640) with a radius of about 528. */}
                <svg
                  aria-hidden="true"
                  viewBox="0 0 1440 1280"
                  className="absolute inset-0 h-full w-full overflow-visible"
                >
                  <defs>
                    <linearGradient id="lp-halo" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="var(--color-brand-100)" />
                      <stop offset="100%" stopColor="var(--color-brand-300)" stopOpacity="0.55" />
                    </linearGradient>
                  </defs>
                  <circle cx="752" cy="676" r="560" fill="url(#lp-halo)" />
                  <g className="lp-spin" style={{ transformOrigin: "720px 640px" }}>
                    <circle
                      cx="720"
                      cy="640"
                      r="628"
                      fill="none"
                      stroke="var(--color-brand-600)"
                      strokeOpacity="0.22"
                      strokeWidth="2.5"
                      strokeDasharray="3 16"
                      strokeLinecap="round"
                    />
                    <circle cx="720" cy="12" r="11" fill="#F2B94B" />
                    <circle cx="1348" cy="640" r="8" fill="var(--color-brand-500)" />
                    <circle cx="200" cy="990" r="7" fill="#E8765C" />
                  </g>
                </svg>

                <Image
                  src={sapiens}
                  alt="A student walks between a phone and a web dashboard, checking progress on the go"
                  className="relative h-auto w-full"
                  sizes="(min-width: 1280px) 640px, (min-width: 1024px) 50vw, 92vw"
                  loading="eager"
                  fetchPriority="high"
                />

                {/* Live vitals */}
                <div className="absolute -left-2 top-[3%] hidden w-[13.5rem] animate-float-medium rounded-2xl border border-hairline bg-surface/90 p-3.5 shadow-overlay backdrop-blur-md sm:block xl:-left-8">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-gray-400">
                      Bed 4 · Live
                    </span>
                    <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-rose-500">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
                      HR
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-end justify-between gap-2">
                    <p className="font-display text-3xl font-bold leading-none text-gray-900 tabular">
                      88
                      <span className="ml-1 font-sans text-xs font-medium text-gray-400">bpm</span>
                    </p>
                    <EcgLoader size="xl" className="text-rose-500" />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-1 border-t border-hairline pt-2.5 font-mono text-[10px] text-gray-400">
                    <span>
                      BP <b className="font-semibold text-gray-700">118/76</b>
                    </span>
                    <span className="text-center">
                      SpO₂ <b className="font-semibold text-gray-700">98</b>
                    </span>
                    <span className="text-right">
                      RR <b className="font-semibold text-gray-700">16</b>
                    </span>
                  </div>
                </div>

                {/* Competency ring */}
                <div
                  className="absolute right-0 top-[1%] hidden animate-float-slow items-center gap-3 rounded-2xl border border-hairline bg-surface/90 py-2.5 pl-2.5 pr-4 shadow-overlay backdrop-blur-md sm:flex xl:-right-4"
                  style={{ animationDelay: "-3s" }}
                >
                  <svg viewBox="0 0 40 40" className="h-11 w-11 -rotate-90" aria-hidden="true">
                    <circle
                      cx="20"
                      cy="20"
                      r="16"
                      fill="none"
                      stroke="var(--color-brand-100)"
                      strokeWidth="4.5"
                    />
                    <circle
                      cx="20"
                      cy="20"
                      r="16"
                      fill="none"
                      stroke="var(--color-brand-600)"
                      strokeWidth="4.5"
                      strokeLinecap="round"
                      pathLength={100}
                      strokeDasharray="92 100"
                    />
                  </svg>
                  <div>
                    <p className="font-display text-lg font-bold leading-none text-gray-900 tabular">
                      92%
                    </p>
                    <p className="mt-1 text-[11px] text-gray-500">Vital Signs</p>
                  </div>
                </div>

                {/* Checklist rating */}
                <div
                  className="absolute -right-3 bottom-[3%] hidden w-[15rem] animate-float-slow rounded-2xl border border-hairline bg-surface/90 p-3.5 shadow-overlay backdrop-blur-md sm:block xl:-right-10"
                  style={{ animationDelay: "-1.5s" }}
                >
                  <p className="font-mono text-[10px] uppercase tracking-wider text-gray-400">
                    Vital Signs · Apical pulse
                  </p>
                  <ul className="mt-2.5 space-y-2 text-xs">
                    {[
                      // One from the top, middle and bottom of the scale, so the
                      // card reads as grading rather than a row of praise.
                      {
                        task: "Hand hygiene",
                        rating: "Excellent",
                        tone: "bg-emerald-100 text-emerald-700",
                        performed: true,
                      },
                      {
                        task: "Identifies patient",
                        rating: "Satisfactory",
                        tone: "bg-blue-100 text-blue-700",
                        performed: true,
                      },
                      {
                        task: "Counts 1 minute",
                        rating: "Needs Practice",
                        tone: "bg-amber-100 text-amber-700",
                        performed: true,
                      },
                    ].map(({ task, rating, tone, performed }) => (
                      <li key={task} className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-gray-700">
                          <Icon
                            d={performed ? ICONS.check : ICONS.x}
                            strokeWidth={2.5}
                            className={`h-3 w-3 ${performed ? "text-brand-600" : "text-rose-500"}`}
                          />
                          {task}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${tone}`}
                        >
                          {rating}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ───────── Overview ───────── */}
        <section id="overview" className="scroll-mt-24 py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <Reveal>
              <Eyebrow index="01">Overview · What is iCARE++?</Eyebrow>
            </Reveal>
            <div className="mt-8 grid gap-12 lg:grid-cols-12 lg:gap-16">
              <Reveal className="lg:col-span-7">
                <h2 className="font-display text-3xl font-bold leading-[1.15] tracking-tight text-gray-900 sm:text-4xl lg:text-[2.9rem]">
                  Where nursing students{" "}
                  <span className="text-brand-600 dark:text-brand-700">practice patient care</span>,
                  get graded on the same skill checklists their clinical instructors use, and see{" "}
                  <span className="bg-gradient-to-t from-amber-300/70 from-30% to-transparent to-30% box-decoration-clone dark:from-amber-400/35">
                    exactly what to work on next.
                  </span>
                </h2>
              </Reveal>
              <Reveal className="lg:col-span-5 lg:pt-2" delay={120}>
                <p className="leading-relaxed text-gray-500 sm:text-lg">
                  iCARE++ is a comprehensive clinical competency platform purpose-built for nursing
                  education. It combines adaptive learning, realistic patient simulation, and
                  machine learning&ndash;driven assessment to help students develop and demonstrate
                  clinical competence. Educators gain real-time visibility into student progress,
                  while administrators get the tools they need to manage programs at scale.
                </p>
                <ol className="mt-10 divide-y divide-hairline border-y border-hairline">
                  {pillars.map((p, i) => (
                    <li key={p.title} className="flex gap-5 py-5">
                      <span className="pt-0.5 font-mono text-xs text-brand-600">0{i + 1}</span>
                      <div>
                        <p className="font-semibold text-gray-900">{p.title}</p>
                        <p className="mt-1 text-sm leading-relaxed text-gray-500">{p.text}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ───────── How It Works ───────── */}
        <section
          id="how-it-works"
          className="relative scroll-mt-24 overflow-hidden border-y border-hairline bg-surface py-24 sm:py-32"
        >
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <Reveal className="mx-auto max-w-2xl text-center">
              <Eyebrow index="02" className="justify-center">
                How it works
              </Eyebrow>
              <h2 className="mt-5 font-display text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl lg:text-[2.75rem]">
                From assessment to mastery in three steps
              </h2>
              <p className="mt-4 leading-relaxed text-gray-500">
                iCARE++ guides nursing students through a complete learning cycle powered by machine
                learning.
              </p>
            </Reveal>

            <Reveal className="relative mt-20">
              {/* A monitor trace runs node to node and draws itself on reveal;
                  the beats fall between the steps. */}
              <svg
                aria-hidden="true"
                viewBox="0 0 1200 64"
                preserveAspectRatio="none"
                className="absolute inset-x-0 top-8 hidden h-16 w-full -translate-y-1/2 md:block"
              >
                <path
                  className="lp-draw"
                  pathLength={1}
                  d="M0 32 H372 L382 32 L390 20 L400 50 L412 4 L424 44 L432 32 H772 L782 32 L790 20 L800 50 L812 4 L824 44 L832 32 H1200"
                  fill="none"
                  stroke="var(--color-brand-600)"
                  strokeOpacity="0.55"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <ol className="relative grid gap-14 md:grid-cols-3 md:gap-8">
                {steps.map((step, i) => (
                  <li key={step.step} className="lp-step text-center" style={delay(300 + i * 350)}>
                    <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-hairline bg-surface text-brand-600 shadow-tile ring-[10px] ring-surface">
                      <Icon d={step.icon} className="h-7 w-7" />
                      <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 font-mono text-[10px] font-semibold text-white">
                        {i + 1}
                      </span>
                    </div>
                    <p className="mt-7 font-mono text-[11px] uppercase tracking-[0.2em] text-gray-400">
                      Step {step.step}
                    </p>
                    <h3 className="mt-2 font-display text-2xl font-bold text-gray-900">
                      {step.title}
                    </h3>
                    <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-gray-500">
                      {step.description}
                    </p>
                  </li>
                ))}
              </ol>
            </Reveal>
          </div>
        </section>

        {/* ───────── Core Modules ───────── */}
        <section id="features" className="scroll-mt-24 py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <SectionHeader
              index="03"
              eyebrow="Core modules"
              title="Everything your program needs, in one place"
              intro="Three pillars power every iCARE++ experience — practice, assessment, and insight."
            />

            <div className="mt-14 grid gap-5 lg:grid-cols-6">
              {/* Scenarios */}
              <Reveal className="lg:col-span-4">
                <article className="group grid h-full items-center gap-8 overflow-hidden rounded-3xl border border-hairline bg-surface p-7 transition-shadow duration-300 hover:shadow-tile-hover sm:grid-cols-2 sm:p-9">
                  <div>
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-600/10 text-brand-600">
                      <Icon d={ICONS.documentSearch} />
                    </div>
                    <h3 className="mt-6 font-display text-2xl font-bold text-gray-900">
                      Immersive Scenarios
                    </h3>
                    <p className="mt-3 text-sm leading-relaxed text-gray-500">
                      Branching patient cases where every decision changes the outcome — not
                      multiple choice.
                    </p>
                  </div>
                  <div
                    aria-hidden="true"
                    className="rounded-2xl border border-hairline bg-canvas p-4"
                  >
                    <div className="rounded-xl border border-hairline bg-surface p-3.5 shadow-tile">
                      <p className="font-mono text-[10px] uppercase tracking-wider text-gray-400">
                        Post-op · Day 1
                      </p>
                      <p className="mt-1 text-sm font-semibold text-gray-900">
                        BP drops to 88/54 on standing
                      </p>
                    </div>
                    <div className="ml-4 space-y-2.5 border-l-2 border-dashed border-brand-300 pl-4 pt-3">
                      <div className="relative rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 transition-transform duration-300 before:absolute before:-left-[18px] before:top-1/2 before:h-0.5 before:w-4 before:bg-brand-300 group-hover:translate-x-1">
                        Return to bed, recheck vitals
                      </div>
                      <div className="relative rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 line-through decoration-rose-300 before:absolute before:-left-[18px] before:top-1/2 before:h-0.5 before:w-4 before:bg-brand-300">
                        Continue ambulating
                      </div>
                    </div>
                  </div>
                </article>
              </Reveal>

              {/* Scoring */}
              <Reveal className="lg:col-span-2" delay={100}>
                <article className="flex h-full flex-col rounded-3xl border border-hairline bg-surface p-7 transition-shadow duration-300 hover:shadow-tile-hover sm:p-8">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-600/10 text-brand-600">
                    <Icon d={ICONS.sparkles} />
                  </div>
                  <h3 className="mt-6 font-display text-2xl font-bold text-gray-900">
                    Bias-Free Scoring
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-gray-500">
                    The same response gets the same score, every time — no evaluator mood, no
                    inconsistency.
                  </p>
                  <div aria-hidden="true" className="mt-auto pt-7">
                    {/* The three Taylor's checklist levels, Excellent down to Needs Practice. */}
                    <div className="flex items-end gap-1">
                      {["h-10 bg-brand-600", "h-7 bg-brand-400", "h-4 bg-amber-300"].map((bar) => (
                        <span key={bar} className={`flex-1 rounded-md ${bar}`} />
                      ))}
                    </div>
                    <div className="mt-2 flex justify-between font-mono text-[9px] uppercase tracking-wider text-gray-400">
                      <span>Excellent</span>
                      <span>Needs practice</span>
                    </div>
                  </div>
                </article>
              </Reveal>

              {/* Insight */}
              <Reveal className="lg:col-span-2" delay={100}>
                <article className="flex h-full flex-col rounded-3xl border border-hairline bg-surface p-7 transition-shadow duration-300 hover:shadow-tile-hover sm:p-8">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-600/10 text-brand-600">
                    <Icon d={ICONS.chart} />
                  </div>
                  <h3 className="mt-6 font-display text-2xl font-bold text-gray-900">
                    Answers, Not Just Grades
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-gray-500">
                    Dashboards flag exactly which competencies are weak — days before an exam would.
                  </p>
                  <div aria-hidden="true" className="mt-auto space-y-3 pt-7">
                    {[
                      { area: "Vital Signs", pct: 92, bar: "bg-brand-600", flag: false },
                      { area: "Asepsis", pct: 81, bar: "bg-brand-500", flag: false },
                      { area: "Medications", pct: 58, bar: "bg-amber-400", flag: true },
                    ].map(({ area, pct, bar, flag }) => (
                      <div key={area}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-gray-700">{area}</span>
                          <span className="flex items-center gap-2 font-mono text-gray-500 tabular">
                            {flag && (
                              <span className="rounded-full bg-amber-100 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-amber-700">
                                Focus
                              </span>
                            )}
                            {pct}%
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
                          <div
                            className={`h-full rounded-full ${bar}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              </Reveal>

              {/* Program CTA */}
              <Reveal className="lg:col-span-4" delay={200}>
                <article className="relative grid h-full gap-8 overflow-hidden rounded-3xl bg-gradient-to-br from-[#0D7377] via-[#0A5C5F] to-[#084A4D] p-7 text-white sm:grid-cols-5 sm:p-9">
                  <div
                    aria-hidden="true"
                    className="lp-grid lp-grid-light pointer-events-none absolute inset-0 opacity-70 [mask-image:linear-gradient(120deg,transparent_30%,#000)]"
                  />
                  <div className="relative sm:col-span-3">
                    <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#7DD3D8]">
                      For your program
                    </p>
                    <h3 className="mt-3 font-display text-2xl font-bold sm:text-[1.75rem] sm:leading-tight">
                      See where your students actually stand
                    </h3>
                    <p className="mt-3 text-sm leading-relaxed text-white/70">
                      Stop waiting for finals to find out who’s struggling. Onboard your first
                      cohort and get visibility into every student’s clinical competency from day
                      one.
                    </p>
                  </div>
                  <div className="relative flex flex-col justify-between gap-6 sm:col-span-2">
                    <ul className="space-y-3">
                      {[
                        "Unlimited student accounts",
                        "AI scenario generator for faculty",
                        "Full competency analytics dashboard",
                      ].map((item) => (
                        <li key={item} className="flex items-start gap-2.5 text-sm text-white/85">
                          <Mark className="bg-white/10 text-[#7DD3D8]" />
                          {item}
                        </li>
                      ))}
                    </ul>
                    <Link
                      href="/signup"
                      className="group inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-brand-700 transition-colors hover:bg-white/90"
                    >
                      Contact Us
                      <Icon
                        d={ICONS.arrowRight}
                        strokeWidth={2}
                        className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
                      />
                    </Link>
                  </div>
                </article>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ───────── Product Tour ───────── */}
        <section
          id="modules"
          className="scroll-mt-24 border-y border-hairline bg-surface py-24 sm:py-32"
        >
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <SectionHeader
              index="04"
              eyebrow="Product tour"
              title="Explore everything iCARE++ has to offer"
              intro="Take a guided tour through the platform’s core capabilities — from clinical scenarios to AI-powered recommendations."
            />
            <Reveal className="mt-14">
              <ProductTour />
            </Reveal>
          </div>
        </section>

        {/* ───────── Who It's For ───────── */}
        <section id="who-its-for" className="scroll-mt-24 py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <SectionHeader
              index="05"
              eyebrow="Who it’s for"
              title="Designed for every role in nursing education"
              intro="Whether you’re a student honing your skills, faculty shaping the next generation, or an administrator overseeing the program — iCARE++ has you covered."
            />

            <Reveal className="mt-14">
              <div className="grid divide-y divide-hairline overflow-hidden rounded-3xl border border-hairline bg-surface lg:grid-cols-3 lg:divide-x lg:divide-y-0">
                {roles.map((role, i) => (
                  <article
                    key={role.title}
                    className="group relative flex flex-col p-8 transition-colors duration-300 hover:bg-subtle sm:p-10"
                  >
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 top-0 h-1 origin-left scale-x-0 bg-brand-600 transition-transform duration-500 group-hover:scale-x-100"
                    />
                    <div className="flex items-center justify-between">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600/10 text-brand-600 transition-colors duration-300 group-hover:bg-brand-600 group-hover:text-white">
                        <Icon d={role.icon} className="h-6 w-6" />
                      </div>
                      <span className="font-mono text-xs text-gray-400">0{i + 1}</span>
                    </div>
                    <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.22em] text-gray-400">
                      For
                    </p>
                    <h3 className="mt-1 font-display text-3xl font-bold tracking-tight text-gray-900">
                      {role.title}
                    </h3>
                    <p className="mt-4 text-sm leading-relaxed text-gray-500">{role.description}</p>
                    <ul className="mb-10 mt-6 space-y-2.5">
                      {role.highlights.map((h) => (
                        <li key={h} className="flex items-start gap-2.5 text-sm text-gray-700">
                          <Mark />
                          {h}
                        </li>
                      ))}
                    </ul>
                    <Link
                      href={role.href}
                      className="mt-auto inline-flex items-center gap-2 self-start text-sm font-semibold text-brand-600 transition-colors hover:text-brand-800"
                    >
                      {role.action}
                      <Icon
                        d={ICONS.arrowRight}
                        strokeWidth={2}
                        className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
                      />
                    </Link>
                  </article>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* ───────── Why iCARE++ ───────── */}
        <section
          id="why"
          className="scroll-mt-24 border-y border-hairline bg-surface py-24 sm:py-32"
        >
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <SectionHeader
              index="06"
              eyebrow="Why iCARE++"
              title="Built different. Built for better outcomes."
              intro="iCARE++ rethinks clinical education by replacing outdated approaches with technology that adapts to each learner."
            />

            <Reveal className="mt-14">
              <div className="overflow-hidden rounded-3xl border border-hairline">
                <div className="hidden grid-cols-12 border-b border-hairline bg-subtle md:grid">
                  <div className="col-span-3 px-6 py-4" />
                  <p className="col-span-4 px-6 py-4 font-mono text-[11px] uppercase tracking-[0.22em] text-gray-400">
                    Traditional approach
                  </p>
                  <p className="col-span-5 bg-brand-600/[0.07] px-6 py-4 font-mono text-[11px] uppercase tracking-[0.22em] text-brand-600">
                    With iCARE++
                  </p>
                </div>
                {comparison.map((row) => (
                  <div
                    key={row.dimension}
                    className="grid border-b border-hairline last:border-b-0 md:grid-cols-12"
                  >
                    <div className="flex items-center gap-4 px-6 pb-3 pt-6 md:col-span-3 md:py-6">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600/10 text-brand-600">
                        <Icon d={row.icon} />
                      </div>
                      <h3 className="font-display text-lg font-bold text-gray-900">
                        {row.dimension}
                      </h3>
                    </div>
                    <div className="flex items-start gap-3 px-6 py-3 md:col-span-4 md:py-6">
                      <Mark d={ICONS.x} className="bg-rose-100 text-rose-500" />
                      <p className="text-sm leading-relaxed text-gray-500">
                        <span className="mr-1.5 font-mono text-[10px] uppercase tracking-wider text-gray-400 md:hidden">
                          Traditional ·
                        </span>
                        {row.traditional}
                      </p>
                    </div>
                    <div className="flex items-start gap-3 bg-brand-600/[0.07] px-6 pb-6 pt-4 md:col-span-5 md:py-6">
                      <Mark className="bg-brand-600 text-white" />
                      <p className="text-sm font-medium leading-relaxed text-gray-800">
                        <span className="mr-1.5 font-mono text-[10px] uppercase tracking-wider text-brand-600 md:hidden">
                          iCARE++ ·
                        </span>
                        {row.icare}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* ───────── Testimonials ───────── */}
        <section id="testimonials" className="scroll-mt-24 py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <SectionHeader
              index="07"
              eyebrow="Testimonials"
              title="Trusted by educators and students alike"
              intro="Hear from the nursing education community about how iCARE++ is making a difference."
            />

            <div className="mt-14 grid gap-5 lg:grid-cols-12">
              <Reveal className="lg:col-span-7">
                <figure className="relative flex h-full flex-col overflow-hidden rounded-3xl border border-hairline bg-surface p-8 sm:p-12">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 48 36"
                    className="h-10 w-12 text-amber-400"
                    fill="currentColor"
                  >
                    <path d="M0 36V22.2C0 9.9 6.3 2.5 18.9 0l1.8 4.6C14 6.3 10.7 10 10.4 15.6H19V36H0zm29 0V22.2C29 9.9 35.3 2.5 47.9 0l1.8 4.6C43 6.3 39.7 10 39.4 15.6H48V36H29z" />
                  </svg>
                  <blockquote className="mt-8 font-display text-2xl font-semibold leading-snug tracking-tight text-gray-900 sm:text-[1.9rem] sm:leading-[1.3]">
                    {brand(testimonials[0].quote)}
                  </blockquote>
                  <figcaption className="mt-auto flex items-center gap-4 pt-10">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 font-semibold text-white">
                      {initials(testimonials[0].name)}
                    </span>
                    <span>
                      <span className="block font-semibold text-gray-900">
                        {testimonials[0].name}
                      </span>
                      <span className="block text-sm text-gray-500">{testimonials[0].role}</span>
                    </span>
                  </figcaption>
                </figure>
              </Reveal>
              <div className="grid gap-5 lg:col-span-5">
                {testimonials.slice(1).map((t, i) => (
                  <Reveal key={t.name} delay={120 + i * 120}>
                    <figure className="flex h-full flex-col rounded-3xl border border-hairline bg-surface p-7 sm:p-8">
                      <blockquote className="leading-relaxed text-gray-600">
                        &ldquo;{brand(t.quote)}&rdquo;
                      </blockquote>
                      <figcaption className="mt-auto flex items-center gap-3 pt-6">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600/10 text-sm font-semibold text-brand-700">
                          {initials(t.name)}
                        </span>
                        <span>
                          <span className="block text-sm font-semibold text-gray-900">
                            {t.name}
                          </span>
                          <span className="block text-xs text-gray-500">{t.role}</span>
                        </span>
                      </figcaption>
                    </figure>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ───────── FAQ ───────── */}
        <section
          id="faq"
          className="scroll-mt-24 border-t border-hairline bg-surface py-24 sm:py-32"
        >
          <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-12 lg:gap-16">
            <Reveal className="lg:col-span-4">
              <div className="lg:sticky lg:top-28">
                <Eyebrow index="08">FAQ</Eyebrow>
                <h2 className="mt-5 font-display text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                  Common questions about <span className="whitespace-nowrap">iCARE++</span>
                </h2>
                <p className="mt-4 leading-relaxed text-gray-500">
                  Everything you need to know about the platform, from who it serves to how student
                  data is kept safe.
                </p>
              </div>
            </Reveal>
            <Reveal className="lg:col-span-8" delay={100}>
              <div className="lp-faq border-t border-hairline">
                {faqs.map((faq, i) => (
                  <details
                    key={faq.question}
                    name="landing-faq"
                    open={i === 0}
                    className="group border-b border-hairline"
                  >
                    <summary className="flex cursor-pointer list-none items-center gap-5 py-6 [&::-webkit-details-marker]:hidden">
                      <span className="w-6 shrink-0 font-mono text-xs text-gray-400 transition-colors group-open:text-brand-600">
                        0{i + 1}
                      </span>
                      <span className="flex-1 text-base font-semibold text-gray-900 sm:text-lg">
                        {brand(faq.question)}
                      </span>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-hairline text-gray-500 transition-all duration-300 group-open:rotate-45 group-open:border-brand-600 group-open:bg-brand-600 group-open:text-white">
                        <Icon d={ICONS.plus} strokeWidth={2} className="h-4 w-4" />
                      </span>
                    </summary>
                    <p className="pb-7 pl-11 pr-4 leading-relaxed text-gray-500 sm:pr-14">
                      {brand(faq.answer)}
                    </p>
                  </details>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* ───────── Our Story + closing CTA ───────── */}
        <section
          id="story"
          className="relative scroll-mt-24 overflow-hidden bg-gradient-to-br from-[#0D7377] via-[#0A5C5F] to-[#084A4D] py-24 text-white sm:py-32"
        >
          <div
            aria-hidden="true"
            className="lp-grid lp-grid-light pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_70%_60%_at_20%_20%,#000,transparent_80%)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-40 -right-32 h-[480px] w-[480px] rounded-full bg-[#7DD3D8]/10 blur-3xl"
          />

          <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
            <div className="grid gap-14 lg:grid-cols-12 lg:gap-16">
              <Reveal className="lg:col-span-6">
                <Eyebrow index="09" tone="dark">
                  Our story
                </Eyebrow>
                <h2 className="mt-5 font-display text-3xl font-bold tracking-tight sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]">
                  Built by people who saw the gap firsthand
                </h2>
                <p className="mt-6 max-w-lg leading-relaxed text-white/70">
                  iCARE++ started with a simple observation: nursing students are evaluated on
                  real-world clinical judgment, yet most training still relies on textbooks, static
                  exams, and feedback that arrives weeks too late to matter.
                </p>
                <p className="mt-5 max-w-lg leading-relaxed text-white/70">
                  We set out to build something different — a platform that practices the way
                  clinical work actually happens, scores fairly and consistently, and gives students
                  the instant, specific feedback they need to genuinely improve before they ever
                  step into a hospital ward.
                </p>
              </Reveal>

              <Reveal className="lg:col-span-6" delay={120}>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#7DD3D8]">
                  Our mission
                </p>
                <ol className="mt-5 divide-y divide-white/10 border-y border-white/10">
                  {mission.map((m, i) => (
                    <li key={m.title} className="flex items-center gap-6 py-6">
                      <span className="w-12 shrink-0 font-display text-4xl font-bold text-white/25 tabular">
                        0{i + 1}
                      </span>
                      <div>
                        <p className="text-lg font-semibold">{m.title}</p>
                        <p className="mt-1 text-sm text-white/60">{m.text}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </Reveal>
            </div>

            <Reveal className="mt-20">
              <div className="flex flex-col items-start justify-between gap-8 rounded-3xl border border-white/15 bg-white/[0.06] p-8 backdrop-blur-sm sm:p-10 md:flex-row md:items-center">
                <div className="max-w-xl">
                  <h3 className="font-display text-2xl font-bold sm:text-3xl">
                    Ready to sharpen clinical judgment?
                  </h3>
                  <p className="mt-2 text-white/65">
                    Faculty and administrators can create an account today. Students sign in with
                    the account from their program.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link
                    href="/signup"
                    className="group inline-flex items-center gap-2 rounded-full bg-white py-3.5 pl-7 pr-6 text-sm font-semibold text-brand-700 shadow-xl shadow-black/10 transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/90"
                  >
                    Contact Us
                    <Icon
                      d={ICONS.arrowRight}
                      strokeWidth={2}
                      className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
                    />
                  </Link>
                  <Link
                    href="/login"
                    className="inline-flex items-center rounded-full border border-white/30 px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:border-white/60 hover:bg-white/10"
                  >
                    Sign In
                  </Link>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      {/* ───────── Footer ───────── */}
      <footer className="border-t border-hairline bg-surface">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
          <div className="grid gap-12 md:grid-cols-12">
            <div className="md:col-span-5">
              <Image src={logo} alt="iCARE++" className="h-9 w-auto dark:hidden" />
              <Image src={logoWhite} alt="iCARE++" className="hidden h-9 w-auto dark:block" />
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-gray-500">
                A machine learning&ndash;driven clinical competency assessment and adaptive learning
                system for nursing students.
              </p>
            </div>
            <nav
              aria-label="Footer"
              className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:col-span-7"
            >
              {footerLinks.map((group) => (
                <div key={group.heading}>
                  <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-gray-400">
                    {group.heading}
                  </p>
                  <ul className="mt-4 space-y-2.5">
                    {group.links.map((link) => (
                      <li key={link.label}>
                        <Link
                          href={link.href}
                          className="text-sm text-gray-600 transition-colors hover:text-brand-600"
                        >
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </div>
          <div className="mt-12 flex flex-col gap-2 border-t border-hairline pt-6 text-xs text-gray-400 sm:flex-row sm:items-center sm:justify-between">
            <p>&copy; {new Date().getFullYear()} iCARE++. All rights reserved.</p>
            <p>Scenario content grounded in Taylor’s Clinical Nursing Skills checklists.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
