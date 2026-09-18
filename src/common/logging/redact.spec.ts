import { redactSecret } from './redact';

describe('redactSecret', () => {
  it('replaces every occurrence of the secret with a placeholder', () => {
    const secret = 'sentinel-secret-value-12345';
    const text = `request failed, key was ${secret}, retried with ${secret} again`;
    const redacted = redactSecret(text, secret);

    expect(redacted).not.toContain(secret);
    expect(redacted).toBe(
      'request failed, key was [REDACTED], retried with [REDACTED] again',
    );
  });

  it('leaves text unchanged when there is no secret configured', () => {
    expect(redactSecret('nothing to hide here', undefined)).toBe(
      'nothing to hide here',
    );
  });

  it('leaves text unchanged when the secret is too short to redact safely', () => {
    expect(redactSecret('a value of 12', '12')).toBe('a value of 12');
  });

  it('leaves text unchanged when the secret does not appear in it', () => {
    expect(
      redactSecret('an unrelated message', 'sentinel-secret-value-12345'),
    ).toBe('an unrelated message');
  });
});
