/** Environment key names that must be treated as secrets everywhere. */
export const SECRET_KEY_PATTERN = /(_API_KEY|_SECRET|_TOKEN|_PASSWORD|AUTH_KEY)$/;

export function isSecretKey(name: string): boolean {
  return SECRET_KEY_PATTERN.test(name);
}

/**
 * Masks a secret for display: keeps a short prefix and the last 4 characters.
 * Short values are fully hidden so nothing meaningful leaks.
 */
export function maskSecret(value: string | undefined | null): string {
  if (!value) return 'not set';
  if (value.length < 12) return '••••';
  const prefix = value.slice(0, 3);
  return `${prefix}…${value.slice(-4)}`;
}

/** Replaces every occurrence of the given secret values in free text. */
export function redactSecrets(text: string, secrets: readonly (string | undefined)[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret && secret.length >= 8) out = out.split(secret).join(maskSecret(secret));
  }
  return out;
}
