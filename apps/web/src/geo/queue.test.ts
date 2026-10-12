import { describe, expect, it } from 'vitest';
import { type QueueClock, RateQueue } from './queue';

interface FakeClock extends QueueClock {
  t: number;
}

/** A fake clock: sleeping advances time at once. */
function fakeClock(): FakeClock {
  const clock: FakeClock = {
    t: 0,
    now: () => clock.t,
    sleep: async (ms, signal) => {
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
      clock.t += ms;
    },
  };
  return clock;
}

describe('RateQueue', () => {
  it('spaces task starts by at least the spacing, one at a time', async () => {
    const clock = fakeClock();
    const queue = new RateQueue(1100, clock);
    const starts: number[] = [];
    const task = async (): Promise<number> => {
      starts.push(clock.t);
      clock.t += 200; // the request itself takes 200 ms
      return starts.length;
    };
    const results = await Promise.all([queue.run(task), queue.run(task), queue.run(task)]);
    expect(results).toEqual([1, 2, 3]);
    expect(starts).toEqual([0, 1100, 2200]);
  });

  it('drops an aborted task without using a slot, and keeps going after a failure', async () => {
    const clock = fakeClock();
    const queue = new RateQueue(1000, clock);
    const aborted = new AbortController();
    aborted.abort();
    const starts: number[] = [];
    const ok = async (): Promise<string> => {
      starts.push(clock.t);
      return 'ok';
    };
    const first = queue.run(async () => {
      starts.push(clock.t);
      throw new Error('boom');
    });
    const dropped = queue.run(ok, aborted.signal);
    const last = queue.run(ok);
    await expect(first).rejects.toThrow('boom');
    await expect(dropped).rejects.toMatchObject({ name: 'AbortError' });
    await expect(last).resolves.toBe('ok');
    expect(starts).toEqual([0, 1000]);
  });
});
