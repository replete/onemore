// Deterministic, cryptographically strong randomness (D-024, D-031).
// Each named stream gets its own ChaCha20 key, HMAC-SHA256(seed, name), so streams
// are independent and can be scoped (e.g. "shuffle/r3" for round 3's deal).
// A stream's state is just how many 32-bit words it has used.

import { chacha20 } from '@noble/ciphers/chacha.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import type { RngState } from './types';

/** Bump when the generator, key derivation, range or shuffle algorithm changes: old logs won't replay. */
export const RNG_VERSION = 'chacha20-hmac-v1';

const WORDS_PER_BLOCK = 16; // 64-byte ChaCha20 block
const ZERO_NONCE = new Uint8Array(12); // each stream has its own key, so the nonce can be fixed
const MAX_STREAM_NAME = 64;

/** A fresh 256-bit seed from the platform's secure random source, as hex. */
export function newSeed(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return toHex(bytes);
}

export function newRngState(seed: string): RngState {
  if (!/^[0-9a-f]{64}$/.test(seed)) throw new Error('seed must be 32 bytes of lowercase hex');
  return { version: RNG_VERSION, seed, streams: {} };
}

/** Draws from named streams. Mutates `state.streams` (callers hold a draft). */
export class Rng {
  private readonly seed: Uint8Array;
  private readonly keys = new Map<string, Uint8Array>();
  private readonly blocks = new Map<string, { index: number; words: Uint32Array }>();

  constructor(private readonly state: RngState) {
    if (state.version !== RNG_VERSION) throw new Error(`rng version ${state.version} is not ${RNG_VERSION}`);
    this.seed = fromHex(state.seed);
  }

  /** A uniformly random unsigned 32-bit integer. */
  u32(stream: string): number {
    const offset = this.state.streams[stream] ?? 0;
    const index = Math.floor(offset / WORDS_PER_BLOCK);
    let block = this.blocks.get(stream);
    if (!block || block.index !== index) {
      const bytes = chacha20(this.keyFor(stream), ZERO_NONCE, new Uint8Array(64), undefined, index);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const words = new Uint32Array(WORDS_PER_BLOCK);
      for (let i = 0; i < WORDS_PER_BLOCK; i++) words[i] = view.getUint32(i * 4, true);
      block = { index, words };
      this.blocks.set(stream, block);
    }
    this.state.streams[stream] = offset + 1;
    return block.words[offset % WORDS_PER_BLOCK]!;
  }

  /** An unbiased integer in [0, n), by rejection sampling. */
  int(stream: string, n: number): number {
    if (!Number.isInteger(n) || n < 1 || n > 2 ** 32) throw new Error(`bad range: ${n}`);
    const limit = Math.floor(2 ** 32 / n) * n;
    for (;;) {
      const x = this.u32(stream);
      if (x < limit) return x % n;
    }
  }

  /** Fisher–Yates (Durstenfeld), from the end, in place. */
  shuffle<T>(stream: string, items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(stream, i + 1);
      [items[i], items[j]] = [items[j]!, items[i]!];
    }
    return items;
  }

  /** A random opaque token, e.g. for component refs. */
  token(stream: string): string {
    return this.u32(stream).toString(36).padStart(7, '0') + this.u32(stream).toString(36).padStart(7, '0');
  }

  private keyFor(stream: string): Uint8Array {
    let key = this.keys.get(stream);
    if (!key) {
      if (stream.length === 0 || stream.length > MAX_STREAM_NAME) {
        throw new Error(`stream name must be 1–${MAX_STREAM_NAME} characters: ${stream}`);
      }
      key = hmac(sha256, this.seed, new TextEncoder().encode(stream));
      this.keys.set(stream, key);
    }
    return key;
  }
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}
