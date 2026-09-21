// Hash SHA-256 hex con Web Crypto (browser). Equivalente a hashInviteToken
// de shared, pero sin depender de node:crypto.
export async function hashInviteTokenWeb(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token)
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}