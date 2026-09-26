// Append-only match logs on disk (D-007, D-014): a header line, then one line per
// applied action. Enough to replay any match exactly. Contains the seed, so it
// never leaves the server.

import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { LogEntry, MatchHeader } from '@onemore/engine';

const LOG_DIR = process.env['ONEMORE_LOG_DIR'] ?? join(process.cwd(), 'logs');

export class MatchLog {
  private readonly file: string;

  constructor(code: string, header: MatchHeader, names: Record<string, string>) {
    mkdirSync(LOG_DIR, { recursive: true });
    this.file = join(LOG_DIR, `${code}-${Date.now()}.jsonl`);
    this.write({ type: 'header', header, names, startedAt: new Date().toISOString() });
  }

  append(entry: LogEntry): void {
    this.write({ type: 'action', ...entry });
  }

  private write(line: object): void {
    try {
      appendFileSync(this.file, JSON.stringify(line) + '\n');
    } catch (err) {
      console.error('match log write failed', err);
    }
  }
}
