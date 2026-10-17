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

/**
 * Images sent as proof, by the person asking and by the Admin answering.
 * The per-file cap stays under the platform's ~4.5 MB request body limit,
 * since each image goes up through the API; clients shrink anything bigger
 * before sending it.
 */
export const SUPPORT_ATTACHMENTS = {
  max: 4,
  maxBytes: 4 * 1024 * 1024,
  types: ["image/jpeg", "image/png", "image/webp", "image/gif"],
} as const;

/** An uploaded image as the client sends it back with a message. */
export type SupportAttachment = { path: string; name: string; type: string; size: number };

/**
 * open: nobody has answered yet. answered: an Admin replied by email.
 * resolved: an Admin closed it; replying again reopens it as answered.
 */
export type SupportStatus = "open" | "answered" | "resolved";

export const SUPPORT_REPLY_LIMIT = 4000;
