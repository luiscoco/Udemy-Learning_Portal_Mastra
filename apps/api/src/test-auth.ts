/** Real login for HTTP integration tests; fails immediately if the auth boundary changes. */
export async function signIn(base: string, username = 'learner', password?: string): Promise<string> {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const cookie = res.headers.get('set-cookie')?.split(';')[0];
  if (res.status !== 200 || !cookie) throw new Error(`Test login failed (${res.status})`);
  await res.arrayBuffer();
  return cookie;
}
