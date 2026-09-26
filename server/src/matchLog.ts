// Durable match records (D-007, D-014, D-035): a header, then one line per applied
// action. Enough to replay any match exactly.
//
// Research 06 says a few choices are expensive to change later:
// - every line carries a schema version (`v`);
// - every action carries its sequence number (`seq` = the match's rev after it);
// - no personal data: seats only, never names or IPs;
// - storage sits behind a small interface, so files can become SQLite later.
//
// Logs contain the seed, so they never leave the server.

import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { LogEntry, MatchHeader } from '@onemore/engine';

export const LOG_SCHEMA = 1;

export interface MatchStore {
  start(code: string, header: MatchHeader): MatchRecorder;
}

export interface MatchRecorder {
  append(entry: LogEntry, seq: number): void;
}

/** One JSON-lines file per match. Appends survive a process crash, not a power cut. */
export class FileMatchStore implements MatchStore {
  constructor(private readonly dir = process.env['ONEMORE_LOG_DIR'] ?? join(process.cwd(), 'logs')) {}

  start(code: string, header: MatchHeader): MatchRecorder {
    mkdirSync(this.dir, { recursive: true });
    const file = join(this.dir, `${code}-${Date.now()}.jsonl`);
    const write = (line: object) => {
      try {
        appendFileSync(file, JSON.stringify({ v: LOG_SCHEMA, ...line }) + '\n');
      } catch (err) {
        console.error('match log write failed', err);
      }
    };
    write({ type: 'header', header, startedAt: new Date().toISOString() });
    return { append: (entry, seq) => write({ type: 'action', seq, ...entry }) };
  }
}
