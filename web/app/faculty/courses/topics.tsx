import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarCheck,
  faFilePen,
  faFilePrescription,
  faFlask,
  faHandHoldingMedical,
  faListCheck,
  faNotesMedical,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  TOPIC_ORDER,
  requirementNames,
  topicKey,
  type RequirementRow,
  type RequirementTopicKey,
} from "../../lib/course-progress";

export interface TopicStyle {
  key: RequirementTopicKey;
  /** The section's name: "Patient Cases". */
  label: string;
  icon: IconDefinition;
  /** How items in the section are met. */
  blurb: string;
  /** Icon tile: tinted fill and foreground. */
  tile: string;
  /** Accent rule over a section. */
  bar: string;
  text: string;
}

/**
 * Each kind of checklist item has its own icon (the sidebar's, where it has
 * one) and accent, so a section reads as Patient Cases or Quizzes at a
 * glance rather than as one long list. The accents stay clear of the status
 * colours a cell uses (emerald met, amber not yet), and Lab Activities share
 * the violet of a score you entered.
 */
export const TOPICS: Record<RequirementTopicKey, TopicStyle> = {
  scenario: {
    key: "scenario",
    label: "Patient Cases",
    icon: faNotesMedical,
    blurb: "Met by graded Patient Cases",
    tile: "bg-teal-50 text-teal-700",
    bar: "bg-teal-500",
    text: "text-teal-700",
  },
  assessment: {
    key: "assessment",
    label: "Quizzes",
    icon: faListCheck,
    blurb: "Met by submitted Quizzes",
    tile: "bg-sky-50 text-sky-700",
    bar: "bg-sky-500",
    text: "text-sky-700",
  },
  case_presentation: {
    key: "case_presentation",
    label: "Case Presentations",
    icon: faFilePrescription,
    blurb: "Met by graded Case Presentations",
    tile: "bg-rose-50 text-rose-700",
    bar: "bg-rose-500",
    text: "text-rose-700",
  },
  skill: {
    key: "skill",
    label: "Skills",
    icon: faHandHoldingMedical,
    blurb: "Met by graded work on the skill",
    tile: "bg-indigo-50 text-indigo-700",
    bar: "bg-indigo-500",
    text: "text-indigo-700",
  },
  exam: {
    key: "exam",
    label: "Written Exams",
    icon: faFilePen,
    blurb: "Scores you enter",
    tile: "bg-fuchsia-50 text-fuchsia-700",
    bar: "bg-fuchsia-500",
    text: "text-fuchsia-700",
  },
  manual: {
    key: "manual",
    label: "Lab Activities",
    icon: faFlask,
    blurb: "You enter each student's score",
    tile: "bg-violet-50 text-violet-700",
    bar: "bg-violet-500",
    text: "text-violet-700",
  },
  shift: {
    key: "shift",
    label: "Attendance",
    icon: faCalendarCheck,
    blurb: "Counted from shift attendance",
    tile: "bg-slate-100 text-slate-700",
    bar: "bg-slate-400",
    text: "text-slate-700",
  },
};

export const topicOf = (req: Pick<RequirementRow, "kind" | "activity_type">) => TOPICS[topicKey(req)];

export function TopicIcon({ topic, size = "md" }: { topic: TopicStyle; size?: "sm" | "md" }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-lg ${topic.tile} ${size === "sm" ? "h-5 w-5 rounded-md" : "h-8 w-8"}`}
      aria-hidden
    >
      <FontAwesomeIcon icon={topic.icon} className={size === "sm" ? "h-2.5 w-2.5" : "h-3.5 w-3.5"} />
    </span>
  );
}

export interface TopicGroup<R> {
  topic: TopicStyle;
  items: { requirement: R; name: string }[];
}

/**
 * The checklist as sections, in TOPIC_ORDER, each item with its "Quiz #2"
 * name. Pass the checklist in its saved order: names number each topic in
 * that order.
 */
export function groupByTopic<R extends RequirementRow>(requirements: readonly R[]): TopicGroup<R>[] {
  const names = requirementNames(requirements);
  return TOPIC_ORDER.map((key) => ({
    topic: TOPICS[key],
    items: requirements.map((requirement, i) => ({ requirement, name: names[i] })).filter(({ requirement }) => topicKey(requirement) === key),
  })).filter((g) => g.items.length > 0);
}
