// Room codes (D-011, D-027): Meet-style, three groups of three consonants.
// No vowels, so codes can't spell words; a small blocklist catches the rest.

export const CODE_ALPHABET = 'bcdfghjkmnpqrstvwxz';

// Consonant strings that still read as something unpleasant. Checked against the
// code with hyphens removed, so it catches words that span groups.
const BLOCKLIST = ['fck', 'fk', 'sht', 'cnt', 'kkk', 'nzs', 'fgt', 'twt', 'prn', 'dck', 'cck', 'pss', 'wnk', 'bch'];

/** A new code, redrawn until it passes the blocklist and `isTaken` returns false. */
export function generateCode(isTaken: (code: string) => boolean = () => false): string {
  for (;;) {
    const letters = Array.from({ length: 9 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]!).join('');
    if (BLOCKLIST.some((word) => letters.includes(word))) continue;
    const code = `${letters.slice(0, 3)}-${letters.slice(3, 6)}-${letters.slice(6)}`;
    if (!isTaken(code)) return code;
  }
}

/** Accepts codes typed any way (case, spaces, missing hyphens). Returns null if it can't be a code. */
export function normalizeCode(input: string): string | null {
  const letters = input.toLowerCase().replace(/[^a-z]/g, '');
  if (letters.length !== 9 || [...letters].some((ch) => !CODE_ALPHABET.includes(ch))) return null;
  return `${letters.slice(0, 3)}-${letters.slice(3, 6)}-${letters.slice(6)}`;
}

/** A random secret for admin links. */
export function newSecret(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function randomInt(n: number): number {
  const limit = Math.floor(2 ** 32 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    if (buf[0]! < limit) return buf[0]! % n;
  }
}
