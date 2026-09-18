export function redactSecret(text: string, secret: string | undefined): string {
  if (!secret || secret.length < 4) {
    return text;
  }
  return text.split(secret).join('[REDACTED]');
}
