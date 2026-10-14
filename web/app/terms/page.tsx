import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { type LegalSection } from "../components/LegalPage";
import { LEGAL } from "../lib/legal";

export const metadata: Metadata = {
  title: "Terms of Use · iCARE++",
  description: "The rules for using the iCARE++ mobile app and website.",
};

const sections: LegalSection[] = [
  {
    id: "about",
    title: "About iCARE++",
    body: (
      <p>
        iCARE++ is a clinical competency system provided by {LEGAL.school} to its nursing students, instructors and
        administrators. It holds simulated Patient Cases, quizzes, Case Presentations, clinical skills and the progress
        and grades that come from them. These terms apply to the iCARE++ mobile app and website.
      </p>
    ),
  },
  {
    id: "accounts",
    title: "Your account",
    body: (
      <ul>
        <li>Your school creates your account. Only students and staff of the school may use iCARE++.</li>
        <li>
          Keep your password to yourself and change the temporary password you were given. You are responsible for what
          is done with your account.
        </li>
        <li>Tell your instructor or the school right away if you think someone else has used your account.</li>
        <li>Your account ends when you leave the program, or earlier if the school suspends it for a breach of these terms.</li>
      </ul>
    ),
  },
  {
    id: "use",
    title: "Acceptable use",
    body: (
      <>
        <p>When you use iCARE++, you agree not to:</p>
        <ul>
          <li>submit work that is not your own, share quiz answers, or help another student cheat;</li>
          <li>enter real patient names or any detail that identifies a real patient;</li>
          <li>upload anything unlawful, offensive or that you have no right to share;</li>
          <li>try to see data that is not yours, get around access controls, or disrupt the system;</li>
          <li>copy, resell or publish course content outside the program.</li>
        </ul>
        <p>Breaking these rules may lead to suspension of your account and to action under the school&apos;s policies.</p>
      </>
    ),
  },
  {
    id: "learning",
    title: "Learning, not clinical advice",
    body: (
      <p>
        Patient Cases, vital signs and any AI-generated tips or feedback are for education only. They are not medical
        advice and must not be used to care for real patients. Always follow your clinical instructor, your school&apos;s
        protocols and the policies of the facility you train in.
      </p>
    ),
  },
  {
    id: "ai",
    title: "AI features",
    body: (
      <p>
        Some features use AI to suggest study tips, summarize performance or draft content. AI output can be wrong or
        incomplete, so treat it as a suggestion. Grades and decisions about your progress are made by your instructors,
        not by AI. How AI features handle your data is explained in the{" "}
        <Link href="/privacy#ai" className="text-brand-700 hover:underline">
          Privacy Policy
        </Link>
        .
      </p>
    ),
  },
  {
    id: "content",
    title: "Content and ownership",
    body: (
      <p>
        Course materials, cases and quizzes belong to the school or their authors. The work you submit stays yours; you
        allow the school to store, grade and review it for your program, as the Privacy Policy describes.
      </p>
    ),
  },
  {
    id: "notifications",
    title: "Notifications and permissions",
    body: (
      <p>
        The app can send notifications about new cases, grades, deadlines and messages, and can use your photo library
        or camera to set a profile picture. Both need your permission, and you can turn either off in your phone&apos;s
        Settings. The app keeps working without them.
      </p>
    ),
  },
  {
    id: "availability",
    title: "Availability",
    body: (
      <p>
        We work to keep iCARE++ available and your work safe, but the service may be interrupted for maintenance or by
        problems outside our control. Work done offline is saved on your phone and sent when you are back online. To the
        extent the law allows, iCARE++ is provided as it is, without warranties.
      </p>
    ),
  },
  {
    id: "privacy",
    title: "Privacy",
    body: (
      <p>
        Your personal data is handled as described in the{" "}
        <Link href="/privacy" className="text-brand-700 hover:underline">
          Privacy Policy
        </Link>
        , in line with the Data Privacy Act of 2012.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to these terms",
    body: (
      <p>
        If we change these terms, we will update the effective date above and tell you in the app. Continuing to use
        iCARE++ after a change means you accept the new terms. These terms are governed by the laws of the Philippines.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Use"
      intro={
        <p>
          These terms set out the rules for using iCARE++. By signing in to the app or the website, you agree to them.
          Please also read the{" "}
          <Link href="/privacy" className="text-brand-700 hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      }
      sections={sections}
      other={{ href: "/privacy", label: "Privacy Policy" }}
    />
  );
}
