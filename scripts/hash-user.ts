// Creates one AUTH_USERS entry (scrypt) for the password identity provider (L72).
//   npm run auth:hash-user -- ana            (reads the password from stdin, or from AUTH_HASH_PASSWORD)
// Prints only the entry; join several with commas. The password is never printed or stored.
import { hashUserEntry } from '../packages/auth/src/index.ts';

const name = process.argv[2];
if (!name) {
  process.stderr.write('usage: npm run auth:hash-user -- <user name>   (password on stdin or in AUTH_HASH_PASSWORD)\n');
  process.exit(2);
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) process.stderr.write(`Password for ${name}: `);
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data.replace(/\r?\n$/, '');
}

const password = process.env.AUTH_HASH_PASSWORD ?? (await readStdin());
try {
  process.stdout.write(`${await hashUserEntry(name, password)}\n`);
} catch (e) {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
}
