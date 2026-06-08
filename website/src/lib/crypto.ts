/**
 * Client-side password hashing for defense-in-depth.
 *
 * Even though TLS encrypts the transport layer, we hash the password on the
 * client before sending it to the server.  This means:
 *   1. The plaintext password never leaves the browser.
 *   2. If TLS is somehow compromised (MITM, log leak), the attacker only
 *      gets a SHA-256 digest — not the reusable plaintext.
 *   3. The server applies scrypt on top of this digest, so the stored hash
 *      is still a proper KDF output.
 *
 * Format sent to server: `sha256:<hex-digest>`
 * The server detects the prefix and applies scrypt to the digest directly.
 */

const CLIENT_HASH_PREFIX = 'sha256:';

export async function hashPasswordForTransit(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hexDigest = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${CLIENT_HASH_PREFIX}${hexDigest}`;
}
