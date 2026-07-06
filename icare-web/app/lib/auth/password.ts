import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

const PASSWORD_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';

export function generateRandomPassword(length = 12): string {
  if (length < 8) {
    throw new Error('Generated password length must be at least 8 characters');
  }

  const bytes = randomBytes(length);
  let password = '';

  for (let i = 0; i < length; i++) {
    password += PASSWORD_CHARS[bytes[i] % PASSWORD_CHARS.length];
  }

  return password;
}
