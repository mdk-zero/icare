"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Icon, ICONS } from "./Icon";

const TOUR = [
  {
    number: "01",
    title: "Realistic Clinical Scenarios",
    description:
      "Students step into immersive, branching patient encounters that span medical-surgical, pediatrics, maternity, and critical care nursing. Every decision alters the patient’s trajectory, building clinical judgment in a safe environment.",
    capabilities: [
      "Dynamic vitals that react to interventions in real time",
      "Integrated EHR documentation within every case",
      "Branching storylines with multiple outcomes",
      "Covers all core nursing domains",
    ],
    icon: ICONS.documentSearch,
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
    icon: ICONS.presentation,
  },
  {
    number: "03",
    title: "Electronic Health Records",
    description:
      "A fully simulated EHR system lets students practice charting patient histories, documenting assessments, ordering labs, and reviewing results. Build clinical reasoning through structured, real-world documentation workflows.",
    capabilities: [
      "Chart patient histories, medications, and assessments",
      "Review lab results and diagnostic imaging",
      "Practice structured clinical reasoning workflows",
      "Faculty can review and provide feedback on entries",
    ],
    icon: ICONS.documentText,
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
    icon: ICONS.user,
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
    icon: ICONS.chart,
  },
  {
    number: "06",
    title: "AI-Powered Recommendations",
    description:
      "An intelligent recommendation engine suggests personalised learning paths based on each student’s performance history. Faculty receive actionable insights to target remediation where it matters most.",
    capabilities: [
      "Personalized learning paths based on performance data",
      "Suggested scenarios and quizzes to address weak areas",
      "Spaced repetition scheduling for knowledge retention",
      "Faculty insights for targeted remediation",
    ],
    icon: ICONS.lightBulb,
  },
];

/**
 * Six stops as a tab set: the list reads as a vertical index on desktop and a
 * swipeable strip on phones, with one detail panel either way. Arrow keys move
 * between stops (roving tabindex), as the WAI-ARIA tabs pattern expects.
 */
export default function ProductTour() {
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const stop = TOUR[active];

  const select = (index: number, focus = false) => {
    const next = (index + TOUR.length) % TOUR.length;
    setActive(next);
    const tab = tabRefs.current[next];
    if (focus) tab?.focus({ preventScroll: true });
    // Centre the chosen pill on the phone strip. Scrolled by hand rather than
    // scrollIntoView, which would also drag the page up to the strip when
    // Next is pressed at the foot of the panel. Nothing overflows on desktop.
    const list = listRef.current;
    if (list && tab && list.scrollWidth > list.clientWidth) {
      list.scrollTo({
        left: tab.offsetLeft - (list.clientWidth - tab.offsetWidth) / 2,
        behavior: "smooth",
      });
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const moves: Record<string, number> = {
      ArrowDown: active + 1,
      ArrowRight: active + 1,
      ArrowUp: active - 1,
      ArrowLeft: active - 1,
      Home: 0,
      End: TOUR.length - 1,
    };
    if (!(e.key in moves)) return;
    e.preventDefault();
    select(moves[e.key], true);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-12 lg:gap-10">
      <div
        ref={listRef}
        role="tablist"
        aria-label="Product tour stops"
        className="relative -mx-5 flex snap-x scroll-px-5 gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:-mx-8 sm:scroll-px-8 sm:px-8 lg:col-span-5 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden"
      >
        {TOUR.map((item, i) => {
          const selected = i === active;
          return (
            <button
              key={item.number}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`tour-tab-${item.number}`}
              aria-selected={selected}
              aria-controls="tour-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => select(i)}
              onKeyDown={onKeyDown}
              className={`group relative flex shrink-0 snap-start items-center gap-4 whitespace-nowrap rounded-2xl border px-4 py-3 text-left transition-all duration-300 lg:whitespace-normal lg:px-5 lg:py-4 ${
                selected
                  ? "border-brand-600/25 bg-surface shadow-tile-hover"
                  : "border-transparent hover:bg-surface/70"
              }`}
            >
              <span
                className={`font-mono text-xs transition-colors ${
                  selected ? "text-brand-600" : "text-gray-400"
                }`}
              >
                {item.number}
              </span>
              <span
                className={`flex-1 text-sm font-semibold transition-colors lg:text-base ${
                  selected ? "text-gray-900" : "text-gray-500 group-hover:text-gray-800"
                }`}
              >
                {item.title}
              </span>
              <Icon
                d={ICONS.arrowRight}
                strokeWidth={2}
                className={`hidden h-4 w-4 text-brand-600 transition-all duration-300 lg:block ${
                  selected ? "translate-x-0 opacity-100" : "-translate-x-2 opacity-0"
                }`}
              />
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id="tour-panel"
        aria-labelledby={`tour-tab-${stop.number}`}
        tabIndex={0}
        className="relative overflow-hidden rounded-3xl border border-hairline bg-canvas p-7 sm:p-10 lg:col-span-7"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-5 top-3 select-none font-display text-[6.5rem] font-bold leading-none tracking-tighter text-brand-600/[0.08] sm:right-8 sm:top-5 sm:text-[8.5rem]"
        >
          {stop.number}
        </span>

        {/* Keyed so each stop replays the entrance instead of swapping in place. */}
        <div key={stop.number} className="relative animate-rise">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/25">
            <Icon d={stop.icon} className="h-6 w-6" />
          </div>
          <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.2em] text-brand-600">
            Stop {stop.number} of {String(TOUR.length).padStart(2, "0")}
          </p>
          <h3 className="mt-2 font-display text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            {stop.title}
          </h3>
          <p className="mt-4 max-w-xl leading-relaxed text-gray-500">{stop.description}</p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {stop.capabilities.map((cap) => (
              <li
                key={cap}
                className="flex items-start gap-3 rounded-xl border border-hairline bg-surface p-3.5 text-sm leading-snug text-gray-700"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600/10 text-brand-600">
                  <Icon d={ICONS.check} strokeWidth={2.5} className="h-3 w-3" />
                </span>
                {cap}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mt-8 flex items-center justify-between border-t border-hairline pt-5">
          <div className="flex gap-1.5" aria-hidden="true">
            {TOUR.map((item, i) => (
              <span
                key={item.number}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === active ? "w-6 bg-brand-600" : "w-1.5 bg-gray-300"
                }`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => select(active - 1)}
              aria-label="Previous stop"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-hairline bg-surface text-gray-600 transition-colors hover:border-brand-300 hover:text-brand-700"
            >
              <Icon d={ICONS.chevronLeft} className="h-4 w-4" strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => select(active + 1)}
              aria-label="Next stop"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-hairline bg-surface text-gray-600 transition-colors hover:border-brand-300 hover:text-brand-700"
            >
              <Icon d={ICONS.chevronRight} className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
