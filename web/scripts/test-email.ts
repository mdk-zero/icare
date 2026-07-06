import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import nodemailer from 'nodemailer';

async function main() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const fromEmail = process.env.SMTP_FROM_EMAIL;
  const fromName = process.env.SMTP_FROM_NAME || 'iCARE++';

  if (!host || !port || !user || !pass || !fromEmail) {
    console.error(
      'Missing SMTP environment variables. Make sure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM_EMAIL are set.',
    );
    process.exit(1);
  }

  const portNumber = Number(port);

  console.log('SMTP config:');
  console.log('  host:', host);
  console.log('  port:', portNumber);
  console.log('  user:', user);
  console.log('  from:', `"${fromName}" <${fromEmail}>`);

  const transporter = nodemailer.createTransport({
    host,
    port: portNumber,
    secure: process.env.SMTP_SECURE === 'true' || portNumber === 465,
    auth: { user, pass },
  });

  console.log('\nVerifying SMTP connection...');
  try {
    await transporter.verify();
    console.log('✅ SMTP connection verified');
  } catch (err) {
    console.error('❌ SMTP verification failed:');
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const toEmail = user; // Send the test email to yourself

  console.log(`\nSending test email to ${toEmail}...`);
  try {
    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: toEmail,
      subject: 'iCARE++ SMTP test',
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
          <h2 style="color: #0d7377;">SMTP test email</h2>
          <p>If you received this, your Gmail SMTP configuration is working correctly.</p>
          <p>Sent at: ${new Date().toISOString()}</p>
        </div>
      `,
    });
    console.log('✅ Test email sent:', info.messageId);
    console.log(`Check your inbox (and spam folder) at ${toEmail}.`);
  } catch (err) {
    console.error('❌ Failed to send test email:');
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
