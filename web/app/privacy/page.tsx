import type { Metadata } from "next";
import LegalPage, { type LegalSection } from "../components/LegalPage";
import { LEGAL } from "../lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy · iCARE++",
  description: "What personal data iCARE++ collects, why, who it is shared with, and your rights under the Data Privacy Act of 2012.",
};

const sections: LegalSection[] = [
  {
    id: "who",
    title: "Who is responsible for your data",
    body: (
      <>
        <p>
          iCARE++ is a clinical competency system used by {LEGAL.school} for its nursing students and faculty. The school
          is the personal information controller for the data in iCARE++ and decides how it is used for teaching and
          assessment. The iCARE++ team runs the system for the school.
        </p>
        <p>
          We follow Republic Act No. 10173, the Data Privacy Act of 2012, its Implementing Rules and Regulations, and the
          issuances of the National Privacy Commission.
        </p>
      </>
    ),
  },
  {
    id: "collect",
    title: "What we collect",
    body: (
      <>
        <p>We collect only what the school needs to run its clinical courses:</p>
        <ul>
          <li>
            <strong>Account details:</strong> your name, school email, role (student, instructor or administrator),
            section and clinical group. Your school creates your account; you cannot sign up from the app.
          </li>
          <li>
            <strong>Profile photo:</strong> only if you choose one, from your camera or photo library.
          </li>
          <li>
            <strong>Your coursework:</strong> Patient Case work and the steps you complete, quiz answers and scores, Case
            Presentations, reflections, attendance at clinical shifts, and the grades and feedback your instructors give.
          </li>
          <li>
            <strong>Requests you send:</strong> assistance requests to your instructor and the messages in them.
          </li>
          <li>
            <strong>Device and security records:</strong> sign-in times, the IP address and browser or app version used
            for actions in the system (kept as an audit trail), and, if you allow notifications, a push token that lets
            us send notifications to your phone.
          </li>
          <li>
            <strong>Error reports:</strong> when something breaks on the website, a technical report of the error. On a
            small share of website visits, and on visits where an error happens, a recording of how the page behaved,
            with all text, form fields and images hidden. It is used only to find and fix bugs.
          </li>
        </ul>
        <p>
          Patients in iCARE++ are simulated teaching cases, not real people. Do not enter real patient names or other
          details that identify a real patient.
        </p>
      </>
    ),
  },
  {
    id: "use",
    title: "How we use it",
    body: (
      <ul>
        <li>To sign you in and show you the courses, cases and quizzes meant for you.</li>
        <li>To record and grade your work, and to show you and your instructors your progress.</li>
        <li>To send notifications about new cases, grades, deadlines and messages.</li>
        <li>
          To help instructors find students who may need extra support, using predictions made from performance data.
          A prediction is advice to the instructor; no grade or decision is made by it alone.
        </li>
        <li>To keep the system secure, investigate misuse and fix errors.</li>
      </ul>
    ),
  },
  {
    id: "ai",
    title: "AI features",
    body: (
      <>
        <p>
          Some features use AI services from Anthropic (Claude) and Google (Gemini): study tips for students, summaries
          of a student&apos;s performance for their instructor, feedback on reflections, and help for instructors writing
          cases and quiz questions.
        </p>
        <p>
          For these features, the text the feature needs, such as your scores, reflection or course material, is sent to
          the AI provider to produce a response. We send only what the feature needs, never your password, and the
          provider processes it under its terms for developers. We do not use AI to make grading decisions; an
          instructor reviews and decides.
        </p>
      </>
    ),
  },
  {
    id: "share",
    title: "Who we share it with",
    body: (
      <>
        <p>
          Inside the school, your data is seen only by the people who need it: your instructors see their own
          students&apos; work, and the Dean and administrators see what their role requires. Other students never see your
          work.
        </p>
        <p>We do not sell your data or use it for advertising. We use these service providers to run iCARE++:</p>
        <ul>
          <li>Supabase: database and file storage (servers in Singapore).</li>
          <li>Vercel: hosting for the website and its API.</li>
          <li>Render: the service that makes performance predictions.</li>
          <li>Anthropic and Google: the AI features described above.</li>
          <li>Expo: delivering push notifications to your phone.</li>
          <li>Sentry: error reports.</li>
        </ul>
        <p>
          Some of these providers process data outside the Philippines. We share data with them only as needed for
          their service, under agreements that protect it. We may also disclose data when the law requires it.
        </p>
      </>
    ),
  },
  {
    id: "keep",
    title: "How long we keep it",
    body: (
      <p>
        We keep your account and coursework while you are enrolled or employed in the program, and afterwards for as
        long as the school&apos;s records policy requires for academic records. Audit records are kept for security. Data
        no longer needed is deleted or anonymized. Copies the app saves on your phone for offline use are removed when
        you sign out or clear cached data in Settings.
      </p>
    ),
  },
  {
    id: "security",
    title: "How we protect it",
    body: (
      <p>
        Data is encrypted in transit, access is limited by role, passwords are stored only as secure hashes, and actions
        on records are logged. On your phone, your sign-in is kept in the device&apos;s secure storage. No system is
        perfectly secure; if a breach affects your data, we will notify you and the National Privacy Commission as the
        law requires.
      </p>
    ),
  },
  {
    id: "rights",
    title: "Your rights",
    body: (
      <>
        <p>Under the Data Privacy Act you have the right to:</p>
        <ul>
          <li>be informed about how your data is processed;</li>
          <li>access your data and get a copy of it;</li>
          <li>correct data that is wrong or incomplete;</li>
          <li>object to processing, and ask for your data to be blocked or erased where the law allows;</li>
          <li>data portability; and</li>
          <li>file a complaint with the National Privacy Commission, and claim damages where applicable.</li>
        </ul>
        <p>
          To use any of these rights, or to ask for your account to be deleted, email {LEGAL.contactEmail}. Some academic
          records may have to be kept by law or school policy even after a deletion request; we will tell you which and
          why.
        </p>
        <p>
          You can turn notifications and photo access off at any time in your phone&apos;s Settings. The app keeps
          working without them.
        </p>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>
        If we change this policy, we will update the effective date above and tell you in the app before the change
        applies to you.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={
        <p>
          This policy explains what personal data iCARE++ collects when you use the mobile app or the website, why it is
          collected, who it is shared with, and the rights you have over it.
        </p>
      }
      sections={sections}
      other={{ href: "/terms", label: "Terms of Use" }}
    />
  );
}
