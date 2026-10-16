import test from 'node:test';
import assert from 'node:assert/strict';
import {startFrameLoop} from '../server/frame-loop.mjs';

test('USB frame acknowledgements pace rendering without overlapping or catch-up bursts', async () => {
  let now = 0, next, finish, calls = 0;
  const scheduled = [];
  const loop = startFrameLoop(() => { calls++; return new Promise(resolve => { finish = resolve; }); }, {
    now: () => now,
    schedule: (fn, ms) => { next = fn; scheduled.push(ms); return 1; }, cancel: () => {},
  });
  assert.ok(Math.abs(scheduled[0] - 1000/30) < .01);
  const first = next();
  assert.equal(calls, 1); assert.equal(scheduled.length, 1, 'no queued render before USB ACK');
  now = 20; finish(); await first;
  assert.ok(Math.abs(scheduled[1] - (1000/30 - 20)) < .01, 'USB time is included in frame period');
  const second = next(); now = 120; finish(); await second;
  assert.equal(scheduled[2], 1, 'late frame yields and renders current time without replaying old frames');
  const third = next(); loop.stop(); finish(); await third;
  assert.equal(scheduled.length, 3, 'shutdown during a frame prevents any further render');
});
