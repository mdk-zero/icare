# iCARE++ user manual

iCARE++ is a system for training and grading nursing students' clinical skills. Staff work in the web portal at
`https://www.i-care.dev`. Students work in the iCARE++ app on an Android phone. This page is the
starting point for everyone: it lists the guides, explains how they are written, and names the
labels that differ from one screen to another.

In this guide:

- [Who uses iCARE++](#who-uses-icare)
- [Which guide to read](#which-guide-to-read)
- [How to read this manual](#how-to-read-this-manual)
- [Names you will see on screen](#names-you-will-see-on-screen)
- [Words used in this manual](#words-used-in-this-manual)
- [About the screenshots](#about-the-screenshots)
- [Get help](#get-help)

## Who uses iCARE++

| Role | Who they are | Where they work | Guide |
| --- | --- | --- | --- |
| Admin | Runs accounts and the system; does no teaching | Admin portal on the web (labelled "System Administration") | [admin.md](./docs/manual/admin.md) |
| Dean | Heads a nursing program: instructors, students, courses, wards, analytics | Dean portal on the web | [dean.md](./docs/manual/dean.md) |
| Program Chair | Runs their own part of a program with the Dean's tools, under a Dean | Dean portal, titled "Program Chair Portal" | [program-chair.md](./docs/manual/program-chair.md), then [dean.md](./docs/manual/dean.md) |
| Instructor | Clinical instructor: groups, Patient Cases, Return Demonstrations, Quizzes, Case Presentations, grading | Instructor portal on the web; the iCARE++ app for course checklists | [instructor.md](./docs/manual/instructor.md) |
| Student | Nursing student | iCARE++ app on an Android phone | [student.md](./docs/manual/student.md) |

## Which guide to read

1. Everyone starts with [Getting started with iCARE++](./docs/manual/setup-1-getting-started.md). It covers
   your account, your first sign-in, and installing the app.
2. Then read the guide for your role, from the table above.
3. Admins, Deans, Program Chairs and Instructors also use
   [Common tasks in the web portal](./docs/manual/common-tasks.md). It covers what every web portal shares:
   signing in and out, notifications, your settings, analytics filters, reports and Help & Support.
4. Program Chairs read [program-chair.md](./docs/manual/program-chair.md) for what differs, then
   [dean.md](./docs/manual/dean.md) for the tasks they share with the Dean.
5. The people who install and run iCARE++ read
   [Setting up and running iCARE++](./docs/manual/setup-2-technical.md).

## How to read this manual

- **Bold** text is a label as it appears on screen, such as a button, a link, a tab or a box:
  select **Save changes**.
- A label drawn in capital letters on screen is written in sentence case here. For example, a
  sidebar heading drawn as "TEACHING" is written **Teaching**.
- Web steps say "select". App steps say "tap".
- A path such as **Profile** > **Help & Support** means: select (or tap) the first item, then the
  second.
- Messages and errors are quoted as they appear: the message "Profile saved." appears.
- Two kinds of callout mark what matters:

  > [!NOTE]
  > Something useful to know, such as a limit or a shortcut.

  > [!IMPORTANT]
  > Something that can lose work or cause a mistake if you miss it.

- Figures are numbered from 1 in each guide. A figure's caption starts with "Figure N."
- "The iCARE++ app" means the Android app. "The web portal" means the site at
  `https://www.i-care.dev`.

## Names you will see on screen

Some things have more than one name on screen. This manual uses one name for each. The table
lists the other names, so you can match what you see to what you read.

| On-screen name | Where it appears | What it means |
| --- | --- | --- |
| "Activity Log", "Audit Trail" | "Activity Log" is the sidebar link for Deans, Program Chairs and Admins; the page it opens is titled "Audit Trail". The Instructor sidebar says "Audit Trail". | The read-only record of actions taken in iCARE++ |
| "System Administration" | Under the logo in the Admin's sidebar | The Admin portal |
| "Wards", "Ward Management", "Ward Monitoring", "Monitoring" | Sidebar link, page titles and labels | The same Wards page |
| "Review Submissions", "Grade Return Demonstrations" | Page titles in the Instructor portal | The grading pages for Patient Cases and Return Demonstrations |
| "Criteria", "Criteria for Assessment" | A course's tab, in the Instructor portal | The same tab |
| "Low Performing", "Low performing", "AT RISK", "at risk", "at-risk" | Badges, filters, tiles, student profiles, and the Admin's ML models section | Low performing |
| "Safe", "SAFE", "On Track" | Students pages and student profiles | Not Low performing |
| "assessments" | Some messages and search boxes | Quizzes |
| "Students & Groups" | One message on the Case Presentations page | The **Students** page |
| "Hospital Cases", "Case Presentation" | The app's Clinic tab and its screens | Case Presentations |
| "Not handed in", "Handed in", "Awaiting grading", "Submitted", "To grade", "Awaiting grade", "Graded", "Presented" | Case Presentation lists, screens and reports | The status of a Case Presentation: not yet uploaded, uploaded and waiting for a grade, or graded |
| "Demos", "Return Demos", "Return Demonstration" | The app's tab, its screen title, and its screens | Return Demonstrations |
| "On going" | The app's Quizzes tab | Quizzes you haven't finished |
| "Log out", "Logout", "Sign out" | "Log out" on the web; "Logout" in the app; "Sign out" in the app after a password change | The same action: ending your session |
| "Data warehouse benchmark", "Data warehouse query benchmark" | The Admin's Dashboard and System Tests page | The same test |
| "Needs your attention", "Needs Your Attention" | The Instructor's Overview and the Dean's Overview | The same kind of list: things to deal with first |
| "iCARE++ · Dean" | The settings card of a Program Chair | Still the Program Chair's own account |

## Words used in this manual

- **Patient Case**: a simulated patient on the ward. A student performs the case while the
  instructor rates each step of a skill checklist. The patients are not real.
- **Return Demonstration**: a skill a student demonstrates to the instructor, without a patient.
  The instructor rates each step of the skill's checklist.
- **Quiz**: a set of questions a student takes in the app. A quiz's grade is the average of its
  graded tries. The pass mark is 75%.
- **Review quiz**: an ungraded quiz of the questions a student missed. It is offered once the
  graded tries are used up, and it never changes the grade.
- **Case Presentation**: a group presents a patient from their ward duty. The group leader uploads
  the slides, and the instructor grades the whole group.
- **Skill**: one nursing procedure from the skill checklists, numbered by chapter, such as
  Skill 1-7.
- **Skill Areas**: the broader areas that skills are grouped into. Students get a score for each.
- **Section**: a class of students, such as BSN 3101.
- **Group**: a smaller set of students in a section, supervised by one instructor. An instructor
  sees the students in the groups they supervise.
- **Course**: a subject taught in a semester, such as NCM 101, given to an instructor by their
  Dean or Program Chair.
- **Semester**: the term a course runs in, such as "1st Semester AY 2026–2027".
- **Low performing**: a student the nightly prediction marks as likely to fall behind. Deans,
  Program Chairs and Instructors can also run the prediction by hand.
- **Temporary password**: the password in a new account's welcome email. You change it the first
  time you sign in.

## About the screenshots

- Screenshots come from iCARE++'s demo mode, with made-up people and records. No real student
  appears in this manual.
- The amber **Demo** tag beside the role, at the foot of the sidebar, appears only in the demo.
  You won't see it in your own portal.
- Phone screenshots were taken from a browser build of the app. On a real phone, the status bar
  at the top and the phone's own message boxes look a little different.
- All screenshots use the light theme.
- The screenshots can be taken again after a change to the screens, with the tools in
  [tools/](./docs/manual/tools/).

## Get help

- Admins, Deans, Program Chairs and Instructors: see
  [Send a message to the iCARE++ team](./docs/manual/common-tasks.md#send-a-message-to-the-icare-team).
- Students: see [Help and Support](./docs/manual/student.md#help-and-support) in the Student guide.

Admins answer these messages. The reply comes by email.
