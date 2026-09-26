// Deterministic, cryptographically strong randomness (D-024).
// ChaCha20 keyed by a 256-bit room seed; each purpose draws from its own stream
// (a distinct nonce), so adding a draw in one place doesn't shift the others.

import { chacha20 } from '@noble/ciphers/chacha.js';
import type { RngState } from './types';

const WORDS_PER_BLOCK = 16; // 64-byte ChaCha20 block
const MAX_STREAM_NAME = 12; // bytes in a ChaCha20 nonce

/** A fresh 256-bit seed from the platform's secure random source, as hex. */
export function newSeed(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return toHex(bytes);
}

export function newRngState(seed: string): RngState {
  if (!/^[0-9a-f]{64}$/.test(seed)) throw new Error('seed must be 32 bytes of lowercase hex');
  return { seed, streams: {} };
}

/** Draws from one named stream. Mutates `state.streams` (callers hold a draft). */
export class Rng {
  private readonly key: Uint8Array;

  constructor(private readonly state: RngState) {
    this.key = fromHex(state.seed);
  }

  /** A uniformly random unsigned 32-bit integer. */
  u32(stream: string): number {
    const offset = this.state.streams[stream] ?? 0;
    const block = Math.floor(offset / WORDS_PER_BLOCK);
    const keystream = chacha20(this.key, nonceFor(stream), new Uint8Array(64), undefined, block);
    const view = new DataView(keystream.buffer, keystream.byteOffset, keystream.byteLength);
    this.state.streams[stream] = offset + 1;
    return view.getUint32((offset % WORDS_PER_BLOCK) * 4, true);
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

  /** Fisher–Yates, from the end, in place. */
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
}

function nonceFor(stream: string): Uint8Array {
  const bytes = new TextEncoder().encode(stream);
  if (bytes.length === 0 || bytes.length > MAX_STREAM_NAME) {
    throw new Error(`stream name must be 1–${MAX_STREAM_NAME} bytes: ${stream}`);
  }
  const nonce = new Uint8Array(12);
  nonce.set(bytes);
  return nonce;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}
