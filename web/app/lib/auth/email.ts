import { createTransport, Transporter } from "nodemailer";

export type EmailResult = { success: true } | { success: false; error: string };

export interface EmailSendResult {
  skipped: boolean;
  otp?: string;
}

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromAddress: string;
  fromName: string;
};

let transporter: Transporter | null = null;

/** A file sent with a message: the images on a support request or reply. */
export type EmailAttachment = { filename: string; content: Buffer; contentType: string };

function getSmtpConfig(): SmtpConfig {
  const required = [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_FROM_EMAIL",
  ] as const;

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`${key} is not configured in environment variables`);
    }
  }

  const port = Number(process.env.SMTP_PORT);
  if (!Number.isFinite(port)) {
    throw new Error("SMTP_PORT must be a valid number");
  }

  return {
    host: process.env.SMTP_HOST!,
    port,
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER!,
    pass: process.env.SMTP_PASS!,
    fromAddress: process.env.SMTP_FROM_EMAIL!,
    fromName: process.env.SMTP_FROM_NAME || "iCARE++",
  };
}

function getTransporter(): Transporter {
  if (transporter) return transporter;

  const config = getSmtpConfig();

  transporter = createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
  });

  return transporter;
}

/**
 * Resend is preferred when its key is present; SMTP stays as the fallback so
 * an existing deployment keeps working untouched.
 */
type MailProvider = 'resend' | 'smtp';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

function getFromAddress(): string | null {
  return process.env.RESEND_FROM_EMAIL || process.env.SMTP_FROM_EMAIL || null;
}

function getFromName(): string {
  return process.env.MAIL_FROM_NAME || process.env.SMTP_FROM_NAME || 'iCARE++';
}

function getFromHeader(): string {
  const address = getFromAddress();
  if (!address) {
    // Deliberately not routed through getSmtpConfig(): with Resend configured
    // there are no SMTP_* variables to read, and demanding them would fail a
    // perfectly valid setup.
    throw new Error(
      'No sender address configured. Set RESEND_FROM_EMAIL (or SMTP_FROM_EMAIL).',
    );
  }
  return `"${getFromName()}" <${address}>`;
}

/** Which mail transport is configured, if any. */
export function getProvider(): MailProvider | null {
  if (process.env.RESEND_API_KEY && getFromAddress()) return 'resend';
  if (isSmtpConfigured()) return 'smtp';
  return null;
}

async function sendViaResend(message: {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
}): Promise<void> {
  const attachments = message.attachments ?? [];
  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: message.from,
      to: Array.isArray(message.to) ? message.to : [message.to],
      subject: message.subject,
      html: message.html,
      ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      ...(attachments.length
        ? {
            attachments: attachments.map((a) => ({
              filename: a.filename,
              content: a.content.toString('base64'),
              content_type: a.contentType,
            })),
          }
        : {}),
    }),
    // A few megabytes of images take longer to hand over than plain text.
    signal: AbortSignal.timeout(attachments.length ? 30000 : 10000),
  });

  if (response.ok) return;

  // Resend states the reason in the body, and for the refusal that matters
  // most -- an unverified sending domain, which limits delivery to the
  // account holder's own address -- that sentence is the entire diagnosis.
  // It is carried through verbatim rather than flattened into a status code,
  // because the invitation flow shows this text to the admin.
  const raw = await response.text().catch(() => '');
  let detail = raw;
  try {
    const parsed = JSON.parse(raw) as { message?: string; error?: string | { message?: string } };
    detail =
      parsed.message ??
      (typeof parsed.error === 'string' ? parsed.error : parsed.error?.message) ??
      raw;
  } catch {
    // Not JSON; the raw body is the best available detail.
  }

  throw new Error(`Resend refused the message (${response.status})${detail ? `: ${detail}` : ''}`);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.SMTP_FROM_EMAIL,
  );
}

function shouldSkipSending(): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  // A machine with no mail provider set up is exactly what the dev skip is
  // for, so the decision must not route through getSmtpConfig() -- that throws
  // on missing SMTP_*, turning "skip quietly" into a 500 before the skip is
  // ever checked.
  if (getProvider() === null) return true;
  return (process.env.MAIL_SEND_IN_DEV ?? process.env.SMTP_SEND_IN_DEV) !== "true";
}

async function sendEmail(options: {
  to: string | string[];
  subject: string;
  html: string;
  /** Where a reply goes — the person who filled in a form, not the sender. */
  replyTo?: string;
  attachments?: EmailAttachment[];
}): Promise<void> {
  const { to, subject, html, replyTo, attachments } = options;

  const recipients = Array.isArray(to) ? to : [to];
  if (recipients.length === 0 || !recipients.every(isValidEmail)) {
    throw new Error("A valid recipient email address is required");
  }

  if (!subject.trim()) {
    throw new Error("Email subject is required");
  }

  if (shouldSkipSending()) {
    console.log(`[mail skipped - dev mode] To: ${to}, Subject: ${subject}`);
    return;
  }

  const provider = getProvider();
  if (!provider) {
    throw new Error(
      'No email provider is configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL, or the SMTP_* variables.',
    );
  }

  const from = getFromHeader();

  if (provider === 'resend') {
    await sendViaResend({ from, to, subject, html, replyTo, attachments });
    return;
  }

  await getTransporter().sendMail({ from, to, subject, html, replyTo, attachments });
}

function buildOtpHtml(otp: string, name: string, heading: string, bodyText: string): string {
  const safeName = htmlEscape(name);
  const safeOtp = htmlEscape(otp);
  const safeHeading = htmlEscape(heading);
  const safeBody = htmlEscape(bodyText);

  return `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; color: #0f172a;">
      <h2 style="color: #0d7377; margin-bottom: 16px;">${safeHeading}</h2>
      <p style="margin-bottom: 16px;">Hi ${safeName},</p>
      <p style="margin-bottom: 24px;">${safeBody}</p>
      <div style="background: #f0f9fa; border: 1px solid #d0ebea; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
        <span style="font-size: 32px; font-weight: 600; letter-spacing: 6px; color: #0d7377;">${safeOtp}</span>
      </div>
      <p style="font-size: 13px; color: #64748b;">If you did not request this, you can safely ignore this email.</p>
    </div>
  `;
}

function buildPasswordResetHtml(otp: string, name: string): string {
  return buildOtpHtml(
    otp,
    name,
    "Password reset request",
    "We received a request to reset your iCARE++ password. Use the code below to continue. It will expire in 10 minutes.",
  );
}

function buildPasswordChangeHtml(otp: string, name: string): string {
  return buildOtpHtml(
    otp,
    name,
    "Confirm password change",
    "We received a request to change the password for your iCARE++ account. Use the code below to confirm this change. It will expire in 10 minutes.",
  );
}

/**
 * Where students get the app, from MOBILE_APP_URL (a store or download page).
 * Students sign in on the mobile app only: the web turns them away. So the
 * email never links to the web login; without this set it has no button.
 */
function mobileAppUrl(): string | null {
  const url = process.env.MOBILE_APP_URL?.trim();
  return url && url.startsWith("https://") ? url : null;
}

/**
 * A staff account (Instructor, Dean, Admin) signs in on the web rather than
 * the mobile app, so its welcome email names the role and links the site.
 * `origin` picks the opening line: an accepted access request, a dean adding
 * one of their instructors, or an Admin creating the account directly.
 */
export type StaffWelcome = { roleLabel: string; signInUrl: string; origin: "request" | "dean" | "admin" };

function staffIntro(staff: StaffWelcome): string {
  const role = `<strong>${htmlEscape(staff.roleLabel)}</strong>`;
  const article = /^[aeiou]/i.test(staff.roleLabel) ? "an" : "a";
  if (staff.origin === "request") return `Your request was accepted and ${article} ${role} account has been created for you`;
  if (staff.origin === "dean") return `Your dean has created ${article} ${role} account for you`;
  return `${article === "an" ? "An" : "A"} ${role} account has been created for you`;
}

function buildWelcomeHtml(name: string, email: string, password: string, staff?: StaffWelcome): string {
  const safeName = htmlEscape(name);
  const safeEmail = htmlEscape(email);
  const appUrl = staff ? staff.signInUrl : mobileAppUrl();
  const safeAppUrl = appUrl ? htmlEscape(appUrl) : null;
  const buttonLabel = staff ? "Sign in to iCARE++" : "Get the iCARE++ app";
  const safePassword = htmlEscape(password);
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7f9;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:linear-gradient(135deg,#0D7377,#0A5C5F);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;font-size:24px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">iCARE++</h1>
              <p style="margin:8px 0 0;font-size:14px;color:#b8e2e4;">Clinical Competency Assessment Platform</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a;font-weight:600;">Welcome, ${safeName}!</h2>
              ${staff ? `<p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
                ${staffIntro(staff)}
                on <strong>iCARE++</strong> — a clinical competency assessment and adaptive learning system
                for nursing students.
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
                Sign in on the web with <strong>${safeEmail}</strong> and the temporary password below.
              </p>` : `<p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
                An instructor has created an account for you on <strong>iCARE++</strong> — a scalable,
                ML-driven clinical competency assessment and adaptive learning system for nursing students.
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
                Open the <strong>iCARE++ mobile app</strong> and sign in with <strong>${safeEmail}</strong> and the
                temporary password below to access your quizzes and patient cases, and track your performance.
              </p>`}
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f9fa;border:1px solid #d0ebea;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
                <tr>
                  <td style="font-size:13px;color:#64748b;line-height:1.5;">
                    <strong style="color:#0f172a;">Your temporary password:</strong><br/>
                    <span style="font-family:monospace;font-size:16px;letter-spacing:1px;color:#0d7377;font-weight:600;">${safePassword}</span>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 24px;font-size:13px;color:#94a3b8;">
                For security, you will be asked to change this password the first time you sign in.
              </p>
              ${safeAppUrl ? `<table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
                <tr>
                  <td align="center" style="border-radius:12px;background:linear-gradient(135deg,#0D7377,#0A5C5F);">
                    <a href="${safeAppUrl}" style="display:inline-block;padding:14px 40px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:12px;">
                      ${buttonLabel}
                    </a>
                  </td>
                </tr>
              </table>` : ""}
              ${staff ? "" : `<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
                <tr>
                  <td style="font-size:13px;color:#64748b;line-height:1.5;">
                    <strong style="color:#0f172a;">Getting started:</strong><br/>
                    &bull; Complete assigned quizzes and patient cases<br/>
                    &bull; Track your progress and competency scores<br/>
                    &bull; Review personalized insights and recommendations
                  </td>
                </tr>
              </table>`}
              <p style="margin:0;font-size:13px;color:#94a3b8;">
                If you believe this account was created in error, please contact ${staff ? (staff.origin === "dean" ? "your dean" : "the iCARE++ team") : "your instructor"}.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                &copy; ${year} iCARE++. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendPasswordResetOtp(
  email: string,
  otp: string,
  name: string,
): Promise<void> {
  if (!otp || otp.length < 4) {
    throw new Error("A valid OTP is required");
  }

  // Matches sendPasswordChangeOtp: when dev mode skips delivery, the code has
  // to surface somewhere or the reset flow is untestable without live SMTP.
  if (shouldSkipSending()) {
    console.log(`[DEV] Password reset OTP for ${email}: ${otp}`);
    return;
  }

  await sendEmail({
    to: email,
    subject: "Your iCARE++ password reset code",
    html: buildPasswordResetHtml(otp, name),
  });
}

export async function sendPasswordChangeOtp(
  email: string,
  otp: string,
  name: string,
): Promise<EmailSendResult> {
  if (!otp || otp.length < 4) {
    throw new Error("A valid OTP is required");
  }

  if (shouldSkipSending()) {
    console.log(`[DEV] Password change OTP for ${email}: ${otp}`);
    return { skipped: true, otp };
  }

  await sendEmail({
    to: email,
    subject: "Confirm your iCARE++ password change",
    html: buildPasswordChangeHtml(otp, name),
  });

  return { skipped: false };
}

/** Sent to the NEW address: proves the inbox exists and belongs to someone who can read it. */
export async function sendEmailChangeOtp(
  newEmail: string,
  otp: string,
  name: string,
): Promise<EmailSendResult> {
  if (!otp || otp.length < 4) {
    throw new Error("A valid OTP is required");
  }

  if (shouldSkipSending()) {
    console.log(`[DEV] Email change OTP for ${newEmail}: ${otp}`);
    return { skipped: true, otp };
  }

  await sendEmail({
    to: newEmail,
    subject: "Confirm your new iCARE++ email address",
    html: buildOtpHtml(
      otp,
      name,
      "Confirm your new email address",
      "This address was entered as the new sign-in email for an iCARE++ account. Give the code below to whoever is making the change, or enter it yourself. It will expire in 10 minutes.",
    ),
  });

  return { skipped: false };
}

/**
 * Sent to the OLD address once a change lands, so a change nobody asked for
 * doesn't go unnoticed. Best-effort: a failure here never undoes the change.
 */
/**
 * Sent instead of a reset code when a Google-only account asks for one. The
 * API answers that request exactly as it answers every other, so whether an
 * account signs in with Google is told only to its own inbox.
 */
export async function sendGoogleAccountResetNotice(email: string, name: string): Promise<void> {
  if (shouldSkipSending()) {
    console.log(`[DEV] Google-account reset notice for ${email}`);
    return;
  }
  const safeName = htmlEscape(name);
  await sendEmail({
    to: email,
    subject: "About your iCARE++ password reset request",
    html: `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; color: #0f172a;">
      <h2 style="color: #0d7377; margin-bottom: 16px;">Your account signs in with Google</h2>
      <p style="margin-bottom: 16px;">Hi ${safeName},</p>
      <p style="margin-bottom: 16px;">Someone asked to reset the password for this iCARE++ account. It has no password to reset: sign in with the <strong>Sign in with Google</strong> button instead.</p>
      <p style="font-size: 13px; color: #64748b;">If you did not ask for this, you can ignore this email.</p>
    </div>
  `,
  });
}

export async function sendEmailChangedNotice(oldEmail: string, name: string, newEmail: string): Promise<void> {
  if (shouldSkipSending()) {
    console.log(`[DEV] Email changed notice for ${oldEmail} → ${newEmail}`);
    return;
  }
  const safeName = htmlEscape(name);
  const safeNew = htmlEscape(newEmail);
  await sendEmail({
    to: oldEmail,
    subject: "Your iCARE++ sign-in email was changed",
    html: `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; color: #0f172a;">
      <h2 style="color: #0d7377; margin-bottom: 16px;">Your sign-in email was changed</h2>
      <p style="margin-bottom: 16px;">Hi ${safeName},</p>
      <p style="margin-bottom: 16px;">The iCARE++ account that used this address now signs in with <strong>${safeNew}</strong>. This address will no longer work for signing in.</p>
      <p style="font-size: 13px; color: #64748b;">If you did not expect this, contact your iCARE++ administrator right away.</p>
    </div>
  `,
  });
}

export async function sendStudentInvitationEmail(
  email: string,
  name: string,
  password: string,
  staff?: StaffWelcome,
): Promise<EmailResult> {
  try {
    if (!password) {
      return { success: false, error: "A temporary password is required" };
    }

    await sendEmail({
      to: email,
      subject: "Welcome to iCARE++ – Your Account Has Been Created",
      html: buildWelcomeHtml(name, email, password, staff),
    });

    return { success: true };
  } catch (err) {
    console.error("Failed to send invitation email:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Sent when an Admin issues a new temporary password from Users. Staff sign
 * in on the web (`signInUrl`); without one the account is a student's, which
 * is pointed at the mobile app as the welcome email does.
 */
export async function sendAdminPasswordResetEmail(
  email: string,
  name: string,
  password: string,
  signInUrl?: string,
): Promise<EmailResult> {
  try {
    if (!password) {
      return { success: false, error: "A temporary password is required" };
    }

    // As with the OTPs: when dev mode skips delivery, the password has to
    // surface somewhere or the account can't be signed into.
    if (shouldSkipSending()) {
      console.log(`[DEV] Temporary password for ${email}: ${password}`);
      return { success: true };
    }

    const url = signInUrl ?? mobileAppUrl();
    const safeUrl = url ? htmlEscape(url) : null;
    await sendEmail({
      to: email,
      subject: "Your iCARE++ password was reset",
      html: `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; color: #0f172a;">
      <h2 style="color: #0d7377; margin-bottom: 16px;">Your password was reset</h2>
      <p style="margin-bottom: 16px;">Hi ${htmlEscape(name)},</p>
      <p style="margin-bottom: 16px;">An iCARE++ administrator reset the password for <strong>${htmlEscape(email)}</strong>. Your old password no longer works, and any open sessions were signed out. Sign in ${signInUrl ? "on the web" : "on the iCARE++ mobile app"} with this temporary password:</p>
      <div style="background: #f0f9fa; border: 1px solid #d0ebea; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 16px;">
        <span style="font-family: monospace; font-size: 20px; font-weight: 600; letter-spacing: 1px; color: #0d7377;">${htmlEscape(password)}</span>
      </div>
      <p style="margin-bottom: 24px; font-size: 13px; color: #64748b;">You will be asked to choose a new password when you sign in.</p>
      ${safeUrl ? `<p style="margin-bottom: 24px;"><a href="${safeUrl}" style="display: inline-block; padding: 12px 28px; background: #0d7377; color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 600;">${signInUrl ? "Sign in to iCARE++" : "Get the iCARE++ app"}</a></p>` : ""}
      <p style="font-size: 13px; color: #64748b;">If you did not expect this, contact the iCARE++ team.</p>
    </div>`,
    });

    return { success: true };
  } catch (err) {
    console.error("Failed to send password reset email:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Someone asking the dev team for an account from the public contact form.
 * Accounts are no longer self-service, so this mail is the whole request: the
 * team reads it, validates the person, and creates the account themselves.
 * Replying goes straight to the requester.
 */
export async function sendAccessRequestEmail(
  to: string[],
  request: { name: string; email: string; sex?: 'female' | 'male'; subject: string; message: string },
): Promise<void> {
  const name = htmlEscape(request.name);
  const email = htmlEscape(request.email);
  const subject = htmlEscape(request.subject);
  const message = htmlEscape(request.message).replace(/\n/g, "<br/>");

  if (shouldSkipSending()) {
    console.log(`[DEV] Access request from ${request.email} (${request.name}): ${request.subject}`);
    return;
  }

  await sendEmail({
    to,
    replyTo: request.email,
    subject: `iCARE++ account activation request: ${request.subject}`,
    html: `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; color: #0f172a;">
      <h2 style="color: #0d7377; margin: 0 0 16px;">New account activation request</h2>
      <p style="margin: 0 0 4px;"><strong>Name:</strong> ${name}</p>
      <p style="margin: 0 0 4px;"><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
      ${request.sex ? `<p style="margin: 0 0 4px;"><strong>Sex:</strong> ${request.sex === "female" ? "Female" : "Male"}</p>` : ""}
      <p style="margin: 0 0 16px;"><strong>Subject:</strong> ${subject}</p>
      <div style="background: #f0f9fa; border: 1px solid #d0ebea; border-radius: 12px; padding: 16px; line-height: 1.6;">${message}</div>
      <p style="font-size: 13px; color: #64748b; margin-top: 24px;">Reply to this email to answer them directly. Create the account from Admin &rarr; Users once they are validated.</p>
    </div>`,
  });
}

/**
 * Tells the person who filled in the contact form that their request arrived.
 * The wording is fixed on purpose: the form is public and the address is
 * whatever was typed, so echoing the name or message back would let anyone
 * send their own text, under our domain, to any inbox.
 */
export async function sendAccessRequestReceipt(to: string, replyTo: string): Promise<void> {
  if (shouldSkipSending()) {
    console.log(`[DEV] Access request receipt to ${to}`);
    return;
  }

  await sendEmail({
    to,
    replyTo,
    subject: "We received your iCARE++ account request",
    html: `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; color: #0f172a;">
      <h2 style="color: #0d7377; margin: 0 0 16px;">Your request is in</h2>
      <p style="line-height: 1.6; margin: 0 0 12px;">Thanks for reaching out. The iCARE++ team has received your account request and will validate it shortly.</p>
      <p style="line-height: 1.6; margin: 0 0 12px;">Once your account is ready, we'll email your sign-in details to this address. There's nothing else you need to do in the meantime.</p>
      <p style="font-size: 13px; color: #64748b; margin-top: 24px;">If you didn't make this request, you can ignore this email. Questions? Just reply and it will reach the team.</p>
    </div>`,
  });
}

export type SupportRequest = {
  name: string;
  email: string;
  role: string;
  section: string | null;
  topic: string;
  subject: string;
  message: string;
  /** Where it was sent from: "Web portal", "Mobile app · android". */
  client: string | null;
  userAgent: string | null;
  /** The images sent as proof, attached to the team's copy. */
  attachments: EmailAttachment[];
  /** The Admin portal's Support Requests page, opened on this request. */
  inboxUrl: string | null;
};

function imageCountLine(count: number, verb: "attached" | "received" = "attached"): string {
  if (count === 0) return "";
  return `<p style="font-size: 13px; color: #64748b; margin: 12px 0 0;">${count} image${count === 1 ? "" : "s"} ${verb}.</p>`;
}

/**
 * A signed-in user writing to the team from Help & Support. Unlike the public
 * contact form, who sent it is known from the session, so the details here
 * are the account's own. Replying goes straight to them.
 */
export async function sendSupportRequestEmail(to: string[], request: SupportRequest): Promise<void> {
  if (shouldSkipSending()) {
    console.log(
      `[DEV] Support request from ${request.email} (${request.role}): ${request.topic} · ${request.subject}` +
        (request.attachments.length ? ` · ${request.attachments.length} image(s)` : ""),
    );
    return;
  }

  const row = (label: string, value: string) =>
    `<p style="margin: 0 0 4px;"><strong>${label}:</strong> ${value}</p>`;
  const email = htmlEscape(request.email);
  const message = htmlEscape(request.message).replace(/\n/g, "<br/>");
  const answer = request.inboxUrl
    ? `Answer it from <a href="${htmlEscape(request.inboxUrl)}" style="color: #0d7377;">Support Requests</a> in the Admin portal, so the reply is kept with the request, or reply to this email to answer them directly.`
    : "Reply to this email to answer them directly.";

  await sendEmail({
    to,
    replyTo: request.email,
    subject: `iCARE++ support (${request.role}): ${request.subject}`,
    attachments: request.attachments,
    html: `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; color: #0f172a;">
      <h2 style="color: #0d7377; margin: 0 0 16px;">${htmlEscape(request.topic)}</h2>
      ${row("From", `${htmlEscape(request.name)} (${htmlEscape(request.role)})`)}
      ${row("Email", `<a href="mailto:${email}">${email}</a>`)}
      ${request.section ? row("Section", htmlEscape(request.section)) : ""}
      ${request.client ? row("Sent from", htmlEscape(request.client)) : ""}
      <p style="margin: 0 0 16px;"><strong>Subject:</strong> ${htmlEscape(request.subject)}</p>
      <div style="background: #f0f9fa; border: 1px solid #d0ebea; border-radius: 12px; padding: 16px; line-height: 1.6;">${message}</div>
      ${imageCountLine(request.attachments.length)}
      ${request.userAgent ? `<p style="font-size: 12px; color: #94a3b8; margin-top: 16px;">${htmlEscape(request.userAgent)}</p>` : ""}
      <p style="font-size: 13px; color: #64748b; margin-top: 24px;">${answer}</p>
    </div>`,
  });
}

/**
 * The sender's copy of what they wrote. Echoing their text back is safe here,
 * unlike on the public form's receipt: it only ever goes to the signed-in
 * account's own address.
 */
export async function sendSupportReceipt(
  to: string,
  replyTo: string,
  request: Pick<SupportRequest, "name" | "subject" | "message"> & { imageCount: number },
): Promise<void> {
  if (shouldSkipSending()) {
    console.log(`[DEV] Support receipt to ${to}`);
    return;
  }

  await sendEmail({
    to,
    replyTo,
    subject: `We got your message: ${request.subject}`,
    html: `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; color: #0f172a;">
      <h2 style="color: #0d7377; margin: 0 0 16px;">Your message reached the iCARE++ team</h2>
      <p style="line-height: 1.6; margin: 0 0 12px;">Hi ${htmlEscape(request.name)}, thanks for writing in. We'll reply to this address. If there's anything to add, just reply to this email.</p>
      <p style="margin: 16px 0 6px;"><strong>${htmlEscape(request.subject)}</strong></p>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; line-height: 1.6; color: #334155;">${htmlEscape(request.message).replace(/\n/g, "<br/>")}</div>
      ${imageCountLine(request.imageCount, "received")}
    </div>`,
  });
}

/**
 * An Admin's answer to a Help & Support request, written in the Admin portal.
 * Goes only to the account that asked, with the Admin's own images attached
 * and the original message quoted underneath so the thread reads on its own.
 */
export async function sendSupportReply(
  to: string,
  replyTo: string,
  reply: {
    name: string;
    subject: string;
    message: string;
    adminName: string;
    originalMessage: string;
    attachments: EmailAttachment[];
  },
): Promise<void> {
  if (shouldSkipSending()) {
    console.log(
      `[DEV] Support reply to ${to}: ${reply.subject}` +
        (reply.attachments.length ? ` · ${reply.attachments.length} image(s)` : ""),
    );
    return;
  }

  await sendEmail({
    to,
    replyTo,
    subject: `Re: ${reply.subject}`,
    attachments: reply.attachments,
    html: `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; color: #0f172a;">
      <h2 style="color: #0d7377; margin: 0 0 16px;">The iCARE++ team replied</h2>
      <p style="line-height: 1.6; margin: 0 0 12px;">Hi ${htmlEscape(reply.name)},</p>
      <div style="line-height: 1.6; margin: 0 0 12px;">${htmlEscape(reply.message).replace(/\n/g, "<br/>")}</div>
      <p style="line-height: 1.6; margin: 0 0 4px; color: #334155;">${htmlEscape(reply.adminName)}<br/><span style="color: #64748b;">iCARE++ Support</span></p>
      ${imageCountLine(reply.attachments.length)}
      <p style="font-size: 13px; color: #64748b; margin: 24px 0 6px;">Your message, <strong>${htmlEscape(reply.subject)}</strong>:</p>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; line-height: 1.6; color: #334155;">${htmlEscape(reply.originalMessage).replace(/\n/g, "<br/>")}</div>
      <p style="font-size: 13px; color: #64748b; margin-top: 24px;">Need anything else? Reply to this email, or send a new message from Help &amp; Support in the app.</p>
    </div>`,
  });
}

/**
 * Tells a requester their account request was declined. Fixed wording for the
 * same reason as the receipt: the address came from a public form.
 */
export async function sendAccessRequestDeclined(to: string, replyTo: string): Promise<void> {
  if (shouldSkipSending()) {
    console.log(`[DEV] Access request declined notice to ${to}`);
    return;
  }

  await sendEmail({
    to,
    replyTo,
    subject: "About your iCARE++ account request",
    html: `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; color: #0f172a;">
      <h2 style="color: #0d7377; margin: 0 0 16px;">We couldn't approve your request</h2>
      <p style="line-height: 1.6; margin: 0 0 12px;">Thanks for your interest in iCARE++. After review, the team wasn't able to create an account for this request.</p>
      <p style="line-height: 1.6; margin: 0 0 12px;">If you think this is a mistake, reply to this email and it will reach the team.</p>
    </div>`,
  });
}
