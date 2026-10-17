/**
 * The in-app Help & Support form, shared by the route and every portal's
 * page. The mobile app keeps its own copy of the topics (mobile/app/help.tsx);
 * a value it sends that isn't listed here is refused.
 */
export const SUPPORT_TOPICS = [
  { value: "problem", label: "Something isn't working" },
  { value: "question", label: "How do I…?" },
  { value: "account", label: "Account or sign-in" },
  { value: "suggestion", label: "Suggestion" },
  { value: "other", label: "Something else" },
] as const;

export type SupportTopic = (typeof SUPPORT_TOPICS)[number]["value"];

export const SUPPORT_LIMITS = { subject: 150, message: 4000, client: 80 };

export function supportTopicLabel(value: string): string | null {
  return SUPPORT_TOPICS.find((t) => t.value === value)?.label ?? null;
}
