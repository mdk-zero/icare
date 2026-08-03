import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

/**
 * Sends one real invitation email through whichever provider .env.local
 * configures, so the delivery path being tested is the same one the app uses.
 *
 *   npx tsx scripts/test-email.ts someone@example.com
 *
 * The recipient is an argument on purpose: the previous version of this script
 * always mailed SMTP_USER, which could only ever prove that you can send to
 * yourself. Pass an address you do not own -- that is the case that fails when
 * a provider is not fully set up.
 */
async function main() {
  const to = process.argv[2];
  if (!to) {
    console.error('Usage: npx tsx scripts/test-email.ts <recipient@example.com>');
    process.exit(1);
  }

  const provider = process.env.RESEND_API_KEY ? 'Resend' : 'SMTP';
  const from = process.env.RESEND_FROM_EMAIL || process.env.SMTP_FROM_EMAIL || '(unset)';

  console.log(`Provider: ${provider}`);
  console.log(`From:     ${from}`);
  console.log(`To:       ${to}\n`);

  // Imported here, after dotenv has populated process.env, because the module
  // reads its configuration at call time.
  const { sendStudentInvitationEmail } = await import('../app/lib/auth/email');

  const result = await sendStudentInvitationEmail(
    to,
    'Test Recipient',
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000/login',
    'TEST-PASSWORD-1234',
  );

  if (result.success) {
    console.log('✅ Accepted for delivery. Check the inbox, and the spam folder.');
    return;
  }

  console.error('❌ Rejected:');
  console.error(`   ${result.error}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
