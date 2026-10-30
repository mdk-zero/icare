import { ADMIN_ID, DEAN_ID, INSTRUCTOR_ID, KIND, ago, demoId, type DemoUser } from "./people";
import type { DemoNotification } from "./notifications";

/**
 * A stand-in screenshot, drawn rather than shipped as a file: a quiz results
 * table with an empty group, which is what the Instructor's request is about.
 */
const SCREENSHOT = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600" viewBox="0 0 960 600">
<rect width="960" height="600" fill="#f7fafb"/>
<rect x="0" y="0" width="960" height="56" fill="#1b6b7b"/>
<text x="28" y="35" font-family="system-ui, sans-serif" font-size="20" font-weight="700" fill="#fff">Quiz Results · Vital Signs</text>
<rect x="28" y="84" width="904" height="480" rx="14" fill="#fff" stroke="#e6edef"/>
<text x="56" y="128" font-family="system-ui, sans-serif" font-size="16" font-weight="600" fill="#334155">Group A</text>
<rect x="56" y="146" width="560" height="14" rx="7" fill="#d0ebea"/><rect x="56" y="146" width="410" height="14" rx="7" fill="#1b6b7b"/>
<text x="640" y="158" font-family="system-ui, sans-serif" font-size="14" fill="#64748b">12 of 12 submitted</text>
<text x="56" y="218" font-family="system-ui, sans-serif" font-size="16" font-weight="600" fill="#334155">Group B</text>
<rect x="56" y="236" width="560" height="14" rx="7" fill="#f1f5f9"/>
<text x="640" y="248" font-family="system-ui, sans-serif" font-size="14" fill="#b91c1c">0 of 11 submitted</text>
<rect x="56" y="300" width="848" height="64" rx="10" fill="#fef2f2" stroke="#fecaca"/>
<text x="80" y="338" font-family="system-ui, sans-serif" font-size="15" fill="#b91c1c">No results yet for this group.</text>
</svg>`)}`;

/** Help & Support requests in the demo Admin's inbox: one waiting, one answered, one resolved. */
export function seedSupportRequests(users: DemoUser[]): DemoNotification[] {
  const byId = (id: string) => users.find((u) => u.id === id);
  const instructor = byId(INSTRUCTOR_ID);
  const dean = byId(DEAN_ID);
  const student = users.find((u) => u.role === "student");
  const admin = byId(ADMIN_ID);
  let n = 8100;

  const request = (
    from: DemoUser | undefined,
    role: string,
    daysAgo: number,
    read: boolean,
    data: Record<string, unknown>,
  ): DemoNotification[] => {
    if (!from) return [];
    n += 1;
    const created_at = ago(daysAgo);
    const images = (data.attachments as unknown[] | undefined)?.length ?? 0;
    return [
      {
        id: demoId(KIND.notification, n),
        user_id: ADMIN_ID,
        type: "system",
        title: `Support request from ${from.name}`,
        body: `${role} · ${data.topic}: ${data.subject}${images ? ` · ${images} image${images === 1 ? "" : "s"}` : ""}`,
        data: {
          kind: "support_request",
          request_id: demoId(KIND.misc, n),
          user_id: from.id,
          name: from.name,
          email: from.email,
          role,
          section: null,
          client: "Web portal",
          attachments: [],
          replies: [],
          ...data,
        },
        read_at: read ? created_at : null,
        created_at,
      },
    ];
  };

  const deanReply = (deanAnswer: string) =>
    dean
      ? [
          {
            id: demoId(KIND.notification, 8199),
            user_id: dean.id,
            type: "system",
            title: "Support replied: Exporting the semester report",
            body: `${admin?.name ?? "iCARE++ Support"}: ${deanAnswer}\n\nThe full reply is in your email.`,
            data: { kind: "support_update", event: "replied", subject: "Exporting the semester report" },
            read_at: null,
            created_at: ago(1.3),
          },
        ]
      : [];
  const deanAnswer =
    "Hi Ramon, open Reports from the sidebar, pick the semester, and choose Download All Sections. It saves one PDF with a page per section.";

  return [
    ...deanReply(deanAnswer),
    ...request(instructor, "Instructor", 0.08, false, {
      status: "open",
      topic: "Something isn't working",
      subject: "Group B quiz results are empty",
      message:
        "Group B took the Vital Signs quiz this morning, but the results page still shows nobody has submitted. Group A's results show fine. Screenshot attached.",
      attachments: [{ path: "demo/quiz-results.svg", name: "quiz-results.png", type: "image/png", size: 48210, url: SCREENSHOT }],
    }),
    ...request(dean, "Dean", 1.4, true, {
      status: "answered",
      topic: "How do I…?",
      subject: "Exporting the semester report",
      message: "Where do I download the end-of-semester report for all my sections at once?",
      replies: [
        {
          id: demoId(KIND.misc, 8190),
          by: ADMIN_ID,
          by_name: admin?.name ?? "iCARE++ Support",
          message: deanAnswer,
          attachments: [],
          sent_at: ago(1.3),
        },
      ],
    }),
    ...request(student, "Student", 4.2, true, {
      status: "resolved",
      topic: "Account or sign-in",
      subject: "Can't sign in on my phone",
      message: "The app says my session expired every time I open it.",
      client: "Mobile app · android",
      replies: [
        {
          id: demoId(KIND.misc, 8191),
          by: ADMIN_ID,
          by_name: admin?.name ?? "iCARE++ Support",
          message: "Thanks for the report. Please update the app to the latest version and sign in again; that release fixes it.",
          attachments: [],
          sent_at: ago(4),
        },
      ],
      resolved_by_name: admin?.name ?? null,
      resolved_at: ago(3.8),
    }),
  ];
}
