/**
 * The Terms of Use and Privacy Policy, as plain data. The app shows them on
 * its own screens (app/legal/[doc].tsx); the website shows the same text at
 * /terms and /privacy for the App Store listing. The two copies of this file
 * (mobile/lib and web/app/lib) must stay identical: change one, copy it over.
 */

export type LegalItem = string | { lead: string; text: string };

export interface LegalSection {
  id: string;
  title: string;
  /** Paragraphs and bulleted lists, in order. */
  blocks: ({ p: string } | { list: LegalItem[] })[];
}

export interface LegalDoc {
  title: string;
  intro: string[];
  sections: LegalSection[];
}

export const LEGAL_EFFECTIVE = 'October 14, 2026';

export const UNIVERSITY = 'Batangas State University – The National Engineering University';
export const CAMPUS = 'ARASOF Nasugbu Campus';
export const COLLEGE = 'College of Health Sciences';
export const PROGRAM = 'Bachelor of Science in Nursing (BSN)';

/** Where questions and data privacy requests go. */
export const LEGAL_CONTACT = `the Office of the Dean, ${COLLEGE}, ${UNIVERSITY}, ${CAMPUS}, or the University's Data Protection Officer`;

export const TERMS: LegalDoc = {
  title: 'Terms of Use',
  intro: [
    `iCARE++ is the clinical competency system of the ${PROGRAM} program of the ${COLLEGE}, ${UNIVERSITY}, ${CAMPUS}. These terms set the rules for using the iCARE++ mobile app and website. By signing in, you agree to them and to the Privacy Policy.`,
  ],
  sections: [
    {
      id: 'who',
      title: 'Who may use iCARE++',
      blocks: [
        {
          list: [
            `Students currently enrolled in the ${PROGRAM} program at the ${CAMPUS}.`,
            `Clinical instructors and faculty of the ${COLLEGE} handling the program's courses.`,
            'The Dean and staff the College authorizes to manage courses, sections and accounts.',
          ],
        },
        {
          p: 'Accounts are created by the College. You cannot sign up on your own, and your account ends when you are no longer enrolled in or teaching for the program.',
        },
      ],
    },
    {
      id: 'purpose',
      title: 'What iCARE++ is for',
      blocks: [
        {
          p: "iCARE++ supports the program's Related Learning Experience (RLE) courses: simulated Patient Cases, quizzes, Case Presentations and hospital case write-ups, the clinical skills of each course, and the progress and grades that come from them. Use it only for these course activities.",
        },
      ],
    },
    {
      id: 'account',
      title: 'Your account',
      blocks: [
        {
          list: [
            'Keep your password to yourself and change the temporary one the College gave you.',
            'You are responsible for everything done with your account. Do not let anyone else use it.',
            'Tell your clinical instructor or the Office of the Dean right away if you think someone else used your account.',
          ],
        },
      ],
    },
    {
      id: 'integrity',
      title: 'Academic integrity',
      blocks: [
        {
          p: "Your work in iCARE++ is graded and follows the University's rules on academic honesty in the Student Handbook. You agree not to:",
        },
        {
          list: [
            'submit work that is not your own, or let someone else answer for you;',
            'share quiz questions or answers, or take screenshots of a quiz to pass around;',
            'look for ways around the time limit, attempt limit or strict mode of a quiz.',
          ],
        },
      ],
    },
    {
      id: 'quizzes',
      title: 'Quizzes and strict mode',
      blocks: [
        {
          p: 'Quizzes open full screen in strict mode. Stay in the app until you submit:',
        },
        {
          list: [
            'Leaving the app once (Home button or switching apps) gives a warning.',
            'Leaving it a second time submits the quiz with the answers you have, and it counts as an attempt.',
            'Leaving the quiz screen submits the quiz.',
            'A timed quiz submits itself when time runs out.',
          ],
        },
        {
          p: 'Make sure your phone is charged and connected before you start, and silence calls and messages if you can.',
        },
      ],
    },
    {
      id: 'patients',
      title: 'Patient information',
      blocks: [
        {
          list: [
            'Patients in Patient Cases are simulated teaching cases, not real people.',
            "In hospital case write-ups, refer to a real patient by initials only. Never enter a patient's full name, hospital number, address, photo or anything else that identifies them.",
            "Follow the confidentiality rules of the hospital or agency where you have your clinical duty, and your clinical instructor's directions.",
          ],
        },
      ],
    },
    {
      id: 'learning',
      title: 'Learning, not clinical advice',
      blocks: [
        {
          p: "Patient Cases, vital signs, AI-generated tips and feedback in iCARE++ are for learning only. They are not medical advice and must never be used to care for a real patient. In the clinical area, follow your clinical instructor and the facility's protocols.",
        },
      ],
    },
    {
      id: 'ai',
      title: 'AI features',
      blocks: [
        {
          p: 'Some features use AI to give study tips, feedback and summaries. AI output can be wrong, so treat it as a suggestion. Your grades are given by your clinical instructors, not by AI. The Privacy Policy explains what data the AI features use.',
        },
      ],
    },
    {
      id: 'content',
      title: 'Course materials',
      blocks: [
        {
          p: "Cases, quizzes and other materials in iCARE++ belong to the University or their authors and are for the program's students only. Do not copy, post or share them outside the program. The work you submit stays yours; you allow the College to store, grade and review it for the program.",
        },
      ],
    },
    {
      id: 'conduct',
      title: 'If the rules are broken',
      blocks: [
        {
          p: "The College may suspend an account that breaks these terms, and the matter may be handled under the University's Student Handbook and the College's policies.",
        },
      ],
    },
    {
      id: 'availability',
      title: 'Availability',
      blocks: [
        {
          p: 'iCARE++ may sometimes be unavailable for maintenance or because of problems outside our control. Work done offline is kept on your phone and sent when you are back online. Quizzes need a connection to start and to submit.',
        },
      ],
    },
    {
      id: 'changes',
      title: 'Changes and questions',
      blocks: [
        {
          p: 'If these terms change, the effective date above is updated and you are told in the app. These terms follow the laws of the Philippines.',
        },
        { p: `Questions about these terms go to ${LEGAL_CONTACT}.` },
      ],
    },
  ],
};

export const PRIVACY: LegalDoc = {
  title: 'Privacy Policy',
  intro: [
    `This policy explains what personal data iCARE++ collects from the students, clinical instructors and staff of the ${PROGRAM} program of the ${COLLEGE}, ${UNIVERSITY}, ${CAMPUS}, why it is collected, who sees it, and your rights under Republic Act No. 10173, the Data Privacy Act of 2012.`,
  ],
  sections: [
    {
      id: 'controller',
      title: 'Who is responsible for your data',
      blocks: [
        {
          p: `${UNIVERSITY} is the personal information controller for the data in iCARE++. The ${COLLEGE} of the ${CAMPUS} uses it to run and assess the ${PROGRAM} program's clinical courses. The iCARE++ team operates the system for the College.`,
        },
      ],
    },
    {
      id: 'collect',
      title: 'What we collect',
      blocks: [
        {
          list: [
            { lead: 'Account details', text: 'your name, University email, role, section and clinical group. The College creates your account.' },
            { lead: 'Profile photo', text: 'only if you choose one.' },
            {
              lead: 'Your coursework',
              text: 'Patient Case work and the tasks you complete, quiz answers and scores, Case Presentations and hospital case write-ups, reflections, attendance at clinical duty, and the grades and feedback your clinical instructors give.',
            },
            { lead: 'Quiz timing', text: 'when each quiz attempt was started and submitted.' },
            { lead: 'Requests', text: 'assistance requests you send to your clinical instructor.' },
            {
              lead: 'Device and security records',
              text: 'sign-in times, and the IP address and app or browser used for actions in the system (kept as an audit trail). If you turn notifications on, a push token so the app can notify your phone.',
            },
            { lead: 'Error reports', text: 'technical details when something breaks, used only to fix it.' },
          ],
        },
        {
          p: 'Patients in Patient Cases are simulated. Hospital case write-ups use patient initials only; real patient identifiers must never be entered.',
        },
      ],
    },
    {
      id: 'use',
      title: 'Why we use it',
      blocks: [
        {
          list: [
            'To give you the courses, Patient Cases and quizzes of your section.',
            'To record and grade your work and show you and your clinical instructors your progress in each RLE course.',
            'To notify you about new cases, grades, deadlines and messages, if you turn notifications on.',
            'To help clinical instructors see which students may need extra support, from predictions based on performance. A prediction only informs the instructor; it never decides a grade.',
            'To keep the system secure, investigate misuse and fix problems.',
          ],
        },
        {
          p: "We process this data because it is needed to deliver and assess the program's courses, a function of the University, and with your consent for optional features like notifications and the AI features.",
        },
      ],
    },
    {
      id: 'ai',
      title: 'AI features',
      blocks: [
        {
          p: "Study tips, feedback on reflections, performance summaries for your clinical instructor, and help for instructors writing cases and quiz questions use AI services from Anthropic (Claude) and Google (Gemini). Only the text a feature needs is sent, such as your scores, a reflection or course material, never your password. AI does not decide grades; your clinical instructor does.",
        },
      ],
    },
    {
      id: 'share',
      title: 'Who sees it',
      blocks: [
        {
          list: [
            "Your clinical instructors see their own students' work and progress.",
            'The Dean and authorized College staff see what their role requires.',
            'Other students never see your work or grades.',
          ],
        },
        { p: 'We do not sell your data or use it for advertising. These service providers run parts of iCARE++ for us:' },
        {
          list: [
            'Supabase: database and file storage (Singapore).',
            'Vercel: hosting for the website and its server.',
            'Render: the service that makes performance predictions.',
            'Anthropic and Google: the AI features.',
            'Expo: delivering notifications to your phone.',
            'Sentry: error reports.',
          ],
        },
        {
          p: 'Some of them process data outside the Philippines. They receive only what their service needs. We disclose data to others only when the law requires it.',
        },
      ],
    },
    {
      id: 'keep',
      title: 'How long we keep it',
      blocks: [
        {
          p: "Your account and coursework are kept while you are in the program, and afterwards as long as the University's records retention rules require for academic records. Data no longer needed is deleted or anonymized. Copies the app saves on your phone are removed when you sign out or clear cached data in Profile.",
        },
      ],
    },
    {
      id: 'security',
      title: 'How we protect it',
      blocks: [
        {
          p: 'Data is encrypted in transit, access is limited by role, passwords are stored only as secure hashes, and actions on records are logged. On your phone, your sign-in is kept in secure storage. If a breach affects your data, you and the National Privacy Commission will be notified as the law requires.',
        },
      ],
    },
    {
      id: 'rights',
      title: 'Your rights',
      blocks: [
        { p: 'Under the Data Privacy Act you have the right to:' },
        {
          list: [
            'be informed about how your data is processed;',
            'access your data and get a copy;',
            'have wrong or incomplete data corrected;',
            'object to processing, and have data blocked or erased where the law allows;',
            'data portability; and',
            'file a complaint with the National Privacy Commission, and claim damages where applicable.',
          ],
        },
        {
          p: `To use these rights or to ask for your account to be deleted, contact ${LEGAL_CONTACT}. Academic records the University must keep may not be erased; you will be told which and why.`,
        },
        {
          p: 'You can turn notifications and camera access on or off anytime in Profile, under Settings.',
        },
      ],
    },
    {
      id: 'changes',
      title: 'Changes to this policy',
      blocks: [
        {
          p: 'If this policy changes, the effective date above is updated and you are told in the app before the change applies to you.',
        },
      ],
    },
  ],
};
