/**
 * Who hears about contact-form account requests. They go straight to the
 * developers' own inboxes rather than through the i-care.dev forwarder.
 * Overridable per deployment with a comma-separated DEV_TEAM_EMAILS.
 */
export const DEV_TEAM_EMAILS = (
  process.env.DEV_TEAM_EMAILS || 'linuxadona17@gmail.com,dreicachola13@gmail.com,xreetempo@gmail.com'
)
  .split(',')
  .map((e) => e.trim())
  .filter(Boolean);

/**
 * The address requesters see and reply to on their receipt and decline
 * emails: the project's public inbox, so no one's personal mailbox is handed
 * out. Overridable with CONTACT_EMAIL.
 */
export const CONTACT_EMAIL = (process.env.CONTACT_EMAIL || 'contact@i-care.dev').trim();
