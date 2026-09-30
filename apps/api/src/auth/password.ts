import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';

export const BCRYPT_COST = 10;

/**
 * Hash of a random value, compared against when the email does not exist so that
 * response time does not reveal which accounts are registered.
 */
const DUMMY_HASH = bcrypt.hashSync(randomUUID(), BCRYPT_COST);

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string | null): Promise<boolean> {
  const ok = await bcrypt.compare(plain, hash ?? DUMMY_HASH);
  return hash !== null && ok;
}
