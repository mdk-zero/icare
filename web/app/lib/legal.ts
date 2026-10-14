/**
 * The facts the Terms of Use and Privacy Policy name. Fill these in before
 * submitting the app for review: the App Store needs a real contact, and
 * the Data Privacy Act needs the school that controls the data named.
 */
export const LEGAL = {
  /** Shown at the top of both documents; change it whenever either changes. */
  effective: 'October 14, 2026',
  /** The school that runs iCARE++ for its students and is responsible for their data. */
  school: '[School name]',
  /** Where privacy requests and questions go: the school's Data Protection Officer. */
  contactEmail: '[privacy contact email]',
  /** Public address of the web app. */
  site: 'https://www.i-care.dev',
} as const;
