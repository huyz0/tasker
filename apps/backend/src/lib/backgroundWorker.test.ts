import { expect, it } from 'bun:test';
import { createBackgroundWorker } from './backgroundWorker';

it('coalesces periodic work and stop waits for the actual in-flight operation', async () => {
  let calls = 0, release!: () => void, entered!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  const worker = createBackgroundWorker('fixture', 2, async () => { calls++; entered(); await held; });
  worker.start();
  await started;
  let stopped = false;
  const stopping = worker.stop().then(() => { stopped = true; });
  try {
    await Bun.sleep(10);
    expect(stopped).toBe(false);
    expect(calls).toBe(1);
  } finally { release(); await stopping; }
  worker.start();
  await Bun.sleep(10);
  expect(calls).toBe(1);
});
