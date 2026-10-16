import {open} from 'node:fs/promises';

const CHUNK_BYTES = 64 * 1024;
const MAX_LINE_BYTES = 1024 * 1024;

// A cold start can land entirely inside a large tool result. Search backwards
// for the newest complete structural event, skipping large records in bounded
// chunks. Never infer activity merely because the file has an open writer.
export async function findLatestEvent(file, {
  snapshot, previous, isEventLine, maxReadBytes = 4 * 1024 * 1024,
  maxSearchBytes = 32 * 1024 * 1024,
}) {
  let search = previous ?? {
    offset: snapshot.size, end: snapshot.size, fragment: Buffer.alloc(0),
    discarding: true, done: false,
  };
  if (search.done) return search;
  const handle = await open(file, 'r');
  try {
    const info = await handle.stat();
    if (info.dev !== snapshot.dev || info.ino !== snapshot.ino || info.size < snapshot.size)
      throw new Error('event_file_changed');
    let {offset, fragment, discarding} = search;
    const floor = Math.max(0, search.end - maxSearchBytes);
    const stop = Math.max(floor, offset - maxReadBytes);
    const found = () => {
      if (discarding || !fragment.length) return null;
      const line = fragment.toString('utf8');
      return isEventLine(line) ? line : null;
    };
    while (offset > stop) {
      const start = Math.max(stop, offset - CHUNK_BYTES);
      const buffer = Buffer.alloc(offset - start);
      const {bytesRead} = await handle.read(buffer, 0, buffer.length, start);
      if (bytesRead !== buffer.length) throw new Error('event_file_changed');
      let end = buffer.length;
      while (end > 0) {
        const newline = buffer.lastIndexOf(10, end - 1);
        const part = buffer.subarray(newline + 1, end);
        if (!discarding) {
          if (fragment.length + part.length > MAX_LINE_BYTES) {
            fragment = Buffer.alloc(0); discarding = true;
          } else if (part.length) fragment = Buffer.concat([part, fragment]);
        }
        if (newline < 0) break;
        const line = found();
        if (line) return {done: true, line};
        fragment = Buffer.alloc(0); discarding = false; end = newline;
      }
      offset = start;
    }
    const line = offset === 0 ? found() : null;
    const done = offset === floor;
    return {offset, end:search.end, fragment:done ? Buffer.alloc(0) : fragment,
      discarding, done, line};
  } finally { await handle.close(); }
}

// Read newly appended JSONL bytes, including across partial writes and oversized
// records. A giant tool result/compaction is skipped without dropping the last
// structural status or a completion event immediately before it. Bound each
// poll's IO and retained fragment; unfinished work continues on the next poll.
export async function readEventLines(file, {
  previous, tailBytes = 262144, maxReadBytes = 4 * 1024 * 1024,
  onReset = () => {}, onLine = () => {},
} = {}) {
  const handle = await open(file, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Error('not_regular_file');
    const continuous = previous?.file === file && previous.dev === info.dev && previous.ino === info.ino &&
      info.size >= previous.size && (info.size !== previous.size || info.mtimeMs === previous.mtimeMs);
    let offset = continuous ? previous.offset : Math.max(0, info.size - tailBytes);
    let fragment = continuous ? previous.fragment : Buffer.alloc(0);
    let discarding = continuous ? previous.discarding : offset > 0;
    if (!continuous) onReset();
    const end = Math.min(info.size, offset + maxReadBytes);
    while (offset < end) {
      const buffer = Buffer.alloc(Math.min(CHUNK_BYTES, end - offset));
      const {bytesRead} = await handle.read(buffer, 0, buffer.length, offset);
      if (!bytesRead) break;
      offset += bytesRead;
      let start = 0;
      while (start < bytesRead) {
        const newline = buffer.indexOf(10, start);
        const stop = newline >= 0 && newline < bytesRead ? newline : bytesRead;
        if (!discarding) {
          const part = buffer.subarray(start, stop);
          if (fragment.length + part.length > MAX_LINE_BYTES) {
            fragment = Buffer.alloc(0); discarding = true;
          } else if (part.length) fragment = Buffer.concat([fragment, part]);
        }
        if (stop === bytesRead) break;
        if (!discarding && fragment.length) onLine(fragment.toString('utf8'));
        fragment = Buffer.alloc(0); discarding = false; start = stop + 1;
      }
    }
    return {file, dev:info.dev, ino:info.ino, size:info.size, mtimeMs:info.mtimeMs, offset, fragment, discarding};
  } finally { await handle.close(); }
}
