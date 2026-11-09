/**
 * The student web app: the mobile app built for browsers and served from
 * this site at /student. It's a backup for students who can't install the
 * app (iPhones, until there's an iOS build), and it stays off until an Admin
 * turns it on in the Admin portal. The files can stay published while it's
 * off: nobody can sign in, and signed-in students are signed out at their
 * next request.
 *
 * There is no table of its own. The switch is the latest `student_web.on` or
 * `student_web.off` audit entry, and each student's sign-ins, sign-outs and
 * email choice are audit entries too, which is also the switch's history.
 * Browsers get no push notifications, so while the switch is on, a student
 * signed in on the web gets each notification as an email as well, unless
 * they turn that off in Settings.
 *
 * Shared by the API, the Admin page and the demo, so it imports nothing
 * server-only.
 */

/** Where the published files live (web/public/student) and the app opens. */
export const STUDENT_WEB_PATH = '/student';

export const STUDENT_WEB_ON = 'student_web.on';
export const STUDENT_WEB_OFF = 'student_web.off';
export const STUDENT_WEB_SIGNIN = 'student_web.signin';
export const STUDENT_WEB_SIGNOUT = 'student_web.signout';
export const STUDENT_WEB_EMAIL_ON = 'student_web.email_on';
export const STUDENT_WEB_EMAIL_OFF = 'student_web.email_off';

/**
 * A web session lasts this long (the token's lifetime, lib/auth/jwt), so a
 * student whose last web sign-in is older has been signed out by now even if
 * they never pressed Sign out. Their email copies stop with it.
 */
export const STUDENT_WEB_SESSION_DAYS = 7;

/** Told to the student web app when it asks to sign in while the switch is off. */
export const STUDENT_WEB_OFF_MESSAGE =
  'The web version of iCARE++ is turned off right now. Use the iCARE++ mobile app, or ask your instructor.';

/** Told to anyone but a student who signs in on the student web app. */
export const STUDENT_WEB_STAFF_MESSAGE =
  'This is the student version of iCARE++. Instructors, Deans and Admins sign in on the web portal.';

/** One turn of the switch, as the Admin page lists it. */
export interface StudentWebChange {
  on: boolean;
  at: string;
  by: string | null;
}

/** What the Admin page shows. */
export interface StudentWebSummary {
  on: boolean;
  history: StudentWebChange[];
  /** Students signed in on the web in the last STUDENT_WEB_SESSION_DAYS. */
  signedIn: number;
  /** How many of them get their notifications by email. */
  emailed: number;
}
