# App Store review notes

Paste the block below into App Store Connect, under App Review Information, Notes. The limit is
4000 bytes. Passwords go in the Sign-In Information fields and in the notes on App Store Connect
only, never in this file: this repo is public.

The accounts come from `npm run db:seed:review-accounts` in `web/`, which prints the passwords
once. Migration 092 has to be live first, or the AI question below never appears.

```text
iCARE++ is the clinical competency app of the Bachelor of Science in Nursing program of Batangas State University - The National Engineering University, ARASOF Nasugbu Campus. It is for the program's enrolled students and their clinical instructors.

UNLISTED DISTRIBUTION
This app is intended for unlisted distribution. Its audience is limited to the program's students and instructors, who will get it from a direct link.

SIGN-IN
Student: app-review-student@i-care.dev
Instructor: app-review-instructor@i-care.dev
Passwords: [paste both here]
These accounts hold sample data only. Please sign in to each on one device at a time: a new sign-in on another phone ends the earlier session.

ACCOUNTS
The University creates every account, so the app has no sign-up. Anyone can ask the College to delete their account, as the Privacy Policy explains.

TRY AS THE STUDENT
1. Sign in. The app asks whether to allow AI features. Choose Allow to see the AI study tips. Profile > Settings changes the answer at any time.
2. Home shows the student's courses and what is due.
3. Clinic shows Patient Cases: finished ones with their grades, and one still open.
4. Quizzes has one quiz open to take. Past quizzes show their grades. A quiz is timed and full screen, and leaving the app during one gives a warning. After submitting, the results offer a Get feedback button and a space for a reflection.
5. Demos shows the Return Demonstrations the student has to do.
6. Library has study videos, and Recommendations & study tips shows the skills to improve, with AI tips if allowed.
7. Profile > Performance Analytics shows progress.

TRY AS THE INSTRUCTOR
Courses shows each course's checklist and how far the students have got. Students shows the roster with each student's progress.

SIMULATED PATIENTS
Every patient in a Patient Case is simulated. Nothing in the app is for diagnosing or treating a real person, and it takes no health measurements with the phone's sensors. The vital signs shown are part of the training cases.

AI AND PERSONAL DATA
Student records go to an AI provider only after the student chooses Allow. Only Anthropic (Claude) receives them, and only scores, skill ratings and instructor remarks are sent, never a name, email or password. Choosing Don't allow leaves grades and coursework the same, and feedback then comes from the grades alone.

PERMISSIONS
Camera and photos are used only for a profile picture and for images attached to a support request. Notifications are optional. Both are asked for when needed and can be changed in Profile > Settings.
```

## Rights to the Taylor's content

Guideline 5.2.1 asks the submitter to have the rights to what the app contains. The skill catalog,
its goals and its step-by-step checklists come from *Skill Checklists for Taylor's Clinical Nursing
Skills* (Lynn & LeBon, 3rd ed., Wolters Kluwer), and the Patient Cases and quizzes are built on them.

The University recommended this book as the source and gave the team permission to use it. Keep that
in writing with the submission records: Apple can ask for proof of rights during review.
