// Writes the local container secrets used by compose.yaml into ./secrets (gitignored) (L72).
//   npm run make-secrets -- [user name]      (default user: learner)
// Generates a random session secret, audit key and a password for one user. The password is printed ONCE so
// you can sign in; it is stored only as a scrypt hash. Existing files are kept (delete them to rotate).
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hashUserEntry } from '../packages/auth/src/index.ts';

const dir = join(process.cwd(), 'secrets');
const user = process.argv[2] ?? 'learner';
mkdirSync(dir, { recursive: true });

const write = (name: string, value: string) => {
  const file = join(dir, name);
  if (existsSync(file)) {
    process.stdout.write(`kept     secrets/${name}\n`);
    return false;
  }
  try {
    writeFileSync(file, `${value}\n`, { mode: 0o600, flag: 'wx' });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    process.stdout.write(`kept     secrets/${name}\n`);
    return false;
  }
  process.stdout.write(`created  secrets/${name}\n`);
  return true;
};

write('auth_session_secret', randomBytes(32).toString('base64url'));
write('audit_hmac_key', randomBytes(32).toString('base64url'));
write('run_store_secret', randomBytes(32).toString('base64url'));
const password = randomBytes(12).toString('base64url');
if (write('auth_users', await hashUserEntry(user, password)))
  process.stdout.write(`\nSign in as "${user}" with password: ${password}\n(shown once; it is stored only as a hash)\n`);
