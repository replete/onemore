import { describe, expect, it } from 'vitest';
import { ClockSync } from './clock';

describe('ClockSync', () => {
  it('trusts the fastest round trips over slow, lopsided ones', () => {
    const TRUE = 12_345; // server is 12.345 s ahead
    const clock = new ClockSync();
    const now = () => performance.now();
    // Fast, symmetric samples: the server stamped the reply half-way through the round trip.
    for (const rtt of [8, 10, 9, 12]) clock.add(now() - rtt, now(), Date.now() + TRUE - rtt / 2);
    // Slow samples with the delay all on one side: each is off by up to rtt/2.
    for (const rtt of [180, 250, 400]) clock.add(now() - rtt, now(), Date.now() + TRUE - rtt);
    expect(Math.abs(clock.offset! - TRUE)).toBeLessThan(3);
    expect(clock.rtt).toBeLessThan(9);
  });

  it('has no offset until the first sample', () => {
    expect(new ClockSync().offset).toBeNull();
  });
});
