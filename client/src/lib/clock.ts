// Clock sync (D-033, research 05): estimate server time minus local time from
// ping round trips. Offsets from the fastest round trips are the most accurate, so
// we keep the median offset of the lowest-latency quarter of recent samples.

export interface Sample {
  rtt: number;
  offset: number;
}

const KEEP = 24;

export class ClockSync {
  private samples: Sample[] = [];

  /** Records one ping: sent and received in performance.now() time, server in epoch ms. */
  add(sentAt: number, receivedAt: number, server: number): void {
    const rtt = receivedAt - sentAt;
    if (rtt < 0) return;
    // Server time at the moment the reply arrived ≈ server + rtt/2; compare with local wall time then.
    const offset = server + rtt / 2 - (Date.now() - (performance.now() - receivedAt));
    this.samples.push({ rtt, offset });
    if (this.samples.length > KEEP) this.samples.shift();
  }

  /** Server time minus Date.now(), or null before any sample. */
  get offset(): number | null {
    if (this.samples.length === 0) return null;
    const best = Math.min(...this.samples.map((s) => s.rtt));
    const good = this.samples.filter((s) => s.rtt <= best * 2 + 5).sort((a, b) => a.rtt - b.rtt);
    const quarter = good.slice(0, Math.max(1, Math.ceil(good.length / 4)));
    const offsets = quarter.map((s) => s.offset).sort((a, b) => a - b);
    return offsets[Math.floor(offsets.length / 2)]!;
  }

  /** The best round trip seen, for display and diagnostics. */
  get rtt(): number | null {
    return this.samples.length ? Math.min(...this.samples.map((s) => s.rtt)) : null;
  }

  reset(): void {
    this.samples = [];
  }
}
