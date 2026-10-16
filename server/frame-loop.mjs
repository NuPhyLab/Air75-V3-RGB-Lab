// Render from the current clock after each acknowledged frame. Slow USB writes
// must not build a queue of stale animation/audio frames or halve the frame rate
// by missing the next setInterval tick.
export function startFrameLoop(tick, {
  fps = 30, now = () => performance.now(), schedule = setTimeout, cancel = clearTimeout,
} = {}) {
  const period = 1000 / fps;
  let stopped = false, timer;
  const run = async () => {
    const started = now();
    try { await tick(); }
    finally {
      if (!stopped) timer = schedule(run, Math.max(1, period - (now() - started)));
    }
  };
  timer = schedule(run, period);
  return { stop() { stopped = true; cancel(timer); } };
}
