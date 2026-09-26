// Room codes as typed by people (D-027). Mirrors server/src/codes.ts normalizeCode.

const ALPHABET = 'bcdfghjkmnpqrstvwxz';

export function normalizeCode(input: string): string | null {
  const letters = input.toLowerCase().replace(/[^a-z]/g, '');
  if (letters.length !== 9 || [...letters].some((ch) => !ALPHABET.includes(ch))) return null;
  return `${letters.slice(0, 3)}-${letters.slice(3, 6)}-${letters.slice(6)}`;
}

export function joinUrl(code: string): string {
  return `${location.origin}/${code}`;
}

export function adminUrl(code: string, adminCode: string): string {
  return `${location.origin}/${code}?admin=${adminCode}`;
}
