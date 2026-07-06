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
  sendInDev: boolean;
};

let transporter: Transporter | null = null;

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
    sendInDev: process.env.SMTP_SEND_IN_DEV === "true",
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

function getFromHeader(): string {
  const { fromName, fromAddress } = getSmtpConfig();
  return `"${fromName}" <${fromAddress}>`;
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

function shouldSkipSending(): boolean {
  return process.env.NODE_ENV === "development" && !getSmtpConfig().sendInDev;
}

async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const { to, subject, html } = options;

  if (!to || !isValidEmail(to)) {
    throw new Error("A valid recipient email address is required");
  }

  if (!subject.trim()) {
    throw new Error("Email subject is required");
  }

  if (shouldSkipSending()) {
    console.log(`[SMTP skipped - dev mode] To: ${to}, Subject: ${subject}`);
    return;
  }

  const transport = getTransporter();
  const from = getFromHeader();

  await transport.sendMail({
    from,
    to,
    subject,
    html,
  });
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

function buildWelcomeHtml(name: string, loginUrl: string, password: string): string {
  const safeName = htmlEscape(name);
  const safeLoginUrl = htmlEscape(loginUrl);
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
              <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
                A faculty member has created an account for you on <strong>iCARE++</strong> — a scalable,
                ML-driven clinical competency assessment and adaptive learning system for nursing students.
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
                You can now sign in to access your quizzes, scenarios, and track your performance.
              </p>
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
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
                <tr>
                  <td align="center" style="border-radius:12px;background:linear-gradient(135deg,#0D7377,#0A5C5F);">
                    <a href="${safeLoginUrl}" style="display:inline-block;padding:14px 40px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:12px;">
                      Sign In to iCARE++
                    </a>
                  </td>
                </tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
                <tr>
                  <td style="font-size:13px;color:#64748b;line-height:1.5;">
                    <strong style="color:#0f172a;">Getting started:</strong><br/>
                    &bull; Complete assigned quizzes and scenarios<br/>
                    &bull; Track your progress and competency scores<br/>
                    &bull; Review personalized insights and recommendations
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:13px;color:#94a3b8;">
                If you believe this account was created in error, please contact your faculty administrator.
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

export async function sendStudentInvitationEmail(
  email: string,
  name: string,
  loginUrl: string,
  password: string,
): Promise<EmailResult> {
  try {
    if (!loginUrl || !loginUrl.startsWith("http")) {
      return { success: false, error: "A valid login URL is required" };
    }

    if (!password) {
      return { success: false, error: "A temporary password is required" };
    }

    await sendEmail({
      to: email,
      subject: "Welcome to iCARE++ – Your Account Has Been Created",
      html: buildWelcomeHtml(name, loginUrl, password),
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
